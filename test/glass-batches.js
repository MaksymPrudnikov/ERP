/* Батчи отдельных стёкол: очередь To batch, реестр Batches, состав и история,
   частичные заказы, Unbatch стекла, перенос старых замков, JSON и экран. */
module.exports=async function({page,eq,ok}){
 console.log('glass batches');const t=await page();
 const helpers=async()=>{await require('./optimization-fixture')(t.p);await t.p.evaluate(()=>{
  /* Пакет 6CLEAR + другое стекло: как 6CL + 6SB60 / 5SB70 у владельца. */
  window.gbMixed=function(c,code,extra){const id=oqOrder(c,extra);salesRecord(id).makeups[0].panes[1].glassProductId=glassProductByCode(code).id;soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');return id;};
  window.gbQueue=function(){soDraft=null;soEdit=null;oqQueue('batch');};
  window.gbPick=function(code){glassBatchMaterial(code||'');document.querySelector('[data-glass-all]').click();};
  window.gbText=function(){return document.getElementById('app').innerText;};
 });};
 await helpers();

 eq('только выбранный 6CLEAR уходит в батч; 6Q240 и 6Q270 остаются проверенными в очереди',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer();window.gbA=gbMixed(c,'6Q240');window.gbB=gbMixed(c,'6Q270');window.gbC=gbMixed(c,'6Q240');gbQueue();
  const before={rows:glassBatchRows().length,pcs:glassBatchRows().reduce((n,r)=>n+r.remaining,0),select:document.querySelector('[data-glass-material]').selectedOptions[0].textContent};
  gbPick('6CLEAR');const picked=glassBatchSelection.size;document.querySelector('[data-glass-action="create"]').click();
  const b=glassBatchFind('B-0001'),waiting=glassBatchRows();
  return {before,picked,title:document.querySelector('.glass-batches h2').textContent,items:b.items.length,glass:[...new Set(b.items.map(i=>i.snapshot.glass))],qty:b.items.reduce((n,i)=>n+i.qty,0),
   left:[...new Set(waiting.map(r=>r.glass))].sort(),leftPcs:waiting.reduce((n,r)=>n+r.remaining,0),statuses:[gbA,gbB,gbC].map(id=>salesRecord(id).status),
   pill:salesStatusPill(salesRecord(gbA)).includes('3/6 pcs'),card:document.querySelector('[data-still-waiting]').textContent.includes('6Q240: 6 pcs · 6Q270: 3 pcs'),
   head:document.querySelector('.glass-batches .page-head p').textContent,status:document.querySelector('[data-batch-status]').textContent};
 }),{before:{rows:12,pcs:18,select:'All · 18 pcs'},picked:6,title:'Batch B-0001',items:6,glass:['6CLEAR'],qty:9,left:['6Q240','6Q270'],leftPcs:9,statuses:['batched','batched','batched'],pill:true,card:true,
  head:'6CLEAR · 9 pcs · 3 orders · Created '+await t.p.evaluate(()=>salesShortDate(glassBatchFind('B-0001').createdAt)),status:'Awaiting cutting'});

 eq('пока стекло ждёт, заказ не готов: Ready и Shipping закрыты, позиции под замком',await t.p.evaluate(()=>{
  const o=salesRecord(gbA);return {ready:salesRecordTransitionAllowed(o,'ready'),awaiting:optimizationMatches(o,'awaiting'),toBatch:optimizationMatches(o,'batch'),locked:o.lines.every(salesLineLocked),delete:salesDeleteBlocked(o)};
 }),{ready:false,awaiting:false,toBatch:true,locked:true,delete:true});

 eq('несколько типов сразу: окно Create 2 batches, у каждого типа свой номер; очередь пуста, заказ готов к Ready',await t.p.evaluate(()=>{
  gbQueue();glassBatchMaterial('');document.querySelector('[data-glass-all]').click();document.querySelector('[data-glass-action="create"]').click();
  const title=salesDialog.title,rows=salesDialog.rows.map(r=>r.join(' '));oqChoose('Create batches');
  return {title,rows,numbers:DB.glassBatch.map(b=>b.number+':'+[...new Set(b.items.map(i=>i.snapshot.glass))].join('/')),queue:glassBatchRows().length,tab:optimizationTab,open:glassBatchOpenNumber,
   ready:salesRecordTransitionAllowed(salesRecord(gbA),'ready'),awaiting:optimizationMatches(salesRecord(gbB),'awaiting'),pill:salesStatusPill(salesRecord(gbA)).includes('pcs')};
 }),{title:'Create 2 batches?',rows:['6Q240 6 pcs','6Q270 3 pcs'],numbers:['B-0001:6CLEAR','B-0002:6Q240','B-0003:6Q270'],queue:0,tab:'production',open:'',ready:true,awaiting:true,pill:false});

 eq('реестр Batches: новые сверху, номер открывает состав, есть история и счётчики вкладок',await t.p.evaluate(()=>{
  gbQueue();optimizationSetTab('production');const list=[...document.querySelectorAll('[data-glass-row]')].map(r=>r.dataset.glassRow),counts=[...document.querySelectorAll('[data-queue-tab] b')].map(b=>b.textContent);
  [...document.querySelectorAll('.gb-link')].find(b=>b.textContent==='B-0002').click();const contents=document.querySelectorAll('[data-glass-row]').length;
  [...document.querySelectorAll('.gb-detail-tabs button')].find(b=>b.textContent==='History').click();const history=document.querySelector('.gb-history').textContent;
  return {list,counts,contents,created:history.includes('Created')&&history.includes('6 pcs'),orders:history.includes('Order '+salesRecord(gbA).businessNumber)&&history.includes('Order '+salesRecord(gbC).businessNumber)&&!history.includes('Order '+salesRecord(gbB).businessNumber)};
 }),{list:['B-0002','B-0003','B-0001'],counts:['3','0','0','3'],contents:4,created:true,orders:true});

 eq('повторный батч тех же стёкол не создаёт дубликатов; устаревшие строки отклоняются',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');const rows=glassBatchRows();
  const first=!!glassBatchAssign(rows,{deferTouch:true}),again=glassBatchAssign(rows,{deferTouch:true}),dup=glassBatchAssign([rows[0],rows[0]],{dryRun:true});
  return {first,again,dup,batches:DB.glassBatch.length,items:DB.glassBatch[0].items.length,qty:DB.glassBatch[0].items.map(i=>i.qty)};
 }),{first:true,again:null,dup:null,batches:1,items:4,qty:[2,2,1,1]});

 eq('одинаковые стёкла пакета — отдельные записи; ламинат режется двумя плитами 1a и 1b',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer();const pack=oqOrder(c);soDraft=null;soEdit=null;salesSetRecordStatus(pack,'verified');
  tab='sales';salesOrderNew('order');salesSetUnitType('single');const m=soDraft.makeups[0];
  m.panes=[normalizeSalesPane({category:'laminated',laminated:{outerGlassProductId:'GL-6CLEAR',innerGlassProductId:'GL-6CLEAR',interlayerProductId:'INT-PVB030'}},0)];m.cavities=[];m.panes[0].priceOverride=9;
  soDraft.lines=[];const l=normalizeSalesOrderLine({makeupId:m.id,width16:640,height16:480,qty:3,mark:'Lami'});soDraft.lines.push(l);salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});
  salesApplyCustomerDefaults(c.id);salesOrderSave();const lam=soDraft.id;soDraft=null;soEdit=null;salesSetRecordStatus(lam,'verified');
  const packRows=glassBatchRows([salesRecord(pack)]),lamRows=glassBatchRows([salesRecord(lam)]);
  return {pack:packRows.map(r=>r.lite+':'+r.remaining),keys:new Set(packRows.map(r=>r.key)).size,lam:lamRows.map(r=>[r.lite,r.ply,r.remaining,r.width,r.height,r.reason].join(' ')),progress:glassBatchProgress(salesRecord(lam))};
 }),{pack:['1:2','2:2','1:1','2:1'],keys:4,lam:['1a outer 3 40 30 ','1b inner 3 40 30 '],progress:{total:6,left:6,assigned:0}});

 eq('Hold позиции и заказа: строки видны, но не выбираются и не уходят в батч',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer(),a=oqOrder(c),b=oqOrder(c);soDraft=null;soEdit=null;[a,b].forEach(id=>salesSetRecordStatus(id,'verified'));
  salesLineHoldSet(a,[salesRecord(a).lines[1].id],true,'Waiting for shape');salesRecord(b).onHold=true;salesRecord(b).holdReason='Credit check';gbQueue();
  const rows=[...document.querySelectorAll('[data-glass-row]')],held=rows.filter(r=>r.classList.contains('gb-held')).length,disabled=rows.filter(r=>r.querySelector('[data-glass-check]').disabled).length;
  const reason=gbText().includes('On Hold');document.querySelector('[data-glass-all]').click();const picked=glassBatchSelection.size;document.querySelector('[data-glass-action="create"]').click();
  return {rows:rows.length,held,disabled,picked,statuses:[salesRecord(a).status,salesRecord(b).status],reason,left:glassBatchRows().length,ready:salesRecordTransitionAllowed(salesRecord(a),'ready')};
 }),{rows:8,held:6,disabled:6,picked:2,statuses:['batched','verified'],reason:true,left:6,ready:false});

 eq('фильтр по стеклу снимает выбор скрытых строк',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer();gbMixed(c,'6Q240');gbQueue();document.querySelector('[data-glass-all]').click();const all=glassBatchSelection.size;
  glassBatchMaterial('6Q240');render();return {all,after:glassBatchSelection.size,visible:glassBatchFiltered().length};
 }),{all:4,after:2,visible:2});

 eq('Back на предупреждении о депозите и изменённый заказ во время окна не создают ни одного батча',await t.p.evaluate(()=>{
  oqReset();const cash=oqCustomer({paymentMode:'cash',legalName:'Cash buyer'}),credit=oqCustomer();const a=gbMixed(credit,'6Q240'),b=gbMixed(cash,'6Q270');gbQueue();
  document.querySelector('[data-glass-all]').click();document.querySelector('[data-glass-action="create"]').click();oqChoose('Create batches');const deposit=salesDialog.title;oqChoose('Back');
  const afterBack={batches:DB.glassBatch.length,statuses:[salesRecord(a).status,salesRecord(b).status]};
  gbQueue();document.querySelector('[data-glass-all]').click();document.querySelector('[data-glass-action="create"]').click();oqChoose('Create batches');salesRecord(a).notes='Changed elsewhere';oqChoose('Send anyway');
  return {deposit:deposit.startsWith('Deposit not received'),afterBack,stale:salesDialog.title,batches:DB.glassBatch.length,statuses:[salesRecord(a).status,salesRecord(b).status],locks:[a,b].some(id=>salesRecord(id).lines.some(salesLineLocked))};
 }),{deposit:true,afterBack:{batches:0,statuses:['verified','verified']},stale:'Selection changed',batches:0,statuses:['verified','verified'],locks:false});

 eq('Unbatch выбранного стекла: только оно возвращается, другие батчи и стёкла под замком, заказ снова на проверку',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer(),a=oqOrder(c),b=oqOrder(c);soDraft=null;soEdit=null;[a,b].forEach(id=>salesSetRecordStatus(id,'verified'));gbQueue();document.querySelector('[data-glass-all]').click();document.querySelector('[data-glass-action="create"]').click();
  const batch=glassBatchFind('B-0001'),target=batch.items.find(i=>i.orderId===a&&i.snapshot.line===1&&i.snapshot.lite==='1');
  document.querySelector(`[data-glass-row="${target.id}"] [data-glass-check]`).click();document.querySelector('[data-glass-action="unbatch"]').click();
  const title=salesDialog.title,blocked=document.querySelector('[data-dialog-button="1"]').disabled;oqChoose('Unbatch selected glass');const unconfirmed=!target.releasedAt&&salesDialog.title===title;salesDialogChoose(0);
  document.querySelector('[data-glass-action="unbatch"]').click();salesDialogConfirm(true);oqChoose('Unbatch selected glass');
  const o=salesRecord(a),row=document.querySelector(`[data-glass-row="${target.id}"]`);
  const state={title,blocked,unconfirmed,released:!!target.releasedAt,active:batch.items.filter(i=>!i.releasedAt).length,history:batch.history.map(h=>h.action+' '+h.qty),statusA:o.status,statusB:salesRecord(b).status,
   lineLocked:salesLineLocked(o.lines[0]),queueBeforeVerify:glassBatchRows().length,rowGrey:row.classList.contains('gb-released'),footer:document.querySelector('.gb-footer').textContent};
  salesSetRecordStatus(a,'verified');const back=glassBatchRows().map(r=>r.key===target.key&&r.remaining);salesSetRecordStatus(a,'batched');
  return Object.assign(state,{back,second:o.lines[0].batchNo,firstKept:batch.items.filter(i=>!i.releasedAt).length,numbers:DB.glassBatch.map(b=>b.number)});
 }),{title:'Unbatch selected glass',blocked:true,unconfirmed:true,released:true,active:7,history:['Created 12','Unbatched 2'],statusA:'new',statusB:'batched',lineLocked:true,queueBeforeVerify:0,rowGrey:true,footer:'10 pcs · 2 orders',
  back:[2],second:'B-0002',firstKept:7,numbers:['B-0001','B-0002']});

 eq('начатая резка: стекло нельзя выбрать и вернуть даже вызовом записи',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;oqThrough(id,'batched');const b=glassBatchFind('B-0001'),item=b.items[0];item.cutStartedAt='2026-09-16T08:00:00Z';glassBatchSyncLine(salesRecord(id),salesRecord(id).lines.find(l=>l.id===item.lineId));
  glassBatchOpen('B-0001');const disabled=document.querySelector(`[data-glass-row="${item.id}"] [data-glass-check]`).disabled,status=document.querySelector(`[data-glass-row="${item.id}"] .gb-state`).textContent;
  return {disabled,status,force:glassBatchRelease([{batch:b,item}],{confirmed:true}),released:!!item.releasedAt,batchStatus:glassBatchStatus(b),order:salesRecord(id).status};
 }),{disabled:true,status:'Cutting started',force:false,released:false,batchStatus:'Cutting started',order:'batched'});

 eq('отменённый заказ: стекло в составе помечено, Restore и Verify не режут его повторно',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;oqThrough(id,'batched');salesSetRecordStatus(id,'cancelled');glassBatchOpen('B-0001');
  const marked=[...document.querySelectorAll('.gb-state')].every(s=>s.textContent==='Order cancelled');salesSetRecordStatus(id,'new',{restore:true});salesSetRecordStatus(id,'verified');
  return {marked,queue:glassBatchRows().length,resumed:salesSetRecordStatus(id,'batched'),items:glassBatchFind('B-0001').items.length,batches:DB.glassBatch.length};
 }),{marked:true,queue:0,resumed:true,items:4,batches:1});

 const keep=await t.p.evaluate(()=>{oqReset();const id=gbMixed(oqCustomer(),'6Q240');gbQueue();gbPick('6CLEAR');document.querySelector('[data-glass-action="create"]').click();return id;});
 const saved=await t.p.evaluate(()=>JSON.stringify(DB.glassBatch));
 await t.p.reload();
 eq('после перезагрузки: состав, история, остаток и замки те же',await t.p.evaluate(([saved,keep])=>{
  const o=salesRecord(keep);return {same:JSON.stringify(DB.glassBatch)===saved,managed:o.lines.map(l=>l.batchManaged),queue:glassBatchRows().map(r=>r.glass),status:o.status,locked:o.lines.every(salesLineLocked)};
 },[saved,keep]),{same:true,managed:[true,true],queue:['6Q240','6Q240'],status:'batched',locked:true});
 await helpers();

 eq('JSON: экспорт и импорт сохраняют реестр; испорченный реестр не импортируется',await t.p.evaluate(()=>{
  const src=JSON.parse(JSON.stringify(DB)),next=prepareImportedState(JSON.parse(JSON.stringify(src)));
  const fail=mutate=>{const x=JSON.parse(JSON.stringify(src));mutate(x);try{prepareImportedState(x);return '';}catch(e){return e.message;}};
  return {same:JSON.stringify(next.glassBatch)===JSON.stringify(src.glassBatch),
   duplicate:fail(x=>x.glassBatch.push(JSON.parse(JSON.stringify(x.glassBatch[0])))),
   over:fail(x=>{x.glassBatch[0].items[0].qty=99;}),
   foreign:fail(x=>{x.glassBatch[0].items[0].key='SO-other|'+x.glassBatch[0].items[0].lineId+'|lite';}),
   shape:fail(x=>{x.glassBatch={};})};
 }),{same:true,duplicate:'Invalid or duplicate glass batch.',over:'Glass batch quantity or order reference is invalid.',foreign:'Invalid glass batch item.',shape:'The "glassBatch" field must be an array.'});

 eq('старые замки переносятся в реестр один раз; начатая резка и номер сохраняются',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');let o=salesRecord(id);
  o.status='batched';o.batchNo='B-0007';o.batchHistory=['B-0007'];o.lines.forEach(l=>{l.batchedAt='2026-09-01T10:00:00Z';l.batchNo='B-0007';l.batchManaged=false;});o.lines[1].cutStartedAt='2026-09-02T09:00:00Z';DB.glassBatch=[];
  normalizeDB();normalizeDB();o=salesRecord(id);const b=glassBatchFind('B-0007'),cut=b.items.filter(i=>i.cutStartedAt).map(i=>i.lineId===o.lines[1].id);
  const first={batches:DB.glassBatch.length,items:b.items.length,qty:b.items.map(i=>i.qty),history:b.history.map(h=>h.action),cut,managed:o.lines.map(l=>l.batchManaged),queue:glassBatchRows().length,next:salesNextBatchNumber(),locked:o.lines.every(salesLineLocked)};
  DB.glassBatch=[];normalizeDB();o=salesRecord(id);
  return Object.assign(first,{relocked:glassBatchFind('B-0007').items.length,stillLocked:o.lines.every(salesLineLocked),queueAfterLoss:glassBatchRows().length});
 }),{batches:1,items:4,qty:[2,2,1,1],history:['Imported legacy batch','Imported legacy batch'],cut:[true,true],managed:[true,true],queue:0,next:'B-0008',locked:true,relocked:4,stillLocked:true,queueAfterLoss:0});

 eq('позиция без Makeup не теряется: видна как Glass missing и держит заказ от Ready',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');const o=salesRecord(id);o.lines.push(normalizeSalesOrderLine({makeupId:'missing',width16:320,height16:320,qty:2}));
  const rows=glassBatchRows([o]),missing=rows.filter(r=>r.reason==='Glass missing');const batched=salesSetRecordStatus(id,'batched');
  return {missing:missing.map(r=>r.remaining),batched,status:o.status,progress:glassBatchProgress(o)};
 }),{missing:[2],batched:false,status:'verified',progress:{total:8,left:8,assigned:0}});

 eq('открытый черновик получает замки батча из очереди, его несохранённые заметки не записываются',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());salesSetRecordStatus(id,'verified');soDraft.notes='Unsaved changes';oqQueue('batch');
  document.querySelector('[data-glass-all]').click();document.querySelector('[data-glass-action="create"]').click();
  return {saved:salesRecord(id).notes,draft:soDraft.notes,status:soDraft.status,managed:soDraft.lines.every(l=>l.batchManaged),locks:soDraft.lines.every(salesLineLocked)};
 }),{saved:'',draft:'Unsaved changes',status:'batched',managed:true,locks:true});

 eq('экраны очереди, реестра, состава и истории без русского; имя клиента и причина Hold не исполняют HTML',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'<img src=x onerror="window.gbXss=1">'});const a=gbMixed(c,'6Q240');salesLineHoldSet(a,[salesRecord(a).lines[1].id],true,'<img src=x onerror="window.gbXss=2">');
  const texts=[];gbQueue();texts.push(gbText());const imgs=[document.querySelectorAll('.glass-batches img').length];document.querySelector('[data-glass-all]').click();document.querySelector('[data-glass-action="create"]').click();texts.push(gbText());imgs.push(document.querySelectorAll('.glass-batches img').length);
  glassBatchDetailTab='history';render();texts.push(gbText());optimizationSetTab('production');texts.push(gbText());
  return {russian:texts.some(s=>/[А-яЁё]/.test(s)),imgs,xss:!!window.gbXss,escaped:texts[0].includes('<img src=x')};
 }),{russian:false,imgs:[0,0],xss:false,escaped:true});

 await t.p.setViewportSize({width:390,height:844});
 eq('на телефоне очередь и состав батча не шире экрана',await t.p.evaluate(()=>{
  gbQueue();const queue=document.documentElement.scrollWidth<=innerWidth+1;glassBatchOpen('B-0001');const detail=document.documentElement.scrollWidth<=innerWidth+1;return {queue,detail};
 }),{queue:true,detail:true});
 eq('батчи стёкол без ошибок страницы',t.errs,[]);await t.c.close();
};
