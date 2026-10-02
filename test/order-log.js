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

 eq('офис без входа — только экран «Who is working?»; имён три, PIN не нужен без PIN',await t.p.evaluate(()=>{
  const gate=!!document.querySelector('.signin')&&document.body.classList.contains('signin-mode'),names=document.querySelectorAll('[data-signin-user]').length;
  const u=DB.user.find(x=>x.name==='Demo Sales');u.pin='4321';touch();render();
  return {gate,names,nav:getComputedStyle(document.getElementById('side')).display,wide:document.querySelector('.signin-card').getBoundingClientRect().width>400};
 }),{gate:true,names:3,nav:'none',wide:true});

 await t.p.click('[data-signin-user]:has-text("Demo Sales")');
 await t.p.fill('#signinPin','1111');
 eq('неверный PIN — «Wrong PIN», вход не открыт',await t.p.evaluate(()=>({err:(document.querySelector('.signin-err')||{}).textContent,user:signinUser()})),{err:'Wrong PIN',user:null});
 await t.p.fill('#signinPin','4321');
 eq('верный PIN — внизу меню инициалы и имя, нажатие спрашивает Sign out',await t.p.evaluate(()=>({user:signinUser()&&signinUser().name,who:document.querySelector('[data-signin-who]').textContent.trim(),title:document.querySelector('[data-signin-who]').title,gate:!!document.querySelector('.signin'),grid:getComputedStyle(document.querySelector('.shell')).gridTemplateColumns.split(' ').length})),{user:'Demo Sales',who:'DSDemo',title:'Demo Sales · Sign out',gate:false,grid:2});

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
 await p3.goto(t.p.url().split('#')[0]+'#station=CUT');await p3.reload();await started(p3);
 eq('экран станции офисного входа не просит',await p3.evaluate(()=>({tab,gate:!!document.querySelector('.signin')})),{tab:'station',gate:false});
 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
