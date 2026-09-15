/* =====================================================================
   erp/sales/lifecycle  ·  sales-lifecycle-1.0
   Квота и заказ: вид, статусы и даты шагов, замок строк после батча,
   переходы с предупреждениями, превращение квоты в заказ.
   IN : soDraft / DB.salesOrder, оплаты (erp/finance), DB.customer
   OUT: статус, даты, заблокированные строки, новый заказ из квоты
   Владелец, 14–15 сентября 2026. Процесс: (иногда квота) → заказ →
   верификация → батч — «тут происходит блокировка заказа, потому что стекло
   передано на резку, и если клиент захочет изменить размер, он должен
   платить: значит, новая строка или новый заказ» → готово → выдан → закрыт.
   Квоты, заказы и рекламации не смешиваются, каждый выбирает, что видеть.
   «Заказ сохранился — значит, клиент должен заплатить»: долг считается с
   сохранения. Депозит cash-клиента проверяется перед верификацией —
   сохранить можно, программа предупреждает. Выдача с долгом — предупреждение
   с подтверждением. Отдельного «In production» нет: батч и есть цех.
   ===================================================================== */

const SALES_ORDER_FLOW=['new','verified','batched','ready','done','closed'];
const SALES_ORDER_STATE_LIST=SALES_ORDER_FLOW.concat(['cancelled']);
const SALES_QUOTE_STATE_LIST=['open','sent','won'];
const SALES_NEXT_STATUS={new:'verified',verified:'batched',batched:'ready',ready:'done',done:'closed'};
const SALES_PREV_STATUS={verified:'new',batched:'verified',ready:'batched',done:'ready',closed:'done'};

function salesKindOf(o){return o&&o.kind==='quote'?'quote':'order';}
function salesIsQuote(o){return salesKindOf(o)==='quote';}
/* Старые заказы жили одним статусом «draft» — это сохранённые заказы, а не
   квоты, поэтому они становятся заказами в статусе New. */
function salesLifecycleFields(o){
 o=o&&typeof o==='object'?o:{};
 const kind=salesKindOf(o),list=kind==='quote'?SALES_QUOTE_STATE_LIST:SALES_ORDER_STATE_LIST;
 const status=list.includes(o.status)?o.status:(kind==='quote'?'open':'new');
 const src=o.statusDates&&typeof o.statusDates==='object'&&!Array.isArray(o.statusDates)?o.statusDates:{},statusDates={};
 list.forEach(k=>{if(typeof src[k]==='string'&&src[k])statusDates[k]=src[k];});
 /* Ревизии квоты (sales/quotes): группа, номер ревизии, отправка, срок цен. */
 const q=kind==='quote',rev=Math.floor(Number(o.quoteRev));
 return {kind,status,statusDates,fromQuoteId:salesRefId(o.fromQuoteId),wonOrderId:salesRefId(o.wonOrderId),
  quoteGroupId:q?salesRefId(o.quoteGroupId):'',quoteRev:q&&Number.isFinite(rev)&&rev>0&&rev<1000?rev:0,
  sentAt:q?salesString(o.sentAt):'',validUntil:q&&/^\d{4}-\d{2}-\d{2}$/.test(String(o.validUntil||''))?String(o.validUntil):'',
  /* On Hold заказа (views/sales-list-ui): пока стоит, заказ не верифицируется и не уходит в батч. */
  onHold:!q&&o.onHold===true,holdReason:!q&&o.onHold===true?salesString(o.holdReason).slice(0,200):'',holdAt:!q&&o.onHold===true?salesString(o.holdAt):''};
}
function nextSalesQuoteNumber(){
 let max=10000;
 (DB.salesOrder||[]).forEach(o=>{const m=/^Q-(\d+)(?:-R\d+)?$/.exec(String(o&&o.businessNumber||''));if(m)max=Math.max(max,+m[1]);});
 return 'Q-'+(max+1);
}
function salesStatusLabel(o,status){
 status=status||(o&&o.status);
 if(salesIsQuote(o))return status==='won'?'Won':status==='sent'?'Sent':'Not sent';
 if(status==='done')return o&&o.delivery==='delivery'?'Delivered':'Picked up';
 return ({new:'New',verified:'Verified',batched:'Batched',ready:'Ready',closed:'Closed',cancelled:'Cancelled'})[status]||'New';
}
function salesStatusPill(o){
 if(salesIsQuote(o)){
  if(o.status==='sent')return `<span class="pill st-sent">Sent ${esc(salesShortDate(o.sentAt))}</span>`;
  if(o.status!=='won')return '<span class="pill st-open">Not sent</span>';
  const won=(DB.salesOrder||[]).find(x=>x.id===o.wonOrderId);
  return `<span class="pill st-won">Won${won&&won.businessNumber?' → '+esc(won.businessNumber):''}</span>`;
 }
 return `<span class="pill st-${esc(o.status||'new')}">${esc(salesStatusLabel(o))}${o.status==='batched'?' 🔒':''}</span>`;
}
function salesShortDate(iso){return typeof docDate==='function'?docDate(iso):String(iso||'').slice(0,10);}
function salesOrderTitle(o){
 const q=salesIsQuote(o),src=q&&o===soDraft?salesQuoteCopySource():null;
 if(src)return 'Quote '+src.businessNumber;
 return o.businessNumber?(q?'Quote ':'Sales Order ')+o.businessNumber:(q?'New Quote · Auto Number':'New Sales Order · Auto Number');
}

/* ------------------------------ Замок -------------------------------- */
/* Строка, ушедшая в батч, несёт дату батча. Пока она стоит, у строки нельзя
   менять размер, количество, Makeup, фигуру и кромку, и строку нельзя
   удалить. Цены остаются правкой продавца. Новые строки заказа идут без
   даты — это «added after batch», их отправляют в батч отдельной кнопкой. */
function salesLineLocked(line){return !!(line&&line.batchedAt);}
function salesMakeupLocked(order,makeupId){return !!(order&&(order.lines||[]).some(l=>l.makeupId===makeupId&&salesLineLocked(l)));}
function salesOrderReadOnly(o){return !!o&&(salesIsQuote(o)?!!salesQuoteWonMember(o):o.status==='closed'||o.status==='cancelled');}
function salesLockedLineGuard(line){
 if(!salesLineLocked(line))return false;
 alert('This line went to batch on '+salesShortDate(line.batchedAt)+'. The glass is at cutting: size, makeup, shape and edgework cannot change. Add a new line or open a new order.');
 return true;
}
function salesLineRowAttrs(line){return salesLineLocked(line)?" class='line-locked' inert":'';}
function salesLineBadge(line){
 if(!soDraft||salesIsQuote(soDraft))return '';
 if(salesLineLocked(line))return ` <span class="line-lock" title="Batched ${esc(salesShortDate(line.batchedAt))}">🔒</span>`;
 return ['batched','ready','done'].includes(soDraft.status)?' <span class="pill st-added">added after batch</span>':'';
}
/* Фигура строки хранится в DB.shapeDef и сохраняется редактором сразу, поэтому
   её защищают проверки на входе. Всё, что живёт в черновике заказа, ловит
   сравнение при сохранении: изменённую строку из батча записать нельзя,
   каким бы путём её ни поменяли. Цены в сравнение не входят. */
function salesStripPrices(x){
 if(Array.isArray(x))return x.map(salesStripPrices);
 if(x&&typeof x==='object'){const o={};Object.keys(x).forEach(k=>{if(k!=='priceOverride')o[k]=salesStripPrices(x[k]);});return o;}
 return x;
}
function salesLockedLineSnapshot(order,line){
 const m=salesMakeupById(order,line.makeupId);
 return JSON.stringify({w:line.width16,h:line.height16,q:line.qty,m:m?salesStripPrices({unitType:m.unitType,panes:m.panes,cavities:m.cavities}):null,
  shape:line.shapeRef&&line.shapeRef.id||'',lites:line.liteShapes||{},set:line.serviceSetId||'',overrides:line.serviceOverrides||null,sides:line.sideMap||null});
}
function salesLockViolations(draft,saved){
 const out=[];if(!saved)return out;
 (saved.lines||[]).forEach((old,i)=>{
  if(!salesLineLocked(old))return;
  const at=(draft.lines||[]).findIndex(l=>l.id===old.id),now=draft.lines[at],name=n=>'line '+n+(old.mark?' ('+old.mark+')':'');
  if(!now){out.push(name(i+1)+' was removed');return;}
  now.batchedAt=old.batchedAt;
  if(salesLockedLineSnapshot(draft,now)!==salesLockedLineSnapshot(saved,old))out.push(name(at+1)+' changed');
 });
 return out;
}
function salesDeleteBlocked(o){
 if(!o)return false;
 if(salesIsQuote(o)&&salesQuoteWonMember(o)){alert('This quote became an order and is kept for the win history.');return true;}
 if(!salesIsQuote(o)&&['batched','ready','done','closed'].includes(o.status)){alert('Order '+(o.businessNumber||'')+' is already in production. Cancel it instead of deleting.');return true;}
 return false;
}

/* ------------------------------ Окно --------------------------------- */
let salesDialog=null;
function salesDialogOpen(d){salesDialog=d;render();}
function salesDialogChoose(i){const d=salesDialog;salesDialog=null;const b=d&&d.buttons[i];if(b&&typeof b.run==='function')b.run(d);else render();}
function salesDialogPick(id){if(!salesDialog)return;salesDialog.choice=id;render();}
function salesDialogHTML(){
 const d=salesDialog;if(!d)return '';
 return `<div class="sales-service-modal-back sales-dialog-back" onclick="if(event.target===this)salesDialogChoose(0)"><div class="sales-service-modal sales-dialog" role="dialog" aria-modal="true" aria-label="${esc(d.title)}">
  <div class="sales-service-modal-head"><h3>${esc(d.title)}</h3><button type="button" aria-label="Close" onclick="salesDialogChoose(0)">×</button></div>
  <div class="sales-dialog-body">${d.sub?`<p class="mut">${esc(d.sub)}</p>`:''}${d.rows&&d.rows.length?`<div class="sales-dialog-rows">${d.rows.map(r=>`<span>${esc(r[0])}</span><b class="${r[2]?'sales-dialog-red':''}">${esc(r[1])}</b>`).join('')}</div>`:''}${d.choices&&d.choices.length?`<div class="sales-dialog-choices">${d.choices.map(c=>`<label class="sales-dialog-choice${d.choice===c.id?' on':''}"><input type="radio" name="salesDialogChoice" data-dialog-choice="${esc(c.id)}" ${d.choice===c.id?'checked':''} onchange="salesDialogPick('${esc(c.id)}')"><span><b>${esc(c.label)}</b> · ${esc(c.detail)}</span><b>${esc(c.value)}</b></label>`).join('')}</div>`:''}${d.note?`<div class="sales-dialog-note">${esc(d.note)}</div>`:''}</div>
  <div class="sales-dialog-actions">${d.buttons.map((b,i)=>`<button type="button" class="${b.kind||''}" data-dialog-button="${i}" onclick="salesDialogChoose(${i})">${esc(b.label)}</button>`).join('')}</div></div></div>`;
}

/* ---------------------------- Переходы -------------------------------- */
function salesNextActionLabel(o){
 return ({new:'Verify order',verified:'Send to batch',batched:'Mark as ready',ready:o.delivery==='delivery'?'Mark as delivered':'Mark as picked up',done:'Close order'})[o.status]||'';
}
function salesTransitionChecks(o,next){
 const out=[],c=salesFindCustomer(o.customerId),num=o.businessNumber||'(new)',b=finOrderBalance(o),name=c?(c.displayName||c.legalName):'No customer';
 const terms=paymentTermsFrom(c||{}),sub=name+' · '+paymentTermsLabel(terms);
 if(next==='verified'||next==='batched'){
  if(c&&c.onHold)out.push({title:name+' is On Hold',sub,rows:c.holdReason?[['Hold reason',c.holdReason]]:[],note:'The customer is on hold. Check with accounting before continuing.',anyway:'Continue anyway'});
  if(b.total==null)out.push({title:'Pricing is not complete',sub,rows:[],note:'Some lines have no price, so the deposit and the credit limit cannot be checked.',anyway:'Continue anyway'});
  else if(terms.paymentMode==='cash'){
   const pct=paymentDepositPercent(terms),dep=salesMoney(b.total*pct/100);
   if(pct>0&&b.paid<dep)out.push({title:'Deposit not received — order '+num,sub,rows:[['Order total',finFmt(b.total)],['Deposit required · '+pct+'%',finFmt(dep)],['Received',finFmt(b.paid),true]],
    note:next==='verified'?'The order can be verified and saved, but do not send the glass to cutting until the deposit is paid.':'The deposit is not paid. The glass should not go to cutting yet.',
    anyway:next==='verified'?'Verify anyway':'Send anyway',pay:salesMoney(dep-b.paid)});
  }else if(next==='verified'&&c){
   const acc=finCustomerAccount(c),due=salesMoney(acc.balanceDue+(salesOrderIsSaved(o)?0:Math.max(0,b.balance||0)));
   if(acc.creditLimit!=null&&due>acc.creditLimit)out.push({title:name+' is over the credit limit',sub,rows:[['Credit limit',finFmt(acc.creditLimit)],['Balance due with this order',finFmt(due),true],['Over by',finFmt(salesMoney(due-acc.creditLimit)),true]],note:'Verifying keeps this order in the customer balance above the limit.',anyway:'Verify anyway'});
  }
 }
 if((next==='done'||next==='closed')&&b.balance!=null&&b.balance>0){
  out.push({title:'Order '+num+' has a balance due',sub,rows:[['Order total',finFmt(b.total)],['Receipt total',finFmt(b.paid)],['Balance due',finFmt(b.balance),true]],
   note:next==='done'?'Take the payment before handing over the glass.':'The order still has a balance due.',
   anyway:next==='closed'?'Close anyway':o.delivery==='delivery'?'Deliver anyway':'Pick up anyway',pay:next==='done'?b.balance:null});
 }
 return out;
}
function salesRunChecks(checks,done){
 if(!checks.length){done();return;}
 const c=checks[0],rest=()=>salesRunChecks(checks.slice(1),done),buttons=[{label:'Back'}];
 if(c.pay!=null&&c.pay>0)buttons.push({label:c.anyway,run:rest},{label:'Take payment',kind:'pri',run:()=>salesTakePayment(c.pay)});
 else buttons.push({label:c.anyway,kind:'pri',run:rest});
 salesDialogOpen(Object.assign({},c,{buttons}));
}
/* Статус меняется вместе с сохранением заказа: верификация и батч — это и есть
   «заказ проверен и записан». Не прошло сохранение — статус возвращается. */
function salesSetStatus(next,opts){
 opts=opts||{};
 const keep={status:soDraft.status,dates:JSON.parse(JSON.stringify(soDraft.statusDates||{})),batched:soDraft.lines.map(l=>l.batchedAt)},now=new Date().toISOString();
 soDraft.statusDates=Object.assign({},soDraft.statusDates||{});
 if(opts.back)delete soDraft.statusDates[keep.status];else soDraft.statusDates[next]=now;
 soDraft.status=next;
 if(next==='batched'&&!opts.back)soDraft.lines.forEach(l=>{if(!l.batchedAt)l.batchedAt=now;});
 if(opts.unlock)soDraft.lines.forEach(l=>{l.batchedAt='';});
 if(salesOrderSave({unlock:!!opts.unlock}))return true;
 soDraft.status=keep.status;soDraft.statusDates=keep.dates;soDraft.lines.forEach((l,i)=>{l.batchedAt=keep.batched[i]||'';});
 return false;
}
function salesAdvanceStatus(){
 if(!soDraft||salesIsQuote(soDraft))return;
 const next=SALES_NEXT_STATUS[soDraft.status];if(!next)return;
 if(soDraft.onHold&&(next==='verified'||next==='batched')){salesHoldBlocked();return;}
 salesRunChecks(salesTransitionChecks(soDraft,next),()=>salesSetStatus(next));
}
function salesStepBack(){
 if(!soDraft||salesIsQuote(soDraft))return;
 const prev=SALES_PREV_STATUS[soDraft.status];if(!prev)return;
 const unlock=soDraft.status==='batched';
 if(!confirm(unlock?'Move the order back to Verified? The glass may already be cut. All lines will be unlocked.':'Move the order back to '+salesStatusLabel(soDraft,prev)+'?'))return;
 salesSetStatus(prev,{back:true,unlock});
}
function salesBatchNewLines(){
 if(!soDraft)return;
 const fresh=(soDraft.lines||[]).filter(l=>!l.batchedAt);if(!fresh.length)return;
 if(soDraft.onHold){salesHoldBlocked();return;}
 salesRunChecks(salesTransitionChecks(soDraft,'batched'),()=>{const now=new Date().toISOString();fresh.forEach(l=>{l.batchedAt=now;});if(!salesOrderSave())fresh.forEach(l=>{l.batchedAt='';});});
}
function salesCancelOrder(){
 if(!soDraft||salesIsQuote(soDraft)||soDraft.status==='cancelled')return;
 const paid=salesOrderIsSaved(soDraft)?finOrderPaid(soDraft.id).paid:0;
 if(!confirm(paid>0?'Cancel order '+(soDraft.businessNumber||'')+'? Its receipts of $'+paid.toFixed(2)+' go back to the customer deposit on account.':'Cancel order '+(soDraft.businessNumber||'')+'?'))return;
 if(salesSetStatus('cancelled')){if(finReleaseOrder(soDraft.id)>0)touch();render();}
}
function salesRestoreOrder(){
 if(!soDraft||soDraft.status!=='cancelled')return;
 if(!confirm('Restore this order as New?'))return;
 salesSetStatus('new',{back:true});
}
/* «Take payment» из предупреждения: заказ сохраняется, и на экране Finance
   открывается новая оплата на этот заказ с суммой, которой не хватает. */
function salesTakePayment(amount){
 if(!soDraft)return;
 if(!salesOrderIsSaved(soDraft)||salesDraftHasWork()){if(!salesOrderSave())return;}
 const id=soDraft.id,number=soDraft.businessNumber||'',saved=DB.salesOrder.find(o=>o.id===id),b=saved?finOrderBalance(saved):null;
 tab='finance';subtab=null;finNewReceipt(soDraft.customerId);
 if(b&&b.balance>0){const v=Math.min(salesMoney(+amount||b.balance),b.balance).toFixed(2);finDraft.amount=v;finDraft.apply[id]=v;}
 finDraft.note='Order '+number;
 render();
}
function salesNewOrderForCustomer(customerId){
 if(salesDraftHasWork()&&!confirm('Leave this order without saving the changes?'))return;
 salesOrderNew('order');
 if(customerId){salesApplyCustomerDefaults(customerId);render();}
}

/* ----------------------- Квота → заказ -------------------------------- */
/* Заказ из квоты — отдельная запись со своим номером. Фигуры строк
   копируются: у заказа и у квоты они свои, правка фигуры заказа не должна
   переписать историю квоты. */
function salesConvertQuote(){
 if(!soDraft||!salesIsQuote(soDraft)||salesQuoteWonMember(soDraft))return;
 const cur=salesQuoteSettle();if(!cur)return;
 const rec=DB.salesOrder.find(o=>o.id===cur);if(!rec)return;
 const members=salesQuoteMembers(rec);
 if(members.length<2){salesConvertQuoteRecord(rec.id);return;}
 /* Ревизий несколько — клиент выбрал одну из них (владелец, 15 сентября 2026). */
 const c=salesFindCustomer(rec.customerId);
 salesDialogOpen({title:'Convert quote '+salesQuoteBaseNumber(rec)+' to an order',sub:(c?(c.displayName||c.legalName)+' · ':'')+'which revision did the customer choose?',rows:[],
  choices:members.map(m=>({id:m.id,label:m.businessNumber,detail:salesQuoteRevState(m),value:salesQuoteTotalText(m)})),choice:rec.id,
  note:'The order is made from the chosen revision. The quote keeps every revision.',
  buttons:[{label:'Back'},{label:'Convert to order',kind:'pri',run:d=>salesConvertQuoteRecord(d&&d.choice||rec.id)}]});
}
function salesConvertQuoteRecord(id){
 const quote=DB.salesOrder.find(o=>o.id===id);if(!quote||!salesIsQuote(quote)||salesQuoteWonMember(quote))return;
 const now=new Date().toISOString();
 const copy=salesCopySalesRecord(quote,{kind:'order',status:'new',statusDates:{new:now},businessNumber:nextSalesOrderNumber(),fromQuoteId:quote.id,wonOrderId:'',quoteGroupId:'',quoteRev:0,sentAt:'',validUntil:'',createdAt:now,updatedAt:now});
 DB.salesOrder.push(normalizeSalesOrder(copy));
 quote.status='won';quote.wonOrderId=copy.id;quote.statusDates=Object.assign({},quote.statusDates,{won:now});quote.updatedAt=now;
 normalizeSalesData();touch();
 salesOrderEdit(copy.id);
}

/* ------------------------ Шапка редактора ----------------------------- */
function salesHeaderActions(o){
 const parts=['<button onclick="salesOrderClose()">Close</button>'];
 if(!salesOrderReadOnly(o))parts.push(`<button class="pri" onclick="salesOrderSave()">${salesIsQuote(o)&&soQuoteCopyOf?'Save as '+salesQuoteNextRevName():soEdit==='new'?'Save':'Update'}</button>`);
 parts.push('<button onclick="docOpen()">Documents</button>');
 if(salesIsQuote(o)){if(!salesQuoteWonMember(o))parts.push('<button class="go" data-convert-quote onclick="salesConvertQuote()">Convert to order</button>');}
 else{const label=salesNextActionLabel(o);if(label)parts.push(`<button class="go" data-next-status onclick="salesAdvanceStatus()">${label}</button>`);}
 return parts.join('');
}
function salesStatusStepper(o){
 if(salesIsQuote(o)){
  const shown=salesQuoteShown(o),w=salesQuoteWonMember(shown),bar=salesQuoteRevisionBar(shown);
  if(!w)return bar+salesQuoteSentBanner();
  const won=(DB.salesOrder||[]).find(x=>x.id===w.wonOrderId);
  return bar+`<div class="sales-quote-note">${raw(w.businessNumber)} became order ${won?`<button class="sm" onclick="salesOrderEdit('${esc(won.id)}')">${raw(won.businessNumber)}</button>`:''} on ${esc(salesShortDate(w.statusDates.won))}. The quote is kept read-only for the win history.</div>`;
 }
 const saved=salesOrderIsSaved(o);
 if(o.status==='cancelled')return `<div class="sales-status-row"><span class="pill st-cancelled">Cancelled ${esc(salesShortDate(o.statusDates.cancelled))}</span><span class="sp"></span>${saved?'<button class="sm" onclick="salesRestoreOrder()">Restore as New</button>':''}</div>`;
 const at=SALES_ORDER_FLOW.indexOf(o.status);
 const steps=SALES_ORDER_FLOW.map((s,i)=>`<div class="sales-step ${i<at?'done':i===at?'cur':''}" data-step="${s}"><i></i><b>${esc(salesStatusLabel(o,s))}${s==='batched'?' 🔒':''}</b><small>${o.statusDates&&o.statusDates[s]?esc(salesShortDate(o.statusDates[s])):'&nbsp;'}</small></div>`).join('');
 const prev=SALES_PREV_STATUS[o.status];
 return `<div class="sales-status-row"><div class="sales-steps">${steps}</div><div class="sales-status-tools">${prev&&saved?`<button class="sm" onclick="salesStepBack()">← Back to ${esc(salesStatusLabel(o,prev))}</button>`:''}${saved&&o.status!=='closed'?'<button class="sm dl" onclick="salesCancelOrder()">Cancel order</button>':''}</div></div>`;
}
function salesLockBar(o){
 if(salesIsQuote(o)||!['batched','ready','done'].includes(o.status))return '';
 const locked=o.lines.filter(salesLineLocked),fresh=o.lines.filter(l=>!salesLineLocked(l));
 const first=locked.map(l=>l.batchedAt).sort()[0];
 return `<div class="sales-lockbar">${locked.length?`<span>🔒 <b>Batched ${esc(salesShortDate(first))} — the glass is at cutting.</b> Size, makeup, shape and edgework of batched lines cannot change. A change is a new charged line or a new order.</span>`:''}<span class="sp"></span>${fresh.length&&o.status!=='done'?`<button class="sm" data-batch-new onclick="salesBatchNewLines()">Send ${fresh.length} new line${fresh.length===1?'':'s'} to batch</button>`:''}<button class="sm" onclick="salesOrderAddLine(null,true)">+ Line (charged)</button><button class="sm" onclick="salesNewOrderForCustomer('${esc(o.customerId)}')">New order for this customer</button></div>`;
}

/* --------------------------- Список Sales ------------------------------ */
/* Галочки Show: каждый смотрит своё — только заказы, заказы и квоты. Выбор
   запоминается в этом браузере. Рекламации добавятся третьей галочкой. */
function salesLoadShow(){
 try{const v=JSON.parse(localStorage.getItem('glass_erp_sales_show')||'null');if(v&&typeof v==='object'&&(v.orders||v.quotes))return {orders:!!v.orders,quotes:!!v.quotes};}catch(e){}
 return {orders:true,quotes:false};
}
let salesShow=salesLoadShow(),salesStatusFilter='';
function salesToggleShow(key){
 const next=Object.assign({},salesShow,{[key]:!salesShow[key]});
 if(!next.orders&&!next.quotes)return;
 salesShow=next;salesStatusFilter='';
 try{localStorage.setItem('glass_erp_sales_show',JSON.stringify(salesShow));}catch(e){}
 render();
}
function salesSetStatusFilter(key){salesStatusFilter=salesStatusFilter===key?'':key;render();}
function salesListVisible(){
 /* Строки поиска нет (владелец, 15 сентября 2026): ищут фильтрами колонок. */
 return (DB.salesOrder||[]).filter(o=>salesShow[salesIsQuote(o)?'quotes':'orders']).filter(o=>!salesIsQuote(o)||salesQuoteRepresentative(o).id===o.id);
}
function salesStatusChips(rows){
 const count=(kind,s)=>rows.filter(o=>salesKindOf(o)===kind&&salesListStatus(o)===s).length,chips=[];
 if(salesShow.orders)SALES_ORDER_STATE_LIST.forEach(s=>chips.push({key:'order:'+s,label:s==='done'?'Picked up / Delivered':salesStatusLabel({kind:'order'},s),n:count('order',s)}));
 if(salesShow.quotes)SALES_QUOTE_STATE_LIST.forEach(s=>chips.push({key:'quote:'+s,label:salesStatusLabel({kind:'quote'},s),n:count('quote',s)}));
 return `<div class="sales-status-chips"><button type="button" class="${salesStatusFilter?'':'on'}" onclick="salesSetStatusFilter('')">All <b>${rows.length}</b></button>${chips.map(c=>`<button type="button" data-status-chip="${c.key}" class="${salesStatusFilter===c.key?'on':''}" onclick="salesSetStatusFilter('${c.key}')">${esc(c.label)} <b>${c.n}</b></button>`).join('')}</div>`;
}
