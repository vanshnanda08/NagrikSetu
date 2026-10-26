package com.civictrack.notification;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Transactional outbox: network failures never roll back a civic transition. */
@Service
@RequiredArgsConstructor
public class MailDelivery {
    private final JdbcTemplate jdbc;
    private final ObjectProvider<JavaMailSender> sender;
    @Value("${civictrack.mail.enabled:false}") private boolean enabled;
    @Value("${civictrack.mail.from:noreply@example.test}") private String from;
    @Value("${civictrack.public-url:http://localhost:3000}") private String publicUrl;

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
        if (!enabled || sender.getIfAvailable() == null) return;
        var rows = jdbc.queryForList("SELECT * FROM mail_outbox WHERE sent_at IS NULL "
                + "AND attempts < 8 AND next_attempt_at <= now() ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED");
        for (var row : rows) {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo((String) row.get("recipient"));
            message.setSubject((String) row.get("subject"));
            message.setText((String) row.get("body"));
            try {
                sender.getObject().send(message);
                jdbc.update("UPDATE mail_outbox SET sent_at = now(), body = '[Delivered]', attempts = attempts + 1 WHERE id = ?", row.get("id"));
            } catch (org.springframework.mail.MailException ex) {
                // Do not log credentials, reset links, addresses, or message bodies.
                jdbc.update("UPDATE mail_outbox SET attempts = attempts + 1, "
                        + "next_attempt_at = now() + interval '1 minute' * power(2, attempts) WHERE id = ?", row.get("id"));
            }
        }
    }
}
