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

const sessions = new Map(), limits = new Map();
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
    users: {}, // username -> {email, salt, passwordHash, role, createdAt}
    pendingCodes: {}, // code -> {email, createdAt, usedAt}
    community: {} // id -> {id, title, text, author, createdAt, updatedAt, votesBy}
  };
}
function loadState() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return initialState(); } }
let state = loadState();
function saveState() { const tmp = DATA_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 }); fs.renameSync(tmp, DATA_FILE); }
if (!fs.existsSync(DATA_FILE)) saveState();
if (!state.purchases) { state.purchases = {}; saveState(); }
if (!state.users) { state.users = {}; saveState(); }
if (!state.pendingCodes) { state.pendingCodes = {}; saveState(); }
if (!state.community) { state.community = {}; saveState(); }
if (!state.security) { state.security = { failedLogins: 0, purchasesPaused: false, pauseReason: '', incidents: [] }; saveState(); }
if (!Array.isArray(state.security.incidents)) { state.security.incidents = []; saveState(); }

function incident(type, detail, severity = 'info') {
  const item = { id: crypto.randomUUID(), time: new Date().toISOString(), type, detail, severity };
  state.security.incidents.unshift(item);
  state.security.incidents = state.security.incidents.slice(0, 300);
  saveState();
  return item;
}

function createSession(payload = {}) {
  const t = b64(crypto.randomBytes(32));
  sessions.set(t, { exp: Date.now() + 30 * 60 * 1000, ...payload });
  return t;
}
function getSession(req) {
  const h = String(req.headers.authorization || '');
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const item = sessions.get(t);
  if (!item || item.exp < Date.now()) { if (t) sessions.delete(t); return null; }
  return item;
}
function rateOk(key, limit, windowMs) { const now = Date.now(), x = limits.get(key); if (!x || now - x.start >= windowMs) { limits.set(key, { start: now, count: 1 }); return true; } x.count++; return x.count <= limit; }
function json(res, status, obj, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'" };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  res.writeHead(status, headers); res.end(JSON.stringify(obj));
}
async function body(req) { let s = ''; for await (const c of req) { s += c; if (s.length > 32768) throw new Error('Payload zu groß'); } return s ? JSON.parse(s) : {}; }
function originAllowed(req) { const o = req.headers.origin; if (!o) return ''; if (allowedOrigins.length && !allowedOrigins.includes(o)) return null; return o; }
function normalizedText(v) {
  return String(v || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim();
}
function postScore(post) {
  return Object.values(post?.votesBy || {}).reduce((sum, x) => sum + (Number(x) || 0), 0);
}
function validUserName(v) { return /^[a-zA-Z0-9_.-]{3,32}$/.test(String(v || '')); }
function authUser(req) {
  const s = getSession(req);
  if (!s || !s.username || !state.users[s.username]) return null;
  return s.username;
}
function createActivationCode() {
  const p = b64(crypto.randomBytes(9)).replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return `${p.slice(0, 4)}-${p.slice(4, 8)}-${p.slice(8, 12)}`;
}

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
      return json(res, 200, { ok: true, token: createSession({ role: 'admin', username: state.admin.username }), expiresAt: Date.now() + 30 * 60 * 1000 }, origin);
    }

    if (u.pathname === '/admin/generate-code' && req.method === 'POST') {
      if (!rateOk('admin-code:' + ip, 20, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const s = getSession(req);
      if (!s || s.role !== 'admin') return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      const b = await body(req);
      const email = String(b.email || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { ok: false, error: 'Gültige E-Mail erforderlich' }, origin);
      const code = createActivationCode();
      state.pendingCodes[code] = { email, createdAt: new Date().toISOString(), usedAt: null };
      saveState();
      return json(res, 200, { ok: true, code }, origin);
    }

    if (u.pathname === '/user/activate' && req.method === 'POST') {
      if (!rateOk('activate:' + ip, 20, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const b = await body(req);
      const code = String(b.code || '').trim().toUpperCase();
      const username = String(b.username || '').trim();
      const password = String(b.password || '');
      const email = String(b.email || '').trim().toLowerCase();
      if (!code || !username || !password || !email) return json(res, 400, { ok: false, error: 'code, username, password, email erforderlich' }, origin);
      if (!validUserName(username)) return json(res, 400, { ok: false, error: 'Benutzername ungültig (3-32 Zeichen: a-z, 0-9, _ . -)' }, origin);
      if (password.length < 10) return json(res, 400, { ok: false, error: 'Passwort zu kurz (mindestens 10 Zeichen)' }, origin);
      if (state.users[username]) return json(res, 409, { ok: false, error: 'Benutzername bereits vergeben' }, origin);
      const codeEntry = state.pendingCodes[code];
      if (!codeEntry || codeEntry.usedAt) return json(res, 400, { ok: false, error: 'Aktivierungscode ungültig oder bereits verwendet' }, origin);
      if (codeEntry.email !== email) return json(res, 400, { ok: false, error: 'E-Mail passt nicht zum Aktivierungscode' }, origin);
      const salt = b64(crypto.randomBytes(24));
      state.users[username] = { email, salt, passwordHash: hashPassword(password, salt), role: 'user', createdAt: new Date().toISOString() };
      codeEntry.usedAt = new Date().toISOString();
      saveState();
      const token = createSession({ role: 'user', username });
      incident('user_activated', `username=${username}`, 'info');
      return json(res, 200, { ok: true, token, username }, origin);
    }

    if (u.pathname === '/user/login' && req.method === 'POST') {
      if (!rateOk('user-login:' + ip, 20, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const b = await body(req);
      const username = String(b.username || '').trim();
      const password = String(b.password || '');
      const user = state.users[username];
      if (!user) return json(res, 401, { ok: false, error: 'Ungültige Zugangsdaten' }, origin);
      const ok = safeEqual(hashPassword(password, user.salt), user.passwordHash);
      if (!ok) return json(res, 401, { ok: false, error: 'Ungültige Zugangsdaten' }, origin);
      const token = createSession({ role: user.role || 'user', username });
      return json(res, 200, { ok: true, token, username }, origin);
    }

    if (u.pathname === '/community/list' && req.method === 'GET') {
      const items = Object.values(state.community)
        .map(item => ({
          id: item.id,
          title: item.title,
          text: item.text,
          author: item.author,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          votes: postScore(item)
        }))
        .sort((a, b) => (b.votes - a.votes) || (b.createdAt || '').localeCompare(a.createdAt || ''));
      return json(res, 200, { ok: true, items }, origin);
    }

    if (u.pathname === '/community/post' && req.method === 'POST') {
      if (!rateOk('community-post:' + ip, 20, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const username = authUser(req);
      if (!username) return json(res, 401, { ok: false, error: 'Bitte zuerst anmelden' }, origin);
      const b = await body(req);
      const title = String(b.title || '').trim();
      const text = String(b.text || '').trim();
      if (!title || !text) return json(res, 400, { ok: false, error: 'Titel und Text erforderlich' }, origin);
      if (title.length > 120 || text.length > 2000) return json(res, 400, { ok: false, error: 'Titel/Text zu lang' }, origin);
      const needle = normalizedText(`${title} ${text}`);
      const similar = Object.values(state.community).find(item => {
        const candidate = normalizedText(`${item.title} ${item.text}`);
        return candidate && needle && (candidate.includes(needle) || needle.includes(candidate));
      });
      if (similar) {
        return json(res, 409, {
          ok: false,
          error: 'Ähnlicher Vorschlag existiert bereits',
          similar: { id: similar.id, title: similar.title }
        }, origin);
      }
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      state.community[id] = { id, title, text, author: username, createdAt: now, updatedAt: now, votesBy: {} };
      saveState();
      incident('community_post_created', `id=${id} user=${username}`, 'info');
      return json(res, 200, { ok: true, id }, origin);
    }

    if (u.pathname === '/community/vote' && req.method === 'POST') {
      if (!rateOk('community-vote:' + ip, 40, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const username = authUser(req);
      if (!username) return json(res, 401, { ok: false, error: 'Bitte zuerst anmelden' }, origin);
      const b = await body(req);
      const id = String(b.id || '').trim();
      const dir = Number(b.dir);
      if (!id || ![1, -1].includes(dir)) return json(res, 400, { ok: false, error: 'id und dir (+1/-1) erforderlich' }, origin);
      const post = state.community[id];
      if (!post) return json(res, 404, { ok: false, error: 'Vorschlag nicht gefunden' }, origin);
      if (!post.votesBy) post.votesBy = {};
      post.votesBy[username] = dir;
      post.updatedAt = new Date().toISOString();
      saveState();
      return json(res, 200, { ok: true, votes: postScore(post) }, origin);
    }

    if (u.pathname === '/security/report' && req.method === 'POST') {
      if (!rateOk('security-report:' + ip, 30, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const b = await body(req);
      const flags = Array.isArray(b.flags) ? b.flags.slice(0, 10).map(x => String(x).slice(0, 64)) : [];
      if (!flags.length) return json(res, 400, { ok: false, error: 'flags erforderlich' }, origin);
      incident('integrity_report', `ip=${ip} flags=${flags.join(',')}`, 'warn');
      return json(res, 200, { ok: true }, origin);
    }

    // ... weitere Admin-Endpunkte (OTP-Reset etc.) hier ergänzen (aus v1 übernehmen)

    return json(res, 404, { ok: false, error: 'Nicht gefunden' }, origin);
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok: false, error: e.message }, origin);
  }
});

server.listen(PORT, () => console.log('FabMargin Backend v2 auf Port', PORT));
