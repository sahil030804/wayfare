import { Compass } from "lucide-react";
import { sendCode, verifyCode } from "../actions";
import { configured } from "@/lib/supabase";
import { ResendCodeButton, SendLinkButton, VerifyCodeButton } from "./SendLinkButton";

export default async function Login({ searchParams }: { searchParams: Promise<{ email?: string; sent?: string; error?: string; next?: string }> }) {
  const q = await searchParams;
  return <main className="auth-page">
    <div className="auth-intro"><div className="brand"><Compass size={28}/> wayfare<span className="brand-dot">.</span></div><h1>Make memories.<br/><em>Leave the math.</em></h1><p>The simple way to share trip expenses with friends.</p></div>
    <div className="auth-card">
      <span className="eyebrow">WELCOME ABOARD</span>
      <h2>{q.sent ? "Enter your code" : "Your trips await"}</h2>
      <p>{q.sent ? `We emailed a sign-in code to ${q.email}. Enter the full code below to continue.` : "Sign in or create an account with your email."}</p>
      {q.error && <p className="error" role="alert">{q.error}</p>}
      {!configured() ? <p className="error">Supabase configuration is missing.</p> : q.sent ? <>
        <form action={verifyCode} className="stack otp-form"><input type="hidden" name="email" value={q.email}/><input type="hidden" name="next" value={q.next ?? ""}/><label>Code from email<input name="token" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" maxLength={10} required placeholder="Enter your code" aria-describedby="otp-help"/></label><p id="otp-help" className="help">Enter all digits from the newest email. Codes expire and can be used only once.</p><VerifyCodeButton/></form>
        <form action={sendCode} className="resend-form"><input type="hidden" name="email" value={q.email}/><input type="hidden" name="next" value={q.next ?? ""}/><ResendCodeButton/></form>
        <a href={`/login${q.next ? `?next=${encodeURIComponent(q.next)}` : ""}`} className="quiet-link auth-change-email">Use another email</a>
      </> : <form action={sendCode} className="stack"><input type="hidden" name="next" value={q.next ?? ""}/><label>Email address<input type="email" name="email" autoComplete="email" required placeholder="you@example.com" defaultValue={q.email ?? ""}/></label><SendLinkButton/></form>}
      <div className="auth-foot">Better journeys, simpler bills.</div>
    </div>
  </main>;
}
