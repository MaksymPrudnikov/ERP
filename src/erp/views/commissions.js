/* =====================================================================
   view/commissions  ·  commissions-1.0
   Раздел Agents (своя галочка в Users; владелец, 11.10.2026: «Commissions»
   не влезает в меню слева — слово короче): люди, которые привели
   клиентов, сколько им начислено и сколько отдать. Владелец, 11.10.2026:
   «видеть по этим людям, сколько нужно в целостности отдать комиссионные,
   потом открыть по заказам и по количеству, чтобы этих людей тоже можно было
   оценить: заказов может быть больше, а сумма меньше».
   IN : erp/finance/commissions
   ===================================================================== */
let comOpen='',comDraft=null,comPayDraft=null,comPeriod='year',comHst=false,comNotice='';
const COM_PERIODS=[['year','This year'],['last','Last year'],['all','All time']];
function comRange(){const y=+finToday().slice(0,4);return comPeriod==='all'?null:comPeriod==='last'?{from:(y-1)+'-01-01',to:(y-1)+'-12-31'}:{from:y+'-01-01',to:y+'-12-31'};}
function comCustomerName(id){return finCustomerName(salesFindCustomer(id));}
function viewCommissions(){
 const range=comRange(),list=(DB.referrer||[]).map(r=>({r,s:comSummary(r,range)})).sort((a,b)=>b.s.toPay-a.s.toPay||a.r.name.localeCompare(b.r.name));
 const sum=k=>finMoney(list.reduce((n,x)=>n+x.s[k],0)),money=v=>v?finFmt(v):'<span class="mut">—</span>';
 const hstHead=comHst?'<th class="n">Paid with HST</th><th class="n">Commission with HST</th>':'';
 const rows=list.map(({r,s})=>`<tr data-com-row="${esc(r.id)}" class="fin-row${comOpen===r.id?' shipping-selected':''}" onclick="comOpen='${esc(r.id)}';comDraft=null;comPayDraft=null;render()">
   <td><b data-raw>${esc(r.name)}</b></td><td class="mut" data-raw>${esc([r.phone,r.email].filter(Boolean).join(' · '))||'—'}</td><td data-raw>${esc(r.customers.map(c=>comCustomerName(c.customerId)+' '+c.pct+'%').join(', '))||'<span class="mut">—</span>'}</td>
   <td class="n">${s.orders}</td><td class="n">${money(s.base)}</td><td class="n"><b>${money(s.com)}</b></td>${comHst?`<td class="n">${money(s.paid)}</td><td class="n">${money(s.comHst)}</td>`:''}<td class="n">${money(s.paidOut)}</td><td class="n"><b class="${s.toPay>0?'fin-due':''}">${finFmt(s.toPay)}</b></td></tr>`).join('');
 const foot=list.length?`<tfoot><tr class="sl-foot"><td colspan="3"><b>${list.length} ${list.length===1?'person':'people'}</b></td><td class="n">${list.reduce((n,x)=>n+x.s.orders,0)}</td><td class="n">${finFmt(sum('base'))}</td><td class="n"><b>${finFmt(sum('com'))}</b></td>${comHst?`<td class="n">${finFmt(sum('paid'))}</td><td class="n">${finFmt(sum('comHst'))}</td>`:''}<td class="n">${finFmt(sum('paidOut'))}</td><td class="n"><b>${finFmt(sum('toPay'))}</b></td></tr></tfoot>`:'';
 const tools=`<div class="sales-toolbar"><div class="com-period" data-com-period>${COM_PERIODS.map(([k,l])=>`<button type="button" class="sl-btn${comPeriod===k?' on':''}" onclick="comPeriod='${k}';render()">${l}</button>`).join('')}</div><label class="com-check"><input type="checkbox" data-com-hst ${comHst?'checked':''} onchange="comHst=this.checked;render()"> With HST</label><span class="sales-toolbar-sp"></span><button type="button" class="pri" data-com-add onclick="comEditOpen('')">+ Person</button></div>`;
 const table=`<div class="sales-table-wrap"><table class="sl-table fin-list" data-com-table><thead><tr><th>Person</th><th>Contact</th><th>Customers · %</th><th class="n" title="Orders with payments in the period">Orders</th><th class="n" title="Payments without HST">Paid</th><th class="n">Commission</th>${hstHead}<th class="n" title="All time">Paid out</th><th class="n" title="All time: commission − paid out">To pay</th></tr></thead><tbody>${rows||`<tr><td colspan="${comHst?11:9}" class="empty">Nobody yet. + Person — who brought a customer and the percent.</td></tr>`}</tbody>${foot}</table></div>`;
 return `<div class="page-head"><div><h2>Agents</h2><p>People who bring customers · percent of what the customer paid, without HST.</p></div></div>
  ${comNotice?`<div class="ncr-error" role="alert" data-com-error>${esc(comNotice)}</div>`:''}
  <div class="card sales-list-card">${tools}${table}</div>${comDraft?comFormHTML():comOpen&&comFind(comOpen)?comDetailHTML(comFind(comOpen),range):''}`;
}
function comDetailHTML(r,range){
 const s=comSummary(r,range),money=v=>v?finFmt(v):'<span class="mut">—</span>';
 const rows=s.rows.map(x=>`<tr data-com-order="${esc(x.number)}"><td><button type="button" class="fin-link mono" onclick="event.stopPropagation();salesLeaveDraft(()=>{tab='sales';salesOrderEdit('${esc(x.o.id)}')})">${esc(x.number)}</button></td><td data-raw>${esc(comCustomerName(x.customerId))}</td><td>${esc(salesListShortDay(x.date))}</td><td class="n">${money(x.total)}</td><td class="n">${money(x.base)}</td><td class="n">${x.pct}%</td><td class="n"><b>${money(x.com)}</b></td>${comHst?`<td class="n">${money(x.paid)}</td><td class="n">${money(x.comHst)}</td>`:''}</tr>`).join('');
 const pays=(DB.referrerPayout||[]).filter(p=>p.referrerId===r.id).sort((a,b)=>b.date.localeCompare(a.date));
 const payForm=comPayDraft?`<div class="sl-row com-pay-form" data-com-pay-form><input type="date" value="${esc(comPayDraft.date)}" onchange="comPayDraft.date=this.value"><input type="number" min="0" step="0.01" placeholder="Amount" value="${esc(comPayDraft.amount)}" oninput="comPayDraft.amount=this.value"><input type="text" placeholder="Note" value="${esc(comPayDraft.note)}" oninput="comPayDraft.note=this.value"><button type="button" class="pri sm" data-com-pay-save onclick="comPaySave()">Save</button><button type="button" class="sm" onclick="comPayDraft=null;render()">Cancel</button></div>`:'';
 return `<div class="card com-detail" data-com-detail><div class="shipping-customer-head"><div><h3 data-raw>${esc(r.name)}</h3><span class="mut" data-raw>${esc([r.phone,r.email].filter(Boolean).join(' · '))}</span></div><div class="sales-toolbar"><button type="button" class="sm" onclick="comEditOpen('${esc(r.id)}')">Edit</button><button type="button" class="sm" data-com-pay onclick="comPayOpen('${esc(r.id)}')">+ Payout</button></div></div>
  <div class="fin-strip"><div><small>Orders</small><b>${s.orders}</b></div><div><small>Paid · no HST</small><b>${finFmt(s.base)}</b></div><div><small>Commission</small><b>${finFmt(s.com)}</b></div><div><small>Paid out · all time</small><b>${finFmt(s.paidOut)}</b></div><div><small>To pay</small><b class="${s.toPay>0?'fin-due':''}" data-com-topay>${finFmt(s.toPay)}</b></div></div>
  ${payForm}
  <div class="sales-table-wrap"><table class="sl-table"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th class="n">Order total</th><th class="n">Paid · no HST</th><th class="n">%</th><th class="n">Commission</th>${comHst?'<th class="n">Paid with HST</th><th class="n">Commission with HST</th>':''}</tr></thead><tbody>${rows||`<tr><td colspan="${comHst?9:7}" class="empty">No payments in this period.</td></tr>`}</tbody></table></div>
  ${pays.length?`<h4>Payouts</h4><div class="sales-table-wrap"><table class="sl-table" data-com-payouts><thead><tr><th>Date</th><th class="n">Amount</th><th>Note</th><th></th></tr></thead><tbody>${pays.map(p=>`<tr><td>${esc(salesListShortDay(p.date))}</td><td class="n">${finFmt(p.amount)}</td><td data-raw>${esc(p.note)}</td><td class="sales-row-actions"><button type="button" class="sm dl" title="Delete payout" onclick="comPayDelete('${esc(p.id)}')">×</button></td></tr>`).join('')}</tbody></table></div>`:''}</div>`;
}
function comFormHTML(){
 const d=comDraft,taken=new Map((DB.referrer||[]).filter(r=>r.id!==d.id).flatMap(r=>r.customers.map(c=>[c.customerId,r.name])));
 const opts=sel=>`<option value="">Customer…</option>`+(DB.customer||[]).slice().sort((a,b)=>finCustomerName(a).localeCompare(finCustomerName(b))).map(c=>`<option value="${esc(c.id)}" ${c.id===sel?'selected':''}>${esc(finCustomerName(c))}${taken.has(c.id)?' · now '+esc(taken.get(c.id)):''}</option>`).join('');
 const rows=d.customers.map((c,i)=>`<div class="sl-row" data-com-customer="${i}"><select aria-label="Customer" onchange="comDraft.customers[${i}].customerId=this.value">${opts(c.customerId)}</select><input type="number" min="0" max="100" step="0.1" aria-label="Percent" placeholder="%" value="${esc(c.pct)}" oninput="comDraft.customers[${i}].pct=this.value"><span class="mut">%</span><button type="button" class="sm dl" onclick="comDraft.customers.splice(${i},1);render()">×</button></div>`).join('');
 return `<div class="card form com-form" data-com-form><h3>${d.id?'Edit':'New person'}</h3>
  <div class="grid"><div><label>Name *</label><input id="com_name" value="${esc(d.name)}" oninput="comDraft.name=this.value"></div><div><label>Phone</label><input value="${esc(d.phone)}" oninput="comDraft.phone=this.value"></div><div><label>Email</label><input value="${esc(d.email)}" oninput="comDraft.email=this.value"></div></div>
  <label>Customers</label>${rows}<button type="button" class="sm" data-com-add-customer onclick="comDraft.customers.push({customerId:'',pct:''});render()">+ Customer</button>
  <div><label>Note</label><input value="${esc(d.note)}" oninput="comDraft.note=this.value"></div>
  <div class="sales-toolbar"><button type="button" class="pri" data-com-save onclick="comFormSave()">Save</button><button type="button" onclick="comDraft=null;render()">Cancel</button>${d.id?`<span class="sales-toolbar-sp"></span><button type="button" class="dl" onclick="comFormDelete()">Delete</button>`:''}</div></div>`;
}
function comEditOpen(id){const r=id?comFind(id):null;comNotice='';comPayDraft=null;comDraft=r?JSON.parse(JSON.stringify(r)):{id:'',name:'',phone:'',email:'',note:'',customers:[{customerId:'',pct:''}]};render();setTimeout(()=>{const el=document.getElementById('com_name');if(el&&!id)el.focus();},0);}
function comFormSave(){const d=Object.assign({},comDraft,{customers:comDraft.customers.filter(c=>c.customerId||c.pct)});const out=comSave(d);if(out.error){comNotice=out.error;render();return;}comNotice='';comOpen=out.value.id;comDraft=null;render();}
function comFormDelete(){const d=comDraft;if(!d||!d.id||!confirm('Delete '+d.name+' and their payouts?'))return;const out=comDelete(d.id);comNotice=out.error||'';if(!out.error){comDraft=null;comOpen='';}render();}
function comPayOpen(id){comOpen=id;comDraft=null;comPayDraft={referrerId:id,date:finToday(),amount:'',note:''};render();}
function comPaySave(){const out=comPayoutAdd(comPayDraft);if(out.error){comNotice=out.error;render();return;}comNotice='';comPayDraft=null;render();}
function comPayDelete(id){if(!confirm('Delete this payout?'))return;const out=comPayoutDelete(id);comNotice=out.error||'';render();}
