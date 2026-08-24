package com.lorne.platform.notification.internal.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lorne.platform.notification.OutboundEmailMessage;
import com.lorne.platform.notification.OutboundMailDeliveryResult;
import com.lorne.platform.notification.OutboundMailOperations;
import com.lorne.platform.tenant.TenantSettingsOperations;
import com.lorne.platform.tenant.TenantSettingsView;
import jakarta.mail.internet.InternetAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
public class OutboundMailService implements OutboundMailOperations {
    private final TenantSettingsOperations tenantSettingsOperations;
    private final ObjectProvider<JavaMailSender> systemMailSenderProvider;
    private final ObjectMapper objectMapper;
    private final HttpClient graphHttpClient;
    private final boolean systemMailEnabled;
    private final String systemFromAddress;

    public OutboundMailService(
            TenantSettingsOperations tenantSettingsOperations,
            ObjectProvider<JavaMailSender> systemMailSenderProvider,
            ObjectMapper objectMapper,
            @Value("${lorne.mail.enabled:false}") boolean systemMailEnabled,
            @Value("${lorne.mail.from:no-reply@lorne.local}") String systemFromAddress
    ) {
        this.tenantSettingsOperations = tenantSettingsOperations;
        this.systemMailSenderProvider = systemMailSenderProvider;
        this.objectMapper = objectMapper;
        this.graphHttpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
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
            return sendWith(tenantMailSender(settings.smtpHost(), settings.smtpPort(), settings.smtpUsername(), settings.smtpPassword(), settings.smtpUseTls()), message, provider, from, settings.effectiveSenderName(), replyTo, settings.smtpHost(), settings.smtpPort(), settings.smtpUsername());
        }
        if ("TENANT_GRAPH".equals(provider)) {
            var graphSender = value(settings.effectiveGraphSenderUser());
            if (settings.graphTenantId() == null || settings.graphTenantId().isBlank()
                    || settings.graphClientId() == null || settings.graphClientId().isBlank()
                    || settings.graphClientSecret() == null || settings.graphClientSecret().isBlank()
                    || graphSender.isBlank()) {
                return new OutboundMailDeliveryResult("RECORDED", "Microsoft Graph is not fully configured. Email recorded for review.", null, provider, graphSender, replyTo);
            }
            return sendWithMicrosoftGraph(settings, message, provider, graphSender, replyTo);
        }
        if (!systemMailEnabled) {
            return new OutboundMailDeliveryResult("RECORDED", "SMTP disabled. Email recorded for review.", null, provider, from, replyTo);
        }
        var sender = systemMailSenderProvider.getIfAvailable();
        if (sender == null) {
            return new OutboundMailDeliveryResult("FAILED", "JavaMailSender is not available.", null, provider, from, replyTo);
        }
        return sendWith(sender, message, provider, from, settings.effectiveSenderName(), replyTo, null, null, null);
    }

    private OutboundMailDeliveryResult sendWith(
            JavaMailSender sender,
            OutboundEmailMessage message,
            String provider,
            String from,
            String senderName,
            String replyTo,
            String smtpHost,
            Integer smtpPort,
            String smtpUsername
    ) {
        try {
            var mimeMessage = sender.createMimeMessage();
            var helper = new MimeMessageHelper(mimeMessage, true);
            helper.setFrom(new InternetAddress(from, senderName));
            if (replyTo != null && !replyTo.isBlank()) {
                helper.setReplyTo(replyTo);
            }
            helper.setTo(message.recipient());
            if (!message.ccRecipients().isEmpty()) {
                helper.setCc(message.ccRecipients().toArray(String[]::new));
            }
            if (!message.bccRecipients().isEmpty()) {
                helper.setBcc(message.bccRecipients().toArray(String[]::new));
            }
            helper.setSubject(message.subject());
            helper.setText(message.body(), false);
            for (var attachment : message.attachments()) {
                helper.addAttachment(attachment.filename(), new ByteArrayResource(attachment.content()), attachment.contentType());
            }
            sender.send(mimeMessage);
            return new OutboundMailDeliveryResult("SENT", "Sent by SMTP.", Instant.now(), provider, from, replyTo);
        } catch (Exception exception) {
            return new OutboundMailDeliveryResult("FAILED", friendlyFailureMessage(exception, smtpHost, smtpPort, smtpUsername, from), null, provider, from, replyTo);
        }
    }

    private OutboundMailDeliveryResult sendWithMicrosoftGraph(
            TenantSettingsView settings,
            OutboundEmailMessage message,
            String provider,
            String from,
            String replyTo
    ) {
        try {
            var accessToken = graphAccessToken(settings.graphTenantId(), settings.graphClientId(), settings.graphClientSecret());
            var payload = graphMailPayload(message, replyTo);
            var request = HttpRequest.newBuilder()
                    .uri(URI.create("https://graph.microsoft.com/v1.0/users/%s/sendMail".formatted(urlEncode(from))))
                    .timeout(Duration.ofSeconds(30))
                    .header("Authorization", "Bearer " + accessToken)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .build();
            var response = graphHttpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("Microsoft Graph sendMail failed (%s): %s".formatted(response.statusCode(), graphError(response.body())));
            }
            return new OutboundMailDeliveryResult("SENT", "Sent by Microsoft Graph.", Instant.now(), provider, from, replyTo);
        } catch (Exception exception) {
            return new OutboundMailDeliveryResult("FAILED", friendlyGraphFailureMessage(exception, from), null, provider, from, replyTo);
        }
    }

    private String graphAccessToken(String tenantId, String clientId, String clientSecret) throws Exception {
        var request = HttpRequest.newBuilder()
                .uri(URI.create("https://login.microsoftonline.com/%s/oauth2/v2.0/token".formatted(urlEncode(tenantId))))
                .timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(formBody(Map.of(
                        "client_id", clientId,
                        "client_secret", clientSecret,
                        "scope", "https://graph.microsoft.com/.default",
                        "grant_type", "client_credentials"
                ))))
                .build();
        var response = graphHttpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("Microsoft Graph token request failed (%s): %s".formatted(response.statusCode(), graphError(response.body())));
        }
        var token = objectMapper.readTree(response.body()).path("access_token").asText("");
        if (token.isBlank()) {
            throw new IllegalStateException("Microsoft Graph token response did not include an access token.");
        }
        return token;
    }

    private Map<String, Object> graphMailPayload(OutboundEmailMessage message, String replyTo) {
        var graphMessage = new LinkedHashMap<String, Object>();
        graphMessage.put("subject", message.subject());
        graphMessage.put("body", Map.of(
                "contentType", "Text",
                "content", message.body()
        ));
        graphMessage.put("toRecipients", List.of(Map.of(
                "emailAddress", Map.of("address", message.recipient())
        )));
        if (!message.ccRecipients().isEmpty()) {
            graphMessage.put("ccRecipients", graphRecipients(message.ccRecipients()));
        }
        if (!message.bccRecipients().isEmpty()) {
            graphMessage.put("bccRecipients", graphRecipients(message.bccRecipients()));
        }
        if (replyTo != null && !replyTo.isBlank()) {
            graphMessage.put("replyTo", List.of(Map.of(
                    "emailAddress", Map.of("address", replyTo)
            )));
        }
        if (message.attachments() != null && !message.attachments().isEmpty()) {
            var graphAttachments = new ArrayList<Map<String, Object>>();
            for (var attachment : message.attachments()) {
                graphAttachments.add(Map.of(
                        "@odata.type", "#microsoft.graph.fileAttachment",
                        "name", attachment.filename(),
                        "contentType", attachment.contentType(),
                        "contentBytes", Base64.getEncoder().encodeToString(attachment.content())
                ));
            }
            graphMessage.put("attachments", graphAttachments);
        }
        return Map.of(
                "message", graphMessage,
                "saveToSentItems", true
        );
    }

    private List<Map<String, Map<String, String>>> graphRecipients(List<String> recipients) {
        return recipients.stream()
                .map(recipient -> Map.of("emailAddress", Map.of("address", recipient)))
                .toList();
    }

    private JavaMailSender tenantMailSender(String host, int port, String username, String password, boolean useTls) {
        var sender = new JavaMailSenderImpl();
        sender.setHost(host);
        sender.setPort(port);
        sender.setUsername(username);
        sender.setPassword(password);
        var implicitSsl = port == 465;
        var properties = new Properties();
        properties.put("mail.smtp.auth", "true");
        properties.put("mail.smtp.starttls.enable", String.valueOf(useTls && !implicitSsl));
        properties.put("mail.smtp.starttls.required", String.valueOf(useTls && !implicitSsl));
        properties.put("mail.smtp.ssl.enable", String.valueOf(implicitSsl));
        if (implicitSsl) {
            properties.put("mail.smtp.ssl.trust", host);
        }
        properties.put("mail.smtp.connectiontimeout", "10000");
        properties.put("mail.smtp.timeout", "10000");
        properties.put("mail.smtp.writetimeout", "10000");
        sender.setJavaMailProperties(properties);
        return sender;
    }

    private String value(String value) {
        return value == null ? "" : value.trim();
    }

    private String formBody(Map<String, String> values) {
        var entries = new ArrayList<String>();
        for (var entry : values.entrySet()) {
            entries.add(urlEncode(entry.getKey()) + "=" + urlEncode(entry.getValue()));
        }
        return String.join("&", entries);
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8)
                .replace("+", "%20");
    }

    private String friendlyFailureMessage(Exception exception, String host, Integer port, String username, String from) {
        var originalMessage = rootMessage(exception);
        if (isAuthenticationFailure(exception, originalMessage)) {
            var provider = host == null || host.isBlank() ? "SMTP provider" : host;
            return "SMTP authentication failed for %s. Check that the username is the mailbox/login user, the password is an app password when required, and the from address '%s' is allowed for that account. Host: %s, port: %s. Provider said: %s"
                    .formatted(maskUsername(username), value(from), provider, port == null ? "default" : port, originalMessage);
        }
        return originalMessage;
    }

    private String friendlyGraphFailureMessage(Exception exception, String sender) {
        var originalMessage = rootMessage(exception);
        var lowerMessage = originalMessage.toLowerCase();
        if (lowerMessage.contains("invalid_client")
                || lowerMessage.contains("unauthorized_client")
                || lowerMessage.contains("authentication")
                || lowerMessage.contains("invalid client secret")) {
            return "Microsoft Graph authentication failed for %s. Check the tenant ID, client ID, client secret, Mail.Send application permission, and admin consent. Provider said: %s"
                    .formatted(value(sender).isBlank() ? "configured sender" : sender, originalMessage);
        }
        if (lowerMessage.contains("accessdenied")
                || lowerMessage.contains("forbidden")
                || lowerMessage.contains("mailsend")
                || lowerMessage.contains("mail.send")) {
            return "Microsoft Graph cannot send as %s. Check Mail.Send application permission, admin consent, and that the sender mailbox exists. Provider said: %s"
                    .formatted(value(sender).isBlank() ? "configured sender" : sender, originalMessage);
        }
        return originalMessage;
    }

    private String graphError(String body) {
        if (body == null || body.isBlank()) {
            return "No response body.";
        }
        try {
            var node = objectMapper.readTree(body);
            var error = node.path("error");
            if (error.isObject()) {
                var code = error.path("code").asText("");
                var message = error.path("message").asText("");
                return (code + " " + message).trim();
            }
            var errorDescription = node.path("error_description").asText("");
            if (!errorDescription.isBlank()) {
                return errorDescription;
            }
            var errorText = node.path("error").asText("");
            if (!errorText.isBlank()) {
                return errorText;
            }
        } catch (JsonProcessingException ignored) {
            // Fall through to a compact body preview.
        }
        return body.length() > 600 ? body.substring(0, 600) + "..." : body;
    }

    private boolean isAuthenticationFailure(Throwable throwable, String message) {
        var current = throwable;
        while (current != null) {
            if (current instanceof MailAuthenticationException) {
                return true;
            }
            current = current.getCause();
        }
        var lowerMessage = message == null ? "" : message.toLowerCase();
        return lowerMessage.contains("authenticat")
                || lowerMessage.contains("535")
                || lowerMessage.contains("username and password not accepted")
                || lowerMessage.contains("bad credentials");
    }

    private String rootMessage(Throwable throwable) {
        var current = throwable;
        var message = throwable.getMessage();
        while (current.getCause() != null) {
            current = current.getCause();
            if (current.getMessage() != null && !current.getMessage().isBlank()) {
                message = current.getMessage();
            }
        }
        return message == null || message.isBlank() ? throwable.getClass().getSimpleName() : message;
    }

    private String maskUsername(String username) {
        var normalized = value(username);
        if (normalized.isBlank()) {
            return "configured user";
        }
        var atIndex = normalized.indexOf('@');
        if (atIndex > 1) {
            return normalized.charAt(0) + "***" + normalized.substring(atIndex);
        }
        if (normalized.length() <= 2) {
            return "***";
        }
        return normalized.charAt(0) + "***" + normalized.charAt(normalized.length() - 1);
    }
}
