import { useState } from "react";
import { Modal, Text, TouchableOpacity, View, StyleSheet, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { formatDateToISO, MONTH_NAMES } from "../../domain/bucksLogic";
import { Palette } from "../../theme/colors";

const MONTH_ABBR = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."];
const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

export function CalendarPicker({ visible, value, onSelect, onClose, colors, mode = "date", minDate, maxDate }: { visible: boolean; value: string; onSelect: (v: string) => void; onClose: () => void; colors: Palette; mode?: "date" | "month"; minDate?: string; maxDate?: string }) {
  const parsed = value ? new Date(value + (value.length <= 7 ? "-15T12:00:00" : "T12:00:00")) : new Date();
  const [viewYear, setViewYear] = useState(parsed.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed.getMonth());
  const [selectedDay, setSelectedDay] = useState(parsed.getDate());
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const effectiveMax = maxDate || todayStr;
  const effectiveMin = minDate || "2020-01-01";
  const minParsed = new Date(effectiveMin + (effectiveMin.length <= 7 ? "-15T12:00:00" : "T12:00:00"));
  const maxParsed = new Date(effectiveMax + (effectiveMax.length <= 7 ? "-15T12:00:00" : "T12:00:00"));
  const minYear = Number.isNaN(minParsed.getFullYear()) ? 2000 : minParsed.getFullYear();
  const maxYear = Number.isNaN(maxParsed.getFullYear()) ? now.getFullYear() : maxParsed.getFullYear();
  const canGoBackYear = viewYear > minYear;
  const canGoForwardYear = viewYear < maxYear;
  const canGoBackMonth = viewYear === minYear ? viewMonth > minParsed.getMonth() : viewYear > minYear;
  const canGoForwardMonth = viewYear === maxYear ? viewMonth < maxParsed.getMonth() : viewYear < maxYear;

  const monthName = MONTH_NAMES[viewMonth];
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

  const isDayDisabled = (day: number) => {
    const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return ds < effectiveMin || ds > effectiveMax;
  };
  const isMonthDisabled = (m: number) => {
    const padM = String(m + 1).padStart(2, "0");
    const padMinM = String(minParsed.getMonth() + 1).padStart(2, "0");
    const padMaxM = String(maxParsed.getMonth() + 1).padStart(2, "0");
    const minKey = `${minYear}-${padMinM}`;
    const maxKey = `${maxYear}-${padMaxM}`;
    const curKey = `${viewYear}-${padM}`;
    return curKey < minKey || curKey > maxKey;
  };

  const handleSelect = (y: number, m: number, d?: number) => {
    if (mode === "month") {
      onSelect(`${y}-${String(m + 1).padStart(2, "0")}`);
    } else {
      const day = d || 1;
      onSelect(`${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]} activeOpacity={1} onPress={onClose} />
      <View style={[{ position: "absolute", left: "50%", top: "50%", transform: [{ translateX: -150 }, { translateY: -200 }], width: 300, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: "hidden", elevation: 20, zIndex: 9999 }]}>
        <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10, borderBottomWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <TouchableOpacity onPress={() => canGoBackYear && setViewYear(viewYear - 1)} disabled={!canGoBackYear}>
              <MaterialCommunityIcons name="chevron-left" size={26} color={canGoBackYear ? colors.text : colors.disabled} />
            </TouchableOpacity>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>{viewYear}</Text>
            <TouchableOpacity onPress={() => canGoForwardYear && setViewYear(viewYear + 1)} disabled={!canGoForwardYear}>
              <MaterialCommunityIcons name="chevron-right" size={26} color={canGoForwardYear ? colors.text : colors.disabled} />
            </TouchableOpacity>
          </View>
          {mode === "date" && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <TouchableOpacity onPress={() => canGoBackMonth && setViewMonth(Math.max(0, viewMonth - 1))} disabled={!canGoBackMonth}>
                <MaterialCommunityIcons name="chevron-left" size={22} color={canGoBackMonth ? colors.muted : colors.disabled} />
              </TouchableOpacity>
              <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "900" }}>{monthName}</Text>
              <TouchableOpacity onPress={() => canGoForwardMonth && setViewMonth(Math.min(11, viewMonth + 1))} disabled={!canGoForwardMonth}>
                <MaterialCommunityIcons name="chevron-right" size={22} color={canGoForwardMonth ? colors.muted : colors.disabled} />
              </TouchableOpacity>
            </View>
          )}
        </View>
        <View style={{ padding: 12 }}>
          {mode === "month" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {MONTH_ABBR.map((abbr, i) => {
                const isSelected = i === viewMonth;
                const disabled = isMonthDisabled(i);
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => !disabled && handleSelect(viewYear, i)}
                    disabled={disabled}
                    style={{ width: "25%", paddingVertical: 10, alignItems: "center" }}
                  >
                    <View style={{ width: 52, height: 36, borderRadius: 18, backgroundColor: isSelected ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: disabled ? colors.disabled : isSelected ? colors.onPrimary : colors.text, fontSize: 13, fontWeight: "900" }}>{abbr}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <>
              <View style={{ flexDirection: "row", marginBottom: 4 }}>
                {DAY_LABELS.map((d) => (
                  <Text key={d} style={{ flex: 1, textAlign: "center", color: colors.muted, fontSize: 11, fontWeight: "900" }}>{d}</Text>
                ))}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {Array.from({ length: firstDayOfWeek }).map((_, i) => <View key={`e-${i}`} style={{ width: `${100 / 7}%` }} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const isToday = day === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();
                  const isSelected = day === selectedDay;
                  const disabled = isDayDisabled(day);
                  return (
                    <TouchableOpacity key={day} onPress={() => { if (!disabled) { setSelectedDay(day); handleSelect(viewYear, viewMonth, day); } }} disabled={disabled} style={{ width: `${100 / 7}%`, paddingVertical: 6, alignItems: "center" }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isSelected ? colors.primary : isToday ? colors.primarySoft : "transparent", alignItems: "center", justifyContent: "center", borderWidth: isToday && !isSelected ? 1 : 0, borderColor: colors.primary, opacity: disabled ? 0.3 : 1 }}>
                        <Text style={{ color: isSelected ? colors.onPrimary : isToday ? colors.primary : colors.text, fontSize: 13, fontWeight: isSelected ? "900" : "700" }}>{day}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, paddingTop: 6, borderTopWidth: 1, borderColor: colors.border }}>
          <TouchableOpacity onPress={() => {
            const nowDate = new Date();
            if (mode === "month") onSelect(`${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`);
            else onSelect(formatDateToISO(nowDate));
            onClose();
          }}>
            <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 14 }}>Este mes</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { onSelect(""); onClose(); }}>
            <Text style={{ color: colors.muted, fontWeight: "900", fontSize: 14 }}>Borrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
