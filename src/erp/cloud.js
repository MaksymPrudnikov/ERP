/* ============================================================================
   Сервер — этап 4 задания «База» (docs/ЗАДАЧА_БАЗА.md, tools/supabase/schema.sql)
   IN : адрес проекта Supabase, publishable-ключ, вход человека (почта, пароль)
   OUT: cloudConfig, cloudConnect, cloudSignOut, cloudRpc, cloudState
   Адрес, ключ и сессия живут на этом устройстве (localStorage), не в базе ERP
   и не в Git: репозиторий публичный. Пароль не хранится нигде — только
   токены входа. Записи на сервер и обратно — erp/cloud-sync.js.
   ============================================================================ */
const CLOUD_KEY='glazing_system_v1-cloud';
let cloudState={busy:false,error:'',me:null};
function cloudConfig(){try{const c=JSON.parse(localStorage.getItem(CLOUD_KEY)||'null');return c&&typeof c==='object'?c:{};}catch(e){return {};}}
function cloudConfigSave(c){try{localStorage.setItem(CLOUD_KEY,JSON.stringify(c));}catch(e){}}
/* Ссылку на панель проекта (supabase.com/dashboard/project/<ref>) владелец
   прислал вместо адреса — принимаем и её. */
function cloudUrl(v){
 const s=String(v||'').trim().replace(/\/+$/,''),m=s.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
 return m?'https://'+m[1].toLowerCase()+'.supabase.co':s;
}
async function cloudFetch(path,body,token){
 const c=cloudConfig();
 if(!/^https:\/\//.test(c.url||'')||!c.key)throw new Error('Set the server and key first.');
 /* Ключ — ASCII; лишний символ при копировании ломает заголовок запроса. */
 if(/[^\x21-\x7e]/.test(c.key))throw new Error('The key has extra characters. Copy it again.');
 let r;
 try{r=await fetch(c.url+path,{method:'POST',headers:{'Content-Type':'application/json',apikey:c.key,Authorization:'Bearer '+(token||c.key)},body:JSON.stringify(body||{})});}
 catch(e){throw new Error('No connection to the server.');}
 let j=null;try{j=await r.json();}catch(e){}
 if(!r.ok)throw new Error(String(j&&(j.message||j.msg||j.error_description||j.error)||'Server error '+r.status));
 return j;
}
function cloudSessionSave(tok){
 const c=cloudConfig();
 c.session={access:tok.access_token,refresh:tok.refresh_token,exp:Date.now()+(+tok.expires_in||3600)*1000,email:tok.user&&tok.user.email||''};
 cloudConfigSave(c);
}
/* Токен живёт час: за минуту до конца — новый по refresh. */
async function cloudToken(){
 const s=cloudConfig().session;
 if(!s||!s.access)throw new Error('Not signed in to the server.');
 if(Date.now()<s.exp-60e3)return s.access;
 cloudSessionSave(await cloudFetch('/auth/v1/token?grant_type=refresh_token',{refresh_token:s.refresh}));
 return cloudConfig().session.access;
}
async function cloudRpc(fn,args){return cloudFetch('/rest/v1/rpc/'+fn,args||{},await cloudToken());}
/* Уже вошли тем же входом и пароль не введён — Connect только проверяет
   связь (раньше стирал вход: «нажал Connect ещё раз — выкинуло»). Вход
   меняется только удачным входом; другой сервер или ключ — старый вход
   снят. */
async function cloudConnect(url,key,email,password){
 const c=cloudConfig(),u=cloudUrl(url),k=String(key||'').trim(),em=String(email||'').trim();
 const same=!!c.session&&c.url===u&&c.key===k&&(!em||em===c.session.email);
 if(same&&!password){await cloudCheck();return !cloudState.error;}
 c.url=u;c.key=k;if(!same)delete c.session;cloudConfigSave(c);
 cloudState={busy:true,error:'',me:null};render();
 try{
  if(!email||!password)throw new Error('Email and password are required.');
  cloudSessionSave(await cloudFetch('/auth/v1/token?grant_type=password',{email:String(email).trim(),password}));
  cloudState.me=await cloudRpc('erp_whoami');
  if(typeof cloudSync!=='undefined'){cloudSync.loaded=false;cloudSoon();}
 }catch(e){cloudState.error=e.message;}
 cloudState.busy=false;render();
 return !cloudState.error;
}
async function cloudCheck(){
 cloudState={busy:true,error:'',me:null};render();
 try{cloudState.me=await cloudRpc('erp_whoami');}catch(e){cloudState.error=e.message;}
 cloudState.busy=false;render();
}
function cloudSignOut(){const c=cloudConfig();delete c.session;cloudConfigSave(c);cloudState={busy:false,error:'',me:null};render();}
