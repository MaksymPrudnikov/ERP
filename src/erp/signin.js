/* =====================================================================
   erp/signin  ·  signin-1.0
   Вход в офис по PIN: кто сейчас работает за этим компьютером.
   IN : DB.user (имя, PIN — тот же, что на станции)
   OUT: signinUser() — для журнала заказа и Finance; экран входа; имя в шапке

   Владелец, 2 октября 2026: журнал заказа должен знать «кто». Вход — имя и
   PIN из Users. Выход — кнопкой Sign out или когда закрыты все вкладки
   браузера; по простою не выходит: «резчик может пол дня разгружать трак».
   F5 входа не сбрасывает. Экран станции (#station=…) входит своим PIN.

   Как узнаём «браузер закрывали»: каждая открытая вкладка держит общий
   замок SIGNIN_LOCK. Новая вкладка смотрит, держит ли его кто-то ещё: да —
   браузер жив, вход продолжается; нет — вход сброшен. Своя вкладка после F5
   узнаёт себя по номеру сеанса в sessionStorage.
   ===================================================================== */
const SIGNIN_KEY='glass_farm_signin',SIGNIN_TAB_KEY='glass_farm_signin_tab',SIGNIN_LOCK='glass_farm_open';
let signinPick='',signinError='',signinChecking=false;
function signinSession(){try{const s=JSON.parse(localStorage.getItem(SIGNIN_KEY)||'null');return s&&typeof s==='object'&&s.userId&&s.sid?s:null;}catch(e){return null;}}
function signinTabSid(){try{return sessionStorage.getItem(SIGNIN_TAB_KEY)||'';}catch(e){return '';}}
function signinSetTabSid(sid){try{if(sid)sessionStorage.setItem(SIGNIN_TAB_KEY,sid);else sessionStorage.removeItem(SIGNIN_TAB_KEY);}catch(e){}}
function signinUser(){
 const s=signinSession();if(!s||signinChecking||signinTabSid()!==s.sid)return null;
 return (DB.user||[]).find(u=>u.viewProfileId===s.userId)||null;
}
function signinNeeded(){
 if(window.GF_NO_SIGNIN||signinChecking||tab==='station')return false;
 return (DB.user||[]).length>0&&!signinUser();
}
function signinAs(id){
 const u=(DB.user||[]).find(x=>x.viewProfileId===id);if(!u)return;
 const sid='S-'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
 try{localStorage.setItem(SIGNIN_KEY,JSON.stringify({userId:u.viewProfileId,sid,at:new Date().toISOString()}));}catch(e){signinError='This browser cannot keep the sign-in.';render();return;}
 signinSetTabSid(sid);signinPick='';signinError='';render();
}
function signinOut(){try{localStorage.removeItem(SIGNIN_KEY);}catch(e){}signinSetTabSid('');signinPick='';signinError='';render();}
function signinChoose(id){
 const u=(DB.user||[]).find(x=>x.viewProfileId===id);if(!u)return;
 if(!u.pin)return signinAs(id);
 signinPick=id;signinError='';render();
 setTimeout(()=>{const el=document.getElementById('signinPin');if(el)el.focus();},0);
}
function signinPinInput(el){
 el.value=el.value.replace(/\D/g,'').slice(0,4);
 if(el.value.length<4)return;
 const u=(DB.user||[]).find(x=>x.viewProfileId===signinPick);
 if(u&&el.value===u.pin)return signinAs(u.viewProfileId);
 signinError='Wrong PIN';render();
 setTimeout(()=>{const p=document.getElementById('signinPin');if(p)p.focus();},0);
}
/* В офисе ~11 человек, в цеху 10–20 (владелец, 2 октября 2026): офисный вход
   показывает только офисные роли, цех входит на своей станции. Нет ни одного
   офисного — показываем всех, чтобы не остаться перед закрытой дверью. */
function signinOfficeUsers(){
 const all=DB.user||[],office=all.filter(u=>u.role!=='Shop');
 return (office.length?office:all).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
function signinView(){
 const users=signinOfficeUsers();
 const pick=users.find(u=>u.viewProfileId===signinPick);
 const pad=pick?`<div class="signin-pin"><label for="signinPin">PIN · <span data-raw>${esc(pick.name)}</span></label>
   <input id="signinPin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" oninput="signinPinInput(this)">
   ${signinError?`<div class="signin-err" role="alert">${esc(signinError)}</div>`:''}</div>`:'';
 return `<div class="signin"><div class="signin-card"><h2>Who is working?</h2>
  <div class="signin-names">${users.map(u=>`<button type="button" class="signin-name${u.viewProfileId===signinPick?' on':''}" data-signin-user="${esc(u.viewProfileId)}" onclick="signinChoose('${esc(u.viewProfileId)}')"><b data-raw>${esc(u.name)}</b><small>${esc(u.role||'')}</small></button>`).join('')}</div>
  ${pad}</div></div>`;
}
/* Кто вошёл — внизу левого меню (шапки на экране нет); на планшете — в More. */
function signinNavHTML(){
 const u=signinUser();if(!u)return '';
 const name=String(u.name||'').trim(),ini=name.split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase()||'?';
 return `<button type="button" class="nav-item nav-extra nav-user" data-signin-who title="${esc(name)} · Sign out" onclick="signinOutAsk()"><span class="nav-user-ini" data-raw>${esc(ini)}</span><span data-raw>${esc(name.split(/\s+/)[0]||name)}</span></button>`;
}
function signinOutAsk(){const u=signinUser();if(u&&confirm('Sign out '+u.name+'?'))signinOut();}
/* Вход и выход в другой вкладке того же браузера — сразу и здесь. */
window.addEventListener('storage',function(e){
 if(e.key!==SIGNIN_KEY)return;
 const s=signinSession();signinSetTabSid(s?s.sid:'');signinPick='';signinError='';
 if(typeof storageStarting==='undefined'||!storageStarting)(typeof storageRerender==='function'?storageRerender:render)();
});
(function signinStart(){
 const s=signinSession();
 const hold=()=>{try{navigator.locks.request(SIGNIN_LOCK,{mode:'shared'},()=>new Promise(()=>{})).catch(()=>{});}catch(e){}};
 if(!navigator.locks){if(s&&!signinTabSid())signinSetTabSid(s.sid);return;}
 if(!s||signinTabSid()===s.sid){hold();return;}
 signinChecking=true;
 navigator.locks.query().then(q=>(q.held||[]).some(l=>l.name===SIGNIN_LOCK)).catch(()=>false).then(alive=>{
  const now=signinSession();
  if(alive&&now)signinSetTabSid(now.sid);
  else if(now&&now.sid===s.sid){try{localStorage.removeItem(SIGNIN_KEY);}catch(e){}}
  signinChecking=false;hold();
  if(typeof storageStarting!=='undefined'&&!storageStarting)render();
 });
})();
