// FabMargin 3D – Feature-Katalog (PrintProfit 3D Premium)
// Fünf kostenpflichtige Kernprodukte + Starter-Bundle.
// type: 'consumable'  → Credit-basiert (jeder Kauf = 1 Analyse-Credit)
//       'pack'        → Mehrfach-Credit-Pack (einmalig kaufen)
//       'onetime'     → Einmaliger Dauerkauf
//       'bundle'      → Kombiniertes Bundle

window.FEATURE_CATALOG = [

  // ── PRINT CHECK PRO ──────────────────────────────────────────────────────
  {
    id: 'feat_print_check',
    sku: 'printprofit.print_check_single',
    type: 'consumable',
    title: 'Print Check Pro',
    subtitle: 'Ausführliche Druckvorbereitung: Kompatibilität, Einstellungen, Warnungen & Checkliste.',
    price: '0,99 €',
    icon: '🔍',
    preview: 'Kostenlose Vorschau: Kompatibilitätsstatus wird sofort angezeigt.',
    whatYouGet: [
      '✓ Kompatibilitätsprüfung (Drucker, Material, Düse)',
      '✓ Die wichtigsten Einstellungen erklärt (Temp, Speed, Lüfter, Infill …)',
      '✓ Erklärungen in normaler Sprache',
      '✓ Warnungen (z. B. Filamentfeuchtigkeit)',
      '✓ Druckvorbereitung-Checkliste'
    ],
    priceNote: 'Einmalig 0,99 € pro Analyse – kein Abo.'
  },
  {
    id: 'feat_print_check_pack',
    sku: 'printprofit.print_check_pack10',
    type: 'pack',
    title: 'Print Check Pro – 10er Pack',
    subtitle: '10 Print-Check-Analysen zum Vorteilspreis.',
    price: '4,99 €',
    icon: '🔍',
    credits: 10,
    creditsFor: 'feat_print_check',
    priceNote: 'Spart 4,91 € gegenüber 10 Einzelkäufen.'
  },

  // ── PRINT DOCTOR PRO ─────────────────────────────────────────────────────
  {
    id: 'feat_print_doctor',
    sku: 'printprofit.print_doctor_single',
    type: 'consumable',
    title: 'Print Doctor Pro',
    subtitle: 'Geführte Fehlersuche: Wahrscheinlichste Ursachen, konkrete Testschritte, Ergebnisprotokoll.',
    price: '1,49 €',
    icon: '🩺',
    preview: 'Kostenlose Vorschau: Anzahl der gefundenen Ursachen wird sofort angezeigt.',
    whatYouGet: [
      '✓ Reihenfolge der Prüfungen (zuerst Wahrscheinlichstes)',
      '✓ Verständliche Erklärung je Ursache',
      '✓ Konkrete Testschritte (immer nur eine Änderung)',
      '✓ Geführte Feedback-Schleife (Besser / Gleich / Schlechter)',
      '✓ Persönliches Ergebnisprotokoll'
    ],
    priceNote: 'Einmalig 1,49 € pro Problemanalyse – kein Abo.'
  },
  {
    id: 'feat_print_doctor_pack',
    sku: 'printprofit.print_doctor_pack5',
    type: 'pack',
    title: 'Print Doctor Pro – 5er Pack',
    subtitle: '5 Problemanalysen zum Vorteilspreis.',
    price: '5,99 €',
    icon: '🩺',
    credits: 5,
    creditsFor: 'feat_print_doctor',
    priceNote: 'Spart 1,46 € gegenüber 5 Einzelkäufen.'
  },

  // ── VERIFIED PRINT PROFILE ───────────────────────────────────────────────
  {
    id: 'feat_verified_profile',
    sku: 'printprofit.verified_profile',
    type: 'consumable',
    title: 'Verified Print Profile',
    subtitle: 'Geprüftes Drucker-/Materialprofil-Paket inkl. PrintProfit Profile Guide.',
    price: '2,99 €',
    icon: '📋',
    preview: 'Vor Kauf sichtbar: Profil-ID, Drucker, Material, Slicer, Version, letzte Prüfung.',
    whatYouGet: [
      '✓ Drucker-Grundprofil (Datei 1)',
      '✓ Material-/Druckprofil (Datei 2)',
      '✓ PrintProfit Profile Guide (was wurde warum geändert)',
      '✓ Problemlösungsanleitung speziell für dieses Profil',
      '✓ Profil-Checkliste vor dem ersten Druck',
      '✓ Versionsinfo & Updatehinweise'
    ],
    disclaimer: 'Geprüftes Ausgangsprofil für die angegebene Konfiguration. Das tatsächliche Ergebnis kann durch Druckerzustand, Filament, Materialcharge, Feuchtigkeit, Umgebung, Modell und weitere Faktoren abweichen.',
    priceNote: 'Einmalig 2,99 € je Profil-Paket – kein Abo.'
  },

  // ── PROFIT CHECK PRO ─────────────────────────────────────────────────────
  {
    id: 'feat_profit_check',
    sku: 'printprofit.profit_check_single',
    type: 'consumable',
    title: 'Profit Check Pro',
    subtitle: 'Vollständige Auftragsanalyse: Kosten, Gewinn, Gewinn/Stunde & PrintProfit Score.',
    price: '0,99 €',
    icon: '💰',
    preview: 'Kostenlose Vorschau: Gesamtkosten werden sofort berechnet.',
    whatYouGet: [
      '✓ Aufschlüsselung: Material + Strom + Maschine + Arbeit + Verpackung + Gebühren + Ausschuss',
      '✓ Gewinn & Gewinn pro Druckerstunde',
      '✓ PrintProfit Score (0–100) mit Begründung',
      '✓ Warnung bei schlechtem Stundensatz trotz positivem Gewinn'
    ],
    priceNote: 'Einmalig 0,99 € pro Auftragsanalyse – kein Abo.'
  },
  {
    id: 'feat_profit_check_unlimited',
    sku: 'printprofit.profit_check_unlimited',
    type: 'onetime',
    title: 'Profit Check Unlimited',
    subtitle: 'Unbegrenzte Auftragsanalysen – einmalig kaufen, dauerhaft nutzen.',
    price: '9,99 €',
    icon: '💰',
    unlocks: ['feat_profit_check'],
    priceNote: 'Einmalige Zahlung – kein Abo, kein Ablaufdatum.'
  },

  // ── PERSONAL PRINT BRAIN ─────────────────────────────────────────────────
  {
    id: 'feat_print_brain',
    sku: 'printprofit.print_brain',
    type: 'onetime',
    title: 'Personal Print Brain',
    subtitle: 'PrintProfit lernt aus deinen Druckerfahrungen und gibt beim nächsten Druck personalisierte Empfehlungen.',
    price: '6,99 €',
    icon: '🧠',
    whatYouGet: [
      '✓ Speichert deine besten Einstellungen je Drucker/Filament-Kombination',
      '✓ Erinnerung: „Bei dir funktionierten 245 °C am besten"',
      '✓ Print Failure Memory: Warnung vor bekannten Problemen',
      '✓ Erfolgsrezept speichern & wiederholen',
      '✓ Automatische Prüfung ob sich wichtige Bedingungen geändert haben'
    ],
    priceNote: 'Einmalig 6,99 € – kein Abo. Späterer Preis: 9,99 €.'
  },

  // ── STARTER BUNDLE ───────────────────────────────────────────────────────
  {
    id: 'feat_starter_bundle',
    sku: 'printprofit.starter_bundle',
    type: 'bundle',
    title: 'PrintProfit Starter Pack',
    subtitle: 'Alles für deinen ersten optimierten und wirtschaftlich geprüften Druck.',
    price: '9,99 €',
    icon: '💎',
    regularPrice: '13,45 €',
    savings: '3,46 €',
    includes: [
      '✓ 1 Print Check',
      '✓ 1 Print Doctor',
      '✓ 1 Verified Profile',
      '✓ Profit Check Unlimited',
      '✓ Personal Print Brain'
    ],
    unlocks: ['feat_print_check', 'feat_print_doctor', 'feat_verified_profile', 'feat_profit_check_unlimited', 'feat_print_brain'],
    priceNote: 'Einmalige Zahlung – kein Abo.'
  }
];

