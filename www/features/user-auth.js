// FabMargin 3D – Kunden-Login mit einmaligem Aktivierungscode
(function(g){
  const KEY='fabmargin_user_v1';
  function get(){try{return JSON.parse(localStorage.getItem(KEY))||null}catch{return null}}
  function set(o){localStorage.setItem(KEY,JSON.stringify(o))}
  function clear(){localStorage.removeItem(KEY)}
  function beUrl(){return localStorage.getItem('fabmargin_backend_url')||'';}
  async function register(username,email,password,code){
    const be=beUrl();
    if(!be) throw new Error('Backend nicht eingestellt');
    const r=await fetch(be+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,email,password,code})});
    const j=await r.json();
    if(!j.ok) throw new Error(j.error||'Registrierung fehlgeschlagen');
    set({username,email,token:j.token,loggedInAt:new Date().toISOString()});
    return j;
  }
  async function activate(code,username,password,email){
    return register(username,email,password,code);
  }
  async function login(username,password,totpCode){
    const be=beUrl();
    if(!be) throw new Error('Backend nicht eingestellt');
    const r=await fetch(be+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,totpCode})});
    const j=await r.json();
    if(!j.ok) throw new Error(j.error||'Login fehlgeschlagen');
    const prev=get()||{};
    set({...prev,username:j.username||username,token:j.token,loggedInAt:new Date().toISOString()});
    return j;
  }
  async function logout(){
    const be=beUrl();
    const u=get();
    if(be&&u&&u.token){try{await fetch(be+'/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+u.token}});}catch{}}
    clear();
  }
  async function profile(){
    const be=beUrl();
    const u=get();
    if(!be||!u||!u.token) throw new Error('Nicht angemeldet');
    const r=await fetch(be+'/auth/profile',{headers:{Authorization:'Bearer '+u.token}});
    const j=await r.json();
    if(!j.ok) throw new Error(j.error||'Profilabruf fehlgeschlagen');
    return j;
  }
  function current(){return get()}
  function isLoggedIn(){return !!(get()&&get().token)}
  g.UserAuth={register,activate,login,logout,profile,current,isLoggedIn};
})(window);
