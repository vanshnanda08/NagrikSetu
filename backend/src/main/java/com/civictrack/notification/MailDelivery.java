package com.civictrack.notification;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.util.List;
import java.util.Map;

/** Transactional outbox: network failures never roll back a civic transition. */
@Service
@Slf4j
public class MailDelivery {
    private final JdbcTemplate jdbc;
    private final ObjectProvider<JavaMailSender> sender;
    private final MailProperties properties;
    private final RestClient brevo;
    private final String publicUrl;

    public MailDelivery(JdbcTemplate jdbc, ObjectProvider<JavaMailSender> sender,
                        MailProperties properties, RestClient.Builder restClient,
                        @org.springframework.beans.factory.annotation.Value(
                                "${civictrack.public-url:http://localhost:3000}") String publicUrl) {
        this.jdbc = jdbc;
        this.sender = sender;
        this.properties = properties;
        this.brevo = restClient.build();
        this.publicUrl = publicUrl;
        log.info("Mail delivery enabled={}, provider={}, credentialsConfigured={}",
                properties.enabled(), properties.provider(), credentialsConfigured());
    }

    public void enqueue(String recipient, String subject, String body) {
        jdbc.update("INSERT INTO mail_outbox(recipient,subject,body) VALUES (?,?,?)", recipient, subject, body);
    }

    public String publicUrl() { return publicUrl.replaceAll("/+$", ""); }

    @Scheduled(fixedDelayString = "${civictrack.mail.poll-ms:30000}")
    @Transactional
    public void deliver() {
        // A reset link is useful for 30 minutes and sensitive forever. Do not
        // retain or deliver an expired raw token when mail was disabled/down.
        jdbc.update("UPDATE mail_outbox SET sent_at = now(), body = '[Expired before delivery]' "
                + "WHERE sent_at IS NULL AND created_at < now() - interval '30 minutes' "
                + "AND subject = 'Reset your NagrikSetu password'");
        if (!deliveryConfigured()) return;
        var rows = jdbc.queryForList("SELECT * FROM mail_outbox WHERE sent_at IS NULL "
                + "AND attempts < 8 AND next_attempt_at <= now() ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED");
        for (var row : rows) {
            try {
                send((String) row.get("recipient"), (String) row.get("subject"),
                        (String) row.get("body"));
                jdbc.update("UPDATE mail_outbox SET sent_at = now(), body = '[Delivered]', attempts = attempts + 1 WHERE id = ?", row.get("id"));
            } catch (RestClientResponseException ex) {
                scheduleRetry(row.get("id"));
                // Never log the response body: providers can echo submitted data.
                log.warn("Mail delivery via {} failed with HTTP status {}",
                        properties.provider(), ex.getStatusCode().value());
            } catch (MailException | RestClientException ex) {
                scheduleRetry(row.get("id"));
                // Do not log credentials, reset links, addresses, or message bodies.
                log.warn("Mail delivery via {} failed ({})",
                        properties.provider(), ex.getClass().getSimpleName());
            }
        }
    }

    private boolean deliveryConfigured() {
        if (!properties.enabled()) return false;
        return credentialsConfigured();
    }

    private boolean credentialsConfigured() {
        if ("brevo".equalsIgnoreCase(properties.provider())) {
            return properties.brevoApiKey() != null && !properties.brevoApiKey().isBlank();
        }
        return sender.getIfAvailable() != null;
    }

    private void scheduleRetry(Object id) {
        jdbc.update("UPDATE mail_outbox SET attempts = attempts + 1, "
                + "next_attempt_at = now() + interval '1 minute' * power(2, attempts) WHERE id = ?", id);
    }

    private void send(String recipient, String subject, String body) {
        if ("brevo".equalsIgnoreCase(properties.provider())) {
            brevo.post().uri(properties.brevoUrl())
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("api-key", properties.brevoApiKey())
                    .body(Map.of(
                            "sender", Map.of("name", properties.fromName(), "email", properties.from()),
                            "to", List.of(Map.of("email", recipient)),
                            "subject", subject,
                            "textContent", body))
                    .retrieve().toBodilessEntity();
            return;
        }

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(properties.from());
        message.setTo(recipient);
        message.setSubject(subject);
        message.setText(body);
        sender.getObject().send(message);
    }
}
