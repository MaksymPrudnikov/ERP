/* Users — команды под будущую базу (аудит ChatGPT 3 октября 2026, владелец:
   «делай одним PR»). Каждый сценарий аудита воспроизводится и больше не
   проходит: восстановление базы без Users, выключение входа снятием
   последнего администратора с паролем, перезапись чужой правки старой
   формой, чужой черновик заказа следующему человеку, журнал заказа без
   Sales, потеря формы при ошибке записи, вход после смены пароля / PIN. */
module.exports=async function({page,eq}){
 console.log('users commands');
 const t=await page(undefined,undefined,{signin:true});
 const started=p=>p.waitForFunction(()=>typeof storageStarting!=='undefined'&&!storageStarting&&!signinChecking);
 await started(t.p);
 await require('./optimization-fixture')(t.p);
 const setup=()=>{
  /* Правка через команду, как это делает форма: актуальная версия записи. */
  window.ucSave=async(name,patch)=>{const u=DB.user.find(x=>x.name===name);return await usersSave(Object.assign({id:u.viewProfileId,rev:u.rev,name:u.name,no:userNoText(u),office:userOffice(u),access:u.access,station:userHasPin(u)},patch||{}));};
  window.ucId=name=>DB.user.find(x=>x.name===name).viewProfileId;
  /* Сменить человека внутри одного шага проверки, без перезагрузки: её
     проверяет отдельный сценарий с двумя вкладками ниже. */
  window.ucAs=name=>{signinOwner=null;signinOut();signinAs(ucId(name));};
 };
 await t.p.evaluate(setup);

 eq('команды: без входа можно всё; Owner и Sales получают пароли, вход включается',await t.p.evaluate(async()=>{
  const sales=(await ucSave('Demo Sales',{password:'sales-pass-12'})).ok,owner=(await ucSave('Demo Owner',{password:'owner-pass-1'})).ok;
  const on=signinOn();signinAs(ucId('Demo Owner'));return {sales,owner,on,who:signinUser()&&signinUser().name};
 }),{sales:true,owner:true,on:true,who:'Demo Owner'});

 /* 1. Восстановление базы — только администратор. */
 eq('Restore pre-import backup без Users: кнопки нет, замена отказывает и база прежняя',await t.p.evaluate(async()=>{
  const env=storageExportEnvelope(),copy=JSON.parse(JSON.stringify(env));copy.data.user.forEach(u=>{u.access=USER_SECTIONS.slice();});
  localStorage.setItem(STORAGE_BACKUP_KEY,JSON.stringify(copy));storageBackupPresent=true;
  const admin=storageStatusHTML().includes('Restore pre-import backup');
  ucAs('Demo Sales');
  const before=JSON.stringify(DB),msgs=[],al=window.alert;window.alert=m=>msgs.push(m);
  const button=storageStatusHTML().includes('Restore pre-import backup'),restored=storageRestoreBackup(),imported=storageImportState(copy);window.alert=al;
  const out={admin,button,restored,imported,same:JSON.stringify(DB)===before,alert:msgs[0],can:accessCan('users')};
  localStorage.removeItem(STORAGE_BACKUP_KEY);storageBackupPresent=false;ucAs('Demo Owner');return out;
 }),{admin:true,button:false,restored:false,imported:false,same:true,alert:'Users access needed to replace the database.',can:false});

 /* 2. Вход не выключается сам: последний с Users и паролем остаётся. */
 eq('последнему администратору с паролем не снять офис и не удалить его — вход не выключится',await t.p.evaluate(async()=>{
  const acc=DB.user.find(u=>u.name==='Demo Accounting');acc.access=USER_SECTIONS.slice();acc.rev++;touch();
  const self=await ucSave('Demo Owner',{office:false}),drop=usersDropError(ucId('Demo Owner'),'office');
  acc.access=['sales','finance','customers','dashboard'];acc.rev++;touch();
  return {self:self.error,drop,on:signinOn(),who:signinUser()&&signinUser().name};
 }),{self:'Someone with Users must keep a password',drop:'Someone with Users must keep a password',on:true,who:'Demo Owner'});

 /* 3. Старая форма не перезаписывает чужую правку и не возвращает пароль. */
 eq('форма, открытая до чужой правки, не сохраняет старое поверх нового',await t.p.evaluate(async()=>{
  tab='users';subtab='office';render();userEditOpen(DB.user.findIndex(u=>u.name==='Demo Sales'));uDraft.name='Sales Renamed';
  const other=(await ucSave('Demo Sales',{access:['sales'],password:'sales-new-123'})).ok;
  await saveUser();const err=document.getElementById('e_user').textContent,u=DB.user.find(x=>x.viewProfileId===uDraft.id);
  const out={other,err,name:u.name,access:u.access,newPw:userPasswordCheck(u,'sales-new-123'),oldPw:userPasswordCheck(u,'sales-pass-12'),secrets:'password' in uDraft||'pin' in uDraft,open:uEdit!==null};
  uEdit=null;uDraft=null;await ucSave('Demo Sales',{access:['sales','optimization','production','shipping','customers','dashboard'],password:'sales-pass-12'});render();return out;
 }),{other:true,err:'Changed elsewhere — reopen',name:'Demo Sales',access:['sales'],newPw:true,oldPw:false,secrets:false,open:true});

 /* 6. Ошибка записи не стирает форму. */
 eq('запись не прошла — форма Users остаётся с правками, ошибка рядом с Save',await t.p.evaluate(async()=>{
  tab='users';subtab='office';userEditOpen(DB.user.findIndex(u=>u.name==='Demo Sales'));uDraft.name='Sales Renamed';
  const set=Storage.prototype.setItem,al=window.alert;window.alert=()=>{};
  Storage.prototype.setItem=function(k,v){if(k===STORAGE_KEY)throw new DOMException('full','QuotaExceededError');return set.call(this,k,v);};
  await saveUser();Storage.prototype.setItem=set;window.alert=al;storageLastError='';storageWarningShown=false;
  const out={err:document.getElementById('e_user').textContent,open:uEdit!==null,name:uDraft&&uDraft.name,db:DB.user.find(u=>u.viewProfileId===uDraft.id).name};
  await saveUser();out.retry=DB.user.some(u=>u.name==='Sales Renamed')&&uEdit===null;
  await ucSave('Sales Renamed',{name:'Demo Sales'});tab='dashboard';render();return out;
 }),{err:'Not saved. Your operation is still open; retry or export your changes.',open:true,name:'Sales Renamed',db:'Demo Sales',retry:true});

 /* 5. Журнал заказа — часть Sales. */
 eq('Activity log без права Sales не открывается и не рисуется, даже открытый раньше',await t.p.evaluate(async()=>{
  oqReset();DB.orderEvent=[];const id=oqOrder(oqCustomer());salesDraftDrop();tab='sales';render();
  orderLogOpen(id);const before=!!document.querySelector('[data-order-log]');
  await ucSave('Demo Owner',{access:['customers','users']});render();
  const after=!!document.querySelector('[data-order-log]'),closed=orderLogView===null;orderLogOpen(id);const reopen=orderLogView!==null;
  await ucSave('Demo Owner',{access:USER_SECTIONS.slice()});tab='sales';render();return {before,after,closed,reopen,tab:'sales'};
 }),{before:true,after:false,closed:true,reopen:false,tab:'sales'});

 /* 4. Чужой черновик заказа следующему человеку не достаётся. */
 eq('Sign out с несохранённым заказом сначала спрашивает; Back — остаётся, Don\'t update — выход без правки',await t.p.evaluate(async()=>{
  const id=DB.salesOrder[0].id;salesOrderEdit(id);const due=salesRecord(id).dueDate;soDraft.dueDate='2026-12-24';
  signinMeOpen();document.querySelector('[data-signin-out]').click();const asked=!!salesDialog&&!!signinUser();
  oqChoose('Back');const stay=!!signinUser()&&!!soDraft;
  signinOutSafe();oqChoose("Don't update");
  return {asked,stay,out:!signinUser(),draft:soDraft,due:salesRecord(id).dueDate===due};
 }),{asked:true,stay:true,out:true,draft:null,due:true});
 await t.p.evaluate(()=>signinAs(ucId('Demo Owner')));
 const p2=await t.c.newPage();await p2.goto(t.p.url());await started(p2);await require('./optimization-fixture')(p2);await p2.evaluate(setup);
 await t.p.evaluate(async()=>{const id=DB.salesOrder[0].id;salesOrderEdit(id);soDraft.dueDate='2026-12-25';render();});
 /* Owner вышел во второй вкладке, там же вошёл Sales: первая вкладка, где
    висел несохранённый заказ Owner, открывается заново — чистой. */
 await p2.evaluate(()=>signinOut());
 await Promise.all([t.p.waitForEvent('load'),p2.waitForEvent('load'),p2.evaluate(()=>signinAs(ucId('Demo Sales'))).catch(()=>{})]);
 await started(t.p);await started(p2);
 eq('вошёл другой человек — вкладки с работой прежнего открываются заново: черновика нет, в базе он не сохранён',await t.p.evaluate(()=>({who:signinUser()&&signinUser().name,draft:soDraft,due:DB.salesOrder[0].dueDate!=='2026-12-25'})),
  {who:'Demo Sales',draft:null,due:true});
 await p2.close();

 /* Смена пароля / PIN кончает вход, своя смена — нет. */
 /* После перезагрузки помощников проверки в странице нет — ищем по имени. */
 await Promise.all([t.p.waitForEvent('load'),t.p.evaluate(async()=>{signinOut();signinAs(DB.user.find(x=>x.name==='Demo Owner').viewProfileId);}).catch(()=>{})]);
 await started(t.p);await require('./optimization-fixture')(t.p);await t.p.evaluate(setup);
 eq('пароль или PIN сменили — вход кончается; свой пароль — вход остаётся',await t.p.evaluate(async()=>{
  const self=(await ucSave('Demo Owner',{password:'owner-pass-2'})).ok&&!!signinUser();
  const keep=[tab,stationCode];await ucSave('Demo Sales',{station:true,pin:'1234'});const s=DB.user.find(u=>u.name==='Demo Sales');
  stationCode='CUT';tab='station';stationLogin(s.viewProfileId);const atStation=stationWho()&&stationWho().name;
  await ucSave('Demo Sales',{pin:'9876'});const afterPin=stationWho();localStorage.removeItem(STATION_SESSION_KEY);tab=keep[0];stationCode=keep[1];
  ucAs('Demo Sales');const sales=signinUser()&&signinUser().name;
  const o=DB.user.find(u=>u.name==='Demo Sales');userPasswordSet(o,'changed-elsewhere');o.rev++;touch();
  return {self,atStation,afterPin,sales,afterPw:signinUser()};
 }),{self:true,atStation:'Demo Sales',afterPin:null,sales:'Demo Sales',afterPw:null});

 /* Повторный аудит, 3 октября 2026: команда, ждавшая права записи, не
    выполняется после выхода или смены человека; без входа (когда вход
    включён) доступ закрыт. Задержку передачи записи держит hold(). */
 await t.p.evaluate(()=>{window.ucHold=()=>{const keep=storageWhenWriter,q=[];window.storageWhenWriter=fn=>{q.push(fn);};return ()=>{window.storageWhenWriter=keep;q.splice(0).forEach(f=>f());};};});
 eq('ждавшие Save и × после выхода или входа другого — «Signed out — not saved», данные прежние; без входа доступ закрыт',await t.p.evaluate(async()=>{
  const al=window.alert,cf=window.confirm;window.alert=()=>{};window.confirm=()=>true;
  ucAs('Demo Owner');tab='users';subtab='office';render();const i=DB.user.findIndex(u=>u.name==='Demo Accounting');
  let release=ucHold();userEditOpen(i);uDraft.name='Changed after signout';const p1=saveUser();signinOut();release();const r1=await p1;
  const out={signout:r1.error,name:DB.user[i].name,can:accessCan('users'),actor:accessActor()};
  ucAs('Demo Owner');userEditOpen(i);uDraft.name='Changed under other';release=ucHold();const p2=saveUser();ucAs('Demo Sales');release();out.other=(await p2).error;out.name2=DB.user[i].name;
  ucAs('Demo Owner');await usersSave({name:'Drop Temp',station:true,pin:'1357'});uEdit=null;uDraft=null;
  release=ucHold();const p3=delUser(DB.user.findIndex(u=>u.name==='Drop Temp'),'production');signinOut();release();
  out.drop=(await p3).error;out.kept=DB.user.some(u=>u.name==='Drop Temp');
  ucAs('Demo Owner');window.alert=al;window.confirm=cf;return out;
 }),{signout:'Signed out — not saved',name:'Demo Accounting',can:false,actor:'',other:'Signed out — not saved',name2:'Demo Accounting',drop:'Signed out — not saved',kept:true});

 eq('× сверяет версию записи: изменили, пока открыто подтверждение — «Changed elsewhere — reopen», вход не снят',await t.p.evaluate(async()=>{
  const al=window.alert,cf=window.confirm,msgs=[];window.alert=m=>msgs.push(m);
  window.confirm=()=>{const u=DB.user.find(x=>x.name==='Drop Temp');usersSave({id:u.viewProfileId,rev:u.rev,name:'Drop Temp',no:userNoText(u),station:true,office:false,access:[]});return true;};
  const r=await delUser(DB.user.findIndex(u=>u.name==='Drop Temp'),'production');window.alert=al;window.confirm=cf;
  return {err:r.error,alert:msgs[0],pin:userHasPin(DB.user.find(x=>x.name==='Drop Temp'))};
 }),{err:'Changed elsewhere — reopen',alert:'Changed elsewhere — reopen',pin:true});

 eq('Save ждёт ответа: «Saving…», кнопка выключена, второе нажатие ничего не делает; ответ пришёл — форма закрыта',await t.p.evaluate(async()=>{
  tab='users';subtab='production';render();userEditOpen(DB.user.findIndex(u=>u.name==='Drop Temp'));uDraft.name='Drop Temp 2';
  const release=ucHold(),p=saveUser(),b=document.querySelector('[data-user-save]'),busy={text:b.textContent,disabled:b.disabled},again=await saveUser();
  release();const r=await p;return {busy,again,ok:r.ok,closed:uEdit===null,name:DB.user.some(u=>u.name==='Drop Temp 2')};
 }),{busy:{text:'Saving…',disabled:true},again:null,ok:true,closed:true,name:true});

 /* Владелец, 3 октября 2026: зелёная точка — «залогинен он или нет», и
    журнал входов и выходов по пользователям (пока — этот компьютер). */
 eq('журнал входов: офис и станция, вход и выход; зелёная точка — кто сейчас в системе; вкладка Sign-in log — таблица как в Sales',await t.p.evaluate(async()=>{
  signinOut();DB.authEvent=[];touch();signinOwner=null;signinAs(DB.user.find(u=>u.name==='Demo Owner').viewProfileId);
  const w=DB.user.find(u=>u.name==='Drop Temp 2'),keep=[tab,stationCode];stationCode='CUT';tab='station';stationLogin(w.viewProfileId);
  tab='users';subtab='production';stationCode='';render();const now=k=>{const r=document.querySelector(`[data-user-row="${k.viewProfileId}"] [data-user-now]`);return r&&r.dataset.userNow+':'+r.textContent.trim().split(' ')[0];};
  const onStation=now(w);stationCode='CUT';tab='station';stationSwitch();tab='users';subtab='office';stationCode='';render();
  const office=now(DB.user.find(u=>u.name==='Demo Owner'));subtab='production';render();const offStation=now(w).split(':')[0];
  subtab='log';render();
  const log={date:document.querySelector('[data-created-range]').textContent,heads:[...document.querySelectorAll('.users-log thead th')].map(t=>t.textContent.trim()),
   rows:[...document.querySelectorAll('[data-auth-row]')].map(r=>[...r.children].slice(1,4).map(c=>c.textContent.trim()).join(' | ')),add:!!document.querySelector('[data-user-add]')};
  subtab='office';render();
  return {onStation,office,offStation,log,stored:DB.authEvent.map(e=>e.what+' '+e.where)};
 }),{onStation:'on:CUT',office:'on:Office',offStation:'off',log:{date:'When: Last 14 days▾',heads:['When','Who','What','Where','Note'],
  rows:['Drop Temp 2 | Sign out | Station CUT','Drop Temp 2 | Sign in | Station CUT','Demo Owner | Sign in | Office'],add:false},stored:['Sign in Office','Sign in Station CUT','Sign out Station CUT']});

 /* Возврат со станции в офис сверяет, кто вошёл: вошёл другой — чужой
    черновик заказа не достаётся, вкладка открывается заново. */
 await t.p.evaluate(()=>{const o=DB.salesOrder.find(x=>!salesIsQuote(x));tab='sales';salesOrderEdit(o.id);soDraft.notes='Draft from Owner';render();window.ucOrder=o.id;location.hash='station=CUT';});
 await t.p.waitForFunction(()=>tab==='station');
 const p4=await t.c.newPage();await p4.goto(t.p.url().split('#')[0]);await started(p4);
 await Promise.all([p4.waitForEvent('load'),p4.evaluate(()=>{signinOut();signinAs(DB.user.find(x=>x.name==='Demo Sales').viewProfileId);}).catch(()=>{})]);
 const kept=await t.p.evaluate(()=>({tab,draft:!!soDraft}));
 await Promise.all([t.p.waitForEvent('load'),t.p.evaluate(()=>{stationExit();}).catch(()=>{})]);await started(t.p);
 eq('станция → другой офисный вход → возврат в офис: станция не перезагружалась, при возврате черновик Owner отменён, заметка не сохранена',
  {kept,after:await t.p.evaluate(()=>({who:signinUser()&&signinUser().name,draft:soDraft,notes:(DB.salesOrder.find(x=>!salesIsQuote(x))||{}).notes!=='Draft from Owner'}))},
  {kept:{tab:'station',draft:true},after:{who:'Demo Sales',draft:null,notes:true}});
 await p4.close();
 await t.c.close();
};
