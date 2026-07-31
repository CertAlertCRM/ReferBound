import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHmac, timingSafeEqual } from "crypto";

// Stripe webhook — activates/downgrades plans. Designed for the no-code
// Payment Links flow: the checkout link carries ?client_reference_id=<accountId>,
// so checkout.session.completed tells us exactly which account paid.
// Configure in Stripe: Developers → Webhooks → endpoint
//   https://referbound.com/api/stripe/webhook
// with events: checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted. Put the signing secret in STRIPE_WEBHOOK_SECRET.

function verifyStripeSignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=") as [string, string])
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;
  // 10-minute tolerance
  return Math.abs(Date.now() / 1000 - Number(t)) < 600;
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 500 });

  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(payload);
  const obj = event?.data?.object ?? {};

  if (event.type === "checkout.session.completed") {
    // client_reference_id carries "<accountId>" or "<accountId>_<planKey>".
    // The suffix is what makes discounts safe: a friend paying $50 for Agency
    // must not be read as Pro just because the amount isn't $99. Amount is
    // only a fallback for links created before this existed.
    const ref = String(obj.client_reference_id ?? "");
    const [accountId, planKey] = ref.split("_");
    const cents = obj.amount_total ?? 0;

    if (accountId) {
      const BY_KEY: Record<string, { plan: string; interval: string }> = {
        pro: { plan: "pro", interval: "monthly" },
        agency: { plan: "agency", interval: "monthly" },
        founder: { plan: "pro", interval: "annual" },
      };
      const resolved =
        BY_KEY[planKey] ??
        ({
          plan: cents === 9900 ? "agency" : "pro",
          interval: cents >= 19900 ? "annual" : "monthly",
        } as const);

      await db()
        .from("accounts")
        .update({
          plan: resolved.plan,
          billing_interval: resolved.interval,
          // What they actually pay, discount included — MRR reads this.
          plan_amount_cents: cents > 0 ? cents : null,
          stripe_customer_id: obj.customer ?? null,
          stripe_subscription_id: obj.subscription ?? null,
          subscription_status: "active",
        })
        .eq("id", accountId);
    }
  }

  if (event.type === "customer.subscription.updated") {
    const status = obj.status; // active | past_due | canceled | unpaid ...
    if (obj.customer && status) {
      const patch: Record<string, unknown> = { subscription_status: status };
      if (status === "canceled" || status === "unpaid") {
        patch.plan = "free";
        patch.billing_interval = "monthly";
        patch.plan_amount_cents = null;
      }
      await db().from("accounts").update(patch).eq("stripe_customer_id", obj.customer);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    if (obj.customer) {
      await db()
        .from("accounts")
        .update({
          plan: "free",
          billing_interval: "monthly",
          plan_amount_cents: null,
          subscription_status: "canceled",
          stripe_subscription_id: null,
        })
        .eq("stripe_customer_id", obj.customer);
    }
  }

  return NextResponse.json({ received: true });
}
