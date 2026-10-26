package com.civictrack.user.auth;

/** Password authentication succeeded, but this account still needs its second factor. */
public class MfaRequiredException extends RuntimeException {
    public MfaRequiredException() {
        super("Enter the six-digit code from your authenticator app or a recovery code.");
    }
}
