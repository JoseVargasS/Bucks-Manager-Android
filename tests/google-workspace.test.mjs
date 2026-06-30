import assert from "node:assert/strict";
import test from "node:test";
import "./setup.mjs";

const {
  createBucksSpreadsheet,
  findCompatibleSheets,
  readSummaries,
  readTransactions,
  saveTransaction,
  insertTransactionAtRow,
  updateTransaction,
  deleteTransaction,
  moveTransaction,
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

function sharedTxHandlers(requests) {
  return async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method: init.method || "GET", body });
    if (url.includes("fields=sheets.properties(sheetId,title)")) {
      return json({ sheets: [{ properties: { sheetId: 7, title: "INCOME AND EXPENSES" } }] });
    }
    if (url.includes("INCOME AND EXPENSES!A2:A")) return json({ values: [] });
    if (url.includes("INCOME AND EXPENSES!F1")) return json({ values: [["ETIQUETAS"]] });
    if (url.includes("MONTHLY SUMMARY!A1:I") && (init.method || "GET") === "GET") {
      return json({ values: [
        ["MES", "INGRESO FRECUENTE", "INGRESO NO FRECUENTE", "TOTAL INGRESOS", "GASTO FRECUENTE", "GASTO NO FRECUENTE", "TOTAL GASTOS", "NETO MENSUAL", "NETO SIN ING FRECUENTE"],
        ["January 2026"],
      ] });
    }
    if (url.includes("fields=properties.locale")) return json({ properties: { locale: "en_US" } });
    return json({});
  };
}

  test("transaction reads accept legacy headers and skip corrupt rows", async (t) => {
  installFetch(t, async (input) => {
    const url = decodeURIComponent(String(input));
    if (url.includes("valueRenderOption=FORMULA")) {
      return json({ values: [
        ["Date", "Amount", "Detail", "Type", "CREATION TIME", "Tags"],
        ["31-jan-26", "=-ABS(1000+234.5)"],
        ["31-feb-26", "=-10"],
        ["01-feb-26", "=-20"],
      ] });
    }
    return json({ values: [
      ["Date", "Amount", "Detail", "Type", "CREATION TIME", "Tags"],
      ["31-jan-26", "-1.234,50", "Mercado", "GASTO FRECUENTE", "12:34:56", "Comida,\n Salud"],
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
    ["January 2026", "1.000,50", "20", "1.020,50", "-100", "-20", "-120", "900,50", "-100"],
    ["Mes inválido", "500"],
  ] }));

  const rows = await readSummaries("token", "sheet");
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    monthYear: "January 2026",
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
    if (url.includes("fields=properties.locale")) return json({ properties: { locale: "en_US" } });
    if (url.includes("fields=sheets.properties(sheetId,title)")) {
      return json({ sheets: [
        { properties: { sheetId: 1, title: "INCOME AND EXPENSES" } },
        { properties: { sheetId: 2, title: "MONTHLY SUMMARY" } },
      ] });
    }
    return json({});
  });

  assert.equal(await createBucksSpreadsheet("token"), "created-sheet");
  const createBody = requests.find(({ url, method }) => url.endsWith("/v4/spreadsheets") && method === "POST").body;
  assert.equal(createBody.properties.title, "INCOME AND EXPENSES");
  assert.deepEqual(createBody.sheets.map(({ properties }) => properties.title), ["INCOME AND EXPENSES", "MONTHLY SUMMARY"]);

  const valuesBody = requests.find(({ url }) => url.includes("/values:batchUpdate")).body;
  assert.match(valuesBody.data[1].values[1][1], /INGRESO FRECUENTE/);
  assert.match(valuesBody.data[1].values[1][2], /SUMIFS/);
  assert.match(valuesBody.data[1].values[1][2], /EOMONTH/);
});

test("saving a transaction inserts the row chronologically and refreshes its monthly formulas", async (t) => {
  const requests = [];
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method: init.method || "GET", body });
    if (url.includes("fields=sheets.properties(sheetId,title)")) {
      return json({ sheets: [{ properties: { sheetId: 7, title: "INCOME AND EXPENSES" } }] });
    }
    if (url.includes("INCOME AND EXPENSES!A2:A")) {
      return json({ values: [["01-jan-26"], ["20-jan-26"]] });
    }
    if (url.includes("INCOME AND EXPENSES!F1")) return json({ values: [["ETIQUETAS"]] });
    if (url.includes("MONTHLY SUMMARY!A1:I") && (init.method || "GET") === "GET") {
      return json({ values: [
        ["MES", "INGRESO FRECUENTE", "INGRESO NO FRECUENTE", "TOTAL INGRESOS", "GASTO FRECUENTE", "GASTO NO FRECUENTE", "TOTAL GASTOS", "NETO MENSUAL", "NETO SIN ING FRECUENTE"],
        ["January 2026"],
      ] });
    }
    if (url.includes("fields=properties.locale")) return json({ properties: { locale: "en_US" } });
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
  const rowWrite = requests.find(({ url, method }) => url.includes("INCOME AND EXPENSES!A3:F3") && method === "PUT");
  assert.deepEqual(rowWrite.body.values[0], [
    "2026-01-15",
    "=-(10+5)",
    "Prueba",
    "GASTO NO FRECUENTE",
    "11:22:33",
    "Casa, Comida",
  ]);
  const formulaWrite = requests.find(({ url, method }) => url.includes("MONTHLY SUMMARY!C2:I2") && method === "PUT");
  const dateWrite = requests.find(({ url, method }) => url.includes("MONTHLY SUMMARY!A2") && method === "PUT");
  assert.deepEqual(dateWrite.body.values[0], ["2026-01"]);
  assert.match(formulaWrite.body.values[0][0], /SUMIFS/);
});

test("saving frequent income refreshes the frequent-income summary formula", async (t) => {
  const requests = [];
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method: init.method || "GET", body });
    if (url.includes("fields=sheets.properties(sheetId,title)")) {
      return json({ sheets: [{ properties: { sheetId: 7, title: "INCOME AND EXPENSES" } }] });
    }
    if (url.includes("INCOME AND EXPENSES!A2:A")) return json({});
    if (url.includes("INCOME AND EXPENSES!F1")) return json({ values: [["ETIQUETAS"]] });
    if (url.includes("MONTHLY SUMMARY!A1:I") && (init.method || "GET") === "GET") {
      return json({ values: [
        ["MES", "INGRESO FRECUENTE", "INGRESO NO FRECUENTE", "TOTAL INGRESOS", "GASTO FRECUENTE", "GASTO NO FRECUENTE", "TOTAL GASTOS", "NETO MENSUAL", "NETO SIN ING FRECUENTE"],
        ["January 2026"],
      ] });
    }
    if (url.includes("fields=properties.locale")) return json({ properties: { locale: "en_US" } });
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

  const formulaWrite = requests.find(({ url, method }) => url.includes("MONTHLY SUMMARY!B2:I2") && method === "PUT");
  const dateWrite = requests.find(({ url, method }) => url.includes("MONTHLY SUMMARY!A2") && method === "PUT");
  assert.deepEqual(dateWrite.body.values[0], ["2026-01"]);
  assert.match(formulaWrite.body.values[0][0], /INGRESO FRECUENTE/);
});

test("saving a transaction creates a missing monthly summary row with default locale formulas", async (t) => {
  const requests = [];
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method: init.method || "GET", body });
    if (url.includes("fields=sheets.properties(sheetId,title)")) {
      return json({ sheets: [{ properties: { sheetId: 7, title: "INCOME AND EXPENSES" } }] });
    }
    if (url.includes("INCOME AND EXPENSES!A2:A")) return json({});
    if (url.includes("INCOME AND EXPENSES!F1")) return json({ values: [["ETIQUETAS"]] });
    if (url.includes("MONTHLY SUMMARY!A1:I") && (init.method || "GET") === "GET") {
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

  const summaryWrite = requests.find(({ url, method }) => url.includes("MONTHLY SUMMARY!A2:I2") && method === "PUT");
  assert.equal(summaryWrite.body.values[0][0], "2026-02");
  assert.match(summaryWrite.body.values[0][1], /SUMIFS/);
  assert.match(summaryWrite.body.values[0][1], /EOMONTH/);
});

test("Google API failures expose status and response details", async (t) => {
  installFetch(t, async () => json({ error: { message: "invalid token" } }, 401));
  await assert.rejects(findCompatibleSheets("token"), /Google API 401:.*invalid token/);
});

test("Google HTML error pages produce an actionable message", async (t) => {
  installFetch(t, async () => new Response("<html>bad gateway</html>", { status: 502 }));
  await assert.rejects(findCompatibleSheets("token"), /pagina HTML en vez de JSON/);
});

test("insertTransactionAtRow writes at the specified row", async (t) => {
  const requests = [];
  installFetch(t, sharedTxHandlers(requests));

  const result = await insertTransactionAtRow("token", "sheet", {
    date: "2026-03-10",
    amount: "-50",
    detail: "Insertado",
    type: "GASTO FRECUENTE",
    createdAt: "09:00:00",
    tags: [],
  }, 4);

  assert.equal(result.rowId, 4);
  const insert = requests.find(({ body }) => body?.requests?.[0]?.insertDimension);
  assert.equal(insert.body.requests[0].insertDimension.range.startIndex, 3);
});

test("insertTransactionAtRow clamps row below 2", async (t) => {
  const requests = [];
  installFetch(t, sharedTxHandlers(requests));

  const result = await insertTransactionAtRow("token", "sheet", {
    date: "2026-03-10",
    amount: "-50",
    detail: "Clamped",
    type: "GASTO FRECUENTE",
    createdAt: "",
    tags: [],
  }, 1);

  assert.equal(result.rowId, 2);
});

test("updateTransaction rewrites same row when date unchanged", async (t) => {
  const requests = [];
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method: init.method || "GET", body });
    if (url.includes("fields=sheets.properties(sheetId,title)")) {
      return json({ sheets: [{ properties: { sheetId: 7, title: "INCOME AND EXPENSES" } }] });
    }
    if (url.includes("INCOME AND EXPENSES!A5:F5") && (init.method || "GET") === "GET") {
      return json({ values: [["2026-01-15", "-10", "Old", "GASTO FRECUENTE", "10:00:00", ""]] });
    }
    if (url.includes("INCOME AND EXPENSES!F1")) return json({ values: [["ETIQUETAS"]] });
    if (url.includes("INCOME AND EXPENSES!A2:A")) return json({ values: [] });
    if (url.includes("MONTHLY SUMMARY!A1:I") && (init.method || "GET") === "GET") {
      return json({ values: [
        ["MES", "INGRESO FRECUENTE", "INGRESO NO FRECUENTE", "TOTAL INGRESOS", "GASTO FRECUENTE", "GASTO NO FRECUENTE", "TOTAL GASTOS", "NETO MENSUAL", "NETO SIN ING FRECUENTE"],
        ["January 2026"],
      ] });
    }
    if (url.includes("fields=properties.locale")) return json({ properties: { locale: "en_US" } });
    return json({});
  });

  const result = await updateTransaction("token", "sheet", 5, {
    date: "2026-01-15",
    amount: "-25",
    detail: "Updated",
    type: "GASTO FRECUENTE",
    createdAt: "10:00:00",
    tags: [],
  });

  assert.equal(result.rowId, 5);
  const rowWrite = requests.find(({ url, method }) => url.includes("INCOME AND EXPENSES!A5:F5") && method === "PUT");
  assert.equal(rowWrite.body.values[0][2], "Updated");
});

test("updateTransaction moves row when date changes", async (t) => {
  const requests = [];
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method: init.method || "GET", body });
    if (url.includes("fields=sheets.properties(sheetId,title)")) {
      return json({ sheets: [{ properties: { sheetId: 7, title: "INCOME AND EXPENSES" } }] });
    }
    if (url.includes("INCOME AND EXPENSES!A5:F5") && (init.method || "GET") === "GET") {
      return json({ values: [["2026-01-15", "-10", "Old", "GASTO FRECUENTE", "10:00:00", ""]] });
    }
    if (url.includes("INCOME AND EXPENSES!A2:A")) return json({ values: [["2026-03-01"]] });
    if (url.includes("INCOME AND EXPENSES!F1")) return json({ values: [["ETIQUETAS"]] });
    if (url.includes("MONTHLY SUMMARY!A1:I") && (init.method || "GET") === "GET") {
      return json({ values: [
        ["MES", "INGRESO FRECUENTE", "INGRESO NO FRECUENTE", "TOTAL INGRESOS", "GASTO FRECUENTE", "GASTO NO FRECUENTE", "TOTAL GASTOS", "NETO MENSUAL", "NETO SIN ING FRECUENTE"],
        ["January 2026"],
        ["March 2026"],
      ] });
    }
    if (url.includes("fields=properties.locale")) return json({ properties: { locale: "en_US" } });
    return json({});
  });

  const result = await updateTransaction("token", "sheet", 5, {
    date: "2026-03-20",
    amount: "-25",
    detail: "Moved",
    type: "GASTO FRECUENTE",
    createdAt: "",
    tags: [],
  });

  assert.notEqual(result.rowId, 5);
  const deletes = requests.filter(({ body }) => body?.requests?.[0]?.deleteDimension);
  assert.ok(deletes.length > 0, "should delete old row");
});

test("deleteTransaction removes the row from the sheet", async (t) => {
  const requests = [];
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method: init.method || "GET", body });
    if (url.includes("fields=sheets.properties(sheetId,title)")) {
      return json({ sheets: [{ properties: { sheetId: 3, title: "INCOME AND EXPENSES" } }] });
    }
    return json({});
  });

  await deleteTransaction("token", "sheet", 5);

  const deleteReq = requests.find(({ body }) => body?.requests?.[0]?.deleteDimension);
  assert.ok(deleteReq, "should issue deleteDimension request");
  assert.equal(deleteReq.body.requests[0].deleteDimension.range.startIndex, 4);
  assert.equal(deleteReq.body.requests[0].deleteDimension.range.endIndex, 5);
});

test("moveTransaction swaps adjacent rows", async (t) => {
  const requests = [];
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method: init.method || "GET", body });
    if (url.includes("INCOME AND EXPENSES!A3:F3") && (init.method || "GET") === "GET") {
      return json({ values: [["2026-01-15", "-10", "Row3", "GASTO FRECUENTE", "", ""]] });
    }
    if (url.includes("INCOME AND EXPENSES!A4:F4") && (init.method || "GET") === "GET") {
      return json({ values: [["2026-01-20", "-20", "Row4", "GASTO NO FRECUENTE", "", ""]] });
    }
    if (url.includes("INCOME AND EXPENSES!F1")) return json({ values: [["ETIQUETAS"]] });
    return json({});
  });

  await moveTransaction("token", "sheet", 3, "down");

  const writes = requests.filter(({ url, method }) => method === "PUT" && url.includes("INCOME AND EXPENSES!A"));
  assert.equal(writes.length, 2);
  const write3 = writes.find(({ url }) => url.includes("!A3:F3"));
  const write4 = writes.find(({ url }) => url.includes("!A4:F4"));
  assert.equal(write3.body.values[0][2], "Row4");
  assert.equal(write4.body.values[0][2], "Row3");
});

test("moveTransaction does nothing when target row is below 2", async (t) => {
  const requests = [];
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method: init.method || "GET", body });
    if (url.includes("INCOME AND EXPENSES!A2:F2") && (init.method || "GET") === "GET") {
      return json({ values: [["2026-01-15", "-10", "Row2", "GASTO FRECUENTE", "", ""]] });
    }
    return json({});
  });

  await moveTransaction("token", "sheet", 2, "up");

  const writes = requests.filter(({ method }) => method === "PUT");
  assert.equal(writes.length, 0);
});

test("moveTransaction does nothing when a row is empty", async (t) => {
  const requests = [];
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method: init.method || "GET", body });
    if (url.includes("INCOME AND EXPENSES!A3:F3") && (init.method || "GET") === "GET") {
      return json({ values: [["2026-01-15", "-10", "Row3", "GASTO FRECUENTE", "", ""]] });
    }
    if (url.includes("INCOME AND EXPENSES!A4:F4") && (init.method || "GET") === "GET") {
      return json({ values: [] });
    }
    return json({});
  });

  await moveTransaction("token", "sheet", 3, "down");

  const writes = requests.filter(({ method }) => method === "PUT");
  assert.equal(writes.length, 0);
});

test("readTransactions uses English SUMIFS formulas when locale is en_US", async (t) => {
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    if (url.includes("valueRenderOption=FORMULA")) {
      return json({ values: [
        ["Date", "Amount", "Detail", "Type", "Created at", "Tags"],
      ] });
    }
    if (url.includes("INCOME AND EXPENSES!F1")) return json({ values: [["Tags"]] });
    if (url.includes("fields=properties.locale")) return json({ properties: { locale: "en_US" } });
    return json({ values: [
      ["Date", "Amount", "Detail", "Type", "Created at", "Tags"],
      ["2026-01-15", "50", "Lunch", "GASTO FRECUENTE", "", ""],
    ] });
  });

  const rows = await readTransactions("token", "sheet");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 50);
});

test("readTransactions handles numeric Excel-style dates", async (t) => {
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    if (url.includes("valueRenderOption=FORMULA")) {
      return json({ values: [
        ["Fecha", "Monto", "Detalle", "Tipo", "Hora", "Etiquetas"],
      ] });
    }
    if (url.includes("INCOME AND EXPENSES!F1")) return json({ values: [["ETIQUETAS"]] });
    if (url.includes("INCOME AND EXPENSES!A2:A")) return json({ values: [] });
    return json({ values: [
      ["Fecha", "Monto", "Detalle", "Tipo", "Hora de creación", "Etiquetas"],
      [46028, "100", "Numeric date", "GASTO FRECUENTE", "", ""],
    ] });
  });

  const rows = await readTransactions("token", "sheet");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 100);
});

test("readTransactions handles Month Year format dates", async (t) => {
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    if (url.includes("valueRenderOption=FORMULA")) {
      return json({ values: [
        ["Fecha", "Monto", "Detalle", "Tipo", "Hora", "Etiquetas"],
      ] });
    }
    if (url.includes("INCOME AND EXPENSES!F1")) return json({ values: [["ETIQUETAS"]] });
    if (url.includes("INCOME AND EXPENSES!A2:A")) return json({ values: [] });
    return json({ values: [
      ["Fecha", "Monto", "Detalle", "Tipo", "Hora de creación", "Etiquetas"],
      ["January 2026", "200", "MonthYear date", "GASTO FRECUENTE", "", ""],
    ] });
  });

  const rows = await readTransactions("token", "sheet");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 200);
});

test("findCompatibleSheets returns empty array when validation throws", async (t) => {
  installFetch(t, async (input) => {
    const url = decodeURIComponent(String(input));
    if (url.includes("drive/v3/files")) {
      return json({ files: [{ id: "file1", name: "Sheet1", modifiedTime: "2026-01-01" }] });
    }
    throw new Error("network failure");
  });

  const result = await findCompatibleSheets("token");
  assert.deepEqual(result, []);
});

test("findCompatibleSheets paginates through multiple pages", async (t) => {
  let pageCalls = 0;
  installFetch(t, async (input) => {
    const url = decodeURIComponent(String(input));
    if (url.includes("drive/v3/files")) {
      pageCalls++;
      if (pageCalls === 1) {
        return json({ files: [{ id: "f1", name: "S1" }], nextPageToken: "page2" });
      }
      return json({ files: [{ id: "f2", name: "S2" }] });
    }
    if (url.includes("sheets.googleapis.com")) {
      return json({ sheets: [{ properties: { title: "INCOME AND EXPENSES" } }] });
    }
    return json({ values: [["Fecha", "Monto", "Detalle", "Tipo"]] });
  });

  const result = await findCompatibleSheets("token");
  assert.ok(Array.isArray(result));
  assert.equal(pageCalls, 2);
});

test("removeTagFromAllRows cleans tag from column F and batch writes", async (t) => {
  const requests = [];
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    const method = init.method || "GET";
    requests.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
    if (url.includes("INCOME AND EXPENSES!F2:F") && method === "GET") {
      return json({ values: [["default-comida, custom-vivienda"], ["default-salud"], ["custom-vivienda"]] });
    }
    if (url.includes("values:batchUpdate")) return json({});
    return json({});
  });

  const { removeTagFromAllRows: removeTag } = await import("../src/api/googleWorkspace.ts");
  await removeTag("token", "sheet", "custom-vivienda");

  const batchCall = requests.find((r) => r.url.includes("values:batchUpdate"));
  assert.ok(batchCall, "should call batchUpdate");
  const data = batchCall.body.data;
  assert.equal(data.length, 2, "should update 2 rows that had the tag");
  assert.deepEqual(data[0].values, [["default-comida"]]);
  assert.deepEqual(data[1].values, [[""]]);
});

test("removeTagFromAllRows does nothing when tag not found", async (t) => {
  let batchCalled = false;
  installFetch(t, async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    if (url.includes("INCOME AND EXPENSES!F2:F")) {
      return json({ values: [["default-comida"], ["default-salud"]] });
    }
    if (url.includes("values:batchUpdate")) {
      batchCalled = true;
      return json({});
    }
    return json({});
  });

  const { removeTagFromAllRows: removeTag } = await import("../src/api/googleWorkspace.ts");
  await removeTag("token", "sheet", "custom-vivienda");
  assert.equal(batchCalled, false, "should not call batchUpdate when tag not found");
});

test("saveTransaction with ISO createdAt formats time correctly", async (t) => {
  const requests = [];
  installFetch(t, sharedTxHandlers(requests));

  await saveTransaction("token", "sheet", {
    date: "2026-01-15",
    amount: "-10",
    detail: "ISO date",
    type: "GASTO FRECUENTE",
    createdAt: "2026-01-15T14:30:00.000Z",
    tags: [],
  });

  const rowWrite = requests.find(({ url, method }) => method === "PUT" && url.includes("INCOME AND EXPENSES!A"));
  assert.ok(rowWrite);
  const createdAt = rowWrite.body.values[0][4];
  assert.ok(createdAt.includes(":"), "createdAt should contain time separator");
});

test("googleFetch retries on 5xx and succeeds", async (t) => {
  let calls = 0;
  installFetch(t, async () => {
    calls++;
    if (calls === 1) return new Response("server error", { status: 500 });
    return json({ files: [] });
  });

  const result = await findCompatibleSheets("token");
  assert.ok(Array.isArray(result));
  assert.equal(calls, 2);
});

test("googleFetch retries on 429 rate limit", async (t) => {
  let calls = 0;
  installFetch(t, async () => {
    calls++;
    if (calls === 1) return new Response("rate limited", { status: 429 });
    return json({ files: [] });
  });

  const result = await findCompatibleSheets("token");
  assert.ok(Array.isArray(result));
  assert.equal(calls, 2);
});

test("googleFetch does not retry on 400 client errors", async (t) => {
  let calls = 0;
  installFetch(t, async () => {
    calls++;
    return new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400, headers: { "content-type": "application/json" } });
  });

  await assert.rejects(
    () => findCompatibleSheets("token"),
    (err) => {
      assert.ok(err.message.includes("400"));
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("googleFetch throws after exhausting retries on 5xx", async (t) => {
  let calls = 0;
  installFetch(t, async () => {
    calls++;
    return new Response("persistent error", { status: 503 });
  });

  await assert.rejects(
    () => findCompatibleSheets("token"),
    (err) => {
      assert.ok(err.message.includes("503"));
      return true;
    },
  );
  assert.ok(calls >= 2, "should have retried before failing");
});

test("googleFetch handles network failures with retry", async (t) => {
  let calls = 0;
  installFetch(t, async () => {
    calls++;
    if (calls <= 1) throw new TypeError("Failed to fetch");
    return json({ files: [] });
  });

  const result = await findCompatibleSheets("token");
  assert.ok(Array.isArray(result));
  assert.equal(calls, 2);
});
