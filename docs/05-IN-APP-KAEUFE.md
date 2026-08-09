# In-App-Käufe – nur Zusatzmodule (v4)

Die **Pro-Version** ist der Play-Store-Grundkauf und enthält:
- App-Login mit Master-Passwort
- AES-256-Tresor
- Community-Funktion (Vorschläge & Abstimmung)

Alle weiteren Module sind **In-App-Käufe** (Managed Products) in der Play Console.

## Produkte in der Play Console anlegen

Play Console → App → Monetarisierung → In-App-Produkte:

| SKU | Titel | Preis |
|---|---|---|
| `fabmargin.calc_pro` | Kalkulations-Modul Pro | 4,99 € |
| `fabmargin.material_db` | Material-Datenbank | 3,99 € |
| `fabmargin.customer_mgr` | Kundenverwaltung | 5,99 € |
| `fabmargin.invoice` | Rechnungsgenerator | 6,99 € |
| `fabmargin.analytics` | Auswertungen & Statistiken | 4,99 € |
| `fabmargin.bundle_all` | Komplett-Bundle | 16,99 € |

Typ jeweils: **Verwaltetes Produkt** (kein Abo).

## Preis für die App selbst (Pro-Version)

Bei „Monetarisierung → Preise" tragen Sie den einmaligen App-Kaufpreis ein.
Empfehlung: **kostenlos** herunterladbar, Zusatzmodule als In-App-Käufe – so
erreichen Sie mehr Nutzer und die Preisschwelle liegt niedriger.

## Kaufablauf

Kunde tippt „Kaufen" → Google Play zeigt Zahldialog → App bekommt purchaseToken
→ Backend verifiziert via Play Developer API → Modul freigeschaltet und
Inhalt entschlüsselt.
