package com.civictrack.seed;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;

/** Stages the projector demo's visible breach two minutes and thirty seconds out. */
@Component
@Profile("demo")
@Order(100)
@RequiredArgsConstructor
@Slf4j
public class DemoScenarioBootstrap implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final Clock clock;

    @Override
    public void run(ApplicationArguments args) {
        int changed = jdbc.update("""
                UPDATE issues SET due_at = ?, paused_seconds = 0, escalation_level = 0,
                                  last_escalated_at = NULL, updated_at = ?
                WHERE id = (
                    SELECT id FROM issues
                    WHERE status IN ('NEW','ACKNOWLEDGED','ASSIGNED','IN_PROGRESS','REOPENED')
                    ORDER BY first_reported_at, id LIMIT 1
                )
                """, Timestamp.from(clock.instant().plus(Duration.ofSeconds(150))),
                Timestamp.from(clock.instant()));
        if (changed == 1) {
            log.info("Demo scenario staged: one open issue breaches in 2 minutes 30 seconds");
        } else {
            log.warn("Demo scenario could not stage a breach because there is no open issue");
        }
    }
}
