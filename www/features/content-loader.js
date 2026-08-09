// FabMargin 3D – Verschlüsselter Content-Loader
// Alle Feature-Inhalte liegen als *.enc-Dateien im APK vor. Ohne
// entsperrten Tresor werden sie nicht entschlüsselt.
(function (global) {
  // Content-Schlüssel wird zur Laufzeit aus dem Master-Passwort + Konstante abgeleitet.
  // Vorteil: Ohne Master-Passwort im RAM kein Zugriff auf Modulinhalte.
  const CONTENT_KEY_BASE = 'fabmargin-content-demo-2026';

  async function loadEncrypted(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error('Content nicht gefunden: ' + path);
    return await res.json();
  }

  function getContentKey() {
    // In dieser Version fest, damit die vorgepackten .enc-Dateien lesbar sind.
    // Im Produktivbetrieb: aus Master-Passwort + Salt via HKDF ableiten.
    return CONTENT_KEY_BASE;
  }

  async function openFeature(featureId) {
    if (!window.FabVault || !window.FabVault.isUnlocked()) {
      throw new Error('Tresor gesperrt – App zuerst entsperren.');
    }
    if (!window.PurchaseManager.isOwned(featureId)) {
      throw new Error('Dieses Modul ist noch nicht gekauft.');
    }
    const feature = window.FEATURE_CATALOG.find(f => f.id === featureId);
    if (!feature || !feature.contentFile) throw new Error('Kein Inhalt hinterlegt.');

    const bundle = await loadEncrypted(feature.contentFile);
    const plaintext = await window.FabVault.decrypt(bundle, getContentKey());
    return JSON.parse(plaintext);
  }

  global.ContentLoader = { openFeature, loadEncrypted };
})(window);
