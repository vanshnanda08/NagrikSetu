package com.civictrack.audit;

import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * The audit log (blueprint 3.21), administrators only. It demonstrates the
 * immutable-audit-trail claim: every transition, escalation and moderation
 * action, filterable, and exportable as CSV. Read-only by construction -- there
 * is no write endpoint, and the underlying tables have no update path in the
 * application.
 */
@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AuditController {

    private static final int MAX_PAGE = 200;
    /** A hard ceiling on one export, so a careless request cannot read the whole history into memory. */
    static final int MAX_EXPORT = 50_000;

    private final AuditQueries audit;

    @GetMapping("/audit")
    @PreAuthorize("hasRole('ADMIN')")
    public AuditPageDto page(@RequestParam(required = false) String kind,
                             @RequestParam(required = false) String issueRef,
                             @RequestParam(required = false) String actorRole,
                             @RequestParam(required = false) UUID actorId,
                             @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                             @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                             @RequestParam(required = false) Integer level,
                             @RequestParam(defaultValue = "50") int limit,
                             @RequestParam(defaultValue = "0") int offset) {
        return audit.page(new AuditFilter(kind, issueRef, actorRole, actorId, from, to, level),
                Math.min(Math.max(limit, 1), MAX_PAGE), Math.max(offset, 0));
    }

    @GetMapping(value = "/audit.csv", produces = "text/csv")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<byte[]> csv(@RequestParam(required = false) String kind,
                                      @RequestParam(required = false) String issueRef,
                                      @RequestParam(required = false) String actorRole,
                                      @RequestParam(required = false) UUID actorId,
                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                      @RequestParam(required = false) Integer level) {
        List<AuditEntryDto> rows = audit.export(
                new AuditFilter(kind, issueRef, actorRole, actorId, from, to, level), MAX_EXPORT);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"nagriksetu-audit-log.csv\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(AuditCsv.write(rows).getBytes(StandardCharsets.UTF_8));
    }
}
