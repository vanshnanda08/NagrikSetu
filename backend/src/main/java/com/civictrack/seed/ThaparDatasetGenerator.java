package com.civictrack.seed;

import com.civictrack.category.CategoryRepository;
import com.civictrack.clustering.ClusterOutcome;
import com.civictrack.clustering.IngestReportCommand;
import com.civictrack.common.generation.GenerationScope;
import com.civictrack.issue.*;
import com.civictrack.media.PhotoEvidenceService;
import com.civictrack.moderation.ModerationService;
import com.civictrack.report.ReportSubmissionService;
import com.civictrack.sla.SlaService;
import com.civictrack.sla.escalation.EscalationOutcome;
import com.civictrack.sla.escalation.EscalationService;
import com.civictrack.user.*;
import com.civictrack.user.auth.PasswordPolicy;
import com.civictrack.verification.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.Executors;

/** Builds a complete dataset only in the refresh tool's disposable database.
 * Production receives its independently verified export in one guarded transaction.
 * Normal application startup, the evaluation seed and deployed databases cannot
 * invoke this profile accidentally. No lifecycle state is written by this class.
 */
@Component
@Profile("thapar-dataset")
@RequiredArgsConstructor
public class ThaparDatasetGenerator implements CommandLineRunner {
    private final Environment env;
    private final java.time.Clock clock;
    private final ObjectMapper json;
    private final JdbcTemplate jdbc;
    private final ReportSubmissionService submissions;
    private final IssueLifecycleService lifecycle;
    private final IssueRepository issues;
    private final UserRepository users;
    private final CategoryRepository categories;
    private final VerificationService verification;
    private final VerificationQuorumService quorum;
    private final ModerationService moderation;
    private final IssueEngagementService engagement;
    private final EscalationService escalation;
    private final PriorityCalculator calculator;
    private final SlaService sla;
    private final PhotoEvidenceService photos;
    private final PasswordEncoder passwords;
    private final PlatformTransactionManager transactions;
    private final Map<String,UUID> issueIds = new LinkedHashMap<>();
    private final Map<Integer,UUID> reportIds = new TreeMap<>();
    private final Map<String,String> hashes = new HashMap<>();
    private final Map<Integer,UUID> reporters = new HashMap<>();
    private final Map<String,JsonNode> groups = new HashMap<>();
    private final List<Map<String,Object>> decisions = new ArrayList<>();
    private JsonNode assets;
    private Actor admin;
    private Instant anchor;
    private PriorityQueue<JsonNode> events;
    private long eventCounter;
    private static final String LABEL = "[THAPAR DEMO V2] ";

    @Override public void run(String... args) throws Exception {
        String url=env.getRequiredProperty("spring.datasource.url");
        String database=jdbc.queryForObject("SELECT current_database()",String.class);
        if (!"isolated-thapar-v2".equals(env.getProperty("DATASET_BUILD_AUTHORIZED"))
                || !url.startsWith("jdbc:postgresql://127.0.0.1:")
                || !Set.of("thapar_candidate","thapar_repeat").contains(database))
            throw new IllegalStateException("Dataset generation is restricted to the refresh tool's isolated databases");
        if (!env.getProperty("civictrack.media.verify-evidence",Boolean.class,true))
            throw new IllegalStateException("Strict evidence verification is required");
        JsonNode plan=json.readTree(Path.of(env.getRequiredProperty("civictrack.dataset.plan")).toFile());
        if (!"thapar-demo-v2".equals(plan.path("version").asText())) throw new IllegalStateException("Unknown dataset version");
        if (jdbc.queryForObject("SELECT count(*) FROM reports WHERE device_id LIKE 'thapar-demo-v2-%'",Integer.class)!=0)
            throw new IllegalStateException("Replace the prior demo in the isolated clone before building; never append");
        anchor=Instant.parse(plan.path("anchor").asText());
        assets=json.readTree(Path.of(env.getRequiredProperty("civictrack.dataset.assets")).toFile()).path("assets");
        JsonNode privateConfig=json.readTree(Path.of(env.getRequiredProperty("civictrack.dataset.private-config")).toFile());
        createReporters(privateConfig.path("citizen_password").asText());
        admin=users.findById(jdbc.queryForObject("SELECT id FROM users WHERE role='ADMIN' AND active ORDER BY id LIMIT 1",UUID.class)).orElseThrow().toActor();
        for(JsonNode g:plan.path("groups")) groups.put(g.path("key").asText(),g);
        // Fetch and decode every real CDN image before a single ingest lock opens.
        try(var pool=Executors.newFixedThreadPool(5)) {
            var futures=new TreeMap<String,java.util.concurrent.Future<String>>();
            assets.fields().forEachRemaining(e -> futures.put(e.getKey(),pool.submit(() -> photos.verify(e.getValue().path("url").asText(),null))));
            for(var e:futures.entrySet()) hashes.put(e.getKey(),e.getValue().get());
        }
        if(new HashSet<>(hashes.values()).size()!=hashes.size())
            throw new IllegalStateException("Synthetic evidence hashes collided; review assets before generation");
        events=new PriorityQueue<>(Comparator.comparing((JsonNode e)->Instant.parse(e.path("at").asText()))
                .thenComparingInt(e->"INGEST".equals(e.path("kind").asText())?0:1)
                .thenComparing(e->e.path("group").asText()).thenComparing(e->e.path("kind").asText()));
        plan.path("events").forEach(events::add);
        try(var scope=GenerationScope.dataset("thapar-demo-v2",plan.path("seed").asLong(),anchor)) {
            Instant previous=null;
            while(!events.isEmpty()) {
                JsonNode event=events.remove();Instant time=Instant.parse(event.path("at").asText());
                if(time.isAfter(anchor)) continue;
                if(previous!=null && time.isBefore(previous)) throw new IllegalStateException("Nonchronological event plan");
                previous=time;scope.at(time);process(event,time);eventCounter++;
            }
            scope.at(anchor);
            for(UUID id:issueIds.values()) if(!Set.of(IssueStatus.RESOLVED,IssueStatus.CLOSED,IssueStatus.REJECTED).contains(issue(id).getStatus())) recompute(id,anchor);
        }
        validateTargets(plan);
        Map<String,Object> result=new LinkedHashMap<>();result.put("version","thapar-demo-v2");result.put("anchor",anchor.toString());result.put("seed",plan.path("seed").asLong());
        result.put("issueIds",issueIds);result.put("reportIds",reportIds);result.put("reporterIds",reporters);result.put("decisions",decisions);result.put("eventsProcessed",eventCounter);result.put("verifiedAssets",hashes.size());
        result.put("tickets",issueIds.entrySet().stream().map(e->Map.of("scenario",e.getKey(),"id",e.getValue(),"reference",issue(e.getValue()).getPublicRef(),"status",issue(e.getValue()).getStatus().name())).toList());
        Files.writeString(Path.of(env.getRequiredProperty("civictrack.dataset.result")),json.writerWithDefaultPrettyPrinter().writeValueAsString(result));
        System.out.println("THAPAR DATASET COMPLETE: 50 issues, 90 reports; real evidence verified; valid services/clock transitions only");
    }

    private void createReporters(String password) {
        PasswordPolicy.validate(password);
        for(int i=0;i<12;i++) {
            UUID id=UUID.nameUUIDFromBytes(("thapar-demo-v2-citizen-"+i).getBytes(StandardCharsets.UTF_8));
            String email=String.format(Locale.ROOT,"thapar.demo.v2.reporter%02d@example.test",i+1);
            List<Map<String,Object>> existing=jdbc.queryForList("SELECT id,email,role,active FROM users WHERE id=? OR email=?",id,email);
            if(existing.isEmpty()) jdbc.update("INSERT INTO users(id,email,password_hash,full_name,role,active,email_notifications,created_at) VALUES(?,?,?,?, 'CITIZEN',true,false,?)",id,email,passwords.encode(password),"Synthetic Thapar demo reporter "+(i+1),Timestamp.from(anchor.minusSeconds(92*86400L)));
            else if(existing.size()!=1 || !id.equals(existing.getFirst().get("id")) || !email.equals(existing.getFirst().get("email")) || !"CITIZEN".equals(existing.getFirst().get("role")) || !Boolean.TRUE.equals(existing.getFirst().get("active"))) throw new IllegalStateException("Reserved synthetic reporter collision");
            reporters.put(i,id);
        }
    }

    private void process(JsonNode e,Instant now) {
        String kind=e.path("kind").asText(),key=e.path("group").asText();JsonNode group=groups.get(key);
        if("INGEST".equals(kind)) { ingest(group,e.path("report"),now);return; }
        UUID id=Objects.requireNonNull(issueIds.get(key),"Missing scenario issue: "+key);
        switch(kind) {
            case "ACK" -> lifecycle.acknowledge(id,supervisor(id),LABEL+"Department reviewed this illustrative report and accepted responsibility.");
            case "ASSIGN" -> lifecycle.assign(id,supervisor(id),assignee(id),LABEL+"Assigned to the team covering this department and configured ward.");
            case "START" -> lifecycle.start(id,worker(id),LABEL+"Synthetic team visit: work has started; no real field response is requested.");
            case "PROOF" -> {String asset=e.path("photo").asText();lifecycle.submitForVerification(id,worker(id),assetUrl(asset),hashes.get(asset),repairNote(id));}
            case "FIXED" -> vote(id,Verdict.FIXED,false);
            case "PARTIAL_FIXED" -> vote(id,Verdict.FIXED,true);
            case "NOT_FIXED" -> vote(id,Verdict.NOT_FIXED,true);
            case "TIMEOUT" -> {if(verification.settleTimedOut(id)!=VerificationService.SettleOutcome.RESOLVED_WITHOUT_VERIFICATION)throw new IllegalStateException("Timeout scenario did not settle honestly");}
            case "AUTO_CLOSE" -> {if(!verification.autoClose(id))throw new IllegalStateException("Automatic closure refused");}
            case "ADMIN_CLOSE" -> lifecycle.close(id,admin,issue(id).getResolvedAt()==null?LABEL+"Administrative closure before resolution: the illustrative submission was withdrawn; no repair or citizen confirmation is asserted.":LABEL+"Administrator reviewed the synthetic repair and recorded citizen confirmation, then closed this demonstration complaint.");
            case "REJECT" -> lifecycle.reject(id,supervisor(id),LABEL+"Illustrative responsibility review: this example represents a privately maintained asset; rejected with a recorded reason, not marked repaired.");
            case "SPLIT" -> {
                UUID selected=reportIds.get(e.path("reportIndex").asInt());moderation.previewSplit(id,List.of(selected));
                var split=moderation.split(id,List.of(selected),supervisor(id),LABEL+"Review of two nearby observations found separate illustrative defects; evidence retained on both tickets.");
                issueIds.put(e.path("createdGroup").asText(),split.created().getId());creationHistory(split.created().getId(),now);
            }
            case "MERGE" -> {UUID source=issueIds.get(e.path("sourceGroup").asText());moderation.previewMerge(id,source);moderation.merge(id,source,supervisor(id),LABEL+"Supervisor confirmed that the cautious separate observations describe one illustrative defect; original reference retained as a redirect.");}
            case "CONFIRM" -> moderation.confirm(id,supervisor(id),LABEL+"Supervisor checked the uncertain grouping and confirmed these observations concern the same illustrative problem.");
            case "FOLLOW" -> {UUID user=reporters.get(e.path("reporter").asInt());engagement.follow(id,user);jdbc.update("UPDATE issue_followers SET created_at=? WHERE issue_id=? AND user_id=?",Timestamp.from(now),id,user);}
            case "QUESTION" -> engagement.post(id,worker(id),true,LABEL+"Private clarification: which side of the illustrative crossing needs attention?");
            case "REPLY" -> engagement.post(id,users.findById(reporters.get(e.path("reporter").asInt())).orElseThrow().toActor(),false,LABEL+"Private reply: the synthetic concern is on the approach side shown in the diagram.");
            case "ESCALATE" -> {
                Issue before=issue(id);
                if(before.getStatus().clockRunning()&&before.getEscalationLevel()<4) {
                    recompute(id,now);EscalationOutcome outcome=escalation.escalateOne(id,now);
                    Issue after=issue(id);if(after.getEscalationLevel()<4&&after.getStatus().clockRunning())scheduleEscalation(key,after.getDueAt().plusSeconds(after.getPausedSeconds()+75));
                    if(outcome==EscalationOutcome.ESCALATED)System.out.println("Recorded synthetic SLA escalation for "+key);
                }
            }
            default -> throw new IllegalStateException("Unknown dataset action "+kind);
        }
    }

    private void ingest(JsonNode group,JsonNode r,Instant now) {
        String key=group.path("key").asText(),asset=r.path("photo").asText();int index=r.path("index").asInt();
        UUID reporter=r.path("reporter").isNull()?null:reporters.get(r.path("reporter").asInt());
        var command=new IngestReportCommand(group.path("category").asText(),r.path("lat").asDouble(),r.path("lng").asDouble(),r.path("accuracy").asDouble(),r.path("manual").asBoolean(),
                LABEL+group.path("detail").asText()+" "+r.path("narrative").asText()+" Synthetic observation; illustrative pin near Thapar Institute, Patiala. No municipal action required.",
                group.path("neighbourhood").asText(),"Illustrative sample location, not an assertion about a real street defect",assetUrl(asset),hashes.get(asset),null,reporter,String.format(Locale.ROOT,"thapar-demo-v2-r%03d",index));
        UUID submission=UUID.nameUUIDFromBytes(("thapar-demo-v2-submission-"+index).getBytes(StandardCharsets.UTF_8));
        ClusterOutcome result=submissions.submit(command,submission);
        if(issueIds.containsKey(key)&&!issueIds.get(key).equals(result.issueId()))throw new IllegalStateException("Unexpected split within planned group "+key);
        if(!issueIds.containsKey(key)&&issueIds.containsValue(result.issueId()))throw new IllegalStateException("Unexpected merge across independent groups "+key);
        boolean created=!issueIds.containsKey(key);issueIds.put(key,result.issueId());reportIds.put(index,result.reportId());
        jdbc.update("UPDATE report_submissions SET created_at=? WHERE result->>'reportId'=?",Timestamp.from(now),result.reportId().toString());
        if(created){creationHistory(result.issueId(),now);if(group.path("escalate").asBoolean())scheduleEscalation(key,issue(result.issueId()).getDueAt().plusSeconds(75));}
        decisions.add(Map.of("report",index,"issue",result.issueId(),"decision",result.decision().name()));
    }

    private void creationHistory(UUID id,Instant now) {
        jdbc.update("INSERT INTO issue_status_history(issue_id,from_status,to_status,actor_role,note,created_at) VALUES(?,NULL,'NEW','SYSTEM',?,?)",id,LABEL+"Synthetic issue created through the clustering or moderation service.",Timestamp.from(now));
    }
    private void scheduleEscalation(String key,Instant at) {
        if(!at.isAfter(anchor))events.add(json.createObjectNode().put("group",key).put("kind","ESCALATE").put("at",at.toString()));
    }
    private void recompute(UUID id,Instant now) {
        new TransactionTemplate(transactions).executeWithoutResult(tx->{Issue i=issues.findByIdForUpdate(id).orElseThrow();var category=categories.findById(i.getCategoryCode()).orElseThrow();double score=calculator.score(i,category,now);i.setPriorityScore(BigDecimal.valueOf(score).setScale(2,RoundingMode.HALF_UP));sla.applyPriority(i,category,calculator.band(score));issues.save(i);});
    }
    private void vote(UUID id,Verdict verdict,boolean single) {
        List<UUID> eligible=jdbc.queryForList("SELECT DISTINCT reporter_id FROM reports WHERE issue_id=? AND reporter_id IS NOT NULL ORDER BY reporter_id",UUID.class,id);
        if(eligible.isEmpty())throw new IllegalStateException("Verification requires a registered reporter");
        int needed=single?1:quorum.tally(issue(id),clock.instant()).required();
        if(eligible.size()<needed)throw new IllegalStateException("Insufficient eligible reporters for the intended verification outcome");
        for(UUID user:eligible.subList(0,needed)) {
            if(!issues.existsReportBy(id,user))throw new IllegalStateException("Ineligible synthetic vote");
            verification.vote(id,users.findById(user).orElseThrow().toActor(),verdict,verdict==Verdict.NOT_FIXED?LABEL+"The synthetic diagram still shows an uneven edge; reopening is intentional.":null);
        }
    }
    private String repairNote(UUID id) {
        String work=switch(issue(id).getCategoryCode()) {
            case "POTHOLE" -> "Filled and compacted the illustrative depression; the patch edges were levelled.";
            case "ROAD_DAMAGE" -> "Patched the illustrative damaged edge and cleared loose surface material.";
            case "SIGNAGE" -> "Secured the illustrative support and restored readable direction markings.";
            case "STREETLIGHT" -> "Inspected the illustrative fixture, replaced its lamp unit and recorded a lighting check.";
            case "GARBAGE_DUMP" -> "Collected the illustrative overflow and cleaned the surrounding collection point.";
            case "ILLEGAL_DUMPING" -> "Removed the illustrative discarded material and checked the walking route was clear.";
            case "WATER_LEAK" -> "Repaired the illustrative joint and checked that the depicted water flow stopped.";
            case "DRAINAGE_BLOCK" -> "Cleared the illustrative grate and checked the depicted drainage path.";
            case "OPEN_MANHOLE" -> "Safely replaced the illustrative cover and checked its seating before removing the barrier.";
            case "STRAY_ANIMAL" -> "Recorded the illustrative humane welfare assessment and appropriate referral.";
            default -> throw new IllegalStateException("Unknown repair category");
        };
        return LABEL+"Synthetic repair scenario: "+work+" Diagram only; no real incident or municipal work is asserted.";
    }
    private String assetUrl(String key){return assets.path(key).path("url").asText();}
    private Issue issue(UUID id){return issues.findById(id).orElseThrow();}
    private Actor supervisor(UUID id) {
        Issue i=issue(id);UUID actor=jdbc.queryForObject("SELECT id FROM users WHERE role='SUPERVISOR' AND active AND department_id=? AND (ward_id IS NULL OR ward_id=?) ORDER BY id LIMIT 1",UUID.class,i.getDepartmentId(),i.getWardId());return users.findById(actor).orElseThrow().toActor();
    }
    private UUID assignee(UUID id) {
        Issue i=issue(id);return jdbc.queryForObject("SELECT id FROM users WHERE active AND role IN ('STAFF','SUPERVISOR') AND department_id=? AND (ward_id IS NULL OR ward_id=?) ORDER BY CASE role WHEN 'STAFF' THEN 0 ELSE 1 END,id LIMIT 1",UUID.class,i.getDepartmentId(),i.getWardId());
    }
    private Actor worker(UUID id) {
        Issue i=issue(id);AppUser user=users.findById(i.getAssignedTo()).orElseThrow();
        return user.getRole()==Role.ADMIN||Objects.equals(i.getDepartmentId(),user.getDepartmentId())?user.toActor():admin;
    }
    private void validateTargets(JsonNode plan) {
        if(issueIds.size()!=50||new HashSet<>(issueIds.values()).size()!=50||reportIds.size()!=90)throw new IllegalStateException("Issue/report identity targets not met");
        Map<String,Long> states=new TreeMap<>();for(UUID id:issueIds.values())states.merge(issue(id).getStatus().name(),1L,Long::sum);
        plan.path("statusTargets").fields().forEachRemaining(e->{if(states.getOrDefault(e.getKey(),0L)!=e.getValue().asLong())throw new IllegalStateException("Status target mismatch "+e.getKey()+": "+states);});
        System.out.println("Verified status distribution "+states);
    }
}
