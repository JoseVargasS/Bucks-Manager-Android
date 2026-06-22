import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Animated, BackHandler, Keyboard, StyleSheet, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { SearchFilters, Tag } from "../../types";
import { SearchPage } from "../screens/SearchPage";
import { UiCopy } from "../../i18n";
import { useModalTransition } from "../ui/useModalTransition";
import { Text } from "../ui/AppText";

export type SearchModalHandle = { open: (filters: SearchFilters) => void; close: () => void };

export const SearchModal = forwardRef<SearchModalHandle, {
  colors: Palette; copy: UiCopy; currencySymbol: string; tags: Tag[];
  onClear: () => void; onSubmit: (filters: SearchFilters) => void;
}>(function SearchModal({ colors, copy, currencySymbol, tags, onClear, onSubmit }, ref) {
  const [visible, setVisible] = useState(false);
  const [localFilters, setLocalFilters] = useState<SearchFilters>({ text: "", tag: "", minAmount: "", maxAmount: "", startDate: "", endDate: "" });
  const pendingAction = useRef<(() => void) | null>(null);
  const transition = useModalTransition(visible, 24, 1, () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  });
  const close = useCallback(() => {
    Keyboard.dismiss();
    setVisible(false);
  }, []);

  useImperativeHandle(ref, () => ({
    open(filters) {
      setLocalFilters(filters);
      setVisible(true);
    },
    close,
  }), [close]);

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close, visible]);

  if (!transition.modalVisible) return null;
  return (
      <Animated.View
        pointerEvents={transition.modalVisible ? "auto" : "none"}
        accessibilityViewIsModal={visible}
        importantForAccessibility={transition.modalVisible ? "yes" : "no-hide-descendants"}
        style={[StyleSheet.absoluteFill, styles.searchOverlay, { backgroundColor: colors.overlay, zIndex: 1002, elevation: 1002 }, transition.containerStyle]}
      >
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={close} />
        <Animated.View style={[styles.searchSheet, { backgroundColor: colors.card }, transition.panelStyle]}>
          <View style={[styles.searchGrabber, { backgroundColor: colors.border }]} />
          <View style={styles.searchHeader}>
            <View style={[styles.searchHeaderIcon, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons name="magnify" size={21} color={colors.primary} />
            </View>
            <View style={styles.searchTitleBlock}>
              <Text style={[styles.searchTitle, { color: colors.text }]}>{copy.advancedSearch}</Text>
              <Text style={[styles.searchSubtitle, { color: colors.muted }]}>{copy.advancedSearchSubtitle}</Text>
            </View>
            <TouchableOpacity style={[styles.optionClose, { backgroundColor: colors.input }]} onPress={close}>
              <MaterialCommunityIcons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
          <SearchPage colors={colors} copy={copy} currencySymbol={currencySymbol} tags={tags} filters={localFilters} setFilters={setLocalFilters} onSubmit={() => { const filters = localFilters; pendingAction.current = () => onSubmit(filters); close(); }} onClear={() => { pendingAction.current = onClear; close(); }} />
        </Animated.View>
      </Animated.View>
  );
});
