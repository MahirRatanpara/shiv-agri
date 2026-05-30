package com.shivagri.notification.service;

import com.shivagri.notification.config.EmailProperties;
import com.shivagri.notification.exception.NotificationException;
import com.shivagri.notification.exception.ProviderException;
import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private final EmailProperties props;
    private final GmailOAuthTokenService tokenService;

    public String sendEmail(String requestId,
                            List<String> to,
                            List<String> cc,
                            List<String> bcc,
                            String subject,
                            String body,
                            boolean html,
                            List<MultipartFile> attachments) {
        validateConfig();
        String accessToken = tokenService.getAccessToken();

        JavaMailSenderImpl sender = buildSender(accessToken);
        MimeMessage message = sender.createMimeMessage();

        boolean multipart = attachments != null && !attachments.isEmpty();
        try {
            MimeMessageHelper helper = new MimeMessageHelper(message, multipart, "UTF-8");
            helper.setFrom(buildFromAddress());
            helper.setTo(toArray(to));
            if (cc != null && !cc.isEmpty()) helper.setCc(toArray(cc));
            if (bcc != null && !bcc.isEmpty()) helper.setBcc(toArray(bcc));
            helper.setSubject(subject);
            helper.setText(body, html);

            if (multipart) {
                for (MultipartFile att : attachments) {
                    if (att == null || att.isEmpty()) continue;
                    String name = att.getOriginalFilename();
                    if (name == null || name.isBlank()) name = "attachment";
                    helper.addAttachment(name, new ByteArrayResource(att.getBytes()));
                }
            }
        } catch (MessagingException | IOException ex) {
            throw new NotificationException("Failed to build email message: " + ex.getMessage(), ex);
        }

        log.info("[{}] Sending email to={} cc={} bcc={} subject='{}' attachments={}",
                requestId, to, cc, bcc, subject, multipart ? attachments.size() : 0);

        try {
            sender.send(message);
            String mid = message.getMessageID();
            log.info("[{}] Email sent successfully messageId={}", requestId, mid);
            return mid;
        } catch (org.springframework.mail.MailAuthenticationException ex) {
            log.warn("[{}] Mail auth failed, invalidating cached token and retrying once: {}", requestId, ex.getMessage());
            tokenService.invalidate();
            JavaMailSenderImpl retry = buildSender(tokenService.getAccessToken());
            try {
                retry.send(message);
                return message.getMessageID();
            } catch (Exception ex2) {
                log.error("[{}] Email send failed after token refresh: {}", requestId, ex2.getMessage(), ex2);
                throw new ProviderException("Failed to send email via Gmail SMTP", ex2);
            }
        } catch (Exception ex) {
            log.error("[{}] Email send failed: {}", requestId, ex.getMessage(), ex);
            throw new ProviderException("Failed to send email via Gmail SMTP", ex);
        }
    }

    @Async("notificationExecutor")
    public CompletableFuture<String> sendEmailAsync(String requestId,
                                                    List<String> to,
                                                    List<String> cc,
                                                    List<String> bcc,
                                                    String subject,
                                                    String body,
                                                    boolean html,
                                                    List<MultipartFile> attachments) {
        try {
            String id = sendEmail(requestId, to, cc, bcc, subject, body, html, attachments);
            return CompletableFuture.completedFuture(id);
        } catch (Exception ex) {
            log.error("[{}] Async email send failed: {}", requestId, ex.getMessage(), ex);
            return CompletableFuture.failedFuture(ex);
        }
    }

    private JavaMailSenderImpl buildSender(String accessToken) {
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(props.getSmtpHost());
        sender.setPort(props.getSmtpPort());
        sender.setUsername(props.getFromAddress());
        sender.setPassword(accessToken);

        Properties mailProps = sender.getJavaMailProperties();
        mailProps.put("mail.transport.protocol", "smtp");
        mailProps.put("mail.smtp.auth", "true");
        mailProps.put("mail.smtp.auth.mechanisms", "XOAUTH2");
        mailProps.put("mail.smtp.starttls.enable", "true");
        mailProps.put("mail.smtp.starttls.required", "true");
        mailProps.put("mail.smtp.ssl.protocols", "TLSv1.2 TLSv1.3");
        mailProps.put("mail.smtp.connectiontimeout", "10000");
        mailProps.put("mail.smtp.timeout", "30000");
        mailProps.put("mail.smtp.writetimeout", "30000");
        return sender;
    }

    private InternetAddress buildFromAddress() {
        try {
            String name = props.getFromName() == null || props.getFromName().isBlank()
                    ? "Shiv-Agri" : props.getFromName();
            return new InternetAddress(props.getFromAddress(), name, "UTF-8");
        } catch (UnsupportedEncodingException ex) {
            throw new NotificationException("Invalid from-address encoding", ex);
        }
    }

    private String[] toArray(List<String> list) {
        return list.toArray(new String[0]);
    }

    private void validateConfig() {
        if (props.getFromAddress() == null || props.getFromAddress().isBlank()) {
            throw new NotificationException("Gmail from-address is not configured (GMAIL_FROM_ADDRESS)");
        }
    }
}
