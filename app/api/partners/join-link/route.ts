import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { appUrl } from "@/lib/helpers";

// The agent's one public link.
//
// Closed by default: no code exists until the agent asks for one, so an
// account that never wants a public front door never has one. Rotating issues
// a new code and kills the old URL instantly, which is the answer to "my link
// ended up somewhere I didn't post it" — and the reason the code lives on the
// account rather than being derived from the account id, which could never be
// retired.
//
// Approved partners are untouched by rotation. They hold their own portal
// tokens and have nothing to do with how they were first let in.

export const dynamic = "force-dynamic";

// Lowercase alphanumerics only, and no vowels in the alphabet, so a rotated
// code can't come back as a word somebody has to read out awkwardly over the
// phone. 10 chars from a 32-char alphabet is ~50 bits; this is a convenience
// slug with an approval step behind it, not a secret.
const ALPHABET = "bcdfghjkmnpqrstvwxyz23456789";

function makeCode(): string {
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function payload(code: string | null) {
  return {
    code,
    url: code ? `${appUrl()}/join/${code}` : null,
  };
}

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await db()
    .from("accounts")
    .select("partner_join_code")
    .eq("id", account.id)
    .maybeSingle();
  return NextResponse.json(payload((data?.partner_join_code as string | null) ?? null));
}

// Create the link, or rotate it. Same call either way — from the agent's side
// "give me a link" and "give me a different link" are the same intent.
export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // The code lives on the OWNER's account row, so a producer rotating it would
  // change the agency's public link for everybody. That's the owner's call.
  if (account.isTeamMember) {
    return NextResponse.json(
      { error: "Only the agency owner can change the shared join link." },
      { status: 403 }
    );
  }

  // Retry on the unique index rather than trusting one draw. Collisions are
  // vanishingly unlikely and silently reusing somebody else's code would send
  // an agent's partners to the wrong agency.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    const { error } = await db()
      .from("accounts")
      .update({ partner_join_code: code })
      .eq("id", account.id);
    if (!error) return NextResponse.json(payload(code));
    if (String(error.code) !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Couldn't generate a link — try again." }, { status: 500 });
}
