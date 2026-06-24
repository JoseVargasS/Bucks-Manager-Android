import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith("."))
        return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const {
  getBlankDraft,
  sortTransactionsDesc,
  filterTransactionsByRollingPeriod,
  groupTransactionsByDate,
} = await import("../src/utils/transactions.ts");

// --- getBlankDraft ---
test("getBlankDraft creates empty draft with default type", () => {
  const draft = getBlankDraft();
  assert.equal(draft.type, "GASTO NO FRECUENTE");
  assert.equal(draft.amount, "");
  assert.equal(draft.detail, "");
  assert.ok(draft.date);
});

test("getBlankDraft creates draft with specified type", () => {
  const draft = getBlankDraft("INGRESO FRECUENTE");
  assert.equal(draft.type, "INGRESO FRECUENTE");
});

// --- sortTransactionsDesc ---
test("sortTransactionsDesc sorts by date descending", () => {
  const transactions = [
    {
      rowId: 1,
      rawDate: "2026-01-10T12:00:00.000Z",
      amount: 100,
      detail: "A",
      type: "INGRESO FRECUENTE",
      createdAt: "",
    },
    {
      rowId: 2,
      rawDate: "2026-01-15T12:00:00.000Z",
      amount: -50,
      detail: "B",
      type: "GASTO NO FRECUENTE",
      createdAt: "",
    },
    {
      rowId: 3,
      rawDate: "2026-01-12T12:00:00.000Z",
      amount: -30,
      detail: "C",
      type: "GASTO FRECUENTE",
      createdAt: "",
    },
  ];
  const sorted = sortTransactionsDesc(transactions);
  assert.deepEqual(
    sorted.map((t) => t.rowId),
    [2, 3, 1],
  );
});

test("sortTransactionsDesc resolves ties by createdAt", () => {
  const transactions = [
    {
      rowId: 1,
      rawDate: "2026-01-15T12:00:00.000Z",
      amount: 100,
      detail: "A",
      type: "INGRESO FRECUENTE",
      createdAt: "2026-01-15T08:00:00.000Z",
    },
    {
      rowId: 2,
      rawDate: "2026-01-15T12:00:00.000Z",
      amount: -50,
      detail: "B",
      type: "GASTO NO FRECUENTE",
      createdAt: "2026-01-15T12:00:00.000Z",
    },
    {
      rowId: 3,
      rawDate: "2026-01-15T12:00:00.000Z",
      amount: -30,
      detail: "C",
      type: "GASTO FRECUENTE",
      createdAt: "2026-01-15T11:00:00.000Z",
    },
  ];
  const sorted = sortTransactionsDesc(transactions);
  assert.deepEqual(
    sorted.map((t) => t.rowId),
    [2, 3, 1],
  );
});

test("sortTransactionsDesc resolves ties by original index when createdAt matches", () => {
  const transactions = [
    {
      rowId: 1,
      rawDate: "2026-01-15T12:00:00.000Z",
      amount: 100,
      detail: "A",
      type: "INGRESO FRECUENTE",
      createdAt: "10:00:00",
    },
    {
      rowId: 2,
      rawDate: "2026-01-15T12:00:00.000Z",
      amount: -50,
      detail: "B",
      type: "GASTO NO FRECUENTE",
      createdAt: "10:00:00",
    },
  ];
  const sorted = sortTransactionsDesc(transactions);
  assert.deepEqual(
    sorted.map((t) => t.rowId),
    [1, 2],
  );
});

// --- filterTransactionsByRollingPeriod ---
test("filterTransactionsByRollingPeriod filters by 1-month window", () => {
  const transactions = [
    {
      rowId: 1,
      rawDate: "2025-12-15T12:00:00.000Z",
      amount: 100,
      detail: "A",
      type: "INGRESO FRECUENTE",
      createdAt: "",
    },
    {
      rowId: 2,
      rawDate: "2026-01-10T12:00:00.000Z",
      amount: -50,
      detail: "B",
      type: "GASTO NO FRECUENTE",
      createdAt: "",
    },
    {
      rowId: 3,
      rawDate: "2026-01-20T12:00:00.000Z",
      amount: -30,
      detail: "C",
      type: "GASTO FRECUENTE",
      createdAt: "",
    },
    {
      rowId: 4,
      rawDate: "2026-02-05T12:00:00.000Z",
      amount: 200,
      detail: "D",
      type: "INGRESO NO FRECUENTE",
      createdAt: "",
    },
  ];
  const filtered = filterTransactionsByRollingPeriod(transactions, 0, 2026, 1);
  assert.equal(filtered.length, 2);
  assert.deepEqual(
    filtered.map((t) => t.rowId),
    [2, 3],
  );
});

test("filterTransactionsByRollingPeriod includes multiple months", () => {
  const transactions = [
    {
      rowId: 1,
      rawDate: "2025-12-15T12:00:00.000Z",
      amount: 100,
      detail: "A",
      type: "INGRESO FRECUENTE",
      createdAt: "",
    },
    {
      rowId: 2,
      rawDate: "2026-01-10T12:00:00.000Z",
      amount: -50,
      detail: "B",
      type: "GASTO NO FRECUENTE",
      createdAt: "",
    },
    {
      rowId: 3,
      rawDate: "2026-02-20T12:00:00.000Z",
      amount: -30,
      detail: "C",
      type: "GASTO FRECUENTE",
      createdAt: "",
    },
  ];
  const filtered = filterTransactionsByRollingPeriod(transactions, 1, 2026, 3);
  assert.equal(filtered.length, 3);
});

test("filterTransactionsByRollingPeriod returns empty array for no matches", () => {
  const transactions = [
    {
      rowId: 1,
      rawDate: "2025-01-15T12:00:00.000Z",
      amount: 100,
      detail: "A",
      type: "INGRESO FRECUENTE",
      createdAt: "",
    },
  ];
  const filtered = filterTransactionsByRollingPeriod(transactions, 6, 2026, 1);
  assert.equal(filtered.length, 0);
});

// --- groupTransactionsByDate ---
test("groupTransactionsByDate groups transactions by ISO date", () => {
  const transactions = [
    {
      rowId: 1,
      rawDate: "2026-06-15T12:00:00.000Z",
      amount: 100,
      detail: "A",
      type: "INGRESO FRECUENTE",
      createdAt: "",
    },
    {
      rowId: 2,
      rawDate: "2026-06-15T12:00:00.000Z",
      amount: -50,
      detail: "B",
      type: "GASTO NO FRECUENTE",
      createdAt: "",
    },
    {
      rowId: 3,
      rawDate: "2026-06-16T12:00:00.000Z",
      amount: -30,
      detail: "C",
      type: "GASTO FRECUENTE",
      createdAt: "",
    },
  ];
  const groups = groupTransactionsByDate(transactions);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, "2026-06-15");
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[1].key, "2026-06-16");
  assert.equal(groups[1].items.length, 1);
});

test("groupTransactionsByDate reverses items within each group", () => {
  const transactions = [
    {
      rowId: 1,
      rawDate: "2026-06-15T08:00:00.000Z",
      amount: 100,
      detail: "A",
      type: "INGRESO FRECUENTE",
      createdAt: "08:00:00",
    },
    {
      rowId: 2,
      rawDate: "2026-06-15T10:00:00.000Z",
      amount: -50,
      detail: "B",
      type: "GASTO NO FRECUENTE",
      createdAt: "10:00:00",
    },
  ];
  const groups = groupTransactionsByDate(transactions);
  assert.equal(groups[0].items.length, 2);
  assert.deepEqual(
    groups[0].items.map((t) => t.rowId),
    [2, 1],
  );
});

test("groupTransactionsByDate generates correct labels", () => {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const transactions = [
    {
      rowId: 1,
      rawDate: today.toISOString(),
      amount: 100,
      detail: "A",
      type: "INGRESO FRECUENTE",
      createdAt: "",
    },
  ];
  const groups = groupTransactionsByDate(transactions);
  assert.ok(
    groups[0].label.includes("HOY") || groups[0].label.includes("TODAY"),
  );
});
