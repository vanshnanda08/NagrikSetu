package com.civictrack.abuse;

import com.civictrack.report.ReportRepository;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.UUID;

/** Fast local token buckets backed by durable report-history checks. */
@Service
@RequiredArgsConstructor
public class RateLimitService {

    private final ReportRepository reports;
    private final AbuseProperties properties;
    private final Clock clock;
    private record Entry(Bucket bucket, Instant expiresAt) {}
    private final java.util.Map<String, Entry> buckets = new java.util.HashMap<>();

    public void checkReport(UUID reporterId, String deviceId, String category,
                            double lat, double lng) {
        if (reporterId == null && (deviceId == null || deviceId.isBlank())) {
            throw new ReportIdentityException();
        }

        Instant now = clock.instant();
        Instant dayStart = now.truncatedTo(ChronoUnit.DAYS);
        if (reporterId != null) {
            long used = reports.countByReporterIdAndCreatedAtGreaterThanEqual(reporterId, dayStart);
            if (used >= properties.accountDailyLimit()) {
                long retry = Duration.between(now, dayStart.plus(1, ChronoUnit.DAYS)).toSeconds();
                throw new RateLimitExceededException(
                        "This account has reached its daily report limit.", retry);
            }
        }

        if (deviceId != null && !deviceId.isBlank()) {
            Instant since = now.minus(properties.nearbyWindow());
            if (reports.existsRecentNearby(deviceId, category, since, lat, lng,
                    properties.nearbyRadiusM())) {
                throw new RateLimitExceededException(
                        "A report from this device for the same category was already submitted nearby.",
                        properties.nearbyWindow().toSeconds());
            }

        }

        // ReportSubmissionService holds account/device transaction locks until
        // ingest commits. Exact geography checks therefore include the prior
        // request even across spatial cell boundaries and application replicas.
    }

    public void checkLogin(String email, String remoteAddress) {
        String identity = email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
        // Peer first: once one address is refused it must not be able to fill
        // the bounded cache by cycling through arbitrary email strings.
        consume("login-peer:" + remoteAddress, 100, properties.loginWindow(),
                "Too many sign-in attempts. Wait before trying again.");
        consume("login-account:" + identity,
                properties.loginAttempts(), properties.loginWindow(),
                "Too many sign-in attempts. Wait before trying again.");
    }

    public void checkSecurity(UUID userId) {
        consume("security:" + userId, 10, Duration.ofMinutes(15),
                "Too many security attempts. Wait before trying again.");
    }

    public void checkRegistration(String remoteAddress) {
        consume("registration-peer:" + remoteAddress, 20, Duration.ofHours(1),
                "Too many registration attempts. Wait before trying again.");
    }

    private synchronized void consume(String key, long capacity, Duration window, String message) {
        Instant now = clock.instant();
        buckets.entrySet().removeIf(e -> !e.getValue().expiresAt().isAfter(now));
        if (!buckets.containsKey(key) && buckets.size() >= 50_000) {
            throw new RateLimitExceededException("Sign-in is busy. Please retry shortly.", 60);
        }
        Entry entry = buckets.computeIfAbsent(key, ignored -> new Entry(Bucket.builder()
                .addLimit(Bandwidth.builder().capacity(capacity)
                        .refillIntervally(capacity, window).build())
                .build(), now.plus(window)));
        ConsumptionProbe probe = entry.bucket().tryConsumeAndReturnRemaining(1);
        if (!probe.isConsumed()) {
            long retry = Math.max(1,
                    Duration.ofNanos(probe.getNanosToWaitForRefill()).toSeconds());
            throw new RateLimitExceededException(message, retry);
        }
    }
}
