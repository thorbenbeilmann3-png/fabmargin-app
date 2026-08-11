// FabMargin 3D – Community-Abstimmungen
(function(g){
  async function api(path,method='GET',body=null){
    const be=localStorage.getItem('fabmargin_backend_url')||'';
    const u=window.UserAuth.current();
    const h={'Content-Type':'application/json'};
    if(u&&u.token) h.Authorization='Bearer '+u.token;
    const r=await fetch(be+path,{method,headers:h,body:body?JSON.stringify(body):null});
    return r.json();
  }
  const list=()=>api('/community/list');
  const post=(title,text,force=false)=>api('/community/post','POST',{title,text,force});
  const vote=(id,dir)=>api('/community/vote','POST',{id,dir});
  const report=(ideaId,reason)=>api('/community/report','POST',{ideaId,reason});
  g.Community={list,post,vote,report};
})(window);
