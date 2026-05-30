package com.shivagri.notification.service;

import com.shivagri.notification.config.Msg91Properties;
import com.shivagri.notification.exception.NotificationException;
import com.shivagri.notification.exception.ProviderException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Sends OTP SMS through the MSG91 Flow API (v5).
 *
 * Request shape:
 * <pre>
 * POST {baseUrl}/flow/
 * authkey: {authKey}
 * { "template_id": "...", "sender": "SHVAGR", "short_url": "0",
 *   "recipients": [ { "mobiles": "919876543210", "OTP": "1234" } ] }
 * </pre>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SmsService {

    private final Msg91Properties props;
    private final RestTemplate restTemplate;

    public String sendOtp(String requestId, String to, String code) {
        validateCreds();
        String mobile = normalizePhone(to);
        String otpVar = (props.getOtpVariable() == null || props.getOtpVariable().isBlank())
                ? "OTP" : props.getOtpVariable();

        Map<String, Object> recipient = new HashMap<>();
        recipient.put("mobiles", mobile);
        recipient.put(otpVar, code);

        Map<String, Object> body = new HashMap<>();
        body.put("template_id", props.getTemplateId());
        body.put("short_url", "0");
        body.put("realTimeResponse", "1");
        if (props.getSenderId() != null && !props.getSenderId().isBlank()) {
            body.put("sender", props.getSenderId());
        }
        body.put("recipients", List.of(recipient));

        String baseUrl = (props.getBaseUrl() == null || props.getBaseUrl().isBlank())
                ? "https://control.msg91.com/api/v5" : props.getBaseUrl();
        String url = baseUrl.replaceAll("/+$", "") + "/flow/";

        HttpHeaders headers = new HttpHeaders();
        headers.set("authkey", props.getAuthKey());
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));

        log.info("[{}] Sending OTP SMS via MSG91 to={} template={}", requestId, mobile, props.getTemplateId());

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        try {
            ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.POST, entity, Map.class);
            String providerId = extractRequestId(response.getBody());
            log.info("[{}] MSG91 SMS send successful providerId={}", requestId, providerId);
            return providerId;
        } catch (HttpStatusCodeException ex) {
            String respBody = ex.getResponseBodyAsString();
            log.error("[{}] MSG91 API error status={} body={}", requestId, ex.getStatusCode(), respBody);
            throw new ProviderException(
                    "MSG91 API rejected the request: " + ex.getStatusCode(),
                    ex.getStatusCode().value(),
                    respBody);
        } catch (Exception ex) {
            log.error("[{}] MSG91 API call failed: {}", requestId, ex.getMessage(), ex);
            throw new ProviderException("Failed to reach MSG91 API", ex);
        }
    }

    private String extractRequestId(Map<?, ?> respBody) {
        if (respBody == null) return null;
        // MSG91 v5 returns { "type": "success", "message": "<request_id>" } (or "request_id").
        Object reqId = respBody.get("request_id");
        if (reqId != null) return reqId.toString();
        Object message = respBody.get("message");
        return message != null ? message.toString() : null;
    }

    private void validateCreds() {
        if (props.getAuthKey() == null || props.getAuthKey().isBlank()
                || props.getTemplateId() == null || props.getTemplateId().isBlank()) {
            throw new NotificationException(
                    "MSG91 SMS is not configured (MSG91_AUTH_KEY / MSG91_TEMPLATE_ID)");
        }
    }

    private String normalizePhone(String raw) {
        String digits = raw == null ? "" : raw.replaceAll("[^0-9]", "");
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
