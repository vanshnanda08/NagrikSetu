-- Scoped retirement phase of scripts/refresh_thapar_dataset.py.
-- Deliberately refuses standalone execution. The Python driver backs up first,
-- validates exact demo identities, locks the affected tables, stages and checks
-- the replacement, and commits retirement + insertion together.
-- No geographic deletion, broad truncation, account deletion or status rewrite.
DO $$ BEGIN
    IF current_setting('nagriksetu.demo_refresh_authorized',true) IS DISTINCT FROM 'thapar-demo-v2'
       OR to_regclass('pg_temp.demo_refresh_old') IS NULL
       OR to_regclass('pg_temp.demo_refresh_reports') IS NULL THEN
        RAISE EXCEPTION 'Use the backed-up, staged refresh_thapar_dataset.py driver';
    END IF;
    IF EXISTS (SELECT 1 FROM reports r JOIN demo_refresh_old d ON d.id=r.issue_id
               WHERE NOT EXISTS(SELECT 1 FROM demo_refresh_reports x WHERE x.id=r.id)) THEN
        RAISE EXCEPTION 'A demo cluster contains preserved evidence; manual review required';
    END IF;
    IF EXISTS (SELECT 1 FROM issues i JOIN demo_refresh_old d ON d.id=i.merged_into_id
               WHERE NOT EXISTS(SELECT 1 FROM demo_refresh_old x WHERE x.id=i.id)) THEN
        RAISE EXCEPTION 'A preserved complaint points at a demo cluster';
    END IF;
    IF EXISTS (SELECT 1 FROM moderation_actions m
               WHERE (m.issue_id IN (SELECT id FROM demo_refresh_old)) IS DISTINCT FROM
                     (m.related_issue_id IN (SELECT id FROM demo_refresh_old))
                 AND m.related_issue_id IS NOT NULL
                 AND (m.issue_id IN (SELECT id FROM demo_refresh_old)
                   OR m.related_issue_id IN (SELECT id FROM demo_refresh_old))) THEN
        RAISE EXCEPTION 'Moderation connects demo and preserved complaints';
    END IF;
END $$;
DELETE FROM report_submissions WHERE result->>'issueId' IN (SELECT id::text FROM demo_refresh_old)
    OR result->>'reportId' IN (SELECT id::text FROM demo_refresh_reports);
DELETE FROM moderation_actions WHERE issue_id IN (SELECT id FROM demo_refresh_old)
    OR related_issue_id IN (SELECT id FROM demo_refresh_old);
DELETE FROM issue_messages WHERE issue_id IN (SELECT id FROM demo_refresh_old);
DELETE FROM issue_followers WHERE issue_id IN (SELECT id FROM demo_refresh_old);
DELETE FROM notifications WHERE issue_id IN (SELECT id FROM demo_refresh_old);
DELETE FROM verifications WHERE issue_id IN (SELECT id FROM demo_refresh_old);
DELETE FROM escalation_events WHERE issue_id IN (SELECT id FROM demo_refresh_old);
DELETE FROM issue_status_history WHERE issue_id IN (SELECT id FROM demo_refresh_old);
DELETE FROM reports WHERE id IN (SELECT id FROM demo_refresh_reports);
DELETE FROM issues WHERE id IN (SELECT id FROM demo_refresh_old);
