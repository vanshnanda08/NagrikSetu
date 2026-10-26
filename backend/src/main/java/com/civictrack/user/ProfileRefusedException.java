package com.civictrack.user;

/** A profile change that is well-formed but cannot be made; the message says why. */
public class ProfileRefusedException extends RuntimeException {

    public ProfileRefusedException(String message) {
        super(message);
    }
}
