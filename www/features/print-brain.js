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
      <h2>🧠 Personal Print Brain (7 Credits einmalig)</h2>
      <p class="small muted">Speichert deine Druckerfahrungen für persönliche Empfehlungen.</p>
      <div class="row" style="margin-bottom:8px">
        <button class="tiny" id="pbUnlockBtn">Brain freischalten – 7 Credits</button>
        <button class="ghost tiny" id="pbSuggestBtn">Empfehlung aus Erfahrungen</button>
      </div>
      <div class="row">
        <div>
          <label>Drucker</label>
          <select id="pbPrinter">${printers.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>
        </div>
        <div>
          <label>Material</label>
          <select id="pbMaterial"><option>PLA</option><option>PETG</option><option>ABS</option></select>
        </div>
      </div>
      <label>Einstellungen / Ergebnis</label>
      <input id="pbSettings" placeholder="z. B. 245°C, Lüfter 50%">
      <input id="pbResultInput" placeholder="Ergebnis: sehr gut / Stringing">
      <div class="row" style="margin-top:8px">
        <button class="ghost tiny" id="pbSaveBtn">Erfahrung speichern</button>
        <button class="ghost tiny" id="pbRecipeBtn">Erfolgsrezept speichern</button>
      </div>
      <div id="pbResult" class="small muted" style="margin-top:8px"></div>
      <p class="small muted">${(global.PremiumShop && global.PremiumShop.notice) || ''}</p>`;
    homeMain.appendChild(card);

    const resultEl = card.querySelector('#pbResult');
    const payload = () => ({
      userId: global.PremiumShop.getUserId(),
      printerId: card.querySelector('#pbPrinter').value,
      material: card.querySelector('#pbMaterial').value,
      settings: card.querySelector('#pbSettings').value,
      result: card.querySelector('#pbResultInput').value
    });

    card.querySelector('#pbUnlockBtn').onclick = async () => {
      try {
        await global.PremiumShop.request('/premium/unlock-brain', { method: 'POST', body: { userId: global.PremiumShop.getUserId() } });
        global.PremiumShop.refreshCredits();
        resultEl.textContent = '✅ Personal Print Brain freigeschaltet';
      } catch (e) {
        resultEl.textContent = 'Fehler: ' + e.message;
      }
    };

    card.querySelector('#pbSaveBtn').onclick = async () => {
      try {
        await global.PremiumShop.request('/premium/brain/save', { method: 'POST', body: payload() });
        resultEl.textContent = '✅ Erfahrung gespeichert';
      } catch (e) {
        resultEl.textContent = 'Fehler: ' + e.message;
      }
    };

    card.querySelector('#pbSuggestBtn').onclick = async () => {
      try {
        const data = await global.PremiumShop.request(`/premium/brain/suggest?userId=${encodeURIComponent(global.PremiumShop.getUserId())}&printerId=${encodeURIComponent(card.querySelector('#pbPrinter').value)}&material=${encodeURIComponent(card.querySelector('#pbMaterial').value)}`);
        resultEl.textContent = data.suggestion;
      } catch (e) {
        resultEl.textContent = 'Fehler: ' + e.message;
      }
    };

    card.querySelector('#pbRecipeBtn').onclick = async () => {
      try {
        await global.PremiumShop.request('/premium/brain/recipe', { method: 'POST', body: payload() });
        resultEl.textContent = '✅ Erfolgsrezept gespeichert';
      } catch (e) {
        resultEl.textContent = 'Fehler: ' + e.message;
      }
    };
  }

  document.addEventListener('DOMContentLoaded', addCard);
})(window);
