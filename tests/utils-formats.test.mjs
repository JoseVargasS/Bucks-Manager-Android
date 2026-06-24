import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".")) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const {
  formatCreatedTime,
  formatDateGroupLabel,
  typeColor,
  typeFill,
  typeLabel,
  typeLabelFull,
} = await import("../src/utils/formats.ts");

const mockColors = {
  green: "#22c55e",
  red: "#ef4444",
  yellow: "#eab308",
  incomeSoft: "#dcfce7",
  expenseSoft: "#fee2e2",
  warnSoft: "#fef9c3",
};

const mockCopyEs = {
  languageCode: "es",
  today: "HOY",
  yesterday: "AYER",
  freqIncome: "Ing. Frec.",
  nonFreqIncome: "Ing. No Frec.",
  freqExpense: "Gasto Frec.",
  nonFreqExpense: "Gasto No Frec.",
  freqIncomeFull: "Ingreso Frecuente",
  nonFreqIncomeFull: "Ingreso No Frecuente",
  freqExpenseFull: "Gasto Frecuente",
  nonFreqExpenseFull: "Gasto No Frecuente",
};

const mockCopyEn = {
  languageCode: "en",
  today: "TODAY",
  yesterday: "YESTERDAY",
  freqIncome: "Freq. Income",
  nonFreqIncome: "Non-Freq. Income",
  freqExpense: "Freq. Expense",
  nonFreqExpense: "Non-Freq. Expense",
  freqIncomeFull: "Frequent Income",
  nonFreqIncomeFull: "Non-Frequent Income",
  freqExpenseFull: "Frequent Expense",
  nonFreqExpenseFull: "Non-Frequent Expense",
};

// --- formatCreatedTime ---
test("formatCreatedTime formats time string correctly", () => {
  const result = formatCreatedTime("2026-01-15T14:30:45.000Z");
  assert.ok(/^\d{2}:\d{2}:\d{2}$/.test(result));
});

test("formatCreatedTime returns dash for empty input", () => {
  assert.equal(formatCreatedTime(""), "-");
  assert.equal(formatCreatedTime(undefined), "-");
});

test("formatCreatedTime returns original value for invalid date", () => {
  assert.equal(formatCreatedTime("invalid"), "invalid");
});

// --- formatDateGroupLabel ---
test("formatDateGroupLabel shows HOY for today", () => {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const label = formatDateGroupLabel(today.toISOString(), mockCopyEs);
  assert.ok(label.includes("HOY"));
});

test("formatDateGroupLabel shows AYER for yesterday", () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(12, 0, 0, 0);
  const label = formatDateGroupLabel(yesterday.toISOString(), mockCopyEs);
  assert.ok(label.includes("AYER"));
});

test("formatDateGroupLabel shows full date for other dates", () => {
  const label = formatDateGroupLabel("2026-06-15T12:00:00.000Z", mockCopyEs);
  assert.ok(label.includes("2026"));
});

test("formatDateGroupLabel uses English labels when configured", () => {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const label = formatDateGroupLabel(today.toISOString(), mockCopyEn);
  assert.ok(label.includes("TODAY"));
});

// --- typeColor ---
test("typeColor returns green for income types", () => {
  assert.equal(typeColor("INGRESO FRECUENTE", mockColors), mockColors.green);
  assert.equal(typeColor("INGRESO NO FRECUENTE", mockColors), mockColors.green);
});

test("typeColor returns red for GASTO FRECUENTE", () => {
  assert.equal(typeColor("GASTO FRECUENTE", mockColors), mockColors.red);
});

test("typeColor returns yellow for GASTO NO FRECUENTE", () => {
  assert.equal(typeColor("GASTO NO FRECUENTE", mockColors), mockColors.yellow);
});

// --- typeFill ---
test("typeFill returns income soft for income types", () => {
  assert.equal(typeFill("INGRESO FRECUENTE", mockColors), mockColors.incomeSoft);
  assert.equal(typeFill("INGRESO NO FRECUENTE", mockColors), mockColors.incomeSoft);
});

test("typeFill returns expense soft for GASTO FRECUENTE", () => {
  assert.equal(typeFill("GASTO FRECUENTE", mockColors), mockColors.expenseSoft);
});

test("typeFill returns warn soft for GASTO NO FRECUENTE", () => {
  assert.equal(typeFill("GASTO NO FRECUENTE", mockColors), mockColors.warnSoft);
});

// --- typeLabel ---
test("typeLabel returns short labels in Spanish", () => {
  assert.equal(typeLabel("INGRESO FRECUENTE", mockCopyEs), mockCopyEs.freqIncome);
  assert.equal(typeLabel("INGRESO NO FRECUENTE", mockCopyEs), mockCopyEs.nonFreqIncome);
  assert.equal(typeLabel("GASTO FRECUENTE", mockCopyEs), mockCopyEs.freqExpense);
  assert.equal(typeLabel("GASTO NO FRECUENTE", mockCopyEs), mockCopyEs.nonFreqExpense);
});

test("typeLabel returns short labels in English", () => {
  assert.equal(typeLabel("INGRESO FRECUENTE", mockCopyEn), mockCopyEn.freqIncome);
  assert.equal(typeLabel("GASTO NO FRECUENTE", mockCopyEn), mockCopyEn.nonFreqExpense);
});

// --- typeLabelFull ---
test("typeLabelFull returns full labels in Spanish", () => {
  assert.equal(typeLabelFull("INGRESO FRECUENTE", mockCopyEs), mockCopyEs.freqIncomeFull);
  assert.equal(typeLabelFull("INGRESO NO FRECUENTE", mockCopyEs), mockCopyEs.nonFreqIncomeFull);
  assert.equal(typeLabelFull("GASTO FRECUENTE", mockCopyEs), mockCopyEs.freqExpenseFull);
  assert.equal(typeLabelFull("GASTO NO FRECUENTE", mockCopyEs), mockCopyEs.nonFreqExpenseFull);
});

test("typeLabelFull returns full labels in English", () => {
  assert.equal(typeLabelFull("INGRESO FRECUENTE", mockCopyEn), mockCopyEn.freqIncomeFull);
  assert.equal(typeLabelFull("GASTO NO FRECUENTE", mockCopyEn), mockCopyEn.nonFreqExpenseFull);
});
