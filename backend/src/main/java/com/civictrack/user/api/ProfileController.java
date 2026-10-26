package com.civictrack.user.api;

import com.civictrack.user.ProfileService;
import com.civictrack.user.dto.ChangePasswordRequest;
import com.civictrack.user.dto.ProfileDto;
import com.civictrack.user.dto.UpdateProfileRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * {@code /me/profile}: the signed-in person's own profile (blueprint 3.13).
 * Every endpoint acts on the caller named by the validated token and takes no
 * user id, so there is no way to ask for somebody else's.
 */
@RestController
@RequestMapping("/api/v1/me")
@RequiredArgsConstructor
public class ProfileController {

    private final ProfileService profiles;

    @GetMapping("/profile")
    public ProfileDto profile(@AuthenticationPrincipal Jwt jwt) {
        return ProfileDto.from(profiles.get(userId(jwt)));
    }

    @PutMapping("/profile")
    public ProfileDto update(@Valid @RequestBody UpdateProfileRequest body, @AuthenticationPrincipal Jwt jwt) {
        return ProfileDto.from(profiles.update(userId(jwt), body.fullName(), body.phone(),
                body.mutedNotificationTypes()));
    }

    /** Changes the password and revokes every refresh-session family. */
    @PostMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@Valid @RequestBody ChangePasswordRequest body, @AuthenticationPrincipal Jwt jwt) {
        profiles.changePassword(userId(jwt), body.currentPassword(), body.newPassword());
    }

    private static UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
