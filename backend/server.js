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
const PREMIUM_NOTICE = 'Diese App wird von einem Hobbyentwickler entwickelt. Alle Empfehlungen sind Richtwerte.';
const PREMIUM_PRODUCTS = [
  { id: 'credits_3', name: '3 Credits', priceEur: '2,49 €', credits: 3, description: 'Einzelpaket für gelegentliche Analysen' },
  { id: 'credits_10', name: '10 Credits', priceEur: '6,99 €', credits: 10, description: 'Starter-Paket für mehrere Funktionen' },
  { id: 'credits_25', name: '25 Credits', priceEur: '14,99 €', credits: 25, description: 'Großes Paket mit Preisvorteil' },
  { id: 'starter_pack', name: 'Starter Pack', priceEur: '6,99 €', credits: 10, unlockBrain: true, description: '10 Credits + Personal Print Brain freischalten' },
  { id: 'unlimited_month', name: 'Unlimited-Monatspass', priceEur: '7,99 €/Monat', unlimitedDays: 30, description: 'Optionales Monatsabo für Credit-Verbrauch' }
];
const FEATURE_PRICING = [
  { id: 'print_check_pro', name: 'Print Check Pro', credits: 1 },
  { id: 'print_doctor_pro', name: 'Print Doctor Pro', credits: 2 },
  { id: 'verified_print_profile', name: 'Verified Print Profile', credits: 3 },
  { id: 'profit_check_pro', name: 'Profit Check Pro', credits: 1 },
  { id: 'personal_print_brain', name: 'Personal Print Brain freischalten', credits: 7 }
];
const PREMIUM_PRINTERS = [
  { id: 'bambu_p1s', name: 'Bambu Lab P1S', powerW: 280, buildVolume: '256×256×256mm', slicer: 'Bambu Studio', materials: { PLA: { nozzleTempC: 220, bedTempC: 55, fanPct: 100, speedMmS: 200 }, PETG: { nozzleTempC: 240, bedTempC: 80, fanPct: 50, speedMmS: 150 }, ABS: { nozzleTempC: 250, bedTempC: 100, fanPct: 0, speedMmS: 150 } } },
  { id: 'bambu_a1_mini', name: 'Bambu Lab A1 Mini', powerW: 150, buildVolume: '180×180×180mm', slicer: 'Bambu Studio', materials: { PLA: { nozzleTempC: 220, bedTempC: 55, fanPct: 100 }, PETG: { nozzleTempC: 240, bedTempC: 80, fanPct: 50 } } },
  { id: 'prusa_mk4', name: 'Prusa MK4', powerW: 120, buildVolume: '250×210×220mm', slicer: 'PrusaSlicer', materials: { PLA: { nozzleTempC: 215, bedTempC: 60, fanPct: 100 }, PETG: { nozzleTempC: 245, bedTempC: 85, fanPct: 40 }, ABS: { nozzleTempC: 255, bedTempC: 105, fanPct: 0 } } },
  { id: 'ender3_v3_ke', name: 'Creality Ender 3 V3 KE', powerW: 200, buildVolume: '220×220×240mm', slicer: 'Cura', materials: { PLA: { nozzleTempC: 210, bedTempC: 60, fanPct: 100 }, PETG: { nozzleTempC: 240, bedTempC: 80, fanPct: 30 } } },
  { id: 'creality_k1c', name: 'Creality K1C', powerW: 350, buildVolume: '220×220×250mm', slicer: 'Cura', materials: { PLA: { nozzleTempC: 220, bedTempC: 55, fanPct: 100, speedMmS: 300 }, PETG: { nozzleTempC: 245, bedTempC: 80, fanPct: 40 }, ABS: { nozzleTempC: 260, bedTempC: 100, fanPct: 0 } } },
  { id: 'anycubic_kobra_s1', name: 'Anycubic Kobra S1', powerW: 350, buildVolume: '220×220×250mm', slicer: 'Cura', materials: { PLA: { nozzleTempC: 210, bedTempC: 60, fanPct: 100 }, PETG: { nozzleTempC: 240, bedTempC: 80, fanPct: 30 }, ABS: { nozzleTempC: 250, bedTempC: 100, fanPct: 0 } } }
];
const PREMIUM_PROFILES = [
  { id: 'profile_bambu_p1s_petg', name: 'Verified Profile Bambu P1S PETG', printer: 'Bambu Lab P1S', material: 'PETG', slicer: 'Bambu Studio', version: '1.0', lastChecked: '2026-08-01' },
  { id: 'profile_prusa_mk4_pla', name: 'Verified Profile Prusa MK4 PLA', printer: 'Prusa MK4', material: 'PLA', slicer: 'PrusaSlicer', version: '1.0', lastChecked: '2026-08-01' },
  { id: 'profile_k1c_abs', name: 'Verified Profile Creality K1C ABS', printer: 'Creality K1C', material: 'ABS', slicer: 'Cura', version: '1.0', lastChecked: '2026-08-01' }
];

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
    premium: { users: {} }
  };
}
function loadState() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return initialState(); } }
let state = loadState();
function saveState() { const tmp = DATA_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 }); fs.renameSync(tmp, DATA_FILE); }
if (!fs.existsSync(DATA_FILE)) saveState();
if (!state.purchases) { state.purchases = {}; saveState(); }
if (!state.premium) { state.premium = { users: {} }; saveState(); }
if (!state.premium.users) { state.premium.users = {}; saveState(); }

function incident(type, detail, severity = 'info') {
  const item = { id: crypto.randomUUID(), time: new Date().toISOString(), type, detail, severity };
  state.security.incidents.unshift(item);
  state.security.incidents = state.security.incidents.slice(0, 300);
  saveState();
  return item;
}

function premiumUser(userId = 'demo-user') {
  const id = String(userId || 'demo-user').slice(0, 80);
  if (!state.premium.users[id]) {
    state.premium.users[id] = {
      credits: 0,
      unlimitedUntil: null,
      brainUnlocked: false,
      unlockedProfiles: [],
      brainHistory: [],
      brainRecipes: []
    };
  }
  return { id, data: state.premium.users[id] };
}

function hasUnlimited(data) {
  return data.unlimitedUntil && new Date(data.unlimitedUntil).getTime() > Date.now();
}

function premiumError(message, status = 500, technical = true) {
  const err = new Error(message);
  err.status = status;
  err.technical = technical;
  return err;
}

function applyCredits(data, credits, reason = '') {
  const amount = Number(credits) || 0;
  if (amount < 0) throw premiumError('Ungültige Credits', 400, false);
  data.credits += amount;
  if (reason) incident('premium_credit_add', reason + ` (+${amount})`, 'info');
}

function useCredits(data, credits, reason = '') {
  const amount = Number(credits) || 0;
  if (amount < 0) throw premiumError('Ungültige Credits', 400, false);
  if (amount === 0 || hasUnlimited(data)) return { charged: 0, unlimited: hasUnlimited(data) };
  if (data.credits < amount) throw premiumError('Nicht genug Credits', 402, false);
  data.credits -= amount;
  if (reason) incident('premium_credit_use', reason + ` (-${amount})`, 'info');
  return { charged: amount, unlimited: false };
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

    // ... weitere Admin-Endpunkte (OTP-Reset etc.) hier ergänzen (aus v1 übernehmen)

    // Premium-Credit-System
    if (u.pathname === '/premium/products' && req.method === 'GET') {
      return json(res, 200, { ok: true, notice: PREMIUM_NOTICE, products: PREMIUM_PRODUCTS, featurePricing: FEATURE_PRICING }, origin);
    }

    if (u.pathname === '/premium/printers' && req.method === 'GET') {
      return json(res, 200, { ok: true, notice: PREMIUM_NOTICE, printers: PREMIUM_PRINTERS }, origin);
    }

    if (u.pathname === '/premium/credits' && req.method === 'GET') {
      const { data } = premiumUser(u.searchParams.get('userId'));
      return json(res, 200, {
        ok: true,
        credits: data.credits,
        unlimitedUntil: data.unlimitedUntil,
        brainUnlocked: data.brainUnlocked,
        notice: PREMIUM_NOTICE
      }, origin);
    }

    if (u.pathname === '/premium/buy-credits' && req.method === 'POST') {
      const b = await body(req);
      const { id, data } = premiumUser(b.userId);
      if (Number(b.adminGrantCredits) > 0) {
        if (!sessionOk(req)) return json(res, 401, { ok: false, error: 'Admin-Authentifizierung erforderlich' }, origin);
        applyCredits(data, Number(b.adminGrantCredits), `admin grant user=${id}`);
        saveState();
        return json(res, 200, { ok: true, credits: data.credits, note: 'Test-Credits vergeben (Admin).' }, origin);
      }
      const product = PREMIUM_PRODUCTS.find((x) => x.id === b.productId);
      if (!product) return json(res, 400, { ok: false, error: 'Unbekanntes Produkt' }, origin);
      return json(res, 501, {
        ok: false,
        error: 'Echte Zahlung wird später integriert. Bitte aktuell Test-Credits über den Admin-Bereich vergeben.',
        notice: PREMIUM_NOTICE
      }, origin);
    }

    if (u.pathname === '/premium/use-credits' && req.method === 'POST') {
      const b = await body(req);
      const { id, data } = premiumUser(b.userId);
      try {
        const usage = useCredits(data, Number(b.credits), `manual use user=${id} reason=${b.reason || 'n/a'}`);
        saveState();
        return json(res, 200, { ok: true, used: usage.charged, credits: data.credits, unlimited: usage.unlimited }, origin);
      } catch (e) {
        return json(res, e.status || 400, { ok: false, error: e.message }, origin);
      }
    }

    if (u.pathname === '/premium/refund-credits' && req.method === 'POST') {
      const b = await body(req);
      if (!sessionOk(req)) return json(res, 401, { ok: false, error: 'Admin-Authentifizierung erforderlich' }, origin);
      const { id, data } = premiumUser(b.userId);
      applyCredits(data, Number(b.credits), `refund user=${id} reason=${b.reason || 'technical error'}`);
      saveState();
      return json(res, 200, { ok: true, credits: data.credits }, origin);
    }

    if (u.pathname === '/premium/print-check' && req.method === 'POST') {
      const b = await body(req);
      const printer = PREMIUM_PRINTERS.find((x) => x.id === b.printerId);
      const material = String(b.material || 'PLA').toUpperCase();
      if (!printer) return json(res, 400, { ok: false, error: 'Drucker nicht gefunden' }, origin);
      const settings = printer.materials[material];
      if (b.preview) {
        return json(res, 200, { ok: true, preview: { summary: settings ? 'Grundsätzlich kompatibel' : 'Material für diesen Drucker nicht hinterlegt' }, notice: PREMIUM_NOTICE }, origin);
      }
      const { id, data } = premiumUser(b.userId);
      let charged = 0;
      try {
        charged = useCredits(data, 1, `print-check user=${id}`).charged;
        if (!settings) throw new Error('Für dieses Material fehlen Einstellungen');
        saveState();
        return json(res, 200, {
          ok: true,
          analysis: {
            settings,
            explanation: 'Die erste Schicht wird langsamer empfohlen, damit die Haftung stabiler wird.',
            warning: material === 'PETG' ? 'Filamentfeuchtigkeit kann zu Stringing führen.' : 'Druckerzustand und Materialcharge beeinflussen das Ergebnis.',
            checklist: ['Druckbett sauber', 'Richtige Düse ausgewählt', 'Genügend Filament vorhanden', 'Profil kontrolliert']
          },
          chargedCredits: charged,
          creditsLeft: data.credits,
          notice: PREMIUM_NOTICE
        }, origin);
      } catch (e) {
        const shouldRefund = charged > 0 && e.technical !== false;
        if (shouldRefund) applyCredits(data, charged, `auto-refund print-check user=${id}`);
        saveState();
        return json(res, e.status || 500, { ok: false, error: e.message, refunded: shouldRefund }, origin);
      }
    }

    if (u.pathname === '/premium/print-doctor' && req.method === 'POST') {
      const b = await body(req);
      const problem = String(b.problem || 'Druckproblem');
      const causes = {
        Stringing: ['Filamentfeuchtigkeit', 'Temperatur zu hoch', 'Retract zu niedrig'],
        Warping: ['Bett zu kalt', 'Zugluft', 'Haftung schlecht'],
        'Layer Shift': ['Riemenspannung', 'Kollision am Modell', 'Geschwindigkeit zu hoch'],
        Unterextrusion: ['Teilweise Verstopfung', 'Flow zu niedrig', 'Filamentdurchmesser'],
        'Schlechte erste Schicht': ['Bettabstand', 'Betttemperatur', 'Verschmutzung']
      }[problem] || ['Temperatur', 'Geschwindigkeit', 'Materialzustand'];
      if (b.preview) return json(res, 200, { ok: true, preview: { foundCauses: causes.length }, notice: PREMIUM_NOTICE }, origin);
      const { id, data } = premiumUser(b.userId);
      let charged = 0;
      try {
        charged = useCredits(data, 2, `print-doctor user=${id}`).charged;
        saveState();
        return json(res, 200, {
          ok: true,
          diagnosis: {
            causes,
            nextChange: `Ändere zuerst nur eine Einstellung: ${causes[1] || causes[0]}`,
            explanation: 'Bitte immer nur eine Änderung testen und dann mit [BESSER][GLEICH][SCHLECHTER] bewerten.'
          },
          chargedCredits: charged,
          creditsLeft: data.credits,
          notice: PREMIUM_NOTICE
        }, origin);
      } catch (e) {
        const shouldRefund = charged > 0 && e.technical !== false;
        if (shouldRefund) applyCredits(data, charged, `auto-refund print-doctor user=${id}`);
        saveState();
        return json(res, e.status || 500, { ok: false, error: e.message, refunded: shouldRefund }, origin);
      }
    }

    if (u.pathname === '/premium/profiles' && req.method === 'GET') {
      return json(res, 200, { ok: true, profiles: PREMIUM_PROFILES, notice: PREMIUM_NOTICE }, origin);
    }

    if (u.pathname === '/premium/unlock-profile' && req.method === 'POST') {
      const b = await body(req);
      const profile = PREMIUM_PROFILES.find((x) => x.id === b.profileId);
      if (!profile) return json(res, 404, { ok: false, error: 'Profil nicht gefunden' }, origin);
      const { id, data } = premiumUser(b.userId);
      if (data.unlockedProfiles.includes(profile.id)) {
        return json(res, 200, { ok: true, alreadyUnlocked: true, profile, creditsLeft: data.credits, notice: PREMIUM_NOTICE }, origin);
      }
      let charged = 0;
      try {
        charged = useCredits(data, 3, `unlock-profile user=${id} profile=${profile.id}`).charged;
        if (!data.unlockedProfiles.includes(profile.id)) data.unlockedProfiles.push(profile.id);
        saveState();
        return json(res, 200, {
          ok: true,
          profile,
          files: [
            { name: `${profile.id}-machine-profile.json`, content: `{\"printer\":\"${profile.printer}\",\"version\":\"${profile.version}\"}` },
            { name: `${profile.id}-material-profile.json`, content: `{\"material\":\"${profile.material}\",\"slicer\":\"${profile.slicer}\"}` }
          ],
          guide: 'Geändert wurden Support-Abstand und erste Schicht Geschwindigkeit. Ziel: bessere Haftung und leichter entfernbarer Support.',
          warning: 'Geprüftes Ausgangsprofil – Ergebnis kann abweichen.',
          chargedCredits: charged,
          creditsLeft: data.credits,
          notice: PREMIUM_NOTICE
        }, origin);
      } catch (e) {
        const shouldRefund = charged > 0 && e.technical !== false;
        if (shouldRefund) applyCredits(data, charged, `auto-refund unlock-profile user=${id}`);
        saveState();
        return json(res, e.status || 500, { ok: false, error: e.message, refunded: shouldRefund }, origin);
      }
    }

    if (u.pathname === '/premium/profit-check' && req.method === 'POST') {
      const b = await body(req);
      const sellPrice = Number(b.sellPrice || 0);
      const hours = Number(b.hours || 0);
      const materialCost = Number(b.materialCost || 0);
      const quantity = Number(b.quantity || 1);
      const powerCost = hours * 0.2;
      const machineCost = hours * 1.1;
      const laborCost = hours * 1.5;
      const packaging = Math.max(2, quantity * 0.15);
      const fees = sellPrice * 0.08;
      const expectedWaste = materialCost * 0.08;
      const totalCost = materialCost + powerCost + machineCost + laborCost + packaging + fees + expectedWaste;
      if (b.preview) return json(res, 200, { ok: true, preview: { totalCost }, notice: PREMIUM_NOTICE }, origin);
      const { id, data } = premiumUser(b.userId);
      let charged = 0;
      try {
        charged = useCredits(data, 1, `profit-check user=${id}`).charged;
        const profit = sellPrice - totalCost;
        const profitPerHour = hours > 0 ? profit / hours : 0;
        const score = Math.max(0, Math.min(100, Math.round(50 + profitPerHour * 8)));
        const badge = score > 70 ? '🟢' : score >= 40 ? '🟡' : '🔴';
        const warning = profitPerHour < 1 ? 'Warnung: sehr niedriger Stundenlohn trotz positivem Gewinn.' : 'Stundenlohn im akzeptablen Bereich.';
        saveState();
        return json(res, 200, {
          ok: true,
          analysis: { score, badge, profitPerHour, profit, warning },
          chargedCredits: charged,
          creditsLeft: data.credits,
          notice: PREMIUM_NOTICE
        }, origin);
      } catch (e) {
        const shouldRefund = charged > 0 && e.technical !== false;
        if (shouldRefund) applyCredits(data, charged, `auto-refund profit-check user=${id}`);
        saveState();
        return json(res, e.status || 500, { ok: false, error: e.message, refunded: shouldRefund }, origin);
      }
    }

    if (u.pathname === '/premium/unlock-brain' && req.method === 'POST') {
      const b = await body(req);
      const { id, data } = premiumUser(b.userId);
      if (data.brainUnlocked) return json(res, 200, { ok: true, alreadyUnlocked: true, creditsLeft: data.credits }, origin);
      let charged = 0;
      try {
        charged = useCredits(data, 7, `unlock-brain user=${id}`).charged;
        data.brainUnlocked = true;
        saveState();
        return json(res, 200, { ok: true, chargedCredits: charged, creditsLeft: data.credits, notice: PREMIUM_NOTICE }, origin);
      } catch (e) {
        const shouldRefund = charged > 0 && e.technical !== false;
        if (shouldRefund) applyCredits(data, charged, `auto-refund unlock-brain user=${id}`);
        saveState();
        return json(res, e.status || 500, { ok: false, error: e.message, refunded: shouldRefund }, origin);
      }
    }

    if (u.pathname === '/premium/brain/save' && req.method === 'POST') {
      const b = await body(req);
      const { data } = premiumUser(b.userId);
      if (!data.brainUnlocked) return json(res, 403, { ok: false, error: 'Personal Print Brain ist noch nicht freigeschaltet.' }, origin);
      data.brainHistory.unshift({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        printerId: b.printerId || '',
        material: b.material || '',
        settings: b.settings || '',
        result: b.result || ''
      });
      data.brainHistory = data.brainHistory.slice(0, 200);
      saveState();
      return json(res, 200, { ok: true, saved: true }, origin);
    }

    if (u.pathname === '/premium/brain/suggest' && req.method === 'GET') {
      const { data } = premiumUser(u.searchParams.get('userId'));
      if (!data.brainUnlocked) return json(res, 403, { ok: false, error: 'Personal Print Brain ist noch nicht freigeschaltet.' }, origin);
      const printerId = u.searchParams.get('printerId') || '';
      const material = u.searchParams.get('material') || '';
      const match = data.brainHistory.find((x) => x.printerId === printerId && x.material === material && /gut|ok|erfolg/i.test(x.result || ''));
      const failure = data.brainHistory.find((x) => x.printerId === printerId && x.material === material && /fail|warping|stringing|schlecht/i.test(x.result || ''));
      let suggestion = 'Noch keine passende Erfahrung vorhanden. Starte mit konservativen Standardwerten.';
      if (match) suggestion = `Aus deinen Erfahrungen: "${match.settings}" war bei ${material} auf diesem Drucker erfolgreich.`;
      if (failure) suggestion += ` Achtung: Ähnlicher Druck war bereits problematisch (${failure.result}).`;
      return json(res, 200, { ok: true, suggestion, notice: PREMIUM_NOTICE }, origin);
    }

    if (u.pathname === '/premium/brain/recipe' && req.method === 'POST') {
      const b = await body(req);
      const { data } = premiumUser(b.userId);
      if (!data.brainUnlocked) return json(res, 403, { ok: false, error: 'Personal Print Brain ist noch nicht freigeschaltet.' }, origin);
      data.brainRecipes.unshift({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        printerId: b.printerId || '',
        material: b.material || '',
        settings: b.settings || '',
        result: b.result || 'Erfolgsrezept'
      });
      data.brainRecipes = data.brainRecipes.slice(0, 100);
      saveState();
      return json(res, 200, { ok: true, saved: true }, origin);
    }

    return json(res, 404, { ok: false, error: 'Nicht gefunden' }, origin);
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok: false, error: e.message }, origin);
  }
});

server.listen(PORT, () => console.log('FabMargin Backend v2 auf Port', PORT));
