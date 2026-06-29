import { StyleSheet } from "react-native";

export const bottomNavStyles = StyleSheet.create({
  bottomNav: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    height: 68,
    zIndex: 24,
    overflow: "visible",
  },
  bottomNavGlass: {
    ...StyleSheet.absoluteFill,
    borderWidth: 0.5,
    borderRadius: 22,
    overflow: "hidden",
  },
  bottomNavContent: {
    height: "100%",
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    overflow: "visible",
  },
  bottomNavItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  bottomAddButton: {
    width: 56,
    height: 56,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: -16 }],
  },
  bottomNavLabel: { fontSize: 12, fontWeight: "500" },
});
