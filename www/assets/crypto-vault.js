// FabMargin 3D – Verschlüsselter Tresor
// AES-256-GCM + PBKDF2 (350.000 Iterationen). Ohne Master-Passwort ist NICHTS lesbar.
// Verwendet ausschließlich Web Crypto API (nativ im Browser/Android WebView).
(function (global) {
  const ITER = 350000;
  const KEY_LEN = 256;
  const SALT_LEN = 16;
  const IV_LEN = 12;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function b64e(buf) {
    const bin = String.fromCharCode(...new Uint8Array(buf));
    return btoa(bin);
  }
  function b64d(s) {
    const bin = atob(s);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }

  async function deriveKey(password, salt) {
    const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
      km,
      { name: 'AES-GCM', length: KEY_LEN },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encrypt(plaintext, password) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const key = await deriveKey(password, salt);
    const data = typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext;
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return {
      v: 1,
      alg: 'AES-GCM-256/PBKDF2-SHA256',
      iter: ITER,
      salt: b64e(salt),
      iv: b64e(iv),
      ct: b64e(ct)
    };
  }

  async function decrypt(bundle, password) {
    if (!bundle || bundle.v !== 1) throw new Error('Unbekanntes Tresor-Format');
    const key = await deriveKey(password, new Uint8Array(b64d(bundle.salt)));
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(b64d(bundle.iv)) },
      key,
      b64d(bundle.ct)
    );
    return dec.decode(pt);
  }

  // Persistierter Tresor im localStorage – enthält NUR den verschlüsselten Blob.
  const STORAGE_KEY = 'fabmargin_vault_v1';
  function saveVault(bundle) { localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle)); }
  function loadVault() { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : null; }
  function hasVault() { return !!localStorage.getItem(STORAGE_KEY); }
  function destroyVault() { localStorage.removeItem(STORAGE_KEY); }

  // Sitzungsschlüssel (Passwort im RAM, nie auf Platte)
  let sessionPassword = null;
  let sessionData = null;
  let sessionTimer = null;
  const SESSION_MINUTES = 15;

  async function unlock(password) {
    const bundle = loadVault();
    if (!bundle) throw new Error('Kein Tresor vorhanden');
    const json = await decrypt(bundle, password);
    sessionData = JSON.parse(json);
    sessionPassword = password;
    resetTimer();
    return sessionData;
  }

  async function createVault(password, initialData) {
    const data = initialData || {
      createdAt: new Date().toISOString(),
      customers: [],
      purchases: [],
      licenses: [],
      notes: '',
      version: 1
    };
    const bundle = await encrypt(JSON.stringify(data), password);
    saveVault(bundle);
    sessionPassword = password;
    sessionData = data;
    resetTimer();
    return data;
  }

  async function commit() {
    if (!sessionPassword || !sessionData) throw new Error('Tresor nicht entsperrt');
    const bundle = await encrypt(JSON.stringify(sessionData), sessionPassword);
    saveVault(bundle);
    resetTimer();
  }

  function lock() {
    sessionPassword = null;
    sessionData = null;
    if (sessionTimer) { clearTimeout(sessionTimer); sessionTimer = null; }
  }

  function resetTimer() {
    if (sessionTimer) clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => { lock(); document.dispatchEvent(new CustomEvent('vault:locked')); }, SESSION_MINUTES * 60 * 1000);
  }

  function isUnlocked() { return !!sessionPassword; }
  function data() { return sessionData; }

  async function changePassword(oldPw, newPw) {
    await unlock(oldPw); // wirft, wenn falsch
    sessionPassword = newPw;
    await commit();
  }

  global.FabVault = { hasVault, createVault, unlock, lock, isUnlocked, data, commit, destroyVault, changePassword, encrypt, decrypt };
})(window);
