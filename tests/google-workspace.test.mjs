import assert from "node:assert/strict";
import test from "node:test";
import "./setup.mjs";

const {
  createBucksSpreadsheet,
  findCompatibleSheets,
  readSummaries,
  readTransactions,
  saveTransaction,
} = await import("../src/api/googleWorkspace.ts");

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function installFetch(t, handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => {
    globalThis.fetch = original;
  });
}

test("transaction reads accept legacy headers and skip corrupt rows", async (t) => {
  installFetch(t, async (input) => {
    const url = decodeURIComponent(String(input));
    if (url.includes("valueRenderOption=FORMULA")) {
      return json({ values: [
        ["FECHA", "MONTO", "DETALLE", "TIPO DE GASTO", "HORA DE CREACION", "ETIQUETAS"],
        ["31-ene-26", "=-ABS(1000+234.5)"],
        ["31-feb-26", "=-10"],
        ["01-feb-26", "=-20"],
      ] });
    }
    return json({ values: [
      [" FECHA ", "MONTO", "DETALLE", "TIPO DE\n GASTO", "HORA DE CREACIÓN", " ETIQUETAS "],
      ["31-ene-26", "-1.234,50", "Mercado", "GASTO FRECUENTE", "12:34:56", "Comida,\n Salud"],
      ["31-feb-26", "-10", "Fecha corrupta", "GASTO FRECUENTE", "", ""],
      ["01-feb-26", "-20", "Tipo corrupto", "DESCONOCIDO", "", ""],
    ] });
  });

  const rows = await readTransactions("token", "legacy-sheet");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rowId, 2);
  assert.equal(rows[0].amount, -1234.5);
  assert.equal(rows[0].formula, "1000+234.5");
  assert.equal(rows[0].createdAt, "12:34:56");
  assert.deepEqual(rows[0].tags, ["Comida", "Salud"]);
});

test("summary reads accept legacy aliases and locale-formatted numbers", async (t) => {
  installFetch(t, async () => json({ values: [
    ["MES Y AÑO", "INGRESO FRECUENTE", "INGRESO NO FRECUENTE", "TOTAL INGRESOS", "GASTO FRECUENTE", "GASTO NO FRECUENTE", "TOTAL GASTOS", "NETO MENSUAL", "TOTAL SIN INGRESO FRECUENTE"],
    ["Enero 2026", "1.000,50", "20", "1.020,50", "-100", "-20", "-120", "900,50", "-100"],
    ["Mes inválido", "500"],
  ] }));

  const rows = await readSummaries("token", "sheet");
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    monthYear: "Enero 2026",
    freqIncome: 1000.5,
    nonFreqIncome: 20,
    totalIncome: 1020.5,
    freqExpense: -100,
    nonFreqExpense: -20,
    totalExpense: -120,
    netMonthly: 900.5,
    netNoFreq: -100,
  });
});

test("spreadsheet creation preserves the exact name, tabs, and locale formulas", async (t) => {
  const requests = [];
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    requests.push({ url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith("/v4/spreadsheets") && init.method === "POST") return json({ spreadsheetId: "created-sheet" });
    if (url.includes("fields=properties.locale")) return json({ properties: { locale: "es_PE" } });
    if (url.includes("fields=sheets.properties(sheetId,title)")) {
      return json({ sheets: [
        { properties: { sheetId: 1, title: "INGRESOS Y GASTOS" } },
        { properties: { sheetId: 2, title: "RESUMEN POR MES" } },
      ] });
    }
    return json({});
  });

  assert.equal(await createBucksSpreadsheet("token"), "created-sheet");
  const createBody = requests.find(({ url, method }) => url.endsWith("/v4/spreadsheets") && method === "POST").body;
  assert.equal(createBody.properties.title, "INGRESOS Y GASTOS");
  assert.deepEqual(createBody.sheets.map(({ properties }) => properties.title), ["INGRESOS Y GASTOS", "RESUMEN POR MES"]);

  const valuesBody = requests.find(({ url }) => url.includes("/values:batchUpdate")).body;
  assert.match(valuesBody.data[1].values[1][1], /INGRESO FRECUENTE/);
  assert.match(valuesBody.data[1].values[1][2], /SUMAR\.SI\.CONJUNTO/);
  assert.match(valuesBody.data[1].values[1][2], /FIN\.MES/);
});

test("saving a transaction inserts the row chronologically and refreshes its monthly formulas", async (t) => {
  const requests = [];
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method: init.method || "GET", body });
    if (url.includes("fields=sheets.properties(sheetId,title)")) {
      return json({ sheets: [{ properties: { sheetId: 7, title: "INGRESOS Y GASTOS" } }] });
    }
    if (url.includes("INGRESOS Y GASTOS!A2:A")) {
      return json({ values: [["01-ene-26"], ["20-ene-26"]] });
    }
    if (url.includes("INGRESOS Y GASTOS!F1")) return json({ values: [["ETIQUETAS"]] });
    if (url.includes("RESUMEN POR MES!A1:I") && (init.method || "GET") === "GET") {
      return json({ values: [
        ["MES", "INGRESO FRECUENTE", "INGRESO NO FRECUENTE", "TOTAL INGRESOS", "GASTO FRECUENTE", "GASTO NO FRECUENTE", "TOTAL GASTOS", "NETO MENSUAL", "NETO SIN ING FRECUENTE"],
        ["Enero 2026"],
      ] });
    }
    if (url.includes("fields=properties.locale")) return json({ properties: { locale: "es_PE" } });
    return json({});
  });

  const saved = await saveTransaction("token", "write-sheet", {
    date: "2026-01-15",
    amount: "=-(10+5)",
    detail: "Prueba",
    type: "GASTO NO FRECUENTE",
    createdAt: "11:22:33",
    tags: ["Casa", "Comida"],
  });

  assert.equal(saved.rowId, 3);
  assert.equal(saved.amount, -15);
  assert.equal(saved.formula, "-(10+5)");
  const insert = requests.find(({ body }) => body?.requests?.[0]?.insertDimension);
  assert.equal(insert.body.requests[0].insertDimension.range.startIndex, 2);
  const rowWrite = requests.find(({ url, method }) => url.includes("INGRESOS Y GASTOS!A3:F3") && method === "PUT");
  assert.deepEqual(rowWrite.body.values[0], [
    "2026-01-15",
    "=-(10+5)",
    "Prueba",
    "GASTO NO FRECUENTE",
    "11:22:33",
    "Casa, Comida",
  ]);
  const formulaWrite = requests.find(({ url, method }) => url.includes("RESUMEN POR MES!C2:I2") && method === "PUT");
  const dateWrite = requests.find(({ url, method }) => url.includes("RESUMEN POR MES!A2") && method === "PUT");
  assert.deepEqual(dateWrite.body.values[0], ["2026-01-01"]);
  assert.match(formulaWrite.body.values[0][0], /SUMAR\.SI\.CONJUNTO/);
});

test("saving frequent income refreshes the frequent-income summary formula", async (t) => {
  const requests = [];
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method: init.method || "GET", body });
    if (url.includes("fields=sheets.properties(sheetId,title)")) {
      return json({ sheets: [{ properties: { sheetId: 7, title: "INGRESOS Y GASTOS" } }] });
    }
    if (url.includes("INGRESOS Y GASTOS!A2:A")) return json({});
    if (url.includes("INGRESOS Y GASTOS!F1")) return json({ values: [["ETIQUETAS"]] });
    if (url.includes("RESUMEN POR MES!A1:I") && (init.method || "GET") === "GET") {
      return json({ values: [
        ["MES", "INGRESO FRECUENTE", "INGRESO NO FRECUENTE", "TOTAL INGRESOS", "GASTO FRECUENTE", "GASTO NO FRECUENTE", "TOTAL GASTOS", "NETO MENSUAL", "NETO SIN ING FRECUENTE"],
        ["Enero 2026"],
      ] });
    }
    if (url.includes("fields=properties.locale")) return json({ properties: { locale: "es_PE" } });
    return json({});
  });

  await saveTransaction("token", "write-sheet", {
    date: "2026-01-15",
    amount: "1000",
    detail: "Sueldo",
    type: "INGRESO FRECUENTE",
    createdAt: "11:22:33",
    tags: [],
  });

  const formulaWrite = requests.find(({ url, method }) => url.includes("RESUMEN POR MES!B2:I2") && method === "PUT");
  const dateWrite = requests.find(({ url, method }) => url.includes("RESUMEN POR MES!A2") && method === "PUT");
  assert.deepEqual(dateWrite.body.values[0], ["2026-01-01"]);
  assert.match(formulaWrite.body.values[0][0], /INGRESO FRECUENTE/);
});

test("saving a transaction creates a missing monthly summary row with default locale formulas", async (t) => {
  const requests = [];
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method: init.method || "GET", body });
    if (url.includes("fields=sheets.properties(sheetId,title)")) {
      return json({ sheets: [{ properties: { sheetId: 7, title: "INGRESOS Y GASTOS" } }] });
    }
    if (url.includes("INGRESOS Y GASTOS!A2:A")) return json({});
    if (url.includes("INGRESOS Y GASTOS!F1")) return json({ values: [["ETIQUETAS"]] });
    if (url.includes("RESUMEN POR MES!A1:I") && (init.method || "GET") === "GET") {
      return json({ values: [["MES", "INGRESO FRECUENTE", "INGRESO NO FRECUENTE", "TOTAL INGRESOS", "GASTO FRECUENTE", "GASTO NO FRECUENTE", "TOTAL GASTOS", "NETO MENSUAL", "NETO SIN ING FRECUENTE"]] });
    }
    if (url.includes("fields=properties.locale")) return json({ properties: {} });
    return json({});
  });

  await saveTransaction("token", "write-sheet", {
    date: "2026-02-15",
    amount: "25",
    detail: "Extra",
    type: "INGRESO NO FRECUENTE",
    createdAt: "11:22:33",
    tags: [],
  });

  const summaryWrite = requests.find(({ url, method }) => url.includes("RESUMEN POR MES!A2:I2") && method === "PUT");
  assert.equal(summaryWrite.body.values[0][0], "2026-02-01");
  assert.match(summaryWrite.body.values[0][1], /SUMAR\.SI\.CONJUNTO/);
  assert.match(summaryWrite.body.values[0][1], /FIN\.MES/);
});

test("Google API failures expose status and response details", async (t) => {
  installFetch(t, async () => json({ error: { message: "invalid token" } }, 401));
  await assert.rejects(findCompatibleSheets("token"), /Google API 401:.*invalid token/);
});

test("Google HTML error pages produce an actionable message", async (t) => {
  installFetch(t, async () => new Response("<html>bad gateway</html>", { status: 502 }));
  await assert.rejects(findCompatibleSheets("token"), /pagina HTML en vez de JSON/);
});
