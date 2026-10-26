"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { request } from "@/lib/api";

type Row = Record<string, string | number | boolean | null>;
type Group = "categories" | "users" | "departments" | "wards";
type Config = Record<Group, Row[]>;
const fields: Record<Group, string[]> = {
  categories: ["display_name","merge_radius_m","default_sla_hours","severity_weight","reopen_window_days","max_extent_multiplier","low_conf_action","is_mobile_target","department_id","active"],
  users: ["full_name","role","department_id","ward_id","active"],
  departments: ["name","parent_department_id","head_user_id"],
  wards: ["name","officer_user_id"],
};
const camel = (key: string) => key === "is_mobile_target" ? "mobileTarget" : key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const label = (key: string) => key.replaceAll("_", " ").replace(/\bid\b/g, "").trim();

export default function ConfigurationPage() {
  const { session, initialising, authed } = useAuth();
  const cache = useQueryClient();
  const [group, setGroup] = useState<Group>("categories");
  const [selected, setSelected] = useState<Row | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const config = useQuery({ queryKey:["configuration",session?.userId],enabled:session?.role === "ADMIN",
    queryFn:() => authed(token => request<Config>("/admin/configuration",{ token })) });
  const audit = useQuery({ queryKey:["configuration-audit",session?.userId],enabled:session?.role === "ADMIN",
    queryFn:() => authed(token => request<Row[]>("/admin/configuration/audit",{ token })) });
  if (initialising) return <PageShell><p>Checking your session…</p></PageShell>;
  if (session?.role !== "ADMIN") return <PageShell><h1 className="text-display">Administration</h1><p className="mt-4">Sign in with an administrator account to manage configuration.</p><Link href="/login" className="underline">Sign in</Link></PageShell>;
  const data = config.data;
  function options(field: string): [string,string][] | null {
    if (field === "role") return ["CITIZEN","STAFF","SUPERVISOR","ADMIN"].map(v => [v,v]);
    if (field === "low_conf_action") return [["MERGE_FLAG","Merge and flag"],["SPLIT_FLAG","Split and flag"]];
    if (!field.endsWith("_id") || !data) return null;
    const source = field.includes("department") ? data.departments : field === "ward_id" ? data.wards : data.users.filter(row => row.active && row.role !== "CITIZEN");
    return [["","None"], ...source.map(row => [String(row.id),String(row.name ?? row.full_name)] as [string,string])];
  }
  return <PageShell wide>
    <h1 className="text-display">Configuration</h1>
    <p className="mt-3 text-body">Manage existing categories, SLA targets, user access, department hierarchy and ward officers. Category changes apply to new work; existing due dates and ward boundaries are not rewritten. Access tokens may remain valid for up to 15 minutes after an access change.</p>
    <Link href="/admin/audit" className="underline block mt-3">Issue audit log</Link>
    <div className="mt-5 flex flex-wrap gap-3">{(Object.keys(fields) as Group[]).map(item => <Button key={item} variant={group === item ? "primary" : "secondary"} onClick={() => { setGroup(item);setSelected(null);setMessage(""); }}>{item}</Button>)}</div>
    {config.isPending && <p className="mt-4">Loading configuration…</p>}
    {config.isError && <p role="alert">Could not load configuration. <button onClick={() => void config.refetch()}>Retry</button></p>}
    {data && <div className="grid md:grid-cols-2 gap-6 mt-6">
      <div className="max-h-[60vh] overflow-auto"><ul className="grid gap-2">{data[group].map(row => <li key={String(row.id ?? row.code)}><button className="border border-rule w-full text-left p-3 bg-surface-raised" onClick={() => { setSelected({...row});setMessage(""); }}>{String(row.display_name ?? row.full_name ?? row.name)} <span className="text-ink-muted">{row.active === false ? "(inactive)" : ""}</span></button></li>)}</ul></div>
      {selected ? <form className="grid gap-3" onSubmit={async event => {
        event.preventDefault();setBusy(true);setMessage("");
        const body = Object.fromEntries(fields[group].map(field => [camel(field),selected[field]]));
        try {
          await authed(token => request(`/admin/configuration/${group}/${encodeURIComponent(String(selected.id ?? selected.code))}`,{ token,method:"PUT",body }));
          setMessage("Saved. The change is recorded in the configuration audit below.");
          await cache.invalidateQueries({ queryKey:["configuration"] });
          await cache.invalidateQueries({ queryKey:["configuration-audit"] });
        } catch(error) { setMessage(error instanceof Error ? error.message : "Could not save."); }
        finally { setBusy(false); }
      }}>
        {fields[group].map(field => {
          const value = selected[field]; const choices = options(field);
          return <label key={field} className="grid gap-1 text-body capitalize">{label(field)}
            {typeof value === "boolean" ? <input type="checkbox" checked={value} onChange={e => setSelected({...selected,[field]:e.target.checked})} /> : choices ?
              <select className="p-3 border border-rule bg-surface-raised" value={String(value ?? "")} onChange={e => setSelected({...selected,[field]:e.target.value || null})}>{choices.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select> :
              <input className="p-3 border border-rule bg-surface-raised" type={typeof value === "number" ? "number" : "text"} step={field === "max_extent_multiplier" ? "0.01" : "1"} required value={String(value ?? "")} onChange={e => setSelected({...selected,[field]:typeof value === "number" ? Number(e.target.value) : e.target.value})} />}
          </label>;
        })}
        <Button disabled={busy} type="submit">{busy ? "Saving…" : "Save configuration"}</Button>
      </form> : <p>Select a record to edit.</p>}
    </div>}
    {message && <p role="status" className="mt-4">{message}</p>}
    <h2 className="text-heading mt-8">Latest configuration changes</h2>
    {audit.isError && <p role="alert">Could not load the configuration audit.</p>}
    <ul className="mt-3 grid gap-3">{audit.data?.map(entry => <li key={String(entry.id)} className="border border-rule p-3"><details><summary>{String(entry.created_at)} — {String(entry.resource)} {String(entry.resource_id)}</summary><p>Administrator: {String(entry.actor_id)}</p><pre className="whitespace-pre-wrap break-all text-meta">Before: {String(entry.before_value)}{"\n"}After: {String(entry.after_value)}</pre></details></li>)}</ul>
  </PageShell>;
}
