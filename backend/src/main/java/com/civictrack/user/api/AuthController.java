package com.civictrack.user.api;

import com.civictrack.abuse.RateLimitService;
import com.civictrack.user.AppUser;
import com.civictrack.user.auth.AuthService;
import com.civictrack.user.auth.JwtProperties;
import com.civictrack.user.dto.LoginRequest;
import com.civictrack.user.dto.RefreshRequest;
import com.civictrack.user.dto.RegisterRequest;
import com.civictrack.user.dto.TokenResponse;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Registration, login and refresh.
 *
 * <p>These three paths are the only ones in the application that are permitted
 * anonymously <em>and</em> hand out credentials. Registration and login are
 * peer-throttled; login also has an independent account bucket. Refresh tokens
 * are signed, single-use credentials with durable family reuse detection.
 */
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService auth;
    private final RateLimitService rateLimits;
    private final JwtProperties jwtProperties;

    @PostMapping("/register")
    public ResponseEntity<TokenResponse> register(@Valid @RequestBody RegisterRequest request,
                                                   HttpServletRequest servletRequest) {
        rateLimits.checkRegistration(clientAddress(servletRequest));
        AppUser user = auth.register(request.email(), emptyToNull(request.phone()),
                request.password(), request.fullName());
        AuthService.Authenticated result = auth.login(user.getEmail(), request.password());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(response(result));
    }

    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody LoginRequest request,
                               HttpServletRequest servletRequest) {
        rateLimits.checkLogin(request.email(), clientAddress(servletRequest));
        AuthService.Authenticated result = auth.login(request.email(), request.password(), request.mfaCode());
        return response(result);
    }

    /**
     * Exchanges a refresh token for a fresh pair.
     *
     * <p>The old token is consumed and the replacement remains in the same
     * server-side family. Reuse revokes the family. The type check also keeps a
     * refresh token from being accepted as a bearer credential.
     */
    @PostMapping("/refresh")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest request) {
        AuthService.Authenticated result = auth.refresh(request.refreshToken());
        return response(result);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@Valid @RequestBody RefreshRequest request) {
        auth.logout(request.refreshToken());
        return ResponseEntity.noContent().build();
    }

    private static String emptyToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private TokenResponse response(AuthService.Authenticated result) {
        return TokenResponse.of(result.tokens(), result.user(),
                jwtProperties.requirePrivilegedMfa());
    }

    private static String clientAddress(HttpServletRequest request) {
        // Forwarded headers are untrusted input. Throttling also keys on the
        // account independently, so reverse-proxy routing cannot bypass it.
        return request.getRemoteAddr();
    }
}
