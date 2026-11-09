/* Packing slip and skid sheets, Letter. Shared docPage primitives keep
   preview/print/PDF identical. No pricing enters this model.
   Dispatch freezes the document; subsequent shipments cannot change Before.
   Printing is recorded as requested, not a claim that a printer succeeded. */
/* Отмена на бумаге клиента (владелец, 6.10.2026: «отменённый юнит указывай,
   важно, пусть будет на бумаге»): сколько юнитов строки отменено и что со
   стеклом. Клиент расписывается на PS — и под отменой тоже. */
function shippingCancelNote(o,l,psId){
 const units=(o.cancellations||[]).filter(c=>c.lineId===l.id).flatMap(c=>c.units||[]);if(!units.length)return '';
 const fate=u=>u.glass==='customer'?(u.takenPs&&u.takenPs!==psId?'glass went with '+((shippingFind(u.takenPs)||{}).number||'an earlier packing slip'):'glass goes with this packing slip'):u.glass==='scrap'?'scrapped at your request':u.glass==='stock'?'not shipped':'not made';
 const m=new Map();units.forEach(u=>{const k=fate(u);m.set(k,(m.get(k)||0)+1);});
 return shippingCount(units.length,'unit')+' cancelled'+(m.size===1?' · '+[...m.keys()][0]:': '+[...m].map(([k,n])=>n+' '+k).join(', '));
}
function shippingUnbatchDocument(s,d){
 const items=s.unbatchedItems||[];if(!items.length)return d;
 const ids=new Set(items.map(i=>i.unbatchId));
 d.corrections=(DB.productionUnbatch||[]).filter(r=>ids.has(r.id)).map(r=>{
  const a=items.filter(i=>i.unbatchId===r.id);
  return 'Unbatch '+finLocalDate(r.at)+' · '+shippingCount(a.length,'unit')+' excluded · '+a.map(i=>i.label).join(', ')+' → '+productionUnbatchTargetLabel(r.target)+' · '+r.by+(r.reason?' · '+r.reason:'');
 });
 d.corrections.unshift('Corrected packing slip · '+shippingCount(s.items.length,'unit')+' remain. Original quantities below.');
 return d;
}
function shippingDocument(s){
 if(s.document)return shippingUnbatchDocument(s,shippingClone(s.document));
 if(s.id&&s.status==='planned'){
  const live=new Map(shippingOrderIds(s).flatMap(id=>shippingUnits(salesRecord(id))).map(i=>[i.label,i]));
  /* На бумаге клиента — только скиды, которые с этим PS уезжают: с микса и у
     стойки выдают юниты, а не скид (erp/shipping/loading, shippingSkidsOut). */
  const items=s.items.map(i=>Object.assign({},i,{skid:live.has(i.label)?live.get(i.label).skid:i.skid,loaded:live.has(i.label)&&!!live.get(i.label).loaded}));
  const out=Array.isArray(s.skidsOut)?s.skidsOut:shippingSkidsOut(s,items);
  s=Object.assign({},s,{items:items.map(i=>{const x=Object.assign({},i,{skid:out.includes(i.skid)?i.skid:''});delete x.loaded;return x;})});
 }
 const orders=shippingOrderIds(s).map(id=>{
  const o=salesRecord(id),q=shippingSummary(o);
  const rows=(o.lines||[]).map((l,n)=>{
   const items=s.items.filter(i=>i.orderId===id&&i.lineId===l.id);
   const before=shippingForOrder(id).filter(p=>p.id!==s.id&&shippingSent(p)).flatMap(p=>p.items).filter(i=>i.orderId===id&&i.lineId===l.id).length;
   const weight=salesLineWeight(l,o),m=salesMakeupById(o,l.makeupId);
   return {lineId:l.id,line:n+1,mark:l.mark||'',size:docSize(l),makeup:m?salesMakeupSummary(m,'name'):'',ordered:l.qty,before,now:items.length,back:Math.max(0,shippingLineQty(l)-before-items.length),note:shippingCancelNote(o,l,s.id),kg:weight.kg,knownKg:weight.knownKg,skids:[...new Set(items.map(i=>i.skid).filter(Boolean))].join(', ')};
  }).filter(Boolean);
  const extras=(o.extraItems||[]).map(x=>{
   const picked=s.extras.find(i=>i.orderId===id&&i.extraId===x.id),qty=picked?picked.qty:0,before=shippingForOrder(id).filter(p=>p.id!==s.id&&shippingSent(p)).flatMap(p=>p.extras).filter(a=>a.orderId===id&&a.extraId===x.id).reduce((n,a)=>n+a.qty,0);
   return {extraId:x.id,name:salesExtraItemName(x),ordered:x.qty,before,now:qty,back:Math.max(0,x.qty-before-qty)};
  });
  const now=rows.concat(extras).reduce((n,r)=>n+r.now,0),left=Math.max(0,q.back-now);
  /* Стекло отменённых юнитов, которое клиент забирает, — строкой на этом PS. */
  const takes=unitTakes(o).map(x=>({line:x.line,size:docSize(x.l),pieces:x.pieces}));
  return {id,number:o.businessNumber,po:o.customerPo||'',state:left===0?'complete':q.shipped?'back order':'partial',rows,extras,takes};
 });
 const skids=[...new Set(s.items.map(i=>i.skid).filter(Boolean))].map(code=>{
  const rows=[];orders.forEach(o=>o.rows.forEach(r=>{const qty=s.items.filter(i=>i.orderId===o.id&&i.lineId===r.lineId&&i.skid===code).length;if(qty)rows.push({order:o.number,po:o.po,...r,now:qty,note:''});}));
  const exact=rows.every(r=>r.kg!=null);return {code,rows,qty:rows.reduce((n,r)=>n+r.now,0),kg:rows.reduce((n,r)=>n+(r.kg==null?r.knownKg:r.kg)*r.now,0),exact};
 });
 return shippingUnbatchDocument(s,{number:s.number,date:s.date,method:s.method,shipTo:shippingClone(s.shipTo),customer:salesCustomerDisplay(s.customerId),company:docCompanyBlock(),orders,skids,note:s.note||''});
}
function shippingNeedsReprint(s){return !!s.printedAt&&s.printedSignature!==JSON.stringify(shippingDocument(s));}
/* Шаблон Packing slip по умолчанию (этап 7): числа подобраны так, что лист
   выходит точка в точку как прежний, нарисованный кодом (сверено на
   выгрузках 05.11.2026). y текста — линия букв от верха части. Строки
   итогов прежний код печатал 8 pt с шагом 14 и переносом 9 pt на 540 —
   это тот же перенос, что 8 pt на 480. */
function shippingFormDefault(){
 const C=DOC_COLOR,mut=C.mut,due=C.due;
 /* Плашки From / To листа скида: рамка, подпись, имя и строки внутри. */
 const card=(id,x,place,label,name,lines,extra)=>[
  {id,type:'box',place,y:84,w:265,h:66,fill:C.box,color:'',r:4},
  {id:id+'Label',type:'text',text:label,place:'free',x:x+9,y:95,w:247,h:8,size:5.8,lh:8,bold:true,color:mut,ls:.6},
  {id:id+'Name',type:'field',field:name,place:'free',x:x+9,y:109,w:247,h:12,size:10,lh:12,bold:true,fit:true},
  {id:id+'Lines',type:'field',field:lines,place:'free',x:x+9,y:121,w:247,h:20,size:7.6,lh:10,fit:true,max:2}].concat(extra||[]);
 return {form:'packingSlip',page:{w:612,h:792,margin:{top:30,right:36,bottom:67,left:36}},parts:{
  every:{h:133,blocks:[
   {id:'company',type:'field',field:'company.name',place:'left',y:14,w:320,h:20,size:13,lh:20,bold:true,fit:true,empty:'Glass Farm'},
   {id:'title',type:'field',field:'title',place:'right',y:14,w:320,h:20,size:17,lh:20,bold:true,align:'right'},
   {id:'number',type:'field',field:'number',place:'right',y:34,w:320,h:11,size:13,lh:11,bold:true,align:'right',empty:'Not assigned'},
   {id:'barcode',type:'barcode',field:'barcode',place:'right',y:45,w:200,h:30,align:'right'},
   {id:'companyLines',type:'field',field:'company.lines',place:'left',y:34,w:330,h:33,size:8,lh:11,color:mut,fit:true,max:3},
   {id:'customer',type:'field',field:'customer',place:'left',y:91,w:300,h:17,size:12,lh:17,bold:true},
   {id:'shipDate',type:'field',field:'shipDate',place:'right',y:91,w:300,h:17,size:9,lh:17,align:'right'},
   {id:'shipTo',type:'field',field:'shipTo',place:'left',y:108,w:540,h:13,size:9,lh:13,wrap:true}]},
  first:{h:14,blocks:[
   {id:'corrections',type:'field',field:'corrections',place:'left',y:0,w:480,h:14,size:8,lh:14,bold:true,color:due,wrap:true}]},
  /* Колонки — ячейки по порядку от левого поля (formColumns): cw — ширина
     ячейки, pad — отступ надписи, w — перенос текста. Числа подобраны так,
     что колонки стоят там же, где стояли в коде (Line 41, Ordered 363…). */
  table:{columns:[
   {k:'line',label:'Line / Mark',type:'text',cw:81,w:75},{k:'size',label:'Size',type:'text',cw:89,w:84},{k:'makeup',label:'Makeup',type:'text',cw:105,w:99},
   {k:'ordered',label:'Ordered',type:'num',cw:57},{k:'before',label:'Before',type:'num',cw:38},
   {k:'now',label:'Now',type:'num',cw:34,bold:true},{k:'back',label:'Back order',type:'num',cw:54,bold:true,alert:true},
   {k:'skid',label:'Skid',type:'text',cw:82,pad:26,w:53}]},
  totals:{h:93,keep:130,blocks:[
   {id:'skids',type:'field',field:'skids',place:'left',y:0,w:480,h:14,size:8,lh:14,wrap:true},
   {id:'note',type:'field',field:'note',place:'left',y:14,w:480,h:14,size:8,lh:14,wrap:true},
   {id:'received',type:'text',text:'Received by ____________________    Signature ____________________',place:'left',y:43,w:480,h:14,size:8,lh:14,wrap:true},
   {id:'receivedAt',type:'text',text:'Date and time ____________________',place:'left',y:57,w:480,h:14,size:8,lh:14,wrap:true},
   {id:'skidsProperty',type:'field',field:'skidsProperty',place:'left',y:80,w:540,h:13,size:8,color:mut,wrap:true}]},
  /* Лист скида (владелец 05.11.2026, вариант Б): QR всегда в правом
     верхнем углу (пока пустое место), огромный код и вес рядом, ниже From /
     To; таблица — по заказу, внутри порядок укладки. */
  skidTop:{h:178,blocks:[
   {id:'qr',type:'box',place:'right',y:0,w:72,h:72,color:C.chip,lw:.8,r:3},
   {id:'qrNote',type:'text',text:'QR',place:'right',y:40,w:72,h:12,size:9,lh:12,color:C.faint,align:'center'},
   {id:'skidTitle',type:'text',text:'SKID CONTENTS · {number}',place:'left',y:14,w:400,h:14,size:11,lh:14,bold:true,color:C.navy},
   {id:'skidCode',type:'field',field:'skid',place:'left',y:60,w:300,h:24,size:52,lh:24,bold:true},
   {id:'skidUnits',type:'field',field:'skidUnits',place:'free',after:'skidCode',gap:16,x:200,y:60,w:260,h:24,size:13,lh:24,bold:true}]
   .concat(card('from',36,'left','FROM','company.name','company.lines'))
   .concat(card('to',311,'right','TO','customer','shipToAddress',[{id:'toDate',type:'field',field:'shipDate',place:'free',x:320,y:141,w:247,h:9,size:7.6,lh:9,color:mut,fit:true}]))},
  skidTable:{columns:[
   {k:'pos',label:'#',type:'text',cw:55,w:50,bold:true},{k:'line',label:'Line / Mark',type:'text',cw:75,w:70},{k:'size',label:'Size',type:'text',cw:105,w:100},{k:'makeup',label:'Makeup',type:'text',cw:200,w:190},
   {k:'qty',label:'Qty',type:'num',cw:34,bold:true},{k:'kg',label:'kg',type:'num',cw:48}]},
  bottom:{h:67,blocks:[
   {id:'pageNo',type:'text',text:'{number|Skid contents} · {page} / {pages}',place:'right',y:41,w:300,h:13,size:8,color:mut,align:'right'}]}
 }};
}
/* Поля бланка: ключ, группа и подпись для конструктора (окно Insert
   field), значение из документа PS; t:'date' — день, вид выбирает блок. */
const SHIPPING_FORM_FIELDS=[
 {k:'company.name',g:'Company',label:'Company name',v:d=>d.company.name},
 {k:'company.lines',g:'Company',label:'Address and contacts',v:d=>d.company.lines},
 {k:'company.logo',g:'Company',label:'Logo',v:d=>d.company.logo||''},
 {k:'customer',g:'Customer',label:'Customer',v:d=>d.customer},
 {k:'shipTo',g:'Customer',label:'Ship to (all lines)',v:d=>{const a=d.shipTo;return [a.addressee,docAddressText(a),[a.contact,a.phone].filter(Boolean).join(' · ')].filter(Boolean);}},
 {k:'shipToAddress',g:'Customer',label:'Ship to address',v:d=>{const a=d.shipTo;return [docAddressText(a),[a.contact,a.phone].filter(Boolean).join(' · ')].filter(Boolean);}},
 {k:'title',g:'Packing slip',label:'Title',v:()=>'PACKING SLIP'},
 {k:'number',g:'Packing slip',label:'Packing slip No.',v:d=>d.number||''},
 {k:'barcode',g:'Packing slip',label:'Barcode',v:d=>d.number||''},
 {k:'date',g:'Packing slip',label:'Date',t:'date',v:d=>d.date||''},
 {k:'method',g:'Packing slip',label:'Method',v:d=>d.method==='pickup'?'Pickup':'Delivery'},
 {k:'shipDate',g:'Packing slip',label:'Date and method',v:d=>docDate(d.date)+' · '+(d.method==='pickup'?'Pickup':'Delivery')},
 {k:'note',g:'Packing slip',label:'Note',v:d=>d.note||''},
 {k:'corrections',g:'Packing slip',label:'Corrections',v:d=>d.corrections||[]},
 {k:'skids',g:'Skids',label:'Skids list',v:d=>d.skids.map(s=>s.code+' · '+shippingCount(s.qty,'unit')+' · '+(s.exact?'':'≈ ')+docNum(s.kg,1)+' kg')},
 {k:'skid',g:'Skids',label:'Skid code',v:()=>''},
 {k:'skidUnits',g:'Skids',label:'Skid units and weight',v:()=>''},
 {k:'skidsProperty',g:'Skids',label:'Skids remain ours',v:d=>d.skids.length?shippingCount(d.skids.length,'skid')+' left on site '+(d.skids.length===1?'remains':'remain')+' property of '+(d.company.name||'the supplier')+'.':''}
];
/* Что может стоять в колонке таблицы (конструктор: Shows, + Column). */
const SHIPPING_TABLE_COLUMNS=[
 {k:'line',label:'Line / Mark',type:'text',v:r=>String(r.line)+(r.mark?' · '+r.mark:'')},
 {k:'mark',label:'Mark',type:'text',v:r=>r.mark||''},
 {k:'size',label:'Size',type:'text',v:r=>r.size},
 {k:'makeup',label:'Makeup',type:'text',v:r=>r.makeup},
 {k:'ordered',label:'Ordered',type:'num',v:r=>r.ordered},
 {k:'before',label:'Before',type:'num',v:r=>r.before},
 {k:'now',label:'Now',type:'num',v:r=>r.now},
 {k:'back',label:'Back order',type:'num',v:r=>r.back},
 {k:'weight',label:'Weight kg',type:'num',v:r=>docNum((r.kg==null?r.knownKg:r.kg)*r.now,1)},
 {k:'skid',label:'Skid',type:'text',v:r=>r.skids||'—'}];
const SHIPPING_SKID_COLUMNS=[
 {k:'pos',label:'#',type:'text',v:r=>r.pos},
 {k:'line',label:'Line / Mark',type:'text',v:r=>String(r.line)+(r.mark?' · '+r.mark:'')},
 {k:'mark',label:'Mark',type:'text',v:r=>r.mark||''},
 {k:'size',label:'Size',type:'text',v:r=>r.size},
 {k:'makeup',label:'Makeup',type:'text',v:r=>r.makeup},
 {k:'qty',label:'Qty',type:'num',v:r=>r.now},
 {k:'kg',label:'kg',type:'num',v:r=>docNum((r.kg==null?r.knownKg:r.kg)*r.now,1)}];
/* Простой расчёт по строкам PS (группа Totals): сколько юнитов, заказано,
   осталось, вес, строк, скидов. */
function shippingFormTotals(){
 const rows=d=>(d.orders||[]).flatMap(o=>o.rows||[]),sum=(d,f)=>rows(d).reduce((n,r)=>n+(Number(f(r))||0),0);
 return [
  {k:'total.units',g:'Totals',label:'Units on this slip',v:d=>String(sum(d,r=>r.now))},
  {k:'total.ordered',g:'Totals',label:'Ordered',v:d=>String(sum(d,r=>r.ordered))},
  {k:'total.back',g:'Totals',label:'Back order',v:d=>String(sum(d,r=>r.back))},
  {k:'total.weight',g:'Totals',label:'Weight kg',v:d=>docNum(sum(d,r=>(r.kg==null?r.knownKg:r.kg)*r.now),1)},
  {k:'total.lines',g:'Totals',label:'Lines',v:d=>String(rows(d).filter(r=>r.now).length)},
  {k:'total.skids',g:'Totals',label:'Skids',v:d=>String((d.skids||[]).length)}];
}
function shippingFormFields(){return formWithCompany(SHIPPING_FORM_FIELDS).concat(shippingFormTotals(),formMyFields());}
function shippingFormContext(d){
 const by=new Map(shippingFormFields().map(x=>[x.k,x]));
 return {field:k=>{const x=by.get(k);return x?x.v(d):undefined;},type:k=>(by.get(k)||{}).t||''};
}
/* Шаблон для печати: сохранённый в конструкторе (Data → Company & print →
   Forms) или по умолчанию. */
function shippingFormTemplate(){return formClean(DB.formTemplate&&DB.formTemplate[formUseKey('packingSlip')],shippingFormDefault());}
/* Лист для конструктора, когда PS в базе ещё нет. */
function shippingFormSample(){
 return {number:'PS-0001',date:finToday(),method:'delivery',shipTo:{addressee:'Site office',address1:'10 Glass St',city:'Toronto',province:'ON',postalCode:'M1M 1M1',contact:'Pat',phone:'416-555-0100'},customer:'Sample Customer',company:docCompanyBlock(),
  orders:[{id:'sample',number:'10001',po:'PO-1',state:'complete',rows:[{lineId:'l1',line:1,mark:'Kitchen',size:'36" × 48"',makeup:'6mm Clear Tempered',ordered:2,before:0,now:2,back:0,note:'',kg:25,knownKg:25,skids:'SL-1'},{lineId:'l2',line:2,mark:'',size:'24" × 30"',makeup:'6mm Clear Tempered',ordered:1,before:0,now:1,back:0,note:'',kg:10,knownKg:10,skids:'SL-1'}],extras:[],takes:[]}],
  skids:[{code:'SL-1',qty:3,kg:60,exact:true,rows:[{order:'10001',po:'PO-1',lineId:'l1',line:1,mark:'Kitchen',size:'36" × 48"',makeup:'6mm Clear Tempered',now:2,kg:25,knownKg:25},{order:'10001',po:'PO-1',lineId:'l2',line:2,mark:'',size:'24" × 30"',makeup:'6mm Clear Tempered',now:1,kg:10,knownKg:10}]}],note:''};
}
/* Порядок укладки на скиде: место каждого юнита по его скану на этот скид
   (#1 — положили первым), как в окне скида. Считается при печати, в
   документ PS не пишется (иначе напечатанные PS просили бы перепечатку).
   Ключ — orderId|lineId → места. Нет скана у какого-то юнита — колонка #
   пустая и порядок как в документе. */
function shippingSkidPlaces(d){
 const out=new Map(),s=(DB.shipment||[]).find(x=>x.number===d.number);if(!s||!d.skids.length)return out;
 const codes=new Set(d.skids.map(k=>k.code)),at=new Map();
 (DB.stationScan||[]).forEach(x=>{if(x.undoneAt||!codes.has(x.on))return;const k=x.on+'|'+x.piece;if(!at.has(k)||x.at>at.get(k))at.set(k,x.at);});
 d.skids.forEach(k=>{
  const units=(s.items||[]).filter(i=>i.skid===k.code).map((i,n)=>({i,n,t:(i.pieces||[]).map(p=>at.get(k.code+'|'+p)||'').sort().pop()||''}));
  if(!units.length||units.length!==k.qty||units.some(u=>!u.t))return;
  const m=new Map();units.sort((a,b)=>a.t.localeCompare(b.t)||a.n-b.n).forEach((u,n)=>{const key=u.i.orderId+'|'+u.i.lineId;if(!m.has(key))m.set(key,[]);m.get(key).push(n+1);});
  out.set(k.code,m);
 });
 return out;
}
/* [1,2,3,6] → «#1–3, #6». */
function shippingPlaceText(list){
 const r=[];list.slice().sort((a,b)=>a-b).forEach(v=>{const x=r[r.length-1];if(x&&v===x[1]+1)x[1]=v;else r.push([v,v]);});
 return r.map(x=>'#'+(x[0]===x[1]?x[0]:x[0]+'–'+x[1])).join(', ');
}
/* tpl и map — для конструктора: свой черновик шаблона и места блоков. */
function shippingPages(d,skidOnly,tpl,map){
 tpl=tpl||shippingFormTemplate();const f=formFlow(tpl,shippingFormContext(d),map),W=f.right-f.left;let activeOrder;
 const cols=formColumns(tpl.parts.table.columns,f.left),by=new Map(SHIPPING_TABLE_COLUMNS.map(c=>[c.k,c]));
 /* Шапка таблицы — один раз на лист в места для конструктора (клик по колонке). */
 const headSeen=new Set(),headMark=(part,list,y)=>{if(!map||headSeen.has(part+f.pages.length))return;headSeen.add(part+f.pages.length);list.forEach(c=>map.push({page:f.pages.length-1,part,id:'col:'+c.k,x:c.start,y:y-11,w:c.cw,h:21}));};
 const line=(text,opts)=>{opts=opts||{};const size=opts.size||9;docWrap(String(text),size,!!opts.bold,W).forEach(t=>{f.ensure(size+5);f.P.text(f.left,f.y,t,opts);f.y+=size+5;});};
 const tableHead=()=>{f.ensure(30);f.P.rect(f.left,f.y-11,W,21,{fill:DOC_COLOR.bar});cols.forEach(c=>f.P.text(c.x,f.y+2,c.label,{size:7,bold:true,align:c.align}));headMark('table',cols,f.y);f.y+=23;};
 /* Текст переносится (8 pt), число — одной строкой (9 pt). */
 const textCols=cols.filter(c=>c.type!=='num'),numCols=cols.filter(c=>c.type==='num'),cell=(c,r)=>{const x=by.get(c.k);const v=x?x.v(r):'';return v==null?'':v;};
 const row=r=>{
  const wrapped=textCols.map(c=>docWrap(String(cell(c,r)),c.size||8,!!c.bold,c.w)),lines=Math.max(1,...wrapped.map(a=>a.length)),note=r.note?docWrap(r.note,8,false,W-40):[],h=(lines+note.length)*11+12;
  if(f.y+h>f.bottom-15){f.page();if(activeOrder)line(activeOrder+' · continued',{size:11,bold:true});tableHead();}
  textCols.forEach((c,n)=>wrapped[n].forEach((t,k)=>f.P.text(c.x,f.y+k*11,t,Object.assign({size:c.size||8},c.bold?{bold:true}:{},c.align!=='left'?{align:c.align}:{}))));
  note.forEach((t,k)=>f.P.text(f.left+5,f.y+(lines+k)*11,t,{size:8,color:DOC_COLOR.mut}));
  numCols.forEach(c=>{const v=cell(c,r);f.P.text(c.x,f.y,String(v),{size:c.size||9,bold:!!c.bold,align:c.align,color:c.alert&&v>0?DOC_COLOR.due:DOC_COLOR.ink});});
  f.y+=h;f.P.line(f.left,f.y-6,f.right,f.y-6);
 };
 if(!skidOnly){
  f.page();f.flow('first');
  d.orders.forEach(o=>{
   f.ensure(75);activeOrder='Order '+o.number+(o.po?' · PO '+o.po:'')+' · '+o.state;line(activeOrder,{size:11,bold:true});tableHead();o.rows.forEach(row);
   o.extras.forEach(x=>{f.ensure(40);line('From stock · '+x.name,{bold:true});line('Ordered '+x.ordered+' · Before '+x.before+' · Now '+x.now+' · Back order '+x.back,{color:x.back?DOC_COLOR.due:DOC_COLOR.ink});});
   (o.takes||[]).forEach(x=>{f.ensure(25);line('Cancelled, customer takes · Line '+x.line+' · '+x.size+' · '+x.pieces+' glass',{bold:true});});f.y+=12;
  });
  if(!d.orders.length)line('Open trip · no items selected');
  f.flow('totals');
 }
 const sc=formColumns(tpl.parts.skidTable.columns,f.left),sby=new Map(SHIPPING_SKID_COLUMNS.map(c=>[c.k,c])),places=shippingSkidPlaces(d),oid=new Map(d.orders.map(o=>[o.number,o.id])),key=r=>oid.get(r.order)+'|'+r.lineId;
 const skidHead=()=>{f.ensure(30);f.P.rect(f.left,f.y-11,W,21,{fill:DOC_COLOR.bar});sc.forEach(c=>f.P.text(c.x,f.y+2,c.label,{size:7,bold:true,align:c.align}));headMark('skidTable',sc,f.y);f.y+=23;};
 const skidRow=(r,group)=>{
  const v=c=>{const x=sby.get(c.k);const t=x?x.v(r):'';return t==null?'':t;};
  const tc=sc.filter(c=>c.type!=='num'),wr=tc.map(c=>docWrap(String(v(c)),c.size||8,!!c.bold,c.w)),n=Math.max(1,...wr.map(a=>a.length)),h=n*11+12;
  if(f.y+h>f.bottom-15){f.page();line(group+' · continued',{size:11,bold:true});skidHead();}
  tc.forEach((c,i)=>wr[i].forEach((t,k)=>f.P.text(c.x,f.y+k*11,t,Object.assign({size:c.size||8,bold:!!c.bold},c.align!=='left'?{align:c.align}:{}))));
  sc.filter(c=>c.type==='num').forEach(c=>f.P.text(c.x,f.y,String(v(c)),{size:c.size||9,bold:!!c.bold,align:c.align}));
  f.y+=h;f.P.line(f.left,f.y-6,f.right,f.y-6);
 };
 d.skids.filter(s=>!skidOnly||s.code===skidOnly).forEach(s=>{
  const pos=places.get(s.code),units=shippingCount(s.qty,'unit')+' · '+(s.exact?'':'≈ ')+docNum(s.kg,1)+' kg';
  f.page({title:'SKID CONTENTS',barcode:'',skid:s.code,skidUnits:units},'skidTop');
  /* По заказу, внутри — по порядку укладки; заказы — в каком их начали класть. */
  const at=r=>pos?Math.min(...(pos.get(key(r))||[Infinity])):0,groups=[];
  s.rows.forEach(r=>{const key='Order '+r.order+(r.po?' · PO '+r.po:'');let g=groups.find(x=>x.key===key);if(!g)groups.push(g={key,rows:[]});g.rows.push(r);});
  groups.forEach(g=>g.rows.sort((a,b)=>at(a)-at(b)));groups.sort((a,b)=>at(a.rows[0])-at(b.rows[0]));
  groups.forEach(g=>{
   f.ensure(75);line(g.key,{size:11,bold:true});skidHead();
   g.rows.forEach(r=>skidRow(Object.assign({},r,{pos:pos?shippingPlaceText(pos.get(key(r))||[]):''}),g.key));
   f.y+=12;
  });
  f.ensure(30);const q=sc.find(c=>c.k==='qty'),kg=sc.find(c=>c.k==='kg');
  f.P.text(f.left+5,f.y,'Total',{size:9,bold:true});if(q)f.P.text(q.x,f.y,String(s.qty),{size:9,bold:true,align:'right'});if(kg)f.P.text(kg.x,f.y,docNum(s.kg,1),{size:9,bold:true,align:'right'});
  if(pos){f.y+=16;f.P.text(f.left+5,f.y,'#1 went on first.',{size:8,color:DOC_COLOR.mut});}
 });
 return f.finish();
}
function shippingShowPrint(pages){
 const h=docPrintHost();h.innerHTML=pages.map(p=>'<div class="doc-print-page">'+docPageSVG(p)+'</div>').join('');document.body.classList.add('doc-printing');
 window.addEventListener('afterprint',docPrintCleanup,{once:true});setTimeout(docPrintCleanup,60000);window.print();
}
/* Запись о печати одного PS внутри чужой команды; возвращает его страницы
   (печать PS и пачка рейса — erp/views/delivery). */
function shippingPrintRecord(id){
 const current=shippingFind(id);if(current.status==='planned')Object.assign(current,shippingValidateSelection(current,current.id));
 const model=shippingDocument(current),pages=shippingPages(model);current.printedAt=new Date().toISOString();current.printedSignature=JSON.stringify(model);
 const prior=current.printedItems||[];current.printedItems=[...new Map(prior.concat(current.items).map(i=>[i.label,shippingClone(i)])).values()];
 shippingHistoryOrderIds(current).forEach(oid=>orderLogPush(salesRecord(oid),'Packing slip print requested',current.number));return pages;
}
/* checked — долг уже проверен вызывающим в этом же действии (заказ по
   номеру у стойки): второй раз то же окно не показываем. */
function shippingPrint(id,checked){
 const s=shippingFind(id);if(!s||s.status==='cancelled'&&!s.unbatchedItems?.length)return;
 (checked?(ids,method,printing,done)=>done():shippingWithChecks)(shippingOrderIds(s),s.method,true,()=>{
  let pages;const out=storageCommand(()=>{pages=shippingPrintRecord(id);return shippingFind(id);});
  if(!out.ok){shippingNotice={error:true,text:out.error};render();return;}
  render();shippingShowPrint(pages);
 });
}
/* Лист одного скида — views/carriers-board (carrierPrintCode): один лист
   скида везде — в окне тары, на станции и здесь (15.10.2026). */
