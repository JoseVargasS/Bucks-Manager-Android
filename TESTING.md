# Testing

## Test stack

The project uses the Node.js 24 built-in test runner, strict assertions, native TypeScript type stripping, and Node's built-in coverage. No Jest or React Native test dependency is required for the current suite.

`tests/setup.mjs` resolves local TypeScript imports and supplies in-memory implementations of Expo SecureStore and FileSystem. Google integrations are tested through deterministic `fetch` responses; tests never access a real account, Drive, or spreadsheet.

## Commands

```powershell
npm test                 # Run the full suite once
npm run test:watch       # Re-run tests when files change
npm run test:coverage    # Run tests and enforce coverage thresholds
npm run ci               # Format, lint, types, tests, and coverage
```

Coverage starts at 85% lines, 75% branches, and 85% functions across `src/api`, `src/data`, `src/domain`, and `src/utils`. These thresholds are a regression floor, not a target to game. Raise them only after useful behavior tests keep the suite comfortably above the new value.

## Test types and locations

- Unit tests cover finance calculations, formatters, date parsing, filtering, sorting, grouping, search, and validation.
- Integration tests cover Google response parsing, exact spreadsheet creation contracts, chronological writes, formula refreshes, SecureStore flows, and FileSystem cache round trips.
- Regression and performance-invariant tests cover bounded Drive scans, tag-migration request counts, stable transaction ordering, and period-range reuse.
- Native UI rendering, gestures, navigation animation, and device-only Google Sign-In are outside Node coverage. Validate those flows with `npm run android` on an ADB-authorized phone. Add an Expo-compatible React Native renderer only when a component change needs assertions that cannot be expressed through its domain or persistence behavior.

Tests live in `tests/*.test.mjs`. Shared runtime mocks belong in `tests/setup.mjs`; scenario-specific Google responses stay inside the test that uses them.

## Conventions

- Name tests as behavior: condition plus expected result.
- Assert public output, persisted state, or external requests; avoid private implementation details.
- Every fixed bug gets a regression test that fails before the fix.
- Use real domain functions and small boundary fakes. Do not mock the function under test.
- Restore global state with `t.after()` or shared reset hooks.
- Do not commit skipped, pending, commented-out, or unconditional-pass tests.
- Use unique spreadsheet IDs in tests because tag readiness is cached per spreadsheet.

## Adding a test

1. Put a focused case beside the closest existing suite.
2. Import `./setup.mjs` before importing TypeScript modules.
3. Reproduce the current failure first for a bug fix.
4. Run `npm test`, then `npm run test:coverage`.
5. Finish with `npm run ci`.

## Critical zones

Highest protection is expected for:

- `src/domain/bucksLogic.ts`: money, dates, search, row order, and summaries.
- `src/utils/transactions.ts`: rolling periods, stable sort, and grouping.
- `src/data/localCache.ts`: cache ownership and corrupted-data rejection; `CACHE_VERSION` migration.
- `src/api/googleWorkspace.ts`: legacy headers, locale values/formulas, exact tab names, bounded Drive scans, and row mutations.
- `src/utils/tags.ts`: stable id generation, legacy label migration, and orphan id resolution across both Spanish and English defaults.
- `src/theme/ThemeContext.tsx`: split-context wiring, palette LRU, and provider nesting.
- `App.tsx`: optimistic state, `pendingSyncRef`, deduplicated reloads, modal/navigation ownership, and the in-memory `migrateTransactionTags` pass. This orchestration remains primarily device-tested because it directly owns native modules and mounted UI.

The coverage table reports only critical non-UI TypeScript modules selected by `test:coverage`. It must not be interpreted as whole-app UI coverage.
