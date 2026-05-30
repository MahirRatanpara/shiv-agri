package com.shivagri.notification.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shivagri.notification.controller.dto.EmailRequest;
import com.shivagri.notification.controller.dto.SendResponse;
import com.shivagri.notification.service.EmailService;
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

import java.util.List;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/notifications/email")
@RequiredArgsConstructor
public class EmailController {

    private static final String CHANNEL = "email";

    private final EmailService service;
    private final ObjectMapper objectMapper;
    private final Validator validator;

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<SendResponse> sendText(
            @Valid @RequestBody EmailRequest req,
            @RequestParam(value = "async", defaultValue = "false") boolean async) {
        String requestId = UUID.randomUUID().toString();
        log.info("[{}] POST /email async={} to={} subject='{}'", requestId, async, req.to(), req.subject());

        boolean html = Boolean.TRUE.equals(req.html());
        if (async) {
            service.sendEmailAsync(requestId, req.to(), req.cc(), req.bcc(),
                    req.subject(), req.body(), html, null);
            return ResponseEntity.status(HttpStatus.ACCEPTED).body(SendResponse.accepted(requestId, CHANNEL));
        }
        String providerId = service.sendEmail(requestId, req.to(), req.cc(), req.bcc(),
                req.subject(), req.body(), html, null);
        return ResponseEntity.ok(SendResponse.sent(requestId, CHANNEL, providerId));
    }

    @PostMapping(value = "/with-attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<SendResponse> sendWithAttachments(
            @RequestPart("payload") String payloadJson,
            @RequestPart(value = "attachments", required = false) List<MultipartFile> attachments,
            @RequestParam(value = "async", defaultValue = "false") boolean async) {
        String requestId = UUID.randomUUID().toString();

        EmailRequest req;
        try {
            req = objectMapper.readValue(payloadJson, EmailRequest.class);
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("payload part must be valid JSON: " + ex.getOriginalMessage());
        }

        var violations = validator.validate(req);
        if (!violations.isEmpty()) {
            var first = violations.iterator().next();
            throw new IllegalArgumentException(first.getPropertyPath() + ": " + first.getMessage());
        }

        int attCount = attachments == null ? 0 : attachments.size();
        log.info("[{}] POST /email/with-attachments async={} to={} subject='{}' attachments={}",
                requestId, async, req.to(), req.subject(), attCount);

        boolean html = Boolean.TRUE.equals(req.html());
        if (async) {
            service.sendEmailAsync(requestId, req.to(), req.cc(), req.bcc(),
                    req.subject(), req.body(), html, attachments);
            return ResponseEntity.status(HttpStatus.ACCEPTED).body(SendResponse.accepted(requestId, CHANNEL));
        }
        String providerId = service.sendEmail(requestId, req.to(), req.cc(), req.bcc(),
                req.subject(), req.body(), html, attachments);
        return ResponseEntity.ok(SendResponse.sent(requestId, CHANNEL, providerId));
    }
}
