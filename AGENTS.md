# AGENTS.md - Bucks Manager Android

## Project Overview

Bucks Manager Android is the React Native/Expo Android version of the Bucks Manager Google Apps Script app. It must preserve the mobile GAS workflow and use each user's private Google Sheet as the database. There is no custom backend.

The app is built to scale to thousands of transactions per user across many years of history. All performance, memoization, and split decisions below are written with that growth in mind.

## Core Rules

- Do not show demo finance data during app startup.
- If there is no Google session, show the minimal Bucks Manager login screen with only Google sign-in.
- Treat Google Drive data as private user data. Read or write Drive/Sheets only through the app runtime or when the user explicitly authorizes it.
- Do not commit `.env`, OAuth secrets, spreadsheet IDs, `.expo/`, logs, `dist/`, build outputs, or `node_modules/`.
- Keep deployment-specific IDs such as `EAS_PROJECT_ID` in `.env` or build environment variables, not hardcoded in source.
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

## Architecture and Performance Invariants

These rules reflect the current shape of the app and the scale it must support. Update them in the same commit that changes the underlying mechanism.

### Runtime state

- `App.tsx` owns cross-cutting runtime state: session restore, preferences, cache hydration, Google synchronization, optimistic writes, pager state, and modal refs.
- The three main pages stay mounted inside one animated pager. Primary interaction modals open through refs so opening them does not require a root visibility-state round trip.
- Mutations update React state and the local cache first, then write to Sheets and force one reconciliation read.
- `reloadFromGoogle()` shares one in-flight promise. `pendingSyncRef` prevents an ordinary refresh from replacing optimistic state.

### Hydration and sync

- Hydrate the local financial cache before waiting on Google Sheets, then revalidate in the background.
- Reuse the saved spreadsheet ID before calling `findCompatibleSheets()`.
- Keep Drive structure validation bounded. Do not make it fully sequential or launch an unbounded request burst.
- Add, edit, delete, and move interactions must update locally before remote reconciliation.
- Add frequent income as a normal transaction with type `INGRESO FRECUENTE`; the legacy monthly summary value is read-only fallback data.
- If column F already has the normalized `ETIQUETAS` header, do not repeat tag migration or formatting writes.

### Render and re-render budget

The list path must stay cheap even when a user accumulates thousands of rows over many years:

- Keep transaction grouping and sorting linear outside the actual sort; avoid date parsing inside sort comparisons or group lookup scans.
- Preserve `removeClippedSubviews={false}` on the Android transaction list unless emulator/device testing proves the historical blank-row regression is gone.
- `SectionList` virtualizes; do not introduce custom virtualization that breaks its keyExtractor contract.
- The financial cache, summaries, and frequent-income map are precached on transaction read. Do not re-parse dates inside sort/filter/group passes.
- The pager translates on the native driver (`useNativeDriver: true`) so the JS thread stays free for list work.

### Memoization

- Wrap every reusable UI primitive in `React.memo`: `StatCard`, `Kpi`, `ModalHeader`, `ActionRow`, `Field`, `HighlightedText`, `BarChart`, `Select`, `CalendarPicker`, `Text`, `TextInput`, `StatCard`, `Kpi`, `ModalHeader`, `ActionRow`, `Field`, `HighlightedText`, `BarChart`, `Select`, `CalendarPicker`, and the layout primitives `BottomNav`, `BottomNavItem`, `PeriodControls`, `HeaderActionButton`, `HeaderFade`, `HeaderTitleFade`, `BottomFade`, `TabPage`, `HeaderShell`. New UI primitives must be memoized at creation time.
- `AppText`'s `Text` and `TextInput` are memoized and observe the font preference through a sync external store so a font change does not remount rows.
- `TransactionRow` is memoized with `keyExtractor` derived from `rowId+rawDate+createdAtMs`; do not include amount or detail in the key.
- A child that consumes only one color via `useColor(key)` rerenders only when that color changes. Prefer this over passing the full `Palette`.

### Theme and palette contexts

The theme is split into three contexts to keep rerenders scoped to what actually changed:

- `ThemeModeContext` exposes `{ theme, toggleTheme }`. Components that only need to know whether it is dark or light subscribe here.
- `ColorSchemeContext` exposes `{ colorScheme, setColorScheme }`. Components that only react to the accent change subscribe here.
- `PaletteContext` exposes the resolved `Palette`. Components that render colors subscribe here.
- The legacy `useTheme()` hook still returns the combined object for callers that genuinely need everything, but new code must prefer the split hooks.

Do not re-merge these contexts. Do not introduce a global "settings" context that bundles theme, language, currency, and font together; each preference gets its own subscription.

### Theme crossfade

- The shell background and the `HeaderShell` overlay animate `backgroundColor` from light to dark through an `Animated.Value` interpolated over 180ms when the toggle is pressed.
- The shell root and `HeaderShell` are `Animated.View`. The two SVG fades (`HeaderFade`, `HeaderTitleFade`) keep their snap-into-place behavior because they receive a string color prop and cannot interpolate.
- `HeaderActionButton` fires `onPress` on `onPressIn` (not on release) so the toggle lands while the finger is still down. Its feedback animation is 60ms in, 60ms out.
- `getPalette` memoizes the result for each `(theme, scheme)` pair in a small LRU. Do not remove that cache.

### Tag identity and language changes

- Transaction tags store stable `tag.id` values, never free-form labels. The catalogue may change its `label` per language without breaking the link.
- `migrateTagReferences` accepts a mix of legacy labels and ids. It resolves ids first, then `DEFAULT_TAGS` labels in both Spanish and English, then creates a deterministic `custom-{slug}` orphan id for unknown legacy labels.
- `slugifyTagLabel(label)` produces a stable `custom-{slug}` id so recreating a deleted tag reattaches the same id.
- Custom user tags are not translated. Default tags (`default-comida`, `default-salud`, etc.) are translated through the catalogue; their colors persist across language switches.
- Components resolve an id to its label and color through shared maps (`tagColorMap`, `tagLabelMap`, `findTagById`, `labelForTagId`).
- `applySearch` accepts an optional `tagLabelsById` map so text search matches the tag label in the current language.
- `localCache` schemaVersion is 2. The in-memory `migrateTransactionTags` runs once when tags finish loading so legacy label refs are rewritten to ids without persisting the migration separately.

### Local cache and persistence

- The local cache is a single JSON file in `documentDirectory`. Bump `CACHE_VERSION` whenever the on-disk shape changes.
- `SecureStore` is used for tokens, the saved spreadsheet id, the PIN, history, and the tag catalogue. Do not move these to `FileSystem` or `MMKV` without measured evidence.
- `loadHistory` prunes entries older than 30 days on read.
- Tag persistence uses the catalogue at the current language. The catalogue must always include the six default ids (`default-salud`, `default-comida`, `default-viaje`, `default-transporte`, `default-ocio`, `default-educacion`) even when the user hides them in the UI.

### Mutation pipeline

- A module-level `syncQueue` serializes Sheets mutations so a fast edit cannot race the reconcile read of an earlier edit.
- Disconnect Google when the token fails and there is no local cache.
- Mutations always update local state and the cache before issuing the network call. Failed network calls keep the local data visible with a pending or error status.

### Imports and packaging

- Import `MaterialCommunityIcons` from `@expo/vector-icons/MaterialCommunityIcons`, never the package root; the root entry bundles every icon font.

## Validation

Before committing app changes, run:

```powershell
npm run ci
```

`npm run ci` checks formatting, unused symbols, strict types, tests, and coverage thresholds. For cleanup work, also verify every deleted file is unreachable from `index.ts` or an Expo config/build entry.

When possible, also install/run on a real Android device. For performance work, capture one focused flow with `gfxinfo`, Perfetto, or Simpleperf; do not treat a broad or unstable emulator run as timing evidence.

Read `CONTEXT.md` before changing startup, sync, transaction ordering, navigation, or modal ownership. Update `README.md`, `AGENTS.md`, and `CONTEXT.md` when a durable contract changes.

## Git Commits

- Always use Conventional Commits.
- Use hyphen bullets in the commit body when listing changes.
- When the change spans multiple of the invariants above, call out which invariant moved and why.

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

