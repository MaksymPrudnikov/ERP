/* =====================================================================
   views/finance-schedule  ·  finance-1.1
   Вкладка Due dates: неоплаченные остатки заказов по сроку оплаты, самые
   ранние сверху. Срок ставится сам от дня выдачи (finPaymentDue), поэтому
   заказы до выдачи — отдельный фильтр «Before pickup», а не «без даты».
   Дни считаются по календарю в UTC — переход на летнее время их не сдвигает.
   ===================================================================== */
let finSchedule={period:'all',from:'',to:'',query:'',terms:'all'};
const FIN_DUE_PERIODS=[['all','All unpaid'],['overdue','Overdue'],['7','Due in 7 days'],['30','Due in 30 days'],['undated','Before pickup'],['custom','Custom dates']];
function finDueDayDiff(date,today){return Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);}
function finDueRange(filter,today){
 if(filter.period==='today')return {from:today,to:today};
 if(/^\d+$/.test(filter.period))return {from:today,to:finAddDays(today,Number(filter.period))};
 if(filter.period==='custom')return {from:filter.from,to:filter.to};
 return {from:'',to:''};
}
function finDueRows(filter,today){
 today=today||finToday();const range=finDueRange(filter,today);
 const invalid=(!finDateValid(today)||range.from&&!finDateValid(range.from)||range.to&&!finDateValid(range.to)||range.from&&range.to&&range.from>range.to);
 if(invalid)return {rows:[],total:0,customers:0,review:0,error:'From must be on or before To.',range};
 const query=String(filter.query||'').trim().toLowerCase();let review=0;
 const rows=(DB.salesOrder||[]).filter(finOrderCounts).map(o=>{
  const c=salesFindCustomer(o.customerId),f=finOrderFinancial(o,today);
  return {o,c,f,days:f.dueOn?finDueDayDiff(f.dueOn,today):null};
 }).filter(x=>{
  const {o,c,f}=x;
  if(query&&![c&&c.displayName,c&&c.legalName,c&&c.code,o.businessNumber,o.customerPo].join(' ').toLowerCase().includes(query))return false;
  if(filter.terms!=='all'&&filter.terms!==f.terms.paymentMode)return false;
  // Без полной цены сумму не выдумываем — такие заказы только считаются.
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
function finDueTiming(x){return x.days==null?(x.f.terms.paymentMode==='credit'?'After pickup':'At pickup'):x.days<0?Math.abs(x.days)+(x.days===-1?' day':' days')+' overdue':x.days===0?'Due today':'In '+x.days+(x.days===1?' day':' days');}
function finDuePeriodSet(period){finSchedule.period=period;render();}
function finDueDateSet(key,value){
 const range=finDueRange(finSchedule,finToday());
 if(finSchedule.period!=='custom'){finSchedule.from=range.from;finSchedule.to=range.to;}
 finSchedule.period='custom';finSchedule[key]=value;render();
}
function finDueReset(){finSchedule={period:'all',from:'',to:'',query:'',terms:'all'};render();}
function finDueDescription(filter,range){
 const label=(FIN_DUE_PERIODS.find(p=>p[0]===filter.period)||[])[1]||'Custom dates';
 return label+(range.from||range.to?' · '+(range.from||'any date')+' to '+(range.to||'any date'):'')+(filter.terms==='all'?'':filter.terms==='credit'?' · Credit':' · Cash')+(filter.query.trim()?' · '+filter.query.trim():'');
}
function finScheduleHTML(){
 const result=finDueRows(finSchedule),{rows,range}=result,custom=finSchedule.period==='custom';
 const changed=finSchedule.period!=='all'||finSchedule.query||finSchedule.terms!=='all';
 return `<div class="fin-toolbar fin-schedule-filters"><select aria-label="Payment due period" onchange="finDuePeriodSet(this.value)">${FIN_DUE_PERIODS.map(([key,label])=>`<option value="${key}" ${finSchedule.period===key?'selected':''}>${label}</option>`).join('')}</select>${custom?`<label class="fin-date">From <input aria-label="Payment due from" type="date" value="${esc(range.from)}" onchange="finDueDateSet('from',this.value)"></label><label class="fin-date">To <input aria-label="Payment due to" type="date" value="${esc(range.to)}" onchange="finDueDateSet('to',this.value)"></label>`:''}<input id="finDueSearch" aria-label="Search payment schedule" placeholder="Customer, order or PO…" value="${esc(finSchedule.query)}" oninput="finSchedule.query=this.value;finRerenderInput('finDueSearch')"><select aria-label="Schedule payment terms" onchange="finSchedule.terms=this.value;render()">${[['all','All terms'],['credit','Credit'],['cash','Cash']].map(([key,label])=>`<option value="${key}" ${finSchedule.terms===key?'selected':''}>${label}</option>`).join('')}</select>${changed?'<button class="sm" onclick="finDueReset()">Reset</button>':''}
  <span class="fin-spacer"></span><button ${result.error||!rows.length?'disabled':''} onclick="finDueExport()">CSV</button><button ${result.error||!rows.length?'disabled':''} onclick="finOpenPreview('schedule')">Print</button></div>
 ${result.error?`<p role="alert" class="fin-due">${esc(result.error)}</p>`:''}
 <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Due</th><th>Customer / order</th><th>Terms</th><th class="n">Total</th><th class="n">Paid</th><th class="n">Outstanding</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(x=>{const {o,c,f}=x;return `<tr data-due-order="${esc(o.id)}"><td><b>${esc(f.dueOn?finShortDate(f.dueOn):'—')}</b><div class="small ${x.days<0?'fin-due':'mut'}">${esc(finDueTiming(x))}</div></td><td><button class="fin-link" onclick="finOpenAccount('${esc(o.customerId)}')">${esc(finCustomerName(c))}</button>${c&&c.status==='archived'?'<span class="mut small"> · Archived</span>':''}<div><button class="fin-link" onclick="finOpenSales('${esc(o.id)}')">${esc(o.businessNumber)}</button>${o.customerPo?`<span class="mut small"> · ${esc(o.customerPo)}</span>`:''}</div></td><td>${esc(paymentTermsLabel(f.terms))}</td><td class="n">${finFmt(f.b.total)}</td><td class="n">${finFmt(f.b.paid)}</td><td class="n"><b>${finFmt(f.b.balance)}</b></td><td>${finStatusPill(f)}</td><td class="fin-actions"><button class="sm" onclick="finEditTerms('${esc(o.id)}')">Terms</button></td></tr>`;}).join('')||`<tr><td colspan="8" class="empty">${result.error?'Correct the dates.':'Nothing unpaid here.'}</td></tr>`}</tbody>
 ${rows.length?`<tfoot><tr><td colspan="5">${rows.length} ${rows.length===1?'order':'orders'} · ${result.customers} ${result.customers===1?'customer':'customers'}</td><td class="n"><b>${finFmt(result.total)}</b></td><td colspan="2"></td></tr></tfoot>`:''}</table></div>
 ${result.review?`<p class="mut small">${result.review} not priced — not in totals.</p>`:''}`;
}
function finDueCSV(rows){return [['Customer','Order','Customer PO','Terms','Billing date','Payment due','Days until due','Currency','Total','Paid','Outstanding','Status']].concat(rows.map(({o,c,f,days})=>[finCustomerName(c),o.businessNumber,o.customerPo||'',paymentTermsLabel(f.terms),finBillingDate(o),f.dueOn,days==null?'':days,'CAD',f.b.total,f.b.paid,f.b.balance,f.status])).map(row=>row.map(finCsvCell).join(',')).join('\r\n');}
function finDueExport(){const result=finDueRows(finSchedule);if(result.error||!result.rows.length)return;customerDownload('payments-due.csv',finDueCSV(result.rows),'text/csv;charset=utf-8');}
