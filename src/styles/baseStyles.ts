import { StyleSheet } from "react-native";

/** Shared styles used across multiple components */
export const base = StyleSheet.create({
  // Layout
  pageScroll: { paddingBottom: 136 },
  pageScrollMobile: { paddingHorizontal: 14 },

  // Modal base
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.62)",
    justifyContent: "center",
    padding: 14,
  },
  modal: {
    borderRadius: 8,
    padding: 16,
    maxWidth: 620,
    maxHeight: "90%",
    width: "100%",
    alignSelf: "center",
  },
  optionBackdrop: { ...StyleSheet.absoluteFill },

  // Record modal shared
  recordHeader: {
    minHeight: 68,
    borderBottomWidth: 1,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  recordTitle: { flex: 1, minWidth: 0, fontSize: 19, fontWeight: "700" },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  // Form shared
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: "500",
  },
  inputIcon: { position: "absolute", right: 14, top: 12 },

  // Select shared
  selectMenu: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  selectMenuList: { flexShrink: 1 },
  selectMenuContent: { paddingVertical: 4 },
  selectOptionRow: {
    minHeight: 36,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  selectOptionLabel: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: "600" },

  // Shared text/layout
  empty: { padding: 18, textAlign: "center", fontWeight: "500" },
  mobileEmptyCard: { borderWidth: 0, borderRadius: 14 },
  sectionTitle: {
    alignSelf: "flex-start",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 12,
  },

  // Modal actions shared
  twoCols: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  modalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14 },
  saveBtn: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 18 },
  saveText: { fontWeight: "700" },
});
