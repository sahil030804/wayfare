import test from "node:test";
import assert from "node:assert/strict";
import { balances, splitEvenly, transfers, parsePaise } from "../src/lib/money.ts";

test("one-friend purchase excludes payer", () => {
  const expenses = [{ amount_paise: 12501, payer_member_id: "a", expense_shares: splitEvenly(12501, ["b"]) }];
  assert.deepEqual(transfers(balances(["a", "b"], expenses, [])), [{ from: "b", to: "a", amount: 12501 }]);
});

test("equal split assigns every paise exactly once", () => {
  assert.deepEqual(splitEvenly(100, ["c", "a", "b"]), [
    { member_id: "a", amount_paise: 34 }, { member_id: "b", amount_paise: 33 }, { member_id: "c", amount_paise: 33 },
  ]);
});

test("multiple payers net into a short settlement list", () => {
  const expenses = [
    { amount_paise: 900, payer_member_id: "a", expense_shares: splitEvenly(900, ["a", "b", "c"]) },
    { amount_paise: 300, payer_member_id: "b", expense_shares: splitEvenly(300, ["a", "b", "c"]) },
  ];
  assert.deepEqual(transfers(balances(["a", "b", "c"], expenses, [])), [
    { from: "c", to: "a", amount: 400 }, { from: "b", to: "a", amount: 100 },
  ]);
});

test("only confirmed payments reduce debt", () => {
  const expenses = [{ amount_paise: 1000, payer_member_id: "a", expense_shares: splitEvenly(1000, ["b"]) }];
  const payments = [
    { from_member_id: "b", to_member_id: "a", amount_paise: 1000, status: "sent" },
  ];
  assert.equal(balances(["a", "b"], expenses, payments).get("b"), -1000);
  payments[0].status = "confirmed";
  assert.equal(balances(["a", "b"], expenses, payments).get("b"), 0);
});

test("amount parsing rejects sub-paise and zero", () => {
  assert.equal(parsePaise("1.05"), 105);
  assert.throws(() => parsePaise("1.001"));
  assert.throws(() => parsePaise("0"));
});
