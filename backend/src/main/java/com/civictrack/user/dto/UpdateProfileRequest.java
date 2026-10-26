package com.civictrack.user.dto;

import com.civictrack.notification.NotificationType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * The editable parts of a profile, replaced whole (PUT). A blank or null
 * {@code phone} clears it; {@code mutedNotificationTypes} is the complete set
 * of types switched off, so an empty list switches everything back on.
 */
public record UpdateProfileRequest(

        @NotBlank(message = "name is required")
        @Size(max = 160, message = "name must be at most 160 characters")
        String fullName,

        @Pattern(regexp = "^$|^\\+?[0-9]{7,15}$", message = "phone must be 7-15 digits")
        @Size(max = 20)
        String phone,

        @NotNull(message = "mutedNotificationTypes is required")
        List<NotificationType> mutedNotificationTypes
) {
}
