package com.civictrack.user;

import com.civictrack.IntegrationTestBase;
import com.civictrack.support.Fixtures;
import com.civictrack.support.MutableClock;
import com.civictrack.user.auth.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.time.Instant;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

class RecoveryAndRotationIT extends IntegrationTestBase {
    @Autowired AuthService auth;
    @Autowired PasswordRecoveryService recovery;
    @Autowired TokenService tokens;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;
    @Autowired Fixtures fixtures;
    @Autowired MutableClock clock;
    @Autowired PasswordEncoder passwords;
    AppUser user;
    @BeforeEach void prepare() {
        clock.set(Instant.now());
        user=auth.register("recovery-"+UUID.randomUUID()+"@example.test",null,"old-password-123","Recovery user");
    }
    @Test void rotatesAndRevokesTheFamilyOnReplay() {
        var first=tokens.issue(user);
        var second=auth.refresh(first.refreshToken()).tokens();
        assertThat(second.refreshToken()).isNotEqualTo(first.refreshToken());
        assertThatThrownBy(() -> auth.refresh(first.refreshToken())).isInstanceOf(InvalidCredentialsException.class);
        assertThatThrownBy(() -> auth.refresh(second.refreshToken())).isInstanceOf(InvalidCredentialsException.class);
    }
    @Test void logoutRevokesRefresh() {
        var token=tokens.issue(user).refreshToken();
        auth.logout(token);
        assertThatThrownBy(() -> auth.refresh(token)).isInstanceOf(InvalidCredentialsException.class);
    }
    @Test void resetIsOneUseAndRevokesExistingSessions() {
        var refresh=tokens.issue(user).refreshToken();
        String reset=resetToken();
        assertThat(jdbc.queryForObject("SELECT token_hash FROM password_resets WHERE user_id=? ORDER BY expires_at DESC LIMIT 1",String.class,user.getId())).isEqualTo(TokenDigests.sha256(reset));
        recovery.reset(reset,"new-password-456");
        assertThat(passwords.matches("new-password-456",users.findById(user.getId()).orElseThrow().getPasswordHash())).isTrue();
        assertThatThrownBy(() -> recovery.reset(reset,"other-password-789")).isInstanceOf(InvalidCredentialsException.class);
        assertThatThrownBy(() -> auth.refresh(refresh)).isInstanceOf(InvalidCredentialsException.class);
    }
    @Test void newerLinkInvalidatesOldAndExpiryIsEnforced() {
        String first=resetToken(); String second=resetToken();
        assertThatThrownBy(() -> recovery.reset(first,"new-password-456")).isInstanceOf(InvalidCredentialsException.class);
        clock.set(clock.instant().plusSeconds(1801));
        assertThatThrownBy(() -> recovery.reset(second,"new-password-456")).isInstanceOf(InvalidCredentialsException.class);
    }
    @Test void unknownAccountDoesNotQueueAnEmail() {
        Integer before=jdbc.queryForObject("SELECT count(*) FROM mail_outbox",Integer.class);
        recovery.request(UUID.randomUUID()+"@example.test");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM mail_outbox",Integer.class)).isEqualTo(before);
    }
    private String resetToken() {
        recovery.request(user.getEmail());
        String body=jdbc.queryForObject("SELECT body FROM mail_outbox WHERE recipient=? ORDER BY id DESC LIMIT 1",String.class,user.getEmail());
        return body.split("#token=")[1].split("\\s")[0];
    }
}
