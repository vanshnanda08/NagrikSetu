package com.civictrack.report;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.time.Instant;
import java.util.UUID;

public interface ReportRepository extends JpaRepository<Report, UUID> {

    List<Report> findByIssueIdOrderByCreatedAtAsc(UUID issueId);

    int countByIssueId(UUID issueId);

    /**
     * One citizen's own reports, newest first.
     *
     * <p>LIMIT and OFFSET are bound directly rather than going through a
     * {@code Pageable}, because the caller pages by offset and converting an
     * offset to a page number is only correct when the offset happens to be a
     * multiple of the page size. Every other offset would silently return the
     * wrong window.
     *
     * <p>The id is the tiebreak on {@code created_at} so that two reports
     * submitted in the same clock tick cannot swap places between pages and
     * make one of them unreachable.
     */
    @Query(value = """
            SELECT * FROM reports r
            WHERE r.reporter_id = :reporterId
            ORDER BY r.created_at DESC, r.id ASC
            LIMIT :limit OFFSET :offset
            """, nativeQuery = true)
    List<Report> findByReporter(@Param("reporterId") UUID reporterId,
                                @Param("limit") int limit,
                                @Param("offset") int offset);

    long countByReporterId(UUID reporterId);

    long countByReporterIdAndCreatedAtGreaterThanEqual(UUID reporterId, Instant since);

    boolean existsByPhotoHash(String photoHash);

    @Query(value = """
            SELECT EXISTS (
              SELECT 1 FROM reports r
              WHERE r.device_id = :deviceId
                AND r.category_code = :category
                AND r.created_at >= :since
                AND ST_DWithin(r.location::geography,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                    :radius)
            )
            """, nativeQuery = true)
    boolean existsRecentNearby(@Param("deviceId") String deviceId,
                               @Param("category") String category,
                               @Param("since") Instant since,
                               @Param("lat") double lat,
                               @Param("lng") double lng,
                               @Param("radius") double radius);

    /**
     * Geodesic distance from a point to the furthest of these reports -- the
     * exact cluster extent, by rescan. Used only by supervisor moderation
     * (DD-063), where a human is waiting and the member set is being redrawn
     * by hand, so there is no running bound to maintain. Ingest never calls
     * this: it keeps the O(1) upper bound of DD-001.
     */
    @Query(value = """
            SELECT COALESCE(MAX(ST_Distance(r.location::geography,
                       ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography)), 0)
            FROM reports r WHERE r.id IN (:ids)
            """, nativeQuery = true)
    double maxDistanceFrom(@Param("ids") java.util.Collection<UUID> ids,
                           @Param("lat") double lat, @Param("lng") double lng);

    List<Report> findByIdIn(java.util.Collection<UUID> ids);

    /** Member reports of several issues at once: the review queue's thumbnails, in one query. */
    List<Report> findByIssueIdInOrderByCreatedAtAsc(java.util.Collection<UUID> issueIds);
}
