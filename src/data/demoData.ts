import { SummaryRow, Transaction } from "../types";
import { calculateSummaries } from "../domain/bucksLogic";

export const demoTransactions: Transaction[] = [
  {
    rowId: 2,
    date: "02-jun-26",
    rawDate: "2026-06-02T05:00:00.000Z",
    amount: -69,
    detail: "Internet",
    type: "GASTO FRECUENTE",
    createdAt: "2026-06-02T14:12:00.000Z",
  },
  {
    rowId: 3,
    date: "04-jun-26",
    rawDate: "2026-06-04T05:00:00.000Z",
    amount: 176.33,
    detail: "Interés préstamo",
    type: "INGRESO NO FRECUENTE",
    createdAt: "2026-06-04T19:30:00.000Z",
  },
  {
    rowId: 4,
    date: "07-jun-26",
    rawDate: "2026-06-07T05:00:00.000Z",
    amount: -35,
    detail: "Pedido de suplementos",
    type: "GASTO NO FRECUENTE",
    createdAt: "2026-06-07T22:05:00.000Z",
  },
  {
    rowId: 5,
    date: "12-jun-26",
    rawDate: "2026-06-12T05:00:00.000Z",
    amount: -24.5,
    detail: "Taxi y delivery",
    type: "GASTO NO FRECUENTE",
    createdAt: "2026-06-12T12:40:00.000Z",
  },
  {
    rowId: 6,
    date: "18-jun-26",
    rawDate: "2026-06-18T05:00:00.000Z",
    amount: -89.9,
    detail: "Suscripción anual",
    type: "GASTO FRECUENTE",
    createdAt: "2026-06-18T08:20:00.000Z",
  },
];

export const demoFreqIncome: Record<string, number> = {
  "Mayo 2026": 2400,
  "Junio 2026": 2400,
};

export const demoSummaries: SummaryRow[] = [
  ...calculateSummaries(
    [
      {
        rowId: 1,
        date: "03-may-26",
        rawDate: "2026-05-03T05:00:00.000Z",
        amount: -120,
        detail: "Compras hogar",
        type: "GASTO NO FRECUENTE",
      },
      {
        rowId: 2,
        date: "13-may-26",
        rawDate: "2026-05-13T05:00:00.000Z",
        amount: -85,
        detail: "Servicios",
        type: "GASTO FRECUENTE",
      },
      ...demoTransactions,
    ],
    demoFreqIncome,
  ),
];
