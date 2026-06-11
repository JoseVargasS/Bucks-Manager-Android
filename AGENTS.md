# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Bucks Manager Android

This project is the React Native/Expo Android migration of the Google Apps Script
Bucks Manager app. Keep the UI visually aligned with the original GAS project and
preserve the Google Sheets data contract.

Use local skills when relevant:

- `frontend-design`: required for UI, layout, dashboard, chart, modal, and theme work.
- `accessibility`: required before shipping visible UI changes; check contrast, touch
  targets, labels, focus order, and readable responsive layouts.
- `building-native-ui`: use for Expo/React Native native UI patterns.
- `native-data-fetching`: use for API/data-loading flows, especially Google
  Drive/Sheets integration behavior.
- `expo-dev-client`: use before adding native modules or testing custom native
  runtime behavior.
- `expo-deployment`: use for EAS/Play Store release planning and deployment.
- `android-cli`: use for Android SDK, emulator, adb, Gradle, and local Android
  command-line workflows.
- `edge-to-edge`: use when touching Android system bars, safe areas, insets, or
  full-screen mobile layout.
- `r8-analyzer`: use for release build shrinker/R8 issues, missing classes, or
  Android release-size investigation.

Do not commit local Expo logs, `.expo/`, `node_modules/`, OAuth client secrets, or
user spreadsheet data.
