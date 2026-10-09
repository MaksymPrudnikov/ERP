/* Recut — брак до выдачи, внутри заказа: кнопка у New…Ready, форма без
   действия, блок Recuts над Notes, стёкла R1.k в очереди этого заказа (и у
   заказа New), Ready закрыт до батча, перенос старых Recut из NCR, JSON. */
module.exports=async function({page,eq,ok}){
 console.log('recut');const t=await page();
 const helpers=async()=>{await require('./optimization-fixture')(t.p);await t.p.evaluate(()=>{
  window.rcReason=(where,name)=>ncrReasonsFor(where,{activeOnly:true}).find(r=>r.name===name).id;
  window.rcOrder=status=>{const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;if(status)oqThrough(id,status);tab='sales';salesOrderEdit(id);return id;};
  window.rcFill=(id,o)=>{ncrOpenForm('recut');const rec=salesRecord(id);if(o.where)ncrFormSet('where',o.where);if(o.reason)ncrFormSet('reasonId',rcReason(o.where,o.reason));
   (o.lines||[]).forEach(([i,qty,which])=>{ncrFormLine(rec.lines[i].id,'on',true,true);ncrFormLine(rec.lines[i].id,'qty',String(qty));if(which!=null)ncrFormLine(rec.lines[i].id,'which',String(which),true);});if(o.note)ncrForm.note=o.note;};
  window.rcSection=()=>[...document.querySelectorAll('[data-recut-row]')].map(r=>r.innerText.replace(/\s+/g,' ').trim());
 });};
 await helpers();

 eq('кнопка Recut сразу у New, Verified, Batched и Ready; после выдачи — NCR; нет у квоты, нового и отменённого',await t.p.evaluate(()=>{
  oqReset();const btn=()=>!!document.querySelector('[data-recut-open]'),seen={};
  ['new','verified','batched','ready','done','closed'].forEach(s=>{soDraft=null;soEdit=null;rcOrder(s==='new'?'':s);seen[s]=btn();});
  oqOrder(oqCustomer(),{kind:'quote'});const quote=btn();salesOrderNew('order');const fresh=btn();soDraft=null;soEdit=null;const c=rcOrder();salesSetRecordStatus(c,'cancelled');salesOrderEdit(c);
  return {seen,quote,fresh,cancelled:btn()};
 }),{seen:{new:true,verified:true,batched:true,ready:true,done:false,closed:false},quote:false,fresh:false,cancelled:false});

 eq('форма Recut: без Source и Action; подсказка «2 pcs → glass queue»; проверки',await t.p.evaluate(()=>{
  oqReset();const id=rcOrder('batched'),rec=salesRecord(id);ncrOpenForm('recut');
  const shape={title:document.querySelector('.ncr-modal h3').textContent,action:!!document.querySelector('[data-ncr-action-select]'),source:!!document.querySelector('[data-ncr-source]'),button:document.querySelector('[data-ncr-create]').textContent};
  const errors=[];ncrFormCreate();errors.push(ncrForm.error);ncrFormSet('where','HEAT');ncrFormSet('reasonId',rcReason('HEAT','Exploded in furnace'));ncrFormCreate();errors.push(ncrForm.error);
  ncrFormLine(rec.lines[0].id,'on',true,true);ncrFormLine(rec.lines[0].id,'qty','9');ncrFormCreate();errors.push(ncrForm.error);ncrFormLine(rec.lines[0].id,'qty','2');ncrFormLine(rec.lines[0].id,'which','0',true);
  return Object.assign(shape,{errors,effect:document.querySelector('[data-ncr-effect]').textContent,records:DB.recut.length});
 }),{title:'Recut · Order 76002',action:false,source:false,button:'Create recut',errors:['Choose where and what happened.','Select the affected glass.','Line 1: 1 to 2 pcs'],effect:'2 pcs → glass queue',records:0});

 eq('Recut внутри заказа: по Recut на позицию, блок над Notes, стёкла R1.k с новыми номерами в очереди, Ready закрыт; в NCR не попадает',await t.p.evaluate(()=>{
  oqReset();const id=rcOrder('batched'),seq=DB.glassPieceSeq;rcFill(id,{where:'HEAT',reason:'Exploded in furnace',lines:[[0,2,0],[1,1,'unit']],note:'Second load'});ncrFormCreate();
  const o=salesRecord(id),rows=glassBatchRows([o]);window.rcId=id;
  const notesAfter=(()=>{const sec=document.querySelector('[data-recut-section]'),notes=document.querySelector('.sales-notes');return !!sec&&!!notes&&!!(sec.compareDocumentPosition(notes)&Node.DOCUMENT_POSITION_FOLLOWING);})();
  return {recuts:DB.recut.map(r=>[r.no,r.line,r.lite,r.qty,r.keys.length]),form:!!ncrForm,view:!!ncrViewId,section:rcSection(),notesAfter,ncr:DB.ncr.length,
   rows:rows.map(r=>r.unit+' · '+glassBatchInfo(r).memo.unit),fresh:rows.every(r=>/^G-\d{7}$/.test(r.piece)&&+r.piece.slice(2)>seq),ready:salesRecordTransitionAllowed(o,'ready'),lines:o.lines.map(l=>l.qty),
   glassIds:/G-\d{7}/.test(document.getElementById('app').innerText)};
 }),{recuts:[[1,1,'Lite 1 · 6CLEAR',2,1],[2,2,'Whole unit',1,2]],form:false,view:false,
  section:['Recut 1 Line 1 · Kitchen × Shape Lite 1 · 6CLEAR 2 pcs HEAT · Exploded in furnace In queue Second load','Recut 2 Line 2 · Bedroom × Shape Whole unit 1 pc HEAT · Exploded in furnace In queue Second load'],notesAfter:true,ncr:0,
  rows:['R1.1 · Recut 1 · 1 of 2','R1.2 · Recut 1 · 2 of 2','R2.1 · Recut 2 · 1 of 1','R2.1 · Recut 2 · 1 of 1'],fresh:true,ready:false,lines:[2,1],glassIds:false});

 eq('батч Recut: блок показывает номер батча, Ready ждёт сканов; Unbatch возвращает стекло с тем же номером',await t.p.evaluate(()=>{
  const id=rcId,pieces=glassBatchRows([salesRecord(id)]).map(r=>r.piece),b=glassBatchAssign(glassBatchRows([salesRecord(id)]),{deferTouch:true});salesOrderEdit(id);
  const section=rcSection().map(x=>x.split(' HEAT')[1]),ready=salesRecordTransitionAllowed(salesRecord(id),'ready'),status=salesRecord(id).status;
  const one=b.items.find(i=>i.unit==='R1.2');glassBatchRelease([{batch:b,item:one}],{confirmed:true});salesSetRecordStatus(id,'verified');
  return {batch:b.number,units:b.items.map(i=>i.unit),section,ready,status,back:glassBatchRows([salesRecord(id)]).map(r=>r.unit+':'+(r.piece===pieces[1])),after:recutStatus(DB.recut[0])};
 }),{batch:'B-0002',units:['R1.1','R1.2','R2.1','R2.1'],section:[' · Exploded in furnace Batched · B-0002 Second load',' · Exploded in furnace Batched · B-0002 Second load'],ready:false,status:'batched',back:['R1.2:true'],after:'In queue'});

 eq('Recut у заказа New: только его стёкла идут в очередь и в батч, статус заказа остаётся New',await t.p.evaluate(()=>{
  oqReset();const id=rcOrder();rcFill(id,{where:'CUT',reason:'Broke',lines:[[1,1,'unit']]});ncrFormCreate();
  const rows=glassBatchRows([salesRecord(id)]),b=glassBatchAssign(rows,{deferTouch:true});
  return {rows:rows.map(r=>r.unit),batch:!!b,status:salesRecord(id).status,verified:salesRecordTransitionAllowed(salesRecord(id),'verified'),left:glassBatchRows([salesRecord(id)]).length};
 }),{rows:['R1.1','R1.1'],batch:true,status:'new',verified:true,left:0});

 eq('старый Recut из NCR переносится в заказ один раз: Recut 1, места R1.k, те же номера стёкол, NCR убран',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;oqThrough(id,'batched');const o=salesRecord(id),l=o.lines[0],key=glassBatchComponents(o,l)[0].key,now='2026-09-17T08:00:00Z';
  glassPieceMap(id).get(key).extra={NCR1001:['G-0000901','G-0000902']};DB.glassPieceSeq=902;const b=glassBatchFind('B-0001');
  b.parts.push({key,orderId:id,lineId:l.id,snapshot:{order:o.businessNumber,recut:'NCR1001',line:1,lite:'1',glass:'6CLEAR',of:2}});b.items.push({piece:'G-0000901',part:b.parts.length-1,unit:'NCR1001.1',at:now,releasedAt:'',cutStartedAt:''});
  DB.ncr=[{id:'NCR-old',number:'NCR1001',orderId:id,createdAt:now,source:'Found in shop',where:'HEAT',reasonId:'NR-HEAT-01',reason:'Exploded in furnace',action:'Recut',note:'',glass:[{lineId:l.id,line:1,mark:l.mark,which:'0',lite:'Lite 1 · 6CLEAR',keys:[key],qty:2}],remakeOrderId:''}];
  normalizeDB();normalizeDB();const rec=glassPieceMap(id).get(key),b2=glassBatchFind('B-0001'),item=b2.items[b2.items.length-1];
  return {recuts:DB.recut.map(r=>[r.orderId===id,r.no,r.lite,r.qty,r.reason]),ncr:DB.ncr.length,extra:JSON.stringify(rec.extra),unit:item.unit,snap:b2.parts[item.part].snapshot.recut,queue:glassBatchRows([salesRecord(id)]).map(r=>r.unit+':'+r.piece)};
 }),{recuts:[[true,1,'Lite 1 · 6CLEAR',2,'Exploded in furnace']],ncr:0,extra:'{"R1":["G-0000901","G-0000902"]}',unit:'R1.1',snap:'R1',queue:['R1.2:G-0000902']});

 const saved=await t.p.evaluate(()=>{oqReset();const id=rcOrder('ready');rcFill(id,{where:'SHIPR',reason:'Damaged in rack',lines:[[0,1,1]]});ncrFormCreate();return JSON.stringify([DB.recut,DB.glassPiece]);});
 await t.p.reload();
 eq('после перезагрузки Recut и его номера стёкол те же',await t.p.evaluate(saved=>JSON.stringify([DB.recut,DB.glassPiece])===saved,saved),true);
 await helpers();

 eq('JSON: Recut переживает экспорт и импорт; повтор номера в заказе и не-массив не импортируются; заказ с Recut удаляют только Users, Finance, Optimization',await t.p.evaluate(()=>{
  const src=JSON.parse(JSON.stringify(DB)),next=prepareImportedState(JSON.parse(JSON.stringify(src)));
  const fail=m=>{const x=JSON.parse(JSON.stringify(src));m(x);try{prepareImportedState(x);return '';}catch(e){return e.message;}};
  return {same:JSON.stringify(next.recut)===JSON.stringify(src.recut),dup:fail(x=>{x.recut.push(Object.assign({},x.recut[0],{id:'RC-copy'}));}),shape:fail(x=>{x.recut={};}),del:salesDeleteTouched(DB.salesOrder[0])};
 }),{same:true,dup:'Duplicate recut number.',shape:'The "recut" field must be an array.',del:true});

 eq('экран Recut без русского; заметка не исполняет HTML',await t.p.evaluate(()=>{
  oqReset();const id=rcOrder('batched');rcFill(id,{where:'ARRIS',reason:'Chipped',lines:[[0,1,'unit']],note:'<img src=x onerror="window.rcXss=1">'});const form=document.querySelector('.ncr-modal').innerText;ncrFormCreate();
  const text=form+document.getElementById('app').innerText;return {russian:/[А-яЁё]/.test(text),imgs:document.querySelectorAll('[data-recut-section] img').length,xss:!!window.rcXss,shown:rcSection()[0].includes('<img src=x')};
 }),{russian:false,imgs:0,xss:false,shown:true});

/* Свой чертёж Recut (владелец, 7 октября 2026; заказ 76004): позиция порезана
   по неверному чертежу. Recut получает свой чертёж — строка, её цена и Work
   order остаются как заказано; стекло Recut режется, печатается и клеится
   по своему чертежу. */
 await t.p.evaluate(()=>{
  window.rdWho={id:'rd',name:'Recut operator'};
  window.rdScan=(st,id)=>{const c=stationCheck(st,id);return STATION_RECORDED.includes(c.kind)?stationMove(st,c,rdWho):{kind:c.kind};};
  /* Как 76004: ламинат 6CLEAR + 6CLEAR, 2 шт, оригинал уже порезан на CUT,
     офис завёл Recut «Office · Drawing wrong» на всю позицию. */
  window.rdOrder=()=>{
   oqReset();DB.recut=[];DB.glassBatch=[];DB.cutPlan=[];DB.productionRoute=[];stationRouteReset();
   const c=oqCustomer();tab='sales';salesOrderNew('order');salesSetUnitType('single');const m=soDraft.makeups[0];
   m.panes=[normalizeSalesPane({category:'laminated',laminated:{outerGlassProductId:'GL-6CLEAR',innerGlassProductId:'GL-6CLEAR',interlayerProductId:'INT-PVB030'}},0)];m.cavities=[];m.panes[0].priceOverride=9;
   soDraft.lines=[];const l=normalizeSalesOrderLine({makeupId:m.id,width16:37*16,height16:71*16,qty:2,mark:'SKYLITE'});soDraft.lines.push(l);salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});
   salesApplyCustomerDefaults(c.id);if(!salesOrderSave())throw Error('Fixture save failed');const id=soDraft.id;salesDraftDrop();salesSetRecordStatus(id,'verified');
   glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
   [...stationPieceIndex()].filter(([,h])=>h.orderId===id).forEach(([piece])=>rdScan('CUT',piece));
   tab='sales';salesOrderEdit(id);rcFill(id,{where:'OFFICE',reason:'Drawing wrong',lines:[[0,2,'unit']]});ncrFormCreate();
   window.rd={id,r:DB.recut[0]};return id;
  };
  window.rdLine=()=>salesRecord(rd.id).lines[0];
  window.rdSave=(fn)=>{salesOpenRecutShape(rd.r.id);if(fn)fn();saveShape();return DB.recut[0];};
  /* Документы клиента: Recut — внутренняя проблема цеха, всегда $0 (владелец, 7.10.2026). */
  window.rdDocs=()=>{const o=salesRecord(rd.id);return JSON.stringify(['proforma','confirmation','invoice'].map(k=>finWithOrder(o,()=>docLayout(docBuildModel(k,o)))));};
 });

 eq('строка Recut: размер и Shape; редактор — несохранённая копия с полосой RECUT и Was; Cancel ничего не пишет',await t.p.evaluate(()=>{
  rdOrder();window.rdDocsBefore=rdDocs();const row=document.querySelector('[data-recut-row]'),btn=row.querySelector('[data-recut-shape]'),before=localStorage.getItem(STORAGE_KEY);
  btn.click();
  const open={tab,isNew:sEdit==='new',band:(document.querySelector('[data-shape-recut-band]')||{}).textContent,title:document.querySelector('.shape-workspace-identity b').textContent,inDb:DB.shapeDef.some(s=>s.id===sDraft.id),name:sDraft.name};
  sDraft.w='36';cancelShapeEdit();
  return {size:[...row.querySelectorAll('[data-recut-size] input')].map(i=>i.value).join(' × '),own:btn.classList.contains('own'),open,back:tab,same:localStorage.getItem(STORAGE_KEY)===before,recut:JSON.stringify(DB.recut[0]).includes('shapeRef')};
 }),{size:'37 × 71',own:false,open:{tab:'configurators',isNew:true,band:'RECUT 1 · Line 1 · Office · Drawing wrong · Was 37″ × 71″',title:'Recut drawing',inDb:false,name:'Recut 1 · Line 1'},back:'sales',same:true,recut:false});

 eq('Save revision: чертёж у Recut, строка и её цена как заказано, документы клиента без Recut и без перемен; очередь, раскрой, стикер и лист Recut — по чертежу Recut',await t.p.evaluate(()=>{
  const geo=l=>JSON.stringify([l.width16,l.height16,l.shapeRef,l.liteShapes,salesShapeByRef(l.shapeRef)]),line=geo(rdLine()),total=finOrderTotals(salesRecord(rd.id)).total;
  const r=rdSave(()=>{sDraft.w='36';});
  const o=salesRecord(rd.id),l=o.lines[0],rows=glassBatchRows([o]),c=glassBatchComponents(o,l)[0];
  const sticker=stkGlassData('production',o,l,c,'R1.1',{}),old=stkGlassData('production',o,l,c,1,{});
  const b=glassBatchAssign(rows,{}),cut=cutPieces(b,{}).map(p=>p.unit+':'+p.w);
  return {w:r.width16/16,ref:!!r.shapeRef.id,owner:DB.shapeDef.find(s=>s.id===r.shapeRef.id).ownerLineId===l.id,lineSame:geo(l)===line,
   total:finOrderTotals(o).total===total,rows:rows.map(x=>x.unit+':'+x.width),sticker:[sticker.finished.w,sticker.recut],old:old.finished.w,cut,
   parts:b.parts.map(p=>p.snapshot.recut+':'+p.snapshot.width),log:DB.orderEvent.filter(e=>e.orderId===rd.id&&e.what==='Recut drawing').map(e=>e.note),
   tab,section:[...document.querySelectorAll('[data-recut-size] input')].map(i=>i.value).join(' × '),own:document.querySelector('[data-recut-shape]').classList.contains('own'),
   docs:rdDocs()===rdDocsBefore&&!/recut/i.test(rdDocsBefore)&&/37\\+" × 71/.test(rdDocsBefore)};
 }),{w:36,ref:true,owner:true,lineSame:true,total:true,rows:['R1.1:36','R1.2:36','R1.1:36','R1.2:36'],sticker:[36,'RECUT 1'],old:37,cut:['R1.1:36','R1.2:36','R1.1:36','R1.2:36'],
  parts:['R1:36','R1:36'],log:['Recut 1 · line 1'],tab:'sales',section:'36 × 71',own:true,docs:true});

 eq('чертёж Recut в батче, но не порезан: правка возвращает стекло в To batch; порезано — правка закрыта',await t.p.evaluate(()=>{
  const b=DB.glassBatch.find(x=>x.items.some(i=>typeof i.unit==='string'&&!i.releasedAt)),pieces=b.items.filter(i=>typeof i.unit==='string').map(i=>i.piece);
  const r=rdSave(()=>{sDraft.w='35';});
  const back=glassBatchRows([salesRecord(rd.id)]).map(x=>x.unit+':'+x.width),hist=b.history[b.history.length-1],log=DB.orderEvent.filter(e=>e.orderId===rd.id&&e.what==='Recut drawing').map(e=>e.note);
  const shapes=DB.shapeDef.filter(s=>s.ownerLineId===rdLine().id).length;
  glassBatchAssign(glassBatchRows([salesRecord(rd.id)]),{});rdScan('CUT',pieces[0]);salesOrderEdit(rd.id);
  const btn=document.querySelector('[data-recut-shape]'),opened=salesOpenRecutShape(rd.r.id);
  return {w:r.width16/16,back,hist:[hist.action,hist.qty],log,shapes,lock:recutDrawingLock(DB.recut[0]),disabled:btn.disabled,opened,tab};
 }),{w:35,back:['R1.1:35','R1.2:35','R1.1:35','R1.2:35'],hist:['Recut drawing',4],log:['Recut 1 · line 1','Recut 1 · line 1 · 4 glass out of B-0002'],shapes:2,lock:'Recut glass is already cut.',disabled:true,opened:false,tab:'sales'});

 eq('LAM: плита старого чертежа с плитой Recut в юнит не идёт; плиты Recut — идут; маршрут Recut отдельный',await t.p.evaluate(()=>{
  const o=salesRecord(rd.id),l=o.lines[0],pm=glassPieceMap(rd.id),cs=glassBatchComponents(o,l),outer=pm.get(cs[0].key),inner=pm.get(cs[1].key);
  [outer.extra.R1[0],inner.extra.R1[0]].forEach(id=>rdScan('CUT',id));
  const path=id=>{const g=stationGlass(id);for(let i=0;i<6;i++){const p=stationPlace(g);if(!p.waiting||p.waiting==='LAM')break;rdScan(p.waiting,id);}return stationPlace(g).waiting;};
  const at=[outer.ids[0],inner.extra.R1[0],outer.extra.R1[0]].map(path);
  rdScan('LAM',outer.ids[0]);rdScan('LAM',inner.extra.R1[0]);const mixed=stationAsms(o,l,'LAM').map(a=>a.lites.size);
  rdScan('LAM',outer.extra.R1[0]);const asms=stationAsms(o,l,'LAM').map(a=>[a.lites.size,a.complete]);
  return {at,mixed,asms,key:stationRouteKey(stationGlass(outer.extra.R1[0])).endsWith('|R1'),old:stationRouteKey(stationGlass(outer.ids[0]))===cs[0].key,
   frozen:DB.productionRoute.map(x=>x.key.split('|').slice(3).join('|')).sort()};
 }),{at:['LAM','LAM','LAM'],mixed:[1,1],asms:[[1,false],[2,true]],key:true,old:true,frozen:['inner','inner|R1','outer','outer|R1']});

 eq('Documents → Drawings: у Recut свой лист «Recut 1 · Line 1»; на станции стекло Recut открывает его',await t.p.evaluate(()=>{
  salesOrderEdit(rd.id);docOpen('drawings');const items=docDrawingItems().map(docDrawingName),now=document.querySelector('[data-doc-thumb].doc-thumb-recut');
  const r=DB.recut[0],sheet=salesLineDrawing(rdLine(),r),line=salesLineDrawing(rdLine());docClose();
  const piece=glassPieceMap(rd.id).get(glassBatchComponents(salesRecord(rd.id),rdLine())[0].key).extra.R1[1];stationDrawFind(piece);const drawer=stationDrawer.lineId===r.id;stationDrawer=null;
  return {items,thumb:!!now,recutSheet:/LINE<\/span><b>1 · RECUT 1/.test(sheet.html)&&sheet.html.includes('35″'),lineSheet:!/RECUT/.test(line.html),drawer};
 }),{items:['Line 1 · SKYLITE','Recut 1 · Line 1 · SKYLITE'],thumb:true,recutSheet:true,lineSheet:true,drawer:true});

 eq('разбилось стекло Recut со своим чертежом — новый Recut со станции с тем же чертежом (свои копии форм)',await t.p.evaluate(()=>{
  const o=salesRecord(rd.id),l=o.lines[0],piece=glassPieceMap(rd.id).get(glassBatchComponents(o,l)[0].key).extra.R1[0];
  const reason=ncrReasonsFor('LAM',{activeOnly:true})[0];const out=stationBreak('LAM',stationCheck('LAM',piece),rdWho,reason.id,{});
  const a=DB.recut[0],b=DB.recut.find(x=>x.no===out.recut.no);
  return {no:b.no,w:b.width16/16,h:b.height16/16,own:recutHasShape(b),copy:b.shapeRef.id!==a.shapeRef.id&&!!salesShapeByRef(b.shapeRef),rows:glassBatchRows([o]).filter(x=>x.recut==='R'+b.no).map(x=>x.width)};
 }),{no:2,w:35,h:71,own:true,copy:true,rows:[35,35]});

 eq('JSON: чертёж Recut переживает экспорт и импорт; без формы не импортируется; старые Recut — без новых полей',await t.p.evaluate(()=>{
  const src=JSON.parse(JSON.stringify(DB)),next=prepareImportedState(JSON.parse(JSON.stringify(src)));
  const lost=JSON.parse(JSON.stringify(src));lost.shapeDef=lost.shapeDef.filter(s=>s.id!==src.recut[0].shapeRef.id);let err='';try{prepareImportedState(lost);}catch(e){err=e.message;}
  const keep=DB.recut;DB.recut=[{id:'RC-x',orderId:rd.id,no:9,lineId:rdLine().id,line:1,keys:src.recut[0].keys,qty:1}];normalizeRecuts();const plain=Object.keys(DB.recut[0]).join();DB.recut=keep;
  return {same:JSON.stringify(next.recut)===JSON.stringify(src.recut),shapes:src.recut.every(r=>next.shapeDef.some(s=>s.id===r.shapeRef.id)),err,plain};
 }),{same:true,shapes:true,err:'Recut 1 references a missing Shape.',plain:'id,orderId,no,createdAt,lineId,line,mark,which,lite,keys,qty,where,reasonId,reason,note'});

 eq('IGU: размер Recut правится прямо в строке; у фигуры — только через Shape; разные размеры обычного юнита ждут правильную пару',await t.p.evaluate(()=>{
  oqReset();DB.recut=[];DB.glassBatch=[];DB.productionRoute=[];stationRouteReset();
  const id=oqOrder(oqCustomer());salesDraftDrop();salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
  tab='sales';salesOrderEdit(id);rcFill(id,{where:'OFFICE',reason:'Drawing wrong',lines:[[1,1,0]]});ncrFormCreate();
  salesOrderEdit(id);const inp=document.querySelector('[data-recut-w]');inp.value='29 1/8';inp.dispatchEvent(new Event('change'));
  const typed={w:DB.recut[0].width16/16,line:salesRecord(id).lines[1].width16/16,cell:document.querySelector('[data-recut-w]').value,log:DB.orderEvent.filter(e=>e.orderId===id&&e.what==='Recut drawing').length};
  salesOpenRecutShape(DB.recut[0].id);setShapeType('raked');saveShape();const figure={inputs:document.querySelectorAll('[data-recut-size] input').length,text:/″ × /.test(document.querySelector('[data-recut-size]').textContent)};
  glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
  const o=salesRecord(id),l=o.lines[1],pm=glassPieceMap(id),cs=glassBatchComponents(o,l),lite2=pm.get(cs[1].key).ids[0],lite1=pm.get(cs[0].key).extra.R1[0];
  const go=pid=>{const g=stationGlass(pid);for(let i=0;i<8;i++){const p=stationPlace(g);if(!p.waiting||p.waiting==='IGU')break;rdScan(p.waiting,pid);}return stationPlace(g).waiting;};
  const at=[lite2,lite1].map(go);rdScan('IGU',lite1);rdScan('IGU',lite2);
  return {typed,figure,at,asm:stationAsms(o,l,'IGU').map(a=>[a.lites.size,a.unit])};
 }),{typed:{w:29.125,line:30,cell:'29 1/8',log:1},figure:{inputs:0,text:true},at:['IGU','IGU'],asm:[[1,0],[1,0]]});

 eq('обычный юнит: Recut одного лайта того же размера собирается с исходной парой; стикер одинаков через оба G и U',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());salesDraftDrop();salesSetRecordStatus(id,'verified');
  salesOrderEdit(id);rcFill(id,{where:'OFFICE',reason:'Drawing wrong',lines:[[1,1,0]]});ncrFormCreate();const r=DB.recut[0];
  const changed=storageCommand(()=>recutSizeCommand(r.id,30*16,40*16));salesDraftDrop();glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
  const o=salesRecord(id),l=o.lines[1],cs=glassBatchComponents(o,l),pm=glassPieceMap(id),ids=[pm.get(cs[0].key).extra.R1[0],pm.get(cs[1].key).ids[0]];
  ids.forEach(pid=>{for(let i=0;i<8;i++){const g=stationGlass(pid),p=stationPlace(g);if(!p.waiting||p.waiting==='IGU')break;rdScan(p.waiting,pid);}rdScan('IGU',pid);});
  const asm=stationAsms(o,l,'IGU').find(a=>a.unit),data=ids.map(pid=>stkUnitData(o,l,asm.unit,stationGlass(pid).unit));
  const oldPrint=window.print;window.print=()=>{};const prints=ids.concat(unitIdAt(id,l.id,asm.unit)).map(stationPrintUnit);window.print=oldPrint;stkPrintCleanup();
  return {changed:changed.ok,assembled:asm.lites.size,size:data.map(d=>d.finished),same:JSON.stringify(data[0])===JSON.stringify(data[1]),prints};
 }),{changed:true,assembled:2,size:[{w:30,h:40},{w:30,h:40}],same:true,prints:[true,true,true]});

 await t.p.setViewportSize({width:390,height:844});
 eq('на телефоне форма и блок Recut не шире экрана',await t.p.evaluate(()=>{const id=DB.salesOrder[0].id;salesOrderEdit(id);const block=document.documentElement.scrollWidth<=innerWidth+1;ncrOpenForm('recut');const r=document.querySelector('.ncr-modal').getBoundingClientRect();return block&&r.left>=0&&r.right<=innerWidth+1;}),true);
 eq('после CUT → Undo новая геометрия Recut обновляет только его маршрут, включая DRILL',await t.p.evaluate(()=>{
  rdOrder();rdSave(()=>{sDraft.w='36';});glassBatchAssign(glassBatchRows([salesRecord(rd.id)]),{});
  const piece=recutPieces(DB.recut[0])[0],scan=rdScan('CUT',piece),old=DB.productionRoute.filter(x=>!x.key.includes('|R')).map(x=>JSON.stringify(x));
  stationUndo(scan.value.rec.id,rdWho);salesOrderEdit(rd.id);rdSave(()=>sDraft.features.push(shapeNormalizeFeature({type:'hole',diameter:'1',x:'6',y:'6',minEdge:'1/2'})));
  const g=stationGlass(piece),route=stationRouteOf(g).codes,expected=stkRoute(g.o,stationGeo(g),g.c).codes;
  return {drill:route.includes('DRILL'),same:JSON.stringify(route)===JSON.stringify(expected),originals:JSON.stringify(old)===JSON.stringify(DB.productionRoute.filter(x=>!x.key.includes('|R')).map(x=>JSON.stringify(x)))};
 }),{drill:true,same:true,originals:true});
 eq('Recut целого юнита: собственная форма лайта открывается сразу из строки; Cancel ничего не пишет, Save меняет только копию',await t.p.evaluate(()=>{
  oqReset();DB.recut=[];const id=oqOrder(oqCustomer());salesOrderEdit(id);const l=soDraft.lines[1];salesOpenLiteShape(l.id,0);sDraft.w='29';saveShape();salesOrderSave();salesDraftDrop();salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
  salesOrderEdit(id);rcFill(id,{where:'OFFICE',reason:'Drawing wrong',lines:[[1,1,'unit']]});ncrFormCreate();const r=DB.recut[0],original=JSON.stringify(salesRecord(id)),ref=salesRecord(id).lines[1].liteShapes['0'],shape=JSON.stringify(salesShapeByRef(ref));
  let row=document.querySelector('[data-recut-row]');row.querySelector('[data-recut-drawing]').value='0';row.querySelector('[data-recut-shape]').click();const opened=salesBridge.liteIndex===0,before=JSON.stringify(DB);sDraft.w='28';cancelShapeEdit();const cancelled=JSON.stringify(DB)===before;
  row=document.querySelector('[data-recut-row]');row.querySelector('[data-recut-drawing]').value='0';row.querySelector('[data-recut-shape]').click();sDraft.w='28';saveShape();
  const current=recutFind(r.id),own=salesShapeByRef(current.liteShapes['0']);return {opened,cancelled,width:ShapeModule.compute(own).width,copy:own.id!==ref.id,shape:JSON.stringify(salesShapeByRef(ref))===shape,line:JSON.stringify(salesRecord(id).lines)===JSON.stringify(JSON.parse(original).lines),queue:glassBatchRows([salesRecord(id)]).filter(x=>x.recut).map(x=>x.width)};
 }),{opened:true,cancelled:true,width:28,copy:true,shape:true,line:true,queue:[28,30]});
 eq('Recut без ошибок страницы',t.errs,[]);await t.c.close();
};
