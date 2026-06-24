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

const { findCompatibleSheets, readTransactions } = await import("../src/api/googleWorkspace.ts");
const { getAvailableMonthsForYear, getPeriodRange } = await import("../src/utils/helpers.ts");
const { groupTransactionsByDate, sortTransactionsDesc } = await import("../src/utils/transactions.ts");

const transaction = (rowId, rawDate, createdAt = "") => ({
  rowId,
  rawDate,
  createdAt,
  amount: -rowId,
  detail: `tx-${rowId}`,
  type: "GASTO NO FRECUENTE",
});

test("transaction grouping and sorting preserve the existing order contract", () => {
  const older = transaction(2, "2026-01-01T05:00:00.000Z", "08:00:00");
  const newerFirst = transaction(3, "2026-01-02T05:00:00.000Z", "09:00:00");
  const newerSecond = transaction(4, "2026-01-02T05:00:00.000Z", "10:00:00");
  const sorted = sortTransactionsDesc([older, newerFirst, newerSecond]);

  assert.deepEqual(sorted.map(({ rowId }) => rowId), [3, 4, 2]);
  assert.deepEqual(
    groupTransactionsByDate(sorted).map((group) => ({ key: group.key, rows: group.items.map(({ rowId }) => rowId) })),
    [
      { key: "2026-01-02", rows: [4, 3] },
      { key: "2026-01-01", rows: [2] },
    ],
  );
});

test("period range is calculated once and reused for month options", () => {
  const range = getPeriodRange([
    transaction(2, "2024-03-01T05:00:00.000Z"),
    transaction(3, "2026-06-01T05:00:00.000Z"),
  ]);

  assert.deepEqual(range, { minYear: 2024, minMonth: 2, maxYear: 2026, maxMonth: 5 });
  assert.deepEqual(getAvailableMonthsForYear(2024, range), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(getAvailableMonthsForYear(2026, range), [0, 1, 2, 3, 4, 5]);
});

test("an existing tags header skips migration and formatting requests", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    requests.push({ url, method: init.method || "GET" });
    if (url.includes("valueRenderOption=FORMULA")) return json({ values: [["Fecha", "Monto", "Detalle", "Tipo", "HORA DE CREACION", "Etiquetas"], ["", "-10"]] });
    return json({
      values: [
        ["Fecha", "Monto", "Detalle", "Tipo", "HORA DE CREACION", "Etiquetas"],
        ["01-ene-26", "-10", "Comida", "GASTO NO FRECUENTE", "12:00:00", "Comida"],
      ],
    });
  };

  try {
    const rows = await readTransactions("token", "sheet-with-tags");
    assert.equal(rows.length, 1);
    assert.equal(requests.length, 2);
    assert.ok(requests.every(({ method }) => method === "GET"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Drive compatibility scans use bounded parallel batches and preserve order", async () => {
  const originalFetch = globalThis.fetch;
  const files = Array.from({ length: 12 }, (_, index) => ({ id: `sheet-${index}`, name: `Sheet ${index}` }));
  let active = 0;
  let maxActive = 0;
  globalThis.fetch = async (input) => {
    const url = decodeURIComponent(String(input));
    if (url.includes("/drive/v3/files?")) return json({ files });
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    if (url.includes("fields=sheets.properties.title")) {
      return json({ sheets: [{ properties: { title: "INGRESOS Y GASTOS" } }, { properties: { title: "RESUMEN POR MES" } }] });
    }
    return json({ valueRanges: [
      { values: [["Fecha", "Monto", "Detalle", "Tipo"]] },
      { values: [["MES", "INGRESO FRECUENTE", "INGRESO NO FRECUENTE", "TOTAL INGRESOS", "GASTO FRECUENTE", "GASTO NO FRECUENTE", "TOTAL GASTOS", "NETO MENSUAL", "NETO SIN ING FRECUENTE"]] },
    ] });
  };

  try {
    const compatible = await findCompatibleSheets("token");
    assert.deepEqual(compatible.map(({ id }) => id), files.map(({ id }) => id));
    assert.ok(maxActive > 1 && maxActive <= 5, `max concurrent requests: ${maxActive}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function json(value) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}
