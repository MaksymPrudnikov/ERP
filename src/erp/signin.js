/* =====================================================================
   erp/signin  ·  signin-1.0
   Вход в офис по паролю: кто сейчас работает за этим компьютером.
   IN : DB.user (имя, пароль, галочки разделов)
   OUT: signinUser() — для журнала заказа, Finance и меню; экран входа

   Владелец, 2 октября 2026: журнал заказа должен знать «кто». Вход — имя и
   пароль из Users; входят только люди с галочками разделов и паролем. Выход — кнопкой Sign out или когда закрыты все вкладки
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
/* Галочки офиса сняли или пароль сменили, пока человек работал, — вход
   кончается: сеанс помнит версию пароля (secretKey, erp/access), при которой
   открыт. Свой пароль, сменённый самим человеком, вход обновляет. */
function signinUser(){
 const s=signinSession();if(!s||signinChecking||signinTabSid()!==s.sid)return null;
 return (DB.user||[]).find(u=>u.viewProfileId===s.userId&&userOffice(u)&&userHasPassword(u)&&s.key===secretKey(u.password))||null;
}
function signinKeyRefresh(){
 const s=signinSession();if(!s)return;
 const u=(DB.user||[]).find(x=>x.viewProfileId===s.userId);if(!u)return;
 s.key=secretKey(u.password);try{localStorage.setItem(SIGNIN_KEY,JSON.stringify(s));}catch(e){}
}
/* Смена человека за компьютером (аудит 3 октября 2026): в памяти вкладки
   остаются черновики и окна того, кто работал. Вернулся он же — работа
   продолжается; вошёл другой — черновики прежнего отменяются и страница
   открывается заново, чистой. signinOwner — чья работа сейчас в памяти. */
let signinOwner=null;
function signinMarkOwner(){const u=signinUser();if(u&&!signinOwner)signinOwner=u.viewProfileId;}
function signinFresh(){
 try{if(typeof soDraft!=='undefined'&&soDraft){if(typeof storageWriter!=='undefined'&&storageWriter&&typeof salesDraftDrop==='function')salesDraftDrop(true);else{soDraft=null;soEdit=null;}}}catch(e){}
 try{if(typeof finDraft!=='undefined'){finDraft=null;finAction=null;}}catch(e){}
 location.reload();
}
/* Первый пароль ставят только в Users (владелец, 3 октября 2026): самому
   придумать его при входе нельзя — иначе любой за компьютером займёт чужое
   имя. Поэтому вход включается, когда пароль есть хотя бы у одного человека
   с разделом Users; до тех пор входа нет, как в пустой базе: иначе дверь
   закрыта и поставить пароль некому. */
function signinOn(){return (DB.user||[]).some(u=>u.password&&(u.access||[]).includes(ACCESS_ADMIN));}
function signinNeeded(){
 if(window.GF_NO_SIGNIN||signinChecking||tab==='station')return false;
 return signinOn()&&!signinUser();
}
function signinAs(id){
 const u=(DB.user||[]).find(x=>x.viewProfileId===id);if(!u)return;
 const sid='S-'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
 try{localStorage.setItem(SIGNIN_KEY,JSON.stringify({userId:u.viewProfileId,sid,key:secretKey(u.password),at:new Date().toISOString()}));}catch(e){signinError='This browser cannot keep the sign-in.';render();return;}
 signinSetTabSid(sid);signinPick='';signinError='';
 if(signinOwner&&signinOwner!==id)return signinFresh();
 signinOwner=id;render();
}
function signinOut(){try{localStorage.removeItem(SIGNIN_KEY);}catch(e){}signinSetTabSid('');signinPick='';signinError='';render();}
/* Sign out своей кнопкой: сначала тот же вопрос, что при уходе из
   несохранённого заказа или оплаты (стражи NAV_GUARDS), — чтобы правку не
   записали на следующего вошедшего и чтобы она не пропала молча. */
function signinOutSafe(){
 signinMe=null;
 if((window.NAV_GUARDS||[]).some(g=>g('signout',signinOut)))return;
 signinOut();
}
/* Офис входит паролем от 8 символов, станция — номером и PIN (владелец,
   3 октября 2026). Пароль ставят и меняют в Users. Лимита попыток нет —
   решение владельца. */
function signinChoose(id){
 const u=(DB.user||[]).find(x=>x.viewProfileId===id);if(!u)return;
 signinPick=id;signinError='';render();signinFocus();
}
/* Поле пароля с «глазиком» (владелец, 3 октября 2026: «видеть и не видеть,
   но базово не видеть»). Нажатие меняет только тип поля — экран не
   перерисовывается, набранное остаётся; после перерисовки поле снова скрыто. */
function pwInput(attrs){
 return `<span class="pw-wrap"><input type="password" ${attrs}><button type="button" class="pw-eye" data-pw-eye aria-label="Show" aria-pressed="false" onclick="pwToggle(this)">${ico('eye')}${ico('eyeOff')}</button></span>`;
}
function pwToggle(btn){
 const inp=btn.previousElementSibling;if(!inp)return;const show=inp.type==='password';
 inp.type=show?'text':'password';btn.setAttribute('aria-pressed',String(show));btn.setAttribute('aria-label',show?'Hide':'Show');inp.focus();
}
function signinFocus(){setTimeout(()=>{const el=document.getElementById('signinPass');if(el)el.focus();},0);}
function signinSubmit(e){
 if(e)e.preventDefault();
 const u=(DB.user||[]).find(x=>x.viewProfileId===signinPick);if(!u)return;
 const pass=(document.getElementById('signinPass')||{}).value||'';
 if(userPasswordCheck(u,pass))return signinAs(u.viewProfileId);
 signinError='Wrong password';render();signinFocus();
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
   показывает только тех, у кого в Users отмечены разделы и стоит пароль; цех
   входит на своей станции номером и PIN. */
function signinOfficeUsers(){
 return (DB.user||[]).filter(u=>userOffice(u)&&u.password).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
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
  const hi=pick?esc(String(pick.name).trim().split(/\s+/)[0]):'';
  const pad=pick?`<form class="signin-pin" onsubmit="signinSubmit(event)" data-signin-form="enter">
   <label for="signinPass">Hi, <span data-raw>${hi}</span> — your password</label>
   ${pwInput('id="signinPass" autocomplete="current-password" aria-label="Password" placeholder="Password"')}
   <button type="submit" class="pri">Sign in</button>
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
 return `<button type="button" class="nav-item nav-extra nav-user" data-signin-who title="${esc(name)}" onclick="signinMeOpen()"><span class="nav-user-ini" data-raw>${esc(ini)}</span><span data-raw>${esc(name.split(/\s+/)[0]||name)}</span></button>`;
}
/* Своё имя внизу меню → окно: сменить свой пароль или выйти (владелец,
   3 октября 2026: «свой пароль — только для офиса; продакшн — то, что даст
   офис»). PIN станции человек сам не меняет — его выдаёт офис в Users. */
let signinMe=null;
function signinMeOpen(){if(!signinUser())return;signinMe={error:''};render();setTimeout(()=>{const el=document.getElementById('meOld');if(el)el.focus();},0);}
function signinMeClose(){signinMe=null;render();}
function signinMeHTML(){
 const u=signinUser();if(!signinMe||!u)return '';
 return `<div class="sales-service-modal-back sales-dialog-back" onclick="if(event.target===this)signinMeClose()"><div class="sales-service-modal sales-dialog signin-me" role="dialog" aria-modal="true" aria-label="Your account" data-signin-me>
  <div class="sales-service-modal-head"><div><span>Signed in</span><h3 data-raw>${esc(u.name)}</h3></div><button type="button" aria-label="Close" onclick="signinMeClose()">×</button></div>
  <form class="sales-dialog-body signin-me-form" onsubmit="signinMeSave(event)">
   <label>Change password</label>
   ${pwInput('id="meOld" autocomplete="current-password" placeholder="Current password"')}
   ${pwInput(`id="meNew" autocomplete="new-password" placeholder="New · ${USER_PASSWORD_MIN}+ characters"`)}
   ${pwInput('id="meNew2" autocomplete="new-password" placeholder="Repeat new"')}
   <div class="signin-err" role="alert">${esc(signinMe.error)}</div>
   <div class="row"><button type="submit" class="pri">Change password</button><span class="sp"></span><button type="button" data-signin-out onclick="signinOutSafe()">Sign out</button></div>
  </form></div></div>`;
}
function signinMeSave(e){
 if(e)e.preventDefault();
 if(!signinUser()||!signinMe)return;
 const v=id=>(document.getElementById(id)||{}).value||'',old=v('meOld'),next=v('meNew');
 const fail=m=>{signinMe.error=m;render();};
 if(next!==v('meNew2'))return fail(next.length<USER_PASSWORD_MIN?'At least '+USER_PASSWORD_MIN+' characters':'Passwords differ');
 storageWhenWriter(()=>{
  const r=usersChangeOwnPassword(old,next);
  if(r.ok){signinMe=null;render();}else fail(r.error);
 });
}
(window.APP_OVERLAYS=window.APP_OVERLAYS||[]).push(signinMeHTML);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&signinMe)signinMeClose();});
/* Вход и выход в другой вкладке того же браузера — сразу и здесь. Вошёл
   другой человек — эта вкладка открывается заново, чистой (signinFresh);
   экран станции живёт своим входом и не трогается. */
window.addEventListener('storage',function(e){
 if(e.key!==SIGNIN_KEY)return;
 const s=signinSession();signinSetTabSid(s?s.sid:'');signinPick='';signinError='';signinMe=null;
 if(s&&signinOwner&&s.userId!==signinOwner&&tab!=='station')return signinFresh();
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
