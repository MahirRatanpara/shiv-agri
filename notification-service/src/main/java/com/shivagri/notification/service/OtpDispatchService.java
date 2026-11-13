package com.shivagri.notification.service;

import com.shivagri.notification.config.OtpProperties;
import com.shivagri.notification.exception.ProviderException;
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
        boolean withButton = w.isHasButton();
        try {
            String providerId = whatsAppService.sendTemplate(
                    requestId, to, w.getTemplateName(), w.getLanguageCode(),
                    List.of(code), withButton ? code : null);
            return new Result("whatsapp", providerId);
        } catch (ProviderException ex) {
            // Meta only tells us the template's real button shape when a send is rejected,
            // so a mismatched `has-button` would otherwise break every OTP until someone
            // notices. Retry once with the flipped shape and log loudly.
            if (!isButtonShapeMismatch(ex)) {
                throw ex;
            }
            log.warn("[{}] WhatsApp rejected template {} for a button-parameter mismatch "
                            + "(has-button={}); retrying with has-button={}. "
                            + "Set WHATSAPP_OTP_TEMPLATE_HAS_BUTTON={} to avoid this extra call.",
                    requestId, w.getTemplateName(), withButton, !withButton, !withButton);
            String providerId = whatsAppService.sendTemplate(
                    requestId, to, w.getTemplateName(), w.getLanguageCode(),
                    List.of(code), withButton ? null : code);
            return new Result("whatsapp", providerId);
        }
    }

    /**
     * True when Meta's rejection is about the template's buttons rather than something
     * we cannot fix by retrying — a missing copy-code parameter (131008) or one parameter
     * too many for a template that has no button (132000).
     */
    private boolean isButtonShapeMismatch(ProviderException ex) {
        String body = ex.getProviderBody();
        if (body == null) {
            return false;
        }
        String lower = body.toLowerCase();
        boolean buttonRelated = lower.contains("button");
        return buttonRelated && (lower.contains("131008") || lower.contains("132000"));
    }

    public record Result(String channel, String providerMessageId) {
    }
}
