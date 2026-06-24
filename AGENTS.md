# AGENTS.md - Bucks Manager Android

## Project Overview

Bucks Manager Android is the React Native/Expo Android version of the Bucks Manager Google Apps Script app. It must preserve the mobile GAS workflow and use each user's private Google Sheet as the database. There is no custom backend.

## Core Rules

- Do not show demo finance data during app startup.
- If there is no Google session, show the minimal Bucks Manager login screen with only Google sign-in.
- Treat Google Drive data as private user data. Read or write Drive/Sheets only through the app runtime or when the user explicitly authorizes it.
- Do not commit `.env`, OAuth secrets, spreadsheet IDs, `.expo/`, logs, `dist/`, build outputs, or `node_modules/`.
- Treat `DESIGN.md` as a local design brief, not a durable repo contract. Fold lasting decisions into this file and `README.md` instead.
- Keep the Google Sheets transaction contract unchanged. UI chrome can switch between Spanish and English from Settings, while user-entered transaction descriptions must stay exactly as typed.
- Display money with the selected currency symbol from Settings, defaulting from the device locale when no preference is saved.
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

## OAuth Scope Flow

- Configure Google Sign-In without Drive/Sheets scopes for the initial account login.
- Request Google Workspace scopes incrementally with `GoogleSignin.addScopes()` immediately before reading or writing Drive/Sheets.
- Keep the required scopes limited to Drive metadata read-only and Google Sheets access:
  - `https://www.googleapis.com/auth/drive.metadata.readonly`
  - `https://www.googleapis.com/auth/spreadsheets`

## Android Development

Use:

```powershell
npm run android
```

The script in `scripts/run-android.ps1` sets Java and Android SDK paths and targets a physical ADB-authorized phone. Use `npx expo start` only when a compatible development build is already installed on the phone.

## Performance Invariants

- Hydrate the local financial cache before waiting on Google Sheets, then revalidate in the background.
- Reuse the saved spreadsheet ID before calling `findCompatibleSheets()`.
- Keep `reloadFromGoogle()` deduplicated and preserve `pendingSyncRef`; an older read must not overwrite optimistic writes.
- Add, edit, delete, move, and frequent-income interactions must update locally before remote reconciliation.
- If column F already has the normalized `ETIQUETAS` header, do not repeat tag migration or formatting writes.
- Keep Drive structure validation bounded. Do not make it fully sequential or launch an unbounded request burst.
- Keep transaction grouping and sorting linear outside the actual sort; avoid date parsing inside sort comparisons or group lookup scans.
- Import `MaterialCommunityIcons` from `@expo/vector-icons/MaterialCommunityIcons`, never the package root; the root entry bundles every icon font.
- Do not add Redux, React Query, SQLite, MMKV, or another data layer without measured evidence that the current cache/sync path is insufficient.
- Do not split `App.tsx` merely for file size. Extract only when it removes repeated work, isolates independently tested logic, or materially reduces rerenders.
- Preserve `removeClippedSubviews={false}` on the Android transaction list unless emulator/device testing proves the historical blank-row regression is gone.

## Validation

Before committing app changes, run:

```powershell
npm run ci
```

`npm run ci` checks formatting, unused symbols, strict types, tests, and coverage thresholds. For cleanup work, also verify every deleted file is unreachable from `index.ts` or an Expo config/build entry.

When possible, also install/run on a real Android device.

Read `CONTEXT.md` before changing startup, sync, transaction ordering, navigation, or modal ownership. Update `README.md`, `AGENTS.md`, and `CONTEXT.md` when a durable contract changes.

## Git Commits

- Always use Conventional Commits.
- Use hyphen bullets in the commit body when listing changes.

## UI Direction

Use the mobile GAS workflow as the functional reference, but follow the current native visual system:

- Dark theme uses a blue-slate shell, not green-black. Light theme uses soft warm gray backgrounds with white surfaces.
- In dark theme, primary actions should use the app icon lime (`#C8FF00`) as the brand accent instead of muted indigo. Light theme should feel pastel and warm, with lime/olive accents instead of stark white surfaces or blue controls. Green and red are semantic only for income and expense states.
- KPI/stat cards use two-column mobile layouts, soft surfaces, 14px radius, and minimal outer borders.
- Amounts and finance values should use tabular numbers where React Native supports it.
- Avoid `fontWeight: "900"` as a default. Prefer 700 for titles/primary amounts, 600 for list labels, 500 for metadata, and 400 for body text.
- Use DM Sans as the default app font to match the GAS version. Keep the additional font choices in Settings and preview each option in its own family.
- Keep borders for affordance on inputs, selects, destructive/secondary buttons, and internal row separators. Avoid border-heavy cards.
- On the Gastos screen, keep the active period label in the header subtitle so the period dropdowns stay high and compact.
- Bottom navigation should stay compact and translucent/floating, with a squircle add button protruding slightly above its container without making the bar taller or clipping the button, plus a subtle active indicator.
- Settings should expose local preferences for language, currency symbol, and font style. Initialize currency from the device locale when no preference has been saved.
- Bottom tab focus must update on press without waiting for the pager animation. Modal open/close interactions should also feel nearly instant.
- The Analysis screen should stay mobile-readable: compact KPI rows, chart labels, and a simplified monthly table.
- Modals should use rounded dark/light panels, clear labels, bordered inputs, large actions, and theme overlay tokens.
