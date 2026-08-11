// FabMargin 3D – Haupt-App-Logik
(function () {
  const $ = (id) => document.getElementById(id);
  const show = (id) => {
    ['screenSetup','screenLogin','screenHome','screenFeature','screenAdmin']
      .forEach(s => $(s).classList.toggle('hidden', s !== id));
    window.scrollTo(0,0);
  };

  let logoTapCount = 0;
  let logoTapTimer = null;

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

    // Logo-Tap für Admin
    $('logoTap').addEventListener('click', () => {
      logoTapCount++;
      clearTimeout(logoTapTimer);
      logoTapTimer = setTimeout(() => { logoTapCount = 0; }, 2000);
      if (logoTapCount >= 7) {
        logoTapCount = 0;
        if (window.FabVault.isUnlocked()) show('screenAdmin');
        else alert('Bitte zuerst die App entsperren.');
      }
    });

    // Bottom-Nav
    document.querySelectorAll('nav.bottom button').forEach(b => {
      b.addEventListener('click', () => {
        const tab = b.dataset.tab;
        document.querySelectorAll('nav.bottom button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        if (tab === 'home') { renderHome(); show('screenHome'); }
        else if (tab === 'store') { renderStore(); show('screenHome'); document.getElementById('storeList').scrollIntoView({behavior:'smooth'}); }
        else if (tab === 'admin') show('screenAdmin');
      });
    });

    // Feature zurück
    $('featBackBtn').addEventListener('click', () => { renderHome(); show('screenHome'); });
    $('adminBackBtn').addEventListener('click', () => { renderHome(); show('screenHome'); });

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

    // Auto-Lock-Event
    document.addEventListener('vault:locked', () => {
      sessionStorage.removeItem('__mpw');
      show('screenLogin');
    });
  }

  async function doLogin() {
    const pw = $('loginPw').value;
    $('loginError').textContent = '';
    try {
      await window.FabVault.unlock(pw);
      sessionStorage.setItem('__mpw', pw);
      $('loginPw').value = '';
      renderHome();
      show('screenHome');
    } catch (e) {
      $('loginError').textContent = 'Falsches Passwort.';
    }
  }

  function renderHome() {
    renderOwned();
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

  function renderStore() {
    const list = $('storeList');
    list.innerHTML = '';
    const premium = document.createElement('div');
    premium.className = 'feature-tile';
    premium.innerHTML = `<div class="icon">🚀</div>
      <div class="body"><h3>PrintProfit 3D Premium</h3><p>5 Premium-Funktionen mit kostenloser Vorschau · kein Abo.</p></div>
      <div style="text-align:right"><button class="tiny">Öffnen</button></div>`;
    premium.querySelector('button').onclick = () => openFeature('premium_center');
    list.appendChild(premium);
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
    if (fid === 'premium_center') {
      $('featTitle').textContent = '🚀 PrintProfit 3D Premium';
      renderPremiumCenter();
      show('screenFeature');
      return;
    }
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

  function renderPremiumCenter() {
    $('featContent').innerHTML = `<div class="row" style="margin-bottom:10px">
      <button class="tiny secondary" data-premium-tab="shop">Shop</button>
      <button class="tiny secondary" data-premium-tab="check">Print Check</button>
      <button class="tiny secondary" data-premium-tab="doctor">Print Doctor</button>
      <button class="tiny secondary" data-premium-tab="profit">Profit Check</button>
      <button class="tiny secondary" data-premium-tab="brain">Print Brain</button>
    </div>
    <div id="premiumTabContent" class="card" style="background:#0e1c36"></div>`;
    const root = $('featContent');
    root.onclick = onPremiumTabClick;
    showPremiumTab('shop');
  }

  function onPremiumTabClick(e) {
    const button = e.target.closest('[data-premium-tab]');
    if (!button) return;
    showPremiumTab(button.dataset.premiumTab);
  }

  function showPremiumTab(tab) {
    const host = document.getElementById('premiumTabContent');
    if (!host) return;
    const map = {
      shop: window.PremiumShop,
      check: window.PrintCheckFeature,
      doctor: window.PrintDoctorFeature,
      profit: window.ProfitCheckFeature,
      brain: window.PrintBrainFeature
    };
    const feature = map[tab];
    if (!feature) return;
    host.innerHTML = feature.render();
    feature.bind(host);
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
    if($('commBackBtn')) $('commBackBtn').onclick=()=>{document.getElementById('screenCommunity').classList.add('hidden');document.getElementById('screenHome').classList.remove('hidden');};
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
