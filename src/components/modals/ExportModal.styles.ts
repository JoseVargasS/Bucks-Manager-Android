import { StyleSheet } from "react-native";

export const exportModalStyles = StyleSheet.create({
  exportChip: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  trigger: {
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
  },
});
