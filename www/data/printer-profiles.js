(function (global) {
  const CUSTOM_KEY = 'printprofit_custom_printers_v1';

  const BUILTIN_PRINTERS = [
    {
      id: 'bambu_p1s',
      name: 'Bambu Lab P1S',
      powerW: 280,
      buildVolume: '256×256×256mm',
      slicer: 'Bambu Studio',
      materials: {
        PLA: { nozzleTempC: 220, bedTempC: 55, fanPct: 100, speedMmS: 200 },
        PETG: { nozzleTempC: 240, bedTempC: 80, fanPct: 50, speedMmS: 150 },
        ABS: { nozzleTempC: 250, bedTempC: 100, fanPct: 0, speedMmS: 150 }
      }
    },
    {
      id: 'bambu_a1_mini',
      name: 'Bambu Lab A1 Mini',
      powerW: 150,
      buildVolume: '180×180×180mm',
      slicer: 'Bambu Studio',
      materials: {
        PLA: { nozzleTempC: 220, bedTempC: 55, fanPct: 100 },
        PETG: { nozzleTempC: 240, bedTempC: 80, fanPct: 50 }
      }
    },
    {
      id: 'prusa_mk4',
      name: 'Prusa MK4',
      powerW: 120,
      buildVolume: '250×210×220mm',
      slicer: 'PrusaSlicer',
      materials: {
        PLA: { nozzleTempC: 215, bedTempC: 60, fanPct: 100 },
        PETG: { nozzleTempC: 245, bedTempC: 85, fanPct: 40 },
        ABS: { nozzleTempC: 255, bedTempC: 105, fanPct: 0 }
      }
    },
    {
      id: 'ender3_v3_ke',
      name: 'Creality Ender 3 V3 KE',
      powerW: 200,
      buildVolume: '220×220×240mm',
      slicer: 'Cura',
      materials: {
        PLA: { nozzleTempC: 210, bedTempC: 60, fanPct: 100 },
        PETG: { nozzleTempC: 240, bedTempC: 80, fanPct: 30 }
      }
    },
    {
      id: 'creality_k1c',
      name: 'Creality K1C',
      powerW: 350,
      buildVolume: '220×220×250mm',
      slicer: 'Cura',
      materials: {
        PLA: { nozzleTempC: 220, bedTempC: 55, fanPct: 100, speedMmS: 300 },
        PETG: { nozzleTempC: 245, bedTempC: 80, fanPct: 40 },
        ABS: { nozzleTempC: 260, bedTempC: 100, fanPct: 0 }
      }
    },
    {
      id: 'anycubic_kobra_s1',
      name: 'Anycubic Kobra S1',
      powerW: 350,
      buildVolume: '220×220×250mm',
      slicer: 'Cura',
      materials: {
        PLA: { nozzleTempC: 210, bedTempC: 60, fanPct: 100 },
        PETG: { nozzleTempC: 240, bedTempC: 80, fanPct: 30 },
        ABS: { nozzleTempC: 250, bedTempC: 100, fanPct: 0 }
      }
    }
  ];

  function loadCustomPrinters() {
    try {
      const data = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function saveCustomPrinters(items) {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(items));
  }

  function addCustomPrinter(printer) {
    if (!printer || !printer.name) throw new Error('Druckername fehlt');
    const custom = loadCustomPrinters();
    custom.push({
      id: 'custom_' + Date.now(),
      name: String(printer.name).trim(),
      powerW: Number(printer.powerW) || 0,
      buildVolume: String(printer.buildVolume || 'unbekannt'),
      slicer: String(printer.slicer || 'manuell'),
      materials: printer.materials || {}
    });
    saveCustomPrinters(custom);
  }

  function getAllPrinters() {
    return BUILTIN_PRINTERS.concat(loadCustomPrinters());
  }

  function findPrinter(id) {
    return getAllPrinters().find((x) => x.id === id) || null;
  }

  function getPopularPrinters() {
    return BUILTIN_PRINTERS.slice(0, 3);
  }

  global.PrinterProfiles = {
    BUILTIN_PRINTERS,
    getAllPrinters,
    addCustomPrinter,
    findPrinter,
    getPopularPrinters,
    loadCustomPrinters
  };
})(window);
