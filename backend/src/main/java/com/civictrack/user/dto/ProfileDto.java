package com.civictrack.user.dto;

import com.civictrack.notification.NotificationType;
import com.civictrack.user.AppUser;
import com.civictrack.user.ProfileService;
import com.civictrack.user.Role;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** A person's own profile. {@code mutableNotificationTypes} tells the screen which switches it may show. */
public record ProfileDto(UUID id, String fullName, String email, String phone, Role role,
                         List<NotificationType> mutedNotificationTypes,
                         List<NotificationType> mutableNotificationTypes, Instant createdAt) {

    public static ProfileDto from(AppUser u) {
        return new ProfileDto(u.getId(), u.getFullName(), u.getEmail(), u.getPhone(), u.getRole(),
                ProfileService.mutedOf(u),
                ProfileService.MUTABLE.stream().sorted().toList(), u.getCreatedAt());
    }
}
