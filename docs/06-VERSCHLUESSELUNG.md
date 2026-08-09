# Verschlüsselung in FabMargin 3D – wie es wirklich funktioniert

## Was ist verschlüsselt?

| Was | Wie | Ohne Master-Passwort lesbar? |
|---|---|---|
| **Nutzerdaten** (Kunden, Aufträge, Notizen) | AES-256-GCM im Tresor | ❌ Nein |
| **Modul-Inhalte** (`content/*.enc`) | AES-256-GCM + PBKDF2 | ❌ Nein |
| **Kauf-Historie** | Nur SKU-IDs, keine sensiblen Daten | ✅ (belanglos) |
| **App-Code** (HTML/JS) | Nicht verschlüsselt, aber ProGuard-verschleiert (Java-Teil) | ⚠️ Teilweise lesbar |
| **Icons, Manifest** | Nicht verschlüsselt | ✅ (Android braucht Zugriff) |

## Warum ist der HTML-Code sichtbar?

Damit die WebView die App anzeigen kann, muss Android die HTML/JS-Dateien lesen können. Wenn man sie verschlüsseln würde, könnte auch die App sie nicht mehr laden. **Das ist bei jeder Hybrid-App so** – auch bei kommerziellen wie Slack, Trello, Microsoft Teams.

**Was wirklich schützt:**
- Die eigentliche Business-Logik läuft im **Backend** (Render). Dort liegt der Code, den niemand sieht.
- Alle **Daten** sind mit AES-256 verschlüsselt.
- Die **Kaufverifikation** läuft über Google Play + Ihren Server – Fälschung praktisch unmöglich.
- ProGuard/R8 verschleiert den Java/Kotlin-Teil der APK.

## Kryptographische Parameter

```
Verschlüsselung: AES-256-GCM (AEAD, authentifiziert)
Schlüsselableitung: PBKDF2-HMAC-SHA-256
Iterationen: 350 000
Salt: 16 Byte (zufällig, pro Datei)
IV: 12 Byte (zufällig, pro Verschlüsselung)
```

Diese Parameter entsprechen dem aktuellen **OWASP-Standard 2026** und sind mit vertretbarem Rechenaufwand nicht knackbar. Ein Angreifer bräuchte selbst bei einem schwachen 8-Zeichen-Passwort mit heutigen GPUs **Jahre**.

## Auto-Sperre

- Der Tresor sperrt automatisch nach **15 Minuten Inaktivität**.
- Beim App-Neustart ist der Tresor immer gesperrt.
- Das Master-Passwort liegt **nur im Arbeitsspeicher**, nie auf Platte.

## Was Sie NICHT tun sollten

- ❌ Das Master-Passwort per E-Mail oder Chat teilen
- ❌ Ein Passwort wie „passwort123" verwenden (min. 12 Zeichen, gemischt!)
- ❌ Die App auf einem gerooteten Handy nutzen (Root = Android-Sandbox aufgehoben)
- ❌ Das Passwort vergessen – es gibt **keine** Wiederherstellung
