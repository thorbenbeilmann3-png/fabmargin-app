(function (global) {
  async function run(payload) {
    return global.PremiumApi.request('/premium/profit-check', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  function render() {
    return `<h2>💶 Profit Check Pro</h2>
      <p class="small muted">Kostenlose Vorschau: Gesamtkosten. Score nur nach Kauf (0,99 € oder 9,99 € Unlimited).</p>
      <div class="row"><div><label>Verkauf (€)</label><input id="pfRevenue" type="number" value="200"></div><div><label>Druckstunden</label><input id="pfHours" type="number" value="31"></div></div>
      <div class="row"><div><label>Material</label><input id="pfMaterial" type="number" value="35"></div><div><label>Strom</label><input id="pfPower" type="number" value="8"></div></div>
      <div class="row"><div><label>Maschine</label><input id="pfMachine" type="number" value="20"></div><div><label>Arbeitszeit</label><input id="pfLabor" type="number" value="15"></div></div>
      <div class="row"><div><label>Verpackung</label><input id="pfPackaging" type="number" value="5"></div><div><label>Gebühren</label><input id="pfFees" type="number" value="7"></div></div>
      <label>Ausschuss</label><input id="pfScrap" type="number" value="3">
      <div class="row" style="margin-top:8px"><button class="tiny" id="pfPreview">Gesamtkosten berechnen</button><button class="tiny" id="pfFull">Score berechnen</button></div>
      <div id="pfOut" class="step small" style="margin-top:10px"></div>`;
  }

  function bind(el) {
    const out = el.querySelector('#pfOut');
    const n = (id) => Number(el.querySelector(id).value || 0);
    const collect = (preview) => ({
      preview,
      revenue: n('#pfRevenue'),
      printHours: n('#pfHours'),
      materialCost: n('#pfMaterial'),
      electricityCost: n('#pfPower'),
      machineCost: n('#pfMachine'),
      laborCost: n('#pfLabor'),
      packagingCost: n('#pfPackaging'),
      feeCost: n('#pfFees'),
      scrapCost: n('#pfScrap')
    });
    el.querySelector('#pfPreview').onclick = async () => {
      out.textContent = 'Berechne…';
      try {
        const r = await run(collect(true));
        out.innerHTML = `Verkauf: ${r.revenue.toFixed(2)} €<br>Kosten: ${r.totalCosts.toFixed(2)} €<br>Gewinn: ${r.profit.toFixed(2)} €<br>Gewinn pro Druckerstunde: ${r.profitPerHour.toFixed(2)} €`;
      } catch (e) { out.textContent = e.message; }
    };
    el.querySelector('#pfFull').onclick = async () => {
      out.textContent = 'Berechne Score…';
      try {
        const r = await run(collect(false));
        out.innerHTML = `Score: <b>${r.score}/100 ${r.traffic}</b><br>${r.reason}<br>${r.warning || ''}<br>Gewinn/Stunde: ${r.profitPerHour.toFixed(2)} €`;
      } catch (e) { out.textContent = e.message; }
    };
  }

  global.ProfitCheckFeature = { render, bind };
})(window);
