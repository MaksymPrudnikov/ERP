/* Батчи отдельных стёкол: у каждого стекла свой Glass ID и строка «Unit n of N».
   Очередь To batch, реестр Batches, состав и история, частичные заказы,
   Unbatch стекла, перенос старых замков и черновых записей, JSON и экран. */
module.exports=async function({page,eq,ok}){
 console.log('glass batches');const t=await page();
 const helpers=async()=>{await require('./optimization-fixture')(t.p);await t.p.evaluate(()=>{
  /* Пакет 6CLEAR + другое стекло: как 6CL + 6SB60 / 5SB70 у владельца. */
  window.gbMixed=function(c,code,extra){const id=oqOrder(c,extra);salesRecord(id).makeups[0].panes[1].glassProductId=glassProductByCode(code).id;soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');return id;};
  window.gbQueue=function(){soDraft=null;soEdit=null;oqQueue('batch');};
  window.gbPick=function(code){glassBatchMaterial(code||'');document.querySelector('[data-glass-all]').click();};
  window.gbText=function(){return document.getElementById('app').innerText;};
  window.gbIds=function(){return (DB.glassPiece||[]).flatMap(r=>r.ids);};
  window.gbSetQty=function(id,index,qty){tab='sales';salesOrderEdit(id);soDraft.lines[index].qty=qty;if(!salesOrderSave())throw new Error('Order did not save');soDraft=null;soEdit=null;};
 });};
 await helpers();

 eq('номера выдаются сразу при сохранении заказа (стикер до Verify); Verify и повторное сохранение их не меняют; квоте номеров нет',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer();tab='sales';salesOrderNew('order');const unsaved=gbIds().length;const id=oqOrder(c);soDraft=null;soEdit=null;const saved=gbIds(),status=salesRecord(id).status;
  oqOrder(c,{kind:'quote'});soDraft=null;soEdit=null;const quote=gbIds().length;salesSetRecordStatus(id,'verified');const verified=gbIds();
  tab='sales';salesOrderEdit(id);soDraft.notes='Checked';salesOrderSave();soDraft=null;soEdit=null;normalizeDB();
  return {unsaved,saved,status,quote,same:JSON.stringify(verified)===JSON.stringify(saved)&&JSON.stringify(gbIds())===JSON.stringify(saved),seq:DB.glassPieceSeq,rows:glassBatchRows().map(r=>r.piece+' '+r.line+':'+r.unit+' of '+r.of+' L'+r.lite)};
 }),{unsaved:0,saved:['G-0000001','G-0000002','G-0000003','G-0000004','G-0000005','G-0000006'],status:'new',quote:6,same:true,seq:6,
  rows:['G-0000001 1:1 of 2 L1','G-0000002 1:2 of 2 L1','G-0000003 1:1 of 2 L2','G-0000004 1:2 of 2 L2','G-0000005 2:1 of 1 L1','G-0000006 2:1 of 1 L2']});

 eq('номера остаются после возврата в New и Cancel → Restore; отменённому заказу новые не выдаются',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;const first=gbIds();salesSetRecordStatus(id,'verified');salesSetRecordStatus(id,'new',{back:true});const back=gbIds();
  salesSetRecordStatus(id,'cancelled');salesRecord(id).lines.push(normalizeSalesOrderLine({makeupId:salesRecord(id).makeups[0].id,width16:320,height16:320,qty:1}));const cancelled=glassPieceEnsure(salesRecord(id));salesRecord(id).lines.pop();
  salesSetRecordStatus(id,'new',{restore:true});return {back:JSON.stringify(back)===JSON.stringify(first),cancelled,restored:JSON.stringify(gbIds())===JSON.stringify(first)};
 }),{back:true,cancelled:false,restored:true});

 eq('изделий больше — новые номера; меньше — последние снимаются и больше не выдаются',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');
  gbSetQty(id,1,3);const grown=gbIds();gbSetQty(id,0,1);const shrunk=gbIds();gbSetQty(id,0,2);
  return {grown,shrunk,regrown:gbIds(),queue:glassBatchRows().length};
 }),{grown:['G-0000001','G-0000002','G-0000003','G-0000004','G-0000005','G-0000007','G-0000008','G-0000006','G-0000009','G-0000010'],
  shrunk:['G-0000001','G-0000003','G-0000005','G-0000007','G-0000008','G-0000006','G-0000009','G-0000010'],
  regrown:['G-0000001','G-0000011','G-0000003','G-0000012','G-0000005','G-0000007','G-0000008','G-0000006','G-0000009','G-0000010'],queue:10});

 eq('только выбранный 6CLEAR уходит в батч; 6Q240 и 6Q270 остаются проверенными в очереди',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer();window.gbA=gbMixed(c,'6Q240');window.gbB=gbMixed(c,'6Q270');window.gbC=gbMixed(c,'6Q240');gbQueue();
  const all=glassBatchRows(),before={rows:all.length,ids:new Set(all.map(r=>r.piece)).size,valid:all.every(r=>/^G-\d{7}$/.test(r.piece)),select:document.querySelector('[data-glass-material]').selectedOptions[0].textContent};
  gbPick('6CLEAR');const picked=glassBatchSelection.size;document.querySelector('[data-glass-action="create"]').click();
  const b=glassBatchFind('B-0001'),waiting=glassBatchRows();
  return {before,picked,title:document.querySelector('.glass-batches h2').textContent,items:b.items.length,glass:[...new Set(b.parts.map(p=>p.snapshot.glass))],parts:b.parts.length,
   left:[...new Set(waiting.map(r=>r.glass))].sort(),leftPcs:waiting.length,statuses:[gbA,gbB,gbC].map(id=>salesRecord(id).status),
   pill:salesStatusPill(salesRecord(gbA)).includes('3/6 pcs'),card:document.querySelector('[data-still-waiting]').textContent.includes('6Q240: 6 pcs · 6Q270: 3 pcs'),
   head:document.querySelector('.glass-batches .page-head p').textContent,status:document.querySelector('[data-batch-status]').textContent,units:[...document.querySelectorAll('[data-glass-row]')].map(r=>r.dataset.glassId).every(id=>b.items.some(i=>i.piece===id))};
 }),{before:{rows:18,ids:18,valid:true,select:'All · 18 pcs'},picked:9,title:'Batch B-0001',items:9,glass:['6CLEAR'],parts:6,left:['6Q240','6Q270'],leftPcs:9,statuses:['batched','batched','batched'],pill:true,card:true,
  head:'6CLEAR · 9 pcs · 3 orders · Created '+await t.p.evaluate(()=>salesShortDate(glassBatchFind('B-0001').createdAt)),status:'Awaiting cutting',units:true});

 eq('пока стекло ждёт, заказ не готов: Ready и Shipping закрыты, позиции под замком',await t.p.evaluate(()=>{
  const o=salesRecord(gbA);return {ready:salesRecordTransitionAllowed(o,'ready'),awaiting:optimizationMatches(o,'awaiting'),toBatch:optimizationMatches(o,'batch'),locked:o.lines.every(salesLineLocked),delete:salesDeleteBlocked(o)};
 }),{ready:false,awaiting:false,toBatch:true,locked:true,delete:true});

 eq('несколько типов сразу: окно Create 2 batches, у каждого типа свой номер; очередь пуста, заказ готов к Ready',await t.p.evaluate(()=>{
  gbQueue();glassBatchMaterial('');document.querySelector('[data-glass-all]').click();document.querySelector('[data-glass-action="create"]').click();
  const title=salesDialog.title,rows=salesDialog.rows.map(r=>r.join(' '));oqChoose('Create batches');
  return {title,rows,numbers:DB.glassBatch.map(b=>b.number+':'+[...new Set(b.parts.map(p=>p.snapshot.glass))].join('/')),queue:glassBatchRows().length,tab:optimizationTab,open:glassBatchOpenNumber,
   ready:salesRecordTransitionAllowed(salesRecord(gbA),'ready'),awaiting:optimizationMatches(salesRecord(gbB),'awaiting'),pill:salesStatusPill(salesRecord(gbA)).includes('pcs')};
 }),{title:'Create 2 batches?',rows:['6Q240 6 pcs','6Q270 3 pcs'],numbers:['B-0001:6CLEAR','B-0002:6Q240','B-0003:6Q270'],queue:0,tab:'production',open:'',ready:true,awaiting:true,pill:false});

 eq('реестр Batches: новые сверху, номер открывает состав по стёклам, есть история и счётчики вкладок',await t.p.evaluate(()=>{
  gbQueue();optimizationSetTab('production');const list=[...document.querySelectorAll('[data-glass-row]')].map(r=>r.dataset.glassRow),counts=[...document.querySelectorAll('[data-queue-tab] b')].map(b=>b.textContent);
  [...document.querySelectorAll('.gb-link')].find(b=>b.textContent==='B-0002').click();const contents=document.querySelectorAll('[data-glass-row]').length;
  [...document.querySelectorAll('.gb-detail-tabs button')].find(b=>b.textContent==='History').click();const history=document.querySelector('.gb-history').textContent;
  return {list,counts,contents,created:history.includes('Created')&&history.includes('6 pcs'),orders:history.includes('Order '+salesRecord(gbA).businessNumber)&&history.includes('Order '+salesRecord(gbC).businessNumber)&&!history.includes('Order '+salesRecord(gbB).businessNumber)};
 }),{list:['B-0002','B-0003','B-0001'],counts:['3','0','0','3'],contents:6,created:true,orders:true});

 eq('повторный батч тех же стёкол не создаёт дубликатов; устаревшие строки отклоняются',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');const rows=glassBatchRows();
  const first=!!glassBatchAssign(rows,{deferTouch:true}),again=glassBatchAssign(rows,{deferTouch:true}),dup=glassBatchAssign([rows[0],rows[0]],{dryRun:true});
  const b=DB.glassBatch[0];return {first,again,dup,batches:DB.glassBatch.length,items:b.items.length,pieces:new Set(b.items.map(i=>i.piece)).size,parts:b.parts.length};
 }),{first:true,again:null,dup:null,batches:1,items:6,pieces:6,parts:4});

 eq('одинаковые изделия — отдельные стёкла «n of N»; ламинат режется двумя плитами 1a и 1b',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer();const pack=oqOrder(c);soDraft=null;soEdit=null;salesSetRecordStatus(pack,'verified');
  tab='sales';salesOrderNew('order');salesSetUnitType('single');const m=soDraft.makeups[0];
  m.panes=[normalizeSalesPane({category:'laminated',laminated:{outerGlassProductId:'GL-6CLEAR',innerGlassProductId:'GL-6CLEAR',interlayerProductId:'INT-PVB030'}},0)];m.cavities=[];m.panes[0].priceOverride=9;
  soDraft.lines=[];const l=normalizeSalesOrderLine({makeupId:m.id,width16:640,height16:480,qty:3,mark:'Lami'});soDraft.lines.push(l);salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});
  salesApplyCustomerDefaults(c.id);salesOrderSave();const lam=soDraft.id;soDraft=null;soEdit=null;salesSetRecordStatus(lam,'verified');
  const packRows=glassBatchRows([salesRecord(pack)]),lamRows=glassBatchRows([salesRecord(lam)]);
  return {pack:packRows.map(r=>r.line+'/'+r.lite+':'+r.unit+' of '+r.of),slots:new Set(packRows.map(r=>r.slot)).size,lam:lamRows.map(r=>[r.lite,r.ply,r.unit,r.width,r.height,r.reason].join(' ')),progress:glassBatchProgress(salesRecord(lam))};
 }),{pack:['1/1:1 of 2','1/1:2 of 2','1/2:1 of 2','1/2:2 of 2','2/1:1 of 1','2/2:1 of 1'],slots:6,lam:['1a outer 1 40 30 ','1a outer 2 40 30 ','1a outer 3 40 30 ','1b inner 1 40 30 ','1b inner 2 40 30 ','1b inner 3 40 30 '],progress:{total:6,left:6,assigned:0}});

 const picks=await t.p.evaluate(()=>{oqReset();window.gbFifty=oqOrder(oqCustomer());soDraft=null;soEdit=null;gbSetQty(gbFifty,0,50);salesSetRecordStatus(gbFifty,'verified');gbQueue();const line=glassBatchRows().filter(r=>r.line===1&&r.lite==='1');return window.gbPicks=[line[0].piece,line[11].piece];});
 await t.p.locator(`[data-glass-id="${picks[0]}"] [data-glass-check]`).click();
 await t.p.locator(`[data-glass-id="${picks[1]}"] [data-glass-check]`).click({modifiers:['Shift']});
 eq('позиция из 50 изделий: клик и Shift выбирают 12 стёкол подряд, 38 остаются в очереди',await t.p.evaluate(()=>{
  const selected=glassBatchSelection.size,label=document.querySelector('[data-glass-selected]').textContent;document.querySelector('[data-glass-action="create"]').click();
  const b=glassBatchFind('B-0001'),left=glassBatchRows().filter(r=>r.line===1&&r.lite==='1');
  return {selected,label,items:b.items.map(i=>i.unit).join(','),pieces:b.items[0].piece===gbPicks[0]&&b.items[11].piece===gbPicks[1],left:left.length,firstLeft:left[0].unit+' of '+left[0].of,
   pill:salesStatusPill(salesRecord(gbFifty)).includes('12/102 pcs'),card:document.querySelector('[data-still-waiting]').textContent.includes('6CLEAR: 90 pcs'),unit:[...document.querySelectorAll('[data-glass-row]')][11].innerText.includes('12 of 50')};
 }),{selected:12,label:'12 pcs selected',items:'1,2,3,4,5,6,7,8,9,10,11,12',pieces:true,left:38,firstLeft:'13 of 50',pill:true,card:true,unit:true});

 eq('Hold позиции и заказа: стёкла видны, но не выбираются и не уходят в батч',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer(),a=oqOrder(c),b=oqOrder(c);soDraft=null;soEdit=null;[a,b].forEach(id=>salesSetRecordStatus(id,'verified'));
  salesLineHoldSet(a,[salesRecord(a).lines[1].id],true,'Waiting for shape');salesRecord(b).onHold=true;salesRecord(b).holdReason='Credit check';gbQueue();
  const rows=[...document.querySelectorAll('[data-glass-row]')],held=rows.filter(r=>r.classList.contains('gb-held')).length,disabled=rows.filter(r=>r.querySelector('[data-glass-check]').disabled).length;
  const reason=gbText().includes('On Hold');document.querySelector('[data-glass-all]').click();const picked=glassBatchSelection.size;document.querySelector('[data-glass-action="create"]').click();
  return {rows:rows.length,held,disabled,picked,statuses:[salesRecord(a).status,salesRecord(b).status],reason,left:glassBatchRows().length,ready:salesRecordTransitionAllowed(salesRecord(a),'ready')};
 }),{rows:12,held:8,disabled:8,picked:4,statuses:['batched','verified'],reason:true,left:8,ready:false});

 eq('фильтр по стеклу снимает выбор скрытых строк',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer();gbMixed(c,'6Q240');gbQueue();document.querySelector('[data-glass-all]').click();const all=glassBatchSelection.size;
  glassBatchMaterial('6Q240');render();return {all,after:glassBatchSelection.size,visible:glassBatchFiltered().length};
 }),{all:6,after:3,visible:3});

 eq('Back на предупреждении о депозите и изменённый заказ во время окна не создают ни одного батча',await t.p.evaluate(()=>{
  oqReset();const cash=oqCustomer({paymentMode:'cash',legalName:'Cash buyer'}),credit=oqCustomer();const a=gbMixed(credit,'6Q240'),b=gbMixed(cash,'6Q270');gbQueue();
  document.querySelector('[data-glass-all]').click();document.querySelector('[data-glass-action="create"]').click();oqChoose('Create batches');const deposit=salesDialog.title;oqChoose('Back');
  const afterBack={batches:DB.glassBatch.length,statuses:[salesRecord(a).status,salesRecord(b).status]};
  gbQueue();document.querySelector('[data-glass-all]').click();document.querySelector('[data-glass-action="create"]').click();oqChoose('Create batches');salesRecord(a).notes='Changed elsewhere';oqChoose('Send anyway');
  return {deposit:deposit.startsWith('Deposit not received'),afterBack,stale:salesDialog.title,batches:DB.glassBatch.length,statuses:[salesRecord(a).status,salesRecord(b).status],locks:[a,b].some(id=>salesRecord(id).lines.some(salesLineLocked))};
 }),{deposit:true,afterBack:{batches:0,statuses:['verified','verified']},stale:'Selection changed',batches:0,statuses:['verified','verified'],locks:false});

 eq('Unbatch выбранного стекла: только оно возвращается с тем же Glass ID, другие стёкла под замком, заказ снова на проверку',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer(),a=oqOrder(c),b=oqOrder(c);soDraft=null;soEdit=null;[a,b].forEach(id=>salesSetRecordStatus(id,'verified'));gbQueue();document.querySelector('[data-glass-all]').click();document.querySelector('[data-glass-action="create"]').click();
  const batch=glassBatchFind('B-0001'),target=batch.items.find(i=>{const p=batch.parts[i.part];return p.orderId===a&&p.snapshot.line===1&&p.snapshot.lite==='1'&&i.unit===1;});
  document.querySelector(`[data-glass-id="${target.piece}"] [data-glass-check]`).click();document.querySelector('[data-glass-action="unbatch"]').click();
  const title=salesDialog.title,label=salesDialog.lineChoices[0].label,blocked=document.querySelector('[data-dialog-button="1"]').disabled;oqChoose('Unbatch selected glass');const unconfirmed=!target.releasedAt&&salesDialog.title===title;salesDialogChoose(0);
  document.querySelector('[data-glass-action="unbatch"]').click();salesDialogConfirm(true);oqChoose('Unbatch selected glass');
  glassBatchDetailTab='history';render();const logged=[...document.querySelectorAll('[data-history-pieces]')].pop().textContent===target.piece;glassBatchDetailTab='contents';render();
  const o=salesRecord(a),row=document.querySelector(`[data-glass-id="${target.piece}"]`);
  const state={title,logged,label:label.startsWith(target.piece+' · Order ')&&label.includes('Unit 1 of 2'),blocked,unconfirmed,released:!!target.releasedAt,active:batch.items.filter(i=>!i.releasedAt).length,history:batch.history.map(h=>h.action+' '+h.qty+' '+h.pieces.length),statusA:o.status,statusB:salesRecord(b).status,
   lineLocked:salesLineLocked(o.lines[0]),queueBeforeVerify:glassBatchRows().length,rowGrey:row.classList.contains('gb-released'),footer:document.querySelector('.gb-footer').textContent};
  salesSetRecordStatus(a,'verified');const back=glassBatchRows().map(r=>r.piece===target.piece);salesSetRecordStatus(a,'batched');
  return Object.assign(state,{back,second:o.lines[0].batchNo,firstKept:batch.items.filter(i=>!i.releasedAt).length,numbers:DB.glassBatch.map(b=>b.number),again:glassBatchFind('B-0002').items.map(i=>i.piece===target.piece)});
 }),{title:'Unbatch selected glass',logged:true,label:true,blocked:true,unconfirmed:true,released:true,active:11,history:['Created 12 12','Unbatched 1 1'],statusA:'new',statusB:'batched',lineLocked:true,queueBeforeVerify:0,rowGrey:true,footer:'11 pcs · 2 orders',
  back:[true],second:'B-0002',firstKept:11,numbers:['B-0001','B-0002'],again:[true]});

 eq('начатая резка: стекло нельзя выбрать и вернуть даже вызовом записи',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;oqThrough(id,'batched');const b=glassBatchFind('B-0001'),item=b.items[0],part=b.parts[item.part];item.cutStartedAt='2026-09-16T08:00:00Z';glassBatchSyncLine(salesRecord(id),salesRecord(id).lines.find(l=>l.id===part.lineId));
  glassBatchOpen('B-0001');const disabled=document.querySelector(`[data-glass-id="${item.piece}"] [data-glass-check]`).disabled,status=document.querySelector(`[data-glass-id="${item.piece}"] .gb-state`).textContent;
  return {disabled,status,force:glassBatchRelease([{batch:b,item}],{confirmed:true}),released:!!item.releasedAt,batchStatus:glassBatchStatus(b),order:salesRecord(id).status};
 }),{disabled:true,status:'Cutting started',force:false,released:false,batchStatus:'Cutting started',order:'batched'});

 eq('отменённый заказ: стекло в составе помечено, Restore и Verify не режут его повторно',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;oqThrough(id,'batched');const ids=gbIds();salesSetRecordStatus(id,'cancelled');glassBatchOpen('B-0001');
  const marked=[...document.querySelectorAll('.gb-state')].every(s=>s.textContent==='Order cancelled');salesSetRecordStatus(id,'new',{restore:true});salesSetRecordStatus(id,'verified');
  return {marked,queue:glassBatchRows().length,resumed:salesSetRecordStatus(id,'batched'),items:glassBatchFind('B-0001').items.length,batches:DB.glassBatch.length,ids:JSON.stringify(gbIds())===JSON.stringify(ids)};
 }),{marked:true,queue:0,resumed:true,items:6,batches:1,ids:true});

 const keep=await t.p.evaluate(()=>{oqReset();const id=gbMixed(oqCustomer(),'6Q240');gbQueue();gbPick('6CLEAR');document.querySelector('[data-glass-action="create"]').click();return id;});
 const saved=await t.p.evaluate(()=>JSON.stringify([DB.glassBatch,DB.glassPiece,DB.glassPieceSeq]));
 await t.p.reload();
 eq('после перезагрузки: состав, номера, история, остаток и замки те же',await t.p.evaluate(([saved,keep])=>{
  const o=salesRecord(keep);return {same:JSON.stringify([DB.glassBatch,DB.glassPiece,DB.glassPieceSeq])===saved,managed:o.lines.map(l=>l.batchManaged),queue:glassBatchRows().map(r=>r.glass+' '+r.piece),status:o.status,locked:o.lines.every(salesLineLocked)};
 },[saved,keep]),{same:true,managed:[true,true],queue:['6Q240 G-0000003','6Q240 G-0000004','6Q240 G-0000006'],status:'batched',locked:true});
 await helpers();

 eq('JSON: экспорт и импорт сохраняют реестр и номера; испорченные данные не импортируются',await t.p.evaluate(()=>{
  const src=JSON.parse(JSON.stringify(DB)),next=prepareImportedState(JSON.parse(JSON.stringify(src)));
  const fail=mutate=>{const x=JSON.parse(JSON.stringify(src));mutate(x);try{prepareImportedState(x);return '';}catch(e){return e.message;}};
  return {same:JSON.stringify([next.glassBatch,next.glassPiece,next.glassPieceSeq])===JSON.stringify([src.glassBatch,src.glassPiece,src.glassPieceSeq]),
   duplicate:fail(x=>x.glassBatch.push(JSON.parse(JSON.stringify(x.glassBatch[0])))),
   over:fail(x=>{x.glassBatch[0].items[0].unit=99;}),
   twice:fail(x=>{x.glassBatch[0].items[1].unit=x.glassBatch[0].items[0].unit;x.glassBatch[0].items[1].part=x.glassBatch[0].items[0].part;}),
   wrongId:fail(x=>{x.glassBatch[0].items[0].piece='G-0000099';}),
   foreign:fail(x=>{x.glassBatch[0].parts[0].key='SO-other|'+x.glassBatch[0].parts[0].lineId+'|lite|lite';}),
   duplicateId:fail(x=>{x.glassPiece[1].ids[0]=x.glassPiece[0].ids[0];}),
   counter:fail(x=>{x.glassPieceSeq=-1;}),
   shape:fail(x=>{x.glassBatch={};})};
 }),{same:true,duplicate:'Invalid or duplicate glass batch.',over:'Glass batch quantity or order reference is invalid.',twice:'Glass batch quantity or order reference is invalid.',wrongId:'Glass batch quantity or order reference is invalid.',
  foreign:'Invalid glass batch part.',duplicateId:'Invalid or duplicate Glass ID.',counter:'Glass ID counter is invalid.',shape:'The "glassBatch" field must be an array.'});

 eq('старые замки переносятся в реестр по стёклам один раз; номера, резка и номер батча сохраняются',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;let o=salesRecord(id);
  o.status='batched';o.batchNo='B-0007';o.batchHistory=['B-0007'];o.lines.forEach(l=>{l.batchedAt='2026-09-01T10:00:00Z';l.batchNo='B-0007';l.batchManaged=false;});o.lines[1].cutStartedAt='2026-09-02T09:00:00Z';DB.glassBatch=[];
  normalizeDB();normalizeDB();o=salesRecord(id);const b=glassBatchFind('B-0007'),pieces=b.items.map(i=>i.piece);
  const first={batches:DB.glassBatch.length,items:b.items.length,units:b.items.map(i=>i.unit).join(','),valid:pieces.every(p=>/^G-\d{7}$/.test(p))&&new Set(pieces).size===6,registry:JSON.stringify(gbIds().slice().sort())===JSON.stringify(pieces.slice().sort()),
   history:b.history.map(h=>h.action+' '+h.pieces.length),cut:b.items.filter(i=>i.cutStartedAt).map(i=>b.parts[i.part].lineId===o.lines[1].id),managed:o.lines.map(l=>l.batchManaged),queue:glassBatchRows().length,next:salesNextBatchNumber(),locked:o.lines.every(salesLineLocked)};
  DB.glassBatch=[];normalizeDB();o=salesRecord(id);const again=glassBatchFind('B-0007');
  return Object.assign(first,{relocked:again.items.length,samePieces:JSON.stringify(again.items.map(i=>i.piece))===JSON.stringify(pieces),stillLocked:o.lines.every(salesLineLocked),queueAfterLoss:glassBatchRows().length});
 }),{batches:1,items:6,units:'1,2,1,2,1,1',valid:true,registry:true,history:['Imported legacy batch 4','Imported legacy batch 2'],cut:[true,true],managed:[true,true],queue:0,next:'B-0008',locked:true,relocked:6,samePieces:true,stillLocked:true,queueAfterLoss:0});

 eq('черновая запись PR #84 с количеством делится на стёкла с номерами; история переходит на номера',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');const o=salesRecord(id),l=o.lines[0],pane=o.makeups[0].panes[0],at='2026-09-16T12:00:00Z';
  DB.glassPiece=[];DB.glassPieceSeq=0;o.status='batched';l.batchManaged=true;l.batchedAt=at;l.batchNo='B-0003';
  DB.glassBatch=[{number:'B-0003',createdAt:at,items:[{id:'BI-old',key:[o.id,l.id,pane.id,'lite'].join('|'),orderId:o.id,lineId:l.id,paneId:pane.id,ply:'',qty:2,at,releasedAt:'',cutStartedAt:'',snapshot:{order:o.businessNumber,line:1,lite:'1',glass:'6CLEAR'}}],history:[{at,action:'Created',itemIds:['BI-old'],qty:2}]}];
  normalizeDB();normalizeDB();const b=glassBatchFind('B-0003'),rows=glassBatchRows([salesRecord(id)]);
  return {parts:b.parts.length,units:b.items.map(i=>i.unit),pieces:b.items.every(i=>/^G-\d{7}$/.test(i.piece)),history:b.history.map(h=>h.action+' '+h.pieces.length),left:rows.filter(r=>r.line===1&&r.lite==='1').length,rows:rows.length};
 }),{parts:1,units:[1,2],pieces:true,history:['Created 2'],left:0,rows:4});

 eq('позиция без Makeup не теряется: видна как Glass missing и держит заказ от Ready',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');const o=salesRecord(id);o.lines.push(normalizeSalesOrderLine({makeupId:'missing',width16:320,height16:320,qty:2}));
  const rows=glassBatchRows([o]),missing=rows.filter(r=>r.reason==='Glass missing');const batched=salesSetRecordStatus(id,'batched');
  return {missing:missing.map(r=>r.unit),batched,status:o.status,progress:glassBatchProgress(o)};
 }),{missing:[1,2],batched:false,status:'verified',progress:{total:8,left:8,assigned:0}});

 eq('открытый черновик получает замки батча из очереди, его несохранённые заметки не записываются',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());salesSetRecordStatus(id,'verified');soDraft.notes='Unsaved changes';oqQueue('batch');
  document.querySelector('[data-glass-all]').click();document.querySelector('[data-glass-action="create"]').click();
  return {saved:salesRecord(id).notes,draft:soDraft.notes,status:soDraft.status,managed:soDraft.lines.every(l=>l.batchManaged),locks:soDraft.lines.every(salesLineLocked)};
 }),{saved:'',draft:'Unsaved changes',status:'batched',managed:true,locks:true});

 const unbatchIds=await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer();window.gbU=[gbMixed(c,'6Q240'),gbMixed(c,'6Q240'),oqOrder(c)];soDraft=null;soEdit=null;gbQueue();
  document.querySelector('[data-glass-all]').click();document.querySelector('[data-glass-action="create"]').click();oqChoose('Create batches');
  tab='sales';salesShow={orders:true,quotes:false};salesStatusFilter='';salesListSel=new Set(gbU.slice(0,2));render();return gbU;
 });
 await t.p.locator(`[data-order-row="${unbatchIds[0]}"]`).click({button:'right'});
 eq('Sales: правая кнопка — Unbatch order только у заказа с батчем и только для него',await t.p.evaluate(()=>{
  const menu=[...document.querySelectorAll('.sl-ctx [data-menu]')].map(b=>b.dataset.menu+':'+b.textContent);salesListMenu=null;render();
  const other=salesListContextHTML({id:gbU[2]},'').includes('data-menu="unbatch"');oqThrough(gbU[2],'batched');salesSetRecordStatus(gbU[2],'ready');const ready=salesListContextHTML({id:gbU[2]},'').includes('data-menu="unbatch"');
  return {item:menu.filter(x=>x.startsWith('unbatch')),other,ready};
 }),{item:['unbatch:Unbatch order…'],other:false,ready:false});
 await t.p.locator(`[data-order-row="${unbatchIds[0]}"]`).click({button:'right'});
 await t.p.locator('.sl-ctx [data-menu="unbatch"]').click();
 eq('окно Unbatch order: батчи заказа без номеров стёкол; снимаются стёкла только этого заказа в отмеченных батчах',await t.p.evaluate(()=>{
  const d=salesDialog,a=gbU[0],b=gbU[1],text=document.querySelector('.sales-dialog').innerText;
  const shown={title:d.title===('Unbatch order '+salesRecord(a).businessNumber+'?'),choices:d.lineChoices.map(x=>x.label+' '+x.detail),noGlassIds:!/G-\d{7}/.test(text),confirm:text.includes('Cutting not started')};
  salesDialogToggleLine('B-0002',false);salesDialogConfirm(true);oqChoose('Unbatch order');
  const active=(n,id)=>glassBatchFind(n).items.filter(i=>!i.releasedAt&&glassBatchFind(n).parts[i.part].orderId===id).length;
  return Object.assign(shown,{status:[salesRecord(a).status,salesRecord(b).status],a:[active('B-0001',a),active('B-0002',a)],b:[active('B-0001',b),active('B-0002',b)],selection:[...salesListSel].length,menuAfter:salesListContextHTML({id:a},'').includes('data-menu="unbatch"')});
 }),{title:true,choices:['B-0001 · 6CLEAR 3 pcs','B-0002 · 6Q240 3 pcs'],noGlassIds:true,confirm:true,status:['new','batched'],a:[0,3],b:[3,3],selection:2,menuAfter:true});

 eq('Glass ID не попадают в Sales: список, заказ и окна',await t.p.evaluate(()=>{
  salesDialog=null;soDraft=null;soEdit=null;tab='sales';render();const list=document.getElementById('app').innerText;salesOrderEdit(gbU[1]);const order=document.getElementById('app').innerText;
  return {pieces:gbIds().length>0,list:/G-\d{7}/.test(list),order:/G-\d{7}/.test(order)};
 }),{pieces:true,list:false,order:false});

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
