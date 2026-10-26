package com.civictrack.media;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;

/** Fetches only this application's image CDN, before any ingest transaction. */
@Service
public class PhotoEvidenceService {
    private final boolean required;
    private final String cloud;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    public PhotoEvidenceService(@Value("${civictrack.media.verify-evidence:true}") boolean required,
                                @Value("${civictrack.cloudinary.cloud-name:}") String cloud) {
        this.required = required;
        this.cloud = cloud;
    }

    public String verify(String url, String untrustedHash) {
        // Explicit fixture mode only; never silently enabled by missing credentials.
        if (!required) return untrustedHash;
        URI uri = checkedUri(url);
        try {
            var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10))
                    .header("Accept", "image/jpeg,image/png").GET().build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (var stream = response.body()) {
                if (response.statusCode() != 200) throw refused("The uploaded photo could not be verified. Upload it again.");
                byte[] bytes = stream.readNBytes(8 * 1024 * 1024 + 1);
                if (bytes.length > 8 * 1024 * 1024) throw refused("The photo is too large.");
                return hashImage(bytes);
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw refused("Photo verification was interrupted. Retry submission.");
        } catch (java.io.IOException ex) {
            throw refused("Photo verification is unavailable. Retry submission.");
        }
    }

    URI checkedUri(String value) {
        if (cloud.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "Photo storage is not configured. Contact the administrator.");
        try {
            URI uri = URI.create(value);
            String prefix = "/" + cloud + "/image/upload/";
            if (!"https".equals(uri.getScheme()) || !"res.cloudinary.com".equals(uri.getHost())
                    || uri.getPort() != -1 || uri.getUserInfo() != null || uri.getQuery() != null
                    || uri.getFragment() != null || !uri.getRawPath().startsWith(prefix)
                    || uri.getRawPath().contains("%") || uri.getRawPath().contains("..")) {
                throw refused("Use a photo uploaded through this application.");
            }
            // Fetch a deterministic JPEG delivery rendition; f_auto varies by client.
            return URI.create("https://res.cloudinary.com" + prefix + "f_jpg/" + uri.getRawPath().substring(prefix.length())
                    .replace("f_auto,", ""));
        } catch (IllegalArgumentException ex) { throw refused("The photo URL is invalid."); }
    }

    static String hashImage(byte[] bytes) {
        boolean jpeg = bytes.length >= 3 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255;
        boolean png = bytes.length >= 8 && bytes[0] == (byte)137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71;
        if (!jpeg && !png) throw refused("The uploaded bytes are not a supported photo.");
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw refused("The photo could not be decoded.");
            var reader = readers.next();
            BufferedImage original;
            try {
                reader.setInput(input);
                long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                if (pixels > 20_000_000) throw refused("The photo dimensions are too large.");
                original = reader.read(0);
            } finally { reader.dispose(); }
            BufferedImage tiny = new BufferedImage(9, 8, BufferedImage.TYPE_INT_RGB);
            var graphics = tiny.createGraphics();
            try { graphics.drawImage(original, 0, 0, 9, 8, null); } finally { graphics.dispose(); }
            long hash = 0;
            for (int y = 0; y < 8; y++) for (int x = 0; x < 8; x++) {
                hash = (hash << 1) | (luminance(tiny.getRGB(x,y)) > luminance(tiny.getRGB(x+1,y)) ? 1 : 0);
            }
            return String.format("%016x", hash);
        } catch (java.io.IOException ex) { throw refused("The photo is damaged or incomplete."); }
    }
    private static double luminance(int rgb) {
        return ((rgb >> 16) & 255) * .299 + ((rgb >> 8) & 255) * .587 + (rgb & 255) * .114;
    }
    private static ResponseStatusException refused(String message) {
        return new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, message);
    }
}
