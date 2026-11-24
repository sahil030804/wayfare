import Link from "next/link";
import { redirect } from "next/navigation";
import { Compass, ArrowLeft } from "lucide-react";
import { saveProfile } from "../actions";
import { AppHeader } from "../components/AppHeader";
import { supabase } from "@/lib/supabase";

export default async function Profile({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const db = await supabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile, error: profileError } = await db.from("profiles").select("display_name,upi_id").eq("id", user.id).single();
  if (profileError?.code === "PGRST205") return <main className="setup"><h1>Database setup needed</h1><p>Your Supabase project is connected, but its app tables have not been created. Run <code>supabase/schema.sql</code> in that project’s SQL Editor, then refresh this page.</p></main>;
  const { error, next } = await searchParams;
  return <>{profile ? <AppHeader name={profile.display_name} active="profile"/> : null}<main className="narrow">{!profile && <Link className="brand" href="/"><Compass size={25}/>wayfare<span className="brand-dot">.</span></Link>}<Link href="/" className="back"><ArrowLeft size={17}/> Your trips</Link><div className="panel"><span className="eyebrow">YOUR DETAILS</span><h1>{profile ? "Your profile" : "Let’s get acquainted"}</h1><p>Friends will see your name. Add a UPI ID to make settling up easier.</p>{error && <p className="error" role="alert">{error}</p>}<form action={saveProfile} className="stack"><input type="hidden" name="next" value={next ?? ""}/><label>Your name<input name="display_name" defaultValue={profile?.display_name ?? ""} maxLength={80} required placeholder="Your name"/></label><label>UPI ID <span className="optional">optional</span><input name="upi_id" defaultValue={profile?.upi_id ?? ""} placeholder="name@bank"/></label><button className="primary">Save and continue</button></form></div></main></>;
}
