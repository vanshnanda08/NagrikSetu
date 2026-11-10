package com.civictrack.user.dto;

import jakarta.validation.constraints.NotBlank;

@com.fasterxml.jackson.annotation.JsonIgnoreProperties({"mfaCode"})
public record LoginRequest(
        @NotBlank(message = "email is required") @jakarta.validation.constraints.Size(max = 180) String email,
        @NotBlank(message = "password is required") @jakarta.validation.constraints.Size(max = 100) String password) {
}
