// FabMargin 3D – Client-seitige Integritätsprüfung
(function(g){
  async function check(){
    const flags=[];
    // Debug-Modus
    if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()){
      try{
        if(window.Capacitor.Plugins&&window.Capacitor.Plugins.Device){
          const info=await window.Capacitor.Plugins.Device.getInfo();
          if(info.isVirtual) flags.push('emulator');
        }
      }catch{}
    }
    // Auffällig veränderter User-Agent
    if(/HeadlessChrome|PhantomJS|Selenium|puppeteer/i.test(navigator.userAgent)) flags.push('headless');
    // WebDriver aktiv
    if(navigator.webdriver) flags.push('webdriver');
    // Report an Server
    if(flags.length){
      try{
        const be=localStorage.getItem('fabmargin_backend_url')||'';
        if(be) await fetch(be+'/security/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({flags,ua:navigator.userAgent,ts:Date.now()})});
      }catch{}
    }
    return {ok:flags.length===0,flags};
  }
  g.Integrity={check};
})(window);
