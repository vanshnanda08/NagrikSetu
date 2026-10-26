package com.civictrack.dashboard;

import com.civictrack.IntegrationTestBase;
import com.civictrack.issue.Issue;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The ward page (public) and department analytics (internal): scoped figures
 * with the same definitions as the city dashboard, the ward-only extras, and
 * who may see what.
 *
 * <p>Fixture: in ward 1, five POTHOLE issues resolved ten hours after they were
 * reported, each claimed by the roads crew member at nine hours (inside a
 * twelve-hour deadline, so on time), plus one open pothole at the same spot,
 * one open water leak, and a pothole in ward 2 that must not leak into ward 1.
 */
@AutoConfigureMockMvc
class WardAndDepartmentDashboardIT extends IntegrationTestBase {

    @Autowired private MockMvc mvc;
    @Autowired private Fixtures fixtures;
    @Autowired private MutableClock clock;
    @Autowired private JdbcTemplate jdbc;

    private UUID ward1;
    private AppUser crewA;
    private AppUser crewB;
    private AppUser roadsHead;

    @BeforeEach
    void setUp() {
        fixtures.clearIssues();
        clock.set(Instant.now());
        ward1 = fixtures.wardId(1);
        UUID roads = fixtures.departmentId("ROADS");
        roadsHead = fixtures.user(Role.SUPERVISOR, roads, null);
        crewA = fixtures.user(Role.STAFF, roads, null);
        crewB = fixtures.user(Role.STAFF, roads, null);

        Instant first = Instant.now().minusSeconds(5 * 86_400L);
        for (int i = 0; i < 5; i++) {
            Issue resolved = fixtures.issue("POTHOLE", first, first.plusSeconds(12 * 3600));
            jdbc.update("""
                    UPDATE issues SET status = 'RESOLVED', resolved_at = ?, clock_paused_at = ?, verification_round = 1
                    WHERE id = ?""", ts(first.plusSeconds(10 * 3600)), ts(first.plusSeconds(9 * 3600)), resolved.getId());
            jdbc.update("""
                    INSERT INTO issue_status_history (issue_id, from_status, to_status, actor_id, actor_role)
                    VALUES (?, 'IN_PROGRESS', 'PENDING_VERIFICATION', ?, 'STAFF')""", resolved.getId(), crewA.getId());
        }
        // Still open, same place and category as the resolved ones: recurrence.
        fixtures.issue("POTHOLE", Instant.now().minusSeconds(3600), Instant.now().plusSeconds(86_400));
        fixtures.issue("WATER_LEAK", Instant.now().minusSeconds(3600), Instant.now().plusSeconds(86_400));
        // Ward 2, which ward 1's page must not count.
        Issue elsewhere = fixtures.issue("POTHOLE", Instant.now().minusSeconds(3600), Instant.now().plusSeconds(86_400));
        jdbc.update("UPDATE issues SET ward_id = ? WHERE id = ?", fixtures.wardId(2), elsewhere.getId());
    }

    // ------------------------------------------------------------------
    // ward page
    // ------------------------------------------------------------------

    @Test
    @DisplayName("the ward page is public and its figures are scoped to the ward")
    void wardPage() throws Exception {
        mvc.perform(get("/api/v1/dashboard/wards/{id}", ward1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ward.wardNumber").value(1))
                .andExpect(jsonPath("$.ward.name").value("Ward 1 - Civil Lines North"))
                .andExpect(jsonPath("$.ward.boundary").value(org.hamcrest.Matchers.containsString("MultiPolygon")))
                .andExpect(jsonPath("$.metrics.openCount").value(2))
                .andExpect(jsonPath("$.metrics.resolvedCount").value(5))
                .andExpect(jsonPath("$.metrics.medianResolutionHours").value(10.0))
                .andExpect(jsonPath("$.metrics.slaOnTime").value(5))
                .andExpect(jsonPath("$.metrics.slaRate").value(1.0))
                .andExpect(jsonPath("$.metrics.fixesClaimed").value(5))
                .andExpect(jsonPath("$.metrics.reopenRate").value(0.0))
                .andExpect(jsonPath("$.metrics.unverifiedRate").value(0.0))
                .andExpect(jsonPath("$.metrics.backlogAge.length()").value(6))
                .andExpect(jsonPath("$.metrics.reportedVsResolved.length()").value(90))
                .andExpect(jsonPath("$.metrics.openByCategory.length()").value(2));
    }

    @Test
    @DisplayName("density counts every real issue in the ward once, and leaves other wards out")
    void density() throws Exception {
        mvc.perform(get("/api/v1/dashboard/wards/{id}", ward1))
                .andExpect(jsonPath("$.density.length()").value(1))
                .andExpect(jsonPath("$.density[0].issues").value(7))
                .andExpect(jsonPath("$.density[0].open").value(2));
        mvc.perform(get("/api/v1/dashboard/wards/{id}", fixtures.wardId(2)))
                .andExpect(jsonPath("$.metrics.openCount").value(1))
                .andExpect(jsonPath("$.density[0].issues").value(1));
    }

    @Test
    @DisplayName("recurrence lists the spot that has produced more than one issue of the same category")
    void recurrence() throws Exception {
        mvc.perform(get("/api/v1/dashboard/wards/{id}", ward1))
                .andExpect(jsonPath("$.recurrence.length()").value(1))
                .andExpect(jsonPath("$.recurrence[0].categoryCode").value("POTHOLE"))
                .andExpect(jsonPath("$.recurrence[0].issues").value(6))
                .andExpect(jsonPath("$.recurrence[0].open").value(1))
                .andExpect(jsonPath("$.recurrence[0].refs.length()").value(6))
                .andExpect(jsonPath("$.recurrence[0].issueIds.length()").value(6));
    }

    @Test
    @DisplayName("an unknown ward is a 404 problem, not an empty page")
    void unknownWard() throws Exception {
        mvc.perform(get("/api/v1/dashboard/wards/{id}", UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("https://civictrack.example/problems/ward-not-found"));
    }

    // ------------------------------------------------------------------
    // department analytics
    // ------------------------------------------------------------------

    @Test
    @DisplayName("a supervisor sees their own department's figures and each crew member's record")
    void ownDepartment() throws Exception {
        mvc.perform(get("/api/v1/supervisor/analytics").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(roadsHead)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.department.name").value(org.hamcrest.Matchers.containsString("Roads")))
                .andExpect(jsonPath("$.metrics.resolvedCount").value(5))
                .andExpect(jsonPath("$.metrics.openCount").value(2))
                // The two crew created here plus the roads crew account seeded by V4.
                .andExpect(jsonPath("$.staff.length()").value(3))
                .andExpect(jsonPath("$.staff[0].id").value(crewA.getId().toString()))
                .andExpect(jsonPath("$.staff[0].fixesClaimed").value(5))
                .andExpect(jsonPath("$.staff[0].resolved").value(5))
                .andExpect(jsonPath("$.staff[0].medianResolutionHours").value(10.0))
                .andExpect(jsonPath("$.staff[0].reopenRate").value(0.0))
                .andExpect(jsonPath("$.staff[?(@.id == '" + crewB.getId() + "')].fixesClaimed").value(0))
                .andExpect(jsonPath("$.staff[?(@.id == '" + crewB.getId() + "')].medianResolutionHours")
                        .value(org.hamcrest.Matchers.contains(org.hamcrest.Matchers.nullValue())));
    }

    @Test
    @DisplayName("a crew member's fix is theirs even after escalation moved the assignee")
    void attributionFollowsTheClaim() throws Exception {
        // Hand every issue up to the supervisor, as an escalation would.
        jdbc.update("UPDATE issues SET assigned_to = ?", roadsHead.getId());
        mvc.perform(get("/api/v1/supervisor/analytics").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(roadsHead)))
                .andExpect(jsonPath("$.staff[0].resolved").value(5))
                .andExpect(jsonPath("$.staff[0].openAssigned").value(0));
    }

    @Test
    @DisplayName("who may see what: own department only, administrators choose, ward officers and crew cannot")
    void access() throws Exception {
        UUID water = fixtures.departmentId("WATER");
        AppUser admin = fixtures.user(Role.ADMIN, null, null);
        AppUser wardOfficer = fixtures.user(Role.SUPERVISOR, null, ward1);
        AppUser waterHead = fixtures.user(Role.SUPERVISOR, water, null);

        mvc.perform(get("/api/v1/supervisor/analytics")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/supervisor/analytics").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(crewA)))
                .andExpect(status().isForbidden());

        // Asking for another department is refused, not silently narrowed.
        mvc.perform(get("/api/v1/supervisor/analytics?departmentId=" + water)
                        .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(roadsHead)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.type").value("https://civictrack.example/problems/analytics-scope"));
        // The water supervisor sees their own department, which has none of the roads issues.
        mvc.perform(get("/api/v1/supervisor/analytics").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(waterHead)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics.resolvedCount").value(0))
                .andExpect(jsonPath("$.metrics.openCount").value(1));

        mvc.perform(get("/api/v1/supervisor/analytics").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(wardOfficer)))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/v1/supervisor/analytics").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(admin)))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/supervisor/analytics?departmentId=" + fixtures.departmentId("ROADS"))
                        .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics.resolvedCount").value(5));
    }

    private static java.sql.Timestamp ts(Instant i) {
        return java.sql.Timestamp.from(i);
    }
}
