"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { balances, parsePaise, settlementAmount, type Expense, type Payment } from "@/lib/money";
import { isSafeNext, safeNext, withParam } from "@/lib/redirects";
import { isValidEmail, isValidUpi } from "@/lib/validators";

const str = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const fail = (message: string, back: string) => redirect(withParam(back, "error", message));
function loginUrl(email: string, next: string, extra: Record<string, string> = {}) {
  let url = "/login";
  for (const [key, value] of Object.entries(extra)) url = withParam(url, key, value);
  url = withParam(url, "email", email);
  return isSafeNext(next) ? withParam(url, "next", next) : url;
}
async function client() {
  const db = await supabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  return { db, user };
}

export async function sendCode(form: FormData) {
  const email = str(form, "email").toLowerCase();
  const next = str(form, "next");
  const back = loginUrl(email, next);
  if (!isValidEmail(email)) fail("Enter a valid email", back);
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
  redirect(loginUrl(email, next, { sent: "1" }));
}

export async function verifyCode(form: FormData) {
  const email = str(form, "email").toLowerCase();
  const token = str(form, "token").replace(/\s/g, "");
  const next = str(form, "next");
  const back = loginUrl(email, next, { sent: "1" });
  if (!isValidEmail(email) || !/^\d{6,10}$/.test(token)) fail("Enter the full code from your email (6–10 digits).", back);
  const db = await supabase();
  const { error } = await db.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    if (error.code === "otp_expired" || error.message.toLowerCase().includes("invalid")) fail("Supabase rejected that code. Check the full code and email address, and use the newest email. If it still fails, request a fresh code.", back);
    if (error.code === "over_request_rate_limit") fail("Too many code attempts. Wait a few minutes before trying again.", back);
    fail(error.message, back);
  }
  redirect(safeNext(next));
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
  if (upi_id && !isValidUpi(upi_id)) fail("Enter a valid UPI ID", "/profile");
  const { error } = await db.from("profiles").upsert({ id: user.id, email: user.email!, display_name, upi_id });
  if (error) fail(error.message, "/profile");
  revalidatePath("/");
  const next = str(form, "next");
  redirect(safeNext(next));
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
  if (email.length > 254 || !isValidEmail(email)) fail("Enter a valid email", `/trips/${trip}`);
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
  const { db, user } = await client();
  const trip = str(form, "trip");
  const from = str(form, "from");
  const to = str(form, "to");
  const back = `/trips/${trip}`;
  const amount = Number(str(form, "amount"));
  if (!Number.isSafeInteger(amount) || amount <= 0) fail("Invalid payment amount", back);
  const [members, expenses, payments] = await Promise.all([
    db.from("members").select("id,user_id").eq("trip_id", trip),
    db.from("expenses").select("amount_paise,payer_member_id,expense_shares(member_id,amount_paise)").eq("trip_id", trip),
    db.from("payments").select("from_member_id,to_member_id,amount_paise,status").eq("trip_id", trip),
  ]);
  if (members.error || expenses.error || payments.error) fail("Could not verify the current balance", back);
  const payer = (members.data ?? []).find(m => m.id === from && m.user_id === user.id);
  if (!payer) fail("Not allowed", back);
  const balance = balances(
    (members.data ?? []).map(m => m.id),
    (expenses.data ?? []) as Expense[],
    (payments.data ?? []) as Payment[],
  );
  if (settlementAmount(balance, from, to) !== amount) fail("Report the full amount shown for this transfer", back);
  const { error } = await db.rpc("send_payment", { p_trip: trip, p_from: from, p_to: to, p_amount: amount });
  if (error) fail(error.message, back);
  revalidatePath(back);
}

export async function resolvePayment(form: FormData) {
  const { db } = await client();
  const trip = str(form, "trip");
  const { error } = await db.rpc("resolve_payment", { p_payment: str(form, "payment"), p_confirm: str(form, "decision") === "confirm" });
  if (error) fail(error.message, `/trips/${trip}`);
  revalidatePath(`/trips/${trip}`);
}
