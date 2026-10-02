/* =====================================================================
   erp/signin  ·  signin-1.0
   Вход в офис по паролю: кто сейчас работает за этим компьютером.
   IN : DB.user (имя, пароль, галочки разделов)
   OUT: signinUser() — для журнала заказа, Finance и меню; экран входа

   Владелец, 2 октября 2026: журнал заказа должен знать «кто». Вход — имя и
   пароль из Users; входят только люди с галочками разделов. Выход — кнопкой Sign out или когда закрыты все вкладки
   браузера; по простою не выходит: «резчик может пол дня разгружать трак».
   F5 входа не сбрасывает. Экран станции (#station=…) входит номером и PIN.

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
/* Галочки офиса сняли, пока человек работал, — вход кончается сразу. */
function signinUser(){
 const s=signinSession();if(!s||signinChecking||signinTabSid()!==s.sid)return null;
 return (DB.user||[]).find(u=>u.viewProfileId===s.userId&&userOffice(u))||null;
}
/* Офисных людей нет — входа нет, как в пустой базе: иначе дверь закрыта и
   завести первого человека некому. */
function signinNeeded(){
 if(window.GF_NO_SIGNIN||signinChecking||tab==='station')return false;
 return signinOfficeUsers().length>0&&!signinUser();
}
function signinAs(id){
 const u=(DB.user||[]).find(x=>x.viewProfileId===id);if(!u)return;
 const sid='S-'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
 try{localStorage.setItem(SIGNIN_KEY,JSON.stringify({userId:u.viewProfileId,sid,at:new Date().toISOString()}));}catch(e){signinError='This browser cannot keep the sign-in.';render();return;}
 signinSetTabSid(sid);signinPick='';signinError='';render();
}
function signinOut(){try{localStorage.removeItem(SIGNIN_KEY);}catch(e){}signinSetTabSid('');signinPick='';signinError='';render();}
/* Офис входит паролем от 8 символов, станция — номером и PIN (владелец,
   3 октября 2026). Пароля ещё нет — человек задаёт его при первом входе
   (дважды); сбросить можно в Users. Лимита попыток нет — решение владельца. */
function signinChoose(id){
 const u=(DB.user||[]).find(x=>x.viewProfileId===id);if(!u)return;
 signinPick=id;signinError='';render();signinFocus();
}
function signinFocus(){setTimeout(()=>{const el=document.getElementById('signinPass');if(el)el.focus();},0);}
function signinSubmit(e){
 if(e)e.preventDefault();
 const u=(DB.user||[]).find(x=>x.viewProfileId===signinPick);if(!u)return;
 const pass=(document.getElementById('signinPass')||{}).value||'',again=document.getElementById('signinPass2');
 const fail=msg=>{signinError=msg;render();signinFocus();};
 if(!u.passwordHash){
  if(pass.length<USER_PASSWORD_MIN)return fail('At least '+USER_PASSWORD_MIN+' characters');
  if(!again||again.value!==pass)return fail('Passwords differ');
  const id=u.viewProfileId;
  storageWhenWriter(()=>{
   const out=storageCommand(()=>{const now=(DB.user||[]).find(x=>x.viewProfileId===id);if(!now)throw new Error('User not found');userPasswordSet(now,pass);return true;});
   if(out.ok)signinAs(id);else fail(out.error||'Not saved');
  });
  return;
 }
 if(userPasswordCheck(u,pass))return signinAs(u.viewProfileId);
 fail('Wrong password');
}
/* Экран входа не должен быть «одиноким и холодным» (владелец, 2 октября
   2026): приветствие по времени суток, дата, кружки с инициалами своего цвета. */
function signinGreeting(){const h=new Date().getHours();return h>=5&&h<12?'Good morning':h>=12&&h<18?'Good afternoon':'Good evening';}
function signinClock(){return new Date().toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit',hour12:false});}
/* Часы на входе идут сами: меняется только текст, экран не перерисовывается. */
setInterval(()=>{const t=signinClock();document.querySelectorAll('[data-signin-clock]').forEach(el=>{if(el.textContent!==t)el.textContent=t;});},10000);
function signinToday(){return new Date().toLocaleDateString('en-CA',{weekday:'long',month:'long',day:'numeric'});}
function signinInitials(name){return String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';}
/* Первая строка карточки — сама компания (Master Data → Company): название,
   дата, время. Логотип — только настоящий, загруженный в Company; инициалы
   владелец убрал: «не туда и не сюда» (3 октября 2026). */
function signinBrandHTML(){
 const c=DB.company||{},name=String(c.legalName||'').trim()||'Glass Farm';
 const mark=c.logo?`<img class="signin-logo" src="${esc(c.logo)}" alt="">`:'';
 return `<div class="signin-brand" data-signin-brand>${mark}<span class="signin-brand-text"><b data-raw>${esc(name)}</b><small>${esc(signinToday())}</small></span><span class="signin-clock" data-signin-clock>${esc(signinClock())}</span></div>`;
}
function signinTone(name){let h=0;for(const c of String(name||''))h=(h*31+c.charCodeAt(0))>>>0;return 'tone-'+(h%4);}
/* В офисе ~11 человек, в цеху 10–20 (владелец, 2 октября 2026): офисный вход
   показывает только тех, у кого в Users отмечены разделы; цех входит на своей
   станции номером и PIN. */
function signinOfficeUsers(){
 return (DB.user||[]).filter(userOffice).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
/* Office / Production (владелец, 2 октября 2026): «производство не должно
   видеть имена всех, кто в офисе». Production — только станции, имён нет;
   человек входит уже на экране своей станции. Выбор помнит этот браузер:
   компьютер в цеху открывается сразу на Production. */
const SIGNIN_SIDE_KEY='glass_farm_signin_side';
function signinSide(){try{return localStorage.getItem(SIGNIN_SIDE_KEY)==='production'?'production':'office';}catch(e){return 'office';}}
function signinSetSide(v){try{localStorage.setItem(SIGNIN_SIDE_KEY,v==='production'?'production':'office');}catch(e){}signinPick='';signinError='';render();}
function signinStation(code){try{localStorage.setItem(SIGNIN_SIDE_KEY,'production');}catch(e){}location.hash='station='+code;}
function signinView(){
 const side=signinSide();
 const sw=`<div class="signin-side" role="tablist">${[['office','Office'],['production','Production']].map(([k,l])=>`<button type="button" role="tab" aria-selected="${side===k}" class="${side===k?'on':''}" data-signin-side="${k}" onclick="signinSetSide('${k}')">${l}</button>`).join('')}</div>`;
 let body;
 if(side==='production'){
  body=`<p class="signin-sub">Choose your station</p>
  <div class="signin-names signin-stations">${(DB.station||[]).map(s=>`<button type="button" class="signin-name" data-signin-station="${esc(s.code)}" onclick="signinStation('${esc(s.code)}')"><span class="signin-code" data-raw>${esc(s.code)}</span><span class="signin-who"><b>${sfLabel(s)}</b></span></button>`).join('')}</div>`;
 }else{
  const users=signinOfficeUsers(),pick=users.find(u=>u.viewProfileId===signinPick);
  const first=pick&&!pick.passwordHash,hi=pick?esc(String(pick.name).trim().split(/\s+/)[0]):'';
  const pad=pick?`<form class="signin-pin" onsubmit="signinSubmit(event)" data-signin-form="${first?'create':'enter'}">
   <label for="signinPass">Hi, <span data-raw>${hi}</span> — ${first?'set your password · '+USER_PASSWORD_MIN+'+ characters':'your password'}</label>
   <input id="signinPass" type="password" autocomplete="${first?'new-password':'current-password'}" aria-label="Password" placeholder="Password">
   ${first?'<input id="signinPass2" type="password" autocomplete="new-password" aria-label="Repeat password" placeholder="Repeat password">':''}
   <button type="submit" class="pri">${first?'Set and sign in':'Sign in'}</button>
   <div class="signin-err" role="alert">${esc(signinError)}</div></form>`:'';
  body=`<p class="signin-sub">Who is working?</p>
  <div class="signin-names">${users.map(u=>`<button type="button" class="signin-name${u.viewProfileId===signinPick?' on':''}" data-signin-user="${esc(u.viewProfileId)}" onclick="signinChoose('${esc(u.viewProfileId)}')"><span class="signin-av ${signinTone(u.name)}" data-raw>${esc(signinInitials(u.name))}</span><span class="signin-who"><b data-raw>${esc(u.name)}</b></span></button>`).join('')}</div>${pad}`;
 }
 return `<div class="signin"><div class="signin-glass" aria-hidden="true"><i></i><i class="g-bronze"></i><i class="g-blue"></i><i class="g-gray"></i><i class="g-frost"></i><i></i></div><div class="signin-wrap">
  <div class="signin-card">${signinBrandHTML()}${sw}<h2>${esc(signinGreeting())}</h2>${body}</div></div></div>`;
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
