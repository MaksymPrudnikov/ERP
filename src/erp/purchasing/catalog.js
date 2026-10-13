/* Owner correction, 13 October 2026: glass is catalogue data, like Sales.
   Labels are snapshots; supplier/product IDs are identity. Stock and other
   purchases remain separate. CAD is the default, never an FX conversion. */
function purSupplierDisplay(d){const s=purSupplierFind(d.supplierId);return s?s.name:d.supplierName||'';}
function purResolveSupplier(d){const s=purSupplierFind(d.supplierId);if(s)d.supplierName=s.name;}
function purIsGlass(l){return ['glass','sheet','order'].includes(l.kind);}
function purGlassProduct(l){return (l.productId&&glassProductById(l.productId))||(!l.productId&&glassProductByCode(l.productCode))||null;}
function purGlassIdentity(l){return {kind:l.kind,productId:l.productId||'',productCode:l.productCode||'',sheetId:l.sheetId||'',table:l.table||'',itemId:l.itemId||''};}
function purValidateGlassLines(p,old){
 p.lines.forEach((l,i)=>{
  if(l.kind==='order'){const prior=old&&old.lines.find(x=>x.id===l.id);if(!purSupplierFind(p.supplierId)&&!(prior&&old.supplierId===p.supplierId))throw new Error('Choose a supplier for glass.');return;}
  if(!['glass','sheet'].includes(l.kind))return;
  const g=purGlassProduct(l),prior=old&&old.lines.find(x=>x.id===l.id),retained=prior&&JSON.stringify(purGlassIdentity(prior))===JSON.stringify(purGlassIdentity(l));
  if(!g&&!retained)throw new Error('Line '+(i+1)+': choose glass from the catalogue.');
  if(!purSupplierFind(p.supplierId)&&!(retained&&old.supplierId===p.supplierId))throw new Error('Choose a supplier for glass.');
  if(g){l.productId=g.id;l.productCode=g.code;l.description=g.name;}
  const s=(DB.glassSheet||[]).find(s=>s.id===l.sheetId);
  if(s&&(s.supplierId!==p.supplierId||s.productCode!==l.productCode)&&!retained)throw new Error('Line '+(i+1)+': choose a supply point for this glass and supplier.');
 });
}
function purCatalogueLine(id){const g=glassProductById(id);return purLineClean({id:salesUid('PL'),kind:'glass',productId:g?g.id:'',productCode:g?g.code:'',description:g?g.name:'',qty:1,unit:'sheet',priceUnit:'sqft'},0);}
function purStockLine(table,id){
 const r=SALES_EXTRA_ITEM_TABLES.includes(table)&&salesExtraItemRow(table,id);if(!r)return null;
 return purLineClean({id:salesUid('PL'),kind:'stock',table,itemId:id,description:r.name,qty:1,unit:r.purchaseUnit||'each',priceUnit:r.purchaseUnit||'each',price:r.purchasePrice,sourceCurrency:r.currency},0);
}

function purReceiptGlassMatches(a,b){
 if(a.productId&&b.productId)return a.productId===b.productId;
 return !a.productCode||!b.productCode||a.productCode===b.productCode;
}
function purValidateReceiptGlass(d,old){
 d.lines.forEach((l,i)=>{
  if(!['glass','sheet'].includes(l.kind))return;
  const g=purGlassProduct(l),prior=old&&old.lines.find(x=>x.id===l.id),retained=prior&&JSON.stringify(purGlassIdentity(prior))===JSON.stringify(purGlassIdentity(l));
  if(!g&&!retained)throw new Error('Line '+(i+1)+': choose glass from the catalogue.');
  if(!purSupplierFind(d.supplierId)&&!(retained&&old.supplierId===d.supplierId))throw new Error('Choose a supplier for glass.');
  if(g){l.productId=g.id;l.productCode=g.code;l.description=g.name;}
 });
}

function purReceiptSupplierMatches(a,b){return !a.supplierId||!b.supplierId||a.supplierId===b.supplierId;}
