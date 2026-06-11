# AGENTS.md - Bucks Manager Android

## Project Overview

Bucks Manager Android is the React Native/Expo Android version of the Bucks Manager Google Apps Script app. It must preserve the mobile GAS interface and use each user's private Google Sheet as the database. There is no custom backend.

## Core Rules

- Do not show demo finance data during app startup.
- If there is no Google session, show the minimal Bucks Manager login screen with only Google sign-in.
- Treat Google Drive data as private user data. Read or write Drive/Sheets only through the app runtime or when the user explicitly authorizes it.
- Do not commit `.env`, OAuth secrets, spreadsheet IDs, `.expo/`, logs, or `node_modules/`.
- Keep UI copy in Spanish and currency as `S/`.
- Preserve the four exact transaction types:
  - `INGRESO FRECUENTE`
  - `INGRESO NO FRECUENTE`
  - `GASTO FRECUENTE`
  - `GASTO NO FRECUENTE`

## Google Sheets Contract

The app uses one spreadsheet with two tabs:

- `INGRESOS Y GASTOS`
- `RESUMEN POR MES`

The app must accept the legacy GAS headers used by existing sheets:

- `TIPO` and `TIPO DE GASTO`
- `MES` and `MES Y AÑO`
- `NETO SIN ING FRECUENTE` and `TOTAL SIN INGRESO FRECUENTE`
- Headers with accents, line breaks, and extra whitespace

When no compatible spreadsheet exists, create a new spreadsheet named `INGRESOS Y GASTOS`, not `Bucks Manager`.

## Android Development

Use:

```powershell
npm run android
```

The script in `scripts/run-android.ps1` sets Java and Android SDK paths and targets a physical ADB-authorized phone. Use `npx expo start` only when a compatible development build is already installed on the phone.

## Validation

Before committing app changes, run:

```powershell
npx tsc --noEmit
```

When possible, also install/run on a real Android device.

## UI Direction

Match the mobile GAS version:

- Dark shell with neon lime primary action.
- Top header with menu, title, month/year, theme toggle, search, and export.
- KPI cards in two columns.
- Transaction table with drag handle, expandable detail, type pill, edit button, and delete button.
- Sidebar with brand, view navigation, quick months, account management, and storage note.
- Modals should follow the GAS visual style: rounded dark panels, strong labels, bordered inputs, and large clear actions.
