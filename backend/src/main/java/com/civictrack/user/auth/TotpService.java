package com.civictrack.user.auth;

import com.civictrack.user.AppUser;
import com.civictrack.user.ProfileRefusedException;
import com.civictrack.user.Role;
import com.civictrack.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** TOTP enrolment, replay-safe verification, and single-use recovery codes. */
@Service
@RequiredArgsConstructor
public class TotpService {
    private static final String ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final int PERIOD_SECONDS = 30;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository users;
    private final JdbcTemplate jdbc;
    private final JwtProperties jwt;
    private final Clock clock;
    private final PasswordEncoder passwords;
    private final com.civictrack.abuse.RateLimitService limits;

    @Transactional
    public Setup begin(UUID userId, String currentPassword) {
        limits.checkSecurity(userId);
        AppUser user = locked(userId);
        if (user.isMfaEnabled()) {
            throw new ProfileRefusedException("An authenticator is already enabled. Use your existing authenticator or a recovery code to sign in.");
        }
        if (user.getPasswordHash() == null || !passwords.matches(currentPassword, user.getPasswordHash())) {
            throw new ProfileRefusedException("Your current password is not correct.");
        }
        byte[] secret = new byte[20];
        RANDOM.nextBytes(secret);
        String encoded = base32(secret);
        user.setMfaSecret(encrypt(encoded));
        user.setMfaEnabled(false);
        user.setMfaLastCounter(null);
        users.save(user);
        jdbc.update("DELETE FROM mfa_recovery_codes WHERE user_id = ?", userId);
        String label = url(user.getEmail() == null ? user.getFullName() : user.getEmail());
        String uri = "otpauth://totp/NagrikSetu:" + label
                + "?secret=" + encoded + "&issuer=NagrikSetu&algorithm=SHA1&digits=6&period=30";
        return new Setup(encoded, uri);
    }

    @Transactional
    public List<String> enable(UUID userId, String code) {
        limits.checkSecurity(userId);
        AppUser user = locked(userId);
        if (user.isMfaEnabled()) {
            throw new ProfileRefusedException("An authenticator is already enabled. Recovery codes cannot be regenerated through setup.");
        }
        if (user.getMfaSecret() == null) {
            throw new ProfileRefusedException("Start authenticator setup before confirming a code.");
        }
        long counter = matchingCounter(decrypt(user.getMfaSecret()), code);
        if (counter < 0) {
            throw new ProfileRefusedException("That authenticator code is not valid.");
        }
        user.setMfaEnabled(true);
        user.setMfaLastCounter(counter);
        users.save(user);
        // Existing password-only sessions must not survive MFA enrolment.
        jdbc.update("UPDATE refresh_sessions SET revoked=true WHERE user_id=?", userId);
        jdbc.update("DELETE FROM mfa_recovery_codes WHERE user_id = ?", userId);
        List<String> raw = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            byte[] bytes = new byte[10];
            RANDOM.nextBytes(bytes);
            String compact = base32(bytes);
            String shown = compact.substring(0, 4) + "-" + compact.substring(4, 8)
                    + "-" + compact.substring(8, 12) + "-" + compact.substring(12, 16);
            raw.add(shown);
            jdbc.update("INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES (?,?)",
                    userId, digest(normaliseRecovery(shown)));
        }
        return List.copyOf(raw);
    }

    /** Called only after the password has matched. */
    @Transactional(noRollbackFor = InvalidCredentialsException.class)
    public void verifyLogin(AppUser user, String code) {
        if (!user.isMfaEnabled()) {
            return;
        }
        if (code == null || code.isBlank()) {
            throw new MfaRequiredException();
        }
        String trimmed = code.strip();
        if (trimmed.matches("\\d{6}")) {
            long counter = matchingCounter(decrypt(user.getMfaSecret()), trimmed);
            if (counter < 0) {
                throw invalid();
            }
            int changed = jdbc.update("UPDATE users SET mfa_last_counter=? WHERE id=? AND (mfa_last_counter IS NULL OR mfa_last_counter < ?)",
                    counter, user.getId(), counter);
            if (changed != 1) {
                throw new InvalidCredentialsException("That authenticator code was already used. Wait for the next code.");
            }
            return;
        }
        String hash = digest(normaliseRecovery(trimmed));
        int changed = jdbc.update("UPDATE mfa_recovery_codes SET used_at=? WHERE user_id=? AND code_hash=? AND used_at IS NULL",
                java.sql.Timestamp.from(clock.instant()), user.getId(), hash);
        if (changed != 1) {
            throw invalid();
        }
    }

    public static boolean required(AppUser user) {
        return user.getRole() == Role.STAFF || user.getRole() == Role.SUPERVISOR || user.getRole() == Role.ADMIN;
    }

    private AppUser locked(UUID userId) {
        jdbc.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE", UUID.class, userId);
        return users.findById(userId).orElseThrow(() -> new ProfileRefusedException("The account no longer exists."));
    }

    private long matchingCounter(String encodedSecret, String candidate) {
        byte[] secret = decodeBase32(encodedSecret);
        long current = clock.instant().getEpochSecond() / PERIOD_SECONDS;
        for (long counter = current - 1; counter <= current + 1; counter++) {
            if (MessageDigest.isEqual(code(secret, counter).getBytes(StandardCharsets.US_ASCII),
                    candidate.getBytes(StandardCharsets.US_ASCII))) {
                return counter;
            }
        }
        return -1;
    }

    private static String code(byte[] secret, long counter) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret, "HmacSHA1"));
            byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(counter).array());
            int offset = hash[hash.length - 1] & 0x0f;
            int binary = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16)
                    | ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
            return "%06d".formatted(binary % 1_000_000);
        } catch (Exception ex) {
            throw new IllegalStateException("TOTP calculation failed", ex);
        }
    }

    private String encrypt(String value) {
        try {
            byte[] iv = new byte[12];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKey(), new GCMParameterSpec(128, iv));
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.US_ASCII));
            byte[] joined = ByteBuffer.allocate(iv.length + encrypted.length).put(iv).put(encrypted).array();
            return Base64.getUrlEncoder().withoutPadding().encodeToString(joined);
        } catch (Exception ex) {
            throw new IllegalStateException("MFA secret encryption failed", ex);
        }
    }

    private String decrypt(String value) {
        try {
            byte[] joined = Base64.getUrlDecoder().decode(value);
            byte[] iv = java.util.Arrays.copyOfRange(joined, 0, 12);
            byte[] encrypted = java.util.Arrays.copyOfRange(joined, 12, joined.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.US_ASCII);
        } catch (Exception ex) {
            throw new IllegalStateException("MFA secret decryption failed", ex);
        }
    }

    private SecretKeySpec encryptionKey() throws Exception {
        byte[] derived = MessageDigest.getInstance("SHA-256")
                .digest(("nagriksetu-mfa:" + jwt.secret()).getBytes(StandardCharsets.UTF_8));
        return new SecretKeySpec(derived, "AES");
    }

    private static String digest(String code) {
        return TokenDigests.sha256(code);
    }

    private static String normaliseRecovery(String code) {
        return code.replace("-", "").replace(" ", "").toUpperCase(Locale.ROOT);
    }

    private static InvalidCredentialsException invalid() {
        return new InvalidCredentialsException("The multi-factor code is incorrect or has expired.");
    }

    private static String url(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String base32(byte[] bytes) {
        StringBuilder out = new StringBuilder();
        int buffer = 0, bits = 0;
        for (byte value : bytes) {
            buffer = (buffer << 8) | (value & 0xff);
            bits += 8;
            while (bits >= 5) {
                out.append(ALPHABET.charAt((buffer >> (bits - 5)) & 31));
                bits -= 5;
            }
        }
        if (bits > 0) out.append(ALPHABET.charAt((buffer << (5 - bits)) & 31));
        return out.toString();
    }

    private static byte[] decodeBase32(String text) {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        int buffer = 0, bits = 0;
        for (char c : text.toUpperCase(Locale.ROOT).toCharArray()) {
            int value = ALPHABET.indexOf(c);
            if (value < 0) continue;
            buffer = (buffer << 5) | value;
            bits += 5;
            if (bits >= 8) {
                out.write((buffer >> (bits - 8)) & 0xff);
                bits -= 8;
            }
        }
        return out.toByteArray();
    }

    public record Setup(String secret, String provisioningUri) {}
}
