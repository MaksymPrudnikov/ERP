/* =====================================================================
   erp/sales/lifecycle  ·  sales-lifecycle-1.1
   Квота и заказ: вид, статусы и даты шагов, замок строк после батча,
   переходы из очереди по ID с предупреждениями, общий батч, выдача, квоты.
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
 const batchNo=!q?salesBatchNumber(o.batchNo):'',batchHistory=q?[]:[...new Set((Array.isArray(o.batchHistory)?o.batchHistory:[]).map(salesBatchNumber).filter(Boolean).concat(batchNo?[batchNo]:[]))];
 const unbatchHistory=!q&&Array.isArray(o.unbatchHistory)?o.unbatchHistory.filter(x=>x&&typeof x==='object'&&typeof x.at==='string').map(x=>({at:x.at,batchNumbers:[...new Set((Array.isArray(x.batchNumbers)?x.batchNumbers:[]).map(salesBatchNumber).filter(Boolean))],lineIds:[...new Set((Array.isArray(x.lineIds)?x.lineIds:[]).map(salesRefId).filter(Boolean))]})):[];
 return {kind,status,statusDates,batchNo,batchHistory,unbatchHistory,fulfilledVia:!q&&['done','closed'].includes(status)?(['pickup','delivery'].includes(o.fulfilledVia)?o.fulfilledVia:o.delivery==='delivery'?'delivery':'pickup'):'',fromQuoteId:salesRefId(o.fromQuoteId),wonOrderId:salesRefId(o.wonOrderId),
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
 if(status==='done')return o&&(o.fulfilledVia||o.delivery)==='delivery'?'Delivered':'Picked up';
 return ({new:'New',verified:'Verified',batched:'Batched',ready:'Ready',closed:'Closed',cancelled:'Cancelled'})[status]||'New';
}
function salesStatusPill(o){
 if(salesIsQuote(o)){
  if(o.status==='sent')return `<span class="pill st-sent">Sent ${esc(salesShortDate(o.sentAt))}</span>`;
  if(o.status!=='won')return '<span class="pill st-open">Not sent</span>';
  const won=(DB.salesOrder||[]).find(x=>x.id===o.wonOrderId);
  return `<span class="pill st-won">Won${won&&won.businessNumber?' → '+esc(won.businessNumber):''}</span>`;
 }
 return `<span class="pill st-${esc(o.status||'new')}">${esc(salesStatusLabel(o))}${o.status==='batched'?' 🔒'+(salesUnbatchedLines(o).length?(p=>' · '+p.assigned+'/'+p.total+' pcs')(glassBatchProgress(o)):''):''}</span>`;
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
   даты — это «added after batch», их отправляют в батч из очереди Optimization. */
function salesLineLocked(line){return !!(line&&(line.batchedAt||line.cutStartedAt));}
function salesMakeupLocked(order,makeupId){return !!(order&&(order.lines||[]).some(l=>l.makeupId===makeupId&&salesLineLocked(l)));}
function salesOrderReadOnly(o){return !!o&&(salesIsQuote(o)?!!salesQuoteWonMember(o):o.status==='closed'||o.status==='cancelled');}
function salesLockedLineGuard(line){
 if(!salesLineLocked(line))return false;
 alert('Line is batched and locked. Unbatch it in Optimization to edit.');
 return true;
}
function salesLineRowAttrs(line){return salesLineLocked(line)?" class='line-locked' inert":(line.onHold?" class='sales-line-on-hold'":'')+salesLineHoldRowAttrs(line);}
function salesLineBadge(line){
 if(!soDraft||salesIsQuote(soDraft))return '';
 if(salesLineLocked(line))return ` <span class="line-lock" title="Batched ${esc(salesShortDate(line.batchedAt))}${line.batchNo?' · '+esc(line.batchNo):''}">🔒</span>`;
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
  now.batchManaged=old.batchManaged;now.batchedAt=old.batchedAt;now.batchNo=old.batchNo||'';now.cutStartedAt=old.cutStartedAt||'';
  if(salesLockedLineSnapshot(draft,now)!==salesLockedLineSnapshot(saved,old))out.push(name(at+1)+' changed');
 });
 return out;
}
function salesDeleteBlocked(o){
 if(!o)return false;
 if(salesIsQuote(o)&&salesQuoteWonMember(o)){alert('This quote became an order and is kept for the win history.');return true;}
 const ncr=(DB.ncr||[]).find(n=>n.orderId===o.id||n.remakeOrderId===o.id);
 if(!salesIsQuote(o)&&ncr){alert('Order '+(o.businessNumber||'')+' is linked to '+ncr.number+'. Cancel it instead of deleting.');return true;}
 if(!salesIsQuote(o)&&(['batched','ready','done','closed'].includes(o.status)||(o.lines||[]).some(salesLineLocked))){alert('Order '+(o.businessNumber||'')+' is already in production. Cancel it instead of deleting.');return true;}
 return false;
}

/* ------------------------------ Окно --------------------------------- */
let salesDialog=null;
function salesDialogOpen(d){salesDialog=d;render();}
function salesDialogChoose(i){const d=salesDialog,b=d&&d.buttons[i];if(b&&b.requiresConfirmation&&(!d.confirmed||!d.checkedLines.length))return;salesDialog=null;if(b&&typeof b.run==='function')b.run(d);else render();}
function salesDialogToggleLine(id,on){const d=salesDialog;if(!d||!d.lineChoices||!d.lineChoices.some(l=>l.id===id&&!l.disabled))return;d.checkedLines=on?[...new Set(d.checkedLines.concat(id))]:d.checkedLines.filter(x=>x!==id);d.confirmed=false;render();}
function salesDialogConfirm(on){if(!salesDialog)return;salesDialog.confirmed=!!on;render();}
function salesDialogPick(id){if(!salesDialog)return;salesDialog.choice=id;render();}
function salesDialogHTML(){
 const d=salesDialog;if(!d)return '';
 return `<div class="sales-service-modal-back sales-dialog-back" onclick="if(event.target===this)salesDialogChoose(0)"><div class="sales-service-modal sales-dialog" role="dialog" aria-modal="true" aria-label="${esc(d.title)}">
  <div class="sales-service-modal-head"><h3>${esc(d.title)}</h3><button type="button" aria-label="Close" onclick="salesDialogChoose(0)">×</button></div>
  <div class="sales-dialog-body">${d.sub?`<p class="mut">${esc(d.sub)}</p>`:''}${d.rows&&d.rows.length?`<div class="sales-dialog-rows">${d.rows.map(r=>`<span>${esc(r[0])}</span><b class="${r[2]?'sales-dialog-red':''}">${esc(r[1])}</b>`).join('')}</div>`:''}${d.choices&&d.choices.length?`<div class="sales-dialog-choices">${d.choices.map(c=>`<label class="sales-dialog-choice${d.choice===c.id?' on':''}"><input type="radio" name="salesDialogChoice" data-dialog-choice="${esc(c.id)}" ${d.choice===c.id?'checked':''} onchange="salesDialogPick('${esc(c.id)}')"><span><b>${esc(c.label)}</b> · ${esc(c.detail)}</span><b>${esc(c.value)}</b></label>`).join('')}</div>`:''}${d.lineChoices?`<div class="sales-dialog-lines">${d.lineChoices.map(l=>`<label><input type="checkbox" data-unbatch-line="${esc(l.id)}" ${d.checkedLines.includes(l.id)?'checked':''} ${l.disabled?'disabled':''} onchange="salesDialogToggleLine('${esc(l.id)}',this.checked)"><span><b>${esc(l.label)}</b><small>${esc(l.detail)}${l.disabled?' · Cutting started — locked':''}</small></span></label>`).join('')}</div><label class="sales-unbatch-confirm"><input type="checkbox" data-unbatch-confirm ${d.confirmed?'checked':''} onchange="salesDialogConfirm(this.checked)"> ${esc(d.confirmLabel||'Cutting not started')}</label>`:''}${d.note?`<div class="sales-dialog-note">${esc(d.note)}</div>`:''}</div>
  <div class="sales-dialog-actions">${d.buttons.map((b,i)=>`<button type="button" class="${b.kind||''}" data-dialog-button="${i}" ${b.requiresConfirmation&&(!d.confirmed||!d.checkedLines.length)?'disabled':''} onclick="salesDialogChoose(${i})">${esc(b.label)}</button>`).join('')}</div></div></div>`;
}

/* ---------------------------- Переходы -------------------------------- */
function salesNextActionLabel(o){
 return ({new:'Verify order',verified:'Send to batch',batched:'Mark as ready',ready:o.delivery==='delivery'?'Mark as delivered':'Mark as picked up',done:'Close order'})[o.status]||'';
}
function salesTransitionChecks(o,next){
 const out=[],c=salesFindCustomer(o.customerId),num=o.businessNumber||'(new)',b=finOrderBalance(o),name=c?(c.displayName||c.legalName):'No customer';
 const terms=paymentTermsFrom(c||{}),sub=name+' · '+paymentTermsLabel(terms);
 if(next==='verified'||next==='batched'){
  if(c&&c.onHold)out.push({title:name+' is On Hold',sub,rows:c.holdReason?[['Hold reason',c.holdReason]]:[],note:'Check with accounting.',anyway:'Continue anyway'});
  if(b.total==null)out.push({title:'Pricing is not complete',sub,rows:[],note:'Some lines have no price.',anyway:'Continue anyway'});
  else if(terms.paymentMode==='cash'){
   const pct=paymentDepositPercent(terms),dep=salesMoney(b.total*pct/100);
   if(pct>0&&b.paid<dep)out.push({title:'Deposit not received — order '+num,sub,rows:[['Order total',finFmt(b.total)],['Deposit required · '+pct+'%',finFmt(dep)],['Received',finFmt(b.paid),true]],
    note:next==='verified'?'Cut only after the deposit.':'Deposit not paid.',
    anyway:next==='verified'?'Verify anyway':'Send anyway',pay:salesMoney(dep-b.paid)});
  }else if(next==='verified'&&c){
   const acc=finCustomerAccount(c),due=salesMoney(acc.balanceDue+(salesOrderIsSaved(o)?0:Math.max(0,b.balance||0)));
   if(acc.creditLimit!=null&&due>acc.creditLimit)out.push({title:name+' is over the credit limit',sub,rows:[['Credit limit',finFmt(acc.creditLimit)],['Balance due with this order',finFmt(due),true],['Over by',finFmt(salesMoney(due-acc.creditLimit)),true]],note:'',anyway:'Verify anyway'});
  }
 }
 if((next==='done'||next==='closed')&&b.balance!=null&&b.balance>0){
  out.push({title:'Order '+num+' has a balance due',sub,rows:[['Order total',finFmt(b.total)],['Receipt total',finFmt(b.paid)],['Balance due',finFmt(b.balance),true]],
   note:next==='done'?'Take payment first.':'Balance due.',
   anyway:next==='closed'?'Close anyway':o.delivery==='delivery'?'Deliver anyway':'Pick up anyway',pay:next==='done'?b.balance:null});
 }
 return out;
}
function salesRunChecks(checks,done,takePayment){
 if(!checks.length){done();return;}
 const c=checks[0],rest=()=>salesRunChecks(checks.slice(1),done,takePayment),buttons=[{label:'Back'}];
 if(c.pay!=null&&c.pay>0)buttons.push({label:c.anyway,run:rest},{label:'Take payment',kind:'pri',run:()=>takePayment?takePayment(c.pay):salesTakePayment(c.pay)});
 else buttons.push({label:c.anyway,kind:'pri',run:rest});
 salesDialogOpen(Object.assign({},c,{buttons}));
}
/* Переходы пишут только сохранённую запись. Редактор получает те же поля
   процесса; его прочие несохранённые правки не записываются и не теряются. */
function salesBatchNumber(v){return typeof v==='string'&&/^B-\d{4,9}$/.test(v)?v:'';}
function salesNextBatchNumber(){
 let n=0;(DB.glassBatch||[]).forEach(b=>{if(salesBatchNumber(b.number))n=Math.max(n,+b.number.slice(2));});
 (DB.salesOrder||[]).forEach(o=>[o.batchNo].concat(o.batchHistory||[],(o.lines||[]).map(l=>l.batchNo)).forEach(v=>{if(salesBatchNumber(v))n=Math.max(n,+v.slice(2));}));
 return 'B-'+String(n+1).padStart(4,'0');
}
function salesRecord(id){return (DB.salesOrder||[]).find(o=>o.id===id);}
function salesUnbatchedLines(o){return (o&&o.lines||[]).filter(l=>l.batchManaged?glassBatchRemaining(o,l)>0:!salesLineLocked(l));}
function salesBatchableLines(o){return salesUnbatchedLines(o).filter(l=>!l.onHold);}
function salesRecordTransitionAllowed(o,next,opts){
 opts=opts||{};
 if(!o||salesIsQuote(o)||!SALES_ORDER_STATE_LIST.includes(next))return false;
 if(opts.restore)return o.status==='cancelled'&&next==='new';
 if(opts.back)return !['cancelled','batched'].includes(o.status)&&SALES_PREV_STATUS[o.status]===next;
 if(next==='cancelled')return !['closed','cancelled'].includes(o.status);
 if(o.onHold&&(next==='verified'||next==='batched'))return false;
 if(next==='batched')return (o.status==='verified'||['batched','ready','done'].includes(o.status))&&(salesBatchableLines(o).length>0||o.status==='verified'&&!salesUnbatchedLines(o).length);
 if((next==='ready'||next==='done'||next==='closed')&&salesUnbatchedLines(o).length)return false;
 return SALES_NEXT_STATUS[o.status]===next;
}
function salesSyncRecordLifecycle(o){
 if(!soDraft||soDraft.id!==o.id)return;
 ['status','batchNo','fulfilledVia','updatedAt'].forEach(k=>{soDraft[k]=o[k];});
 soDraft.statusDates=Object.assign({},o.statusDates);soDraft.batchHistory=(o.batchHistory||[]).slice();soDraft.unbatchHistory=JSON.parse(JSON.stringify(o.unbatchHistory||[]));
 soDraft.lines.forEach(l=>{const saved=o.lines.find(x=>x.id===l.id);if(saved){l.batchManaged=saved.batchManaged;l.batchedAt=saved.batchedAt;l.batchNo=saved.batchNo||'';l.cutStartedAt=saved.cutStartedAt||'';}});
}
function salesSetRecordStatus(orderId,next,opts){
 opts=opts||{};const o=salesRecord(orderId);
 if(!salesRecordTransitionAllowed(o,next,opts))return false;
 const now=opts.now||new Date().toISOString();
 /* Батч заказа целиком: все свободные стёкла без Hold одним номером.
    Проверка до записи — неудача не оставляет дат и статуса. Номера стёкол
    выдаются при сохранении заказа; перед батчем недостающие добавляются. */
 if(next==='batched'&&!opts.back)glassPieceEnsure(o);
 const batchRows=next==='batched'&&!opts.back&&salesBatchableLines(o).length?glassBatchRows([o]).filter(r=>!r.l.onHold):null;
 if(batchRows&&!glassBatchAssign(batchRows,{batchNo:opts.batchNo,dryRun:true}))return false;
 o.statusDates=Object.assign({},o.statusDates||{});
 if(opts.restore){o.statusDates={new:now};o.fulfilledVia='';}
 else if(opts.back){
  SALES_ORDER_FLOW.slice(SALES_ORDER_FLOW.indexOf(next)+1).forEach(k=>{delete o.statusDates[k];});
  if(SALES_ORDER_FLOW.indexOf(next)<4)o.fulfilledVia='';
 }else o.statusDates[next]=now;
 if(next==='batched'&&!opts.back){
  if(batchRows)glassBatchAssign(batchRows,{batchNo:opts.batchNo,now,deferTouch:true});
  ['ready','done','closed'].forEach(k=>{delete o.statusDates[k];});o.fulfilledVia='';
 }
 if(next==='done'&&!opts.back)o.fulfilledVia=opts.delivery==='delivery'?'delivery':opts.delivery==='pickup'?'pickup':o.delivery;
 o.status=next;o.updatedAt=now;
 if(next==='verified'&&!opts.back)glassPieceEnsure(o);
 if(next==='cancelled'){o.fulfilledVia='';finReleaseOrder(o.id);}
 salesSyncRecordLifecycle(o);
 if(!opts.deferTouch)touch();
 return true;
}
/* До реального события со стола отсутствие cutStartedAt НЕ доказывает,
   что резки не было: Unbatch требует явного подтверждения сотрудника.
   Известное начало резки защищает строку и на уровне записи. */
function salesUnbatchEligible(o){return !!o&&!salesIsQuote(o)&&['new','verified','batched'].includes(o.status);}
function salesCanUnbatch(o){return salesUnbatchEligible(o)&&(o.lines||[]).some(l=>salesLineLocked(l)&&!l.cutStartedAt);}
function salesUnbatchRecord(orderId,lineIds,opts){
 opts=opts||{};const o=salesRecord(orderId),ids=new Set(lineIds||[]);
 if(!opts.confirmed||!salesUnbatchEligible(o)||!ids.size)return false;
 const lines=(o.lines||[]).filter(l=>ids.has(l.id));
 if(lines.length!==ids.size||lines.some(l=>!salesLineLocked(l)||!!l.cutStartedAt))return false;
 if(lines.some(l=>l.batchManaged)){
  normalizeGlassBatches();const entries=glassBatchEntries(orderId).filter(x=>ids.has(x.part.lineId)&&!x.item.releasedAt);
  return glassBatchRelease(entries,opts);
 }
 const now=opts.now||new Date().toISOString(),numbers=[...new Set(lines.map(l=>l.batchNo).filter(Boolean))];
 o.batchHistory=[...new Set((o.batchHistory||[]).concat(numbers,o.batchNo?[o.batchNo]:[]))];
 o.unbatchHistory=(o.unbatchHistory||[]).concat({at:now,batchNumbers:numbers,lineIds:lines.map(l=>l.id)});
 lines.forEach(l=>{l.batchedAt='';l.batchNo='';});
 const active=[...new Set(o.lines.filter(salesLineLocked).map(l=>l.batchNo).filter(Boolean))];o.batchNo=active[active.length-1]||'';
 o.status='new';o.statusDates={new:now};o.fulfilledVia='';o.updatedAt=now;
 salesSyncRecordLifecycle(o);if(!opts.deferTouch)touch();return true;
}
/* Существующие имена оставлены как адаптеры; кнопок этих действий в заказе нет. */
function salesSetStatus(next,opts){const changed=soDraft&&salesSetRecordStatus(soDraft.id,next,opts);render();return !!changed;}
function salesAdvanceStatus(){if(soDraft)optimizationRunOrders([soDraft.id],SALES_NEXT_STATUS[soDraft.status],{delivery:soDraft.delivery});}
function salesStepBack(){if(soDraft)optimizationRunOrders([soDraft.id],'back');}
function salesBatchNewLines(){if(soDraft)optimizationRunOrders([soDraft.id],'batched');}
function salesCancelOrder(orderId){const id=orderId||(soDraft&&soDraft.id);if(id)optimizationRunOrders([id],'cancelled');}
function salesRestoreOrder(orderId){
 const id=orderId||(soDraft&&soDraft.id),o=salesRecord(id);
 if(!o||o.status!=='cancelled'||!confirm('Restore order '+o.businessNumber+' as New? Batched lines stay locked.'))return;
 salesSetRecordStatus(id,'new',{restore:true});render();
}
/* Оплата из очереди не сохраняет посторонний открытый черновик. */
function salesTakeRecordPayment(orderId,amount){
 const o=salesRecord(orderId);if(!o)return;
 const b=finOrderBalance(o);
 tab='finance';subtab=null;finNewReceipt(o.customerId);
 if(b.balance>0){const v=Math.min(salesMoney(+amount||b.balance),b.balance).toFixed(2);finDraft.amount=v;finDraft.apply[o.id]=v;}
 finDraft.note='Order '+o.businessNumber;render();
}
function salesTakePayment(amount){if(soDraft)salesTakeRecordPayment(soDraft.id,amount);}
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
 if(typeof ncrCanOpen==='function'&&ncrCanOpen(o))parts.push('<button class="ncr-btn" data-ncr-open onclick="ncrOpenForm()">NCR</button>');
 if(salesIsQuote(o)){if(!salesQuoteWonMember(o))parts.push('<button class="go" data-convert-quote onclick="salesConvertQuote()">Convert to order</button>');}
 return parts.join('');
}
function salesStatusStepper(o){
 if(salesIsQuote(o)){
  const shown=salesQuoteShown(o),w=salesQuoteWonMember(shown),bar=salesQuoteRevisionBar(shown);
  if(!w)return bar+salesQuoteSentBanner();
  const won=(DB.salesOrder||[]).find(x=>x.id===w.wonOrderId);
  return bar+`<div class="sales-quote-note">${raw(w.businessNumber)} became order ${won?`<button class="sm" onclick="salesOrderEdit('${esc(won.id)}')">${raw(won.businessNumber)}</button>`:''} on ${esc(salesShortDate(w.statusDates.won))}. The quote is kept read-only for the win history.</div>`;
 }
 if(o.status==='cancelled')return `<div class="sales-status-row"><span class="pill st-cancelled">Cancelled ${esc(salesShortDate(o.statusDates.cancelled))}</span><span class="mut">Status history · read only</span></div>`;
 const at=SALES_ORDER_FLOW.indexOf(o.status);
 const steps=SALES_ORDER_FLOW.map((s,i)=>`<div class="sales-step ${i<at?'done':i===at?'cur':''}" data-step="${s}"><span class="sales-step-label"><i></i><b>${esc(s==='done'&&at<4?'Picked up / Delivered':salesStatusLabel(o,s))}${s==='batched'?' 🔒':''}</b></span>${o.statusDates&&o.statusDates[s]?`<small>${esc(salesShortDate(o.statusDates[s]))}</small>`:''}</div>`).join('');
 return `<div class="sales-status-row"><div class="sales-steps">${steps}</div><span class="sales-status-readonly">Status history · read only</span></div>`;
}
function salesOrderBatchNumbers(o){return [...new Set((o.lines||[]).filter(salesLineLocked).map(l=>l.batchNo).filter(Boolean).concat(o.batchNo?[o.batchNo]:[]))];}
function salesLockBar(o){
 if(salesIsQuote(o))return '';
 const last=(o.unbatchHistory||[]).slice(-1)[0],history=last?`<div class="sales-quote-note">Unbatched ${esc(salesShortDate(last.at))} · ${esc(last.batchNumbers.join(', ')||'previous batch')} · ${last.lineIds.length} line(s)${o.status==='new'?' · verify again':''}</div>`:'';
 const locked=o.lines.filter(salesLineLocked),active=['batched','ready','done'].includes(o.status);
 if(!locked.length&&!active)return history;
 const first=locked.map(l=>l.batchedAt).sort()[0],numbers=salesOrderBatchNumbers(o),readonly=salesOrderReadOnly(o);
 return history+`<div class="sales-lockbar">${locked.length?`<span>🔒 <b>Batched ${esc(salesShortDate(first))}${numbers.length?' · '+esc(numbers.join(', ')):''}</b> · lines locked</span>`:''}<span class="sp"></span>${readonly?'':`<button class="sm" onclick="salesOrderAddLine(null,true)">+ Line (charged)</button><button class="sm" onclick="salesNewOrderForCustomer('${esc(o.customerId)}')">New order for this customer</button>`}</div>`;
}

/* --------------------------- Список Sales ------------------------------ */
/* Галочки Show: каждый смотрит своё — заказы, квоты, NCR (erp/quality/ncr).
   Выбор запоминается в этом браузере; хотя бы одна галочка остаётся. */
function salesLoadShow(){
 try{const v=JSON.parse(localStorage.getItem('glass_erp_sales_show')||'null');if(v&&typeof v==='object'&&(v.orders||v.quotes||v.ncr))return {orders:!!v.orders,quotes:!!v.quotes,ncr:!!v.ncr};}catch(e){}
 return {orders:true,quotes:false,ncr:false};
}
let salesShow=salesLoadShow(),salesStatusFilter='';
function salesToggleShow(key){
 const next=Object.assign({},salesShow,{[key]:!salesShow[key]});
 if(!next.orders&&!next.quotes&&!next.ncr)return;
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
 const count=(kind,s)=>rows.filter(o=>o.kind!=='ncr'&&salesKindOf(o)===kind&&salesListStatus(o)===s).length,chips=[];
 if(salesShow.orders)SALES_ORDER_STATE_LIST.forEach(s=>chips.push({key:'order:'+s,label:s==='done'?'Picked up / Delivered':salesStatusLabel({kind:'order'},s),n:count('order',s)}));
 if(salesShow.quotes)SALES_QUOTE_STATE_LIST.forEach(s=>chips.push({key:'quote:'+s,label:salesStatusLabel({kind:'quote'},s),n:count('quote',s)}));
 if(salesShow.ncr)['Open','Done'].forEach(s=>chips.push({key:'ncr:'+s.toLowerCase(),label:'NCR '+s,n:rows.filter(o=>o.kind==='ncr'&&o.ncrStatus===s).length}));
 const p=salesListLoadPrefs(),selected=chips.find(c=>c.key===salesStatusFilter),label=selected?selected.label:'All',n=selected?selected.n:rows.length;
 const toggle=`<button type="button" class="sl-status-toggle" data-status-toggle aria-expanded="${p.statusExpanded}" title="${p.statusExpanded?'Hide status filters':'Show status filters'}" onclick="salesListToggleStatuses()">${esc(label)} <b>${n}</b><span class="sl-disclosure" aria-hidden="true">${p.statusExpanded?'▾':'▸'}</span></button>`;
 return `<div class="sales-status-chips sl-status-compact">${toggle}${p.statusExpanded?`<div class="sl-status-options"><button type="button" data-status-all class="${salesStatusFilter?'':'on'}" onclick="salesSetStatusFilter('')">All <b>${rows.length}</b></button>${chips.map(c=>`<button type="button" data-status-chip="${c.key}" class="${salesStatusFilter===c.key?'on':''}" onclick="salesSetStatusFilter('${c.key}')">${esc(c.label)} <b>${c.n}</b></button>`).join('')}</div>`:''}</div>`;
}
