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
  getLatestTransactionDate,
  parseLocalDateTime,
  parseMonthKey,
  buildExportFileName,
  getPeriodRange,
  getAvailableMonthsForYear,
  detectDeviceLanguage,
  detectDeviceCurrencySymbol,
} = await import("../src/utils/helpers.ts");

// --- getLatestTransactionDate ---
test("getLatestTransactionDate returns the most recent valid date", () => {
  const transactions = [
    { rowId: 1, rawDate: "2026-01-10T12:00:00.000Z", amount: 100, detail: "A", type: "INGRESO FRECUENTE", createdAt: "" },
    { rowId: 2, rawDate: "2026-01-15T12:00:00.000Z", amount: -50, detail: "B", type: "GASTO NO FRECUENTE", createdAt: "" },
    { rowId: 3, rawDate: "2026-01-12T12:00:00.000Z", amount: -30, detail: "C", type: "GASTO FRECUENTE", createdAt: "" },
  ];
  const latest = getLatestTransactionDate(transactions);
  assert.ok(latest);
  assert.equal(latest.getDate(), 15);
  assert.equal(latest.getMonth(), 0);
  assert.equal(latest.getFullYear(), 2026);
});

test("getLatestTransactionDate ignores future dates", () => {
  const future = new Date();
  future.setDate(future.getDate() + 10);
  future.setHours(12, 0, 0, 0);
  const transactions = [
    { rowId: 1, rawDate: "2026-01-10T12:00:00.000Z", amount: 100, detail: "A", type: "INGRESO FRECUENTE", createdAt: "" },
    { rowId: 2, rawDate: future.toISOString(), amount: -50, detail: "B", type: "GASTO NO FRECUENTE", createdAt: "" },
  ];
  const latest = getLatestTransactionDate(transactions);
  assert.ok(latest);
  assert.equal(latest.getDate(), 10);
  assert.equal(latest.getMonth(), 0);
});

test("getLatestTransactionDate returns null for empty array", () => {
  assert.equal(getLatestTransactionDate([]), null);
});

test("getLatestTransactionDate ignores invalid dates", () => {
  const transactions = [
    { rowId: 1, rawDate: "invalid", amount: 100, detail: "A", type: "INGRESO FRECUENTE", createdAt: "" },
    { rowId: 2, rawDate: "2026-01-15T12:00:00.000Z", amount: -50, detail: "B", type: "GASTO NO FRECUENTE", createdAt: "" },
  ];
  const latest = getLatestTransactionDate(transactions);
  assert.ok(latest);
  assert.equal(latest.getDate(), 15);
});

// --- parseLocalDateTime ---
test("parseLocalDateTime parses date correctly for start of day", () => {
  const ms = parseLocalDateTime("2026-01-15", false);
  assert.ok(!Number.isNaN(ms));
  const date = new Date(ms);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 0);
  assert.equal(date.getDate(), 15);
  assert.equal(date.getHours(), 0);
  assert.equal(date.getMinutes(), 0);
  assert.equal(date.getSeconds(), 0);
});

test("parseLocalDateTime parses date correctly for end of day", () => {
  const ms = parseLocalDateTime("2026-01-15", true);
  assert.ok(!Number.isNaN(ms));
  const date = new Date(ms);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 0);
  assert.equal(date.getDate(), 15);
  assert.equal(date.getHours(), 23);
  assert.equal(date.getMinutes(), 59);
  assert.equal(date.getSeconds(), 59);
  assert.equal(date.getMilliseconds(), 999);
});

test("parseLocalDateTime returns NaN for invalid input", () => {
  assert.ok(Number.isNaN(parseLocalDateTime("invalid", false)));
  assert.ok(Number.isNaN(parseLocalDateTime("2026", false)));
  assert.ok(Number.isNaN(parseLocalDateTime("", false)));
});

// --- parseMonthKey ---
test("parseMonthKey converts year-month to numeric key", () => {
  assert.equal(parseMonthKey("2026-01"), 2026 * 12 + 0);
  assert.equal(parseMonthKey("2026-06"), 2026 * 12 + 5);
  assert.equal(parseMonthKey("2026-12"), 2026 * 12 + 11);
});

test("parseMonthKey returns NaN for invalid input", () => {
  assert.ok(Number.isNaN(parseMonthKey("invalid")));
  assert.ok(Number.isNaN(parseMonthKey("2026")));
  assert.ok(Number.isNaN(parseMonthKey("")));
});

// --- buildExportFileName ---
test("buildExportFileName generates correct filename for date range", () => {
  const cfg = {
    format: "xlsx",
    rangeMode: "dates",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
  };
  assert.equal(buildExportFileName(cfg), "bucks-manager_2026-01-01_a_2026-01-31");
});

test("buildExportFileName generates filename for month range", () => {
  const cfg = {
    format: "xlsx",
    rangeMode: "months",
    startDate: "2026-01",
    endDate: "2026-03",
  };
  assert.equal(buildExportFileName(cfg), "bucks-manager_enero-2026_a_marzo-2026");
});

test("buildExportFileName handles partial ranges", () => {
  const cfg1 = { format: "xlsx", rangeMode: "dates", startDate: "2026-01-01", endDate: "" };
  assert.equal(buildExportFileName(cfg1), "bucks-manager_desde_2026-01-01");

  const cfg2 = { format: "xlsx", rangeMode: "dates", startDate: "", endDate: "2026-01-31" };
  assert.equal(buildExportFileName(cfg2), "bucks-manager_hasta_2026-01-31");
});

test("buildExportFileName defaults to todo when no range", () => {
  const cfg = { format: "xlsx", rangeMode: "dates", startDate: "", endDate: "" };
  assert.equal(buildExportFileName(cfg), "bucks-manager_todo");
});

// --- getPeriodRange ---
test("getPeriodRange returns min and max month from transactions", () => {
  const transactions = [
    { rowId: 1, rawDate: "2026-01-15T12:00:00.000Z", amount: 100, detail: "A", type: "INGRESO FRECUENTE", createdAt: "" },
    { rowId: 2, rawDate: "2026-03-15T12:00:00.000Z", amount: -50, detail: "B", type: "GASTO NO FRECUENTE", createdAt: "" },
    { rowId: 3, rawDate: "2026-02-15T12:00:00.000Z", amount: -30, detail: "C", type: "GASTO FRECUENTE", createdAt: "" },
  ];
  const range = getPeriodRange(transactions);
  assert.equal(range.minYear, 2026);
  assert.equal(range.minMonth, 0);
  assert.equal(range.maxYear, 2026);
  assert.equal(range.maxMonth, 2);
});

test("getPeriodRange returns current month for empty array", () => {
  const today = new Date();
  today.setDate(15);
  today.setHours(12, 0, 0, 0);
  const range = getPeriodRange([]);
  assert.equal(range.minYear, today.getFullYear());
  assert.equal(range.minMonth, today.getMonth());
  assert.equal(range.maxYear, today.getFullYear());
  assert.equal(range.maxMonth, today.getMonth());
});

test("getPeriodRange ignores future dates", () => {
  const future = new Date();
  future.setFullYear(future.getFullYear() + 1);
  future.setHours(12, 0, 0, 0);
  const transactions = [
    { rowId: 1, rawDate: "2026-01-15T12:00:00.000Z", amount: 100, detail: "A", type: "INGRESO FRECUENTE", createdAt: "" },
    { rowId: 2, rawDate: future.toISOString(), amount: -50, detail: "B", type: "GASTO NO FRECUENTE", createdAt: "" },
  ];
  const range = getPeriodRange(transactions);
  assert.equal(range.minYear, 2026);
  assert.equal(range.minMonth, 0);
});

// --- getAvailableMonthsForYear ---
test("getAvailableMonthsForYear returns months within range", () => {
  const range = { minYear: 2024, minMonth: 2, maxYear: 2026, maxMonth: 5 };
  assert.deepEqual(getAvailableMonthsForYear(2024, range), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(getAvailableMonthsForYear(2025, range), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(getAvailableMonthsForYear(2026, range), [0, 1, 2, 3, 4, 5]);
});

test("getAvailableMonthsForYear returns empty array for year outside range", () => {
  const range = { minYear: 2024, minMonth: 2, maxYear: 2026, maxMonth: 5 };
  assert.deepEqual(getAvailableMonthsForYear(2023, range), []);
  assert.deepEqual(getAvailableMonthsForYear(2027, range), []);
});

// --- detectDeviceLanguage ---
test("detectDeviceLanguage returns es or en based on locale", () => {
  const lang = detectDeviceLanguage();
  assert.ok(lang === "es" || lang === "en");
});

// --- detectDeviceCurrencySymbol ---
test("detectDeviceCurrencySymbol returns S/ for Peru locale", () => {
  const mockLocale = { resolvedOptions: () => ({ locale: "es-PE" }) };
  const originalDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function () { return mockLocale; };
  assert.equal(detectDeviceCurrencySymbol(), "S/");
  Intl.DateTimeFormat = originalDateTimeFormat;
});

test("detectDeviceCurrencySymbol returns $ for US locale", () => {
  const mockLocale = { resolvedOptions: () => ({ locale: "en-US" }) };
  const originalDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function () { return mockLocale; };
  assert.equal(detectDeviceCurrencySymbol(), "$");
  Intl.DateTimeFormat = originalDateTimeFormat;
});

test("detectDeviceCurrencySymbol returns EUR for Spain locale", () => {
  const mockLocale = { resolvedOptions: () => ({ locale: "es-ES" }) };
  const originalDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function () { return mockLocale; };
  assert.equal(detectDeviceCurrencySymbol(), "\u20ac");
  Intl.DateTimeFormat = originalDateTimeFormat;
});

test("detectDeviceCurrencySymbol defaults to S/ for unknown locale", () => {
  const mockLocale = { resolvedOptions: () => ({ locale: "unknown" }) };
  const originalDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function () { return mockLocale; };
  assert.equal(detectDeviceCurrencySymbol(), "S/");
  Intl.DateTimeFormat = originalDateTimeFormat;
});
