"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "./SiteHeader";
import { OfflineNotice } from "./OfflineNotice";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

/**
 * Page chrome. Single column, left-aligned (blueprint §1.5).
 *
 * `wide` opts a page out of the prose measure for the surfaces that genuinely
 * need the full width -- tables and maps. Everything else stays inside 68ch,
 * because a line of prose 1100px long is unreadable regardless of how much
 * screen there is.
 */
export function PageShell({
  children,
  wide = false,
  className = "",
}: {
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const { session } = useAuth();

  return (
    <div className={`liquid-app flex min-h-screen flex-col md:flex-row ${className}`}>
      <SiteHeader />
      {/* `min-w-0` so a wide table or a long unbroken string inside `main`
          cannot force the flex row wider than the viewport -- the default
          `min-width: auto` on a flex item is what turns that into a
          horizontal scrollbar on the whole page. */}
      {/*
          `key={pathname}` remounts main on every navigation, which is what
          replays the entrance -- React would otherwise reuse the element and
          the keyframes, already finished, would never run again. Same reason
          the category glyph is keyed on its selected state.

          The entrance is 8px and 320ms on the CONTAINER, not on each child.
          One element moving reads as the page arriving; a dozen children
          arriving separately reads as the page struggling.
      */}
      <main
        key={pathname}
        className="page-main flex-1 min-w-0 w-full mx-auto px-4 py-6 md:px-8 u-rise"
        style={{ maxWidth: wide ? 1440 : 920 }}
      >
        {session?.mfaSetupRequired && pathname !== "/me/security" && (
          <p role="alert" className="mb-4 border-l-4 border-st-breached pl-3 text-dense">
            Multi-factor authentication is required for municipal accounts.{" "}
            <Link href="/me/security" className="underline text-ink">Secure this account</Link>
            {" "}to use staff and administration tools.
          </p>
        )}
        {children}
      </main>
      <OfflineNotice />
    </div>
  );
}
