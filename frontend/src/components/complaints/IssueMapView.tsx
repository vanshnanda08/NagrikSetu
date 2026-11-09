"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { StatusRule } from "@/components/StatusRule";
import { PageShell } from "@/components/PageShell";
import { ComplaintViews } from "@/components/ComplaintViews";
import { MapCanvas, type Viewport } from "@/components/MapCanvas";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { useBbox, useCategories } from "@/lib/queries";
import { ISSUE_STATUSES, STATUS, isOverdue, statusWord } from "@/lib/status";
import { IssueDetailPanel } from "@/components/IssueDetailPanel";
import { useAuth } from "@/lib/auth";
import { SERVICE_AREA_CENTER, SERVICE_AREA_ZOOM } from "@/lib/serviceArea";
import type { ApiError } from "@/lib/api";
import type { PublicIssue } from "@/lib/types";

/**
 * Issue map (blueprint §3.4): spatial browse of the whole city.
 *
 * Tiles render immediately and markers arrive after. The map is NEVER blocked
 * on the marker query -- a citizen who opens this on a weak connection gets a
 * usable map of their city while the 500 markers are still in flight.
 *
 * The viewport and filters live in the URL, because "open drainage issues in
 * ward 12" is a link somebody sends (blueprint §3.4, §6).
 */

function MapInner() {
  const router = useRouter();
  const params = useSearchParams();

  const status = params.get("status") ?? "";
  const category = params.get("category") ?? "";
  const categories = useCategories();

  const [viewport, setViewport] = useState<Viewport | null>(null);

  // Which pin is open. Kept out of the URL deliberately: the viewport and the
  // filters are what somebody shares ("drainage issues in ward 12"), and a
  // selected pin is a transient act of reading rather than part of that view.
  const [selectedIssue, setSelectedIssue] = useState<PublicIssue | null>(null);
  const selectedId = selectedIssue?.id ?? null;

  // Who sees the clustering geometry. A citizen gets a map with dots on it; the
  // merge radius and the extent cap are facts about the engine, and drawing
  // them for everybody turns a map into an instrument panel. See
  // IssueDetailPanel for the same split on the numbers.
  const { session } = useAuth();
  const technical = !!session && session.role !== "CITIZEN";

  const bbox = useBbox(
    viewport
      ? {
          south: viewport.south,
          west: viewport.west,
          north: viewport.north,
          east: viewport.east,
          status: status || undefined,
          category: category || undefined,
        }
      : null,
  );

  // Debounced to 300ms inside MapCanvas; this only records the result and
  // writes it to the URL so the view is shareable.
  const onViewportChange = useCallback(
    (v: Viewport) => {
      setViewport(v);
      const current = new URL(window.location.href);
      if (current.pathname !== "/issues" || current.searchParams.get("view") !== "map") return;
      const next = new URLSearchParams(current.search);
      next.set("c", `${v.south.toFixed(4)},${v.west.toFixed(4)},${v.north.toFixed(4)},${v.east.toFixed(4)}`);
      next.set("z", String(v.zoom));
      next.set("view", "map");
      // Panning changes client-side state, not the server-selected screen.
      // A router navigation here can race with a click on the List view.
      if (next.toString() !== current.searchParams.toString()) {
        window.history.replaceState(null, "", `/issues?${next.toString()}`);
      }
    },
    [],
  );

  function setFilter(key: string, value: string) {
    setSelectedIssue(null);
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/issues?${next.toString()}`);
  }

  const saved = params.get("c")?.split(",").map(Number);
  const center =
    saved && saved.length === 4 && saved.every((n) => Number.isFinite(n))
      ? { lat: (saved[0] + saved[2]) / 2, lng: (saved[1] + saved[3]) / 2 }
      : SERVICE_AREA_CENTER;
  const zoom = Number(params.get("z")) || SERVICE_AREA_ZOOM;

  const items = bbox.data?.items ?? [];
  const filtersActive = Boolean(status || category);

  // Opening the panel resizes the map and can put its marker outside the next
  // bounding-box result. Retain the selected record until closed or filtered;
  // otherwise the panel and map can repeatedly resize and dismiss each other.
  const selected = items.find((i) => i.id === selectedId) ?? selectedIssue;

  return (
    <PageShell wide className="explore-page">
      <ComplaintViews current="map" />
      <p className="page-description mt-2 text-dense">Explore reports near you. Select a marker to view its status and details.</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-muted">Status</span>
          <select
            value={status}
            onChange={(e) => setFilter("status", e.target.value)}
            className="bg-surface-raised border border-rule px-2 text-dense"
            style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }}
          >
            <option value="">Any status</option>
            {ISSUE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusWord(s, "staff")}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-muted">Category</span>
          <select
            value={category}
            onChange={(e) => setFilter("category", e.target.value)}
            className="bg-surface-raised border border-rule px-2 text-dense"
            style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }}
          >
            <option value="">Any category</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.code} value={c.code}>
                {c.displayName}
              </option>
            ))}
          </select>
        </label>

        <p className="ml-auto text-meta text-ink-muted">
          {bbox.isFetching
            ? "Loading markers…"
            : bbox.data
              ? `${items.length} shown`
              : "Pan the map to load markers"}
        </p>
      </div>

      {categories.isError && <ErrorState action="Loading category filters" problem={(categories.error as ApiError)?.problem} onRetry={() => void categories.refetch()} />}

      {/* The cap is stated, not hidden. A map that quietly draws the first 500
          of 4,000 is showing a filtered view of the city while looking complete. */}
      {bbox.data?.capped && (
        <p className="mt-3 text-dense" style={{ color: "var(--st-pending)" }}>
          More than {bbox.data.cap} issues are in this view, so only {bbox.data.cap} are
          drawn. Zoom in to see all of them.
        </p>
      )}

      {bbox.isError && (
        <ErrorState
          action="Loading markers"
          problem={(bbox.error as ApiError)?.problem}
          onRetry={() => void bbox.refetch()}
        />
      )}

      {bbox.data && !bbox.isFetching && items.length === 0 && !bbox.isError && (
        <p className="mt-3 text-dense" role="status">No issues in this map area{filtersActive ? " match these filters" : ""}. Move or zoom the map{filtersActive ? ", or change the filters" : ""} to explore more.</p>
      )}

      <div className="map-workspace mt-4">
        {/* Side by side once there is room, stacked below on a phone -- where a
            560px map plus a panel beside it would leave neither usable. */}
        <div className={`grid gap-4 ${selected ? "lg:grid-cols-[1fr_360px]" : "grid-cols-1"}`}>
          <div>
            <MapCanvas
              center={center}
              zoom={zoom}
              height={560}
              onViewportChange={onViewportChange}
              markers={items.map((i) => ({
                id: i.id,
                lat: i.lat,
                lng: i.lng,
                kind: "issue" as const,
                color: STATUS[i.status].color,
                overdue: isOverdue(i.status, i.effectiveDeadline),
                reporters: i.distinctReporterCount,
                selected: i.id === selectedId,
                label: `${i.publicRef} — ${i.categoryName}, ${statusWord(i.status)}`,
                // A click opens the panel beside the map rather than a Leaflet
                // popup. A popup is a second, differently-styled surface that
                // cannot hold a photo, a history and an action -- and it
                // covers the map it is anchored to.
                onClick: () => setSelectedIssue(i),
              }))}
              circles={
                technical && selected
                  ? [
                      {
                        lat: selected.lat,
                        lng: selected.lng,
                        radiusM: selected.clusterExtentCapM,
                        style: "extentCap" as const,
                      },
                      {
                        lat: selected.lat,
                        lng: selected.lng,
                        radiusM: selected.mergeRadiusM,
                        style: "merge" as const,
                      },
                    ]
                  : []
              }
            />
          </div>

          {selected && (
            <IssueDetailPanel
              issue={selected}
              technical={technical}
              onClose={() => setSelectedIssue(null)}
            />
          )}
        </div>
      </div>

      {items.length > 0 && (
        <details className="map-issue-list mt-4">
          <summary className="text-dense font-medium">View these issues as a list</summary>
          <p className="text-meta text-ink-muted mb-2">Select an issue here when markers are close together. The same details open beside the map.</p>
          <ul className="list-none p-0 max-h-80 overflow-y-auto border border-rule rounded-token-sm">
            {items.map((item) => (
              <li key={item.id} className="border-b border-rule last:border-0">
                <button type="button" className="map-issue-option w-full flex flex-wrap items-center gap-3 p-3 text-left hover:bg-surface-sunk"
                  aria-pressed={selectedId === item.id} onClick={() => setSelectedIssue(item)}>
                  <span className="font-mono text-ref">{item.publicRef}</span>
                  <span className="text-dense">{item.categoryName}</span>
                  <StatusRule status={item.status} />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {bbox.data && items.length === 0 && (
        <p className="mt-4 text-body">
          No issues {filtersActive ? "match these filters " : ""}in this area.{" "}
          {filtersActive && (
            <button
              type="button"
              className="underline bg-transparent border-0 p-0 cursor-pointer text-ink text-body"
              onClick={() => router.push("/issues?view=map")}
            >
              Clear the filters
            </button>
          )}
        </p>
      )}

      <p className="mt-4 text-meta text-ink-muted">
        Marker colour is the issue status, and each status also has its own
        shape — the map stays readable in greyscale. Overdue issues carry a
        heavier outline.
      </p>
    </PageShell>
  );
}

/**
 * `useSearchParams` opts the subtree into client-side rendering, so Next
 * requires a Suspense boundary around it -- without one the whole route
 * refuses to prerender. The boundary is here rather than higher up so the
 * header and page frame still render server-side while the filters resolve.
 */
export default function IssueMapView() {
  return (
    <Suspense
      fallback={
        <PageShell wide>
          <LoadingState label="Loading the map" />
        </PageShell>
      }
    >
      <MapInner />
    </Suspense>
  );
}
