# Was in dieser App realistisch geschützt ist (und was nicht)

## Was geschützt ist
- ✅ **Daten**: AES-256-GCM, ohne Master-Passwort unlesbar.
- ✅ **Käufe**: Von Google Play + Ihrem Server verifiziert – Fälschung praktisch unmöglich.
- ✅ **Backend**: HTTPS, scrypt, Rate-Limit, Origin-Check.
- ✅ **Client-Integrität**: Root-, Debug-, Emulator-, Headless-Erkennung.
- ✅ **Play Integrity**: Google bestätigt Ihrem Server, dass die App unverändert ist.

## Was NICHT geht (und warum)
- ❌ **App löscht sich selbst bei KI-Nutzung**: Google Play verbietet Selbstlöschung; eine App kann außerdem gar nicht sehen, welche anderen Apps/KIs laufen.
- ❌ **Globale Personen-Blacklist**: DSGVO-widrig ohne Rechtsgrund.
- ❌ **Code komplett unlesbar in APK**: Bei Hybrid-Apps physisch nicht möglich.

## Was stattdessen gemacht wird
- **Konto-Sperre** bei nachweislichem Missbrauch (rechtlich sauber, Vertragsverhältnis).
- **Manipulations-Log** unter „Sicherheitsvorfälle" im Admin.
- **Server-seitige Sperre** aller Käufe/Module bei fehlgeschlagener Integrity-Prüfung.
