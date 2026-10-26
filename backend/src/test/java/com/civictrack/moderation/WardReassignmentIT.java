package com.civictrack.moderation;

import com.civictrack.IntegrationTestBase;
import com.civictrack.clustering.ClusteringService;
import com.civictrack.clustering.IngestReportCommand;
import com.civictrack.issue.Issue;
import com.civictrack.issue.IssueRepository;
import com.civictrack.support.Fixtures;
import com.civictrack.support.MutableClock;
import com.civictrack.user.AppUser;
import com.civictrack.user.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Reassign ward (blueprint 3.19): the ward guard, the log, the recomputation,
 * and the way it unblocks a cross-ward merge.
 *
 * <p>The seeded wards are a 2x2 grid with the ward 1 / ward 2 boundary at
 * longitude 75.86. A report at 75.8590 is in ward 1 and about 95 m from ward 2;
 * a report in the middle of ward 1 is more than 3 km from ward 4.
 */
@AutoConfigureMockMvc
class WardReassignmentIT extends IntegrationTestBase {

    private static final double LAT = 30.93;
    private static final double LNG_NEAR_BOUNDARY = 75.8590;

    @Autowired private MockMvc mvc;
    @Autowired private ClusteringService clustering;
    @Autowired private IssueRepository issues;
    @Autowired private Fixtures fixtures;
    @Autowired private MutableClock clock;
    @Autowired private JdbcTemplate jdbc;

    private AppUser roadsHead;

    @BeforeEach
    void setUp() {
        fixtures.clearIssues();
        clock.set(Instant.now());
        roadsHead = fixtures.user(Role.SUPERVISOR, fixtures.departmentId("ROADS"), null);
    }

    @Test
    @DisplayName("an issue near a boundary can move to the neighbouring ward; the move is logged and rescored")
    void reassignsWithinTheGuard() throws Exception {
        UUID issueId = ingest(LAT, LNG_NEAR_BOUNDARY);
        UUID ward1 = fixtures.wardId(1);
        UUID ward2 = fixtures.wardId(2);
        assertThat(issues.findById(issueId).orElseThrow().getWardId()).isEqualTo(ward1);

        mvc.perform(get("/api/v1/supervisor/issues/{id}/ward-options", issueId)
                        .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(roadsHead)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].wardNumber").value(1))
                .andExpect(jsonPath("$[0].current").value(true))
                .andExpect(jsonPath("$[1].wardNumber").value(2))
                .andExpect(jsonPath("$[1].allowed").value(true))
                .andExpect(jsonPath("$[?(@.wardNumber == 4)].allowed").value(false));

        reassign(roadsHead, issueId, ward2, "Pin fell on the wrong side of the road")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issueId").value(issueId.toString()));

        Issue after = issues.findById(issueId).orElseThrow();
        assertThat(after.getWardId()).isEqualTo(ward2);
        // The reports keep their own coordinates and their place in the issue.
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reports WHERE issue_id = ?", Integer.class, issueId))
                .isEqualTo(1);

        String detail = jdbc.queryForObject(
                "SELECT detail::text FROM moderation_actions WHERE action = 'REASSIGN_WARD' AND issue_id = ?",
                String.class, issueId);
        assertThat(detail).contains("Ward 1").contains("Ward 2").contains("distanceToTargetM");
        assertThat(jdbc.queryForObject("SELECT note FROM moderation_actions WHERE action = 'REASSIGN_WARD'",
                String.class)).isEqualTo("Pin fell on the wrong side of the road");
    }

    @Test
    @DisplayName("the ward guard refuses a ward the problem is nowhere near, and a no-op move")
    void guardRefusals() throws Exception {
        UUID inland = ingest(LAT, 75.8200);
        reassign(roadsHead, inland, fixtures.wardId(4), null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://civictrack.example/problems/moderation-refused"))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("boundary")));
        reassign(roadsHead, inland, fixtures.wardId(1), null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("already in")));
        reassign(roadsHead, inland, UUID.randomUUID(), null).andExpect(status().isConflict());

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM moderation_actions WHERE action = 'REASSIGN_WARD'",
                Integer.class)).isZero();
        assertThat(issues.findById(inland).orElseThrow().getWardId()).isEqualTo(fixtures.wardId(1));
    }

    @Test
    @DisplayName("an issue awaiting verification cannot be moved, and a supervisor of another department cannot")
    void statusAndScope() throws Exception {
        UUID issueId = ingest(LAT, LNG_NEAR_BOUNDARY);
        AppUser waterHead = fixtures.user(Role.SUPERVISOR, fixtures.departmentId("WATER"), null);
        reassign(waterHead, issueId, fixtures.wardId(2), null).andExpect(status().isForbidden());

        jdbc.update("UPDATE issues SET status = 'PENDING_VERIFICATION' WHERE id = ?", issueId);
        reassign(roadsHead, issueId, fixtures.wardId(2), null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("verify")));
    }

    @Test
    @DisplayName("reassigning one of two issues makes the cross-ward merge possible")
    void reassignThenMerge() throws Exception {
        UUID inWard1 = ingest(LAT, LNG_NEAR_BOUNDARY);
        UUID inWard2 = ingest(LAT, 75.8612);
        assertThat(issues.findById(inWard2).orElseThrow().getWardId()).isEqualTo(fixtures.wardId(2));

        merge(roadsHead, inWard2, inWard1).andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("different wards")));

        reassign(roadsHead, inWard1, fixtures.wardId(2), null).andExpect(status().isOk());
        merge(roadsHead, inWard2, inWard1).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reports WHERE issue_id = ?", Integer.class, inWard2))
                .isEqualTo(2);
    }

    private UUID ingest(double lat, double lng) {
        return clustering.ingest(new IngestReportCommand("POTHOLE", lat, lng, 8, false,
                "test report", "Test Road", null, "https://example.test/p.jpg", null,
                null, "device-" + UUID.randomUUID())).issueId();
    }

    private ResultActions reassign(AppUser who, UUID issueId, UUID wardId, String note) throws Exception {
        String body = "{\"wardId\":\"" + wardId + "\"" + (note == null ? "" : ",\"note\":\"" + note + "\"") + "}";
        return mvc.perform(post("/api/v1/supervisor/issues/{id}/reassign-ward", issueId)
                .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(who))
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions merge(AppUser who, UUID target, UUID source) throws Exception {
        return mvc.perform(post("/api/v1/supervisor/issues/{id}/merge", target)
                .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(who))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sourceIssueId\":\"" + source + "\"}"));
    }
}
