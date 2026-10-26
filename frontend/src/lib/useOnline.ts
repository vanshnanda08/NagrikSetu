"use client";

import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/**
 * Whether the browser believes it has a connection.
 *
 * `navigator.onLine` is a hint, not a promise: true can still mean a captive
 * portal or a dead tower, so a failed request is handled separately and this is
 * only used to say so *before* a request is made. The server snapshot is
 * `true` -- the server cannot know, and claiming "offline" in the HTML would
 * flash a warning at everybody on every page load.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
