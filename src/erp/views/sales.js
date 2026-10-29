/* =====================================================================
   view/sales · sales-0.3b-makeup
   Draft Sales Orders with order-scoped IGU Makeups.
   Shape and Muntin remain external engineering configurators.
   ===================================================================== */

function viewSales(){
 subtab='orders';
 /* Открыто окно Cut preview — вместо списка (views/sales-cut-estimate).
    Открытый заказ важнее: ссылка «Open order» из Optimization ведёт в заказ,
    а прикидка ждёт, пока его закроют. */
 if(typeof cutEst!=='undefined'&&cutEst&&soEdit===null&&typeof viewSalesCutEstimate==='function')return viewSalesCutEstimate();
 return `<div class="page-head sales-page-head"><div><h2>Sales</h2></div><span class="pill info">Stage 3B</span></div>${salesOrdersPane()}`;
}
function salesOrdersPane(){return soEdit!==null?salesOrderEditor():salesOrderList();}
/* Список — views/sales-list-ui: колонки, фильтры, итоги, On Hold. */
function salesOrderList(){return salesListView();}
/* Поле Customer с подсказками (пункт 12; владелец 30.10.2026: «искать с
   первой буквы, ввожу 3 — по первым 3 и дальше предлагать»). Сначала
   названия, которые так начинаются, потом слово внутри названия или код,
   потом остальные совпадения. Набранный текст живёт только в поле: заказ
   меняется лишь выбором строки, Escape и уход из поля возвращают
   выбранного клиента. Список обновляется без перерисовки заказа — фокус
   и курсор остаются на месте. */
function salesCustomerName(c){return c?String(c.displayName||c.legalName||c.code||''):'';}
function salesCustomerNorm(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').trim();}
/* 0 — с начала, 1 — с начала слова, 2 — внутри, 3 — нет. */
function salesCustomerRank(text,q){
 let i=text.indexOf(q);if(i<0)return 3;if(i===0)return 0;
 for(;i>=0;i=text.indexOf(q,i+1))if(!/[\p{L}\p{N}]/u.test(text[i-1]))return 1;
 return 2;
}
function salesCustomerMatches(q){
 q=salesCustomerNorm(q);
 return (DB.customer||[]).filter(c=>c.status!=='archived').map(c=>{
  const name=Math.min(...[c.displayName,c.legalName].map(x=>salesCustomerRank(salesCustomerNorm(x),q))),code=salesCustomerRank(salesCustomerNorm(c.code),q);
  return {c,rank:!q?0:Math.min(name,code===3?3:Math.max(1,code))};
 }).filter(x=>x.rank<3).sort((a,b)=>a.rank-b.rank||salesCustomerName(a.c).localeCompare(salesCustomerName(b.c))||String(a.c.code).localeCompare(String(b.c.code))).map(x=>x.c);
}
function salesCustomerListHTML(q){
 const list=salesCustomerMatches(q),key=salesCustomerNorm(q),names=new Map();
 if(!list.length)return '<div class="so-cust-none">No customers found</div>';
 (DB.customer||[]).filter(c=>c.status!=='archived').forEach(c=>{const n=salesCustomerNorm(salesCustomerName(c));names.set(n,(names.get(n)||0)+1);});
 const mark=s=>{const i=key?s.toLowerCase().indexOf(key):-1;return i<0?esc(s):esc(s.slice(0,i))+'<mark>'+esc(s.slice(i,i+key.length))+'</mark>'+esc(s.slice(i+key.length));};
 /* Одинаковые названия различает город. */
 const city=c=>{const a=customerAddressByType(c,'billing');return a.city||((c.addresses||[]).find(x=>x.city)||{}).city||'';};
 return list.map((c,i)=>{const n=salesCustomerName(c),twin=names.get(salesCustomerNorm(n))>1&&city(c);
  return `<div class="so-cust-opt${c.id===soDraft.customerId?' on':''}" id="so_cust_${i}" role="option" aria-selected="false" data-customer-option="${esc(c.id)}" onmousedown="event.preventDefault();salesCustomerPick(this.dataset.customerOption)"><span>${mark(n)}</span>${twin?`<span class="so-cust-city">${esc(twin)}</span>`:''}${c.onHold?'<span class="pill bad">On Hold</span>':''}<span class="so-cust-code">${mark(String(c.code||''))}</span></div>`;}).join('')
  +`<div class="so-cust-foot">${list.length} customer${list.length===1?'':'s'}</div>`;
}
function salesCustomerField(){
 const c=salesFindCustomer(soDraft.customerId),name=salesCustomerName(c);
 return `<div class="so-cust"><input id="so_customer" data-customer-input role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="so_cust_list" autocomplete="off" value="${esc(name)}" title="${esc(c?name+' · '+(c.code||''):'')}" placeholder="Search customers by name or code" onfocus="this.select();salesCustomerOpen(this,'')" oninput="salesCustomerOpen(this,this.value)" onkeydown="salesCustomerKeydown(event,this)" onblur="salesCustomerClose(this)"><span class="so-cust-car" aria-hidden="true">▾</span><div class="so-cust-list" id="so_cust_list" role="listbox" hidden onmousedown="event.preventDefault()"></div></div>`;
}
function salesCustomerOpen(el,q){
 const box=document.getElementById('so_cust_list');if(!box)return;
 box.innerHTML=salesCustomerListHTML(q);box.hidden=false;box.scrollTop=0;
 el.setAttribute('aria-expanded','true');el.dataset.active='-1';el.dataset.typed=salesCustomerNorm(q)?'1':'';el.removeAttribute('aria-activedescendant');
}
function salesCustomerClose(el){
 const box=document.getElementById('so_cust_list');if(box){box.hidden=true;box.innerHTML='';}
 if(!el)return;el.value=salesCustomerName(salesFindCustomer(soDraft&&soDraft.customerId));el.setAttribute('aria-expanded','false');el.removeAttribute('aria-activedescendant');
}
/* Стрелки выбирают строку. Tab и Enter берут выбранную стрелкой, а без
   стрелки — первую подсказку (владелец 30.10.2026: «без Enter, достаточно
   просто Tab»); только если что-то набрано — проход Tab по пустому полю
   клиента не меняет. Escape — без смены клиента. Enter и Escape не уходят
   дальше поля: не сохраняют и не закрывают заказ. */
function salesCustomerKeydown(e,el){
 const box=document.getElementById('so_cust_list');if(!box)return;
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){
  e.preventDefault();if(box.hidden)salesCustomerOpen(el,el.value===salesCustomerName(salesFindCustomer(soDraft.customerId))?'':el.value);
  const opts=[...box.querySelectorAll('[data-customer-option]')];if(!opts.length)return;
  let i=+el.dataset.active;i=e.key==='ArrowDown'?Math.min(opts.length-1,i+1):Math.max(0,i-1);el.dataset.active=String(i);
  opts.forEach((o,k)=>{o.classList.toggle('act',k===i);o.setAttribute('aria-selected',k===i?'true':'false');});
  el.setAttribute('aria-activedescendant',opts[i].id);opts[i].scrollIntoView({block:'nearest'});
 }else if(e.key==='Enter'){
  e.preventDefault();e.stopPropagation();salesCustomerTake(el,box,false);
 }else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();salesCustomerClose(el);}
 else if(e.key==='Tab'&&!e.shiftKey&&salesCustomerTake(el,box,true))e.preventDefault();
 else if(e.key==='Tab')salesCustomerClose(el);
}
/* Выбор с клавиатуры: строка под стрелкой или первая. После Tab фокус —
   в следующем поле (Customer PO), как обычный переход. */
function salesCustomerTake(el,box,next){
 const opts=box.querySelectorAll('[data-customer-option]'),opt=opts[+el.dataset.active]||(el.dataset.typed?opts[0]:null);
 if(box.hidden||!opt)return false;
 salesCustomerPick(opt.dataset.customerOption);
 if(next){const po=document.querySelector('.sales-header-compact>div:nth-child(2) input');if(po)po.focus();}
 return true;
}
/* Тот же клиент — ничего не трогаем: ручные условия заказа остаются. */
function salesCustomerPick(id){
 const el=document.getElementById('so_customer');
 if(!soDraft||!salesFindCustomer(id)||id===soDraft.customerId){salesCustomerClose(el);if(el)el.blur();return;}
 salesApplyCustomerDefaults(id);render();
}
function salesOrderEditor(){
 /* Заказ из архива (erp/archive): закрыто всё, кроме кнопок шапки — его
    записи на экране только на время просмотра. */
 const o=soDraft,c=salesFindCustomer(o.customerId),title=salesOrderTitle(o),ro=salesOrderReadOnly(o),av=typeof archiveViewing==='function'&&archiveViewing(o),q=salesIsQuote(o),fromQuote=o.fromQuoteId?((DB.salesOrder||[]).find(x=>x.id===o.fromQuoteId)||{}).businessNumber:'',customerFlags=c?`${c.onHold?'<span class="pill bad">On Hold</span>':''}${c.poRequired?'<span class="pill warn">PO Required</span>':''}${c.isProspect?'<span class="pill info">Prospect</span>':''}`:'';
 return `<div class="sales-order-editor"><div class="sales-editor-top"><div><div class="sales-order-title"><h3>${esc(title)}</h3>${salesStatusPill(q?salesQuoteShown(o):o)}${!q&&o.onHold?'<span class="pill hold" data-hold-pill>On Hold</span>':''}${customerFlags}</div><div class="mut mono">${esc(q?salesQuoteShown(o).id:o.id)}${fromQuote?' · from quote '+raw(fromQuote):''}${(e=>e&&e.by?`<span data-created-by> · Created by ${esc(e.by)} · ${esc(salesListShortDay(salesListIsoDay(e.at)))}</span>`:'')(orderCreatedBy(q?salesQuoteShown(o).id:o.id))}</div></div>${q?'':av?`<div inert>${salesPaymentStrip(o)}</div>`:salesPaymentStrip(o)}<div class="sales-editor-actions">${salesHeaderActions(o)}</div></div>
 ${av?'<div class="sales-readonly" inert>':''}${salesHoldBar(o)}${shippingOrderStrip(o)}${salesStatusStepper(o)}${salesLockBar(o)}${typeof ncrOrderStrip==='function'?ncrOrderStrip(o):''}${ro&&!av?'<div class="sales-readonly" inert>':''}
 <div class="sales-header-compact"><div><label for="so_customer">Customer *</label>${salesCustomerField()}</div><div><label>Customer PO</label><input value="${esc(o.customerPo)}" oninput="soDraft.customerPo=this.value"></div><div><label>Due Date</label><input type="date" value="${esc(o.dueDate)}" onchange="soDraft.dueDate=this.value"></div><div><label>Priority</label><select onchange="soDraft.priority=this.value"><option value="normal" ${o.priority==='normal'?'selected':''}>Normal</option><option value="rush" ${o.priority==='rush'?'selected':''}>Rush</option><option value="critical" ${o.priority==='critical'?'selected':''}>Critical</option></select></div><div><label>Delivery</label><select onchange="soDraft.delivery=this.value"><option value="pickup" ${o.delivery==='pickup'?'selected':''}>Pickup</option><option value="delivery" ${o.delivery==='delivery'?'selected':''}>Delivery</option></select></div><div><label>Currency</label><select onchange="soDraft.currency=this.value;render()"><option ${o.currency==='CAD'?'selected':''}>CAD</option><option ${o.currency==='USD'?'selected':''}>USD</option></select></div><div><label>Branch</label><input value="${esc(o.branch)}" oninput="soDraft.branch=this.value"></div>${q?`<div><label>Valid until</label><input type="date" data-quote-valid value="${esc(o.validUntil)}" title="Empty: the send date plus ${salesQuoteValidDays()} days" onchange="soDraft.validUntil=this.value;render()"></div>`:''}</div>
 ${salesPriceListStrip(o)}${q?'':salesDepositHint(o)}${c&&c.onHold?'<div class="sales-hold">Customer on hold</div>':''}
 ${salesGlassSectionHTML()}
 ${salesExtraItemsSection()}
 ${typeof recutOrderSection==='function'?recutOrderSection(o):''}<div class="sales-notes"><label>Order Notes</label><textarea rows="2" oninput="soDraft.notes=this.value">${esc(o.notes)}</textarea></div>${ro?'</div>':''}<div class="err" id="e_sales_order"></div>${typeof ncrModalHTML==='function'?ncrModalHTML():''}${salesLineHoldMenuHTML()}${salesExcelModal()}${salesServicesModal()}${salesMetricsModal()}${salesStockPickerModal()}${docModal()}${finApplyModal()}</div>`;
}
/* Владелец 11 сентября 2026 сначала попросил прятать GLASS / IGU MAKEUPS,
   пока в заказе нет строк (сценарий: клиент уже забрал и оплатил стекло,
   вернулся за стоковой дверью) — но следующим сообщением попросил инверсию:
   раздел по умолчанию ОТКРЫТ, как было всегда, а скрывает/показывает его
   явная кнопка "− Makeup" / "+ Add Makeup" (`soGlassOpen`, orders.js), а не
   количество строк. Makeup A из soDraft.makeups[0] по-прежнему не удаляется —
   удалить последний Makeup нельзя, слишком много мест читают его напрямую;
   "− Makeup" только прячет раздел и (если в нём были строки) снимает их. */
function salesGlassSectionHTML(){
 if(soGlassOpen)return `<section class="sales-block"><div class="sales-block-head"><div><b>GLASS / IGU MAKEUPS</b><span>Makeups exist only inside this Sales Order</span></div><button class="line-x" title="Remove glass from this order" onclick="salesGlassSectionClose()">×</button></div>${salesMakeupTabs()}${salesMakeupBuilder()}</section>
 ${salesOrderLines()}`;
 return `<div class="sales-extra-items-quiet"><span class="mut">No glass in this order.</span><button class="sm" onclick="salesGlassSectionOpen()">+ Add Makeup</button></div>`;
}
/* Позиция каталога, а не строка со стеклом: четвёртая кнопка рядом с Single /
   Double / Triple, которую владелец просил 11 сентября 2026. Отдельная секция,
   а не колонка в таблице выше — у стоковой двери нет ни Makeup, ни ширины, ни
   высоты, ни кромки, и пытаться втиснуть её в те же колонки означало бы делать
   вид, что у неё есть то, чего нет. Деньги при этом идут в тот же Subtotal:
   salesOrderCommercialTotals уже читает soDraft.extraItems.

   Владелец 11 сентября: инлайн <select> в тихой строке "кричит" о себе меньше
   прежнего, но выбор всё равно неудобный — попросил окно, как у остальных
   действий (Services, Excel). Кнопка открывает `salesStockPickerModal()`. */
function salesExtraItemPicker(){
 const candidates=salesExtraItemCandidates();
 return candidates.length
  ?`<button class="sm" onclick="salesStockPickerOpen()">+ Add Stock Item</button>`
  :'';
}
/* Владелец 11 сентября: «мы не к каждому заказу продаём дополнительные айтемы,
   интерфейс не должен быть навязчивый — а сейчас он прям кричит». Пустая секция
   ужалась до одной тихой строки без карточки и без большого заголовка: тот же
   вес, что у сноски под таблицей, а не третий полноправный блок рядом с
   GLASS / IGU MAKEUPS и ORDER LINES. Полная карточка появляется, только когда в
   заказе уже что-то лежит — тогда это содержимое, которое владелец сам сюда
   положил, и прятать его уже неправильно. */
function salesExtraItemsSection(){
 const items=soDraft.extraItems||[],currency=soDraft.currency||'CAD';
 if(!items.length)return `<div class="sales-extra-items-quiet">${salesExtraItemPicker()}</div>`;
 const rows=items.map(x=>{
  const unit=salesExtraItemUnitPrice(x),total=salesExtraItemLineTotal(x);
  return `<tr>
   <td><b>${esc(salesExtraItemName(x))}</b></td>
   <td><input type="number" min="1" step="1" inputmode="numeric" value="${esc(x.qty)}" style="width:64px" onchange="salesExtraItemSetQty('${esc(x.id)}',this.value)"></td>
   <td><input type="number" min="0" step="0.01" value="${x.priceOverride!=null?x.priceOverride:''}" placeholder="${unit!=null?unit.toFixed(2):'—'}" style="width:88px" onchange="salesExtraItemSetPrice('${esc(x.id)}',this.value)"></td>
   <td class="mono">${total!=null?total.toFixed(2)+' '+esc(currency):'<span class="mut">Rate required</span>'}</td>
   <td><button class="sm dl" onclick="salesExtraItemRemove('${esc(x.id)}')">×</button></td>
  </tr>`;
 }).join('');
 return `<section class="sales-block sales-extra-items"><div class="sales-block-head"><div><b>STOCK & EXTRA ITEMS</b><span>Sold as their own line — no glass, no geometry, no route</span></div></div>
  <div class="customer-table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Price, ${esc(currency)}</th><th>Total</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  <div class="row">${salesExtraItemPicker()}</div></section>`;
}
/* Окно выбора стокового айтема — тот же `.sales-service-modal-back`, что у
   Services и Edgework Sets. Пилюли фильтра строятся из подкатегорий, реально
   встречающихся среди кандидатов (плюс "Other" — у кого подкатегория пустая,
   это позиции из других справочников: interlayer, sealant…), а не из
   заводского списка: владелец сам решает, какие подкатегории существуют
   (`SALES_STOCK_SUBCATEGORIES` — только подсказка в форме Master Data). Каждая
   строка получает своё поле Qty — количество задаётся до добавления, а не
   правкой после в таблице заказа; кнопка "+ Add" единственная кликабельная
   часть строки, чтобы клик в поле Qty не добавлял позицию преждевременно. */
function salesStockPickerModal(){
 if(!soStockPickerOpen)return '';
 const all=salesExtraItemCandidates(),currency=soDraft.currency||'CAD';
 const subcats=Array.from(new Set(all.map(c=>c.subcategory).filter(Boolean)));
 const hasOther=all.some(c=>!c.subcategory);
 const filter=soStockPickerFilter;
 const candidates=filter?all.filter(c=>filter==='__other__'?!c.subcategory:c.subcategory===filter):all;
 const pill=(value,label)=>`<button class="sm ${filter===value?'on':''}" onclick="salesStockPickerSetFilter('${esc(value)}')">${esc(label)}</button>`;
 const pills=subcats.length||hasOther
  ?`<div class="stock-picker-filters">${pill('','All')}${subcats.map(s=>pill(s,s)).join('')}${hasOther?pill('__other__','Other'):''}</div>`
  :'';
 const rows=candidates.map((c,i)=>`<tr class="stock-picker-row"><td><b>${esc(c.name)}</b>${c.subcategory?`<div class="mut">${esc(c.subcategory)}</div>`:''}</td><td class="mono">${esc(c.code||'—')}</td><td class="mono">${c.salePrice!=null?c.salePrice.toFixed(2)+' '+esc(currency):'—'}</td><td><input type="number" min="1" step="1" inputmode="numeric" value="1" id="stockPickQty_${i}" style="width:56px"></td><td><button class="sm" onclick="salesStockPickerChoose('${esc(c.table)}','${esc(c.id)}',(document.getElementById('stockPickQty_${i}')||{}).value)">+ Add</button></td></tr>`).join('');
 return `<div class="sales-service-modal-back" onclick="if(event.target===this)salesStockPickerClose()"><div class="sales-service-modal"><div class="sales-service-modal-head"><div><span>Stock &amp; Extra Items</span><h3>Add an item</h3><small>Sold as its own order line — no glass, no geometry, no route</small></div><button onclick="salesStockPickerClose()">×</button></div>
  ${pills}
  <div class="customer-table-wrap"><table><thead><tr><th>Item</th><th>Code</th><th>Price, ${esc(currency)}</th><th>Qty</th><th></th></tr></thead><tbody>${rows||`<tr><td colspan="5" class="empty">${all.length?'No items in this filter.':'No catalog items'}</td></tr>`}</tbody></table></div>
  </div></div>`;
}
function salesLineShapeCell(l,i){
 const s=salesShapeByRef(l.shapeRef);
 if(salesLineLocked(l))return s?`<div class="line-config-cell"><button class="line-link-btn ${salesShapeIsLineRect(s)?'rect':'linked'}" data-line-drawing title="View drawing" onclick="docOpen('drawings','${esc(l.id)}')">${esc(salesShapeIsLineRect(s)?'Rect':s.name)}</button></div>`:'';
 if(!s)return `<button class="line-link-btn" onclick="salesOrderConfigureShape(${i})">+ Shape</button>`;
 /* Простой прямоугольник строки — это её собственная геометрия, а не выбранная
    из библиотеки форма: в таблице он не занимает место именем, а зовёт туда,
    где правится геометрия и кромка. */
 if(salesShapeIsLineRect(s))return `<div class="line-config-cell"><button class="line-link-btn rect" title="Rectangle from Width × Height — open to change geometry or edgework" onclick="salesOrderConfigureShape(${i})">Rect</button></div>`;
 const currentRev=s.revision||0,stale=l.shapeRef.revision!=null&&currentRev!==l.shapeRef.revision;return `<div class="line-config-cell"><button class="line-link-btn ${stale?'stale':'linked'}" onclick="salesOrderConfigureShape(${i})">${esc(s.name)}${stale?' · stale':''}</button><button class="line-x" title="Unlink" onclick="salesUnlinkShape(${i})">×</button></div>`;
}
function salesLineCommercialAdjustmentsHtml(line,currency){
 const rows=salesLineCommercialAdjustments(line,soDraft);if(!rows.length)return '';
 return `<section class="sales-commercial-adjustments"><div class="sales-commercial-head"><div><b>Commercial adjustments</b><span>Already included once in Unit Price</span></div></div><div class="sales-commercial-table"><div class="sales-commercial-row head"><span>Rule</span><span>Calculation per unit</span><span>Qty</span><span>Line total</span></div>${rows.map(a=>`<div class="sales-commercial-row${a.complete?'':' incomplete'}"${a.catalog?' data-surcharge-own':''}><span><b>${esc(a.label)}${a.catalog?' <i class="sales-rate-origin order">ORDER</i>':''}</b><small>${esc(serviceRuleText(a.rule))}</small></span><span>${a.complete?`${a.base.toFixed(2)} × ${a.percent}% = <b>${a.unitAmount.toFixed(2)} ${esc(currency)}</b>`:'Price incomplete'}${a.catalog?`<small>Order rate · Catalog ${esc(salesSurchargeShown(a.catalog))}</small>`:''}</span><span>${a.qty}</span><strong>${a.complete?a.lineAmount.toFixed(2)+' '+esc(currency):'—'}</strong></div>`).join('')}</div></section>`;
}
function salesOrderCommercialAdjustmentsHtml(currency){
 const groups=salesOrderCommercialAdjustments(soDraft);if(!groups.length)return '';
 return `<section class="sales-commercial-adjustments order"><div class="sales-commercial-head"><div><b>Commercial adjustments</b><span>Applied automatically from Makeup type and Billable Area; already included in Unit / Line Price</span></div></div><div class="sales-commercial-table"><div class="sales-commercial-row head"><span>Rule</span><span>Lines / units</span><span>Rate</span><span>Order total</span></div>${groups.map(g=>`<div class="sales-commercial-row${g.incomplete?' incomplete':''}"><span><b>${esc(g.label)}</b><small>${esc(serviceRuleText(g.rule))}</small></span><span>${g.lines} / ${g.qty}</span><span>+${g.percent}% of ${g.rule&&g.rule.onTop?'the running':'the base'} unit price</span><strong>${g.incomplete?'—':g.total.toFixed(2)+' '+esc(currency)}</strong></div>`).join('')}</div></section>`;
}
function salesLineServicesModal(line,index){
 const rows=salesLineChargeRows(line),currency=soDraft.currency||'CAD',s=salesShapeByRef(line.shapeRef),ctx=salesPricingThickness(line),thickness=ctx.ok?ctx.thickness+' mm':(ctx.thickness?ctx.thickness+' mm':'—'),summary=salesLinePricingSummary(line);
 return `<div class="sales-service-modal-back" onclick="if(event.target===this)salesCloseServices()"><div class="sales-service-modal line-modal"><div class="sales-service-modal-head"><div><span><span>Line</span> ${index+1}</span><h3>Services / Processing</h3><small>${s?raw(s.name):'Production Shape'}${line.mark?' · '+raw(line.mark):''}</small></div><button onclick="salesCloseServices()">×</button></div>${rows.length||salesLineCommercialAdjustments(line,soDraft).length?`<div class="sales-service-context"><span>Makeup thickness <b>${esc(thickness)}</b></span><span>Line Qty <b>${esc(line.qty)}</b></span><span>Geometry / quantity <b>read-only</b></span></div>${summary.unpriced?`<div class="sales-pricing-warning"><b>Price not set</b><span><b data-raw>${summary.unpriced}</b> <span>charges have no effective rate. They are not included in the monetary total until a rate is entered.</span></span></div>`:''}${rows.length?`<div class="sales-line-service-table"><div class="sales-line-service-row head"><span>Charge</span><span>Calculated basis</span><span>Catalog</span><span>Order-wide</span><span>Line rate</span><span>Final total</span><span></span></div>${rows.map(function(row){const st=salesChargePricingState(line,row),q=salesPositiveInt(line.qty,1),final=st.effectiveRate==null?null:salesChargeUnitAmount(row,st.effectiveRate)*q,lineValue=st.lineRate==null?'':String(st.lineRate),inherited=st.orderRate!=null?st.orderRate:st.catalogRate,origin=st.origin==='line'?'LINE':(st.origin==='order'?'ORDER':(st.origin==='catalog'?'CATALOG':st.origin==='list'?priceListName(st.from).toUpperCase():'NO RATE'));return `<div class="sales-line-service-row${st.missing?' unpriced':''}"><span class="sales-price-charge"><b>${esc(row.label)}</b><small>${esc(row.source)}</small></span><span class="sales-price-basis">${esc(salesChargeBasisText(row,line))}</span><span>${row.source==='Custom'?`<span class="sales-extra-per">Custom · per ${esc(row.unit)}</span>`:st.catalogRate==null?'<span class="sales-price-missing">Not set</span>':esc(salesRateText(st.catalogRate,row.unit,currency))}</span><span>${esc(salesRateText(st.orderRate,row.unit,currency))}</span><span class="sales-line-rate"><input type="number" min="0" step="0.01" value="${esc(lineValue)}" placeholder="${inherited==null?'':esc(String(inherited))}" onchange="salesSetChargeOrderRate('${esc(line.id)}','${esc(row.key)}',this.value)"><small class="sales-rate-origin ${esc(st.origin)}">${esc(origin)}</small></span><strong>${final==null?'<span class="sales-price-missing">Rate required</span>':final.toFixed(2)+' '+esc(currency)}</strong>${salesExtraIdOfKey(row.key)?`<button class="sm" data-extra-remove onclick="salesExtraRemove('${esc(line.id)}','${esc(salesExtraIdOfKey(row.key))}')">Remove</button>`:`<button class="sm" onclick="salesResetChargeRate('${esc(line.id)}','${esc(row.key)}')">Use Order / Catalog</button>`}</div>`;}).join('')}</div><div class="sales-service-modal-total${summary.unpriced?' incomplete':''}"><span>Services / processing total for this line</span><strong>${summary.total.toFixed(2)} ${esc(currency)}</strong>${summary.unpriced?`<small>+ <span data-raw>${summary.unpriced}</span> <span>unpriced</span></small>`:''}</div>`:''}${salesLineCommercialAdjustmentsHtml(line,currency)}`:`<div class="empty compact sales-service-empty">This line has no services or processing charges yet.</div>`}${salesExtraBarHTML('line:'+line.id)}</div></div>`;
}

function salesOrderServicesModal(){
 const groups=salesOrderChargeGroups(),currency=soDraft.currency||'CAD',summary=salesOrderPricingSummary();
 const commercial=salesOrderCommercialAdjustmentsHtml(currency);
 return `<div class="sales-service-modal-back" onclick="if(event.target===this)salesCloseServices()"><div class="sales-service-modal order-modal"><div class="sales-service-modal-head"><div><span>Sales Order</span><div class="sales-bulk-pricing-title"><h3>Services & Pricing</h3><span class="sales-bulk-pricing-badge">Bulk price edit</span></div><small>Applies to every line with this service.</small></div><button onclick="salesCloseServices()">×</button></div>${groups.length||commercial?`${groups.length?`<div class="sales-bulk-pricing-banner"><b>Bulk edit</b><span>Order rate applies to all matching services.</span></div>${summary.unpriced?`<div class="sales-pricing-warning"><b>Pricing incomplete</b><span><b data-raw>${summary.unpriced}</b> <span>charges have no effective rate. They are excluded from the order monetary total until a rate is entered.</span></span></div>`:''}<div class="sales-order-service-table"><div class="sales-order-service-row head"><span>Service / Processing</span><span>Order basis</span><span>Catalog rate</span><span>Order rate</span><span>Final total</span><span></span></div>${groups.map(function(g){const orderValue=g.orderRate==null?'':String(g.orderRate),placeholder=g.catalogRates.length===1?String(g.catalogRates[0]):'';return `<div class="sales-order-service-row${g.unpriced?' unpriced':''}"><span class="sales-price-charge"><b>${esc(g.label)}</b><small><span>Lines:</span> ${g.entries.length}${g.lineOverrides?' · <span>Overrides:</span> '+g.lineOverrides:''}${g.unpriced?' · <span class="sales-price-missing"><span>Unpriced:</span> <span data-raw>'+g.unpriced+'</span></span>':''}</small></span><span class="sales-price-basis">${esc(salesOrderGroupBasisText(g))}</span><span>${g.catalogRates.length?esc(salesOrderGroupCatalogText(g,currency)):'<span class="sales-price-missing">Not set</span>'}</span><span class="sales-order-rate"><input type="number" min="0" step="0.01" value="${esc(orderValue)}" placeholder="${esc(placeholder)}" onchange="salesSetOrderGroupRate('${esc(g.key)}',this.value)"><small class="sales-rate-origin ${g.orderRate!=null?'order':'catalog'}">${g.orderRate!=null?'ORDER':'CATALOG'}</small></span><strong>${g.unpriced&&g.total===0?'<span class="sales-price-missing">Rate required</span>':g.total.toFixed(2)+' '+esc(currency)+(g.unpriced?' + ?':'')}</strong><button class="sm" onclick="salesResetOrderGroupRate('${esc(g.key)}')">Reset to Catalog</button></div>`;}).join('')}</div><div class="sales-service-order-note"><b>Mass edit rule</b><span>Order rate applies to all matching services.</span></div><div class="sales-service-modal-total grand${summary.unpriced?' incomplete':''}"><span>Services / processing total for the whole order</span><strong>${summary.total.toFixed(2)} ${esc(currency)}</strong>${summary.unpriced?`<small>+ <span data-raw>${summary.unpriced}</span> <span>unpriced</span></small>`:''}</div>`:''}${commercial}`:`<div class="empty compact sales-service-empty">No services or processing charges in this order yet.</div>`}${salesExtraBarHTML('order')}</div></div>`;
}

function salesServicesModal(){if(soServiceOrderOpen)return salesOrderServicesModal();if(soServiceLineId){const i=(soDraft.lines||[]).findIndex(function(l){return l.id===soServiceLineId;});if(i>=0)return salesLineServicesModal(soDraft.lines[i],i);}return '';}

/* Окно вставки из Excel. Ввод — таблица с теми же колонками, что и строки
   заказа: скопировал блок в Excel, встал в ячейку, вставил — колонки на своих
   местах. Подсказка в шапке, заголовки таблицы и разбор говорят одно и то же. */
function salesExcelModal(){
 if(!soDraft)return '';
 salesExcelEnsureRows();
 const sets=salesExcelSets(),mu=salesExcelDefaultMakeup(),c=salesExcelCounts();
 return `<div id="salesExcelModal" class="sales-modal-back${soExcelOpen?' show':''}" onpaste="salesExcelPaste(event)"><div class="sales-modal excel-modal"><div class="sales-modal-head"><div><h3>Paste Excel Rows</h3><span id="salesExcelCols">${esc(salesExcelColumnHint())}</span></div><button onclick="salesExcelClose()">×</button></div>`
  +`<div class="excel-defaults"><label>Makeup for pasted rows<select onchange="salesExcelSetMakeup(this.value)">${soDraft.makeups.map(m=>`<option value="${esc(m.id)}" ${mu&&mu.id===m.id?'selected':''}>${esc(m.code)} · ${esc(salesMakeupSummary(m))}</option>`).join('')}</select></label>`
  +(sets.length?`<label>Edgework Set<select onchange="salesExcelSetSet(this.value)"><option value="">No Set</option>${sets.map(s=>`<option value="${esc(s.id)}" ${soExcelSetId===s.id?'selected':''}>${esc(s.code)}${s.name?' · '+esc(s.name):''}</option>`).join('')}</select></label>`:'')
  +`<span class="excel-defaults-hint">Applies to every row that has no MU${sets.length?' / Set':''} of its own.</span>`
  +`<span class="excel-col-toggles"><button class="sm ${soExcelShowMu?'on':''}" onclick="salesExcelToggleMu()">${soExcelShowMu?'− MU column':'+ MU column'}</button>${sets.length?`<button class="sm ${soExcelShowSet?'on':''}" onclick="salesExcelToggleSet()">${soExcelShowSet?'− Set column':'+ Set column'}</button>`:''}</span></div>`
  +(soExcelNote?`<div class="excel-note">${esc(soExcelNote)}</div>`:'')
  +salesExcelMapHtml()
  +`<div id="salesExcelGrid" class="excel-grid-wrap">${salesExcelGridInnerHtml()}</div>`
  +`<div class="excel-foot"><span class="excel-tip">Paste from Excel · Tab → · Enter ↓</span><span id="salesExcelSummary" class="excel-summary">${salesExcelSummaryHtml(c)}</span></div>`
  +`<div class="sales-modal-actions"><button class="sm" onclick="salesExcelAddBlankRows()">+ 5 rows</button><button class="sm" onclick="salesExcelClearGrid()">Clear</button><span class="excel-actions-sp"></span><button onclick="salesExcelClose()">Cancel</button><button class="pri" id="salesExcelAdd" ${c.ready?'':'disabled'} onclick="salesExcelApply()">${esc(salesExcelAddLabel(c))}</button></div></div></div>`;
}
