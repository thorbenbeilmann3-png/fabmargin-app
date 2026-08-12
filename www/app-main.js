// FabMargin 3D – Haupt-App-Logik
(function () {
  const $ = (id) => document.getElementById(id);
  const SCREEN_IDS = ['screenSetup','screenLogin','screenHome','screenPrinters','screenFeature','screenAdmin','screenUserLogin','screenCommunity','screenLegal','screenBeta'];
  const DISCLAIMER_KEY = 'fabmargin_disclaimer_v1';
  const SPLASH_DELAY_MS = 900;
  let lastMainScreen = 'screenHome';
  const show = (id) => {
    SCREEN_IDS.forEach(s => $(s).classList.toggle('hidden', s !== id));
    if (['screenHome', 'screenAdmin', 'screenCommunity'].includes(id)) lastMainScreen = id;
    window.scrollTo(0,0);
  };

  const setActiveTab = (tab) => {
    document.querySelectorAll('nav.bottom button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  };

  const scrollToBlock = (id) => {
    const el = $(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openLegalScreen = () => {
    show('screenLegal');
    setActiveTab('');
  };

  const updateDisclaimerOverlay = () => {
    const overlay = $('disclaimerOverlay');
    if (!overlay) return;
    overlay.classList.toggle('hidden', localStorage.getItem(DISCLAIMER_KEY) === 'accepted');
  };

  const finishSplash = () => {
    const splash = $('splashScreen');
    if (splash) splash.classList.add('hidden');
  };

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
  window.__fabPwStrength = pwStrength;

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
    updateDisclaimerOverlay();
  }

  function wireEvents() {
    if (wireEvents.done) return;
    wireEvents.done = true;
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
        if (window.FabVault.isUnlocked()) {
          setActiveTab('admin');
          showAdminScreen();
        } else alert('Bitte zuerst die App entsperren.');
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
          scrollToBlock('premiumCard');
        }
        else if (tab === 'admin') showAdminScreen();
        else if (tab === 'chat') {
          show('screenCommunity');
          if (window.__renderComm) window.__renderComm();
          if (window.__renderSupportChat) window.__renderSupportChat();
        }
      });
    });

    // Feature zurück
    $('featBackBtn').addEventListener('click', () => { renderHome(); setActiveTab('home'); show('screenHome'); });
    $('adminBackBtn').addEventListener('click', () => { renderHome(); setActiveTab('home'); show('screenHome'); });
    $('commBackBtn').addEventListener('click', () => { renderHome(); setActiveTab('home'); show('screenHome'); });
    $('legalBackBtn').addEventListener('click', () => { setActiveTab(lastMainScreen === 'screenAdmin' ? 'admin' : lastMainScreen === 'screenCommunity' ? 'chat' : 'home'); show(lastMainScreen); });
    $('legalOpenBtn').addEventListener('click', openLegalScreen);
    $('adminLegalOpenBtn').addEventListener('click', openLegalScreen);
    if ($('footerLegalBtn')) $('footerLegalBtn').addEventListener('click', openLegalScreen);

    // Admin-Login
    $('adminLoginBtn').addEventListener('click', adminLogin);
    $('adminLoginPw').addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });

    // Admin-Dashboard Buttons
    $('adminRefreshBtn').addEventListener('click', adminLoadDashboard);
    $('adminLogoutBtn').addEventListener('click', () => {
      adminToken = null;
      window.__getAdminToken = () => null;
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
    $('setBackendBtn').addEventListener('click', () => { setActiveTab('admin'); showAdminScreen(); });
    $('lockNowBtn').addEventListener('click', () => {
      window.FabVault.lock();
      sessionStorage.removeItem('__mpw');
      setActiveTab('home');
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
      setActiveTab('home');
      show('screenLogin');
    });

    $('disclaimerAccept').addEventListener('change', e => {
      $('disclaimerContinueBtn').disabled = !e.target.checked;
    });
    $('disclaimerContinueBtn').addEventListener('click', () => {
      localStorage.setItem(DISCLAIMER_KEY, 'accepted');
      $('disclaimerAccept').checked = false;
      $('disclaimerContinueBtn').disabled = true;
      updateDisclaimerOverlay();
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
      window.__getAdminToken = () => adminToken;
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
    if ($('statPartners')) $('statPartners').textContent = d.partnerPending || 0;
    const paused = d.purchasesPaused;
    $('adminPurchaseStatus').innerHTML = paused
      ? '<span style="color:var(--red)">⏸ Käufe pausiert' + (d.pauseReason ? ': ' + d.pauseReason : '') + '</span>'
      : '<span style="color:var(--green,#4caf50)">▶ Käufe aktiv</span>';
    $('adminBackend').value = localStorage.getItem('fabmargin_backend_url') || '';
    if (window.Part7 && typeof window.Part7.refreshAdmin === 'function') window.Part7.refreshAdmin(d);
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

  function renderUserProfile() {
    const card = $('userProfileCard');
    if (!card) return;
    const user = window.UserAuth && window.UserAuth.current();
    if (user && user.username) {
      card.classList.remove('hidden');
      const nameEl = $('userProfileName');
      const emailEl = $('userProfileEmail');
      if (nameEl) nameEl.textContent = user.username;
      if (emailEl && user.email) emailEl.textContent = user.email;
      const modsEl = $('userPurchasedModules');
      if (modsEl) {
        const owned = window.PurchaseManager ? window.PurchaseManager.ownedList() : [];
        if (owned.length) {
          modsEl.innerHTML = '<p class="muted small"><strong>Gekaufte Module:</strong></p>' +
            owned.filter(id => id !== 'feat_bundle_all').map(id => {
              const f = window.FEATURE_CATALOG ? window.FEATURE_CATALOG.find(x => x.id === id) : null;
              return f ? `<span style="margin-right:6px">${f.icon} ${f.title}</span>` : '';
            }).join('');
        } else {
          modsEl.innerHTML = '<p class="muted small">Noch keine Module gekauft.</p>';
        }
      }
    } else {
      card.classList.add('hidden');
    }
  }

  function renderHome() {
    renderUserProfile();
    renderOwned();
    renderCreditBalance();
    renderCreditFeatures();
    renderCreditShop('creditShopList');
    renderStore();
    if (window.Part7 && typeof window.Part7.refreshHome === 'function') window.Part7.refreshHome();
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
          <div style="text-align:right"><div class="price" style="color:var(--green)">${f.price}</div></div>`;
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
      ${content.demo ? `<div class="card" style="background:#161616;margin-top:12px"><b>Demo</b><br><pre style="white-space:pre-wrap;font-size:12px">${content.demo}</pre></div>` : ''}
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

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      if (window.BetaSystem && typeof window.BetaSystem.checkBetaToken === 'function' && window.BetaSystem.checkBetaToken()) {
        finishSplash();
        return;
      }
      boot();
      finishSplash();
    }, SPLASH_DELAY_MS);
  });
})();

// ------- Erweiterung v4: Beta-Tester + Anti-Piracy Admin-Panel -------
(function(){
  const $=id=>document.getElementById(id);
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  function getAdminToken(){
    return typeof window.__getAdminToken==='function'?window.__getAdminToken():null;
  }
  function getBase(){ return (localStorage.getItem('fabmargin_backend_url')||'').replace(/\/$/,''); }

  async function betaPost(path,data){
    const base=getBase(); if(!base){alert('Bitte Backend-URL eintragen.');return null;}
    const tk=getAdminToken();
    try{
      const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(tk||'')},body:JSON.stringify(data)});
      return await r.json();
    }catch(e){alert('Fehler: '+e.message);return null;}
  }
  async function betaGet(path){
    const base=getBase(); if(!base){alert('Bitte Backend-URL eintragen.');return null;}
    const tk=getAdminToken();
    try{
      const r=await fetch(base+path,{headers:{'Authorization':'Bearer '+(tk||'')}});
      return await r.json();
    }catch(e){alert('Fehler: '+e.message);return null;}
  }

  async function adminBetaInvite(){
    const name=($('betaInviteName').value||'').trim();
    const email=($('betaInviteEmail').value||'').trim();
    if(!name||!email){alert('Name und E-Mail erforderlich.');return;}
    const d=await betaPost('/admin/beta/invite',{name,email});
    if(!d||!d.ok){alert('Fehler: '+(d&&d.error||'Unbekannt'));return;}
    // Zeige generischen Link (App-URL + ?token=...)
    const fullLink=location.origin+location.pathname+'?token='+d.token;
    const linkDiv=$('betaGeneratedLink');
    const linkText=$('betaLinkText');
    if(linkDiv&&linkText){
      linkText.textContent=fullLink;
      linkDiv.style.display='block';
    }
    $('betaInviteName').value='';
    $('betaInviteEmail').value='';
  }

  async function adminBetaLoadList(){
    const d=await betaGet('/admin/beta/list');
    if(!d||!d.ok) return;
    const box=$('betaTesterList');
    if(!d.invites.length){box.innerHTML='<p class="muted small">Keine Beta-Einladungen.</p>';return;}
    box.innerHTML='';
    const statusColor={offen:'#ffc35b',aktiv:'#45d483',abgelaufen:'#a9b8d4',widerrufen:'#ff6b75'};
    d.invites.forEach(inv=>{
      const div=document.createElement('div');
      div.style.cssText='padding:8px 0;border-bottom:1px solid var(--line,#333)';
      div.innerHTML=`<div><strong>${esc(inv.name)}</strong> <span class="muted small">&lt;${esc(inv.email)}&gt;</span>
          <span style="color:${statusColor[inv.status]||'#aaa'};margin-left:6px;font-size:12px">● ${esc(inv.status)}</span>
        </div>
        <div class="muted small">Erstellt: ${esc((inv.createdAt||'').slice(0,10))} · Läuft ab: ${esc((inv.expiresAt||'').slice(0,10))}</div>
        ${inv.usedBy?`<div class="muted small">Aktiviert von: ${esc(inv.usedBy)}</div>`:''}`;
      if(!inv.revoked&&!inv.usedAt){
        const btn=document.createElement('button');
        btn.className='danger tiny'; btn.style.marginTop='4px'; btn.textContent='Widerrufen';
        btn.onclick=()=>{
          if(!confirm('Einladung widerrufen?')) return;
          betaPost('/admin/beta/revoke/'+encodeURIComponent(inv.token),{}).then(()=>adminBetaLoadList());
        };
        div.appendChild(btn);
      }
      box.appendChild(div);
    });
  }

  async function adminInstancesLoad(){
    const d=await betaGet('/admin/instances');
    if(!d||!d.ok) return;
    const box=$('instancesList');
    if(!d.instances.length){box.innerHTML='<p class="muted small">Keine Instanzen registriert.</p>';return;}
    box.innerHTML='';
    d.instances.forEach(inst=>{
      const div=document.createElement('div');
      div.style.cssText='padding:8px 0;border-bottom:1px solid var(--line,#333)';
      div.innerHTML=`<div class="muted small" style="font-family:monospace">${esc(inst.instanceId)}</div>
        <div class="small">${esc(String(inst.ips.length))} IP(s): ${esc(inst.ips.join(', '))}</div>
        ${inst.blockedAt?`<div style="color:var(--red)">🚫 Gesperrt: ${esc(inst.blockReason||'')}</div>`:'<span style="color:var(--green)">✅ Aktiv</span>'}`;
      if(inst.blockedAt){
        const btn=document.createElement('button');
        btn.className='tiny'; btn.style.marginTop='4px'; btn.textContent='Entsperren';
        btn.onclick=()=>{ betaPost('/admin/instances/'+encodeURIComponent(inst.instanceId)+'/unblock',{}).then(()=>adminInstancesLoad()); };
        div.appendChild(btn);
      }
      box.appendChild(div);
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    if($('betaInviteBtn')) $('betaInviteBtn').addEventListener('click',adminBetaInvite);
    if($('betaCopyLinkBtn')) $('betaCopyLinkBtn').addEventListener('click',()=>{
      const txt=$('betaLinkText');
      if(txt&&navigator.clipboard) navigator.clipboard.writeText(txt.textContent).then(()=>alert('Link kopiert!')).catch(()=>{});
    });
    if($('betaLoadListBtn')) $('betaLoadListBtn').addEventListener('click',adminBetaLoadList);
    if($('instancesLoadBtn')) $('instancesLoadBtn').addEventListener('click',adminInstancesLoad);
  });
})();
(function(){
  const $=id=>document.getElementById(id);
  document.addEventListener('DOMContentLoaded',()=>{
    // Umschalten zwischen Login und Registrierung
    if($('uRegisterSwitch')) $('uRegisterSwitch').onclick=()=>{
      $('uLoginBox').classList.add('hidden');
      $('uRegisterBox').classList.remove('hidden');
    };
    if($('uLoginSwitch')) $('uLoginSwitch').onclick=()=>{
      $('uRegisterBox').classList.add('hidden');
      $('uLoginBox').classList.remove('hidden');
    };
    // Rückwärtskompatibilität: alter Aktivierungs-Button-Alias
    if($('uActivateSwitch')) $('uActivateSwitch').onclick=()=>{
      $('uLoginBox')&&$('uLoginBox').classList.add('hidden');
      $('uRegisterBox')&&$('uRegisterBox').classList.remove('hidden');
    };
    if($('uLoginBtn')) $('uLoginBtn').onclick=async()=>{
      $('uLoginErr').textContent='';
      try{await window.UserAuth.login($('uLoginUser').value.trim(),$('uLoginPw').value,$('uLoginTotp').value.trim());
        document.getElementById('screenUserLogin').classList.add('hidden');
        document.getElementById('userProfileCard')&&document.getElementById('userProfileCard').classList.remove('hidden');
        document.getElementById('screenHome').classList.remove('hidden');
        window.Part7&&window.Part7.refreshHome&&window.Part7.refreshHome();
      }catch(e){$('uLoginErr').textContent=e.message;}
    };
    if($('uActivateBtn')) $('uActivateBtn').onclick=async()=>{
      $('uActErr').textContent='';
      $('uActErr').style.color='var(--red)';
      const strength = window.__fabPwStrength ? window.__fabPwStrength($('uNewPw').value || '') : 0;
      if (strength < 40 && !confirm('Das Passwort ist schwach. Trotzdem verwenden?')) return;
      try{await window.UserAuth.register($('uNewUser').value.trim(),$('uEmail').value.trim(),$('uNewPw').value,$('uCode').value.trim());
        document.getElementById('screenUserLogin').classList.add('hidden');
        document.getElementById('userProfileCard')&&document.getElementById('userProfileCard').classList.remove('hidden');
        document.getElementById('screenHome').classList.remove('hidden');
        window.Part7&&window.Part7.refreshHome&&window.Part7.refreshHome();
      }catch(e){$('uActErr').textContent=e.message;}
    };
    if($('userLogoutBtn')) $('userLogoutBtn').onclick=async()=>{
      await window.UserAuth.logout();
      const card=document.getElementById('userProfileCard');
      if(card) card.classList.add('hidden');
      window.Part7&&window.Part7.refreshHome&&window.Part7.refreshHome();
    };
    if($('commBackBtn')) $('commBackBtn').onclick=()=>{
      const homeBtn = document.querySelector('nav.bottom button[data-tab="home"]');
      if (homeBtn) homeBtn.click();
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

// ------- Support-Chat -------
(function(){
  const STORAGE_KEY = 'fabmargin_support_chat';
  const BOT_NAME = 'Support-Bot';
  const CONTACT_EMAIL = 'app.github.uncorrupt873@passmail.net';

  function loadMessages() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e) { return []; }
  }

  function saveMessages(msgs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
  }

  function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function getBotResponse(text) {
    const t = text.toLowerCase();
    if (t.includes('drucker') || t.includes('profil') || t.includes('printer')) {
      return '🖨️ Fragen zu Drucker-Profilen? Schau im Drucker-Tab – dort findest du alle 25 Profile und kannst eigene anpassen!';
    }
    if (t.includes('credit') || t.includes('premium') || t.includes('guthaben') || t.includes('abo')) {
      return '⭐ Credits & Premium: Im Premium-Tab kannst du Credits kaufen und Premium-Funktionen freischalten. Credits werden pro Nutzung abgezogen.';
    }
    if (t.includes('kauf') || t.includes('bezahl') || t.includes('preis') || t.includes('kosten') || t.includes('zahlung')) {
      return '💳 Käufe & Bezahlung: Alle Käufe laufen sicher über unsere App. Bei Fragen oder Problemen schreib uns direkt an: ' + CONTACT_EMAIL;
    }
    return '👋 Danke für deine Nachricht! Unser Team meldet sich bald. Bei dringenden Fragen erreichst du uns unter: ' + CONTACT_EMAIL;
  }

  function renderChat() {
    const el = document.getElementById('supportMessages');
    if (!el) return;
    const msgs = loadMessages();
    if (!msgs.length) {
      el.innerHTML = '<p class="muted small" style="text-align:center;padding:16px 0">Noch keine Nachrichten. Schreib uns – wir helfen gerne! 👋</p>';
      return;
    }
    el.innerHTML = msgs.map(m => {
      const isUser = m.role === 'user';
      return `<div style="display:flex;flex-direction:column;align-items:${isUser ? 'flex-end' : 'flex-start'}">
        <div style="max-width:80%;background:${isUser ? 'var(--accent,#2563eb)' : 'var(--panel,#1a1f2e)'};color:${isUser ? '#fff' : 'inherit'};border-radius:${isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};padding:8px 12px;font-size:14px">${escapeHtml(m.text)}</div>
        <span class="small muted" style="font-size:11px;margin:2px 4px">${isUser ? 'Du' : BOT_NAME} · ${formatTime(m.ts)}</span>
      </div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  async function sendMessage(text) {
    const msgs = loadMessages();
    const ts = new Date().toISOString();
    msgs.push({ role: 'user', text, ts });
    saveMessages(msgs);
    renderChat();

    // Versuche Backend
    const backendUrl = localStorage.getItem('fabmargin_backend_url') || '';
    if (backendUrl) {
      try {
        await fetch(backendUrl + '/support/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, ts })
        });
      } catch(e) { /* ignorieren – lokal gespeichert */ }
    }

    // Bot-Antwort
    setTimeout(() => {
      const msgs2 = loadMessages();
      msgs2.push({ role: 'bot', text: getBotResponse(text), ts: new Date().toISOString() });
      saveMessages(msgs2);
      renderChat();
    }, 600);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('supportSendBtn');
    const input = document.getElementById('supportInput');
    const clearBtn = document.getElementById('supportClearBtn');
    const adminRefreshBtn = document.getElementById('adminSupportRefreshBtn');

    if (sendBtn && input) {
      const doSend = () => {
        const t = input.value.trim();
        if (!t) return;
        input.value = '';
        sendMessage(t);
      };
      sendBtn.onclick = doSend;
      input.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
    }

    if (clearBtn) {
      clearBtn.onclick = () => {
        if (confirm('Chat-Verlauf löschen?')) {
          localStorage.removeItem(STORAGE_KEY);
          renderChat();
        }
      };
    }

    if (adminRefreshBtn) {
      adminRefreshBtn.onclick = loadAdminSupportMessages;
    }

    renderChat();
  });

  async function loadAdminSupportMessages() {
    const el = document.getElementById('adminSupportList');
    if (!el) return;
    const backendUrl = localStorage.getItem('fabmargin_backend_url') || '';
    if (!backendUrl) {
      el.innerHTML = '<p class="muted small">Kein Backend eingestellt.</p>';
      return;
    }
    try {
      const adminToken = typeof window.__getAdminToken === 'function' ? window.__getAdminToken() : '';
      const user = window.UserAuth && window.UserAuth.current ? window.UserAuth.current() : null;
      const authToken = adminToken || (user && user.token) || '';
      const r = await fetch(backendUrl + '/support/messages', {
        headers: authToken ? { Authorization: 'Bearer ' + authToken } : {}
      });
      const j = await r.json();
      if (!j.messages || !j.messages.length) {
        el.innerHTML = '<p class="muted small">Keine Support-Nachrichten vorhanden.</p>';
        return;
      }
      el.innerHTML = j.messages.map(m =>
        `<div class="step" style="margin-bottom:6px"><span class="small muted">${new Date(m.ts).toLocaleString('de-DE')}</span><br>${escapeHtml(m.text)}</div>`
      ).join('');
    } catch(e) {
      el.innerHTML = '<p class="small" style="color:var(--red)">Fehler: ' + escapeHtml(e.message) + '</p>';
    }
  }

  window.__renderSupportChat = renderChat;
})();

// ------- Teil 7: Passwort-Generator, Slicer-Marktplatz, Operator, Diagnostics, CMS -------
(function(){
  const USER_KEY = 'fabmargin_user_v1';
  const DIAG_SENT_KEY = 'fabmargin_diag_sent_v1';
  const PROFILE_POINT_COST = 40;
  const $ = id => document.getElementById(id);
  let cachedProfile = null;
  let selectedImages = [];
  let jsErrorCount = 0;

  function esc(s){
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function backend(){
    return (localStorage.getItem('fabmargin_backend_url') || '').replace(/\/$/,'');
  }
  function currentUser(){
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  }
  function saveCurrentUserPatch(patch){
    const user = currentUser();
    if (!user) return;
    localStorage.setItem(USER_KEY, JSON.stringify({ ...user, ...patch }));
  }
  function adminToken(){
    return typeof window.__getAdminToken === 'function' ? window.__getAdminToken() : '';
  }
  function userToken(){
    const user = currentUser();
    return user && user.token ? user.token : '';
  }
  async function api(path, { method = 'GET', body = null, auth = 'none' } = {}) {
    const base = backend();
    if (!base) throw new Error('Backend nicht eingestellt');
    const headers = {};
    if (body !== null) headers['Content-Type'] = 'application/json';
    const token = auth === 'admin' ? adminToken() : auth === 'user' ? userToken() : auth === 'adminOrUser' ? (adminToken() || userToken()) : '';
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(base + path, { method, headers, body: body !== null ? JSON.stringify(body) : null });
    const json = await response.json();
    if (!json.ok) throw new Error(json.error || 'Anfrage fehlgeschlagen');
    return json;
  }
  function passwordLabel(score){
    return score < 40 ? ['schwach', 'var(--red)'] : score < 70 ? ['mittel', 'var(--amber)'] : ['stark', 'var(--green)'];
  }
  function secureRandom(max){
    if (!max || max < 1) return 0;
    const limit = Math.floor(0x100000000 / max) * max;
    const array = new Uint32Array(1);
    do { window.crypto.getRandomValues(array); } while (array[0] >= limit);
    return array[0] % max;
  }
  function isSafeImageSrc(value){
    return /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(String(value || ''));
  }
  function generatePassword(length = 18){
    const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*()-_=+[]{}:,.?'];
    const all = sets.join('');
    const chars = sets.map(set => set[secureRandom(set.length)]);
    while (chars.length < length) chars.push(all[secureRandom(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) {
      const j = secureRandom(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }
  function updateRegisterPasswordUI() {
    const input = $('uNewPw');
    const bar = $('uPwBar');
    const text = $('uPwStrengthText');
    if (!input || !bar || !text) return;
    const score = window.__fabPwStrength ? window.__fabPwStrength(input.value || '') : 0;
    const [label, color] = passwordLabel(score);
    bar.style.width = score + '%';
    bar.style.background = color;
    text.textContent = 'Stärke: ' + (input.value ? label : '–');
    text.style.color = input.value ? color : 'var(--muted)';
  }
  async function copyToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
  }
  function bindPasswordGenerator() {
    if ($('uNewPw')) $('uNewPw').addEventListener('input', updateRegisterPasswordUI);
    if ($('uGeneratePwBtn')) $('uGeneratePwBtn').addEventListener('click', async () => {
      const pw = generatePassword(18);
      $('uNewPw').value = pw;
      updateRegisterPasswordUI();
      try { await copyToClipboard(pw); } catch {}
      $('uActErr').style.color = 'var(--green)';
      $('uActErr').textContent = 'Starkes Passwort erzeugt und in die Zwischenablage kopiert.';
    });
    if ($('uCopyPwBtn')) $('uCopyPwBtn').addEventListener('click', async () => {
      try {
        await copyToClipboard(($('uNewPw').value || '').trim());
        $('uActErr').style.color = 'var(--green)';
        $('uActErr').textContent = 'Passwort kopiert.';
      } catch (e) {
        $('uActErr').style.color = 'var(--red)';
        $('uActErr').textContent = 'Kopieren fehlgeschlagen: ' + e.message;
      }
    });
    if ($('uTogglePwBtn')) $('uTogglePwBtn').addEventListener('click', () => {
      const input = $('uNewPw');
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      $('uTogglePwBtn').textContent = input.type === 'password' ? '👁️' : '🙈';
    });
    updateRegisterPasswordUI();
  }
  async function fileToDataUrl(file){
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
      reader.readAsDataURL(file);
    });
  }
  async function handleImageSelection(){
    const input = $('slicerImages');
    const preview = $('slicerImagePreview');
    if (!input || !preview) return;
    const files = Array.from(input.files || []);
    if (files.length > 5) {
      input.value = '';
      selectedImages = [];
      preview.innerHTML = '';
      throw new Error('Maximal 5 Bilder pro Profil erlaubt');
    }
    for (const file of files) {
      if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Nur JPG und PNG sind erlaubt');
      if (file.size > 5 * 1024 * 1024) throw new Error(`"${file.name}" ist größer als 5MB`);
    }
    selectedImages = await Promise.all(files.map(fileToDataUrl));
    renderSelectedImages();
  }
  function renderSelectedImages() {
    const preview = $('slicerImagePreview');
    if (!preview) return;
    preview.innerHTML = selectedImages.filter(isSafeImageSrc).map((src, index) => `
      <div class="gallery-item">
        <img src="${src}" alt="Vorschau">
        <button type="button" class="danger tiny" data-remove-selected-image="${index}">✕</button>
      </div>
    `).join('');
    preview.querySelectorAll('button[data-remove-selected-image]').forEach(btn => {
      btn.onclick = () => {
        selectedImages.splice(Number(btn.dataset.removeSelectedImage), 1);
        const input = $('slicerImages');
        if (input && !selectedImages.length) input.value = '';
        renderSelectedImages();
      };
    });
  }
  async function loadCmsContent(){
    try {
      const data = await api('/content/live');
      const content = data.content || {};
      if ($('cmsHeroTitle')) $('cmsHeroTitle').textContent = content.heroTitle || 'Willkommen bei FabMargin 3D';
      if ($('cmsHeroText')) $('cmsHeroText').textContent = content.heroText || '';
      if ($('premiumHeadline')) $('premiumHeadline').textContent = content.premiumHeadline || '💳 Premium-Credits';
      if ($('cmsPremiumTips')) {
        const tips = Array.isArray(content.premiumTips) ? content.premiumTips : [];
        $('cmsPremiumTips').innerHTML = tips.map(t => `<div class="note-box small">${esc(t)}</div>`).join('');
      }
    } catch {}
  }
  async function loadProfileData(){
    if (!userToken()) {
      cachedProfile = null;
      renderProfileDetails();
      return null;
    }
    try {
      const data = await api('/auth/profile', { auth: 'user' });
      cachedProfile = data;
      saveCurrentUserPatch({ username: data.username, email: data.email, role: data.role, points: data.points });
      renderProfileDetails();
      return data;
    } catch {
      cachedProfile = null;
      renderProfileDetails();
      return null;
    }
  }
  function renderProfileDetails(){
    const profile = cachedProfile;
    const localUser = currentUser();
    if ($('userProfileCard')) $('userProfileCard').classList.toggle('hidden', !localUser);
    if ($('userSecurityCard')) $('userSecurityCard').classList.toggle('hidden', !localUser);
    if ($('userPaymentsCard')) $('userPaymentsCard').classList.toggle('hidden', !localUser);
    if ($('mySlicerProfilesCard')) $('mySlicerProfilesCard').classList.toggle('hidden', !localUser);
    if ($('userProfileName')) $('userProfileName').textContent = profile?.username || localUser?.username || '';
    if ($('userProfileEmail')) $('userProfileEmail').textContent = profile?.email || localUser?.email || '';
    if ($('userRoleChip')) $('userRoleChip').textContent = 'Rolle: ' + (profile?.role || 'Gast');
    if ($('userPointsChip')) $('userPointsChip').textContent = (profile?.points || 0) + ' Punkte';
    if ($('userPointsValue')) $('userPointsValue').textContent = String(profile?.points || 0);
    if ($('userTopCreatorStatus')) $('userTopCreatorStatus').textContent = (profile?.badges || []).includes('Top Creator') ? 'Aktiv' : 'Noch offen';
    if ($('userBadgeList')) $('userBadgeList').innerHTML = (profile?.badges || []).map(b => `<span class="chip">🏅 ${esc(b)}</span>`).join('');
    if ($('userNotificationList')) {
      const notes = (profile?.notifications || []).slice(0, 3);
      $('userNotificationList').innerHTML = notes.length ? notes.map(note =>
        `<div class="note-box small">${esc(note.message)}</div>`
      ).join('') : '';
    }
    if ($('operatorConsoleCard')) $('operatorConsoleCard').classList.toggle('hidden', profile?.role !== 'operator');
    if ($('slicerMarketplaceStatus')) {
      $('slicerMarketplaceStatus').textContent = profile?.username
        ? `Angemeldet als ${profile.username}. Profilkäufe kosten ${PROFILE_POINT_COST} Punkte.`
        : 'Bitte zuerst im Kundenbereich anmelden, um Profile zu kaufen oder zu teilen.';
    }
    if ($('userSecurityStatus')) {
      const chips = [];
      chips.push(`<span class="chip">${profile?.twoFactorEnabled ? '✅ 2FA aktiv' : '🕓 2FA aus'}</span>`);
      chips.push(`<span class="chip">${profile?.premiumActive ? '💎 Premium aktiv' : 'Standard'}</span>`);
      chips.push(`<span class="chip">${profile?.adFree ? '🚫 Werbefrei' : '📢 Banner aktiv'}</span>`);
      $('userSecurityStatus').innerHTML = chips.join('');
    }
    if ($('bannerEnabledToggle')) $('bannerEnabledToggle').checked = profile?.settings?.bannerEnabled !== false;
  }
  async function loadPoints(){
    if (!userToken()) {
      if ($('userRedeemList')) $('userRedeemList').innerHTML = '<div class="muted small">Im Kundenbereich anmelden, um Punkte einzulösen.</div>';
      return;
    }
    try {
      const data = await api('/user/points', { auth: 'user' });
      if ($('userPointsValue')) $('userPointsValue').textContent = String(data.points || 0);
      if ($('userRedeemList')) {
        $('userRedeemList').innerHTML = (data.redeemOptions || []).map(item => `
          <div class="feature-tile">
            <div class="icon">🎁</div>
            <div class="body"><h3>${esc(item.title)}</h3><p>${item.cost} Punkte</p></div>
            <div style="text-align:right">
              <button class="tiny" ${item.unlocked ? 'disabled' : ''} data-reward="${esc(item.id)}">${item.unlocked ? '✓ Aktiv' : 'Einlösen'}</button>
            </div>
          </div>`).join('');
        $('userRedeemList').querySelectorAll('button[data-reward]').forEach(btn => {
          btn.onclick = async () => {
            try {
              await api('/user/points/redeem', { method: 'POST', auth: 'user', body: { rewardId: btn.dataset.reward } });
              await loadProfileData();
              await loadPoints();
            } catch (e) { alert('❌ ' + e.message); }
          };
        });
      }
    } catch (e) {
      if ($('userRedeemList')) $('userRedeemList').innerHTML = `<div class="small" style="color:var(--red)">Fehler: ${esc(e.message)}</div>`;
    }
  }
  async function saveBannerSettings() {
    const status = $('twoFactorStatus');
    try {
      await api('/user/settings', { method: 'POST', auth: 'user', body: { bannerEnabled: !!$('bannerEnabledToggle')?.checked } });
      if (status) {
        status.textContent = '✅ Einstellungen gespeichert.';
        status.style.color = 'var(--green)';
      }
      await loadProfileData();
      await loadBanners();
    } catch (e) {
      if (status) {
        status.textContent = '❌ ' + e.message;
        status.style.color = 'var(--red)';
      }
    }
  }
  async function startTwoFactorSetup() {
    const status = $('twoFactorStatus');
    const setupBox = $('twoFactorSetupBox');
    try {
      const data = await api('/auth/2fa/enable', { method: 'POST', auth: 'user', body: {} });
      if (setupBox) {
        setupBox.classList.remove('hidden');
        setupBox.innerHTML = `
          <strong>Authenticator einrichten</strong><br>
          Secret: <code>${esc(data.secret)}</code><br>
          Backup-Codes:<br>${(data.backupCodes || []).map(code => `<code>${esc(code)}</code>`).join('<br>')}
        `;
      }
      if (status) {
        status.textContent = 'Bitte Code aus Google Authenticator / Authy eingeben und dann bestätigen.';
        status.style.color = 'var(--muted)';
      }
    } catch (e) {
      if (status) {
        status.textContent = '❌ ' + e.message;
        status.style.color = 'var(--red)';
      }
    }
  }
  async function verifyTwoFactorSetup() {
    const status = $('twoFactorStatus');
    try {
      const data = await api('/auth/2fa/verify', { method: 'POST', auth: 'user', body: { code: $('twoFactorCode').value.trim() } });
      if (status) {
        status.textContent = `✅ 2FA aktiviert. Verbleibende Backup-Codes: ${data.remainingBackupCodes}`;
        status.style.color = 'var(--green)';
      }
      if ($('twoFactorSetupBox')) $('twoFactorSetupBox').classList.add('hidden');
      $('twoFactorCode').value = '';
      await loadProfileData();
      await loadDevices();
    } catch (e) {
      if (status) {
        status.textContent = '❌ ' + e.message;
        status.style.color = 'var(--red)';
      }
    }
  }
  async function disableTwoFactorSetup() {
    const status = $('twoFactorStatus');
    try {
      await api('/auth/2fa/enable', { method: 'POST', auth: 'user', body: { disable: true } });
      if (status) {
        status.textContent = '✅ 2FA deaktiviert.';
        status.style.color = 'var(--green)';
      }
      if ($('twoFactorSetupBox')) $('twoFactorSetupBox').classList.add('hidden');
      $('twoFactorCode').value = '';
      await loadProfileData();
    } catch (e) {
      if (status) {
        status.textContent = '❌ ' + e.message;
        status.style.color = 'var(--red)';
      }
    }
  }
  async function loadDevices() {
    const box = $('deviceList');
    if (!box) return;
    if (!userToken()) {
      box.innerHTML = '<div class="muted small">Im Kundenbereich anmelden, um Geräte zu sehen.</div>';
      return;
    }
    try {
      const data = await api('/user/devices', { auth: 'user' });
      box.innerHTML = !(data.devices || []).length ? '<div class="muted small">Noch keine Geräte erfasst.</div>' : data.devices.map(device => `
        <div class="note-box small">
          <strong>${esc(device.label)}</strong><br>
          <span class="muted">${esc(device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString('de-DE') : '')}</span><br>
          <button class="danger tiny" data-remove-device="${esc(device.id)}" style="margin-top:8px">Gerät entfernen</button>
        </div>
      `).join('');
      box.querySelectorAll('button[data-remove-device]').forEach(btn => btn.onclick = async () => {
        try {
          await api('/user/devices/' + encodeURIComponent(btn.dataset.removeDevice), { method: 'DELETE', auth: 'user' });
          await loadDevices();
        } catch (e) { alert('❌ ' + e.message); }
      });
    } catch (e) {
      box.innerHTML = `<div class="small" style="color:var(--red)">Fehler: ${esc(e.message)}</div>`;
    }
  }
  async function loadPurchases() {
    const box = $('purchaseHistoryList');
    if (!box) return;
    if (!userToken()) {
      box.innerHTML = '<div class="muted small">Im Kundenbereich anmelden, um Käufe zu sehen.</div>';
      return;
    }
    try {
      const data = await api('/user/purchases', { auth: 'user' });
      box.innerHTML = !(data.purchases || []).length ? '<div class="muted small">Noch keine Stripe-Käufe vorhanden.</div>' : data.purchases.map(item => `
        <div class="note-box small">
          <strong>${esc(item.title || item.productId)}</strong><br>
          <span class="muted">${esc(item.status)} · ${(Number(item.amount || 0) / 100).toFixed(2)} ${esc(item.currency || 'EUR')}</span><br>
          <span class="muted">${esc(item.createdAt ? new Date(item.createdAt).toLocaleString('de-DE') : '')}</span>
        </div>
      `).join('');
    } catch (e) {
      box.innerHTML = `<div class="small" style="color:var(--red)">Fehler: ${esc(e.message)}</div>`;
    }
  }
  async function startCheckout(productId) {
    const status = $('paymentStatus');
    try {
      const data = await api('/payment/checkout', { method: 'POST', auth: 'user', body: { productId } });
      if (status) {
        status.textContent = data.mockMode
          ? `Mock-Checkout erstellt. Abschließen via Webhook-Test mit Session ${data.sessionId}.`
          : 'Checkout erstellt. Weiterleitung zu Stripe…';
        status.style.color = 'var(--muted)';
      }
      if (data.checkoutUrl) window.open(data.checkoutUrl, '_blank', 'noopener');
    } catch (e) {
      if (status) {
        status.textContent = '❌ ' + e.message;
        status.style.color = 'var(--red)';
      }
    }
  }
  async function loadMySlicerProfiles() {
    const box = $('mySlicerProfileList');
    if (!box) return;
    if (!userToken()) {
      box.innerHTML = '<div class="muted small">Im Kundenbereich anmelden, um eigene Bilder zu verwalten.</div>';
      if ($('mySlicerProfileMeta')) $('mySlicerProfileMeta').textContent = '';
      return;
    }
    try {
      const data = await api('/user/slicer-profiles', { auth: 'user' });
      if ($('mySlicerProfileMeta')) $('mySlicerProfileMeta').textContent = `Gesamt gespeichert: ${data.totalImages || 0} / 20 Bilder`;
      box.innerHTML = !(data.profiles || []).length ? '<div class="muted small">Noch keine eigenen Profile hochgeladen.</div>' : data.profiles.map(profile => `
        <div class="note-box small">
          <strong>${esc(profile.name)}</strong> · ${esc(profile.status)}<br>
          <span class="muted">${esc(profile.printerModel)}</span>
          <div class="gallery-strip">
            ${(profile.images || []).map((src, index) => `
              <div class="gallery-item">
                <img src="${src}" alt="Profilbild">
                <button class="danger tiny" type="button" data-delete-image="${esc(profile.id)}:${index}">✕</button>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');
      box.querySelectorAll('button[data-delete-image]').forEach(btn => btn.onclick = async () => {
        const [profileId, imageIndex] = String(btn.dataset.deleteImage || '').split(':');
        try {
          await api(`/slicer/profile/${profileId}/image/${imageIndex}`, { method: 'DELETE', auth: 'user' });
          await loadMySlicerProfiles();
        } catch (e) { alert('❌ ' + e.message); }
      });
    } catch (e) {
      box.innerHTML = `<div class="small" style="color:var(--red)">Fehler: ${esc(e.message)}</div>`;
    }
  }
  async function loadBanners() {
    const slots = {
      bannerTopSlot: 'bannerTopCard',
      bannerMiddleSlot: 'bannerMiddleCard',
      bannerBottomSlot: 'bannerBottomCard'
    };
    Object.values(slots).forEach(cardId => { if ($(cardId)) $(cardId).classList.add('hidden'); });
    try {
      const data = await api('/banners/active');
      const profile = cachedProfile;
      const adsHidden = !!(profile?.premiumActive || profile?.adFree || profile?.settings?.bannerEnabled === false);
      if (adsHidden) return;
      (data.slots || []).forEach(slot => {
        const targetId = slot.slotNumber === 1 ? 'bannerTopSlot' : slot.slotNumber === 2 ? 'bannerMiddleSlot' : 'bannerBottomSlot';
        const cardId = slots[targetId];
        if (!slot.active || !$(targetId) || !$(cardId)) return;
        $(targetId).innerHTML = `
          <div>
            <span class="label">Anzeige</span>
            <div class="title">${esc(slot.active.companyName)}</div>
            <div class="small muted">${esc(slot.active.text)}</div>
          </div>
          <div style="margin-left:auto;text-align:right">
            <div class="small muted">${esc(slot.position)} · ${esc(slot.priceRange)}</div>
            <a href="${esc(slot.active.website)}" target="_blank" rel="noopener" style="color:var(--accent-soft)">Mehr erfahren</a>
          </div>
        `;
        $(cardId).classList.remove('hidden');
      });
    } catch {}
  }
  async function submitPartnerRequest(event) {
    event.preventDefault();
    const status = $('partnerRequestStatus');
    try {
      const data = await api('/partner/request', {
        method: 'POST',
        body: {
          companyName: $('partnerCompanyName').value.trim(),
          website: $('partnerWebsite').value.trim(),
          contactEmail: $('partnerContactEmail').value.trim(),
          cooperationType: $('partnerCooperationType').value.trim(),
          printerModel: $('partnerPrinterModel').value.trim(),
          printerValueEuro: Number($('partnerPrinterValue').value || 0),
          filamentPerMonth: Number($('partnerFilamentAmount').value || 0),
          termYears: Number($('partnerTermYears').value || 1),
          description: $('partnerDescription').value.trim(),
          bannerText: $('partnerBannerText').value.trim()
        }
      });
      event.target.reset();
      status.innerHTML = `✅ Anfrage gesendet · Trust-Score: ${esc(data.trustScore)}% · ${esc(data.vipStatus)}<br>${esc(data.autoReply)}`;
      status.style.color = data.suspicious ? 'var(--amber)' : 'var(--green)';
    } catch (e) {
      status.textContent = '❌ ' + e.message;
      status.style.color = 'var(--red)';
    }
  }
  async function loadMarketplace(){
    const box = $('slicerMarketplaceList');
    if (!box) return;
    try {
      const data = await api('/slicer/profiles');
      if (!data.profiles.length) {
        box.innerHTML = '<div class="muted small">Noch keine freigegebenen Slicer-Profile im Marktplatz.</div>';
        return;
      }
      box.innerHTML = data.profiles.map(profile => `
        <div class="feature-tile">
          <div class="icon">🧩</div>
          <div class="body">
            <h3>${esc(profile.name)}</h3>
            <p>${esc(profile.printerModel)} · ${esc(profile.slicer)} · ⭐ ${esc(profile.rating || 0)}</p>
            <p class="small muted">${esc(profile.description)}</p>
            <div class="chip-list">
              <span class="chip">Layer ${esc(profile.settings?.layerHeight)}</span>
              <span class="chip">Speed ${esc(profile.settings?.speed)}</span>
              <span class="chip">Temp ${esc(profile.settings?.temp)}</span>
              ${(profile.badges || []).map(b => `<span class="chip">🏅 ${esc(b)}</span>`).join('')}
            </div>
            ${(profile.images || []).length ? `<div class="gallery-strip">${profile.images.filter(isSafeImageSrc).map(src => `<img src="${src}" alt="Bild">`).join('')}</div>` : ''}
          </div>
          <div style="text-align:right;min-width:120px">
            <div class="price">${profile.purchaseCount || 0} Käufe</div>
            <button class="tiny" data-buy-points="${profile.id}" style="margin-top:6px">Mit Punkten</button>
            <button class="ghost tiny" data-rate="${profile.id}" style="margin-top:6px">Bewerten</button>
          </div>
        </div>
      `).join('');
      box.querySelectorAll('button[data-buy-points]').forEach(btn => btn.onclick = () => buyProfile(btn.dataset.buyPoints, 'points'));
      box.querySelectorAll('button[data-rate]').forEach(btn => btn.onclick = () => rateProfile(btn.dataset.rate));
    } catch (e) {
      box.innerHTML = `<div class="small" style="color:var(--red)">Fehler: ${esc(e.message)}</div>`;
    }
  }
  async function buyProfile(profileId, method){
    if (!userToken()) return alert('Bitte zuerst im Kundenbereich anmelden.');
    try {
      await api(`/slicer/profile/${profileId}/buy`, { method: 'POST', auth: 'user', body: { method } });
      alert('✅ Profil erfolgreich freigeschaltet.');
      await loadProfileData();
      await loadPoints();
      await loadMarketplace();
    } catch (e) {
      alert('❌ ' + e.message);
    }
  }
  async function rateProfile(profileId){
    if (!userToken()) return alert('Bitte zuerst im Kundenbereich anmelden.');
    const raw = prompt('Bewertung von 1 bis 5 Sternen eingeben:', '5');
    if (!raw) return;
    const rating = Math.max(1, Math.min(5, Number(raw || 0)));
    try {
      await api(`/slicer/profile/${profileId}/rate`, { method: 'POST', auth: 'user', body: { rating } });
      alert('✅ Bewertung gespeichert.');
      await loadMarketplace();
      await loadPoints();
    } catch (e) { alert('❌ ' + e.message); }
  }
  async function submitSlicerProfile(event){
    event.preventDefault();
    const status = $('slicerCreateStatus');
    if (!userToken()) {
      status.textContent = 'Bitte zuerst im Kundenbereich anmelden.';
      status.style.color = 'var(--red)';
      return;
    }
    status.textContent = 'Sende Profil…';
    status.style.color = 'var(--muted)';
    try {
      await api('/slicer/profile', {
        method: 'POST',
        auth: 'user',
        body: {
          name: $('slicerName').value.trim(),
          printerModel: $('slicerPrinterModel').value.trim(),
          slicer: $('slicerType').value,
          settings: {
            layerHeight: $('slicerLayerHeight').value.trim(),
            speed: $('slicerSpeed').value.trim(),
            temp: $('slicerTemp').value.trim()
          },
          rating: Number($('slicerRating').value || 5),
          images: selectedImages,
          description: $('slicerDescription').value.trim()
        }
      });
      event.target.reset();
      selectedImages = [];
      if ($('slicerImagePreview')) $('slicerImagePreview').innerHTML = '';
      status.textContent = '✅ Profil eingereicht. Es wartet jetzt auf Admin-Freigabe.';
      status.style.color = 'var(--green)';
    } catch (e) {
      status.textContent = '❌ ' + e.message;
      status.style.color = 'var(--red)';
    }
  }
  async function loadAdminSlicer(){
    const box = $('adminSlicerList');
    if (!box) return;
    try {
      const data = await api('/admin/slicer/pending', { auth: 'admin' });
      box.innerHTML = !data.profiles.length ? '<p class="muted small">Keine offenen Freigaben.</p>' : data.profiles.map(profile => `
        <div class="step">
          <strong>${esc(profile.name)}</strong> · ${esc(profile.printerModel)} · ${esc(profile.slicer)}<br>
          <span class="small muted">${esc(profile.description)}</span>
          <div class="chip-list">
            <span class="chip">Layer ${esc(profile.settings?.layerHeight)}</span>
            <span class="chip">Speed ${esc(profile.settings?.speed)}</span>
            <span class="chip">Temp ${esc(profile.settings?.temp)}</span>
          </div>
          <div style="margin-top:8px"><button class="tiny" data-approve-slicer="${profile.id}">Freigeben</button></div>
        </div>
      `).join('');
      box.querySelectorAll('button[data-approve-slicer]').forEach(btn => btn.onclick = async () => {
        await api('/admin/slicer/approve/' + btn.dataset.approveSlicer, { method: 'POST', auth: 'admin', body: {} });
        await loadAdminSlicer();
      });
    } catch (e) {
      box.innerHTML = `<p class="small" style="color:var(--red)">Fehler: ${esc(e.message)}</p>`;
    }
  }
  async function loadPartnerCategoriesAdmin() {
    const box = $('adminPartnerCategories');
    if (!box) return;
    try {
      const data = await api('/admin/partner/categories', { auth: 'admin' });
      box.innerHTML = (data.categories || []).map(item => `
        <div class="note-box small">
          <strong>${esc(item.category)}</strong><br>
          ${item.activePartner ? `${esc(item.activePartner.companyName)} <span class="vip-star">${esc(item.activePartner.vipStatus)}</span>` : 'Aktuell frei'}<br>
          <span class="muted">Warteliste: ${esc(item.waiting)}</span>
        </div>
      `).join('') || '<p class="muted small">Keine Kategorien gefunden.</p>';
    } catch (e) {
      box.innerHTML = `<p class="small" style="color:var(--red)">Fehler: ${esc(e.message)}</p>`;
    }
  }
  async function loadPartnerRequestsAdmin() {
    const box = $('adminPartnerRequestsList');
    if (!box) return;
    try {
      const data = await api('/admin/partner/requests', { auth: 'admin' });
      box.innerHTML = !(data.requests || []).length ? '<p class="muted small">Keine Partner-Anfragen.</p>' : data.requests.map(item => `
        <div class="step">
          <strong>${esc(item.companyName)}</strong> · ${esc(item.category)} · <span class="${item.vipStatus !== 'Normal' ? 'vip-star' : ''}">${esc(item.vipStatus)}</span><br>
          <span class="small muted">Trust: ${esc(item.trustScore)}% · Laufzeit: ${esc(item.termYears)} Jahr(e) · Filament: ${esc(item.filamentPerMonth)} / Monat</span><br>
          <span class="small">${esc(item.autoReply || '')}</span><br>
          <span class="small muted">Status: ${esc(item.status)}</span>
          ${item.status === 'pending' ? `<div class="row" style="margin-top:8px">
            <button class="tiny" data-approve-partner="${item.id}">Genehmigen</button>
            <button class="danger tiny" data-reject-partner="${item.id}">Ablehnen</button>
          </div>` : ''}
        </div>
      `).join('');
      box.querySelectorAll('button[data-approve-partner]').forEach(btn => btn.onclick = async () => {
        await api('/admin/partner/requests/' + btn.dataset.approvePartner + '/approve', { method: 'POST', auth: 'admin', body: {} });
        await loadPartnerCategoriesAdmin();
        await loadPartnerRequestsAdmin();
        await loadBanners();
      });
      box.querySelectorAll('button[data-reject-partner]').forEach(btn => btn.onclick = async () => {
        await api('/admin/partner/requests/' + btn.dataset.rejectPartner + '/reject', { method: 'POST', auth: 'admin', body: {} });
        await loadPartnerRequestsAdmin();
      });
    } catch (e) {
      box.innerHTML = `<p class="small" style="color:var(--red)">Fehler: ${esc(e.message)}</p>`;
    }
  }
  async function loadDiagnostics(targetId = 'adminDiagnosticsList', auth = 'admin'){
    const box = $(targetId);
    if (!box) return;
    try {
      const data = await api('/admin/diagnostics', { auth });
      box.innerHTML = !data.reports.length ? '<p class="muted small">Noch keine Diagnosen.</p>' : data.reports.slice(0, 12).map(report => `
        <div class="step">
          <strong>${esc(report.username)}</strong> · ${esc(report.createdAt ? new Date(report.createdAt).toLocaleString('de-DE') : '')}<br>
          <span class="small muted">DevTools: ${report.devtoolsDetected ? 'ja' : 'nein'} · Fehler: ${esc(report.errorCount)}</span><br>
          <span class="small">${esc((report.flags || []).join(', ') || 'Keine Flags')}</span>
        </div>
      `).join('');
    } catch (e) {
      box.innerHTML = `<p class="small" style="color:var(--red)">Fehler: ${esc(e.message)}</p>`;
    }
  }
  async function loadOperatorRequests(){
    const box = $('adminOperatorRequestsList');
    if (!box) return;
    try {
      const data = await api('/admin/operator/requests', { auth: 'admin' });
      box.innerHTML = !data.requests.length ? '<p class="muted small">Keine Operator-Anfragen.</p>' : data.requests.map(item => `
        <div class="step">
          <strong>${esc(item.operator)}</strong> möchte: ${esc(item.action)}<br>
          <span class="small muted">${esc(item.reason)}</span><br>
          <span class="small">${esc(item.status)}</span>
          ${item.status === 'pending' ? `<div class="row" style="margin-top:8px">
            <button class="tiny" data-op-approve="${item.id}">Genehmigen</button>
            <button class="danger tiny" data-op-reject="${item.id}">Ablehnen</button>
          </div>` : ''}
        </div>
      `).join('');
      box.querySelectorAll('button[data-op-approve]').forEach(btn => btn.onclick = async () => {
        await api('/admin/operator/requests/' + btn.dataset.opApprove + '/approve', { method: 'POST', auth: 'admin', body: {} });
        await loadOperatorRequests();
      });
      box.querySelectorAll('button[data-op-reject]').forEach(btn => btn.onclick = async () => {
        await api('/admin/operator/requests/' + btn.dataset.opReject + '/reject', { method: 'POST', auth: 'admin', body: {} });
        await loadOperatorRequests();
      });
    } catch (e) {
      box.innerHTML = `<p class="small" style="color:var(--red)">Fehler: ${esc(e.message)}</p>`;
    }
  }
  async function inviteOperator(){
    const status = $('operatorInviteStatus');
    try {
      await api('/admin/operator/invite', {
        method: 'POST',
        auth: 'admin',
        body: {
          username: $('operatorInviteUsername').value.trim(),
          email: $('operatorInviteEmail').value.trim()
        }
      });
      $('operatorInviteUsername').value = '';
      $('operatorInviteEmail').value = '';
      status.textContent = '✅ Operator-Einladung gespeichert.';
      status.style.color = 'var(--green)';
    } catch (e) {
      status.textContent = '❌ ' + e.message;
      status.style.color = 'var(--red)';
    }
  }
  async function loadCmsAdmin(){
    try {
      const data = await api('/admin/content', { auth: 'admin' });
      const content = data.content || {};
      if ($('cmsHeroTitleInput')) $('cmsHeroTitleInput').value = content.heroTitle || '';
      if ($('cmsHeroTextInput')) $('cmsHeroTextInput').value = content.heroText || '';
      if ($('cmsPremiumHeadlineInput')) $('cmsPremiumHeadlineInput').value = content.premiumHeadline || '';
      if ($('cmsPremiumTipsInput')) $('cmsPremiumTipsInput').value = (content.premiumTips || []).join('\n');
      $('adminContentStatus').textContent = 'Inhalte geladen.';
    } catch (e) {
      $('adminContentStatus').textContent = '❌ ' + e.message;
      $('adminContentStatus').style.color = 'var(--red)';
    }
  }
  async function saveCmsAdmin(){
    try {
      await api('/admin/content/update', {
        method: 'POST',
        auth: 'admin',
        body: {
          heroTitle: $('cmsHeroTitleInput').value.trim(),
          heroText: $('cmsHeroTextInput').value.trim(),
          premiumHeadline: $('cmsPremiumHeadlineInput').value.trim(),
          premiumTips: $('cmsPremiumTipsInput').value.split('\n').map(x => x.trim()).filter(Boolean)
        }
      });
      $('adminContentStatus').textContent = '✅ Inhalte live aktualisiert.';
      $('adminContentStatus').style.color = 'var(--green)';
      await loadCmsContent();
    } catch (e) {
      $('adminContentStatus').textContent = '❌ ' + e.message;
      $('adminContentStatus').style.color = 'var(--red)';
    }
  }
  async function refreshOperatorConsole(){
    const profile = cachedProfile;
    if (!profile || profile.role !== 'operator') return;
    try {
      const [stats, messages, community] = await Promise.all([
        api('/admin/dashboard', { auth: 'user' }),
        api('/support/messages', { auth: 'user' }),
        api('/admin/community', { auth: 'user' })
      ]);
      if ($('operatorStats')) $('operatorStats').innerHTML = `
        <div class="note-box small">📊 Nutzer: ${esc(stats.users)} · Freie Codes: ${esc(stats.unusedCodes)} · Offene Slicer-Freigaben: ${esc(stats.slicerPending || 0)}</div>
        <div class="note-box small">🔒 Incidents: ${esc(stats.incidents)} · Diagnosen: ${esc(stats.diagnostics || 0)}</div>`;
      if ($('operatorSupportList')) $('operatorSupportList').innerHTML = (messages.messages || []).slice(0, 5).map(msg =>
        `<div class="note-box small">🎧 ${esc(msg.text)}<br><span class="muted">${esc(new Date(msg.ts).toLocaleString('de-DE'))}</span></div>`
      ).join('') || '<div class="muted small">Keine Support-Nachrichten.</div>';
      if ($('operatorCommunityList')) {
        const pending = (community.proposals || []).filter(item => item.status === 'pending').slice(0, 5);
        $('operatorCommunityList').innerHTML = pending.length ? pending.map(item => `
          <div class="step">
            <strong>💡 ${esc(item.title)}</strong><br>
            <span class="small muted">${esc(item.text)}</span>
            <div class="row" style="margin-top:8px">
              <button class="tiny" data-op-comm-approve="${item.id}">Annehmen</button>
              <button class="danger tiny" data-op-comm-reject="${item.id}">Ablehnen</button>
            </div>
          </div>
        `).join('') : '<div class="muted small">Keine offenen Community-Fälle.</div>';
        $('operatorCommunityList').querySelectorAll('button[data-op-comm-approve]').forEach(btn => btn.onclick = async () => {
          await api('/admin/community/' + btn.dataset.opCommApprove + '/approve', { method: 'POST', auth: 'user', body: {} });
          await refreshOperatorConsole();
        });
        $('operatorCommunityList').querySelectorAll('button[data-op-comm-reject]').forEach(btn => btn.onclick = async () => {
          await api('/admin/community/' + btn.dataset.opCommReject + '/reject', { method: 'POST', auth: 'user', body: {} });
          await refreshOperatorConsole();
        });
      }
      await loadDiagnostics('operatorDiagnosticsList', 'user');
    } catch (e) {
      if ($('operatorStats')) $('operatorStats').innerHTML = `<div class="small" style="color:var(--red)">Fehler: ${esc(e.message)}</div>`;
    }
  }
  async function sendOperatorRequest(){
    const status = $('operatorRequestStatus');
    try {
      await api('/operator/request', {
        method: 'POST',
        auth: 'user',
        body: {
          action: $('operatorRequestAction').value.trim(),
          reason: $('operatorRequestReason').value.trim()
        }
      });
      $('operatorRequestAction').value = '';
      $('operatorRequestReason').value = '';
      status.textContent = '✅ Anfrage an Admins gesendet.';
      status.style.color = 'var(--green)';
    } catch (e) {
      status.textContent = '❌ ' + e.message;
      status.style.color = 'var(--red)';
    }
  }
  function devtoolsDetected(){
    return Math.abs((window.outerWidth || 0) - window.innerWidth) > 160 || Math.abs((window.outerHeight || 0) - window.innerHeight) > 160;
  }
  async function maybeSendDiagnostics(reason){
    if (!backend() || sessionStorage.getItem(DIAG_SENT_KEY)) return;
    const devtoolsOpen = devtoolsDetected();
    const flags = [];
    if (devtoolsOpen) flags.push('devtools');
    if (jsErrorCount >= 3) flags.push('many_errors');
    if (reason) flags.push(reason);
    if (!flags.length) return;
    try {
      sessionStorage.setItem(DIAG_SENT_KEY, '1');
      await api('/diagnostics/report', {
        method: 'POST',
        body: { devtoolsDetected: devtoolsOpen, errorCount: jsErrorCount, flags, userAgent: navigator.userAgent },
        auth: 'user'
      });
    } catch {}
  }
  async function refreshHome(){
    await loadCmsContent();
    await loadProfileData();
    await loadPoints();
    await loadMarketplace();
    await loadPurchases();
    await loadDevices();
    await loadMySlicerProfiles();
    await loadBanners();
    await refreshOperatorConsole();
  }
  function refreshAdmin(data){
    if ($('adminTeil7Status') && typeof data.slicerPending !== 'undefined') {
      $('adminTeil7Status').textContent = `Offene Slicer-Freigaben: ${data.slicerPending || 0} · Diagnosen: ${data.diagnostics || 0}`;
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    bindPasswordGenerator();
    if ($('slicerImages')) $('slicerImages').addEventListener('change', () => {
      handleImageSelection().catch((error) => {
        if ($('slicerCreateStatus')) {
          $('slicerCreateStatus').textContent = '❌ ' + error.message;
          $('slicerCreateStatus').style.color = 'var(--red)';
        }
      });
    });
    if ($('slicerProfileForm')) $('slicerProfileForm').addEventListener('submit', submitSlicerProfile);
    if ($('partnerRequestForm')) $('partnerRequestForm').addEventListener('submit', submitPartnerRequest);
    if ($('adminLoadSlicerBtn')) $('adminLoadSlicerBtn').addEventListener('click', () => { loadAdminSlicer().catch(() => {}); });
    if ($('adminLoadDiagnosticsBtn')) $('adminLoadDiagnosticsBtn').addEventListener('click', () => { loadDiagnostics().catch(() => {}); });
    if ($('adminLoadPartnerRequestsBtn')) $('adminLoadPartnerRequestsBtn').addEventListener('click', () => { loadPartnerRequestsAdmin().catch(() => {}); });
    if ($('adminLoadPartnerCategoriesBtn')) $('adminLoadPartnerCategoriesBtn').addEventListener('click', () => { loadPartnerCategoriesAdmin().catch(() => {}); });
    if ($('operatorInviteBtn')) $('operatorInviteBtn').addEventListener('click', () => { inviteOperator().catch(() => {}); });
    if ($('adminLoadOperatorRequestsBtn')) $('adminLoadOperatorRequestsBtn').addEventListener('click', () => { loadOperatorRequests().catch(() => {}); });
    if ($('adminLoadContentBtn')) $('adminLoadContentBtn').addEventListener('click', () => { loadCmsAdmin().catch(() => {}); });
    if ($('adminSaveContentBtn')) $('adminSaveContentBtn').addEventListener('click', () => { saveCmsAdmin().catch(() => {}); });
    if ($('operatorRefreshBtn')) $('operatorRefreshBtn').addEventListener('click', () => { refreshOperatorConsole().catch(() => {}); });
    if ($('operatorRequestBtn')) $('operatorRequestBtn').addEventListener('click', () => { sendOperatorRequest().catch(() => {}); });
    if ($('saveBannerSettingsBtn')) $('saveBannerSettingsBtn').addEventListener('click', () => { saveBannerSettings().catch(() => {}); });
    if ($('twoFactorEnableBtn')) $('twoFactorEnableBtn').addEventListener('click', () => { startTwoFactorSetup().catch(() => {}); });
    if ($('twoFactorVerifyBtn')) $('twoFactorVerifyBtn').addEventListener('click', () => { verifyTwoFactorSetup().catch(() => {}); });
    if ($('twoFactorDisableBtn')) $('twoFactorDisableBtn').addEventListener('click', () => { disableTwoFactorSetup().catch(() => {}); });
    document.querySelectorAll('[data-checkout]').forEach(btn => btn.addEventListener('click', () => { startCheckout(btn.dataset.checkout).catch(() => {}); }));
    window.addEventListener('error', () => { jsErrorCount++; maybeSendDiagnostics('window.error'); });
    window.addEventListener('unhandledrejection', () => { jsErrorCount++; maybeSendDiagnostics('unhandledrejection'); });
    setInterval(() => { maybeSendDiagnostics('interval'); }, 15000);
  });
  window.Part7 = { refreshHome, refreshAdmin };
})();
