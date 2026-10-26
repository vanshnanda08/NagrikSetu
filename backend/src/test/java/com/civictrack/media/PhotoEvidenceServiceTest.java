package com.civictrack.media;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;

class PhotoEvidenceServiceTest {
    @Test void rejectsForeignAndAmbiguousUrls() {
        var photos = new PhotoEvidenceService(true,"municipality");
        for (String url : new String[]{"http://res.cloudinary.com/municipality/image/upload/a.jpg",
            "https://127.0.0.1/a.jpg","https://res.cloudinary.com/another/image/upload/a.jpg",
            "https://res.cloudinary.com/municipality/image/upload/../a.jpg",
            "https://res.cloudinary.com/municipality/image/upload/%2e%2e/a.jpg",
            "https://res.cloudinary.com/municipality/image/upload/a.jpg?redirect=1"})
            assertThatThrownBy(() -> photos.checkedUri(url)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(photos.checkedUri("https://res.cloudinary.com/municipality/image/upload/f_auto,q_auto/v1/photo.jpg").toString())
            .isEqualTo("https://res.cloudinary.com/municipality/image/upload/f_jpg/q_auto/v1/photo.jpg");
    }
    @Test void hashesDecodedPixelsNotCallerMetadata() throws Exception {
        BufferedImage pixels = new BufferedImage(9,8,BufferedImage.TYPE_INT_RGB);
        for(int y=0;y<8;y++) for(int x=0;x<9;x++) pixels.setRGB(x,y,((8-x)*25)*0x010101);
        var bytes=new ByteArrayOutputStream(); ImageIO.write(pixels,"png",bytes);
        assertThat(PhotoEvidenceService.hashImage(bytes.toByteArray())).isEqualTo("ffffffffffffffff");
        assertThatThrownBy(() -> PhotoEvidenceService.hashImage("not an image".getBytes())).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(() -> PhotoEvidenceService.hashImage(new byte[]{(byte)255,(byte)216,(byte)255})).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
}
