/* =====================================================================
   views/finance-allocate  ·  Allocate payments
   Разнесение оплат «как в Spiel» (владелец, 06.11.2026: бухгалтер привыкла
   к двум половинам). Слева заказы и счета клиента, справа квитанции с
   остатком; фильтры Unpaid / Part paid / Fully paid у каждой половины.
   Отметить слева и справа → Allocate selected; Unallocate selected — снять
   разнесённое между отмеченными. Строка с оплатами раскрывается ▸ и
   показывает, чем оплачено, с × Unallocate у каждой связи. Над таблицами
   одной строкой — что будет (вариант D, выбран владельцем 06.11.2026).
   Деньги считают команды finance/data: finAllocate (через finApplyDeposit)
   и finUnallocate; окно ничего не считает само.
   ===================================================================== */
let finAlloc=null;
const FIN_ALLOC_SHOW=[['unpaid','Unpaid'],['part','Part paid'],['paid','Fully paid']];
function finOpenAllocate(customerId){
 if(!salesFindCustomer(customerId)||!finCanLeave())return;
 finDraft=null;finEdit=null;finAction=null;tab='finance';finTab='accounts';finAccountId=customerId;
 finAlloc={customerId,orders:[],receipts:[],open:[],showO:['unpaid','part'],showR:['unpaid','part'],ask:false,back:false};render();
}
function finCloseAllocate(){finAlloc=null;render();}
function finAllocOn(){return !!finAlloc&&finAlloc.customerId===finAccountId;}
/* Заказы клиента, у которых посчитан долг; со старого: дата счёта, иначе дата заказа. */
function finAllocOrderRows(cid){
 const rows=[];let unpriced=0;
 (DB.salesOrder||[]).filter(o=>o.customerId===cid&&finOrderCounts(o)&&finCurrency(o)==='CAD').forEach(o=>{
  const b=finOrderBalance(o);if(b.status==='incomplete'||b.status==='review'){unpriced++;return;}if(b.status==='empty')return;
  const inv=finInvoiceDate(o);
  rows.push({o,b,type:inv?'Invoice':'Order',date:inv||finLocalDate(o.createdAt),show:b.balance>0?(b.paid>0?'part':'unpaid'):'paid'});
 });
 rows.sort((x,y)=>(x.date||'').localeCompare(y.date||'')||String(x.o.businessNumber).localeCompare(String(y.o.businessNumber)));
 return {rows,unpriced};
}
function finAllocReceiptRows(cid){
 return finActiveReceipts().filter(r=>r.customerId===cid&&finCurrency(r)==='CAD').sort((x,y)=>(x.date+x.number).localeCompare(y.date+y.number)).map(r=>{
  const used=finReceiptApplied(r),left=finReceiptOnAccount(r),refunded=finRefunded(r.id);
  return {r,used,left,refunded,show:left<=0?'paid':used>0||refunded>0?'part':'unpaid'};
 });
}
/* Что сделает Allocate selected: жадно, как finAllocate — заказы по порядку,
   квитанции со старой. Только для строки над таблицами. */
function finAllocPlan(orders,receipts,cap){
 const so=orders.filter(x=>finAlloc.orders.includes(x.o.id)&&x.b.balance>0),sr=receipts.filter(x=>finAlloc.receipts.includes(x.r.id)&&x.left>0);
 const due=finMoney(so.reduce((s,x)=>s+x.b.balance,0)),free=finMoney(sr.reduce((s,x)=>s+x.left,0));
 let total=finMoney(Math.min(due,free,cap==null?Infinity:cap));if(!(total>0))total=0;
 const take=(list,v)=>{let n=0,acc=0;for(const x of list){if(acc>=total)break;acc=finMoney(acc+v(x));n++;}return list.slice(0,n);};
 return {total,due,free,orders:total?take(so,x=>x.b.balance):[],receipts:total?take(sr,x=>x.left):[],stays:finMoney(free-total),still:finMoney(due-total)};
}
/* Unallocate selected: связи между отмеченными; отмечена одна сторона —
   все связи отмеченных строк. */
function finAllocPairs(cid){
 const so=finAlloc.orders,sr=finAlloc.receipts,out=[];
 finActiveReceipts().filter(r=>r.customerId===cid&&finCurrency(r)==='CAD').forEach(r=>r.allocations.forEach(a=>{
  if(!(DB.salesOrder||[]).some(o=>o.id===a.orderId))return;
  const okO=so.includes(a.orderId),okR=sr.includes(r.id);
  if(so.length&&sr.length?okO&&okR:okO||okR)out.push({receiptId:r.id,orderId:a.orderId});
 }));
 return out;
}
function finAllocToggle(side,id){const k=side==='o'?'orders':'receipts',l=finAlloc[k];finAlloc[k]=l.includes(id)?l.filter(x=>x!==id):l.concat(id);render();}
function finAllocShow(side,key){const k=side==='o'?'showO':'showR',l=finAlloc[k];finAlloc[k]=l.includes(key)?l.filter(x=>x!==key):l.concat(key);render();}
function finAllocExpand(key){const l=finAlloc.open;finAlloc.open=l.includes(key)?l.filter(x=>x!==key):l.concat(key);render();}
function finAllocCustomer(id){if(!salesFindCustomer(id))return;finAccountId=id;finAlloc=Object.assign(finAlloc,{customerId:id,orders:[],receipts:[],open:[]});render();}
function finAllocRun(){
 const cid=finAlloc.customerId,orders=finAllocOrderRows(cid).rows,receipts=finAllocReceiptRows(cid),max=finAllocPlan(orders,receipts).total;
 let cap=null;
 if(finAlloc.ask){
  const v=window.prompt('Amount to allocate · max '+finFmt(max),max.toFixed(2));if(v===null)return;
  cap=finCents(v);if(cap==null||cap<=0){alert('Enter a positive amount.');return;}cap=cap/100;
 }
 const ids=orders.filter(x=>finAlloc.orders.includes(x.o.id)).map(x=>x.o.id),rids=finAlloc.receipts.slice();
 const out=finPersist(()=>{const done=finAllocate(cid,ids,rids,cap);finAssert(done>0,'Nothing allocated: check the selection.');return done;});
 if(!out.ok)return fail(document.getElementById('e_fin_alloc'),out.error);
 finAlloc.orders=[];finAlloc.receipts=[];render();
}
function finAllocRelease(pairs){
 if(!pairs.length)return;
 const out=finPersist(()=>{const moved=finUnallocate(finAlloc.customerId,pairs);finAssert(moved>0,'Nothing to unallocate.');return moved;});
 if(!out.ok)return fail(document.getElementById('e_fin_alloc'),out.error);
 finAlloc.orders=[];finAlloc.receipts=[];render();
}
function finAllocUnselected(){finAllocRelease(finAllocPairs(finAlloc.customerId));}
function finAllocUnlink(receiptId,orderId){finAllocRelease([{receiptId,orderId}]);}
/* Ссылки уводят из окна: заказ в Sales, квитанция — её форма. + Receipt
   возвращает сюда после сохранения (finCloseReceipt). */
function finAllocGoOrder(id){finAlloc=null;finOpenSales(id);}
function finAllocGoReceipt(id){finAlloc=null;finOpenReceipt(id);}
function finAllocNewReceipt(){const a=finAlloc;if(finNewReceipt(a.customerId)!==false)a.back=true;}

function finAllocSeg(side,on){return `<div class="fin-seg" data-fin-alloc-show="${side}">${FIN_ALLOC_SHOW.map(([k,l])=>`<button type="button" class="${on.includes(k)?'on':''}" onclick="finAllocShow('${side}','${k}')">${l}</button>`).join('')}</div>`;}
function finAllocPane(title,side,on,table,foot){
 return `<section class="fin-alloc-pane" data-fin-alloc="${side}"><div class="fin-alloc-pane-head"><b>${title}</b>${finAllocSeg(side,on)}</div>
 <div class="sales-table-wrap fin-table-wrap">${table}</div><div class="fin-alloc-pane-foot">${foot}</div></section>`;
}
function finAllocArrow(key,n){return n?`<button type="button" class="fin-alloc-arrow" aria-label="Show allocations" onclick="finAllocExpand('${esc(key)}')">${finAlloc.open.includes(key)?'▾':'▸'}</button>`:'';}
function finAllocUnlinkBtn(rid,oid){return (DB.salesOrder||[]).some(o=>o.id===oid)?`<button type="button" class="fin-link fin-alloc-unlink" onclick="finAllocUnlink('${esc(rid)}','${esc(oid)}')">× Unallocate</button>`:'';}
function finAllocNums(list,num,word){return list.length>3?list.length+' '+word:list.map(num).join(', ');}
function finAllocHTML(){
 const c=salesFindCustomer(finAlloc.customerId);if(!c){finAlloc=null;return '<p>Customer not found.</p>';}
 const cid=c.id,a=finCustomerAccount(c),x=finCustomerMoney(cid),{rows:orders,unpriced}=finAllocOrderRows(cid),receipts=finAllocReceiptRows(cid);
 const plan=finAllocPlan(orders,receipts),pairs=finAllocPairs(cid),selO=orders.filter(o=>finAlloc.orders.includes(o.o.id)),selR=receipts.filter(r=>finAlloc.receipts.includes(r.r.id));
 const links={};receipts.forEach(r=>r.r.allocations.forEach(l=>(links[l.orderId]=links[l.orderId]||[]).push({r:r.r,amount:l.amount})));
 const shownO=orders.filter(o=>finAlloc.showO.includes(o.show)),shownR=receipts.filter(r=>finAlloc.showR.includes(r.show));
 const customers=(DB.customer||[]).filter(k=>k.status!=='archived'||k.id===cid);
 const leftBody=shownO.map(o=>{const id=o.o.id,ls=links[id]||[],open=finAlloc.open.includes('o:'+id),sel=finAlloc.orders.includes(id);
  return `<tr data-order="${esc(id)}" class="${sel?'sl-row-sel':''}"><td class="sl-check"><input type="checkbox" aria-label="Select order" ${sel?'checked':''} onchange="finAllocToggle('o','${esc(id)}')"></td><td class="fin-alloc-arrow-cell">${finAllocArrow('o:'+id,ls.length)}</td><td>${o.type}</td><td>${esc(o.date||'—')}</td>
  <td><button type="button" class="fin-link" onclick="finAllocGoOrder('${esc(id)}')">${esc(o.o.businessNumber||'draft')}</button><div class="mut small">${raw(o.o.customerPo||'—')}</div></td><td class="n">${finFmt(o.b.total)}</td><td class="n">${finFmt(o.b.paid)}</td><td class="n"><b>${finFmt(o.b.balance)}</b></td></tr>`+
  (open?ls.map(l=>`<tr class="fin-alloc-link"><td></td><td></td><td colspan="2" class="mut small">↳ ${esc(l.r.date)}</td><td class="small"><button type="button" class="fin-link" onclick="finAllocGoReceipt('${esc(l.r.id)}')">${esc(l.r.number)}</button> · ${finAllocUnlinkBtn(l.r.id,id)}</td><td></td><td class="n small">${finFmt(l.amount)}</td><td></td></tr>`).join(''):'');
 }).join('')||'<tr><td colspan="8" class="mut">Nothing to show</td></tr>';
 const rightBody=shownR.map(r=>{const id=r.r.id,ls=r.r.allocations,open=finAlloc.open.includes('r:'+id),sel=finAlloc.receipts.includes(id);
  return `<tr data-receipt="${esc(id)}" class="${sel?'sl-row-sel':''}"><td class="sl-check"><input type="checkbox" aria-label="Select receipt" ${sel?'checked':''} onchange="finAllocToggle('r','${esc(id)}')"></td><td class="fin-alloc-arrow-cell">${finAllocArrow('r:'+id,ls.length)}</td><td>${esc(r.r.date)}</td>
  <td><button type="button" class="fin-link" onclick="finAllocGoReceipt('${esc(id)}')">${esc(r.r.number)}</button><div class="mut small">${esc(finMethodLabel(r.r.method))} ${raw(r.r.reference||'')}${r.refunded?' · refunded '+finFmt(r.refunded):''}</div></td><td class="n">${finFmt(r.r.amount)}</td><td class="n">${finFmt(r.used)}</td><td class="n"><b class="${r.left>0?'fin-deposit':''}">${finFmt(r.left)}</b></td></tr>`+
  (open?ls.map(l=>`<tr class="fin-alloc-link"><td></td><td></td><td colspan="2" class="mut small">↳ Order ${(DB.salesOrder||[]).some(o=>o.id===l.orderId)?`<button type="button" class="fin-link" onclick="finAllocGoOrder('${esc(l.orderId)}')">${esc(finOrderNumber(l.orderId))}</button>`:esc(finOrderNumber(l.orderId))} ${finAllocUnlinkBtn(id,l.orderId)?'· '+finAllocUnlinkBtn(id,l.orderId):''}</td><td></td><td class="n small">${finFmt(l.amount)}</td><td></td></tr>`).join(''):'');
 }).join('')||'<tr><td colspan="7" class="mut">Nothing to show</td></tr>';
 const sum=(l,v)=>finMoney(l.reduce((s,x)=>s+v(x),0));
 const say=plan.total>0?`Allocate <b>${finFmt(plan.total)}</b> from <b>${esc(finAllocNums(plan.receipts,r=>r.r.number,'receipts'))}</b> to <b>${esc(finAllocNums(plan.orders,o=>o.o.businessNumber,'orders'))}</b> · <b class="fin-deposit">${finFmt(plan.stays)}</b> stays on account${plan.still>0?` · <b>${finFmt(plan.still)}</b> still due`:''}`
  :selO.length||selR.length?'Select orders and receipts with a balance':'Select orders and receipts';
 return `<div class="fin-account-head"><div><button class="sm" onclick="finCloseAllocate()">← ${raw(finCustomerName(c))}</button><h3>Allocate payments · ${raw(finCustomerName(c))}</h3><span class="mut">${raw(c.code)} · ${esc(a.terms)}${c.onHold?' · <b class="fin-due">On hold</b>':''}</span></div>
 <div class="row"><select aria-label="Allocation customer" onchange="finAllocCustomer(this.value)">${customers.map(k=>`<option data-raw value="${esc(k.id)}" ${k.id===cid?'selected':''}>${esc(k.code||'')} · ${esc(finCustomerName(k))}</option>`).join('')}</select><button onclick="finOpenStatement('${esc(cid)}')">Statement</button><button class="pri" onclick="finAllocNewReceipt()">+ Receipt</button></div></div>
 <div class="fin-account-totals"><span>Balance <b>${finFmt(x.balance)}</b></span><span>Overdue <b class="${x.overdue>0?'fin-due':''}">${finFmt(x.overdue)}</b></span><span>On account <b class="fin-deposit">${finFmt(x.deposit)}</b></span>${a.creditLimit!=null?`<span>Credit limit <b class="${a.overLimit?'fin-due':''}">${finFmt(a.creditLimit)}</b></span>`:''}</div>
 <div class="fin-alloc-bar"><button type="button" class="pri" data-fin-allocate ${plan.total>0?'':'disabled'} onclick="finAllocRun()">Allocate selected</button><button type="button" data-fin-unallocate ${pairs.length?'':'disabled'} onclick="finAllocUnselected()">Unallocate selected</button>
  <label class="fin-alloc-ask"><input type="checkbox" ${finAlloc.ask?'checked':''} onchange="finAlloc.ask=this.checked"> Ask amount</label><span class="fin-alloc-say" id="finAllocSay">${say}</span></div>
 <div class="err" id="e_fin_alloc"></div>
 <div class="fin-alloc">${finAllocPane('Orders & invoices','o',finAlloc.showO,`${slFromTable('finAllocOrders',`<table class="sl-table fin-table"><thead><tr><th class="sl-check"></th><th class="fin-alloc-arrow-cell"></th><th>Type</th><th>Date</th><th>Order / PO</th><th class="n">Amount</th><th class="n">Allocated</th><th class="n">Outstanding</th></tr></thead><tbody>${leftBody}</tbody></table>`,{sub:'.fin-alloc-link',lead:60,acts:4,fill:'order_po_3',noun:()=>'',widths:{type_1:66,date_2:96,order_po_3:100,amount_4:88,allocated_5:88,outstanding_6:96}})}`,
   `<span>Selected <b>${selO.length}</b> · <b>${finFmt(sum(selO,o=>Math.max(0,o.b.balance)))}</b></span><span>Shown ${shownO.length} of ${orders.length}</span>${unpriced?`<span>${unpriced} not priced</span>`:''}`)}
  ${finAllocPane('Receipts & credits','r',finAlloc.showR,`${slFromTable('finAllocReceipts',`<table class="sl-table fin-table"><thead><tr><th class="sl-check"></th><th class="fin-alloc-arrow-cell"></th><th>Date</th><th>Receipt</th><th class="n">Amount</th><th class="n">Allocated</th><th class="n">Outstanding</th></tr></thead><tbody>${rightBody}</tbody></table>`,{sub:'.fin-alloc-link',lead:60,acts:4,fill:'receipt_2',noun:()=>'',widths:{date_1:96,receipt_2:120,amount_3:88,allocated_4:88,outstanding_5:96}})}`,
   `<span>Selected <b>${selR.length}</b> · <b class="fin-deposit">${finFmt(sum(selR,r=>r.left))}</b></span><span>Shown ${shownR.length} of ${receipts.length}</span>`)}</div>`;
}
