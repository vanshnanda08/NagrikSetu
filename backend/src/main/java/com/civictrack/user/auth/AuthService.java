package com.civictrack.user.auth;

import com.civictrack.user.AppUser;
import com.civictrack.user.Role;
import com.civictrack.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Registration, login, and refresh.
 *
 * <p>Registration only ever creates {@link Role#CITIZEN}. Staff, supervisor and
 * administrator accounts are created by an administrator or seeded by
 * migration; a self-service endpoint that accepts a role from the request body
 * is the single most common way a demo project ships a privilege-escalation
 * bug, and the role is therefore not a parameter here at all rather than being
 * a parameter that is validated.
 */
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokens;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    private final java.time.Clock clock;
    private final TotpService totp;

    @Transactional
    public AppUser register(String email, String phone, String rawPassword, String fullName) {
        PasswordPolicy.validate(rawPassword);
        String normalised = email == null ? null : email.trim().toLowerCase(java.util.Locale.ROOT);
        if (normalised != null && users.existsByEmailIgnoreCase(normalised)) {
            throw new EmailAlreadyRegisteredException(normalised);
        }
        if (phone != null && users.existsByPhone(phone)) {
            throw new EmailAlreadyRegisteredException(phone);
        }

        AppUser user = new AppUser();
        user.setEmail(normalised);
        user.setPhone(phone);
        user.setPasswordHash(passwordEncoder.encode(rawPassword));
        user.setFullName(fullName);
        user.setRole(Role.CITIZEN);
        return users.save(user);
    }

    @Transactional
    public Authenticated login(String email, String rawPassword) {
        return login(email, rawPassword, null);
    }

    @Transactional
    public Authenticated login(String email, String rawPassword, String mfaCode) {
        var ids = jdbc.queryForList("SELECT id FROM users WHERE lower(email)=lower(?) FOR UPDATE",UUID.class,email == null ? "" : email.trim());
        if (ids.isEmpty()) throw new InvalidCredentialsException("Email or password is incorrect");
        AppUser user = users.findById(ids.get(0)).orElseThrow(() -> new InvalidCredentialsException("Email or password is incorrect"));
        verify(user, rawPassword);
        totp.verifyLogin(user, mfaCode);
        boolean mfaVerified = user.isMfaEnabled();
        return new Authenticated(user, tokens.issue(user, mfaVerified));
    }

    @Transactional(noRollbackFor = InvalidCredentialsException.class)
    public Authenticated refresh(String refreshToken) {
        UUID subject = tokens.parseRefresh(refreshToken);
        // All rotations and password changes for this account serialize on its row.
        jdbc.queryForObject("SELECT id FROM users WHERE id = ? FOR UPDATE", UUID.class, subject);
        var sessions = jdbc.queryForList("SELECT * FROM refresh_sessions WHERE token_hash = ?",
                TokenDigests.sha256(refreshToken));
        if (sessions.isEmpty()) throw new InvalidCredentialsException("The session has expired. Sign in again.");
        var session = sessions.get(0);
        UUID family = (UUID) session.get("family_id");
        if (session.get("consumed_at") != null || Boolean.TRUE.equals(session.get("revoked"))) {
            jdbc.update("UPDATE refresh_sessions SET revoked = true WHERE family_id = ?", family);
            throw new InvalidCredentialsException("This session was reused. Sign in again.");
        }
        if (((java.sql.Timestamp) session.get("expires_at")).toInstant().isBefore(clock.instant())) {
            throw new InvalidCredentialsException("The session has expired. Sign in again.");
        }
        AppUser user = users.findById(subject)
                .orElseThrow(() -> new InvalidCredentialsException("The account no longer exists"));
        if (!user.isActive()) {
            throw new InvalidCredentialsException("The account is disabled");
        }
        // Deliberately re-read rather than trusting the claims in the refresh
        // token: over thirty days a user can change department, be demoted, or
        // be deactivated, and a refreshed access token must reflect the account
        // as it is now rather than as it was when the refresh token was minted.
        boolean mfaVerified = Boolean.TRUE.equals(session.get("mfa_verified"));
        jdbc.update("UPDATE refresh_sessions SET consumed_at = ?, last_used_at = ? WHERE token_hash = ?",
                java.sql.Timestamp.from(clock.instant()), java.sql.Timestamp.from(clock.instant()),
                TokenDigests.sha256(refreshToken));
        return new Authenticated(user, tokens.issue(user, family, mfaVerified));
    }

    @Transactional
    public void logout(String refreshToken) {
        var ids = jdbc.queryForList("SELECT user_id FROM refresh_sessions WHERE token_hash=?",UUID.class,TokenDigests.sha256(refreshToken));
        if (ids.isEmpty()) return;
        jdbc.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE",UUID.class,ids.get(0));
        jdbc.update("UPDATE refresh_sessions SET revoked = true WHERE family_id IN "
                + "(SELECT family_id FROM refresh_sessions WHERE token_hash = ?)", TokenDigests.sha256(refreshToken));
    }

    private void verify(AppUser user, String rawPassword) {
        if (!user.isActive()) {
            throw new InvalidCredentialsException("Email or password is incorrect");
        }
        if (user.getPasswordHash() == null) {
            // The V4 org-chart accounts land here. A null hash must never be
            // handed to the encoder: matches(raw, null) is an implementation
            // detail of the encoder, and depending on it would make "can this
            // seeded account be logged into?" a question about BCrypt rather
            // than about our own policy.
            throw new InvalidCredentialsException("Email or password is incorrect");
        }
        if (!passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
            throw new InvalidCredentialsException("Email or password is incorrect");
        }
    }

    /** The account and the freshly minted pair, so callers need neither a second lookup nor a token parse. */
    public record Authenticated(AppUser user, TokenService.TokenPair tokens) {
    }
}
