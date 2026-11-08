package com.civictrack.sla;

import com.civictrack.IntegrationTestBase;
import com.civictrack.clustering.*;
import com.civictrack.issue.*;
import com.civictrack.moderation.ModerationService;
import com.civictrack.report.ReportRepository;
import com.civictrack.sla.escalation.*;
import com.civictrack.support.Fixtures;
import com.civictrack.support.MutableClock;
import com.civictrack.user.Actor;
import com.civictrack.user.Role;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import java.time.Instant;
import java.time.Duration;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

class SlaRearmRegressionIT extends IntegrationTestBase {
    @Autowired Fixtures fixtures;
    @Autowired MutableClock clock;
    @Autowired IssueRepository issues;
    @Autowired ClusteringService clustering;
    @Autowired EscalationService escalations;
    @Autowired PriorityRecomputer priorities;
    @Autowired ModerationService moderation;
    @Autowired ReportRepository reports;
    final Instant now=Instant.parse("2026-03-01T09:00:00Z");
    Actor admin;
    @BeforeEach void setup() {
        fixtures.clearIssues(); clock.set(now.minus(Duration.ofDays(7)));
        admin=new Actor(fixtures.user(Role.ADMIN,null,null).getId(),Role.ADMIN,null,null);
    }
    @AfterEach void restoreClock() { clock.reset(); }
    UUID ingest() {
        return clustering.ingest(new IngestReportCommand("POTHOLE",GeoFixtures.LAT,GeoFixtures.LNG,8.0,false,
                "A damaged road surface",null,null,"https://example.test/before.jpg",null,null,"sla-"+UUID.randomUUID())).issueId();
    }
    UUID rearmedCluster() {
        UUID id=ingest(); assertThat(ingest()).isEqualTo(id);
        clock.set(now); assertThat(escalations.escalateOne(id,now)).isEqualTo(EscalationOutcome.ESCALATED);
        assertThat(issues.findById(id).orElseThrow().getDueAt()).isAfter(now); return id;
    }
    @Test void newReportsAndScheduledPriorityDoNotUndoTheEscalationGrant() {
        UUID id=rearmedCluster(); Instant due=issues.findById(id).orElseThrow().getDueAt();
        assertThat(ingest()).isEqualTo(id);
        assertThat(issues.findById(id).orElseThrow().getDueAt()).isEqualTo(due);
        priorities.recomputeAll(now,20);
        assertThat(issues.findById(id).orElseThrow().getDueAt()).isEqualTo(due);
        assertThat(escalations.escalateOne(id,now)).isEqualTo(EscalationOutcome.NOT_BREACHED);
        clock.set(due.plusSeconds(1));
        assertThat(escalations.escalateOne(id,clock.instant())).isEqualTo(EscalationOutcome.ESCALATED);
        assertThat(issues.findById(id).orElseThrow().getEscalationLevel()).isEqualTo(2);
        assertThat(issues.findById(id).orElseThrow().getDueAt()).isAfter(clock.instant());
    }
    @Test void recategorisingAnEscalatedIssuePreservesItsExistingGrant() {
        UUID id=rearmedCluster(); Instant due=issues.findById(id).orElseThrow().getDueAt();
        moderation.recategorise(id,"SIGNAGE",admin,"Reviewed the category against the original evidence.");
        assertThat(issues.findById(id).orElseThrow().getDueAt()).isEqualTo(due);
        moderation.recategorise(id,"POTHOLE",admin,"Corrected the category after reviewing road damage.");
        assertThat(issues.findById(id).orElseThrow().getDueAt()).isEqualTo(due);
    }
    @Test void splittingPreservesOriginalGrantWhileTheNewIssueUsesItsOriginalReportTime() {
        UUID id=rearmedCluster(); Instant due=issues.findById(id).orElseThrow().getDueAt();
        var member=reports.findByIssueIdOrderByCreatedAtAsc(id).get(0);
        var split=moderation.split(id,java.util.List.of(member.getId()),admin,"These reports describe two separate maintenance problems.");
        assertThat(issues.findById(id).orElseThrow().getDueAt()).isEqualTo(due);
        assertThat(issues.findById(split.created().getId()).orElseThrow().getEscalationLevel()).isZero();
        assertThat(issues.findById(split.created().getId()).orElseThrow().getDueAt()).isBefore(now);
    }
    @Test void anEscalationLevelInheritedThroughGroupingIsNotResetByPriorityAgeing() {
        var issue=fixtures.issue("POTHOLE",now.minus(Duration.ofDays(7)),now.plusSeconds(3600));
        issue.setEscalationLevel(2); issues.saveAndFlush(issue);
        priorities.recomputeAll(now,20);
        assertThat(issues.findById(issue.getId()).orElseThrow().getDueAt()).isEqualTo(now.plusSeconds(3600));
    }
}
