import { memo, useMemo, useCallback, useRef } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { styles } from "../../styles/globalStyles";
import { useColors } from "../../theme/ThemeContext";
import { dark } from "../../theme/colors";
import { Tab, MaterialIconName } from "../../types";
import { UiCopy } from "../../i18n";
import { Text } from "../ui/AppText";

function usePressAnimation(durationIn = 70, durationOut = 110) {
  const pressed = useRef(new Animated.Value(0)).current;
  const onPressIn = useCallback(() => {
    Animated.timing(pressed, {
      toValue: 1,
      duration: durationIn,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pressed, durationIn]);
  const onPressOut = useCallback(() => {
    Animated.timing(pressed, {
      toValue: 0,
      duration: durationOut,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pressed, durationOut]);
  return { pressed, onPressIn, onPressOut };
}

function withAlpha(hex: string, alpha: number) {
  if (!hex.startsWith("#") || (hex.length !== 7 && hex.length !== 4)) return hex;
  const expanded =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
  const value = Number.parseInt(expanded.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const BottomNav = memo(function BottomNav({
  copy,
  tab,
  setTab,
  onAdd,
  onSearch,
}: {
  copy: UiCopy;
  tab: Tab;
  setTab: (tab: Tab) => void;
  onAdd: () => void;
  onSearch: () => void;
}) {
  const { card, borderStrong, bg } = useColors();
  const isDark = useMemo(() => bg === dark.bg, [bg]);
  const glassSurface = useMemo(
    () => (isDark ? withAlpha(card, 0.72) : withAlpha(card, 0.96)),
    [isDark, card],
  );
  const borderAlpha = useMemo(
    () => withAlpha(borderStrong, isDark ? 0.26 : 0.54),
    [isDark, borderStrong],
  );
  const selectTab = useCallback(
    (next: Tab) => {
      if (next === tab) return;
      setTab(next);
    },
    [tab, setTab],
  );

  return (
    <View style={styles.bottomNav}>
      <View
        pointerEvents="none"
        style={[
          styles.bottomNavGlass,
          {
            backgroundColor: glassSurface,
            borderColor: borderAlpha,
          },
        ]}
      />
      <View style={styles.bottomNavContent}>
        <BottomNavItem
          active={tab === "expenses"}
          icon="view-dashboard-outline"
          label={copy.expenses}
          onPress={() => selectTab("expenses")}
        />
        <BottomNavItem
          active={false}
          optimisticActive={false}
          icon="magnify"
          label={copy.search}
          onPress={onSearch}
        />
        <BottomAddButton onPress={onAdd} />
        <BottomNavItem
          active={tab === "summary"}
          icon="chart-line"
          label={copy.summary}
          onPress={() => selectTab("summary")}
        />
        <BottomNavItem
          active={tab === "settings"}
          icon="cog-outline"
          label={copy.settings}
          onPress={() => selectTab("settings")}
        />
      </View>
    </View>
  );
});

const BottomNavItem = memo(function BottomNavItem({
  active,
  optimisticActive = true,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  optimisticActive?: boolean;
  icon: MaterialIconName;
  label: string;
  onPress: () => void;
}) {
  const { primary, primarySoft, muted, text } = useColors();
  const accent = active ? primary : muted;
  const { pressed, onPressIn, onPressOut } = usePressAnimation();
  const localActive = useRef(new Animated.Value(active ? 1 : 0)).current;
  const prevActive = useRef(active);

  if (active !== prevActive.current) {
    prevActive.current = active;
    localActive.stopAnimation();
    localActive.setValue(active ? 1 : 0);
  }

  const handlePress = useCallback(() => {
    localActive.stopAnimation();
    if (optimisticActive) localActive.setValue(1);
    onPress();
  }, [localActive, onPress, optimisticActive]);

  return (
    <Animated.View
      style={{
        flex: 1,
        minWidth: 0,
        opacity: pressed.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.82],
        }),
        transform: [
          {
            scale: pressed.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.97],
            }),
          },
        ],
      }}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.bottomNavItem}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderRadius: 14,
            backgroundColor: primarySoft,
            opacity: localActive,
          }}
        />
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderRadius: 14,
            backgroundColor: primarySoft,
            opacity: pressed,
          }}
        />
        <MaterialCommunityIcons name={icon} size={21} color={accent} />
        <Text
          numberOfLines={1}
          style={[styles.bottomNavLabel, { color: active ? text : muted }]}
        >
          {label}
        </Text>
        <Animated.View
          style={{
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: primary,
            marginTop: -2,
            opacity: localActive,
          }}
        />
      </Pressable>
    </Animated.View>
  );
});

const BottomAddButton = memo(function BottomAddButton({ onPress }: { onPress: () => void }) {
  const { primary, onPrimary } = useColors();
  const { pressed, onPressIn, onPressOut } = usePressAnimation();

  return (
    <Animated.View
      style={[
        styles.bottomAddButton,
        {
          backgroundColor: primary,
          opacity: pressed.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0.84],
          }),
          transform: [
            { translateY: -16 },
            {
              scale: pressed.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0.95],
              }),
            },
          ],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={{
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 17,
        }}
      >
        <MaterialCommunityIcons name="plus" size={31} color={onPrimary} />
      </Pressable>
    </Animated.View>
  );
});

