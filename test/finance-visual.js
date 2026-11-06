/* Деньги на виду (владелец 07.11.2026): выписка по месяцам с Days late,
   подытогом Due now и полосой сроков; в счёте Paid зелёным и полоса оплаты,
   значок вида стекла; полоса сроков под Balance в Accounts; в Sales колонка
   Invoice за Status и статусы второй строкой только при All. */
module.exports=async function({page,eq}){
 console.log('finance visual');const t=await page();
 await t.p.evaluate(()=>{
  /* Даты от сегодняшнего дня: просрочка 130 дней (90+), 18 дней (Due now) и
     ещё не наступивший срок (Current) — тест не стареет. */
  window.fvSeed=function(){
   DB.receipt=[];DB.refund=[];DB.financeEvent=[];DB.financeTerms=[];DB.financeExport=[];DB.financeExportBatch=[];DB.salesOrder=[];DB.customer=[];DB.orderEvent=[];soDraft=null;soEdit=null;finDraft=null;finEdit=null;finAction=null;finAlloc=null;finActor='QA Operator';
   const c=normalizeCustomer({id:'CUS-FV',code:'FV',legalName:'Visual Test',paymentMode:'credit',creditDays:30});DB.customer.push(c);
   const charges={energy:{enabled:false},hst:{enabled:false},card:{enabled:false},delivery:{enabled:false},skidDeposit:{enabled:false}};
   const back=n=>{const d=new Date(finToday()+'T12:00:00');d.setDate(d.getDate()-n);return d.toISOString().slice(0,10);};
   const orders=[['SO-V1','92101',100,160],['SO-V2','92102',50,48],['SO-V3','92103',30,13]].map(([id,n,price,ago])=>{
    const o=normalizeSalesOrder({id,businessNumber:n,customerId:c.id,customerPo:'PO-'+n,createdAt:finToday()+'T08:00:00Z',lines:[],extraItems:[{id:'EXT-'+id,table:'stockItem',itemId:'TEST',qty:1,priceOverride:price}],orderCharges:charges});
    o.status='done';o.statusDates=Object.assign({},o.statusDates,{done:back(ago)+'T15:00:00'});DB.salesOrder.push(o);finCaptureTerms(o);return o;
   });
   return {c,orders,back};
  };
 });
 eq('Statement: invoices by month with a total, Due now subtotal after the last invoice to pay, Days late in red, aging bar with percents',await t.p.evaluate(()=>{
  const {back}=fvSeed(),day=finToday(),m=finStatementModel('CUS-FV',back(200),day,day);
  const rows=m.sections[0].rows.map(r=>r.group?'G '+r.group.replace(/ \d{4}$/,''):r.sub?'S '+r.sub+' '+r.value:r.total?'T '+r.total.replace(/ \d{4}/,'')+' '+r.value:(r.hi?'! ':'')+r.cells[0]+' '+r.cells[3]);
  const head=m.sections[0].cols.map(c=>c.label),late=m.sections[0].rows.filter(r=>r.cells&&r.due).map(r=>r.cells[0]);
  const pages=finStatementDoc('CUS-FV',back(200),day,day),text=finDocText(pages),bars=pages[0].items.filter(x=>x.t==='rect'&&x.h===6).map(x=>x.fill);
  return {head,late,months:rows.filter(r=>r[0]==='G').length,rows:rows.map(r=>r.replace(/^(G|T) [A-Z][a-z]+/,'$1 M')),summary:m.summary.map(c=>c.label+'='+c.value+(c.mark?' ■':'')),bar:m.summaryBar.text,text:text.includes('Due now 28%'),bars};
 }),{head:['Invoice No','Date','Reference','Days late','Amount','Balance'],late:['92101','92102'],months:3,
  rows:['G M','! 92101 130 d','S Due now · 1 invoice $100.00','T M · 1 invoice $100.00','G M','! 92102 18 d','S Due now · 1 invoice $50.00','T M · 1 invoice $50.00','G M','92103 ','T M · 1 invoice $30.00'],
  summary:['Overdue 90+ days=$100.00 ■','Overdue 60+ days=$0.00 ■','Due now=$50.00 ■','Current=$30.00 ■'],bar:'Overdue 90+ 56% · Due now 28% · Current 17%',text:true,bars:['#b42318','#b54708','#1d7a46']});
 eq('Invoice: Paid in green and Balance due in red in the top row, a Paid / Left bar under it; nothing paid — no bar; unit type marks 1 / 2 / 3',await t.p.evaluate(()=>{
  const {orders}=fvSeed(),o=orders[1];
  finSaveReceiptRecord({customerId:'CUS-FV',currency:'CAD',date:finToday(),method:'cheque',reference:'CH-1',amount:20,note:'',allocations:[{orderId:o.id,amount:20}]});
  const m=finWithOrder(o,()=>docBuildModel('invoice',o,docDefaultOptions('invoice'))),text=finDocText(docPages(m));
  const none=finWithOrder(orders[2],()=>docBuildModel('invoice',orders[2],docDefaultOptions('invoice')));
  const panes=['single','double','triple'].map(u=>docItemBase({makeupShort:true},{mark:''},0,{unitType:u,code:'X'},1).panes);
  return {strip:m.strip.slice(0,3).map(c=>c.label+'='+c.value+(c.tone?' '+c.tone:'')),bar:m.stripPaid,text:text.includes('Paid $20.00 · 40.0%')&&text.includes('Left $30.00'),none:!!none.stripPaid,noneLabels:none.strip.slice(0,2).map(c=>c.label),panes};
 }),{strip:['Total CAD=$50.00','Paid=$20.00 paid','Balance due=$30.00 due'],bar:{paid:20,left:30},text:true,none:false,noneLabels:['Total CAD','Balance due'],panes:[1,2,3]});
 eq('Accounts: aging bar under Balance — overdue 90+, due now and current in shares, amounts in the tip',await t.p.evaluate(()=>{
  fvSeed();tab='finance';finTab='accounts';finAccountId='';render();
  const bar=document.querySelector('[data-fin-aging]');
  return {parts:[...bar.children].map(s=>s.className+' '+Math.round(parseFloat(s.style.width))),tip:bar.title};
 }),{parts:['fin-age-90 56','fin-age-now 28','fin-age-cur 17'],tip:'Overdue 90+ $100.00 · Due now $50.00 · Current $30.00'});
 eq('Sales: Invoice column after Status even in a list saved with it off, Not invoiced · days (yellow from 3), Invoiced green; statuses on a second row only on All',await t.p.evaluate(()=>{
  const {orders}=fvSeed();DB.orderEvent=[{id:'EV-1',orderId:'SO-V3',what:'Printed',note:'Invoice',at:new Date().toISOString(),by:'QA'}];
  localStorage.setItem(SALES_LIST_PREFS_KEY,JSON.stringify({cols:[{k:'number',on:true},{k:'status',on:true},{k:'invoice',on:false}],createdRangeInitialized:true}));salesListPrefs=null;salesStatusFilter='';
  tab='sales';salesShow={orders:true,quotes:false,ncr:false};salesQuickSet('all');
  const ths=[...document.querySelectorAll('thead th[data-col]')].map(x=>x.dataset.col),at=ths.indexOf('invoice');
  const cell=id=>{const tr=document.querySelector(`[data-order-row="${id}"]`),i=[...tr.closest('table').querySelectorAll('thead th')].findIndex(x=>x.dataset.col==='invoice');const p=tr.children[i].querySelector('.pill');return p?p.textContent+' '+p.className:'';};
  const cells=orders.map(o=>cell(o.id)),row2=!!document.querySelector('.sl-status-row [data-status-chip]');
  salesQuickSet('invoice');const one=!document.querySelector('.sl-status-row');salesQuickSet('all');
  const saved=JSON.parse(localStorage.getItem(SALES_LIST_PREFS_KEY)).invoiceShown;
  return {after:ths[at-1],cells,row2,one,saved};
 }),{after:'status',cells:['Not invoiced · 160 d pill warn','Not invoiced · 48 d pill warn','Invoiced pill ok'],row2:true,one:true,saved:true});
 eq('no browser errors',t.errs,[]);
 await t.c.close();
};
