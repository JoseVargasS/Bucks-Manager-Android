# AGENTS.md - Bucks Manager Android

## Project Overview

Bucks Manager Android is the React Native/Expo Android version of the Bucks Manager Google Apps Script app. It must preserve the mobile GAS workflow and use each user's private Google Sheet as the database. There is no custom backend.

## Core Rules

- Do not show demo finance data during app startup.
- If there is no Google session, show the minimal Bucks Manager login screen with only Google sign-in.
- Treat Google Drive data as private user data. Read or write Drive/Sheets only through the app runtime or when the user explicitly authorizes it.
- Do not commit `.env`, OAuth secrets, spreadsheet IDs, `.expo/`, logs, `dist/`, build outputs, or `node_modules/`.
- Treat `DESIGN.md` as a local design brief, not a durable repo contract. Fold lasting decisions into this file and `README.md` instead.
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

Use the mobile GAS workflow as the functional reference, but follow the current native visual system:

- Dark theme uses a blue-slate shell, not green-black. Light theme uses soft warm gray backgrounds with white surfaces.
- Primary action color is indigo/blue. Green and red are semantic only for income and expense states.
- KPI/stat cards use two-column mobile layouts, soft surfaces, 14px radius, and minimal outer borders.
- Amounts and finance values should use tabular numbers where React Native supports it.
- Avoid `fontWeight: "900"` as a default. Prefer 700 for titles/primary amounts, 600 for list labels, 500 for metadata, and 400 for body text.
- Keep borders for affordance on inputs, selects, destructive/secondary buttons, and internal row separators. Avoid border-heavy cards.
- Bottom navigation should stay compact, with a squircle add button and a subtle active indicator.
- The Analysis screen should stay mobile-readable: compact KPI rows, chart labels, and a simplified monthly table.
- Modals should use rounded dark/light panels, clear labels, bordered inputs, large actions, and theme overlay tokens.
