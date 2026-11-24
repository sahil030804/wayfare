import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Plus, Compass, Users } from "lucide-react";
import { createTrip } from "./actions";
import { AppHeader } from "./components/AppHeader";
import { configured, supabase } from "@/lib/supabase";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!configured()) return <main className="setup"><h1>Set up Wayfare</h1><p>Add your Supabase project keys to <code>.env.local</code>, then run <code>supabase/schema.sql</code> in the SQL editor.</p></main>;
  const db = await supabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile, error: profileError } = await db.from("profiles").select("display_name").eq("id", user.id).single();
  if (profileError?.code === "PGRST205") return <main className="setup"><h1>Database setup needed</h1><p>Your Supabase project is connected, but its app tables have not been created. Run <code>supabase/schema.sql</code> in that project’s SQL Editor, then refresh this page.</p></main>;
  if (!profile) redirect("/profile");
  const { data: trips } = await db.from("trips").select("id,title,status,created_at").order("created_at", { ascending: false });
  const { error } = await searchParams;
  return <>
    <AppHeader name={profile.display_name}/>
    <main className="page home-page">
      <section className="home-hero reveal"><div className="hero-content"><span className="eyebrow">THE BEST PART OF A TRIP IS THE TRIP</span><h1 className="serif">Go together.<br/><span>Settle simply.</span></h1><p>Every shared cab, coffee and last-minute detour in one clear place. You make the memories. We’ll handle the maths.</p><a className="primary" href="#new-trip">Plan a new trip <ArrowRight size={17}/></a></div><div className="hero-orbit" aria-hidden="true"><span/><span/><span/></div></section>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dashboard-grid">
        <section className="journeys"><div className="section-heading"><div><span className="eyebrow">YOUR SHARED JOURNEYS</span><h2 className="serif">Trips in your orbit</h2></div><span className="count">{trips?.length ?? 0} {trips?.length === 1 ? "trip" : "trips"}</span></div>
          {trips?.length ? <div className="trip-list">{trips.map((trip, index) => <Link href={`/trips/${trip.id}`} className={`trip-card reveal delay-${Math.min(index + 1, 4)}`} key={trip.id}><span className={`status-badge ${trip.status === "open" ? "status-open" : "status-closed"}`}>{trip.status === "open" ? "In progress" : "Ready to settle"}</span><h3 className="serif">{trip.title}</h3><p>Started {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(new Date(trip.created_at))}</p><span className="trip-card-footer">Open trip <span className="arrow-circle"><ArrowRight size={18}/></span></span></Link>)}</div> : <div className="empty soft-panel"><Users size={34}/><h3 className="serif">Your next story starts here</h3><p>Create a trip and invite your favorite people.</p></div>}
        </section>
        <aside className="dashboard-side"><div className="note-card"><Compass size={43} strokeWidth={1.2}/><div><h2 className="serif">Nothing to chase but the horizon.</h2><p>Keep the spending clear, so the group can focus on what’s next.</p></div></div><section className="soft-panel new-trip" id="new-trip"><div className="section-heading"><div><span className="eyebrow">START SOMETHING GOOD</span><h2>Create a trip</h2></div><Plus size={22}/></div><p>One place for every coffee, cab and shared dinner.</p><form action={createTrip} className="stack"><label>Trip name<input name="title" placeholder="e.g. Goa long weekend" maxLength={100} required/></label><button className="primary">Create trip <ArrowRight size={18}/></button></form></section></aside>
      </div>
    </main>
  </>;
}
