import { memo, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { Tab, MaterialIconName } from "../../types";
import { UiCopy } from "../../i18n";
import { Text } from "../ui/AppText";

export const BottomNav = memo(function BottomNav({ colors, copy, tab, setTab, onAdd, onSearch }: {
  colors: Palette; copy: UiCopy; tab: Tab; setTab: (tab: Tab) => void; onAdd: () => void; onSearch: () => void;
}) {
  const [visualTab, setVisualTab] = useState(tab);
  const isDark = colors.bg === "#0f1117";
  const glassSurface = isDark ? withAlpha(colors.card, 0.72) : withAlpha(colors.card, 0.96);
  useEffect(() => setVisualTab(tab), [tab]);
  const selectTab = (next: Tab) => {
    if (next === visualTab) return;
    setVisualTab(next);
    setTab(next);
  };
  return (
    <View style={styles.bottomNav}>
      <View pointerEvents="none" style={[styles.bottomNavGlass, { backgroundColor: glassSurface, borderColor: withAlpha(colors.borderStrong, isDark ? 0.26 : 0.54) }]} />
      <View style={styles.bottomNavContent}>
        <BottomNavItem colors={colors} active={visualTab === "expenses"} icon="view-dashboard-outline" label={copy.expenses} onPress={() => selectTab("expenses")} />
        <BottomNavItem colors={colors} active={false} icon="magnify" label={copy.search} onPress={onSearch} />
        <BottomAddButton colors={colors} onPress={onAdd} />
        <BottomNavItem colors={colors} active={visualTab === "summary"} icon="chart-line" label={copy.summary} onPress={() => selectTab("summary")} />
        <BottomNavItem colors={colors} active={visualTab === "settings"} icon="cog-outline" label={copy.settings} onPress={() => selectTab("settings")} />
      </View>
    </View>
  );
});

function BottomNavItem({ colors, active, icon, label, onPress }: { colors: Palette; active: boolean; icon: MaterialIconName; label: string; onPress: () => void }) {
  const pressed = useRef(new Animated.Value(0)).current;
  const activeProgress = useRef(new Animated.Value(active ? 1 : 0)).current;
  const animate = (toValue: number, duration: number) => {
    pressed.stopAnimation();
    Animated.timing(pressed, { toValue, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  useEffect(() => {
    activeProgress.stopAnimation();
    Animated.timing(activeProgress, { toValue: active ? 1 : 0, duration: 170, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [active, activeProgress]);

  return (
    <Animated.View style={{ flex: 1, minWidth: 0, opacity: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }), transform: [{ scale: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) }] }}>
      <Pressable onPress={onPress} onPressIn={() => animate(1, 70)} onPressOut={() => animate(0, 110)} style={styles.bottomNavItem}>
        <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: 14, backgroundColor: colors.primarySoft, opacity: activeProgress }} />
        <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: 14, backgroundColor: colors.primarySoft, opacity: pressed }} />
        <MaterialCommunityIcons name={icon} size={21} color={active ? colors.primary : colors.muted} />
        <Text numberOfLines={1} style={[styles.bottomNavLabel, { color: active ? colors.text : colors.muted }]}>{label}</Text>
        <Animated.View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary, marginTop: -2, opacity: activeProgress, transform: [{ scale: activeProgress }] }} />
      </Pressable>
    </Animated.View>
  );
}

function BottomAddButton({ colors, onPress }: { colors: Palette; onPress: () => void }) {
  const pressed = useRef(new Animated.Value(0)).current;
  const animate = (toValue: number, duration: number) => {
    pressed.stopAnimation();
    Animated.timing(pressed, { toValue, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  return (
    <Animated.View style={[styles.bottomAddButton, { backgroundColor: colors.primary, opacity: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.84] }), transform: [{ translateY: -16 }, { scale: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.95] }) }] }]}>
      <Pressable onPress={onPress} onPressIn={() => animate(1, 70)} onPressOut={() => animate(0, 110)} style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center", borderRadius: 17 }}>
        <MaterialCommunityIcons name="plus" size={31} color={colors.onPrimary} />
      </Pressable>
    </Animated.View>
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
