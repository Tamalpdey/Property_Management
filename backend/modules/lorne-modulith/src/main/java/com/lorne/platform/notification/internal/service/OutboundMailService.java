package com.lorne.platform.notification.internal.service;

import com.lorne.platform.notification.OutboundEmailMessage;
import com.lorne.platform.notification.OutboundMailDeliveryResult;
import com.lorne.platform.notification.OutboundMailOperations;
import com.lorne.platform.tenant.TenantSettingsOperations;
import jakarta.mail.internet.InternetAddress;
import java.time.Instant;
import java.util.Properties;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
public class OutboundMailService implements OutboundMailOperations {
    private final TenantSettingsOperations tenantSettingsOperations;
    private final ObjectProvider<JavaMailSender> systemMailSenderProvider;
    private final boolean systemMailEnabled;
    private final String systemFromAddress;

    public OutboundMailService(
            TenantSettingsOperations tenantSettingsOperations,
            ObjectProvider<JavaMailSender> systemMailSenderProvider,
            @Value("${lorne.mail.enabled:false}") boolean systemMailEnabled,
            @Value("${lorne.mail.from:no-reply@lorne.local}") String systemFromAddress
    ) {
        this.tenantSettingsOperations = tenantSettingsOperations;
        this.systemMailSenderProvider = systemMailSenderProvider;
        this.systemMailEnabled = systemMailEnabled;
        this.systemFromAddress = systemFromAddress;
    }

    @Override
    public OutboundMailDeliveryResult send(UUID tenantId, OutboundEmailMessage message) {
        var settings = tenantSettingsOperations.settings(tenantId);
        var provider = settings.emailProvider();
        var from = "TENANT_SMTP".equals(provider)
                ? value(settings.emailFromAddress())
                : settings.effectiveFromAddress(systemFromAddress);
        var replyTo = settings.effectiveReplyToAddress();
        if ("TENANT_SMTP".equals(provider)) {
            if (settings.smtpHost() == null || settings.smtpHost().isBlank()
                    || settings.smtpPort() == null
                    || from.isBlank()
                    || settings.smtpUsername() == null || settings.smtpUsername().isBlank()
                    || settings.smtpPassword() == null || settings.smtpPassword().isBlank()) {
                return new OutboundMailDeliveryResult("RECORDED", "Tenant SMTP is not fully configured. Email recorded for review.", null, provider, from, replyTo);
            }
            return sendWith(tenantMailSender(settings.smtpHost(), settings.smtpPort(), settings.smtpUsername(), settings.smtpPassword(), settings.smtpUseTls()), message, provider, from, settings.effectiveSenderName(), replyTo);
        }
        if (!systemMailEnabled) {
            return new OutboundMailDeliveryResult("RECORDED", "SMTP disabled. Email recorded for review.", null, provider, from, replyTo);
        }
        var sender = systemMailSenderProvider.getIfAvailable();
        if (sender == null) {
            return new OutboundMailDeliveryResult("FAILED", "JavaMailSender is not available.", null, provider, from, replyTo);
        }
        return sendWith(sender, message, provider, from, settings.effectiveSenderName(), replyTo);
    }

    private OutboundMailDeliveryResult sendWith(
            JavaMailSender sender,
            OutboundEmailMessage message,
            String provider,
            String from,
            String senderName,
            String replyTo
    ) {
        try {
            var mimeMessage = sender.createMimeMessage();
            var helper = new MimeMessageHelper(mimeMessage, true);
            helper.setFrom(new InternetAddress(from, senderName));
            if (replyTo != null && !replyTo.isBlank()) {
                helper.setReplyTo(replyTo);
            }
            helper.setTo(message.recipient());
            helper.setSubject(message.subject());
            helper.setText(message.body(), false);
            for (var attachment : message.attachments()) {
                helper.addAttachment(attachment.filename(), new ByteArrayResource(attachment.content()), attachment.contentType());
            }
            sender.send(mimeMessage);
            return new OutboundMailDeliveryResult("SENT", "Sent by SMTP.", Instant.now(), provider, from, replyTo);
        } catch (Exception exception) {
            return new OutboundMailDeliveryResult("FAILED", exception.getMessage(), null, provider, from, replyTo);
        }
    }

    private JavaMailSender tenantMailSender(String host, int port, String username, String password, boolean useTls) {
        var sender = new JavaMailSenderImpl();
        sender.setHost(host);
        sender.setPort(port);
        sender.setUsername(username);
        sender.setPassword(password);
        var properties = new Properties();
        properties.put("mail.smtp.auth", "true");
        properties.put("mail.smtp.starttls.enable", String.valueOf(useTls));
        properties.put("mail.smtp.starttls.required", String.valueOf(useTls));
        sender.setJavaMailProperties(properties);
        return sender;
    }

    private String value(String value) {
        return value == null ? "" : value.trim();
    }
}
