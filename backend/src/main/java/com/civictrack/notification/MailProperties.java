package com.civictrack.notification;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Delivery configuration. Brevo uses HTTPS and works where SMTP is blocked. */
@ConfigurationProperties(prefix = "civictrack.mail")
public record MailProperties(
        @DefaultValue("false") boolean enabled,
        @DefaultValue("smtp") String provider,
        @DefaultValue("noreply@example.test") String from,
        @DefaultValue("NagrikSetu") String fromName,
        @DefaultValue("") String brevoApiKey,
        @DefaultValue("https://api.brevo.com/v3/smtp/email") String brevoUrl
) {
}
