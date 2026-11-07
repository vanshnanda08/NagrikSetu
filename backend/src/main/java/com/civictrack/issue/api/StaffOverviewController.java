package com.civictrack.issue.api;

import com.civictrack.dashboard.StaffOverviewDto;
import com.civictrack.dashboard.StaffOverviewService;
import com.civictrack.user.auth.Actors;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/staff")
@RequiredArgsConstructor
public class StaffOverviewController {
    private final StaffOverviewService overview;

    @GetMapping("/overview")
    @PreAuthorize("hasRole('STAFF')")
    public StaffOverviewDto overview(@AuthenticationPrincipal Jwt jwt) {
        return overview.overview(Actors.from(jwt));
    }
}
