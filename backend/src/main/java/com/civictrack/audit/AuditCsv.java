package com.civictrack.audit;

import java.util.List;

/**
 * RFC 4180 CSV for the audit log.
 *
 * <p>Two things beyond quoting. Formula prefixes {@code = + - @}, including
 * those hidden behind whitespace or control characters, are prefixed with an
 * apostrophe. Spreadsheet importers may ignore those leading characters. This
 * changes only the export, never the recorded note. Lines end with CRLF.
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
        if (startsFormula(v)) {
            v = "'" + v;
        }
        if (v.contains(",") || v.contains("\"") || v.contains("\n") || v.contains("\r")) {
            return "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }

    private static boolean startsFormula(String value) {
        int offset = 0;
        while (offset < value.length()) {
            int codePoint = value.codePointAt(offset);
            if (!Character.isWhitespace(codePoint) && !Character.isSpaceChar(codePoint)
                    && !Character.isISOControl(codePoint) && Character.getType(codePoint) != Character.FORMAT) {
                return "=+-@".indexOf(codePoint) >= 0;
            }
            offset += Character.charCount(codePoint);
        }
        return false;
    }
}
