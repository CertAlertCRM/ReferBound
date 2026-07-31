import { NextRequest, NextResponse } from "next/server";
import { getAccount } from "@/lib/account";
import { db } from "@/lib/db";
import { askClaude, parseJsonLoose } from "@/lib/ai";
import { STATUS_LABELS } from "@/lib/config";

export const dynamic = "force-dynamic";

// AI paste: the agent drops in a chunk of spreadsheet, an email thread, or a
// list they typed from memory, and we turn it into reviewable lead rows.
// Nothing is saved here — the agent reviews and confirms, then /api/referrals/bulk
// does the writing.

const SYSTEM = `You turn a messy list of insurance referrals into structured rows.

The text may be pasted spreadsheet cells, an email, or informal notes like
"Jones - closing 8/15 from Cowart, quoted already".

Respond with ONLY a JSON object (no fences):
{"rows": [{"client_name": string, "partner": string|null, "status": string|null,
  "closing_date": string|null, "client_phone": string|null,
  "client_email": string|null, "property_address": string|null,
  "premium": number|null, "notes": string|null}]}

Rules:
- One row per client. Never invent a client that isn't in the text.
- Use null for anything not present. Do NOT guess phone numbers or addresses.
- closing_date in YYYY-MM-DD. If only a month/day is given, use the next
  occurrence of that date relative to the supplied today's date.
- partner: copy the partner/lender/realtor name as written; match it to one of
  the agent's known partners when it's clearly the same company.
- status: one of new, quoting, quoted, application, bound, docs_delivered, lost.
  Map natural phrases ("quoted already" → quoted, "closed"/"written" → bound,
  "didn't write it" → lost). Use "new" when unstated.
- Ignore header rows and totals.`;

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text = String(body?.text ?? "").trim().slice(0, 12000);
  if (!text) return NextResponse.json({ error: "paste something first" }, { status: 400 });

  const { data: partners } = await db()
    .from("partners")
    .select("name")
    .eq("account_id", account.id);

  try {
    const raw = await askClaude({
      system: SYSTEM,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            today: new Date().toISOString().slice(0, 10),
            knownPartners: (partners ?? []).map((p) => p.name),
            statusOptions: Object.keys(STATUS_LABELS),
            pasted: text,
          }),
        },
      ],
      maxTokens: 3000,
    });
    const parsed = parseJsonLoose(raw);
    const rows = Array.isArray(parsed.rows) ? parsed.rows.slice(0, 200) : [];
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: `Couldn't read that — try pasting fewer rows. (${e.message})` }, { status: 502 });
  }
}
