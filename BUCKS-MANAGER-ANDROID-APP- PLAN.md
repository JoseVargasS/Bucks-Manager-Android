# Bucks Manager Android App Plan

## Summary
Build a new Android-only React Native app that visually and functionally matches the current Google Apps Script web app, but replaces `google.script.run` with direct Google Drive + Google Sheets API calls. Each user signs in with their own Google account, the app scans their Drive for a compatible Bucks Manager spreadsheet, and if none exists it creates the spreadsheet structure automatically. No personal finance data goes through your server.

The current GAS app’s visual source of truth is the existing `Index.html`, `Styles.html`, `Scripts.html`, and `Código.js` in `C:\Users\JoseV\Desktop\Bucks Manager APP SCRIPT`.

## Key Changes
- Create a new React Native TypeScript Android app under `mobile/`, using native Android modules only where needed for Google auth/authorization.
- Implement Google login with Android Credential Manager, then request Drive/Sheets authorization with Google Identity Services `AuthorizationClient`.
- Use these scopes for the chosen “Escanear Drive” behavior:
  - `drive.metadata.readonly` to list spreadsheet files in Drive.
  - `spreadsheets` to read, create, and edit the selected Google Sheet.
- Important tradeoff: this is more automatic for users, but it increases OAuth verification burden because broad Drive metadata access is restricted and Sheets edit access is sensitive. Official references checked: [Android Credential Manager](https://developers.google.com/identity/android-credential-manager), [Android AuthorizationClient](https://developer.android.com/identity/authorization), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes).

## Implementation
- Onboarding flow:
  - Splash/login screen matching Bucks Manager branding.
  - “Conectar con Google”.
  - Request Google authorization only after the user starts setup.
  - Scan Drive for Google Sheets, validate candidates by required tabs and headers, show a chooser if multiple valid sheets exist.
  - If none exists, create a spreadsheet named `Bucks Manager` with `INGRESOS Y GASTOS` and `RESUMEN POR MES`, headers, date/currency/time formatting, and current-month formulas.

- Data layer:
  - Replace each GAS backend function with a React Native service: transactions, summaries, search, export range bounds, monthly row creation, frequent income update, delete, undo, edit, and row swap.
  - Preserve the same sheet structure, transaction types, amount sign convention, formula-capable amount input, chronological insert behavior, `rowId` semantics, and `HORA DE CREACIÓN` time format.
  - Store only the selected spreadsheet ID and active account metadata locally; do not store refresh tokens or finance data locally beyond temporary online cache.

- UI parity:
  - Rebuild the current screens in React Native: sidebar/mobile navigation, month/year controls, KPI cards, transaction table/list, add/edit modal, delete/undo, advanced search, export modal, frequent-income modal, detail modal, dark/light theme, custom calculator keypad, and analysis view.
  - Recreate charts natively with React Native chart components using the same datasets and colors: income/expense pies, monthly trend, interannual comparison, metric pills, year chips, and summary table.
  - Keep labels and currency as currently written: `S/`, Spanish month names, and the four exact transaction types.

- Export:
  - Keep XLSX and PDF export by date range or month range.
  - Generate files on-device from fetched Google Sheets rows and open the Android share/save sheet.
  - Keep creation column as time-only where it represents creation time.

## Test Plan
- Unit-test sheet validation, date parsing, formula generation, summary aggregation, search filters, sign handling, and export range conversion.
- Integration-test against a disposable Google Sheet: no sheet found, create structure, find existing valid sheet, reject invalid sheet, add/edit/delete/undo/swap transactions, update frequent income, and refresh summaries.
- Android QA on emulator and real device: login, permission denial/retry, expired token retry, dark/light theme, mobile layout, charts, export share flow, and poor-network failures.
- Acceptance: a new Google user can install, connect account, create or select a private Google Sheet, add data, view all current Bucks Manager functions, and uninstall without any server-side user data existing.

## Assumptions
- First version is Android only, online-first, React Native, and scans Drive automatically as requested.
- Package ID defaults to `com.josev.bucksmanager` until Play Store identity is finalized.
- Public release requires Google Cloud OAuth setup, privacy policy, app branding, Android SHA-1 registration, and likely Google OAuth verification because of the selected Drive scan behavior.
- If OAuth verification becomes too slow, the fallback plan is to switch discovery to Google Picker / user-selected sheet with `drive.file`, which is less automatic but easier to approve.
