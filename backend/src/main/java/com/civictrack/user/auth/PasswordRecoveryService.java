package com.civictrack.user.auth;

import com.civictrack.notification.MailDelivery;
import com.civictrack.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.sql.Timestamp;
import java.util.Base64;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PasswordRecoveryService {
    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final MailDelivery mail;
    private final Clock clock;

    @Transactional
    public void request(String email) {
        users.findByEmailIgnoreCase(email.strip()).filter(u -> u.isActive()).ifPresent(user -> {
            jdbc.queryForObject("SELECT id FROM users WHERE id = ? FOR UPDATE", UUID.class, user.getId());
            byte[] bytes = new byte[32];
            new java.security.SecureRandom().nextBytes(bytes);
            String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            jdbc.update("UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
                    Timestamp.from(clock.instant()), user.getId());
            jdbc.update("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES (?,?,?)",
                    TokenDigests.sha256(token), user.getId(), Timestamp.from(clock.instant().plusSeconds(1800)));
            mail.enqueue(user.getEmail(), "Reset your NagrikSetu password",
                    "Open this link within 30 minutes to choose a new password:\n\n"
                    + mail.publicUrl() + "/reset-password#token=" + token
                    + "\n\nIf you did not request this, ignore this email. Your password has not changed.");
        });
    }

    @Transactional
    public void reset(String token, String password) {
        PasswordPolicy.validate(password);
        String hash = TokenDigests.sha256(token);
        var ids = jdbc.queryForList("SELECT user_id FROM password_resets WHERE token_hash = ?", UUID.class, hash);
        if (ids.isEmpty()) throw invalid();
        UUID userId = ids.get(0);
        jdbc.queryForObject("SELECT id FROM users WHERE id = ? FOR UPDATE", UUID.class, userId);
        int consumed = jdbc.update("UPDATE password_resets SET used_at = ? WHERE token_hash = ? "
                + "AND used_at IS NULL AND expires_at > ?", Timestamp.from(clock.instant()), hash, Timestamp.from(clock.instant()));
        if (consumed != 1) throw invalid();
        var user = users.findById(userId).orElseThrow(PasswordRecoveryService::invalid);
        if (!user.isActive()) throw invalid();
        user.setPasswordHash(passwords.encode(password));
        users.save(user);
        jdbc.update("UPDATE refresh_sessions SET revoked = true WHERE user_id = ?", userId);
    }

    private static InvalidCredentialsException invalid() {
        return new InvalidCredentialsException("This reset link is invalid or expired. Request a new one.");
    }
}
