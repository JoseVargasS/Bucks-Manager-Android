# Bucks Manager Android Context

## Runtime Shape

Bucks Manager is an Expo/React Native client with no custom backend. Google Sign-In supplies an access token; one private Google spreadsheet remains the remote source of truth. A local JSON cache makes startup and finance interactions immediate while Sheets revalidation runs in the background.

`App.tsx` intentionally owns the cross-cutting runtime state: session restore, preferences, cache hydration, Google synchronization, optimistic writes, pager state, and modal refs. The three main pages stay mounted inside one animated pager. Primary interaction modals open through refs so opening them does not require a root visibility-state round trip.

## Startup and Sync

1. Restore preferences, PIN state, token, and spreadsheet ID concurrently.
2. If a cache exists for that spreadsheet, apply it immediately and release the splash.
3. Refresh the Google token and read transactions/summaries in the background.
4. If the stored spreadsheet is missing or incompatible, scan Drive in batches of five candidates.
5. Create `INGRESOS Y GASTOS` only when no compatible named sheet is available.

`reloadFromGoogle()` shares one in-flight promise. `pendingSyncRef` prevents an ordinary refresh from replacing optimistic state. Mutations update React state and the local cache first, then write to Sheets and force one reconciliation read.

## Data Contract

- Tabs: `INGRESOS Y GASTOS`, `RESUMEN POR MES`.
- Transaction columns: date, amount/formula, detail, exact transaction type, creation time, tags.
- Exact types: `INGRESO FRECUENTE`, `INGRESO NO FRECUENTE`, `GASTO FRECUENTE`, `GASTO NO FRECUENTE`.
- Legacy header aliases, accents, whitespace, and line breaks remain accepted.
- User-entered descriptions are never translated or normalized.

## Hot Paths

- `src/utils/transactions.ts`: rolling-period filter, decorated descending sort, and map-based date grouping.
- `src/api/googleWorkspace.ts`: tag readiness inferred from the transaction read, bounded Drive validation, batched reads, and row mutations.
- `src/data/localCache.ts`: stale-while-revalidate snapshot for transactions, summaries, frequent income, and last sync time.
- `src/components/screens/ExpensesView.tsx`: virtualized `SectionList`; clipping stays disabled because Android previously rendered blank rows after edits.
- `src/components/modals/TransactionModal.tsx`, `DetailModal.tsx`, and `SearchModal.tsx`: ref-driven open path for immediate presentation.
- UI files import the direct `MaterialCommunityIcons` entry so Android exports include only that icon font.

## Deliberate Non-Choices

- No Redux, React Query, database, custom backend, or extra cache dependency.
- No speculative split of `App.tsx`; extraction must improve a measured path or isolate independently checked logic.
- No aggressive list clipping or native-modal remounting that reintroduces known Android rendering/open latency.
- No demo financial data, even temporarily during startup.

## Verification

```powershell
npm run ci
git diff --check
```

The critical non-UI test suite uses Node's built-in runner and coverage. Native UI rendering, gestures, Google Sign-In, and animation timing still require device validation.

Use `npm run android` for a physical ADB-authorized phone. For performance work, capture one focused flow with `gfxinfo`, Perfetto, or Simpleperf; do not treat a broad or unstable emulator run as timing evidence.
