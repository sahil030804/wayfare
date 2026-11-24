"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

export function InviteLink({ token, name }: { token: string; name: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (inputRef.current) inputRef.current.value = `${window.location.origin}/join/${encodeURIComponent(token)}`;
  }, [token]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${encodeURIComponent(token)}`);
      setStatus("Link copied");
    } catch {
      setStatus("Copy unavailable. Select and copy the link above.");
    }
  }

  return <div className="invite-banner">
    <div><span className="eyebrow">PERSONAL INVITATION</span><h2>Invite {name}</h2><p>This link can be claimed once. Send it directly to your friend.</p></div>
    <div className="copy-control"><input ref={inputRef} aria-label={`Invite link for ${name}`} readOnly defaultValue={`/join/${encodeURIComponent(token)}`} onFocus={event => event.currentTarget.select()}/><button type="button" className="secondary" onClick={copy}>{status === "Link copied" ? <Check size={17}/> : <Copy size={17}/>} {status === "Link copied" ? "Copied" : "Copy link"}</button></div>
    <span className="copy-status" role="status" aria-live="polite">{status}</span>
  </div>;
}
