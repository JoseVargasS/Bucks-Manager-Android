# Bucks Manager Android

Android migration of the Bucks Manager Google Apps Script app.

The app has no custom backend. Each user signs in with Google and uses a private Google Sheet as the database.

## Current Flow

1. Open the app.
2. If there is no Google session, show only the Bucks Manager login screen.
3. Sign in with Google.
4. Scan Google Drive for compatible spreadsheets.
5. Prefer an existing spreadsheet named `INGRESOS Y GASTOS`.
6. If multiple compatible sheets exist, show a selector.
7. If none exists, create a new spreadsheet named `INGRESOS Y GASTOS`.
8. Load transactions and summaries from Google Sheets.

No demo finance data is shown during startup. While the app checks the session or loads Google Sheets, it shows a skeleton screen.

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

The Android OAuth client must use package:

```text
com.josev.bucksmanager
```

The debug/release SHA-1 in Google Cloud must match the keystore used to build the installed app.

## Project Structure

```text
App.tsx
src/
  api/googleWorkspace.ts
  domain/bucksLogic.ts
  types.ts
scripts/
  run-android.ps1
```

## Notes

- Do not commit `.env`, OAuth secrets, user spreadsheet IDs, `.expo/`, or `node_modules/`.
- Keep Android UI aligned with the mobile Google Apps Script version.
- Google Drive inspection from Codex should be read-only unless the user explicitly asks to modify a Drive file.
