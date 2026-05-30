package com.shivagri.notification.controller;

import com.shivagri.notification.controller.dto.OtpRequest;
import com.shivagri.notification.controller.dto.SendResponse;
import com.shivagri.notification.service.OtpDispatchService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Channel-agnostic OTP endpoint. Callers send { to, code }; this service routes to
 * WhatsApp or SMS per {@code notification.otp.channel}.
 */
@Slf4j
@RestController
@RequestMapping("/api/notifications/otp")
@RequiredArgsConstructor
public class OtpController {

    private final OtpDispatchService dispatch;

    @PostMapping
    public ResponseEntity<SendResponse> sendOtp(@Valid @RequestBody OtpRequest req) {
        String requestId = UUID.randomUUID().toString();
        log.info("[{}] POST /otp to={}", requestId, req.to());
        OtpDispatchService.Result result = dispatch.send(requestId, req.to(), req.code());
        return ResponseEntity.ok(SendResponse.sent(requestId, result.channel(), result.providerMessageId()));
    }
}
