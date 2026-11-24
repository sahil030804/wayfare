"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

export function SendLinkButton() {
  const { pending } = useFormStatus();
  return <button className="primary" type="submit" disabled={pending} aria-busy={pending}>{pending ? "Sending code…" : "Send sign-in code"}</button>;
}

export function VerifyCodeButton() {
  const { pending } = useFormStatus();
  return <button className="primary" type="submit" disabled={pending} aria-busy={pending}>{pending ? "Checking code…" : "Verify and sign in"}</button>;
}

export function ResendCodeButton() {
  const { pending } = useFormStatus();
  const [seconds, setSeconds] = useState(60);
  useEffect(() => {
    const interval = window.setInterval(() => setSeconds(current => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(interval);
  }, []);
  return <button className="text-button resend-code" type="submit" disabled={pending || seconds > 0}>{pending ? "Sending…" : seconds > 0 ? `Resend code in ${seconds}s` : "Resend code"}</button>;
}
