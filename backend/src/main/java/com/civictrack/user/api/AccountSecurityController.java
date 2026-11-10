package com.civictrack.user.api;

import com.civictrack.user.ProfileRefusedException;
import com.civictrack.user.UserRepository;
import com.civictrack.user.auth.TokenService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Password-authenticated account status and refresh-session control. */
@RestController
@RequestMapping("/api/v1/me/security")
@RequiredArgsConstructor
public class AccountSecurityController {
    private final UserRepository users;
    private final JdbcTemplate jdbc;
    private final java.time.Clock clock;

    @GetMapping
    @Transactional(readOnly = true)
    public SecurityStatus status(@AuthenticationPrincipal Jwt jwt) {
        if (!users.existsById(userId(jwt))) {
            throw new ProfileRefusedException("The account no longer exists.");
        }
        // Compatibility projection for cached clients. No enrollment data is read.
        return new SecurityStatus(false, false, 0);
    }

    @PostMapping({"/mfa/setup", "/mfa/enable"})
    public void retiredAuthenticator() {
        throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.GONE,
                "Authenticator support has been removed. Sign in with your account password.");
    }

    @GetMapping("/sessions")
    @Transactional(readOnly = true)
    public List<SessionView> sessions(@AuthenticationPrincipal Jwt jwt) {
        UUID current = currentSession(jwt);
        return jdbc.query("""
                SELECT family_id, min(created_at) created_at, max(last_used_at) last_used_at,
                       max(expires_at) expires_at, bool_and(revoked) revoked
                FROM refresh_sessions WHERE user_id=? GROUP BY family_id
                HAVING max(expires_at) > ?
                ORDER BY max(last_used_at) DESC
                """, (rs, row) -> new SessionView(
                rs.getObject("family_id", UUID.class),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("last_used_at").toInstant(),
                rs.getTimestamp("expires_at").toInstant(),
                rs.getBoolean("revoked"),
                current != null && current.equals(rs.getObject("family_id", UUID.class))), userId(jwt),
                java.sql.Timestamp.from(clock.instant()));
    }

    @DeleteMapping("/sessions/{familyId}")
    @Transactional
    public Map<String, Boolean> revoke(@PathVariable UUID familyId, @AuthenticationPrincipal Jwt jwt) {
        lockAccount(jwt);
        int changed = jdbc.update("UPDATE refresh_sessions SET revoked=true WHERE user_id=? AND family_id=? AND revoked=false",
                userId(jwt), familyId);
        return Map.of("revoked", changed > 0);
    }

    @PostMapping("/sessions/revoke-others")
    @Transactional
    public Map<String, Integer> revokeOthers(@AuthenticationPrincipal Jwt jwt) {
        lockAccount(jwt);
        UUID current = currentSession(jwt);
        int changed = current == null
                ? jdbc.update("UPDATE refresh_sessions SET revoked=true WHERE user_id=? AND revoked=false", userId(jwt))
                : jdbc.update("UPDATE refresh_sessions SET revoked=true WHERE user_id=? AND family_id<>? AND revoked=false",
                        userId(jwt), current);
        return Map.of("revoked", changed);
    }

    private static UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }

    private void lockAccount(Jwt jwt) {
        // Use the same lock as login/rotation so an in-flight refresh cannot
        // insert an unrevoked replacement after the family was signed out.
        jdbc.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE", UUID.class, userId(jwt));
    }

    private static UUID currentSession(Jwt jwt) {
        String claim = jwt.getClaimAsString(TokenService.CLAIM_SESSION);
        return claim == null ? null : UUID.fromString(claim);
    }

    public record SecurityStatus(boolean mfaEnabled, boolean mfaRequired, int recoveryCodesRemaining) {}
    public record SessionView(UUID familyId, Instant createdAt, Instant lastUsedAt,
                              Instant expiresAt, boolean revoked, boolean current) {}
}
