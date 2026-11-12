package com.civictrack.user.auth;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.Set;

/** A deploy profile must never silently trust a development or fixture key. */
@Component
@Profile("deploy")
public final class DeploySigningKeyGuard {
    private static final Set<String> PUBLIC_DEFAULTS = Set.of(
            "dev-only-secret-change-me-in-every-real-deployment",
            "test-only-signing-secret-at-least-32-bytes-long",
            "seed-run-only-not-a-real-secret-do-not-deploy-this-value");

    public DeploySigningKeyGuard(JwtProperties properties) {
        String secret = properties.secret();
        if (secret == null || secret.isBlank() || PUBLIC_DEFAULTS.contains(secret.strip())) {
            // Never include the supplied key in an exception or startup log.
            throw new IllegalStateException(
                    "The deploy profile requires a private JWT signing key. "
                    + "Set JWT_SECRET to a generated value of at least 32 bytes; "
                    + "development, test and seed defaults are not allowed.");
        }
        TokenService.secretKey(properties); // Share the actual encoder/decoder byte-length rule.
    }
}
