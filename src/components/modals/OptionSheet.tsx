import { useLayoutEffect, useRef, useState } from "react";
import { Animated, Modal, TouchableOpacity, View, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { MaterialIconName } from "../../types";
import { useModalTransition } from "../ui/useModalTransition";
import { Text } from "../ui/AppText";

type PickerOption = { label: string; value: string; icon?: MaterialIconName; tone?: string; fontFamily?: string };
type PickerConfig = { title: string; options: PickerOption[]; selectedValue: string; onSelect: (value: string) => void } | null;

export function OptionSheet({ config, colors, onClose }: { config: PickerConfig; colors: Palette; onClose: () => void }) {
  const [displayConfig, setDisplayConfig] = useState(config);
  const pendingSelection = useRef<{ value: string; onSelect: (value: string) => void } | null>(null);
  const transition = useModalTransition(Boolean(config), 24, 1, () => {
    const pending = pendingSelection.current;
    pendingSelection.current = null;
    if (pending) pending.onSelect(pending.value);
  });
  const current = config || displayConfig;

  useLayoutEffect(() => {
    if (config) setDisplayConfig(config);
  }, [config]);

  if (!current || !transition.modalVisible) return null;
  return (
    <Modal visible={transition.modalVisible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.optionOverlay, { backgroundColor: colors.overlay }, transition.containerStyle]}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.optionSheet, { backgroundColor: colors.card }, transition.panelStyle]}>
          <View style={[styles.optionHeader, { borderColor: colors.border }]}>
            <Text style={[styles.optionTitle, { color: colors.text }]}>{current.title}</Text>
            <TouchableOpacity style={[styles.optionClose, { backgroundColor: colors.input }]} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.optionList} contentContainerStyle={styles.optionListContent} showsVerticalScrollIndicator={false}>
            {current.options.map((option) => {
              const selected = option.value === current.selectedValue;
              const tone = option.tone || colors.primary;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionRow,
                    { backgroundColor: selected ? colors.primarySoft : colors.input },
                  ]}
                  onPress={() => {
                    pendingSelection.current = { value: option.value, onSelect: current.onSelect };
                    onClose();
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
}

export type { PickerConfig };
