\if :{?scale}
\else
\echo 'Pass -v scale=1000, 10000, or 50000'
\quit
\endif

-- Scratch database only. The runner requires EVALUATION_ALLOW_RESET=yes.
TRUNCATE TABLE notifications, verifications, escalation_events,
    issue_status_history, moderation_actions, reports, issues RESTART IDENTITY CASCADE;

WITH chosen_ward AS (
    SELECT id, boundary FROM wards ORDER BY ward_number LIMIT 1
), points AS (
    SELECT row_number() OVER () AS n, w.id AS ward_id, dumped.geom
    FROM chosen_ward w
    CROSS JOIN LATERAL ST_Dump(ST_GeneratePoints(w.boundary, :scale, 42)) dumped
), category_list AS (
    SELECT array_agg(code ORDER BY code) AS codes FROM categories WHERE active
), prepared AS (
    SELECT p.*, c.codes[1 + ((p.n - 1) % cardinality(c.codes))::int] AS category_code
    FROM points p CROSS JOIN category_list c
)
INSERT INTO issues (
    public_ref, category_code, ward_id, department_id, status, priority,
    priority_score, centroid, sum_w, sum_wx, sum_wy, max_member_dist_m,
    report_count, distinct_reporter_count, first_reported_at, last_reported_at,
    due_at, created_at, updated_at
)
SELECT 'EV-' || :scale || '-' || lpad(p.n::text, 6, '0'), p.category_code,
       p.ward_id, c.department_id, 'NEW', 'MEDIUM', 10,
       p.geom, 0.01, 0.01 * ST_X(p.geom), 0.01 * ST_Y(p.geom), 0,
       1, 1, now() - interval '1 day', now() - interval '1 day',
       now() + interval '7 days', now() - interval '1 day', now() - interval '1 day'
FROM prepared p JOIN categories c ON c.code = p.category_code;

ANALYZE issues;
