package com.civictrack.user.api;

import com.civictrack.abuse.RateLimitService;
import com.civictrack.user.auth.PasswordRecoveryService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class RecoveryController {
    private final PasswordRecoveryService recovery;
    private final RateLimitService limits;
    public record Email(@NotBlank @jakarta.validation.constraints.Email @Size(max=180) String email) {}
    public record Reset(@NotBlank @Size(max=100) String token,
                        @NotBlank @Size(min=10,max=72) String password) {}
    @PostMapping("/forgot-password")
    public ResponseEntity<?> request(@Valid @RequestBody Email body, jakarta.servlet.http.HttpServletRequest request) {
        limits.checkLogin("reset:" + body.email(), request.getRemoteAddr());
        recovery.request(body.email());
        return ResponseEntity.accepted().body(java.util.Map.of("message", "If that account is active, a reset link will be emailed to it."));
    }
    @PostMapping("/reset-password")
    public ResponseEntity<Void> reset(@Valid @RequestBody Reset body) {
        recovery.reset(body.token(), body.password());
        return ResponseEntity.noContent().build();
    }
}
