"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/useOnline";

/**
 * The offline notice (blueprint §3.22). It says what is true -- the screen
 * already loaded still works -- and what the app does about the one thing a
 * citizen cannot afford to lose: a report in progress is held and sent when the
 * connection returns. Fixed to the bottom of the window so it takes no layout
 * space from the page it is warning about.
 */
export function OfflineNotice() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      className="glass offline-notice fixed left-1/2 z-[900] flex items-start gap-3 px-5 py-3 text-dense"
      style={{ bottom: 16, transform: "translateX(-50%)", maxWidth: "min(560px, calc(100vw - 32px))" }}
    >
      <WifiOff size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
      <p className="m-0">
        <strong className="font-semibold">You are offline.</strong> What is already on screen still
        works. A report you are composing is held and will be sent when the connection returns.
      </p>
    </div>
  );
}
