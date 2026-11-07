package com.civictrack.issue;

import com.civictrack.IntegrationTestBase;
import com.civictrack.support.Fixtures;
import com.civictrack.support.MutableClock;
import com.civictrack.user.AppUser;
import com.civictrack.user.Role;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class StaffQueuePagingIT extends IntegrationTestBase {
    @Autowired MockMvc mvc;
    @Autowired Fixtures fixtures;
    @Autowired MutableClock clock;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    private final List<UUID> createdUsers = new ArrayList<>();
    private UUID roads;
    private AppUser crew;
    @BeforeEach void prepare() {
        fixtures.clearIssues();
        roads = fixtures.departmentId("ROADS");
        crew = user(Role.STAFF, roads, null);
    }
    @AfterEach void cleanUp() {
        fixtures.clearIssues();
        createdUsers.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    @Test void paginationReachesAll125TiedComplaintsWithoutDuplicatesOrScopeLeaks() throws Exception {
        Instant now = clock.instant();
        var expected = new ArrayList<String>();
        for (int i = 0; i < 125; i++) expected.add(fixtures.issue("POTHOLE", now, now.plusSeconds(3600)).getId().toString());
        fixtures.issue("WATER_LEAK", now, now.plusSeconds(3600));
        var visited = new ArrayList<String>();
        for (int offset : new int[]{0, 50, 100}) {
            var response = mvc.perform(get("/api/v1/staff/queue").param("tab", "all")
                            .param("limit", "51").param("offset", String.valueOf(offset))
                            .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(crew)))
                    .andExpect(status().isOk()).andReturn().getResponse();
            var rows = json.readTree(response.getContentAsString());
            assertThat(rows.size()).isEqualTo(offset == 100 ? 25 : 51);
            for (int i = 0; i < Math.min(rows.size(), 50); i++) visited.add(rows.get(i).get("id").asText());
        }
        assertThat(visited).containsExactlyElementsOf(expected.stream().sorted().toList());
        assertThat(visited).doesNotHaveDuplicates();
    }

    @Test void missingStaffDepartmentFailsClosedEvenWithAWardOrSpoofedDepartment() throws Exception {
        fixtures.breachedIssue("POTHOLE", clock.instant());
        for (UUID ward : new UUID[]{null, fixtures.wardId(1)}) {
            var unscoped = user(Role.STAFF, null, ward);
            mvc.perform(get("/api/v1/staff/queue").param("departmentId", roads.toString())
                            .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(unscoped)))
                    .andExpect(status().isForbidden());
        }
        var unscopedSupervisor = user(Role.SUPERVISOR, null, null);
        mvc.perform(get("/api/v1/staff/queue").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(unscopedSupervisor)))
                .andExpect(status().isForbidden());
    }

    @Test void wardOfficersAndAdministratorsKeepTheirExistingScope() throws Exception {
        Instant now = clock.instant();
        fixtures.breachedIssue("POTHOLE", now);
        fixtures.breachedIssue("WATER_LEAK", now);
        var elsewhere = fixtures.breachedIssue("POTHOLE", now);
        jdbc.update("UPDATE issues SET ward_id = ? WHERE id = ?", fixtures.wardId(2), elsewhere.getId());
        var wardOfficer = user(Role.SUPERVISOR, null, fixtures.wardId(1));
        var admin = user(Role.ADMIN, null, null);
        mvc.perform(get("/api/v1/staff/queue").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(wardOfficer)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get("/api/v1/staff/queue").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(admin)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(3));
    }

    private AppUser user(Role role, UUID department, UUID ward) {
        var user = fixtures.user(role, department, ward);
        createdUsers.add(user.getId());
        return user;
    }
}
