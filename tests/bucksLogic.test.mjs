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
  formatMoney,
  buildTransactionFromDraft,
  insertChronologically,
  applySearch,
  calculateSummaries,
  formatDateToISO,
  formatDateForSheet,
  parseSpanishDate,
  getMonthYear,
  normalizeAmountExpression,
  calculateExpression,
  SHEET_NAMES,
  TRANSACTION_TYPES,
  MONTH_NAMES,
} = await import("../src/domain/bucksLogic.ts");

// --- formatMoney ---
test("formatMoney formats positive income with explicit plus sign", () => {
  assert.equal(formatMoney(100, "S/"), "+ S/ 100.00");
  assert.equal(formatMoney(50.5, "$", 2), "+ $ 50.50");
});

test("formatMoney formats negative expenses with explicit minus sign", () => {
  assert.equal(formatMoney(-100, "S/"), "- S/ 100.00");
  assert.equal(formatMoney(-50.5, "€", 2), "- € 50.50");
});

test("formatMoney handles zero and custom decimals", () => {
  assert.equal(formatMoney(0, "S/"), "+ S/ 0.00");
  assert.equal(formatMoney(100, "$", 0), "+ $ 100");
  assert.equal(formatMoney(100.123, "€", 3), "+ € 100.123");
});

// --- buildTransactionFromDraft ---
test("buildTransactionFromDraft creates income with positive amount", () => {
  const draft = {
    date: "2026-01-15",
    amount: "100",
    detail: "Sueldo",
    type: "INGRESO FRECUENTE",
    tags: ["Trabajo"],
  };
  const tx = buildTransactionFromDraft(draft, 2);
  assert.equal(tx.rowId, 2);
  assert.equal(tx.amount, 100);
  assert.equal(tx.detail, "Sueldo");
  assert.equal(tx.type, "INGRESO FRECUENTE");
  assert.ok(tx.rawDate.startsWith("2026-01-15"));
  assert.ok(tx.createdAt);
  assert.deepEqual(tx.tags, ["Trabajo"]);
});

test("buildTransactionFromDraft creates expense with negative amount", () => {
  const draft = {
    date: "2026-01-15",
    amount: "50",
    detail: "Comida",
    type: "GASTO NO FRECUENTE",
    tags: ["Comida"],
  };
  const tx = buildTransactionFromDraft(draft, 3);
  assert.equal(tx.rowId, 3);
  assert.equal(tx.amount, -50);
  assert.equal(tx.detail, "Comida");
  assert.equal(tx.type, "GASTO NO FRECUENTE");
});

test("buildTransactionFromDraft evaluates math expressions with equals sign", () => {
  const draft = {
    date: "2026-01-15",
    amount: "=10+20",
    detail: "Operacion",
    type: "INGRESO NO FRECUENTE",
  };
  const tx = buildTransactionFromDraft(draft, 4);
  assert.equal(tx.amount, 30);
  assert.equal(tx.formula, "10+20");
});

test("buildTransactionFromDraft preserves createdAt if provided", () => {
  const draft = {
    date: "2026-01-15",
    amount: "100",
    detail: "Test",
    type: "INGRESO FRECUENTE",
    createdAt: "2026-01-14T10:00:00.000Z",
  };
  const tx = buildTransactionFromDraft(draft, 5);
  assert.equal(tx.createdAt, "2026-01-14T10:00:00.000Z");
});

// --- insertChronologically ---
test("insertChronologically inserts in correct date order", () => {
  const existing = [
    {
      rowId: 2,
      rawDate: "2026-01-15T00:00:00.000Z",
      amount: 100,
      detail: "A",
      type: "INGRESO FRECUENTE",
      createdAt: "",
    },
    {
      rowId: 3,
      rawDate: "2026-01-17T00:00:00.000Z",
      amount: -50,
      detail: "B",
      type: "GASTO NO FRECUENTE",
      createdAt: "",
    },
  ];
  const newTx = {
    rowId: 99,
    rawDate: "2026-01-16T00:00:00.000Z",
    amount: -30,
    detail: "C",
    type: "GASTO FRECUENTE",
    createdAt: "",
  };
  const result = insertChronologically(existing, newTx);
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((r) => r.detail),
    ["A", "C", "B"],
  );
  assert.deepEqual(
    result.map((r) => r.rowId),
    [2, 3, 4],
  );
});

test("insertChronologically appends at end if newest", () => {
  const existing = [
    {
      rowId: 2,
      rawDate: "2026-01-15T00:00:00.000Z",
      amount: 100,
      detail: "A",
      type: "INGRESO FRECUENTE",
      createdAt: "",
    },
  ];
  const newTx = {
    rowId: 99,
    rawDate: "2026-01-20T00:00:00.000Z",
    amount: -30,
    detail: "B",
    type: "GASTO FRECUENTE",
    createdAt: "",
  };
  const result = insertChronologically(existing, newTx);
  assert.deepEqual(
    result.map((r) => r.detail),
    ["A", "B"],
  );
  assert.deepEqual(
    result.map((r) => r.rowId),
    [2, 3],
  );
});

test("insertChronologically prepends at start if oldest", () => {
  const existing = [
    {
      rowId: 2,
      rawDate: "2026-01-15T00:00:00.000Z",
      amount: 100,
      detail: "A",
      type: "INGRESO FRECUENTE",
      createdAt: "",
    },
  ];
  const newTx = {
    rowId: 99,
    rawDate: "2026-01-10T00:00:00.000Z",
    amount: -30,
    detail: "B",
    type: "GASTO FRECUENTE",
    createdAt: "",
  };
  const result = insertChronologically(existing, newTx);
  assert.deepEqual(
    result.map((r) => r.detail),
    ["B", "A"],
  );
  assert.deepEqual(
    result.map((r) => r.rowId),
    [2, 3],
  );
});

// --- applySearch ---
test("applySearch filters by text in detail", () => {
  const transactions = [
    {
      rowId: 1,
      rawDate: "2026-01-15T00:00:00.000Z",
      amount: 100,
      detail: "Sueldo enero",
      type: "INGRESO FRECUENTE",
      tags: [],
    },
    {
      rowId: 2,
      rawDate: "2026-01-16T00:00:00.000Z",
      amount: -50,
      detail: "Comida restaurante",
      type: "GASTO NO FRECUENTE",
      tags: ["Comida"],
    },
  ];
  const result = applySearch(transactions, {
    text: "comida",
    tag: "",
    minAmount: "",
    maxAmount: "",
    startDate: "",
    endDate: "",
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].detail, "Comida restaurante");
});

test("applySearch filters by tag", () => {
  const transactions = [
    {
      rowId: 1,
      rawDate: "2026-01-15T00:00:00.000Z",
      amount: 100,
      detail: "Sueldo",
      type: "INGRESO FRECUENTE",
      tags: ["Trabajo"],
    },
    {
      rowId: 2,
      rawDate: "2026-01-16T00:00:00.000Z",
      amount: -50,
      detail: "Comida",
      type: "GASTO NO FRECUENTE",
      tags: ["Comida"],
    },
  ];
  const result = applySearch(transactions, {
    text: "",
    tag: "Comida",
    minAmount: "",
    maxAmount: "",
    startDate: "",
    endDate: "",
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].tags[0], "Comida");
});

test("applySearch filters by amount range", () => {
  const transactions = [
    {
      rowId: 1,
      rawDate: "2026-01-15T00:00:00.000Z",
      amount: 100,
      detail: "A",
      type: "INGRESO FRECUENTE",
      tags: [],
    },
    {
      rowId: 2,
      rawDate: "2026-01-16T00:00:00.000Z",
      amount: -50,
      detail: "B",
      type: "GASTO NO FRECUENTE",
      tags: [],
    },
    {
      rowId: 3,
      rawDate: "2026-01-17T00:00:00.000Z",
      amount: -200,
      detail: "C",
      type: "GASTO FRECUENTE",
      tags: [],
    },
  ];
  const result = applySearch(transactions, {
    text: "",
    tag: "",
    minAmount: "60",
    maxAmount: "150",
    startDate: "",
    endDate: "",
  });
  assert.equal(result.length, 1);
  assert.deepEqual(
    result.map((r) => r.rowId),
    [1],
  );
});

test("applySearch filters by date range", () => {
  const transactions = [
    {
      rowId: 1,
      rawDate: "2026-01-10T00:00:00.000Z",
      amount: 100,
      detail: "A",
      type: "INGRESO FRECUENTE",
      tags: [],
    },
    {
      rowId: 2,
      rawDate: "2026-01-15T00:00:00.000Z",
      amount: -50,
      detail: "B",
      type: "GASTO NO FRECUENTE",
      tags: [],
    },
    {
      rowId: 3,
      rawDate: "2026-01-20T00:00:00.000Z",
      amount: -200,
      detail: "C",
      type: "GASTO FRECUENTE",
      tags: [],
    },
  ];
  const result = applySearch(transactions, {
    text: "",
    tag: "",
    minAmount: "",
    maxAmount: "",
    startDate: "2026-01-12",
    endDate: "2026-01-18",
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].rowId, 2);
});

test("applySearch limits results to 150", () => {
  const transactions = Array.from({ length: 200 }, (_, i) => ({
    rowId: i + 1,
    rawDate: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    amount: -i,
    detail: `Tx ${i}`,
    type: "GASTO NO FRECUENTE",
    tags: [],
  }));
  const result = applySearch(transactions, {
    text: "",
    tag: "",
    minAmount: "",
    maxAmount: "",
    startDate: "",
    endDate: "",
  });
  assert.equal(result.length, 150);
});

// --- calculateSummaries ---
test("calculateSummaries aggregates transactions by month", () => {
  const transactions = [
    {
      rowId: 1,
      rawDate: "2026-01-15T00:00:00.000Z",
      amount: 1000,
      detail: "Sueldo",
      type: "INGRESO FRECUENTE",
      tags: [],
    },
    {
      rowId: 2,
      rawDate: "2026-01-16T00:00:00.000Z",
      amount: 500,
      detail: "Bono",
      type: "INGRESO NO FRECUENTE",
      tags: [],
    },
    {
      rowId: 3,
      rawDate: "2026-01-17T00:00:00.000Z",
      amount: -200,
      detail: "Alquiler",
      type: "GASTO FRECUENTE",
      tags: [],
    },
    {
      rowId: 4,
      rawDate: "2026-01-18T00:00:00.000Z",
      amount: -100,
      detail: "Comida",
      type: "GASTO NO FRECUENTE",
      tags: [],
    },
  ];
  const freqIncome = { "Enero 2026": 1000 };
  const result = calculateSummaries(transactions, freqIncome);
  assert.equal(result.length, 1);
  const row = result[0];
  assert.equal(row.monthYear, "Enero 2026");
  assert.equal(row.freqIncome, 1000);
  assert.equal(row.nonFreqIncome, 500);
  assert.equal(row.totalIncome, 1500);
  assert.equal(row.freqExpense, -200);
  assert.equal(row.nonFreqExpense, -100);
  assert.equal(row.totalExpense, -300);
  assert.equal(row.netMonthly, 1200);
  assert.equal(row.netNoFreq, 200);
});

test("calculateSummaries includes months with only freqIncome", () => {
  const transactions = [];
  const freqIncome = { "Febrero 2026": 800 };
  const result = calculateSummaries(transactions, freqIncome);
  assert.equal(result.length, 1);
  assert.equal(result[0].monthYear, "Febrero 2026");
  assert.equal(result[0].freqIncome, 800);
  assert.equal(result[0].netMonthly, 800);
});

test("calculateSummaries sorts months chronologically", () => {
  const transactions = [
    {
      rowId: 1,
      rawDate: "2026-03-15T00:00:00.000Z",
      amount: 100,
      detail: "A",
      type: "INGRESO NO FRECUENTE",
      tags: [],
    },
    {
      rowId: 2,
      rawDate: "2026-01-15T00:00:00.000Z",
      amount: 200,
      detail: "B",
      type: "INGRESO NO FRECUENTE",
      tags: [],
    },
    {
      rowId: 3,
      rawDate: "2026-02-15T00:00:00.000Z",
      amount: 300,
      detail: "C",
      type: "INGRESO NO FRECUENTE",
      tags: [],
    },
  ];
  const result = calculateSummaries(transactions, {});
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((r) => r.monthYear),
    ["Enero 2026", "Febrero 2026", "Marzo 2026"],
  );
});

// --- Helper functions ---
test("formatDateToISO converts Date to YYYY-MM-DD", () => {
  const date = new Date("2026-01-15T10:00:00.000Z");
  assert.equal(formatDateToISO(date), "2026-01-15");
  assert.equal(formatDateToISO("2026-01-15T10:00:00.000Z"), "2026-01-15");
  assert.equal(formatDateToISO("invalid"), "");
});

test("formatDateForSheet formats as DD-mes-AA", () => {
  const date = new Date(2026, 0, 15);
  assert.equal(formatDateForSheet(date), "15-ene-26");
  const date2 = new Date(2026, 5, 20);
  assert.equal(formatDateForSheet(date2), "20-jun-26");
});

test("parseSpanishDate parses DD-mes-AA format", () => {
  const date = parseSpanishDate("15-ene-26");
  assert.ok(date);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 0);
  assert.equal(date.getDate(), 15);

  assert.equal(parseSpanishDate("invalid"), null);
  assert.equal(parseSpanishDate("15-xxx-26"), null);
});

test("getMonthYear returns Month Year string", () => {
  const date = new Date("2026-01-15T00:00:00.000Z");
  assert.equal(getMonthYear(date), "Enero 2026");
  const date2 = new Date("2026-12-25T00:00:00.000Z");
  assert.equal(getMonthYear(date2), "Diciembre 2026");
});

test("normalizeAmountExpression removes equals prefix", () => {
  assert.equal(normalizeAmountExpression("=10+20"), "10+20");
  assert.equal(normalizeAmountExpression("100"), "100");
  assert.equal(normalizeAmountExpression("  =50  "), "50");
});

test("calculateExpression evaluates math expressions", () => {
  assert.equal(calculateExpression("10+20"), 30);
  assert.equal(calculateExpression("100-30"), 70);
  assert.equal(calculateExpression("5*4"), 20);
  assert.equal(calculateExpression("100/4"), 25);
  assert.equal(calculateExpression("(10+5)*2"), 30);
  assert.equal(calculateExpression("invalid"), 0);
  assert.equal(calculateExpression(""), 0);
});

// --- Constants ---
test("SHEET_NAMES exports correct sheet names", () => {
  assert.equal(SHEET_NAMES.transactions, "INGRESOS Y GASTOS");
  assert.equal(SHEET_NAMES.summary, "RESUMEN POR MES");
});

test("TRANSACTION_TYPES exports all four types", () => {
  assert.deepEqual(TRANSACTION_TYPES, [
    "INGRESO FRECUENTE",
    "INGRESO NO FRECUENTE",
    "GASTO FRECUENTE",
    "GASTO NO FRECUENTE",
  ]);
});

test("MONTH_NAMES exports all twelve months in Spanish", () => {
  assert.equal(MONTH_NAMES.length, 12);
  assert.equal(MONTH_NAMES[0], "Enero");
  assert.equal(MONTH_NAMES[11], "Diciembre");
});
