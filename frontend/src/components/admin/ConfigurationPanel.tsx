"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { ADMIN_VIEWS } from "@/lib/navigation";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { useAuth } from "@/lib/auth";
import { useSignIn } from "@/lib/signInDialog";
import { request, type ApiError } from "@/lib/api";
import { absoluteDateTime } from "@/lib/format";

type Row = Record<string, string | number | boolean | null>;
type Group = "categories" | "users" | "departments" | "wards";
type Config = Record<Group, Row[]>;
const groups: { id: Group; label: string }[] = [{ id: "categories", label: "Complaint settings" }, { id: "users", label: "User access" }, { id: "departments", label: "Departments" }, { id: "wards", label: "Wards" }];
const fields: Record<Group, string[]> = {
  categories: ["display_name", "department_id", "default_sla_hours", "active", "merge_radius_m", "severity_weight", "reopen_window_days", "max_extent_multiplier", "low_conf_action"],
  users: ["full_name", "role", "department_id", "ward_id", "active"],
  departments: ["name", "parent_department_id", "head_user_id"],
  wards: ["name", "officer_user_id"],
};
const labels: Record<string, string> = { display_name: "Category name", department_id: "Department", default_sla_hours: "Response deadline (hours)", active: "Active", merge_radius_m: "Grouping radius (m)", severity_weight: "Priority weight", reopen_window_days: "Reopening window (days)", max_extent_multiplier: "Maximum extent multiplier", low_conf_action: "Uncertain grouping", full_name: "Full name", role: "Role", ward_id: "Ward", name: "Name", parent_department_id: "Parent department", head_user_id: "Department head", officer_user_id: "Ward officer" };
const numeric: Record<string, [number, number, number]> = { merge_radius_m: [1, 1000, 1], default_sla_hours: [1, 8760, 1], severity_weight: [0, 100, 1], reopen_window_days: [1, 365, 1], max_extent_multiplier: [1, 10, 0.01] };
const camel = (key: string) => key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const rowId = (row: Row) => String(row.id ?? row.code);
const rowName = (row: Row) => String(row.display_name ?? row.full_name ?? row.name);

export default function ConfigurationPage() {
  const { session, initialising, authed } = useAuth();
  const { openSignIn } = useSignIn();
  const cache = useQueryClient();
  const [group, setGroup] = useState<Group>("categories");
  const [selected, setSelected] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [auditOffset, setAuditOffset] = useState(0);
  useEffect(() => {
    if (selected && window.matchMedia("(max-width: 1279px)").matches) {
      document.getElementById("configuration-editor-heading")?.focus();
    }
  }, [selected]);
  const config = useQuery({ queryKey: ["configuration", session?.userId], enabled: session?.role === "ADMIN", queryFn: () => authed(token => request<Config>("/admin/configuration", { token })) });
  const audit = useQuery({ queryKey: ["configuration-audit", session?.userId, auditOffset], enabled: session?.role === "ADMIN", queryFn: () => authed(token => request<Row[]>(`/admin/configuration/audit?offset=${auditOffset}`, { token })) });
  if (initialising) return <PageShell><LoadingState label="Checking your session" /></PageShell>;
  if (session?.role !== "ADMIN") return <PageShell><h1 className="text-display">Administration</h1><EmptyState message={session ? "Administration requires an administrator account." : "Sign in with an administrator account to manage configuration."} {...(!session ? { actionLabel: "Sign in", onAction: openSignIn } : { actionLabel: session.role === "CITIZEN" ? "Back to dashboard" : "Open complaints", actionHref: session.role === "CITIZEN" ? "/dashboard" : "/work" })} /></PageShell>;
  const data = config.data;
  const matching = data?.[group].filter(row => [rowName(row), row.email, row.code, row.role].some(value => String(value ?? "").toLowerCase().includes(search.trim().toLowerCase()))) ?? [];
  const choices = (field: string): [string, string][] | null => {
    if (field === "role") return ["CITIZEN", "STAFF", "SUPERVISOR", "ADMIN"].map(value => [value, value]);
    if (field === "low_conf_action") return [["MERGE_FLAG", "Merge and flag for review"], ["SPLIT_FLAG", "Keep separate and flag for review"]];
    if (!field.endsWith("_id") || !data) return null;
    const source = field.includes("department") ? data.departments.filter(row => field !== "parent_department_id" || rowId(row) !== (selected && rowId(selected))) : field === "ward_id" ? data.wards : data.users.filter(row => row.active && row.role !== "CITIZEN");
    return [["", "None"], ...source.map(row => [String(row.id), String(row.name ?? row.full_name)] as [string, string])];
  };
  return <WorkspaceShell title="Administration" links={ADMIN_VIEWS} current="/admin" className="admin-configuration">
    <details className="configuration-guidance"><summary>How configuration changes apply</summary><p className="text-dense text-ink-muted">Edit existing records. Category settings apply to new work; existing deadlines and ward boundaries stay intact. Access tokens may remain valid for up to 15 minutes after an access change. Every save is audited.</p></details>
    <div className="configuration-groups mt-3 flex flex-wrap gap-2" role="group" aria-label="Configuration sections">{groups.map(item => <Button key={item.id} disabled={busy} variant={group === item.id ? "primary" : "secondary"} aria-pressed={group === item.id} onClick={() => { setGroup(item.id); setSelected(null); setSearch(""); }}>{item.label}</Button>)}</div>
    {config.isPending && <LoadingState label="Loading configuration" />}
    {config.isError && <ErrorState action="Loading configuration" problem={(config.error as ApiError)?.problem} onRetry={() => void config.refetch()} />}
    {data && <div className={`configuration-layout grid md:grid-cols-2 gap-4 mt-3${selected ? " has-selection" : ""}`}>
      <div className="configuration-sidebar">
        <label className="flex flex-col gap-1 text-meta">Search {groups.find(item => item.id === group)?.label.toLowerCase()}<input id="configuration-search" type="search" value={search} onChange={event => setSearch(event.target.value)} className="border border-rule bg-surface-raised px-3" /></label>
        <p className="text-meta text-ink-muted mt-2">{matching.length} of {data[group].length} records</p>
        <div className="configuration-records" tabIndex={0} role="region" aria-label="Configuration records">
          {matching.length ? <ul className="grid gap-2">{matching.map(row => <li key={rowId(row)}><button type="button" disabled={busy} aria-pressed={selected ? rowId(selected) === rowId(row) : false} className="configuration-record border border-rule w-full text-left p-3 bg-surface-raised" onClick={() => setSelected({ ...row })}>{rowName(row)}{row.active === false && <span className="text-ink-muted"> · Inactive</span>}{group === "users" && <span className="block text-meta text-ink-muted">{row.email ?? "No email"} · {row.role}</span>}</button></li>)}</ul> : <EmptyState message={search ? "No matching records." : "No records in this section."} {...(search ? { actionLabel: "Clear search", onAction: () => setSearch("") } : {})} />}
        </div>
      </div>
      {selected ? <ConfigurationEditor key={`${group}:${rowId(selected)}`} group={group} initial={selected} choices={choices} onBack={() => { setSelected(null); requestAnimationFrame(() => document.getElementById("configuration-search")?.focus()); }} onBusy={setBusy} onSaved={() => { setAuditOffset(0); void cache.invalidateQueries({ queryKey: ["configuration"] }); void cache.invalidateQueries({ queryKey: ["configuration-audit"] }); for (const key of ["categories", "wards", "dashboard", "supervisor", "staff", "issues", "bbox"]) void cache.invalidateQueries({ queryKey: [key] }); }} /> : <EmptyState message="Select a record to edit its settings." />}
    </div>}
    <details className="configuration-history mt-3"><summary>Configuration change history</summary>
      {audit.isPending && <LoadingState label="Loading configuration history" />}
      {audit.isError && <ErrorState action="Loading configuration history" problem={(audit.error as ApiError)?.problem} onRetry={() => void audit.refetch()} />}
      {audit.data && <>
        {!audit.data.length && <p className="mt-2 text-dense">No configuration changes on this page.</p>}
        <ul className="configuration-audit mt-2 grid gap-2">{audit.data.map(entry => <li key={String(entry.id)} className="border border-rule p-3"><details><summary>{absoluteDateTime(String(entry.created_at))} · {String(entry.resource)} · {String(entry.resource_id)}</summary><p className="text-meta">Administrator: {String(entry.actor_id)}</p><pre className="whitespace-pre-wrap break-all text-meta">Before: {String(entry.before_value)}{"\n"}After: {String(entry.after_value)}</pre></details></li>)}</ul>
        {(auditOffset > 0 || audit.data.length === 50) && <nav className="flex gap-3 mt-2" aria-label="Configuration history pages"><Button variant="secondary" disabled={auditOffset === 0 || audit.isFetching} onClick={() => setAuditOffset(Math.max(0, auditOffset - 50))}>Newer changes</Button><Button variant="secondary" disabled={audit.data.length < 50 || audit.isFetching} onClick={() => setAuditOffset(auditOffset + 50)}>Older changes</Button></nav>}
      </>}
    </details>
  </WorkspaceShell>;
}

function ConfigurationEditor({ group, initial, choices, onBack, onBusy, onSaved }: { group: Group; initial: Row; choices: (field: string) => [string, string][] | null; onBack: () => void; onBusy: (busy: boolean) => void; onSaved: () => void }) {
  const { authed } = useAuth();
  const [draft, setDraft] = useState<Row>({ ...initial });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  return <form className="configuration-editor" aria-label="Edit configuration record" onSubmit={async event => {
    event.preventDefault(); setBusy(true); onBusy(true); setError(null); setSaved(false);
    try {
      await authed(token => request(`/admin/configuration/${group}/${encodeURIComponent(rowId(initial))}`, { token, method: "PUT", body: Object.fromEntries(fields[group].map(field => [camel(field), draft[field]])) }));
      setSaved(true); onSaved();
    } catch (failure) { setError(failure as ApiError); }
    finally { setBusy(false); onBusy(false); }
  }}>
    <Button className="configuration-back" type="button" variant="secondary" disabled={busy} onClick={onBack}>← Back to records</Button>
    <div><h2 id="configuration-editor-heading" tabIndex={-1} className="text-heading">{rowName(initial)}</h2>{group === "users" && <p className="text-meta text-ink-muted">{initial.email ?? "No email"}</p>}</div>
    <fieldset disabled={busy} className="configuration-fields border-0 p-0 m-0" tabIndex={0} aria-label="Configuration fields">
      {fields[group].map(field => { const value = draft[field], options = choices(field), range = numeric[field]; return <label key={field} className="flex flex-col gap-1 text-meta">{labels[field]}
        {typeof value === "boolean" ? <input type="checkbox" checked={value} onChange={event => setDraft({ ...draft, [field]: event.target.checked })} /> : options ? <select value={String(value ?? "")} onChange={event => setDraft({ ...draft, [field]: event.target.value || null })}>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select> : <input required type={range ? "number" : "text"} min={range?.[0]} max={range?.[1]} step={range?.[2]} maxLength={group === "categories" ? 120 : 160} value={String(value ?? "")} onChange={event => setDraft({ ...draft, [field]: range && event.target.value !== "" ? Number(event.target.value) : event.target.value })} />}
      </label>; })}
    </fieldset>
    <div className="configuration-save">
      {error && <ErrorState action="Saving configuration" problem={error.problem} />}
      {saved && <p role="status" className="text-dense mb-2">Saved. The change is recorded in configuration history.</p>}
      <Button disabled={busy} type="submit">{busy ? "Saving…" : "Save configuration"}</Button>
    </div>
  </form>;
}
