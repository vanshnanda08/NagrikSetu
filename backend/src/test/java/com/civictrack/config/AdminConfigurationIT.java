package com.civictrack.config;

import com.civictrack.IntegrationTestBase;
import com.civictrack.support.Fixtures;
import com.civictrack.user.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.*;

@AutoConfigureMockMvc
class AdminConfigurationIT extends IntegrationTestBase {
    @Autowired MockMvc mvc;
    @Autowired Fixtures fixtures;
    @Autowired JdbcTemplate jdbc;
    @Test void requiresAnActiveAdministratorAndNeverExposesHashes() throws Exception {
        var citizen=fixtures.user(Role.CITIZEN,null,null);
        mvc.perform(get("/api/v1/admin/configuration").header("Authorization",fixtures.bearer(citizen))).andExpect(status().isForbidden());
        var admin=fixtures.user(Role.ADMIN,null,null);
        String body=mvc.perform(get("/api/v1/admin/configuration").header("Authorization",fixtures.bearer(admin))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("password_hash");
        String token=fixtures.bearer(admin);
        jdbc.update("UPDATE users SET active=false WHERE id=?",admin.getId());
        mvc.perform(get("/api/v1/admin/configuration").header("Authorization",token)).andExpect(status().isForbidden());
    }
    @Test void savesAndAuditsWithoutAcceptingHierarchyCycles() throws Exception {
        var admin=fixtures.user(Role.ADMIN,null,null);
        var department=jdbc.queryForList("SELECT id,name FROM departments ORDER BY code LIMIT 1").get(0);
        String id=department.get("id").toString();
        mvc.perform(put("/api/v1/admin/configuration/departments/"+id).header("Authorization",fixtures.bearer(admin))
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Temporary\",\"parentDepartmentId\":\""+id+"\"}")).andExpect(status().isConflict());
        var ward=jdbc.queryForList("SELECT id,name,officer_user_id FROM wards ORDER BY ward_number LIMIT 1").get(0);
        try {
            mvc.perform(put("/api/v1/admin/configuration/wards/"+ward.get("id")).header("Authorization",fixtures.bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Configured ward\"}")).andExpect(status().isNoContent());
            assertThat(jdbc.queryForObject("SELECT count(*) FROM configuration_audit WHERE actor_id=?",Integer.class,admin.getId())).isEqualTo(1);
        } finally { jdbc.update("UPDATE wards SET name=?,officer_user_id=? WHERE id=?",ward.get("name"),ward.get("officer_user_id"),ward.get("id")); }
    }
    @Test void categorySavePreservesDormantMobileTargetData() throws Exception {
        var admin=fixtures.user(Role.ADMIN,null,null);
        var before=jdbc.queryForMap("SELECT * FROM categories WHERE code='POTHOLE'");
        // This legacy flag has no runtime behavior. Editing useful policy must
        // preserve its stored value without continuing to expose a fake control.
        jdbc.update("UPDATE categories SET is_mobile_target=true WHERE code='POTHOLE'");
        try {
            String body = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(java.util.Map.of(
                "displayName",before.get("display_name"), "mergeRadiusM",before.get("merge_radius_m"),
                "defaultSlaHours",before.get("default_sla_hours"), "severityWeight",before.get("severity_weight"),
                "reopenWindowDays",before.get("reopen_window_days"), "maxExtentMultiplier",before.get("max_extent_multiplier"),
                "lowConfAction",before.get("low_conf_action"), "departmentId",before.get("department_id"),
                "active",before.get("active")));
            mvc.perform(put("/api/v1/admin/configuration/categories/POTHOLE")
                .header("Authorization",fixtures.bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isNoContent());
            assertThat(jdbc.queryForObject("SELECT is_mobile_target FROM categories WHERE code='POTHOLE'",Boolean.class)).isTrue();
            mvc.perform(get("/api/v1/admin/configuration").header("Authorization",fixtures.bearer(admin)))
                .andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("is_mobile_target"))));
        } finally {
            jdbc.update("UPDATE categories SET is_mobile_target=? WHERE code='POTHOLE'",before.get("is_mobile_target"));
        }
    }

    @Test void accessChangesRequireScopeAndRevokeRefreshSessions() throws Exception {
        var admin=fixtures.user(Role.ADMIN,null,null);
        var user=fixtures.user(Role.CITIZEN,null,null);
        fixtures.refreshToken(user);
        String endpoint="/api/v1/admin/configuration/users/"+user.getId();
        String auth=fixtures.bearer(admin);
        mvc.perform(put(endpoint).header("Authorization",auth).contentType(MediaType.APPLICATION_JSON)
            .content("{\"fullName\":\"QA crew\",\"role\":\"STAFF\",\"active\":true}"))
            .andExpect(status().isConflict());
        mvc.perform(put(endpoint).header("Authorization",auth).contentType(MediaType.APPLICATION_JSON)
            .content("{\"fullName\":\"QA crew\",\"role\":\"STAFF\",\"active\":true,\"departmentId\":\""+fixtures.departmentId("ROADS")+"\"}"))
            .andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT role FROM users WHERE id=?",String.class,user.getId())).isEqualTo("STAFF");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_sessions WHERE user_id=? AND NOT revoked",Integer.class,user.getId())).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM configuration_audit WHERE actor_id=? AND resource='users' AND resource_id=?",Integer.class,admin.getId(),user.getId().toString())).isEqualTo(1);
    }

    @Test void lastActiveAdministratorCannotBeDisabledOrDemoted() throws Exception {
        var admin=fixtures.user(Role.ADMIN,null,null);
        var previous=jdbc.queryForList("SELECT id,active FROM users WHERE role='ADMIN' AND id<>?",admin.getId());
        jdbc.update("UPDATE users SET active=false WHERE role='ADMIN' AND id<>?",admin.getId());
        try {
            for(String body:java.util.List.of("{\"fullName\":\"QA administrator\",\"role\":\"ADMIN\",\"active\":false}","{\"fullName\":\"QA administrator\",\"role\":\"CITIZEN\",\"active\":true}"))
                mvc.perform(put("/api/v1/admin/configuration/users/"+admin.getId()).header("Authorization",fixtures.bearer(admin)).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict());
            assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE role='ADMIN' AND active",Integer.class)).isEqualTo(1);
        } finally { for(var row:previous)jdbc.update("UPDATE users SET active=? WHERE id=?",row.get("active"),row.get("id")); }
    }

    @Test void configurationHistoryHasStableOlderPages() throws Exception {
        var admin=fixtures.user(Role.ADMIN,null,null);
        try {
            for(int i=0;i<125;i++)jdbc.update("INSERT INTO configuration_audit(actor_id,resource,resource_id,before_value,after_value) VALUES(?,'users',?,'{}'::jsonb,'{}'::jsonb)",admin.getId(),"qa-page-"+i);
            mvc.perform(get("/api/v1/admin/configuration/audit").param("offset","0").header("Authorization",fixtures.bearer(admin)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(50)).andExpect(jsonPath("$[0].resource_id").value("qa-page-124"));
            mvc.perform(get("/api/v1/admin/configuration/audit").param("offset","100").header("Authorization",fixtures.bearer(admin)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].resource_id").value("qa-page-24")).andExpect(jsonPath("$[24].resource_id").value("qa-page-0"));
        } finally { jdbc.update("DELETE FROM configuration_audit WHERE actor_id=?",admin.getId()); }
    }

}
