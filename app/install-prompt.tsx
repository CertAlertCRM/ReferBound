"use client";

import { useEffect, useState } from "react";
import { IconX } from "./icons";

// A real install nudge for signed-in users. Three states:
//  - Chrome/Edge/Android: captures beforeinstallprompt → real "Install" button
//  - iOS Safari: can't programmatically prompt → shows the two-tap recipe
//  - Already installed (standalone) or dismissed: renders nothing
// Dismissal sticks per device.

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("rb_install_dismissed") === "1") return;
    } catch {}
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (standalone) return;

    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    setIsIos(ios);
    setShow(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setTimeout(() => setShow(false), 2500);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem("rb_install_dismissed", "1");
    } catch {}
  }

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setInstalled(true);
    setDeferred(null);
  }

  if (!show) return null;

  return (
    <div className="card px-4 py-3 flex items-center justify-between gap-3 flex-wrap border-brand-200 bg-brand-light/40">
      {installed ? (
        <p className="text-sm font-medium text-emerald-700">✓ Installed — ReferBound is on your home screen.</p>
      ) : (
        <>
          <div className="min-w-0">
            <p className="text-sm font-semibold">📱 Get the app</p>
            <p className="text-xs text-ink-secondary mt-0.5">
              {deferred
                ? "Install ReferBound — full screen, home-screen icon, no app store."
                : isIos
                  ? "iPhone: tap Share (the square with the arrow) → Add to Home Screen. Full app, no app store."
                  : "Open referbound.com on your phone — iPhone: Share → Add to Home Screen · Android: Install from the address bar."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {deferred && (
              <button className="btn-primary !py-1.5 !px-4 text-xs" onClick={install}>
                Install app
              </button>
            )}
            <button
              className="text-ink-muted hover:text-ink p-1"
              onClick={dismiss}
              title="Don't show this again"
              aria-label="Dismiss install prompt"
            >
              <IconX size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
