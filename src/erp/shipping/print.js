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
   const weight=finWithOrder(o,()=>salesLineWeight(l,o)),m=salesMakeupById(o,l.makeupId);
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
 const ink=DOC_COLOR.ink,mut=DOC_COLOR.mut,due=DOC_COLOR.due;
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
  table:{columns:[
   {k:'line',label:'Line / Mark',x:41,w:75},{k:'size',label:'Size',x:122,w:84},{k:'makeup',label:'Makeup',x:211,w:99},
   {k:'ordered',label:'Ordered',x:363,align:'right'},{k:'before',label:'Before',x:401,align:'right'},
   {k:'now',label:'Now',x:435,align:'right',bold:true},{k:'back',label:'Back order',x:489,align:'right',bold:true,alert:true},
   {k:'skid',label:'Skid',x:520,w:53}]},
  totals:{h:93,keep:130,blocks:[
   {id:'skids',type:'field',field:'skids',place:'left',y:0,w:480,h:14,size:8,lh:14,wrap:true},
   {id:'note',type:'field',field:'note',place:'left',y:14,w:480,h:14,size:8,lh:14,wrap:true},
   {id:'received',type:'text',text:'Received by ____________________    Signature ____________________',place:'left',y:43,w:480,h:14,size:8,lh:14,wrap:true},
   {id:'receivedAt',type:'text',text:'Date and time ____________________',place:'left',y:57,w:480,h:14,size:8,lh:14,wrap:true},
   {id:'skidsProperty',type:'field',field:'skidsProperty',place:'left',y:80,w:540,h:13,size:8,color:mut,wrap:true}]},
  bottom:{h:67,blocks:[
   {id:'pageNo',type:'text',text:'{number|Skid contents} · {page} / {pages}',place:'right',y:41,w:300,h:13,size:8,color:mut,align:'right'}]}
 }};
}
/* Поля бланка: ключ, подпись для конструктора, значение из документа PS. */
const SHIPPING_FORM_FIELDS=[
 {k:'company.name',label:'Company name',v:d=>d.company.name},
 {k:'company.lines',label:'Company address and contacts',v:d=>d.company.lines},
 {k:'company.logo',label:'Company logo',v:d=>d.company.logo||''},
 {k:'title',label:'Title',v:()=>'PACKING SLIP'},
 {k:'number',label:'Packing slip No.',v:d=>d.number||''},
 {k:'barcode',label:'Packing slip barcode',v:d=>d.number||''},
 {k:'customer',label:'Customer',v:d=>d.customer},
 {k:'shipDate',label:'Date and method',v:d=>docDate(d.date)+' · '+(d.method==='pickup'?'Pickup':'Delivery')},
 {k:'shipTo',label:'Ship to',v:d=>{const a=d.shipTo;return [a.addressee,docAddressText(a),[a.contact,a.phone].filter(Boolean).join(' · ')].filter(Boolean);}},
 {k:'corrections',label:'Corrections',v:d=>d.corrections||[]},
 {k:'skids',label:'Skids',v:d=>d.skids.map(s=>s.code+' · '+shippingCount(s.qty,'unit')+' · '+(s.exact?'':'Known ')+docNum(s.kg,1)+' kg')},
 {k:'note',label:'Note',v:d=>d.note||''},
 {k:'skidsProperty',label:'Skids remain our property',v:d=>d.skids.length?shippingCount(d.skids.length,'skid')+' left on site '+(d.skids.length===1?'remains':'remain')+' property of '+(d.company.name||'the supplier')+'.':''}
];
function shippingFormContext(d){
 const by=new Map(SHIPPING_FORM_FIELDS.map(x=>[x.k,x]));
 return {field:k=>{const x=by.get(k);return x?x.v(d):undefined;}};
}
function shippingPages(d,skidOnly){
 const tpl=shippingFormDefault(),f=formFlow(tpl,shippingFormContext(d)),cols=tpl.parts.table.columns,W=f.right-f.left;let activeOrder;
 const line=(text,opts)=>{opts=opts||{};const size=opts.size||9;docWrap(String(text),size,!!opts.bold,W).forEach(t=>{f.ensure(size+5);f.P.text(f.left,f.y,t,opts);f.y+=size+5;});};
 const tableHead=()=>{f.ensure(30);f.P.rect(f.left,f.y-11,W,21,{fill:DOC_COLOR.bar});cols.forEach(c=>f.P.text(c.x,f.y+2,c.label,{size:7,bold:true,align:c.align||'left'}));f.y+=23;};
 /* Колонки с шириной переносят текст (8 pt), без ширины — число (9 pt). */
 const textCols=cols.filter(c=>c.w),numCols=cols.filter(c=>!c.w);
 const row=r=>{
  const val={line:String(r.line)+(r.mark?' · '+r.mark:''),size:r.size,makeup:r.makeup,skid:r.skids||'—',ordered:r.ordered,before:r.before,now:r.now,back:r.back};
  const wrapped=textCols.map(c=>docWrap(String(val[c.k]==null?'':val[c.k]),8,false,c.w)),lines=Math.max(1,...wrapped.map(a=>a.length)),note=r.note?docWrap(r.note,8,false,W-40):[],h=(lines+note.length)*11+12;
  if(f.y+h>f.bottom-15){f.page();if(activeOrder)line(activeOrder+' · continued',{size:11,bold:true});tableHead();}
  textCols.forEach((c,n)=>wrapped[n].forEach((t,k)=>f.P.text(c.x,f.y+k*11,t,{size:8})));
  note.forEach((t,k)=>f.P.text(f.left+5,f.y+(lines+k)*11,t,{size:8,color:DOC_COLOR.mut}));
  numCols.forEach(c=>{const v=val[c.k];f.P.text(c.x,f.y,String(v),{size:9,bold:!!c.bold,align:c.align||'right',color:c.alert&&v>0?DOC_COLOR.due:DOC_COLOR.ink});});
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
 d.skids.filter(s=>!skidOnly||s.code===skidOnly).forEach(s=>{
  f.page({title:'SKID CONTENTS',barcode:''});f.P.text(f.left,f.y+35,s.code,{size:40,bold:true});f.y+=65;
  line(shippingCount(s.qty,'unit')+' · '+(s.exact?'':'Known ')+docNum(s.kg,1)+' kg',{size:12});
  s.rows.forEach(r=>{f.ensure(75);line('Order '+r.order+(r.po?' · PO '+r.po:''),{size:11,bold:true});line('Line '+r.line+(r.mark?' · '+r.mark:'')+' · '+r.size+' · Qty '+r.now,{bold:true});line(r.makeup);f.y+=9;});
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
