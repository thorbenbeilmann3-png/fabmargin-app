// FabMargin 3D – Beta-Tester & Anti-Piracy Erweiterung
(function(g){
  // Beta-Token aus URL lesen und Beta-Screen anzeigen
  function checkBetaToken(){
    const params=new URLSearchParams(location.search);
    const token=params.get('token');
    if(!token) return false;
    const screen=document.getElementById('screenBeta');
    if(!screen) return false;
    // Alle anderen Screens verstecken
    document.querySelectorAll('body>section').forEach(s=>s.classList.add('hidden'));
    screen.classList.remove('hidden');
    window.scrollTo(0,0);
    const info=document.getElementById('betaInviteInfo');
    if(info) info.textContent='Einladungstoken: …'+token.slice(-8)+' – Klicke auf "Beta aktivieren" um fortzufahren.';
    const btn=document.getElementById('betaActivateBtn');
    const status=document.getElementById('betaActivateStatus');
    if(btn){
      btn.onclick=async()=>{
        btn.disabled=true;
        if(status) status.textContent='Aktiviere…';
        const be=localStorage.getItem('fabmargin_backend_url')||'';
        if(!be){ if(status) status.textContent='⚠️ Bitte zuerst Backend-URL im Admin-Bereich eintragen.'; btn.disabled=false; return; }
        try{
          const r=await fetch(be+'/beta/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
          const j=await r.json();
          if(j.ok){
            localStorage.setItem('fabmargin_beta_role','beta');
            localStorage.setItem('fabmargin_beta_name',j.name||'');
            if(status) status.textContent='✅ Beta-Zugang aktiviert! Willkommen, '+(j.name||'Beta-Tester')+'!';
            btn.textContent='✅ Aktiviert';
            setTimeout(()=>{ history.replaceState(null,'',location.pathname); location.reload(); },1800);
          } else {
            if(status) status.textContent='❌ '+(j.error||'Fehler beim Aktivieren');
            btn.disabled=false;
          }
        }catch(e){ if(status) status.textContent='❌ Netzwerkfehler: '+e.message; btn.disabled=false; }
      };
    }
    return true;
  }

  document.addEventListener('DOMContentLoaded',()=>{ checkBetaToken(); });
  g.BetaSystem={checkBetaToken};
})(window);
