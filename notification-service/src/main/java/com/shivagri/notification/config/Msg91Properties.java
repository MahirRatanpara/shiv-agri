package com.shivagri.notification.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * MSG91 SMS provider configuration (used for sending OTP over normal SMS in India).
 *
 * Uses the MSG91 Flow API v5 with a DLT-approved template. The OTP value is injected
 * into the template variable named by {@code otpVariable} (e.g. a template containing
 * {@code ##OTP##} expects the recipient key "OTP").
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "notification.msg91")
public class Msg91Properties {
    /** MSG91 auth key (account-level secret used in the "authkey" header). */
    private String authKey;
    /** API base, default https://control.msg91.com/api/v5 */
    private String baseUrl;
    /** DLT-approved Flow template id that contains the OTP variable. */
    private String templateId;
    /** Registered DLT sender/header id (optional if the flow already pins one). */
    private String senderId;
    /** Name of the OTP variable in the template (without ## ##). Defaults to "OTP". */
    private String otpVariable;
    /** Prepended to bare 10-digit numbers. Defaults to "91" (India). */
    private String defaultCountryCode;
}
