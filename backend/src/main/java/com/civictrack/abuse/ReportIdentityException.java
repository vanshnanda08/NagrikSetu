package com.civictrack.abuse;

/** Anonymous reports require a stable, opaque device identifier. */
public class ReportIdentityException extends RuntimeException {
    public ReportIdentityException() {
        super("Anonymous reports require a device identifier. Refresh the page and try again.");
    }
}
