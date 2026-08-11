(function (global) {
  function addCard() {
    const homeMain = document.querySelector('#screenHome main');
    if (!homeMain) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h2>🩺 Print Doctor Pro (2 Credits)</h2>
      <p class="small muted">Kostenlose Vorschau: Anzahl gefundener Ursachen</p>
      <label>Problem</label>
      <select id="pdProblem">
        <option>Stringing</option><option>Warping</option><option>Layer Shift</option>
        <option>Unterextrusion</option><option>Schlechte erste Schicht</option>
      </select>
      <div class="row" style="margin-top:10px">
        <button class="ghost tiny" id="pdPreviewBtn">Kostenlose Vorschau</button>
        <button class="tiny" id="pdFullBtn">Geführte Diagnose – 2 Credits</button>
      </div>
      <div id="pdResult" class="small muted" style="margin-top:8px"></div>
      <div class="row" style="margin-top:8px">
        <button class="ghost tiny" id="pdBetter">BESSER</button>
        <button class="ghost tiny" id="pdSame">GLEICH</button>
        <button class="ghost tiny" id="pdWorse">SCHLECHTER</button>
      </div>`;
    homeMain.appendChild(card);

    const result = card.querySelector('#pdResult');

    async function run(preview) {
      result.textContent = 'Analysiere…';
      try {
        const data = await global.PremiumShop.request('/premium/print-doctor', {
          method: 'POST',
          body: {
            userId: global.PremiumShop.getUserId(),
            problem: card.querySelector('#pdProblem').value,
            preview
          }
        });
        if (preview) {
          result.textContent = `Vorschau: ${data.preview.foundCauses} mögliche Ursachen gefunden.`;
        } else {
          result.innerHTML = `<b>Nur eine Änderung:</b> ${data.diagnosis.nextChange}<br>${data.diagnosis.explanation}`;
          global.PremiumShop.refreshCredits();
        }
      } catch (e) {
        result.textContent = 'Fehler: ' + e.message;
      }
    }

    function feedback(value) {
      if (!result.textContent && !result.innerHTML) return;
      result.innerHTML += `<br><i>Feedback gespeichert: ${value}</i>`;
    }

    card.querySelector('#pdPreviewBtn').onclick = () => run(true);
    card.querySelector('#pdFullBtn').onclick = () => run(false);
    card.querySelector('#pdBetter').onclick = () => feedback('BESSER');
    card.querySelector('#pdSame').onclick = () => feedback('GLEICH');
    card.querySelector('#pdWorse').onclick = () => feedback('SCHLECHTER');
  }

  document.addEventListener('DOMContentLoaded', addCard);
})(window);
