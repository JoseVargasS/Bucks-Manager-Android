# Bucks Manager Android

React Native/Expo Android version of the Bucks Manager Google Apps Script app.

The app has no custom backend. Each user signs in with Google and uses a private Google Sheet as the database.

## Current Flow

1. Open the app.
2. If there is no Google session, show only the Bucks Manager login screen.
3. Sign in with Google.
4. Scan Google Drive for compatible spreadsheets.
5. Prefer an existing spreadsheet named `INGRESOS Y GASTOS`.
6. If none exists, create a new spreadsheet named `INGRESOS Y GASTOS`.
7. Load transactions and summaries from Google Sheets.

No demo finance data is shown during startup. The native splash remains visible until a cached session or the first Google Sheets load is ready, so the app opens directly with real data instead of showing a skeleton.

## Google Sheet Contract

The spreadsheet must contain these tabs:

- `INGRESOS Y GASTOS`
- `RESUMEN POR MES`

`INGRESOS Y GASTOS` accepted headers:

| Column | Header |
| --- | --- |
| A | Fecha |
| B | Monto |
| C | Detalle |
| D | Tipo or Tipo de gasto |
| E | HORA DE CREACION or HORA DE CREACIÓN |

`RESUMEN POR MES` accepted headers:

| Column | Header |
| --- | --- |
| A | MES or MES Y AÑO |
| B | INGRESO FRECUENTE |
| C | INGRESO NO FRECUENTE |
| D | TOTAL INGRESOS |
| E | GASTO FRECUENTE |
| F | GASTO NO FRECUENTE |
| G | TOTAL GASTOS |
| H | NETO MENSUAL |
| I | NETO SIN ING FRECUENTE or TOTAL SIN INGRESO FRECUENTE |

Supported transaction types:

- `INGRESO FRECUENTE`
- `INGRESO NO FRECUENTE`
- `GASTO FRECUENTE`
- `GASTO NO FRECUENTE`

## Visual System

- UI chrome supports Spanish and English from Settings. User-entered transaction descriptions stay exactly as typed, and the Google Sheets transaction type contract remains unchanged.
- Currency display uses the selected symbol from Settings and defaults from the device locale when possible.
- The current native visual direction uses a blue-slate dark theme and soft warm-gray light theme.
- The dark theme primary action color should use the app icon lime (`#C8FF00`) as the brand accent, not muted indigo. The light theme should use a pastel shell with lime/olive accents, not stark white or blue controls. Green and red are reserved for income and expense semantics.
- Cards should use soft surfaces, consistent 14px radii, and minimal outer borders.
- Inputs, selects, destructive actions, and internal separators may keep borders for affordance.
- Financial amounts should use tabular numbers where supported.
- On the Gastos screen, the active period label lives in the header subtitle so the period dropdowns stay high and compact.
- Bottom navigation is a compact translucent floating bar; the add button should protrude slightly above it without increasing or clipping the bar.
- Settings includes local preferences for language, currency symbol, and font style. DM Sans matches the GAS app and is the default; each alternate font is previewed in the selector. Currency starts from the device locale when no saved preference exists.
- On the first launch, language and currency start from the device locale. Google account actions allow switching/adding an account or revoking the current account without deleting its spreadsheet.
- Bottom tab focus changes immediately on press while the pager animates; modal open/close interactions should also feel nearly instant.
- The Analysis screen is optimized for mobile readability with compact KPI rows, chart labels, and a simplified monthly table.

## Commands

Install dependencies:

```powershell
npm install
```

Type-check:

```powershell
npx tsc --noEmit
```

Install/run on a physical Android phone:

```powershell
npm run android
```

`npm run android` sets `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, and Android platform-tools for that command. It targets a physical ADB-authorized phone and avoids a broken emulator being selected accidentally.

Start Metro for an already installed development build:

```powershell
npx expo start
```

The QR flow only works after the phone already has a compatible dev build installed. It opens the JavaScript bundle in the installed app. It does not compile or install the native Android app.

## Google OAuth

Environment variables are loaded from `.env`:

- `GOOGLE_ANDROID_CLIENT_ID`
- `GOOGLE_WEB_CLIENT_ID`

Required scopes:

- `https://www.googleapis.com/auth/drive.metadata.readonly`
- `https://www.googleapis.com/auth/spreadsheets`

The app requests these Drive/Sheets scopes incrementally after the user chooses a Google account. Do not add them to the initial `GoogleSignin.configure()` call; keep the first login as basic identity and request Workspace access only when connecting the private spreadsheet.

The Android OAuth client must use package:

```text
com.josev.bucksmanager
```

The debug/release SHA-1 in Google Cloud must match the keystore used to build the installed app.

## Project Structure

```text
App.tsx                         Main app composition and runtime state
src/api/googleWorkspace.ts      Google Drive and Sheets integration
src/domain/bucksLogic.ts        Sheet contract, summaries, dates, and transaction rules
src/components/                 Screens, layout, modals, and reusable UI
src/styles/globalStyles.ts      Shared React Native style definitions
src/theme/colors.ts             Light/dark palette tokens
scripts/run-android.ps1         Physical-device Android run helper
```

## Repository Hygiene

- Do not commit `.env`, OAuth secrets, user spreadsheet IDs, `.expo/`, logs, `dist/`, build outputs, or `node_modules/`.
- Keep design briefs such as `DESIGN.md` local unless they become durable repo documentation.
- Put durable agent/developer guidance in `AGENTS.md`.
- Google Drive inspection from Codex should be read-only unless the user explicitly asks to modify a Drive file.
