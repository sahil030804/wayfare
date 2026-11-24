import { redirect } from "next/navigation";
import { claimInvite } from "@/app/actions";
import { AppHeader } from "@/app/components/AppHeader";
import { supabase } from "@/lib/supabase";

export default async function Join({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const db = await supabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);
  const { data: profile } = await db.from("profiles").select("id,display_name").eq("id", user.id).single();
  if (!profile) redirect(`/profile?next=${encodeURIComponent(`/join/${token}`)}`);
  return <><AppHeader name={profile.display_name}/><main className="narrow"><div className="panel"><span className="eyebrow">YOU’RE INVITED</span><h1>Join the trip</h1><p>Claim your place to see and add shared expenses.</p>{error && <p className="error" role="alert">{error}</p>}<form action={claimInvite}><input type="hidden" name="token" value={token}/><button className="primary">Join trip</button></form></div></main></>;
}
