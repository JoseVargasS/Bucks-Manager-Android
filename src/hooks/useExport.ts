import { useCallback, useState } from "react";
import {
  cacheDirectory,
  writeAsStringAsync,
  deleteAsync,
  copyAsync,
} from "expo-file-system/legacy";
import { printToFileAsync } from "expo-print";
import { shareAsync } from "expo-sharing";
import { Alert } from "react-native";
import { formatDateToISO, formatMoney } from "../domain/bucksLogic";
import { formatCreatedTime } from "../utils/formats";
import { buildExportFileName } from "../utils/helpers";
import { Transaction } from "../types";
import { UiCopy } from "../i18n";
import { ExportConfig } from "../components/modals/ExportModal";

type ExportState = {
  exportVisible: boolean;
  exportConfig: ExportConfig;
  exportMinDate: string;
  setExportConfig: (c: ExportConfig) => void;
  openExport: () => void;
  closeExport: () => void;
  startExport: (cfg: ExportConfig) => void;
};

export function useExport(
  transactions: Transaction[],
  currencySymbol: string,
  copy: UiCopy,
  getErrorMessage: (error: unknown) => string,
): ExportState {
  const [exportVisible, setExportVisible] = useState(false);
  const [exportConfig, setExportConfig] = useState<ExportConfig>({
    format: "xlsx",
    rangeMode: "dates",
    startDate: "",
    endDate: "",
  });

  const exportMinDate = transactions.length
    ? transactions
        .reduce(
          (earliest, tx) => (tx.rawDate < earliest ? tx.rawDate : earliest),
          transactions[0].rawDate,
        )
        .slice(0, 10)
    : "";

  const openExport = useCallback(() => setExportVisible(true), []);
  const closeExport = useCallback(() => setExportVisible(false), []);

  const exportRows = useCallback(
    async (cfg: ExportConfig) => {
      const parseDay = (value: string, endOfDay: boolean) => {
        const [y, m, d] = value.split("-").map(Number);
        if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return Number.NaN;
        const date = new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
        return Number.isNaN(date.getTime()) ? Number.NaN : date.getTime();
      };
      const parseMonth = (value: string) => {
        const [y, m] = value.split("-").map(Number);
        return Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12 ? y * 12 + (m - 1) : Number.NaN;
      };
      let rows: Transaction[];
      if (cfg.rangeMode === "dates") {
        const from = cfg.startDate ? parseDay(cfg.startDate, false) : 0;
        const to = cfg.endDate ? parseDay(cfg.endDate, true) : Infinity;
        rows = transactions.filter((tx) => {
          const t = parseDay(formatDateToISO(tx.rawDate), false);
          return t >= from && t <= to;
        });
      } else {
        const fromYM = cfg.startDate ? parseMonth(cfg.startDate) : 0;
        const toYM = cfg.endDate ? parseMonth(cfg.endDate) : Infinity;
        rows = transactions.filter((tx) => {
          const txYM = parseMonth(formatDateToISO(tx.rawDate).slice(0, 7));
          return txYM >= fromYM && txYM <= toYM;
        });
      }
      if (!rows.length) {
        Alert.alert(copy.exportMovements, copy.noDataToExport);
        return;
      }
      const baseFileName = buildExportFileName(cfg);
      if (cfg.format === "xlsx") {
        const csvLines: string[] = [copy.csvHeader as string];
        rows.forEach(
          (tx) =>
            csvLines.push(
              `${tx.date},${tx.amount},"${tx.detail.replace(/"/g, '""')}",${tx.type},${formatCreatedTime(tx.createdAt)}`,
            ),
        );
        const csv = csvLines.join("\n");
        const uri = `${cacheDirectory}${baseFileName}.csv`;
        await writeAsStringAsync(uri, csv);
        await shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: copy.exportMovements,
        });
      } else {
        const html = `<html><body><h1>Bucks Manager</h1><table border="1" cellspacing="0" cellpadding="6">${rows
          .map(
            (tx) =>
              `<tr><td>${tx.date}</td><td>${formatMoney(tx.amount, currencySymbol)}</td><td>${tx.detail}</td><td>${tx.type}</td><td>${formatCreatedTime(tx.createdAt)}</td></tr>`,
          )
          .join("")}</table></body></html>`;
        const pdf = await printToFileAsync({ html });
        const uri = `${cacheDirectory}${baseFileName}.pdf`;
        await deleteAsync(uri, { idempotent: true });
        await copyAsync({ from: pdf.uri, to: uri });
        await shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: copy.exportPdf,
        });
      }
    },
    [transactions, currencySymbol, copy],
  );

  const startExport = useCallback(
    (cfg: ExportConfig) => {
      void exportRows(cfg).catch((error) =>
        Alert.alert(copy.exportMovements, getErrorMessage(error)),
      );
    },
    [exportRows, copy.exportMovements, getErrorMessage],
  );

  return {
    exportVisible,
    exportConfig,
    exportMinDate,
    setExportConfig,
    openExport,
    closeExport,
    startExport,
  };
}
