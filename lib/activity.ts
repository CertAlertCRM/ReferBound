import { db } from "@/lib/db";

export type ActivityActor = "agent" | "partner" | "system";

// Best-effort append to the immutable activity timeline. Never throws —
// a logging failure must never break the user-facing action it describes.
export async function logActivity(
  referralId: string,
  eventType:
    | "lead_logged"
    | "referral_submitted"
    | "status_changed"
    | "document_uploaded"
    | "document_deleted"
    | "message_deleted"
    | "email_sent"
    | "at_risk_flagged"
    | "closing_date_changed"
    // The reps. "ask_recorded" is the one an agent can create without sending
    // anything — the conversation that happened at the desk still belongs on
    // the timeline, or the file reads as though nobody ever asked.
    | "ask_recorded"
    | "ask_cleared"
    | "referral_received"
    // Bookkeeping on an agency account: who this lead belongs to changed.
    // Sends nothing and touches nothing client-facing.
    | "producer_assigned"
    | "note",
  detail: string,
  actor: ActivityActor = "agent"
) {
  try {
    await db().from("activity_log").insert({
      referral_id: referralId,
      event_type: eventType,
      detail,
      actor,
    });
  } catch (e) {
    console.error("activity log write failed:", e);
  }
}
