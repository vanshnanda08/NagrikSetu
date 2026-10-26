package com.civictrack.user.api;

import com.civictrack.user.AppUser;
import com.civictrack.user.ProfileRefusedException;
import com.civictrack.user.UserRepository;
import com.civictrack.user.auth.TokenService;
import com.civictrack.user.auth.TotpService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** MFA enrolment and server-side refresh-session control for the current user. */
@RestController
@RequestMapping("/api/v1/me/security")
@RequiredArgsConstructor
public class AccountSecurityController {
    private final TotpService totp;
    private final UserRepository users;
    private final JdbcTemplate jdbc;
    private final com.civictrack.user.auth.JwtProperties properties;
    private final java.time.Clock clock;

    @GetMapping
    @Transactional(readOnly = true)
    public SecurityStatus status(@AuthenticationPrincipal Jwt jwt) {
        AppUser user = users.findById(userId(jwt))
                .orElseThrow(() -> new ProfileRefusedException("The account no longer exists."));
        return new SecurityStatus(user.isMfaEnabled(), properties.requirePrivilegedMfa() && TotpService.required(user),
                jdbc.queryForObject("SELECT count(*) FROM mfa_recovery_codes WHERE user_id=? AND used_at IS NULL",
                        Integer.class, user.getId()));
    }

    @PostMapping("/mfa/setup")
    public TotpService.Setup setup(@Valid @RequestBody SetupRequest body, @AuthenticationPrincipal Jwt jwt) {
        return totp.begin(userId(jwt), body.currentPassword());
    }

    public record SetupRequest(@NotBlank @Size(max = 100) String currentPassword) {}
    public record Code(@NotBlank @jakarta.validation.constraints.Pattern(regexp = "[0-9]{6}") String code) {}

    @PostMapping("/mfa/enable")
    public RecoveryCodes enable(@Valid @RequestBody Code body, @AuthenticationPrincipal Jwt jwt) {
        return new RecoveryCodes(totp.enable(userId(jwt), body.code()));
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
    public record RecoveryCodes(List<String> recoveryCodes) {}
    public record SessionView(UUID familyId, Instant createdAt, Instant lastUsedAt,
                              Instant expiresAt, boolean revoked, boolean current) {}
}
