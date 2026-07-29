import { NextResponse } from "next/server";

// Legacy passcode endpoint — replaced by account auth at /api/auth/login.
export async function POST() {
  return NextResponse.json(
    { error: "This endpoint moved. Sign in with your account at /login." },
    { status: 410 }
  );
}
