import { SheetCandidate, SummaryRow, Transaction, TransactionDraft } from "../types";
import {
  SHEET_NAMES,
  SUMMARY_HEADERS,
  TRANSACTION_HEADERS,
  buildTransactionFromDraft,
  formatDateToISO,
  getMonthYear,
  insertChronologically,
  parseSpanishDate,
} from "../domain/bucksLogic";

const DRIVE = "https://www.googleapis.com/drive/v3";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const HEADER_SCAN_ROWS = 12;

async function googleFetch<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google API ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

function valuesUrl(spreadsheetId: string, range: string) {
  return `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
}

function readValuesUrl(spreadsheetId: string, range: string) {
  return `${valuesUrl(spreadsheetId, range)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
}

function formulaValuesUrl(spreadsheetId: string, range: string) {
  return `${valuesUrl(spreadsheetId, range)}?valueRenderOption=FORMULA&dateTimeRenderOption=FORMATTED_STRING`;
}

export async function findCompatibleSheets(token: string) {
  const query = encodeURIComponent(`mimeType='${GOOGLE_SHEET_MIME}' and trashed=false`);
  const url = `${DRIVE}/files?q=${query}&pageSize=100&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime)`;
  const list = await googleFetch<{ files: SheetCandidate[] }>(token, url);
  const compatible: SheetCandidate[] = [];

  for (const file of list.files || []) {
    try {
      if (await validateSpreadsheetStructure(token, file.id)) compatible.push(file);
    } catch {
      // Ignore files the user cannot inspect or malformed spreadsheets.
    }
  }
  return compatible;
}

export async function validateSpreadsheetStructure(token: string, spreadsheetId: string) {
  const meta = await googleFetch<{ sheets?: { properties?: { title?: string } }[] }>(
    token,
    `${SHEETS}/${spreadsheetId}?fields=sheets.properties.title`,
  );
  const titles = new Set((meta.sheets || []).map((sheet) => sheet.properties?.title || ""));
  if (!titles.has(SHEET_NAMES.transactions) || !titles.has(SHEET_NAMES.summary)) return false;

  const ranges = [`${SHEET_NAMES.transactions}!A1:E${HEADER_SCAN_ROWS}`, `${SHEET_NAMES.summary}!A1:I${HEADER_SCAN_ROWS}`];
  const url = `${SHEETS}/${spreadsheetId}/values:batchGet?ranges=${ranges.map(encodeURIComponent).join("&ranges=")}`;
  const data = await googleFetch<{ valueRanges: { values?: string[][] }[] }>(token, url);
  const txHeaderRow = findHeaderIndex(data.valueRanges?.[0]?.values || [], TRANSACTION_HEADERS.slice(0, 4));
  const summaryHeaderRow = findHeaderIndex(data.valueRanges?.[1]?.values || [], SUMMARY_HEADERS);
  return txHeaderRow >= 0 && summaryHeaderRow >= 0;
}

function hasHeaders(actual: string[], expected: string[]) {
  const normalized = actual.map(normalizeHeader);
  return expected.every((header, index) => headerMatches(normalized[index], header));
}

function findHeaderIndex(rows: unknown[][], expected: string[]) {
  return rows.findIndex((row) => hasHeaders(row.map(String), expected));
}

function normalizeHeader(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function compactHeader(value: unknown) {
  return normalizeHeader(value).replace(/[^A-Z0-9]/g, "");
}

function headerMatches(actual: string, expected: string) {
  const actualCompact = compactHeader(actual);
  const allowed = headerAliases(expected).map(compactHeader);
  return allowed.includes(actualCompact);
}

function headerAliases(expected: string) {
  const base = normalizeHeader(expected);
  const compactBase = compactHeader(base);
  if (compactBase.startsWith("HORADECREACI")) return ["HORA DE CREACION", "HORA CREACION"];
  const aliases: Record<string, string[]> = {
    FECHA: ["FECHA"],
    MONTO: ["MONTO"],
    DETALLE: ["DETALLE"],
    TIPO: ["TIPO", "TIPO DE GASTO"],
    "HORA DE CREACION": ["HORA DE CREACION", "HORA CREACION"],
    MES: ["MES", "MES Y ANO", "MES Y AÑO"],
    "INGRESO FRECUENTE": ["INGRESO FRECUENTE"],
    "INGRESO NO FRECUENTE": ["INGRESO NO FRECUENTE"],
    "TOTAL INGRESOS": ["TOTAL INGRESOS"],
    "GASTO FRECUENTE": ["GASTO FRECUENTE"],
    "GASTO NO FRECUENTE": ["GASTO NO FRECUENTE"],
    "TOTAL GASTOS": ["TOTAL GASTOS"],
    "NETO MENSUAL": ["NETO MENSUAL"],
    "NETO SIN ING FRECUENTE": ["NETO SIN ING FRECUENTE", "TOTAL SIN INGRESO FRECUENTE", "TOTAL SIN ING FRECUENTE"],
  };
  return aliases[base] || [base];
}

export async function createBucksSpreadsheet(token: string) {
  const created = await googleFetch<{ spreadsheetId: string }>(token, SHEETS, {
    method: "POST",
    body: JSON.stringify({
      properties: { title: SHEET_NAMES.transactions },
      sheets: [
        { properties: { title: SHEET_NAMES.transactions } },
        { properties: { title: SHEET_NAMES.summary } },
      ],
    }),
  });
  await initializeSpreadsheet(token, created.spreadsheetId);
  return created.spreadsheetId;
}

export async function initializeSpreadsheet(token: string, spreadsheetId: string) {
  const currentMonth = new Date();
  const firstDay = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-01`;
  await googleFetch(token, `${SHEETS}/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${SHEET_NAMES.transactions}!A1:E1`, values: [TRANSACTION_HEADERS] },
        { range: `${SHEET_NAMES.summary}!A1:I2`, values: [SUMMARY_HEADERS, buildSummaryRowFormulas(2, firstDay)] },
      ],
    }),
  });
  await formatSpreadsheet(token, spreadsheetId);
}

export async function readTransactions(token: string, spreadsheetId: string) {
  const range = `${SHEET_NAMES.transactions}!A1:E`;
  const [data, formulaData] = await Promise.all([
    googleFetch<{ values?: unknown[][] }>(token, readValuesUrl(spreadsheetId, range)),
    googleFetch<{ values?: unknown[][] }>(token, formulaValuesUrl(spreadsheetId, range)),
  ]);
  const rows = data.values || [];
  const headerIndex = Math.max(0, findHeaderIndex(rows, TRANSACTION_HEADERS.slice(0, 4)));
  return (data.values || [])
    .map((row, index): Transaction | null => {
      if (index <= headerIndex) return null;
      const date = parseSheetDate(row[0]);
      if (!date) return null;
      const type = normalizeType(String(row[3] || ""));
      return {
        rowId: index + 1,
        date: formatDateLabel(date),
        rawDate: date.toISOString(),
        amount: parseNumber(row[1]),
        detail: String(row[2] || ""),
        formula: parseAmountFormula(formulaData.values?.[index]?.[1], type),
        type,
        createdAt: parseCreatedAt(row[4]),
      };
    })
    .filter(Boolean) as Transaction[];
}

export async function readSummaries(token: string, spreadsheetId: string) {
  const data = await googleFetch<{ values?: unknown[][] }>(token, readValuesUrl(spreadsheetId, `${SHEET_NAMES.summary}!A1:I`));
  const rows = data.values || [];
  const headerIndex = Math.max(0, findHeaderIndex(rows, SUMMARY_HEADERS));
  return rows
    .map((row, index): SummaryRow | null => {
      if (index <= headerIndex) return null;
      const date = parseSheetDate(row[0]);
      if (!date) return null;
      return {
        monthYear: getMonthYear(date),
        freqIncome: parseNumber(row[1]),
        nonFreqIncome: parseNumber(row[2]),
        totalIncome: parseNumber(row[3]),
        freqExpense: parseNumber(row[4]),
        nonFreqExpense: parseNumber(row[5]),
        totalExpense: parseNumber(row[6]),
        netMonthly: parseNumber(row[7]),
        netNoFreq: parseNumber(row[8]),
      };
    })
    .filter(Boolean) as SummaryRow[];
}

export async function saveTransaction(token: string, spreadsheetId: string, draft: TransactionDraft) {
  const existing = await readTransactions(token, spreadsheetId);
  const tx = buildTransactionFromDraft(draft, existing.length + 2);
  const ordered = insertChronologically(existing, tx);
  await rewriteTransactions(token, spreadsheetId, ordered);
  await ensureMonthlySummaryRow(token, spreadsheetId, new Date(tx.rawDate));
  return ordered.find((item) => item.createdAt === tx.createdAt && item.detail === tx.detail) || tx;
}

export async function updateTransaction(token: string, spreadsheetId: string, rowId: number, draft: TransactionDraft) {
  const existing = await readTransactions(token, spreadsheetId);
  const updated = buildTransactionFromDraft(draft, rowId);
  const next = insertChronologically(existing.filter((tx) => tx.rowId !== rowId), updated);
  await rewriteTransactions(token, spreadsheetId, next);
  await ensureMonthlySummaryRow(token, spreadsheetId, new Date(updated.rawDate));
  return next.find((tx) => tx.createdAt === updated.createdAt && tx.detail === updated.detail) || updated;
}

export async function deleteTransaction(token: string, spreadsheetId: string, rowId: number) {
  const existing = await readTransactions(token, spreadsheetId);
  const next = existing.filter((tx) => tx.rowId !== rowId).map((tx, index) => ({ ...tx, rowId: index + 2 }));
  await rewriteTransactions(token, spreadsheetId, next);
}

export async function moveTransaction(token: string, spreadsheetId: string, rowId: number, direction: "up" | "down") {
  const existing = await readTransactions(token, spreadsheetId);
  const index = existing.findIndex((tx) => tx.rowId === rowId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= existing.length) return;
  const next = [...existing];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  await rewriteTransactions(token, spreadsheetId, next.map((tx, nextIndex) => ({ ...tx, rowId: nextIndex + 2 })));
}

export async function rewriteTransactions(token: string, spreadsheetId: string, transactions: Transaction[]) {
  await googleFetch(token, valuesUrl(spreadsheetId, `${SHEET_NAMES.transactions}!A2:E`), { method: "DELETE" });
  if (!transactions.length) return;
  await googleFetch(token, `${valuesUrl(spreadsheetId, `${SHEET_NAMES.transactions}!A2:E`)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({
      values: transactions.map((tx) => [
        formatDateToISO(tx.rawDate),
        formatAmountForSheet(tx),
        tx.detail,
        tx.type,
        tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString("es-PE", { hour12: false }) : "",
      ]),
    }),
  });
}

function formatAmountForSheet(tx: Transaction) {
  const expression = sanitizeAmountExpression(tx.formula || "");
  if (!expression) return tx.amount;
  return tx.type.startsWith("GASTO") ? `=-ABS(${expression})` : `=ABS(${expression})`;
}

function sanitizeAmountExpression(value: string) {
  return String(value || "")
    .trim()
    .replace(/^=/, "")
    .replace(/[^0-9+\-*/().\s]/g, "")
    .trim();
}

function parseAmountFormula(value: unknown, type: Transaction["type"]) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("=")) return "";
  let expression = raw.replace(/^=/, "").trim();
  expression = unwrapAmountFormula(expression, type);
  return sanitizeAmountExpression(expression);
}

function unwrapAmountFormula(expression: string, type: Transaction["type"]) {
  const trimmed = expression.trim();
  const absMatch = trimmed.match(/^ABS\((.*)\)$/i);
  if (absMatch) return absMatch[1];
  const negativeAbsMatch = trimmed.match(/^-ABS\((.*)\)$/i);
  if (negativeAbsMatch) return negativeAbsMatch[1];
  const negativeWrappedMatch = trimmed.match(/^-\((.*)\)$/);
  if (type.startsWith("GASTO") && negativeWrappedMatch) return negativeWrappedMatch[1];
  return trimmed;
}

export async function updateFreqIncome(token: string, spreadsheetId: string, monthYear: string, amount: number) {
  const rowNumber = await ensureMonthlySummaryRowByMonthYear(token, spreadsheetId, monthYear);
  const range = `${SHEET_NAMES.summary}!B${rowNumber}`;
  await googleFetch(token, `${valuesUrl(spreadsheetId, range)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [[amount]] }),
  });
}

export async function ensureMonthlySummaryRow(token: string, spreadsheetId: string, date: Date) {
  return ensureMonthlySummaryRowByDate(token, spreadsheetId, date);
}

async function ensureMonthlySummaryRowByMonthYear(token: string, spreadsheetId: string, monthYear: string) {
  const [monthName, year] = monthYear.split(" ");
  const month = [
    "ENERO",
    "FEBRERO",
    "MARZO",
    "ABRIL",
    "MAYO",
    "JUNIO",
    "JULIO",
    "AGOSTO",
    "SEPTIEMBRE",
    "OCTUBRE",
    "NOVIEMBRE",
    "DICIEMBRE",
  ].indexOf(normalizeHeader(monthName));
  return ensureMonthlySummaryRowByDate(token, spreadsheetId, new Date(Number(year), Math.max(0, month), 1));
}

async function ensureMonthlySummaryRowByDate(token: string, spreadsheetId: string, date: Date) {
  const data = await googleFetch<{ values?: unknown[][] }>(token, valuesUrl(spreadsheetId, `${SHEET_NAMES.summary}!A1:I`));
  const rows = data.values || [];
  const headerIndex = Math.max(0, findHeaderIndex(rows, SUMMARY_HEADERS));
  const monthYear = getMonthYear(date);
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const rowDate = parseSheetDate(rows[i]?.[0]);
    if (rowDate && getMonthYear(rowDate) === monthYear) return i + 1;
  }
  const rowNumber = Math.max(rows.length + 1, headerIndex + 2);
  const firstDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  await googleFetch(token, `${valuesUrl(spreadsheetId, `${SHEET_NAMES.summary}!A${rowNumber}:I${rowNumber}`)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [buildSummaryRowFormulas(rowNumber, firstDay)] }),
  });
  return rowNumber;
}

function buildSummaryRowFormulas(rowNumber: number, firstDay: string) {
  return [
    firstDay,
    0,
    `=SUMIFS('${SHEET_NAMES.transactions}'!$B:$B,'${SHEET_NAMES.transactions}'!$A:$A,">="&$A${rowNumber},'${SHEET_NAMES.transactions}'!$A:$A,"<="&EOMONTH($A${rowNumber},0),'${SHEET_NAMES.transactions}'!$D:$D,"INGRESO NO FRECUENTE")`,
    `=B${rowNumber}+C${rowNumber}`,
    `=SUMIFS('${SHEET_NAMES.transactions}'!$B:$B,'${SHEET_NAMES.transactions}'!$A:$A,">="&$A${rowNumber},'${SHEET_NAMES.transactions}'!$A:$A,"<="&EOMONTH($A${rowNumber},0),'${SHEET_NAMES.transactions}'!$D:$D,"GASTO FRECUENTE")`,
    `=SUMIFS('${SHEET_NAMES.transactions}'!$B:$B,'${SHEET_NAMES.transactions}'!$A:$A,">="&$A${rowNumber},'${SHEET_NAMES.transactions}'!$A:$A,"<="&EOMONTH($A${rowNumber},0),'${SHEET_NAMES.transactions}'!$D:$D,"GASTO NO FRECUENTE")`,
    `=E${rowNumber}+F${rowNumber}`,
    `=D${rowNumber}+G${rowNumber}`,
    `=H${rowNumber}-B${rowNumber}`,
  ];
}

async function formatSpreadsheet(token: string, spreadsheetId: string) {
  const meta = await googleFetch<{ sheets?: { properties?: { sheetId?: number; title?: string } }[] }>(
    token,
    `${SHEETS}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
  );
  const txSheetId = meta.sheets?.find((sheet) => sheet.properties?.title === SHEET_NAMES.transactions)?.properties?.sheetId;
  const summarySheetId = meta.sheets?.find((sheet) => sheet.properties?.title === SHEET_NAMES.summary)?.properties?.sheetId;
  const requests = [txSheetId, summarySheetId]
    .filter((sheetId): sheetId is number => typeof sheetId === "number")
    .flatMap((sheetId) => [
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true },
              horizontalAlignment: "CENTER",
              backgroundColor: { red: 0.78, green: 1, blue: 0 },
            },
          },
          fields: "userEnteredFormat(textFormat,horizontalAlignment,backgroundColor)",
        },
      },
      { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    ]);
  if (requests.length) {
    await googleFetch(token, `${SHEETS}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }
}

function parseSheetDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(value));
    return epoch;
  }
  const asString = String(value);
  const spanish = parseSpanishDate(asString);
  if (spanish) return spanish;
  const numeric = parseNumericDate(asString);
  if (numeric) return numeric;
  const monthYear = parseMonthYear(asString);
  if (monthYear) return monthYear;
  const date = new Date(`${asString}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNumericDate(value: string) {
  const match = value.trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+.*)?$/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  let year = Number(match[3]);
  if (!Number.isFinite(first) || !Number.isFinite(second) || !Number.isFinite(year)) return null;
  if (year < 100) year += 2000;

  const day = first > 12 ? first : second > 12 ? second : first;
  const month = first > 12 ? second : second > 12 ? first : second;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function parseMonthYear(value: string) {
  const clean = normalizeHeader(value);
  const months = [
    ["ENERO", "ENE"],
    ["FEBRERO", "FEB"],
    ["MARZO", "MAR"],
    ["ABRIL", "ABR"],
    ["MAYO", "MAY"],
    ["JUNIO", "JUN"],
    ["JULIO", "JUL"],
    ["AGOSTO", "AGO"],
    ["SEPTIEMBRE", "SEP", "SET"],
    ["OCTUBRE", "OCT"],
    ["NOVIEMBRE", "NOV"],
    ["DICIEMBRE", "DIC"],
  ];
  const month = months.findIndex((names) => names.some((name) => clean.startsWith(name)));
  const yearMatch = clean.match(/\b(20\d{2}|19\d{2})\b/);
  if (month < 0 || !yearMatch) return null;
  return new Date(Number(yearMatch[1]), month, 1);
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value || "")
    .replace(/\s/g, "")
    .replace(/S\/|\$/gi, "")
    .trim();
  const clean = normalizeNumberString(raw);
  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}

function normalizeNumberString(value: string) {
  const hasComma = value.includes(",");
  const hasDot = value.includes(".");
  if (hasComma && hasDot) {
    return value.lastIndexOf(",") > value.lastIndexOf(".")
      ? value.replace(/\./g, "").replace(",", ".")
      : value.replace(/,/g, "");
  }
  if (hasComma) {
    const [integer = "", decimal = ""] = value.split(",");
    if (decimal.length > 0 && decimal.length <= 2) return `${integer.replace(/\./g, "")}.${decimal}`;
    return value.replace(/,/g, "");
  }
  return value;
}

function formatDateLabel(date: Date) {
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${String(date.getDate()).padStart(2, "0")}-${months[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;
}

function parseCreatedAt(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function normalizeType(value: string): Transaction["type"] {
  const upper = value.toUpperCase();
  if (upper === "INGRESO FRECUENTE") return "INGRESO FRECUENTE";
  if (upper === "INGRESO NO FRECUENTE") return "INGRESO NO FRECUENTE";
  if (upper === "GASTO FRECUENTE") return "GASTO FRECUENTE";
  return "GASTO NO FRECUENTE";
}
