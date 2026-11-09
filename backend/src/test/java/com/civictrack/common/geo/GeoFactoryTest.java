package com.civictrack.common.geo;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Point;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Standing rule 3 has one job: prevent the lat/lng swap. These tests pin the
 * ordering contract so that a later refactor cannot quietly reverse it.
 */
class GeoFactoryTest {

    // Patiala demo sector north-west of Thapar Institute, Patiala. The canonical
    // known-good coordinate for this project.
    private static final double PATIALA_LAT = 30.356965;
    private static final double PATIALA_LNG = 76.363277;

    @Test
    @DisplayName("latitude becomes y and longitude becomes x, not the reverse")
    void ordersCoordinatesAsXLngYLat() {
        Point p = GeoFactory.point(PATIALA_LAT, PATIALA_LNG);

        assertThat(p.getY()).isEqualTo(PATIALA_LAT);
        assertThat(p.getX()).isEqualTo(PATIALA_LNG);
        assertThat(p.getSRID()).isEqualTo(4326);
    }

    @Test
    @DisplayName("accessors read back what was written")
    void accessorsRoundTrip() {
        Point p = GeoFactory.point(PATIALA_LAT, PATIALA_LNG);

        assertThat(GeoFactory.latOf(p)).isEqualTo(PATIALA_LAT);
        assertThat(GeoFactory.lngOf(p)).isEqualTo(PATIALA_LNG);
    }

    @Test
    @DisplayName("an out-of-range latitude is rejected by name, not silently accepted")
    void rejectsOutOfRangeLatitude() {
        assertThatThrownBy(() -> GeoFactory.point(120.0, 30.356))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Latitude out of range")
                .hasMessageContaining("lat, lng");
    }

    @Test
    @DisplayName("an out-of-range longitude is rejected")
    void rejectsOutOfRangeLongitude() {
        assertThatThrownBy(() -> GeoFactory.point(30.356, 200.0))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Longitude out of range");
    }

    @Test
    @DisplayName("a swapped Patiala coordinate passes the range check, which is why the ward canary exists")
    void rangeCheckAloneCannotCatchThePatialaSwap() {
        // Both ordinates of a Patiala coordinate are under 90, so swapping
        // them produces a point that is perfectly valid in range terms and
        // completely wrong in fact. The range check catches gross errors only.
        // This is deliberately asserted rather than left implicit: it is the
        // reason WardContainmentIT exists, and someone strengthening this
        // class later should know the range check was never meant to be
        // sufficient on its own.
        Point swapped = GeoFactory.point(PATIALA_LNG, PATIALA_LAT);

        assertThat(swapped.getY()).isEqualTo(PATIALA_LNG);
        assertThat(GeoFactory.latOf(swapped)).isNotEqualTo(PATIALA_LAT);
    }

    @Test
    @DisplayName("GeoFactory exposes no distance method")
    void exposesNoDistanceMethod() {
        // Standing rule 2: every distance is geodesic and comes from PostGIS.
        // A metre figure computed in Java from SRID 4326 degrees would be
        // wrong by a latitude-dependent factor. The absence of the method is
        // the enforcement, so the absence is what gets asserted.
        assertThat(GeoFactory.class.getDeclaredMethods())
                .extracting(Method::getName)
                .noneMatch(name -> name.toLowerCase().contains("distance"));
    }
}
