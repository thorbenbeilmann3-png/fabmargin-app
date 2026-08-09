// Zusatz-Endpunkte v3 – in server.js einfügen (vor dem 404-Return)
// - /user/activate  : Kunden-Aktivierungscode einlösen, User-Konto anlegen
// - /user/login     : Kunden-Login
// - /community/list : Vorschläge auflisten
// - /community/post : Vorschlag posten (Login nötig)
// - /community/vote : abstimmen (Login nötig)
// - /security/report: Manipulations-Verdacht loggen (öffentlich, ratelimitiert)
// - Admin-Endpunkt /admin/generate-code (erzeugt neuen Aktivierungscode nach Kauf)
