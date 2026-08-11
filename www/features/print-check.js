(function (global) {
  async function run(payload) {
    return global.PremiumApi.request('/premium/print-check', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  function render() {
    return `<h2>🧪 Print Check Pro</h2>
      <p class="small muted">Kostenlose Vorschau: Kompatibilität. Vollanalyse: 0,99 € pro Analyse.</p>
      <div class="row"><div><label>Drucker</label><input id="pcPrinter" placeholder="Bambu Lab P1P"></div><div><label>Material</label><input id="pcMaterial" placeholder="PETG"></div></div>
      <div class="row"><div><label>Düse</label><input id="pcNozzle" placeholder="0.4 mm"></div><div><label>Qualität</label><input id="pcQuality" placeholder="Fein"></div></div>
      <label>Slicer</label><input id="pcSlicer" placeholder="Bambu Studio">
      <label>Einsatzgebiet</label><input id="pcUseCase" placeholder="Funktionsteil">
      <label>Einstellungen (optional)</label><textarea id="pcSettings" style="min-height:70px"></textarea>
      <div class="row" style="margin-top:8px"><button class="tiny" id="pcPreview">Kostenlose Vorschau</button><button class="tiny" id="pcFull">Vollanalyse kaufen/verwenden</button></div>
      <div id="pcOut" class="step small" style="margin-top:10px"></div>`;
  }

  function bind(el) {
    const collect = (preview) => ({
      preview,
      printer: el.querySelector('#pcPrinter').value,
      material: el.querySelector('#pcMaterial').value,
      nozzle: el.querySelector('#pcNozzle').value,
      quality: el.querySelector('#pcQuality').value,
      slicer: el.querySelector('#pcSlicer').value,
      useCase: el.querySelector('#pcUseCase').value,
      settings: el.querySelector('#pcSettings').value
    });
    const out = el.querySelector('#pcOut');
    el.querySelector('#pcPreview').onclick = async () => {
      out.textContent = 'Prüfe…';
      try {
        const r = await run(collect(true));
        out.innerHTML = `<b>Kompatibilität:</b> ${r.compatibility.summary}<br><span class="muted">${r.paywall || ''}</span>`;
      } catch (e) { out.textContent = e.message; }
    };
    el.querySelector('#pcFull').onclick = async () => {
      out.textContent = 'Analysiere…';
      try {
        const r = await run(collect(false));
        out.innerHTML = `<b>${r.compatibility.summary}</b><br>${(r.details.keySettings || []).map(x => `• <b>${x.name}</b>: ${x.explain}`).join('<br>')}<br><br><b>Warnungen:</b> ${(r.details.warnings || []).join(' | ') || 'Keine'}<br><b>Checkliste:</b> ${(r.details.checklist || []).join(' · ')}`;
      } catch (e) { out.textContent = e.message; }
    };
  }

  global.PrintCheckFeature = { render, bind };
})(window);
