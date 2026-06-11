# Bucks Manager Android - Google Setup

La app ya corre en modo demo. Para conectar Google Drive + Google Sheets reales:

1. Crea o usa un proyecto en Google Cloud Console.
2. Habilita:
   - Google Drive API
   - Google Sheets API
3. Configura la pantalla de consentimiento OAuth.
4. Crea credenciales OAuth para Android con el package:
   - `com.josev.bucksmanager`
5. Agrega el SHA-1 de tu keystore de desarrollo o release.
6. Crea también un OAuth client web si vas a probar con Expo Go.
7. En `App.tsx`, reemplaza:
   - `GOOGLE_ANDROID_CLIENT_ID`
   - `GOOGLE_WEB_CLIENT_ID`

Scopes usados:

- `https://www.googleapis.com/auth/drive.metadata.readonly`
- `https://www.googleapis.com/auth/spreadsheets`

Nota: el escaneo automático de Drive usa permisos sensibles/restringidos. Para publicar en Play Store puede requerir verificación OAuth de Google. Si quieres reducir fricción de aprobación, el fallback recomendado es cambiar el flujo a selección manual de archivo con permisos más limitados.

## Ejecutar

Si `node` está en PATH:

```powershell
cd "C:\Users\JoseV\Desktop\Bucks Manager Android"
npm run android
```

Si el PATH de Node no aparece en esta sesión, se dejó Node portable en:

```powershell
C:\tmp\node-v24.16.0-win-x64
```

Puedes iniciar Expo así:

```powershell
$env:Path='C:\tmp\node-v24.16.0-win-x64;' + $env:Path
npx expo start --localhost --port 8081
```
