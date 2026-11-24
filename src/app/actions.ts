"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { parsePaise } from "@/lib/money";

const str = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const fail = (message: string, back: string) => redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
async function client() {
  const db = await supabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  return { db, user };
}

export async function sendCode(form: FormData) {
  const email = str(form, "email").toLowerCase();
  const next = str(form, "next");
  const back = `/login?email=${encodeURIComponent(email)}${(next.startsWith("/join/") || next === "/delete-account") ? `&next=${encodeURIComponent(next)}` : ""}`;
  if (!/^\S+@\S+\.\S+$/.test(email)) fail("Enter a valid email", back);
  const db = await supabase();
  const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) {
    if (error.code === "over_email_send_rate_limit" || error.message.toLowerCase().includes("email rate limit exceeded")) {
      fail("Supabase is rate-limiting sign-in emails. Wait before retrying. If custom SMTP is enabled, check Authentication → Rate Limits and confirm the SMTP settings were saved.", back);
    }
    if (error.code === "over_request_rate_limit") fail("Too many sign-in requests. Wait a few minutes before trying again.", back);
    if (error.code === "email_address_not_authorized") fail("This project cannot send to that address yet. The app owner needs to configure custom SMTP.", back);
    fail(error.message, back);
  }
  redirect(`/login?email=${encodeURIComponent(email)}&sent=1${(next.startsWith("/join/") || next === "/delete-account") ? `&next=${encodeURIComponent(next)}` : ""}`);
}

export async function verifyCode(form: FormData) {
  const email = str(form, "email").toLowerCase();
  const token = str(form, "token").replace(/\s/g, "");
  const next = str(form, "next");
  const back = `/login?sent=1&email=${encodeURIComponent(email)}${(next.startsWith("/join/") || next === "/delete-account") ? `&next=${encodeURIComponent(next)}` : ""}`;
  if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{6,10}$/.test(token)) fail("Enter the full code from your email (6–10 digits).", back);
  const db = await supabase();
  const { error } = await db.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    if (error.code === "otp_expired" || error.message.toLowerCase().includes("invalid")) fail("Supabase rejected that code. Check the full code and email address, and use the newest email. If it still fails, request a fresh code.", back);
    if (error.code === "over_request_rate_limit") fail("Too many code attempts. Wait a few minutes before trying again.", back);
    fail(error.message, back);
  }
  redirect((next.startsWith("/join/") || next === "/delete-account") ? next : "/");
}

export async function signOut() {
  const db = await supabase();
  await db.auth.signOut();
  redirect("/login");
}

export async function saveProfile(form: FormData) {
  const { db, user } = await client();
  const display_name = str(form, "display_name");
  const upi_id = str(form, "upi_id") || null;
  if (display_name.length < 1 || display_name.length > 80) fail("Enter your name", "/profile");
  if (upi_id && !/^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,100}$/.test(upi_id)) fail("Enter a valid UPI ID", "/profile");
  const { error } = await db.from("profiles").upsert({ id: user.id, email: user.email!, display_name, upi_id });
  if (error) fail(error.message, "/profile");
  revalidatePath("/");
  const next = str(form, "next");
  redirect((next.startsWith("/join/") || next === "/delete-account") ? next : "/");
}

export async function createTrip(form: FormData) {
  const { db, user } = await client();
  const title = str(form, "title");
  const { data: profile } = await db.from("profiles").select("display_name").eq("id", user.id).single();
  if (!profile) redirect("/profile");
  const { data, error } = await db.rpc("create_trip", { p_title: title, p_name: profile.display_name });
  if (error) fail(error.message, "/");
  redirect(`/trips/${data}`);
}

export async function connectFriend(form: FormData) {
  const { db } = await client();
  const trip = str(form, "trip");
  const email = str(form, "email").toLowerCase();
  const member = str(form, "member") || null;
  if (!/^[0-9a-f-]{36}$/i.test(trip) || (member && !/^[0-9a-f-]{36}$/i.test(member))) fail("Invalid trip member", "/");
  if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) fail("Enter a valid email", `/trips/${trip}`);
  const { error } = await db.rpc("connect_friend", { p_trip: trip, p_email: email, p_member: member });
  if (error?.code === "PGRST202") fail("Database update needed. Run supabase/migrations/20261124_existing_account_friends.sql in the SQL Editor.", `/trips/${trip}`);
  if (error) fail(error.message, `/trips/${trip}`);
  revalidatePath("/");
  revalidatePath(`/trips/${trip}`);
  redirect(`/trips/${trip}?connected=1`);
}

export async function regenerateInvite(form: FormData) {
  const { db } = await client();
  const trip = str(form, "trip");
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await db.rpc("regenerate_invite", { p_member: str(form, "member"), p_hash: hash });
  if (error) fail(error.message, `/trips/${trip}`);
  redirect(`/trips/${trip}?invite=${data}&token=${token}`);
}

export async function claimInvite(form: FormData) {
  const { db } = await client();
  const { data, error } = await db.rpc("claim_invite", { p_token: str(form, "token") });
  if (error) fail(error.message, `/join/${str(form, "token")}`);
  redirect(`/trips/${data}`);
}

export async function saveExpense(form: FormData) {
  const { db } = await client();
  const trip = str(form, "trip");
  const participants = form.getAll("participants").map(String);
  let amount: number;
  try { amount = parsePaise(str(form, "amount")); } catch (e) { fail((e as Error).message, `/trips/${trip}`); }
  const latitude = str(form, "location_lat");
  const longitude = str(form, "location_lng");
  const hasLocation = Boolean(latitude && longitude);
  const lat = Number(latitude);
  const lng = Number(longitude);
  if ((Boolean(latitude) !== Boolean(longitude)) ||
      (hasLocation && (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180))) {
    fail("Invalid expense location", `/trips/${trip}`);
  }
  const { error } = await db.rpc("save_expense", {
    p_trip: trip, p_expense: str(form, "expense") || null, p_payer: str(form, "payer"),
    p_amount: amount!, p_remark: str(form, "remark"), p_participants: participants,
    p_latitude: hasLocation ? lat : null, p_longitude: hasLocation ? lng : null,
  });
  if (error) fail(error.message, `/trips/${trip}`);
  revalidatePath(`/trips/${trip}`);
  redirect(`/trips/${trip}`);
}

export async function deleteExpense(form: FormData) {
  const { db } = await client();
  const trip = str(form, "trip");
  const { error } = await db.rpc("delete_expense", { p_expense: str(form, "expense") });
  if (error) fail(error.message, `/trips/${trip}`);
  revalidatePath(`/trips/${trip}`);
}

export async function closeTrip(form: FormData) {
  const { db } = await client();
  const trip = str(form, "trip");
  const { error } = await db.rpc("close_trip", { p_trip: trip });
  if (error) fail(error.message, `/trips/${trip}`);
  revalidatePath(`/trips/${trip}`);
}

export async function sendPayment(form: FormData) {
  const { db } = await client();
  const trip = str(form, "trip");
  const { error } = await db.rpc("send_payment", { p_trip: trip, p_from: str(form, "from"), p_to: str(form, "to"), p_amount: Number(str(form, "amount")) });
  if (error) fail(error.message, `/trips/${trip}`);
  revalidatePath(`/trips/${trip}`);
}

export async function resolvePayment(form: FormData) {
  const { db } = await client();
  const trip = str(form, "trip");
  const { error } = await db.rpc("resolve_payment", { p_payment: str(form, "payment"), p_confirm: str(form, "decision") === "confirm" });
  if (error) fail(error.message, `/trips/${trip}`);
  revalidatePath(`/trips/${trip}`);
}
