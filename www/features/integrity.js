// FabMargin 3D – Client-seitige Integritätsprüfung + Anti-Piracy
(function(g){
  // Eindeutige Instanz-ID erstellen oder laden
  function getInstanceId(){
    let id=localStorage.getItem('fabmargin_instance_id');
    if(!id){ id=([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^(crypto.getRandomValues(new Uint8Array(1))[0]&(15>>c/4))).toString(16)); localStorage.setItem('fabmargin_instance_id',id); }
    return id;
  }

  async function checkIntegrity(){
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
    // Anti-Tamper: prüfe ob wichtige Funktionen noch intakt sind
    if(typeof g.CryptoVault==='undefined') flags.push('tamper_vault');
    // Report an Server
    const be=localStorage.getItem('fabmargin_backend_url')||'';
    if(flags.length&&be){
      try{ await fetch(be+'/security/report-violation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({flags,ua:navigator.userAgent,ts:Date.now()})}); }catch{}
    }
    return {ok:flags.length===0,flags};
  }

  async function checkAntiPiracy(){
    const be=localStorage.getItem('fabmargin_backend_url')||'';
    if(!be) return {ok:true};
    const instanceId=getInstanceId();
    try{
      const r=await fetch(be+'/security/check-integrity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instanceId})});
      const j=await r.json();
      if(j.blocked){
        // App sperren
        const ov=document.getElementById('piracyOverlay');
        if(ov){ ov.style.display='flex'; document.body.style.overflow='hidden'; }
        return {ok:false,blocked:true};
      }
      return {ok:true};
    }catch{ return {ok:true}; }
  }

  async function check(){
    const integrity=await checkIntegrity();
    const piracy=await checkAntiPiracy();
    return {ok:integrity.ok&&piracy.ok,flags:integrity.flags,blocked:piracy.blocked||false};
  }

  g.Integrity={check,getInstanceId,checkAntiPiracy};
})(window);
