package com.civictrack.abuse;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/** Tunable anti-abuse thresholds. None of these are category policy. */
@ConfigurationProperties(prefix = "civictrack.abuse")
public record AbuseProperties(
        @DefaultValue("PT5M") Duration nearbyWindow,
        @DefaultValue("50") double nearbyRadiusM,
        @DefaultValue("20") int accountDailyLimit,
        @DefaultValue("5") int loginAttempts,
        @DefaultValue("PT15M") Duration loginWindow,
        @DefaultValue("P2D") Duration exifWarningGap) {
}
