// FabMargin 3D – Haupt-App-Logik
(function () {
  const $ = (id) => document.getElementById(id);
  const show = (id) => {
    ['screenSetup','screenLogin','screenHome','screenPrinters','screenFeature','screenAdmin','screenCommunity']
      .forEach(s => $(s).classList.toggle('hidden', s !== id));
    window.scrollTo(0,0);
  };

  function setActiveTab(tab) {
    document.querySelectorAll('nav.bottom button').forEach(button => {
      button.classList.toggle('active', button.dataset.tab === tab);
    });
  }

  let logoTapCount = 0;
  let logoTapTimer = null;
  let adminToken = null; // JWT-Session-Token nach Admin-Login

  function pwStrength(pw) {
    let s = 0;
    if (pw.length >= 12) s += 25;
    if (pw.length >= 16) s += 15;
    if (/[A-Z]/.test(pw)) s += 15;
    if (/[a-z]/.test(pw)) s += 10;
    if (/[0-9]/.test(pw)) s += 15;
    if (/[^A-Za-z0-9]/.test(pw)) s += 20;
    return Math.min(100, s);
  }

  function boot() {
    // Backend-URL im Feld vorbelegen
    const be = localStorage.getItem('fabmargin_backend_url') || '';
    if ($('adminBackend')) $('adminBackend').value = be;

    if (!window.FabVault.hasVault()) {
      show('screenSetup');
    } else {
      show('screenLogin');
      const hint = localStorage.getItem('fabmargin_hint') || '';
      if (hint) $('hintLine').textContent = 'Hinweis: ' + hint;
    }
    wireEvents();
    checkBackend();
  }

  function wireEvents() {
    // Setup
    $('setupPw').addEventListener('input', e => {
      const s = pwStrength(e.target.value);
      $('pwBar').style.width = s + '%';
      $('pwBar').style.background = s < 40 ? '#ff6b75' : s < 70 ? '#ffc35b' : '#45d483';
    });
    $('setupCreateBtn').addEventListener('click', async () => {
      const pw = $('setupPw').value, pw2 = $('setupPw2').value, hint = $('setupHint').value.trim();
      if (pw.length < 12) return alert('Passwort muss mindestens 12 Zeichen haben.');
      if (pw !== pw2) return alert('Die Passwörter stimmen nicht überein.');
      if (pwStrength(pw) < 60) if (!confirm('Das Passwort ist schwach. Trotzdem verwenden?')) return;
      try {
        await window.FabVault.createVault(pw);
        if (hint) localStorage.setItem('fabmargin_hint', hint);
        sessionStorage.setItem('__mpw', pw);
        renderHome();
        setActiveTab('home');
        show('screenHome');
      } catch (e) { alert('Fehler beim Erstellen: ' + e.message); }
    });

    // Login
    $('loginBtn').addEventListener('click', doLogin);
    $('loginPw').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    $('resetVaultBtn').addEventListener('click', () => {
      if (confirm('ALLE Daten in der App werden gelöscht. Sicher?')) {
        if (confirm('Wirklich sicher? Es gibt kein Zurück.')) {
          window.FabVault.destroyVault();
          localStorage.removeItem('fabmargin_hint');
          localStorage.removeItem('fabmargin_purchases_v1');
          location.reload();
        }
      }
    });

    // Logo-Tap für Admin (7× öffnet Admin-Bildschirm auch ohne Login)
    $('logoTap').addEventListener('click', () => {
      logoTapCount++;
      clearTimeout(logoTapTimer);
      logoTapTimer = setTimeout(() => { logoTapCount = 0; }, 2000);
      if (logoTapCount >= 7) {
        logoTapCount = 0;
        showAdminScreen();
      }
    });

    // Bottom-Nav
    document.querySelectorAll('nav.bottom button').forEach(b => {
      b.addEventListener('click', () => {
        const tab = b.dataset.tab;
        setActiveTab(tab);
        if (tab === 'home') {
          renderHome();
          show('screenHome');
        }
        else if (tab === 'printers') {
          show('screenPrinters');
          if (window.PrinterProfiles) window.PrinterProfiles.render();
          else {
            const list = document.getElementById('printerProfileList');
            if (list) {
              list.innerHTML = '<div class="card"><p class="muted">Die Drucker-Profile konnten gerade nicht geladen werden. Bitte App neu starten.</p></div>';
            }
          }
        }
        else if (tab === 'premium') {
          renderHome();
          show('screenHome');
          const premiumPanel = document.getElementById('premiumPanel');
          if (premiumPanel) premiumPanel.scrollIntoView({behavior:'smooth'});
        }
        else if (tab === 'admin') showAdminScreen();
        else if (tab === 'chat') {
          if (window.__renderComm) window.__renderComm();
          show('screenCommunity');
        }
      });
    });

    // Feature zurück
    $('featBackBtn').addEventListener('click', () => { renderHome(); setActiveTab('home'); show('screenHome'); });
    $('adminBackBtn').addEventListener('click', () => { renderHome(); setActiveTab('home'); show('screenHome'); });

    // Backend & Werkzeuge
    $('saveBackendBtn').addEventListener('click', () => {
      const url = ($('adminBackend').value || '').trim().replace(/\/$/,'');
      if (url && !/^https:\/\//i.test(url)) return alert('Nur HTTPS erlaubt.');
      localStorage.setItem('fabmargin_backend_url', url);
      $('adminBackendStatus').textContent = 'Gespeichert.';
      checkBackend();
    });
    $('testBackendBtn').addEventListener('click', checkBackend);
    $('setBackendBtn').addEventListener('click', () => show('screenAdmin'));
    $('lockNowBtn').addEventListener('click', () => {
      window.FabVault.lock();
      sessionStorage.removeItem('__mpw');
      show('screenLogin');
    });
    $('restoreBtn').addEventListener('click', async () => {
      try { await window.PurchaseManager.restore(); alert('Käufe abgefragt.'); renderHome(); }
      catch (e) { alert('Fehler: ' + e.message); }
    });

    // Passwort ändern
    $('changePwBtn').addEventListener('click', async () => {
      const o = $('oldPw').value, n1 = $('newPw1').value, n2 = $('newPw2').value;
      if (n1.length < 12) return $('changePwStatus').textContent = 'Neues Passwort zu kurz.';
      if (n1 !== n2) return $('changePwStatus').textContent = 'Neue Passwörter stimmen nicht überein.';
      try {
        await window.FabVault.changePassword(o, n1);
        sessionStorage.setItem('__mpw', n1);
        $('changePwStatus').textContent = '✅ Passwort geändert.';
        $('oldPw').value = $('newPw1').value = $('newPw2').value = '';
      } catch (e) { $('changePwStatus').textContent = '❌ ' + e.message; }
    });

    // Export & Wipe
    $('exportVaultBtn').addEventListener('click', () => {
      const blob = new Blob([localStorage.getItem('fabmargin_vault_v1') || '{}'], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'fabmargin-vault-backup.json';
      a.click();
    });
    $('wipeBtn').addEventListener('click', () => {
      if (!confirm('ALLES löschen (Tresor + Käufe + Einstellungen)?')) return;
      if (!confirm('Wirklich? Kein Zurück!')) return;
      localStorage.clear(); sessionStorage.clear(); location.reload();
    });

    // Feature zurück
    $('featBackBtn').addEventListener('click', () => { renderHome(); setActiveTab('home'); show('screenHome'); });
    $('adminBackBtn').addEventListener('click', () => { renderHome(); setActiveTab('home'); show('screenHome'); });

    // Admin-Login
    $('adminLoginBtn').addEventListener('click', adminLogin);
    $('adminLoginPw').addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });

    // Admin-Dashboard Buttons
    $('adminRefreshBtn').addEventListener('click', adminLoadDashboard);
    $('adminLogoutBtn').addEventListener('click', () => {
      adminToken = null;
      $('adminDashboard').classList.add('hidden');
      $('adminLoginBox').classList.remove('hidden');
      $('adminLoginUser').value = '';
      $('adminLoginPw').value = '';
      $('adminLoginErr').textContent = '';
    });
    $('adminPauseBtn').addEventListener('click', async () => {
      const reason = prompt('Grund für Pause (optional):') || 'Manuell pausiert';
      await adminPost('/admin/pause-purchases', { reason });
      adminLoadDashboard();
    });
    $('adminResumeBtn').addEventListener('click', async () => {
      await adminPost('/admin/resume-purchases', {});
      adminLoadDashboard();
    });
    $('adminGenCodeBtn').addEventListener('click', async () => {
      const data = await adminPost('/admin/generate-code', {});
      if (data && data.ok) {
        $('adminGeneratedCode').textContent = '✅ ' + data.code;
        navigator.clipboard && navigator.clipboard.writeText(data.code).catch(()=>{});
      }
    });
    $('adminLoadCodesBtn').addEventListener('click', adminLoadCodes);
    $('adminLoadUsersBtn').addEventListener('click', adminLoadUsers);
    $('adminLoadCommBtn').addEventListener('click', adminLoadCommunity);
    $('adminLoadLogBtn').addEventListener('click', adminLoadSecLog);
    $('adminExportBtn').addEventListener('click', adminExport);
    $('adminWipeBtn').addEventListener('click', async () => {
      if (!confirm('Server-Daten wirklich löschen? (Nutzer, Codes, Community)')) return;
      if (!confirm('Letzter Schritt – wirklich?')) return;
      await adminPost('/admin/wipe', {});
      alert('Server-Daten gelöscht.');
      adminLoadDashboard();
    });

    // Backend & Werkzeuge
    $('saveBackendBtn').addEventListener('click', () => {
      const url = ($('adminBackend').value || '').trim().replace(/\/$/,'');
      if (url && !/^https:\/\//i.test(url)) return alert('Nur HTTPS erlaubt.');
      localStorage.setItem('fabmargin_backend_url', url);
      $('adminBackendStatus').textContent = 'Gespeichert.';
      checkBackend();
    });
    $('testBackendBtn').addEventListener('click', checkBackend);
    $('setBackendBtn').addEventListener('click', () => showAdminScreen());
    $('lockNowBtn').addEventListener('click', () => {
      window.FabVault.lock();
      sessionStorage.removeItem('__mpw');
      show('screenLogin');
    });
    $('restoreBtn').addEventListener('click', async () => {
      try { await window.PurchaseManager.restore(); alert('Käufe abgefragt.'); renderHome(); }
      catch (e) { alert('Fehler: ' + e.message); }
    });

    // Passwort ändern
    $('changePwBtn').addEventListener('click', async () => {
      const o = $('oldPw').value, n1 = $('newPw1').value, n2 = $('newPw2').value;
      if (n1.length < 12) return $('changePwStatus').textContent = 'Neues Passwort zu kurz.';
      if (n1 !== n2) return $('changePwStatus').textContent = 'Neue Passwörter stimmen nicht überein.';
      try {
        await window.FabVault.changePassword(o, n1);
        sessionStorage.setItem('__mpw', n1);
        $('changePwStatus').textContent = '✅ Passwort geändert.';
        $('oldPw').value = $('newPw1').value = $('newPw2').value = '';
      } catch (e) { $('changePwStatus').textContent = '❌ ' + e.message; }
    });

    // Export & Wipe
    $('exportVaultBtn').addEventListener('click', () => {
      const blob = new Blob([localStorage.getItem('fabmargin_vault_v1') || '{}'], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'fabmargin-vault-backup.json';
      a.click();
    });
    $('wipeBtn').addEventListener('click', () => {
      if (!confirm('ALLES löschen (Tresor + Käufe + Einstellungen)?')) return;
      if (!confirm('Wirklich? Kein Zurück!')) return;
      localStorage.clear(); sessionStorage.clear(); location.reload();
    });

    // Auto-Lock-Event
    document.addEventListener('vault:locked', () => {
      sessionStorage.removeItem('__mpw');
      show('screenLogin');
    });
    wireModalEvents();
  }

  // ---- Admin-Hilfsfunktionen ----

  function showAdminScreen() {
    show('screenAdmin');
    if (adminToken) {
      $('adminLoginBox').classList.add('hidden');
      $('adminDashboard').classList.remove('hidden');
      adminLoadDashboard();
    } else {
      $('adminLoginBox').classList.remove('hidden');
      $('adminDashboard').classList.add('hidden');
    }
  }

  function adminBackendUrl() {
    return (localStorage.getItem('fabmargin_backend_url') || '').replace(/\/$/,'');
  }

  async function adminPost(path, data) {
    const base = adminBackendUrl();
    if (!base) { alert('Bitte zuerst Backend-URL eintragen.'); return null; }
    try {
      const r = await fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (adminToken || '') },
        body: JSON.stringify(data)
      });
      return await r.json();
    } catch (e) { alert('Fehler: ' + e.message); return null; }
  }

  async function adminGet(path) {
    const base = adminBackendUrl();
    if (!base) { alert('Bitte zuerst Backend-URL eintragen.'); return null; }
    try {
      const r = await fetch(base + path, {
        headers: { 'Authorization': 'Bearer ' + (adminToken || '') }
      });
      return await r.json();
    } catch (e) { alert('Fehler: ' + e.message); return null; }
  }

  async function adminLogin() {
    const user = ($('adminLoginUser').value || '').trim();
    const pw = ($('adminLoginPw').value || '');
    $('adminLoginErr').textContent = '';
    if (!user || !pw) { $('adminLoginErr').textContent = 'Benutzername und Passwort erforderlich.'; return; }
    const base = adminBackendUrl();
    if (!base) { $('adminLoginErr').textContent = 'Bitte zuerst Backend-URL in den Einstellungen eintragen.'; return; }
    try {
      const r = await fetch(base + '/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pw })
      });
      const d = await r.json();
      if (!d.ok) { $('adminLoginErr').textContent = '❌ ' + (d.error || 'Fehler'); return; }
      adminToken = d.token;
      $('adminLoginPw').value = '';
      $('adminLoginBox').classList.add('hidden');
      $('adminDashboard').classList.remove('hidden');
      adminLoadDashboard();
    } catch (e) { $('adminLoginErr').textContent = '❌ Nicht erreichbar: ' + e.message; }
  }

  async function adminLoadDashboard() {
    const d = await adminGet('/admin/dashboard');
    if (!d || !d.ok) return;
    $('statUsers').textContent = d.users;
    $('statCodes').textContent = d.unusedCodes;
    $('statComm').textContent = d.communityPending;
    $('statIncidents').textContent = d.incidents;
    const paused = d.purchasesPaused;
    $('adminPurchaseStatus').innerHTML = paused
      ? '<span style="color:var(--red)">⏸ Käufe pausiert' + (d.pauseReason ? ': ' + d.pauseReason : '') + '</span>'
      : '<span style="color:var(--green,#4caf50)">▶ Käufe aktiv</span>';
    $('adminBackend').value = localStorage.getItem('fabmargin_backend_url') || '';
  }

  async function adminLoadCodes() {
    const d = await adminGet('/admin/codes');
    if (!d || !d.ok) return;
    const box = $('adminCodesList');
    if (!d.codes.length) { box.innerHTML = '<p class="muted small">Keine Codes vorhanden.</p>'; return; }
    box.innerHTML = d.codes.map(c =>
      `<div style="padding:6px 0;border-bottom:1px solid var(--border,#333)">
        <span style="font-family:monospace;letter-spacing:1px">${c.code}</span>
        <span class="muted small" style="margin-left:8px">${c.usedBy ? '✅ genutzt von ' + c.usedBy : '🔓 frei'}</span>
      </div>`
    ).join('');
  }

  async function adminLoadUsers() {
    const d = await adminGet('/admin/users');
    if (!d || !d.ok) return;
    const box = $('adminUsersList');
    if (!d.users.length) { box.innerHTML = '<p class="muted small">Keine Nutzer registriert.</p>'; return; }
    box.innerHTML = d.users.map(u =>
      `<div style="padding:8px 0;border-bottom:1px solid var(--border,#333)">
        <div><strong>${u.username}</strong> <span class="muted small">${u.email || ''}</span>
          ${u.blocked ? '<span style="color:var(--red);margin-left:6px">🚫 Gesperrt</span>' : ''}
        </div>
        <div class="row" style="margin-top:4px">
          ${u.blocked
            ? `<button class="tiny" onclick="window.__adminUnblock('${u.username}')">Entsperren</button>`
            : `<button class="danger tiny" onclick="window.__adminBlock('${u.username}')">Sperren</button>`
          }
        </div>
      </div>`
    ).join('');
    window.__adminBlock = async (username) => {
      await adminPost('/admin/users/' + encodeURIComponent(username) + '/block', {});
      adminLoadUsers();
    };
    window.__adminUnblock = async (username) => {
      await adminPost('/admin/users/' + encodeURIComponent(username) + '/unblock', {});
      adminLoadUsers();
    };
  }

  async function adminLoadCommunity() {
    const d = await adminGet('/admin/community');
    if (!d || !d.ok) return;
    const box = $('adminCommList');
    if (!d.proposals.length) { box.innerHTML = '<p class="muted small">Keine Vorschläge vorhanden.</p>'; return; }
    const statusLabel = { pending: '⏳ Ausstehend', approved: '✅ Angenommen', rejected: '❌ Abgelehnt' };
    box.innerHTML = d.proposals.map(p =>
      `<div style="padding:8px 0;border-bottom:1px solid var(--border,#333)">
        <div><strong>${p.title}</strong> <span class="muted small">${statusLabel[p.status] || p.status}</span></div>
        <div class="muted small" style="margin:2px 0">${(p.text || '').slice(0, 120)}</div>
        ${p.status === 'pending' ? `
          <div class="row" style="margin-top:4px">
            <button class="tiny" onclick="window.__adminApprove('${p.id}')">✅ Annehmen</button>
            <button class="danger tiny" onclick="window.__adminReject('${p.id}')">❌ Ablehnen</button>
          </div>` : ''}
      </div>`
    ).join('');
    window.__adminApprove = async (id) => {
      await adminPost('/admin/community/' + id + '/approve', {});
      adminLoadCommunity();
    };
    window.__adminReject = async (id) => {
      await adminPost('/admin/community/' + id + '/reject', {});
      adminLoadCommunity();
    };
  }

  async function adminLoadSecLog() {
    const d = await adminGet('/admin/security-log');
    if (!d || !d.ok) return;
    const box = $('adminSecLog');
    if (!d.incidents.length) { box.innerHTML = '<p class="muted small">Keine Einträge.</p>'; return; }
    const sev = { info: '#4caf50', warn: '#ff9800', error: '#f44336', crit: '#e91e63' };
    box.innerHTML = d.incidents.map(i =>
      `<div style="padding:4px 0;border-bottom:1px solid var(--border,#333);font-size:.8em">
        <span style="color:${sev[i.severity]||'#aaa'}">[${i.severity.toUpperCase()}]</span>
        <span class="muted"> ${i.time ? i.time.replace('T',' ').slice(0,19) : ''}</span>
        <span> ${i.type}: ${i.detail || ''}</span>
      </div>`
    ).join('');
  }

  async function adminExport() {
    const base = adminBackendUrl();
    if (!base) { alert('Bitte Backend-URL eintragen.'); return; }
    const url = base + '/admin/export';
    try {
      const r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + (adminToken || '') } });
      if (!r.ok) { alert('Export fehlgeschlagen.'); return; }
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'fabmargin-server-export.json';
      a.click();
    } catch (e) { alert('Fehler: ' + e.message); }
  }

  async function doLogin() {
    const pw = $('loginPw').value;
    $('loginError').textContent = '';
    try {
      await window.FabVault.unlock(pw);
      sessionStorage.setItem('__mpw', pw);
      $('loginPw').value = '';
      renderHome();
      setActiveTab('home');
      show('screenHome');
    } catch (e) {
      $('loginError').textContent = 'Falsches Passwort.';
    }
  }

  function renderHome() {
    renderOwned();
    renderCreditBalance();
    renderCreditFeatures();
    renderCreditShop('creditShopList');
    renderStore();
  }

  function renderOwned() {
    const list = $('ownedList');
    const owned = window.PurchaseManager.ownedList();
    if (!owned.length) {
      list.innerHTML = '<p class="muted small">Noch keine Module freigeschaltet. Wählen Sie unten ein Modul aus.</p>';
      return;
    }
    list.innerHTML = '';
    owned.forEach(fid => {
      const f = window.FEATURE_CATALOG.find(x => x.id === fid);
      if (!f || f.id === 'feat_bundle_all') return;
      const el = document.createElement('div');
      el.className = 'feature-tile owned';
      el.innerHTML = `<div class="icon">${f.icon}</div>
        <div class="body"><h3>${f.title}</h3><p>${f.subtitle}</p></div>
        <button class="tiny">Öffnen</button>`;
      el.querySelector('button').onclick = () => openFeature(f.id);
      list.appendChild(el);
    });
  }

  function renderCreditBalance() {
    const bal = window.CreditManager ? window.CreditManager.getBalance() : 0;
    const el = $('creditBalanceNum');
    if (el) el.textContent = bal;
  }

  function renderCreditFeatures() {
    const list = $('creditFeatureList');
    if (!list || !window.CREDIT_FEATURES) return;
    list.innerHTML = '';
    const state = window.CreditManager ? window.CreditManager.getHistory() : [];
    window.CREDIT_FEATURES.forEach(f => {
      const unlocked = f.oneTime && state.some(h => h.type === 'use_feature' && h.featureId === f.id);
      const el = document.createElement('div');
      el.className = 'feature-tile';
      el.innerHTML = `<div class="icon">${f.icon}</div>
        <div class="body"><h3>${f.title}</h3><p>${f.subtitle}</p></div>
        <div style="text-align:right">
          <div class="price" style="color:var(--amber)">${f.credits} Credit${f.credits > 1 ? 's' : ''}</div>
          <button class="tiny" style="margin-top:6px">${unlocked ? '✓ Aktiv' : (f.oneTime ? 'Freischalten' : 'Nutzen')}</button>
        </div>`;
      el.querySelector('button').onclick = () => useCreditFeature(f);
      list.appendChild(el);
    });
  }

  async function useCreditFeature(f) {
    const bal = window.CreditManager ? window.CreditManager.getBalance() : 0;
    if (bal < f.credits) {
      showNoCreditsModal();
      return;
    }
    const ok = window.CreditManager.reserveCredits(f.credits);
    if (!ok) { showNoCreditsModal(); return; }
    try {
      window.CreditManager.logFeatureUse(f.id, f.credits);
      alert(`✅ ${f.icon} ${f.title} genutzt!\n${f.credits} Credit${f.credits > 1 ? 's' : ''} abgezogen.`);
      renderCreditBalance();
      renderCreditFeatures();
    } catch (e) {
      window.CreditManager.refundCredits(f.credits);
      alert('❌ Fehler: ' + e.message + '\nCredits wurden zurückerstattet.');
      renderCreditBalance();
    }
  }

  function renderCreditShop(containerId) {
    const list = $(containerId);
    if (!list || !window.CreditManager) return;
    list.innerHTML = '';
    window.CreditManager.getPackages().forEach(pkg => {
      const el = document.createElement('div');
      el.className = 'feature-tile';
      const bonusLine = pkg.bonus > 0
        ? `<div style="color:var(--green);font-weight:700;font-size:13px">🎁 ${pkg.bonus} Credits geschenkt!</div>`
        : '';
      const buyLine = pkg.bonus > 0
        ? `Kaufe ${pkg.bought} – bekomme <b>${pkg.total}</b>`
        : `${pkg.total} Credits`;
      el.innerHTML = `
        <div class="icon" style="font-size:28px">💳</div>
        <div class="body">
          <h3>${pkg.label}</h3>
          <p>${buyLine}</p>
          ${bonusLine}
        </div>
        <div style="text-align:right;min-width:72px">
          <div class="price">${pkg.price}</div>
          <button class="tiny success" style="margin-top:6px">Kaufen</button>
        </div>`;
      el.querySelector('button').onclick = () => buyCreditPackage(pkg.id, containerId);
      list.appendChild(el);
    });
  }

  async function buyCreditPackage(packageId, containerId) {
    try {
      const added = await window.CreditManager.purchasePackage(packageId);
      if (added > 0) {
        alert(`✅ ${added} Credits erfolgreich aufgeladen!`);
        renderCreditBalance();
        renderCreditFeatures();
        renderCreditShop(containerId);
        if ($('modalNoCredits') && $('modalNoCredits').style.display !== 'none') {
          renderCreditShop('modalCreditShopList');
          $('modalNoCredits').style.display = 'none';
        }
      }
    } catch (e) { alert('❌ Kauf fehlgeschlagen: ' + e.message); }
  }

  function showNoCreditsModal() {
    const modal = $('modalNoCredits');
    if (!modal) return;
    renderCreditShop('modalCreditShopList');
    modal.style.display = 'flex';
  }

  function wireModalEvents() {
    const cancelBtn = $('modalCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { $('modalNoCredits').style.display = 'none'; });
    const modal = $('modalNoCredits');
    if (modal) modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
  }

  function renderStore() {
    const list = $('storeList');
    list.innerHTML = '';
    window.FEATURE_CATALOG.forEach(f => {
      const owned = window.PurchaseManager.isOwned(f.id);
      if (f.included) {
        const el = document.createElement('div');
        el.className = 'feature-tile owned';
        el.innerHTML = `<div class="icon">${f.icon}</div>
          <div class="body"><h3>${f.title}</h3><p>${f.subtitle}</p></div>
          <div style="text-align:right"><div class="price" style="color:#8ff0b3">${f.price}</div></div>`;
        list.appendChild(el); return;
      }
      const el = document.createElement('div');
      el.className = 'feature-tile' + (owned ? ' owned' : '');
      el.innerHTML = `<div class="icon">${f.icon}</div>
        <div class="body"><h3>${f.title}</h3><p>${f.subtitle}</p></div>
        <div style="text-align:right">
          <div class="price">${f.price}</div>
          <button class="tiny" style="margin-top:6px">${owned ? '✓ Freigeschaltet' : 'Kaufen'}</button>
        </div>`;
      el.querySelector('button').onclick = () => {
        if (owned) return openFeature(f.id);
        buyFeature(f.id);
      };
      list.appendChild(el);
    });
  }

  async function buyFeature(fid) {
    try {
      const ok = await window.PurchaseManager.purchase(fid);
      if (ok) { alert('✅ Kauf erfolgreich!'); renderHome(); }
    } catch (e) { alert('❌ Kauf fehlgeschlagen: ' + e.message); }
  }

  async function openFeature(fid) {
    const f = window.FEATURE_CATALOG.find(x => x.id === fid);
    if (!f) return;
    $('featTitle').textContent = f.icon + ' ' + f.title;
    $('featContent').innerHTML = '<p class="muted">Entschlüssele Inhalt…</p>';
    show('screenFeature');
    try {
      const content = await window.ContentLoader.openFeature(fid);
      renderFeatureContent(f, content);
    } catch (e) {
      $('featContent').innerHTML = `<p style="color:var(--red)">Fehler: ${e.message}</p>`;
    }
  }

  function renderFeatureContent(feature, content) {
    const html = `
      <h2>${feature.icon} ${feature.title}</h2>
      <p class="muted">${content.description || feature.subtitle}</p>
      ${content.sections ? content.sections.map(s => `
        <div class="step"><b>${s.title}</b><br><span class="small">${s.body}</span></div>
      `).join('') : ''}
      ${content.demo ? `<div class="card" style="background:#0e1c36;margin-top:12px"><b>Demo</b><br><pre style="white-space:pre-wrap;font-size:12px">${content.demo}</pre></div>` : ''}
    `;
    $('featContent').innerHTML = html;
  }

  async function checkBackend() {
    const url = localStorage.getItem('fabmargin_backend_url') || '';
    if (!url) {
      if ($('beStatus')) $('beStatus').textContent = 'nicht eingestellt';
      if ($('beDot')) $('beDot').className = 'status-dot warn';
      return;
    }
    try {
      const r = await fetch(url + '/health', { cache: 'no-store' });
      const j = await r.json();
      if ($('beStatus')) $('beStatus').textContent = j.ok ? 'verbunden' : 'Fehler';
      if ($('beDot')) $('beDot').className = 'status-dot ' + (j.ok ? 'ok' : 'err');
      if ($('adminBackendStatus')) $('adminBackendStatus').textContent = j.ok ? '✅ Verbindung erfolgreich.' : '❌ Backend meldet Fehler.';
    } catch (e) {
      if ($('beStatus')) $('beStatus').textContent = 'nicht erreichbar';
      if ($('beDot')) $('beDot').className = 'status-dot err';
      if ($('adminBackendStatus')) $('adminBackendStatus').textContent = '❌ Nicht erreichbar: ' + e.message;
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

// ------- Erweiterung v3: Kundenlogin & Community -------
(function(){
  const $=id=>document.getElementById(id);
  document.addEventListener('DOMContentLoaded',()=>{
    if($('uActivateSwitch')) $('uActivateSwitch').onclick=()=>$('uActivateBox').classList.toggle('hidden');
    if($('uLoginBtn')) $('uLoginBtn').onclick=async()=>{
      $('uLoginErr').textContent='';
      try{await window.UserAuth.login($('uLoginUser').value.trim(),$('uLoginPw').value);
        document.getElementById('screenUserLogin').classList.add('hidden');
        document.getElementById('screenHome').classList.remove('hidden');
      }catch(e){$('uLoginErr').textContent=e.message;}
    };
    if($('uActivateBtn')) $('uActivateBtn').onclick=async()=>{
      $('uActErr').textContent='';
      try{await window.UserAuth.activate($('uCode').value.trim(),$('uNewUser').value.trim(),$('uNewPw').value,$('uEmail').value.trim());
        document.getElementById('screenUserLogin').classList.add('hidden');
        document.getElementById('screenHome').classList.remove('hidden');
      }catch(e){$('uActErr').textContent=e.message;}
    };
    if($('commBackBtn')) $('commBackBtn').onclick=()=>{
      renderHome();
      setActiveTab('home');
      show('screenHome');
    };
    if($('commPostBtn')) $('commPostBtn').onclick=async()=>{
      const t=$('commTitle').value.trim(),x=$('commText').value.trim();
      if(!t||!x) return alert('Titel und Text erforderlich');
      const r=await window.Community.post(t,x);
      if(r.ok){$('commTitle').value='';$('commText').value='';renderComm();}
      else alert(r.error||'Fehler');
    };
    // Integrity-Check beim Start
    window.Integrity&&window.Integrity.check().then(r=>{
      if(!r.ok) console.warn('Integritäts-Warnung:',r.flags);
    });
  });
  async function renderComm(){
    const el=document.getElementById('commList'); if(!el) return;
    try{const r=await window.Community.list();
      if(!r.ok||!r.items||!r.items.length){el.innerHTML='<p class="muted small">Noch keine Vorschläge.</p>';return;}
      el.innerHTML=r.items.map(i=>`<div class="feature-tile"><div class="icon">💡</div>
        <div class="body"><h3>${i.title}</h3><p>${i.text}</p><p class="small muted">${i.votes||0} Stimmen · ${i.author||'Anonym'}</p></div>
        <div><button class="tiny" onclick="Community.vote('${i.id}',1).then(()=>location.reload())">👍</button>
        <button class="tiny ghost" onclick="Community.vote('${i.id}',-1).then(()=>location.reload())">👎</button></div></div>`).join('');
    }catch(e){el.innerHTML='<p class="small" style="color:var(--red)">Fehler: '+e.message+'</p>';}
  }
  window.__renderComm=renderComm;
})();
