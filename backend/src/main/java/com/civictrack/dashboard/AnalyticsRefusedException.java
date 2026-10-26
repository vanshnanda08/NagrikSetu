package com.civictrack.dashboard;

import org.springframework.http.HttpStatus;

/** Department analytics asked for something the caller may not have; the detail says what to do instead. */
public class AnalyticsRefusedException extends RuntimeException {

    private final HttpStatus status;

    public AnalyticsRefusedException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}
