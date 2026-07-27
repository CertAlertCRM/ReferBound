import { NextRequest, NextResponse } from "next/server";
import { checkPasscode, agentCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { passcode } = await req.json().catch(() => ({ passcode: "" }));
  if (!checkPasscode(String(passcode ?? ""))) {
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(agentCookie());
  return res;
}
