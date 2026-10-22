/* Save, Convert, копия квоты и переделка NCR нормализуют только свой заказ
   (задание «База», П3): остальные заказы остаются теми же объектами, повтор
   номеров с другим заказом разводится, как раньше. */
module.exports=async function({page,eq}){
 console.log('sales-save-one');
 const t=await page();await require('./optimization-fixture')(t.p);
 eq('Save заказа: он сохранён, другие заказы — те же объекты',await t.p.evaluate(()=>{
  oqReset();const a=oqOrder(oqCustomer()),b=oqOrder(oqCustomer({legalName:'Other customer'}));salesDraftDrop();
  const other=salesRecord(b);salesOrderEdit(a);soDraft.notes='Saved once';const ok=salesOrderSave();salesDraftDrop();
  return {ok:ok===true,note:salesRecord(a).notes,other:salesRecord(b)===other};
 }),{ok:true,note:'Saved once',other:true});
 eq('повтор номера строки и businessNumber с другим заказом — разводится, тот заказ не тронут',await t.p.evaluate(()=>{
  const [x,y]=DB.salesOrder.filter(o=>o.lines.length&&o.businessNumber),line=x.lines[0].id,number=x.businessNumber;
  y.lines[0].id=line;y.businessNumber=number;const o=normalizeSalesOrderIn(y.id);
  return {same:o.id===y.id,line:o.lines[0].id!==line,number:o.businessNumber==='',kept:salesRecord(x.id)===x&&x.lines[0].id===line&&x.businessNumber===number};
 }),{same:true,line:true,number:true,kept:true});
 eq('Save по одному заказу без ошибок страницы',t.errs,[]);
 await t.c.close();
};
