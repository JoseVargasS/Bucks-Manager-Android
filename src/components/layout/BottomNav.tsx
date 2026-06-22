import { memo, type RefObject } from "react";
import { Pressable, View } from "react-native";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { Tab, MaterialIconName } from "../../types";
import { UiCopy } from "../../i18n";
import { Text } from "../ui/AppText";

export const BottomNav = memo(function BottomNav({ colors, copy, tab, setTab, onAdd, onSearch, blurTarget }: {
  colors: Palette; copy: UiCopy; tab: Tab; setTab: (tab: Tab) => void; onAdd: () => void; onSearch: () => void; blurTarget: RefObject<View | null>;
}) {
  const isDark = colors.bg === "#0f1117";
  const glassSurface = isDark ? withAlpha(colors.card, 0.72) : withAlpha(colors.card, 0.96);
  const selectTab = (next: Tab) => {
    if (next !== tab) setTab(next);
  };
  return (
    <View style={styles.bottomNav}>
      {isDark ? (
        <BlurView
          pointerEvents="none"
          blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={28}
          tint="dark"
          style={[styles.bottomNavGlass, { backgroundColor: glassSurface, borderColor: withAlpha(colors.borderStrong, 0.26) }]}
        />
      ) : (
        <View pointerEvents="none" style={[styles.bottomNavGlass, { backgroundColor: glassSurface, borderColor: withAlpha(colors.borderStrong, 0.54) }]} />
      )}
      <View style={styles.bottomNavContent}>
        <BottomNavItem colors={colors} active={tab === "expenses"} icon="view-dashboard-outline" label={copy.expenses} onPress={() => selectTab("expenses")} />
        <BottomNavItem colors={colors} active={false} icon="magnify" label={copy.search} onPress={onSearch} />
        <Pressable onPressIn={onAdd} style={[styles.bottomAddButton, { backgroundColor: colors.primary }]}>
          <MaterialCommunityIcons name="plus" size={31} color={colors.onPrimary} />
        </Pressable>
        <BottomNavItem colors={colors} active={tab === "summary"} icon="chart-line" label={copy.summary} onPress={() => selectTab("summary")} />
        <BottomNavItem colors={colors} active={tab === "settings"} icon="cog-outline" label={copy.settings} onPress={() => selectTab("settings")} />
      </View>
    </View>
  );
});

function BottomNavItem({ colors, active, icon, label, onPress }: { colors: Palette; active: boolean; icon: MaterialIconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPressIn={onPress} style={({ pressed }) => [styles.bottomNavItem, (active || pressed) && { backgroundColor: colors.primarySoft }]}>
      <MaterialCommunityIcons name={icon} size={21} color={active ? colors.primary : colors.muted} />
      <Text numberOfLines={1} style={[styles.bottomNavLabel, { color: active ? colors.text : colors.muted }]}>{label}</Text>
      {active && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary, marginTop: -2 }} />}
    </Pressable>
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
