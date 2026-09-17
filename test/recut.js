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
  section:['Recut 1 Line 1 · Kitchen Lite 1 · 6CLEAR 2 pcs HEAT · Exploded in furnace In queue Second load','Recut 2 Line 2 · Bedroom Whole unit 1 pc HEAT · Exploded in furnace In queue Second load'],notesAfter:true,ncr:0,
  rows:['R1.1 · Recut 1 · 1 of 2','R1.2 · Recut 1 · 2 of 2','R2.1 · Recut 2 · 1 of 1','R2.1 · Recut 2 · 1 of 1'],fresh:true,ready:false,lines:[2,1],glassIds:false});

 eq('батч Recut: блок показывает номер батча, Ready открыт; Unbatch возвращает стекло с тем же номером',await t.p.evaluate(()=>{
  const id=rcId,pieces=glassBatchRows([salesRecord(id)]).map(r=>r.piece),b=glassBatchAssign(glassBatchRows([salesRecord(id)]),{deferTouch:true});salesOrderEdit(id);
  const section=rcSection().map(x=>x.split(' HEAT')[1]),ready=salesRecordTransitionAllowed(salesRecord(id),'ready'),status=salesRecord(id).status;
  const one=b.items.find(i=>i.unit==='R1.2');glassBatchRelease([{batch:b,item:one}],{confirmed:true});salesSetRecordStatus(id,'verified');
  return {batch:b.number,units:b.items.map(i=>i.unit),section,ready,status,back:glassBatchRows([salesRecord(id)]).map(r=>r.unit+':'+(r.piece===pieces[1])),after:recutStatus(DB.recut[0])};
 }),{batch:'B-0002',units:['R1.1','R1.2','R2.1','R2.1'],section:[' · Exploded in furnace Batched · B-0002 Second load',' · Exploded in furnace Batched · B-0002 Second load'],ready:true,status:'batched',back:['R1.2:true'],after:'In queue'});

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

 eq('JSON: Recut переживает экспорт и импорт; повтор номера в заказе и не-массив не импортируются; удалить заказ с Recut нельзя',await t.p.evaluate(()=>{
  const src=JSON.parse(JSON.stringify(DB)),next=prepareImportedState(JSON.parse(JSON.stringify(src)));
  const fail=m=>{const x=JSON.parse(JSON.stringify(src));m(x);try{prepareImportedState(x);return '';}catch(e){return e.message;}};
  return {same:JSON.stringify(next.recut)===JSON.stringify(src.recut),dup:fail(x=>{x.recut.push(Object.assign({},x.recut[0],{id:'RC-copy'}));}),shape:fail(x=>{x.recut={};}),del:salesDeleteBlocked(DB.salesOrder[0])};
 }),{same:true,dup:'Duplicate recut number.',shape:'The "recut" field must be an array.',del:true});

 eq('экран Recut без русского; заметка не исполняет HTML',await t.p.evaluate(()=>{
  oqReset();const id=rcOrder('batched');rcFill(id,{where:'EDGE',reason:'Chipped',lines:[[0,1,'unit']],note:'<img src=x onerror="window.rcXss=1">'});const form=document.querySelector('.ncr-modal').innerText;ncrFormCreate();
  const text=form+document.getElementById('app').innerText;return {russian:/[А-яЁё]/.test(text),imgs:document.querySelectorAll('[data-recut-section] img').length,xss:!!window.rcXss,shown:rcSection()[0].includes('<img src=x')};
 }),{russian:false,imgs:0,xss:false,shown:true});

 await t.p.setViewportSize({width:390,height:844});
 eq('на телефоне форма и блок Recut не шире экрана',await t.p.evaluate(()=>{const id=DB.salesOrder[0].id;salesOrderEdit(id);const block=document.documentElement.scrollWidth<=innerWidth+1;ncrOpenForm('recut');const r=document.querySelector('.ncr-modal').getBoundingClientRect();return block&&r.left>=0&&r.right<=innerWidth+1;}),true);
 eq('Recut без ошибок страницы',t.errs,[]);await t.c.close();
};
