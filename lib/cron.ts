import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { EmailKind } from "@/lib/email";

// Shared machinery for the scheduled jobs.
//
// The crons started life as "loop over the rows and send" — one database
// round-trip and one Resend call per referral, sequentially, in a single
// serverless invocation. That works at eleven accounts and breaks at forty,
// and it breaks in the worst possible way: the function hits its time limit
// partway down the list and returns 200. The agents at the top of the list
// get their alerts, the agents at the bottom silently don't, and nothing
// anywhere says so.
//
// Three things fix that, and they're all here rather than repeated in each
// route: send in batches of 100 instead of one at a time, read the dedupe
// history in one query instead of one per row, and carry an explicit time
// budget so a run that can't finish says which work it skipped.

// ── Auth ────────────────────────────────────────────────────────────────────
// Vercel Cron sends the secret as a Bearer header; a human testing by hand
// puts it in the query string. Both are accepted, both are required when
// CRON_SECRET is configured.

export function cronGuard(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  const auth = req.headers.get("authorization");
  const qs = req.nextUrl.searchParams.get("secret");
  if (auth === `Bearer ${secret}` || qs === secret) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

// ── Time budget ─────────────────────────────────────────────────────────────
// Vercel kills the function at maxDuration with no chance to report. Stopping
// ourselves a little early means we get to say what didn't happen.

export class Budget {
  private readonly endsAt: number;
  constructor(seconds: number) {
    this.endsAt = Date.now() + seconds * 1000;
  }
  get expired(): boolean {
    return Date.now() >= this.endsAt;
  }
  get secondsLeft(): number {
    return Math.max(0, Math.round((this.endsAt - Date.now()) / 1000));
  }
}

// ── Paginated reads ─────────────────────────────────────────────────────────
// PostgREST caps a response at 1,000 rows by default and returns no warning
// when it truncates. A cron that silently sees only the first thousand
// referrals is the same silent-failure shape we're removing everywhere else.

const PAGE = 1000;
const MAX_PAGES = 25; // 25k rows — far past any real month, but not unbounded

export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<{ rows: T[]; truncated: boolean; error: string | null }> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) return { rows, truncated: false, error: String(error.message ?? error) };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return { rows, truncated: false, error: null };
  }
  return { rows, truncated: true, error: null };
}

// ── Batch sending ───────────────────────────────────────────────────────────
// Resend takes 100 messages per call and allows 5 calls a second, so a run
// that used to make 200 sequential API calls now makes two. Every message
// still gets its own email_log row, because the dedupe logic in every cron
// reads that table to decide what's already gone out.

export type BatchItem = {
  referralId?: string | null;
  kind: EmailKind;
  to: string[];
  subject: string;
  html: string;
};

const CHUNK = 100;
const PAUSE_MS = 250; // stay comfortably under 5 requests/second

type LogRow = {
  referral_id: string | null;
  kind: string;
  recipients: string[];
  subject: string;
  sent: boolean;
  error: string | null;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type BatchResult = {
  sent: number;
  failed: number;
  error: string | null;
  // Aligned to the input array: null means that message went out, a string is
  // why it didn't. Callers that record state per message — "we've told this
  // agent about the renewal" — must key off this, never off the totals.
  outcomes: (string | null)[];
};

export async function sendBatch(items: BatchItem[]): Promise<BatchResult> {
  if (items.length === 0) return { sent: 0, failed: 0, error: null, outcomes: [] };

  const logs: LogRow[] = [];
  const sentReferralIds: { id: string; subject: string; recipients: number }[] = [];
  const outcomes: (string | null)[] = new Array(items.length).fill("not attempted");
  const indexOf = new Map<BatchItem, number>();
  items.forEach((item, i) => indexOf.set(item, i));
  let sent = 0;
  let failed = 0;
  let firstError: string | null = null;

  const note = (item: BatchItem, error: string | null) => {
    const i = indexOf.get(item);
    if (i !== undefined) outcomes[i] = error;
    logs.push({
      referral_id: item.referralId ?? null,
      kind: item.kind,
      recipients: item.to.filter(Boolean),
      subject: item.subject,
      sent: !error,
      error,
    });
    if (error) {
      failed++;
      if (!firstError) firstError = error;
    } else {
      sent++;
      if (item.referralId) {
        sentReferralIds.push({
          id: item.referralId,
          subject: item.subject,
          recipients: item.to.filter(Boolean).length,
        });
      }
    }
  };

  // Anything with nowhere to go is logged, never sent — same contract as
  // sendEmail, so the crons can keep trusting email_log as the record.
  const sendable: BatchItem[] = [];
  for (const item of items) {
    if (item.to.filter(Boolean).length === 0) note(item, "no recipients");
    else sendable.push(item);
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    for (const item of sendable) {
      note(item, "email not configured (RESEND_API_KEY / EMAIL_FROM missing)");
    }
  } else {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    for (let i = 0; i < sendable.length; i += CHUNK) {
      const chunk = sendable.slice(i, i + CHUNK);
      let chunkError: string | null = null;
      try {
        const { error } = await resend.batch.send(
          chunk.map((item) => ({
            from,
            to: item.to.filter(Boolean),
            subject: item.subject,
            html: item.html,
          }))
        );
        if (error) chunkError = String((error as any).message ?? error);
      } catch (e: any) {
        chunkError = String(e?.message ?? e);
      }
      // Resend's batch endpoint is all-or-nothing per call: a failure means
      // none of these went out, so every message in the chunk is logged as
      // unsent rather than optimistically marked delivered.
      for (const item of chunk) note(item, chunkError);
      if (i + CHUNK < sendable.length) await sleep(PAUSE_MS);
    }
  }

  // One insert for the whole run instead of one per message.
  for (let i = 0; i < logs.length; i += 500) {
    const { error } = await db().from("email_log").insert(logs.slice(i, i + 500));
    if (error) console.error("[cron] email_log insert failed:", error.message);
  }

  if (sentReferralIds.length > 0) {
    const activity = sentReferralIds.map((s) => ({
      referral_id: s.id,
      event_type: "email_sent",
      detail: `Email sent (${s.recipients} recipient${s.recipients === 1 ? "" : "s"}): ${s.subject}`,
      actor: "system",
    }));
    for (let i = 0; i < activity.length; i += 500) {
      const { error } = await db().from("activity_log").insert(activity.slice(i, i + 500));
      if (error) console.error("[cron] activity_log insert failed:", error.message);
    }
  }

  return { sent, failed, error: firstError, outcomes };
}

// ── Reporting ───────────────────────────────────────────────────────────────
// A cron that skipped work is not a successful cron. This puts a greppable
// line in the Vercel logs and hands the same facts back in the response body,
// so "did everyone get their alert?" has an answer that isn't a guess.

export function cronReport(name: string, payload: Record<string, any>) {
  const bad =
    Number(payload.skipped ?? 0) > 0 ||
    Number(payload.failed ?? 0) > 0 ||
    payload.truncated === true ||
    Boolean(payload.error);
  const line = `[cron:${name}] ${JSON.stringify(payload)}`;
  if (bad) console.error(`INCOMPLETE ${line}`);
  else console.log(line);
  return payload;
}
