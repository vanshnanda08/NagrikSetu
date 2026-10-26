package com.civictrack.user;

import com.civictrack.user.auth.PasswordPolicy;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class PasswordPolicyTest {
    @Test void acceptsBoundaryAndUnicodeWithinByteLimit() {
        assertThatCode(() -> PasswordPolicy.validate("a".repeat(72))).doesNotThrowAnyException();
        assertThatCode(() -> PasswordPolicy.validate("界".repeat(24))).doesNotThrowAnyException();
    }
    @Test void rejectsOversizedBytesEvenWhenCharacterCountIsShort() {
        assertThatThrownBy(() -> PasswordPolicy.validate("a".repeat(73))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> PasswordPolicy.validate("界".repeat(25))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> PasswordPolicy.validate("short")).isInstanceOf(ResponseStatusException.class);
    }
}
