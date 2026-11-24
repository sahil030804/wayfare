import type { Metadata } from "next";
import Link from "next/link";
import { requestDeletion } from "./actions";
import { supabase } from "@/lib/supabase";

export const metadata: Metadata = { title: "Delete your account | Wayfare", description: "Request deletion of your Wayfare account and associated personal data." };
export default async function DeleteAccount({ searchParams }: { searchParams: Promise<{ requested?: string; error?: string }> }) {
  const q = await searchParams;
  const db = await supabase();
  const { data: { user } } = await db.auth.getUser();
  return <main className="legal-page"><Link href="/" className="legal-back">← Wayfare</Link><div className="legal-card"><span className="eyebrow">ACCOUNT & DATA</span><h1>Delete your account</h1><p>You can request deletion of your Wayfare account and associated personal data here or from Profile in the Android app.</p><h2>What happens next</h2><p>We review the request, remove your account and personal profile, and handle trip records according to the <Link href="/privacy">privacy policy</Link>. Shared expense records may need to remain available to other trip members as an accounting record, with your personal profile removed where possible.</p>{q.requested ? <p className="legal-success" role="status">Your deletion request was recorded. We will contact you at your account email if we need to confirm any details.</p> : q.error ? <p className="error" role="alert">{q.error}</p> : null}{user ? <form action={requestDeletion}><button className="primary" type="submit">Request account deletion</button></form> : <Link className="primary legal-link-button" href="/login?next=%2Fdelete-account">Sign in to request deletion</Link>}<p className="legal-small">You can also email <a href="mailto:automationbysahil@gmail.com?subject=Wayfare%20account%20deletion%20request">automationbysahil@gmail.com</a> from your account email address. Include “Wayfare account deletion request” in the subject.</p></div></main>;
}
