package com.shivagri.notification.service;

import com.shivagri.notification.config.EmailProperties;
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
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class GmailOAuthTokenService {

    private static final long REFRESH_SKEW_SECONDS = 60;

    private final EmailProperties props;
    private final RestTemplate restTemplate;

    private volatile String cachedAccessToken;
    private volatile Instant cachedExpiry = Instant.EPOCH;

    public synchronized String getAccessToken() {
        if (cachedAccessToken != null && Instant.now().plusSeconds(REFRESH_SKEW_SECONDS).isBefore(cachedExpiry)) {
            return cachedAccessToken;
        }
        return refreshAccessToken();
    }

    public synchronized String refreshAccessToken() {
        EmailProperties.OAuth oauth = props.getOauth();
        if (oauth == null
                || oauth.getClientId() == null || oauth.getClientId().isBlank()
                || oauth.getClientSecret() == null || oauth.getClientSecret().isBlank()
                || oauth.getRefreshToken() == null || oauth.getRefreshToken().isBlank()) {
            throw new NotificationException(
                    "Gmail OAuth credentials are not configured (GMAIL_OAUTH_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN)");
        }

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", oauth.getClientId());
        form.add("client_secret", oauth.getClientSecret());
        form.add("refresh_token", oauth.getRefreshToken());
        form.add("grant_type", "refresh_token");

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        HttpEntity<MultiValueMap<String, String>> entity = new HttpEntity<>(form, headers);

        log.info("Requesting new Gmail OAuth access token");
        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    oauth.getTokenEndpoint(), HttpMethod.POST, entity, Map.class);
            Map<?, ?> body = response.getBody();
            if (body == null || body.get("access_token") == null) {
                throw new ProviderException("Google OAuth response missing access_token",
                        response.getStatusCode().value(), String.valueOf(body));
            }
            String token = body.get("access_token").toString();
            int expiresIn = body.get("expires_in") instanceof Number n ? n.intValue() : 3600;
            this.cachedAccessToken = token;
            this.cachedExpiry = Instant.now().plusSeconds(expiresIn);
            log.info("Obtained Gmail OAuth access token, expires in {}s", expiresIn);
            return token;
        } catch (HttpStatusCodeException ex) {
            String respBody = ex.getResponseBodyAsString();
            log.error("Google OAuth token endpoint error status={} body={}", ex.getStatusCode(), respBody);
            throw new ProviderException(
                    "Google OAuth token refresh failed: " + ex.getStatusCode(),
                    ex.getStatusCode().value(),
                    respBody);
        } catch (Exception ex) {
            log.error("Google OAuth token refresh failed: {}", ex.getMessage(), ex);
            throw new ProviderException("Failed to obtain Gmail OAuth access token", ex);
        }
    }

    public void invalidate() {
        this.cachedAccessToken = null;
        this.cachedExpiry = Instant.EPOCH;
    }
}
