// FabMargin 3D – Android-App-Bridge
// Wird zusätzlich zur index.html geladen. Setzt Capacitor-Anpassungen (StatusBar, Back-Button)
// und stellt den in der App gespeicherten Backend-URL global bereit.
(function () {
  const BACKEND_KEY = 'fabmargin_backend_url';

  // Backend-URL aus localStorage laden (wird vom Admin-Panel gesetzt)
  window.FABMARGIN_BACKEND = localStorage.getItem(BACKEND_KEY) || '';

  // Wenn Capacitor verfügbar ist (also in der Android-App), Status-Bar & Back-Button initialisieren
  document.addEventListener('deviceready', initNative, false);
  if (window.Capacitor) initNative();

  function initNative() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins) {
        const { StatusBar, App } = window.Capacitor.Plugins;
        if (StatusBar && StatusBar.setBackgroundColor) {
          StatusBar.setBackgroundColor({ color: '#0f0f0f' }).catch(() => {});
          StatusBar.setStyle({ style: 'LIGHT' }).catch(() => {});
        }
        if (App && App.addListener) {
          App.addListener('backButton', () => {
            if (history.length > 1) history.back();
            else App.exitApp();
          });
        }
      }
    } catch (e) {
      console.warn('Native-Init übersprungen:', e);
    }
  }
})();
