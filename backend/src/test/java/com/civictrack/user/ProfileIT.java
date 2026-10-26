package com.civictrack.user;

import com.civictrack.IntegrationTestBase;
import com.civictrack.issue.Issue;
import com.civictrack.issue.IssueStatus;
import com.civictrack.issue.IssueTransitioned;
import com.civictrack.support.Fixtures;
import com.civictrack.support.MutableClock;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The profile screen's API (blueprint 3.13): name, phone, notification
 * preferences and password -- and the limits on each.
 */
@AutoConfigureMockMvc
class ProfileIT extends IntegrationTestBase {

    private static final String PASSWORD = "a-long-enough-password";

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private Fixtures fixtures;
    @Autowired private UserRepository users;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ApplicationEventPublisher events;
    @Autowired private MutableClock clock;

    private AppUser citizen;

    @BeforeEach
    void setUp() throws Exception {
        fixtures.clearIssues();
        clock.set(Instant.now());
        String email = "profile-" + UUID.randomUUID() + "@civictrack.test";
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", email, "password", PASSWORD,
                                "fullName", "Profile Person"))))
                .andExpect(status().isCreated());
        citizen = users.findByEmailIgnoreCase(email).orElseThrow();
    }

    @Test
    @DisplayName("a person reads their own profile, and is told which notifications they may switch off")
    void readsOwnProfile() throws Exception {
        mvc.perform(get("/api/v1/me/profile").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(citizen)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Profile Person"))
                .andExpect(jsonPath("$.email").value(citizen.getEmail()))
                .andExpect(jsonPath("$.role").value("CITIZEN"))
                .andExpect(jsonPath("$.mutedNotificationTypes").isEmpty())
                .andExpect(jsonPath("$.mutableNotificationTypes[?(@ == 'VERIFY_REQUESTED')]").isEmpty())
                .andExpect(jsonPath("$.mutableNotificationTypes.length()").value(5));
        mvc.perform(get("/api/v1/me/profile")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("name, phone and preferences are saved; role and email are not editable")
    void updatesEditableFields() throws Exception {
        update(citizen, "New Name", "9876543210", List.of("RESOLVED", "REJECTED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("New Name"))
                .andExpect(jsonPath("$.phone").value("9876543210"))
                .andExpect(jsonPath("$.mutedNotificationTypes.length()").value(2));

        AppUser saved = users.findById(citizen.getId()).orElseThrow();
        assertThat(saved.getFullName()).isEqualTo("New Name");
        assertThat(saved.getRole()).isEqualTo(Role.CITIZEN);
        assertThat(saved.getEmail()).isEqualTo(citizen.getEmail());

        // The whole set is replaced: an empty list switches everything back on, and a blank phone clears it.
        update(citizen, "New Name", "", List.of())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").doesNotExist())
                .andExpect(jsonPath("$.mutedNotificationTypes").isEmpty());
    }

    @Test
    @DisplayName("invalid or refused changes are rejected with a reason")
    void refusals() throws Exception {
        update(citizen, "  ", null, List.of()).andExpect(status().isBadRequest());
        update(citizen, "Name", "not-a-phone", List.of()).andExpect(status().isBadRequest());

        // A verification request cannot be muted: silence counts as agreement.
        update(citizen, "Name", null, List.of("VERIFY_REQUESTED"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://civictrack.example/problems/profile-refused"));

        // A phone number belongs to one account.
        AppUser other = fixtures.user(Role.CITIZEN, null, null);
        jdbc.update("UPDATE users SET phone = '9123456780' WHERE id = ?", other.getId());
        update(citizen, "Name", "9123456780", List.of())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("That phone number is already used by another account."));
    }

    @Test
    @DisplayName("password change needs the current password and a different new one")
    void changesPassword() throws Exception {
        password(citizen, "wrong-current-password", "another-long-password")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Your current password is not correct."));
        password(citizen, PASSWORD, PASSWORD)
                .andExpect(status().isConflict());
        password(citizen, PASSWORD, "short").andExpect(status().isBadRequest());

        password(citizen, PASSWORD, "another-long-password").andExpect(status().isNoContent());

        login(citizen.getEmail(), PASSWORD).andExpect(status().isUnauthorized());
        login(citizen.getEmail(), "another-long-password").andExpect(status().isOk());
    }

    @Test
    @DisplayName("a switched-off notification type is not sent, but a verification request always is")
    void mutedNotificationsAreSkipped() {
        Issue issue = fixtures.issue("POTHOLE", Instant.now().minusSeconds(3600), Instant.now().plusSeconds(86_400));
        fixtures.report(issue.getId(), citizen.getId());
        jdbc.update("UPDATE users SET muted_notification_types = 'RESOLVED,VERIFY_REQUESTED' WHERE id = ?",
                citizen.getId());

        events.publishEvent(new IssueTransitioned(issue, IssueStatus.PENDING_VERIFICATION, IssueStatus.RESOLVED,
                com.civictrack.user.Actor.system(), null, Instant.now()));
        assertThat(notificationTypes()).isEmpty();

        // Even a stored VERIFY_REQUESTED mute (which the API refuses) is not honoured.
        events.publishEvent(new IssueTransitioned(issue, IssueStatus.IN_PROGRESS, IssueStatus.PENDING_VERIFICATION,
                com.civictrack.user.Actor.system(), null, Instant.now()));
        assertThat(notificationTypes()).containsExactly("VERIFY_REQUESTED");

        // Unmuted, RESOLVED arrives.
        jdbc.update("UPDATE users SET muted_notification_types = '' WHERE id = ?", citizen.getId());
        events.publishEvent(new IssueTransitioned(issue, IssueStatus.PENDING_VERIFICATION, IssueStatus.RESOLVED,
                com.civictrack.user.Actor.system(), null, Instant.now()));
        assertThat(notificationTypes()).containsExactlyInAnyOrder("VERIFY_REQUESTED", "RESOLVED");
    }

    // ------------------------------------------------------------------

    private List<String> notificationTypes() {
        return jdbc.queryForList("SELECT type FROM notifications WHERE user_id = ? ORDER BY id",
                String.class, citizen.getId());
    }

    private ResultActions update(AppUser who, String name, String phone, List<String> muted) throws Exception {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("fullName", name);
        body.put("phone", phone);
        body.put("mutedNotificationTypes", muted);
        return mvc.perform(put("/api/v1/me/profile").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(who))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    private ResultActions password(AppUser who, String current, String next) throws Exception {
        return mvc.perform(post("/api/v1/me/password").header(HttpHeaders.AUTHORIZATION, fixtures.bearer(who))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("currentPassword", current, "newPassword", next))));
    }

    private ResultActions login(String email, String password) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "password", password))));
    }
}
