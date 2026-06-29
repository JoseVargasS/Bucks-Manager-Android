import { StyleSheet } from "react-native";

export const optionSheetStyles = StyleSheet.create({
  optionOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  optionHeader: {
    minHeight: 62,
    borderBottomWidth: 1,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  optionTitle: { flex: 1, minWidth: 0, fontSize: 19, fontWeight: "700" },
  optionClose: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  optionList: { flexShrink: 1 },
  optionListContent: { padding: 14, gap: 8, paddingBottom: 22 },
  optionRow: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 0,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  optionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: "600" },
});
