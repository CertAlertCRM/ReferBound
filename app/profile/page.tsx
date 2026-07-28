"use client";

import { useEffect, useState } from "react";
import { TopNav } from "../components";

type Profile = {
  display_name: string | null;
  agency_name: string | null;
  office: string | null;
  phone: string | null;
  email: string | null;
};

const EMPTY: Profile = { display_name: "", agency_name: "", office: "", phone: "", email: "" };

export default function ProfilePage() {
  const [form, setForm] = useState<Profile>(EMPTY);
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/profile").then(async (res) => {
      if (res.ok) {
        const { profile, headshotUrl } = await res.json();
        if (profile) {
          setForm({
            display_name: profile.display_name ?? "",
            agency_name: profile.agency_name ?? "",
            office: profile.office ?? "",
            phone: profile.phone ?? "",
            email: profile.email ?? "",
          });
        }
        setHeadshotUrl(headshotUrl);
      }
      setLoading(false);
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      alert((await res.json()).error ?? "Failed to save");
    }
  }

  async function uploadHeadshot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/profile/headshot", { method: "POST", body: fd });
    setUploading(false);
    e.target.value = "";
    if (res.ok) setHeadshotUrl((await res.json()).headshotUrl);
    else alert((await res.json()).error ?? "Upload failed");
  }

  const field = (key: keyof Profile, label: string, placeholder: string) => (
    <label className="block">
      <span className="section-label">{label}</span>
      <input
        className="input mt-1.5"
        placeholder={placeholder}
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <>
      <TopNav active="profile" />
      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Your profile</h1>
          <p className="text-sm text-ink-secondary mt-1">
            Your name and agency appear on every partner portal — this is how partners see you.
          </p>
        </div>

        {loading ? (
          <div className="card p-10 text-center text-ink-muted">Loading…</div>
        ) : (
          <>
            <section className="card p-6 flex items-center gap-5">
              {headshotUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={headshotUrl}
                  alt="Headshot"
                  className="w-28 h-28 rounded-full object-cover border-2 border-slate-200"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-brand-light text-brand-700 flex items-center justify-center text-3xl font-bold">
                  {(form.display_name || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <label className="btn-ghost cursor-pointer">
                  {uploading ? "Uploading…" : headshotUrl ? "Replace headshot" : "Upload headshot"}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={uploadHeadshot}
                    disabled={uploading}
                  />
                </label>
                <p className="text-xs text-ink-muted mt-2">JPG or PNG, up to 5MB. Square photos look best.</p>
              </div>
            </section>

            <form onSubmit={save} className="card p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {field("display_name", "Your name", "David Falden")}
                {field("agency_name", "Agency name", "Your agency")}
              </div>
              {field("office", "Office", "Street, city, state")}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {field("phone", "Phone", "(555) 555-5555")}
                {field("email", "Email", "you@example.com")}
              </div>
              <button className="btn-primary" disabled={saving}>
                {saving ? "Saving…" : saved ? "Saved ✓" : "Save profile"}
              </button>
            </form>
          </>
        )}
      </main>
    </>
  );
}
