/* Packing slip and skid sheets, Letter. Shared docPage primitives keep
   preview/print/PDF identical. No pricing enters this model.
   Dispatch freezes the document; subsequent shipments cannot change Before.
   Printing is recorded as requested, not a claim that a printer succeeded. */
function shippingDocument(s){
 if(s.document)return shippingClone(s.document);
 if(s.id&&s.status==='planned'){
  const live=new Map(shippingOrderIds(s).flatMap(id=>shippingUnits(salesRecord(id))).map(i=>[i.label,i]));
  s=Object.assign({},s,{items:s.items.map(i=>Object.assign({},i,{skid:live.has(i.label)?live.get(i.label).skid:i.skid}))});
 }
 const orders=shippingOrderIds(s).map(id=>{
  const o=salesRecord(id),q=shippingSummary(o);
  const rows=(o.lines||[]).map((l,n)=>{
   const items=s.items.filter(i=>i.orderId===id&&i.lineId===l.id);
   const before=shippingForOrder(id).filter(p=>p.id!==s.id&&shippingSent(p)).flatMap(p=>p.items).filter(i=>i.orderId===id&&i.lineId===l.id).length;
   const weight=finWithOrder(o,()=>salesLineWeight(l,o)),m=salesMakeupById(o,l.makeupId);
   return {lineId:l.id,line:n+1,mark:l.mark||'',size:docSize(l),makeup:m?salesMakeupSummary(m):'',ordered:l.qty,before,now:items.length,back:Math.max(0,l.qty-before-items.length),kg:weight.kg,knownKg:weight.knownKg,skids:[...new Set(items.map(i=>i.skid).filter(Boolean))].join(', ')};
  }).filter(Boolean);
  const extras=(o.extraItems||[]).map(x=>{
   const picked=s.extras.find(i=>i.orderId===id&&i.extraId===x.id),qty=picked?picked.qty:0,before=shippingForOrder(id).filter(p=>p.id!==s.id&&shippingSent(p)).flatMap(p=>p.extras).filter(a=>a.orderId===id&&a.extraId===x.id).reduce((n,a)=>n+a.qty,0);
   return {extraId:x.id,name:salesExtraItemName(x),ordered:x.qty,before,now:qty,back:Math.max(0,x.qty-before-qty)};
  });
  const now=rows.concat(extras).reduce((n,r)=>n+r.now,0),left=Math.max(0,q.back-now);
  return {id,number:o.businessNumber,po:o.customerPo||'',state:left===0?'complete':q.shipped?'back order':'partial',rows,extras};
 });
 const skids=[...new Set(s.items.map(i=>i.skid).filter(Boolean))].map(code=>{
  const rows=[];orders.forEach(o=>o.rows.forEach(r=>{const qty=s.items.filter(i=>i.orderId===o.id&&i.lineId===r.lineId&&i.skid===code).length;if(qty)rows.push({order:o.number,po:o.po,...r,now:qty});}));
  const exact=rows.every(r=>r.kg!=null);return {code,rows,qty:rows.reduce((n,r)=>n+r.now,0),kg:rows.reduce((n,r)=>n+(r.kg==null?r.knownKg:r.kg)*r.now,0),exact};
 });
 return {number:s.number,date:s.date,method:s.method,shipTo:shippingClone(s.shipTo),customer:salesCustomerDisplay(s.customerId),company:docCompanyBlock(),orders,skids,note:s.note||''};
}
function shippingNeedsReprint(s){return !!s.printedAt&&s.printedSignature!==JSON.stringify(shippingDocument(s));}
function shippingPages(d,skidOnly){
 const pages=[];let P,y,pageTitle,activeOrder;
 const line=(text,opts)=>{opts=opts||{};const size=opts.size||9;const lines=docWrap(String(text),size,!!opts.bold,540);lines.forEach(t=>{ensure(size+5);P.text(36,y,t,opts);y+=size+5;});};
 const header=title=>{
  pageTitle=title;P=docPage();pages.push(P);P.text(36,44,docFit(d.company.name||'Glass Farm',13,true,320),{size:13,bold:true});
  P.text(576,44,title,{size:17,bold:true,align:'right'});P.text(576,64,d.number||'Not assigned',{size:13,bold:true,align:'right'});
  if(d.number&&title==='PACKING SLIP')P.items.push(...barcode128Items(d.number,390,75,30,1.05));
  y=64;d.company.lines.slice(0,3).forEach(t=>{P.text(36,y,docFit(t,8,false,330),{size:8,color:DOC_COLOR.mut});y+=11;});y=Math.max(y+8,121);
  P.text(36,y,d.customer,{size:12,bold:true});P.text(576,y,docDate(d.date)+' · '+(d.method==='pickup'?'Pickup':'Delivery'),{size:9,align:'right'});y+=17;
  const a=d.shipTo;[a.addressee,docAddressText(a),[a.contact,a.phone].filter(Boolean).join(' · ')].filter(Boolean).forEach(t=>{docWrap(t,9,false,540).forEach(t=>{P.text(36,y,t,{size:9});y+=13;});});y+=12;
 };
 const ensure=h=>{if(y+h>725)header(pageTitle);};
 const tableHead=()=>{ensure(30);P.rect(36,y-11,540,21,{fill:DOC_COLOR.bar});['Line / Mark','Size','Makeup','Ordered','Before','Now','Back order','Skid'].forEach((t,n)=>P.text([41,122,211,363,401,435,489,520][n],y+2,t,{size:7,bold:true,align:n>=3&&n<=6?'right':'left'}));y+=23;};
 const row=r=>{
  const texts=[String(r.line)+(r.mark?' · '+r.mark:''),r.size,r.makeup,r.skids||'—'],widths=[75,84,99,53];
  const wrapped=texts.map((t,n)=>docWrap(t,8,false,widths[n])),h=Math.max(...wrapped.map(a=>a.length))*11+12;
  if(y+h>710){header(pageTitle);if(activeOrder)line(activeOrder+' · continued',{size:11,bold:true});tableHead();}
  [41,122,211,520].forEach((x,n)=>wrapped[n].forEach((t,k)=>P.text(x,y+k*11,t,{size:8})));
  [r.ordered,r.before,r.now,r.back].forEach((v,n)=>P.text([363,401,435,489][n],y,String(v),{size:9,bold:n>=2,align:'right',color:n===3&&v>0?DOC_COLOR.due:DOC_COLOR.ink}));
  y+=h;P.line(36,y-6,576,y-6);
 };
 if(!skidOnly){
  header('PACKING SLIP');
  d.orders.forEach(o=>{
   ensure(75);activeOrder='Order '+o.number+(o.po?' · PO '+o.po:'')+' · '+o.state;line(activeOrder,{size:11,bold:true});tableHead();o.rows.forEach(row);
   o.extras.forEach(x=>{ensure(40);line('From stock · '+x.name,{bold:true});line('Ordered '+x.ordered+' · Before '+x.before+' · Now '+x.now+' · Back order '+x.back,{color:x.back?DOC_COLOR.due:DOC_COLOR.ink});});y+=12;
  });
  if(!d.orders.length)line('Open trip · no items selected');
  ensure(130);d.skids.forEach(s=>line(s.code+' · '+shippingCount(s.qty,'unit')+' · '+(s.exact?'':'Known ')+docNum(s.kg,1)+' kg'));
  if(d.note)line(d.note);
  y+=15;line('Received by ____________________    Signature ____________________');line('Date and time ____________________');y+=9;
  if(d.skids.length)line(shippingCount(d.skids.length,'skid')+' left on site '+(d.skids.length===1?'remains':'remain')+' property of '+(d.company.name||'the supplier')+'.',{size:8,color:DOC_COLOR.mut});
 }
 d.skids.filter(s=>!skidOnly||s.code===skidOnly).forEach(s=>{
  header('SKID CONTENTS');P.text(36,y+35,s.code,{size:40,bold:true});y+=65;
  line(shippingCount(s.qty,'unit')+' · '+(s.exact?'':'Known ')+docNum(s.kg,1)+' kg',{size:12});
  s.rows.forEach(r=>{ensure(75);line('Order '+r.order+(r.po?' · PO '+r.po:''),{size:11,bold:true});line('Line '+r.line+(r.mark?' · '+r.mark:'')+' · '+r.size+' · Qty '+r.now,{bold:true});line(r.makeup);y+=9;});
 });
 pages.forEach((p,n)=>p.text(576,766,(d.number||'Skid contents')+' · '+(n+1)+' / '+pages.length,{size:8,align:'right',color:DOC_COLOR.mut}));return pages;
}
function shippingShowPrint(pages){
 const h=docPrintHost();h.innerHTML=pages.map(p=>'<div class="doc-print-page">'+docPageSVG(p)+'</div>').join('');document.body.classList.add('doc-printing');
 window.addEventListener('afterprint',docPrintCleanup,{once:true});setTimeout(docPrintCleanup,60000);window.print();
}
function shippingPrint(id){
 const s=shippingFind(id);if(!s||s.status==='cancelled')return;
 shippingWithChecks(shippingOrderIds(s),s.method,true,()=>{
  let pages;const out=storageCommand(()=>{
   const current=shippingFind(id);if(current.status==='planned')Object.assign(current,shippingValidateSelection(current,current.id));
   const model=shippingDocument(current);pages=shippingPages(model);current.printedAt=new Date().toISOString();current.printedSignature=JSON.stringify(model);
   const prior=current.printedItems||[];current.printedItems=[...new Map(prior.concat(current.items).map(i=>[i.label,shippingClone(i)])).values()];
   shippingOrderIds(current).forEach(oid=>orderLogPush(salesRecord(oid),'Packing slip print requested',current.number));return current;
  });
  if(!out.ok){shippingNotice={error:true,text:out.error};render();return;}
  render();shippingShowPrint(pages);
 });
}
function shippingPrintSkid(customerId,code){
 const items=(DB.salesOrder||[]).filter(o=>o.customerId===customerId).flatMap(shippingUnits).filter(i=>i.ready&&i.skid===code);
 const ps=[...new Set(items.map(i=>i.shipment&&i.shipment.id).filter(Boolean))],s=ps.length===1?shippingFind(ps[0]):null;
 const model=shippingDocument({number:s?s.number:'',customerId,method:s?s.method:'delivery',date:s?s.date:finToday(),shipTo:s?s.shipTo:shippingDefaultAddress(salesFindCustomer(customerId)),items,extras:[]});
 shippingShowPrint(shippingPages(model,code));
}
