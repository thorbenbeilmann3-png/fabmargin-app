(function (global) {
  async function run(payload) {
    return global.PremiumApi.request('/premium/print-doctor', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  function render() {
    return `<h2>🩺 Print Doctor Pro</h2>
      <p class="small muted">Kostenlose Vorschau: Anzahl Ursachen. Vollanalyse: 1,49 € oder 5 für 5,99 €.</p>
      <label>Problem</label>
      <select id="pdIssue"><option>Stringing</option><option>Warping</option><option>Layer Shift</option><option>Unterextrusion</option><option>Schlechte erste Schicht</option></select>
      <label>Notiz / Beobachtung</label><textarea id="pdNotes" style="min-height:70px"></textarea>
      <div class="row" style="margin-top:8px"><button class="tiny" id="pdPreview">Kostenlose Vorschau</button><button class="tiny" id="pdFull">Vollständige Diagnose</button></div>
      <div id="pdOut" class="step small" style="margin-top:10px"></div>`;
  }

  function bind(el) {
    const out = el.querySelector('#pdOut');
    const collect = (preview) => ({ preview, issue: el.querySelector('#pdIssue').value, notes: el.querySelector('#pdNotes').value });
    el.querySelector('#pdPreview').onclick = async () => {
      out.textContent = 'Analysiere Vorschau…';
      try {
        const r = await run(collect(true));
        out.innerHTML = `Gefundene Ursachen: <b>${r.foundCauseCount}</b><br>${(r.causes || []).join(' · ')}<br><span class="muted">${r.paywall}</span>`;
      } catch (e) { out.textContent = e.message; }
    };
    el.querySelector('#pdFull').onclick = async () => {
      out.textContent = 'Erstelle Diagnose…';
      try {
        const r = await run(collect(false));
        out.innerHTML = (r.steps || []).map(s => `<b>Test ${s.step}: ${s.title}</b><br>${s.why}<br>Änderung: ${s.singleChangeTest}<br>[${s.feedbackOptions.join('] [')}]`).join('<hr style="border-color:#2a3c60">');
      } catch (e) { out.textContent = e.message; }
    };
  }

  global.PrintDoctorFeature = { render, bind };
})(window);
