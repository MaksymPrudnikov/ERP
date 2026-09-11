/* =====================================================================
   view/sales · sales-0.3b-makeup
   Draft Sales Orders with order-scoped IGU Makeups.
   Shape and Muntin remain external engineering configurators.
   ===================================================================== */

function viewSales(){
 subtab='orders';
 return `<div class="page-head sales-page-head"><div><h2>Продажи</h2><p>Sales Order → order-scoped Makeup → line-specific Shape / Muntin. Без глобальной библиотеки конфигураций.</p></div><span class="pill info">Stage 3B · Draft</span></div>${salesOrdersPane()}`;
}
function salesOrdersPane(){return soEdit!==null?salesOrderEditor():salesOrderList();}
function salesOrderList(){
 const q=salesString(soSearch).toLowerCase(),rows=DB.salesOrder.filter(o=>!q||[o.businessNumber,salesCustomerDisplay(o.customerId),o.customerPo,o.priority,o.dueDate].join(' ').toLowerCase().includes(q));
 return `<div class="card sales-list-card"><div class="sales-toolbar"><div class="sales-search"><input id="salesOrderSearch" value="${esc(soSearch)}" placeholder="Поиск по заказу, клиенту, PO…" oninput="salesOrderSearchChange(this)"></div><button class="pri" onclick="salesOrderNew()">+ Новый Sales Order</button></div><div class="sales-table-wrap"><table><thead><tr><th>Sales Order</th><th>Customer</th><th>PO</th><th>Due</th><th>Priority</th><th>Makeups</th><th>Lines</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(o=>`<tr><td><b class="mono">${raw(o.businessNumber||'Auto Number')}</b><div class="mut">${raw(o.id)}</div></td><td><b>${raw(salesCustomerDisplay(o.customerId)||'—')}</b></td><td>${raw(o.customerPo||'—')}</td><td>${esc(o.dueDate||'—')}</td><td>${salesPriorityLabel(o.priority)}</td><td>${o.makeups.length}</td><td>${o.lines.length}</td><td><span class="pill warn">Draft</span></td><td class="sales-row-actions"><button class="sm" onclick="salesOrderEdit('${esc(o.id)}')">Открыть</button><button class="sm dl" onclick="salesOrderDelete('${esc(o.id)}')">×</button></td></tr>`).join('')||'<tr><td colspan="9" class="empty">Sales Orders пока нет</td></tr>'}</tbody></table></div></div>`;
}
function salesCustomerOptions(){const rows=(DB.customer||[]).filter(c=>c.status!=='archived');return `<option value="">— выбери Customer —</option>`+rows.map(c=>`<option data-raw value="${esc(c.id)}" ${soDraft.customerId===c.id?'selected':''}>${esc(c.code||'')} · ${esc(c.displayName||c.legalName)}</option>`).join('');}
function salesOrderEditor(){
 const o=soDraft,c=salesFindCustomer(o.customerId),title=o.businessNumber?'Sales Order '+o.businessNumber:'New Sales Order · Auto Number',customerFlags=c?`${c.onHold?'<span class="pill bad">On Hold</span>':''}${c.poRequired?'<span class="pill warn">PO Required</span>':''}${c.isProspect?'<span class="pill info">Prospect</span>':''}`:'';
 return `<div class="sales-order-editor"><div class="sales-editor-top"><div><div class="sales-order-title"><h3>${esc(title)}</h3><span class="pill warn">Draft</span>${customerFlags}</div><div class="mut mono">${esc(o.id)}</div></div><div class="sales-editor-actions"><button onclick="salesOrderClose()">Close</button><button class="pri" onclick="salesOrderSave()">${soEdit==='new'?'Save Draft':'Update'}</button><button onclick="salesOpenMetrics('print')">Print</button></div></div>
 <div class="sales-header-compact"><div><label>Customer *</label><select onchange="salesApplyCustomerDefaults(this.value);render()">${salesCustomerOptions()}</select></div><div><label>Customer PO</label><input value="${esc(o.customerPo)}" oninput="soDraft.customerPo=this.value"></div><div><label>Due Date</label><input type="date" value="${esc(o.dueDate)}" onchange="soDraft.dueDate=this.value"></div><div><label>Priority</label><select onchange="soDraft.priority=this.value"><option value="normal" ${o.priority==='normal'?'selected':''}>Normal</option><option value="rush" ${o.priority==='rush'?'selected':''}>Rush</option><option value="critical" ${o.priority==='critical'?'selected':''}>Critical</option></select></div><div><label>Delivery</label><select onchange="soDraft.delivery=this.value"><option value="pickup" ${o.delivery==='pickup'?'selected':''}>Pickup</option><option value="delivery" ${o.delivery==='delivery'?'selected':''}>Delivery</option></select></div><div><label>Terms</label><input value="${esc(o.paymentTerms)}" oninput="soDraft.paymentTerms=this.value"></div><div><label>Currency</label><select onchange="soDraft.currency=this.value;render()"><option ${o.currency==='CAD'?'selected':''}>CAD</option><option ${o.currency==='USD'?'selected':''}>USD</option></select></div><div><label>Branch</label><input value="${esc(o.branch)}" oninput="soDraft.branch=this.value"></div></div>
 ${c&&c.onHold?'<div class="sales-hold">Customer is On Hold. Draft can be saved; Release must remain blocked.</div>':''}
 ${salesGlassSectionHTML()}
 ${salesExtraItemsSection()}
 <div class="sales-notes"><label>Order Notes</label><textarea rows="2" oninput="soDraft.notes=this.value">${esc(o.notes)}</textarea></div><div class="err" id="e_sales_order"></div>${salesExcelModal()}${salesServicesModal()}${salesMetricsModal()}${salesStockPickerModal()}</div>`;
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
  :`<span class="mut">No items are marked "sells as its own order line" yet — turn that on for a row in Master Data → Catalogues.</span>`;
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
   <td><input type="number" min="1" step="1" value="${esc(x.qty)}" style="width:64px" onchange="salesExtraItemSetQty('${esc(x.id)}',this.value)"></td>
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
 const rows=candidates.map((c,i)=>`<tr class="stock-picker-row"><td><b>${esc(c.name)}</b>${c.subcategory?`<div class="mut">${esc(c.subcategory)}</div>`:''}</td><td class="mono">${esc(c.code||'—')}</td><td class="mono">${c.salePrice!=null?c.salePrice.toFixed(2)+' '+esc(currency):'—'}</td><td><input type="number" min="1" step="1" value="1" id="stockPickQty_${i}" style="width:56px"></td><td><button class="sm" onclick="salesStockPickerChoose('${esc(c.table)}','${esc(c.id)}',(document.getElementById('stockPickQty_${i}')||{}).value)">+ Add</button></td></tr>`).join('');
 return `<div class="sales-service-modal-back" onclick="if(event.target===this)salesStockPickerClose()"><div class="sales-service-modal"><div class="sales-service-modal-head"><div><span>Stock &amp; Extra Items</span><h3>Add an item</h3><small>Sold as its own order line — no glass, no geometry, no route</small></div><button onclick="salesStockPickerClose()">×</button></div>
  ${pills}
  <div class="customer-table-wrap"><table><thead><tr><th>Item</th><th>Code</th><th>Price, ${esc(currency)}</th><th>Qty</th><th></th></tr></thead><tbody>${rows||`<tr><td colspan="5" class="empty">${all.length?'No items in this filter.':'No items are marked "sells as its own order line" yet — turn that on for a row in Master Data → Catalogues.'}</td></tr>`}</tbody></table></div>
  </div></div>`;
}
function salesLineShapeCell(l,i){
 const s=salesShapeByRef(l.shapeRef);if(!s)return `<button class="line-link-btn" onclick="salesOrderConfigureShape(${i})">+ Shape</button>`;
 /* Простой прямоугольник строки — это её собственная геометрия, а не выбранная
    из библиотеки форма: в таблице он не занимает место именем, а зовёт туда,
    где правится геометрия и кромка. */
 if(salesShapeIsLineRect(s))return `<div class="line-config-cell"><button class="line-link-btn rect" title="Rectangle from Width × Height — open to change geometry or edgework" onclick="salesOrderConfigureShape(${i})">Rect</button></div>`;
 const currentRev=s.revision||0,stale=l.shapeRef.revision!=null&&currentRev!==l.shapeRef.revision;return `<div class="line-config-cell"><button class="line-link-btn ${stale?'stale':'linked'}" onclick="salesOrderConfigureShape(${i})">${esc(s.name)}${stale?' · stale':''}</button><button class="line-x" title="Unlink" onclick="salesUnlinkShape(${i})">×</button></div>`;
}
function salesLineCommercialAdjustmentsHtml(line,currency){
 const rows=salesLineCommercialAdjustments(line,soDraft);if(!rows.length)return '';
 return `<section class="sales-commercial-adjustments"><div class="sales-commercial-head"><div><b>Коммерческие надбавки</b><span>Уже включены в Unit Price один раз</span></div></div><div class="sales-commercial-table"><div class="sales-commercial-row head"><span>Правило</span><span>Расчёт за unit</span><span>Qty</span><span>Итог строки</span></div>${rows.map(a=>`<div class="sales-commercial-row${a.complete?'':' incomplete'}"><span><b>${esc(a.label)}</b><small>${a.key==='triple'?'Triple IGU':'Billable Area выше лимита'}</small></span><span>${a.complete?`${a.base.toFixed(2)} × ${a.percent}% = <b>${a.unitAmount.toFixed(2)} ${esc(currency)}</b>`:'Цена неполная'}</span><span>${a.qty}</span><strong>${a.complete?a.lineAmount.toFixed(2)+' '+esc(currency):'—'}</strong></div>`).join('')}</div></section>`;
}
function salesOrderCommercialAdjustmentsHtml(currency){
 const groups=salesOrderCommercialAdjustments(soDraft);if(!groups.length)return '';
 return `<section class="sales-commercial-adjustments order"><div class="sales-commercial-head"><div><b>Коммерческие надбавки</b><span>Автоматически из типа Makeup и Billable Area; уже включены в Unit / Line Price</span></div></div><div class="sales-commercial-table"><div class="sales-commercial-row head"><span>Правило</span><span>Строки / units</span><span>Ставка</span><span>Итог заказа</span></div>${groups.map(g=>`<div class="sales-commercial-row${g.incomplete?' incomplete':''}"><span><b>${esc(g.label)}</b><small>${g.key==='triple'?'Triple IGU':'Billable Area выше '+salesMetricRules(soDraft).largeThresholdFt2+' ft²'}</small></span><span>${g.lines} / ${g.qty}</span><span>+${g.percent}% от исходной цены unit</span><strong>${g.incomplete?'—':g.total.toFixed(2)+' '+esc(currency)}</strong></div>`).join('')}</div></section>`;
}
function salesLineServicesModal(line,index){
 const rows=salesLineChargeRows(line),currency=soDraft.currency||'CAD',s=salesShapeByRef(line.shapeRef),ctx=salesPricingThickness(line),thickness=ctx.ok?ctx.thickness+' mm':(ctx.thickness?ctx.thickness+' mm':'—'),summary=salesLinePricingSummary(line);
 return `<div class="sales-service-modal-back" onclick="if(event.target===this)salesCloseServices()"><div class="sales-service-modal line-modal"><div class="sales-service-modal-head"><div><span><span>Строка</span> ${index+1}</span><h3>Сервисы / обработка</h3><small>${s?raw(s.name):'Production Shape'}${line.mark?' · '+raw(line.mark):''}</small></div><button onclick="salesCloseServices()">×</button></div>${rows.length||salesLineCommercialAdjustments(line,soDraft).length?`<div class="sales-service-context"><span>Толщина Makeup <b>${esc(thickness)}</b></span><span>Количество строки <b>${esc(line.qty)}</b></span><span>Геометрия / количество <b>только чтение</b></span></div>${summary.unpriced?`<div class="sales-pricing-warning"><b>Цена не заполнена</b><span><b data-raw>${summary.unpriced}</b> <span>начислений не имеют действующей ставки. Они не включены в денежный итог, пока ставка не будет задана.</span></span></div>`:''}${rows.length?`<div class="sales-line-service-table"><div class="sales-line-service-row head"><span>Начисление</span><span>Рассчитанная база</span><span>Каталог</span><span>На весь заказ</span><span>Ставка строки</span><span>Итог</span><span></span></div>${rows.map(function(row){const st=salesChargePricingState(line,row),q=salesPositiveInt(line.qty,1),final=st.effectiveRate==null?null:row.basis*q*st.effectiveRate,lineValue=st.lineRate==null?'':String(st.lineRate),inherited=st.orderRate!=null?st.orderRate:st.catalogRate,origin=st.origin==='line'?'LINE':(st.origin==='order'?'ORDER':(st.origin==='catalog'?'CATALOG':'NO RATE'));return `<div class="sales-line-service-row${st.missing?' unpriced':''}"><span class="sales-price-charge"><b>${esc(row.label)}</b><small>${esc(row.source)}</small></span><span class="sales-price-basis">${esc(salesChargeBasisText(row,line))}</span><span>${st.catalogRate==null?'<span class="sales-price-missing">Не задана</span>':esc(salesRateText(st.catalogRate,row.unit,currency))}</span><span>${esc(salesRateText(st.orderRate,row.unit,currency))}</span><span class="sales-line-rate"><input type="number" min="0" step="0.01" value="${esc(lineValue)}" placeholder="${inherited==null?'':esc(String(inherited))}" onchange="salesSetChargeOrderRate('${esc(line.id)}','${esc(row.key)}',this.value)"><small class="sales-rate-origin ${esc(st.origin)}">${esc(origin)}</small></span><strong>${final==null?'<span class="sales-price-missing">Нужна ставка</span>':final.toFixed(2)+' '+esc(currency)}</strong><button class="sm" onclick="salesResetChargeRate('${esc(line.id)}','${esc(row.key)}')">Использовать Order / Catalog</button></div>`;}).join('')}</div><div class="sales-service-modal-total${summary.unpriced?' incomplete':''}"><span>Итого сервисы / обработка этой строки</span><strong>${summary.total.toFixed(2)} ${esc(currency)}</strong>${summary.unpriced?`<small>+ <span data-raw>${summary.unpriced}</span> <span>без цены</span></small>`:''}</div>`:''}${salesLineCommercialAdjustmentsHtml(line,currency)}`:`<div class="empty compact sales-service-empty">В этой строке пока нет сервисов или начислений за обработку.</div>`}</div></div>`;
}

function salesOrderServicesModal(){
 const groups=salesOrderChargeGroups(),currency=soDraft.currency||'CAD',summary=salesOrderPricingSummary();
 const commercial=salesOrderCommercialAdjustmentsHtml(currency);
 return `<div class="sales-service-modal-back" onclick="if(event.target===this)salesCloseServices()"><div class="sales-service-modal order-modal"><div class="sales-service-modal-head"><div><span>Sales Order</span><div class="sales-bulk-pricing-title"><h3>Сервисы и цены</h3><span class="sales-bulk-pricing-badge">Массовое изменение цен</span></div><small>Ставка, изменённая в этом окне, применяется ко всем строкам заказа с таким же сервисом. Геометрия и количество не меняются.</small></div><button onclick="salesCloseServices()">×</button></div>${groups.length||commercial?`${groups.length?`<div class="sales-bulk-pricing-banner"><b>Массовое изменение</b><span>Изменение Order rate ниже применяется ко всем совпадающим сервисам этого заказа.</span></div>${summary.unpriced?`<div class="sales-pricing-warning"><b>Калькуляция неполная</b><span><b data-raw>${summary.unpriced}</b> <span>начислений не имеют действующей ставки. В общий денежный итог они не входят, пока ставка не будет задана.</span></span></div>`:''}<div class="sales-order-service-table"><div class="sales-order-service-row head"><span>Сервис / обработка</span><span>База заказа</span><span>Ставка каталога</span><span>Ставка заказа</span><span>Итог</span><span></span></div>${groups.map(function(g){const orderValue=g.orderRate==null?'':String(g.orderRate),placeholder=g.catalogRates.length===1?String(g.catalogRates[0]):'';return `<div class="sales-order-service-row${g.unpriced?' unpriced':''}"><span class="sales-price-charge"><b>${esc(g.label)}</b><small><span>Строк:</span> ${g.entries.length}${g.lineOverrides?' · <span>Исключений:</span> '+g.lineOverrides:''}${g.unpriced?' · <span class="sales-price-missing"><span>Без цены:</span> <span data-raw>'+g.unpriced+'</span></span>':''}</small></span><span class="sales-price-basis">${esc(salesOrderGroupBasisText(g))}</span><span>${g.catalogRates.length?esc(salesOrderGroupCatalogText(g,currency)):'<span class="sales-price-missing">Не задана</span>'}</span><span class="sales-order-rate"><input type="number" min="0" step="0.01" value="${esc(orderValue)}" placeholder="${esc(placeholder)}" onchange="salesSetOrderGroupRate('${esc(g.key)}',this.value)"><small class="sales-rate-origin ${g.orderRate!=null?'order':'catalog'}">${g.orderRate!=null?'ORDER':'CATALOG'}</small></span><strong>${g.unpriced&&g.total===0?'<span class="sales-price-missing">Нужна ставка</span>':g.total.toFixed(2)+' '+esc(currency)+(g.unpriced?' + ?':'')}</strong><button class="sm" onclick="salesResetOrderGroupRate('${esc(g.key)}')">Сбросить к Catalog</button></div>`;}).join('')}</div><div class="sales-service-order-note"><b>Правило массового изменения</b><span>Изменение ставки заказа применяется ко всем одинаковым сервисам этого заказа и очищает старые исключения по строкам для этого сервиса. После этого отдельную строку можно переопределить через её ячейку Сервисы.</span></div><div class="sales-service-modal-total grand${summary.unpriced?' incomplete':''}"><span>Итого сервисы / обработка всего заказа</span><strong>${summary.total.toFixed(2)} ${esc(currency)}</strong>${summary.unpriced?`<small>+ <span data-raw>${summary.unpriced}</span> <span>без цены</span></small>`:''}</div>`:''}${commercial}`:`<div class="empty compact sales-service-empty">В этом заказе пока нет сервисов или начислений за обработку.</div>`}</div></div>`;
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
  +`<div class="excel-foot"><span class="excel-tip">Copy the block in Excel, click a cell here and paste — the columns land as they are. Typing works too: Tab moves across, Enter goes down.</span><span id="salesExcelSummary" class="excel-summary">${salesExcelSummaryHtml(c)}</span></div>`
  +`<div class="sales-modal-actions"><button class="sm" onclick="salesExcelAddBlankRows()">+ 5 rows</button><button class="sm" onclick="salesExcelClearGrid()">Clear</button><span class="excel-actions-sp"></span><button onclick="salesExcelClose()">Cancel</button><button class="pri" id="salesExcelAdd" ${c.ready?'':'disabled'} onclick="salesExcelApply()">${esc(salesExcelAddLabel(c))}</button></div></div></div>`;
}
