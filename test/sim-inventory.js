/* Симуляция цеха со складом (tools/sim-shop.js --inventory, Inventory PR 4):
   четыре дня малого цеха функциями ERP — закупки и приёмки блоками,
   пересчёт на старте, Offset 1/16 у листов Maver, куски S-, сканы CUT с
   листом — без сбоев, и склад сходится с раскроями; в конце есть заказы,
   которые ждут Verify и батча, On Hold и отменённый; путеводитель по этапам;
   выданный заказ с просроченной оплатой. */
module.exports=async function({page,eq}){
 console.log('sim inventory');const t=await page();
 const {initPage,simPage}=require('../tools/sim-shop.js');
 await t.p.evaluate(`(${initPage.toString()})(13)`);
 await t.p.evaluate(`(${simPage.toString()})()`);
 const out=await t.p.evaluate(async()=>{
  await SIM.setup({seed:13,scale:0.1,quickCut:true,start:'2026-10-05',inventory:true});
  const counted=DB.inventoryEvent.filter(e=>e.kind==='count').length,mins=Object.keys(DB.inventoryMin).length;
  for(const d of ['2026-10-05','2026-10-06','2026-10-07','2026-10-08'])await SIM.day(d,d==='2026-10-08'?10:0);
  SIM.finish('2026-10-08');SIM.unarchive();const fin=SIM.invFinal('2026-10-08'),made=SIM.stagesFill('2026-10-08',10),guide=SIM.guide();
  const cut=stationCutCode(),scans=DB.stationScan.filter(s=>s.station===cut&&!s.park),byPiece=invCutByPiece(invCutScans()),res=invReservedSheets(byPiece);
  let sheets=0,lost=0;
  (DB.cutPlan||[]).filter(p=>!p.reset&&glassBatchFind(p.batch)).forEach(p=>{const b=glassBatchFind(p.batch),act=new Map(glassBatchActiveItems(b).map(i=>[i.piece,i]));
   p.groups.forEach(g=>g.sheets.forEach(s=>{if(/^S-/.test((s.size||{}).key||''))return;sheets++;
    if(invSheetCutScan(p,s,byPiece)||res.some(r=>r.batch===p.batch&&r.plan===(p.at||'')&&r.no===s.no))return;
    if(s.pieces.some(x=>{const i=act.get(x.piece);return i&&!i.cutStartedAt;}))lost++;}));});
  return {fails:SIM.fails,counted:counted>0,mins:mins>0,receipts:(DB.purchaseReceipt||[]).length>0,pos:(DB.purchaseOrder||[]).length>1,
   scans:scans.length>0&&scans.every(s=>s.sheet),sheets:sheets>0,lost,offset:(DB.cutPlan||[]).some(p=>p.groups.some(g=>g.sheets.some(s=>s.size&&s.size.inset===0.0625))),
   noOdd:!invSheetRows().some(r=>r.w===129.875),stages:['new','verified'].every(s=>DB.salesOrder.some(o=>!salesIsQuote(o)&&o.status===s&&!o.onHold))&&DB.salesOrder.some(o=>o.onHold)&&DB.salesOrder.some(o=>o.status==='cancelled'),final:!!fin&&Array.isArray(made),guide:guide.length>=25&&guide.every(r=>r.stage&&r.where)};
 });
 eq('four days of the shop with inventory: no failures, stock agrees with the layouts, every stage to look at',out,
  {fails:{},counted:true,mins:true,receipts:true,pos:true,scans:true,sheets:true,lost:0,offset:true,noOdd:true,stages:true,final:true,guide:true});
 eq('sim inventory has no JavaScript errors',t.errs,[]);await t.c.close();
 /* Выдано, срок оплаты прошёл, денег нет. Неделя до 13.10: выданный за
    наличные долг клиент гасит — тогда добор ставит короткий срок (Net 3)
    самому раннему выданному заказу; Finance → Due dates показывает его как
    Overdue, путеводитель — с номером заказа. */
 const t2=await page();
 await t2.p.evaluate(`(${initPage.toString()})(13)`);
 await t2.p.evaluate(`(${simPage.toString()})()`);
 const late=await t2.p.evaluate(async()=>{
  await SIM.setup({seed:13,scale:0.1,quickCut:true,start:'2026-10-05',inventory:true});
  const end='2026-10-13';for(const d of ['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11','2026-10-12',end])await SIM.day(d,d===end?10:0);
  SIM.finish(end);SIM.unarchive();SIM.invFinal(end);
  DB.salesOrder.filter(o=>o.status==='done'&&finOrderFinancial(o,end).overdue>0).forEach(o=>{const b=finOrderBalance(o).balance;
   finPersist(()=>finSaveReceiptRecord({customerId:o.customerId,date:end,method:'cheque',reference:'T-'+o.businessNumber,note:'',amount:b,allocations:[{orderId:o.id,amount:b}],currency:'CAD'},'','',true));});
  const made=SIM.stagesFill(end,10),row=SIM.guide().find(r=>r.stage==='Выдано — оплата просрочена')||{},o=DB.salesOrder.find(x=>x.businessNumber===row.order),due=o&&finDueInfos().find(r=>r.o===o);
  return {fails:SIM.fails,made:made.includes('overdue'),net:o&&finTermsFor(o).creditDays,where:row.where,due:due&&due.memo.status};
 });
 eq('a handed-over order with its payment past due: short terms, Overdue in Finance → Due dates, a row in the guide',late,
  {fails:{},made:true,net:3,where:'Finance → Due dates',due:'Overdue'});
 eq('overdue sim has no JavaScript errors',t2.errs,[]);await t2.c.close();
};
