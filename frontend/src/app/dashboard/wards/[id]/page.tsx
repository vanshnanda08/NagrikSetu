"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { ErrorState } from "@/components/ErrorState";
import { MapCanvas } from "@/components/MapCanvas";
import { ScopeOverview } from "@/components/ScopeOverview";
import { SkeletonTileGrid } from "@/components/Skeleton";
import { request, type ApiError } from "@/lib/api";
import { absoluteDate, absoluteDateTime } from "@/lib/format";
import type { WardDashboard } from "@/lib/types";

/**
 * Ward page (blueprint 3.9): the dashboard's figures for one ward, its boundary
 * on a map with issue density, and the places that keep generating issues.
 * Public and shareable -- the screen a councillor's office points at -- so it
 * needs no account and its address is stable.
 */
export default function WardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ward = useQuery({
    queryKey: ["dashboard", "ward", id],
    queryFn: () => request<WardDashboard>(`/dashboard/wards/${id}`),
    staleTime: 60_000,
  });

  if (ward.isError && (ward.error as ApiError).status === 404) {
    return (
      <PageShell>
        <h1 className="text-display">No such ward</h1>
        <p className="mt-3 text-body" style={{ maxWidth: "var(--measure-prose)" }}>
          This address does not match a ward. Wards are listed on the{" "}
          <Link href="/dashboard" className="underline text-ink">
            dashboard
          </Link>
          .
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell wide>
      <p className="text-meta">
        <Link href="/dashboard" className="underline text-ink">
          ← Dashboard
        </Link>
      </p>

      {ward.isPending && (
        <>
          <h1 className="mt-2 text-display">Ward</h1>
          <SkeletonTileGrid label="Loading the ward" />
        </>
      )}
      {ward.isError && (
        <ErrorState
          action="Loading the ward"
          problem={(ward.error as ApiError)?.problem}
          onRetry={() => void ward.refetch()}
        />
      )}

      {ward.data && <WardBody w={ward.data} />}
    </PageShell>
  );
}

function WardBody({ w }: { w: WardDashboard }) {
  const hasLocation = w.density.length > 0;
  const center = hasLocation ? { lat: w.density[0].lat, lng: w.density[0].lng } : { lat: 30.9, lng: 75.85 };

  return (
    <>
      <h1 className="mt-2 text-display">{w.ward.name}</h1>
      <p className="mt-1 text-dense text-ink-muted" style={{ maxWidth: "var(--measure-prose)" }}>
        Ward {w.ward.wardNumber}. The same figures and definitions as the city dashboard, for this ward alone.
        Figures generated {absoluteDateTime(w.generatedAt)}.
      </p>

      <div className="mt-5">
        <ScopeOverview m={w.metrics} />
      </div>

      <div className="mt-8 grid grid-cols-1 xl:grid-cols-5 gap-6">
        <section className="xl:col-span-3">
          <h2 className="text-heading">Where issues are</h2>
          <p className="mt-1 text-dense text-ink-muted" style={{ maxWidth: "var(--measure-prose)" }}>
            The outline is the ward. Each disc is a patch of about 150 m; the bigger and darker it is, the
            more issues it has produced. Hover a disc for its count.
          </p>
          <div className="mt-3">
            <MapCanvas
              center={center}
              zoom={14}
              height={420}
              boundaryGeoJson={w.ward.boundary}
              density={w.density}
              interactive
            />
          </div>
        </section>

        <section className="xl:col-span-2">
          <h2 className="text-heading">Places that keep coming back</h2>
          <p className="mt-1 text-dense text-ink-muted">
            Spots where the same kind of problem has been reported as more than one issue over time.
          </p>
          {w.recurrence.length === 0 ? (
            <p className="mt-3 text-body">No spot in this ward has produced the same problem twice.</p>
          ) : (
            <ol className="mt-3 list-none p-0 border-t border-rule">
              {w.recurrence.map((r) => (
                <li key={`${r.categoryCode}-${r.lat}-${r.lng}`} className="border-b border-rule py-3">
                  <p className="text-body">
                    <strong>{r.categoryName}</strong> · {r.issues} issues
                    {r.open > 0 ? `, ${r.open} still open` : ", all resolved"}
                  </p>
                  <p className="mt-1 text-meta text-ink-muted">
                    First {absoluteDate(r.firstReportedAt)}, latest {absoluteDate(r.lastReportedAt)}
                  </p>
                  <p className="mt-1 text-meta flex flex-wrap gap-x-3">
                    {r.refs.map((ref, i) => (
                      <Link key={r.issueIds[i]} href={`/issues/${r.issueIds[i]}`} className="font-mono text-ink underline">
                        {ref}
                      </Link>
                    ))}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {w.metrics.openByCategory.length > 0 && (
        <section className="mt-8">
          <h2 className="text-heading">Open issues by category</h2>
          <ul className="mt-3 list-none p-0 border-t border-rule" style={{ maxWidth: 520 }}>
            {w.metrics.openByCategory.map((c) => (
              <li key={c.code} className="flex justify-between border-b border-rule py-2 text-body">
                <span>{c.name}</span>
                <span className="font-semibold">{c.open}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
