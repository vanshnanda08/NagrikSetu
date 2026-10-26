package com.civictrack.seed;

import com.civictrack.IntegrationTestBase;
import com.civictrack.support.Fixtures;
import com.civictrack.category.CategoryRepository;
import com.civictrack.ward.WardRepository;
import com.civictrack.clustering.*;
import com.civictrack.issue.IssueLifecycleService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import java.nio.file.*;
import java.io.PrintWriter;
import java.time.Instant;
import java.util.*;

/** Opt-in, isolated Testcontainers experiment using the real Java/PostGIS path. */
@EnabledIfSystemProperty(named="civictrack.evaluate",matches="true")
class ProductionEvaluationIT extends IntegrationTestBase {
    @Autowired Fixtures fixtures;
    @Autowired JdbcTemplate jdbc;
    @Autowired CategoryRepository categories;
    @Autowired WardRepository wards;
    @Autowired ClusteringService clustering;
    @Autowired IssueLifecycleService lifecycle;
    record Observation(String truth, String category, double lat, double lng, double accuracy, UUID user, String device) {}

    @Test void evaluateRealPipeline() throws Exception {
        Path output=Path.of(System.getProperty("evaluation.output","../artifacts/evaluation"));
        Files.createDirectories(output);
        Path labels=Path.of("target/production-evaluation-labels.csv");
        var original=jdbc.queryForList("SELECT code,merge_radius_m,max_extent_multiplier,low_conf_action FROM categories");
        try (var csv=new PrintWriter(Files.newBufferedWriter(output.resolve("production-predictions.csv")))) {
            fixtures.clearIssues();
            new SeedDataGenerator(new SeedProperties(true,250,42,labels.toString(),Instant.parse("2026-10-01T00:00:00Z"),false),categories,wards,clustering,lifecycle,jdbc).run();
            Map<String,String> truth=new HashMap<>();
            for(String line:Files.readAllLines(labels).subList(1,251)) { var p=line.split(",");truth.put(p[0],p[1]); }
            var records=jdbc.queryForList("SELECT id,issue_id,category_code,ST_Y(location) AS lat,ST_X(location) AS lng,gps_accuracy_m,reporter_id,device_id FROM reports ORDER BY created_at,id");
            List<Observation> corpus=new ArrayList<>();
            csv.println("variant,corpus,category,radius_m,cap,truth,predicted");
            for(var row:records) {
                String defect=truth.get(row.get("id").toString()); String category=(String)row.get("category_code");
                corpus.add(new Observation(defect,category,((Number)row.get("lat")).doubleValue(),((Number)row.get("lng")).doubleValue(),((Number)row.get("gps_accuracy_m")).doubleValue(),(UUID)row.get("reporter_id"),(String)row.get("device_id")));
                csv.printf("baseline,seeded,%s,0,enabled,%s,%s%n",category,defect,row.get("issue_id"));
            }
            for(int radius=10;radius<=100;radius+=5) {
                restore(original);jdbc.update("UPDATE categories SET merge_radius_m=?",radius);
                replay(csv,"radius-"+radius,"seeded",corpus,radius,true);
            }
            for(boolean cap:new boolean[]{true,false}) {
                restore(original);
                if(!cap) jdbc.update("UPDATE categories SET max_extent_multiplier=99.99");
                replay(csv,"seed-cap-"+cap,"seeded",corpus,0,cap);
            }
            List<Observation> linear=new ArrayList<>();
            for(int i=0;i<18;i++) linear.add(new Observation("linear-"+(i/3),"ROAD_DAMAGE",30.93+i*45/111111.0,75.82,8,null,"linear-device-"+i));
            for(boolean cap:new boolean[]{true,false}) {
                restore(original);
                jdbc.update("UPDATE categories SET merge_radius_m=60,max_extent_multiplier=?,low_conf_action='MERGE_FLAG' WHERE code='ROAD_DAMAGE'",cap?1.0:99.99);
                replay(csv,"linear-cap-"+cap,"linear-stress",linear,60,cap);
            }
        } finally { restore(original);fixtures.clearIssues(); }
    }
    private void replay(PrintWriter csv,String variant,String corpus,List<Observation> rows,int radius,boolean cap) {
        fixtures.clearIssues();
        for(var r:rows) {
            var result=clustering.ingest(new IngestReportCommand(r.category(),r.lat(),r.lng(),r.accuracy(),false,"Production evaluation",null,null,"https://example.test/fixture.jpg",null,r.user(),r.device()));
            if(!cap && result.decision()==com.civictrack.report.ClusterDecision.SPLIT_EXTENT_CAPPED) throw new AssertionError("Nonbinding cap assumption was violated");
            csv.printf("%s,%s,%s,%d,%s,%s,%s%n",variant,corpus,r.category(),radius,cap?"enabled":"nonbinding",r.truth(),result.issueId());
        }
        csv.flush();
    }
    private void restore(List<Map<String,Object>> original) {
        for(var row:original) jdbc.update("UPDATE categories SET merge_radius_m=?,max_extent_multiplier=?,low_conf_action=? WHERE code=?",row.get("merge_radius_m"),row.get("max_extent_multiplier"),row.get("low_conf_action"),row.get("code"));
    }
}
