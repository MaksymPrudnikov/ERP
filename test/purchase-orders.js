/* PO behaviour, including incomplete/one-off purchases, immutable source
   specifications, honest Gmail preparation and the shared PDF rendering. */
module.exports=async function({page,eq}){
 console.log('purchase orders');const t=await page(undefined,{width:1440,height:1000});
 await t.p.waitForFunction(()=>storageWriter&&!storageStarting);
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  oqReset();DB.purchaseOrder=[];DB.purchaseOrderSeq=0;DB.purchasingEvent=[];DB.supplier=[];DB.glassSheet=[];purView='orders';tab='purchasing';
  window.poSave=(x)=>purOrderSave(Object.assign({lines:[{id:salesUid('PL'),description:'One-off item',qty:1}]},x));
 });
 eq('PO can have a blank supplier, unknown price, date and unit; one-off shop does not create a card',await t.p.evaluate(()=>{
  const a=poSave({supplierName:'',date:'',currency:'CAD'}),b=poSave({supplierName:'Home Depot'}),bad=poSave({lines:[]});
  return {saved:a.ok&&b.ok,numbers:[a.value.number,b.value.number],unknown:purOrderTotals(a.value),supplierCards:DB.supplier.length,oneLine:!bad.ok,seq:DB.purchaseOrderSeq};
 }),{saved:true,numbers:['PO-0001','PO-0002'],unknown:{known:0,missing:1,complete:false},supplierCards:0,oneLine:true,seq:2});
 eq('failed PO storage rolls back the number and history; retry takes the same next number',await t.p.evaluate(()=>{
  const before=JSON.stringify(DB);let r;
  testWriteBreak(new Error('Test quota'));
  try{r=poSave({supplierName:'Retry shop'});}finally{testWriteHeal();}
  const same=JSON.stringify(DB)===before,next=poSave({supplierName:'Retry shop'});
  return {refused:!r.ok,same,next:next.value.number,events:purHistory('po',next.value.id).map(e=>e.what)};
 }),{refused:true,same:true,next:'PO-0003',events:['Created']});
 eq('sheet and block prices use actual size/count; no fixed block conversion and no false zero for blank prices',await t.p.evaluate(()=>{
  const l=purLineClean({qty:13,unit:'sheet',priceUnit:'sqft',price:2,widthIn:144,heightIn:102},0);
  const block=Object.assign({},l,{qty:2,unit:'block',sheetsPerBlock:13}),other=Object.assign({},block,{sheetsPerBlock:16});
  return {sheets:purLineTotal(l),blocks:purLineTotal(block),other:purLineTotal(other),unknown:purLineTotal(Object.assign({},block,{sheetsPerBlock:''})),blank:purLineTotal(Object.assign({},l,{price:''})),zero:purLineTotal(Object.assign({},l,{price:0}))};
 }),{sheets:2652,blocks:5304,other:6528,unknown:null,blank:null,zero:0});
 eq('PO stays editable after Sent, Closed and Cancelled; stale drafts do not overwrite it',await t.p.evaluate(()=>{
  let p=DB.purchaseOrder[0];p=purOrderSave(Object.assign(purClone(p),{state:'sent'})).value;const stale=purClone(p);
  p=purOrderSave(Object.assign(purClone(p),{state:'closed',currency:'USD',lines:[{id:p.lines[0].id,description:'Changed after sent',qty:3,price:5}]})).value;
  p=purOrderSave(Object.assign(purClone(p),{state:'cancelled',note:'Cancelled, still editable'})).value;
  const refused=purOrderSave(Object.assign(stale,{note:'Stale'}));
  return {number:p.number,amount:purOrderTotals(p).known,state:purOrderStatus(p),sent:!!p.sentAt,refused:!refused.ok,kept:purOrderFind(p.id).note,actions:purHistory('po',p.id).map(e=>e.what)};
 }),{number:'PO-0001',amount:15,state:'Cancelled',sent:true,refused:true,kept:'Cancelled, still editable',actions:['Cancelled','Closed','Sent','Created']});
 eq('delete any PO keeps history and restores the same number; numbering and records survive JSON import',await t.p.evaluate(()=>{
  const p=DB.purchaseOrder[0],del=purOrderDelete(p.id,p.rev),status=purOrderStatus(purOrderFind(p.id)),number=p.number;
  const restored=purOrderRestore(p.id),data=prepareImportedState(storageExportEnvelope()),out=data.purchaseOrder.find(x=>x.id===p.id);
  return {deleted:del.ok,status,restored:restored.ok,number:out.number===number,seq:data.purchaseOrderSeq,events:purHistory('po',p.id).map(e=>e.what).slice(0,2),same:JSON.stringify(out)===JSON.stringify(purOrderFind(p.id))};
 }),{deleted:true,status:'Deleted',restored:true,number:true,seq:3,events:['Restored','Deleted'],same:true});
 eq('malformed/duplicate imported purchase records leave the current database intact',await t.p.evaluate(()=>{
  const before=JSON.stringify(DB),p=purClone(DB.purchaseOrder[0]),cases=[[p,p],[Object.assign({},p,{lines:[null]})],[Object.assign({},p,{lines:[p.lines[0],p.lines[0]]})]];
  return {rejected:cases.map(purchaseOrder=>{try{prepareImportedState({purchaseOrder});return false;}catch(e){return true;}}),same:before===JSON.stringify(DB)};
 }),{rejected:[true,true,true],same:true});

 await t.p.evaluate(()=>{
  window.poCustomerOrder=oqOrder(oqCustomer({legalName:'PO fixture customer'}));salesOrderEdit(poCustomerOrder);
  const pane=soDraft.makeups[0].panes[1];pane.glassProductId=glassProductByCode('6SBN60').id;pane.visionType='lowe';pane.coatingSurface=3;
  salesOrderSave();salesDraftDrop();tab='purchasing';
 });
 eq('a selected lite copies its own coating, heat, size and service details without changing shop or customer Finance',await t.p.evaluate(()=>{
  const o=salesRecord(poCustomerOrder),l=o.lines[0],c=glassBatchComponents(o,l)[1],before=JSON.stringify({o,scans:DB.stationScan,batches:DB.glassBatch,receipts:DB.receipt});
  const supplier=purSupplierSave({name:'External plant'}).value;window.poExternalSupplier=supplier.id;
  const row=purOrderComponentLine(o.id,l.id,c.key),p=poSave({supplierId:supplier.id,supplierName:'External plant',expectedDate:'2026-10-20',lines:[row]}).value;
  window.poLinked=p.id;window.poSnapshot=purClone(row.spec);
  const part=row.spec.parts[0];return {count:row.spec.parts.length,label:row.spec.part,glass:part.glass.includes(glassProductByCode('6SBN60').name)&&!part.glass.includes('6SBN60')&&part.glass.includes('Tempered')&&part.glass.includes('#3'),size:part.finished,service:part.services.includes('ROUGH ARRIS'),same:before===JSON.stringify({o,scans:DB.stationScan,batches:DB.glassBatch,receipts:DB.receipt}),linked:purLinkedPurchases(o.id,l.id).map(x=>x.p.number)};
 }),{count:1,label:'Lite 2',glass:true,size:{w:37,h:71},service:true,same:true,linked:['PO-0004']});
 eq('PO specification remains the ordered snapshot when the customer makeup changes later',await t.p.evaluate(()=>{
  const o=salesRecord(poCustomerOrder);o.makeups[0].panes[1].glassProductId=glassProductByCode('6CLEAR').id;
  const p=purOrderFind(poLinked);return {same:JSON.stringify(p.lines[0].spec)===JSON.stringify(poSnapshot),printed:purDocPages(p).flatMap(p=>p.items).some(i=>i.t==='text'&&i.s.includes(glassProductByCode('6SBN60').name))};
 }),{same:true,printed:true});
 eq('invalid nested specification data is rejected before import can break a PO screen',await t.p.evaluate(()=>{
  const before=JSON.stringify(DB),p=purClone(purOrderFind(poLinked));p.lines[0].spec.parts[0].services={};
  let refused=false;try{prepareImportedState({purchaseOrder:[p]});}catch(e){refused=e.message.includes('Purchase order');}
  return {refused,same:JSON.stringify(DB)===before};
 }),{refused:true,same:true});
 eq('whole-unit and laminate-ply purchases select only the requested parts, including missing catalogue glass',await t.p.evaluate(()=>{
  const o=salesRecord(poCustomerOrder),l=o.lines[0],m=o.makeups[0],whole=purOrderComponentLine(o.id,l.id,'');
  const lam=normalizeSalesPane({category:'laminated',laminated:{outerGlassProductId:'GL-6CLEAR',innerGlassProductId:'GL-6CLEAR',interlayerProductId:'INT-PVB030'}},0);lam.id=m.panes[0].id;m.panes[0]=lam;
  const cs=glassBatchComponents(o,l),part=purOrderComponentLine(o.id,l.id,cs[1].key);
  m.panes[1].glassProductId='';m.panes[1].thicknessMm=6;
  const missing=purOrderComponentLine(o.id,l.id,glassBatchComponents(o,l)[2].key);missing.description='6mm COG from external manufacturer';
  return {whole:whole.spec.parts.length,ply:part.spec.part,parts:part.spec.parts.length,missing:missing.spec.parts[0].missing,allowed:poSave({supplierId:poExternalSupplier,lines:[missing]}).ok};
 }),{whole:2,ply:'Lite 1b · inner ply',parts:1,missing:true,allowed:true});
 eq('PO PDF carries the lite’s own shape, hole coordinates and sizes from the sticker geometry',await t.p.evaluate(()=>{
  salesOrderEdit(poCustomerOrder);const l=soDraft.lines[0];salesOpenLiteShape(l.id,1);sDraft.w='39';sDraft.h='73';sDraft.features.push(shapeNormalizeFeature({type:'hole',diameter:'1',x:'6',y:'6',minEdge:'1/2'}));saveShape();salesOrderSave();salesDraftDrop();
  const o=salesRecord(poCustomerOrder),line=o.lines[0],c=glassBatchComponents(o,line).find(c=>c.index===1),r=purOrderComponentLine(o.id,line.id,c.key),p=poSave({supplierId:poExternalSupplier,lines:[r]}).value;
  const pages=purDocPages(p),items=pages.flatMap(p=>p.items),bytes=docPdfBytes(pages,{title:p.number});
  return {size:r.spec.parts[0].finished,holes:r.spec.parts[0].shape.holes.map(h=>[h.x,h.y,h.d]),drawing:items.filter(i=>i.t==='poly').length>=2,text:items.some(i=>i.t==='text'&&i.s.includes('Hole diameter 1 in')),pdf:String.fromCharCode(...bytes.slice(0,8))};
 }),{size:{w:39,h:73},holes:[[6,6,1]],drawing:true,text:true,pdf:'%PDF-1.4'});
 eq('long PO notes and descriptions paginate completely; each page keeps content inside the page',await t.p.evaluate(()=>{
  const p=poSave({lines:Array.from({length:45},(_,i)=>({id:'long-'+i,description:'Item '+i+' '+('Long supplier description '.repeat(8)),qty:1,price:2,note:'Note '+i})),note:'LAST UNIQUE END NOTE'}).value;
  const pages=purDocPages(p),texts=pages.flatMap(pg=>pg.items.filter(i=>i.t==='text')),last=texts.some(i=>i.s.includes('LAST UNIQUE END NOTE'));
  return {many:pages.length>3,last,all:pages.every(pg=>pg.items.every(i=>i.t!=='text'||i.y>=DOC_PAGE.top&&i.y<=DOC_PAGE.footer)),end:purOrderTotals(p).known};
 }),{many:true,last:true,all:true,end:90});
 eq('PO prints different sheet sizes with quantity and prices in aligned Sales-style columns',await t.p.evaluate(()=>{
  const p=purOrderClean({currency:'USD',lines:[{description:'Large sheets',qty:2,unit:'block',widthIn:144,heightIn:102,sheetsPerBlock:13,price:2.15,priceUnit:'sqft'},{description:'Smaller sheets',qty:3,unit:'block',widthIn:130,heightIn:96,sheetsPerBlock:16,price:2.15,priceUnit:'sqft'}]});
  const texts=purDocPages(p).flatMap(x=>x.items).filter(x=>x.t==='text'),at=s=>texts.find(x=>x.s===s);
  const a=['Large sheets','144 × 102','2 block','2.15 / sq ft','5,701.80'].map(at),b=['Smaller sheets','130 × 96','3 block','8,944.00'].map(at);
  const hidden=purDocPages(p,{sheetSize:false,prices:false}).flatMap(x=>x.items).filter(x=>x.t==='text').map(x=>x.s);
  return {firstRow:a.every(Boolean)&&a.every(x=>x.y===a[0].y),secondRow:b.every(Boolean)&&b.every(x=>x.y===b[0].y),leftToRight:a.every((x,i)=>!i||x.x>a[i-1].x),total:purOrderTotals(p).known,hidden:!hidden.includes('144 × 102')&&!hidden.includes('PRICE')&&!hidden.includes('AMOUNT')};
 }),{firstRow:true,secondRow:true,leftToRight:true,total:14645.8,hidden:true});
 eq('Customize options change preview only until Save as default, and survive Export / Import',await t.p.evaluate(()=>{
  purOrderEdit(poLinked);purDocOpen();purDocSet('prices',false);purDocSet('totals',false);
  const before=purDocOptions(DB.purchaseDocumentOptions).prices;
  purDocSaveDefault();const restored=prepareImportedState(storageExportEnvelope());
  const text=purDocPages(purOrderDraft,purDoc.opts).flatMap(p=>p.items).filter(i=>i.t==='text').map(i=>i.s).join('\n');
  return {before,after:restored.purchaseDocumentOptions.prices,totals:restored.purchaseDocumentOptions.totals,hidden:!text.includes('Line total:')&&!text.includes('SUBTOTAL:')&&!text.includes('Price:'),noCustom:PUR_PO_FIELDS.every(f=>f.k!=='customFields')};
 }),{before:true,after:false,totals:false,hidden:true,noCustom:true});
 eq('Gmail To/CC are encoded, PDF is prepared, but the PO stays Draft until explicit Mark sent',await t.p.evaluate(()=>{
  purOrderEdit(DB.purchaseOrder.find(p=>p.number==='PO-0002').id);purOrderDraft.to='cover+orders@example.test';purOrderDraft.cc='accounts@example.test, owner@example.test';purDocOpen();
  const open=window.open,download=docDownload;let url='',file='',bytes=0;
  window.open=u=>{url=u;return {};};docDownload=(name,b)=>{file=name;bytes=b.length;};
  try{purDocAction('email');}finally{window.open=open;docDownload=download;}
  const u=new URL(url),id=purOrderDraft.id,before=purOrderStatus(purOrderFind(id)),events=purHistory('po',id).map(e=>e.what);
  purOrderState('sent');
  return {to:u.searchParams.get('to'),cc:u.searchParams.get('cc'),file,pdf:bytes>500,before,prepared:events.includes('Email prepared'),notSent:!events.includes('Sent'),after:purOrderStatus(purOrderFind(id))};
 }),{to:'cover+orders@example.test',cc:'accounts@example.test, owner@example.test',file:'PO-0002.pdf',pdf:true,before:'Draft',prepared:true,notSent:true,after:'Sent'});

 await t.p.evaluate(()=>{purOrderDraft=null;purDoc=null;purView='orders';tab='purchasing';render();});
 await t.p.locator('[data-pur-po-new]').click();
 await t.p.getByRole('button',{name:'Add supplier',exact:true}).click();
 await t.p.locator('#pur_po_supplierName').fill('One-time shop');
 await t.p.getByRole('button',{name:'Add supplier',exact:true}).last().click();
 await t.p.locator('[data-pur-add-line]').click();
 await t.p.locator('#pur_line_0_description').fill('Sealant from local store');
 await t.p.locator('#pur_line_0_qty').fill('2');await t.p.locator('#pur_line_0_price').fill('18.25');
 await t.p.locator('[data-pur-add-line]').click();
 await t.p.locator('#pur_line_1_description').fill('Delivery');
 await t.p.locator('[data-pur-po-save]').click();
 eq('real PO form retains values when adding lines and saves an incomplete order',await t.p.evaluate(()=>({name:purOrderDraft.supplierName,lines:purOrderDraft.lines.map(l=>[l.description,l.qty,l.price]),incomplete:!purOrderTotals(purOrderDraft).complete,number:!!purOrderDraft.number})),{name:'One-time shop',lines:[['Sealant from local store',2,18.25],['Delivery',1,null]],incomplete:true,number:true});
 await t.p.setViewportSize({width:390,height:844});
 eq('PO form fits phone width',await t.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await t.p.setViewportSize({width:1440,height:1000});
 eq('PO journal filters are independent and history includes the document reference',await t.p.evaluate(()=>{
  purOrderDraft=null;purDoc=null;purView='orders';render();salesListSetFilter('supplierName',{values:['One-time shop']});
  const count=purOrderInfos().filter(i=>salesListRows([i]).length).length,scope=salesListScope();
  salesListClearAll();purView='history';render();const history=document.querySelector('.purchasing-workspace').textContent;
  return {count,scope,history:history.includes('PO-0002')&&history.includes('Email prepared'),historyScope:salesListScope()};
 }),{count:1,scope:'purchaseOrders',history:true,historyScope:'purchaseHistory'});
 eq('Sales shows the purchased lite, supplier, PO and expected date on the correct position',await t.p.evaluate(()=>{
  purOrderDraft=null;purDoc=null;tab='sales';salesOrderEdit(poCustomerOrder);render();
  const rows=[...document.querySelectorAll('.pur-sales-links')].map(x=>x.textContent);
  return {linked:rows.some(s=>s.includes('Lite 2')&&s.includes('External plant')&&s.includes('PO-0004')&&s.includes('Oct 20')),otherLine:purLinkedPurchases(poCustomerOrder,salesRecord(poCustomerOrder).lines[1].id).length};
 }),{linked:true,otherLine:0});
 await t.p.evaluate(()=>{
  salesDraftDrop();tab='purchasing';const s=purSupplierSave({name:'Supply demo',currency:'USD',leadTimeDays:4}).value;
  DB.glassSheet=[normalizeGlassSheet({productCode:'6CLEAR',supplier:'Canadian warehouse',supplierId:s.id,currency:'CAD',sheetWIn:144,sheetHIn:102,purchasePrice:2.15,purchaseUnit:'sqft'})];
  purOrderEdit('');purOrderDraft.date='2026-10-13';window.poSupplier=s.id;render();
 });
 await t.p.locator('#pur_po_card').selectOption(await t.p.evaluate(()=>poSupplier));
 await t.p.locator('#pur_po_currency').selectOption('USD');
 await t.p.getByRole('button',{name:'From supply points',exact:true}).click();
 await t.p.getByRole('button',{name:'6CLEAR · Canadian warehouse · 144 × 102 in · CAD',exact:true}).click();
 eq('actual supply picker copies price/unit/size, supplier defaults and preserves a visible currency warning',await t.p.evaluate(()=>({
  supplier:purOrderDraft.supplierName,expected:purOrderDraft.expectedDate,currency:purOrderDraft.currency,
  line:purOrderDraft.lines.map(l=>[l.unit,l.price,l.priceUnit,l.widthIn,l.heightIn,l.sourceCurrency]),
  warning:document.querySelector('.pur-glass-table').textContent.includes('Supply quote: CAD. Enter the agreed price in USD.')
 })),{supplier:'Supply demo',expected:'2026-10-17',currency:'USD',line:[['sheet',2.15,'sqft',144,102,'CAD']],warning:true});
 eq('purchase order pages have no JavaScript errors',t.errs,[]);
 await t.c.close();
};
