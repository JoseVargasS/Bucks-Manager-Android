import * as SecureStore from "expo-secure-store";
import { TRANSACTION_TYPES } from "../domain/bucksLogic";
import type { HistoryEntry, Transaction } from "../types";
import { logError } from "./errorHandler";

const HISTORY_KEY = "bucks_history";
const MAX_DAYS = 30;

function pruneExpired(entries: unknown[]): HistoryEntry[] {
  const cutoff = Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000;
  return entries.filter((entry): entry is HistoryEntry =>
    isHistoryEntry(entry) && new Date(entry.timestamp).getTime() > cutoff,
  );
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const raw = await SecureStore.getItemAsync(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? pruneExpired(parsed) : [];
  } catch (e) {
    logError(e, "history:loadHistory");
    return [];
  }
}

async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  const trimmed = pruneExpired(entries);
  await SecureStore.setItemAsync(HISTORY_KEY, JSON.stringify(trimmed)).catch((e) => logError(e, "history:saveHistory"));
}

export async function addHistoryEntry(entry: Omit<HistoryEntry, "id" | "timestamp">): Promise<HistoryEntry> {
  const full: HistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  const existing = await loadHistory();
  await saveHistory([full, ...existing]);
  return full;
}

export async function removeHistoryEntry(id: string): Promise<void> {
  const existing = await loadHistory();
  await saveHistory(existing.filter((e) => e.id !== id));
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<HistoryEntry>;
  const tx = entry.transaction as Partial<Transaction> | undefined;
  return typeof entry.id === "string"
    && typeof entry.timestamp === "string"
    && entry.action === "delete"
    && !!tx
    && Number.isFinite(tx.rowId)
    && typeof tx.rawDate === "string"
    && !Number.isNaN(Date.parse(tx.rawDate))
    && Number.isFinite(tx.amount)
    && typeof tx.detail === "string"
    && TRANSACTION_TYPES.includes(tx.type as Transaction["type"]);
}
