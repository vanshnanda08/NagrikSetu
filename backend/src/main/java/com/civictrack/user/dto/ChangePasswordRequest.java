package com.civictrack.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(

        @NotBlank(message = "current password is required")
        @Size(max = 100)
        String currentPassword,

        @NotBlank(message = "new password is required")
        @Size(min = 10, max = 100, message = "password must be at least 10 characters")
        String newPassword
) {
}
