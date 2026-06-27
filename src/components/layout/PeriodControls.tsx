import { memo } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Select } from "../ui/Select";
import { Palette } from "../../theme/colors";
import { UiCopy, UI_MONTH_NAMES } from "../../i18n";

export const PeriodControls = memo(function PeriodControls({
  colors,
  copy,
  year,
  month,
  availableYears,
  availableMonths,
  onSelectPeriod,
  goToday,
  goPrevMonth,
  goNextMonth,
}: {
  colors: Palette;
  copy: UiCopy;
  year: number;
  month: number;
  availableYears: number[];
  availableMonths: number[];
  onSelectPeriod: (month: number, year: number) => void;
  goToday: () => void;
  goPrevMonth: () => void;
  goNextMonth: () => void;
}) {
  const monthNames = copy.languageCode === "en" ? UI_MONTH_NAMES.en : UI_MONTH_NAMES.es;

  return (
    <View style={styles.periodControls}>
      <View style={styles.periodActions}>
        <Select
          value={String(year)}
          options={availableYears.map((item) => ({ label: String(item), value: String(item) }))}
          onSelect={(v: string) => onSelectPeriod(month, Number(v))}
          colors={colors}
          title={copy.selectYear}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Select
          value={String(month)}
          options={availableMonths.map((index) => ({ label: monthNames[index], value: String(index) }))}
          onSelect={(v: string) => onSelectPeriod(Number(v), year)}
          colors={colors}
          title={copy.selectMonth}
          style={{ flex: 1, minWidth: 0 }}
        />
        <TouchableOpacity onPress={goPrevMonth} style={[styles.periodToday, { backgroundColor: colors.periodBg }]}>
          <MaterialCommunityIcons name="chevron-left" size={20} color={colors.blue} />
        </TouchableOpacity>
        <TouchableOpacity onPress={goToday} style={[styles.periodToday, { backgroundColor: colors.periodBg }]}>
          <MaterialCommunityIcons name="calendar-today" size={18} color={colors.blue} />
        </TouchableOpacity>
        <TouchableOpacity onPress={goNextMonth} style={[styles.periodToday, { backgroundColor: colors.periodBg }]}>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.blue} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  periodControls: { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 0, gap: 8 },
  periodActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  periodToday: { width: 42, height: 42, borderRadius: 10, borderWidth: 0, alignItems: "center", justifyContent: "center" },
});

