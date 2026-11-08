package com.civictrack.audit;

import com.civictrack.IntegrationTestBase;
import com.civictrack.issue.Issue;
import com.civictrack.support.Fixtures;
import com.civictrack.support.MutableClock;
import com.civictrack.user.AppUser;
import com.civictrack.user.Role;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.sql.Timestamp;
import java.util.ArrayList;
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
    @Autowired private AuditQueries audit;
    @Autowired private ObjectMapper json;

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
    @DisplayName("CSV neutralizes hidden formula prefixes without rewriting the actual transition note")
    void csvHiddenFormulaPrefix() throws Exception {
        Issue other = fixtures.issue("POTHOLE", Instant.now(), Instant.now().plusSeconds(86_400));
        String note = "\t=SUM(1,1)";
        mvc.perform(post("/api/v1/issues/{id}/acknowledge", other.getId())
                        .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(roadsHead))
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("note", note))))
                .andExpect(status().isOk());

        assertThat(jdbc.queryForObject("SELECT note FROM issue_status_history WHERE issue_id=?",
                String.class, other.getId())).isEqualTo(note);
        String csv = mvc.perform(get("/api/v1/admin/audit.csv").param("issueRef", other.getPublicRef())
                        .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(admin)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(csv).contains("\"'\t=SUM(1,1)\"");
    }

    @Test
    @DisplayName("tied audit events remain reachable exactly once across pages and in export order")
    void pagingTimestampTies() throws Exception {
        Issue other = fixtures.issue("POTHOLE", Instant.now(), Instant.now().plusSeconds(86_400));
        Timestamp at = Timestamp.from(Instant.parse("2026-10-01T12:00:00Z"));
        for (int n = 0; n < 125; n++) {
            jdbc.update("INSERT INTO issue_status_history(issue_id,from_status,to_status,actor_id,actor_role,note,created_at)"
                            + " VALUES (?,'NEW','ACKNOWLEDGED',?,'SUPERVISOR',?,?)",
                    other.getId(), roadsHead.getId(), "status-" + n, at);
            jdbc.update("INSERT INTO moderation_actions(action,issue_id,actor_id,actor_role,detail,note,created_at)"
                            + " VALUES ('CONFIRM',?,?,'SUPERVISOR','{}'::jsonb,?,?)",
                    other.getId(), roadsHead.getId(), "moderation-" + n, at);
        }
        for (int level = 1; level <= 4; level++) {
            jdbc.update("INSERT INTO escalation_events(issue_id,level,reason,created_at) VALUES (?,?,?,?)",
                    other.getId(), level, "escalation-" + level, at);
        }
        List<String> expected = new ArrayList<>();
        for (int level = 4; level >= 1; level--) expected.add("escalation-" + level);
        for (int n = 124; n >= 0; n--) expected.add("moderation-" + n);
        for (int n = 124; n >= 0; n--) expected.add("status-" + n);

        List<String> traversed = new ArrayList<>();
        for (int offset = 0; offset < expected.size(); offset += 50) {
            String body = mvc.perform(get("/api/v1/admin/audit").param("issueRef", other.getPublicRef())
                            .param("limit", "50").param("offset", String.valueOf(offset))
                            .header(HttpHeaders.AUTHORIZATION, fixtures.bearer(admin)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(expected.size()))
                    .andReturn().getResponse().getContentAsString();
            AuditPageDto page = json.readValue(body, AuditPageDto.class);
            traversed.addAll(page.items().stream().map(AuditEntryDto::note).toList());
        }
        assertThat(traversed).doesNotHaveDuplicates().containsExactlyElementsOf(expected);
        AuditFilter filter = new AuditFilter(null, other.getPublicRef(), null, null, null, null, null);
        assertThat(audit.export(filter, 50_000).stream().map(AuditEntryDto::note).toList())
                .containsExactlyElementsOf(traversed);
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
        for (String prefix : List.of("", " ", "\t", "\r", "\n", "\u00a0", "\u2003", "\uFEFF", " \t\r\n\u00a0")) {
            for (String formula : List.of("=1", "+1", "-1", "@name")) {
                String input = prefix + formula;
                String expected = "'" + input;
                if (input.contains("\r") || input.contains("\n")) expected = "\"" + expected + "\"";
                assertThat(AuditCsv.field(input)).as("prefix %s before %s", prefix, formula).isEqualTo(expected);
            }
        }
        assertThat(AuditCsv.field(" \tordinary note")).isEqualTo(" \tordinary note");
        assertThat(AuditCsv.field("\u00a0")).isEqualTo("\u00a0");
        assertThat(AuditCsv.field("'\t=1")).isEqualTo("'\t=1");
    }

    private void assertTotal(String query, int expected) throws Exception {
        mvc.perform(get("/api/v1/admin/audit?" + query).header(HttpHeaders.AUTHORIZATION, fixtures.bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(expected));
    }
}
