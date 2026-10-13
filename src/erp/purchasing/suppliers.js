/* =====================================================================
   Purchasing · suppliers · 12 October 2026.
   Owner correction 13 October: new glass purchases select supplier cards.
   Legacy free names stay historical; new cards start in CAD.
   The old glassSheet.supplier is a supply-point name used by cutting:
   migration and card edits must NEVER rewrite it, sizes, prices or stock.
   One company can have several supply points, each with its own currency.
   The owner wants editable document fields: this catalogue is also the
   source of supplier fields for the PO document constructor.
   ===================================================================== */
const PUR_SUPPLIER_FIELDS=[
 {k:'name',label:'Supplier name',group:'Company'},
 {k:'accountNumber',label:'Our account number',group:'Company'},
 {k:'taxNumber',label:'Tax number',group:'Company'},
 {k:'website',label:'Website',group:'Company'},
 {k:'address',label:'Address',group:'Company',type:'area'},
 {k:'contact',label:'Contact name',group:'Primary contact'},
 {k:'email',label:'Email for PO',group:'Primary contact'},
 {k:'phone',label:'Phone',group:'Primary contact'},
 {k:'currency',label:'Currency',group:'Purchasing',default:'CAD'},
 {k:'paymentDays',label:'Payment terms · Net days',group:'Purchasing',type:'days'},
 {k:'leadTimeDays',label:'Lead time · days',group:'Purchasing',type:'days'},
 {k:'paymentMethod',label:'Payment method',group:'Purchasing',default:'Bank transfer'},
 {k:'note',label:'Notes',group:'Purchasing',type:'area'}
];
DEFAULT.supplier=[];DEFAULT.purchasingEvent=[];
function purText(v){return v==null?'':String(v).trim();}
function purClone(v){return JSON.parse(JSON.stringify(v));}
function purNumber(v){if(v==null||purText(v)==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function purNameKey(v){return purText(v).replace(/\s+/g,' ').toLowerCase();}
function purSupplierFind(id){return (DB.supplier||[]).find(s=>s.id===id)||null;}
function purSupplierNamed(name){const k=purNameKey(name);return k?(DB.supplier||[]).find(s=>purNameKey(s.name)===k)||null:null;}
function purSupplierClean(raw){
 const s=raw&&typeof raw==='object'?raw:{},out={id:purText(s.id)};
 PUR_SUPPLIER_FIELDS.forEach(f=>{out[f.k]=f.type==='days'?purNumber(s[f.k]):purText(s[f.k]);});
 out.currency=out.currency.toUpperCase()||'CAD';
 if(s.paymentMethod==null)out.paymentMethod='Bank transfer';
 out.active=s.active!==false;
 out.contacts=(Array.isArray(s.contacts)?s.contacts:[]).filter(c=>c&&typeof c==='object').map(c=>({
  name:purText(c.name),role:purText(c.role),email:purText(c.email),phone:purText(c.phone)
 }));
 out.customFields=(Array.isArray(s.customFields)?s.customFields:[]).filter(f=>f&&typeof f==='object').map((f,i)=>({
  id:purText(f.id)||'field-'+(i+1),label:purText(f.label),value:purText(f.value)
 }));
 out.rev=Number.isSafeInteger(s.rev)&&s.rev>0?s.rev:1;
 ['createdAt','updatedAt','createdBy','createdById','updatedBy','updatedById'].forEach(k=>{out[k]=purText(s[k]);});
 return out;
}
/* Stable IDs also make repeated imports of the same old database agree.
   Explicit links win over names (the company may have been renamed).
   A currency taken from an old supply row is only the card's default. */
function purLinkSupplyRows(){
 const ids=new Map(DB.supplier.map(s=>[s.id,s])),names=new Map();
 DB.supplier.forEach(s=>{const k=purNameKey(s.name);if(k&&!names.has(k))names.set(k,s);});
 /* Supply-point aliases survive renaming a company. New CSV rows from
    that same point must still attach to its existing card. */
 (DB.glassSheet||[]).forEach(row=>{const s=ids.get(row.supplierId),k=purNameKey(row.supplier);if(s&&k&&!names.has(k))names.set(k,s);});
 (DB.glassSheet||[]).forEach(row=>{
  if(ids.has(row.supplierId))return;
  const k=purNameKey(row.supplier);if(!k){row.supplierId='';return;}
  let card=names.get(k);
  if(!card){
   let id='SUP-'+sha256Hex(k).slice(0,20),n=1;
   while(ids.has(id))id='SUP-'+sha256Hex(k).slice(0,20)+'-'+n++;
   card=purSupplierClean({id,name:row.supplier,currency:row.currency||'CAD'});
   DB.supplier.push(card);ids.set(id,card);names.set(k,card);
  }
  row.supplierId=card.id;
 });
}
function normalizePurchasing(){
 const seen=new Set();
 DB.supplier=(Array.isArray(DB.supplier)?DB.supplier:[]).filter(s=>s&&typeof s==='object'&&purText(s.id)&&!seen.has(purText(s.id))&&(seen.add(purText(s.id)),true)).map(purSupplierClean);
 DB.purchasingEvent=(Array.isArray(DB.purchasingEvent)?DB.purchasingEvent:[]).filter(e=>e&&typeof e==='object'&&e.id&&e.entityId&&e.what&&e.at).map(e=>({
  id:purText(e.id),entity:purText(e.entity),entityId:purText(e.entityId),what:purText(e.what),at:purText(e.at),by:purText(e.by),byId:purText(e.byId),
  changes:(Array.isArray(e.changes)?e.changes:[]).filter(c=>c&&typeof c==='object').map(c=>({field:purText(c.field),label:purText(c.label),before:c.before==null?null:purClone(c.before),after:c.after==null?null:purClone(c.after)}))
 }));
 purLinkSupplyRows();
}
function validatePurchasingPayload(src){
 if(Array.isArray(src.purchasingEvent)){
  const seen=new Set();
  src.purchasingEvent.forEach((e,i)=>{
   if(!e||typeof e!=='object'||Array.isArray(e)||!purText(e.id)||!purText(e.entity)||!purText(e.entityId)||!purText(e.what)||!purText(e.at)||!Array.isArray(e.changes)||e.changes.some(c=>!c||typeof c!=='object'||Array.isArray(c)))throw new Error('Purchasing history row '+(i+1)+': invalid event.');
   if(seen.has(purText(e.id)))throw new Error('Purchasing history: duplicate id.');seen.add(purText(e.id));
  });
 }
 if(!Array.isArray(src.supplier))return;
 const ids=new Set();
 src.supplier.forEach((s,i)=>{
  if(!s||typeof s!=='object'||Array.isArray(s)||typeof s.id!=='string'||!s.id.trim())throw new Error('Supplier row '+(i+1)+': an id is required.');
  if(ids.has(s.id.trim()))throw new Error('Suppliers: duplicate id.');ids.add(s.id.trim());
  ['contacts','customFields'].forEach(k=>{
   if(s[k]!=null&&(!Array.isArray(s[k])||s[k].some(x=>!x||typeof x!=='object'||Array.isArray(x))))throw new Error('Supplier row '+(i+1)+': '+k+' must be an array of records.');
  });
 });
}
function purPersist(fn){
 if(!accessCan('purchasing'))return {ok:false,error:'Purchasing access is required.'};
 return storageCommand(fn);
}
/* History is independent of the current document/card, so later removal
   of a purchase does not erase who received, paid or undid an operation. */
function purRecordEvent(entity,entityId,what,changes){
 const e=Object.assign({id:salesUid('PE'),entity,entityId,what,at:new Date().toISOString(),changes:purClone(changes||[])},orderLogActor());
 DB.purchasingEvent.push(e);return e;
}
function purHistory(entity,id){return (DB.purchasingEvent||[]).filter(e=>e.entity===entity&&e.entityId===id).slice().reverse();}
function purSupplierSave(d){
 return purPersist(()=>{
  const old=d.id?purSupplierFind(d.id):null;
  if(d.id&&!old)throw new Error('Supplier no longer exists. Reopen the list.');
  if(old&&old.rev!==d.rev)throw new Error('Supplier changed elsewhere. Reopen the card to keep those changes.');
  const s=purSupplierClean(d);
  if(!s.name)throw new Error('Enter a supplier name.');
  if(!old&&purSupplierNamed(s.name))throw new Error('Supplier already exists. Select its card.');
  if(!CURRENCY_RE.test(s.currency))throw new Error('Currency: enter a three-letter code.');
  PUR_SUPPLIER_FIELDS.filter(f=>f.type==='days').forEach(f=>{
   if(purText(d[f.k])!==''&&(s[f.k]==null||!Number.isInteger(s[f.k])||s[f.k]<0))throw new Error(f.label+': enter whole days, or leave empty.');
  });
  const now=new Date().toISOString(),actor=orderLogActor();
  s.id=old?old.id:salesUid('SUP');s.rev=old?old.rev+1:1;
  s.createdAt=old?old.createdAt:now;s.createdBy=old?old.createdBy:actor.by;s.createdById=old?old.createdById:actor.byId;
  s.updatedAt=now;s.updatedBy=actor.by;s.updatedById=actor.byId;
  const fields=PUR_SUPPLIER_FIELDS.concat([{k:'active',label:'Active supplier'},{k:'contacts',label:'Other contacts'},{k:'customFields',label:'Custom fields'}]);
  const changes=fields.filter(f=>JSON.stringify(old&&old[f.k])!==JSON.stringify(s[f.k])).map(f=>({field:f.k,label:f.label,before:old?old[f.k]:null,after:s[f.k]}));
  if(old)DB.supplier[DB.supplier.indexOf(old)]=s;else DB.supplier.push(s);
  if(changes.length)purRecordEvent('supplier',s.id,!old?'Created':old.active!==s.active?(s.active?'Restored':'Archived'):'Edited',changes);
  /* Link any unlinked supply rows; a card edit does not rename old points. */
  purLinkSupplyRows();
  return s;
 });
}
