"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { workHref } from "@/lib/navigation";

export function workQueueSort(value: string | null) {
  return value === "oldest" || value === "priority" ? value : "newest";
}

export function QueueSortControl({ disabled = false }: { disabled?: boolean }) {
  const params = useSearchParams();
  const router = useRouter();

  return (
    <label className="my-3 flex flex-wrap items-center gap-2 text-meta">
      <span>Sort complaints</span>
      <select
        value={workQueueSort(params.get("sort"))}
        disabled={disabled}
        className="border border-rule rounded-lg bg-surface-raised px-3 py-2 text-dense text-ink"
        style={{ minHeight: "var(--hit-min)" }}
        onChange={event => router.push(workHref(params.toString(), {
          sort: event.target.value, queueOffset: null, boardOffset: null, issue: null,
        }), { scroll: false })}
      >
        <option value="newest">Date added: newest first</option>
        <option value="oldest">Date added: oldest first</option>
        <option value="priority">Priority and deadline</option>
      </select>
    </label>
  );
}
