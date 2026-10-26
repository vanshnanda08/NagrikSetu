package com.civictrack.user.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank(message = "email is required") @jakarta.validation.constraints.Size(max = 180) String email,
        @NotBlank(message = "password is required") @jakarta.validation.constraints.Size(max = 100) String password,
        @jakarta.validation.constraints.Size(max = 32) String mfaCode) {
    public LoginRequest(String email, String password) {
        this(email, password, null);
    }
}
