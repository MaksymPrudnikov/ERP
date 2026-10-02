/* Журнал заказа и вход в офис по PIN (владелец, 2 октября 2026): кто создал,
   изменил, напечатал, отправил в батч, выдал. Окно — правой кнопкой на
   заказе → Activity log. Выход — Sign out или все вкладки закрыты; F5 не
   выходит. Станция входит своим PIN. */
module.exports=async function({page,eq,ok}){
 console.log('order activity log');
 const t=await page(undefined,undefined,{signin:true});
 const started=p=>p.waitForFunction(()=>typeof storageStarting!=='undefined'&&!storageStarting&&!signinChecking);
 await started(t.p);
 await require('./optimization-fixture')(t.p);

 eq('офис без входа — только экран «Who is working?» с названием компании; в списке только офисные роли, без Shop',await t.p.evaluate(()=>{
  const gate=!!document.querySelector('.signin')&&document.body.classList.contains('signin-mode'),names=document.querySelectorAll('[data-signin-user]').length;
  const u=DB.user.find(x=>x.name==='Demo Sales');u.pin='4321';
  DB.user.push({name:'Shop Worker',role:'Shop',station:'CUT',skills:[],pin:'5555'});normalizeUsers();touch();render();
  const office=[...document.querySelectorAll('[data-signin-user]')].map(x=>x.querySelector('b').textContent);
  return {gate,names,office,nav:getComputedStyle(document.getElementById('side')).display,wide:document.querySelector('.signin-card').getBoundingClientRect().width>400,brand:document.querySelector('[data-signin-brand] b').textContent,panes:document.querySelectorAll('.signin-glass i').length};
 }),{gate:true,names:3,office:['Demo Accounting','Demo Owner','Demo Sales'],nav:'none',wide:true,brand:'Infinity Glass Group Inc',panes:5});

 await t.p.click('[data-signin-user]:has-text("Demo Sales")');
 await t.p.fill('#signinPin','1111');
 eq('неверный PIN — «Wrong PIN», вход не открыт',await t.p.evaluate(()=>({err:(document.querySelector('.signin-err')||{}).textContent,user:signinUser()})),{err:'Wrong PIN',user:null});
 await t.p.fill('#signinPin','4321');
 eq('верный PIN — внизу меню инициалы и имя, нажатие спрашивает Sign out',await t.p.evaluate(()=>({user:signinUser()&&signinUser().name,who:document.querySelector('[data-signin-who]').textContent.trim(),title:document.querySelector('[data-signin-who]').title,gate:!!document.querySelector('.signin'),grid:getComputedStyle(document.querySelector('.shell')).gridTemplateColumns.split(' ').length})),{user:'Demo Sales',who:'DSDemo',title:'Demo Sales · Sign out',gate:false,grid:2});

 eq('Users: колонка No., номер новому — сам; чужой номер не сохраняется',await t.p.evaluate(()=>{
  tab='users';subtab='list';uEdit='new';uDraft={no:'',name:'New Cutter',role:'Shop',station:'',skills:[],pin:''};render();saveUser();
  const made=DB.user.find(u=>u.name==='New Cutter'),head=[...document.querySelectorAll('thead th')].map(th=>th.textContent)[0];
  uEdit='new';uDraft={no:String(made.no),name:'Dup',role:'Shop',station:'',skills:[],pin:''};render();saveUser();
  const err=document.getElementById('e_user').textContent;uEdit=null;uDraft=null;DB.user=DB.user.filter(u=>u!==made);touch();tab='sales';render();
  return {head,auto:made.no>0,err:err==='No. '+userNoText(made)+' belongs to New Cutter'};
 }),{head:'No.',auto:true,err:true});

 eq('создан → изменён → Verified → Batched B-… → Unbatched → Picked up; всё на вошедшего',await t.p.evaluate(()=>{
  oqReset();DB.orderEvent=[];const id=oqOrder(oqCustomer());
  soDraft.lines[1].qty=3;soDraft.dueDate='2026-10-30';salesOrderSave();salesDraftDrop();
  salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
  const batch=salesRecord(id).batchNo;
  glassBatchRelease(glassBatchOrderReleasable(salesRecord(id)).map(x=>({batch:x.batch,item:x.item})),{confirmed:true});
  salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
  salesSetRecordStatus(id,'ready');salesSetRecordStatus(id,'done',{delivery:'pickup'});
  const rows=orderLogFor(id);
  return {what:rows.map(r=>r.what+(r.what==='Batched'||r.what==='Unbatched'?(r.note===batch||r.note===salesRecord(id).batchNo?' B':' ?'):'')),edited:rows[1].note,who:[...new Set(rows.map(r=>r.by))]};
 }),{what:['Created','Edited','Verified','Batched B','Unbatched B','Verified','Batched B','Ready','Picked up'],edited:'due date, line 2',who:['Demo Sales']});

 eq('Hold заказа и строки, Cancel / Restore — отдельными строками',await t.p.evaluate(()=>{
  oqReset();DB.orderEvent=[];const id=oqOrder(oqCustomer());salesDraftDrop();
  salesHoldApply([id],'Waiting for customer');salesReleaseHold([id]);
  salesSetRecordStatus(id,'cancelled');salesRestoreOrder(id);
  return orderLogFor(id).map(r=>r.what+(r.note?' · '+r.note:''));
 }),['Created','On Hold · Waiting for customer','Hold released','Cancelled','Restored · New']);

 eq('печать документа, чертежей и стикеров, письмо — в журнале',await t.p.evaluate(async()=>{
  oqReset();DB.orderEvent=[];const id=oqOrder(oqCustomer());salesDraftDrop();soDraft=null;soEdit=null;
  const keepPrint=window.print,keepOpen=window.open,keepDl=docDownload;window.print=()=>{};window.open=()=>({});docDownload=()=>{};
  salesOrderEdit(id);docOpen('workOrder');docPrint();docEmail();
  docState=null;soDraft=null;soEdit=null;
  stkOpenForOrder(id);stkDialogPrint();
  await new Promise(r=>setTimeout(r,50));
  window.print=keepPrint;window.open=keepOpen;docDownload=keepDl;
  return orderLogFor(id).map(r=>r.what+(r.note?' · '+r.note:''));
 }),['Created','Printed · Work order','Emailed · Work order','Printed · Stickers · 6']);

 eq('оплата из Finance видна в журнале заказа и записана на вошедшего',await t.p.evaluate(()=>{
  oqReset();DB.orderEvent=[];DB.receipt=[];DB.financeEvent=[];const id=oqOrder(oqCustomer());salesDraftDrop();
  const o=salesRecord(id);finPersist(()=>finSaveReceiptRecord({customerId:o.customerId,date:'2026-10-02',method:'cash',amount:100,allocations:[{orderId:id,amount:100}]},null,'',false));
  const r=orderLogFor(id).find(x=>x.what==='Payment received');return r&&{by:r.by,amount:/\$100\.00/.test(r.note)};
 }),{by:'Demo Sales',amount:true});

 eq('правая кнопка → Activity log: окно с когда / кто / что; Esc закрывает',await t.p.evaluate(()=>{
  oqReset();DB.orderEvent=[];const id=oqOrder(oqCustomer());salesDraftDrop();soDraft=null;soEdit=null;tab='sales';render();
  document.querySelector(`[data-order-row="${id}"]`).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:200,clientY:200}));
  const item=document.querySelector('.sl-ctx [data-menu="log"]');const label=item&&item.textContent;item.click();
  const dialog=document.querySelector('[data-order-log]'),head=[...dialog.querySelectorAll('th')].map(x=>x.textContent),rows=dialog.querySelectorAll('[data-order-log-row]').length;
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  return {label,head,rows,closed:!document.querySelector('[data-order-log]')};
 }),{label:'Activity log',head:['When','Who','What'],rows:1,closed:true});

 eq('заказ до журнала — строка Created без имени; импорт базы не пишет событий',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());salesDraftDrop();DB.orderEvent=[];touch();
  const old=orderLogFor(id).map(r=>[r.what,r.by,r.note]);
  const n=DB.orderEvent.length;storageImportState(JSON.parse(JSON.stringify(storageExportEnvelope())));
  return {old,added:DB.orderEvent.length-n};
 }),{old:[['Created','','before the log']],added:0});

 eq('на экране станции «кто» — рабочий и станция',await t.p.evaluate(()=>{
  const u=DB.user.find(x=>x.name==='Demo Owner'),keep=[tab,stationCode];
  localStorage.setItem(STATION_SESSION_KEY,JSON.stringify({station:'CUT',userId:u.viewProfileId,at:new Date().toISOString()}));
  tab='station';stationCode='CUT';const a=orderLogActor();tab=keep[0];stationCode=keep[1];localStorage.removeItem(STATION_SESSION_KEY);
  return a.by;
 }),'Demo Owner · CUT');

 await t.p.reload();await started(t.p);
 eq('F5 не выходит',await t.p.evaluate(()=>signinUser()&&signinUser().name),'Demo Sales');
 const p2=await t.c.newPage();await p2.goto(t.p.url());await started(p2);
 eq('новая вкладка при открытой — уже со входом',await p2.evaluate(()=>signinUser()&&signinUser().name),'Demo Sales');
 await p2.evaluate(()=>signinOut());await t.p.waitForTimeout(150);
 eq('Sign out в одной вкладке — экран входа в обеих',await t.p.evaluate(()=>!!document.querySelector('.signin')),true);
 await p2.evaluate(()=>{const u=DB.user.find(x=>x.name==='Demo Owner');signinChoose(u.viewProfileId);});
 eq('без PIN — вход одним нажатием',await p2.evaluate(()=>signinUser()&&signinUser().name),'Demo Owner');
 await t.p.close();await p2.close();
 const p3=await t.c.newPage();await p3.goto(t.p.url());await started(p3);
 eq('все вкладки закрыты — снова «Who is working?»',await p3.evaluate(()=>({user:signinUser(),gate:!!document.querySelector('.signin')})),{user:null,gate:true});
 await p3.click('[data-signin-side="production"]');
 eq('Production — только станции, имён нет',await p3.evaluate(()=>({names:document.querySelectorAll('[data-signin-user]').length,cut:!!document.querySelector('[data-signin-station="CUT"]'),side:localStorage.getItem('glass_farm_signin_side')})),{names:0,cut:true,side:'production'});
 await p3.click('[data-signin-station="CUT"]');await p3.waitForFunction(()=>tab==='station');
 eq('станция: имён нет — личный номер и PIN; без PIN и неверный — ошибка; номер из Users',await p3.evaluate(()=>{
  const names=document.querySelectorAll('.st-name-btn,[data-signin-user]').length,press=k=>stationLoginKey(k),type=v=>String(v).split('').forEach(press);
  const u=DB.user.find(x=>x.name==='Shop Worker'),office=DB.user.find(x=>x.name==='Demo Owner');
  type(office.no);press('ok');type('1234');const nopin=document.querySelector('.st-pin-err').textContent;
  type(u.no);press('ok');type('1111');const wrong=document.querySelector('.st-pin-err').textContent;
  type(u.no);press('ok');type('5555');
  return {names,nopin,wrong,who:stationWho()&&stationWho().name,unique:new Set(DB.user.map(x=>x.no)).size===DB.user.length};
 }),{names:0,nopin:'No PIN yet — ask the office',wrong:'Wrong number or PIN',who:'Shop Worker',unique:true});
 await p3.click('.st-exit');await p3.waitForFunction(()=>tab!=='station');
 eq('кнопка ERP на станции без офисного входа — снова выбор, браузер помнит Production',await p3.evaluate(()=>({gate:!!document.querySelector('.signin'),side:(document.querySelector('.signin-side .on')||{}).textContent})),{gate:true,side:'Production'});
 await p3.goto(t.p.url().split('#')[0]+'#station=CUT');await p3.reload();await started(p3);
 eq('экран станции офисного входа не просит',await p3.evaluate(()=>({tab,gate:!!document.querySelector('.signin')})),{tab:'station',gate:false});
 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
