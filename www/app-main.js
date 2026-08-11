(() => {
  const $ = (id) => document.getElementById(id);
  const state = { token: localStorage.getItem('pp3d_token') || '', user: null };

  const calcFields = [
    ['rollPrice', 'Rollenpreis'],
    ['rollWeightGrams', 'Rollengewicht (g)'],
    ['usedGrams', 'Verwendete Gramm'],
    ['printHours', 'Druckzeit (h)'],
    ['electricityPerKwh', 'Strompreis/kWh'],
    ['powerWatts', 'Leistung (W)'],
    ['packaging', 'Verpackung'],
    ['shipping', 'Versand'],
    ['additional', 'Zusatzkosten'],
    ['platformFeePercent', 'Plattformgebühr %'],
    ['targetProfit', 'Gewünschter Gewinn'],
    ['targetMarginPercent', 'Gewünschte Marge %']
  ];

  function backend() {
    return (localStorage.getItem('pp3d_backend') || '').replace(/\/$/, '');
  }

  function setMessage(el, text, ok = null) {
    el.textContent = text;
    el.className = `msg ${ok === null ? 'muted' : ok ? 'ok' : 'err'}`;
  }

  async function api(path, method = 'GET', body = null) {
    const url = backend() + path;
    if (!backend()) throw new Error('Backend URL fehlt');
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
    const data = await res.json().catch(() => ({ ok: false, error: 'Ungültige Serverantwort' }));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Fehler');
    return data;
  }

  function setupCalcForm() {
    $('calcForm').innerHTML = calcFields.map(([k, l]) => `<input id="calc_${k}" type="number" step="0.01" placeholder="${l}">`).join('');
  }

  function currentSections() {
    return ['dashboardSection','calcSection','filamentsSection','printersSection','projectsSection','salesSection','ideasSection','settingsSection'];
  }

  function showTab(tab) {
    currentSections().forEach((id) => $(id).classList.add('hidden'));
    if (tab === 'dashboard') $('dashboardSection').classList.remove('hidden');
    if (tab === 'calc') $('calcSection').classList.remove('hidden');
    if (tab === 'inventory') { $('filamentsSection').classList.remove('hidden'); $('printersSection').classList.remove('hidden'); $('projectsSection').classList.remove('hidden'); }
    if (tab === 'sales') $('salesSection').classList.remove('hidden');
    if (tab === 'ideas') $('ideasSection').classList.remove('hidden');
    if (tab === 'settings') $('settingsSection').classList.remove('hidden');
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  }

  function authGuard() {
    const loggedIn = !!state.token;
    $('logoutBtn').classList.toggle('hidden', !loggedIn);
    ['dashboardSection','calcSection','filamentsSection','printersSection','projectsSection','salesSection','ideasSection']
      .forEach((id) => $(id).classList.toggle('hidden', !loggedIn));
    if (!loggedIn) showTab('settings');
  }

  function asTable(items, columns, actions = '') {
    if (!items.length) return '<p class="muted">Keine Einträge.</p>';
    const head = columns.map((c) => `<th>${c.label}</th>`).join('') + (actions ? '<th>Aktion</th>' : '');
    const rows = items.map((item) => `<tr>${columns.map((c) => `<td>${item[c.key] ?? ''}</td>`).join('')}${actions ? `<td>${actions.replaceAll('__ID__', item.id)}</td>` : ''}</tr>`).join('');
    return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  async function loadDashboard() {
    const { summary } = await api('/dashboard/summary');
    $('summary').innerHTML = `
      Umsatz: <b>${summary.revenue.toFixed(2)} €</b><br>
      Kosten: <b>${summary.cost.toFixed(2)} €</b><br>
      Gewinn: <b>${summary.profit.toFixed(2)} €</b><br>
      Verkäufe: <b>${summary.salesCount}</b><br>
      Offene Projekte: <b>${summary.openProjects}</b><br>
      Filamentbestand: <b>${summary.filamentStockGrams.toFixed(2)} g</b>
    `;
  }

  async function loadFilaments() {
    const { items } = await api('/filaments');
    $('filamentsTable').innerHTML = asTable(items, [
      { key: 'manufacturer', label: 'Hersteller' },
      { key: 'material', label: 'Material' },
      { key: 'color', label: 'Farbe' },
      { key: 'remainingWeight', label: 'Rest (g)' },
      { key: 'remainingValue', label: 'Restwert €' }
    ], '<button class="danger" onclick="window.__del(\'filaments\',\'__ID__\')">Löschen</button>');
  }

  async function loadPrinters() {
    const { items } = await api('/printers');
    $('printersTable').innerHTML = asTable(items, [
      { key: 'manufacturer', label: 'Hersteller' },
      { key: 'model', label: 'Modell' },
      { key: 'build_volume', label: 'Bauraum' },
      { key: 'powerWatts', label: 'Watt' }
    ], '<button class="danger" onclick="window.__del(\'printers\',\'__ID__\')">Löschen</button>');
  }

  async function loadProjects() {
    const { items } = await api('/projects');
    $('projectsTable').innerHTML = asTable(items, [
      { key: 'name', label: 'Projekt' },
      { key: 'status', label: 'Status' },
      { key: 'material', label: 'Material' },
      { key: 'estimatedCost', label: 'Kosten' }
    ], '<button class="danger" onclick="window.__del(\'projects\',\'__ID__\')">Löschen</button>');
  }

  async function loadSales() {
    const { items } = await api('/sales');
    $('salesTable').innerHTML = asTable(items, [
      { key: 'product', label: 'Produkt' },
      { key: 'quantity', label: 'Menge' },
      { key: 'cost', label: 'Kosten' },
      { key: 'salePrice', label: 'Preis' },
      { key: 'profit', label: 'Gewinn' }
    ], '<button class="danger" onclick="window.__del(\'sales\',\'__ID__\')">Löschen</button>');
  }

  async function loadIdeas() {
    const { items } = await api('/ideas');
    $('ideasList').innerHTML = items.length
      ? items.map((i) => `<div class="card" style="background:#21314b"><b>${i.title}</b><br><span class="muted">${i.description}</span><br>Score: ${i.score} · Status: ${i.status}<div class="row" style="margin-top:6px"><button onclick="window.__vote('${i.id}',1)">👍</button><button class="alt" onclick="window.__vote('${i.id}',-1)">👎</button></div></div>`).join('')
      : '<p class="muted">Noch keine Vorschläge.</p>';
  }

  async function refreshAll() {
    if (!state.token) return;
    await Promise.all([loadDashboard(), loadFilaments(), loadPrinters(), loadProjects(), loadSales(), loadIdeas()]);
  }

  async function login() {
    const emailOrUsername = $('loginUser').value.trim();
    const password = $('loginPass').value;
    const data = await api('/auth/login', 'POST', { emailOrUsername, password });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('pp3d_token', state.token);
    setMessage($('authMsg'), `Eingeloggt als ${state.user.username} (${state.user.role})`, true);
    authGuard();
    showTab('dashboard');
    await refreshAll();
  }

  async function register() {
    const email = $('regEmail').value.trim();
    const username = $('regUsername').value.trim();
    const password = $('regPassword').value;
    const data = await api('/auth/register', 'POST', { email, username, password });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('pp3d_token', state.token);
    setMessage($('authMsg'), `Registriert als ${state.user.username}`, true);
    $('registerSection').classList.add('hidden');
    authGuard();
    await refreshAll();
  }

  async function forgot() {
    const email = $('forgotEmail').value.trim();
    const data = await api('/auth/forgot-password', 'POST', { email });
    const tokenHint = data.resetToken ? ` Token (nur dev): ${data.resetToken}` : '';
    setMessage($('authMsg'), `Reset angefordert.${tokenHint}`, true);
  }

  async function resetPassword() {
    const token = $('resetToken').value.trim();
    const newPassword = $('newPassword').value;
    await api('/auth/reset-password', 'POST', { token, newPassword });
    setMessage($('authMsg'), 'Passwort zurückgesetzt.', true);
  }

  function logout() {
    state.token = '';
    state.user = null;
    localStorage.removeItem('pp3d_token');
    setMessage($('authMsg'), 'Abgemeldet.', null);
    authGuard();
  }

  async function saveBackend() {
    const url = $('backendUrl').value.trim().replace(/\/$/, '');
    if (url && !/^https?:\/\//i.test(url)) throw new Error('Ungültige URL');
    localStorage.setItem('pp3d_backend', url);
    setMessage($('settingsMsg'), 'Backend gespeichert.', true);
  }

  async function health() {
    const r = await fetch(`${backend()}/health`);
    const j = await r.json();
    if (!j.ok) throw new Error('Backend fehlerhaft');
    setMessage($('settingsMsg'), 'Backend erreichbar.', true);
  }

  async function calc() {
    const payload = Object.fromEntries(calcFields.map(([key]) => [key, Number($(`calc_${key}`).value || 0)]));
    const { result } = await api('/calculator/cost', 'POST', payload);
    $('calcOut').innerHTML = `
      Filament: ${result.filamentCost.toFixed(2)} €<br>
      Strom: ${result.powerCost.toFixed(2)} €<br>
      Sonstiges: ${result.extras.toFixed(2)} €<br>
      Gesamtkosten: ${result.totalCost.toFixed(2)} €<br>
      Verkaufspreis: ${result.suggestedSalePrice.toFixed(2)} €<br>
      Gewinn: ${result.profit.toFixed(2)} €<br>
      Marge: ${result.marginPercent.toFixed(2)} %
    `;
  }

  async function createFilament() {
    await api('/filaments', 'POST', {
      manufacturer: $('fManufacturer').value.trim(),
      material: $('fMaterial').value.trim(),
      color: $('fColor').value.trim(),
      spoolWeight: Number($('fSpool').value || 0),
      remainingWeight: Number($('fRemaining').value || 0),
      purchasePrice: Number($('fPrice').value || 0)
    });
    await loadFilaments();
    await loadDashboard();
  }

  async function createPrinter() {
    await api('/printers', 'POST', {
      manufacturer: $('pManufacturer').value.trim(),
      model: $('pModel').value.trim(),
      buildVolume: $('pVolume').value.trim(),
      powerWatts: Number($('pPower').value || 0)
    });
    await loadPrinters();
  }

  async function createProject() {
    await api('/projects', 'POST', {
      name: $('prName').value.trim(),
      material: $('prMaterial').value.trim(),
      status: $('prStatus').value,
      estimatedCost: Number($('prCost').value || 0)
    });
    await loadProjects();
    await loadDashboard();
  }

  async function createSale() {
    await api('/sales', 'POST', {
      product: $('sProduct').value.trim(),
      quantity: Number($('sQuantity').value || 1),
      cost: Number($('sCost').value || 0),
      salePrice: Number($('sPrice').value || 0),
      platform: $('sPlatform').value.trim()
    });
    await loadSales();
    await loadDashboard();
  }

  async function createIdea() {
    await api('/ideas', 'POST', {
      title: $('ideaTitle').value.trim(),
      description: $('ideaDescription').value.trim()
    });
    $('ideaTitle').value = '';
    $('ideaDescription').value = '';
    await loadIdeas();
  }

  window.__vote = async (id, vote) => {
    try { await api(`/ideas/${id}/vote`, 'POST', { vote }); await loadIdeas(); }
    catch (e) { alert(e.message); }
  };

  window.__del = async (name, id) => {
    if (!confirm('Wirklich löschen?')) return;
    try {
      await api(`/${name}/${id}`, 'DELETE');
      await refreshAll();
    } catch (e) {
      alert(e.message);
    }
  };

  function bind() {
    setupCalcForm();
    $('backendUrl').value = localStorage.getItem('pp3d_backend') || '';

    $('loginBtn').onclick = () => login().catch((e) => setMessage($('authMsg'), e.message, false));
    $('showRegisterBtn').onclick = () => $('registerSection').classList.toggle('hidden');
    $('showForgotBtn').onclick = () => $('forgotSection').classList.toggle('hidden');
    $('registerBtn').onclick = () => register().catch((e) => setMessage($('authMsg'), e.message, false));
    $('forgotBtn').onclick = () => forgot().catch((e) => setMessage($('authMsg'), e.message, false));
    $('resetBtn').onclick = () => resetPassword().catch((e) => setMessage($('authMsg'), e.message, false));
    $('logoutBtn').onclick = logout;

    $('saveBackendBtn').onclick = () => saveBackend().catch((e) => setMessage($('settingsMsg'), e.message, false));
    $('healthBtn').onclick = () => health().catch((e) => setMessage($('settingsMsg'), e.message, false));

    $('calcBtn').onclick = () => calc().catch((e) => setMessage($('calcOut'), e.message, false));
    $('addFilamentBtn').onclick = () => createFilament().catch((e) => alert(e.message));
    $('addPrinterBtn').onclick = () => createPrinter().catch((e) => alert(e.message));
    $('addProjectBtn').onclick = () => createProject().catch((e) => alert(e.message));
    $('addSaleBtn').onclick = () => createSale().catch((e) => alert(e.message));
    $('addIdeaBtn').onclick = () => createIdea().catch((e) => alert(e.message));

    document.querySelectorAll('nav button').forEach((btn) => {
      btn.onclick = () => showTab(btn.dataset.tab);
    });

    authGuard();
    if (state.token) {
      api('/me').then((d) => {
        state.user = d.user;
        setMessage($('authMsg'), `Eingeloggt als ${d.user.username} (${d.user.role})`, true);
        authGuard();
        return refreshAll();
      }).catch(() => logout());
    }
  }

  document.addEventListener('DOMContentLoaded', bind);
})();
