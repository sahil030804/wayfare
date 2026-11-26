export type Share = { member_id: string; amount_paise: number };
export type Expense = { amount_paise: number; payer_member_id: string; expense_shares: Share[] };
export type Payment = { from_member_id: string; to_member_id: string; amount_paise: number; status: string };
export type Transfer = { from: string; to: string; amount: number };

export function splitEvenly(amount: number, ids: string[]): Share[] {
  if (!Number.isSafeInteger(amount) || amount <= 0 || ids.length === 0 || new Set(ids).size !== ids.length) throw new Error("Invalid split");
  const sorted = [...ids].sort();
  const base = Math.floor(amount / sorted.length);
  const remainder = amount % sorted.length;
  return sorted.map((member_id, index) => ({ member_id, amount_paise: base + (index < remainder ? 1 : 0) }));
}

export function balances(memberIds: string[], expenses: Expense[], payments: Payment[]) {
  const result = new Map(memberIds.map(id => [id, 0]));
  for (const expense of expenses) {
    result.set(expense.payer_member_id, (result.get(expense.payer_member_id) ?? 0) + expense.amount_paise);
    for (const share of expense.expense_shares) result.set(share.member_id, (result.get(share.member_id) ?? 0) - share.amount_paise);
  }
  for (const payment of payments.filter(p => p.status === "confirmed")) {
    result.set(payment.from_member_id, (result.get(payment.from_member_id) ?? 0) + payment.amount_paise);
    result.set(payment.to_member_id, (result.get(payment.to_member_id) ?? 0) - payment.amount_paise);
  }
  return result;
}

export function transfers(balance: Map<string, number>): Transfer[] {
  const debtors = [...balance].filter(([, n]) => n < 0).map(([id, n]) => ({ id, amount: -n })).sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  const creditors = [...balance].filter(([, n]) => n > 0).map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  const result: Transfer[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    result.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].amount -= amount; creditors[j].amount -= amount;
    if (!debtors[i].amount) i++;
    if (!creditors[j].amount) j++;
  }
  return result;
}

/** The full amount currently owed from one member to another, if any. */
export function settlementAmount(balance: Map<string, number>, from: string, to: string): number | null {
  return transfers(balance).find(t => t.from === from && t.to === to)?.amount ?? null;
}

export const rupees = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

export function parsePaise(value: string) {
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value)) throw new Error("Enter a valid amount with up to two decimals");
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Amount must be greater than zero");
  return amount;
}
