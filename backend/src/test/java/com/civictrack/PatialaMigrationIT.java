package com.civictrack;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import static org.assertj.core.api.Assertions.assertThat;

class PatialaMigrationIT extends IntegrationTestBase {
    @Autowired private JdbcTemplate admin;

    @Test
    void upgradesExistingDatabaseWithoutRewritingComplaintEvidence() {
        // A separate disposable database exercises the real V10 -> V11 path
        // without changing the shared integration-test schema.
        String database = "patiala_upgrade_test";
        admin.execute("CREATE DATABASE " + database);
        try {
            String url = "jdbc:postgresql://" + POSTGRES.getHost() + ":"
                    + POSTGRES.getMappedPort(5432) + "/" + database;
            var source = new DriverManagerDataSource(url, POSTGRES.getUsername(), POSTGRES.getPassword());
            var jdbc = new JdbcTemplate(source);
            Flyway.configure().dataSource(source).target("10").load().migrate();
            var wardsBefore = jdbc.queryForList("SELECT id, officer_user_id FROM wards ORDER BY ward_number");
            jdbc.update("""
                    INSERT INTO issues (public_ref, category_code, ward_id, centroid,
                                        sum_w, sum_wx, sum_wy, due_at)
                    SELECT 'CT-MIGRATION', 'POTHOLE', id,
                           ST_SetSRID(ST_MakePoint(75.82, 30.93), 4326),
                           1, 75.82, 30.93, now() + interval '72 hours'
                    FROM wards WHERE ward_number = 1
                    """);
            jdbc.update("""
                    INSERT INTO reports (issue_id, device_id, category_code, location,
                                         gps_accuracy_m, photo_url, cluster_decision)
                    SELECT id, 'historical-report', 'POTHOLE', centroid, 8,
                           'https://example.test/evidence.jpg', 'NEW_ISSUE'
                    FROM issues WHERE public_ref = 'CT-MIGRATION'
                    """);
            var evidenceBefore = jdbc.queryForMap("""
                    SELECT ST_AsText(i.centroid) AS centroid, i.sum_wx, i.sum_wy,
                           ST_AsText(r.location) AS location, r.photo_url
                    FROM issues i JOIN reports r ON r.issue_id = i.id
                    """);

            var flyway = Flyway.configure().dataSource(source).load();
            assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1);
            flyway.validate();

            assertThat(jdbc.queryForList("SELECT id, officer_user_id FROM wards ORDER BY ward_number"))
                    .isEqualTo(wardsBefore);
            assertThat(jdbc.queryForMap("""
                    SELECT ST_AsText(i.centroid) AS centroid, i.sum_wx, i.sum_wy,
                           ST_AsText(r.location) AS location, r.photo_url
                    FROM issues i JOIN reports r ON r.issue_id = i.id
                    """)).isEqualTo(evidenceBefore);
            assertThat(jdbc.queryForObject("""
                    SELECT name FROM wards
                    WHERE ST_Contains(boundary, ST_SetSRID(ST_MakePoint(76.365, 30.355833), 4326))
                    """, String.class)).isEqualTo("Ward 3 - Thapar South West");
        } finally {
            admin.execute("DROP DATABASE " + database);
        }
    }
}
