# Backend v3 – Zusatz-Endpunkte

Die neuen Endpunkte werden in `server.js` ergänzt (vor `return json(res,404,...)`):

## /user/activate  (POST, öffentlich)
Body: `{code, username, password, email}`
- Prüft Code in `state.pendingCodes[code]` (aus /admin/generate-code)
- Legt `state.users[username]` mit scrypt-Hash an
- Löscht Code, gibt Session-Token zurück

## /user/login (POST, öffentlich)
Body: `{username, password}` → Token zurück

## /community/list (GET, Token)
Gibt `state.community` sortiert nach votes zurück

## /community/post (POST, Token)
Body: `{title, text}` → neuer Eintrag mit UUID

## /community/vote (POST, Token)
Body: `{id, dir}` (+1/-1) – pro Nutzer nur eine Stimme pro Vorschlag

## /security/report (POST, ratelimitiert)
Body: `{flags, ua, ts}` → landet in `state.security.incidents`

## /admin/generate-code (POST, Admin-Token)
Body: `{email}` → erzeugt Aktivierungscode, sendet ihn per Resend an die E-Mail.

**Wichtig:** Vollständige Implementierung siehe docs/07-BACKEND-V3.md.
