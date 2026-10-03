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
  window.ucSave=(name,patch)=>{const u=DB.user.find(x=>x.name===name);return usersSave(Object.assign({id:u.viewProfileId,rev:u.rev,name:u.name,no:userNoText(u),office:userOffice(u),access:u.access,station:userHasPin(u)},patch||{}));};
  window.ucId=name=>DB.user.find(x=>x.name===name).viewProfileId;
  /* Сменить человека внутри одного шага проверки, без перезагрузки: её
     проверяет отдельный сценарий с двумя вкладками ниже. */
  window.ucAs=name=>{signinOwner=null;signinOut();signinAs(ucId(name));};
 };
 await t.p.evaluate(setup);

 eq('команды: без входа можно всё; Owner и Sales получают пароли, вход включается',await t.p.evaluate(()=>{
  const sales=ucSave('Demo Sales',{password:'sales-pass-12'}).ok,owner=ucSave('Demo Owner',{password:'owner-pass-1'}).ok;
  const on=signinOn();signinAs(ucId('Demo Owner'));return {sales,owner,on,who:signinUser()&&signinUser().name};
 }),{sales:true,owner:true,on:true,who:'Demo Owner'});

 /* 1. Восстановление базы — только администратор. */
 eq('Restore pre-import backup без Users: кнопки нет, замена отказывает и база прежняя',await t.p.evaluate(()=>{
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
 eq('последнему администратору с паролем не снять офис и не удалить его — вход не выключится',await t.p.evaluate(()=>{
  const acc=DB.user.find(u=>u.name==='Demo Accounting');acc.access=USER_SECTIONS.slice();acc.rev++;touch();
  const self=ucSave('Demo Owner',{office:false}),drop=usersDropError(ucId('Demo Owner'),'office');
  acc.access=['sales','finance','customers','dashboard'];acc.rev++;touch();
  return {self:self.error,drop,on:signinOn(),who:signinUser()&&signinUser().name};
 }),{self:'Someone with Users must keep a password',drop:'Someone with Users must keep a password',on:true,who:'Demo Owner'});

 /* 3. Старая форма не перезаписывает чужую правку и не возвращает пароль. */
 eq('форма, открытая до чужой правки, не сохраняет старое поверх нового',await t.p.evaluate(()=>{
  tab='users';subtab='office';render();userEditOpen(DB.user.findIndex(u=>u.name==='Demo Sales'));uDraft.name='Sales Renamed';
  const other=ucSave('Demo Sales',{access:['sales'],password:'sales-new-123'}).ok;
  saveUser();const err=document.getElementById('e_user').textContent,u=DB.user.find(x=>x.viewProfileId===uDraft.id);
  const out={other,err,name:u.name,access:u.access,newPw:userPasswordCheck(u,'sales-new-123'),oldPw:userPasswordCheck(u,'sales-pass-12'),secrets:'password' in uDraft||'pin' in uDraft,open:uEdit!==null};
  uEdit=null;uDraft=null;ucSave('Demo Sales',{access:['sales','optimization','production','shipping','customers','dashboard'],password:'sales-pass-12'});render();return out;
 }),{other:true,err:'Changed elsewhere — reopen',name:'Demo Sales',access:['sales'],newPw:true,oldPw:false,secrets:false,open:true});

 /* 6. Ошибка записи не стирает форму. */
 eq('запись не прошла — форма Users остаётся с правками, ошибка рядом с Save',await t.p.evaluate(()=>{
  tab='users';subtab='office';userEditOpen(DB.user.findIndex(u=>u.name==='Demo Sales'));uDraft.name='Sales Renamed';
  const set=Storage.prototype.setItem,al=window.alert;window.alert=()=>{};
  Storage.prototype.setItem=function(k,v){if(k===STORAGE_KEY)throw new DOMException('full','QuotaExceededError');return set.call(this,k,v);};
  saveUser();Storage.prototype.setItem=set;window.alert=al;storageLastError='';storageWarningShown=false;
  const out={err:document.getElementById('e_user').textContent,open:uEdit!==null,name:uDraft&&uDraft.name,db:DB.user.find(u=>u.viewProfileId===uDraft.id).name};
  saveUser();out.retry=DB.user.some(u=>u.name==='Sales Renamed')&&uEdit===null;
  ucSave('Sales Renamed',{name:'Demo Sales'});tab='dashboard';render();return out;
 }),{err:'Not saved. Your operation is still open; retry or export your changes.',open:true,name:'Sales Renamed',db:'Demo Sales',retry:true});

 /* 5. Журнал заказа — часть Sales. */
 eq('Activity log без права Sales не открывается и не рисуется, даже открытый раньше',await t.p.evaluate(()=>{
  oqReset();DB.orderEvent=[];const id=oqOrder(oqCustomer());salesDraftDrop();tab='sales';render();
  orderLogOpen(id);const before=!!document.querySelector('[data-order-log]');
  ucSave('Demo Owner',{access:['customers','users']});render();
  const after=!!document.querySelector('[data-order-log]'),closed=orderLogView===null;orderLogOpen(id);const reopen=orderLogView!==null;
  ucSave('Demo Owner',{access:USER_SECTIONS.slice()});tab='sales';render();return {before,after,closed,reopen,tab:'sales'};
 }),{before:true,after:false,closed:true,reopen:false,tab:'sales'});

 /* 4. Чужой черновик заказа следующему человеку не достаётся. */
 eq('Sign out с несохранённым заказом сначала спрашивает; Back — остаётся, Don\'t update — выход без правки',await t.p.evaluate(()=>{
  const id=DB.salesOrder[0].id;salesOrderEdit(id);const due=salesRecord(id).dueDate;soDraft.dueDate='2026-12-24';
  signinMeOpen();document.querySelector('[data-signin-out]').click();const asked=!!salesDialog&&!!signinUser();
  oqChoose('Back');const stay=!!signinUser()&&!!soDraft;
  signinOutSafe();oqChoose("Don't update");
  return {asked,stay,out:!signinUser(),draft:soDraft,due:salesRecord(id).dueDate===due};
 }),{asked:true,stay:true,out:true,draft:null,due:true});
 await t.p.evaluate(()=>signinAs(ucId('Demo Owner')));
 const p2=await t.c.newPage();await p2.goto(t.p.url());await started(p2);await require('./optimization-fixture')(p2);await p2.evaluate(setup);
 await t.p.evaluate(()=>{const id=DB.salesOrder[0].id;salesOrderEdit(id);soDraft.dueDate='2026-12-25';render();});
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
 await Promise.all([t.p.waitForEvent('load'),t.p.evaluate(()=>{signinOut();signinAs(DB.user.find(x=>x.name==='Demo Owner').viewProfileId);}).catch(()=>{})]);
 await started(t.p);await require('./optimization-fixture')(t.p);await t.p.evaluate(setup);
 eq('пароль или PIN сменили — вход кончается; свой пароль — вход остаётся',await t.p.evaluate(()=>{
  const self=ucSave('Demo Owner',{password:'owner-pass-2'}).ok&&!!signinUser();
  const keep=[tab,stationCode];ucSave('Demo Sales',{station:true,pin:'1234'});const s=DB.user.find(u=>u.name==='Demo Sales');
  stationCode='CUT';tab='station';stationLogin(s.viewProfileId);const atStation=stationWho()&&stationWho().name;
  ucSave('Demo Sales',{pin:'9876'});const afterPin=stationWho();localStorage.removeItem(STATION_SESSION_KEY);tab=keep[0];stationCode=keep[1];
  ucAs('Demo Sales');const sales=signinUser()&&signinUser().name;
  const o=DB.user.find(u=>u.name==='Demo Sales');userPasswordSet(o,'changed-elsewhere');o.rev++;touch();
  return {self,atStation,afterPin,sales,afterPw:signinUser()};
 }),{self:true,atStation:'Demo Sales',afterPin:null,sales:'Demo Sales',afterPw:null});
 await t.c.close();
};
