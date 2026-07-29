import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { normalizeEmail } from "@/lib/format";
import { randomInt } from "crypto";

// Sends a 6-digit reset code. Always responds ok (no account enumeration).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  if (!email) return NextResponse.json({ ok: true });

  const { data: account } = await db().from("accounts").select("id").eq("email", email).maybeSingle();
  if (account) {
    const code = String(randomInt(100000, 999999));
    await db().from("reset_codes").insert({
      email,
      code,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
    await sendEmail({
      kind: "message",
      to: [email],
      subject: "Your ReferBound password reset code",
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px"><h2>Reset your password</h2><p>Your code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p style="color:#666;font-size:13px">It expires in 15 minutes. If you didn't request this, you can ignore it.</p></div>`,
    });
  }
  return NextResponse.json({ ok: true });
}
