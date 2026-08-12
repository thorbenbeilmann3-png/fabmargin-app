(() => {
  const STORAGE_KEY = 'fabmargin_custom_printers_v1';
  const DISCLAIMER = 'Dies sind Empfehlungen – keine Garantie.';

  function createPrinter(manufacturer, model, software, stable, pro, extras = {}) {
    return {
      id: extras.id || slugify(`${manufacturer}-${model}`),
      manufacturer,
      model,
      software,
      stable,
      pro,
      buildVolume: extras.buildVolume || '220 × 220 × 250 mm',
      nozzle: extras.nozzle || '0,4 mm',
      configFormat: extras.configFormat || 'ini',
      notes: extras.notes || '',
      disclaimer: DISCLAIMER,
      configText: extras.configText || buildConfigText({
        manufacturer,
        model,
        software,
        stable,
        pro,
        buildVolume: extras.buildVolume || '220 × 220 × 250 mm',
        nozzle: extras.nozzle || '0,4 mm',
        notes: extras.notes || ''
      }),
      custom: !!extras.custom
    };
  }

  function buildConfigText(printer) {
    const lines = [
      `; FabMargin Profil – ${printer.manufacturer} ${printer.model}`,
      `; ${DISCLAIMER}`,
      `[printer]`,
      `manufacturer=${printer.manufacturer}`,
      `model=${printer.model}`,
      `slicer=${printer.software}`,
      `build_volume=${printer.buildVolume}`,
      `nozzle=${printer.nozzle}`,
      ``,
      `[beginner_profile]`,
      `extruder_temp=${printer.stable.temperature}`,
      `bed_temp=${printer.stable.bed}`,
      `print_speed=${printer.stable.speed}`,
      `layer_height=${printer.stable.layer}`,
      `retraction=${printer.stable.retraction}`,
      ``,
      `[pro_farm_profile]`,
      `extruder_temp=${printer.pro.temperature}`,
      `bed_temp=${printer.pro.bed}`,
      `print_speed=${printer.pro.speed}`,
      `layer_height=${printer.pro.layer}`,
      `retraction=${printer.pro.retraction}`
    ];

    if (printer.notes) {
      lines.push('', '[notes]', `text=${printer.notes}`);
    }

    return lines.join('\n');
  }

  const DEFAULT_PRINTERS = [
    createPrinter('Bambu Lab', 'P1S', 'Bambu Studio / OrcaSlicer',
      { temperature: '220 °C', bed: '60 °C', speed: '200 mm/s', layer: '0,20 mm', retraction: '0,80 mm bei 30 mm/s' },
      { temperature: '225 °C', bed: '60 °C', speed: '280 mm/s', layer: '0,20 mm', retraction: '0,60 mm bei 35 mm/s' },
      { buildVolume: '256 × 256 × 256 mm', notes: 'Geschlossener CoreXY für schnelle PLA/PETG-Serien.' }),
    createPrinter('Bambu Lab', 'A1 Mini', 'Bambu Studio / OrcaSlicer',
      { temperature: '215 °C', bed: '60 °C', speed: '150 mm/s', layer: '0,20 mm', retraction: '0,80 mm bei 30 mm/s' },
      { temperature: '220 °C', bed: '60 °C', speed: '220 mm/s', layer: '0,20 mm', retraction: '0,60 mm bei 35 mm/s' },
      { buildVolume: '180 × 180 × 180 mm', notes: 'Leichter Bedslinger mit gutem PLA-Fokus.' }),
    createPrinter('Prusa', 'MK4', 'PrusaSlicer',
      { temperature: '215 °C', bed: '60 °C', speed: '90 mm/s', layer: '0,20 mm', retraction: '0,80 mm bei 35 mm/s' },
      { temperature: '220 °C', bed: '60 °C', speed: '140 mm/s', layer: '0,20 mm', retraction: '0,70 mm bei 40 mm/s' },
      { buildVolume: '250 × 210 × 220 mm', notes: 'Zuverlässiger Direktantrieb für Serienjobs.' }),
    createPrinter('Creality', 'Ender 3 V3 KE', 'Creality Print / Cura',
      { temperature: '210 °C', bed: '60 °C', speed: '120 mm/s', layer: '0,20 mm', retraction: '0,80 mm bei 35 mm/s' },
      { temperature: '215 °C', bed: '60 °C', speed: '180 mm/s', layer: '0,20 mm', retraction: '0,70 mm bei 40 mm/s' },
      { buildVolume: '220 × 220 × 240 mm', notes: 'Schneller Bedslinger mit Klipper-Basis.' }),
    createPrinter('Creality', 'K1C', 'Creality Print / OrcaSlicer',
      { temperature: '220 °C', bed: '60 °C', speed: '180 mm/s', layer: '0,20 mm', retraction: '0,80 mm bei 35 mm/s' },
      { temperature: '225 °C', bed: '60 °C', speed: '260 mm/s', layer: '0,20 mm', retraction: '0,60 mm bei 40 mm/s' },
      { buildVolume: '220 × 220 × 250 mm', notes: 'Geschlossene CoreXY-Plattform für hohe Durchsätze.' }),
    createPrinter('Anycubic', 'Kobra S1', 'Anycubic Slicer Next / OrcaSlicer',
      { temperature: '215 °C', bed: '60 °C', speed: '160 mm/s', layer: '0,20 mm', retraction: '0,80 mm bei 35 mm/s' },
      { temperature: '220 °C', bed: '60 °C', speed: '240 mm/s', layer: '0,20 mm', retraction: '0,60 mm bei 40 mm/s' },
      { buildVolume: '250 × 250 × 250 mm', notes: 'Moderne CoreXY-Option für kleine Farms.' }),

    createPrinter('Bambu Lab', 'X1C', 'Bambu Studio / OrcaSlicer',
      { temperature: '220 °C', bed: '60 °C', speed: '200 mm/s', layer: '0,20 mm', retraction: '0,80 mm bei 30 mm/s' },
      { temperature: '225 °C', bed: '60 °C', speed: '300 mm/s', layer: '0,20 mm', retraction: '0,60 mm bei 35 mm/s' },
      { buildVolume: '256 × 256 × 256 mm', notes: 'Flaggschiff-CoreXY mit LiDAR-Assist.' }),
    createPrinter('Bambu Lab', 'H2D', 'Bambu Studio',
      { temperature: '220 °C', bed: '60 °C', speed: '180 mm/s', layer: '0,20 mm', retraction: '0,80 mm bei 30 mm/s' },
      { temperature: '230 °C', bed: '65 °C', speed: '280 mm/s', layer: '0,24 mm', retraction: '0,60 mm bei 35 mm/s' },
      { buildVolume: '350 × 320 × 325 mm', notes: 'Großformat mit Fokus auf hohe Stückzahlen und große Bauteile.' }),
    createPrinter('Bambu Lab', 'A1', 'Bambu Studio / OrcaSlicer',
      { temperature: '215 °C', bed: '60 °C', speed: '160 mm/s', layer: '0,20 mm', retraction: '0,80 mm bei 30 mm/s' },
      { temperature: '220 °C', bed: '60 °C', speed: '230 mm/s', layer: '0,20 mm', retraction: '0,60 mm bei 35 mm/s' },
      { buildVolume: '256 × 256 × 256 mm', notes: 'Bedslinger mit automatischer Kalibrierung.' }),
    createPrinter('Prusa', 'XL', 'PrusaSlicer',
      { temperature: '215 °C', bed: '60 °C', speed: '80 mm/s', layer: '0,20 mm', retraction: '0,80 mm bei 35 mm/s' },
      { temperature: '220 °C', bed: '60 °C', speed: '120 mm/s', layer: '0,24 mm', retraction: '0,70 mm bei 40 mm/s' },
      { buildVolume: '360 × 360 × 360 mm', notes: 'Großformat für stabile Einzelteile und Werkzeugwechsel.' }),
    createPrinter('Prusa', 'Core One', 'PrusaSlicer',
      { temperature: '215 °C', bed: '60 °C', speed: '110 mm/s', layer: '0,20 mm', retraction: '0,80 mm bei 35 mm/s' },
      { temperature: '220 °C', bed: '60 °C', speed: '180 mm/s', layer: '0,20 mm', retraction: '0,70 mm bei 40 mm/s' },
      { buildVolume: '250 × 220 × 270 mm', notes: 'Moderner CoreXY mit Prusa-Workflow.' }),
    createPrinter('Creality', 'K2 Plus', 'Creality Print / OrcaSlicer',
      { temperature: '220 °C', bed: '60 °C', speed: '180 mm/s', layer: '0,20 mm', retraction: '0,80 mm bei 35 mm/s' },
      { temperature: '230 °C', bed: '65 °C', speed: '300 mm/s', layer: '0,24 mm', retraction: '0,60 mm bei 40 mm/s' },
      { buildVolume: '350 × 350 × 350 mm', notes: 'Großer Klipper-CoreXY für Produktionsdurchsatz.' }),
    createPrinter('Creality', 'Ender 5 S1', 'Creality Print / Cura',
      { temperature: '215 °C', bed: '60 °C', speed: '100 mm/s', layer: '0,20 mm', retraction: '0,80 mm bei 35 mm/s' },
      { temperature: '220 °C', bed: '60 °C', speed: '160 mm/s', layer: '0,20 mm', retraction: '0,70 mm bei 40 mm/s' },
      { buildVolume: '220 × 220 × 280 mm', notes: 'Stabiler Würfelrahmen für längere Jobs.' }),
    createPrinter('Anycubic', 'Kobra 3 Combo', 'Anycubic Slicer Next / OrcaSlicer',
      { temperature: '215 °C', bed: '60 °C', speed: '170 mm/s', layer: '0,20 mm', retraction: '0,80 mm bei 35 mm/s' },
      { temperature: '220 °C', bed: '60 °C', speed: '250 mm/s', layer: '0,20 mm', retraction: '0,60 mm bei 40 mm/s' },
      { buildVolume: '250 × 250 × 260 mm', notes: 'Multicolor-Setup mit gutem Farm-Potenzial.' }),
    createPrinter('Anycubic', 'Vyper', 'Cura / PrusaSlicer',
      { temperature: '205 °C', bed: '60 °C', speed: '60 mm/s', layer: '0,20 mm', retraction: '4,00 mm bei 40 mm/s' },
      { temperature: '210 °C', bed: '60 °C', speed: '90 mm/s', layer: '0,20 mm', retraction: '3,50 mm bei 45 mm/s' },
      { buildVolume: '245 × 245 × 260 mm', notes: 'Auto-Level-Bedslinger mit Bowden-Setup.' }),
    createPrinter('Voron', '2.4', 'SuperSlicer / OrcaSlicer',
      { temperature: '220 °C', bed: '60 °C', speed: '150 mm/s', layer: '0,20 mm', retraction: '0,50 mm bei 35 mm/s' },
      { temperature: '230 °C', bed: '65 °C', speed: '320 mm/s', layer: '0,20 mm', retraction: '0,40 mm bei 45 mm/s' },
      { buildVolume: '300 × 300 × 300 mm', notes: 'Tuner-freundlicher CoreXY für schnelle Farms.' }),

    createPrinter('Creality', 'Ender 3 (original)', 'Cura / PrusaSlicer',
      { temperature: '200 °C', bed: '60 °C', speed: '50 mm/s', layer: '0,20 mm', retraction: '5,00 mm bei 45 mm/s' },
      { temperature: '205 °C', bed: '60 °C', speed: '70 mm/s', layer: '0,20 mm', retraction: '4,50 mm bei 50 mm/s' },
      { buildVolume: '220 × 220 × 250 mm', notes: 'Bowden-Klassiker – langsam, aber stabil.' }),
    createPrinter('Creality', 'Ender 3 Pro', 'Cura / PrusaSlicer',
      { temperature: '200 °C', bed: '60 °C', speed: '50 mm/s', layer: '0,20 mm', retraction: '5,00 mm bei 45 mm/s' },
      { temperature: '205 °C', bed: '60 °C', speed: '75 mm/s', layer: '0,20 mm', retraction: '4,50 mm bei 50 mm/s' },
      { buildVolume: '220 × 220 × 250 mm', notes: 'Beliebter Einstieg mit gutem Community-Support.' }),
    createPrinter('Creality', 'Ender 3 V2', 'Cura / PrusaSlicer',
      { temperature: '205 °C', bed: '60 °C', speed: '55 mm/s', layer: '0,20 mm', retraction: '5,00 mm bei 45 mm/s' },
      { temperature: '210 °C', bed: '60 °C', speed: '80 mm/s', layer: '0,20 mm', retraction: '4,50 mm bei 50 mm/s' },
      { buildVolume: '220 × 220 × 250 mm', notes: 'Klassischer Upgrade-Pfad mit leiseren Treibern.' }),
    createPrinter('Prusa', 'MK3S+', 'PrusaSlicer',
      { temperature: '215 °C', bed: '60 °C', speed: '60 mm/s', layer: '0,20 mm', retraction: '0,80 mm bei 35 mm/s' },
      { temperature: '220 °C', bed: '60 °C', speed: '90 mm/s', layer: '0,20 mm', retraction: '0,70 mm bei 40 mm/s' },
      { buildVolume: '250 × 210 × 210 mm', notes: 'Bewährte Workhorse-Maschine für PLA und PETG.' }),
    createPrinter('Prusa', 'Mini+', 'PrusaSlicer',
      { temperature: '215 °C', bed: '60 °C', speed: '60 mm/s', layer: '0,20 mm', retraction: '3,20 mm bei 70 mm/s' },
      { temperature: '220 °C', bed: '60 °C', speed: '85 mm/s', layer: '0,20 mm', retraction: '3,00 mm bei 75 mm/s' },
      { buildVolume: '180 × 180 × 180 mm', notes: 'Kompakter Bowden-Drucker mit starkem Standardprofil.' }),
    createPrinter('Anycubic', 'i3 Mega', 'Cura / PrusaSlicer',
      { temperature: '200 °C', bed: '60 °C', speed: '50 mm/s', layer: '0,20 mm', retraction: '6,00 mm bei 40 mm/s' },
      { temperature: '205 °C', bed: '60 °C', speed: '65 mm/s', layer: '0,20 mm', retraction: '5,50 mm bei 45 mm/s' },
      { buildVolume: '210 × 210 × 205 mm', notes: 'Älterer UltraBase-Klassiker mit Bowden-Setup.' }),
    createPrinter('Anycubic', 'Chiron', 'Cura / PrusaSlicer',
      { temperature: '205 °C', bed: '60 °C', speed: '45 mm/s', layer: '0,24 mm', retraction: '6,00 mm bei 40 mm/s' },
      { temperature: '210 °C', bed: '60 °C', speed: '60 mm/s', layer: '0,24 mm', retraction: '5,50 mm bei 45 mm/s' },
      { buildVolume: '400 × 400 × 450 mm', notes: 'Großformat-Bedslinger für voluminöse Bauteile.' }),
    createPrinter('Artillery', 'Sidewinder X2', 'Cura / PrusaSlicer',
      { temperature: '210 °C', bed: '60 °C', speed: '60 mm/s', layer: '0,20 mm', retraction: '1,20 mm bei 35 mm/s' },
      { temperature: '215 °C', bed: '60 °C', speed: '90 mm/s', layer: '0,20 mm', retraction: '1,00 mm bei 40 mm/s' },
      { buildVolume: '300 × 300 × 400 mm', notes: 'Direktantrieb und große Bauhöhe.' }),
    createPrinter('Tronxy', 'X5SA', 'Cura / SuperSlicer',
      { temperature: '205 °C', bed: '60 °C', speed: '55 mm/s', layer: '0,20 mm', retraction: '6,00 mm bei 45 mm/s' },
      { temperature: '210 °C', bed: '60 °C', speed: '90 mm/s', layer: '0,20 mm', retraction: '5,50 mm bei 50 mm/s' },
      { buildVolume: '330 × 330 × 400 mm', notes: 'Großer DIY-CoreXY mit Tuning-Potenzial.' })
  ];

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function loadCustomPrinters() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Konnte eigene Drucker nicht laden:', error);
      return [];
    }
  }

  function saveCustomPrinters(printers) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(printers));
  }

  function getAllPrinters() {
    return DEFAULT_PRINTERS.concat(loadCustomPrinters());
  }

  function uniqueManufacturers(printers) {
    return [...new Set(printers.map(printer => printer.manufacturer))].sort((a, b) => a.localeCompare(b, 'de'));
  }

  function getPrinterById(id) {
    return getAllPrinters().find(printer => printer.id === id);
  }

  function render() {
    const searchInput = document.getElementById('printerSearch');
    const manufacturerSelect = document.getElementById('printerManufacturerFilter');
    const list = document.getElementById('printerProfileList');
    if (!searchInput || !manufacturerSelect || !list) return;

    const allPrinters = getAllPrinters();
    renderManufacturerOptions(allPrinters, manufacturerSelect);

    const query = searchInput.value.trim().toLowerCase();
    const manufacturer = manufacturerSelect.value;
    const printers = allPrinters.filter(printer => {
      const matchesManufacturer = !manufacturer || printer.manufacturer === manufacturer;
      const haystack = `${printer.manufacturer} ${printer.model} ${printer.software}`.toLowerCase();
      return matchesManufacturer && (!query || haystack.includes(query));
    });

    if (!printers.length) {
      list.innerHTML = '<div class="card"><p class="muted">Keine Drucker für diesen Filter gefunden.</p></div>';
      return;
    }

    list.innerHTML = printers.map(renderPrinterCard).join('');
  }

  function renderManufacturerOptions(printers, select) {
    const currentValue = select.value;
    const manufacturers = uniqueManufacturers(printers);
    const options = ['<option value="">Alle Hersteller</option>']
      .concat(manufacturers.map(manufacturer => (
        `<option value="${escapeHtml(manufacturer)}">${escapeHtml(manufacturer)}</option>`
      )));
    select.innerHTML = options.join('');
    select.value = manufacturers.includes(currentValue) ? currentValue : '';
  }

  function renderSettingBlock(title, settings) {
    return `
      <div class="printer-settings-block">
        <h4>${escapeHtml(title)}</h4>
        <div class="printer-setting"><span>Drucktemp.</span><strong>${escapeHtml(settings.temperature)}</strong></div>
        <div class="printer-setting"><span>Betttemp.</span><strong>${escapeHtml(settings.bed)}</strong></div>
        <div class="printer-setting"><span>Geschwindigkeit</span><strong>${escapeHtml(settings.speed)}</strong></div>
        <div class="printer-setting"><span>Layer-Höhe</span><strong>${escapeHtml(settings.layer)}</strong></div>
        <div class="printer-setting"><span>Retraction</span><strong>${escapeHtml(settings.retraction)}</strong></div>
      </div>
    `;
  }

  function renderPrinterCard(printer) {
    return `
      <article class="card printer-card">
        <div class="printer-card-head">
          <div>
            <span class="printer-chip">${escapeHtml(printer.manufacturer)}</span>
            <h3>${escapeHtml(printer.manufacturer)} ${escapeHtml(printer.model)}</h3>
            <p class="muted">${escapeHtml(printer.notes || 'Empfohlene PLA-Basisprofile für saubere, reproduzierbare Ergebnisse.')}</p>
          </div>
          <div class="printer-meta">
            <span>Bauvolumen: ${escapeHtml(printer.buildVolume)}</span>
            <span>Düse: ${escapeHtml(printer.nozzle)}</span>
            <span>Software: ${escapeHtml(printer.software)}</span>
          </div>
        </div>

        <div class="printer-settings-grid">
          ${renderSettingBlock('Grundeinstellungen', printer.stable)}
          ${renderSettingBlock('Pro/Farm-Einstellungen', printer.pro)}
        </div>

        <div class="printer-warning">${escapeHtml(printer.disclaimer)}</div>

        <label for="config-${escapeHtml(printer.id)}">Hersteller-Konfigurationsdatei</label>
        <textarea id="config-${escapeHtml(printer.id)}" class="printer-config" readonly>${escapeHtml(printer.configText)}</textarea>

        <div class="printer-actions">
          <button class="ghost tiny" data-action="copy-config" data-printer-id="${escapeHtml(printer.id)}">Kopieren</button>
          <button class="secondary tiny" data-action="save-config" data-printer-id="${escapeHtml(printer.id)}">Datei speichern</button>
          <button class="tiny" data-action="mail-config" data-printer-id="${escapeHtml(printer.id)}">Per E-Mail senden</button>
          ${printer.custom ? `<button class="danger tiny" data-action="delete-custom" data-printer-id="${escapeHtml(printer.id)}">Eigenen Drucker löschen</button>` : ''}
        </div>
      </article>
    `;
  }

  async function copyConfig(printer) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(printer.configText);
        alert(`Konfiguration für ${printer.manufacturer} ${printer.model} kopiert.`);
        return;
      }
    } catch (error) {
      console.warn('Clipboard fehlgeschlagen:', error);
    }
    alert(`Automatisches Kopieren wird auf diesem Gerät nicht unterstützt. Bitte den Text im Profil von ${printer.manufacturer} ${printer.model} manuell kopieren.`);
  }

  function saveConfig(printer) {
    const blob = new Blob([printer.configText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = `${slugify(`${printer.manufacturer}-${printer.model}`)}.${printer.configFormat}`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      link.remove();
    }, 1000);
  }

  function mailConfig(printer) {
    const subject = encodeURIComponent(`FabMargin Profil: ${printer.manufacturer} ${printer.model}`);
    const body = encodeURIComponent(
      `${printer.manufacturer} ${printer.model}\n\n${DISCLAIMER}\n\n${printer.configText}`
    );
    const link = document.createElement('a');
    link.href = `mailto:?subject=${subject}&body=${body}`;
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function deleteCustomPrinter(id) {
    const customPrinters = loadCustomPrinters();
    const nextPrinters = customPrinters.filter(printer => printer.id !== id);
    saveCustomPrinters(nextPrinters);
    render();
  }

  function handleActionClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const printer = getPrinterById(button.dataset.printerId);
    if (!printer) return;

    if (button.dataset.action === 'copy-config') copyConfig(printer);
    if (button.dataset.action === 'save-config') saveConfig(printer);
    if (button.dataset.action === 'mail-config') mailConfig(printer);
    if (button.dataset.action === 'delete-custom') deleteCustomPrinter(printer.id);
  }

  function handleCustomPrinterSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const manufacturer = form.customManufacturer.value.trim();
    const model = form.customModel.value.trim();
    const software = form.customSoftware.value.trim();
    const buildVolume = form.customBuildVolume.value.trim() || 'Benutzerdefiniert';
    const nozzle = form.customNozzle.value.trim() || '0,4 mm';
    const notes = form.customNotes.value.trim();
    const configText = form.customConfig.value.trim();
    const stable = {
      temperature: form.stableTemp.value.trim(),
      bed: form.stableBed.value.trim(),
      speed: form.stableSpeed.value.trim(),
      layer: form.stableLayer.value.trim(),
      retraction: form.stableRetraction.value.trim()
    };
    const pro = {
      temperature: form.proTemp.value.trim(),
      bed: form.proBed.value.trim(),
      speed: form.proSpeed.value.trim(),
      layer: form.proLayer.value.trim(),
      retraction: form.proRetraction.value.trim()
    };

    const customPrinter = createPrinter(
      manufacturer,
      model,
      software,
      stable,
      pro,
      {
        id: `custom-${slugify(`${manufacturer}-${model}`)}-${Date.now()}`,
        buildVolume,
        nozzle,
        notes,
        configText: configText || buildConfigText({
          manufacturer,
          model,
          software,
          buildVolume,
          nozzle,
          notes,
          stable,
          pro
        }),
        custom: true
      }
    );

    const customPrinters = loadCustomPrinters();
    customPrinters.unshift(customPrinter);
    saveCustomPrinters(customPrinters);
    form.reset();
    render();
    alert(`Eigener Drucker ${manufacturer} ${model} wurde gespeichert.`);
  }

  function bind() {
    const searchInput = document.getElementById('printerSearch');
    const manufacturerSelect = document.getElementById('printerManufacturerFilter');
    const list = document.getElementById('printerProfileList');
    const form = document.getElementById('customPrinterForm');
    if (!searchInput || !manufacturerSelect || !list || !form) return;

    searchInput.addEventListener('input', render);
    manufacturerSelect.addEventListener('change', render);
    list.addEventListener('click', handleActionClick);
    form.addEventListener('submit', handleCustomPrinterSubmit);
    render();
  }

  window.PrinterProfiles = {
    bind,
    render
  };

  document.addEventListener('DOMContentLoaded', bind);
})();
