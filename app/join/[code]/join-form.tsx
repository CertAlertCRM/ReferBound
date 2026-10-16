"use client";

import { useState } from "react";
import { translator, PARTNER_ROLES, type Locale } from "@/lib/i18n";

// The form half of the join page.
//
// Deliberately short. Every field beyond name and email is one more reason a
// loan officer tapping through from a story closes the tab — so role is a
// select with a sane default, phone is optional, and the note is the only free
// text, because the note is the agent's only evidence that this is a real
// person and not a bot.

export function JoinForm({
  code,
  locale,
  agentName,
}: {
  code: string;
  locale: Locale;
  agentName: string;
}) {
  const tr = translator(locale);
  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    partner_type: "lender",
    note: "",
  });
  const [state, setState] = useState<"edit" | "sending" | "done">("edit");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim()) {
      setError(tr("join.error.required"));
      return;
    }
    setState("sending");
    try {
      const res = await fetch(`/api/join/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, locale }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server sends a translation key, not a sentence, so the message a
        // Spanish-speaking visitor sees is Spanish even when it comes from a
        // validation failure.
        setError(json?.key ? tr(json.key, { agent: agentName }) : tr("join.error.generic"));
        setState("edit");
        return;
      }
      setState("done");
    } catch {
      setError(tr("join.error.generic"));
      setState("edit");
    }
  }

  if (state === "done") {
    return (
      <div className="card p-6 border-brand-200 bg-brand-light/40 text-center space-y-1.5">
        <p className="font-semibold">{tr("join.done.title")}</p>
        <p className="text-sm text-ink-secondary">{tr("join.done.body", { agent: agentName })}</p>
      </div>
    );
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <form onSubmit={submit} className="card p-5 sm:p-6 space-y-4">
      <p className="font-semibold">{tr("join.form.title")}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="section-label">{tr("join.form.name")}</span>
          <input className="input mt-1.5" value={form.name} onChange={set("name")} autoComplete="name" required />
        </label>
        <label className="block">
          <span className="section-label">{tr("join.form.company")}</span>
          <input className="input mt-1.5" value={form.company} onChange={set("company")} autoComplete="organization" />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="section-label">{tr("join.form.email")}</span>
          <input
            className="input mt-1.5"
            type="email"
            inputMode="email"
            value={form.email}
            onChange={set("email")}
            autoComplete="email"
            required
          />
        </label>
        <label className="block">
          <span className="section-label">{tr("join.form.phone")}</span>
          <input
            className="input mt-1.5"
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={set("phone")}
            autoComplete="tel"
          />
        </label>
      </div>

      <label className="block">
        <span className="section-label">{tr("join.form.role")}</span>
        <select className="input mt-1.5" value={form.partner_type} onChange={set("partner_type")}>
          {PARTNER_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {tr(r.key)}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="section-label">{tr("join.form.note")}</span>
        <textarea
          className="input mt-1.5 min-h-[72px]"
          value={form.note}
          onChange={set("note")}
          placeholder={tr("join.form.notePlaceholder")}
          maxLength={400}
        />
      </label>

      {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

      <button className="btn-primary w-full" disabled={state === "sending"}>
        {state === "sending" ? tr("join.form.sending") : tr("join.form.submit")}
      </button>
    </form>
  );
}
