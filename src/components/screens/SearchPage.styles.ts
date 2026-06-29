import { StyleSheet } from "react-native";

export const searchPageStyles = StyleSheet.create({
  searchBody: { flexShrink: 1 },
  searchScrollContent: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 12,
    gap: 10,
  },
  searchSection: { borderWidth: 0, borderRadius: 14, padding: 12, gap: 10 },
  searchSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchSectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  searchFieldGrid: { flexDirection: "row", gap: 10 },
  searchActions: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    flexDirection: "row",
    gap: 10,
  },
  searchActionBtn: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  searchActionPrimary: { borderWidth: 0 },
  searchActionText: { fontSize: 14, fontWeight: "700" },
});
