import { db } from "./db";
import type { NextRequest } from "next/server";

// Simple DB-backed fixed-window rate limiter. Fails OPEN (an outage must
// never lock users out) but under normal operation stops brute force and
// spam cold. Counters live in the rate_limits table, one row per key.

export async function rateLimit(key: string, max: number, windowSecs: number): Promise<boolean> {
  try {
    const now = Date.now();
    const { data: row } = await db()
      .from("rate_limits")
      .select("count, window_start")
      .eq("key", key)
      .maybeSingle();

    if (!row) {
      await db().from("rate_limits").insert({ key, count: 1, window_start: new Date(now).toISOString() });
      return true;
    }

    const windowAge = now - new Date(row.window_start).getTime();
    if (windowAge > windowSecs * 1000) {
      await db()
        .from("rate_limits")
        .update({ count: 1, window_start: new Date(now).toISOString() })
        .eq("key", key);
      return true;
    }

    if (row.count >= max) return false;

    await db().from("rate_limits").update({ count: row.count + 1 }).eq("key", key);
    return true;
  } catch {
    return true; // fail open
  }
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export const RATE_LIMITED = { error: "Too many attempts — wait a few minutes and try again." };
