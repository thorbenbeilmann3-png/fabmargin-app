// FabMargin 3D – Kunden-Login mit einmaligem Aktivierungscode
(function(g){
  const KEY='fabmargin_user_v1';
  function get(){try{return JSON.parse(localStorage.getItem(KEY))||null}catch{return null}}
  function set(o){localStorage.setItem(KEY,JSON.stringify(o))}
  function clear(){localStorage.removeItem(KEY)}
  async function activate(code,username,password,email){
    const be=localStorage.getItem('fabmargin_backend_url')||'';
    if(!be) throw new Error('Backend nicht eingestellt');
    const r=await fetch(be+'/user/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,username,password,email})});
    const j=await r.json();
    if(!j.ok) throw new Error(j.error||'Aktivierung fehlgeschlagen');
    set({username,email,token:j.token,activatedAt:new Date().toISOString()});
    return j;
  }
  async function login(username,password){
    const be=localStorage.getItem('fabmargin_backend_url')||'';
    const r=await fetch(be+'/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
    const j=await r.json();
    if(!j.ok) throw new Error(j.error||'Login fehlgeschlagen');
    set({username,token:j.token,loggedInAt:new Date().toISOString()});
    return j;
  }
  function logout(){clear()}
  function current(){return get()}
  function isLoggedIn(){return !!(get()&&get().token)}
  g.UserAuth={activate,login,logout,current,isLoggedIn};
})(window);
