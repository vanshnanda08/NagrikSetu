package com.civictrack.issue;

/** Supported work-queue orders; SQL receives only these fixed values. */
public enum QueueSort {
    NEWEST, OLDEST, PRIORITY;

    public static QueueSort parse(String raw) {
        if (raw == null) return PRIORITY;
        return switch (raw.strip().toLowerCase(java.util.Locale.ROOT)) {
            case "newest" -> NEWEST;
            case "oldest" -> OLDEST;
            default -> PRIORITY;
        };
    }

    public String value() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }
}
