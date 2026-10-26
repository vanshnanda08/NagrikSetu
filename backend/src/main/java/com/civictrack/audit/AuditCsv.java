package com.civictrack.audit;

import java.util.List;

/**
 * RFC 4180 CSV for the audit log.
 *
 * <p>Two things beyond quoting. Fields starting with {@code = + - @} are
 * prefixed with an apostrophe, because a spreadsheet would otherwise execute a
 * note that begins that way as a formula, and the notes here include free text
 * a supervisor or a citizen typed. And lines end with CRLF, as the RFC asks.
 */
final class AuditCsv {

    private static final String HEADER =
            "time,kind,issue,category,action,from_status,to_status,level,actor_role,actor,note";

    private AuditCsv() {
    }

    static String write(List<AuditEntryDto> rows) {
        StringBuilder sb = new StringBuilder(HEADER).append("\r\n");
        for (AuditEntryDto r : rows) {
            sb.append(field(r.at().toString())).append(',')
              .append(field(r.kind())).append(',')
              .append(field(r.issueRef())).append(',')
              .append(field(r.category())).append(',')
              .append(field(r.action())).append(',')
              .append(field(r.fromStatus())).append(',')
              .append(field(r.toStatus())).append(',')
              .append(field(r.level() == null ? null : r.level().toString())).append(',')
              .append(field(r.actorRole())).append(',')
              .append(field(r.actorName())).append(',')
              .append(field(r.note())).append("\r\n");
        }
        return sb.toString();
    }

    static String field(String value) {
        if (value == null) {
            return "";
        }
        String v = value;
        if (!v.isEmpty() && "=+-@".indexOf(v.charAt(0)) >= 0) {
            v = "'" + v;
        }
        if (v.contains(",") || v.contains("\"") || v.contains("\n") || v.contains("\r")) {
            return "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }
}
