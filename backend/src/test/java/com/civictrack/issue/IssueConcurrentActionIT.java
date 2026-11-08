package com.civictrack.issue;

import com.civictrack.IntegrationTestBase;
import com.civictrack.support.Fixtures;
import com.civictrack.support.MutableClock;
import com.civictrack.user.Actor;
import com.civictrack.user.AppUser;
import com.civictrack.user.Role;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import javax.sql.DataSource;
import java.sql.Connection;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** MockMvc controller integration with real competing transactions and a database gate. */
@AutoConfigureMockMvc
class IssueConcurrentActionIT extends IntegrationTestBase {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired Fixtures fixtures;
    @Autowired MutableClock clock;
    @Autowired IssueRepository issues;
    @Autowired IssueLifecycleService lifecycle;
    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;

    private final Instant now = Instant.parse("2026-03-01T09:00:00Z");
    private AppUser supervisor;
    private AppUser crewA;
    private AppUser crewB;
    private AppUser citizen;
    private String bearer;

    @BeforeEach
    void setUp() {
        fixtures.clearIssues();
        clock.set(now);
        UUID roads = fixtures.departmentId("ROADS");
        supervisor = fixtures.user(Role.SUPERVISOR, roads, null);
        crewA = fixtures.user(Role.STAFF, roads, null);
        crewB = fixtures.user(Role.STAFF, roads, null);
        citizen = fixtures.user(Role.CITIZEN, null, null);
        bearer = fixtures.bearer(supervisor);
    }

    @AfterEach
    void restoreClock() {
        clock.reset();
    }

    @Test
    void concurrentAcknowledgementsReturnOneSuccessAndOneReloadableConflict() throws Exception {
        Issue issue = newIssue();

        Race result = race(issue.getId(), "acknowledge",
                Map.of("note", "First supervisor acknowledgement"),
                Map.of("note", "Second supervisor acknowledgement"));

        assertConflict(result);
        Issue after = issues.findById(issue.getId()).orElseThrow();
        assertThat(after.getStatus()).isEqualTo(IssueStatus.ACKNOWLEDGED);
        assertThat(after.getAcknowledgedAt()).isEqualTo(now);
        assertSingleHistory(issue.getId(), IssueStatus.ACKNOWLEDGED, result.winnerBody().get("note"));
        assertThat(notificationCount(issue.getId())).isZero();
    }

    @Test
    void concurrentAssignmentsKeepOnlyTheWinningAssigneeAndHistory() throws Exception {
        Issue issue = newIssue();
        lifecycle.acknowledge(issue.getId(), actor(), "Acknowledged before assignment race");

        Race result = race(issue.getId(), "assign",
                Map.of("assigneeId", crewA.getId(), "note", "First eligible crew assignment"),
                Map.of("assigneeId", crewB.getId(), "note", "Second eligible crew assignment"));

        assertConflict(result);
        Issue after = issues.findById(issue.getId()).orElseThrow();
        assertThat(after.getStatus()).isEqualTo(IssueStatus.ASSIGNED);
        assertThat(after.getAssignedTo()).isEqualTo(result.winnerBody().get("assigneeId"));
        assertThat(json.readTree(result.winner().getResponse().getContentAsString()).get("assignedTo").asText())
                .isEqualTo(after.getAssignedTo().toString());
        assertSingleHistory(issue.getId(), IssueStatus.ASSIGNED, result.winnerBody().get("note"));
        assertThat(notificationCount(issue.getId())).isZero();
    }

    @Test
    void concurrentRepairClaimsRollBackTheLosingRoundHistoryAndNotification() throws Exception {
        Issue issue = newIssue();
        lifecycle.acknowledge(issue.getId(), actor(), "Acknowledged before proof race");
        lifecycle.assign(issue.getId(), actor(), crewA.getId(), "Assigned before proof race");
        lifecycle.start(issue.getId(), actor(), "Started before proof race");

        Race result = race(issue.getId(), "submit-for-verification",
                Map.of("proofPhotoUrl", "https://example.test/concurrent-repair-a.jpg",
                        "note", "First repair proof submitted for citizen review."),
                Map.of("proofPhotoUrl", "https://example.test/concurrent-repair-b.jpg",
                        "note", "Second repair proof submitted for citizen review."));

        assertConflict(result);
        Issue after = issues.findById(issue.getId()).orElseThrow();
        assertThat(after.getStatus()).isEqualTo(IssueStatus.PENDING_VERIFICATION);
        assertThat(after.getVerificationRound()).isEqualTo(1);
        assertThat(after.getResolutionPhotoUrl()).isEqualTo(result.winnerBody().get("proofPhotoUrl"));
        assertThat(after.getResolutionNote()).isEqualTo(result.winnerBody().get("note"));
        assertSingleHistory(issue.getId(), IssueStatus.PENDING_VERIFICATION, result.winnerBody().get("note"));
        assertThat(notificationCount(issue.getId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM notifications
                WHERE issue_id=? AND user_id=? AND type='VERIFY_REQUESTED'
                """, Integer.class, issue.getId(), citizen.getId())).isEqualTo(1);
    }

    private Issue newIssue() {
        Issue issue = fixtures.issue("POTHOLE", now.minusSeconds(3600), now.plusSeconds(86400));
        fixtures.report(issue.getId(), citizen.getId());
        return issue;
    }

    private Actor actor() {
        return new Actor(supervisor.getId(), supervisor.getRole(), supervisor.getDepartmentId(), null);
    }

    private Race race(UUID issueId, String action, Map<String, Object> first,
                      Map<String, Object> second) throws Exception {
        try (var pool = Executors.newFixedThreadPool(2); Connection gate = dataSource.getConnection()) {
            gate.setAutoCommit(false);
            // NO KEY UPDATE still permits history/notification foreign-key checks;
            // the requests block specifically on the versioned issue UPDATE.
            try (var lock = gate.prepareStatement("SELECT id FROM issues WHERE id=? FOR NO KEY UPDATE")) {
                lock.setObject(1, issueId);
                try (var row = lock.executeQuery()) {
                    assertThat(row.next()).isTrue();
                }
            }

            List<Map<String, Object>> bodies = List.of(first, second);
            List<Future<MvcResult>> requests = bodies.stream().map(body -> pool.submit(() ->
                    mvc.perform(post("/api/v1/issues/{id}/{action}", issueId, action)
                                    .header("Authorization", bearer)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(json.writeValueAsString(body)))
                            .andReturn())).toList();
            try {
                // Both real request transactions must have read the old version and
                // reached their UPDATE before either is allowed to commit. This also
                // fails clearly if a future implementation serializes the read instead.
                // Testcontainers runs this PostGIS image under emulation on ARM;
                // a busy full suite can spend several seconds in the first read.
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(45);
                int waiting;
                do {
                    waiting = jdbc.queryForObject("""
                            SELECT count(*) FROM pg_stat_activity
                            WHERE datname=current_database() AND wait_event_type='Lock'
                              AND lower(query) LIKE 'update issues %'
                            """, Integer.class);
                    if (waiting >= 2) break;
                    Thread.sleep(100);
                } while (System.nanoTime() < deadline);
                assertThat(waiting).as("two stale request transactions reached their versioned UPDATE; requests: %s",
                        requestStates(requests)).isEqualTo(2);
            } finally {
                gate.commit();
            }

            List<MvcResult> responses = List.of(requests.get(0).get(30, TimeUnit.SECONDS),
                    requests.get(1).get(30, TimeUnit.SECONDS));
            assertThat(responses.stream().map(r -> r.getResponse().getStatus()).toList())
                    .containsExactlyInAnyOrder(200, 409);
            int winningIndex = responses.get(0).getResponse().getStatus() == 200 ? 0 : 1;
            return new Race(responses.get(winningIndex), responses.get(1 - winningIndex), bodies.get(winningIndex));
        }
    }

    private List<String> requestStates(List<Future<MvcResult>> requests) throws Exception {
        List<String> states = new ArrayList<>();
        for (Future<MvcResult> request : requests) {
            states.add(request.isDone() ? "HTTP " + request.get().getResponse().getStatus() : "waiting");
        }
        return states;
    }

    private void assertConflict(Race race) throws Exception {
        JsonNode problem = json.readTree(race.conflict().getResponse().getContentAsString());
        assertThat(problem.get("status").asInt()).isEqualTo(409);
        assertThat(problem.get("type").asText()).isEqualTo("https://civictrack.example/problems/concurrent-update");
        assertThat(problem.get("title").asText()).isEqualTo("Complaint changed");
        assertThat(problem.get("detail").asText()).contains("Reload", "review the latest details")
                .doesNotContain("Exception", "Hibernate", "version");
    }

    private void assertSingleHistory(UUID issueId, IssueStatus target, Object winnerNote) {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM issue_status_history WHERE issue_id=? AND to_status=?",
                Integer.class, issueId, target.name())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT note FROM issue_status_history WHERE issue_id=? AND to_status=?",
                String.class, issueId, target.name())).isEqualTo(winnerNote);
    }

    private int notificationCount(UUID issueId) {
        return jdbc.queryForObject("SELECT count(*) FROM notifications WHERE issue_id=?", Integer.class, issueId);
    }

    private record Race(MvcResult winner, MvcResult conflict, Map<String, Object> winnerBody) {}
}
