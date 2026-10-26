package com.civictrack.dashboard;

import com.civictrack.user.Actor;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

/**
 * Who may see which department's analytics. A supervisor sees their own
 * department only -- the department is read from their token, so there is no
 * parameter to widen. An administrator chooses. A ward officer (a supervisor
 * with a ward and no department) has no department to report on.
 */
@Service
@RequiredArgsConstructor
public class DepartmentAnalyticsService {

    private final ScopedDashboardQueries scoped;
    private final StaffAnalyticsQueries staff;
    private final DashboardProperties props;
    private final Clock clock;

    @Transactional(readOnly = true)
    public DepartmentAnalyticsDto analytics(Actor actor, UUID requestedDepartmentId) {
        UUID departmentId;
        if (actor.isAdmin()) {
            if (requestedDepartmentId == null) {
                throw new AnalyticsRefusedException(HttpStatus.BAD_REQUEST, "Choose a department.");
            }
            departmentId = requestedDepartmentId;
        } else {
            if (actor.departmentId() == null) {
                throw new AnalyticsRefusedException(HttpStatus.FORBIDDEN,
                        "Department analytics are for department supervisors. Ward officers work by ward; "
                        + "open the ward's public page instead.");
            }
            if (requestedDepartmentId != null && !requestedDepartmentId.equals(actor.departmentId())) {
                throw new AnalyticsRefusedException(HttpStatus.FORBIDDEN,
                        "You can only see your own department's analytics.");
            }
            departmentId = actor.departmentId();
        }

        DepartmentAnalyticsDto.Department department = staff.department(departmentId)
                .orElseThrow(() -> new AnalyticsRefusedException(HttpStatus.NOT_FOUND, "There is no such department."));
        Instant now = clock.instant();
        return new DepartmentAnalyticsDto(department,
                scoped.metrics(ScopedDashboardQueries.Scope.DEPARTMENT, departmentId, now),
                staff.staff(departmentId, now), props.minimumSample(), now);
    }
}
