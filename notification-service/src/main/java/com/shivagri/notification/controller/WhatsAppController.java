package com.shivagri.notification.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shivagri.notification.controller.dto.SendResponse;
import com.shivagri.notification.controller.dto.WhatsAppDocumentTemplateRequest;
import com.shivagri.notification.controller.dto.WhatsAppMediaRequest;
import com.shivagri.notification.controller.dto.WhatsAppTemplateRequest;
import com.shivagri.notification.controller.dto.WhatsAppTextRequest;
import com.shivagri.notification.service.WhatsAppService;
import jakarta.validation.Valid;
import jakarta.validation.Validator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/notifications/whatsapp")
@RequiredArgsConstructor
public class WhatsAppController {

    private static final String CHANNEL = "whatsapp";

    private final WhatsAppService service;
    private final ObjectMapper objectMapper;
    private final Validator validator;

    @PostMapping("/text")
    public ResponseEntity<SendResponse> sendText(
            @Valid @RequestBody WhatsAppTextRequest req,
            @RequestParam(value = "async", defaultValue = "false") boolean async) {
        String requestId = UUID.randomUUID().toString();
        log.info("[{}] POST /whatsapp/text async={} to={}", requestId, async, req.to());

        if (async) {
            service.sendTextAsync(requestId, req.to(), req.message(), req.previewUrl());
            return ResponseEntity.accepted().body(SendResponse.accepted(requestId, CHANNEL));
        }
        String providerId = service.sendText(requestId, req.to(), req.message(), req.previewUrl());
        return ResponseEntity.ok(SendResponse.sent(requestId, CHANNEL, providerId));
    }

    @PostMapping("/template")
    public ResponseEntity<SendResponse> sendTemplate(
            @Valid @RequestBody WhatsAppTemplateRequest req,
            @RequestParam(value = "async", defaultValue = "false") boolean async) {
        String requestId = UUID.randomUUID().toString();
        log.info("[{}] POST /whatsapp/template async={} to={} template={}",
                requestId, async, req.to(), req.templateName());

        if (async) {
            // Templates are typically used for OTPs — async would race the user typing,
            // so we still run on the executor but expose a sync-style response if needed.
            new Thread(() -> {
                try {
                    service.sendTemplate(requestId, req.to(), req.templateName(), req.languageCode(),
                            req.bodyParameters(), req.buttonOtpCode());
                } catch (Exception ex) {
                    // Swallowing this used to hide hard template rejections (132000/132001)
                    // completely — the caller already has its 202 and never learns.
                    log.error("[{}] Async WhatsApp template send failed to={} template={}: {}",
                            requestId, req.to(), req.templateName(), ex.getMessage(), ex);
                }
            }).start();
            return ResponseEntity.status(HttpStatus.ACCEPTED).body(SendResponse.accepted(requestId, CHANNEL));
        }
        String providerId = service.sendTemplate(requestId, req.to(), req.templateName(), req.languageCode(),
                req.bodyParameters(), req.buttonOtpCode());
        return ResponseEntity.ok(SendResponse.sent(requestId, CHANNEL, providerId));
    }

    /**
     * Template with a DOCUMENT header (lab reports). Multipart: "payload" (JSON
     * {@link WhatsAppDocumentTemplateRequest}) + "document" (the PDF). Always synchronous — the
     * caller records the returned wamid against its audit row to correlate webhook statuses.
     */
    @PostMapping(value = "/template/document", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<SendResponse> sendDocumentTemplate(
            @RequestPart("payload") String payloadJson,
            @RequestPart("document") MultipartFile document) throws IOException {
        String requestId = UUID.randomUUID().toString();

        WhatsAppDocumentTemplateRequest req;
        try {
            req = objectMapper.readValue(payloadJson, WhatsAppDocumentTemplateRequest.class);
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("payload part must be valid JSON: " + ex.getOriginalMessage());
        }
        var violations = validator.validate(req);
        if (!violations.isEmpty()) {
            var first = violations.iterator().next();
            throw new IllegalArgumentException(first.getPropertyPath() + ": " + first.getMessage());
        }
        if (document == null || document.isEmpty()) {
            throw new IllegalArgumentException("document part is required");
        }

        log.info("[{}] POST /whatsapp/template/document to={} template={} filename={} bytes={}",
                requestId, req.to(), req.templateName(), req.filename(), document.getSize());

        String providerId = service.sendDocumentTemplate(requestId, req.to(), req.templateName(),
                req.languageCode(), req.bodyParameters(), req.buttonUrlParameter(),
                document.getBytes(), req.filename(), document.getContentType());
        return ResponseEntity.ok(SendResponse.sent(requestId, CHANNEL, providerId));
    }

    @PostMapping("/media")
    public ResponseEntity<SendResponse> sendMedia(
            @Valid @RequestBody WhatsAppMediaRequest req,
            @RequestParam(value = "async", defaultValue = "false") boolean async) {
        String requestId = UUID.randomUUID().toString();
        log.info("[{}] POST /whatsapp/media async={} to={} mediaType={}", requestId, async, req.to(), req.mediaType());

        if (async) {
            service.sendMediaAsync(requestId, req.to(), req.mediaUrl(), req.mediaType(), req.caption(), req.filename());
            return ResponseEntity.status(HttpStatus.ACCEPTED).body(SendResponse.accepted(requestId, CHANNEL));
        }
        String providerId = service.sendMedia(requestId, req.to(), req.mediaUrl(), req.mediaType(),
                req.caption(), req.filename());
        return ResponseEntity.ok(SendResponse.sent(requestId, CHANNEL, providerId));
    }
}
