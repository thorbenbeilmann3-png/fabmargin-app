// FabMargin 3D – Purchase Manager (PrintProfit 3D Premium)
// Unterstützt: onetime, consumable (Credit-basiert), pack, bundle.
// In-App-Käufe laufen via Google Play Billing (Native-Bridge).
// Freischaltung wird zusätzlich serverseitig verifiziert.
(function (global) {
  const STORE_KEY = 'fabmargin_purchases_v1';

  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch { return {}; }
  }
  function saveLocal(state) { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

  // Gibt zurück ob ein Feature dauerhaft freigeschaltet ist (onetime/bundle/pack-fully-consumed)
  function isOwned(featureId) {
    const state = loadLocal();
    // Direkt als onetime gekauft
    if (state[featureId] && state[featureId].verified) return true;
    // Durch ein Bundle oder Unlimited freigeschaltet
    const catalog = window.FEATURE_CATALOG || [];
    for (const item of catalog) {
      if (item.unlocks && item.unlocks.includes(featureId)) {
        if (state[item.id] && state[item.id].verified) return true;
      }
    }
    return false;
  }

  // Anzahl verbleibender Credits für ein consumable Feature
  function creditsFor(featureId) {
    if (isOwned(featureId)) return Infinity; // Unlimited durch onetime/bundle
    const state = loadLocal();
    return Number(state['credits:' + featureId] || 0);
  }

  // Verbraucht einen Credit; gibt false zurück wenn keiner verfügbar
  function useCredit(featureId) {
    if (isOwned(featureId)) return true; // Unlimited
    const state = loadLocal();
    const key = 'credits:' + featureId;
    const current = Number(state[key] || 0);
    if (current <= 0) return false;
    state[key] = current - 1;
    saveLocal(state);
    return true;
  }

  // Storniert einen Credit-Verbrauch (bei technischem Fehler)
  function refundCredit(featureId) {
    if (isOwned(featureId)) return;
    const state = loadLocal();
    const key = 'credits:' + featureId;
    state[key] = Number(state[key] || 0) + 1;
    saveLocal(state);
  }

  async function purchase(featureId) {
    const catalog = window.FEATURE_CATALOG || [];
    const feature = catalog.find(f => f.id === featureId);
    if (!feature) throw new Error('Unbekanntes Produkt');

    let purchaseToken = null;

    // Native Google Play Billing (falls in Android-App)
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.GoogleBilling) {
      const result = await window.Capacitor.Plugins.GoogleBilling.purchase({ sku: feature.sku });
      if (!result || !result.purchaseToken) throw new Error('Kauf abgebrochen');
      const verify = await verifyOnServer(feature.sku, result.purchaseToken);
      if (!verify.ok) throw new Error(verify.error || 'Verifikation fehlgeschlagen');
      purchaseToken = result.purchaseToken;
    } else {
      // Fallback (Web-Vorschau)
      if (!confirm(`[Nur Vorschau ohne Play Store]\n\n"${feature.title}" für ${feature.price} kaufen?\n\n${feature.priceNote || ''}`)) return false;
      purchaseToken = 'dev_' + Date.now();
    }

    const state = loadLocal();

    if (feature.type === 'onetime' || feature.type === 'bundle') {
      state[featureId] = { verified: true, purchasedAt: new Date().toISOString(), sku: feature.sku, token: purchaseToken };
    } else if (feature.type === 'consumable') {
      // 1 Credit addieren
      const key = 'credits:' + featureId;
      state[key] = Number(state[key] || 0) + 1;
    } else if (feature.type === 'pack') {
      // N Credits für das Ziel-Feature addieren
      const targetKey = 'credits:' + (feature.creditsFor || featureId);
      state[targetKey] = Number(state[targetKey] || 0) + (feature.credits || 1);
    }

    // Bundle: Einzelne Features als freigeschaltet markieren
    if (feature.type === 'bundle' && feature.unlocks) {
      feature.unlocks.forEach(uid => {
        const target = catalog.find(f => f.id === uid);
        if (target && target.type === 'consumable') {
          const key = 'credits:' + uid;
          state[key] = Number(state[key] || 0) + 1;
        }
        // onetime-Features durch Bundle dauerhaft freischalten
        if (target && target.type === 'onetime') {
          if (!state[uid] || !state[uid].verified) {
            state[uid] = { verified: true, purchasedAt: new Date().toISOString(), viaBundle: featureId };
          }
        }
      });
    }

    saveLocal(state);
    return true;
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
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.GoogleBilling) {
      return window.Capacitor.Plugins.GoogleBilling.queryPurchases();
    }
    return Promise.resolve([]);
  }

  function ownedList() {
    const state = loadLocal();
    return Object.keys(state).filter(k => !k.startsWith('credits:') && state[k].verified);
  }

  function reset() { localStorage.removeItem(STORE_KEY); }

  global.PurchaseManager = { isOwned, creditsFor, useCredit, refundCredit, purchase, restore, ownedList, reset };
})(window);

