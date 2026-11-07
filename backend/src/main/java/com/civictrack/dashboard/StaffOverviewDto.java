package com.civictrack.dashboard;

import com.civictrack.issue.dto.QueueRowDto;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Department-scoped operational totals. No other worker's performance is exposed. */
public record StaffOverviewDto(
        Scope department, Scope ward, Personal personal, DepartmentWork departmentWork,
        List<Stage> stages, List<QueueRowDto> myPriorities, List<QueueRowDto> departmentPriorities,
        int previewLimit, Instant generatedAt) {
    public record Scope(UUID id, String name) {}
    public record Personal(long open, long overdue, long readyToStart, long inProgress,
                           long awaitingVerification) {}
    public record DepartmentWork(long open, long overdue, long needsAssignment, long awaitingVerification) {}
    public record Stage(String status, long total, long mine) {}
}
