import type {
  SheetCandidate,
  SummaryRow,
  Transaction,
  TransactionDraft,
} from "../types";
import {
  DEFAULT_SPREADSHEET_LOCALE,
  SHEET_NAMES,
  TRANSACTION_TYPES,
  buildTransactionFromDraft,
  formatDateForSheet,
  formatDateToISO,
  getMonthYear,
  parseCreatedAtMs,
} from "../domain/bucksLogic";
import {
  findHeaderIndex,
  normalizeHeader,
  normalizeType,
  parseCreatedAt,
  parseNumber,
  parseSheetDate,
  parseTags,
} from "./sheetFormats";

const DRIVE = "https://www.googleapis.com/drive/v3";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const HEADER_SCAN_ROWS = 12;
const SHEET_SCAN_BATCH_SIZE = 5;
const TAG_SEPARATOR = ", ";
const TAG_HEADER = "ETIQUETAS";
const tagsColumnReady = new Set<string>();

const SUMMARY_HEADERS = [
  "MES",
  "INGRESO FRECUENTE",
  "INGRESO NO FRECUENTE",
  "TOTAL INGRESOS",
  "GASTO FRECUENTE",
  "GASTO NO FRECUENTE",
  "TOTAL GASTOS",
  "NETO MENSUAL",
  "NETO SIN ING FRECUENTE",
];

const TRANSACTION_HEADERS = [
  "Fecha",
  "Monto",
  "Detalle",
  "Tipo",
  "HORA DE CREACIÓN",
  "Etiquetas",
];

type FormulaDialect = { sumifs: string; eomonth: string; sep: string };

// --- Single-row operation helpers (match GAS insertRecordChronologically / editTransaction / deleteRow) ---

async function getTransactionSheetId(token: string, spreadsheetId: string) {
  const meta = await googleFetch<{
    sheets?: { properties?: { sheetId?: number; title?: string } }[];
  }>(
    token,
    `${SHEETS}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
  );
  const sheetId = meta.sheets?.find(
    (s) => s.properties?.title === SHEET_NAMES.transactions,
  )?.properties?.sheetId;
  if (sheetId == null)
    throw new Error("No se encontro la hoja de transacciones");
  return sheetId;
}

function transactionRowFormatRequests(sheetId: number, rowIndex: number) {
  const blackBorder = {
    style: "SOLID",
    width: 1,
    color: { red: 0, green: 0, blue: 0 },
  };
  return [
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: rowIndex,
          endRowIndex: rowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: 6,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { fontFamily: "Lexend", fontSize: 10 },
          },
        },
        fields: "userEnteredFormat.textFormat",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: rowIndex,
          endRowIndex: rowIndex + 1,
          startColumnIndex: 3,
          endColumnIndex: 5,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { fontFamily: "Roboto", fontSize: 10 },
          },
        },
        fields: "userEnteredFormat.textFormat",
      },
    },
    {
      updateBorders: {
        range: {
          sheetId,
          startRowIndex: rowIndex,
          endRowIndex: rowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: 6,
        },
        innerVertical: blackBorder,
        right: blackBorder,
      },
    },
    {
      updateBorders: {
        range: {
          sheetId,
          startRowIndex: rowIndex,
          endRowIndex: rowIndex + 1,
          startColumnIndex: 4,
          endColumnIndex: 5,
        },
        right: blackBorder,
      },
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "ROWS",
          startIndex: rowIndex,
          endIndex: rowIndex + 1,
        },
        properties: { pixelSize: 20 },
        fields: "pixelSize",
      },
    },
  ];
}

async function insertBlankRow(
  token: string,
  spreadsheetId: string,
  sheetId: number,
  rowNumber: number,
) {
  const rowIndex = rowNumber - 1;
  await googleFetch(token, `${SHEETS}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          insertDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
            inheritFromBefore: rowNumber > 2,
          },
        },
        ...transactionRowFormatRequests(sheetId, rowIndex),
      ],
    }),
  });
}

async function deleteSheetRow(
  token: string,
  spreadsheetId: string,
  sheetId: number,
  rowNumber: number,
) {
  await googleFetch(token, `${SHEETS}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    }),
  });
}

function buildTransactionRow(tx: Transaction) {
  return [
    formatDateToISO(tx.rawDate),
    formatAmountForSheet(tx),
    tx.detail,
    tx.type,
    formatCreatedAtForSheet(tx.createdAt),
    (tx.tags || []).join(TAG_SEPARATOR),
  ];
}

async function writeRow(
  token: string,
  spreadsheetId: string,
  rowNumber: number,
  values: unknown[],
) {
  await ensureTransactionTagsColumn(token, spreadsheetId);
  const range = `${SHEET_NAMES.transactions}!A${rowNumber}:F${rowNumber}`;
  await googleFetch(
    token,
    `${valuesUrl(spreadsheetId, range)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      body: JSON.stringify({ values: [values] }),
    },
  );
}

async function readSingleRow(
  token: string,
  spreadsheetId: string,
  rowNumber: number,
) {
  const range = `${SHEET_NAMES.transactions}!A${rowNumber}:F${rowNumber}`;
  const data = await googleFetch<{ values?: unknown[][] }>(
    token,
    readValuesUrl(spreadsheetId, range),
  );
  return data.values?.[0] || [];
}

async function ensureTransactionTagsColumn(
  token: string,
  spreadsheetId: string,
  knownHeader?: unknown,
) {
  if (tagsColumnReady.has(spreadsheetId)) return;
  let header = knownHeader;
  if (header === undefined) {
    const data = await googleFetch<{ values?: unknown[][] }>(
      token,
      readValuesUrl(spreadsheetId, `${SHEET_NAMES.transactions}!F1`),
    );
    header = data.values?.[0]?.[0];
  }
  if (normalizeHeader(header) === TAG_HEADER) {
    tagsColumnReady.add(spreadsheetId);
    return;
  }
  const sheetId = await getTransactionSheetId(token, spreadsheetId);
  await googleFetch(
    token,
    `${valuesUrl(spreadsheetId, `${SHEET_NAMES.transactions}!F1`)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      body: JSON.stringify({ values: [[TAG_HEADER]] }),
    },
  );
  await googleFetch(token, `${SHEETS}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          copyPaste: {
            source: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 4,
              endColumnIndex: 5,
            },
            destination: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 5,
              endColumnIndex: 6,
            },
            pasteType: "PASTE_FORMAT",
          },
        },
        {
          copyPaste: {
            source: {
              sheetId,
              startRowIndex: 1,
              startColumnIndex: 2,
              endColumnIndex: 3,
            },
            destination: {
              sheetId,
              startRowIndex: 1,
              startColumnIndex: 5,
              endColumnIndex: 6,
            },
            pasteType: "PASTE_FORMAT",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startColumnIndex: 5, endColumnIndex: 6 },
            cell: {
              userEnteredFormat: {
                wrapStrategy: "CLIP",
                verticalAlignment: "MIDDLE",
              },
            },
            fields: "userEnteredFormat(wrapStrategy,verticalAlignment)",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 5,
              endIndex: 6,
            },
            properties: { pixelSize: 150 },
            fields: "pixelSize",
          },
        },
      ],
    }),
  });
  await normalizeExistingTagCells(token, spreadsheetId);
  tagsColumnReady.add(spreadsheetId);
}

async function normalizeExistingTagCells(token: string, spreadsheetId: string) {
  const range = `${SHEET_NAMES.transactions}!F2:F`;
  const data = await googleFetch<{ values?: unknown[][] }>(
    token,
    readValuesUrl(spreadsheetId, range),
  );
  const rows = data.values || [];
  if (
    !rows.some(
      (row) =>
        String(row[0] || "").includes(",") ||
        String(row[0] || "").includes("\n"),
    )
  )
    return;
  await googleFetch(
    token,
    `${valuesUrl(spreadsheetId, `${SHEET_NAMES.transactions}!F2:F${rows.length + 1}`)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      body: JSON.stringify({
        values: rows.map((row) => [parseTags(row[0]).join(TAG_SEPARATOR)]),
      }),
    },
  );
}

async function findChronologicalInsertionRow(
  token: string,
  spreadsheetId: string,
  dateObj: Date,
) {
  const range = `${SHEET_NAMES.transactions}!A2:A`;
  try {
    const data = await googleFetch<{ values?: unknown[][] }>(
      token,
      readValuesUrl(spreadsheetId, range),
    );
    const rows = data.values || [];
    const targetMs = new Date(
      dateObj.getFullYear(),
      dateObj.getMonth(),
      dateObj.getDate(),
    ).getTime();
    for (let i = 0; i < rows.length; i += 1) {
      const rowDate = parseSheetDate(rows[i]?.[0]);
      if (rowDate) {
        const rowMs = new Date(
          rowDate.getFullYear(),
          rowDate.getMonth(),
          rowDate.getDate(),
        ).getTime();
        if (rowMs > targetMs) return i + 2;
      }
    }
    return rows.length + 2;
  } catch {
    return 2;
  }
}

// ---

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 400;

function isTransientError(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function googleFetch<T>(
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const isMutation = method !== "GET" && method !== "HEAD";
  const maxAttempts = isMutation ? MAX_RETRIES + 1 : 2;

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
    }
    try {
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
        const message = body.trim().startsWith("<")
          ? "Google devolvio una pagina HTML en vez de JSON. Revisa que la URL de la API sea valida."
          : body;
        const err = new Error(`Google API ${res.status}: ${message}`);
        if (!isTransientError(res.status) || attempt === maxAttempts - 1) throw err;
        lastError = err;
        continue;
      }
      return (await res.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Google API")) {
        throw error;
      }
      if (attempt === maxAttempts - 1) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError!;
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
  const query = encodeURIComponent(
    `mimeType='${GOOGLE_SHEET_MIME}' and trashed=false`,
  );
  const compatible: SheetCandidate[] = [];
  let pageToken: string | undefined;

  do {
    const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const url = `${DRIVE}/files?q=${query}&pageSize=100&orderBy=modifiedTime desc&fields=nextPageToken,files(id,name,modifiedTime)${tokenParam}`;
    const list = await googleFetch<{ files?: SheetCandidate[]; nextPageToken?: string }>(token, url);
    pageToken = list.nextPageToken;
    const files = list.files || [];

    for (let index = 0; index < files.length; index += SHEET_SCAN_BATCH_SIZE) {
      const batch = await Promise.all(
        files.slice(index, index + SHEET_SCAN_BATCH_SIZE).map(async (file) => {
          try {
            return (await validateSpreadsheetStructure(token, file.id))
              ? file
              : null;
          } catch {
            return null;
          }
        }),
      );
      compatible.push(
        ...batch.filter((file): file is SheetCandidate => file !== null),
      );
    }
  } while (pageToken);
  return compatible;
}

async function validateSpreadsheetStructure(
  token: string,
  spreadsheetId: string,
) {
  const meta = await googleFetch<{
    sheets?: { properties?: { title?: string } }[];
  }>(token, `${SHEETS}/${spreadsheetId}?fields=sheets.properties.title`);
  const titles = new Set(
    (meta.sheets || []).map((sheet) => sheet.properties?.title || ""),
  );
  if (!titles.has(SHEET_NAMES.transactions) || !titles.has(SHEET_NAMES.summary))
    return false;

  const ranges = [
    `${SHEET_NAMES.transactions}!A1:F${HEADER_SCAN_ROWS}`,
    `${SHEET_NAMES.summary}!A1:I${HEADER_SCAN_ROWS}`,
  ];
  const url = `${SHEETS}/${spreadsheetId}/values:batchGet?ranges=${ranges.map(encodeURIComponent).join("&ranges=")}`;
  const data = await googleFetch<{ valueRanges: { values?: string[][] }[] }>(
    token,
    url,
  );
  const txHeaderRow = findHeaderIndex(
    data.valueRanges?.[0]?.values || [],
    TRANSACTION_HEADERS.slice(0, 4),
  );
  const summaryHeaderRow = findHeaderIndex(
    data.valueRanges?.[1]?.values || [],
    SUMMARY_HEADERS,
  );
  return txHeaderRow >= 0 && summaryHeaderRow >= 0;
}

export async function createBucksSpreadsheet(token: string) {
  const created = await googleFetch<{ spreadsheetId: string }>(token, SHEETS, {
    method: "POST",
    body: JSON.stringify({
      properties: {
        title: SHEET_NAMES.transactions,
        locale: DEFAULT_SPREADSHEET_LOCALE,
      },
      sheets: [
        { properties: { title: SHEET_NAMES.transactions } },
        { properties: { title: SHEET_NAMES.summary } },
      ],
    }),
  });
  await initializeSpreadsheet(token, created.spreadsheetId);
  return created.spreadsheetId;
}

async function initializeSpreadsheet(token: string, spreadsheetId: string) {
  const currentMonth = new Date();
  const firstDay = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const locale = await getSpreadsheetLocale(token, spreadsheetId);
  await googleFetch(token, `${SHEETS}/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `${SHEET_NAMES.transactions}!A1:F1`,
          values: [TRANSACTION_HEADERS],
        },
        {
          range: `${SHEET_NAMES.summary}!A1:I2`,
          values: [
            SUMMARY_HEADERS,
            buildSummaryRowFormulas(2, firstDay, locale),
          ],
        },
      ],
    }),
  });
  await formatSpreadsheet(token, spreadsheetId);
}

export async function readTransactions(token: string, spreadsheetId: string) {
  const range = `${SHEET_NAMES.transactions}!A1:F`;
  const [data, formulaData] = await Promise.all([
    googleFetch<{ values?: unknown[][] }>(
      token,
      readValuesUrl(spreadsheetId, range),
    ),
    googleFetch<{ values?: unknown[][] }>(
      token,
      formulaValuesUrl(spreadsheetId, range),
    ),
  ]);
  const rows = data.values || [];
  await ensureTransactionTagsColumn(token, spreadsheetId, rows[0]?.[5] ?? "");
  const headerIndex = Math.max(
    0,
    findHeaderIndex(rows, TRANSACTION_HEADERS.slice(0, 4)),
  );
  return (data.values || [])
    .map((row, index): Transaction | null => {
      if (index <= headerIndex) return null;
      const date = parseSheetDate(row[0]);
      if (!date) return null;
      const type = normalizeType(String(row[3] || ""));
      if (!type) return null;
      const createdAt = parseCreatedAt(row[4]);
      return {
        rowId: index + 1,
        date: formatDateForSheet(date),
        rawDate: date.toISOString(),
        rawDateMs: date.getTime(),
        createdAtMs: parseCreatedAtMs(createdAt),
        amount: parseNumber(row[1]),
        detail: String(row[2] || ""),
        formula: parseAmountFormula(formulaData.values?.[index]?.[1], type),
        type,
        createdAt,
        tags: parseTags(row[5]),
      };
    })
    .filter(Boolean) as Transaction[];
}

export async function readSummaries(token: string, spreadsheetId: string) {
  const data = await googleFetch<{ values?: unknown[][] }>(
    token,
    readValuesUrl(spreadsheetId, `${SHEET_NAMES.summary}!A1:I`),
  );
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

export async function saveTransaction(
  token: string,
  spreadsheetId: string,
  draft: TransactionDraft,
) {
  const tx = buildTransactionFromDraft(draft, 0);
  const dateObj = new Date(tx.rawDate);
  const sheetId = await getTransactionSheetId(token, spreadsheetId);
  const targetRow = await findChronologicalInsertionRow(
    token,
    spreadsheetId,
    dateObj,
  );
  await insertBlankRow(token, spreadsheetId, sheetId, targetRow);
  await writeRow(token, spreadsheetId, targetRow, buildTransactionRow(tx));
  await ensureMonthlySummaryRowByDate(
    token,
    spreadsheetId,
    dateObj,
    tx.type === "INGRESO FRECUENTE",
  );
  return { ...tx, rowId: targetRow };
}

export async function insertTransactionAtRow(
  token: string,
  spreadsheetId: string,
  draft: TransactionDraft,
  targetRow: number,
) {
  const tx = buildTransactionFromDraft(draft, targetRow);
  const dateObj = new Date(tx.rawDate);
  const sheetId = await getTransactionSheetId(token, spreadsheetId);
  const safeRow = Math.max(2, targetRow);
  await insertBlankRow(token, spreadsheetId, sheetId, safeRow);
  await writeRow(token, spreadsheetId, safeRow, buildTransactionRow(tx));
  await ensureMonthlySummaryRowByDate(
    token,
    spreadsheetId,
    dateObj,
    tx.type === "INGRESO FRECUENTE",
  );
  return { ...tx, rowId: safeRow };
}

export async function updateTransaction(
  token: string,
  spreadsheetId: string,
  rowId: number,
  draft: TransactionDraft,
) {
  const tx = buildTransactionFromDraft(draft, rowId);
  const newDateObj = new Date(tx.rawDate);

  const oldRow = await readSingleRow(token, spreadsheetId, rowId);
  const oldDate = parseSheetDate(oldRow[0]);
  const oldType = normalizeType(String(oldRow[3] || ""));
  const oldMs = oldDate
    ? new Date(
        oldDate.getFullYear(),
        oldDate.getMonth(),
        oldDate.getDate(),
      ).getTime()
    : 0;
  const newMs = new Date(
    newDateObj.getFullYear(),
    newDateObj.getMonth(),
    newDateObj.getDate(),
  ).getTime();

  if (oldDate && oldMs !== newMs) {
    const sheetId = await getTransactionSheetId(token, spreadsheetId);
    await deleteSheetRow(token, spreadsheetId, sheetId, rowId);
    const targetRow = await findChronologicalInsertionRow(
      token,
      spreadsheetId,
      newDateObj,
    );
    await insertBlankRow(token, spreadsheetId, sheetId, targetRow);
    await writeRow(token, spreadsheetId, targetRow, buildTransactionRow(tx));
    await ensureMonthlySummaryRowByDate(
      token,
      spreadsheetId,
      newDateObj,
      tx.type === "INGRESO FRECUENTE",
    );
    await ensureMonthlySummaryRowByDate(
      token,
      spreadsheetId,
      oldDate,
      oldType === "INGRESO FRECUENTE",
    );
    return { ...tx, rowId: targetRow };
  }

  await writeRow(token, spreadsheetId, rowId, buildTransactionRow(tx));
  await ensureMonthlySummaryRowByDate(
    token,
    spreadsheetId,
    newDateObj,
    tx.type === "INGRESO FRECUENTE" || oldType === "INGRESO FRECUENTE",
  );
  return { ...tx, rowId };
}

export async function deleteTransaction(
  token: string,
  spreadsheetId: string,
  rowId: number,
) {
  const sheetId = await getTransactionSheetId(token, spreadsheetId);
  await deleteSheetRow(token, spreadsheetId, sheetId, rowId);
}

export async function moveTransaction(
  token: string,
  spreadsheetId: string,
  rowId: number,
  direction: "up" | "down",
) {
  const targetRowId = direction === "up" ? rowId - 1 : rowId + 1;
  if (targetRowId < 2) return;
  const [row1, row2] = await Promise.all([
    readSingleRow(token, spreadsheetId, rowId),
    readSingleRow(token, spreadsheetId, targetRowId),
  ]);
  if (!row1.length || !row2.length) return;
  await writeRow(token, spreadsheetId, rowId, row2);
  await writeRow(token, spreadsheetId, targetRowId, row1);
}

function formatCreatedAtForSheet(value?: string) {
  const raw = String(value || "").trim();
  if (!raw || raw === "Invalid Date") return "";
  const timeMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch)
    return `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}:${timeMatch[3] || "00"}`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function formatAmountForSheet(tx: Transaction) {
  const expression = sanitizeAmountExpression(tx.formula || "");
  if (!expression) return tx.amount;
  return `=${expression}`;
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
  if (type.startsWith("GASTO") && negativeWrappedMatch)
    return negativeWrappedMatch[1];
  return trimmed;
}

async function ensureMonthlySummaryRowByDate(
  token: string,
  spreadsheetId: string,
  date: Date,
  refreshFrequentIncome = false,
) {
  const [data, locale] = await Promise.all([
    googleFetch<{ values?: unknown[][] }>(
      token,
      valuesUrl(spreadsheetId, `${SHEET_NAMES.summary}!A1:I`),
    ),
    getSpreadsheetLocale(token, spreadsheetId),
  ]);
  const rows = data.values || [];
  const headerIndex = Math.max(0, findHeaderIndex(rows, SUMMARY_HEADERS));
  const monthYear = getMonthYear(date);
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const rowDate = parseSheetDate(rows[i]?.[0]);
    if (rowDate && getMonthYear(rowDate) === monthYear) {
      const rowNumber = i + 1;
      const firstDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
      const startColumn = refreshFrequentIncome ? "B" : "C";
      const formulas = buildSummaryRowFormulas(
        rowNumber,
        firstDay,
        locale,
      ).slice(refreshFrequentIncome ? 1 : 2);
      await googleFetch(
        token,
        `${valuesUrl(spreadsheetId, `${SHEET_NAMES.summary}!A${rowNumber}`)}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          body: JSON.stringify({ values: [[firstDay]] }),
        },
      );
      await googleFetch(
        token,
        `${valuesUrl(spreadsheetId, `${SHEET_NAMES.summary}!${startColumn}${rowNumber}:I${rowNumber}`)}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          body: JSON.stringify({ values: [formulas] }),
        },
      );
      return rowNumber;
    }
  }
  const rowNumber = Math.max(rows.length + 1, headerIndex + 2);
  const firstDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  await googleFetch(
    token,
    `${valuesUrl(spreadsheetId, `${SHEET_NAMES.summary}!A${rowNumber}:I${rowNumber}`)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      body: JSON.stringify({
        values: [buildSummaryRowFormulas(rowNumber, firstDay, locale)],
      }),
    },
  );
  return rowNumber;
}

async function getSpreadsheetLocale(token: string, spreadsheetId: string) {
  const meta = await googleFetch<{ properties?: { locale?: string } }>(
    token,
    `${SHEETS}/${spreadsheetId}?fields=properties.locale`,
  );
  return meta.properties?.locale || DEFAULT_SPREADSHEET_LOCALE;
}

function formulaDialect(locale: string): FormulaDialect {
  const normalized = locale.toLowerCase();
  if (normalized.startsWith("es"))
    return { sumifs: "SUMAR.SI.CONJUNTO", eomonth: "FIN.MES", sep: ";" };
  return { sumifs: "SUMIFS", eomonth: "EOMONTH", sep: "," };
}

function buildSummaryRowFormulas(
  rowNumber: number,
  firstDay: string,
  locale: string,
) {
  const dialect = formulaDialect(locale);
  const txSheet = `'${SHEET_NAMES.transactions}'`;
  const sumByType = (type: string) =>
    `=${dialect.sumifs}(${txSheet}!$B:$B${dialect.sep}${txSheet}!$A:$A${dialect.sep}">="&$A${rowNumber}${dialect.sep}${txSheet}!$A:$A${dialect.sep}"<="&${dialect.eomonth}($A${rowNumber}${dialect.sep}0)${dialect.sep}${txSheet}!$D:$D${dialect.sep}"${type}")`;
  return [
    firstDay,
    sumByType(TRANSACTION_TYPES[0]),
    sumByType(TRANSACTION_TYPES[1]),
    `=B${rowNumber}+C${rowNumber}`,
    sumByType(TRANSACTION_TYPES[2]),
    sumByType(TRANSACTION_TYPES[3]),
    `=E${rowNumber}+F${rowNumber}`,
    `=D${rowNumber}+G${rowNumber}`,
    `=H${rowNumber}-B${rowNumber}`,
  ];
}

async function formatSpreadsheet(token: string, spreadsheetId: string) {
  const meta = await googleFetch<{
    sheets?: { properties?: { sheetId?: number; title?: string } }[];
  }>(
    token,
    `${SHEETS}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
  );
  const txSheetId = meta.sheets?.find(
    (sheet) => sheet.properties?.title === SHEET_NAMES.transactions,
  )?.properties?.sheetId;
  const summarySheetId = meta.sheets?.find(
    (sheet) => sheet.properties?.title === SHEET_NAMES.summary,
  )?.properties?.sheetId;
  const requests: unknown[] = [txSheetId, summarySheetId]
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
          fields:
            "userEnteredFormat(textFormat,horizontalAlignment,backgroundColor)",
        },
      },
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
          fields: "gridProperties.frozenRowCount",
        },
      },
    ]);
  if (typeof txSheetId === "number")
    requests.push(...transactionRowFormatRequests(txSheetId, 1));
  if (requests.length) {
    await googleFetch(token, `${SHEETS}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }
}

export async function removeTagFromAllRows(
  token: string,
  spreadsheetId: string,
  tagId: string,
) {
  const range = `${SHEET_NAMES.transactions}!F2:F`;
  const data = await googleFetch<{ values?: unknown[][] }>(
    token,
    readValuesUrl(spreadsheetId, range),
  );
  const rows = data.values || [];
  const updates: { range: string; values: string[][] }[] = [];
  rows.forEach((row, index) => {
    const raw = String(row[0] || "").trim();
    if (!raw) return;
    const tags = parseTags(raw);
    if (!tags.includes(tagId)) return;
    const cleaned = tags.filter((t) => t !== tagId);
    updates.push({
      range: `${SHEET_NAMES.transactions}!F${index + 2}`,
      values: [[cleaned.join(TAG_SEPARATOR)]],
    });
  });
  if (!updates.length) return;
  await googleFetch(
    token,
    `${SHEETS}/${spreadsheetId}/values:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: updates,
      }),
    },
  );
}
