"use server";

import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";

export async function requestDeletion() {
  const db = await supabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?next=%2Fdelete-account");
  const { error } = await db.rpc("request_account_deletion");
  if (error) redirect(`/delete-account?error=${encodeURIComponent(error.code === "PGRST202" ? "Database setup needed: apply the account deletion requests migration." : error.message)}`);
  redirect("/delete-account?requested=1");
}
