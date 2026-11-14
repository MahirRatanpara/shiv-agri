package com.shivagri.notification.controller.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

/**
 * JSON "payload" part of POST /whatsapp/template/document. The PDF itself travels as the
 * "document" multipart part, is uploaded to Meta's media store and attached as the template's
 * DOCUMENT header — so the report never needs a public URL.
 *
 * @param buttonUrlParameter value substituted into the {{1}} suffix of a dynamic URL button (index 0)
 * @param filename           name shown to the recipient for the attached document
 */
public record WhatsAppDocumentTemplateRequest(
        @NotBlank(message = "to is required")
        String to,

        @NotBlank(message = "templateName is required")
        String templateName,

        String languageCode,

        List<String> bodyParameters,

        String buttonUrlParameter,

        @NotBlank(message = "filename is required")
        String filename
) {
}
