package com.civictrack.abuse;

import com.civictrack.report.ReportRepository;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RateLimitServiceTest {
    private final ReportRepository reports = mock(ReportRepository.class);
    private final AbuseProperties properties = new AbuseProperties(
            Duration.ofMinutes(5), 50, 20, 5, Duration.ofMinutes(15), Duration.ofDays(2));
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-24T10:30:00Z"), ZoneOffset.UTC);

    @Test
    void registrationIsBoundedIndependentlyOfLoginAndOtherPeers() {
        RateLimitService service = new RateLimitService(reports, properties, clock);
        for (int i = 0; i < 20; i++) service.checkRegistration("198.51.100.10");
        assertThatThrownBy(() -> service.checkRegistration("198.51.100.10"))
                .isInstanceOf(RateLimitExceededException.class);
        service.checkRegistration("198.51.100.11");
        service.checkLogin("person@example.test", "198.51.100.10");
    }

    @Test
    void committedNearbyRepeatIsRefused() {
        when(reports.existsRecentNearby(anyString(), anyString(), any(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(false, true);
        RateLimitService service = new RateLimitService(reports, properties, clock);

        service.checkReport(null, "device-1", "POTHOLE", 30.93, 75.82);

        assertThatThrownBy(() -> service.checkReport(
                null, "device-1", "POTHOLE", 30.93, 75.82))
                .isInstanceOf(RateLimitExceededException.class);
    }

    @Test
    void durableDailyCountSurvivesAProcessRestart() {
        UUID reporter = UUID.randomUUID();
        when(reports.countByReporterIdAndCreatedAtGreaterThanEqual(any(), any())).thenReturn(20L);
        RateLimitService service = new RateLimitService(reports, properties, clock);

        assertThatThrownBy(() -> service.checkReport(
                reporter, "device-2", "POTHOLE", 30.93, 75.82))
                .isInstanceOf(RateLimitExceededException.class)
                .hasMessageContaining("daily");
    }

    @Test
    void loginIsThrottledAfterFiveAttempts() {
        RateLimitService service = new RateLimitService(reports, properties, clock);
        for (int i = 0; i < 5; i++) service.checkLogin("person@example.test", "127.0.0.1");

        assertThatThrownBy(() -> service.checkLogin("person@example.test", "127.0.0.1"))
                .isInstanceOf(RateLimitExceededException.class);
    }

    @Test
    void blockedPeerCannotFillAccountBucketsWithInventedEmails() {
        RateLimitService service = new RateLimitService(reports, properties, clock);
        for (int i = 0; i < 100; i++) service.checkLogin("invented-" + i + "@example.test", "198.51.100.10");
        assertThatThrownBy(() -> service.checkLogin("blocked@example.test", "198.51.100.10"))
                .isInstanceOf(RateLimitExceededException.class);

        // The refused attempt above must not have consumed this account's
        // five-attempt allowance; a different peer receives all five.
        for (int i = 0; i < 5; i++) service.checkLogin("blocked@example.test", "198.51.100.11");
        assertThatThrownBy(() -> service.checkLogin("blocked@example.test", "198.51.100.11"))
                .isInstanceOf(RateLimitExceededException.class);
    }
}
