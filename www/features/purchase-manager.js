// FabMargin 3D – Purchase Manager
// Verwaltet gekaufte Module. In-App-Käufe laufen via Google Play Billing
// (Native-Bridge). Die Freischaltung wird zusätzlich serverseitig verifiziert.
(function (global) {
  const STORE_KEY = 'fabmargin_purchases_v1';

  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch { return {}; }
  }
  function saveLocal(state) { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

  function isOwned(featureId) {
    if (featureId === 'feat_pro_base') return true; // Pro-Grundzugang durch App-Kauf enthalten
    const state = loadLocal();
    if (state[featureId] && state[featureId].verified) return true;
    // Bundle-Freischaltung prüfen
    if (state['feat_bundle_all'] && state['feat_bundle_all'].verified) {
      const bundle = (window.FEATURE_CATALOG || []).find(f => f.id === 'feat_bundle_all');
      if (bundle && bundle.unlocks && bundle.unlocks.includes(featureId)) return true;
    }
    return false;
  }

  async function purchase(featureId) {
    const feature = (window.FEATURE_CATALOG || []).find(f => f.id === featureId);
    if (!feature) throw new Error('Unbekanntes Modul');
    // Native Google Play Billing (falls in Android-App)
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.GoogleBilling) {
      const result = await window.Capacitor.Plugins.GoogleBilling.purchase({ sku: feature.sku });
      if (!result || !result.purchaseToken) throw new Error('Kauf abgebrochen');
      // Server-Verifikation (Play Integrity + Play Developer API)
      const verify = await verifyOnServer(feature.sku, result.purchaseToken);
      if (!verify.ok) throw new Error(verify.error || 'Verifikation fehlgeschlagen');
      const state = loadLocal();
      state[featureId] = { verified: true, purchasedAt: new Date().toISOString(), sku: feature.sku };
      saveLocal(state);
      return true;
    }
    // Fallback (Web-Vorschau): Dummy-Freischaltung zum Testen
    if (confirm(`[Nur Vorschau ohne Play Store]\n\n"${feature.title}" für ${feature.price} freischalten?`)) {
      const state = loadLocal();
      state[featureId] = { verified: true, purchasedAt: new Date().toISOString(), sku: feature.sku, dev: true };
      saveLocal(state);
      return true;
    }
    return false;
  }

  async function verifyOnServer(sku, token) {
    const backend = localStorage.getItem('fabmargin_backend_url') || '';
    if (!backend) return { ok: false, error: 'Backend-URL fehlt' };
    try {
      const res = await fetch(backend + '/purchase/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, purchaseToken: token })
      });
      return await res.json();
    } catch (e) {
      return { ok: false, error: 'Netzwerkfehler: ' + e.message };
    }
  }

  function restore() {
    // Fordert Google Play die Liste der bereits gekauften Produkte an.
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.GoogleBilling) {
      return window.Capacitor.Plugins.GoogleBilling.queryPurchases();
    }
    return Promise.resolve([]);
  }

  function ownedList() {
    const state = loadLocal();
    return Object.keys(state).filter(k => state[k].verified);
  }

  function reset() { localStorage.removeItem(STORE_KEY); }

  global.PurchaseManager = { isOwned, purchase, restore, ownedList, reset };
})(window);
