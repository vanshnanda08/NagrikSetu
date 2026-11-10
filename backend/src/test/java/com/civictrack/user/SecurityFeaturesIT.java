package com.civictrack.user;

import com.civictrack.IntegrationTestBase;
import com.civictrack.support.MutableClock;
import com.civictrack.user.auth.AuthService;
import com.civictrack.user.auth.InvalidCredentialsException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.TestPropertySource;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
@TestPropertySource(properties = "civictrack.security.jwt.require-privileged-mfa=true")
class SecurityFeaturesIT extends IntegrationTestBase {
    @Autowired AuthService auth;
    @Autowired UserRepository users;
    @Autowired MutableClock clock;
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    AppUser account;

    @BeforeEach
    void prepare() {
        clock.set(Instant.parse("2026-10-24T12:00:00Z"));
        account = auth.register("password-session-" + UUID.randomUUID() + "@example.test", null,
                "secure-password-123", "Password session account");
        account.setRole(Role.ADMIN);
        account = users.save(account);
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"CITIZEN", "STAFF", "SUPERVISOR", "ADMIN"})
    void everyRoleCanUseItsWorkspaceWithPasswordAuthentication(Role role) throws Exception {
        account.setRole(role);
        account.setDepartmentId(jdbc.queryForObject("SELECT id FROM departments WHERE code='ROADS'", UUID.class));
        users.save(account);
        var login = auth.login(account.getEmail(), "secure-password-123");
        String bearer = "Bearer " + login.tokens().accessToken();
        String path = switch (role) {
            case STAFF -> "/api/v1/staff/queue";
            case SUPERVISOR -> "/api/v1/supervisor/queue";
            case ADMIN -> "/api/v1/admin/configuration";
            default -> "/api/v1/me/reports";
        };
        mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, bearer)).andExpect(status().isOk());
        if (role != Role.ADMIN) {
            mvc.perform(get("/api/v1/admin/configuration").header(HttpHeaders.AUTHORIZATION, bearer))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    void legacyEnrollmentCannotRequireCodesOrBlockPasswordLogin() throws Exception {
        account.setMfaEnabled(true);
        account.setMfaSecret("inert-legacy-secret-not-used-for-authentication");
        users.save(account);
        var login = auth.login(account.getEmail(), "secure-password-123");
        String bearer = "Bearer " + login.tokens().accessToken();
        mvc.perform(get("/api/v1/admin/configuration").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/me/security").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mfaEnabled").value(false))
                .andExpect(jsonPath("$.mfaRequired").value(false))
                .andExpect(jsonPath("$.recoveryCodesRemaining").value(0));
        // Removing the feature does not delete historical account data.
        assertThat(users.findById(account.getId()).orElseThrow().getMfaSecret())
                .isEqualTo("inert-legacy-secret-not-used-for-authentication");
    }

    @Test
    void retiredEnrollmentEndpointsCannotCreateOrEnableAnAuthenticator() throws Exception {
        String bearer = "Bearer " + auth.login(account.getEmail(), "secure-password-123").tokens().accessToken();
        for (String path : new String[]{"/mfa/setup", "/mfa/enable"}) {
            mvc.perform(post("/api/v1/me/security" + path).header(HttpHeaders.AUTHORIZATION, bearer)
                            .contentType("application/json").content("{}"))
                    .andExpect(status().isGone());
        }
        assertThat(users.findById(account.getId()).orElseThrow().isMfaEnabled()).isFalse();
        assertThat(users.findById(account.getId()).orElseThrow().getMfaSecret()).isNull();
    }

    @Test
    void legacyLoginPayloadDoesNotGrantMunicipalPermissionsToACitizen() throws Exception {
        account.setRole(Role.CITIZEN);
        users.save(account);
        var response = mvc.perform(post("/api/v1/auth/login").contentType("application/json")
                        .content("{\"email\":\"" + account.getEmail()
                                + "\",\"password\":\"secure-password-123\",\"mfaCode\":\"123456\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("CITIZEN"))
                .andExpect(jsonPath("$.mfaSetupRequired").value(false))
                .andReturn();
        String token = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(response.getResponse().getContentAsString()).get("accessToken").asText();
        mvc.perform(get("/api/v1/admin/configuration")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void passwordSessionFamiliesCanStillBeListedAndRevoked() throws Exception {
        var first = auth.login(account.getEmail(), "secure-password-123");
        var second = auth.login(account.getEmail(), "secure-password-123");
        String bearer = "Bearer " + second.tokens().accessToken();
        mvc.perform(get("/api/v1/me/security/sessions").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.current == true)]").isNotEmpty());
        mvc.perform(post("/api/v1/me/security/sessions/revoke-others")
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revoked").value(1));
        assertThatThrownBy(() -> auth.refresh(first.tokens().refreshToken()))
                .isInstanceOf(InvalidCredentialsException.class);
        assertThat(auth.refresh(second.tokens().refreshToken()).tokens().refreshToken()).isNotBlank();
    }

    @Test
    void refreshStillReflectsRoleChangesRatherThanOldSecondFactorFlags() throws Exception {
        var before = auth.login(account.getEmail(), "secure-password-123");
        account.setRole(Role.CITIZEN);
        users.save(account);
        var after = auth.refresh(before.tokens().refreshToken());
        mvc.perform(get("/api/v1/admin/configuration")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + after.tokens().accessToken()))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/me/reports")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + after.tokens().accessToken()))
                .andExpect(status().isOk());
    }
}
