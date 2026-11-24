import Link from "next/link";
import { ChevronDown, Compass, LogOut, UserRound } from "lucide-react";
import { signOut } from "@/app/actions";

export function AppHeader({ name, active = "trips" }: { name: string; active?: "trips" | "profile" }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
  return <header className="site-header">
    <div className="header-inner">
      <Link className="brand" href="/" aria-label="Wayfare, trips home"><Compass size={25} strokeWidth={2.1}/><span>wayfare<span className="brand-dot">.</span></span></Link>
      <nav className="main-nav" aria-label="Main navigation">
        <Link href="/" aria-current={active === "trips" ? "page" : undefined}>Trips</Link>
        <Link href="/profile" aria-current={active === "profile" ? "page" : undefined}>Profile</Link>
      </nav>
      <details className="account-menu">
        <summary aria-label={`Account menu for ${name}`}><span className="avatar">{initials}</span><span className="account-name">{name}</span><ChevronDown size={16}/></summary>
        <div className="account-dropdown"><span className="account-dropdown-name">Signed in as <strong>{name}</strong></span><Link href="/profile"><UserRound size={17}/> Your profile</Link><form action={signOut}><button type="submit"><LogOut size={17}/> Sign out</button></form></div>
      </details>
    </div>
  </header>;
}
