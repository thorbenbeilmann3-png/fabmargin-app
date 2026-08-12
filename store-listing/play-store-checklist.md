# Google Play Store – Checkliste

Diese Checkliste zeigt alles, was **manuell** in der Google Play Console erledigt werden muss.

## Pflichtschritte vor dem Upload

- [ ] Google Play Console Account erstellen (25$ einmalig): https://play.google.com/console
- [ ] Keystore erstellen und als GitHub Secret hinterlegen (siehe README)
  - Secret `KEYSTORE_FILE` – Base64-kodierter Keystore
  - Secret `KEY_ALIAS` – Key-Alias im Keystore
  - Secret `KEY_PASSWORD` – Passwort des Keys
  - Secret `STORE_PASSWORD` – Passwort des Keystores
- [ ] AAB-Datei aus GitHub Actions herunterladen (Artifact: `FabMargin-release.aab`)

## Store-Seite in der Play Console

- [ ] App-Name: `FabMargin`
- [ ] Kurzbeschreibung aus `store-listing/short-description-de.txt` einfügen (max. 80 Zeichen)
- [ ] Vollständige Beschreibung aus `store-listing/description-de.txt` einfügen (max. 4000 Zeichen)
- [ ] Changelog aus `store-listing/changelog-de.txt` einfügen
- [ ] Screenshots erstellen (min. 2, empfohlen 8) – Smartphone-Format
- [ ] Feature Graphic erstellen (1024×500 px PNG) – siehe `android-assets/feature-graphic-anleitung.md`
- [ ] App-Icon hochladen (512×512 px PNG, kein Alpha-Kanal!)

## Technische Anforderungen

- [ ] App-Kategorie: **Tools** oder **Finance**
- [ ] Zielgruppe festlegen: **18+** (keine Kinder-App)
- [ ] Inhalts-Rating-Fragebogen ausfüllen (ca. 5 Min.)
- [ ] Datenschutzerklärung URL angeben (DSGVO-Pflicht!)

## Release

- [ ] Interner Test-Track: AAB hochladen und mit Testern testen
- [ ] Produktions-Release erstellen
- [ ] Veröffentlichung abschicken – Google prüft ca. 3–7 Werktage

## Nützliche Links

- Play Console: https://play.google.com/console
- Signing-Dokumentation: https://developer.android.com/studio/publish/app-signing
- Content Rating: https://support.google.com/googleplay/android-developer/answer/188189
