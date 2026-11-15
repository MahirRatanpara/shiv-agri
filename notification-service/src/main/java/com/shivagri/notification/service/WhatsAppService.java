package com.shivagri.notification.service;

import com.shivagri.notification.config.WhatsAppProperties;
import com.shivagri.notification.exception.NotificationException;
import com.shivagri.notification.exception.ProviderException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
@RequiredArgsConstructor
public class WhatsAppService {

    private final WhatsAppProperties props;
    private final RestTemplate restTemplate;

    public String sendText(String requestId, String to, String message, Boolean previewUrl) {
        validateCreds();
        String normalized = normalizePhone(to);
        Map<String, Object> body = new HashMap<>();
        body.put("messaging_product", "whatsapp");
        body.put("recipient_type", "individual");
        body.put("to", normalized);
        body.put("type", "text");
        Map<String, Object> text = new HashMap<>();
        text.put("body", message);
        text.put("preview_url", previewUrl != null && previewUrl);
        body.put("text", text);

        log.info("[{}] Sending WhatsApp text to={} length={}", requestId, normalized, message.length());
        return postMessage(requestId, body);
    }

    public String sendTemplate(String requestId, String to, String templateName, String languageCode,
                               List<String> bodyParameters, String buttonOtpCode) {
        validateCreds();
        String normalized = normalizePhone(to);

        Map<String, Object> template = new HashMap<>();
        template.put("name", templateName);
        Map<String, Object> language = new HashMap<>();
        language.put("code", languageCode == null || languageCode.isBlank() ? "en" : languageCode);
        template.put("language", language);

        List<Map<String, Object>> components = new java.util.ArrayList<>();
        if (bodyParameters != null && !bodyParameters.isEmpty()) {
            Map<String, Object> bodyComponent = new HashMap<>();
            bodyComponent.put("type", "body");
            List<Map<String, Object>> params = new java.util.ArrayList<>();
            for (String p : bodyParameters) {
                Map<String, Object> param = new HashMap<>();
                param.put("type", "text");
                param.put("text", p);
                params.add(param);
            }
            bodyComponent.put("parameters", params);
            components.add(bodyComponent);
        }
        if (buttonOtpCode != null && !buttonOtpCode.isBlank()) {
            Map<String, Object> buttonComponent = new HashMap<>();
            buttonComponent.put("type", "button");
            buttonComponent.put("sub_type", "url");
            buttonComponent.put("index", "0");
            Map<String, Object> param = new HashMap<>();
            param.put("type", "text");
            param.put("text", buttonOtpCode);
            buttonComponent.put("parameters", List.of(param));
            components.add(buttonComponent);
        }
        if (!components.isEmpty()) {
            template.put("components", components);
        }

        Map<String, Object> body = new HashMap<>();
        body.put("messaging_product", "whatsapp");
        body.put("recipient_type", "individual");
        body.put("to", normalized);
        body.put("type", "template");
        body.put("template", template);

        log.info("[{}] Sending WhatsApp template to={} template={} lang={} bodyParams={}",
                requestId, normalized, templateName, language.get("code"),
                bodyParameters == null ? 0 : bodyParameters.size());
        return postMessage(requestId, body);
    }

    /**
     * Sends an approved template whose header is a DOCUMENT (e.g. a lab report PDF), with an
     * optional dynamic URL button. The file is first uploaded to Meta's media store so the
     * document never has to be reachable on a public URL.
     *
     * @param buttonUrlParameter substituted into the {{1}} suffix of the template's URL button (index 0)
     */
    public String sendDocumentTemplate(String requestId, String to, String templateName, String languageCode,
                                       List<String> bodyParameters, String buttonUrlParameter,
                                       byte[] document, String filename, String mimeType) {
        validateCreds();
        String normalized = normalizePhone(to);

        String mediaId = uploadMedia(requestId, document, filename, mimeType);

        Map<String, Object> template = new HashMap<>();
        template.put("name", templateName);
        Map<String, Object> language = new HashMap<>();
        language.put("code", languageCode == null || languageCode.isBlank() ? "en" : languageCode);
        template.put("language", language);

        List<Map<String, Object>> components = new java.util.ArrayList<>();

        Map<String, Object> documentRef = new HashMap<>();
        documentRef.put("id", mediaId);
        documentRef.put("filename", filename);
        Map<String, Object> headerParam = new HashMap<>();
        headerParam.put("type", "document");
        headerParam.put("document", documentRef);
        Map<String, Object> header = new HashMap<>();
        header.put("type", "header");
        header.put("parameters", List.of(headerParam));
        components.add(header);

        if (bodyParameters != null && !bodyParameters.isEmpty()) {
            List<Map<String, Object>> params = new java.util.ArrayList<>();
            for (String p : bodyParameters) {
                Map<String, Object> param = new HashMap<>();
                param.put("type", "text");
                param.put("text", p);
                params.add(param);
            }
            Map<String, Object> bodyComponent = new HashMap<>();
            bodyComponent.put("type", "body");
            bodyComponent.put("parameters", params);
            components.add(bodyComponent);
        }

        if (buttonUrlParameter != null && !buttonUrlParameter.isBlank()) {
            Map<String, Object> param = new HashMap<>();
            param.put("type", "text");
            param.put("text", buttonUrlParameter);
            Map<String, Object> button = new HashMap<>();
            button.put("type", "button");
            button.put("sub_type", "url");
            button.put("index", "0");
            button.put("parameters", List.of(param));
            components.add(button);
        }
        template.put("components", components);

        Map<String, Object> body = new HashMap<>();
        body.put("messaging_product", "whatsapp");
        body.put("recipient_type", "individual");
        body.put("to", normalized);
        body.put("type", "template");
        body.put("template", template);

        log.info("[{}] Sending WhatsApp document template to={} template={} lang={} mediaId={} filename={} hasButton={}",
                requestId, normalized, templateName, language.get("code"), mediaId, filename,
                buttonUrlParameter != null && !buttonUrlParameter.isBlank());
        return postMessage(requestId, body);
    }

    /**
     * Uploads a file to Meta's media store and returns its media id (valid ~30 days on Meta's side,
     * long enough for the recipient to download it from the chat).
     */
    public String uploadMedia(String requestId, byte[] content, String filename, String mimeType) {
        validateCreds();
        if (content == null || content.length == 0) {
            throw new IllegalArgumentException("document is empty");
        }
        String type = mimeType == null || mimeType.isBlank() ? "application/pdf" : mimeType;
        String url = String.format("%s/%s/%s/media",
                props.getApiBaseUrl(), props.getApiVersion(), props.getPhoneNumberId());

        org.springframework.util.MultiValueMap<String, Object> form = new org.springframework.util.LinkedMultiValueMap<>();
        form.add("messaging_product", "whatsapp");
        form.add("type", type);

        HttpHeaders fileHeaders = new HttpHeaders();
        fileHeaders.setContentType(MediaType.parseMediaType(type));
        org.springframework.core.io.ByteArrayResource resource = new org.springframework.core.io.ByteArrayResource(content) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
        form.add("file", new HttpEntity<>(resource, fileHeaders));

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(props.getAccessToken());
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        long startedAt = System.currentTimeMillis();
        try {
            ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.POST,
                    new HttpEntity<>(form, headers), Map.class);
            Object id = response.getBody() == null ? null : response.getBody().get("id");
            if (id == null) {
                throw new ProviderException("WhatsApp media upload returned no id", 0, String.valueOf(response.getBody()));
            }
            log.info("[{}] WhatsApp media uploaded mediaId={} bytes={} filename={} ({}ms)",
                    requestId, id, content.length, filename, System.currentTimeMillis() - startedAt);
            return id.toString();
        } catch (HttpStatusCodeException ex) {
            String respBody = ex.getResponseBodyAsString();
            log.error("[{}] WhatsApp media upload error status={} body={}", requestId, ex.getStatusCode(), respBody);
            throw new ProviderException("WhatsApp media upload rejected: " + ex.getStatusCode(),
                    ex.getStatusCode().value(), respBody);
        } catch (ProviderException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("[{}] WhatsApp media upload failed: {}", requestId, ex.getMessage(), ex);
            throw new ProviderException("Failed to upload media to WhatsApp Cloud API", ex);
        }
    }

    public String sendMedia(String requestId, String to, String mediaUrl, String mediaType,
                            String caption, String filename) {
        validateCreds();
        String normalized = normalizePhone(to);
        String type = mediaType.toLowerCase();

        Map<String, Object> media = new HashMap<>();
        media.put("link", mediaUrl);
        if (caption != null && !caption.isBlank() && !"audio".equals(type)) {
            media.put("caption", caption);
        }
        if ("document".equals(type) && filename != null && !filename.isBlank()) {
            media.put("filename", filename);
        }

        Map<String, Object> body = new HashMap<>();
        body.put("messaging_product", "whatsapp");
        body.put("recipient_type", "individual");
        body.put("to", normalized);
        body.put("type", type);
        body.put(type, media);

        log.info("[{}] Sending WhatsApp media to={} type={} url={}", requestId, normalized, type, mediaUrl);
        return postMessage(requestId, body);
    }

    @Async("notificationExecutor")
    public CompletableFuture<String> sendTextAsync(String requestId, String to, String message, Boolean previewUrl) {
        try {
            String id = sendText(requestId, to, message, previewUrl);
            return CompletableFuture.completedFuture(id);
        } catch (Exception ex) {
            log.error("[{}] Async WhatsApp text failed: {}", requestId, ex.getMessage(), ex);
            return CompletableFuture.failedFuture(ex);
        }
    }

    @Async("notificationExecutor")
    public CompletableFuture<String> sendMediaAsync(String requestId, String to, String mediaUrl, String mediaType,
                                                    String caption, String filename) {
        try {
            String id = sendMedia(requestId, to, mediaUrl, mediaType, caption, filename);
            return CompletableFuture.completedFuture(id);
        } catch (Exception ex) {
            log.error("[{}] Async WhatsApp media failed: {}", requestId, ex.getMessage(), ex);
            return CompletableFuture.failedFuture(ex);
        }
    }

    private String postMessage(String requestId, Map<String, Object> body) {
        String url = String.format("%s/%s/%s/messages",
                props.getApiBaseUrl(), props.getApiVersion(), props.getPhoneNumberId());

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(props.getAccessToken());
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.POST, entity, Map.class);
            Map<?, ?> respBody = response.getBody();
            String providerId = extractMessageId(respBody);
            log.info("[{}] WhatsApp send successful providerMessageId={}", requestId, providerId);
            return providerId;
        } catch (HttpStatusCodeException ex) {
            String respBody = ex.getResponseBodyAsString();
            log.error("[{}] WhatsApp API error status={} body={}", requestId, ex.getStatusCode(), respBody);
            throw new ProviderException(
                    "WhatsApp API rejected the request: " + ex.getStatusCode(),
                    ex.getStatusCode().value(),
                    respBody);
        } catch (Exception ex) {
            log.error("[{}] WhatsApp API call failed: {}", requestId, ex.getMessage(), ex);
            throw new ProviderException("Failed to reach WhatsApp Cloud API", ex);
        }
    }

    private String extractMessageId(Map<?, ?> respBody) {
        if (respBody == null) return null;
        Object messages = respBody.get("messages");
        if (messages instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> first) {
            Object id = first.get("id");
            return id != null ? id.toString() : null;
        }
        return null;
    }

    private void validateCreds() {
        if (props.getAccessToken() == null || props.getAccessToken().isBlank()
                || props.getPhoneNumberId() == null || props.getPhoneNumberId().isBlank()) {
            throw new NotificationException(
                    "WhatsApp credentials are not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID)");
        }
    }

    private String normalizePhone(String raw) {
        String digits = raw.replaceAll("[^0-9]", "");
        if (digits.isEmpty()) {
            throw new IllegalArgumentException("Recipient phone number contains no digits");
        }
        String cc = props.getDefaultCountryCode() == null ? "" : props.getDefaultCountryCode().replaceAll("[^0-9]", "");
        if (!cc.isEmpty() && digits.length() == 10) {
            digits = cc + digits;
        }
        return digits;
    }
}
