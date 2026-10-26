package com.civictrack.dashboard;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

/** The public ward page (blueprint 3.9). One read-only transaction so the figures agree with each other. */
@Service
@RequiredArgsConstructor
public class WardDashboardService {

    private final WardDetailQueries wards;
    private final ScopedDashboardQueries scoped;
    private final Clock clock;

    @Transactional(readOnly = true)
    public WardDashboardDto ward(UUID wardId) {
        Instant now = clock.instant();
        WardDashboardDto.Ward ward = wards.ward(wardId).orElseThrow(() -> new WardNotFoundException(wardId));
        return new WardDashboardDto(ward,
                scoped.metrics(ScopedDashboardQueries.Scope.WARD, wardId, now),
                wards.density(wardId), wards.recurrence(wardId), now);
    }
}
