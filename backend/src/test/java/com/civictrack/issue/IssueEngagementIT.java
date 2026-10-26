package com.civictrack.issue;

import com.civictrack.IntegrationTestBase;
import com.civictrack.support.Fixtures;
import com.civictrack.support.MutableClock;
import com.civictrack.user.AppUser;
import com.civictrack.user.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class IssueEngagementIT extends IntegrationTestBase {
    @Autowired Fixtures fixtures;
    @Autowired MutableClock clock;
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired IssueLifecycleService lifecycle;

    Issue issue;
    AppUser reporter;
    AppUser follower;
    AppUser outsider;
    AppUser supervisor;

    @BeforeEach
    void prepare() {
        fixtures.clearIssues();
        clock.set(Instant.parse("2026-10-24T12:00:00Z"));
        issue = fixtures.issue("POTHOLE", clock.instant(), clock.instant().plusSeconds(3600));
        reporter = fixtures.user(Role.CITIZEN, null, null);
        follower = fixtures.user(Role.CITIZEN, null, null);
        outsider = fixtures.user(Role.CITIZEN, null, null);
        supervisor = fixtures.user(Role.SUPERVISOR, issue.getDepartmentId(), null);
        fixtures.report(issue.getId(), reporter.getId());
    }

    @Test
    void followingDoesNotInflatePriorityAndReceivesStatusUpdates() throws Exception {
        int before = jdbc.queryForObject("SELECT distinct_reporter_count FROM issues WHERE id=?", Integer.class, issue.getId());
        mvc.perform(post("/api/v1/issues/{id}/follow", issue.getId())
                        .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(follower)))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/issues/{id}/follow", issue.getId())
                        .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(follower)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.following").value(true));
        assertThat(jdbc.queryForObject("SELECT distinct_reporter_count FROM issues WHERE id=?", Integer.class, issue.getId()))
                .isEqualTo(before);

        lifecycle.reject(issue.getId(), supervisor.toActor(), "Confirmed duplicate during review");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE user_id=? AND type='REJECTED'",
                Integer.class, follower.getId())).isEqualTo(1);
    }

    @Test
    void clarificationThreadIsPrivateAndNotifiesBothDirections() throws Exception {
        jdbc.update("UPDATE issues SET assigned_to=? WHERE id=?", supervisor.getId(), issue.getId());
        mvc.perform(post("/api/v1/issues/{id}/messages", issue.getId())
                        .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(supervisor))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Which side of the junction is affected?\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.kind").value("REQUEST_INFO"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE user_id=? AND type='INFO_REQUESTED'",
                Integer.class, reporter.getId())).isEqualTo(1);

        mvc.perform(get("/api/v1/issues/{id}/messages", issue.getId())
                        .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(outsider)))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/v1/issues/{id}/messages", issue.getId())
                        .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(reporter))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"It is beside the northbound bus stop.\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.kind").value("CITIZEN_REPLY"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE user_id=? AND type='CITIZEN_REPLIED'",
                Integer.class, supervisor.getId())).isEqualTo(1);
    }
}
