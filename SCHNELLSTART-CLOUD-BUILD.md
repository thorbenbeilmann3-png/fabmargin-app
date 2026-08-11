# ⚡ Schnellstart: APK/AAB in der Cloud bauen (ohne PC-Installation)

## In 5 Minuten zum Test-APK auf Ihrem Handy

1. **GitHub-Konto** anlegen (kostenlos): https://github.com
2. Neues **Repository** erstellen, z. B. `fabmargin-app`, **Public**.
3. Inhalt dieses Ordners hochladen: „Add file → Upload files" → alles per Drag & Drop → **Commit**.
4. Oben im Repository auf **„Actions"** → „Build FabMargin 3D" wählen → **„Run workflow"** klicken.
5. Nach 5–8 Minuten steht unter „Artifacts":
   - `fabmargin-debug-apk` → **APK zum Sideloaden auf Ihrem Handy** (zum Selbsttest)
   - `fabmargin-release-aab-unsigned` → AAB als Basis fürs Play-Store-Upload (muss noch signiert werden)

## APK auf Ihrem Handy installieren

1. Debug-APK herunterladen und aufs Handy übertragen (E-Mail/Cloud/USB).
2. In Android-Einstellungen „Installation aus unbekannten Quellen" für Ihren Datei-Manager erlauben.
3. APK antippen → installieren → App starten und alle Funktionen testen.

## Für Play Store: AAB signieren

Den Signaturschlüssel erzeugen Sie lokal in Android Studio bzw. über die
Play Console/App Signing. Der Schlüssel bleibt zwingend bei Ihnen. Ohne ihn
sind keine Updates möglich.
