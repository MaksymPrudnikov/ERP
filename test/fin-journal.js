/* Журнал денег Finance → Payments (владелец, 08.11.2026): «внутренний
   бухгалтер должен видеть всё то, что уйдёт в QuickBooks, визуально» —
   оплаты, возвраты и счета одной таблицей, суммы по способам, By method с
   раскрытием, To QuickBooks. */
module.exports=async function({page,eq}){
 console.log('finance journal');
 const t=await page(undefined,{width:1500,height:1000});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));
 eq('Payments: оплаты, возврат и счёт — строки как в CSV; суммы по способам; клик по способу — фильтр; By method раскрывает; To QuickBooks — то, что уйдёт файлом',await run(()=>{
  const cs=['Journal A','Journal B'].map(n=>oqCustomer({legalName:n})),ids=cs.map(c=>oqOrder(c));
  const day=n=>{const d=new Date();d.setDate(d.getDate()-n);return d.toISOString().slice(0,10);};
  [[0,'cash',100,1],[0,'cheque',250,2],[1,'etransfer',1200,3],[1,'cash',50,4]].forEach(([i,method,amount,ago],k)=>{const o=salesRecord(ids[i]);DB.receipt.push(normalizeReceipt({number:'RJ-'+k,date:day(ago),customerId:cs[i].id,method,amount,allocations:[{orderId:o.id,amount:Math.min(amount,finOrderBalance(o).total)}]}));});
  touch();finCreateRefund({receiptId:DB.receipt.find(r=>r.number==='RJ-2').id,amount:40,method:'etransfer',date:day(1),reason:'Overpaid'});
  oqReady(ids[1]);oqAdvance(ids[1],'done','pickup');
  tab='finance';finTab='receipts';finPayView='journal';finQbOnly=false;render();
  const rows=salesListRows(finPaymentInfos()),kinds=rows.map(r=>r.kind).sort();
  let csv='';const keep=window.customerDownload;window.customerDownload=(n,txt)=>{csv=txt;};try{finExportCsv();}finally{window.customerDownload=keep;}
  const strip=[...document.querySelectorAll('[data-method]')].map(b=>b.dataset.method+' '+b.querySelector('b').textContent),net=document.querySelector('[data-method-net]').textContent;
  const types=[...document.querySelectorAll('tbody tr[data-kind]')].map(r=>r.dataset.kind).sort();
  finMethodPick('Cash');const cash=salesListRows(finPaymentInfos()).map(r=>r.memo.number).sort();finMethodPick('Cash');
  finPayView='method';finMethodToggle('E-transfer');render();
  const methods=[...document.querySelectorAll('[data-by-method]')].map(r=>r.dataset.byMethod),sub=document.querySelectorAll('[data-method-entry]').length;
  finMethodToggle('E-transfer');finPayView='journal';finQbOnly=true;render();const qb=salesListRows(finPaymentInfos()).length,pend=finExportPending().length;finQbOnly=false;render();
  return {kinds,csv:csv.split('\r\n').length-1===rows.length,types,strip,net,cash,methods,sub,qb:qb===pend&&pend>0};
 }),{kinds:['invoice','receipt','receipt','receipt','receipt','refund'],csv:true,types:['invoice','receipt','receipt','receipt','receipt','refund'],
  strip:['Cash $150.00','Cheque $250.00','E-transfer $1,200.00','Debit $0.00','Credit card $0.00'],net:'$1,560.00',cash:['RJ-0','RJ-3'],methods:['E-transfer','Cheque','Cash'],sub:2,qb:true});
 await t.c.close();
};
