/* Старт без перебора (задание «База», П4): номера стёкол и юнитов на проходе
   по всем заказам с общим указателем (glassPieceCtx) — те же, что прежним
   путём, заказ за заказом. */
module.exports=async function({page,eq}){
 console.log('base-start');
 const t=await page();await require('./optimization-fixture')(t.p);
 eq('номера стёкол и юнитов с указателем — те же, что без него (удалённая строка, больше и меньше штук, закрытый заказ)',await t.p.evaluate(()=>{
  oqReset();const ids=[oqOrder(oqCustomer()),oqOrder(oqCustomer({legalName:'Second'})),oqOrder(oqCustomer({legalName:'Third'}))];salesDraftDrop();
  salesSetRecordStatus(ids[0],'verified');glassBatchAssign(glassBatchRows([salesRecord(ids[0])]),{});
  DB.salesOrder.forEach(o=>glassPieceEnsure(o));
  const a=salesRecord(ids[1]),b=salesRecord(ids[2]),c=salesRecord(ids[0]);
  a.lines[0].qty+=2;if(a.lines.length>1)a.lines.pop();b.lines[0].qty=1;b.status='closed';
  const r=DB.glassPiece.find(x=>x.key.startsWith(c.id+'|'));if(r)r.ids[0]='';DB.glassUnitId=DB.glassUnitId.filter((x,i)=>i%2===0);
  DB.glassPiece.push({key:a.id+'|gone-line|x|y',ids:['G-7777777']});
  const snap=JSON.stringify(DB),run=withCtx=>{DB=JSON.parse(snap);const ctx=withCtx?glassPieceCtx():null;const changed=DB.salesOrder.map(o=>glassPieceEnsure(o,ctx||undefined));
   return JSON.stringify({changed,piece:DB.glassPiece,unit:DB.glassUnitId,seq:[DB.glassPieceSeq,DB.glassUnitIdSeq]});};
  const old=run(false),now=run(true);DB=JSON.parse(snap);
  return {same:old===now,changed:JSON.parse(old).changed.some(Boolean)};
 }),{same:true,changed:true});
 eq('старт без ошибок страницы',t.errs,[]);
 await t.c.close();
};
