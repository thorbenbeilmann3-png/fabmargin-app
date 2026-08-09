# Kunden-Login & Community (v3)

## Kaufablauf
1. Kunde kauft App in Google Play → App wird installiert.
2. In-App-Kauf eines Moduls → Google sendet Kauftoken → Backend verifiziert.
3. Backend erzeugt einmaligen Aktivierungscode und sendet ihn per E-Mail.
4. Kunde tippt Code + Wunsch-Benutzernamen + Passwort ein → Konto aktiv.

## Community
- Vorschläge sind nach Stimmen sortiert.
- Ein Konto = eine Stimme pro Vorschlag.
- Sie als Admin sehen alle Vorschläge im Admin-Bereich und können sie annehmen/ablehnen.

## Rechtliche Punkte
- **Impressum + Datenschutz** sind Pflicht bei einer bezahlten App mit User-Konten.
- **Widerrufsbelehrung** bei digitalen Produkten: 14 Tage, verfällt bei sofortigem Abruf (Zustimmung einholen!).
- **AGB** empfohlen, aber nicht Pflicht.
Vorlagen liegen in `android-assets/`.
