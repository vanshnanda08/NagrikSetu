package com.civictrack.user;

import com.civictrack.IntegrationTestBase;
import com.civictrack.support.MutableClock;
import com.civictrack.user.auth.AuthService;
import com.civictrack.user.auth.InvalidCredentialsException;
import com.civictrack.user.auth.MfaRequiredException;
import com.civictrack.user.auth.TotpService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class SecurityFeaturesIT extends IntegrationTestBase {
    @Autowired AuthService auth;
    @Autowired TotpService totp;
    @Autowired UserRepository users;
    @Autowired MutableClock clock;
    @Autowired MockMvc mvc;

    AppUser admin;

    @BeforeEach
    void prepare() {
        clock.set(Instant.parse("2026-10-24T12:00:00Z"));
        admin = auth.register("mfa-" + UUID.randomUUID() + "@example.test", null,
                "secure-password-123", "MFA administrator");
        admin.setRole(Role.ADMIN);
        admin = users.save(admin);
    }

    @Test
    void privilegedAccountIsLimitedUntilMfaIsEnabledAndVerified() throws Exception {
        var before = auth.login(admin.getEmail(), "secure-password-123", null);
        mvc.perform(get("/api/v1/admin/configuration")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + before.tokens().accessToken()))
                .andExpect(status().isForbidden());

        TotpService.Setup setup = totp.begin(admin.getId(), "secure-password-123");
        var recovery = totp.enable(admin.getId(), code(setup.secret(), clock.instant()));
        assertThat(recovery).hasSize(10).doesNotHaveDuplicates();

        assertThatThrownBy(() -> auth.login(admin.getEmail(), "secure-password-123", null))
                .isInstanceOf(MfaRequiredException.class);
        assertThatThrownBy(() -> auth.login(admin.getEmail(), "secure-password-123", "000000"))
                .isInstanceOf(InvalidCredentialsException.class);

        clock.set(clock.instant().plusSeconds(30));
        var verified = auth.login(admin.getEmail(), "secure-password-123", code(setup.secret(), clock.instant()));
        mvc.perform(get("/api/v1/admin/configuration")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + verified.tokens().accessToken()))
                .andExpect(status().isOk());
    }

    @Test
    void enabledFactorCannotBeReplacedOrRecoveryCodesRegeneratedBySetup() {
        var setup = totp.begin(admin.getId(), "secure-password-123");
        String currentCode = code(setup.secret(), clock.instant());
        var recovery = totp.enable(admin.getId(), currentCode);
        assertThatThrownBy(() -> totp.begin(admin.getId(), "secure-password-123"))
                .isInstanceOf(ProfileRefusedException.class);
        assertThatThrownBy(() -> totp.enable(admin.getId(), currentCode))
                .isInstanceOf(ProfileRefusedException.class);
        assertThat(auth.login(admin.getEmail(), "secure-password-123", recovery.get(0))).isNotNull();
    }

    @Test
    void unverifiedMunicipalSessionCannotReadOrPostPrivateMessages() throws Exception {
        var login = auth.login(admin.getEmail(), "secure-password-123");
        String bearer = "Bearer " + login.tokens().accessToken();
        mvc.perform(get("/api/v1/issues/{id}/messages", UUID.randomUUID())
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/issues/{id}/messages", UUID.randomUUID())
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType("application/json").content("{\"body\":\"Where is the problem?\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void recoveryCodesAreSingleUseAndSessionFamiliesCanBeRevoked() throws Exception {
        TotpService.Setup setup = totp.begin(admin.getId(), "secure-password-123");
        String recovery = totp.enable(admin.getId(), code(setup.secret(), clock.instant())).get(0);
        var first = auth.login(admin.getEmail(), "secure-password-123", recovery);
        assertThatThrownBy(() -> auth.login(admin.getEmail(), "secure-password-123", recovery))
                .isInstanceOf(InvalidCredentialsException.class);

        clock.set(clock.instant().plusSeconds(30));
        var second = auth.login(admin.getEmail(), "secure-password-123", code(setup.secret(), clock.instant()));
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

    private static String code(String secret, Instant instant) {
        try {
            byte[] key = decode(secret);
            long counter = instant.getEpochSecond() / 30;
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(key, "HmacSHA1"));
            byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(counter).array());
            int offset = hash[hash.length - 1] & 15;
            int binary = ((hash[offset] & 127) << 24) | ((hash[offset + 1] & 255) << 16)
                    | ((hash[offset + 2] & 255) << 8) | (hash[offset + 3] & 255);
            return "%06d".formatted(binary % 1_000_000);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static byte[] decode(String value) {
        String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        int buffer = 0, bits = 0;
        for (char c : value.toUpperCase(Locale.ROOT).toCharArray()) {
            buffer = (buffer << 5) | alphabet.indexOf(c);
            bits += 5;
            if (bits >= 8) { out.write((buffer >> (bits - 8)) & 255); bits -= 8; }
        }
        return out.toByteArray();
    }
}
