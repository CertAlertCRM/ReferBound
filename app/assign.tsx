"use client";

import { useCallback, useEffect, useState } from "react";

// Handing a lead to somebody.
//
// Two shapes, because there are two moments. In the log form it's a plain
// controlled field — the owner picks a name before the lead exists, and
// nothing hits the network until they save. On the deal page it's a live
// control that writes immediately, because the lead is already real and an
// owner reassigning it expects it to have moved when they close the tab.
//
// Both render NOTHING unless the signed-in person is an owner with producers
// on the account. Solo agents never see a field asking who should work a lead
// when the answer is always them.

export type Producer = { id: string; name: string; email?: string };

type TeamPayload = {
  isOwner: boolean;
  mine?: Producer | null;
  members?: Producer[];
  unassigned?: number;
};

// One fetch of the roster, shared by every consumer on the page.
//
// Deliberately fails quiet. If this request errors, the field simply doesn't
// render and the lead is logged under the owner's own name — which is exactly
// what happens today. A hand-off feature must never be the reason a lead
// can't be written down.
export function useProducers() {
  const [team, setTeam] = useState<TeamPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/producers");
      if (!res.ok) throw new Error(String(res.status));
      setTeam(await res.json());
    } catch {
      setTeam({ isOwner: false });
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const owner = team?.mine ?? null;
  const members = team?.members ?? [];
  // The control earns its space only when there is somebody else to pick.
  const canAssign = Boolean(team?.isOwner && members.length > 0);

  return { loaded, canAssign, owner, members, unassigned: team?.unassigned ?? 0, reload };
}

// ── In the log form ─────────────────────────────────────────────────────────
//
// Value is the producer id, or "" meaning "me". Empty string rather than the
// owner's own id so the form can leave producer_id off the request entirely
// when nothing was chosen, and the server keeps its existing default.

export function AssignField({
  value,
  onChange,
  owner,
  members,
  canAssign,
}: {
  value: string;
  onChange: (v: string) => void;
  owner: Producer | null;
  members: Producer[];
  canAssign: boolean;
}) {
  if (!canAssign) return null;

  return (
    <div className="space-y-1">
      <label htmlFor="assign-to" className="block text-sm font-medium text-slate-700">
        Who's working this?
      </label>
      <select
        id="assign-to"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-btn focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      >
        <option value="">{owner ? `${owner.name} (me)` : "Me"}</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {value ? (
        <p className="text-xs text-slate-500">
          It'll show up in their leads, flagged as waiting for them. Nothing goes to the client.
        </p>
      ) : null}
    </div>
  );
}

// ── On the deal page ────────────────────────────────────────────────────────

export function AssignInline({
  referralId,
  producerId,
  onMoved,
}: {
  referralId: string;
  producerId: string | null;
  onMoved?: (newProducerId: string | null) => void;
}) {
  const { canAssign, owner, members } = useProducers();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(producerId);

  useEffect(() => setCurrent(producerId), [producerId]);

  if (!canAssign) return null;

  const move = async (next: string) => {
    const target = next === "" ? owner?.id ?? null : next;
    const previous = current;
    setCurrent(target); // optimistic; the select shouldn't lag behind the click
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/producers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ referral_id: referralId, producer_id: target }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Couldn't reassign");
      onMoved?.(target);
    } catch (e: any) {
      setCurrent(previous); // put it back rather than showing a move that didn't happen
      setError(e?.message ?? "Couldn't reassign");
    } finally {
      setSaving(false);
    }
  };

  const value = current && current !== owner?.id ? current : "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-500">Worked by</span>
      <select
        value={value}
        disabled={saving}
        onChange={(e) => move(e.target.value)}
        aria-label="Assign this lead to a producer"
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium shadow-btn disabled:opacity-60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      >
        <option value="">{owner ? `${owner.name} (me)` : "Me"}</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs font-medium text-rose-600">{error}</span> : null}
    </div>
  );
}

// ── The marker ──────────────────────────────────────────────────────────────
//
// Shown on a producer's own rows only. An owner looking at what they handed
// off sees it too, but reading it the other way round: still sitting there.

export function AssignedBadge({
  assignedAt,
  mine,
}: {
  assignedAt: string | null | undefined;
  mine: boolean;
}) {
  if (!assignedAt) return null;
  return (
    <span className="chip chip-brand" title={new Date(assignedAt).toLocaleString()}>
      {mine ? "Waiting for you" : "Not opened yet"}
    </span>
  );
}

// Tell the server the assignee has looked at it. Safe to call on every mount;
// it's a no-op for anyone who isn't the person it was handed to.
export function markSeen(referralId: string) {
  fetch(`/api/referrals/${referralId}/seen`, { method: "POST" }).catch(() => {});
}
