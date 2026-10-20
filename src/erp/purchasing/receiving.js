/* Purchasing P3 · receiving and supplier-held purchases.
   Record what arrived, including excess, damage and a different sheet size.
   Blocks, actual sheets and sheet dimensions belong to each delivery line;
   never infer a fixed pack size and never write inventory or customer Finance.
   Receipt quantities include damaged goods. Undo keeps the audit trail.
   A delivery request reserves nothing; only receipts reduce the held balance.
   Audit 14.10.2026 (owner): broken glass is usually credited, not brought
   again; resolution Replacement means the supplier must bring it, so it
   waits as a backorder until a receipt row marked replacement arrives. */
DEFAULT.purchaseReceipt=[];DEFAULT.purchaseReceiptSeq=0;
DEFAULT.purchaseDeliveryRequest=[];DEFAULT.purchaseDeliveryRequestSeq=0;
const PUR_FULFIL={receipt:{key:'purchaseReceipt',seq:'purchaseReceiptSeq',prefix:'GR',label:'Receipt'},request:{key:'purchaseDeliveryRequest',seq:'purchaseDeliveryRequestSeq',prefix:'DR',label:'Delivery request'}};
function purFulfilFind(kind,id){return (DB[PUR_FULFIL[kind].key]||[]).find(x=>x.id===id)||null;}
function purFulfilLine(x,i){
 x=x||{};const l={};
 ['id','poLineId','requestLineId','kind','productId','productCode','sheetId','table','itemId','description','unit','reason','resolution','note'].forEach(k=>l[k]=purText(x[k]));l.id=l.id||'line-'+(i+1);
 ['qty','damaged','actualSheets','damagedSheets','widthIn','heightIn'].forEach(k=>l[k]=purNumber(x[k]));l.replacement=!!x.replacement;return l;
}
function purFulfilClean(x){
 const d={};['id','number','poId','requestId','supplierId','supplierName','date','expectedDate','receivedBy','packingSlip','to','cc','note','createdAt','createdBy','createdById','updatedAt','updatedBy','updatedById','voidAt','sentAt'].forEach(k=>d[k]=purText(x[k]));
 d.rev=Number.isSafeInteger(x.rev)&&x.rev>0?x.rev:1;d.lines=(Array.isArray(x.lines)?x.lines:[]).map(purFulfilLine);return d;
}
function normalizePurchaseReceiving(){
 Object.values(PUR_FULFIL).forEach(c=>{const ids=new Set();DB[c.key]=(DB[c.key]||[]).filter(x=>x&&purText(x.id)&&!ids.has(purText(x.id))&&(ids.add(purText(x.id)),true)).map(purFulfilClean);DB[c.seq]=DB[c.key].reduce((n,x)=>Math.max(n,new RegExp('^'+c.prefix+'-\\d+$').test(x.number)?+x.number.slice(3):0),Number.isSafeInteger(DB[c.seq])&&DB[c.seq]>=0?DB[c.seq]:0);});
}
function validatePurchaseReceiving(src){
 Object.values(PUR_FULFIL).forEach(c=>{if(!Array.isArray(src[c.key]))return;const ids=new Set(),numbers=new Set();
  src[c.key].forEach(d=>{const bad=()=>{throw new Error(c.label+': invalid or duplicate record.');};
   if(!d||typeof d!=='object'||Array.isArray(d)||!purText(d.id)||ids.has(purText(d.id))||!new RegExp('^'+c.prefix+'-\\d+$').test(d.number)||numbers.has(d.number)||!Array.isArray(d.lines))bad();ids.add(purText(d.id));numbers.add(d.number);
   const ls=new Set();d.lines.forEach(l=>{if(!l||typeof l!=='object'||Array.isArray(l)||!purText(l.id)||ls.has(purText(l.id)))bad();ls.add(purText(l.id));['qty','damaged','actualSheets','damagedSheets','widthIn','heightIn'].forEach(k=>{if(l[k]!=null&&(typeof l[k]!=='number'||!Number.isFinite(l[k])||l[k]<0))bad();});});
  });
 });
}
function purReceiptRows(poId,lineId,exclude){
 return (DB.purchaseReceipt||[]).filter(r=>!r.voidAt&&r.poId===poId&&r.id!==exclude).flatMap(r=>r.lines.filter(l=>l.poLineId===lineId).map(l=>({r,l})));
}
/* A block line counts broken glass in sheets, any other line in its own unit. */
function purReplaceUnit(l){return purUnit(l.unit)==='block'?'sheet':l.unit;}
function purBroken(row,l){return purUnit(l.unit)==='block'?row.damagedSheets||0:row.damaged!=null?row.damaged:row.damagedSheets||0;}
function purIsReplacement(row){return purNameKey(row.resolution)==='replacement';}
function purReceived(p,l,exclude){
 const all=purReceiptRows(p.id,l.id,exclude),rows=all.filter(x=>!x.l.replacement),match=rows.filter(x=>purUnit(x.l.unit)===purUnit(l.unit)&&purReceiptGlassMatches(x.l,l)&&purReceiptSupplierMatches(x.r,p));
 const received=match.reduce((n,x)=>n+(x.l.qty||0),0),ordered=purNumber(l.qty),unknown=rows.some(x=>x.l.qty==null||purUnit(x.l.unit)!==purUnit(l.unit)||!purReceiptGlassMatches(x.l,l)||!purReceiptSupplierMatches(x.r,p));
 const replaceDue=all.filter(x=>purIsReplacement(x.l)).reduce((n,x)=>n+purBroken(x.l,l),0),replaceArrived=all.filter(x=>x.l.replacement).reduce((n,x)=>n+(x.l.qty||0),0);
 return {received,ordered,remaining:ordered==null?null:ordered-received,unknown,damaged:match.reduce((n,x)=>n+(x.l.damaged||0),0),sheets:all.reduce((n,x)=>n+(x.l.actualSheets||0),0),damagedSheets:all.reduce((n,x)=>n+(x.l.damagedSheets||0),0),
  replaceDue,replaceArrived,replaceLeft:Math.max(0,replaceDue-replaceArrived),replaceUnit:purReplaceUnit(l),rows:all};
}
function purReceiptState(p){
 if(!p.lines.length)return '';
 const a=p.lines.map(l=>purReceived(p,l));
 if(a.every(x=>x.ordered!=null&&!x.unknown&&x.received>=x.ordered&&!x.replaceLeft)&&a.some(x=>x.received>0))return 'Received';
 return a.some(x=>x.received>0||x.unknown)?'Partially received':'';
}
function purRequestReceived(d,l){
 return (DB.purchaseReceipt||[]).filter(r=>!r.voidAt&&r.requestId===d.id&&purReceiptSupplierMatches(r,d)).flatMap(r=>r.lines).filter(x=>x.requestLineId===l.id&&purUnit(x.unit)===purUnit(l.unit)&&purReceiptGlassMatches(x,l)).reduce((n,x)=>n+(x.qty||0),0);
}
function purFulfilStatus(kind,d){
 if(!d.id)return 'Draft';
 if(d.voidAt)return kind==='receipt'?'Undone':'Cancelled';if(kind==='receipt')return 'Received';
 const a=d.lines.map(l=>({qty:l.qty,n:purRequestReceived(d,l)}));
 if(a.length&&a.every(x=>x.qty!=null&&x.n>=x.qty)&&a.some(x=>x.n>0))return 'Received';
 return a.some(x=>x.n>0)?'Partially received':d.sentAt?'Sent':'Draft';
}
function purFulfilSave(kind,raw){
 return purPersist(()=>{
  const c=PUR_FULFIL[kind],old=raw.id?purFulfilFind(kind,raw.id):null;
  if(raw.id&&!old)throw new Error(c.label+' no longer exists.');
  if(old&&(old.rev!==raw.rev||old.voidAt))throw new Error(c.label+' changed elsewhere. Reopen it.');
  const d=purFulfilClean(raw);
  purResolveSupplier(d);purValidateReceiptGlass(d,old);if(!d.lines.length)throw new Error('Add at least one line.');
  ['date','expectedDate'].forEach(k=>{if(d[k]&&!ISO_DATE_RE.test(d[k]))throw new Error('Date: use YYYY-MM-DD or leave empty.');});
  const ids=new Set();d.lines.forEach((l,i)=>{if(ids.has(l.id))throw new Error('Duplicate line.');ids.add(l.id);['qty','damaged','actualSheets','damagedSheets','widthIn','heightIn'].forEach(k=>{if(purText(raw.lines[i][k])!==''&&(l[k]==null||l[k]<0))throw new Error('Line '+(i+1)+': enter a non-negative number or leave empty.');});
   /* Листы стекла — до 10 000 в строке (INV_SHEETS_MAX, erp/inventory). */
   const sheets=['glass','sheet'].includes(l.kind)?['actualSheets','damagedSheets'].concat(['sheet','block'].includes(purUnit(l.unit))?['qty','damaged']:[]):[];
   if(sheets.some(k=>l[k]>INV_SHEETS_MAX))throw new Error('Line '+(i+1)+': up to 10,000 sheets.');});
  const now=new Date().toISOString(),actor=orderLogActor();d.id=old?old.id:salesUid(c.prefix);d.number=old?old.number:c.prefix+'-'+String(++DB[c.seq]).padStart(4,'0');
  d.createdAt=old?old.createdAt:now;d.createdBy=old?old.createdBy:actor.by;d.createdById=old?old.createdById:actor.byId;d.updatedAt=now;d.updatedBy=actor.by;d.updatedById=actor.byId;d.rev=old?old.rev+1:1;d.voidAt='';d.sentAt=old?old.sentAt:'';
  const changes=['poId','requestId','supplierId','supplierName','date','expectedDate','receivedBy','packingSlip','to','cc','note','lines'].filter(k=>JSON.stringify(old&&old[k])!==JSON.stringify(d[k])).map(k=>({field:k,label:stkHuman(k),before:old?old[k]:null,after:d[k]}));
  if(old)DB[c.key][DB[c.key].indexOf(old)]=d;else DB[c.key].push(d);
  if(changes.length){purRecordEvent(kind,d.id,old?'Edited':'Created',changes);[...new Set([old&&old.poId,d.poId].filter(Boolean))].forEach(id=>purRecordEvent('po',id,(old?'Edited ':'')+c.label+' '+d.number,[{field:kind,label:c.label,before:old?old.number:null,after:d.number}]));}
  return d;
 });
}
function purFulfilUndo(kind,id,rev,restore){
 return purPersist(()=>{const d=purFulfilFind(kind,id);if(!d||d.rev!==rev)throw new Error('Document changed elsewhere. Reopen it.');d.voidAt=restore?'':new Date().toISOString();d.rev++;
  const what=restore?'Restored':kind==='receipt'?'Undone':'Cancelled';purRecordEvent(kind,id,what,[]);if(d.poId)purRecordEvent('po',d.poId,what+' '+d.number,[]);return d;});
}
function purRequestMarkSent(id,rev){return purPersist(()=>{const d=purFulfilFind('request',id);if(!d||d.rev!==rev||d.voidAt)throw new Error('Delivery request changed elsewhere. Reopen it.');d.sentAt=new Date().toISOString();d.rev++;purRecordEvent('request',id,'Sent',[]);return d;});}
function purFulfilWarnings(kind,d){
 const a=[],p=purOrderFind(d.poId),request=purFulfilFind('request',d.requestId);
 if(d.poId&&!p)a.push('The linked PO is missing.');
 if(p&&(p.deletedAt||['closed','cancelled'].includes(p.state)))a.push('PO is '+purOrderStatus(p).toLowerCase()+'. You can still record this delivery.');
 if(request&&(request.voidAt||request.poId!==d.poId))a.push('Review the delivery request link.');
 if(p&&!purReceiptSupplierMatches(d,p))a.push('Supplier differs from the PO. Review the link; this receipt does not reduce its balance.');
 d.lines.forEach((l,i)=>{const n='Line '+(i+1)+': ',pl=p&&p.lines.find(x=>x.id===l.poLineId);
  if(l.replacement){if(pl&&kind==='receipt'){const r=purReceived(p,pl,d.id);if((l.qty||0)>r.replaceLeft)a.push(n+'more replacement than broken glass waiting.');}return;}
  if(pl&&!purReceiptGlassMatches(l,pl))a.push(n+'Glass differs from the PO line. Review the link; it does not reduce the ordered glass balance.');
  if(l.poLineId&&!pl)a.push(n+'PO line no longer exists. The saved description remains.');
  if(l.damaged>l.qty&&l.qty!=null)a.push(n+'damaged quantity exceeds the received quantity.');
  if(l.damagedSheets>l.actualSheets&&l.actualSheets!=null)a.push(n+'damaged sheets exceed the received sheets.');
  if(pl){const r=purReceived(p,pl,kind==='receipt'?d.id:null),same=purUnit(l.unit)===purUnit(pl.unit);
   if(!same)a.push(n+'unit differs from the PO; quantities need review.');
   const total=d.lines.filter(x=>x.poLineId===pl.id&&!x.replacement&&purUnit(x.unit)===purUnit(pl.unit)).reduce((sum,x)=>sum+(purNumber(x.qty)||0),0);
   if(same&&r.remaining!=null&&total>r.remaining)a.push(n+(kind==='request'?'request exceeds the held balance.':'received more than ordered.'));
   if((l.widthIn&&pl.widthIn&&+l.widthIn!==+pl.widthIn)||(l.heightIn&&pl.heightIn&&+l.heightIn!==+pl.heightIn))a.push(n+'sheet size differs from the PO'+(purReceiptGlassMatches(l,pl)&&purReceiptSupplierMatches(d,p)?'; this quantity counts against the selected line.':'.'));
   if(kind==='request'&&!pl.held)a.push(n+'PO line is not marked Held at supplier.');
  }
 });return a;
}
/* Glass held at the supplier arrives only when it is brought: a plain
   receipt lists those lines empty, a receipt from a delivery request fills
   what was requested (audit 14.10.2026). Empty receipt rows are not saved. */
function purFulfilFromPO(kind,id,requestId){
 const p=purOrderFind(id),r=requestId&&purFulfilFind('request',requestId);
 const row=(l,extra)=>Object.assign({id:salesUid('RL'),poLineId:l.id,...purGlassIdentity(l),description:l.description,unit:l.unit,widthIn:l.widthIn,heightIn:l.heightIn},extra);
 const lines=r?r.lines.map(l=>Object.assign({},l,{id:salesUid('RL'),requestLineId:l.id,qty:l.qty==null?null:Math.max(0,l.qty-purRequestReceived(r,l))})):p?p.lines.filter(l=>kind==='receipt'||l.held).flatMap(l=>{
  if(kind==='request')return [row(l,{qty:null})];
  const b=purReceived(p,l),out=[row(l,{qty:l.held||b.remaining==null?null:Math.max(0,b.remaining)})];
  if(b.replaceLeft)out.push(row(l,{replacement:true,unit:b.replaceUnit,qty:b.replaceLeft}));
  return out;
 }):[];
 return purFulfilClean({poId:id,requestId:requestId||'',date:finToday(),receivedBy:kind==='receipt'?orderLogActor().by:'',supplierId:p?p.supplierId:'',supplierName:p?p.supplierName:'',to:p?p.to:'',cc:p?p.cc:'',lines:lines.length?lines:[{id:salesUid('RL'),kind:'glass',unit:'sheet'}]});
}
function purWaitingRows(held){
 return (DB.purchaseOrder||[]).filter(p=>!p.deletedAt&&!['closed','cancelled'].includes(p.state)).flatMap(p=>p.lines.flatMap(l=>{
  const b=purReceived(p,l),out=[];
  if(!!l.held===held&&(b.remaining==null||b.remaining!==0||b.unknown))out.push({p,l,b});
  if(!held&&b.replaceLeft)out.push({p,l,b,replace:true});
  return out;
 }));
}
/* Held at supplier as a board (owner, 14.10.2026): some glass comes from
   China, so the office must see when the bought stock at the supplier runs
   out and when to order again. One row per glass + sheet size + supplier.
   The pace is what was brought over the last 90 days (at least 30 days,
   never before the first purchase); nothing brought yet = No estimate.
   Order by = runs out − the supplier card's lead time. */
const PUR_HELD_WINDOW=90,PUR_HELD_SOON=30;
function purDayDiff(a,b){return Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/864e5);}
function purDayAdd(d,n){const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+Math.round(n));return finLocalDate(x);}
function purHeldGroups(today){
 today=today||finToday();const map=new Map();
 purWaitingRows(true).forEach(({p,l,b})=>{
  const g=purGlassProduct(l),key=[p.supplierId||purNameKey(purSupplierDisplay(p)),l.productId||(l.itemId?l.table+':'+l.itemId:'')||purNameKey(l.description),l.widthIn||'',l.heightIn||'',purUnit(l.unit)].join('|');
  if(!map.has(key)){const s=purSupplierFind(p.supplierId);map.set(key,{key,item:g?g.name:l.description,code:g?g.code:'',size:l.widthIn&&l.heightIn?l.widthIn+' × '+l.heightIn:'',supplierId:p.supplierId,supplierName:purSupplierDisplay(p)||'Supplier not set',unit:l.unit,leadTime:s&&s.leadTimeDays!=null?s.leadTimeDays:null,pos:[],rows:[],ordered:0,received:0,remaining:0,first:'',unknown:false});}
  const a=map.get(key);a.pos.push(p);a.ordered+=b.ordered||0;a.received+=b.received;a.remaining+=b.remaining||0;a.unknown=a.unknown||b.unknown||b.ordered==null;
  const bought=p.date||finLocalDate(new Date(p.createdAt||Date.now()));if(!a.first||bought<a.first)a.first=bought;
  a.rows=a.rows.concat(b.rows.filter(x=>!x.l.replacement&&purUnit(x.l.unit)===purUnit(l.unit)));
 });
 return [...map.values()].map(a=>{
  const from=[purDayAdd(today,-PUR_HELD_WINDOW),a.first].sort().pop(),days=Math.max(PUR_HELD_SOON,purDayDiff(from,today));
  const brought=a.rows.filter(x=>(x.r.date||'')>=from&&(x.r.date||'')<=today).reduce((n,x)=>n+(x.l.qty||0),0),perDay=brought/days;
  const runsOut=perDay>0?purDayAdd(today,a.remaining/perDay):'',orderBy=runsOut?purDayAdd(runsOut,-(a.leadTime||0)):'';
  const status=!runsOut?'No estimate':orderBy<=today?'Order now':purDayDiff(today,orderBy)<=PUR_HELD_SOON?'Order soon':'OK';
  return Object.assign(a,{pos:[...new Set(a.pos)],perMonth:perDay>0?Math.round(perDay*30*10)/10:null,runsOut,orderBy,status,share:a.ordered>0?Math.max(0,Math.min(1,a.remaining/a.ordered)):0});
 });
}
