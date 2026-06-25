import { memo, useRef, useMemo, useCallback } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { styles } from "../../styles/globalStyles";
import { useColor } from "../../theme/ThemeContext";
import { dark } from "../../theme/colors";
import { Tab, MaterialIconName } from "../../types";
import { UiCopy } from "../../i18n";
import { Text } from "../ui/AppText";

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
  const card = useColor("card");
  const borderStrong = useColor("borderStrong");
  const bg = useColor("bg");
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
  const primary = useColor("primary");
  const primarySoft = useColor("primarySoft");

  const pressed = useRef(new Animated.Value(0)).current;
  const localActive = useRef(new Animated.Value(active ? 1 : 0)).current;
  const prevActive = useRef(active);

  // Sync local active with prop when parent updates
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

  const handlePressIn = useCallback(() => {
    Animated.timing(pressed, {
      toValue: 1,
      duration: 70,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pressed]);

  const handlePressOut = useCallback(() => {
    Animated.timing(pressed, {
      toValue: 0,
      duration: 110,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pressed]);

  const iconColor = useColor(active ? "primary" : "muted");
  const textColor = useColor(active ? "text" : "muted");

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
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
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
        <MaterialCommunityIcons name={icon} size={21} color={iconColor} />
        <Text
          numberOfLines={1}
          style={[styles.bottomNavLabel, { color: textColor }]}
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

function BottomAddButton({ onPress }: { onPress: () => void }) {
  const primary = useColor("primary");
  const onPrimary = useColor("onPrimary");
  const pressed = useRef(new Animated.Value(0)).current;

  const handlePressIn = useCallback(() => {
    Animated.timing(pressed, {
      toValue: 1,
      duration: 70,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pressed]);

  const handlePressOut = useCallback(() => {
    Animated.timing(pressed, {
      toValue: 0,
      duration: 110,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pressed]);

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
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
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
}

function withAlpha(hex: string, alpha: number) {
  if (!hex.startsWith("#") || (hex.length !== 7 && hex.length !== 4))
    return hex;
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
