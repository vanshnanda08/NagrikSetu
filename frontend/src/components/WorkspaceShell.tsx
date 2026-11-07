import Link from "next/link";
import { PageShell } from "./PageShell";
import type { NavigationLink } from "@/lib/navigation";
import type { ReactNode } from "react";

/** One workspace heading and navigation, with task-specific content below. */
export function WorkspaceShell({ title, links, current, children, className = "", compactHeader = true }: {
  title: string; links: readonly NavigationLink[]; current: string; children: ReactNode; className?: string; compactHeader?: boolean;
}) {
  const heading = <h1 className="text-display">{title}</h1>;
  const navigation = <nav aria-label={`${title} views`} className="account-nav mb-3 mt-3 flex flex-wrap gap-1 text-dense">
    {links.map(link => <Link key={link.href} href={link.href} aria-current={current === link.href ? "page" : undefined} className="text-ink underline">{link.label}</Link>)}
  </nav>;
  return (
    <PageShell wide className={className}>
      {compactHeader ? <div className="workspace-titlebar">{heading}{navigation}</div> : <>{heading}{navigation}</>}
      {children}
    </PageShell>
  );
}
