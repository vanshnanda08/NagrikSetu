package com.civictrack.clustering;

import com.civictrack.IntegrationTestBase;
import com.civictrack.support.Fixtures;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import java.nio.file.*;
import java.io.PrintWriter;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.*;

@EnabledIfSystemProperty(named="civictrack.evaluate",matches="true")
class ProductionLatencyIT extends IntegrationTestBase {
    @Autowired Fixtures fixtures;
    @Autowired JdbcTemplate jdbc;
    @Autowired ClusteringService clustering;
    @Autowired MeterRegistry registry;
    @Test void retainPerScaleMicrometerSnapshots() throws Exception {
        Path output=Path.of(System.getProperty("evaluation.output","../artifacts/evaluation"));Files.createDirectories(output);
        String prefill=Files.readString(Path.of("../evaluation/prefill.sql"));
        prefill=prefill.substring(prefill.indexOf("WITH chosen_ward"));
        try(var csv=new PrintWriter(Files.newBufferedWriter(output.resolve("production-server-latency.csv")))) {
            csv.println("scale,requests,p50_ms,p95_ms,p99_ms,mean_ms,max_ms,measurement");
            for(int scale:new int[]{1000,10000,50000}) {
                fixtures.clearIssues();
                jdbc.execute(prefill.replace(":scale",Integer.toString(scale)));
                var points=jdbc.queryForList("SELECT ST_Y(p.geom) AS lat,ST_X(p.geom) AS lng FROM wards w CROSS JOIN LATERAL ST_Dump(ST_GeneratePoints(w.boundary,350,73)) p WHERE ward_number=1");
                for(int i=0;i<350;i++) {
                    if(i==50) registry.find("civictrack.ingest").timers().forEach(registry::remove);
                    var p=points.get(i);
                    clustering.ingest(new IngestReportCommand("POTHOLE",((Number)p.get("lat")).doubleValue(),((Number)p.get("lng")).doubleValue(),8.0,false,"Metric probe",null,null,"https://example.test/photo.jpg",null,null,"metric-"+scale+"-"+i));
                }
                var timer=registry.get("civictrack.ingest").tag("exception","none").timer();
                assertThat(timer.count()).isEqualTo(300);
                var snapshot=timer.takeSnapshot();
                double p50=0,p95=0,p99=0;
                for(var value:snapshot.percentileValues()) {
                    if(value.percentile()==.5) p50=value.value(TimeUnit.MILLISECONDS);
                    if(value.percentile()==.95) p95=value.value(TimeUnit.MILLISECONDS);
                    if(value.percentile()==.99) p99=value.value(TimeUnit.MILLISECONDS);
                }
                assertThat(p50).isPositive();assertThat(p99).isGreaterThanOrEqualTo(p95);
                csv.printf(java.util.Locale.ROOT,"%d,%d,%.4f,%.4f,%.4f,%.4f,%.4f,Micrometer_civictrack.ingest_direct_service%n",scale,timer.count(),p50,p95,p99,timer.mean(TimeUnit.MILLISECONDS),timer.max(TimeUnit.MILLISECONDS));csv.flush();
            }
        } finally { fixtures.clearIssues(); }
    }
}
