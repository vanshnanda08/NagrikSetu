package com.civictrack.abuse;

import com.civictrack.clustering.IngestReportCommand;
import com.civictrack.report.ReportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Soft-flags suspicious evidence; it never discards a civic report. */
@Service
@RequiredArgsConstructor
public class ContentScreeningService {

    private static final Pattern PROFANITY = Pattern.compile(
            "(?i)(?<![a-z])(fuck|shit|bitch|bastard|chutiya|madarchod|bhenchod)(?![a-z])");

    private final ReportRepository reports;
    private final AbuseProperties properties;

    public Assessment assess(IngestReportCommand command, Instant submittedAt) {
        List<String> flags = new ArrayList<>();
        if (command.description() != null && PROFANITY.matcher(command.description()).find()) {
            flags.add("PROFANITY");
        }
        if (command.photoHash() != null && !command.photoHash().isBlank()
                && reports.existsByPhotoHash(command.photoHash().toLowerCase(Locale.ROOT))) {
            flags.add("REUSED_REPORT_PHOTO");
        }
        if (command.photoCapturedAt() != null) {
            Duration gap = Duration.between(command.photoCapturedAt(), submittedAt).abs();
            if (gap.compareTo(properties.exifWarningGap()) > 0) {
                flags.add("CAPTURE_TIME_GAP");
            }
        }
        return new Assessment(String.join(",", flags));
    }

    public record Assessment(String flags) {
        public boolean flagged() { return !flags.isBlank(); }

        public String primaryReason() {
            int comma = flags.indexOf(',');
            return comma < 0 ? flags : flags.substring(0, comma);
        }
    }
}
