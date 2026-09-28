/* Expected customer payments. Independent of receipt/journal date filters.
   Calendar-day arithmetic in UTC avoids DST shifts; today is the local date. */
let finSchedule={period:'30',from:'',to:'',query:'',terms:'all'};
const FIN_DUE_PERIODS=[['overdue','Overdue'],['today','Today'],['7','Next 7 days'],['14','Next 14 days'],['30','Next 30 days'],['all','All unpaid'],['undated','No payment date'],['custom','Custom dates']];
function finDueDayDiff(date,today){return Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);}
function finDueShift(today,days){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function finDueRange(filter,today){
 if(filter.period==='today')return {from:today,to:today};
 if(['7','14','30'].includes(filter.period))return {from:today,to:finDueShift(today,Number(filter.period))};
 if(filter.period==='custom')return {from:filter.from,to:filter.to};
 return {from:'',to:''};
}
function finDueRows(filter,today){
 today=today||finToday();const range=finDueRange(filter,today);
 const invalid=(!finDateValid(today)||range.from&&!finDateValid(range.from)||range.to&&!finDateValid(range.to)||range.from&&range.to&&range.from>range.to);
 if(invalid)return {rows:[],total:0,customers:0,review:0,error:'Enter a valid date range. From must be on or before To.',range};
 const query=String(filter.query||'').trim().toLowerCase();let review=0;
 const rows=(DB.salesOrder||[]).filter(finOrderCounts).map(o=>{
  const c=salesFindCustomer(o.customerId),f=finOrderFinancial(o,today);
  return {o,c,f,days:f.dueOn?finDueDayDiff(f.dueOn,today):null};
 }).filter(x=>{
  const {o,c,f}=x;
  if(query&&![c&&c.displayName,c&&c.legalName,c&&c.code,o.businessNumber,o.customerPo].join(' ').toLowerCase().includes(query))return false;
  if(filter.terms!=='all'&&filter.terms!==f.terms.paymentMode)return false;
  // No invented CAD amounts or due balances for orders with incomplete pricing.
  if(f.b.total==null){review++;return false;}
  if(!(f.b.balance>0))return false;
  if(filter.period==='undated')return !f.dueOn;
  if(filter.period==='all')return true;
  if(!f.dueOn)return false;
  if(filter.period==='overdue')return f.dueOn<today;
  return (!range.from||f.dueOn>=range.from)&&(!range.to||f.dueOn<=range.to);
 }).sort((a,b)=>(a.f.dueOn||'9999').localeCompare(b.f.dueOn||'9999')||finCustomerName(a.c).localeCompare(finCustomerName(b.c))||String(a.o.businessNumber).localeCompare(String(b.o.businessNumber)));
 return {rows,total:finMoney(rows.reduce((s,x)=>s+x.f.b.balance,0)),customers:new Set(rows.map(x=>x.o.customerId)).size,review,error:'',range};
}
function finDueTiming(x){return x.days==null?'Payment date not set':x.days<0?Math.abs(x.days)+' days overdue':x.days===0?'Due today':'In '+x.days+' days';}
function finDuePeriodSet(period){finSchedule.period=period;render();}
function finDueDateSet(key,value){
 const range=finDueRange(finSchedule,finToday());
 if(finSchedule.period!=='custom'){finSchedule.from=range.from;finSchedule.to=range.to;}
 finSchedule.period='custom';finSchedule[key]=value;render();
}
function finDueReset(){finSchedule={period:'30',from:'',to:'',query:'',terms:'all'};render();}
function finDueDescription(filter,range){
 const label=(FIN_DUE_PERIODS.find(p=>p[0]===filter.period)||[])[1]||'Custom dates';
 return label+(range.from||range.to?' · '+(range.from||'any date')+' to '+(range.to||'any date'):'')+' · '+(filter.terms==='all'?'All terms':filter.terms==='credit'?'Credit / Net terms':'Cash / deposit')+(filter.query.trim()?' · Search: '+filter.query.trim():'');
}
function finScheduleHTML(){
 const result=finDueRows(finSchedule),{rows,range}=result;
 return `<div class="fin-toolbar fin-schedule-filters"><label class="fin-date">Period <select aria-label="Payment due period" onchange="finDuePeriodSet(this.value)">${FIN_DUE_PERIODS.map(([key,label])=>`<option value="${key}" ${finSchedule.period===key?'selected':''}>${label}</option>`).join('')}</select></label><label class="fin-date">Due from <input aria-label="Payment due from" type="date" value="${esc(range.from)}" onchange="finDueDateSet('from',this.value)"></label><label class="fin-date">Due to <input aria-label="Payment due to" type="date" value="${esc(range.to)}" onchange="finDueDateSet('to',this.value)"></label><input id="finDueSearch" aria-label="Search payment schedule" placeholder="Customer, order or PO…" value="${esc(finSchedule.query)}" oninput="finSchedule.query=this.value;finRerenderInput('finDueSearch')"><select aria-label="Schedule payment terms" onchange="finSchedule.terms=this.value;render()">${[['all','All terms'],['credit','Credit / Net terms'],['cash','Cash / deposit']].map(([key,label])=>`<option value="${key}" ${finSchedule.terms===key?'selected':''}>${label}</option>`).join('')}</select><button class="sm" onclick="finDueReset()">Reset filters</button></div>
 ${result.error?`<p role="alert" class="fin-due">${esc(result.error)}</p>`:''}
 <div class="fin-due-summary" aria-live="polite"><span><b>${rows.length}</b> unpaid ${rows.length===1?'order':'orders'} · <b>${result.customers}</b> ${result.customers===1?'customer':'customers'} · <b>${finFmt(result.total)} CAD</b> outstanding in this selection</span><div class="row"><button ${result.error||!rows.length?'disabled':''} onclick="finDueExport()">Export schedule CSV</button><button ${result.error||!rows.length?'disabled':''} onclick="finDuePrint()">Print schedule / PDF</button></div></div>
 ${result.review?`<p class="fin-hint">${result.review} matching orders require pricing / currency review and are excluded from these totals. Review them in Customer accounts.</p>`:''}
 <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Payment due</th><th>Customer / order</th><th>Terms</th><th class="n">Total · CAD</th><th class="n">Paid</th><th class="n">Outstanding</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(x=>{const {o,c,f}=x;return `<tr data-due-order="${esc(o.id)}"><td><b>${esc(f.dueOn||'Not set')}</b><div class="small ${x.days<0?'fin-due':'mut'}">${esc(finDueTiming(x))}</div></td><td><button class="fin-link" onclick="finOpenAccount('${esc(o.customerId)}')">${esc(finCustomerName(c))}</button>${c&&c.status==='archived'?'<span class="mut small"> · Archived</span>':''}<div><button class="fin-link" onclick="finOpenSales('${esc(o.id)}')">${esc(o.businessNumber)}</button><span class="mut small"> · PO ${esc(o.customerPo||'—')}</span></div></td><td>${esc(paymentTermsLabel(f.terms))}<div class="mut small">Billing: ${esc(f.terms.issuedOn||'Not set')}</div></td><td class="n">${finFmt(f.b.total)}</td><td class="n">${finFmt(f.b.paid)}</td><td class="n"><b>${finFmt(f.b.balance)}</b></td><td><span class="pill ${x.days<0?'bad':'info'}">${esc(f.status)}</span></td><td class="fin-actions"><button class="sm" onclick="finEditTerms('${esc(o.id)}')">Terms & dates</button></td></tr>`;}).join('')||`<tr><td colspan="8" class="empty">${result.error?'Correct the date range to view payments.':'No unpaid orders match these filters.'}</td></tr>`}</tbody></table></div>
 <details class="fin-schedule-help"><summary>How payment dates work</summary><p>Net terms use billing date + credit days unless an agreed due date is set. Upcoming periods include today through the end date shown in the filter. Both boundaries are inclusive.</p><p>Unapplied deposits are shown separately in Customer accounts; they do not reduce an order balance until allocated. Orders without a payment date appear under No payment date or All unpaid. This is the outstanding balance at its payment due date, not an instalment or deposit schedule.</p></details>`;
}
function finDueCSV(rows){return [['Customer','Order','Customer PO','Terms','Billing date','Payment due','Days until due','Currency','Total','Paid','Outstanding','Financial status']].concat(rows.map(({o,c,f,days})=>[finCustomerName(c),o.businessNumber,o.customerPo||'',paymentTermsLabel(f.terms),f.terms.issuedOn,f.dueOn,days==null?'':days,'CAD',f.b.total,f.b.paid,f.b.balance,f.status])).map(row=>row.map(finCsvCell).join(',')).join('\r\n');}
function finDueExport(){const result=finDueRows(finSchedule);if(result.error||!result.rows.length)return;customerDownload('payment-due-schedule.csv',finDueCSV(result.rows),'text/csv;charset=utf-8');}
function finDuePrint(){const result=finDueRows(finSchedule);if(result.error||!result.rows.length)return;printSheet(finPrintPages('Payment due schedule',finDueDescription(finSchedule,result.range),`${result.rows.length} unpaid orders · ${result.customers} customers · Outstanding ${finFmt(result.total)} CAD. Unapplied deposits are separate.`,['Customer','Order / PO','Payment due','Timing','Terms','Outstanding'],result.rows.map(x=>[finCustomerName(x.c),x.o.businessNumber+' / '+(x.o.customerPo||'—'),x.f.dueOn||'Not set',finDueTiming(x),paymentTermsLabel(x.f.terms),finFmt(x.f.b.balance)])));}
