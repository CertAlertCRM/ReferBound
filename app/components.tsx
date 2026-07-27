"use client";

import { STATUS_LABELS } from "@/lib/config";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-slate-100 text-slate-700",
  quoting: "bg-amber-100 text-amber-800",
  quoted: "bg-blue-100 text-blue-800",
  application: "bg-indigo-100 text-indigo-800",
  bound: "bg-green-100 text-green-800",
  docs_delivered: "bg-emerald-100 text-emerald-800",
  lost: "bg-slate-200 text-slate-500",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function AtRiskBadge() {
  return <span className="badge bg-red-100 text-red-700">⚠ Closing soon</span>;
}
