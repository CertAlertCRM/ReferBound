import { db } from "./db";
import { STATUS_LABELS } from "./config";

// Outbound webhook — the Zapier/Make/CRM bridge.
//
// If an account has webhook_url set, we POST a flat JSON payload on
// referral.created and referral.status_changed. Flat keys map cleanly in
// Zapier's field picker. Fire-and-forget: a slow or broken endpoint must
// never block or fail the user's own request, so every error is swallowed.

export type WebhookEvent = "referral.created" | "referral.status_changed" | "test";

export function webhookPayload(
  event: WebhookEvent,
  referral: Record<string, any>,
  partner?: { name?: string | null; partner_type?: string | null } | null
) {
  return {
    event,
    referral_id: referral.id ?? null,
    client_name: referral.client_name ?? null,
    coborrower_name: referral.coborrower_name ?? null,
    client_phone: referral.client_phone ?? null,
    client_email: referral.client_email ?? null,
    client_dob: referral.client_dob ?? null,
    property_address: referral.property_address ?? null,
    closing_date: referral.closing_date ?? null,
    status: referral.status ?? "new",
    status_label: STATUS_LABELS[referral.status ?? "new"] ?? referral.status ?? "New lead",
    source: referral.source ?? null,
    notes: referral.notes ?? null,
    partner_name: partner?.name ?? null,
    partner_type: partner?.partner_type ?? null,
    created_at: referral.created_at ?? null,
    sent_at: new Date().toISOString(),
  };
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "ReferBound-Webhook/1" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch (e: any) {
    return { ok: false, error: e?.name === "AbortError" ? "timed out" : String(e?.message ?? e) };
  }
}

/** Fire the account's webhook if configured. Never throws. */
export async function fireWebhook(
  accountId: string | null | undefined,
  event: WebhookEvent,
  referral: Record<string, any>,
  partner?: { name?: string | null; partner_type?: string | null } | null
): Promise<void> {
  try {
    if (!accountId) return;
    const { data: account } = await db()
      .from("accounts")
      .select("webhook_url")
      .eq("id", accountId)
      .maybeSingle();
    const url = account?.webhook_url?.trim();
    if (!url || !/^https:\/\//i.test(url)) return;
    await post(url, webhookPayload(event, referral, partner));
  } catch {
    // Webhooks are best-effort by design.
  }
}

/** Send a sample payload to an arbitrary URL (the "Send test" button). */
export async function sendTestWebhook(url: string) {
  return post(url, {
    ...webhookPayload(
      "test",
      {
        id: "00000000-0000-0000-0000-000000000000",
        client_name: "Sample Client",
        client_phone: "804-555-1234",
        client_email: "sample.client@example.com",
        property_address: "123 Main St, Richmond, VA 23220",
        closing_date: "2026-08-30",
        status: "new",
        source: "partner",
        created_at: new Date().toISOString(),
      },
      { name: "Sample Lending Team", partner_type: "lender" }
    ),
  });
}
