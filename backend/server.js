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
if (!state.premium) {
  state.premium = { creditsByUser: {}, entitlementsByUser: {}, brainByUser: {} };
  saveState();
}

const PREMIUM_PRODUCTS = [
  { id: 'print_check_pro', title: 'Print Check Pro', priceEur: 0.99, type: 'credit', creditType: 'print_check', credits: 1, preview: 'Kompatibilitätsprüfung kostenlos, Details nach Kauf.' },
  { id: 'print_doctor_pro_single', title: 'Print Doctor Pro', priceEur: 1.49, type: 'credit', creditType: 'print_doctor', credits: 1, preview: 'Gefundene Ursachen sichtbar, geführte Diagnose nach Kauf.' },
  { id: 'print_doctor_pro_pack5', title: 'Print Doctor Pro 5er-Paket', priceEur: 5.99, type: 'credit', creditType: 'print_doctor', credits: 5, preview: 'Gefundene Ursachen sichtbar, geführte Diagnose nach Kauf.' },
  { id: 'verified_print_profile', title: 'Verified Print Profile', priceEur: 2.99, type: 'credit', creditType: 'verified_profile', credits: 1, preview: 'Profil-Metadaten sichtbar, Dateien + Guide nach Kauf.' },
  { id: 'profit_check_pro_single', title: 'Profit Check Pro', priceEur: 0.99, type: 'credit', creditType: 'profit_check', credits: 1, preview: 'Gesamtkosten kostenlos, Score nach Kauf.' },
  { id: 'profit_check_unlimited', title: 'Profit Check Unlimited', priceEur: 9.99, type: 'entitlement', entitlement: 'profit_check_unlimited', preview: 'Gesamtkosten kostenlos, Score unbegrenzt nach Kauf.' },
  { id: 'personal_print_brain', title: 'Personal Print Brain', priceEur: 6.99, type: 'entitlement', entitlement: 'print_brain', preview: 'Lernt aus deinen Ergebnissen nach Kauf.' },
  {
    id: 'starter_pack_bundle',
    title: 'PrintProfit Starter Pack',
    priceEur: 9.99,
    type: 'bundle',
    valueEur: 13.45,
    savingsEur: 3.46,
    includes: ['1x Print Check', '1x Print Doctor', '1x Verified Profile', 'Profit Check Unlimited', 'Personal Print Brain'],
    preview: 'Klare Einmalzahlung ohne Abo.'
  }
];

const VERIFIED_PROFILES = [
  {
    profileId: 'PP3D-P1P-PETG-0.4-BS-2.4',
    printer: 'Bambu Lab P1P',
    material: 'PETG',
    nozzle: '0.4 mm',
    slicer: 'Bambu Studio',
    version: '2.4',
    publishedAt: '2026-08-01',
    lastCheckedAt: '2026-08-10',
    source: 'PrintProfit Testfarm',
    testStatus: 'Geprüft',
    includes: ['Maschinenprofil', 'Materialprofil', 'Profile Guide'],
    disclaimer: 'Geprüftes Ausgangsprofil für die angegebene Konfiguration. Das tatsächliche Ergebnis kann abweichen.'
  }
];

function premiumUserId(req, payload = {}) {
  const fromHeader = String(req.headers['x-premium-user'] || '').trim();
  const fromBody = String(payload.userId || '').trim();
  return fromHeader || fromBody || 'default-user';
}
function userCredits(userId) {
  if (!state.premium.creditsByUser[userId]) state.premium.creditsByUser[userId] = {};
  return state.premium.creditsByUser[userId];
}
function userEntitlements(userId) {
  if (!state.premium.entitlementsByUser[userId]) state.premium.entitlementsByUser[userId] = {};
  return state.premium.entitlementsByUser[userId];
}
function userBrain(userId) {
  if (!state.premium.brainByUser[userId]) state.premium.brainByUser[userId] = { history: [], recipes: [] };
  return state.premium.brainByUser[userId];
}
function addCredit(userId, creditType, amount = 1) {
  const credits = userCredits(userId);
  credits[creditType] = Math.max(0, Number(credits[creditType] || 0) + Number(amount || 0));
}
function useCredit(userId, creditType, amount = 1) {
  const ent = userEntitlements(userId);
  if (creditType === 'profit_check' && ent.profit_check_unlimited) return { ok: true, unlimited: true, remaining: 'unlimited' };
  const credits = userCredits(userId);
  const current = Number(credits[creditType] || 0);
  if (current < amount) return { ok: false, error: 'Nicht genügend Credits' };
  credits[creditType] = current - amount;
  return { ok: true, remaining: credits[creditType] };
}
function refundCredit(userId, creditType, amount = 1) {
  addCredit(userId, creditType, amount);
}
function grantProduct(userId, productId) {
  const p = PREMIUM_PRODUCTS.find(x => x.id === productId);
  if (!p) throw new Error('Unbekanntes Premium-Produkt');
  const ent = userEntitlements(userId);
  if (p.type === 'credit') addCredit(userId, p.creditType, p.credits || 1);
  if (p.type === 'entitlement') ent[p.entitlement] = true;
  if (p.type === 'bundle') {
    addCredit(userId, 'print_check', 1);
    addCredit(userId, 'print_doctor', 1);
    addCredit(userId, 'verified_profile', 1);
    ent.profit_check_unlimited = true;
    ent.print_brain = true;
  }
}
function requireBrainAccess(userId) {
  const ent = userEntitlements(userId);
  return !!ent.print_brain;
}

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

    // ... weitere Admin-Endpunkte (OTP-Reset etc.) hier ergänzen (aus v1 übernehmen)

    if (u.pathname === '/premium/products' && req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        notice: 'Echte Zahlung wird später integriert. Credits werden bis dahin per Admin-Panel vergeben.',
        products: PREMIUM_PRODUCTS
      }, origin);
    }

    if (u.pathname === '/premium/purchase' && req.method === 'POST') {
      const b = await body(req);
      const userId = premiumUserId(req, b);
      const product = PREMIUM_PRODUCTS.find(x => x.id === b.productId);
      if (!product) return json(res, 400, { ok: false, error: 'Unbekanntes Produkt' }, origin);
      const adminSecret = String(req.headers['x-security-secret'] || '');
      const canGrant = !SECURITY_WEBHOOK_SECRET || safeEqual(adminSecret, SECURITY_WEBHOOK_SECRET);
      if (!canGrant || !b.adminGrant) {
        return json(res, 200, {
          ok: true,
          pending: true,
          placeholderPayment: true,
          message: 'Echte Zahlung wird später integriert. Aktuell vergibt das Admin-Panel Credits manuell.',
          requestedProduct: product.id
        }, origin);
      }
      grantProduct(userId, product.id);
      saveState();
      return json(res, 200, { ok: true, granted: true, userId, productId: product.id }, origin);
    }

    if (u.pathname === '/premium/credits' && req.method === 'GET') {
      const userId = premiumUserId(req, Object.fromEntries(u.searchParams.entries()));
      return json(res, 200, {
        ok: true,
        userId,
        credits: userCredits(userId),
        entitlements: userEntitlements(userId)
      }, origin);
    }

    if (u.pathname === '/premium/use-credit' && req.method === 'POST') {
      const b = await body(req);
      const userId = premiumUserId(req, b);
      if (!b.creditType) return json(res, 400, { ok: false, error: 'creditType erforderlich' }, origin);
      const result = useCredit(userId, b.creditType, Number(b.amount || 1));
      if (!result.ok) return json(res, 402, result, origin);
      saveState();
      return json(res, 200, { ok: true, userId, creditType: b.creditType, remaining: result.remaining }, origin);
    }

    if (u.pathname === '/premium/refund-credit' && req.method === 'POST') {
      const b = await body(req);
      const userId = premiumUserId(req, b);
      if (!b.creditType) return json(res, 400, { ok: false, error: 'creditType erforderlich' }, origin);
      refundCredit(userId, b.creditType, Number(b.amount || 1));
      saveState();
      return json(res, 200, { ok: true, userId, creditType: b.creditType, credits: userCredits(userId) }, origin);
    }

    if (u.pathname === '/premium/print-check' && req.method === 'POST') {
      const b = await body(req);
      const userId = premiumUserId(req, b);
      const compatibility = {
        compatible: true,
        summary: `${b.printer || 'Drucker'} + ${b.material || 'Material'} mit ${b.nozzle || 'Düse'} grundsätzlich kompatibel.`
      };
      const warnings = [];
      if (String(b.material || '').toUpperCase().includes('PETG')) warnings.push('Filamentfeuchtigkeit kann bei PETG zu Stringing führen.');
      if (Number(String(b.nozzle || '0.4').replace(',', '.')) > 0.4 && String(b.quality || '').toLowerCase().includes('fein')) {
        warnings.push('Feine Qualität mit großer Düse kann Details verschlechtern.');
      }
      if (b.preview !== false) return json(res, 200, { ok: true, preview: true, compatibility, paywall: 'Details nach Kauf für 0,99 € pro Analyse.' }, origin);

      const debit = useCredit(userId, 'print_check', 1);
      if (!debit.ok) return json(res, 402, debit, origin);
      try {
        if (b.forceError) throw new Error('Technischer Fehler bei Analyse');
        const details = {
          keySettings: [
            { name: 'Temperatur', explain: 'Mittlere Temperatur als Startwert für saubere Layerhaftung wählen.' },
            { name: 'Geschwindigkeit', explain: 'Erste Schicht langsamer drucken, damit das Teil sicher haftet.' },
            { name: 'Erste Schicht', explain: 'Etwas mehr Linienbreite erhöht die Bett-Haftung.' },
            { name: 'Lüfter', explain: 'Bei PETG den Lüfter moderat halten, um Layerhaftung nicht zu schwächen.' },
            { name: 'Wände', explain: 'Mehr Außenwände verbessern Stabilität und Oberfläche.' },
            { name: 'Infill', explain: 'Infill nach Einsatzgebiet wählen: funktional höher, Deko niedriger.' },
            { name: 'Support', explain: 'Support-Abstand fein abstimmen, damit Supports leichter lösbar sind.' }
          ],
          plainLanguage: 'Die erste Schicht wird langsamer gedruckt, weil eine gute Haftung wichtiger ist als Geschwindigkeit.',
          warnings,
          checklist: ['Druckbett sauber', 'Richtige Düse ausgewählt', 'Material kontrolliert', 'Genügend Filament vorhanden', 'Profil kontrolliert']
        };
        saveState();
        return json(res, 200, { ok: true, preview: false, compatibility, details, remainingCredits: userCredits(userId).print_check || 0 }, origin);
      } catch (e) {
        refundCredit(userId, 'print_check', 1);
        saveState();
        return json(res, 500, { ok: false, error: e.message, refunded: true }, origin);
      }
    }

    if (u.pathname === '/premium/print-doctor' && req.method === 'POST') {
      const b = await body(req);
      const userId = premiumUserId(req, b);
      const issue = String(b.issue || '').toLowerCase();
      const causes = [
        { cause: 'Filamentfeuchtigkeit', why: 'Feuchtes Filament führt häufig zu Stringing und schlechter Oberfläche.', test: 'Filament 4-6h trocknen und nur diese Variable ändern.' },
        { cause: 'Temperatur', why: 'Zu hohe oder zu niedrige Temperatur verschlechtert Fluss und Haftung.', test: 'Nur Temperatur um 5°C anpassen und Testdruck starten.' },
        { cause: 'Geschwindigkeit', why: 'Zu hohe Geschwindigkeit kann Unterextrusion und Layerfehler auslösen.', test: 'Nur Geschwindigkeit um 10-15% reduzieren.' }
      ];
      if (issue.includes('warping')) causes.unshift({ cause: 'Bett-Haftung', why: 'Warping startet oft durch mangelnde Haftung an den Ecken.', test: 'Bett reinigen und erste Schicht-Temperatur leicht erhöhen.' });
      const topCauses = causes.slice(0, 3);
      if (b.preview !== false) {
        return json(res, 200, {
          ok: true,
          preview: true,
          foundCauseCount: topCauses.length,
          causes: topCauses.map(c => c.cause),
          paywall: 'Vollständige Diagnose nach Kauf für 1,49 €.'
        }, origin);
      }
      const debit = useCredit(userId, 'print_doctor', 1);
      if (!debit.ok) return json(res, 402, debit, origin);
      try {
        if (b.forceError) throw new Error('Technischer Fehler bei Diagnose');
        const steps = topCauses.map((c, i) => ({
          step: i + 1,
          title: c.cause,
          why: c.why,
          singleChangeTest: c.test,
          feedbackOptions: ['BESSER', 'GLEICH', 'SCHLECHTER']
        }));
        saveState();
        return json(res, 200, { ok: true, preview: false, issue: b.issue || 'Allgemeines Druckproblem', steps, protocolHint: 'Nach jedem Test genau eine Einstellung ändern und Ergebnis markieren.' }, origin);
      } catch (e) {
        refundCredit(userId, 'print_doctor', 1);
        saveState();
        return json(res, 500, { ok: false, error: e.message, refunded: true }, origin);
      }
    }

    if (u.pathname === '/premium/profiles' && req.method === 'GET') {
      const payload = Object.fromEntries(u.searchParams.entries());
      const userId = premiumUserId(req, payload);
      const full = u.searchParams.get('full') === 'true';
      if (!full) {
        return json(res, 200, { ok: true, preview: true, profiles: VERIFIED_PROFILES }, origin);
      }
      const profileId = u.searchParams.get('profileId');
      const profile = VERIFIED_PROFILES.find(p => p.profileId === profileId) || VERIFIED_PROFILES[0];
      const debit = useCredit(userId, 'verified_profile', 1);
      if (!debit.ok) return json(res, 402, debit, origin);
      try {
        const files = [
          { name: 'machine-profile.json', content: { profileId: profile.profileId, printer: profile.printer, nozzle: profile.nozzle, acceleration: 'moderate', speedPreset: 'balanced' } },
          { name: 'material-profile.json', content: { material: profile.material, nozzleTemp: '245°C', bedTemp: '80°C', fan: '35%' } }
        ];
        const guide = [
          { changed: 'Support-Abstand 0,20 → 0,25 mm', why: 'Supports lassen sich leichter entfernen, Unterseite kann minimal rauer werden.' },
          { changed: 'Erste Schicht langsamer', why: 'Bessere Haftung für zuverlässigeren Start.' }
        ];
        saveState();
        return json(res, 200, { ok: true, preview: false, profile, files, guide }, origin);
      } catch (e) {
        refundCredit(userId, 'verified_profile', 1);
        saveState();
        return json(res, 500, { ok: false, error: e.message, refunded: true }, origin);
      }
    }

    if (u.pathname === '/premium/profit-check' && req.method === 'POST') {
      const b = await body(req);
      const userId = premiumUserId(req, b);
      const n = (v) => Number(v || 0);
      const totalCosts = n(b.materialCost) + n(b.electricityCost) + n(b.machineCost) + n(b.laborCost) + n(b.packagingCost) + n(b.feeCost) + n(b.scrapCost);
      const revenue = n(b.revenue);
      const profit = revenue - totalCosts;
      const printHours = Math.max(0.01, n(b.printHours));
      const profitPerHour = profit / printHours;
      const previewPayload = { totalCosts, revenue, profit, profitPerHour: Number(profitPerHour.toFixed(2)) };
      if (b.preview !== false) return json(res, 200, { ok: true, preview: true, ...previewPayload, paywall: 'PrintProfit Score nach Kauf für 0,99 € oder Unlimited.' }, origin);

      const debit = useCredit(userId, 'profit_check', 1);
      if (!debit.ok) return json(res, 402, debit, origin);
      try {
        if (b.forceError) throw new Error('Technischer Fehler bei Kalkulation');
        let score = Math.round(Math.max(0, Math.min(100, 50 + (profit * 2) - (printHours * 0.4))));
        if (profitPerHour < 1) score = Math.min(score, 40);
        const traffic = score >= 70 ? '🟢' : score >= 45 ? '🟡' : '🔴';
        const warning = profitPerHour < 1 ? 'Vorsicht: Gewinn pro Druckerstunde ist sehr niedrig.' : '';
        const reason = profit > 0
          ? `Der Auftrag ist profitabel, bindet den Drucker aber ca. ${printHours.toFixed(1)} Stunden.`
          : 'Der Auftrag ist mit den aktuellen Kosten nicht profitabel.';
        saveState();
        return json(res, 200, { ok: true, preview: false, ...previewPayload, score, traffic, reason, warning }, origin);
      } catch (e) {
        refundCredit(userId, 'profit_check', 1);
        saveState();
        return json(res, 500, { ok: false, error: e.message, refunded: true }, origin);
      }
    }

    if (u.pathname === '/premium/brain/save' && req.method === 'POST') {
      const b = await body(req);
      const userId = premiumUserId(req, b);
      if (!requireBrainAccess(userId)) return json(res, 402, { ok: false, error: 'Personal Print Brain nicht freigeschaltet' }, origin);
      const brain = userBrain(userId);
      const entry = {
        id: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        printer: b.printer || '',
        material: b.material || '',
        nozzle: b.nozzle || '',
        temperature: b.temperature || '',
        result: b.result || '',
        notes: b.notes || ''
      };
      brain.history.unshift(entry);
      brain.history = brain.history.slice(0, 200);
      saveState();
      return json(res, 200, { ok: true, entry }, origin);
    }

    if (u.pathname === '/premium/brain/suggest' && req.method === 'GET') {
      const payload = Object.fromEntries(u.searchParams.entries());
      const userId = premiumUserId(req, payload);
      if (!requireBrainAccess(userId)) return json(res, 402, { ok: false, error: 'Personal Print Brain nicht freigeschaltet' }, origin);
      const brain = userBrain(userId);
      const printer = String(u.searchParams.get('printer') || '').toLowerCase();
      const material = String(u.searchParams.get('material') || '').toLowerCase();
      const nozzle = String(u.searchParams.get('nozzle') || '').toLowerCase();
      const similar = brain.history.filter(x =>
        String(x.printer).toLowerCase() === printer &&
        String(x.material).toLowerCase() === material &&
        String(x.nozzle).toLowerCase() === nozzle
      );
      const success = similar.filter(x => String(x.result).toLowerCase().includes('gut') || String(x.result).toLowerCase().includes('sehr gut'));
      const best = success[0] || similar[0] || null;
      const failed = similar.find(x => String(x.result).toLowerCase().includes('fehler') || String(x.result).toLowerCase().includes('schlecht'));
      return json(res, 200, {
        ok: true,
        similarCount: similar.length,
        suggestion: best ? `Bei ähnlichen Drucken funktionierte ${best.temperature || 'die letzte Einstellung'} am besten.` : 'Noch keine vergleichbaren Druckdaten gespeichert.',
        failureMemory: failed ? `Ähnlicher Druck war problematisch: ${failed.result}. Notiz: ${failed.notes || 'keine'}` : '',
        recipes: brain.recipes.slice(0, 5)
      }, origin);
    }

    if (u.pathname === '/premium/brain/recipe' && req.method === 'POST') {
      const b = await body(req);
      const userId = premiumUserId(req, b);
      if (!requireBrainAccess(userId)) return json(res, 402, { ok: false, error: 'Personal Print Brain nicht freigeschaltet' }, origin);
      const brain = userBrain(userId);
      const recipe = {
        id: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        name: b.name || 'Erfolgsrezept',
        printer: b.printer || '',
        filament: b.filament || '',
        profile: b.profile || '',
        settings: b.settings || '',
        nozzle: b.nozzle || '',
        printTime: b.printTime || '',
        result: b.result || '',
        notes: b.notes || ''
      };
      brain.recipes.unshift(recipe);
      brain.recipes = brain.recipes.slice(0, 100);
      saveState();
      return json(res, 200, { ok: true, recipe, hint: 'Mit "Noch einmal so drucken" erneut nutzbar.' }, origin);
    }

    return json(res, 404, { ok: false, error: 'Nicht gefunden' }, origin);
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok: false, error: e.message }, origin);
  }
});

server.listen(PORT, () => console.log('FabMargin Backend v2 auf Port', PORT));
