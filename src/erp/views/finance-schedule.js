/* =====================================================================
   views/finance-schedule  ·  finance-1.2
   Вспомогательное для вкладки Due dates: дни до срока, подпись срока и CSV.
   Сама таблица и фильтры — views/finance-lists (движок Sales). Срок ставится
   сам от дня выдачи (finPaymentDue); дни считаются по календарю в UTC —
   переход на летнее время их не сдвигает.
   ===================================================================== */
function finDueDayDiff(date,today){return Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);}
function finDueTiming(x){return x.days==null?(x.f.terms.paymentMode==='credit'?'After pickup':'At pickup'):x.days<0?Math.abs(x.days)+(x.days===-1?' day':' days')+' overdue':x.days===0?'Due today':'In '+x.days+(x.days===1?' day':' days');}
function finDueCSV(rows){return [['Customer','Order','Customer PO','Terms','Billing date','Payment due','Days until due','Currency','Total','Paid','Outstanding','Status']].concat(rows.map(({o,c,f,days})=>[finCustomerName(c),o.businessNumber,o.customerPo||'',paymentTermsLabel(f.terms),finBillingDate(o),f.dueOn,days==null?'':days,'CAD',f.b.total,f.b.paid,f.b.balance,f.status])).map(row=>row.map(finCsvCell).join(',')).join('\r\n');}
