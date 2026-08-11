(function (global) {
  function esc(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function addCard() {
    const homeMain = document.querySelector('#screenHome main');
    if (!homeMain) return;
    const printers = (global.PrinterProfiles && global.PrinterProfiles.getAllPrinters()) || [];
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h2>🧪 Print Check Pro (1 Credit)</h2>
      <p class="small muted">Kostenlose Vorschau: Kompatibilitätsprüfung gratis</p>
      <div class="row">
        <div>
          <label>Drucker wählen</label>
          <select id="pcPrinter">${printers.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>
        </div>
        <div>
          <label>Material wählen</label>
          <select id="pcMaterial"><option>PLA</option><option>PETG</option><option>ABS</option></select>
        </div>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="ghost tiny" id="pcPreviewBtn">Kostenlose Vorschau</button>
        <button class="tiny" id="pcFullBtn">Vollständige Analyse – 1 Credit</button>
      </div>
      <p class="small muted" style="margin-top:8px">${(global.PremiumShop && global.PremiumShop.notice) || ''}</p>
      <div id="pcResult" class="small muted" style="margin-top:8px"></div>`;
    homeMain.appendChild(card);

    async function run(preview) {
      const printerId = card.querySelector('#pcPrinter').value;
      const material = card.querySelector('#pcMaterial').value;
      const result = card.querySelector('#pcResult');
      result.textContent = 'Analysiere…';
      try {
        const data = await global.PremiumShop.request('/premium/print-check', {
          method: 'POST',
          body: { userId: global.PremiumShop.getUserId(), printerId, material, preview }
        });
        if (preview) {
          result.textContent = `✅ Vorschau: ${data.preview.summary}`;
        } else {
          result.textContent = `Einstellungen: Düse ${data.analysis.settings.nozzleTempC}°C · Bett ${data.analysis.settings.bedTempC}°C · Lüfter ${data.analysis.settings.fanPct}% | Warnung: ${data.analysis.warning} | Checkliste: ${data.analysis.checklist.join(', ')}`;
          global.PremiumShop.refreshCredits();
        }
      } catch (e) {
        result.textContent = 'Fehler: ' + e.message;
      }
    }

    card.querySelector('#pcPreviewBtn').onclick = () => run(true);
    card.querySelector('#pcFullBtn').onclick = () => run(false);
  }

  document.addEventListener('DOMContentLoaded', addCard);
})(window);
