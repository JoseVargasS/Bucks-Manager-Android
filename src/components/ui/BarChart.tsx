import { memo } from "react";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";

import { MONTH_NAMES } from "../../domain/bucksLogic";
import { UI_MONTH_NAMES } from "../../i18n";
import { Palette } from "../../theme/colors";
import { SummaryRow } from "../../types";
import { useAppFontFamily } from "./AppText";

export const BarChart = memo(function BarChart({ rows, colors, language }: { rows: SummaryRow[]; colors: Palette; language: "es" | "en" }) {
  const fontFamily = useAppFontFamily();
  const displayRows = rows.slice(-12);
  const max = Math.max(1, ...displayRows.map((row) => Math.max(row.totalIncome, Math.abs(row.totalExpense))));
  const chartWidth = 360;
  const plotLeft = 30;
  const plotWidth = 322;
  const baseY = 158;
  const plotHeight = 126;
  const columnWidth = plotWidth / Math.max(1, displayRows.length);
  const barWidth = Math.min(10, Math.max(5, columnWidth * 0.28));
  const gap = 3;

  return (
    <Svg width="100%" height={190} viewBox={`0 0 ${chartWidth} 190`} style={{ marginTop: 12 }}>
      {[0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = baseY - plotHeight * ratio;
        return (
          <G key={ratio}>
            <Line x1={plotLeft} y1={y} x2={chartWidth - 8} y2={y} stroke={colors.border} strokeWidth={0.75} strokeDasharray="3 5" />
            {(ratio === 0.5 || ratio === 1) && (
              <SvgText x={2} y={y + 3} fontSize={10} fill={colors.muted} fontFamily={fontFamily} fontWeight="500">{compact(max * ratio)}</SvgText>
            )}
          </G>
        );
      })}
      <Line x1={plotLeft} y1={baseY} x2={chartWidth - 8} y2={baseY} stroke={colors.borderStrong} strokeWidth={1} />
      {displayRows.map((row, index) => {
        const groupWidth = barWidth * 2 + gap;
        const x = plotLeft + index * columnWidth + (columnWidth - groupWidth) / 2;
        const incomeHeight = row.totalIncome ? Math.max(3, (row.totalIncome / max) * plotHeight) : 0;
        const expenseHeight = row.totalExpense ? Math.max(3, (Math.abs(row.totalExpense) / max) * plotHeight) : 0;
        const sourceMonth = row.monthYear.split(" ")[0];
        const month = Math.max(0, MONTH_NAMES.findIndex((name) => name.toLowerCase() === sourceMonth.toLowerCase()));
        return (
          <G key={row.monthYear}>
            <Rect x={x} y={baseY - incomeHeight} width={barWidth} height={incomeHeight} rx={3} fill={colors.green} opacity={0.92} />
            <Rect x={x + barWidth + gap} y={baseY - expenseHeight} width={barWidth} height={expenseHeight} rx={3} fill={colors.red} opacity={0.88} />
            <SvgText x={x + groupWidth / 2} y={baseY + 17} fontSize={10.5} fill={colors.muted} fontFamily={fontFamily} textAnchor="middle" fontWeight="600">
              {UI_MONTH_NAMES[language][month].slice(0, 3).toUpperCase()}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
});

function compact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(value));
}
