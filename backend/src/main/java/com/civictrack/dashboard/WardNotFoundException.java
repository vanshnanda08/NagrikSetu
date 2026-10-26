package com.civictrack.dashboard;

import java.util.UUID;

public class WardNotFoundException extends RuntimeException {

    public WardNotFoundException(UUID id) {
        super("There is no ward " + id + ".");
    }
}
