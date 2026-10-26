package com.civictrack.abuse;

import com.civictrack.clustering.IngestReportCommand;
import com.civictrack.report.ReportRepository;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ContentScreeningServiceTest {
    private final ReportRepository reports = mock(ReportRepository.class);
    private final AbuseProperties properties = new AbuseProperties(
            Duration.ofMinutes(5), 50, 20, 5, Duration.ofMinutes(15), Duration.ofDays(2));
    private final ContentScreeningService service = new ContentScreeningService(reports, properties);

    @Test
    void profanityReusedPhotoAndOldCaptureAreAllRetainedAsFlags() {
        when(reports.existsByPhotoHash("0123456789abcdef")).thenReturn(true);
        IngestReportCommand command = new IngestReportCommand(
                "POTHOLE", 30.93, 75.82, 8, false,
                "This shit is dangerous", null, null, "https://example.test/photo.jpg",
                "0123456789abcdef", Instant.parse("2026-10-01T00:00:00Z"),
                null, "device-1");

        ContentScreeningService.Assessment result = service.assess(
                command, Instant.parse("2026-10-24T00:00:00Z"));

        assertThat(result.flags()).contains("PROFANITY", "REUSED_REPORT_PHOTO", "CAPTURE_TIME_GAP");
    }

    @Test
    void ordinaryEvidenceIsNotFlagged() {
        IngestReportCommand command = new IngestReportCommand(
                "POTHOLE", 30.93, 75.82, 8, false,
                "Deep pothole beside the bus stop", null, null,
                "https://example.test/photo.jpg", "fedcba9876543210",
                Instant.parse("2026-10-24T09:00:00Z"), null, "device-2");

        assertThat(service.assess(command, Instant.parse("2026-10-24T10:00:00Z")).flagged())
                .isFalse();
    }
}
