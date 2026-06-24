import { useCallback, useRef, useState } from "react";
import { Animated, Easing, Keyboard, Modal, Pressable, ScrollView, TouchableOpacity, useWindowDimensions, View, ViewStyle } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { useModalTransition } from "./useModalTransition";
import { Text } from "./AppText";

type SelectOption = { label: string; value: string; color?: string; softBg?: string };

export function Select({ value, options, onSelect, colors, placeholder, style, title }: {
  value: string; options: SelectOption[]; onSelect: (v: string) => void; colors: Palette;
  placeholder?: string; style?: ViewStyle; title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuFrame, setMenuFrame] = useState({ left: 12, menuTop: 124, width: 180, maxHeight: 240 });
  const triggerRef = useRef<View>(null);
  const pendingSelection = useRef<string | null>(null);
  const pressed = useRef(new Animated.Value(0)).current;
  const windowSize = useWindowDimensions();
  const transition = useModalTransition(open, 6, 0.99, () => {
    const next = pendingSelection.current;
    pendingSelection.current = null;
    if (next !== null) onSelect(next);
  });
  const selected = options.find((o) => o.value === value);
  const label = selected ? selected.label : placeholder;
  const measureMenu = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      const margin = 12;
      const gap = 2;
      const panelWidth = Math.min(width, windowSize.width - margin * 2);
      const left = Math.min(Math.max(margin, x), windowSize.width - panelWidth - margin);
      const maxAllowedHeight = Math.min(220, windowSize.height - margin * 2);
      const anchorTop = y;
      const belowSpace = windowSize.height - anchorTop - height - gap - margin;
      const aboveSpace = anchorTop - gap - margin;
      const openAbove = belowSpace < 150 && aboveSpace > belowSpace;
      const maxHeight = Math.max(120, Math.min(maxAllowedHeight, openAbove ? aboveSpace : belowSpace));
      const menuTop = openAbove
        ? Math.max(margin, anchorTop - maxHeight - gap)
        : Math.min(windowSize.height - margin - maxHeight, anchorTop + height + gap);
      setMenuFrame({ left, menuTop, width: panelWidth, maxHeight });
    });
  }, [windowSize.height, windowSize.width]);
  const openMenu = () => {
    Keyboard.dismiss();
    setOpen(true);
    requestAnimationFrame(measureMenu);
  };
  const animatePress = (toValue: number, duration: number) => {
    pressed.stopAnimation();
    Animated.timing(pressed, { toValue, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  return (
    <View ref={triggerRef} collapsable={false} onLayout={measureMenu} style={style}>
      <Animated.View style={{ opacity: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }), transform: [{ scale: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.985] }) }] }}>
        <Pressable
          style={[styles.selectButton, { backgroundColor: colors.input, borderColor: colors.border }]}
          onPress={openMenu}
          onPressIn={() => animatePress(1, 70)}
          onPressOut={() => animatePress(0, 110)}
          accessibilityLabel={title || placeholder || label}
        >
          {selected?.color && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: selected.color }} />}
          <Text numberOfLines={1} style={[styles.selectButtonText, { color: selected?.color || (selected ? colors.text : colors.muted) }]}>{label}</Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={colors.muted} />
        </Pressable>
      </Animated.View>

      {transition.modalVisible && <Modal visible transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Animated.View style={[styles.selectModalOverlay, transition.containerStyle]}>
          <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={() => setOpen(false)} />
          <Animated.View
            style={[
              styles.selectMenu,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                left: menuFrame.left,
                top: menuFrame.menuTop,
                width: menuFrame.width,
                maxHeight: menuFrame.maxHeight,
              },
              transition.panelStyle,
            ]}
          >
            <ScrollView
              style={styles.selectMenuList}
              contentContainerStyle={styles.selectMenuContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="always"
            >
              {options.map((opt) => {
                const isSelected = opt.value === value;
                const optionColor = opt.color || colors.primary;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.selectOptionRow,
                      { backgroundColor: isSelected ? opt.softBg || colors.primarySoft : "transparent" },
                    ]}
                    onPress={() => {
                      pendingSelection.current = opt.value;
                      setOpen(false);
                    }}
                  >
                    {opt.color && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: optionColor }} />}
                    <Text numberOfLines={1} style={[styles.selectOptionLabel, { color: isSelected ? optionColor : colors.text }]}>{opt.label}</Text>
                    {isSelected && <MaterialCommunityIcons name="check" size={16} color={optionColor} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </Modal>}
    </View>
  );
}
