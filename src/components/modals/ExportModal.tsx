import { useRef, useState } from "react";
import { Animated, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { styles } from "../../styles/globalStyles";
import { ModalHeader } from "../ui/ModalHeader";
import { ActionRow } from "../ui/ActionRow";
import { CalendarPicker } from "../ui/CalendarPicker";
import { Palette } from "../../theme/colors";
import { ExportFormat } from "../../types";
import { UiCopy } from "../../i18n";
import { useModalTransition } from "../ui/useModalTransition";
import { Text } from "../ui/AppText";

export type ExportConfig = {
  format: ExportFormat;
  rangeMode: "dates" | "months";
  startDate: string;
  endDate: string;
};

export function ExportModal({ visible, colors, copy, config, setConfig, minDate, onClose, onExport }: {
  visible: boolean; colors: Palette; config: ExportConfig; setConfig: (c: ExportConfig) => void;
  copy: UiCopy;
  minDate: string; onClose: () => void; onExport: (cfg: ExportConfig) => void;
}) {
  const [calFrom, setCalFrom] = useState(false);
  const [calTo, setCalTo] = useState(false);
  const pendingExport = useRef<ExportConfig | null>(null);
  const transition = useModalTransition(visible, 12, 0.985, () => {
    const pending = pendingExport.current;
    pendingExport.current = null;
    if (pending) onExport(pending);
  });
  const DEFAULT_LOCALE = "es-PE";
  const locale = copy.languageCode === "en" ? "en-US" : DEFAULT_LOCALE;
  const rangeLabel = (val: string, isMonth?: boolean) => {
    if (!val) return copy.select;
    if (isMonth) {
      const [y, m] = val.split("-");
      const d = new Date(Number(y), Number(m) - 1, 15);
      return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
    }
    const d = new Date(val + "T12:00:00");
    return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  };
  if (!transition.modalVisible) return null;
  const mode = config.rangeMode === "months" ? "month" : "date";
  const minForMode = mode === "month" && minDate ? minDate.slice(0, 7) : minDate;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.modalOverlay, { backgroundColor: colors.overlay }, transition.containerStyle]}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.modal, { backgroundColor: colors.card }, transition.panelStyle]}>
          <ModalHeader title={copy.exportMovements} icon="file-export" colors={colors} onClose={onClose} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: colors.text }]}>{copy.format}</Text>
            <View style={styles.twoCols}>
              <TouchableOpacity
                style={[styles.exportChip, { backgroundColor: config.format === "xlsx" ? colors.primarySoft : colors.input, borderColor: config.format === "xlsx" ? colors.primary : colors.border }]}
                onPress={() => setConfig({ ...config, format: "xlsx" })}
              >
                <MaterialCommunityIcons name="file-delimited" size={20} color={config.format === "xlsx" ? colors.primary : colors.muted} />
                <Text style={[{ color: config.format === "xlsx" ? colors.primary : colors.text, fontWeight: "700" }]}>CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exportChip, { backgroundColor: config.format === "pdf" ? colors.primarySoft : colors.input, borderColor: config.format === "pdf" ? colors.primary : colors.border }]}
                onPress={() => setConfig({ ...config, format: "pdf" })}
              >
                <MaterialCommunityIcons name="file-pdf-box" size={20} color={config.format === "pdf" ? colors.primary : colors.muted} />
                <Text style={[{ color: config.format === "pdf" ? colors.primary : colors.text, fontWeight: "700" }]}>PDF</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>{copy.range}</Text>
            <View style={styles.twoCols}>
              <TouchableOpacity
                style={[styles.exportChip, { backgroundColor: config.rangeMode === "dates" ? colors.primarySoft : colors.input, borderColor: config.rangeMode === "dates" ? colors.primary : colors.border }]}
                onPress={() => setConfig({ ...config, rangeMode: "dates" })}
              >
                <MaterialCommunityIcons name="calendar-range" size={20} color={config.rangeMode === "dates" ? colors.primary : colors.muted} />
                <Text style={[{ color: config.rangeMode === "dates" ? colors.primary : colors.text, fontWeight: "700" }]}>{copy.byDates}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exportChip, { backgroundColor: config.rangeMode === "months" ? colors.primarySoft : colors.input, borderColor: config.rangeMode === "months" ? colors.primary : colors.border }]}
                onPress={() => setConfig({ ...config, rangeMode: "months" })}
              >
                <MaterialCommunityIcons name="calendar-month" size={20} color={config.rangeMode === "months" ? colors.primary : colors.muted} />
                <Text style={[{ color: config.rangeMode === "months" ? colors.primary : colors.text, fontWeight: "700" }]}>{copy.byMonths}</Text>
              </TouchableOpacity>
            </View>
            <RangeField
              label={mode === "month" ? copy.startMonth : copy.from}
              value={config.startDate}
              onChange={(v) => setConfig({ ...config, startDate: v })}
              pickerMode={mode}
              pickerMin={minForMode}
              colors={colors}
              copy={copy}
              onOpen={() => setCalFrom(true)}
              onClose={() => setCalFrom(false)}
              isOpen={calFrom}
              displayValue={rangeLabel(config.startDate, mode === "month")}
            />
            <RangeField
              label={mode === "month" ? copy.endMonth : copy.to}
              value={config.endDate}
              onChange={(v) => setConfig({ ...config, endDate: v })}
              pickerMode={mode}
              pickerMin={minForMode}
              colors={colors}
              copy={copy}
              onOpen={() => setCalTo(true)}
              onClose={() => setCalTo(false)}
              isOpen={calTo}
              displayValue={rangeLabel(config.endDate, mode === "month")}
            />
            <ActionRow colors={colors} onCancel={onClose} onSubmit={() => { pendingExport.current = config; onClose(); }} submitLabel={copy.exportAction} cancelLabel={copy.cancel} />
          </ScrollView>
        </Animated.View>
      </Animated.View>
</Modal>
  );
}

function RangeField({ label, value, onChange, pickerMode, pickerMin, colors, copy, onOpen, onClose, isOpen, displayValue }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  pickerMode: "date" | "month";
  pickerMin?: string;
  colors: Palette;
  copy: UiCopy;
  onOpen: () => void;
  onClose: () => void;
  isOpen: boolean;
  displayValue: string;
}) {
  return (
    <>
      <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>{label}</Text>
      <TouchableOpacity style={[rangeStyles.trigger, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={onOpen}>
        <MaterialCommunityIcons name="calendar" size={20} color={colors.blue} />
        <Text style={{ color: value ? colors.text : colors.muted, fontWeight: "600", flex: 1 }}>{displayValue}</Text>
      </TouchableOpacity>
      <CalendarPicker visible={isOpen} value={value} mode={pickerMode} minDate={pickerMin} onSelect={onChange} onClose={onClose} colors={colors} copy={copy} />
    </>
  );
}

const rangeStyles = StyleSheet.create({
  trigger: { borderRadius: 10, paddingHorizontal: 12, minHeight: 42, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1 },
});

