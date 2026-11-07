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
let comOpen='',comDraft=null,comSeen='',comPayDraft=null,comPeriod='year',comHst=false,comNotice='';
/* Начатая форма: новая версия ERP не перезагружает вкладку сама (erp/storage). */
(window.STORAGE_UNSAVED=window.STORAGE_UNSAVED||[]).push(()=>!!(comDraft||comPayDraft));
const COM_PERIODS=[['year','This year'],['last','Last year'],['all','All time']];
function comRange(){const y=+finToday().slice(0,4);return comPeriod==='all'?null:comPeriod==='last'?{from:(y-1)+'-01-01',to:(y-1)+'-12-31'}:{from:y+'-01-01',to:y+'-12-31'};}
function comCustomerName(id){return finCustomerName(salesFindCustomer(id));}
function viewCommissions(){return comWithScope(viewCommissionsIn);}
/* Список людей — вид Sales (этап 6, владелец 03.11.2026): Columns, фильтр и
   сортировка в заголовке, ширина и порядок мышью, итог внизу. Строка или
   галочка открывают человека ниже, как раньше. */
function comListScope(){return tab==='commissions'?'agents':'';}
function comHstHidden(k){return !comHst&&(k==='paid'||k==='comHst')&&salesListScope()==='agents';}
function comListColumns(){
 const col=(k,label,type,o)=>Object.assign({k,label,type:type||'text',def:true},o||{}),m={money:true,sum:true};
 return [col('name','Person'),col('contact','Contact'),col('customers','Customers · %'),col('orders','Orders','number',{sum:true}),col('base','Paid','number',m),col('com','Commission','number',m)]
  .concat([col('paid','Paid with HST','number',m),col('comHst','Commission with HST','number',m)])
  .concat([col('paidOut','Paid out','number',m),col('toPay','To pay','number',m)]);
}
function viewCommissionsIn(){
 const range=comRange(),list=(DB.referrer||[]).map(r=>({r,s:comSummary(r,range)})).sort((a,b)=>b.s.toPay-a.s.toPay||a.r.name.localeCompare(b.r.name));
 const infos=list.map(({r,s})=>({o:{id:r.id},r,s,memo:{name:r.name,contact:[r.phone,r.email].filter(Boolean).join(' · '),customers:r.customers.map(c=>comCustomerName(c.customerId)+' '+c.pct+'%').join(', '),
  orders:s.orders,base:s.base,com:s.com,paid:s.paid,comHst:s.comHst,paidOut:s.paidOut,toPay:s.toPay}})),rows=salesListRows(infos);
 const none='<span class="mut">—</span>',tip={orders:'Orders with payments in the period',base:'Payments without HST',paidOut:'All time',toPay:'All time: commission − paid out'};
 const cell=(i,c)=>{const v=i.memo[c.k];
  if(c.k==='name')return `<td data-com-name><b data-raw>${esc(v)}</b></td>`;
  if(c.type==='number'&&c.k!=='orders')return `<td class="n">${c.k==='toPay'?`<b class="${v>0?'fin-due':''}">${finFmt(v)}</b>`:c.k==='com'?(v?`<b>${finFmt(v)}</b>`:none):v?finFmt(v):none}</td>`;
  if(c.k==='orders')return `<td class="n">${v}</td>`;
  return `<td${c.k==='contact'?' class="mut"':''} data-raw>${v?esc(v):none}</td>`;};
 const row=i=>{const id=esc(i.r.id),on=comOpen===i.r.id;return {attrs:` data-com-row="${id}" class="fin-row${on?' oq-selected':''}" onclick="comOpen='${id}';comDraft=null;comPayDraft=null;render()"`,
  first:`<td class="sl-check" onclick="event.stopPropagation()"><input type="checkbox" aria-label="Select ${esc(i.r.name)}" ${on?'checked':''} onchange="comOpen=this.checked?'${id}':'';comDraft=null;comPayDraft=null;render()"></td>`};};
 const tools=`<div class="sales-toolbar"><div class="sl-quick com-period" data-com-period>${COM_PERIODS.map(([k,l])=>`<button type="button" class="sl-quick-pill${comPeriod===k?' on':''}" onclick="comPeriod='${k}';render()">${l}</button>`).join('')}</div><label class="com-check"><input type="checkbox" data-com-hst ${comHst?'checked':''} onchange="comHst=this.checked;render()"> With HST</label><span class="sales-toolbar-sp"></span><button type="button" class="pri" data-com-add onclick="comEditOpen('')">+ Person</button></div>`;
 salesListCwTable(comListColumns().map(c=>c.k),[68],20,{name:170,contact:150,customers:320,orders:90,base:120,com:140,paid:150,comHst:200,paidOut:120,toPay:120});
 const table=salesListTableHTML({infos,rows,cell,row,cls:'fin-list',noun:r=>r.length+(r.length===infos.length?'':' of '+infos.length)+' '+(infos.length===1?'person':'people'),empty:infos.length?'Nobody matches the filters.':'Nobody yet. + Person — who brought a customer and the percent.'})
  .replace('<table ','<table data-com-table ').replace(/(<th class="n" data-col="(orders|base|paidOut|toPay)")/g,(m,a,k)=>a+` title="${tip[k]}"`);
 return `${comNotice?`<div class="ncr-error" role="alert" data-com-error>${esc(comNotice)}</div>`:''}
  <div class="card sales-list-card sl-foot-pin">${tools}${table}</div>${salesListMenuHTML(infos)}${comDraft?comFormHTML():comOpen&&comFind(comOpen)?comDetailHTML(comFind(comOpen),range):''}`;
}
/* Таблицы человека — ширина колонок мышью (порядок постоянный, как в окнах). */
/* Таблицы человека — вид Sales (владелец 07.11.2026); attr — у обёртки. */
function comStaticTable(id,head,body,attr){return `<div${attr?' '+attr:''}>${slHtmlTable(id,head,body,{acts:head.length&&!head[head.length-1][1]?90:20})}</div>`;}
/* Заказы человека: начислено за период; «Paid out» и «Due» — за всё время
   по заказу. Выплата — галочками по заказам с долгом, сумма считается сама. */
function comDetailHTML(r,range){
 const s=comSummary(r,range),due=comDue(r),money=v=>v?finFmt(v):'<span class="mut">—</span>',open=o=>!o?'<span class="mut">Deleted order</span>':`<button type="button" class="fin-link mono" onclick="event.stopPropagation();salesLeaveDraft(()=>{tab='sales';${o.archived?'archiveOpen':'salesOrderEdit'}('${esc(o.id)}')})">${esc(o.businessNumber)}</button>${o.archived?' <span class="pill archived" data-archived>Archived</span>':''}`;
 const dueCell=id=>{const d=due.get(id);return `<td class="n">${money(d&&d.paidOut)}</td><td class="n"><b class="${d&&d.due>0?'fin-due':''}" data-com-due>${d?finFmt(d.due):'—'}</b></td>`;};
 const rows=s.rows.map(x=>`<tr data-com-order="${esc(x.number)}"><td>${open(x.o)}</td><td data-raw>${esc(comCustomerName(x.customerId))}</td><td>${esc(salesListShortDay(x.date))}</td><td class="n">${money(x.total)}</td><td class="n">${money(x.base)}</td><td class="n">${x.pct}%</td><td class="n"><b>${money(x.com)}</b></td>${comHst?`<td class="n">${money(x.paid)}</td><td class="n">${money(x.comHst)}</td>`:''}${dueCell(x.o.id)}</tr>`).join('');
 const pays=(DB.referrerPayout||[]).filter(p=>p.referrerId===r.id).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
 const owed=[...due.values()].filter(x=>x.due>0).sort((a,b)=>String(a.number).localeCompare(String(b.number)));
 /* Переплата по другим заказам вычитается из выплаты (comPayoutPlan). */
 const plan=comPayDraft?comPayoutPlan(r,comPayDraft.orderIds):{pay:[],back:[],total:0},picked=plan.pay,total=plan.total;
 const back=plan.back.length?`<div class="sales-table-wrap">${slFromTable('comPayBack',`<table class="sl-table" data-com-pay-back><thead><tr><th>Overpaid earlier · taken off</th><th>Customer</th><th class="n">Commission</th><th class="n">Paid out</th><th class="n">Due</th></tr></thead><tbody>${plan.back.map(x=>`<tr><td>${open(x.o)}</td><td data-raw>${esc(comCustomerName(x.customerId))}</td><td class="n">${finFmt(x.com)}</td><td class="n">${finFmt(x.paidOut)}</td><td class="n"><b class="fin-due">${finFmt(x.due)}</b></td></tr>`).join('')}</tbody></table>`)}</div>`:'';
 const payForm=comPayDraft?`<div class="com-pay-form" data-com-pay-form><h4>Payout · ${picked.length} of ${owed.length} orders · <span data-com-pay-total>${finFmt(Math.max(0,total))}</span></h4>
   ${owed.length?`<div class="sales-table-wrap"><table class="sl-table"><thead><tr><th></th><th>Order</th><th>Customer</th><th class="n">Commission</th><th class="n">Paid out</th><th class="n">Due</th></tr></thead><tbody>${owed.map(x=>`<tr><td class="sl-check"><input type="checkbox" data-com-pay-order="${esc(x.number)}" ${comPayDraft.orderIds.includes(x.orderId)?'checked':''} onchange="comPayPick('${esc(x.orderId)}',this.checked)"></td><td>${open(x.o)}</td><td data-raw>${esc(comCustomerName(x.customerId))}</td><td class="n">${finFmt(x.com)}</td><td class="n">${money(x.paidOut)}</td><td class="n"><b>${finFmt(x.due)}</b></td></tr>`).join('')}</tbody></table></div>`:'<p class="mut">Nothing to pay: every order is paid out.</p>'}${back}${picked.length&&total<=0?'<p class="mut" data-com-pay-covered>Nothing to pay: earlier payouts cover it.</p>':''}
   <div class="sl-row"><input type="date" aria-label="Payout date" value="${esc(comPayDraft.date)}" onchange="comPayDraft.date=this.value"><input type="text" placeholder="Note" value="${esc(comPayDraft.note)}" oninput="comPayDraft.note=this.value"><button type="button" class="pri sm" data-com-pay-save ${picked.length&&total>0?'':'disabled'} onclick="comPaySave()">Save payout</button><button type="button" class="sm" onclick="comPayDraft=null;render()">Cancel</button></div></div>`:'';
 return `<div class="card com-detail" data-com-detail><div class="shipping-customer-head"><div><h3 data-raw>${esc(r.name)}</h3><span class="mut" data-raw>${esc([r.phone,r.email].filter(Boolean).join(' · '))}</span></div><div class="sales-toolbar"><button type="button" class="sm" onclick="comEditOpen('${esc(r.id)}')">Edit</button><button type="button" class="sm" data-com-pay onclick="comPayOpen('${esc(r.id)}')">+ Payout</button></div></div>
  <div class="fin-strip"><div><small>Orders</small><b>${s.orders}</b></div><div><small>Paid · no HST</small><b>${finFmt(s.base)}</b></div><div><small>Commission</small><b>${finFmt(s.com)}</b></div><div><small>Paid out · all time</small><b>${finFmt(s.paidOut)}</b></div><div><small>To pay</small><b class="${s.toPay>0?'fin-due':''}" data-com-topay>${finFmt(s.toPay)}</b></div></div>
  ${payForm}
  ${comStaticTable('agentOrders',[['order','Order'],['customer','Customer'],['date','Date'],['total','Order total','n'],['base','Paid · no HST','n'],['pct','%','n'],['com','Commission','n']].concat(comHst?[['paid','Paid with HST','n'],['comHst','Commission with HST','n']]:[]).concat([['paidOut','<span title="All time">Paid out</span>','n'],['due','<span title="All time: commission − paid out">Due</span>','n']]),rows||`<tr><td colspan="${comHst?11:9}" class="empty">No payments in this period.</td></tr>`)}
  ${pays.length?`<h4>Payouts</h4>${comStaticTable('agentPayouts',[['date','Date'],['amount','Amount','n'],['orders','Orders'],['note','Note'],['act','']],pays.map(p=>`<tr><td>${esc(salesListShortDay(p.date))}</td><td class="n">${finFmt(p.amount)}</td><td class="mono">${esc(p.orders.map(x=>{const o=salesRecord(x.orderId)||(typeof archiveKnown==='function'?{businessNumber:(archiveKnown(x.orderId)||{}).number}:null);return (o&&o.businessNumber?o.businessNumber:'?')+' '+finFmt(x.amount);}).join(' · '))}</td><td data-raw>${esc(p.note)}</td><td class="sales-row-actions"><button type="button" class="sm dl" title="Delete payout — its orders are due again" onclick="comPayDelete('${esc(p.id)}')">×</button></td></tr>`).join(''),'data-com-payouts')}`:''}</div>`;
}
function comFormHTML(){
 const d=comDraft,taken=new Map((DB.referrer||[]).filter(r=>r.id!==d.id).flatMap(r=>r.customers.map(c=>[c.customerId,r.name])));
 const opts=sel=>`<option value="">Customer…</option>`+(DB.customer||[]).slice().sort((a,b)=>finCustomerName(a).localeCompare(finCustomerName(b))).map(c=>`<option value="${esc(c.id)}" ${c.id===sel?'selected':''}>${esc(finCustomerName(c))}${taken.has(c.id)?' · now '+esc(taken.get(c.id)):''}</option>`).join('');
 /* Другой процент у клиента, который уже был, — поле From (сегодня по
    умолчанию): прошлые оплаты остаются по прежнему проценту. */
 const saved=d.id?comFind(d.id):null,changed=c=>{const w=saved&&saved.customers.find(x=>x.customerId===c.customerId),p=comPct(c.pct);return !!w&&!!p&&p!==w.pct;};
 const rows=d.customers.map((c,i)=>`<div class="sl-row" data-com-customer="${i}"><select aria-label="Customer" onchange="comDraft.customers[${i}].customerId=this.value;render()">${opts(c.customerId)}</select><input type="number" min="0" max="100" step="0.1" aria-label="Percent" placeholder="%" value="${esc(c.pct)}" oninput="comDraft.customers[${i}].pct=this.value" onchange="render()"><span class="mut">%</span>${changed(c)?`<span class="mut">from</span><input type="date" aria-label="From" data-com-from value="${esc(c.newFrom||finToday())}" onchange="comDraft.customers[${i}].newFrom=this.value">`:c.from?`<span class="mut">from ${esc(salesListShortDay(c.from))}</span>`:''}<button type="button" class="sm dl" onclick="comDraft.customers.splice(${i},1);render()">×</button></div>`).join('');
 return `<div class="card form com-form" data-com-form><h3>${d.id?'Edit':'New person'}</h3>
  <div class="grid"><div><label>Name *</label><input id="com_name" value="${esc(d.name)}" oninput="comDraft.name=this.value"></div><div><label>Phone</label><input value="${esc(d.phone)}" oninput="comDraft.phone=this.value"></div><div><label>Email</label><input value="${esc(d.email)}" oninput="comDraft.email=this.value"></div></div>
  <label>Customers</label>${rows}<button type="button" class="sm" data-com-add-customer onclick="comDraft.customers.push({customerId:'',pct:''});render()">+ Customer</button>
  <div><label>Note</label><input value="${esc(d.note)}" oninput="comDraft.note=this.value"></div>
  <div class="sales-toolbar"><button type="button" class="pri" data-com-save onclick="comFormSave()">Save</button><button type="button" onclick="comDraft=null;render()">Cancel</button>${d.id?`<span class="sales-toolbar-sp"></span><button type="button" class="dl" onclick="comFormDelete()">Delete</button>`:''}</div></div>`;
}
function comEditOpen(id){const r=id?comFind(id):null;comNotice='';comPayDraft=null;comDraft=r?JSON.parse(JSON.stringify(r)):{id:'',name:'',phone:'',email:'',note:'',customers:[{customerId:'',pct:''}]};comSeen=r?JSON.stringify(r):'';render();setTimeout(()=>{const el=document.getElementById('com_name');if(el&&!id)el.focus();},0);}
/* Старая форма из другой вкладки не пишет поверх свежей правки и не
   возвращает удалённого (как карточка клиента, F08; владелец 20.10.2026). */
function comFormSave(){
 if(comDraft.id){const cur=comFind(comDraft.id),stale=!cur?'This person was deleted':JSON.stringify(cur)!==comSeen?'Changed elsewhere — reopen':'';if(stale){comNotice=stale;render();return;}}
 const d=Object.assign({},comDraft,{customers:comDraft.customers.filter(c=>c.customerId||c.pct)});const out=comSave(d);if(out.error){comNotice=out.error;render();return;}comNotice='';comOpen=out.value.id;comDraft=null;render();}
function comFormDelete(){const d=comDraft;if(!d||!d.id||!confirm('Delete '+d.name+' and their payouts?'))return;const out=comDelete(d.id);comNotice=out.error||'';if(!out.error){comDraft=null;comOpen='';}render();}
function comPayOpen(id){const r=comFind(id);if(!r)return;comOpen=id;comDraft=null;comNotice='';comPayDraft={referrerId:id,date:finToday(),note:'',orderIds:[...comDue(r).values()].filter(x=>x.due>0).map(x=>x.orderId)};render();}
function comPayPick(id,on){if(!comPayDraft)return;comPayDraft.orderIds=comPayDraft.orderIds.filter(x=>x!==id);if(on)comPayDraft.orderIds.push(id);render();}
function comPaySave(){const out=comPayoutAdd(comPayDraft);if(out.error){comNotice=out.error;render();return;}comNotice='';comPayDraft=null;render();}
function comPayDelete(id){if(!confirm('Delete this payout? Its orders are due again.'))return;const out=comPayoutDelete(id);comNotice=out.error||'';render();}
