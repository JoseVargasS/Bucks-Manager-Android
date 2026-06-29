import type { Transaction, TransactionDraft, TransactionType } from "../types";
import { formatDateToISO } from "../domain/bucksLogic";
import { UI_COPY, type UiCopy } from "../i18n";
import { formatDateGroupLabel } from "./formats";

/** Crea un TransactionDraft vacío con tipo por defecto "GASTO NO FRECUENTE" y fecha actual */
export function getBlankDraft(
  type: TransactionType = "GASTO NO FRECUENTE",
): TransactionDraft {
  return { date: formatDateToISO(new Date()), amount: "", detail: "", type };
}

/** Ordena transacciones por fecha descendente, resolviendo empates por createdAt */
export function sortTransactionsDesc(
  transactions: Transaction[],
): Transaction[] {
  return [...transactions].sort((a, b) => {
    const da = a.rawDateMs ?? Date.parse(a.rawDate);
    const db = b.rawDateMs ?? Date.parse(b.rawDate);
    const ca = a.createdAtMs ?? (a.createdAt ? Date.parse(a.createdAt) : 0);
    const cb = b.createdAtMs ?? (b.createdAt ? Date.parse(b.createdAt) : 0);
    return db - da || cb - ca || a.rowId - b.rowId;
  });
}

/** Filtra transacciones dentro de una ventana de N meses hacia atrás desde el mes/año dados */
export function filterTransactionsByRollingPeriod(
  transactions: Transaction[],
  month: number,
  year: number,
  monthCount: number,
): Transaction[] {
  const end = new Date(year, month + 1, 1).getTime();
  const start = new Date(
    year,
    month - Math.max(1, monthCount) + 1,
    1,
  ).getTime();
  return transactions.filter((tx) => {
    const time = tx.rawDateMs ?? Date.parse(tx.rawDate);
    return time >= start && time < end;
  });
}

/** Agrupa transacciones por fecha en segmentos con etiqueta y array de items */
export function groupTransactionsByDate(
  transactions: Transaction[],
  copy: UiCopy = UI_COPY.es,
): Array<{ key: string; label: string; items: Transaction[] }> {
  const groups: Array<{ key: string; label: string; items: Transaction[] }> =
    [];
  const groupsByDate = new Map<string, (typeof groups)[number]>();
  transactions.forEach((tx) => {
    const key = tx.date || formatDateToISO(new Date(tx.rawDate));
    let group = groupsByDate.get(key);
    if (!group) {
      group = { key, label: formatDateGroupLabel(tx.rawDate, copy), items: [] };
      groupsByDate.set(key, group);
      groups.push(group);
    }
    group.items.push(tx);
  });
  for (const group of groups) group.items.reverse();
  return groups;
}
