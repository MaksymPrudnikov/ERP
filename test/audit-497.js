/* Аудит агентов PR #497 (скорость кликов), 25.11.2026: то, что набор раньше
   не проверял.
   - Просмотр заказа из архива не ставит копию поверх живой записи (общая
     оплата): копия пряталась вместе со своей, и следующее полное сравнение
     удаляло живую из базы.
   - Export / Upload (storageHotRecords) не портят запомненный порядок строк.
   - Порядок строк после F5 (storageSeenSeed): запись с областью без сверки
     GF_SCOPE_CHECK (она перед каждой командой делает полное сравнение и путь
     не проверялся) — скан пишется, после F5 на месте; строка, у которой на
     старте сменился ключ, — без запомненного порядка.
   - Плитки Overview: раздел сразу с видом, одна отрисовка; несохранённый
     заказ — вопрос, вид не ставится; вид с ошибкой — раздел всё равно
     нарисован.
   - Очередь Optimization — своя таблица у вкладки (ширины колонок). */
module.exports=async function({page,eq}){
 console.log('audit-497');
 const t=await page(undefined,{width:1920,height:900});await require('./optimization-fixture')(t.p);
 const ids=await t.p.evaluate(async()=>{
  window.alert=()=>{};oqReset();
  const a=oqOrder(oqCustomer({legalName:'Audit One'})),b=oqOrder(oqCustomer({legalName:'Audit Two'}));
  oqThrough(a,'verified');glassBatchAssign(glassBatchRows([salesRecord(a)]),{});
  const o=salesRecord(a),pieces=[];o.lines.forEach(l=>glassBatchComponents(o,l).forEach(c=>{const r=glassPieceMap(a).get(c.key);if(r)pieces.push(...r.ids);}));
  pieces.slice(0,2).forEach(id=>stationMove('CUT',stationCheck('CUT',id),{id:'qa',name:'Audit QA'}));
  await storageFlush();return {a,b,pieces};
 });

 /* Живая запись и её копия из архива (тот же ключ). */
 eq('архив: копия живой записи не ставится — в DB одна, полное сравнение её не удаляет, закрытие просмотра её не убирает',await t.p.evaluate(()=>{
  const c=DB.customer[0],id=String(c.id),n=DB.customer.length,b=storageBase.get('customer').get(id);
  const put=archiveRowsPut([{tbl:'customer',id,seq:b.s,data:JSON.stringify(Object.assign({},c,{legalName:'Old copy'})),owners:[],month:''}],true);
  const r={put:put.has('customer')&&put.get('customer').has(id),count:DB.customer.length===n,visit:!!(storageVisit.get('customer')&&storageVisit.get('customer').has(id)),
   del:storageDiff(DB).some(x=>x.tbl==='customer'&&x.id===id&&x.del)};
  archiveRowsDrop(put);r.kept=DB.customer.some(x=>String(x.id)===id&&x.legalName!=='Old copy');return r;
 }),{put:false,count:true,visit:false,del:false,kept:true});

 /* Export считает «всё в памяти» против пустой базы — запомненный порядок
    строк (seq) должен остаться от настоящей базы. Строка, вставленная в
    середину, получает дробный seq: на нём старый порядок и ломался. */
 eq('Export не портит порядок строк: seq запомненного — как в базе, правка строки после Export пишет её на своё место',await t.p.evaluate(async()=>{
  storageCommand(()=>{DB.customer.splice(1,0,normalizeCustomer({id:'CUST-QA-MID',code:'QAMID',legalName:'Middle'},1));});await storageFlush();
  storageDiff(DB);storageHotRecords();
  const s=storageSeen.get('customer'),base=storageBase.get('customer'),same=!!s&&s.ids.every((id,i)=>base.get(id)&&base.get(id).s===s.seq[i]);
  const mid=DB.customer.find(x=>x.id==='CUST-QA-MID'),seq=base.get('CUST-QA-MID').s;
  storageCommand(()=>{mid.legalName='Middle 2';},{customer:['CUST-QA-MID']});await storageFlush();
  return {same,frac:seq%1!==0,kept:storageBase.get('customer').get('CUST-QA-MID').s===seq};
 }),{same:true,frac:true,kept:true});

 /* Строка, у которой на старте сменился ключ, — без запомненного порядка. */
 eq('порядок строк после F5: таблица со сменившимся на старте ключом строки его не получает, без смены — получает',await t.p.evaluate(()=>{
  const recs=[{tbl:'qaSeed',id:'a',seq:0,data:'{"id":"a"}'},{tbl:'qaSeed',id:'b',seq:1,data:'{"id":"b"}'}],run=change=>{
   storageBase.set('qaSeed',new Map(recs.map(r=>[r.id,{t:r.data,s:r.seq}])));storageSeen.delete('qaSeed');
   const seen=new Map();DB.qaSeed=storageJoin(recs,false,seen).qaSeed;if(change)DB.qaSeed[0].id='a2';storageSeenSeed(seen);return storageSeen.has('qaSeed');};
  const r={same:run(false),changed:run(true)};storageBase.delete('qaSeed');storageSeen.delete('qaSeed');delete DB.qaSeed;return r;
 }),{same:true,changed:false});

 /* F5 без GF_SCOPE_CHECK: порядок строк сканов — из прочитанного; скан
    пишется областью; ничего не остаётся незаписанным; после F5 — на месте. */
 await t.c.addInitScript(()=>{window.GF_SCOPE_CHECK=false;});
 await t.p.reload();await t.p.evaluate(()=>window.storageReady);
 const seeded=await t.p.evaluate(x=>{storageTakeControl();const s=storageSeen.get('stationScan'),before=DB.stationScan.length,seed=!!s&&s.ids.length===before;
  stationMove('CUT',stationCheck('CUT',x.pieces[2]),{id:'qa',name:'Audit QA'});
  /* Скан дописан в тот же запомненный порядок — запись шла по нему (storageDiffTail), а не полным сравнением. */
  return {seed:seed&&storageSeen.get('stationScan')===s&&s.ids.length===before+1,added:DB.stationScan.length===before+1,n:before+1,last:DB.stationScan[DB.stationScan.length-1].id};},ids);
 const left=await t.p.evaluate(async()=>{await storageFlush();return storageDiff(DB).length;});
 await t.p.reload();await t.p.evaluate(()=>window.storageReady);
 const back=await t.p.evaluate(()=>({n:DB.stationScan.length,last:DB.stationScan[DB.stationScan.length-1].id}));
 eq('F5 → скан → F5 без сверки области: порядок сканов взят при старте, скан записан, незаписанного нет, после F5 скан на месте и последним',
  {seed:seeded.seed,added:seeded.added,left,back:back.last===seeded.last&&back.n===seeded.n},{seed:true,added:true,left:0,back:true});

 /* Плитки Overview. */
 eq('плитки Overview: раздел сразу с видом, одной отрисовкой (Due this week, To batch)',await t.p.evaluate(()=>{
  storageTakeControl();const one=(fn,check)=>{tab='dashboard';subtab=null;render();const n=renderCount;fn();return {renders:renderCount-n,ok:check()};};
  return {week:one(()=>dashSalesQuick('week'),()=>tab==='sales'&&salesListLoadPrefs().quick==='week'),batch:one(()=>dashQueue('batch'),()=>tab==='optimization'&&optimizationTab==='batch')};
 }),{week:{renders:1,ok:true},batch:{renders:1,ok:true}});
 eq('плитка при несохранённом заказе: вопрос «сохранить?», раздел и вид не меняются',await t.p.evaluate(x=>{
  optimizationTab='new';tab='sales';salesOrderEdit(x.b);soDraft.notes='audit '+Date.now();render();
  const work=salesDraftHasWork();dashQueue('batch');const r={work,tab,opt:optimizationTab,ask:!!document.querySelector('.modal, [role=dialog], [role=alertdialog]')};
  salesDialog=null;salesDraftDrop();tab='dashboard';render();return r;
 },ids),{work:true,tab:'sales',opt:'new',ask:true});
 eq('вид раздела упал с ошибкой — раздел всё равно нарисован, ошибка не скрыта',await t.p.evaluate(()=>{
  tab='dashboard';render();const n=renderCount;let err='';try{navGo('purchasing',()=>{throw new Error('view failed');});}catch(e){err=e.message;}
  return {tab,drawn:renderCount>n,err};
 }),{tab:'purchasing',drawn:true,err:'view failed'});

 /* Очередь Optimization: у вкладки своя таблица — ширины колонок по ней. */
 eq('очередь Optimization: таблица своя у вкладки (All, To verify)',await t.p.evaluate(()=>{
  navGo('optimization');optimizationSetTab('all');const all=!!document.querySelector('#app table.sl-table[data-queue-table="all"]');
  optimizationSetTab('new');const verify=!!document.querySelector('#app table.sl-table[data-queue-table="new"]')&&!document.querySelector('#app table[data-queue-table="all"]');
  return {all,verify};
 }),{all:true,verify:true});
 await t.c.close();
};
