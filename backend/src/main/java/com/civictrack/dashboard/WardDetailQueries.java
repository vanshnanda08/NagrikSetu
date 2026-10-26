package com.civictrack.dashboard;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.civictrack.dashboard.DashboardQueries.OPEN;

/**
 * What only a ward page needs: its boundary, issue density, and recurrence.
 *
 * <p>Both groupings snap issue centroids to a grid with {@code ST_SnapToGrid}.
 * Density uses a coarse cell (about 165 m) to show where problems concentrate;
 * recurrence uses a fine one (about 55 m, the scale of a single defect's merge
 * radius) because it asks "the same spot", not "the same neighbourhood". Merged-
 * away duplicates and rejected issues are left out of both: neither is a
 * problem that was real and separate.
 */
@Repository
@RequiredArgsConstructor
public class WardDetailQueries {

    static final double DENSITY_CELL_DEG = 0.0015;
    static final double RECURRENCE_CELL_DEG = 0.0005;
    private static final int MAX_CELLS = 400;
    private static final int MAX_RECURRENCE = 25;

    private final NamedParameterJdbcTemplate jdbc;

    public Optional<WardDashboardDto.Ward> ward(UUID id) {
        return jdbc.query("""
                SELECT w.id, w.ward_number, w.name, ST_AsGeoJSON(w.boundary) AS boundary
                FROM wards w WHERE w.id = :id
                """, new MapSqlParameterSource("id", id),
                (rs, n) -> new WardDashboardDto.Ward(rs.getObject("id", UUID.class), rs.getInt("ward_number"),
                        rs.getString("name"), rs.getString("boundary"))).stream().findFirst();
    }

    public List<WardDashboardDto.DensityCell> density(UUID wardId) {
        return jdbc.query("""
                SELECT AVG(ST_Y(i.centroid)) AS lat, AVG(ST_X(i.centroid)) AS lng,
                       COUNT(*) AS issues, COUNT(*) FILTER (WHERE %s) AS open
                FROM issues i
                WHERE i.ward_id = :wardId AND i.merged_into_id IS NULL AND i.status <> 'REJECTED'
                GROUP BY ST_SnapToGrid(i.centroid, :cell)
                ORDER BY issues DESC, lat, lng
                LIMIT :limit
                """.formatted(OPEN),
                new MapSqlParameterSource("wardId", wardId).addValue("cell", DENSITY_CELL_DEG).addValue("limit", MAX_CELLS),
                (rs, n) -> new WardDashboardDto.DensityCell(rs.getDouble("lat"), rs.getDouble("lng"),
                        rs.getLong("issues"), rs.getLong("open")));
    }

    public List<WardDashboardDto.RecurrenceSpot> recurrence(UUID wardId) {
        return jdbc.query("""
                SELECT i.category_code, c.display_name,
                       AVG(ST_Y(i.centroid)) AS lat, AVG(ST_X(i.centroid)) AS lng,
                       COUNT(*) AS issues, COUNT(*) FILTER (WHERE %s) AS open,
                       MIN(i.first_reported_at) AS first_at, MAX(i.first_reported_at) AS last_at,
                       ARRAY_AGG(i.public_ref ORDER BY i.first_reported_at DESC, i.id) AS refs,
                       ARRAY_AGG(i.id::text ORDER BY i.first_reported_at DESC, i.id) AS ids
                FROM issues i JOIN categories c ON c.code = i.category_code
                WHERE i.ward_id = :wardId AND i.merged_into_id IS NULL AND i.status <> 'REJECTED'
                GROUP BY i.category_code, c.display_name, ST_SnapToGrid(i.centroid, :cell)
                HAVING COUNT(*) > 1
                ORDER BY issues DESC, last_at DESC
                LIMIT :limit
                """.formatted(OPEN),
                new MapSqlParameterSource("wardId", wardId).addValue("cell", RECURRENCE_CELL_DEG).addValue("limit", MAX_RECURRENCE),
                (rs, n) -> new WardDashboardDto.RecurrenceSpot(rs.getString("category_code"), rs.getString("display_name"),
                        rs.getDouble("lat"), rs.getDouble("lng"), rs.getLong("issues"), rs.getLong("open"),
                        rs.getTimestamp("first_at").toInstant(), rs.getTimestamp("last_at").toInstant(),
                        Arrays.asList((String[]) rs.getArray("refs").getArray()),
                        Arrays.stream((String[]) rs.getArray("ids").getArray()).map(UUID::fromString).toList()));
    }
}
