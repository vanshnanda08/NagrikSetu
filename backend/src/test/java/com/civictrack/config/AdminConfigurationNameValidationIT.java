package com.civictrack.config;

import com.civictrack.IntegrationTestBase;
import com.civictrack.support.Fixtures;
import com.civictrack.user.AppUser;
import com.civictrack.user.Role;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Guard real configuration writes, audit evidence and session revocation together. */
@AutoConfigureMockMvc
class AdminConfigurationNameValidationIT extends IntegrationTestBase {
    @Autowired MockMvc mvc;
    @Autowired Fixtures fixtures;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    AppUser admin;
    Target target;

    record Target(String table, String keyColumn, Object key, String column,
                  String field, int maxLength, Map<String, Object> body) {
        String endpoint() { return "/api/v1/admin/configuration/" + table + "/" + key; }
    }

    @BeforeEach void createAdministrator() {
        admin = fixtures.user(Role.ADMIN, null, null);
    }

    @AfterEach void removeOnlyThisTestsRecords() {
        jdbc.update("DELETE FROM configuration_audit WHERE actor_id=?", admin.getId());
        if (target != null) {
            if (target.table().equals("users")) {
                jdbc.update("DELETE FROM refresh_sessions WHERE user_id=?", target.key());
            }
            jdbc.update("DELETE FROM " + target.table() + " WHERE " + target.keyColumn() + "=?", target.key());
        }
        jdbc.update("DELETE FROM refresh_sessions WHERE user_id=?", admin.getId());
        jdbc.update("DELETE FROM users WHERE id=?", admin.getId());
    }

    static Stream<Arguments> visuallyBlankNames() {
        List<String> blanks = List.of("", " \t\r\n", "\u00A0", "\u2003", "\uFEFF",
                "\uFEFF\u00A0\t\u2003\uFEFF", "\u200B\u2060", "\u00A0\u200B\u2060\uFEFF");
        return Stream.of("categories", "users", "departments", "wards")
                .flatMap(resource -> blanks.stream().map(blank -> Arguments.of(resource, blank)));
    }

    @ParameterizedTest
    @MethodSource("visuallyBlankNames")
    void rejectsVisuallyBlankNamesWithoutChangingRecordsAuditOrSessions(String resource, String name) throws Exception {
        target = createTarget(resource);
        var before = snapshot();
        int sessionsBefore = activeTargetSessions();
        var body = new LinkedHashMap<>(target.body());
        body.put(target.field(), name);

        var response = mvc.perform(put(target.endpoint()).header("Authorization", fixtures.bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)))
                .andExpect(status().isBadRequest()).andReturn().getResponse();

        String detail = json.readTree(response.getContentAsString()).path("detail").asText();
        assertThat(detail).isNotBlank().doesNotContain("The request could not be completed");
        assertThat(detail).containsAnyOf("visible character", "must not be blank");
        assertThat(snapshot()).isEqualTo(before);
        assertThat(auditCount()).isZero();
        assertThat(activeTargetSessions()).isEqualTo(sessionsBefore);
    }

    @ParameterizedTest
    @ValueSource(strings = {"categories", "users", "departments", "wards"})
    void savesReadableUnicodeNamesWithSurroundingUnicodeSpaceRemoved(String resource) throws Exception {
        target = createTarget(resource);
        String expected = switch (resource) {
            case "categories" -> "सड़क मरम्मत";
            case "users" -> "ज़ोया\u00A0ख़ान";
            case "departments" -> "公共服务";
            default -> "São José — वार्ड २";
        };
        var body = new LinkedHashMap<>(target.body());
        body.put(target.field(), "\uFEFF\u00A0\t\u2003" + expected + "\u2003\t\u00A0\uFEFF");

        mvc.perform(put(target.endpoint()).header("Authorization", fixtures.bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)))
                .andExpect(status().isNoContent());

        assertThat(snapshot().get(target.column())).isEqualTo(expected);
        assertThat(auditCount()).isEqualTo(1);
        String after = jdbc.queryForObject("SELECT after_value::text FROM configuration_audit WHERE actor_id=?",
                String.class, admin.getId());
        assertThat(json.readTree(after).path(target.column()).asText()).isEqualTo(expected);
        if (resource.equals("users")) assertThat(activeTargetSessions()).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"categories", "users", "departments", "wards"})
    void preservesExistingNameLengthLimits(String resource) throws Exception {
        target = createTarget(resource);
        var before = snapshot();
        var body = new LinkedHashMap<>(target.body());
        body.put(target.field(), "क".repeat(target.maxLength() + 1));

        mvc.perform(put(target.endpoint()).header("Authorization", fixtures.bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)))
                .andExpect(status().isBadRequest());

        assertThat(snapshot()).isEqualTo(before);
        assertThat(auditCount()).isZero();
    }

    private Target createTarget(String resource) {
        String code = "QA_NAME_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        if (resource.equals("categories")) {
            jdbc.update("INSERT INTO categories(code,display_name,merge_radius_m,default_sla_hours,severity_weight,reopen_window_days,max_extent_multiplier,low_conf_action) VALUES(?, 'Original category',25,72,10,14,2.0,'MERGE_FLAG')", code);
            return new Target(resource, "code", code, "display_name", "displayName", 120, Map.of(
                    "displayName", "Original category", "mergeRadiusM", 25, "defaultSlaHours", 72,
                    "severityWeight", 10, "reopenWindowDays", 14, "maxExtentMultiplier", 2,
                    "lowConfAction", "MERGE_FLAG", "active", true));
        }
        UUID id = UUID.randomUUID();
        if (resource.equals("users")) {
            AppUser user = fixtures.user(Role.CITIZEN, null, null);
            fixtures.refreshToken(user);
            return new Target(resource, "id", user.getId(), "full_name", "fullName", 160,
                    Map.of("fullName", user.getFullName(), "role", "CITIZEN", "active", true));
        }
        if (resource.equals("departments")) {
            jdbc.update("INSERT INTO departments(id,code,name) VALUES(?,?,'Original department')", id, code);
            return new Target(resource, "id", id, "name", "name", 160, Map.of("name", "Original department"));
        }
        jdbc.update("INSERT INTO wards(id,ward_number,name,boundary) SELECT ?, (SELECT max(ward_number)+1 FROM wards), 'Original ward', boundary FROM wards ORDER BY ward_number LIMIT 1", id);
        return new Target(resource, "id", id, "name", "name", 160, Map.of("name", "Original ward"));
    }

    private Map<String, Object> snapshot() {
        return jdbc.queryForMap("SELECT * FROM " + target.table() + " WHERE " + target.keyColumn() + "=?", target.key());
    }

    private int auditCount() {
        return jdbc.queryForObject("SELECT count(*) FROM configuration_audit WHERE actor_id=?", Integer.class, admin.getId());
    }

    private int activeTargetSessions() {
        return target.table().equals("users") ? jdbc.queryForObject(
                "SELECT count(*) FROM refresh_sessions WHERE user_id=? AND NOT revoked", Integer.class, target.key()) : 0;
    }
}
