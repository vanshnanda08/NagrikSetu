package com.civictrack.issue;

import com.civictrack.IntegrationTestBase;
import com.civictrack.issue.policy.TransitionContext;
import com.civictrack.support.Fixtures;
import com.civictrack.support.MutableClock;
import com.civictrack.user.AppUser;
import com.civictrack.user.Actor;
import com.civictrack.user.Role;
import com.civictrack.issue.policy.VerificationTally;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class AdminClosureIT extends IntegrationTestBase {
    @Autowired MockMvc mvc;
    @Autowired Fixtures fixtures;
    @Autowired IssueRepository issues;
    @Autowired IssueLifecycleService lifecycle;
    @Autowired IssueStatusService statuses;
    @Autowired MutableClock clock;
    @Autowired TransactionTemplate tx;
    @Autowired JdbcTemplate jdbc;
    @Autowired com.civictrack.verification.VerificationService verification;
    @Autowired com.civictrack.verification.VerificationViewService verificationViews;
    AppUser admin, crew, supervisor, citizen;
    final Instant now = Instant.parse("2026-03-01T09:00:00Z");
    final String reason = "Reviewed the repair evidence and verification outcome; closing this resolved complaint.";

    @BeforeEach void setup() {
        fixtures.clearIssues(); clock.set(now);
        admin = fixtures.user(Role.ADMIN, null, null);
        crew = fixtures.user(Role.STAFF, fixtures.departmentId("ROADS"), null);
        supervisor = fixtures.user(Role.SUPERVISOR, fixtures.departmentId("ROADS"), null);
        citizen = fixtures.user(Role.CITIZEN, null, null);
    }
    @AfterEach void restoreClock() { clock.reset(); }

    Issue resolved() {
        Issue issue = fixtures.issue("POTHOLE", now.minusSeconds(3600), now.plusSeconds(86400));
        fixtures.report(issue.getId(), citizen.getId());
        Actor boss = new Actor(admin.getId(), Role.ADMIN, null, null);
        Actor worker = new Actor(crew.getId(), Role.STAFF, crew.getDepartmentId(), null);
        lifecycle.acknowledge(issue.getId(), boss, "Acknowledged for the closure test");
        lifecycle.assign(issue.getId(), boss, crew.getId(), "Assigned for the closure test");
        lifecycle.start(issue.getId(), worker, "Repair started");
        lifecycle.submitForVerification(issue.getId(), worker, "https://example.test/verified-repair.jpg", "Filled and compacted the damaged surface.");
        tx.executeWithoutResult(s -> statuses.systemTransition(issues.findById(issue.getId()).orElseThrow(), IssueStatus.RESOLVED,
                TransitionContext.at(now).tally(new VerificationTally(3, 3, 0, true)).build()));
        return issues.findById(issue.getId()).orElseThrow();
    }
    org.springframework.test.web.servlet.ResultActions close(UUID id, AppUser who, String note) throws Exception {
        return mvc.perform(post("/api/v1/issues/{id}/close", id).header("Authorization", fixtures.bearer(who))
                .contentType(MediaType.APPLICATION_JSON).content(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(java.util.Map.of("note", note))));
    }

    @Test void closesResolvedEarlyAndPreservesEvidenceAndAuditsActor() throws Exception {
        Issue issue = resolved();
        close(issue.getId(), admin, reason).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CLOSED"));
        Issue after = issues.findById(issue.getId()).orElseThrow();
        assertThat(after.getClosedAt()).isEqualTo(now);
        assertThat(after.getResolvedAt()).isEqualTo(issue.getResolvedAt());
        assertThat(after.getResolutionPhotoUrl()).isEqualTo(issue.getResolutionPhotoUrl());
        assertThat(after.isResolvedWithoutVerification()).isEqualTo(issue.isResolvedWithoutVerification());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reports WHERE issue_id=?", Integer.class, issue.getId())).isEqualTo(1);
        var history = jdbc.queryForMap("SELECT actor_id,actor_role,note FROM issue_status_history WHERE issue_id=? AND to_status='CLOSED'", issue.getId());
        assertThat(history.get("actor_id")).isEqualTo(admin.getId());
        assertThat(history.get("actor_role")).isEqualTo("ADMIN");
        assertThat(history.get("note")).isEqualTo(reason);
        mvc.perform(get("/api/v1/admin/audit.csv").param("issueRef", issue.getPublicRef()).header("Authorization", fixtures.bearer(admin)))
                .andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.containsString(reason)));
    }
    @Test void closureIsAdministratorOnly() throws Exception {
        Issue issue = resolved();
        mvc.perform(post("/api/v1/issues/{id}/close", issue.getId()).contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"A sufficiently long closure reason\"}"))
                .andExpect(status().isUnauthorized());
        for (var who : new AppUser[]{crew, supervisor, citizen}) close(issue.getId(), who, reason).andExpect(status().isForbidden());
        assertThat(issues.findById(issue.getId()).orElseThrow().getStatus()).isEqualTo(IssueStatus.RESOLVED);
    }
    @ParameterizedTest @EnumSource(value = IssueStatus.class, names = {"CLOSED", "REJECTED"})
    void terminalStatesCannotBeManuallyClosed(IssueStatus state) throws Exception {
        Issue issue = fixtures.issue("POTHOLE", now, now.plusSeconds(86400));
        issue.setStatus(state); issues.saveAndFlush(issue);
        close(issue.getId(), admin, reason).andExpect(status().isConflict());
        assertThat(issues.findById(issue.getId()).orElseThrow().getStatus()).isEqualTo(state);
    }
    @ParameterizedTest @EnumSource(value = IssueStatus.class, names = {"RESOLVED", "CLOSED", "REJECTED"}, mode = EnumSource.Mode.EXCLUDE)
    void administratorCanEndUnresolvedWorkWithoutClaimingARepair(IssueStatus state) throws Exception {
        Issue issue = fixtures.issue("POTHOLE", now, now.plusSeconds(86400));
        issue.setStatus(state); issues.saveAndFlush(issue);
        fixtures.report(issue.getId(), citizen.getId());
        String explanation = "Closing administratively because this site is outside municipal jurisdiction.";
        close(issue.getId(), admin, explanation).andExpect(status().isOk());
        Issue after = issues.findById(issue.getId()).orElseThrow();
        assertThat(after.getStatus()).isEqualTo(IssueStatus.CLOSED);
        assertThat(after.getClosedAt()).isEqualTo(now);
        assertThat(after.getResolvedAt()).isNull();
        assertThat(after.getResolutionPhotoUrl()).isNull();
        assertThat(issues.countResolved()).isZero();
        assertThat(issues.countClosedWithoutResolution()).isEqualTo(1);
        var notification = jdbc.queryForMap("SELECT type,body FROM notifications WHERE issue_id=? AND type='CLOSED'", issue.getId());
        assertThat(notification.get("body").toString()).contains(explanation, "not a verified repair");
        var history = jdbc.queryForMap("SELECT from_status, actor_role,note FROM issue_status_history WHERE issue_id=? AND to_status='CLOSED'", issue.getId());
        assertThat(history.get("from_status")).isEqualTo(state.name());
        assertThat(history.get("actor_role")).isEqualTo("ADMIN");
        assertThat(history.get("note")).isEqualTo(explanation);
    }
    @Test void earlyClosureIsExcludedFromSuccessMetricsAndPendingVerification() throws Exception {
        Issue verified = resolved();
        Issue pending = fixtures.issue("POTHOLE", now.minusSeconds(3600), now.plusSeconds(86400));
        fixtures.report(pending.getId(), citizen.getId());
        Actor boss = new Actor(admin.getId(), Role.ADMIN, null, null);
        Actor worker = new Actor(crew.getId(), Role.STAFF, crew.getDepartmentId(), null);
        lifecycle.acknowledge(pending.getId(), boss, "Acknowledged for an evidence check");
        lifecycle.assign(pending.getId(), boss, crew.getId(), "Assigned for an evidence check");
        lifecycle.start(pending.getId(), worker, "Work has started");
        lifecycle.submitForVerification(pending.getId(), worker, "https://example.test/unconfirmed.jpg", "Repair evidence awaiting the citizen verdict.");
        close(pending.getId(), admin, "Closed administratively before verification; site ownership requires a different authority.").andExpect(status().isOk());
        assertThat(issues.findById(pending.getId()).orElseThrow().getResolutionPhotoUrl()).endsWith("unconfirmed.jpg");
        mvc.perform(get("/api/v1/dashboard/summary")).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalResolved").value(1)).andExpect(jsonPath("$.closedWithoutResolution").value(1));
        mvc.perform(get("/api/v1/dashboard/metrics")).andExpect(status().isOk())
                .andExpect(jsonPath("$.slaCompliance.resolved").value(1));
        mvc.perform(get("/api/v1/dashboard/wards/{id}", pending.getWardId())).andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics.resolvedCount").value(1)).andExpect(jsonPath("$.metrics.slaOnTime").value(1))
                .andExpect(jsonPath("$.metrics.closedWithoutResolution").value(1));
        mvc.perform(get("/api/v1/supervisor/analytics").param("departmentId", pending.getDepartmentId().toString()).header("Authorization", fixtures.bearer(admin)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.metrics.resolvedCount").value(1))
                .andExpect(jsonPath("$.staff[0].resolved").value(1));
        assertThat(verification.settleTimedOut(pending.getId())).isEqualTo(com.civictrack.verification.VerificationService.SettleOutcome.ALREADY_SETTLED);
        assertThat(verification.autoClose(pending.getId())).isFalse();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> verification.vote(pending.getId(), new Actor(citizen.getId(), Role.CITIZEN, null, null), com.civictrack.verification.Verdict.FIXED, null))
                .isInstanceOf(com.civictrack.verification.VerificationNotOpenException.class);
        assertThat(verificationViews.awaiting(new Actor(citizen.getId(), Role.CITIZEN, null, null))).isEmpty();
        close(verified.getId(), admin, reason).andExpect(status().isOk());
        assertThat(issues.countResolved()).isEqualTo(1);
        assertThat(issues.countClosedWithoutResolution()).isEqualTo(1);
    }
    @Test void closureNotifiesReportersAndFollowersOnceAndHonoursPreferences() throws Exception {
        Issue issue = fixtures.issue("POTHOLE", now, now.plusSeconds(86400));
        AppUser follower = fixtures.user(Role.CITIZEN, null, null);
        AppUser muted = fixtures.user(Role.CITIZEN, null, null);
        fixtures.report(issue.getId(), citizen.getId());
        for (var who : new AppUser[]{citizen, follower, muted}) {
            jdbc.update("INSERT INTO issue_followers(issue_id,user_id) VALUES (?,?)", issue.getId(), who.getId());
        }
        jdbc.update("UPDATE users SET muted_notification_types='CLOSED' WHERE id=?", muted.getId());
        close(issue.getId(), admin, "  Administrative closure: this location belongs to a different authority.  ").andExpect(status().isOk());
        assertThat(jdbc.queryForList("SELECT user_id FROM notifications WHERE issue_id=? AND type='CLOSED'", UUID.class, issue.getId()))
                .containsExactlyInAnyOrder(citizen.getId(), follower.getId());
        mvc.perform(get("/api/v1/public/issues/{id}/history", issue.getId())).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].note").value("Administrative closure: this location belongs to a different authority."));
    }
    @Test void reasonIsRequiredAndWhitespaceCannotBypassMinimum() throws Exception {
        Issue issue = resolved();
        close(issue.getId(), admin, "done").andExpect(status().isBadRequest());
        close(issue.getId(), admin, " ".repeat(30)).andExpect(status().isBadRequest());
        close(issue.getId(), admin, "x".repeat(2001)).andExpect(status().isBadRequest());
        close(issue.getId(), admin, "     done               ").andExpect(status().isConflict());
        assertThat(issues.findById(issue.getId()).orElseThrow().getStatus()).isEqualTo(IssueStatus.RESOLVED);
    }
    @Test void repeatClosureDoesNotDuplicateHistory() throws Exception {
        Issue issue = resolved(); close(issue.getId(), admin, reason).andExpect(status().isOk());
        close(issue.getId(), admin, reason).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM issue_status_history WHERE issue_id=? AND to_status='CLOSED'", Integer.class, issue.getId())).isEqualTo(1);
    }
    @Test void readyToCloseQueueIsScopedAndRemovesClosedComplaints() throws Exception {
        Issue issue = resolved();
        mvc.perform(get("/api/v1/supervisor/queue").param("tab", "ready_to_close").header("Authorization", fixtures.bearer(admin)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].row.id").value(issue.getId().toString()));
        for (var who : new AppUser[]{crew, supervisor}) mvc.perform(get("/api/v1/staff/queue").param("tab", "ready_to_close").header("Authorization", fixtures.bearer(who))).andExpect(status().isForbidden());
        close(issue.getId(), admin, reason).andExpect(status().isOk());
        mvc.perform(get("/api/v1/supervisor/queue").param("tab", "ready_to_close").header("Authorization", fixtures.bearer(admin)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }
    @Test void missingComplaintReturnsNotFound() throws Exception { close(UUID.randomUUID(), admin, reason).andExpect(status().isNotFound()); }
}
