// FabMargin 3D – Erweitertes Backend (v2)
// - Admin-Login (wie zuvor)
// - Google Play Billing: /purchase/verify (validiert Kauf-Token bei Google)
// - Play Integrity: /trusted-event (später einbindbar)
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'security-state.json');
const PORT = Number(process.env.PORT || 8787);
const SECURITY_EMAIL = process.env.SECURITY_EMAIL || 'printprofit3d_business.stoneware127@passmail.net';
const RESEND_FROM = process.env.RESEND_FROM || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const DEV_OTP_LOG = process.env.DEV_OTP_LOG === 'true';
const SECURITY_WEBHOOK_SECRET = process.env.SECURITY_WEBHOOK_SECRET || '';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

// Google Play Developer API Zugangsdaten (Service-Account JSON als ENV oder Datei)
const GOOGLE_PLAY_PACKAGE = process.env.GOOGLE_PLAY_PACKAGE || 'com.printprofit3d.fabmargin';
const GOOGLE_PLAY_SA_JSON = process.env.GOOGLE_PLAY_SA_JSON || '';

const sessions = new Map(); // token -> { exp, type, userId? }
const limits = new Map();
if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
  console.error('ADMIN_USERNAME und ADMIN_PASSWORD müssen gesetzt sein.');
  process.exit(1);
}

const b64 = b => Buffer.from(b).toString('base64url');
const hashPassword = (p, s) => b64(crypto.scryptSync(p, s, 64));
function safeEqual(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
function initialState() {
  const salt = b64(crypto.randomBytes(24));
  return {
    version: 2,
    admin: { username: process.env.ADMIN_USERNAME, salt, passwordHash: hashPassword(process.env.ADMIN_PASSWORD, salt), updatedAt: new Date().toISOString() },
    reset: null,
    security: { failedLogins: 0, purchasesPaused: false, pauseReason: '', incidents: [] },
    purchases: {},  // purchaseToken -> {sku, verifiedAt, orderId}
    codes: {},      // code -> { createdAt, usedBy? }
    users: {},      // username -> { salt, passwordHash, email, createdAt, banned }
    ideas: [],      // [{ id, authorUsername, title, text, votes:{username:1/-1}, status, createdAt }]
    reports: []     // [{ id, ideaId, reporterUsername, reason, createdAt }]
  };
}
function loadState() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return initialState(); } }
let state = loadState();
function saveState() { const tmp = DATA_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 }); fs.renameSync(tmp, DATA_FILE); }
if (!fs.existsSync(DATA_FILE)) saveState();
if (!state.purchases) { state.purchases = {}; saveState(); }
if (!state.codes)    { state.codes    = {}; saveState(); }
if (!state.users)    { state.users    = {}; saveState(); }
if (!state.ideas)    { state.ideas    = []; saveState(); }
if (!state.reports)  { state.reports  = []; saveState(); }

function incident(type, detail, severity = 'info') {
  const item = { id: crypto.randomUUID(), time: new Date().toISOString(), type, detail, severity };
  state.security.incidents.unshift(item);
  state.security.incidents = state.security.incidents.slice(0, 300);
  saveState();
  return item;
}

function createSession(type = 'admin', userId = null) {
  const t = b64(crypto.randomBytes(32));
  sessions.set(t, { exp: Date.now() + 30 * 60 * 1000, type, userId });
  return t;
}
function sessionOk(req) {
  const h = String(req.headers.authorization || '');
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = sessions.get(t);
  if (!s || s.exp < Date.now()) { if (t) sessions.delete(t); return false; }
  return true;
}
function getSession(req) {
  const h = String(req.headers.authorization || '');
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = sessions.get(t);
  if (!s || s.exp < Date.now()) { if (t) sessions.delete(t); return null; }
  return s;
}
function rateOk(key, limit, windowMs) { const now = Date.now(), x = limits.get(key); if (!x || now - x.start >= windowMs) { limits.set(key, { start: now, count: 1 }); return true; } x.count++; return x.count <= limit; }
function json(res, status, obj, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'" };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  res.writeHead(status, headers); res.end(JSON.stringify(obj));
}
async function body(req) { let s = ''; for await (const c of req) { s += c; if (s.length > 32768) throw new Error('Payload zu groß'); } return s ? JSON.parse(s) : {}; }
function originAllowed(req) { const o = req.headers.origin; if (!o) return ''; if (allowedOrigins.length && !allowedOrigins.includes(o)) return null; return o; }

// -------- Google Play Billing: JWT-Signatur mit Service-Account --------
async function googleAccessToken() {
  if (!GOOGLE_PLAY_SA_JSON) throw new Error('GOOGLE_PLAY_SA_JSON fehlt');
  const sa = JSON.parse(GOOGLE_PLAY_SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now
  };
  const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = enc(header) + '.' + enc(claim);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned); signer.end();
  const sig = signer.sign(sa.private_key).toString('base64url');
  const jwt = unsigned + '.' + sig;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Google-Auth fehlgeschlagen: ' + JSON.stringify(j));
  return j.access_token;
}

async function verifyPlayPurchase(sku, token) {
  const tk = await googleAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PLAY_PACKAGE}/purchases/products/${sku}/tokens/${token}`;
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tk } });
  const j = await r.json();
  if (!r.ok) return { ok: false, error: j.error?.message || 'Play-Prüfung fehlgeschlagen' };
  // purchaseState: 0 = Purchased, 1 = Canceled, 2 = Pending
  if (j.purchaseState !== 0) return { ok: false, error: 'Kauf nicht abgeschlossen (State=' + j.purchaseState + ')' };
  return { ok: true, orderId: j.orderId };
}

// Similarity detection (simple token-overlap)
function similar(a, b) {
  const tokens = s => new Set(s.toLowerCase().replace(/[^a-z0-9äöü ]/g, '').split(/\s+/).filter(w => w.length > 3));
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.min(ta.size, tb.size);
}

// -------------------------- Server --------------------------
const server = http.createServer(async (req, res) => {
  const origin = originAllowed(req);
  if (origin === null) return json(res, 403, { ok: false, error: 'Origin nicht erlaubt' });
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Security-Secret',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    return res.end();
  }
  const ip = req.socket.remoteAddress || 'unknown';
  const u = new URL(req.url, 'http://localhost');

  try {
    // Health
    if (u.pathname === '/health') return json(res, 200, { ok: true, purchasesPaused: state.security.purchasesPaused }, origin);

    // Kauf-Verifikation (von der App gerufen)
    if (u.pathname === '/purchase/verify' && req.method === 'POST') {
      if (!rateOk('verify:' + ip, 30, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const b = await body(req);
      if (!b.sku || !b.purchaseToken) return json(res, 400, { ok: false, error: 'sku und purchaseToken erforderlich' }, origin);
      // Duplikate abfangen
      if (state.purchases[b.purchaseToken]) return json(res, 200, { ok: true, alreadyVerified: true, orderId: state.purchases[b.purchaseToken].orderId }, origin);
      let result;
      try { result = await verifyPlayPurchase(b.sku, b.purchaseToken); }
      catch (e) { return json(res, 500, { ok: false, error: e.message }, origin); }
      if (!result.ok) return json(res, 402, result, origin);
      state.purchases[b.purchaseToken] = { sku: b.sku, verifiedAt: new Date().toISOString(), orderId: result.orderId };
      saveState();
      incident('purchase_verified', `SKU=${b.sku} order=${result.orderId}`, 'info');
      return json(res, 200, { ok: true, orderId: result.orderId }, origin);
    }

    // Admin-Login
    if (u.pathname === '/admin/login' && req.method === 'POST') {
      if (!rateOk('login:' + ip, 10, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Versuche' }, origin);
      const b = await body(req);
      const ok = safeEqual(b.username || '', state.admin.username) && safeEqual(hashPassword(b.password || '', state.admin.salt), state.admin.passwordHash);
      if (!ok) {
        state.security.failedLogins++;
        if (state.security.failedLogins >= 5) { state.security.purchasesPaused = true; state.security.pauseReason = 'Zu viele Fehlversuche'; }
        saveState();
        incident('admin_login_failed', 'ip=' + ip, 'warn');
        return json(res, 401, { ok: false, error: 'Falsche Zugangsdaten' }, origin);
      }
      state.security.failedLogins = 0; saveState();
      return json(res, 200, { ok: true, token: createSession('admin'), expiresAt: Date.now() + 30 * 60 * 1000 }, origin);
    }

    // ===== USER AUTH =====

    // POST /user/activate – Aktivierungscode einlösen, Konto anlegen
    if (u.pathname === '/user/activate' && req.method === 'POST') {
      if (!rateOk('activate:' + ip, 5, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const b = await body(req);
      const { code, username, password, email } = b;
      if (!code || !username || !password) return json(res, 400, { ok: false, error: 'code, username und password erforderlich' }, origin);
      if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) return json(res, 400, { ok: false, error: 'Ungültiger Username (3-32 Zeichen, a-z 0-9 _ -)' }, origin);
      const codeEntry = state.codes[code];
      if (!codeEntry || codeEntry.usedBy) return json(res, 400, { ok: false, error: 'Ungültiger oder bereits verwendeter Code' }, origin);
      if (state.users[username]) return json(res, 409, { ok: false, error: 'Username bereits vergeben' }, origin);
      const salt = b64(crypto.randomBytes(24));
      state.users[username] = { salt, passwordHash: hashPassword(password, salt), email: email || '', createdAt: new Date().toISOString(), banned: false };
      state.codes[code].usedBy = username;
      saveState();
      const token = createSession('user', username);
      return json(res, 200, { ok: true, token, expiresAt: Date.now() + 30 * 60 * 1000 }, origin);
    }

    // POST /user/login
    if (u.pathname === '/user/login' && req.method === 'POST') {
      if (!rateOk('ulogin:' + ip, 10, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Versuche' }, origin);
      const b = await body(req);
      const { username, password } = b;
      const user = state.users[username];
      if (!user || !safeEqual(hashPassword(password || '', user.salt), user.passwordHash))
        return json(res, 401, { ok: false, error: 'Falsche Zugangsdaten' }, origin);
      if (user.banned) return json(res, 403, { ok: false, error: 'Account gesperrt' }, origin);
      const token = createSession('user', username);
      return json(res, 200, { ok: true, token, expiresAt: Date.now() + 30 * 60 * 1000 }, origin);
    }

    // GET /user/me
    if (u.pathname === '/user/me' && req.method === 'GET') {
      const sess = getSession(req);
      if (!sess || sess.type !== 'user') return json(res, 401, { ok: false, error: 'Nicht eingeloggt' }, origin);
      const user = state.users[sess.userId];
      if (!user) return json(res, 404, { ok: false, error: 'User nicht gefunden' }, origin);
      return json(res, 200, { ok: true, username: sess.userId, email: user.email, createdAt: user.createdAt, banned: user.banned }, origin);
    }

    // ===== COMMUNITY =====

    // GET /community/list – Ideen sortiert nach Votes
    if (u.pathname === '/community/list' && req.method === 'GET') {
      if (!rateOk('clist:' + ip, 30, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const sorted = [...state.ideas]
        .sort((a, b) => Object.values(b.votes).reduce((s, v) => s + v, 0) - Object.values(a.votes).reduce((s, v) => s + v, 0))
        .map(idea => ({
          id: idea.id,
          title: idea.title,
          text: idea.text,
          author: idea.authorUsername,
          votes: Object.values(idea.votes).reduce((s, v) => s + v, 0),
          status: idea.status,
          createdAt: idea.createdAt
        }));
      return json(res, 200, { ok: true, ideas: sorted }, origin);
    }

    // POST /community/post – Neue Idee (Login nötig), mit Duplicate Detection
    if (u.pathname === '/community/post' && req.method === 'POST') {
      if (!rateOk('cpost:' + ip, 5, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const sess = getSession(req);
      if (!sess || sess.type !== 'user') return json(res, 401, { ok: false, error: 'Login erforderlich' }, origin);
      const user = state.users[sess.userId];
      if (!user || user.banned) return json(res, 403, { ok: false, error: 'Account gesperrt' }, origin);
      const b = await body(req);
      const { title, text, force } = b;
      if (!title || !text) return json(res, 400, { ok: false, error: 'title und text erforderlich' }, origin);
      if (!force) {
        const dupes = state.ideas.filter(i => similar(i.title + ' ' + i.text, title + ' ' + text) >= 0.5);
        if (dupes.length) {
          return json(res, 409, { ok: false, error: 'Ähnliche Idee existiert bereits', duplicates: dupes.map(i => ({ id: i.id, title: i.title })) }, origin);
        }
      }
      const idea = { id: crypto.randomUUID(), authorUsername: sess.userId, title, text, votes: {}, status: 'open', createdAt: new Date().toISOString() };
      state.ideas.push(idea);
      saveState();
      return json(res, 200, { ok: true, id: idea.id }, origin);
    }

    // POST /community/vote – Abstimmen (1x pro User und Idee)
    if (u.pathname === '/community/vote' && req.method === 'POST') {
      if (!rateOk('cvote:' + ip, 20, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const sess = getSession(req);
      if (!sess || sess.type !== 'user') return json(res, 401, { ok: false, error: 'Login erforderlich' }, origin);
      const user = state.users[sess.userId];
      if (!user || user.banned) return json(res, 403, { ok: false, error: 'Account gesperrt' }, origin);
      const b = await body(req);
      const { id, dir } = b;
      if (!id || (dir !== 'up' && dir !== 'down')) return json(res, 400, { ok: false, error: 'id und dir (up/down) erforderlich' }, origin);
      const idea = state.ideas.find(i => i.id === id);
      if (!idea) return json(res, 404, { ok: false, error: 'Idee nicht gefunden' }, origin);
      if (idea.votes[sess.userId] !== undefined) return json(res, 409, { ok: false, error: 'Bereits abgestimmt' }, origin);
      idea.votes[sess.userId] = dir === 'up' ? 1 : -1;
      saveState();
      const total = Object.values(idea.votes).reduce((s, v) => s + v, 0);
      return json(res, 200, { ok: true, votes: total }, origin);
    }

    // POST /community/report – Idee melden
    if (u.pathname === '/community/report' && req.method === 'POST') {
      if (!rateOk('creport:' + ip, 5, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const b = await body(req);
      const { ideaId, reason } = b;
      if (!ideaId) return json(res, 400, { ok: false, error: 'ideaId erforderlich' }, origin);
      if (!state.ideas.find(i => i.id === ideaId)) return json(res, 404, { ok: false, error: 'Idee nicht gefunden' }, origin);
      const sess = getSession(req);
      const report = { id: crypto.randomUUID(), ideaId, reporterUsername: sess?.userId || null, reason: reason || '', createdAt: new Date().toISOString() };
      state.reports.push(report);
      saveState();
      return json(res, 200, { ok: true }, origin);
    }

    // ===== ADMIN =====

    // GET /admin/users
    if (u.pathname === '/admin/users' && req.method === 'GET') {
      const sess = getSession(req);
      if (!sess || sess.type !== 'admin') return json(res, 401, { ok: false, error: 'Admin-Session erforderlich' }, origin);
      const users = Object.entries(state.users).map(([username, u]) => ({ username, email: u.email, createdAt: u.createdAt, banned: u.banned }));
      return json(res, 200, { ok: true, users }, origin);
    }

    // POST /admin/ban
    if (u.pathname === '/admin/ban' && req.method === 'POST') {
      const sess = getSession(req);
      if (!sess || sess.type !== 'admin') return json(res, 401, { ok: false, error: 'Admin-Session erforderlich' }, origin);
      const b = await body(req);
      const { username, banned } = b;
      if (!username) return json(res, 400, { ok: false, error: 'username erforderlich' }, origin);
      const user = state.users[username];
      if (!user) return json(res, 404, { ok: false, error: 'User nicht gefunden' }, origin);
      user.banned = !!banned;
      saveState();
      incident('admin_ban', `username=${username} banned=${banned}`, 'warn');
      return json(res, 200, { ok: true, username, banned: user.banned }, origin);
    }

    // POST /admin/idea/status
    if (u.pathname === '/admin/idea/status' && req.method === 'POST') {
      const sess = getSession(req);
      if (!sess || sess.type !== 'admin') return json(res, 401, { ok: false, error: 'Admin-Session erforderlich' }, origin);
      const b = await body(req);
      const { id, status } = b;
      const validStatuses = ['open', 'in_progress', 'done', 'rejected'];
      if (!id || !validStatuses.includes(status)) return json(res, 400, { ok: false, error: 'id und status (open|in_progress|done|rejected) erforderlich' }, origin);
      const idea = state.ideas.find(i => i.id === id);
      if (!idea) return json(res, 404, { ok: false, error: 'Idee nicht gefunden' }, origin);
      idea.status = status;
      saveState();
      return json(res, 200, { ok: true, id, status }, origin);
    }

    // GET /admin/reports
    if (u.pathname === '/admin/reports' && req.method === 'GET') {
      const sess = getSession(req);
      if (!sess || sess.type !== 'admin') return json(res, 401, { ok: false, error: 'Admin-Session erforderlich' }, origin);
      return json(res, 200, { ok: true, reports: state.reports }, origin);
    }

    // POST /admin/generate-code
    if (u.pathname === '/admin/generate-code' && req.method === 'POST') {
      const sess = getSession(req);
      if (!sess || sess.type !== 'admin') return json(res, 401, { ok: false, error: 'Admin-Session erforderlich' }, origin);
      const code = b64(crypto.randomBytes(12));
      state.codes[code] = { createdAt: new Date().toISOString(), usedBy: null };
      saveState();
      incident('admin_generate_code', 'code=' + code.slice(0, 4) + '…', 'info');
      return json(res, 200, { ok: true, code }, origin);
    }

    // ... weitere Admin-Endpunkte (OTP-Reset etc.) hier ergänzen (aus v1 übernehmen)

    return json(res, 404, { ok: false, error: 'Nicht gefunden' }, origin);
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok: false, error: e.message }, origin);
  }
});

server.listen(PORT, () => console.log('FabMargin Backend v2 auf Port', PORT));
