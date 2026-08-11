(function (global) {
  function addCard() {
    const homeMain = document.querySelector('#screenHome main');
    if (!homeMain) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h2>📈 Profit Check Pro (1 Credit)</h2>
      <p class="small muted">Kostenlose Vorschau: Gesamtkosten-Berechnung gratis</p>
      <div class="row">
        <div><label>Verkaufspreis (€)</label><input id="pfSell" type="number" value="200"></div>
        <div><label>Druckzeit (h)</label><input id="pfHours" type="number" value="31"></div>
      </div>
      <div class="row">
        <div><label>Materialkosten (€)</label><input id="pfMaterial" type="number" value="45"></div>
        <div><label>Stückzahl</label><input id="pfQty" type="number" value="20"></div>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="ghost tiny" id="pfPreviewBtn">Kostenlose Vorschau</button>
        <button class="tiny" id="pfFullBtn">PrintProfit Score – 1 Credit</button>
      </div>
      <div id="pfResult" class="small muted" style="margin-top:8px"></div>`;
    homeMain.appendChild(card);

    async function run(preview) {
      const result = card.querySelector('#pfResult');
      result.textContent = 'Berechne…';
      try {
        const data = await global.PremiumShop.request('/premium/profit-check', {
          method: 'POST',
          body: {
            userId: global.PremiumShop.getUserId(),
            sellPrice: Number(card.querySelector('#pfSell').value),
            hours: Number(card.querySelector('#pfHours').value),
            materialCost: Number(card.querySelector('#pfMaterial').value),
            quantity: Number(card.querySelector('#pfQty').value),
            preview
          }
        });
        if (preview) {
          result.textContent = `Gesamtkosten geschätzt: ${data.preview.totalCost.toFixed(2)} €`;
        } else {
          result.innerHTML = `Score: <b>${data.analysis.score}/100</b> (${data.analysis.badge}) · Gewinn/Stunde: ${data.analysis.profitPerHour.toFixed(2)} €<br>${data.analysis.warning}`;
          global.PremiumShop.refreshCredits();
        }
      } catch (e) {
        result.textContent = 'Fehler: ' + e.message;
      }
    }

    card.querySelector('#pfPreviewBtn').onclick = () => run(true);
    card.querySelector('#pfFullBtn').onclick = () => run(false);
  }

  document.addEventListener('DOMContentLoaded', addCard);
})(window);
