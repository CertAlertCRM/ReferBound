"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Keeps the partner portal live: re-fetches server data every `ms` while the
// tab is visible, and immediately when the tab regains focus.
export function AutoRefresh({ ms = 60000 }: { ms?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, ms);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, ms]);

  return null;
}
