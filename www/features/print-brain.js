(function (global) {
  async function savePrint(payload) {
    return global.PremiumApi.request('/premium/brain/save', { method: 'POST', body: JSON.stringify(payload) });
  }
  async function suggest(query) {
    const params = new URLSearchParams(query);
    return global.PremiumApi.request('/premium/brain/suggest?' + params.toString());
  }
  async function saveRecipe(payload) {
    return global.PremiumApi.request('/premium/brain/recipe', { method: 'POST', body: JSON.stringify(payload) });
  }

  function render() {
    return `<h2>🧠 Personal Print Brain</h2>
      <p class="small muted">Einmalig 6,99 €. Lernt aus deinen eigenen Druckdaten und warnt bei ähnlichen Fehlschlägen.</p>
      <div class="row"><div><label>Drucker</label><input id="pbPrinter" placeholder="P1P"></div><div><label>Material</label><input id="pbMaterial" placeholder="JAYO PETG Grau"></div></div>
      <div class="row"><div><label>Düse</label><input id="pbNozzle" placeholder="0.4 mm"></div><div><label>Temperatur</label><input id="pbTemp" placeholder="245°C"></div></div>
      <label>Ergebnis</label><input id="pbResult" placeholder="sehr gut / Stringing / schlecht">
      <label>Hinweise</label><textarea id="pbNotes" style="min-height:70px"></textarea>
      <div class="row" style="margin-top:8px"><button class="tiny" id="pbSave">Erfahrung speichern</button><button class="tiny" id="pbSuggest">Vorschlag laden</button><button class="tiny" id="pbRecipe">Erfolgsrezept speichern</button></div>
      <div id="pbOut" class="step small" style="margin-top:10px"></div>`;
  }

  function bind(el) {
    const out = el.querySelector('#pbOut');
    const collect = () => ({
      printer: el.querySelector('#pbPrinter').value,
      material: el.querySelector('#pbMaterial').value,
      nozzle: el.querySelector('#pbNozzle').value,
      temperature: el.querySelector('#pbTemp').value,
      result: el.querySelector('#pbResult').value,
      notes: el.querySelector('#pbNotes').value
    });

    el.querySelector('#pbSave').onclick = async () => {
      out.textContent = 'Speichere…';
      try { const r = await savePrint(collect()); out.textContent = 'Gespeichert: ' + r.entry.savedAt; }
      catch (e) { out.textContent = e.message; }
    };
    el.querySelector('#pbSuggest').onclick = async () => {
      out.textContent = 'Suche ähnliche Drucke…';
      try {
        const c = collect();
        const r = await suggest({ printer: c.printer, material: c.material, nozzle: c.nozzle });
        out.innerHTML = `${r.suggestion}<br>${r.failureMemory || ''}<br>Ähnliche Drucke: ${r.similarCount}`;
      } catch (e) { out.textContent = e.message; }
    };
    el.querySelector('#pbRecipe').onclick = async () => {
      out.textContent = 'Speichere Erfolgsrezept…';
      try {
        const c = collect();
        const r = await saveRecipe({ name: 'NOCH EINMAL SO DRUCKEN', printer: c.printer, filament: c.material, nozzle: c.nozzle, result: c.result, notes: c.notes, settings: `Temperatur ${c.temperature}` });
        out.textContent = `Rezept gespeichert (${r.recipe.id}).`;
      } catch (e) { out.textContent = e.message; }
    };
  }

  global.PrintBrainFeature = { render, bind };
})(window);
