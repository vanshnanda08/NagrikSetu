package com.civictrack.user.auth;

import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** BCrypt limits bytes, not Java characters; reject rather than truncate. */
public final class PasswordPolicy {
    private PasswordPolicy() {}

    public static void validate(String password) {
        if (password == null || password.isBlank() || password.length() < 10
                || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Use at least 10 characters and at most 72 UTF-8 bytes for your password.");
        }
    }
}
