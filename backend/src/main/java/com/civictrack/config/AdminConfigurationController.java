package com.civictrack.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.math.BigDecimal;
import java.util.*;

/** Existing reference-data configuration; no hard deletes or historical rewrites. */
@RestController
@RequestMapping("/api/v1/admin/configuration")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class AdminConfigurationController {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private static final Map<String,String> COLUMNS = Map.of(
        "users", "id,full_name,email,role,department_id,ward_id,active",
        "categories", "code,display_name,merge_radius_m,default_sla_hours,severity_weight,reopen_window_days,max_extent_multiplier,low_conf_action,is_mobile_target,department_id,active",
        "departments", "id,code,name,parent_department_id,head_user_id",
        "wards", "id,ward_number,name,officer_user_id");

    @GetMapping
    public Map<String,Object> list(@AuthenticationPrincipal Jwt jwt) {
        currentAdmin(jwt);
        Map<String,Object> out = new LinkedHashMap<>();
        COLUMNS.forEach((table, columns) -> out.put(table, jdbc.queryForList("SELECT " + columns + " FROM " + table + " ORDER BY " + (table.equals("categories") ? "code" : "id"))));
        return out;
    }

    @GetMapping("/audit")
    public List<Map<String,Object>> audit(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue="0") int offset) {
        currentAdmin(jwt);
        return jdbc.queryForList("SELECT id,actor_id,resource,resource_id,before_value::text,after_value::text,created_at FROM configuration_audit ORDER BY id DESC LIMIT 50 OFFSET ?", Math.max(0,offset));
    }

    public record Category(@NotBlank @Size(max=120) String displayName,
        @Min(1) @Max(1000) int mergeRadiusM, @Min(1) @Max(8760) int defaultSlaHours,
        @Min(0) @Max(100) int severityWeight, @Min(1) @Max(365) int reopenWindowDays,
        @NotNull @DecimalMin("1.0") @DecimalMax("10.0") BigDecimal maxExtentMultiplier,
        @NotNull @Pattern(regexp="MERGE_FLAG|SPLIT_FLAG") String lowConfAction,
        boolean mobileTarget, UUID departmentId, boolean active) {}
    @PutMapping("/categories/{code}") @Transactional @ResponseStatus(HttpStatus.NO_CONTENT)
    public void category(@PathVariable String code, @Valid @RequestBody Category c, @AuthenticationPrincipal Jwt jwt) {
        begin(jwt); var before = row("categories",code);
        reference("departments",c.departmentId());
        jdbc.update("UPDATE categories SET display_name=?,merge_radius_m=?,default_sla_hours=?,severity_weight=?,reopen_window_days=?,max_extent_multiplier=?,low_conf_action=?,is_mobile_target=?,department_id=?,active=? WHERE code=?",
            c.displayName().strip(),c.mergeRadiusM(),c.defaultSlaHours(),c.severityWeight(),c.reopenWindowDays(),c.maxExtentMultiplier(),c.lowConfAction(),c.mobileTarget(),c.departmentId(),c.active(),code);
        record(jwt,"categories",code,before);
    }

    public record User(@NotBlank @Size(max=160) String fullName,
        @NotNull @Pattern(regexp="CITIZEN|STAFF|SUPERVISOR|ADMIN") String role,
        UUID departmentId, UUID wardId, boolean active) {}
    @PutMapping("/users/{id}") @Transactional @ResponseStatus(HttpStatus.NO_CONTENT)
    public void user(@PathVariable UUID id, @Valid @RequestBody User u, @AuthenticationPrincipal Jwt jwt) {
        begin(jwt); var before = row("users",id);
        reference("departments",u.departmentId()); reference("wards",u.wardId());
        if ((u.role().equals("STAFF") || u.role().equals("SUPERVISOR")) && u.departmentId()==null && u.wardId()==null)
            refuse("Staff and supervisors need a department or ward scope.");
        if ("ADMIN".equals(before.get("role")) && Boolean.TRUE.equals(before.get("active")) && (!u.active() || !u.role().equals("ADMIN"))
                && jdbc.queryForObject("SELECT count(*) FROM users WHERE role='ADMIN' AND active",Integer.class)<=1)
            refuse("The last active administrator cannot be disabled or demoted.");
        if (!u.active() || u.role().equals("CITIZEN")) {
            if (jdbc.queryForObject("SELECT (SELECT count(*) FROM departments WHERE head_user_id=?) + (SELECT count(*) FROM wards WHERE officer_user_id=?)",Integer.class,id,id)>0)
                refuse("Reassign this user's department-head or ward-officer duties first.");
        }
        jdbc.update("UPDATE users SET full_name=?,role=?,department_id=?,ward_id=?,active=? WHERE id=?",u.fullName().strip(),u.role(),u.departmentId(),u.wardId(),u.active(),id);
        jdbc.update("UPDATE refresh_sessions SET revoked=true WHERE user_id=?",id);
        record(jwt,"users",id,before);
    }

    public record Department(@NotBlank @Size(max=160) String name, UUID parentDepartmentId, UUID headUserId) {}
    @PutMapping("/departments/{id}") @Transactional @ResponseStatus(HttpStatus.NO_CONTENT)
    public void department(@PathVariable UUID id,@Valid @RequestBody Department d,@AuthenticationPrincipal Jwt jwt) {
        begin(jwt); var before=row("departments",id); reference("departments",d.parentDepartmentId()); officer(d.headUserId());
        if (d.parentDepartmentId()!=null && jdbc.queryForObject("WITH RECURSIVE ancestors AS (SELECT id,parent_department_id FROM departments WHERE id=? UNION SELECT d.id,d.parent_department_id FROM departments d JOIN ancestors a ON d.id=a.parent_department_id) SELECT EXISTS(SELECT 1 FROM ancestors WHERE id=?)",Boolean.class,d.parentDepartmentId(),id)) refuse("Department hierarchy cannot contain a cycle.");
        jdbc.update("UPDATE departments SET name=?,parent_department_id=?,head_user_id=? WHERE id=?",d.name().strip(),d.parentDepartmentId(),d.headUserId(),id);
        record(jwt,"departments",id,before);
    }

    public record Ward(@NotBlank @Size(max=160) String name, UUID officerUserId) {}
    @PutMapping("/wards/{id}") @Transactional @ResponseStatus(HttpStatus.NO_CONTENT)
    public void ward(@PathVariable UUID id,@Valid @RequestBody Ward w,@AuthenticationPrincipal Jwt jwt) {
        begin(jwt); var before=row("wards",id); officer(w.officerUserId());
        jdbc.update("UPDATE wards SET name=?,officer_user_id=? WHERE id=?",w.name().strip(),w.officerUserId(),id);
        record(jwt,"wards",id,before);
    }

    private void begin(Jwt jwt) {
        // Serialize hierarchy and last-admin checks, including concurrent editors.
        jdbc.query("SELECT pg_advisory_xact_lock(874230019)",rs -> {});
        currentAdmin(jwt);
    }
    private void currentAdmin(Jwt jwt) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM users WHERE id=? AND active AND role='ADMIN')",Boolean.class,UUID.fromString(jwt.getSubject()))))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"An active administrator account is required.");
    }
    private void reference(String table,UUID id) {
        if(id!=null && !jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM " + table + " WHERE id=?)",Boolean.class,id)) refuse("The selected " + table + " record does not exist.");
    }
    private void officer(UUID id) {
        if(id!=null && !jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM users WHERE id=? AND active AND role IN ('STAFF','SUPERVISOR','ADMIN'))",Boolean.class,id)) refuse("Choose an active staff, supervisor or administrator account.");
    }
    private Map<String,Object> row(String table,Object id) {
        var rows=jdbc.queryForList("SELECT " + COLUMNS.get(table) + " FROM " + table + " WHERE " + (table.equals("categories") ? "code" : "id") + "=?",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Configuration record not found.");
        return rows.get(0);
    }
    private void record(Jwt jwt,String table,Object id,Map<String,Object> before) {
        try {
            jdbc.update("INSERT INTO configuration_audit(actor_id,resource,resource_id,before_value,after_value) VALUES(?,?,?,?::jsonb,?::jsonb)",UUID.fromString(jwt.getSubject()),table,id.toString(),json.writeValueAsString(before),json.writeValueAsString(row(table,id)));
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) { throw new IllegalStateException(e); }
    }
    private void refuse(String reason) { throw new ResponseStatusException(HttpStatus.CONFLICT,reason); }
}
