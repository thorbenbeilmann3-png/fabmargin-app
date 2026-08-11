// FabMargin 3D – Feature-Katalog
// Pro-Version = Grundzugang (kostenlos nach App-Kauf im Play Store).
// Alle weiteren Module kostenpflichtig als In-App-Käufe.
window.FEATURE_CATALOG = [
  { id:'feat_pro_base', sku:'fabmargin.pro_base', title:'Pro-Grundzugang',
    subtitle:'Bereits enthalten: Login, Master-Passwort-Tresor, Community',
    price:'enthalten', icon:'⭐', included:true },
  { id:'feat_calc_pro', sku:'fabmargin.calc_pro', title:'Kalkulations-Modul Pro',
    subtitle:'Detaillierte Preis- und Margenkalkulation für 3D-Drucke',
    price:'4,99 €', icon:'📊', contentFile:'content/calc_pro.enc' },
  { id:'feat_material_db', sku:'fabmargin.material_db', title:'Material-Datenbank',
    subtitle:'Über 200 Filamente & Resins mit Preisen und Eigenschaften',
    price:'3,99 €', icon:'🧪', contentFile:'content/material_db.enc' },
  { id:'feat_customer_mgr', sku:'fabmargin.customer_mgr', title:'Kundenverwaltung',
    subtitle:'Kunden, Aufträge und Rechnungen verschlüsselt speichern',
    price:'5,99 €', icon:'👥', contentFile:'content/customer_mgr.enc' },
  { id:'feat_invoice', sku:'fabmargin.invoice', title:'Rechnungsgenerator',
    subtitle:'PDF-Rechnungen mit Ihrem Logo, DSGVO-konform',
    price:'6,99 €', icon:'🧾', contentFile:'content/invoice.enc' },
  { id:'feat_analytics', sku:'fabmargin.analytics', title:'Auswertungen & Statistiken',
    subtitle:'Umsatz, Gewinn und Auslastung im Blick',
    price:'4,99 €', icon:'📈', contentFile:'content/analytics.enc' },
  { id:'feat_bundle_all', sku:'fabmargin.bundle_all', title:'Komplett-Bundle',
    subtitle:'Alle Zusatzmodule in einem Kauf – ca. 40% Ersparnis',
    price:'16,99 €', icon:'💎',
    unlocks:['feat_calc_pro','feat_material_db','feat_customer_mgr','feat_invoice','feat_analytics'] }
];

// Premium-Funktionen die Credits verbrauchen (kein Einzel-Kauf nötig)
window.CREDIT_FEATURES = [
  { id:'cf_print_check',   title:'Print Check Pro',           icon:'🔍', credits:1, subtitle:'KI-gestützte Prüfung deines Drucks auf Fehlerquellen' },
  { id:'cf_print_doctor',  title:'Print Doctor Pro',          icon:'🩺', credits:2, subtitle:'Diagnose & Lösungsvorschläge für Druckprobleme' },
  { id:'cf_verified_profile', title:'Verified Print Profile', icon:'📄', credits:3, subtitle:'Zertifiziertes Druckerprofil für dein Gerät' },
  { id:'cf_profit_check',  title:'Profit Check Pro',          icon:'💰', credits:1, subtitle:'Detaillierte Gewinn- und Kostenanalyse per Auftrag' },
  { id:'cf_print_brain',   title:'Personal Print Brain',      icon:'🧠', credits:7, subtitle:'Freischalten (einmalig): KI-Assistent der mitdenkt', oneTime:true }
];
