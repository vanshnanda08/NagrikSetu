"use client";
import { useEffect } from "react";
import { wakeOutbox } from "@/lib/offlineStore";
export function OutboxSync() {
  useEffect(() => {
    const wake = () => { if (navigator.onLine) void wakeOutbox().catch(() => {}); };
    wake();
    window.addEventListener("online", wake);
    const timer = setInterval(wake, 60000);
    return () => { window.removeEventListener("online", wake); clearInterval(timer); };
  }, []);
  return null;
}
