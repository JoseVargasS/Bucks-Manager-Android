import { StyleSheet } from "react-native";

export const settingsStyles = StyleSheet.create({
  settingsSection: { marginBottom: 22 },
  settingsLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    paddingHorizontal: 3,
    letterSpacing: 0,
  },
  settingsGroup: { borderWidth: 0, borderRadius: 14, overflow: "hidden" },
  settingsRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingsAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsRowText: { flex: 1, minWidth: 0 },
  settingsRowLabel: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: "600" },
  settingsRowValue: {
    maxWidth: 122,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
  },
  accountInitial: { fontSize: 24, fontWeight: "700" },
  accountHeroName: { fontSize: 18, fontWeight: "700" },
  accountHeroEmail: { fontSize: 14, fontWeight: "500", marginTop: 4 },
  signOutBtn: {
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  signOutText: { fontSize: 14, fontWeight: "700" },
});
