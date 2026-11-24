import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const next = request.nextUrl.searchParams.get("next");
  const destination = next?.startsWith("/join/") ? next : "/";
  const db = await supabase();

  let error: Error | null = null;
  if (code) {
    ({ error } = await db.auth.exchangeCodeForSession(code));
  } else if (tokenHash && (type === "email" || type === "magiclink" || type === "signup")) {
    ({ error } = await db.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else {
    error = new Error("Missing sign-in token");
  }

  if (error) return NextResponse.redirect(new URL("/login?error=Sign-in%20link%20expired%20or%20invalid", request.url));
  return NextResponse.redirect(new URL(destination, request.url));
}
