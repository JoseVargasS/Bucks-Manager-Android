import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Animated, Modal, TouchableOpacity, View, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { MaterialIconName } from "../../types";
import { useModalTransition } from "../ui/useModalTransition";
import { Text } from "../ui/AppText";

type PickerOption = { label: string; value: string; icon?: MaterialIconName; tone?: string; fontFamily?: string };
type PickerConfig = { title: string; options: PickerOption[]; selectedValue: string; onSelect: (value: string) => void };
export type OptionSheetHandle = { open: (config: PickerConfig) => void; close: () => void };

export const OptionSheet = forwardRef<OptionSheetHandle, { colors: Palette }>(function OptionSheet({ colors }, ref) {
  const [config, setConfig] = useState<PickerConfig | null>(null);
  const [visible, setVisible] = useState(false);
  const pendingSelection = useRef<{ value: string; onSelect: (value: string) => void } | null>(null);
  const close = useCallback(() => setVisible(false), []);
  const transition = useModalTransition(visible, 24, 1, () => {
    const pending = pendingSelection.current;
    pendingSelection.current = null;
    if (pending) pending.onSelect(pending.value);
  });
  useImperativeHandle(ref, () => ({
    open(next) {
      pendingSelection.current = null;
      setConfig(next);
      setVisible(true);
    },
    close,
  }), [close]);

  if (!config || !transition.modalVisible) return null;
  return (
    <Modal visible={transition.modalVisible} transparent animationType="none" onRequestClose={close}>
      <Animated.View style={[styles.optionOverlay, { backgroundColor: colors.overlay }, transition.containerStyle]}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={close} />
        <Animated.View style={[styles.optionSheet, { backgroundColor: colors.card }, transition.panelStyle]}>
          <View style={[styles.optionHeader, { borderColor: colors.border }]}>
            <Text style={[styles.optionTitle, { color: colors.text }]}>{config.title}</Text>
            <TouchableOpacity style={[styles.optionClose, { backgroundColor: colors.input }]} onPress={close}>
              <MaterialCommunityIcons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.optionList} contentContainerStyle={styles.optionListContent} showsVerticalScrollIndicator={false}>
            {config.options.map((option) => {
              const selected = option.value === config.selectedValue;
              const tone = option.tone || colors.primary;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionRow,
                    { backgroundColor: selected ? colors.primarySoft : colors.input },
                  ]}
                  onPress={() => {
                    pendingSelection.current = { value: option.value, onSelect: config.onSelect };
                    close();
                  }}
                >
                  <View style={[styles.optionIcon, { backgroundColor: selected ? colors.primarySoft : colors.card }]}>
                    <MaterialCommunityIcons name={option.icon || "chevron-right"} size={19} color={tone} />
                  </View>
                  <Text numberOfLines={1} style={[styles.optionLabel, { color: selected ? colors.primary : colors.text, fontFamily: option.fontFamily, fontWeight: option.value === "light" ? "400" : "600" }]}>{option.label}</Text>
                  {selected && <MaterialCommunityIcons name="check" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
});

export type { PickerConfig };
