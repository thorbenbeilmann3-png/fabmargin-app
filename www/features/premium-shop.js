(function (global) {
  const USER_KEY = 'printprofit_premium_user_v1';
  const NOTICE = 'Diese App wird von einem Hobbyentwickler entwickelt. Alle Empfehlungen sind Richtwerte.';

  function backendUrl() {
    return (localStorage.getItem('fabmargin_backend_url') || '').replace(/\/$/, '');
  }

  function getUserId() {
    const existing = localStorage.getItem(USER_KEY);
    if (existing) return existing;
    const fallback = 'demo-user';
    localStorage.setItem(USER_KEY, fallback);
    return fallback;
  }

  function setUserId(userId) {
    const clean = String(userId || '').trim() || 'demo-user';
    localStorage.setItem(USER_KEY, clean);
    return clean;
  }

  async function request(path, options = {}) {
    const base = backendUrl();
    if (!base) throw new Error('Bitte zuerst Backend-URL im Admin-Bereich setzen.');
    const response = await fetch(base + path, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.error || 'Anfrage fehlgeschlagen');
    return payload;
  }

  function createCard(title, bodyHtml) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h2>${title}</h2>${bodyHtml}`;
    return card;
  }

  async function renderShop(container) {
    let products;
    try {
      products = await request('/premium/products');
    } catch (e) {
      container.innerHTML = `<p class="small" style="color:var(--red)">Premium-Shop nicht erreichbar: ${e.message}</p>`;
      return;
    }

    container.innerHTML = '';
    const userRow = createCard('🎫 Credit-System', `
      <p class="muted small">${NOTICE}</p>
      <p class="small">Kein Abonnement (außer optionaler Monatspass).</p>
      <label>Premium Benutzer-ID</label>
      <div class="row">
        <input id="premiumUserIdInput" value="${getUserId()}">
        <button class="tiny" id="premiumUserSaveBtn">Speichern</button>
      </div>
      <p id="premiumCreditInfo" class="small muted" style="margin-top:8px">Lade Credits…</p>
      <p class="small muted">Echte Zahlung wird später integriert. Admin kann Test-Credits vergeben.</p>
    `);

    const packs = createCard('🛒 Credit-Pakete', '<div id="premiumPackList"></div>');
    const pricing = createCard('💳 Premium Credit-Preise', `
      <ul class="small muted">
        ${products.featurePricing.map((item) => `<li><b>${item.name}</b>: ${item.credits} Credit${item.credits > 1 ? 's' : ''}</li>`).join('')}
      </ul>
      <p class="small"><b>Starter Pack:</b> 10 Credits + Brain freischalten → 6,99 €</p>
    `);

    const profiles = createCard('📚 Verified Print Profile', `
      <p class="small muted">Kostenlose Vorschau: Metadaten sichtbar.</p>
      <div id="premiumProfiles"></div>
      <p class="small muted">Geprüftes Ausgangsprofil – Ergebnis kann abweichen.</p>
    `);

    container.appendChild(userRow);
    container.appendChild(packs);
    container.appendChild(pricing);
    container.appendChild(profiles);

    userRow.querySelector('#premiumUserSaveBtn').onclick = () => {
      const value = userRow.querySelector('#premiumUserIdInput').value;
      setUserId(value);
      refreshCredits();
    };

    const packList = packs.querySelector('#premiumPackList');
    products.products.forEach((product) => {
      const row = document.createElement('div');
      row.className = 'feature-tile';
      row.innerHTML = `<div class="body"><h3>${product.name}</h3><p>${product.description}</p></div>
        <div style="text-align:right"><div class="price">${product.priceEur}</div>
        <button class="tiny">Kaufen</button></div>`;
      row.querySelector('button').onclick = async () => {
        try {
          await request('/premium/buy-credits', { method: 'POST', body: { userId: getUserId(), productId: product.id } });
          alert('✅ Gutschrift erfolgreich');
          refreshCredits();
        } catch (e) {
          alert('❌ ' + e.message);
        }
      };
      packList.appendChild(row);
    });

    const profileWrap = profiles.querySelector('#premiumProfiles');
    try {
      const profileData = await request('/premium/profiles');
      profileWrap.innerHTML = profileData.profiles.map((p) => `
        <div class="feature-tile">
          <div class="body">
            <h3>${p.name}</h3>
            <p class="small">Drucker: ${p.printer} · Material: ${p.material} · Version: ${p.version} · Letzte Prüfung: ${p.lastChecked}</p>
          </div>
          <div style="text-align:right">
            <button class="tiny" data-profile="${p.id}">Freischalten (3 Credits)</button>
          </div>
        </div>`).join('');

      profileWrap.querySelectorAll('button[data-profile]').forEach((btn) => {
        btn.onclick = async () => {
          try {
            const result = await request('/premium/unlock-profile', { method: 'POST', body: { userId: getUserId(), profileId: btn.dataset.profile } });
            alert('✅ Profil freigeschaltet\n\nDatei 1: ' + result.files[0].name + '\nDatei 2: ' + result.files[1].name);
            refreshCredits();
          } catch (e) {
            alert('❌ ' + e.message);
          }
        };
      });
    } catch (e) {
      profileWrap.innerHTML = `<p class="small" style="color:var(--red)">${e.message}</p>`;
    }

    refreshCredits();
  }

  async function refreshCredits() {
    const info = document.getElementById('premiumCreditInfo');
    if (!info) return;
    try {
      const data = await request(`/premium/credits?userId=${encodeURIComponent(getUserId())}`);
      const unlimited = data.unlimitedUntil ? ` · Unlimited bis ${new Date(data.unlimitedUntil).toLocaleDateString('de-DE')}` : '';
      info.textContent = `Credits: ${data.credits}${unlimited}`;
    } catch (e) {
      info.textContent = 'Credits konnten nicht geladen werden: ' + e.message;
    }
  }

  async function init() {
    const homeMain = document.querySelector('#screenHome main');
    if (!homeMain) return;
    const card = createCard('PrintProfit 3D Premium', '<div id="premiumShopRoot"><p class="muted small">Lade Premium-Bereich…</p></div>');
    homeMain.appendChild(card);
    await renderShop(card.querySelector('#premiumShopRoot'));
  }

  document.addEventListener('DOMContentLoaded', init);

  global.PremiumShop = {
    request,
    getUserId,
    setUserId,
    refreshCredits,
    notice: NOTICE
  };
})(window);
