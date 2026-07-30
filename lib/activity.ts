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
    | "at_risk_flagged",
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
