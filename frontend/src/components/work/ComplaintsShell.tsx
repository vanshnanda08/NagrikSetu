"use client";

import { WorkspaceShell } from "@/components/WorkspaceShell";
import { useAuth } from "@/lib/auth";
import { workViews, type WorkView } from "@/lib/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

export function ComplaintsShell({ view, children, className = "" }: { view: WorkView; children: ReactNode; className?: string }) {
  const { session } = useAuth();
  const selected = useSearchParams().get("issue");
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (selected) document.getElementById("selected-complaint")?.focus({ preventScroll: true });
    else if (previous.current) document.querySelector<HTMLElement>(".work-list")?.focus({ preventScroll: true });
    previous.current = selected;
  }, [selected]);
  return (
    <WorkspaceShell title="Complaints" links={workViews(session?.role)} current={`/work?view=${view}`} className={`complaints-workspace ${className}`} compactHeader>
      {children}
    </WorkspaceShell>
  );
}
