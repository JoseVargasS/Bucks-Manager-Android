import * as SecureStore from "expo-secure-store";
import { HistoryEntry } from "../types";

const HISTORY_KEY = "bucks_history";
const MAX_DAYS = 30;

function pruneExpired(entries: HistoryEntry[]): HistoryEntry[] {
  const cutoff = Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000;
  return entries.filter((e) => new Date(e.timestamp).getTime() > cutoff);
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const raw = await SecureStore.getItemAsync(HISTORY_KEY);
    if (!raw) return [];
    const parsed: HistoryEntry[] = JSON.parse(raw);
    return pruneExpired(parsed);
  } catch {
    return [];
  }
}

async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  const trimmed = pruneExpired(entries);
  await SecureStore.setItemAsync(HISTORY_KEY, JSON.stringify(trimmed)).catch(() => undefined);
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
