package com.civictrack.report;

import com.civictrack.IntegrationTestBase;
import com.civictrack.support.Fixtures;
import com.civictrack.clustering.*;
import com.civictrack.abuse.RateLimitExceededException;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.UUID;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

class ReportSubmissionIT extends IntegrationTestBase {
    @Autowired ReportSubmissionService submissions;
    @Autowired Fixtures fixtures;
    @Autowired JdbcTemplate jdbc;
    @BeforeEach void clear() { fixtures.clearIssues(); }
    @Test void responseLossRetryReturnsOriginalWithoutConsumingAllowance() {
        String device=UUID.randomUUID().toString(); UUID id=UUID.randomUUID();
        var first=submissions.submit(command(device,30.9300),id);
        assertThat(submissions.submit(command(device,30.9300),id)).isEqualTo(first);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reports",Integer.class)).isEqualTo(1);
        assertThatThrownBy(() -> submissions.submit(command(device,30.9301),id)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
    @Test void concurrentNearbySubmissionsAcrossCellsAdmitOnlyOne() throws Exception {
        String device=UUID.randomUUID().toString(); var start=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var a=executor.submit(() -> attempt(device,30.930999,start));
            var b=executor.submit(() -> attempt(device,30.931001,start));
            start.countDown();
            assertThat(a.get(30,TimeUnit.SECONDS)+b.get(30,TimeUnit.SECONDS)).isEqualTo(1);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reports",Integer.class)).isEqualTo(1);
    }
    private int attempt(String device,double lat,CountDownLatch start) throws Exception {
        start.await();
        try { submissions.submit(command(device,lat),UUID.randomUUID());return 1; }
        catch(RateLimitExceededException expected) { return 0; }
    }
    private IngestReportCommand command(String device,double lat) {
        return new IngestReportCommand("POTHOLE",lat,75.82,8.0,false,"Submission test",null,null,"https://example.test/photo.jpg",null,null,device);
    }
}
