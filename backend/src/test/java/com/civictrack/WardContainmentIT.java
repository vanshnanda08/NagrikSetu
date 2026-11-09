package com.civictrack;

import com.civictrack.common.geo.GeoFactory;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Point;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The lat/lng canary, and the phase-1 proof that the spatial round trip works
 * end to end: a Java {@link Point} built by {@link GeoFactory} travels through
 * JDBC into PostGIS, is compared against a stored MultiPolygon, and resolves
 * to the ward a human would have named.
 *
 * <p>The project report rates a swapped latitude and longitude as a
 * high-likelihood, high-impact risk, and it is: the swap throws nothing,
 * corrupts nothing visibly, and surfaces as a ward lookup failing several
 * layers away from the mistake. A unit test on {@code GeoFactory} cannot catch
 * it, because both ordinates of a Patiala coordinate are valid in both
 * positions. Only a round trip against real geometry can, which is what this
 * class is.
 */
class WardContainmentIT extends IntegrationTestBase {

    // Patiala demo sector north-west of Thapar Institute. Comfortably inside ward 1, not
    // near an edge, so the test asserts containment rather than tie-breaking.
    private static final double PATIALA_LAT = 30.3860;
    private static final double PATIALA_LNG = 76.3260;
    private static final int EXPECTED_WARD = 1;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    @DisplayName("Thapar Institute and nearby locations resolve to the Patiala demo wards")
    void thaparCampusIsServiced() {
        assertThat(wardNumberContaining(GeoFactory.point(30.355833, 76.365))).isEqualTo(3);
        assertThat(wardNumberContaining(GeoFactory.point(30.36, 76.36))).isEqualTo(1);
        assertThat(wardNumberContaining(GeoFactory.point(30.36, 76.37))).isEqualTo(2);
        assertThat(wardNumberContaining(GeoFactory.point(30.35, 76.37))).isEqualTo(4);
        assertThat(wardNumberContaining(GeoFactory.point(30.93, 75.82))).isNull();
    }

    @Test
    @DisplayName("a known Patiala coordinate falls inside the ward a human would name")
    void knownCoordinateResolvesToKnownWard() {
        Integer ward = wardNumberContaining(GeoFactory.point(PATIALA_LAT, PATIALA_LNG));

        assertThat(ward).isEqualTo(EXPECTED_WARD);
    }

    @Test
    @DisplayName("the same coordinate with lat and lng swapped falls in no ward at all")
    void swappedCoordinateResolvesToNothing() {
        // (30.386, 76.326) reversed is a point in the Indian Ocean, roughly off
        // the Somali coast. If a swap is ever introduced upstream, this is the
        // assertion that fails first and names the cause.
        Point swapped = GeoFactory.point(PATIALA_LNG, PATIALA_LAT);

        assertThat(wardNumberContaining(swapped))
                .as("a swapped coordinate must not resolve to a ward; if this passes, "
                    + "something upstream is silently reversing lat and lng")
                .isNull();
    }

    @Test
    @DisplayName("wards are disjoint, so no interior coordinate resolves to two of them")
    void wardsDoNotOverlap() {
        Integer overlapping = jdbc.queryForObject("""
                SELECT count(*) FROM wards a JOIN wards b ON a.id < b.id
                WHERE ST_Overlaps(a.boundary, b.boundary)
                """, Integer.class);

        assertThat(overlapping).isZero();
    }

    @Test
    @DisplayName("a coordinate outside the service area resolves to no ward")
    void coordinateOutsideServiceAreaResolvesToNothing() {
        // Delhi. Well outside the seeded Patiala grid, and the case that must
        // produce a clean "outside service area" rejection at ingest rather
        // than a null ward_id on an issue row.
        assertThat(wardNumberContaining(GeoFactory.point(28.6139, 77.2090))).isNull();
    }

    @Test
    @DisplayName("distances come back as geodesic metres, not degrees")
    void distanceIsGeodesicMetres() {
        // Two points 0.0002 degrees of longitude apart at Patiala's latitude.
        // Planar arithmetic would call this 0.0002 of something; the geography
        // cast calls it roughly 19 m, which is the number the merge radius is
        // actually compared against. Standing rule 2.
        Double metres = jdbc.queryForObject("""
                SELECT ST_Distance(
                    ST_SetSRID(ST_MakePoint(76.3630, 30.3570), 4326)::geography,
                    ST_SetSRID(ST_MakePoint(76.3632, 30.3570), 4326)::geography)
                """, Double.class);

        assertThat(metres).isBetween(18.0, 20.0);
    }

    /** Returns the ward number containing the point, or null if none does. */
    private Integer wardNumberContaining(Point p) {
        return jdbc.query("""
                SELECT ward_number FROM wards
                WHERE ST_Contains(boundary, ST_SetSRID(ST_MakePoint(?, ?), 4326))
                """,
                rs -> rs.next() ? rs.getInt(1) : null,
                GeoFactory.lngOf(p), GeoFactory.latOf(p));
    }
}
