import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CreditCard, MapPin, Plus, Users } from "lucide-react";
import { AppHeader } from "@/app/components/AppHeader";
import { InviteLink } from "@/app/components/InviteLink";
import { LocationCapture } from "./LocationCapture";
import { closeTrip, connectFriend, deleteExpense, resolvePayment, saveExpense, sendPayment } from "@/app/actions";
import { balances, rupees, transfers, type Expense, type Payment } from "@/lib/money";
import { supabase } from "@/lib/supabase";

type Member = { id: string; name: string; user_id: string | null };
type Entry = Expense & { id: string; remark: string; created_at: string; created_by: string; location_lat: number | null; location_lng: number | null };
type Pay = Payment & { id: string; created_at: string };
const dateLabel = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
function mapUrl(lat: number | null, lng: number | null) {
  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  const a = Number(lat), b = Number(lng);
  if (a < -90 || a > 90 || b < -180 || b > 180) return null;
  return `https://www.openstreetmap.org/?mlat=${a}&mlon=${b}#map=16/${a}/${b}`;
}

export default async function TripPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; invite?: string; token?: string; edit?: string; connected?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const db = await supabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: trip } = await db.from("trips").select("id,title,status,organizer_id").eq("id", id).single();
  if (!trip) notFound();
  const [{ data: memberRows }, { data: expenseRows, error: expenseError }, { data: paymentRows }] = await Promise.all([
    db.from("members").select("id,name,user_id").eq("trip_id", id).order("created_at"),
    db.from("expenses").select("id,amount_paise,payer_member_id,remark,created_at,created_by,location_lat,location_lng,expense_shares(member_id,amount_paise)").eq("trip_id", id).order("created_at", { ascending: false }),
    db.from("payments").select("id,from_member_id,to_member_id,amount_paise,status,created_at").eq("trip_id", id).order("created_at", { ascending: false }),
  ]);
  if (expenseError && /location_lat|location_lng/.test(expenseError.message)) {
    return <main className="setup"><h1>One database update needed</h1><p>Run <code>supabase/migrations/20261124_expense_location.sql</code> in your Supabase SQL Editor, then refresh this page.</p></main>;
  }
  const members = (memberRows ?? []) as Member[];
  const expenses = (expenseRows ?? []) as Entry[];
  const payments = (paymentRows ?? []) as Pay[];
  const me = members.find(m => m.user_id === user.id);
  if (!me) notFound();
  const profilesResult = await db.rpc("trip_upi_ids", { p_trip: id });
  if (profilesResult.error?.code === "PGRST202") return <main className="setup"><h1>Database update needed</h1><p>Run <code>supabase/migrations/20261124_review_fixes.sql</code> in your Supabase SQL Editor, then refresh.</p></main>;
  const upiRows = (profilesResult.data ?? []) as Array<{ user_id: string; upi_id: string | null }>;
  const upi = new Map<string, string | null>(upiRows.map(p => [p.user_id, p.upi_id]));
  const memberName = (memberId: string) => members.find(m => m.id === memberId)?.name ?? "Unknown";
  const balance = balances(members.map(m => m.id), expenses, payments);
  const due = transfers(balance);
  const pending = payments.filter(p => p.status === "sent");
  const edit = q.edit ? expenses.find(e => e.id === q.edit) : undefined;
  const isOrganizer = trip.organizer_id === user.id;
  const total = expenses.reduce((sum, e) => sum + e.amount_paise, 0);
  const myShare = expenses.reduce((sum, e) => sum + (e.expense_shares.find(s => s.member_id === me.id)?.amount_paise ?? 0), 0);
  const myPaid = expenses.reduce((sum, e) => sum + (e.payer_member_id === me.id ? e.amount_paise : 0), 0);
  const myBalance = balance.get(me.id) ?? 0;
  return <><AppHeader name={me.name}/><main className="page trip-page">
    <Link href="/" className="back"><ArrowLeft size={17}/> All trips <span>/</span> {trip.title}</Link>
    <section className="trip-hero"><div><span className="eyebrow">{trip.status === "open" ? "TRIP IN PROGRESS" : "TIME TO SETTLE UP"}</span><h1 className="serif">{trip.title}</h1><p>{members.length} friends · {expenses.length} expenses</p></div>{trip.status === "open" && <div className="trip-actions"><a className="secondary" href="#friends">Invite a friend <ArrowRight size={16}/></a><a className="primary" href="#add-expense"><Plus size={17}/> Add expense</a></div>}</section>
    <section className="trip-summary" aria-label="Trip balances"><div className="summary-cell"><small>SPENT TOGETHER</small><strong className="serif">{rupees(total)}</strong><em>Across {expenses.length} expenses</em></div><div className="summary-cell"><small>YOUR SHARE</small><strong>{rupees(myShare)}</strong><em>What you enjoyed</em></div><div className="summary-cell"><small>YOU PAID</small><strong>{rupees(myPaid)}</strong><em>For the group</em></div><div className="summary-cell"><small>{myBalance >= 0 ? "TO RECEIVE" : "TO PAY"}</small><strong>{rupees(Math.abs(myBalance))}</strong><em>After settling up</em></div></section>
    {q.error && <p className="error" role="alert">{q.error}</p>}
    {q.connected && <p className="success" role="status">Friend connected. This trip now appears in their account.</p>}
    {q.token && q.invite && <InviteLink token={q.token} name={memberName(q.invite)}/>}
    <div className="trip-grid"><div className="main-column">
      {trip.status === "open" ? <section className="panel expense-panel" id="add-expense"><div className="section-heading"><div><span className="eyebrow">NEW ENTRY</span><h2>{edit ? "Edit expense" : "Add an expense"}</h2></div><Plus size={21}/></div><p className="help">Choose only the people who shared this expense. For a one-friend purchase, select just that friend.</p><form action={saveExpense} className="stack expense-form"><input type="hidden" name="trip" value={id}/><input type="hidden" name="expense" value={edit?.id ?? ""}/><div className="form-pair"><label>Amount (₹)<input name="amount" type="number" min="0.01" max="9999999999.99" step="0.01" required placeholder="0.00" defaultValue={edit ? (edit.amount_paise / 100).toFixed(2) : ""}/></label><label>Paid by<select name="payer" defaultValue={edit?.payer_member_id ?? me.id}>{members.filter(m => m.user_id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label></div><label>What was it for?<input name="remark" maxLength={200} required placeholder="Dinner by the beach" defaultValue={edit?.remark ?? ""}/></label><fieldset><legend>Split equally between</legend><div className="checks">{members.map(m => <label className="check" key={m.id}><input type="checkbox" name="participants" value={m.id} disabled={!m.user_id} defaultChecked={edit ? edit.expense_shares.some(s => s.member_id === m.id) : Boolean(m.user_id)}/><span>{m.name}{!m.user_id && <small> · invited</small>}</span></label>)}</div></fieldset><LocationCapture key={edit?.id ?? "new"} latitude={edit?.location_lat ?? null} longitude={edit?.location_lng ?? null}/><button className="primary">{edit ? "Save changes" : "Add expense"}<ArrowRight size={17}/></button>{edit && <Link href={`/trips/${id}`} className="quiet-link">Cancel editing</Link>}</form></section> : <section className="panel settlement"><div className="section-heading"><div><span className="eyebrow">FINAL BALANCES</span><h2>Settle up</h2></div><CreditCard size={23}/></div><p className="help">Only payments confirmed by the recipient count as settled.</p>{due.length ? <div className="transfer-list">{due.map((t, index) => { const recipient = members.find(m => m.id === t.to)!; const recipientUpi = recipient.user_id ? upi.get(recipient.user_id) : null; const hasPending = pending.some(p => p.from_member_id === t.from && p.to_member_id === t.to); const upiUrl = recipientUpi ? `upi://pay?pa=${encodeURIComponent(recipientUpi)}&pn=${encodeURIComponent(recipient.name)}&am=${(t.amount / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(trip.title)}` : null; return <div className="transfer" key={index}><div className="transfer-line"><span><strong>{memberName(t.from)}</strong> pays <strong>{recipient.name}</strong></span><b>{rupees(t.amount)}</b></div>{t.from === me.id && <div className="pay-actions">{recipientUpi ? <><span className="upi-id">{recipientUpi}</span><a className="secondary" href={upiUrl!}>Open UPI app</a></> : <span className="help">Ask {recipient.name} for payment details.</span>}{!hasPending && <form action={sendPayment}><input type="hidden" name="trip" value={id}/><input type="hidden" name="from" value={t.from}/><input type="hidden" name="to" value={t.to}/><input type="hidden" name="amount" value={t.amount}/><button className="secondary">I’ve sent the full amount</button></form>}{hasPending && <span className="status">Awaiting confirmation</span>}</div>}</div>; })}</div> : <div className="empty"><Check size={32}/><h3>All square</h3><p>There’s nothing left to pay.</p></div>}</section>}
      <section className="panel expenses-panel" id="expenses"><div className="section-heading"><div><span className="eyebrow">THE PAPER TRAIL</span><h2>Expenses</h2></div><span className="count">{expenses.length}</span></div>{expenses.length ? <div className="expense-list">{expenses.map(e => <div className="expense-row" key={e.id}><span className="expense-mark">₹</span><div className="expense-info"><strong>{e.remark}</strong><small>Paid by {memberName(e.payer_member_id)} · Shared by {e.expense_shares.map(s => memberName(s.member_id)).join(", ")}</small><div className="expense-meta"><span>{dateLabel.format(new Date(e.created_at))}</span>{mapUrl(e.location_lat, e.location_lng) && <a href={mapUrl(e.location_lat, e.location_lng)!} target="_blank" rel="noopener noreferrer"><MapPin size={15}/> View location</a>}</div></div><div className="expense-side"><b>{rupees(e.amount_paise)}</b>{trip.status === "open" && (e.created_by === user.id || isOrganizer) && <div className="row-actions"><Link href={`/trips/${id}?edit=${e.id}#add-expense`}>Edit</Link><form action={deleteExpense}><input type="hidden" name="trip" value={id}/><input type="hidden" name="expense" value={e.id}/><button>Delete</button></form></div>}</div></div>)}</div> : <div className="empty"><h3>No expenses yet</h3><p>Add the first shared moment above.</p></div>}</section>
    </div><aside className="side-column"><section className="panel" id="friends"><div className="section-heading"><div><span className="eyebrow">THE GROUP</span><h2>Your travel crew</h2></div><Users size={20}/></div><div className="member-list">{members.map((m, i) => <div className="member-row" key={m.id}><span className={`member-avatar color-${i % 4}`}>{m.name.slice(0,1).toUpperCase()}</span><span><strong>{m.name}{m.id === me.id ? " (you)" : ""}</strong><small>{m.user_id ? "On Wayfare" : "Account not linked"}</small></span><b className={(balance.get(m.id) ?? 0) < 0 ? "owes" : "owed"}>{rupees(balance.get(m.id) ?? 0)}</b>{isOrganizer && trip.status === "open" && !m.user_id && <form action={connectFriend} className="renew-invite"><input type="hidden" name="trip" value={id}/><input type="hidden" name="member" value={m.id}/><label className="sr-only" htmlFor={`link-${m.id}`}>Account email for {m.name}</label><input id={`link-${m.id}`} name="email" type="email" required placeholder="Their account email" autoComplete="off"/><button type="submit" className="secondary">Connect account</button></form>}</div>)}</div>{isOrganizer && trip.status === "open" && <form action={connectFriend} className="stack add-friend"><input type="hidden" name="trip" value={id}/><label>Add a friend by account email<input name="email" type="email" required maxLength={254} placeholder="friend@example.com" autoComplete="off"/></label><p className="help">They need a Wayfare account and completed profile. The trip appears for them as soon as you add them.</p><button className="secondary"><Plus size={16}/> Add friend</button></form>}</section>
    {trip.status === "open" && isOrganizer && <section className="panel finish-panel"><span className="eyebrow">WHEN YOU’RE READY</span><h2>Wrap up the trip</h2><p>Review all expenses before ending. Ending locks the trip and shows final payments.</p><form action={closeTrip}><input type="hidden" name="trip" value={id}/><button className="dark-button">End trip <ArrowRight size={16}/></button></form></section>}
    {pending.length > 0 && <section className="panel"><span className="eyebrow">PAYMENT ACTIVITY</span><h2>Awaiting confirmation</h2>{pending.map(p => <div className="pending-row" key={p.id}><p>{memberName(p.from_member_id)} → {memberName(p.to_member_id)}<br/><strong>{rupees(p.amount_paise)}</strong></p>{p.to_member_id === me.id && <form action={resolvePayment}><input type="hidden" name="trip" value={id}/><input type="hidden" name="payment" value={p.id}/><button name="decision" value="confirm" className="secondary">Confirm received</button><button name="decision" value="reject" className="text-button">Reject</button></form>}</div>)}</section>}
    </aside></div></main></>;
}
