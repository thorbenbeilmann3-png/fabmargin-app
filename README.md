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
fabmargin-android-v2/
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
│       └── _sources.json         # Klartext-Vorlage (nicht ins APK!)
├── backend/                      # Erweitertes Node.js-Backend
│   ├── server.js                 # + /purchase/verify Endpoint
│   └── package.json
├── android-config/
│   └── proguard-rules.pro        # Code-Verschleierung
├── docs/
│   ├── 01-SCHNELLSTART.md
│   ├── 02-ANDROID-STUDIO.md
│   ├── 03-CLOUD-BUILD.md
│   ├── 04-PLAY-STORE.md
│   ├── 05-IN-APP-KAEUFE.md       # ⭐ NEU
│   └── 06-VERSCHLUESSELUNG.md    # ⭐ NEU
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
2. `docs/01-SCHNELLSTART.md` lesen.
3. Node.js + Android Studio installieren (oder GitHub-Cloud-Build).
4. `npm install && npx cap add android && npx cap sync android`.
5. APK/AAB bauen, testen, in Play Console hochladen.
6. In-App-Produkte in Play Console anlegen (siehe `docs/05-IN-APP-KAEUFE.md`).

Ich helfe an jedem Schritt weiter – sagen Sie einfach, wo Sie stehen.
