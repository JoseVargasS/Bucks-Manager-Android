import { Modal, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { SearchFilters, Tag } from "../../types";
import { SearchPage } from "../screens/SearchPage";
import { UiCopy } from "../../i18n";

export function SearchModal({ visible, colors, copy, currencySymbol, tags, filters, setFilters, onClose, onClear, onSubmit }: {
  visible: boolean; colors: Palette; copy: UiCopy; currencySymbol: string; tags: Tag[]; filters: SearchFilters; setFilters: (f: SearchFilters) => void;
  onClose: () => void; onClear: () => void; onSubmit: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={[styles.searchOverlay, { backgroundColor: colors.overlay }]}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.searchSheet, { backgroundColor: colors.card }]}>
          <View style={[styles.searchGrabber, { backgroundColor: colors.border }]} />
          <View style={styles.searchHeader}>
            <View style={[styles.searchHeaderIcon, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons name="magnify" size={21} color={colors.primary} />
            </View>
            <View style={styles.searchTitleBlock}>
              <Text style={[styles.searchTitle, { color: colors.text }]}>{copy.advancedSearch}</Text>
              <Text style={[styles.searchSubtitle, { color: colors.muted }]}>{copy.advancedSearchSubtitle}</Text>
            </View>
            <TouchableOpacity style={[styles.optionClose, { backgroundColor: colors.input }]} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
          <SearchPage colors={colors} copy={copy} currencySymbol={currencySymbol} tags={tags} filters={filters} setFilters={setFilters} onSubmit={onSubmit} onClear={onClear} />
        </View>
      </View>
    </Modal>
  );
}
