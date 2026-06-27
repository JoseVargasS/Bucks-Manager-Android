import * as FileSystem from "expo-file-system/legacy";

import { TRANSACTION_TYPES } from "../domain/bucksLogic";
import type { SummaryRow, Transaction } from "../types";
import { logError } from "../utils/errorHandler";

const CACHE_VERSION = 2;
const CACHE_FILE = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}bucks-finance-cache.json`;

export type FinancialCache = {
  schemaVersion: typeof CACHE_VERSION;
  spreadsheetId: string;
  lastSyncedAt: string | null;
  transactions: Transaction[];
  summaries: SummaryRow[];
  freqIncome: Record<string, number>;
};

export async function loadFinancialCache(spreadsheetId: string) {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_FILE);
    if (!info.exists) return null;
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(CACHE_FILE)) as unknown;
    if (!isCacheShape(parsed) || parsed.spreadsheetId !== spreadsheetId) return null;
    return parsed;
  } catch (e) {
    logError(e, "localCache:loadFinancialCache");
    return null;
  }
}

export async function saveFinancialCache(cache: Omit<FinancialCache, "schemaVersion">) {
  await FileSystem.writeAsStringAsync(CACHE_FILE, JSON.stringify({ ...cache, schemaVersion: CACHE_VERSION }));
}

export async function deleteFinancialCache() {
  await FileSystem.deleteAsync(CACHE_FILE, { idempotent: true });
}

function isCacheShape(value: unknown): value is FinancialCache {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FinancialCache>;
  const version = candidate.schemaVersion ?? 1;
  return version <= CACHE_VERSION
    && typeof candidate.spreadsheetId === "string"
    && (candidate.lastSyncedAt === null || typeof candidate.lastSyncedAt === "string")
    && Array.isArray(candidate.transactions)
    && candidate.transactions.every(isTransaction)
    && Array.isArray(candidate.summaries)
    && candidate.summaries.every(isSummary)
    && isNumberMap(candidate.freqIncome);
}

function isNumberMap(value: unknown): value is Record<string, number> {
  return !!value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.values(value).every((item) => typeof item === "number" && Number.isFinite(item));
}

function isTransaction(value: unknown): value is Transaction {
  if (!value || typeof value !== "object") return false;
  const tx = value as Partial<Transaction>;
  return Number.isFinite(tx.rowId)
    && typeof tx.date === "string"
    && typeof tx.rawDate === "string"
    && !Number.isNaN(Date.parse(tx.rawDate))
    && Number.isFinite(tx.amount)
    && typeof tx.detail === "string"
    && TRANSACTION_TYPES.includes(tx.type as Transaction["type"])
    && (tx.formula === undefined || typeof tx.formula === "string")
    && (tx.createdAt === undefined || typeof tx.createdAt === "string")
    && (tx.tags === undefined || (Array.isArray(tx.tags) && tx.tags.every((tag) => typeof tag === "string")));
}

function isSummary(value: unknown): value is SummaryRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SummaryRow>;
  return typeof row.monthYear === "string"
    && [row.freqIncome, row.nonFreqIncome, row.totalIncome, row.freqExpense, row.nonFreqExpense, row.totalExpense, row.netMonthly, row.netNoFreq]
      .every(Number.isFinite);
}
