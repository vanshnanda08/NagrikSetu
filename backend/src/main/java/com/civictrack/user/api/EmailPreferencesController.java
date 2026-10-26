package com.civictrack.user.api;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/me/email-preferences")
@RequiredArgsConstructor
public class EmailPreferencesController {
    private final JdbcTemplate jdbc;
    public record Preferences(boolean enabled) {}
    @GetMapping public Preferences get(@AuthenticationPrincipal Jwt jwt) {
        return new Preferences(Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT email_notifications FROM users WHERE id = ?", Boolean.class, UUID.fromString(jwt.getSubject()))));
    }
    @PutMapping public Preferences put(@AuthenticationPrincipal Jwt jwt, @RequestBody Preferences preferences) {
        jdbc.update("UPDATE users SET email_notifications = ? WHERE id = ?", preferences.enabled(), UUID.fromString(jwt.getSubject()));
        return preferences;
    }
}
