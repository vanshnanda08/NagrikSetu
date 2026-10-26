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
}
