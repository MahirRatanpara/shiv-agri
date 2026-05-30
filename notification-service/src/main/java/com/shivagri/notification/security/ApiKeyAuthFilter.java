package com.shivagri.notification.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shivagri.notification.config.SecurityProperties;
import com.shivagri.notification.controller.dto.ErrorResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class ApiKeyAuthFilter extends OncePerRequestFilter {

    public static final String HEADER_NAME = "X-API-Key";

    private static final Set<String> OPEN_PATHS = Set.of(
            "/actuator/health",
            "/actuator/health/liveness",
            "/actuator/health/readiness"
    );

    private final SecurityProperties securityProperties;
    private final ObjectMapper objectMapper;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String path = request.getRequestURI();
        if (OPEN_PATHS.contains(path)) {
            chain.doFilter(request, response);
            return;
        }

        String configured = securityProperties.getApiKey();
        if (configured == null || configured.isBlank()) {
            log.error("NOTIFICATION_API_KEY is not configured — rejecting request to {}", path);
            writeError(response, HttpStatus.SERVICE_UNAVAILABLE, "CONFIG_ERROR",
                    "Notification service API key is not configured");
            return;
        }

        String presented = request.getHeader(HEADER_NAME);
        if (presented == null || !constantTimeEquals(configured, presented)) {
            log.warn("Rejected unauthorized request to {} from {}", path, request.getRemoteAddr());
            writeError(response, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED",
                    "Missing or invalid API key");
            return;
        }

        chain.doFilter(request, response);
    }

    private boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) return false;
        int diff = 0;
        for (int i = 0; i < a.length(); i++) {
            diff |= a.charAt(i) ^ b.charAt(i);
        }
        return diff == 0;
    }

    private void writeError(HttpServletResponse response, HttpStatus status, String code, String message)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        ErrorResponse body = new ErrorResponse(code, message, Instant.now());
        objectMapper.writeValue(response.getWriter(), body);
    }
}
