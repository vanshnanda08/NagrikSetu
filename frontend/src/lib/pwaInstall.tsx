"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallState {
  prompt: InstallPromptEvent | null;
  installed: boolean;
  clearPrompt: () => void;
}

const InstallContext = createContext<InstallState>({ prompt: null, installed: false, clearPrompt: () => {} });

/** Capture eligibility on every route, before the settings panel is opened. */
export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const updateDisplay = () => setInstalled(display.matches);
    const ready = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const done = () => { setInstalled(true); setPrompt(null); };
    updateDisplay();
    display.addEventListener("change", updateDisplay);
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => {
      display.removeEventListener("change", updateDisplay);
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  return (
    <InstallContext.Provider value={{ prompt, installed, clearPrompt: () => setPrompt(null) }}>
      {children}
    </InstallContext.Provider>
  );
}

export const usePwaInstall = () => useContext(InstallContext);
