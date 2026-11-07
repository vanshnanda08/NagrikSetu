"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useSignIn } from "@/lib/signInDialog";
import { canSupervise } from "@/lib/navigation";
import { PageShell } from "@/components/PageShell";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { WorkQueue } from "@/components/work/WorkQueue";
import { AssignmentBoardPage } from "@/components/supervisor/AssignmentPanel";
import ReviewPanel from "@/components/supervisor/ReviewPanel";
import AnalyticsPanel from "@/components/supervisor/AnalyticsPanel";

function ComplaintsWorkspace() {
  const { session, initialising } = useAuth();
  const { openSignIn } = useSignIn();
  const params = useSearchParams();
  if (initialising) return <PageShell wide><LoadingState label="Checking your session" /></PageShell>;
  if (!session || session.role === "CITIZEN") return <PageShell wide>
    <h1 className="text-display">Complaints</h1>
    <EmptyState message="This workspace is for municipal staff, supervisors and administrators." {...(!session ? { actionLabel: "Sign in", onAction: openSignIn } : { actionLabel: "Explore public issues", actionHref: "/issues" })} />
  </PageShell>;
  const requested = session.role === "ADMIN" && params.get("view") === "mine" ? "assignments" : params.get("view");
  const view = requested === "mine" || requested === "assignments" || requested === "review" || requested === "performance"
    ? requested : canSupervise(session.role) ? "assignments" : "mine";
  if (view !== "mine" && !canSupervise(session.role)) return <PageShell wide>
    <h1 className="text-display">Complaints</h1>
    <EmptyState message="This view is for supervisors and administrators. Your work queue is available below." actionLabel="Open my work" actionHref="/work?view=mine" />
  </PageShell>;
  if (view === "assignments") return <AssignmentBoardPage />;
  if (view === "review") return <ReviewPanel />;
  if (view === "performance") return <AnalyticsPanel />;
  return <WorkQueue />;
}

export default function WorkPage() {
  return <Suspense fallback={<PageShell wide><LoadingState label="Loading the complaints workspace" /></PageShell>}><ComplaintsWorkspace /></Suspense>;
}
