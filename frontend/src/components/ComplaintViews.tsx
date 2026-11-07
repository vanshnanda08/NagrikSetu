"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { complaintViewHref } from "@/lib/navigation";

/** List and map are two ways of browsing complaints, under one destination. */
export function ComplaintViews({ current }: { current: "list" | "map" }) {
  const params = useSearchParams();
  return (
    <div className="explore-heading">
      <h1 className="text-display">Explore issues</h1>
      <nav aria-label="Complaint views" className="account-nav flex flex-wrap gap-1 text-dense">
        <Link href={complaintViewHref(params.toString(), "list")} aria-current={current === "list" ? "page" : undefined}>List</Link>
        <Link href={complaintViewHref(params.toString(), "map")} aria-current={current === "map" ? "page" : undefined}>Map</Link>
      </nav>
    </div>
  );
}
