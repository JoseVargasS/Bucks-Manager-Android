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
  return transactions
    .map((tx, index) => ({
      tx,
      index,
      date: Date.parse(tx.rawDate),
      createdAt: tx.createdAt ? Date.parse(tx.createdAt) : 0,
    }))
    .sort(
      (a, b) =>
        b.date - a.date || b.createdAt - a.createdAt || a.index - b.index,
    )
    .map(({ tx }) => tx);
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
    const time = new Date(tx.rawDate).getTime();
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
    const key = formatDateToISO(new Date(tx.rawDate));
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
