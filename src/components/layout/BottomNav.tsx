import type { RefObject } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { MaterialIconName } from "../../types";

type Tab = "expenses" | "search" | "summary" | "settings";

export function BottomNav({ colors, tab, setTab, onAdd, onSearch, blurTarget }: {
  colors: Palette; tab: Tab; setTab: (tab: Tab) => void; onAdd: () => void; onSearch: () => void; blurTarget: RefObject<View | null>;
}) {
  const isDark = colors.bg === "#0f1117";
  const glassSurface = withAlpha(colors.card, isDark ? 0.72 : 0.82);
  return (
    <BlurView
      blurTarget={blurTarget}
      blurMethod="dimezisBlurViewSdk31Plus"
      intensity={isDark ? 28 : 36}
      tint={isDark ? "dark" : "light"}
      style={[styles.bottomNav, { backgroundColor: glassSurface, borderColor: withAlpha(colors.borderStrong, isDark ? 0.26 : 0.36) }]}
    >
      <BottomNavItem colors={colors} active={tab === "expenses"} icon="view-dashboard-outline" label="Gastos" onPress={() => setTab("expenses")} />
      <BottomNavItem colors={colors} active={false} icon="magnify" label="Buscar" onPress={onSearch} />
      <TouchableOpacity onPress={onAdd} style={[styles.bottomAddButton, { backgroundColor: colors.primary }]}>
        <MaterialCommunityIcons name="plus" size={31} color={colors.onPrimary} />
      </TouchableOpacity>
      <BottomNavItem colors={colors} active={tab === "summary"} icon="chart-line" label="Análisis" onPress={() => setTab("summary")} />
      <BottomNavItem colors={colors} active={tab === "settings"} icon="cog-outline" label="Ajustes" onPress={() => setTab("settings")} />
    </BlurView>
  );
}

function BottomNavItem({ colors, active, icon, label, onPress }: { colors: Palette; active: boolean; icon: MaterialIconName; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.bottomNavItem, active && { backgroundColor: colors.primarySoft }]}>
      <MaterialCommunityIcons name={icon} size={21} color={active ? colors.primary : colors.muted} />
      <Text numberOfLines={1} style={[styles.bottomNavLabel, { color: active ? colors.primary : colors.muted }]}>{label}</Text>
      {active && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary, marginTop: -2 }} />}
    </TouchableOpacity>
  );
}

function withAlpha(hex: string, alpha: number) {
  if (!hex.startsWith("#") || (hex.length !== 7 && hex.length !== 4)) return hex;
  const expanded = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const value = Number.parseInt(expanded.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
