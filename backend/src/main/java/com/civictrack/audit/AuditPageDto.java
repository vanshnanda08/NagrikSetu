package com.civictrack.audit;

import java.util.List;

public record AuditPageDto(List<AuditEntryDto> items, long total, int limit, int offset) {
}
