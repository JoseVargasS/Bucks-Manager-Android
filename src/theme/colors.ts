export type Palette = typeof dark;

export const dark = {
  bg: "#0f1117",
  card: "#171b25",
  input: "#1e2333",
  border: "#2a2f40",
  borderStrong: "#3d4560",
  text: "#eceef4",
  textSub: "#7c84a0",
  muted: "#7c84a0",
  primary: "#c8ff00",
  primarySoft: "rgba(200,255,0,0.16)",
  onPrimary: "#061008",
  green: "#56c98a",
  incomeSoft: "rgba(86,201,138,0.12)",
  red: "#e06b6b",
  expenseSoft: "rgba(224,107,107,0.12)",
  yellow: "#e0a84b",
  warnSoft: "rgba(224,168,75,0.12)",
  blue: "#75d7ff",
  infoSoft: "rgba(117,215,255,0.13)",
  disabled: "#2a2f40",
  switchTrack: "#1e2333",
  editBg: "#17280f",
  editBorder: "#7aa600",
  freqExpenseRow: "rgba(224,107,107,0.10)",
  overlay: "rgba(0,0,0,0.72)",
  shadow: "#000000",
};

export const light = {
  bg: "#f4efe7",
  card: "#fffaf1",
  input: "#f1eadf",
  border: "#e1d7c8",
  borderStrong: "#c7b8a5",
  text: "#201b16",
  textSub: "#75695d",
  muted: "#75695d",
  primary: "#8ab800",
  primarySoft: "rgba(138,184,0,0.22)",
  onPrimary: "#1a3300",
  green: "#1f7a4a",
  incomeSoft: "rgba(31,122,74,0.15)",
  red: "#be4b4b",
  expenseSoft: "rgba(190,75,75,0.10)",
  yellow: "#9b6c22",
  warnSoft: "rgba(155,108,34,0.12)",
  blue: "#77910f",
  infoSoft: "rgba(138,184,0,0.18)",
  disabled: "#d9cebf",
  switchTrack: "#e3d8ca",
  editBg: "#e8f5b8",
  editBorder: "#8ab800",
  freqExpenseRow: "rgba(190,75,75,0.09)",
  overlay: "rgba(42,31,20,0.36)",
  shadow: "#3a3028",
};

export type ColorSchemePreference = "lime" | "ocean" | "violet" | "amber" | "mono";

const accents: Record<ColorSchemePreference, { dark: Partial<Palette>; light: Partial<Palette> }> = {
  lime: { dark: {}, light: {} },
  ocean: {
    dark: { primary: "#66e3ff", primarySoft: "rgba(102,227,255,0.15)", onPrimary: "#06222a", blue: "#66e3ff", infoSoft: "rgba(102,227,255,0.13)", editBg: "#102a31", editBorder: "#4fbdd3" },
    light: { primary: "#157a92", primarySoft: "rgba(21,122,146,0.16)", onPrimary: "#ffffff", blue: "#157a92", infoSoft: "rgba(21,122,146,0.12)", editBg: "#d9f1f5", editBorder: "#157a92" },
  },
  violet: {
    dark: { primary: "#c4a7ff", primarySoft: "rgba(196,167,255,0.16)", onPrimary: "#1b1036", blue: "#bba2f5", infoSoft: "rgba(196,167,255,0.13)", editBg: "#281d3d", editBorder: "#9c7ce0" },
    light: { primary: "#7654b5", primarySoft: "rgba(118,84,181,0.16)", onPrimary: "#ffffff", blue: "#7654b5", infoSoft: "rgba(118,84,181,0.12)", editBg: "#ece4fa", editBorder: "#7654b5" },
  },
  amber: {
    dark: { primary: "#ffc857", primarySoft: "rgba(255,200,87,0.16)", onPrimary: "#2b1900", blue: "#f0b947", infoSoft: "rgba(255,200,87,0.13)", editBg: "#302510", editBorder: "#d9a63d" },
    light: { primary: "#a56700", primarySoft: "rgba(165,103,0,0.16)", onPrimary: "#ffffff", blue: "#966000", infoSoft: "rgba(165,103,0,0.12)", editBg: "#f6e8c8", editBorder: "#a56700" },
  },
  mono: {
    dark: { bg: "#080809", card: "#151516", input: "#242426", border: "#3b3b3e", borderStrong: "#66666b", text: "#ffffff", textSub: "#a6a6aa", muted: "#a6a6aa", primary: "#ffffff", primarySoft: "rgba(255,255,255,0.16)", onPrimary: "#080809", green: "#ffffff", incomeSoft: "#505054", red: "#d0d0d4", expenseSoft: "#343437", yellow: "#a2a2a7", warnSoft: "#202022", blue: "#e2e2e5", infoSoft: "#303033", disabled: "#333336", switchTrack: "#28282a", editBg: "#2d2d30", editBorder: "#dddddf", freqExpenseRow: "#29292c", shadow: "#000000" },
    light: { bg: "#ededed", card: "#ffffff", input: "#e3e3e3", border: "#c5c5c5", borderStrong: "#8f8f8f", text: "#101010", textSub: "#5f5f5f", muted: "#5f5f5f", primary: "#111111", primarySoft: "rgba(17,17,17,0.14)", onPrimary: "#ffffff", green: "#111111", incomeSoft: "#bdbdbf", red: "#454548", expenseSoft: "#dedee0", yellow: "#69696d", warnSoft: "#f4f4f4", blue: "#292929", infoSoft: "#d5d5d7", disabled: "#cccccc", switchTrack: "#d5d5d5", editBg: "#d9d9db", editBorder: "#202020", freqExpenseRow: "#e4e4e6", overlay: "rgba(0,0,0,0.40)", shadow: "#202020" },
  },
};

export function getPalette(theme: "dark" | "light", scheme: ColorSchemePreference): Palette {
  const base = theme === "dark" ? dark : light;
  return { ...base, ...accents[scheme][theme] };
}
