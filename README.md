# FabMargin 3D – Android-App v2 (mit In-App-Käufen & Verschlüsselung)

Diese Version verwandelt Ihre Web-App in eine echte, kaufbare Android-App
für den Google Play Store. Kunden zahlen einmalig für einzelne Module,
alle Inhalte und Daten sind AES-256-verschlüsselt und ohne
Master-Passwort unlesbar.

## 🆕 Was ist neu gegenüber v1

- ✅ **Master-Passwort-Tresor** (AES-256-GCM + PBKDF2, 350 000 Iterationen)
- ✅ **6 kaufbare Module** (4,99 € – 16,99 €) via Google Play Billing
- ✅ **Server-Verifikation** aller Käufe (Play Developer API)
- ✅ **Verschlüsselte Content-Dateien** (`.enc`) – ohne Passwort unlesbar
- ✅ **Auto-Sperre** nach 15 Min. Inaktivität
- ✅ **ProGuard/R8** Code-Verschleierung für den nativen Teil

## 📂 Struktur

```
fabmargin-app/
├── www/                          # Web-App (wird in APK eingebettet)
│   ├── index.html                # Neue Oberfläche mit Setup/Login/Store
│   ├── app-main.js               # Haupt-App-Logik
│   ├── app.js                    # Capacitor-Bridge
│   ├── assets/
│   │   └── crypto-vault.js       # AES-256-Verschlüsselungs-Tresor
│   ├── features/
│   │   ├── catalog.js            # 6 Module + Preise
│   │   ├── purchase-manager.js   # Google Play Billing
│   │   └── content-loader.js     # Verschlüsselter Content-Loader
│   └── content/
│       ├── *.enc                 # Verschlüsselte Modul-Inhalte
├── backend/                      # Erweitertes Node.js-Backend
│   ├── server.js                 # + /purchase/verify Endpoint
│   └── package.json
├── android-config/
│   └── proguard-rules.pro        # Code-Verschleierung
├── SCHNELLSTART-CLOUD-BUILD.md   # Schnellstart für GitHub Actions / Cloud Build
├── docs/
│   ├── 05-IN-APP-KAEUFE.md       # Play-Store-Produkte & Preise
│   ├── 06-VERSCHLUESSELUNG.md    # Sicherheits- und Kryptografie-Konzept
│   ├── 07-KUNDEN-COMMUNITY.md    # Kundenkonto, Aktivierung, Community
│   ├── 08-SICHERHEIT-REALISTISCH.md
│   └── 09-APK-DIREKT-DOWNLOAD.md
├── android-assets/               # Play-Store-Materialien
└── capacitor.config.json
```

## 🔐 Sicherheitsmodell

| Ebene | Schutz |
|---|---|
| **Nutzerdaten** | AES-256-GCM · Master-Passwort · Auto-Sperre |
| **Modul-Inhalte** | Vor dem APK-Bau verschlüsselt (`.enc`) |
| **Käufe** | Google Play + serverseitige Verifikation (Play Developer API) |
| **Backend** | HTTPS · scrypt · Rate-Limit · Origin-Check |
| **App-Code** | ProGuard/R8-Verschleierung (Java-Teil) |

**Ehrlicher Hinweis:** Der WebView-HTML/JS-Code ist in einer entpackten APK
prinzipiell lesbar (das ist bei allen Hybrid-Apps so, auch bei Slack,
Teams etc.). Die echte Sicherheit liegt in der Datenverschlüsselung und
im Backend – nicht im „Verstecken" des Codes.

## 🚀 Ihre nächsten Schritte

1. ZIP entpacken.
2. `SCHNELLSTART-CLOUD-BUILD.md` lesen.
3. Node.js + Android Studio installieren (oder GitHub-Cloud-Build).
4. `npm install && npx cap add android && npx cap sync android`.
5. APK/AAB bauen, testen, in Play Console hochladen.
6. In-App-Produkte in Play Console anlegen (siehe `docs/05-IN-APP-KAEUFE.md`).

Ich helfe an jedem Schritt weiter – sagen Sie einfach, wo Sie stehen.

---

## 🛒 Google Play Store – Schritt-für-Schritt Anleitung

### Schritt 1 – Keystore erstellen (einmalig)

```bash
keytool -genkey -v \
  -keystore fabmargin-release.keystore \
  -alias fabmargin \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

**Wichtig:** Den Keystore sicher aufbewahren – ohne ihn können keine Updates veröffentlicht werden!

### Schritt 2 – GitHub Secrets hinterlegen

Im GitHub Repository unter **Settings → Secrets and variables → Actions** folgende Secrets anlegen:

| Secret | Inhalt |
|--------|--------|
| `KEYSTORE_FILE` | `base64 fabmargin-release.keystore` (Ausgabe des Befehls) |
| `KEY_ALIAS` | z.B. `fabmargin` |
| `KEY_PASSWORD` | Passwort des Keys |
| `STORE_PASSWORD` | Passwort des Keystores |

```bash
# Keystore in Base64 konvertieren (für KEYSTORE_FILE Secret)
base64 -w 0 fabmargin-release.keystore
```

### Schritt 3 – AAB bauen

Den GitHub Actions Workflow **„Build FabMargin – APK & AAB"** manuell starten oder auf `main` pushen.  
Danach unter **Actions → Artifacts** die Datei `FabMargin-release.aab` herunterladen.

### Schritt 4 – Google Play Console

1. Account erstellen (einmalig 25$): https://play.google.com/console
2. Neue App anlegen
3. AAB-Datei hochladen
4. Store-Seite ausfüllen (Texte in `store-listing/`)
5. Screenshots und Feature Graphic hochladen
6. Datenschutzerklärung verlinken
7. Inhalts-Rating ausfüllen (ca. 5 Min.)
8. Veröffentlichung einreichen → Google prüft 3–7 Werktage

📋 Vollständige Checkliste: [`store-listing/play-store-checklist.md`](store-listing/play-store-checklist.md)
