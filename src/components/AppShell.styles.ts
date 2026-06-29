import { StyleSheet } from "react-native";

export const appShellStyles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  topBarMobile: {
    marginBottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: "relative",
  },
  headerTitleFade: { position: "absolute", left: 4, top: -1 },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 1,
  },
  headerLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: { flex: 1, minWidth: 0 },
  pageTitle: { fontSize: 26, fontWeight: "700", letterSpacing: 0 },
  pageTitleMobile: { fontSize: 21 },
  pageSub: { fontSize: 13, fontWeight: "500" },
  pageSubMobile: { fontSize: 15 },
  headerReadableTextDark: {
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  headerReadableTextLight: {
    textShadowOffset: { width: 0, height: 0.25 },
    textShadowRadius: 0.7,
  },
  loadingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  loadingOverlay: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    zIndex: 30,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 0,
  },
});
