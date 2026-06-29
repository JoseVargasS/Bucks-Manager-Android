import type { Tab } from "../types";

export const ANIM_SPLASH_DURATION = 220;
export const ANIM_TAB_PAGER = 210;
export const ANIM_HEADER_BTN_IN = 60;
export const ANIM_HEADER_BTN_OUT = 60;

export const PIN_DELAY_MS = 1500;
export const PIN_RESET_MS = 1200;
export const PIN_LENGTH = 4;

export const Z_INDEX_MODAL = 1000;
export const Z_INDEX_DETAIL = 1001;
export const Z_INDEX_SEARCH = 1002;

export const SPLASH_BG = "#050E0B";
export const SPLASH_SPINNER = "#C8FF00";
export const SPLASH_INDICATOR_OFFSET = 72;

export const TOKEN_KEY = "bucks_google_access_token";
export const SHEET_KEY = "bucks_spreadsheet_id";

export const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
];

export const TAB_ORDER: Tab[] = ["dashboard", "expenses", "summary", "settings"];
