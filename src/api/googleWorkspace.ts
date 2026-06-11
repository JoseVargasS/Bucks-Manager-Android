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
  const ranges = [`${SHEET_NAMES.transactions}!A1:E1`, `${SHEET_NAMES.summary}!A1:I1`];
  const url = `${SHEETS}/${spreadsheetId}/values:batchGet?ranges=${ranges.map(encodeURIComponent).join("&ranges=")}`;
  const data = await googleFetch<{ valueRanges: { values?: string[][] }[] }>(token, url);
  const txHeaders = data.valueRanges?.[0]?.values?.[0] || [];
  const summaryHeaders = data.valueRanges?.[1]?.values?.[0] || [];
  return hasHeaders(txHeaders, TRANSACTION_HEADERS.slice(0, 4)) && hasHeaders(summaryHeaders, SUMMARY_HEADERS);
}

function hasHeaders(actual: string[], expected: string[]) {
  const normalized = actual.map((h) => String(h).trim().toUpperCase());
  return expected.every((header, index) => normalized[index] === header.toUpperCase());
}

export async function createBucksSpreadsheet(token: string) {
  const created = await googleFetch<{ spreadsheetId: string }>(token, SHEETS, {
    method: "POST",
    body: JSON.stringify({
      properties: { title: "Bucks Manager" },
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
  await googleFetch(token, `${SHEETS}/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${SHEET_NAMES.transactions}!A1:E1`, values: [TRANSACTION_HEADERS] },
        { range: `${SHEET_NAMES.summary}!A1:I1`, values: [SUMMARY_HEADERS] },
      ],
    }),
  });
}

export async function readTransactions(token: string, spreadsheetId: string) {
  const data = await googleFetch<{ values?: unknown[][] }>(token, valuesUrl(spreadsheetId, `${SHEET_NAMES.transactions}!A2:E`));
  return (data.values || [])
    .map((row, index): Transaction | null => {
      const date = parseSheetDate(row[0]);
      if (!date) return null;
      return {
        rowId: index + 2,
        date: formatDateLabel(date),
        rawDate: date.toISOString(),
        amount: Number(row[1]) || 0,
        detail: String(row[2] || ""),
        type: normalizeType(String(row[3] || "")),
        createdAt: parseCreatedAt(row[4]),
      };
    })
    .filter(Boolean) as Transaction[];
}

export async function readSummaries(token: string, spreadsheetId: string) {
  const data = await googleFetch<{ values?: unknown[][] }>(token, valuesUrl(spreadsheetId, `${SHEET_NAMES.summary}!A2:I`));
  return (data.values || [])
    .map((row): SummaryRow | null => {
      const date = parseSheetDate(row[0]);
      if (!date) return null;
      return {
        monthYear: getMonthYear(date),
        freqIncome: Number(row[1]) || 0,
        nonFreqIncome: Number(row[2]) || 0,
        totalIncome: Number(row[3]) || 0,
        freqExpense: Number(row[4]) || 0,
        nonFreqExpense: Number(row[5]) || 0,
        totalExpense: Number(row[6]) || 0,
        netMonthly: Number(row[7]) || 0,
        netNoFreq: Number(row[8]) || 0,
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

export async function rewriteTransactions(token: string, spreadsheetId: string, transactions: Transaction[]) {
  await googleFetch(token, valuesUrl(spreadsheetId, `${SHEET_NAMES.transactions}!A2:E`), { method: "DELETE" });
  if (!transactions.length) return;
  await googleFetch(token, `${valuesUrl(spreadsheetId, `${SHEET_NAMES.transactions}!A2:E`)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({
      values: transactions.map((tx) => [
        formatDateToISO(tx.rawDate),
        tx.formula || tx.amount,
        tx.detail,
        tx.type,
        tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString("es-PE", { hour12: false }) : "",
      ]),
    }),
  });
}

export async function updateFreqIncome(token: string, spreadsheetId: string, monthYear: string, amount: number) {
  const summaries = await readSummaries(token, spreadsheetId);
  const rowIndex = summaries.findIndex((row) => row.monthYear === monthYear);
  if (rowIndex < 0) throw new Error("Mes no encontrado en el resumen");
  const range = `${SHEET_NAMES.summary}!B${rowIndex + 2}`;
  await googleFetch(token, `${valuesUrl(spreadsheetId, range)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [[amount]] }),
  });
}

export async function ensureMonthlySummaryRow(token: string, spreadsheetId: string, date: Date) {
  const summaries = await readSummaries(token, spreadsheetId);
  const monthYear = getMonthYear(date);
  if (summaries.some((row) => row.monthYear === monthYear)) return;
  const rowNumber = summaries.length + 2;
  const firstDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  const formulas = [
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
  await googleFetch(token, `${valuesUrl(spreadsheetId, `${SHEET_NAMES.summary}!A${rowNumber}:I${rowNumber}`)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [formulas] }),
  });
}

function parseSheetDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const asString = String(value);
  const spanish = parseSpanishDate(asString);
  if (spanish) return spanish;
  const date = new Date(`${asString}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
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
