package com.civictrack.user;

import com.civictrack.notification.NotificationType;
import com.civictrack.user.auth.InvalidCredentialsException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * A person's own profile (blueprint 3.13): display name, phone, notification
 * preferences, and password.
 *
 * <p><b>What is not editable.</b> Email, because it is the login and changing
 * it safely needs a verification round trip this project does not have. Role,
 * department and ward, because those are the organisation's decision and not
 * the user's; a self-service endpoint that touched them would be the privilege
 * escalation AuthService's class comment warns about.
 *
 * <p>A password change revokes every refresh-session family. Access tokens are
 * still bounded by their fifteen-minute lifetime.
 */
@Service
@RequiredArgsConstructor
public class ProfileService {

    /**
     * The types a person may switch off. VERIFY_REQUESTED is absent on purpose:
     * silence on a verification round counts as agreement after the timeout, so
     * muting the request would let somebody consent to a fix by accident.
     */
    public static final Set<NotificationType> MUTABLE = EnumSet.of(
            NotificationType.RESOLVED, NotificationType.REOPENED, NotificationType.REJECTED,
            NotificationType.INFO_REQUESTED, NotificationType.CITIZEN_REPLIED);

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;

    @Transactional(readOnly = true)
    public AppUser get(UUID userId) {
        return users.findById(userId).orElseThrow(() -> new InvalidCredentialsException("The account no longer exists"));
    }

    /**
     * Replaces the editable profile. A blank phone clears it, which is refused
     * if it would leave the account with no contact at all (the table CHECK
     * would reject it anyway, with a worse message).
     */
    @Transactional
    public AppUser update(UUID userId, String fullName, String phone, List<NotificationType> muted) {
        AppUser user = get(userId);

        String name = fullName.strip();
        if (name.isEmpty()) {
            throw new ProfileRefusedException("Your name cannot be blank.");
        }
        user.setFullName(name);

        String normalised = phone == null || phone.isBlank() ? null : phone.strip();
        if (normalised == null && user.getEmail() == null) {
            throw new ProfileRefusedException("An account needs an email or a phone number; this one has no email.");
        }
        if (normalised != null && !normalised.equals(user.getPhone()) && users.existsByPhone(normalised)) {
            throw new ProfileRefusedException("That phone number is already used by another account.");
        }
        user.setPhone(normalised);

        for (NotificationType t : muted) {
            if (!MUTABLE.contains(t)) {
                throw new ProfileRefusedException(
                        "Requests to verify a fix cannot be switched off: if nobody answers, the fix counts as confirmed.");
            }
        }
        user.setMutedNotificationTypes(muted.stream().distinct().map(Enum::name).collect(Collectors.joining(",")));
        return users.save(user);
    }

    @Transactional
    public void changePassword(UUID userId, String currentPassword, String newPassword) {
        com.civictrack.user.auth.PasswordPolicy.validate(newPassword);
        jdbc.queryForObject("SELECT id FROM users WHERE id = ? FOR UPDATE", UUID.class, userId);
        AppUser user = get(userId);
        if (user.getPasswordHash() == null || !passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new ProfileRefusedException("Your current password is not correct.");
        }
        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            throw new ProfileRefusedException("Choose a password you are not already using.");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        users.save(user);
        jdbc.update("UPDATE refresh_sessions SET revoked = true WHERE user_id = ?", userId);
    }

    public static List<NotificationType> mutedOf(AppUser user) {
        String raw = user.getMutedNotificationTypes();
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Arrays.stream(raw.split(","))
                .map(String::strip)
                .filter(s -> !s.isEmpty())
                .map(s -> {
                    try {
                        return NotificationType.valueOf(s);
                    } catch (IllegalArgumentException e) {
                        return null;
                    }
                })
                .filter(java.util.Objects::nonNull)
                .toList();
    }
}
