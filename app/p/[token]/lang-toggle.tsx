"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n";

// The partner's own language switch.
//
// It writes the choice back to their partner record, which is the part that
// matters: a Spanish-speaking realtor should pick this once, not every time
// they open the bookmark. The URL is updated too so a refresh or a shared
// screenshot lands in the same language.
//
// Fails soft on purpose. If the save fails the view still switches for this
// visit — a language toggle that shows an error dialog is worse than one that
// quietly forgets.

export function LangToggle({ token, locale }: { token: string; locale: Locale }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState(false);

  async function pick(next: Locale) {
    if (next === locale) return;
    setSaving(true);
    try {
      await fetch(`/api/p/${encodeURIComponent(token)}/language`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
    } catch {
      // Remembering it is a convenience, not the feature.
    }
    setSaving(false);
    start(() => {
      router.replace(`?lang=${next}`);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Language">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => pick(l)}
          disabled={saving || pending}
          aria-pressed={l === locale}
          className={
            l === locale
              ? "rounded-md bg-white/20 px-2 py-1 text-[11px] font-semibold text-white"
              : "rounded-md px-2 py-1 text-[11px] font-medium text-brand-100 hover:text-white disabled:opacity-60"
          }
        >
          {LOCALE_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
