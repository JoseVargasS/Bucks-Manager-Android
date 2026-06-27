const SHARED_TAG_COLORS = [
  "#FF6B6B",
  "#FF8E53",
  "#FFD93D",
  "#6BCB77",
  "#4D96FF",
  "#9B59B6",
  "#3498DB",
  "#1ABC9C",
  "#F39C12",
  "#E74C3C",
  "#2ECC71",
  "#E91E63",
];

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
  periodBg: "rgba(117,215,255,0.50)",
  disabled: "#2a2f40",
  switchTrack: "#1e2333",
  editBg: "#17280f",
  editBorder: "#7aa600",
  freqExpenseRow: "rgba(224,107,107,0.10)",
  overlay: "rgba(0,0,0,0.72)",
  shadow: "#000000",
  tagColors: SHARED_TAG_COLORS,
  tagTextLight: "#ffffff",
  tagTextDark: "#18202d",
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
  periodBg: "rgba(119,145,15,0.45)",
  disabled: "#d9cebf",
  switchTrack: "#e3d8ca",
  editBg: "#e8f5b8",
  editBorder: "#8ab800",
  freqExpenseRow: "rgba(190,75,75,0.09)",
  overlay: "rgba(42,31,20,0.36)",
  shadow: "#3a3028",
  tagColors: SHARED_TAG_COLORS,
  tagTextLight: "#ffffff",
  tagTextDark: "#18202d",
};

type PaletteBase = typeof dark;
export interface Palette extends Omit<PaletteBase, "tagColors"> {
  tagColors: string[];
}

export type ColorSchemePreference =
  | "lime"
  | "ocean"
  | "violet"
  | "amber"
  | "graphite";

const accents: Record<
  ColorSchemePreference,
  { dark: Partial<Palette>; light: Partial<Palette> }
> = {
  lime: { dark: {}, light: {} },
  ocean: {
    dark: {
      primary: "#66e3ff",
      primarySoft: "rgba(102,227,255,0.15)",
      onPrimary: "#06222a",
      blue: "#66e3ff",
      infoSoft: "rgba(102,227,255,0.13)",
      editBg: "#102a31",
      editBorder: "#4fbdd3",
    },
    light: {
      primary: "#157a92",
      primarySoft: "rgba(21,122,146,0.16)",
      onPrimary: "#ffffff",
      blue: "#157a92",
      infoSoft: "rgba(21,122,146,0.12)",
      editBg: "#d9f1f5",
      editBorder: "#157a92",
    },
  },
  violet: {
    dark: {
      primary: "#c4a7ff",
      primarySoft: "rgba(196,167,255,0.16)",
      onPrimary: "#1b1036",
      blue: "#bba2f5",
      infoSoft: "rgba(196,167,255,0.13)",
      editBg: "#281d3d",
      editBorder: "#9c7ce0",
    },
    light: {
      primary: "#7654b5",
      primarySoft: "rgba(118,84,181,0.16)",
      onPrimary: "#ffffff",
      blue: "#7654b5",
      infoSoft: "rgba(118,84,181,0.12)",
      editBg: "#ece4fa",
      editBorder: "#7654b5",
    },
  },
  amber: {
    dark: {
      primary: "#ffc857",
      primarySoft: "rgba(255,200,87,0.16)",
      onPrimary: "#2b1900",
      blue: "#f0b947",
      infoSoft: "rgba(255,200,87,0.13)",
      editBg: "#302510",
      editBorder: "#d9a63d",
    },
    light: {
      primary: "#a56700",
      primarySoft: "rgba(165,103,0,0.16)",
      onPrimary: "#ffffff",
      blue: "#966000",
      infoSoft: "rgba(165,103,0,0.12)",
      editBg: "#f6e8c8",
      editBorder: "#a56700",
    },
  },
  graphite: {
    dark: {
      bg: "#000000",
      card: "#1a1a1a",
      input: "#2a2a2a",
      border: "#404040",
      borderStrong: "#606060",
      text: "#ffffff",
      textSub: "#a0a0a0",
      muted: "#808080",
      primary: "#ffffff",
      primarySoft: "rgba(255,255,255,0.15)",
      onPrimary: "#000000",
      green: "#ffffff",
      incomeSoft: "rgba(255,255,255,0.10)",
      red: "#ff8888",
      expenseSoft: "rgba(255,136,136,0.12)",
      yellow: "#ffcc80",
      warnSoft: "rgba(255,204,128,0.12)",
      blue: "#90caf9",
      infoSoft: "rgba(144,202,249,0.12)",
      disabled: "#3a3a3a",
      switchTrack: "#2a2a2a",
      editBg: "#1a1a1a",
      editBorder: "#606060",
      freqExpenseRow: "rgba(255,136,136,0.10)",
      shadow: "#000000",
    },
    light: {
      bg: "#ffffff",
      card: "#f5f5f5",
      input: "#e8e8e8",
      border: "#c0c0c0",
      borderStrong: "#909090",
      text: "#000000",
      textSub: "#606060",
      muted: "#808080",
      primary: "#000000",
      primarySoft: "rgba(0,0,0,0.10)",
      onPrimary: "#ffffff",
      green: "#000000",
      incomeSoft: "rgba(0,0,0,0.06)",
      red: "#d32f2f",
      expenseSoft: "rgba(211,47,47,0.10)",
      yellow: "#f57c00",
      warnSoft: "rgba(245,124,0,0.10)",
      blue: "#1976d2",
      infoSoft: "rgba(25,118,210,0.10)",
      disabled: "#d0d0d0",
      switchTrack: "#e0e0e0",
      editBg: "#f5f5f5",
      editBorder: "#909090",
      freqExpenseRow: "rgba(211,47,47,0.06)",
      overlay: "rgba(0,0,0,0.50)",
      shadow: "#000000",
    },
  },
};

const paletteCache = new Map<string, Palette>();
const PALETTE_CACHE_LIMIT = 12;

function cacheGet(key: string): Palette | undefined {
  const value = paletteCache.get(key);
  if (value !== undefined) {
    paletteCache.delete(key);
    paletteCache.set(key, value);
  }
  return value;
}

function cacheSet(key: string, value: Palette): void {
  if (paletteCache.has(key)) paletteCache.delete(key);
  if (paletteCache.size >= PALETTE_CACHE_LIMIT) {
    const oldest = paletteCache.keys().next().value;
    if (oldest !== undefined) paletteCache.delete(oldest);
  }
  paletteCache.set(key, value);
}

export function getPalette(
  theme: "dark" | "light",
  scheme: ColorSchemePreference,
): Palette {
  const cacheKey = `${theme}|${scheme}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const base = theme === "dark" ? dark : light;
  const palette = { ...base, ...accents[scheme][theme] } as Palette;
  cacheSet(cacheKey, palette);
  return palette;
}
