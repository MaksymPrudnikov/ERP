/* Указатели на время отрисовки (задание «База», П1, erp/read-scope): экран
   отвечает так же, как без них, а запись посреди отрисовки и действие
   внутри неё указателей не видят. */
module.exports=async function({page,eq}){
 console.log('read-scope');
 const t=await page();await require('./optimization-fixture')(t.p);
 eq('строка заказа в Sales и поиски стёкол, сканов, накладных — те же с указателями и без',await t.p.evaluate(()=>{
  oqReset();const a=oqOrder(oqCustomer());salesDraftDrop();salesSetRecordStatus(a,'verified');glassBatchAssign(glassBatchRows([salesRecord(a)]),{});
  const b=oqOrder(oqCustomer({legalName:'Second customer'}));salesDraftDrop();
  const o=salesRecord(a),l=o.lines[0],piece=glassPieceMap(a).get(glassBatchComponents(o,l)[0].key).ids[0];
  stationMove('CUT',stationCheck('CUT',piece),{id:'rs',name:'Read scope'});
  const keys=['number','status','readyQty','glass','batch','newLines','pcs','area','total','receipts','balance','createdBy'];
  const rows=()=>JSON.stringify(DB.salesOrder.map(x=>{const i=salesListInfo(x);return keys.map(k=>salesListValue(i,k));}));
  const finds=id=>JSON.stringify([glassBatchEntries(id).map(x=>x.batch.number+'#'+x.index),glassBatchEntries(id,l.id).length,[...glassBatchActive(id).keys()],[...glassPieceMap(id).keys()],
   stationScansFor(piece).map(s=>s.id),shippingForOrder(id).map(s=>s.id),[...stationPieceIndex().keys()].length,[...stationBatchIndex().keys()].length]);
  return {rows:rows()===readScope(rows),finds:[a,b].every(id=>finds(id)===readScope(()=>finds(id))),scanned:stationScansFor(piece).length};
 }),{rows:true,finds:true,scanned:1});
 eq('запись посреди отрисовки и действие внутри неё — указатель не врёт',await t.p.evaluate(()=>readScope(()=>{
  const id=DB.salesOrder.find(o=>glassBatchActive(o.id).size).id,before=glassBatchActive(id).size,x=[...glassBatchActive(id).values()][0];
  const inside=storageCommand(()=>{x.item.releasedAt=new Date().toISOString();return glassBatchActive(id).size;}).value;
  /* Номер стекла выдан на месте (так делает очередь Optimization посреди
     отрисовки): длина таблицы та же — сбрасывает только запись. */
  const r=DB.glassPiece[0],warm=stationPieceIndex().has('G-9999999');storageCommand(()=>{r.ids[0]='G-9999999';});
  return {inside:inside===before-1,after:glassBatchActive(id).size===before-1,warm,piece:stationPieceIndex().has('G-9999999')};
 })),{inside:true,after:true,warm:false,piece:true});
 /* П2: Finance — номера фигур не создаются зря, итоги заказа и фигура строки
    один раз на отрисовку, прайс заказа пишется по-настоящему. */
 eq('нормализация фигуры: свой номер — как есть, новый — только когда его нет',await t.p.evaluate(()=>{
  const keep=shapeNewEntityId;let made=0;shapeNewEntityId=p=>{made++;return keep(p);};
  try{
   const s=normalizeShapeDef(JSON.parse(JSON.stringify(DB.shapeDef.find(x=>(x.features||[]).length)||DB.shapeDef[0])));made=0;
   const again=normalizeShapeDef(JSON.parse(JSON.stringify(s))),second=made,fresh=normalizeShapeDef({type:'rectangle',w:'20',h:'30'});
   return {same:JSON.stringify(again)===JSON.stringify(s),noNewIds:second===0,freshId:!!fresh.id&&made>second};
  }finally{shapeNewEntityId=keep;}
 }),{same:true,noNewIds:true,freshId:true});
 eq('итоги заказа, прайс заказа и фигура строки — те же с указателями и без',await t.p.evaluate(()=>{
  const sig=()=>JSON.stringify(DB.salesOrder.map(o=>[finOrderTotals(o),finOrderBalance(o),(o.lines||[]).map(l=>(salesShapeByRef(l.shapeRef)||{}).id||'')]));
  const id=oqOrder(oqCustomer({legalName:'Price Book Co'}));salesOrderEdit(id);soDraft.makeups.forEach(m=>{m.panes.forEach(p=>{p.priceOverride=null;});m.cavities.forEach(x=>{x.priceOverride=null;});});
  salesOrderSave();salesDraftDrop(true);const book=o=>JSON.stringify(salesPriceBookOf(o)),o=salesRecord(id);
  return {totals:sig()===readScope(sig),book:book(o)===readScope(()=>{finOrderTotals(o);return book(o);}),bookFull:Object.keys(salesPriceBookOf(o)).length>0};
 }),{totals:true,book:true,bookFull:true});
 eq('указатели без ошибок страницы',t.errs,[]);
 await t.c.close();
};
