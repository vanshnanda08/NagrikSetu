package com.civictrack.dashboard;

import com.civictrack.IntegrationTestBase;
import com.civictrack.issue.Issue;
import com.civictrack.support.Fixtures;
import com.civictrack.support.MutableClock;
import com.civictrack.user.AppUser;
import com.civictrack.user.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;
import java.util.ArrayList;
import java.util.List;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Tests the read projection against real PostGIS, without changing lifecycle policy. */
@AutoConfigureMockMvc
class StaffOverviewIT extends IntegrationTestBase {
    @Autowired private MockMvc mvc;
    @Autowired private Fixtures fixtures;
    @Autowired private MutableClock clock;
    @Autowired private JdbcTemplate jdbc;
    private AppUser crew;
    private UUID roads;
    private Instant now;
    private final List<UUID> createdUsers = new ArrayList<>();

    @BeforeEach
    void setUp() {
        fixtures.clearIssues();
        now = Instant.parse("2026-11-07T10:00:00Z");
        clock.set(now);
        roads = fixtures.departmentId("ROADS");
        crew = user(Role.STAFF, roads, null);
    }

    @AfterEach
    void cleanUp() {
        fixtures.clearIssues();
        createdUsers.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    @Test
    void personalAndDepartmentCountsRespectPausedClocksAndClosedStates() throws Exception {
        var other = user(Role.STAFF, roads, null);
        historical("NEW", null, -3600);
        historical("ASSIGNED", crew, 3600);
        historical("IN_PROGRESS", crew, -3600);
        historical("PENDING_VERIFICATION", crew, -3600);
        historical("ASSIGNED", other, -3600);
        var paused = historical("ASSIGNED", crew, -3600);
        jdbc.update("UPDATE issues SET paused_seconds = 7200 WHERE id = ?", paused.getId());
        historical("RESOLVED", crew, -3600);
        historical("CLOSED", crew, -3600);
        historical("REJECTED", crew, -3600);
        fixtures.breachedIssue("WATER_LEAK", now);

        mvc.perform(get("/api/v1/staff/overview").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(crew)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.department.id").value(roads.toString()))
                .andExpect(jsonPath("$.personal.open").value(4))
                .andExpect(jsonPath("$.personal.overdue").value(1))
                .andExpect(jsonPath("$.personal.readyToStart").value(2))
                .andExpect(jsonPath("$.personal.inProgress").value(1))
                .andExpect(jsonPath("$.personal.awaitingVerification").value(1))
                .andExpect(jsonPath("$.departmentWork.open").value(6))
                .andExpect(jsonPath("$.departmentWork.overdue").value(3))
                .andExpect(jsonPath("$.departmentWork.needsAssignment").value(1))
                .andExpect(jsonPath("$.departmentWork.awaitingVerification").value(1))
                .andExpect(jsonPath("$.stages.length()").value(6))
                .andExpect(jsonPath("$.stages[3].total").value(3))
                .andExpect(jsonPath("$.stages[3].mine").value(2))
                .andExpect(jsonPath("$.myPriorities.length()").value(4))
                .andExpect(jsonPath("$.myPriorities[*].assignedTo", everyItem(is(crew.getId().toString()))))
                .andExpect(jsonPath("$.departmentPriorities.length()").value(6))
                .andExpect(jsonPath("$.departmentPriorities[*].departmentId", everyItem(is(roads.toString()))));
    }

    @Test
    void countsAreNotLimitedByQueuePagination() throws Exception {
        for (int i = 0; i < 205; i++) historical("NEW", null, 3600);
        mvc.perform(get("/api/v1/staff/overview").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(crew)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.departmentWork.open").value(205))
                .andExpect(jsonPath("$.departmentWork.needsAssignment").value(205))
                .andExpect(jsonPath("$.departmentPriorities.length()").value(6))
                .andExpect(jsonPath("$.previewLimit").value(6));
    }

    @Test
    void optionalWardAndDepartmentScopeCannotBeWidenedByQueryParameters() throws Exception {
        historical("NEW", null, -3600);
        var ward2 = fixtures.wardId(2);
        var restricted = user(Role.STAFF, roads, ward2);
        var inside = historical("IN_PROGRESS", restricted, -3600);
        jdbc.update("UPDATE issues SET ward_id = ? WHERE id = ?", ward2, inside.getId());
        fixtures.breachedIssue("WATER_LEAK", now);

        mvc.perform(get("/api/v1/staff/overview")
                        .param("departmentId", fixtures.departmentId("WATER").toString())
                        .param("wardId", fixtures.wardId(1).toString())
                        .param("userId", crew.getId().toString())
                        .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(restricted)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.department.id").value(roads.toString()))
                .andExpect(jsonPath("$.ward.id").value(ward2.toString()))
                .andExpect(jsonPath("$.ward.name").value("Ward 2 - Bharat Nagar"))
                .andExpect(jsonPath("$.departmentWork.open").value(1))
                .andExpect(jsonPath("$.personal.open").value(1))
                .andExpect(jsonPath("$.departmentPriorities[0].id").value(inside.getId().toString()));
    }

    @Test
    void noDepartmentFailsClosed() throws Exception {
        historical("NEW", null, -3600);
        var unscoped = user(Role.STAFF, null, null);
        mvc.perform(get("/api/v1/staff/overview").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(unscoped)))
                .andExpect(status().isForbidden());
    }

    @Test
    void endpointRequiresStaffRoleAndDoesNotExposeSupervisorAnalytics() throws Exception {
        mvc.perform(get("/api/v1/staff/overview")).andExpect(status().isUnauthorized());
        for (var role : new Role[]{Role.CITIZEN, Role.SUPERVISOR, Role.ADMIN}) {
            var user = user(role, roads, null);
            mvc.perform(get("/api/v1/staff/overview").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(user)))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/v1/supervisor/analytics").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(crew)))
                .andExpect(status().isForbidden());
    }

    @Test
    void exactDeadlineIsNotOverdueAndAcknowledgedOrReopenedWorkIsCounted() throws Exception {
        historical("ACKNOWLEDGED", crew, 0);
        historical("REOPENED", crew, 3600);
        mvc.perform(get("/api/v1/staff/overview").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(crew)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.personal.overdue").value(0))
                .andExpect(jsonPath("$.personal.readyToStart").value(1))
                .andExpect(jsonPath("$.departmentWork.needsAssignment").value(1))
                .andExpect(jsonPath("$.stages[1].total").value(1))
                .andExpect(jsonPath("$.stages[2].total").value(1));
    }

    @Test
    void emptyDepartmentReturnsRealZerosAndAllSixStages() throws Exception {
        mvc.perform(get("/api/v1/staff/overview").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(crew)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.personal.open").value(0))
                .andExpect(jsonPath("$.departmentWork.open").value(0))
                .andExpect(jsonPath("$.stages.length()").value(6))
                .andExpect(jsonPath("$.stages[*].total", everyItem(is(0))))
                .andExpect(jsonPath("$.myPriorities").isEmpty())
                .andExpect(jsonPath("$.departmentPriorities").isEmpty());
    }

    // Historical read-model fixtures; mutations and their permissions are tested by IssueLifecycleApiIT.
    private AppUser user(Role role, UUID department, UUID ward) {
        var user = fixtures.user(role, department, ward);
        createdUsers.add(user.getId());
        return user;
    }

    private Issue historical(String status, AppUser assignee, long deadlineOffset) {
        var issue = fixtures.issue("POTHOLE", now.minusSeconds(7200), now.plusSeconds(deadlineOffset));
        jdbc.update("UPDATE issues SET status = ?, assigned_to = ? WHERE id = ?",
                status, assignee == null ? null : assignee.getId(), issue.getId());
        return issue;
    }
}
