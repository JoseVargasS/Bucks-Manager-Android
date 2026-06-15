import { Modal, Text, TouchableOpacity, View, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { MaterialIconName } from "../../types";

type PickerOption = { label: string; value: string; icon?: MaterialIconName; tone?: string };
type PickerConfig = { title: string; options: PickerOption[]; selectedValue: string; onSelect: (value: string) => void } | null;

export function OptionSheet({ config, colors, onClose }: { config: PickerConfig; colors: Palette; onClose: () => void }) {
  if (!config) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.optionOverlay}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.optionSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.optionHeader, { borderColor: colors.border }]}>
            <Text style={[styles.optionTitle, { color: colors.text }]}>{config.title}</Text>
            <TouchableOpacity style={[styles.optionClose, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={onClose}>
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
                    { backgroundColor: selected ? colors.primarySoft : colors.input, borderColor: selected ? colors.primary : colors.border },
                  ]}
                  onPress={() => {
                    config.onSelect(option.value);
                    onClose();
                  }}
                >
                  <View style={[styles.optionIcon, { backgroundColor: selected ? colors.primarySoft : colors.card, borderColor: tone }]}>
                    <MaterialCommunityIcons name={option.icon || "chevron-right"} size={19} color={tone} />
                  </View>
                  <Text numberOfLines={1} style={[styles.optionLabel, { color: selected ? colors.primary : colors.text }]}>{option.label}</Text>
                  {selected && <MaterialCommunityIcons name="check" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export type { PickerConfig, PickerOption };
