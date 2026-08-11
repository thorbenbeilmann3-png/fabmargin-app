(function (global) {
  const API = {
    backend() { return (localStorage.getItem('fabmargin_backend_url') || '').replace(/\/$/, ''); },
    async request(path, opts = {}) {
      const base = API.backend();
      if (!base) throw new Error('Bitte zuerst eine Backend-URL im Admin-Bereich speichern.');
      const userId = localStorage.getItem('fabmargin_user') || 'default-user';
      const headers = Object.assign({ 'Content-Type': 'application/json', 'X-Premium-User': userId }, opts.headers || {});
      const res = await fetch(base + path, Object.assign({}, opts, { headers }));
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Anfrage fehlgeschlagen');
      return data;
    }
  };

  function productHtml(product) {
    const extra = product.id === 'starter_pack_bundle'
      ? `<p class="small muted">Einzelwert: ${Number(product.valueEur || 0).toFixed(2).replace('.', ',')} € · Du sparst: ${Number(product.savingsEur || 0).toFixed(2).replace('.', ',')} €</p>`
      : '';
    return `<div class="feature-tile" data-product="${product.id}">
      <div class="icon">💎</div>
      <div class="body">
        <h3>${product.title}</h3>
        <p>${product.preview || ''}</p>
        ${extra}
      </div>
      <div style="text-align:right">
        <div class="price">${Number(product.priceEur).toFixed(2).replace('.', ',')} €</div>
        <button class="tiny" data-buy="${product.id}">Einmalig kaufen</button>
      </div>
    </div>`;
  }

  async function loadShop(el) {
    el.querySelector('#premiumProducts').innerHTML = '<p class="muted small">Lade…</p>';
    const [products, credits, profiles] = await Promise.all([
      API.request('/premium/products'),
      API.request('/premium/credits'),
      API.request('/premium/profiles')
    ]);
    el.querySelector('#premiumNotice').textContent = products.notice;
    el.querySelector('#premiumCredits').textContent = JSON.stringify(credits.credits || {});
    el.querySelector('#premiumEntitlements').textContent = JSON.stringify(credits.entitlements || {});
    el.querySelector('#premiumProducts').innerHTML = products.products.map(productHtml).join('');
    el.querySelector('#premiumProfiles').innerHTML = (profiles.profiles || []).map(p => `<div class="step">
      <b>${p.profileId}</b><br>
      <span class="small">${p.printer} · ${p.material} · ${p.nozzle} · ${p.slicer} · v${p.version}</span><br>
      <span class="small muted">Letzte Prüfung: ${p.lastCheckedAt} · Enthalten: ${(p.includes || []).join(', ')}</span>
    </div>`).join('');
  }

  async function buyProduct(productId, outputEl) {
    outputEl.textContent = 'Sende Kaufanfrage…';
    const result = await API.request('/premium/purchase', {
      method: 'POST',
      body: JSON.stringify({ productId })
    });
    outputEl.textContent = result.message || 'Kauf vorgemerkt. Admin vergibt Credits.';
  }

  function render() {
    return `<h2>🛒 PrintProfit Premium Shop</h2>
      <p class="muted small">Keine versteckten Kosten, kein Abo, keine Tricks. Jede Premium-Funktion zeigt vorab eine kostenlose Vorschau.</p>
      <p class="small"><b>Hinweis:</b> <span id="premiumNotice">Lade…</span></p>
      <div class="step small"><b>Credits:</b> <code id="premiumCredits">{}</code><br><b>Freischaltungen:</b> <code id="premiumEntitlements">{}</code></div>
      <div id="premiumProducts"></div>
      <div class="warn small">Starter Pack: alles für den ersten optimierten und wirtschaftlich geprüften Druck. Darunter gilt immer: <b>Kein Abonnement.</b></div>
      <h3>📦 Verified Profile Vorschau</h3>
      <div id="premiumProfiles"></div>
      <div id="premiumShopStatus" class="small muted" style="margin-top:8px"></div>`;
  }

  function bind(el) {
    loadShop(el).catch(e => { el.querySelector('#premiumShopStatus').textContent = e.message; });
    el.addEventListener('click', (event) => {
      const buy = event.target.closest('[data-buy]');
      if (!buy) return;
      buyProduct(buy.dataset.buy, el.querySelector('#premiumShopStatus'))
        .then(() => loadShop(el))
        .catch(err => { el.querySelector('#premiumShopStatus').textContent = err.message; });
    });
  }

  global.PremiumApi = API;
  global.PremiumShop = { render, bind, loadShop };
})(window);
