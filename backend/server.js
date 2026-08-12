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
const SECURITY_EMAIL = process.env.SECURITY_EMAIL || 'app.github.uncorrupt873@passmail.net';
const PARTNER_EMAIL = process.env.PARTNER_EMAIL || 'app.github.uncorrupt873@passmail.net';
const RESEND_FROM = process.env.RESEND_FROM || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const DEV_OTP_LOG = process.env.DEV_OTP_LOG === 'true';
const SECURITY_WEBHOOK_SECRET = process.env.SECURITY_WEBHOOK_SECRET || '';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://fabmargin.app';
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
    version: 3,
    admin: { username: process.env.ADMIN_USERNAME, salt, passwordHash: hashPassword(process.env.ADMIN_PASSWORD, salt), updatedAt: new Date().toISOString() },
    reset: null,
    security: { failedLogins: 0, purchasesPaused: false, pauseReason: '', incidents: [] },
    purchases: {},  // purchaseToken -> {sku, verifiedAt, orderId}
    partnerRequests: [],
    paymentSessions: {},
    partnerNotifications: [],
    bannerSlots: [
      { id: 'slot_top', position: 'oben', label: 'Premium', priceRange: '300-500€/Monat', slotNumber: 1 },
      { id: 'slot_middle', position: 'mitte', label: 'Standard', priceRange: '150-300€/Monat', slotNumber: 2 },
      { id: 'slot_bottom', position: 'unten', label: 'Footer', priceRange: '100-200€/Monat', slotNumber: 3 }
    ]
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
if (!state.slicerProfiles) { state.slicerProfiles = []; saveState(); }
if (!state.operatorRequests) { state.operatorRequests = []; saveState(); }
if (!state.operatorInvites) { state.operatorInvites = {}; saveState(); }
if (!state.diagnostics) { state.diagnostics = []; saveState(); }
if (!state.partnerRequests) { state.partnerRequests = []; saveState(); }
if (!state.paymentSessions) { state.paymentSessions = {}; saveState(); }
if (!state.partnerNotifications) { state.partnerNotifications = []; saveState(); }
if (!state.bannerSlots) {
  state.bannerSlots = [
    { id: 'slot_top', position: 'oben', label: 'Premium', priceRange: '300-500€/Monat', slotNumber: 1 },
    { id: 'slot_middle', position: 'mitte', label: 'Standard', priceRange: '150-300€/Monat', slotNumber: 2 },
    { id: 'slot_bottom', position: 'unten', label: 'Footer', priceRange: '100-200€/Monat', slotNumber: 3 }
  ];
  saveState();
}
if (!state.cmsContent) {
  state.cmsContent = {
    heroTitle: 'Willkommen bei FabMargin 3D',
    heroText: 'Dunkles Design, klare Karten und mobile Navigation für einen schnellen Überblick.',
    premiumTips: [
      'Nutze Premium-Credits für KI-Checks und verifizierte Profile.',
      'Slicer-Profile aus dem Marktplatz können live bewertet und geteilt werden.',
      'Top Creator erhalten zusätzliche Sichtbarkeit im Marktplatz.'
    ],
    premiumHeadline: '💳 Premium-Credits'
  };
  saveState();
}
let usersUpdated = false;
for (const user of Object.values(state.users)) {
  const before = JSON.stringify(user);
  ensureUserDefaults(user);
  if (before !== JSON.stringify(user)) usersUpdated = true;
}
if (usersUpdated) saveState();

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
async function rawBody(req, maxLen = 32768) { let s = ''; for await (const c of req) { s += c; if (s.length > maxLen) throw new Error('Payload zu groß'); } return s; }
async function body(req, maxLen = 32768) { const s = await rawBody(req, maxLen); return s ? JSON.parse(s) : {}; }
function originAllowed(req) { const o = req.headers.origin; if (!o) return ''; if (allowedOrigins.length && !allowedOrigins.includes(o)) return null; return o; }
function bearerToken(req) {
  const h = String(req.headers.authorization || '');
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}
function getUserSession(req) {
  const t = bearerToken(req);
  const sess = sessions.get('user:' + t);
  if (!sess || sess.exp < Date.now()) {
    if (t) sessions.delete('user:' + t);
    return null;
  }
  return { token: t, ...sess };
}
function getCurrentUser(req) {
  const sess = getUserSession(req);
  if (!sess) return null;
  const user = state.users[sess.username];
  if (!user) return null;
  ensureUserDefaults(user);
  return { username: sess.username, token: sess.token, user };
}
function hasOperatorAccess(req) {
  if (sessionOk(req)) return true;
  const viewer = getCurrentUser(req);
  return !!(viewer && viewer.user.role === 'operator');
}
function notifyUser(username, message, type = 'info') {
  const user = state.users[username];
  if (!user) return;
  if (!Array.isArray(user.notifications)) user.notifications = [];
  user.notifications.unshift({ id: crypto.randomUUID(), type, message, createdAt: new Date().toISOString(), read: false });
  user.notifications = user.notifications.slice(0, 30);
}
function ensureUserDefaults(user) {
  if (!user || typeof user !== 'object') return user;
  if (typeof user.points !== 'number') user.points = 0;
  if (!Array.isArray(user.pointHistory)) user.pointHistory = [];
  if (!Array.isArray(user.badges)) user.badges = [];
  if (!Array.isArray(user.notifications)) user.notifications = [];
  if (!Array.isArray(user.purchasedSlicerProfiles)) user.purchasedSlicerProfiles = [];
  if (!Array.isArray(user.redeemedRewards)) user.redeemedRewards = [];
  if (!Array.isArray(user.purchases)) user.purchases = [];
  if (!Array.isArray(user.devices)) user.devices = [];
  if (!user.settings || typeof user.settings !== 'object') user.settings = {};
  if (typeof user.settings.bannerEnabled !== 'boolean') user.settings.bannerEnabled = true;
  if (!user.twoFactor || typeof user.twoFactor !== 'object') user.twoFactor = {};
  if (typeof user.twoFactor.enabled !== 'boolean') user.twoFactor.enabled = false;
  if (!Array.isArray(user.twoFactor.backupCodeHashes)) user.twoFactor.backupCodeHashes = [];
  if (!Array.isArray(user.twoFactor.recoveryCodesPreview)) user.twoFactor.recoveryCodesPreview = [];
  if (!user.role) user.role = 'user';
  return user;
}
function addPoints(username, amount, reason) {
  const user = state.users[username];
  if (!user) return 0;
  if (typeof user.points !== 'number') user.points = 0;
  if (!Array.isArray(user.pointHistory)) user.pointHistory = [];
  user.points += amount;
  user.pointHistory.unshift({ id: crypto.randomUUID(), amount, reason, createdAt: new Date().toISOString() });
  user.pointHistory = user.pointHistory.slice(0, 50);
  return user.points;
}
function awardBadge(username, badge) {
  const user = state.users[username];
  if (!user) return;
  if (!Array.isArray(user.badges)) user.badges = [];
  if (!user.badges.includes(badge)) user.badges.push(badge);
}
function roleFromInvite(email) {
  const invite = Object.values(state.operatorInvites || {}).find(x => x.email === email && !x.acceptedAt);
  if (!invite) return 'user';
  invite.acceptedAt = new Date().toISOString();
  return 'operator';
}
function escapePdfText(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\r?\n/g, ' ');
}
function createSimplePdfBase64(lines) {
  const clean = lines.map(line => escapePdfText(line)).filter(Boolean);
  const content = [
    'BT',
    '/F1 12 Tf',
    '50 780 Td',
    ...clean.flatMap((line, index) => (index === 0 ? [`(${line}) Tj`] : ['0 -18 Td', `(${line}) Tj`])),
    'ET'
  ].join('\n');
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objects[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>';
  objects[4] = `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`;
  objects[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(off => `${String(off).padStart(10, '0')} 00000 n `).join('\n')}\n`;
  pdf += `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8').toString('base64');
}
function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(input || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}
function hotp(secret, counter) {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}
function verifyTotp(secret, code, window = 1) {
  const clean = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(Date.now() / 30000);
  for (let offset = -window; offset <= window; offset++) {
    if (hotp(secret, counter + offset) === clean) return true;
  }
  return false;
}
function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(String(code || '').trim().toUpperCase()).digest('hex');
}
function generateRecoveryCodes() {
  const codes = [];
  for (let i = 0; i < 8; i++) {
    codes.push(b64(crypto.randomBytes(6)).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 10));
  }
  return codes;
}
function getDeviceId(req) {
  const explicit = String(req.headers['x-device-id'] || '').trim();
  if (explicit) return explicit.slice(0, 80);
  const raw = `${req.headers['user-agent'] || 'unknown'}|${req.socket.remoteAddress || 'unknown'}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24);
}
function rememberDevice(username, req) {
  const user = ensureUserDefaults(state.users[username]);
  if (!user) return [];
  const deviceId = getDeviceId(req);
  const label = String(req.headers['user-agent'] || 'Unbekanntes Gerät').slice(0, 180);
  const existing = user.devices.find(item => item.id === deviceId);
  if (existing) {
    existing.lastSeenAt = new Date().toISOString();
    existing.label = label;
  } else {
    user.devices.unshift({ id: deviceId, label, createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() });
    user.devices = user.devices.slice(0, 20);
  }
  return user.devices;
}
function activePartnerByCategory(category) {
  return (state.partnerRequests || []).find(item => item.status === 'approved' && item.category === category) || null;
}
function normalizePartnerCategory(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.includes('filament')) return 'Filament';
  if (raw.includes('drucker') || raw.includes('printer')) return 'Drucker';
  if (raw.includes('software') || raw.includes('slicer')) return 'Software';
  if (raw.includes('zubeh') || raw.includes('access')) return 'Zubehör';
  return 'Zubehör';
}
function normalizeHttpsUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}
function partnerTier(printerValue) {
  const value = Number(printerValue || 0);
  if (value > 1500) return { status: 'VIP PREMIUM', minFilamentPerMonth: 4, minTermYears: 1, maxTermYears: 3, freeTerm: true, slotNumber: 1, monthlyRange: '300-500€', vip: true };
  if (value >= 800) return { status: 'VIP', minFilamentPerMonth: 3, minTermYears: 2, maxTermYears: 3, freeTerm: false, slotNumber: 1, monthlyRange: '220-360€', vip: true };
  if (value >= 300) return { status: 'VIP', minFilamentPerMonth: 2, minTermYears: 1, maxTermYears: 2, freeTerm: false, slotNumber: 2, monthlyRange: '150-260€', vip: true };
  return { status: 'Normal', minFilamentPerMonth: 1, minTermYears: 1, maxTermYears: 1, freeTerm: false, slotNumber: 3, monthlyRange: '100-180€', vip: false };
}
function scorePartnerTrust({ website, email, description, printerValue, filamentPerMonth, domainAgeYears }) {
  let score = 52;
  const host = (() => {
    try { return new URL(String(website || '').startsWith('http') ? website : 'https://' + website).hostname.toLowerCase(); } catch { return ''; }
  })();
  const emailDomain = String(email || '').split('@')[1]?.toLowerCase() || '';
  if (host) score += 8;
  if (String(website || '').startsWith('https://')) score += 6;
  if (host && emailDomain && (emailDomain === host || emailDomain.endsWith('.' + host) || host.endsWith('.' + emailDomain))) score += 10;
  if ((description || '').length >= 80) score += 8;
  if (Number(printerValue || 0) > 0) score += 5;
  if (Number(filamentPerMonth || 0) > 0) score += 4;
  if (typeof domainAgeYears === 'number') score += Math.min(12, Math.max(0, Math.round(domainAgeYears * 2)));
  const redFlags = ['casino', 'crypto', 'urgent', 'telegram', 'whatsapp', 'seo', 'backlink'];
  if (redFlags.some(flag => host.includes(flag) || String(description || '').toLowerCase().includes(flag))) score -= 28;
  return Math.max(0, Math.min(100, score));
}
async function fetchDomainAgeYears(website) {
  let hostname = '';
  try {
    hostname = new URL(String(website || '').startsWith('http') ? website : 'https://' + website).hostname;
  } catch {
    return null;
  }
  if (!hostname) return null;
  try {
    const response = await fetch(`https://rdap.org/domain/${hostname}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const data = await response.json();
    const events = Array.isArray(data.events) ? data.events : [];
    const registration = events.find(event => String(event.eventAction || '').toLowerCase().includes('registration'));
    if (!registration?.eventDate) return null;
    const ageMs = Date.now() - new Date(registration.eventDate).getTime();
    if (!Number.isFinite(ageMs) || ageMs < 0) return null;
    return Math.round((ageMs / (365.25 * 24 * 60 * 60 * 1000)) * 10) / 10;
  } catch {
    return null;
  }
}
function buildPartnerCounterProposal(tier, filamentPerMonth, requestedYears, categoryOccupied) {
  const proposals = [];
  if (Number(filamentPerMonth || 0) < tier.minFilamentPerMonth) proposals.push(`mindestens ${tier.minFilamentPerMonth} Rollen Filament pro Monat`);
  if (!tier.freeTerm && (requestedYears < tier.minTermYears || requestedYears > tier.maxTermYears)) {
    proposals.push(`eine Laufzeit von ${tier.minTermYears}${tier.minTermYears !== tier.maxTermYears ? ` bis ${tier.maxTermYears}` : ''} Jahr${tier.maxTermYears > 1 ? 'en' : ''}`);
  }
  if (categoryOccupied) proposals.push('einen Platz auf der Warteliste oder einen Start nach Ablauf des aktiven Vertrags');
  return proposals;
}
async function evaluatePartnerRequest(request) {
  const requestedYears = Math.max(1, Math.min(3, Number(request.termYears || 1)));
  const printerValue = Math.max(0, Number(request.printerValueEuro || 0));
  const filamentPerMonth = Math.max(0, Number(request.filamentPerMonth || 0));
  const category = normalizePartnerCategory(request.cooperationType || request.category || request.description);
  const tier = partnerTier(printerValue);
  const occupied = activePartnerByCategory(category);
  const domainAgeYears = await fetchDomainAgeYears(request.website);
  const trustScore = scorePartnerTrust({
    website: request.website,
    email: request.contactEmail,
    description: request.description,
    printerValue,
    filamentPerMonth,
    domainAgeYears
  });
  const counterProposal = buildPartnerCounterProposal(tier, filamentPerMonth, requestedYears, !!occupied);
  const termYears = tier.freeTerm ? requestedYears : Math.min(tier.maxTermYears, Math.max(tier.minTermYears, requestedYears));
  return {
    category,
    vipStatus: tier.status,
    minFilamentPerMonth: tier.minFilamentPerMonth,
    termYears,
    requestedYears,
    trustScore,
    suspicious: trustScore < 60,
    domainAgeYears,
    waitlist: !!occupied,
    occupiedBy: occupied ? occupied.companyName : null,
    counterProposal,
    suggestedMonthlyPrice: tier.monthlyRange,
    suggestedSlotLabel: tier.slotNumber === 1 ? 'oberen Premium-Slot' : tier.slotNumber === 2 ? 'mittleren Banner-Slot' : 'unteren Banner-Slot',
    suggestedSlotNumber: tier.slotNumber
  };
}
function createPartnerAutoReply(request, evaluation) {
  const baseGreeting = `Vielen Dank für Ihre Anfrage zur Kategorie ${evaluation.category}.`;
  if (evaluation.trustScore < 60) {
    return `${baseGreeting} Wir prüfen Ihr Unternehmen aktuell manuell, weil unser System noch offene Punkte bei Website/Unternehmensdaten erkannt hat. Bitte senden Sie uns gern weitere Nachweise oder Ihr Impressum, damit wir den Vorgang zügig abschließen können.`;
  }
  if (evaluation.waitlist) {
    return `${baseGreeting} Die Kategorie ist aktuell exklusiv vergeben. Wir können Sie aber sehr gern auf die Warteliste setzen und würden mit ${evaluation.suggestedSlotLabel} starten, sobald der Platz frei wird.`;
  }
  if (evaluation.counterProposal.length) {
    return `${baseGreeting} Ihr Angebot ist grundsätzlich interessant. Für diese Kategorie und Gerätekategorie würden wir als realistische Basis ${evaluation.counterProposal.join(' sowie ')} empfehlen. Wenn das für Sie passt, bereiten wir direkt den Vertragsentwurf vor.`;
  }
  if (evaluation.vipStatus === 'VIP PREMIUM') {
    return `${baseGreeting} Ihr Angebot passt sehr gut zu unserem Premium-Partnerbereich. Wir haben bereits eine erste Prüfung vorgenommen und melden uns zusätzlich persönlich mit den finalen Konditionen.`;
  }
  if (evaluation.vipStatus === 'VIP') {
    return `${baseGreeting} Ihr Angebot wirkt passend. Wir würden mit einem ${evaluation.termYears}-Jahres-Paket, Exklusivität in ${evaluation.category} und ${evaluation.minFilamentPerMonth} Rollen Filament pro Monat planen.`;
  }
  return `${baseGreeting} Ihr Angebot passt gut zu unserem aktuellen Rahmen. Wir würden mit einer Laufzeit von ${evaluation.termYears} Jahr und einem Banner im ${evaluation.suggestedSlotLabel} starten.`;
}
function buildPartnerContractPdf(request, evaluation) {
  return createSimplePdfBase64([
    'FabMargin 3D – Partner-Vertragsentwurf',
    `Firma: ${request.companyName}`,
    `Kategorie: ${evaluation.category}`,
    `Drucker: ${request.printerModel} (${request.printerValueEuro}€)`,
    `Filament pro Monat: ${request.filamentPerMonth} Rolle(n)`,
    `Laufzeit: ${evaluation.termYears} Jahr(e)`,
    `Exklusivität: 1 aktiver Partner pro Kategorie`,
    `Banner-Slot: ${evaluation.suggestedSlotLabel}`,
    'Kennzeichnung: Werbung / Anzeige',
    'Kündigung: ordentlich zum Laufzeitende, sonst automatische manuelle Nachverhandlung',
    `Kontakt: ${PARTNER_EMAIL}`
  ]);
}
async function sendMail({ to, subject, text, priority = 'normal' }) {
  const item = { id: crypto.randomUUID(), to, subject, text, priority, createdAt: new Date().toISOString(), delivered: false };
  state.partnerNotifications.unshift(item);
  state.partnerNotifications = state.partnerNotifications.slice(0, 100);
  if (RESEND_API_KEY && RESEND_FROM) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + RESEND_API_KEY
        },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: Array.isArray(to) ? to : [to],
          subject,
          text
        })
      });
      item.delivered = response.ok;
    } catch {}
  }
  if (priority === 'push') incident('vip_push_notification', subject, 'info');
  return item;
}
function sanitizeImage(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value) return null;
  const match = value.match(/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  const bytes = Buffer.byteLength(match[2], 'base64');
  if (bytes > 5 * 1024 * 1024) return null;
  return value;
}
function countUserProfileImages(username) {
  return (state.slicerProfiles || [])
    .filter(profile => profile.owner === username)
    .reduce((sum, profile) => sum + ((profile.images || []).length), 0);
}
function addPurchase(user, purchase) {
  ensureUserDefaults(user);
  user.purchases.unshift({
    id: purchase.id || crypto.randomUUID(),
    productId: purchase.productId,
    title: purchase.title,
    amount: purchase.amount,
    currency: purchase.currency || 'EUR',
    type: purchase.type || 'one_time',
    status: purchase.status || 'completed',
    provider: purchase.provider || 'stripe',
    createdAt: purchase.createdAt || new Date().toISOString()
  });
  user.purchases = user.purchases.slice(0, 100);
}
function userHasAdFree(user) {
  ensureUserDefaults(user);
  return user.purchases.some(item => item.productId === 'ad_free_lifetime' && item.status === 'completed')
    || user.purchases.some(item => item.productId === 'premium_subscription' && item.status === 'completed');
}
function userHasPremium(user) {
  ensureUserDefaults(user);
  return user.purchases.some(item => item.productId === 'premium_subscription' && item.status === 'completed');
}
function buildActiveBannerState() {
  const approved = (state.partnerRequests || []).filter(item => item.status === 'approved' && item.bannerSlotNumber);
  return (state.bannerSlots || []).map(slot => {
    const items = approved.filter(item => item.bannerSlotNumber === slot.slotNumber);
    if (!items.length) return { ...slot, active: null, queueLength: 0 };
    const cycleSeconds = items.reduce((sum, item) => sum + Math.max(5, Number(item.rotationSeconds || 30)), 0);
    let cursor = Math.floor(Date.now() / 1000) % cycleSeconds;
    let active = items[0];
    for (const item of items) {
      const duration = Math.max(5, Number(item.rotationSeconds || 30));
      if (cursor < duration) { active = item; break; }
      cursor -= duration;
    }
    return {
      ...slot,
      queueLength: items.length,
      active: {
        requestId: active.id,
        companyName: active.companyName,
        category: active.category,
        label: 'Anzeige',
        website: active.website,
        text: active.bannerText || `${active.companyName} · ${active.category} Partner`,
        rotationSeconds: Math.max(5, Number(active.rotationSeconds || 30))
      }
    };
  });
}
function sanitizeDiagnosticFlags(input) {
  const allowed = new Set(['devtools', 'many_errors', 'window.error', 'unhandledrejection', 'interval']);
  return Array.isArray(input) ? input.map(x => String(x || '').trim()).filter(x => allowed.has(x)).slice(0, 10) : [];
}
function normalizeProfileRating(profile) {
  const ratings = Array.isArray(profile.ratings) ? profile.ratings : [];
  if (!ratings.length) return profile.initialRating || profile.rating || 0;
  const avg = ratings.reduce((sum, item) => sum + Number(item.rating || 0), 0) / ratings.length;
  return Math.round(avg * 10) / 10;
}
function canOperatorModerate(pathname, method) {
  return (
    (method === 'GET' && ['/admin/dashboard', '/admin/security-log', '/admin/community', '/admin/diagnostics'].includes(pathname)) ||
    (method === 'POST' && /^\/admin\/community\/[^/]+\/(approve|reject)$/.test(pathname))
  );
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
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
    });
    return res.end();
  }
  const ip = req.socket.remoteAddress || 'unknown';
  const u = new URL(req.url, 'http://localhost');

  try {
    // Health
    if (u.pathname === '/health') return json(res, 200, { ok: true, purchasesPaused: state.security.purchasesPaused, banners: buildActiveBannerState() }, origin);

    if (u.pathname === '/banners/active' && req.method === 'GET') {
      return json(res, 200, { ok: true, slots: buildActiveBannerState() }, origin);
    }

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

    // ------- User Auth -------

    // Registrierung mit Aktivierungscode
    if (u.pathname === '/auth/register' && req.method === 'POST') {
      if (!rateOk('auth_reg:' + ip, 5, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const b = await body(req);
      const { username, email, password, code } = b;
      if (!username || !email || !password || !code) return json(res, 400, { ok: false, error: 'Alle Felder erforderlich' }, origin);
      if (typeof username !== 'string' || username.length < 3 || username.length > 40) return json(res, 400, { ok: false, error: 'Benutzername muss 3–40 Zeichen lang sein' }, origin);
      if (typeof password !== 'string' || password.length < 8) return json(res, 400, { ok: false, error: 'Passwort muss mindestens 8 Zeichen lang sein' }, origin);
      if (state.users[username]) return json(res, 409, { ok: false, error: 'Benutzername bereits vergeben' }, origin);
      const ac = state.activationCodes[code];
      if (!ac) return json(res, 400, { ok: false, error: 'Ungültiger Aktivierungscode' }, origin);
      if (ac.usedBy) return json(res, 400, { ok: false, error: 'Aktivierungscode wurde bereits verwendet' }, origin);
      const salt = b64(crypto.randomBytes(16));
      const passwordHash = hashPassword(password, salt);
      state.users[username] = {
        email,
        passwordHash,
        salt,
        activatedAt: new Date().toISOString(),
        blocked: false,
        role: roleFromInvite(email),
        points: 0,
        pointHistory: [],
        badges: [],
        notifications: [],
        purchasedSlicerProfiles: [],
        redeemedRewards: [],
        purchases: [],
        devices: [],
        settings: { bannerEnabled: true },
        twoFactor: { enabled: false, secret: '', pendingSecret: '', backupCodeHashes: [], recoveryCodesPreview: [], verifiedAt: null }
      };
      state.activationCodes[code].usedBy = username;
      state.activationCodes[code].usedAt = new Date().toISOString();
      rememberDevice(username, req);
      if (state.users[username].role === 'operator') notifyUser(username, 'Du wurdest als Operator freigeschaltet.', 'operator');
      saveState();
      const token = b64(crypto.randomBytes(32));
      sessions.set('user:' + token, { exp: Date.now() + 30 * 60 * 1000, username });
      incident('user_register', 'user=' + username, 'info');
      return json(res, 200, { ok: true, token, username }, origin);
    }

    // Login
    if (u.pathname === '/auth/login' && req.method === 'POST') {
      if (!rateOk('auth_login:' + ip, 10, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Versuche' }, origin);
      const b = await body(req);
      const { username, password, totpCode } = b;
      if (!username || !password) return json(res, 400, { ok: false, error: 'Benutzername und Passwort erforderlich' }, origin);
      const user = state.users[username];
      if (!user) return json(res, 401, { ok: false, error: 'Falscher Benutzername oder Passwort' }, origin);
      if (user.blocked) return json(res, 403, { ok: false, error: 'Konto gesperrt. Bitte den Support kontaktieren.' }, origin);
      if (!safeEqual(hashPassword(password, user.salt), user.passwordHash)) {
        incident('user_login_failed', 'user=' + username + ' ip=' + ip, 'warn');
        return json(res, 401, { ok: false, error: 'Falscher Benutzername oder Passwort' }, origin);
      }
      ensureUserDefaults(user);
      if (user.twoFactor?.enabled) {
        if (!totpCode) return json(res, 401, { ok: false, error: '2FA-Code erforderlich' }, origin);
        let accepted = verifyTotp(user.twoFactor.secret, totpCode);
        if (!accepted) {
          const hash = hashRecoveryCode(totpCode);
          const index = user.twoFactor.backupCodeHashes.findIndex(item => item === hash);
          if (index !== -1) {
            user.twoFactor.backupCodeHashes.splice(index, 1);
            accepted = true;
          }
        }
        if (!accepted) return json(res, 401, { ok: false, error: '2FA-Code ungültig' }, origin);
      }
      rememberDevice(username, req);
      const token = b64(crypto.randomBytes(32));
      sessions.set('user:' + token, { exp: Date.now() + 30 * 60 * 1000, username });
      incident('user_login', 'user=' + username, 'info');
      return json(res, 200, { ok: true, token, username }, origin);
    }

    // Logout
    if (u.pathname === '/auth/logout' && req.method === 'POST') {
      const h = String(req.headers.authorization || '');
      const t = h.startsWith('Bearer ') ? h.slice(7) : '';
      if (t) sessions.delete('user:' + t);
      return json(res, 200, { ok: true }, origin);
    }

    // Profil abrufen (geschützt)
    if (u.pathname === '/auth/profile' && req.method === 'GET') {
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      const user = viewer.user;
      return json(res, 200, {
        ok: true,
        username: viewer.username,
        email: user.email,
        activatedAt: user.activatedAt,
        blocked: user.blocked,
        role: user.role || 'user',
        points: user.points || 0,
        badges: user.badges || [],
        notifications: user.notifications || [],
        purchasedSlicerProfiles: user.purchasedSlicerProfiles || [],
        purchases: user.purchases || [],
        settings: user.settings || { bannerEnabled: true },
        devices: user.devices || [],
        twoFactorEnabled: !!user.twoFactor?.enabled,
        adFree: userHasAdFree(user),
        premiumActive: userHasPremium(user)
      }, origin);
    }

    if (u.pathname === '/user/settings' && req.method === 'GET') {
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      ensureUserDefaults(viewer.user);
      return json(res, 200, {
        ok: true,
        settings: viewer.user.settings,
        adFree: userHasAdFree(viewer.user),
        premiumActive: userHasPremium(viewer.user),
        twoFactorEnabled: !!viewer.user.twoFactor?.enabled
      }, origin);
    }

    if (u.pathname === '/user/settings' && req.method === 'POST') {
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      ensureUserDefaults(viewer.user);
      const payload = await body(req);
      if (typeof payload.bannerEnabled === 'boolean') viewer.user.settings.bannerEnabled = payload.bannerEnabled;
      saveState();
      return json(res, 200, { ok: true, settings: viewer.user.settings, adFree: userHasAdFree(viewer.user), premiumActive: userHasPremium(viewer.user) }, origin);
    }

    if (u.pathname === '/auth/2fa/enable' && req.method === 'POST') {
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      ensureUserDefaults(viewer.user);
      const payload = await body(req);
      if (payload.disable) {
        viewer.user.twoFactor = { enabled: false, secret: '', pendingSecret: '', backupCodeHashes: [], recoveryCodesPreview: [], verifiedAt: null };
        saveState();
        return json(res, 200, { ok: true, disabled: true });
      }
      if (viewer.user.twoFactor.enabled) return json(res, 400, { ok: false, error: '2FA ist bereits aktiv. Bitte erst deaktivieren, bevor du neue Backup-Codes erzeugst.' }, origin);
      const secret = generateTotpSecret();
      const recoveryCodes = generateRecoveryCodes();
      viewer.user.twoFactor.pendingSecret = secret;
      viewer.user.twoFactor.recoveryCodesPreview = recoveryCodes;
      viewer.user.twoFactor.backupCodeHashes = recoveryCodes.map(hashRecoveryCode);
      const otpauthUrl = `otpauth://totp/FabMargin:${encodeURIComponent(viewer.username)}?secret=${secret}&issuer=FabMargin&algorithm=SHA1&digits=6&period=30`;
      saveState();
      if (DEV_OTP_LOG) console.log('TOTP secret for', viewer.username, secret);
      return json(res, 200, { ok: true, secret, otpauthUrl, backupCodes: recoveryCodes });
    }

    if (u.pathname === '/auth/2fa/verify' && req.method === 'POST') {
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      ensureUserDefaults(viewer.user);
      const payload = await body(req);
      const code = String(payload.code || '').trim();
      const secret = viewer.user.twoFactor.pendingSecret || viewer.user.twoFactor.secret;
      if (!secret) return json(res, 400, { ok: false, error: '2FA wurde noch nicht vorbereitet' }, origin);
      let accepted = verifyTotp(secret, code);
      let usedBackupCode = false;
      if (!accepted) {
        const hash = hashRecoveryCode(code);
        const index = viewer.user.twoFactor.backupCodeHashes.findIndex(item => item === hash);
        if (index !== -1) {
          viewer.user.twoFactor.backupCodeHashes.splice(index, 1);
          accepted = true;
          usedBackupCode = true;
        }
      }
      if (!accepted) return json(res, 400, { ok: false, error: 'Code ungültig' }, origin);
      viewer.user.twoFactor.enabled = true;
      viewer.user.twoFactor.secret = secret;
      viewer.user.twoFactor.pendingSecret = '';
      viewer.user.twoFactor.verifiedAt = new Date().toISOString();
      saveState();
      return json(res, 200, { ok: true, enabled: true, usedBackupCode, remainingBackupCodes: viewer.user.twoFactor.backupCodeHashes.length });
    }

    if (u.pathname === '/user/devices' && req.method === 'GET') {
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      ensureUserDefaults(viewer.user);
      return json(res, 200, { ok: true, devices: viewer.user.devices || [] }, origin);
    }

    const userDeviceDeleteMatch = u.pathname.match(/^\/user\/devices\/([^/]+)$/);
    if (userDeviceDeleteMatch && req.method === 'DELETE') {
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      ensureUserDefaults(viewer.user);
      const before = viewer.user.devices.length;
      viewer.user.devices = viewer.user.devices.filter(device => device.id !== decodeURIComponent(userDeviceDeleteMatch[1]));
      if (before === viewer.user.devices.length) return json(res, 404, { ok: false, error: 'Gerät nicht gefunden' }, origin);
      saveState();
      return json(res, 200, { ok: true, devices: viewer.user.devices }, origin);
    }

    if (u.pathname === '/user/purchases' && req.method === 'GET') {
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      ensureUserDefaults(viewer.user);
      return json(res, 200, {
        ok: true,
        purchases: viewer.user.purchases || [],
        premiumActive: userHasPremium(viewer.user),
        adFree: userHasAdFree(viewer.user)
      }, origin);
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
      if (!hasOperatorAccess(req)) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      return json(res, 200, { ok: true, messages: state.supportMessages || [] }, origin);
    }

    if (u.pathname === '/content/live' && req.method === 'GET') {
      return json(res, 200, { ok: true, content: state.cmsContent || {} }, origin);
    }

    if (u.pathname === '/user/points' && req.method === 'GET') {
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      const user = viewer.user;
      return json(res, 200, {
        ok: true,
        points: user.points || 0,
        badges: user.badges || [],
        history: user.pointHistory || [],
        redeemOptions: [
          { id: 'premium_tip_pack', title: 'Premium-Tipps', cost: 30, unlocked: (user.redeemedRewards || []).includes('premium_tip_pack') },
          { id: 'top_creator_badge', title: 'Top Creator Badge', cost: 120, unlocked: (user.badges || []).includes('Top Creator') }
        ]
      }, origin);
    }

    if (u.pathname === '/user/points/redeem' && req.method === 'POST') {
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      const data = await body(req);
      const reward = String(data.rewardId || '');
      const user = viewer.user;
      if (!Array.isArray(user.redeemedRewards)) user.redeemedRewards = [];
      const rewards = {
        premium_tip_pack: { cost: 30, title: 'Premium-Tipps' },
        top_creator_badge: { cost: 120, title: 'Top Creator Badge' }
      };
      if (!rewards[reward]) return json(res, 400, { ok: false, error: 'Unbekannte Belohnung' }, origin);
      if (reward === 'top_creator_badge' && user.badges.includes('Top Creator')) return json(res, 200, { ok: true, alreadyRedeemed: true, points: user.points || 0 }, origin);
      if (reward === 'premium_tip_pack' && user.redeemedRewards.includes(reward)) return json(res, 200, { ok: true, alreadyRedeemed: true, points: user.points || 0 }, origin);
      if ((user.points || 0) < rewards[reward].cost) return json(res, 400, { ok: false, error: 'Nicht genug Punkte' }, origin);
      user.points -= rewards[reward].cost;
      user.pointHistory.unshift({ id: crypto.randomUUID(), amount: -rewards[reward].cost, reason: 'Eingelöst: ' + rewards[reward].title, createdAt: new Date().toISOString() });
      if (reward === 'premium_tip_pack') user.redeemedRewards.push(reward);
      if (reward === 'top_creator_badge') awardBadge(viewer.username, 'Top Creator');
      saveState();
      return json(res, 200, { ok: true, points: user.points, badges: user.badges || [], redeemedRewards: user.redeemedRewards || [] }, origin);
    }

    if (u.pathname === '/payment/checkout' && req.method === 'POST') {
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Bitte zuerst anmelden' }, origin);
      ensureUserDefaults(viewer.user);
      const payload = await body(req);
      const catalog = {
        premium_subscription: { title: 'FabMargin Premium-Abo', amount: 999, type: 'subscription' },
        ad_free_lifetime: { title: 'Werbefrei dauerhaft', amount: 499, type: 'one_time' },
        slicer_profile_pack: { title: 'Slicer-Profil Paket', amount: 299, type: 'one_time' }
      };
      const productId = String(payload.productId || '');
      const product = catalog[productId];
      if (!product) return json(res, 400, { ok: false, error: 'Unbekanntes Produkt' }, origin);
      const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '');
      const sessionData = {
        id: sessionId,
        username: viewer.username,
        productId,
        amount: product.amount,
        currency: 'eur',
        title: product.title,
        type: product.type,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      state.paymentSessions[sessionId] = sessionData;
      saveState();
      if (!STRIPE_SECRET_KEY) {
        return json(res, 200, {
          ok: true,
          sessionId,
          mockMode: true,
          checkoutUrl: `${APP_BASE_URL.replace(/\/$/, '')}/checkout/mock?session_id=${sessionId}`,
          amount: product.amount,
          currency: 'EUR'
        }, origin);
      }
      const params = new URLSearchParams();
      params.set('mode', product.type === 'subscription' ? 'subscription' : 'payment');
      params.set('success_url', `${APP_BASE_URL.replace(/\/$/, '')}/payment-success?session_id=${sessionId}`);
      params.set('cancel_url', `${APP_BASE_URL.replace(/\/$/, '')}/payment-cancelled?session_id=${sessionId}`);
      params.set('line_items[0][price_data][currency]', 'eur');
      params.set('line_items[0][price_data][unit_amount]', String(product.amount));
      params.set('line_items[0][price_data][product_data][name]', product.title);
      params.set('line_items[0][quantity]', '1');
      try {
        const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + STRIPE_SECRET_KEY,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        });
        const stripeData = await stripeResponse.json();
        if (!stripeResponse.ok) return json(res, 502, { ok: false, error: stripeData.error?.message || 'Stripe-Checkout fehlgeschlagen' }, origin);
        sessionData.stripeSessionId = stripeData.id;
        saveState();
        return json(res, 200, { ok: true, sessionId, checkoutUrl: stripeData.url, stripeSessionId: stripeData.id }, origin);
      } catch (error) {
        return json(res, 500, { ok: false, error: error.message }, origin);
      }
    }

    if (u.pathname === '/payment/webhook' && req.method === 'POST') {
      const raw = await rawBody(req, 1024 * 128);
      const payload = raw ? JSON.parse(raw) : {};
      const stripeSignature = String(req.headers['stripe-signature'] || '');
      const altSecret = String(req.headers['x-security-secret'] || '');
      if (STRIPE_WEBHOOK_SECRET) {
        let verified = false;
        if (stripeSignature) {
          const parts = Object.fromEntries(stripeSignature.split(',').map(part => part.split('=').map(x => x.trim())).filter(part => part.length === 2));
          const timestamp = parts.t;
          const signature = parts.v1;
          if (timestamp && signature) {
            const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest('hex');
            verified = safeEqual(signature, expected);
          }
        } else if (altSecret) {
          verified = safeEqual(altSecret, STRIPE_WEBHOOK_SECRET);
        }
        if (!verified) return json(res, 401, { ok: false, error: 'Webhook nicht autorisiert' }, origin);
      }
      const eventType = String(payload.type || '');
      const sessionId = String(payload.sessionId || payload.data?.object?.client_reference_id || payload.data?.object?.metadata?.sessionId || '');
      const session = state.paymentSessions[sessionId] || Object.values(state.paymentSessions).find(item => item.stripeSessionId === payload.data?.object?.id);
      if (!session) return json(res, 404, { ok: false, error: 'Session nicht gefunden' }, origin);
      if (eventType !== 'checkout.session.completed') return json(res, 200, { ok: true, ignored: true }, origin);
      if (session.status === 'completed') return json(res, 200, { ok: true, alreadyCompleted: true }, origin);
      const user = state.users[session.username];
      if (!user) return json(res, 404, { ok: false, error: 'Nutzer nicht gefunden' }, origin);
      addPurchase(user, {
        productId: session.productId,
        title: session.title,
        amount: session.amount,
        type: session.type,
        provider: 'stripe',
        status: 'completed'
      });
      session.status = 'completed';
      session.completedAt = new Date().toISOString();
      notifyUser(session.username, `Zahlung erfolgreich: ${session.title}`, 'success');
      saveState();
      return json(res, 200, { ok: true, sessionId: session.id }, origin);
    }

    if (u.pathname === '/partner/request' && req.method === 'POST') {
      if (!rateOk('partner:' + ip, 10, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const payload = await body(req);
      const partner = {
        id: crypto.randomUUID(),
        companyName: String(payload.companyName || '').trim().slice(0, 120),
        website: normalizeHttpsUrl(String(payload.website || '').trim().slice(0, 200)),
        contactEmail: String(payload.contactEmail || '').trim().slice(0, 200),
        cooperationType: String(payload.cooperationType || '').trim().slice(0, 80),
        printerModel: String(payload.printerModel || '').trim().slice(0, 120),
        printerValueEuro: Math.max(0, Number(payload.printerValueEuro || 0)),
        filamentPerMonth: Math.max(0, Number(payload.filamentPerMonth || 0)),
        termYears: Math.max(1, Math.min(3, Number(payload.termYears || 1))),
        description: String(payload.description || '').trim().slice(0, 2000),
        rotationSeconds: Math.max(5, Math.min(600, Number(payload.rotationSeconds || 30))),
        bannerText: String(payload.bannerText || '').trim().slice(0, 140),
        createdAt: new Date().toISOString(),
        status: 'pending'
      };
      if (String(payload.website || '').trim() && !partner.website) return json(res, 400, { ok: false, error: 'Bitte eine gültige HTTPS-Website angeben' }, origin);
      if (!partner.companyName || !partner.website || !partner.contactEmail || !partner.cooperationType || !partner.printerModel || !partner.description) {
        return json(res, 400, { ok: false, error: 'Bitte alle Pflichtfelder ausfüllen' }, origin);
      }
      const evaluation = await evaluatePartnerRequest(partner);
      partner.category = evaluation.category;
      partner.vipStatus = evaluation.vipStatus;
      partner.trustScore = evaluation.trustScore;
      partner.suspicious = evaluation.suspicious;
      partner.domainAgeYears = evaluation.domainAgeYears;
      partner.counterProposal = evaluation.counterProposal;
      partner.waitlist = evaluation.waitlist;
      partner.autoReply = createPartnerAutoReply(partner, evaluation);
      partner.bannerSlotNumber = evaluation.suggestedSlotNumber;
      partner.contractPdfBase64 = buildPartnerContractPdf(partner, evaluation);
      state.partnerRequests.unshift(partner);
      state.partnerRequests = state.partnerRequests.slice(0, 200);
      await sendMail({
        to: PARTNER_EMAIL,
        subject: `${evaluation.vipStatus !== 'Normal' ? '⭐ ' : ''}Neue Partner-Anfrage: ${partner.companyName}`,
        text: [
          `Firma: ${partner.companyName}`,
          `Website: ${partner.website}`,
          `Kontakt: ${partner.contactEmail}`,
          `Kategorie: ${partner.category}`,
          `VIP: ${partner.vipStatus}`,
          `Trust-Score: ${partner.trustScore}%`,
          `KI-Antwort: ${partner.autoReply}`
        ].join('\n'),
        priority: evaluation.vipStatus === 'VIP PREMIUM' ? 'push' : evaluation.vipStatus === 'VIP' ? 'high' : 'normal'
      });
      saveState();
      return json(res, 200, {
        ok: true,
        requestId: partner.id,
        category: partner.category,
        vipStatus: partner.vipStatus,
        trustScore: partner.trustScore,
        suspicious: partner.suspicious,
        autoReply: partner.autoReply,
        counterProposal: partner.counterProposal,
        waitlist: partner.waitlist,
        contractPdfBase64: partner.contractPdfBase64
      }, origin);
    }

    // ---------- Geschützte Admin-Endpunkte ----------

    if (u.pathname.startsWith('/admin/') && u.pathname !== '/admin/login') {
      if (canOperatorModerate(u.pathname, req.method)) {
        if (!hasOperatorAccess(req)) return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      } else if (!sessionOk(req)) {
        return json(res, 401, { ok: false, error: 'Nicht autorisiert' }, origin);
      }
    }

    if (u.pathname === '/slicer/profile' && req.method === 'POST') {
      if (!rateOk('slicer_create:' + ip, 10, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Bitte zuerst anmelden' }, origin);
      const b = await body(req, 1024 * 1024);
      const name = String(b.name || '').trim();
      const printerModel = String(b.printerModel || '').trim();
      const slicer = String(b.slicer || '').trim();
      const description = String(b.description || '').trim();
      const settings = b.settings || {};
      const rawImages = Array.isArray(b.images) ? b.images : [];
      const images = rawImages.map(sanitizeImage).filter(Boolean).slice(0, 5);
      const initialRating = Math.max(1, Math.min(5, Number(b.rating || 0) || 0));
      if (!name || !printerModel || !slicer || !description) return json(res, 400, { ok: false, error: 'Bitte alle Pflichtfelder ausfüllen' }, origin);
      if (!['Cura', 'PrusaSlicer', 'Bambu Studio'].includes(slicer)) return json(res, 400, { ok: false, error: 'Slicer nicht unterstützt' }, origin);
      if (!settings.layerHeight || !settings.speed || !settings.temp) return json(res, 400, { ok: false, error: 'Layer Height, Speed und Temp sind erforderlich' }, origin);
      if (rawImages.length > 5) return json(res, 400, { ok: false, error: 'Maximal 5 Bilder pro Profil erlaubt' }, origin);
      if ((countUserProfileImages(viewer.username) + images.length) > 20) return json(res, 400, { ok: false, error: 'Maximal 20 Bilder insgesamt pro Nutzer erlaubt. Bitte zuerst alte Bilder löschen.' }, origin);
      const item = {
        id: crypto.randomUUID(),
        owner: viewer.username,
        name: name.slice(0, 80),
        printerModel: printerModel.slice(0, 80),
        slicer,
        settings: {
          layerHeight: String(settings.layerHeight).slice(0, 40),
          speed: String(settings.speed).slice(0, 40),
          temp: String(settings.temp).slice(0, 40)
        },
        description: description.slice(0, 1000),
        images,
        status: 'pending',
        initialRating,
        rating: initialRating,
        ratings: [],
        purchases: [],
        purchaseCount: 0,
        createdAt: new Date().toISOString()
      };
      state.slicerProfiles.unshift(item);
      saveState();
      incident('slicer_profile_created', 'user=' + viewer.username + ' id=' + item.id, 'info');
      return json(res, 200, { ok: true, profile: item }, origin);
    }

    if (u.pathname === '/user/slicer-profiles' && req.method === 'GET') {
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Bitte zuerst anmelden' }, origin);
      const profiles = (state.slicerProfiles || [])
        .filter(profile => profile.owner === viewer.username)
        .map(profile => ({
          id: profile.id,
          name: profile.name,
          printerModel: profile.printerModel,
          status: profile.status,
          images: profile.images || [],
          createdAt: profile.createdAt
        }));
      return json(res, 200, { ok: true, profiles, totalImages: countUserProfileImages(viewer.username) }, origin);
    }

    if (u.pathname === '/slicer/profiles' && req.method === 'GET') {
      const items = (state.slicerProfiles || [])
        .filter(x => x.status === 'approved')
        .map(x => ({
          id: x.id,
          owner: x.owner,
          name: x.name,
          printerModel: x.printerModel,
          slicer: x.slicer,
          settings: x.settings,
          description: x.description,
          images: x.images || [],
          rating: normalizeProfileRating(x),
          purchaseCount: x.purchaseCount || 0,
          badges: (state.users[x.owner]?.badges) || []
        }));
      return json(res, 200, { ok: true, profiles: items }, origin);
    }

    const slicerBuyMatch = u.pathname.match(/^\/slicer\/profile\/([^/]+)\/buy$/);
    if (slicerBuyMatch && req.method === 'POST') {
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Bitte zuerst anmelden' }, origin);
      const b = await body(req);
      const method = 'points';
      const profile = (state.slicerProfiles || []).find(x => x.id === slicerBuyMatch[1] && x.status === 'approved');
      if (!profile) return json(res, 404, { ok: false, error: 'Profil nicht gefunden' }, origin);
      if (profile.owner === viewer.username) return json(res, 400, { ok: false, error: 'Eigenes Profil kann nicht gekauft werden' }, origin);
      if ((viewer.user.purchasedSlicerProfiles || []).includes(profile.id)) return json(res, 200, { ok: true, alreadyOwned: true, profileId: profile.id }, origin);
      if ((viewer.user.points || 0) < 40) return json(res, 400, { ok: false, error: 'Nicht genug Punkte' }, origin);
      viewer.user.points -= 40;
      viewer.user.pointHistory.unshift({ id: crypto.randomUUID(), amount: -40, reason: 'Slicer-Profil gekauft: ' + profile.name, createdAt: new Date().toISOString() });
      viewer.user.purchasedSlicerProfiles.push(profile.id);
      profile.purchases.push({ username: viewer.username, method, createdAt: new Date().toISOString() });
      profile.purchaseCount = profile.purchases.length;
      addPoints(profile.owner, 20, 'Profil gekauft: ' + profile.name);
      if (profile.purchaseCount === 10) addPoints(profile.owner, 100, 'Bonus für 10 Verkäufe');
      saveState();
      incident('slicer_profile_bought', 'buyer=' + viewer.username + ' profile=' + profile.id, 'info');
      return json(res, 200, { ok: true, profileId: profile.id, method, points: viewer.user.points || 0 }, origin);
    }

    const slicerRateMatch = u.pathname.match(/^\/slicer\/profile\/([^/]+)\/rate$/);
    if (slicerRateMatch && req.method === 'POST') {
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Bitte zuerst anmelden' }, origin);
      const b = await body(req);
      const rating = Math.max(1, Math.min(5, Number(b.rating || 0)));
      const profile = (state.slicerProfiles || []).find(x => x.id === slicerRateMatch[1] && x.status === 'approved');
      if (!profile) return json(res, 404, { ok: false, error: 'Profil nicht gefunden' }, origin);
      if (!(viewer.user.purchasedSlicerProfiles || []).includes(profile.id)) return json(res, 403, { ok: false, error: 'Bitte Profil zuerst kaufen' }, origin);
      const existing = (profile.ratings || []).find(x => x.username === viewer.username);
      const previous = existing ? existing.rating : null;
      if (existing) existing.rating = rating;
      else profile.ratings.push({ username: viewer.username, rating, createdAt: new Date().toISOString() });
      if (rating === 5 && previous !== 5) addPoints(profile.owner, 10, '5★ Bewertung für ' + profile.name);
      profile.rating = normalizeProfileRating(profile);
      saveState();
      return json(res, 200, { ok: true, rating: profile.rating }, origin);
    }

    const slicerImageDeleteMatch = u.pathname.match(/^\/slicer\/profile\/([^/]+)\/image\/(\d+)$/);
    if (slicerImageDeleteMatch && req.method === 'DELETE') {
      const viewer = getCurrentUser(req);
      if (!viewer) return json(res, 401, { ok: false, error: 'Bitte zuerst anmelden' }, origin);
      const profile = (state.slicerProfiles || []).find(item => item.id === slicerImageDeleteMatch[1]);
      if (!profile) return json(res, 404, { ok: false, error: 'Profil nicht gefunden' }, origin);
      if (profile.owner !== viewer.username && viewer.user.role !== 'operator') return json(res, 403, { ok: false, error: 'Nicht erlaubt' }, origin);
      const imageIndex = Number(slicerImageDeleteMatch[2]);
      if (!Array.isArray(profile.images) || imageIndex < 0 || imageIndex >= profile.images.length) return json(res, 404, { ok: false, error: 'Bild nicht gefunden' }, origin);
      profile.images.splice(imageIndex, 1);
      saveState();
      return json(res, 200, { ok: true, images: profile.images || [], totalImages: countUserProfileImages(profile.owner) }, origin);
    }

    if (u.pathname === '/admin/slicer/pending' && req.method === 'GET') {
      const items = (state.slicerProfiles || []).filter(x => x.status === 'pending');
      return json(res, 200, { ok: true, profiles: items }, origin);
    }

    const approveSlicerMatch = u.pathname.match(/^\/admin\/slicer\/approve\/([^/]+)$/);
    if (approveSlicerMatch && req.method === 'POST') {
      const profile = (state.slicerProfiles || []).find(x => x.id === approveSlicerMatch[1]);
      if (!profile) return json(res, 404, { ok: false, error: 'Profil nicht gefunden' }, origin);
      if (profile.status !== 'approved') {
        profile.status = 'approved';
        profile.approvedAt = new Date().toISOString();
        addPoints(profile.owner, 50, 'Slicer-Profil freigegeben: ' + profile.name);
        notifyUser(profile.owner, 'Dein Slicer-Profil "' + profile.name + '" wurde freigegeben.', 'success');
        saveState();
      }
      return json(res, 200, { ok: true }, origin);
    }

    if (u.pathname === '/operator/request' && req.method === 'POST') {
      const viewer = getCurrentUser(req);
      if (!viewer || viewer.user.role !== 'operator') return json(res, 403, { ok: false, error: 'Nur Operatoren dürfen Anfragen stellen' }, origin);
      const b = await body(req);
      const action = String(b.action || '').trim();
      const reason = String(b.reason || '').trim();
      if (!action || !reason) return json(res, 400, { ok: false, error: 'Aktion und Begründung erforderlich' }, origin);
      const request = { id: crypto.randomUUID(), operator: viewer.username, action: action.slice(0, 120), reason: reason.slice(0, 500), status: 'pending', createdAt: new Date().toISOString() };
      state.operatorRequests.unshift(request);
      saveState();
      return json(res, 200, { ok: true, request }, origin);
    }

    if (u.pathname === '/admin/operator/requests' && req.method === 'GET') {
      return json(res, 200, { ok: true, requests: state.operatorRequests || [] }, origin);
    }

    const operatorReqMatch = u.pathname.match(/^\/admin\/operator\/requests\/([^/]+)\/(approve|reject)$/);
    if (operatorReqMatch && req.method === 'POST') {
      const request = (state.operatorRequests || []).find(x => x.id === operatorReqMatch[1]);
      if (!request) return json(res, 404, { ok: false, error: 'Anfrage nicht gefunden' }, origin);
      request.status = operatorReqMatch[2] === 'approve' ? 'approved' : 'rejected';
      request.decidedAt = new Date().toISOString();
      notifyUser(request.operator, 'Deine Operator-Anfrage "' + request.action + '" wurde ' + (request.status === 'approved' ? 'genehmigt' : 'abgelehnt') + '.', request.status === 'approved' ? 'success' : 'warn');
      saveState();
      return json(res, 200, { ok: true }, origin);
    }

    if (u.pathname === '/admin/operator/invite' && req.method === 'POST') {
      const b = await body(req);
      const username = String(b.username || '').trim();
      const email = String(b.email || '').trim();
      if (!username && !email) return json(res, 400, { ok: false, error: 'username oder email erforderlich' }, origin);
      if (username && state.users[username]) {
        state.users[username].role = 'operator';
        notifyUser(username, 'Du wurdest als Operator eingeladen.', 'operator');
      } else if (email) {
        state.operatorInvites[crypto.randomUUID()] = { email: email.slice(0, 200), createdAt: new Date().toISOString(), acceptedAt: null };
      } else {
        return json(res, 404, { ok: false, error: 'Nutzer nicht gefunden' }, origin);
      }
      saveState();
      return json(res, 200, { ok: true }, origin);
    }

    if (u.pathname === '/diagnostics/report' && req.method === 'POST') {
      if (!rateOk('diagnostics:' + ip, 20, 60000)) return json(res, 429, { ok: false, error: 'Zu viele Anfragen' }, origin);
      const viewer = getCurrentUser(req);
      const b = await body(req);
      const report = {
        id: crypto.randomUUID(),
        username: viewer?.username || 'gast',
        devtoolsDetected: !!b.devtoolsDetected,
        errorCount: Math.max(0, Number(b.errorCount || 0)),
        flags: sanitizeDiagnosticFlags(b.flags),
        userAgent: String(b.userAgent || req.headers['user-agent'] || '').slice(0, 300),
        createdAt: new Date().toISOString()
      };
      state.diagnostics.unshift(report);
      state.diagnostics = state.diagnostics.slice(0, 200);
      saveState();
      return json(res, 200, { ok: true, reportId: report.id }, origin);
    }

    if (u.pathname === '/admin/diagnostics' && req.method === 'GET') {
      return json(res, 200, { ok: true, reports: state.diagnostics || [] }, origin);
    }

    if (u.pathname === '/admin/partner/requests' && req.method === 'GET') {
      return json(res, 200, { ok: true, requests: state.partnerRequests || [] }, origin);
    }

    const partnerDecisionMatch = u.pathname.match(/^\/admin\/partner\/requests\/([^/]+)\/(approve|reject)$/);
    if (partnerDecisionMatch && req.method === 'POST') {
      const request = (state.partnerRequests || []).find(item => item.id === partnerDecisionMatch[1]);
      if (!request) return json(res, 404, { ok: false, error: 'Partner-Anfrage nicht gefunden' }, origin);
      const action = partnerDecisionMatch[2];
      if (action === 'approve') {
        if (activePartnerByCategory(request.category) && activePartnerByCategory(request.category).id !== request.id) {
          request.status = 'waitlist';
          request.waitlist = true;
        } else {
          request.status = 'approved';
          request.approvedAt = new Date().toISOString();
        }
      } else {
        request.status = 'rejected';
        request.rejectedAt = new Date().toISOString();
      }
      saveState();
      return json(res, 200, { ok: true, status: request.status }, origin);
    }

    if (u.pathname === '/admin/partner/categories' && req.method === 'GET') {
      const categories = ['Filament', 'Drucker', 'Software', 'Zubehör'].map(category => {
        const activePartner = activePartnerByCategory(category);
        return {
          category,
          activePartner: activePartner ? {
            id: activePartner.id,
            companyName: activePartner.companyName,
            vipStatus: activePartner.vipStatus
          } : null,
          waiting: (state.partnerRequests || []).filter(item => item.category === category && item.status === 'waitlist').length
        };
      });
      return json(res, 200, { ok: true, categories }, origin);
    }

    if (u.pathname === '/admin/content' && req.method === 'GET') {
      return json(res, 200, { ok: true, content: state.cmsContent || {} }, origin);
    }

    if (u.pathname === '/admin/content/update' && req.method === 'POST') {
      const b = await body(req, 65536);
      const premiumTips = Array.isArray(b.premiumTips) ? b.premiumTips.map(x => String(x || '').trim()).filter(Boolean).slice(0, 6) : [];
      state.cmsContent = {
        heroTitle: String(b.heroTitle || state.cmsContent?.heroTitle || '').trim().slice(0, 120),
        heroText: String(b.heroText || state.cmsContent?.heroText || '').trim().slice(0, 500),
        premiumHeadline: String(b.premiumHeadline || state.cmsContent?.premiumHeadline || '').trim().slice(0, 120),
        premiumTips: premiumTips.length ? premiumTips : (state.cmsContent?.premiumTips || [])
      };
      saveState();
      return json(res, 200, { ok: true, content: state.cmsContent }, origin);
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
        slicerPending: (state.slicerProfiles || []).filter(x => x.status === 'pending').length,
        partnerPending: (state.partnerRequests || []).filter(x => x.status === 'pending').length,
        diagnostics: (state.diagnostics || []).length,
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
      // Validate token format: base64url characters only, no prototype keys possible
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return json(res, 400, { ok: false, error: 'Ungültiger Token' }, origin);
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
