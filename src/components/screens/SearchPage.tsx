import { useRef, useState } from "react";
import { Modal, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Field } from "../ui/Field";
import { Palette } from "../../theme/colors";
import { SearchFilters, Tag } from "../../types";
import { UiCopy } from "../../i18n";
import { tagTextColor } from "../../utils/tags";

export function SearchPage({ colors, copy, currencySymbol, tags, filters, setFilters, onSubmit, onClear }: {
  colors: Palette; copy: UiCopy; currencySymbol: string; tags: Tag[]; filters: SearchFilters; setFilters: (f: SearchFilters) => void;
  onSubmit: () => void; onClear: () => void;
}) {
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagsFrame, setTagsFrame] = useState({ left: 14, top: 120, width: 320 });
  const tagsRef = useRef<View>(null);
  const windowSize = useWindowDimensions();
  return (
    <View style={styles.searchBody}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.searchScrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.searchSection, { backgroundColor: colors.input }]}>
          <View style={styles.searchSectionHeader}>
            <MaterialCommunityIcons name="text-search" size={18} color={colors.primary} />
            <Text style={[styles.searchSectionTitle, { color: colors.text }]}>{copy.detail}</Text>
          </View>
          <Field
            label={copy.descriptionDetail}
            value={filters.text}
            onChangeText={(text: string) => setFilters({ ...filters, text })}
            colors={colors}
            placeholder={copy.descriptionPlaceholder}
            rightIcon="text"
          />
        </View>

        {tags.length > 0 && (
          <View style={[styles.searchSection, { backgroundColor: colors.input }]}>
            <View style={styles.searchSectionHeader}>
              <MaterialCommunityIcons name="tag-multiple" size={18} color={colors.primary} />
              <Text style={[styles.searchSectionTitle, { color: colors.text }]}>{copy.tagsTitle}</Text>
            </View>
            <TouchableOpacity
              ref={tagsRef}
              onPress={() => {
                tagsRef.current?.measureInWindow((x, y, width, height) => {
                  const dropdownHeight = 150;
                  setTagsFrame({ left: x, top: Math.min(y + height + 4, windowSize.height - dropdownHeight - 12), width });
                  setTagsOpen(true);
                });
              }}
              style={{ minHeight: 42, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text numberOfLines={1} style={{ flex: 1, color: filters.tag ? colors.text : colors.muted, fontWeight: "600" }}>{filters.tag || copy.tagsTitle}</Text>
              <MaterialCommunityIcons name={tagsOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.searchSection, { backgroundColor: colors.input }]}>
          <View style={styles.searchSectionHeader}>
            <MaterialCommunityIcons name="cash-multiple" size={18} color={colors.primary} />
            <Text style={[styles.searchSectionTitle, { color: colors.text }]}>{copy.amount}</Text>
          </View>
          <View style={styles.searchFieldGrid}>
            <Field
              label={copy.minAmount}
              value={filters.minAmount}
              onChangeText={(minAmount: string) => setFilters({ ...filters, minAmount })}
              colors={colors}
              placeholder={`${currencySymbol} 0`}
              rightIcon="cash-minus"
            />
            <Field
              label={copy.maxAmount}
              value={filters.maxAmount}
              onChangeText={(maxAmount: string) => setFilters({ ...filters, maxAmount })}
              colors={colors}
              placeholder={`${currencySymbol} 500`}
              rightIcon="cash-plus"
            />
          </View>
        </View>

        <View style={[styles.searchSection, { backgroundColor: colors.input }]}>
          <View style={styles.searchSectionHeader}>
            <MaterialCommunityIcons name="calendar-range" size={18} color={colors.primary} />
            <Text style={[styles.searchSectionTitle, { color: colors.text }]}>{copy.dates}</Text>
          </View>
          <View style={styles.searchFieldGrid}>
            <Field
              label={copy.from}
              value={filters.startDate}
              onChangeText={(startDate: string) => setFilters({ ...filters, startDate })}
              colors={colors}
              placeholder="YYYY-MM-DD"
              rightIcon="calendar-start"
            />
            <Field
              label={copy.to}
              value={filters.endDate}
              onChangeText={(endDate: string) => setFilters({ ...filters, endDate })}
              colors={colors}
              placeholder="YYYY-MM-DD"
              rightIcon="calendar-end"
            />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.searchActions, { borderColor: colors.border }]}>
        <TouchableOpacity style={[styles.searchActionBtn, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={onClear}>
          <MaterialCommunityIcons name="filter-remove-outline" size={19} color={colors.text} />
          <Text style={[styles.searchActionText, { color: colors.text }]}>{copy.clear}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.searchActionBtn, styles.searchActionPrimary, { backgroundColor: colors.primary }]} onPress={onSubmit}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.onPrimary} />
          <Text style={[styles.searchActionText, { color: colors.onPrimary }]}>{copy.search}</Text>
        </TouchableOpacity>
      </View>
      <Modal visible={tagsOpen} transparent animationType="none" onRequestClose={() => setTagsOpen(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setTagsOpen(false)} style={{ flex: 1 }}>
          <View onStartShouldSetResponder={() => true} style={{ position: "absolute", left: tagsFrame.left, top: tagsFrame.top, width: tagsFrame.width, maxHeight: 150, padding: 8, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: "row", flexWrap: "wrap", gap: 6, elevation: 12 }}>
            {tags.map((tag) => {
              const selected = filters.tag === tag.label;
              const textColor = tagTextColor(tag.color);
              return (
                <TouchableOpacity
                  key={tag.id}
                  onPress={() => {
                    setFilters({ ...filters, tag: selected ? "" : tag.label });
                    setTagsOpen(false);
                  }}
                  style={{ maxWidth: "48%", height: 32, paddingHorizontal: 9, borderRadius: 8, borderWidth: 2, borderColor: selected ? colors.text : "transparent", backgroundColor: tag.color, opacity: selected ? 1 : 0.72, flexDirection: "row", alignItems: "center" }}
                >
                  <Text numberOfLines={1} style={{ flexShrink: 1, color: textColor, fontWeight: "700", fontSize: 12 }}>{tag.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
