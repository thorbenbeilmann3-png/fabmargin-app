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
    purchases: {}  // purchaseToken -> {sku, verifiedAt, orderId}
  };
}
function loadState() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return initialState(); } }
let state = loadState();
function saveState() { const tmp = DATA_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 }); fs.renameSync(tmp, DATA_FILE); }
if (!fs.existsSync(DATA_FILE)) saveState();
if (!state.purchases) { state.purchases = {}; saveState(); }
if (!state.users) { state.users = {}; saveState(); }            // username -> {email, passwordHash, salt, activatedAt, blocked}
if (!state.activationCodes) { state.activationCodes = {}; saveState(); } // code -> {createdAt, usedBy, usedAt}
if (!state.community) { state.community = []; saveState(); }    // [{id, title, text, author, votes, status, createdAt}]
if (!state.supportMessages) { state.supportMessages = []; saveState(); }
if (!state.betaInvites) { state.betaInvites = {}; saveState(); }  // token -> {name, email, createdAt, expiresAt, usedBy, usedAt, revoked}
if (!state.instances) { state.instances = {}; saveState(); }      // instanceId -> {ips: [], blockedAt, blockReason}

function incident(type, detail, severity = 'info') {
  const item = { id: crypto.randomUUID(), time: new Date().toISOString(), type, detail, severity };
  state.security.incidents.unshift(item);
  state.security.incidents = state.security.incidents.slice(0, 300);
  saveState();
  return item;
}

function createSession() { const t = b64(crypto.randomBytes(32)); sessions.set(t, Date.now() + 30 * 60 * 1000); return t; }
function sessionOk(req) { const h = String(req.headers.authorization || ''); const t = h.startsWith('Bearer ') ? h.slice(7) : ''; const exp = sessions.get(t); if (!exp || exp < Date.now()) { if (t) sessions.delete(t); return false; } return true; }
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
      return json(res, 200, { ok: true, token: createSession(), expiresAt: Date.now() + 30 * 60 * 1000 }, origin);
    }

    // Support-Chat: Nachricht speichern
    if (u.pathname === '/support/message' && req.method === 'POST') {
      if (!rateOk('support:' + ip, 20, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const b2 = await body(req);
      if (!b2.text || typeof b2.text !== 'string' || !b2.text.trim()) return json(res, 400, { ok: false, error: 'text erforderlich' }, origin);
      if (!state.supportMessages) state.supportMessages = [];
      state.supportMessages.unshift({ id: crypto.randomUUID(), text: b2.text.trim().slice(0, 500), ts: b2.ts || new Date().toISOString(), ip });
      state.supportMessages = state.supportMessages.slice(0, 500);
      saveState();
      return json(res, 200, { ok: true }, origin);
    }

    // Support-Chat: Nachrichten abrufen (Admin)
    if (u.pathname === '/support/messages' && req.method === 'GET') {
      return json(res, 200, { ok: true, messages: state.supportMessages || [] }, origin);
    }

    // ---------- Geschützte Admin-Endpunkte ----------

    if (u.pathname.startsWith('/admin/') && u.pathname !== '/admin/login') {
      if (!sessionOk(req)) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
    }

    // Dashboard
    if (u.pathname === '/admin/dashboard' && req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        users: Object.keys(state.users || {}).length,
        blockedUsers: Object.values(state.users || {}).filter(u => u.blocked).length,
        activationCodes: Object.keys(state.activationCodes || {}).length,
        unusedCodes: Object.values(state.activationCodes || {}).filter(c => !c.usedBy).length,
        communityTotal: (state.community || []).length,
        communityPending: (state.community || []).filter(x => x.status === 'pending').length,
        purchasesPaused: state.security.purchasesPaused,
        pauseReason: state.security.pauseReason,
        failedLogins: state.security.failedLogins,
        incidents: state.security.incidents.length
      }, origin);
    }

    // Aktivierungscode generieren
    if (u.pathname === '/admin/generate-code' && req.method === 'POST') {
      const segments = () => b64(crypto.randomBytes(3)).replace(/[^A-Z0-9]/g, x => String(x.charCodeAt(0) % 10)).toUpperCase().slice(0, 4);
      let code;
      do { code = [segments(), segments(), segments()].join('-'); } while (state.activationCodes[code]);
      state.activationCodes[code] = { createdAt: new Date().toISOString(), usedBy: null, usedAt: null };
      saveState();
      incident('admin_generate_code', 'code=' + code, 'info');
      return json(res, 200, { ok: true, code }, origin);
    }

    // Nutzer-Liste
    if (u.pathname === '/admin/users' && req.method === 'GET') {
      const list = Object.entries(state.users || {}).map(([username, d]) => ({
        username, email: d.email, activatedAt: d.activatedAt, blocked: !!d.blocked, blockedAt: d.blockedAt || null
      }));
      return json(res, 200, { ok: true, users: list }, origin);
    }

    // Nutzer sperren
    const blockMatch = u.pathname.match(/^\/admin\/users\/([^/]+)\/(block|unblock)$/);
    if (blockMatch && req.method === 'POST') {
      const username = decodeURIComponent(blockMatch[1]);
      const action = blockMatch[2];
      if (!state.users[username]) return json(res, 404, { ok: false, error: 'Nutzer nicht gefunden' }, origin);
      state.users[username].blocked = action === 'block';
      if (action === 'block') state.users[username].blockedAt = new Date().toISOString();
      else delete state.users[username].blockedAt;
      saveState();
      incident('admin_user_' + action, 'user=' + username, 'warn');
      return json(res, 200, { ok: true }, origin);
    }

    // Sicherheits-Log
    if (u.pathname === '/admin/security-log' && req.method === 'GET') {
      return json(res, 200, { ok: true, incidents: state.security.incidents }, origin);
    }

    // Passwort ändern
    if (u.pathname === '/admin/change-password' && req.method === 'POST') {
      const bp = await body(req);
      if (!bp.newPassword || bp.newPassword.length < 12) return json(res, 400, { ok: false, error: 'Mindestens 12 Zeichen' }, origin);
      const newSalt = b64(crypto.randomBytes(16));
      state.admin.salt = newSalt;
      state.admin.passwordHash = hashPassword(bp.newPassword, newSalt);
      state.admin.updatedAt = new Date().toISOString();
      saveState();
      incident('admin_password_changed', 'ip=' + ip, 'warn');
      return json(res, 200, { ok: true }, origin);
    }

    // Käufe pausieren / fortsetzen
    if (u.pathname === '/admin/pause-purchases' && req.method === 'POST') {
      const bpp = await body(req);
      state.security.purchasesPaused = true;
      state.security.pauseReason = bpp.reason || 'Manuell pausiert';
      saveState();
      incident('admin_pause_purchases', state.security.pauseReason, 'warn');
      return json(res, 200, { ok: true }, origin);
    }
    if (u.pathname === '/admin/resume-purchases' && req.method === 'POST') {
      state.security.purchasesPaused = false;
      state.security.pauseReason = '';
      saveState();
      incident('admin_resume_purchases', '', 'info');
      return json(res, 200, { ok: true }, origin);
    }

    // Community-Liste (Admin-Sicht: alle inkl. pending)
    if (u.pathname === '/admin/community' && req.method === 'GET') {
      return json(res, 200, { ok: true, proposals: state.community || [] }, origin);
    }

    // Community-Vorschlag annehmen / ablehnen
    const commMatch = u.pathname.match(/^\/admin\/community\/([^/]+)\/(approve|reject)$/);
    if (commMatch && req.method === 'POST') {
      const id = commMatch[1];
      const action = commMatch[2];
      const idx = (state.community || []).findIndex(x => x.id === id);
      if (idx === -1) return json(res, 404, { ok: false, error: 'Vorschlag nicht gefunden' }, origin);
      state.community[idx].status = action === 'approve' ? 'approved' : 'rejected';
      state.community[idx].moderatedAt = new Date().toISOString();
      saveState();
      incident('admin_community_' + action, 'id=' + id, 'info');
      return json(res, 200, { ok: true }, origin);
    }

    // Aktivierungscodes-Liste
    if (u.pathname === '/admin/codes' && req.method === 'GET') {
      const list = Object.entries(state.activationCodes || {}).map(([code, d]) => ({ code, ...d }));
      return json(res, 200, { ok: true, codes: list }, origin);
    }

    // Daten-Export
    if (u.pathname === '/admin/export' && req.method === 'GET') {
      const exportData = {
        exportedAt: new Date().toISOString(),
        users: state.users,
        activationCodes: state.activationCodes,
        community: state.community,
        security: { incidents: state.security.incidents, failedLogins: state.security.failedLogins, purchasesPaused: state.security.purchasesPaused }
      };
      incident('admin_export', 'ip=' + ip, 'warn');
      const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="fabmargin-export.json"', 'Cache-Control': 'no-store' };
      if (origin) headers['Access-Control-Allow-Origin'] = origin;
      res.writeHead(200, headers);
      return res.end(JSON.stringify(exportData, null, 2));
    }

    // Daten-Wipe (nur Nutzer + Codes + Community, nicht Admin-Creds)
    if (u.pathname === '/admin/wipe' && req.method === 'POST') {
      state.users = {};
      state.activationCodes = {};
      state.community = [];
      state.security.incidents = [];
      state.security.failedLogins = 0;
      saveState();
      incident('admin_wipe', 'ip=' + ip, 'warn');
      return json(res, 200, { ok: true }, origin);
    }

    // -------- Beta-Tester: Token validieren & Zugang gewähren --------
    if (u.pathname === '/beta/join' && req.method === 'POST') {
      if (!rateOk('beta:' + ip, 10, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const bj = await body(req);
      const token = bj.token || u.searchParams.get('token') || '';
      if (!token) return json(res, 400, { ok: false, error: 'token erforderlich' }, origin);
      if (!Object.prototype.hasOwnProperty.call(state.betaInvites || {}, token)) return json(res, 404, { ok: false, error: 'Ungültiger Einladungslink' }, origin);
      const invite = state.betaInvites[token];
      if (!invite) return json(res, 404, { ok: false, error: 'Ungültiger Einladungslink' }, origin);
      if (invite.revoked) return json(res, 403, { ok: false, error: 'Diese Einladung wurde widerrufen' }, origin);
      if (new Date(invite.expiresAt) < new Date()) return json(res, 410, { ok: false, error: 'Einladungslink abgelaufen' }, origin);
      if (invite.usedAt) return json(res, 409, { ok: false, error: 'Einladungslink wurde bereits verwendet' }, origin);
      invite.usedAt = new Date().toISOString();
      invite.usedBy = bj.username || ip;
      saveState();
      incident('beta_join', 'token=' + token + ' ip=' + ip, 'info');
      return json(res, 200, { ok: true, role: 'beta', name: invite.name }, origin);
    }

    // -------- Sicherheit: Integritätsprüfung --------
    if (u.pathname === '/security/check-integrity' && req.method === 'POST') {
      if (!rateOk('integrity:' + ip, 60, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const bi = await body(req);
      const instanceId = bi.instanceId || '';
      if (!instanceId) return json(res, 400, { ok: false, error: 'instanceId erforderlich' }, origin);
      // Validate instanceId format to prevent prototype pollution
      if (!/^[0-9a-f-]{8,64}$/i.test(instanceId)) return json(res, 400, { ok: false, error: 'Ungültige instanceId' }, origin);
      if (!state.instances) state.instances = {};
      const inst = state.instances[instanceId] || { ips: [] };
      if (inst.blockedAt) return json(res, 200, { ok: false, blocked: true, reason: inst.blockReason || 'Zu viele Geräte' }, origin);
      if (!inst.ips.includes(ip)) {
        inst.ips.push(ip);
        if (inst.ips.length > 3) {
          inst.blockedAt = new Date().toISOString();
          inst.blockReason = 'Mehr als 3 verschiedene IPs (' + inst.ips.length + ')';
          state.instances[instanceId] = inst;
          saveState();
          incident('piracy_block', 'instanceId=' + instanceId + ' ips=' + inst.ips.length, 'warn');
          return json(res, 200, { ok: false, blocked: true, reason: inst.blockReason }, origin);
        }
      }
      state.instances[instanceId] = inst;
      saveState();
      return json(res, 200, { ok: true, blocked: false }, origin);
    }

    // -------- Sicherheit: Violation melden --------
    if (u.pathname === '/security/report-violation' && req.method === 'POST') {
      if (!rateOk('violation:' + ip, 20, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const bv = await body(req);
      incident('security_violation', JSON.stringify({ ip, ...bv }).slice(0, 300), 'warn');
      return json(res, 200, { ok: true }, origin);
    }

    // -------- Admin: Beta-Einladung erstellen --------
    if (u.pathname === '/admin/beta/invite' && req.method === 'POST') {
      if (!sessionOk(req)) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      const bb = await body(req);
      if (!bb.name || !bb.email) return json(res, 400, { ok: false, error: 'name und email erforderlich' }, origin);
      const token = b64(crypto.randomBytes(32));
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      if (!state.betaInvites) state.betaInvites = {};
      state.betaInvites[token] = { name: bb.name.slice(0, 100), email: bb.email.slice(0, 200), createdAt: new Date().toISOString(), expiresAt, usedBy: null, usedAt: null, revoked: false };
      saveState();
      incident('admin_beta_invite', 'email=' + bb.email, 'info');
      return json(res, 200, { ok: true, token, expiresAt }, origin);
    }

    // -------- Admin: Beta-Liste --------
    if (u.pathname === '/admin/beta/list' && req.method === 'GET') {
      if (!sessionOk(req)) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      const list = Object.entries(state.betaInvites || {}).map(([token, d]) => ({
        token, name: d.name, email: d.email, createdAt: d.createdAt, expiresAt: d.expiresAt,
        usedBy: d.usedBy, usedAt: d.usedAt, revoked: d.revoked,
        status: d.revoked ? 'widerrufen' : d.usedAt ? 'aktiv' : new Date(d.expiresAt) < new Date() ? 'abgelaufen' : 'offen'
      }));
      return json(res, 200, { ok: true, invites: list }, origin);
    }

    // -------- Admin: Beta-Einladung widerrufen --------
    const betaRevokeMatch = u.pathname.match(/^\/admin\/beta\/revoke\/([^/]+)$/);
    if (betaRevokeMatch && req.method === 'POST') {
      if (!sessionOk(req)) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      const token = decodeURIComponent(betaRevokeMatch[1]);
      if (!state.betaInvites || !state.betaInvites[token]) return json(res, 404, { ok: false, error: 'Einladung nicht gefunden' }, origin);
      state.betaInvites[token].revoked = true;
      saveState();
      incident('admin_beta_revoke', 'token=' + token, 'warn');
      return json(res, 200, { ok: true }, origin);
    }

    // -------- Admin: Gesperrte Instanzen anzeigen --------
    if (u.pathname === '/admin/instances' && req.method === 'GET') {
      if (!sessionOk(req)) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      const list = Object.entries(state.instances || {}).map(([instanceId, d]) => ({ instanceId, ips: d.ips, blockedAt: d.blockedAt || null, blockReason: d.blockReason || null }));
      return json(res, 200, { ok: true, instances: list }, origin);
    }

    // -------- Admin: Instanz entsperren --------
    const unblockMatch = u.pathname.match(/^\/admin\/instances\/([^/]+)\/unblock$/);
    if (unblockMatch && req.method === 'POST') {
      if (!sessionOk(req)) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      const instanceId = decodeURIComponent(unblockMatch[1]);
      if (!state.instances || !state.instances[instanceId]) return json(res, 404, { ok: false, error: 'Instanz nicht gefunden' }, origin);
      delete state.instances[instanceId].blockedAt;
      delete state.instances[instanceId].blockReason;
      state.instances[instanceId].ips = [];
      saveState();
      incident('admin_instance_unblock', 'id=' + instanceId, 'info');
      return json(res, 200, { ok: true }, origin);
    }

    // ... weitere Admin-Endpunkte (OTP-Reset etc.) hier ergänzen (aus v1 übernehmen) (OTP-Reset etc.) hier ergänzen (aus v1 übernehmen)

    return json(res, 404, { ok: false, error: 'Nicht gefunden' }, origin);
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok: false, error: e.message }, origin);
  }
});

server.listen(PORT, () => console.log('FabMargin Backend v2 auf Port', PORT));
