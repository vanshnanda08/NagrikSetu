package com.civictrack.audit;

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
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The audit log (blueprint 3.21): administrators only, one list over the three
 * append-only tables, filterable, exportable.
 */
@AutoConfigureMockMvc
class AuditLogIT extends IntegrationTestBase {

    @Autowired private MockMvc mvc;
    @Autowired private Fixtures fixtures;
    @Autowired private MutableClock clock;
    @Autowired private JdbcTemplate jdbc;

    private AppUser admin;
    private AppUser roadsHead;
    private Issue issue;

    @BeforeEach
    void setUp() throws Exception {
        fixtures.clearIssues();
        clock.set(Instant.now());
        admin = fixtures.user(Role.ADMIN, null, null);
        roadsHead = fixtures.user(Role.SUPERVISOR, fixtures.departmentId("ROADS"), null);
        issue = fixtures.issue("POTHOLE", Instant.now().minusSeconds(7200), Instant.now().plusSeconds(86_400));

        // A real status transition, written by the state machine.
        mvc.perform(post("/api/v1/issues/{id}/acknowledge", issue.getId())
                        .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(roadsHead)))
                .andExpect(status().isOk());
        // An escalation and a moderation action, as the sweep and the supervisor tools write them.
        jdbc.update("INSERT INTO escalation_events (issue_id, level, to_user_id, reason, breached_by_seconds)"
                + " VALUES (?, 2, ?, 'SLA_BREACH', 7200)", issue.getId(), roadsHead.getId());
        jdbc.update("INSERT INTO moderation_actions (action, issue_id, actor_id, actor_role, detail, note)"
                + " VALUES ('CONFIRM', ?, ?, 'SUPERVISOR', '{}'::jsonb, ?)",
                issue.getId(), roadsHead.getId(), "=HYPERLINK(\"http://evil\")");
    }

    @Test
    @DisplayName("only an administrator can read the log")
    void adminOnly() throws Exception {
        mvc.perform(get("/api/v1/admin/audit")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/audit").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(roadsHead)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/audit.csv").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(roadsHead)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/audit").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(admin)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("one list holds the transition, the escalation and the moderation action, newest first")
    void unionsThreeSources() throws Exception {
        mvc.perform(get("/api/v1/admin/audit").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.items.length()").value(3))
                .andExpect(jsonPath("$.items[?(@.kind == 'STATUS')].toStatus").value("ACKNOWLEDGED"))
                .andExpect(jsonPath("$.items[?(@.kind == 'STATUS')].actorRole").value("SUPERVISOR"))
                .andExpect(jsonPath("$.items[?(@.kind == 'ESCALATION')].level").value(2))
                .andExpect(jsonPath("$.items[?(@.kind == 'ESCALATION')].action").value("Level 2 escalation"))
                .andExpect(jsonPath("$.items[?(@.kind == 'MODERATION')].action").value("CONFIRM"))
                .andExpect(jsonPath("$.items[0].issueRef").value(issue.getPublicRef()));
    }

    @Test
    @DisplayName("filters narrow by kind, issue, actor role, level and date")
    void filters() throws Exception {
        assertTotal("kind=STATUS", 1);
        assertTotal("kind=ESCALATION", 1);
        assertTotal("issueRef=" + issue.getPublicRef().toLowerCase(), 3);
        assertTotal("issueRef=CT-1999-000001", 0);
        assertTotal("actorRole=SUPERVISOR", 2);
        assertTotal("actorRole=SYSTEM", 1);
        assertTotal("actorId=" + roadsHead.getId(), 2);
        assertTotal("level=2", 1);
        assertTotal("level=3", 0);

        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        assertTotal("from=" + today + "&to=" + today, 3);
        assertTotal("from=" + today.plusDays(1), 0);
        assertTotal("to=" + today.minusDays(1), 0);
    }

    @Test
    @DisplayName("paging reports the total and respects limit and offset")
    void paging() throws Exception {
        mvc.perform(get("/api/v1/admin/audit?limit=2&offset=0").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(admin)))
                .andExpect(jsonPath("$.items.length()").value(2)).andExpect(jsonPath("$.total").value(3));
        mvc.perform(get("/api/v1/admin/audit?limit=2&offset=2").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(admin)))
                .andExpect(jsonPath("$.items.length()").value(1));
    }

    @Test
    @DisplayName("the CSV export carries the same rows, is quoted correctly, and cannot run a formula")
    void csvExport() throws Exception {
        String csv = mvc.perform(get("/api/v1/admin/audit.csv").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION,
                        org.hamcrest.Matchers.containsString("nagriksetu-audit-log.csv")))
                .andExpect(content().contentTypeCompatibleWith("text/csv"))
                .andReturn().getResponse().getContentAsString();

        List<String> lines = List.of(csv.split("\r\n"));
        assertThat(lines.get(0)).isEqualTo("time,kind,issue,category,action,from_status,to_status,level,actor_role,actor,note");
        assertThat(lines).hasSize(4);
        assertThat(csv).contains(issue.getPublicRef()).contains("Level 2 escalation");
        // The note started with "=" and holds quotes and a comma: neutralised and quoted.
        assertThat(csv).contains("\"'=HYPERLINK(\"\"http://evil\"\")\"");

        mvc.perform(get("/api/v1/admin/audit.csv?kind=ESCALATION").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getContentAsString().split("\r\n")).hasSize(2));
    }

    @Test
    @DisplayName("CSV field escaping")
    void csvField() {
        assertThat(AuditCsv.field(null)).isEmpty();
        assertThat(AuditCsv.field("plain")).isEqualTo("plain");
        assertThat(AuditCsv.field("a,b")).isEqualTo("\"a,b\"");
        assertThat(AuditCsv.field("say \"hi\"")).isEqualTo("\"say \"\"hi\"\"\"");
        assertThat(AuditCsv.field("+1 555")).isEqualTo("'+1 555");
        assertThat(AuditCsv.field("-5")).isEqualTo("'-5");
        assertThat(AuditCsv.field("@name")).isEqualTo("'@name");
        assertThat(AuditCsv.field("line1\nline2")).isEqualTo("\"line1\nline2\"");
    }

    private void assertTotal(String query, int expected) throws Exception {
        mvc.perform(get("/api/v1/admin/audit?" + query).header(HttpHeaders.AUTHORIZATION, fixtures.bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(expected));
    }
}
