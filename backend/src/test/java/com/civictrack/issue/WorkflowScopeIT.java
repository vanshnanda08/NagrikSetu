package com.civictrack.issue;

import com.civictrack.IntegrationTestBase;
import com.civictrack.support.Fixtures;
import com.civictrack.support.MutableClock;
import com.civictrack.sla.escalation.EscalationService;
import com.civictrack.user.AppUser;
import com.civictrack.user.Role;
import com.civictrack.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class WorkflowScopeIT extends IntegrationTestBase {
    @Autowired MockMvc mvc;
    @Autowired Fixtures fixtures;
    @Autowired MutableClock clock;
    @Autowired IssueRepository issues;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;
    @Autowired EscalationService escalations;
    @Autowired ObjectMapper json;
    AppUser admin;
    Instant now = Instant.parse("2026-03-01T09:00:00Z");
    UUID roads, water, ward1, ward2;
    @BeforeEach void setup() {
        fixtures.clearIssues(); clock.set(now);
        roads=fixtures.departmentId("ROADS"); water=fixtures.departmentId("WATER");
        ward1=fixtures.wardId(1); ward2=fixtures.wardId(2);
        admin=fixtures.user(Role.ADMIN,null,null);
    }
    @AfterEach void restoreClock() { clock.reset(); }
    Issue issue(String category, UUID ward) {
        Issue i=fixtures.issue(category,now.minusSeconds(3600),now.plusSeconds(86400));
        i.setWardId(ward); i.flagForReview("LOW_CONF_MERGE"); return issues.saveAndFlush(i);
    }
    ResultActions read(String path, AppUser who) throws Exception {
        return mvc.perform(get(path).header("Authorization", fixtures.bearer(who)));
    }
    ResultActions act(Issue issue, AppUser who, String action, Object body) throws Exception {
        return mvc.perform(post("/api/v1/issues/{id}/"+action,issue.getId()).header("Authorization",fixtures.bearer(who))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }
    @Test void supervisorQueueReviewAndActionsUseDepartmentOrWardIncludingPaging() throws Exception {
        var boss=fixtures.user(Role.SUPERVISOR,roads,ward1);
        var a=issue("POTHOLE",ward2); var b=issue("WATER_LEAK",ward1);
        var c=issue("POTHOLE",ward1); var denied=issue("WATER_LEAK",ward2);
        Set<String> seen=new HashSet<>();
        for(int offset : new int[]{0,2}) {
            var page=read("/api/v1/supervisor/queue?tab=all&limit=2&offset="+offset,boss).andExpect(status().isOk()).andReturn();
            for(var row:json.readTree(page.getResponse().getContentAsString())) assertThat(seen.add(row.path("row").path("id").asText())).isTrue();
            read("/api/v1/supervisor/review?limit=2&offset="+offset,boss).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(3));
        }
        assertThat(seen).containsExactlyInAnyOrder(a.getId().toString(),b.getId().toString(),c.getId().toString());
        for(var i:List.of(a,b,c)) read("/api/v1/issues/"+i.getId(),boss).andExpect(status().isOk());
        read("/api/v1/issues/"+denied.getId(),boss).andExpect(status().isForbidden());
        act(b,boss,"acknowledge",Map.of()).andExpect(status().isOk());
        act(denied,boss,"acknowledge",Map.of()).andExpect(status().isForbidden());
    }
    @Test void staffKeepDepartmentAndWardIntersection() throws Exception {
        var worker=fixtures.user(Role.STAFF,roads,ward1);
        var allowed=issue("POTHOLE",ward1);var otherWard=issue("POTHOLE",ward2);var otherDept=issue("WATER_LEAK",ward1);
        read("/api/v1/staff/queue?tab=all&departmentId="+water,worker).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(allowed.getId().toString()));
        for(var i:List.of(otherWard,otherDept)) act(i,worker,"acknowledge",Map.of()).andExpect(status().isForbidden());
    }
    Issue escalatedToParent(AppUser worker) throws Exception {
        var i=issue("POTHOLE",ward1);
        act(i,admin,"acknowledge",Map.of()).andExpect(status().isOk());
        act(i,admin,"assign",Map.of("assigneeId",worker.getId())).andExpect(status().isOk());
        jdbc.update("UPDATE issues SET due_at=? WHERE id=?",java.sql.Timestamp.from(now.minusSeconds(1)),i.getId());
        escalations.escalateOne(i.getId(),clock.instant());
        clock.set(issues.findById(i.getId()).orElseThrow().getDueAt().plusSeconds(1));
        escalations.escalateOne(i.getId(),clock.instant());
        return issues.findById(i.getId()).orElseThrow();
    }
    @Test void actualParentEscalationOwnerCanWorkWithoutAccessToUnrelatedDepartmentTickets() throws Exception {
        var worker=fixtures.user(Role.STAFF,roads,null);var i=escalatedToParent(worker);
        var owner=users.findById(i.getAssignedTo()).orElseThrow();
        assertThat(owner.getDepartmentId()).isEqualTo(fixtures.departmentId("PUBLIC_WORKS"));
        var unrelated=issue("POTHOLE",ward2);
        read("/api/v1/issues/"+i.getId(),owner).andExpect(status().isOk());
        read("/api/v1/issues/"+unrelated.getId(),owner).andExpect(status().isForbidden());
        read("/api/v1/supervisor/queue?tab=mine",owner).andExpect(status().isOk()).andExpect(jsonPath("$[*].row.id",hasItem(i.getId().toString())));
        read("/api/v1/supervisor/review",owner).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        read("/api/v1/supervisor/departments/"+roads+"/members?issueId="+i.getId(),owner).andExpect(status().isOk());
        read("/api/v1/supervisor/departments/"+roads+"/members",owner).andExpect(status().isForbidden());
        act(i,owner,"start",Map.of()).andExpect(status().isOk());
        // Passing ownership to the next rung removes this complaint-specific grant.
        clock.set(issues.findById(i.getId()).orElseThrow().getDueAt().plusSeconds(1));
        escalations.escalateOne(i.getId(),clock.instant());
        read("/api/v1/issues/"+i.getId(),owner).andExpect(status().isForbidden());
        read("/api/v1/supervisor/queue?tab=mine",owner).andExpect(jsonPath("$.length()").value(0));
    }
    @Test void aStaffHeadGetsOnlyItsEscalatedAssignmentAndAccuratePersonalOverview() throws Exception {
        UUID parent=fixtures.departmentId("PUBLIC_WORKS");UUID previous=fixtures.departmentHeadId("PUBLIC_WORKS");
        var head=fixtures.user(Role.STAFF,parent,null); var worker=fixtures.user(Role.STAFF,roads,null);
        try {
            jdbc.update("UPDATE departments SET head_user_id=? WHERE id=?",head.getId(),parent);
            var i=escalatedToParent(worker);
            read("/api/v1/staff/queue?tab=mine",head).andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(i.getId().toString()));
            read("/api/v1/staff/overview",head).andExpect(status().isOk())
                    .andExpect(jsonPath("$.personal.open").value(1)).andExpect(jsonPath("$.departmentWork.open").value(0))
                    .andExpect(jsonPath("$.myPriorities[0].id").value(i.getId().toString()))
                    .andExpect(jsonPath("$.departmentPriorities.length()").value(0));
            act(i,head,"start",Map.of()).andExpect(status().isOk());
            act(i,head,"assign",Map.of("assigneeId",worker.getId())).andExpect(status().isForbidden());
            read("/api/v1/supervisor/review",head).andExpect(status().isForbidden());
        } finally { jdbc.update("UPDATE departments SET head_user_id=? WHERE id=?",previous,parent); }
    }
    @Test void pickerAndDirectAssignmentRequireAnActiveMunicipalAssigneeWhoCanActInTheWard() throws Exception {
        var boss=fixtures.user(Role.SUPERVISOR,roads,null);var i=issue("POTHOLE",ward1);
        var valid=fixtures.user(Role.STAFF,roads,ward1);var citywide=fixtures.user(Role.STAFF,roads,null);
        var deptSupervisor=fixtures.user(Role.SUPERVISOR,roads,ward2);
        var citizen=fixtures.user(Role.CITIZEN,roads,null);var inactive=fixtures.user(Role.STAFF,roads,null);
        jdbc.update("UPDATE users SET active=false WHERE id=?",inactive.getId());
        var wrongWard=fixtures.user(Role.STAFF,roads,ward2);var wrongDept=fixtures.user(Role.STAFF,water,null);
        act(i,boss,"acknowledge",Map.of()).andExpect(status().isOk());
        for(UUID invalid:List.of(citizen.getId(),inactive.getId(),wrongWard.getId(),wrongDept.getId(),admin.getId(),UUID.randomUUID())) {
            act(i,boss,"assign",Map.of("assigneeId",invalid)).andExpect(status().isConflict());
        }
        read("/api/v1/supervisor/departments/"+roads+"/members?issueId="+i.getId(),boss)
                .andExpect(status().isOk()).andExpect(jsonPath("$[*].id",hasItems(valid.getId().toString(),citywide.getId().toString(),deptSupervisor.getId().toString())))
                .andExpect(jsonPath("$[*].id",not(hasItems(citizen.getId().toString()))))
                .andExpect(jsonPath("$[*].id",not(hasItem(inactive.getId().toString()))))
                .andExpect(jsonPath("$[*].id",not(hasItem(wrongWard.getId().toString()))));
        act(i,boss,"assign",Map.of("assigneeId",deptSupervisor.getId())).andExpect(status().isOk());
    }
    @Test void anUnscopedSupervisorCannotTurnQueueParametersIntoCitywideAccess() throws Exception {
        var unscoped=fixtures.user(Role.SUPERVISOR,null,null);var i=issue("POTHOLE",ward1);
        read("/api/v1/supervisor/queue?departmentId="+roads,unscoped).andExpect(status().isForbidden());
        read("/api/v1/supervisor/review?wardId="+ward1,unscoped).andExpect(status().isForbidden());
        read("/api/v1/issues/"+i.getId(),unscoped).andExpect(status().isForbidden());
    }
    @Test void contextualMemberLookupDoesNotExposeAnUnrelatedComplaint() throws Exception {
        var boss=fixtures.user(Role.SUPERVISOR,roads,ward1);var inWard=issue("WATER_LEAK",ward1);var outside=issue("WATER_LEAK",ward2);
        read("/api/v1/supervisor/departments/"+water+"/members?issueId="+inWard.getId(),boss).andExpect(status().isOk());
        read("/api/v1/supervisor/departments/"+water+"/members?issueId="+outside.getId(),boss).andExpect(status().isForbidden());
        read("/api/v1/supervisor/departments/"+roads+"/members?issueId="+inWard.getId(),boss).andExpect(status().isForbidden());
    }
    @ParameterizedTest @ValueSource(strings={"CITIZEN","INACTIVE","UNSCOPED_STAFF"})
    void inactiveOrNonmunicipalReferencesDoNotBecomeEscalationOwners(String kind) {
        UUID previous=fixtures.departmentHeadId("ROADS");
        var invalid=fixtures.user(kind.equals("CITIZEN") ? Role.CITIZEN : Role.STAFF,
                kind.equals("UNSCOPED_STAFF") ? null : roads,null);
        if(kind.equals("INACTIVE")) jdbc.update("UPDATE users SET active=false WHERE id=?",invalid.getId());
        try {
            jdbc.update("UPDATE departments SET head_user_id=? WHERE id=?",invalid.getId(),roads);
            var i=issue("POTHOLE",ward1);
            jdbc.update("UPDATE issues SET due_at=? WHERE id=?",java.sql.Timestamp.from(now.minusSeconds(1)),i.getId());
            escalations.escalateOne(i.getId(),now);
            assertThat(issues.findById(i.getId()).orElseThrow().getAssignedTo()).isNull();
            assertThat(issues.findById(i.getId()).orElseThrow().getEscalationLevel()).isEqualTo(1);
        } finally { jdbc.update("UPDATE departments SET head_user_id=? WHERE id=?",previous,roads); }
    }
}
