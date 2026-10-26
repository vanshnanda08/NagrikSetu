package com.civictrack.report;

import com.civictrack.abuse.RateLimitService;
import com.civictrack.clustering.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Serializes a reporter's allowance with the insert, never with photo upload. */
@Service
@RequiredArgsConstructor
public class ReportSubmissionService {
    private final JdbcTemplate jdbc;
    private final RateLimitService limits;
    private final ClusteringService clustering;
    private final com.fasterxml.jackson.databind.ObjectMapper json;

    @Transactional
    public ClusterOutcome submit(IngestReportCommand command) {
        return submit(command, null);
    }

    @Transactional
    public ClusterOutcome submit(IngestReportCommand command, java.util.UUID submissionId) {
        // Stable order: account before device; all locks precede clustering locks.
        if (command.reporterId() != null) lock("report-account:" + command.reporterId());
        if (command.deviceId() != null) lock("report-device:" + command.deviceId());
        String key = submissionId == null ? null : (command.reporterId() == null ? "device:" + command.deviceId() : "user:" + command.reporterId()) + ":" + submissionId;
        String digest = com.civictrack.user.auth.TokenDigests.sha256(write(command));
        if (key != null) {
            lock("submission:" + key);
            var previous = jdbc.queryForList("SELECT payload_hash,result::text FROM report_submissions WHERE submission_key=?",key);
            if (!previous.isEmpty()) {
                if (!digest.equals(previous.get(0).get("payload_hash"))) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"This submission ID was already used for a different report.");
                try { return json.readValue((String)previous.get(0).get("result"),ClusterOutcome.class); }
                catch (com.fasterxml.jackson.core.JsonProcessingException e) { throw new IllegalStateException(e); }
            }
        }
        limits.checkReport(command.reporterId(), command.deviceId(), command.categoryCode(), command.lat(), command.lng());
        ClusterOutcome result = clustering.ingest(command);
        if (key != null) jdbc.update("INSERT INTO report_submissions(submission_key,payload_hash,result) VALUES(?,?,?::jsonb)",key,digest,write(result));
        return result;
    }

    private String write(Object value) {
        try { return json.writeValueAsString(value); }
        catch (com.fasterxml.jackson.core.JsonProcessingException e) { throw new IllegalStateException(e); }
    }

    private void lock(String key) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", rs -> {}, key);
    }
}
