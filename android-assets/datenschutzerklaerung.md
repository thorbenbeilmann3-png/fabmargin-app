# Datenschutzerklärung für FabMargin 3D

**Stand: August 2026**

## 1. Verantwortlicher

[Ihr Name / Firma]
[Ihre Adresse]
E-Mail: app.github.uncorrupt873@passmail.net

## 2. Welche Daten wir verarbeiten

FabMargin 3D ist eine Admin-App und richtet sich ausschließlich an den
Betreiber (Administrator) des PrintProfit-3D-Systems. Es werden **keine
Kundendaten** verarbeitet.

Verarbeitete Daten des Administrators:
- **Benutzername und Passwort** (serverseitig gehasht mit scrypt + Salt)
- **Sitzungs-Token** (30 Min. gültig, nur im Arbeitsspeicher)
- **IP-Adresse** (für Rate-Limiting, nicht dauerhaft gespeichert)
- **Sicherheitsvorfälle** (Zeitstempel, Ereignistyp) im Server-Log

## 3. Zweck der Verarbeitung

- Authentifizierung des Administrators
- Schutz vor unbefugtem Zugriff (Rate-Limiting, Brute-Force-Schutz)
- Zusendung von Einmalcodes bei Passwort-Reset (an die hinterlegte
  Sicherheitsadresse via Resend)

## 4. Rechtsgrundlage

Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) und Art. 6 Abs. 1 lit. f
DSGVO (berechtigtes Interesse an sicherer Systemverwaltung).

## 5. Datenweitergabe

Keine Weitergabe an Dritte. Ausnahme: Resend (E-Mail-Versanddienst) für
Einmalcodes – siehe https://resend.com/legal/privacy-policy.

## 6. Speicherdauer

- Passwort-Hash: bis zum Widerruf / Passwortänderung
- Sitzungen: max. 30 Minuten
- Sicherheitsvorfälle: max. 300 Einträge (rollierend)

## 7. Ihre Rechte

Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung
der Verarbeitung, Datenübertragbarkeit und Widerspruch. Anfragen bitte an
die oben genannte E-Mail-Adresse.

## 8. Löschung des Kontos

Löschanfragen bitte per E-Mail. Wir löschen alle Ihre Daten innerhalb von
30 Tagen.

## 9. Änderungen

Diese Datenschutzerklärung kann bei Bedarf angepasst werden. Die jeweils
aktuelle Version finden Sie in der App und unter der hinterlegten URL.
