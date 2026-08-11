// FabMargin 3D – Credit-Manager
// Credits verfallen nie. Kein automatisches Abo.
(function (global) {
  const CREDIT_KEY = 'fabmargin_credits_v1';

  // Credit-Pakete: Je mehr kaufen = desto mehr geschenkt
  const CREDIT_PACKAGES = [
    { id: 'credits_starter', label: 'Starter',  price: '2,49 €',   priceNum: 2.49,  bought:    3, bonus:    0, total:    3 },
    { id: 'credits_small',   label: 'Small',    price: '6,99 €',   priceNum: 6.99,  bought:   10, bonus:    2, total:   12 },
    { id: 'credits_medium',  label: 'Medium',   price: '14,99 €',  priceNum: 14.99, bought:   25, bonus:    5, total:   30 },
    { id: 'credits_large',   label: 'Large',    price: '24,99 €',  priceNum: 24.99, bought:   50, bonus:   15, total:   65 },
    { id: 'credits_pro',     label: 'Pro',      price: '39,99 €',  priceNum: 39.99, bought:  100, bonus:   40, total:  140 },
    { id: 'credits_mega',    label: 'Mega',     price: '149,99 €', priceNum: 149.99,bought:  500, bonus:  250, total:  750 },
    { id: 'credits_ultra',   label: 'Ultra',    price: '249,99 €', priceNum: 249.99,bought: 1000, bonus:  600, total: 1600 }
  ];

  function loadState() {
    try { return JSON.parse(localStorage.getItem(CREDIT_KEY)) || { balance: 0, history: [] }; }
    catch { return { balance: 0, history: [] }; }
  }

  function saveState(state) {
    localStorage.setItem(CREDIT_KEY, JSON.stringify(state));
  }

  function getBalance() {
    return loadState().balance || 0;
  }

  // Reserves credits before using them; returns true if enough balance
  function reserveCredits(amount) {
    const state = loadState();
    if ((state.balance || 0) < amount) return false;
    state.balance -= amount;
    state.history = state.history || [];
    state.history.push({ type: 'use', amount, at: new Date().toISOString() });
    saveState(state);
    return true;
  }

  // Refunds credits (used on technical error)
  function refundCredits(amount) {
    const state = loadState();
    state.balance = (state.balance || 0) + amount;
    state.history = state.history || [];
    state.history.push({ type: 'refund', amount, at: new Date().toISOString() });
    saveState(state);
  }

  // Add credits (called after successful purchase)
  function addCredits(amount, packageId) {
    const state = loadState();
    state.balance = (state.balance || 0) + amount;
    state.history = state.history || [];
    state.history.push({ type: 'purchase', amount, packageId, at: new Date().toISOString() });
    saveState(state);
  }

  async function purchasePackage(packageId) {
    const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
    if (!pkg) throw new Error('Unbekanntes Paket');

    // Native Google Play Billing (falls in Android-App)
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.GoogleBilling) {
      const result = await window.Capacitor.Plugins.GoogleBilling.purchase({ sku: pkg.id });
      if (!result || !result.purchaseToken) throw new Error('Kauf abgebrochen');
      const backend = localStorage.getItem('fabmargin_backend_url') || '';
      if (backend) {
        try {
          const res = await fetch(backend + '/purchase/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku: pkg.id, purchaseToken: result.purchaseToken })
          });
          const j = await res.json();
          if (!j.ok) throw new Error(j.error || 'Verifikation fehlgeschlagen');
        } catch (e) {
          throw new Error('Verifikation fehlgeschlagen: ' + e.message);
        }
      }
      addCredits(pkg.total, pkg.id);
      return pkg.total;
    }

    // Fallback (Web-Vorschau)
    const label = pkg.bonus > 0
      ? `${pkg.label}: Kaufe ${pkg.bought} – bekomme ${pkg.total} (🎁 ${pkg.bonus} gratis)\nPreis: ${pkg.price}`
      : `${pkg.label}: ${pkg.total} Credits\nPreis: ${pkg.price}`;
    if (confirm(`[Nur Vorschau ohne Play Store]\n\n${label}\n\nJetzt kaufen?`)) {
      addCredits(pkg.total, pkg.id);
      return pkg.total;
    }
    return 0;
  }

  function getHistory() {
    return loadState().history || [];
  }

  function logFeatureUse(featureId, credits) {
    const state = loadState();
    state.history = state.history || [];
    state.history.push({ type: 'use_feature', featureId, credits, at: new Date().toISOString() });
    saveState(state);
  }

  function getPackages() { return CREDIT_PACKAGES; }

  function reset() { localStorage.removeItem(CREDIT_KEY); }

  global.CreditManager = { getBalance, getHistory, reserveCredits, refundCredits, addCredits, logFeatureUse, purchasePackage, getPackages, reset };
})(window);
