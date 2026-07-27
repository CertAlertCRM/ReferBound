"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Partner = {
  id: string;
  name: string;
  token: string;
  emails: string[];
  referrals: { count: number }[];
};

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [name, setName] = useState("");
  const [emails, setEmails] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/partners");
    if (res.ok) setPartners((await res.json()).partners ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, emails }),
    });
    setSaving(false);
    if (res.ok) {
      setName("");
      setEmails("");
      load();
    } else alert((await res.json()).error ?? "Failed");
  }

  function portalLink(p: Partner) {
    return `${window.location.origin}/p/${p.token}`;
  }

  async function copy(p: Partner) {
    await navigator.clipboard.writeText(portalLink(p));
    setCopied(p.id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <Link href="/" className="text-sm text-brand">← Back to referrals</Link>
      <h1 className="text-2xl font-bold">Referral partners</h1>

      <form onSubmit={add} className="card p-4 space-y-3">
        <h2 className="font-semibold">Add a partner</h2>
        <input
          className="input"
          placeholder="Partner / team name (e.g., Cowart Home Loans)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="input"
          placeholder="Notification emails, comma-separated"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
        />
        <button className="btn-primary" disabled={saving}>
          {saving ? "Adding…" : "Add partner"}
        </button>
      </form>

      <div className="space-y-3">
        {partners.map((p) => (
          <div key={p.id} className="card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-slate-500">
                  {p.referrals?.[0]?.count ?? 0} referral(s)
                  {p.emails.length > 0 && ` · notifies ${p.emails.join(", ")}`}
                </p>
              </div>
              <div className="flex gap-2">
                <a className="btn-ghost text-xs" href={`/p/${p.token}`} target="_blank">
                  View portal
                </a>
                <button className="btn-primary text-xs" onClick={() => copy(p)}>
                  {copied === p.id ? "Copied ✔" : "Copy magic link"}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 break-all">/p/{p.token}</p>
          </div>
        ))}
        {partners.length === 0 && (
          <p className="text-slate-500 text-sm">No partners yet — add your first one above, then send them their magic link.</p>
        )}
      </div>
    </main>
  );
}
