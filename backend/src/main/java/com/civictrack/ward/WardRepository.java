package com.civictrack.ward;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WardRepository extends JpaRepository<Ward, UUID> {

    /**
     * Resolves a coordinate to the ward containing it, or empty if the point
     * falls outside the service area.
     *
     * <p>{@code ST_Contains} is strict about boundaries: a point exactly on a
     * shared edge belongs to neither polygon rather than both, so the result is
     * deterministic and a report on a boundary is rejected as outside the
     * service area rather than being assigned arbitrarily. LIMIT 1 is defensive
     * only; the seeded polygons are disjoint and WardContainmentIT asserts it.
     */
    @Query(value = """
            SELECT w.id FROM wards w
            WHERE ST_Contains(w.boundary, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))
            LIMIT 1
            """, nativeQuery = true)
    Optional<UUID> findIdContaining(@Param("lat") double lat, @Param("lng") double lng);

    /**
     * Wards with their boundaries as GeoJSON.
     *
     * <p>A projection rather than a mapped column, so the polygon is converted
     * by PostGIS and travels as text. The entity stays free of the geometry --
     * see {@link Ward} for why -- and callers that only want a name never pay
     * for one.
     */
    @Query(value = """
            SELECT w.id                  AS id,
                   w.ward_number         AS wardNumber,
                   w.name                AS name,
                   ST_AsGeoJSON(w.boundary) AS boundary
            FROM wards w
            ORDER BY w.ward_number ASC
            """, nativeQuery = true)
    List<WardBoundaryRow> findAllWithBoundary();

    /**
     * Wards by distance from a point, nearest first. A ward containing the point
     * is at distance zero. Geography, not planar: standing rule 2.
     */
    @Query(value = """
            SELECT w.id AS id, w.ward_number AS wardNumber, w.name AS name,
                   ST_Distance(w.boundary::geography,
                               ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) AS distanceM
            FROM wards w
            ORDER BY distanceM ASC, w.ward_number ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<WardDistanceRow> nearest(@Param("lat") double lat, @Param("lng") double lng, @Param("limit") int limit);

    interface WardDistanceRow {
        UUID getId();
        int getWardNumber();
        String getName();
        double getDistanceM();
    }

    interface WardBoundaryRow {
        UUID getId();
        int getWardNumber();
        String getName();
        String getBoundary();
    }
}
