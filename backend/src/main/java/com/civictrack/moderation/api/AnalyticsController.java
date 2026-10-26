package com.civictrack.moderation.api;

import com.civictrack.dashboard.DepartmentAnalyticsDto;
import com.civictrack.dashboard.DepartmentAnalyticsService;
import com.civictrack.user.auth.Actors;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** {@code /supervisor/analytics} (blueprint 3.20). Internal, never public: individuals are measured in private. */
@RestController
@RequestMapping("/api/v1/supervisor")
@RequiredArgsConstructor
public class AnalyticsController {

    private final DepartmentAnalyticsService analytics;

    @GetMapping("/analytics")
    @PreAuthorize("hasAnyRole('SUPERVISOR','ADMIN')")
    public DepartmentAnalyticsDto analytics(@RequestParam(required = false) UUID departmentId,
                                            @AuthenticationPrincipal Jwt jwt) {
        return analytics.analytics(Actors.from(jwt), departmentId);
    }
}
