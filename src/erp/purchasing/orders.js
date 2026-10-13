/* Purchasing P2 · 13 October 2026.
   A PO needs one line, not a supplier card, known price or delivery date.
   Saved numbers are allocated inside storageCommand. Edits at any stage
   are allowed and logged. Delete keeps the document and its history.
   Quantities use the chosen purchasing unit; blocks have no fixed size.
   No customer Finance writes, stock movements or production route changes. */
DEFAULT.purchaseOrder=[];DEFAULT.purchaseOrderSeq=0;
const PUR_ORDER_STATES={draft:'Draft',sent:'Sent',closed:'Closed',cancelled:'Cancelled'};
function purOrderFind(id){return (DB.purchaseOrder||[]).find(p=>p.id===id)||null;}
function purOrderNumber(n){return 'PO-'+String(n).padStart(4,'0');}
function purOrderStatus(p){return p.deletedAt?'Deleted':PUR_ORDER_STATES[p.state]||'Draft';}
function purLineClean(x,i){
 x=x&&typeof x==='object'?x:{};
 const l={id:purText(x.id)||'line-'+(i+1),kind:['sheet','order','other'].includes(x.kind)?x.kind:'other'};
 ['description','unit','priceUnit','sourceCurrency','sheetId','productCode','orderId','lineId','componentKey','expectedDate','note'].forEach(k=>l[k]=purText(x[k]));
 ['qty','price','widthIn','heightIn','sheetsPerBlock'].forEach(k=>l[k]=purNumber(x[k]));
 l.held=!!x.held;
 l.spec=x.spec&&typeof x.spec==='object'&&!Array.isArray(x.spec)?purClone(x.spec):null;
 return l;
}
function purOrderClean(x){
 const p={};
 ['id','number','supplierId','supplierName','date','expectedDate','currency','to','cc','note','createdAt','createdBy','createdById','updatedAt','updatedBy','updatedById','sentAt','deletedAt'].forEach(k=>p[k]=purText(x[k]));
 p.currency=p.currency.toUpperCase()||'USD';
 p.state=Object.prototype.hasOwnProperty.call(PUR_ORDER_STATES,x.state)?x.state:'draft';
 p.rev=Number.isSafeInteger(x.rev)&&x.rev>0?x.rev:1;
 p.supplier=x.supplier&&typeof x.supplier==='object'?purSupplierClean(x.supplier):null;
 p.lines=(Array.isArray(x.lines)?x.lines:[]).map(purLineClean);
 return p;
}
function normalizePurchaseOrders(){
 const ids=new Set();
 DB.purchaseOrder=(Array.isArray(DB.purchaseOrder)?DB.purchaseOrder:[]).filter(p=>p&&purText(p.id)&&!ids.has(purText(p.id))&&(ids.add(purText(p.id)),true)).map(purOrderClean);
 DB.purchaseOrderSeq=DB.purchaseOrder.reduce((n,p)=>Math.max(n,/^PO-\d+$/.test(p.number)?+p.number.slice(3):0),Number.isSafeInteger(DB.purchaseOrderSeq)&&DB.purchaseOrderSeq>=0?DB.purchaseOrderSeq:0);
 DB.purchaseDocumentOptions=purDocOptions(DB.purchaseDocumentOptions);
}
function validatePurchaseOrders(src){
 if(!Array.isArray(src.purchaseOrder))return;
 const ids=new Set(),numbers=new Set();
 src.purchaseOrder.forEach((p,i)=>{
  const bad=()=>{throw new Error('Purchase order '+(i+1)+': invalid or duplicate record.');};
  if(!p||typeof p!=='object'||Array.isArray(p)||!purText(p.id)||ids.has(purText(p.id))||!/^PO-\d+$/.test(p.number)||numbers.has(p.number)||!Array.isArray(p.lines))bad();
  ids.add(purText(p.id));numbers.add(p.number);
  const lines=new Set();
  p.lines.forEach(l=>{
   if(!l||typeof l!=='object'||Array.isArray(l)||!purText(l.id)||lines.has(purText(l.id)))bad();lines.add(purText(l.id));
   if(l.spec!=null){
    const record=x=>x&&typeof x==='object'&&!Array.isArray(x),points=a=>Array.isArray(a)&&a.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));
    if(!record(l.spec)||!Array.isArray(l.spec.parts)||!Array.isArray(l.spec.makeup))bad();
    l.spec.parts.forEach(c=>{
     if(!record(c)||!Array.isArray(c.services)||!c.services.every(s=>typeof s==='string'))bad();
     if(c.shape!=null&&(!record(c.shape)||!points(c.shape.points)||!Array.isArray(c.shape.polys)||!c.shape.polys.every(points)||!Array.isArray(c.shape.holes)||!c.shape.holes.every(h=>record(h)&&[h.x,h.y,h.d].every(Number.isFinite))))bad();
    });
   }
  });
 });
}
function purUnit(v){return mdUnitCode(v)||purText(v).toLowerCase();}
/* The supplier price may be per ft² while the order is in sheets/blocks.
   Unknown sheets per block means an unknown total, never a guessed size. */
function purLinePriceQty(l){
 const qty=purNumber(l.qty);if(qty==null)return null;
 const unit=purUnit(l.unit),priceUnit=purUnit(l.priceUnit)||unit;
 if(unit===priceUnit||!unit)return qty;
 const perBlock=purNumber(l.sheetsPerBlock);
 let sheets=unit==='block'?(perBlock==null?null:qty*perBlock):['sheet','each','lite'].includes(unit)?qty:null;
 if(sheets!=null){
  if(['sheet','each','lite'].includes(priceUnit))return sheets;
  if(['sqft','sqm'].includes(priceUnit)&&l.widthIn>0&&l.heightIn>0)return sheets*l.widthIn*l.heightIn/(priceUnit==='sqft'?144:1550.0031000062);
 }
 if(unit==='sqft'&&priceUnit==='sqm')return qty/10.76391041671;
 if(unit==='sqm'&&priceUnit==='sqft')return qty*10.76391041671;
 return null;
}
function purLineTotal(l){const q=purLinePriceQty(l),price=purNumber(l.price);return price==null||q==null?null:salesMoney(q*price);}
function purOrderTotals(p){let known=0,missing=0;p.lines.forEach(l=>{const n=purLineTotal(l);if(n==null)missing++;else known=salesMoney(known+n);});return {known,missing,complete:!missing};}
function purOrderChanges(a,b){
 const fields=['supplierName','supplierId','date','expectedDate','currency','to','cc','note','state','lines'];
 return fields.filter(k=>JSON.stringify(a&&a[k])!==JSON.stringify(b[k])).map(k=>({field:k,label:({supplierName:'Supplier',supplierId:'Supplier card',expectedDate:'Expected date',to:'To',cc:'CC',lines:'Lines',state:'Status'})[k]||stkHuman(k),before:a?a[k]:null,after:b[k]}));
}
function purOrderSave(d){
 return purPersist(()=>{
  const old=d.id?purOrderFind(d.id):null;
  if(d.id&&!old)throw new Error('Purchase order no longer exists.');
  if(old&&(old.deletedAt||old.rev!==d.rev))throw new Error('Purchase order changed elsewhere. Reopen it to keep those changes.');
  const p=purOrderClean(d);
  if(!p.lines.length)throw new Error('Add at least one line.');
  if(!CURRENCY_RE.test(p.currency))throw new Error('Currency: enter a three-letter code.');
  ['date','expectedDate'].forEach(k=>{if(p[k]&&!ISO_DATE_RE.test(p[k]))throw new Error('Date: use YYYY-MM-DD or leave empty.');});
  const ids=new Set();
  p.lines.forEach((l,i)=>{
   if(ids.has(l.id))throw new Error('Duplicate line. Reopen the order.');ids.add(l.id);
   ['qty','price','widthIn','heightIn','sheetsPerBlock'].forEach(k=>{if(purText(d.lines[i][k])!==''&&(l[k]==null||l[k]<0))throw new Error('Line '+(i+1)+': enter a non-negative number or leave empty.');});
   if(l.expectedDate&&!ISO_DATE_RE.test(l.expectedDate))throw new Error('Line '+(i+1)+': use YYYY-MM-DD or leave empty.');
  });
  const actor=orderLogActor(),now=new Date().toISOString();
  p.id=old?old.id:salesUid('PO');p.number=old?old.number:purOrderNumber(++DB.purchaseOrderSeq);
  p.createdAt=old?old.createdAt:now;p.createdBy=old?old.createdBy:actor.by;p.createdById=old?old.createdById:actor.byId;
  p.updatedAt=now;p.updatedBy=actor.by;p.updatedById=actor.byId;p.rev=old?old.rev+1:1;
  p.sentAt=old?old.sentAt:'';p.deletedAt='';
  if(p.state==='sent'&&!p.sentAt)p.sentAt=now;
  const changes=purOrderChanges(old,p);
  if(old)DB.purchaseOrder[DB.purchaseOrder.indexOf(old)]=p;else DB.purchaseOrder.push(p);
  if(changes.length)purRecordEvent('po',p.id,!old?'Created':old.state!==p.state?PUR_ORDER_STATES[p.state]:'Edited',changes);
  return p;
 });
}
function purOrderDelete(id,rev){
 return purPersist(()=>{
  const p=purOrderFind(id);if(!p||p.deletedAt)throw new Error('Purchase order no longer exists.');
  if(p.rev!==rev)throw new Error('Purchase order changed elsewhere. Reopen it.');
  p.deletedAt=new Date().toISOString();p.rev++;
  purRecordEvent('po',id,'Deleted',[{field:'number',label:'Purchase order retained in history',before:p.number,after:p.number}]);return p;
 });
}
function purOrderRestore(id){
 return purPersist(()=>{const p=purOrderFind(id);if(!p)throw new Error('Purchase order no longer exists.');if(!p.deletedAt)return p;p.deletedAt='';p.rev++;purRecordEvent('po',id,'Restored',[]);return p;});
}
function purOrderLog(id,what,changes){return purPersist(()=>{if(!purOrderFind(id))throw new Error('Purchase order no longer exists.');return purRecordEvent('po',id,what,changes);});}
function purSheetLine(id){
 const s=(DB.glassSheet||[]).find(s=>s.id===id);if(!s)return null;
 const g=glassProductByCode(s.productCode);
 return purLineClean({id:salesUid('PL'),kind:'sheet',sheetId:id,productCode:s.productCode,description:(g?g.name:s.productCode)+' · '+[s.sheetWIn,s.sheetHIn].join(' × ')+' in',unit:'sheet',priceUnit:s.purchaseUnit,sourceCurrency:s.currency,price:s.purchasePrice,qty:1,widthIn:s.sheetWIn,heightIn:s.sheetHIn},0);
}
