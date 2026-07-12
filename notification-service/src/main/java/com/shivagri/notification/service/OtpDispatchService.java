package com.shivagri.notification.service;

import com.shivagri.notification.config.OtpProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Routes an OTP to the configured delivery channel (WhatsApp or MSG91 SMS).
 * The channel is a runtime property ({@code notification.otp.channel}) — switching
 * providers needs no code change, just a config flip + restart.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OtpDispatchService {

    private final OtpProperties otpProps;
    private final WhatsAppService whatsAppService;
    private final SmsService smsService;

    /** @return [channel, providerMessageId] */
    public Result send(String requestId, String to, String code) {
        String channel = otpProps.getChannel() == null ? "whatsapp" : otpProps.getChannel().trim().toLowerCase();

        if ("sms".equals(channel)) {
            String providerId = smsService.sendOtp(requestId, to, code);
            return new Result("sms", providerId);
        }

        // Default: WhatsApp template (template name/language configured on this service).
        OtpProperties.Whatsapp w = otpProps.getWhatsapp();
        String providerId = whatsAppService.sendTemplate(
                requestId, to, w.getTemplateName(), w.getLanguageCode(),
                List.of(code), w.isHasButton() ? code : null);
        return new Result("whatsapp", providerId);
    }

    public record Result(String channel, String providerMessageId) {
    }
}
