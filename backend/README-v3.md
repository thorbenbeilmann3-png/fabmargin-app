# PrintProfit3D Backend (MVP)

## Start

1. PostgreSQL bereitstellen.
2. `backend/.env.example` nach `.env` kopieren und Werte setzen.
3. Schema anwenden: `backend/database/001_init.sql`.
4. Dependencies installieren und starten:
   - `cd /home/runner/work/fabmargin-app/fabmargin-app/backend`
   - `npm install`
   - `npm start`

## Kern-Endpunkte

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/change-password`
- `GET /me`
- `POST /calculator/cost`
- CRUD: `/filaments`, `/printers`, `/projects`, `/sales`
- Ideen: `GET /ideas`, `POST /ideas`, `POST /ideas/:id/vote`
- Admin: `GET /admin/users`, `PATCH /admin/users/:id/status`, `PATCH /ideas/:id/status`

## Sicherheit

- Passwort-Hashing: bcrypt
- JWT-Auth mit serverseitiger Rollenprüfung
- Ownership-Checks gegen IDOR
- CORS per `ALLOWED_ORIGINS`
- Basis-Rate-Limits für Auth/Reset
