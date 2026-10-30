/* User-selectable screen and print columns; stored independently of orders. */
const SALES_METRIC_COLUMNS=[
 {key:'materials',label:'Materials',unit:'',screen:true,print:false},
 {key:'actual',label:'Actual Area',unit:'ft²',screen:true,print:true},
 {key:'rounded',label:'Rounded Area',unit:'ft²',screen:true,print:false},
 {key:'billable',label:'Billable Area',unit:'ft²',screen:false,print:false},
 {key:'unitWeight',label:'Unit Weight',unit:'kg',screen:false,print:false},
 {key:'lineWeight',label:'Line Weight',unit:'kg',screen:false,print:false},
 {key:'unitPrice',label:'Unit Price',unit:'',screen:true,print:true},
 {key:'lineTotal',label:'Line Total',unit:'',screen:true,print:true}
];
const SALES_ORDER_BASE_COLUMNS=[
 {key:'mu',label:'MU'},{key:'set',label:'Set'},{key:'qty',label:'Qty'},{key:'width',label:'Width'},{key:'height',label:'Height'},
 {key:'mark',label:'Mark'},{key:'shape',label:'Shape'},{key:'services',label:'Services'},{key:'notes',label:'Notes'}
];
const SALES_ORDER_DEFAULT_COLUMN_ORDER=['mu','set','qty','width','height','mark','shape','services'].concat(SALES_METRIC_COLUMNS.map(c=>c.key),['notes']);
let salesMetricsPanel=null,salesMetricsLineId=null,salesMetricsEditWeights=false;
let salesViewPrefs=null,salesViewSaveFailed=false,salesMetricDragKey=null;
function salesLoadViewPrefs(){
 if((DB.user||[]).some(u=>!u.viewProfileId)){normalizeUsers();touch();}
 if(salesViewPrefs)return salesViewPrefs;
 try{const p=JSON.parse(localStorage.getItem('glass_erp_line_columns_v1')||'{}');salesViewPrefs=p&&typeof p==='object'&&!Array.isArray(p)?p:{};}catch(e){salesViewPrefs={};}
 if(!salesViewPrefs.profiles||typeof salesViewPrefs.profiles!=='object'||Array.isArray(salesViewPrefs.profiles))salesViewPrefs.profiles={};
 if(salesViewPrefs.columnsVersion!==2){
  Object.keys(salesViewPrefs.profiles).forEach(id=>{const v=salesViewPrefs.profiles[id]||{};if(Array.isArray(v.order)&&!v.order.includes('materials')){const at=v.order.indexOf('services');v.order.splice(at<0?v.order.length:at+1,0,'materials');}if(Array.isArray(v.screen)&&!v.screen.includes('materials'))v.screen.unshift('materials');});
  salesViewPrefs.columnsVersion=2;try{localStorage.setItem('glass_erp_line_columns_v1',JSON.stringify(salesViewPrefs));}catch(e){salesViewSaveFailed=true;}
 }
 if(!(DB.user||[]).some(u=>u.viewProfileId===salesViewPrefs.active))salesViewPrefs.active='browser';
 Object.values(salesViewPrefs.profiles).forEach(v=>{if(!v||typeof v!=='object')return;const w=cwClean(v.widths);if(Object.keys(w).length)v.widths=w;else delete v.widths;});
 return salesViewPrefs;
}
function salesSaveViewPrefs(){
 try{localStorage.setItem('glass_erp_line_columns_v1',JSON.stringify(salesViewPrefs));salesViewSaveFailed=false;}
 catch(e){salesViewSaveFailed=true;}
}
function salesMetricColumnsFor(context){
 const p=salesLoadViewPrefs(),v=p.profiles[p.active]||{},keys=v[context];
 const order=salesMetricOrder(),visible=new Set(Array.isArray(keys)?keys:SALES_METRIC_COLUMNS.filter(c=>c[context]).map(c=>c.key));
 return order.map(key=>SALES_METRIC_COLUMNS.find(c=>c.key===key)).filter(c=>c&&visible.has(c.key));
}
function salesOrderColumnOrder(){
 const p=salesLoadViewPrefs(),v=p.profiles[p.active]||{},known=SALES_ORDER_DEFAULT_COLUMN_ORDER,saved=Array.isArray(v.order)?v.order.filter(k=>known.includes(k)):[];
 const metric=new Set(SALES_METRIC_COLUMNS.map(c=>c.key));
 if(saved.length&&saved.every(k=>metric.has(k))){const queue=saved.concat(SALES_METRIC_COLUMNS.map(c=>c.key).filter(k=>!saved.includes(k)));return known.map(k=>metric.has(k)?queue.shift():k);}
 return saved.concat(known.filter(k=>!saved.includes(k)));
}
function salesMetricOrder(){
 const metric=new Set(SALES_METRIC_COLUMNS.map(c=>c.key));return salesOrderColumnOrder().filter(k=>metric.has(k));
}
function salesSetMetricOrder(order){
 const current=salesOrderColumnOrder(),metric=new Set(SALES_METRIC_COLUMNS.map(c=>c.key)),queue=order.filter(k=>metric.has(k));
 const next=current.map(k=>metric.has(k)?queue.shift():k);
 const p=salesLoadViewPrefs();if(!p.profiles[p.active])p.profiles[p.active]={};p.profiles[p.active].order=next;salesSaveViewPrefs();render();
}
function salesSetOrderColumnOrder(order){const known=SALES_ORDER_DEFAULT_COLUMN_ORDER,next=order.filter((k,i)=>known.includes(k)&&order.indexOf(k)===i).concat(known.filter(k=>!order.includes(k))),p=salesLoadViewPrefs();if(!p.profiles[p.active])p.profiles[p.active]={};p.profiles[p.active].order=next;salesSaveViewPrefs();render();}
function salesMoveMetricColumn(key,delta){const order=salesOrderColumnOrder(),at=order.indexOf(key),to=Math.max(0,Math.min(order.length-1,at+delta));if(at<0||at===to)return;order.splice(at,1);order.splice(to,0,key);salesSetOrderColumnOrder(order);}
function salesMetricDragStart(e,key){salesMetricDragKey=key;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',key);e.currentTarget.classList.add('dragging');}
function salesMetricDragEnd(e){salesMetricDragKey=null;e.currentTarget.classList.remove('dragging');}
function salesMetricDrop(e,key){e.preventDefault();const from=salesMetricDragKey||e.dataTransfer.getData('text/plain'),order=salesOrderColumnOrder(),a=order.indexOf(from),b=order.indexOf(key);if(a<0||b<0||a===b)return;order.splice(a,1);order.splice(b,0,from);salesSetOrderColumnOrder(order);}
function salesSetMetricColumn(context,key,on){
 if(context!=='screen'||!SALES_METRIC_COLUMNS.some(c=>c.key===key))return;
 const p=salesLoadViewPrefs(),keys=salesMetricColumnsFor(context).map(c=>c.key),set=new Set(keys);
 on?set.add(key):set.delete(key);
 if(!p.profiles[p.active])p.profiles[p.active]={};
 p.profiles[p.active][context]=Array.from(set);salesSaveViewPrefs();render();
}
function salesSetViewProfile(id){
 if(id!=='browser'&&!(DB.user||[]).some(u=>u.viewProfileId===id))return;
 salesLoadViewPrefs().active=id;touch();salesSaveViewPrefs();render();
}
function salesResetMetricColumns(context){
 const p=salesLoadViewPrefs();if(p.profiles[p.active]){delete p.profiles[p.active][context];delete p.profiles[p.active].order;delete p.profiles[p.active].widths;}
 salesSaveViewPrefs();render();
}
/* Ширины Order Lines (views/col-widths) — в том же профиле, что видимость и
   порядок, отдельно от списка Sales. Reset widths — только ширины. */
function salesLineWidths(){const p=salesLoadViewPrefs(),v=p.profiles[p.active]||{};return v.widths||{};}
function salesSaveLineWidths(w){const p=salesLoadViewPrefs();if(!p.profiles[p.active])p.profiles[p.active]={};if(Object.keys(w).length)p.profiles[p.active].widths=w;else delete p.profiles[p.active].widths;salesSaveViewPrefs();}
function salesResetLineWidths(){salesSaveLineWidths({});render();}
function salesMoveOrderColumn(from,to,after){
 const order=salesOrderColumnOrder(),a=order.indexOf(from);if(a<0||from===to)return;
 order.splice(a,1);const b=order.indexOf(to);if(b<0)return;order.splice(after?b+1:b,0,from);salesSetOrderColumnOrder(order);
}
/* Поля ввода — не уже, чем можно в них попасть. */
const SALES_LINE_MIN_WIDTH={mu:52,qty:48,width:56,height:56,mark:48,notes:48,services:60};
cwRegister('lines',{widths:salesLineWidths,save:salesSaveLineWidths,def:k=>({mu:62,set:60,qty:62,width:100,height:100,mark:90,shape:56,services:150,notes:100})[k]||103,
 min:k=>SALES_LINE_MIN_WIDTH[k]||CW_MIN,move:salesMoveOrderColumn,lead:[34,52],trail:44});
function salesOpenMetrics(panel,id){salesMetricsPanel=panel;salesMetricsLineId=id||null;salesMetricsEditWeights=false;render();}
function salesCloseMetrics(){salesMetricsPanel=null;salesSurchargeError=null;render();}
function salesMetricsTools(){const n=salesOrderSurchargeCount(soDraft);return `<button type="button" onclick="salesOpenMetrics('columns')">${'Columns'}</button><button type="button" data-surcharges-btn onclick="salesOpenMetrics('rules')">${'Surcharges'}${n?`<span class="metric-surcharge-badge" data-surcharge-badge>ORDER ${n}</span>`:''}</button>`;}
function salesMetricHeaders(context){return salesMetricColumnsFor(context).map(c=>`<th class="line-metric" data-metric="${c.key}"><span data-raw>${c.label}</span></th>`).join('');}
function salesMetricCells(line,context){
 const columns=salesMetricColumnsFor(context),price=salesLineCommercialPrice(line,soDraft),a=price.areas;
 const weight=columns.some(c=>/Weight/.test(c.key))?salesLineWeight(line,soDraft):null;
 return columns.map(c=>salesMetricCell(line,c,context,price,a,weight)).join('');
}
function salesMetricCell(line,c,context,price,a,weight){
 price=price||salesLineCommercialPrice(line,soDraft);a=a||price.areas;
 if(!weight&&/Weight/.test(c.key))weight=salesLineWeight(line,soDraft);
  let value=null,panel='price';
  if(['actual','rounded','billable'].includes(c.key)){value=a[c.key];panel='area';}
  else if(c.key==='materials'||c.key==='unitPrice'||c.key==='lineTotal')value=c.key==='materials'?(!price.missingMaterials&&!price.unsupportedCurrency?price.materials:null):(c.key==='unitPrice'?price.unit:price.line);
  else{value=c.key==='unitWeight'?weight.kg:weight.lineKg;panel='weight';}
  const text=value==null?'—':value.toFixed(c.key==='actual'?4:['rounded','billable'].includes(c.key)?1:2);
  const hand=price.manual&&(c.key==='unitPrice'||c.key==='lineTotal');
  const body=`<b data-raw>${text}</b>${hand&&context==='screen'?'<i class="metric-hand" title="Price by hand">✎</i>':''}`;
  return `<td class="line-metric${value==null?' metric-incomplete':''}" data-metric="${c.key}">${context==='screen'?`<button type="button" class="metric-cell-btn" data-line-id="${esc(line.id)}" onclick="salesOpenMetrics('${panel}',this.dataset.lineId)">${body}</button>`:body}</td>`;
}
/* Вес заказа (пункт 14, вариант 1 владельца 30.10.2026): в строке итогов —
   известное число и метка Partial; под итогами — чего нет, в каких строках и
   где внести, с переходом туда. Нет ничего — вес не показывается. */
function salesOrderWeightCaption(w){
 if(w.kg==null)return '';
 return `<span data-order-weight${w.complete?'':` title="${esc(salesWeightTip(w))}"`}>${w.complete&&w.estimated?'≈ ':''}${esc(salesKgText(w.kg))} kg${w.complete?'':'<span class="pill warn sl-partial">Partial</span>'}</span> · `;
}
function salesOrderWeightNote(w){
 if(w.complete||!w.gaps.length)return '';
 const lines=n=>n.length?` <span class="mut">· line${n.length>1?'s':''} ${n.slice(0,8).join(', ')}${n.length>8?'…':''}</span>`:'';
 return `<div class="metric-weight-gaps" data-weight-gaps><b>⚠ Weight partial</b>${w.gaps.map((g,i)=>`<span class="metric-weight-gap">${esc(g.what)}${lines(g.lines)} → ${esc(g.where)}${g.go&&(g.go.line||accessCan('masterdata'))?` <button type="button" class="sm" onclick="salesWeightGapOpen(${i})">Open</button>`:''}</span>`).join('')}</div>`;
}
/* Open: норма строки — окно Weight этой строки; карточка Data — уход из
   заказа обычным путём (Save / Don't save), затем карточка. */
function salesWeightGapOpen(i){
 const g=soDraft&&salesOrderWeight(soDraft).gaps[i];if(!g||!g.go)return;
 if(g.go.line){const l=soDraft.lines[g.lines[0]-1];if(l)salesOpenMetrics('weight',l.id);return;}
 if(!accessCan('masterdata'))return;
 salesLeaveDraft(()=>{tab='masterdata';if(g.go.setup){mdSetTab('setup');render();}else mdCatalogOpen(g.go.t,g.go.id);});
}
function salesCommercialOrderSummary(interactive){
 const t=salesOrderCommercialTotals(soDraft),c=t.charges,cur=esc(soDraft.currency),money=v=>t.complete?v.toFixed(2):'—',w=salesOrderWeight(soDraft);
 const item=(key,label,rate,value,shown)=>`<span class="metric-order-charge-item charge-${key}${shown?'':' is-empty'}"><span class="metric-order-charge-label">${label}${rate!=null?` <small data-raw>${rate}%</small>`:''}</span><b data-raw>${shown?money(value):''}</b></span>`;
 const adj=(soDraft.adjustments||[]).reduce((n,a)=>salesMoney(n+(+a.amount||0)),0);
 const rows=[...((soDraft.adjustments||[]).length?[item('adjust','Adjustments',null,adj,true)]:[]),item('subtotal','Subtotal',null,t.subtotal,true),item('energy','ES',c.energy.rate,t.energy,c.energy.enabled),item('hst','HST',c.hst.rate,t.hst,c.hst.enabled),item('card',esc(c.card.name),c.card.rate,t.card,c.card.enabled),item('delivery','Delivery',null,t.delivery,c.delivery.enabled),item('skid','Skid Deposit',null,t.skidDeposit,c.skidDeposit.enabled)];
 rows.push(`<span class="metric-order-charge-item charge-total metric-grand-total"><span class="metric-order-charge-label">Total</span><b data-raw>${money(t.grand)}</b>${t.missing?`<small>${t.missing} ${'lines need pricing'}</small>`:''}</span>`);
 const serviceButton=interactive===false?'':`<button type="button" class="metric-order-service-add" onclick="salesOpenMetrics('orderCharges')">Service +</button>`;
 return salesOrderReviewHTML(soDraft,t)+`<div class="metric-order-total">${serviceButton}<div class="metric-order-total-main"><small>${'Entire order'} · ${t.qty} ${'units'} · ${salesOrderWeightCaption(w)}<span class="metric-order-currency" data-raw>${cur}</span></small><div class="metric-order-charge-lines">${rows.join('')}</div></div></div>`+(interactive===false?'':salesOrderWeightNote(w));
}
function salesOrderReviewHTML(o,t){
 t=t||finOrderTotals(o);if(!t.complete||t.grand>=0)return '';
 return `<div class="sales-pricing-warning" role="alert" data-order-review><b>Negative order total · Review required</b><span>Order ${esc(o.businessNumber)} · ${esc(salesCustomerDisplay(o.customerId))} · ${esc(t.grand.toFixed(2))} ${esc(o.currency||'CAD')} · Resolve with the customer</span></div>`;
}
function salesSetOrderChargeEnabled(key,enabled){
 if(!['energy','hst','card','delivery','skidDeposit'].includes(key))return;
 soDraft.orderCharges=normalizeSalesOrderCharges(soDraft.orderCharges);soDraft.orderCharges[key].enabled=!!enabled;touch();render();
}
function salesSetOrderChargeValue(key,field,value){
 if(!soDraft||!['energy','hst','card','delivery','skidDeposit'].includes(key)||!['rate','amount'].includes(field))return;
 const n=Number(value);if(!Number.isFinite(n)||n<0){alert('Enter a value of zero or greater.');render();return;}
 soDraft.orderCharges=normalizeSalesOrderCharges(soDraft.orderCharges);soDraft.orderCharges[key][field]=n;touch();render();
}
/* Карты — список Data → Setup; карта старого заказа, которой в списке уже
   нет, остаётся со своим именем и ставкой. */
function salesSetCardNetwork(network){
 const n=orderSetupNetwork(network);if(!soDraft||!n)return;
 soDraft.orderCharges=normalizeSalesOrderCharges(soDraft.orderCharges);Object.assign(soDraft.orderCharges.card,{network:n.id,name:n.name||'Card fee',rate:n.rate});touch();render();
}
const SALES_CHARGE_PART_LABELS={energy:'ES',hst:'HST',delivery:'Delivery'};
function salesChargeBaseText(base){return 'Base: '+['Subtotal'].concat(base.map(p=>SALES_CHARGE_PART_LABELS[p])).join(' + ');}
/* Поправки на заказ руками (normalizeSalesAdjustments): текст и сумма. */
function salesAddAdjustment(){if(!soDraft)return;soDraft.adjustments=(soDraft.adjustments||[]).concat([{id:salesUid('ADJ'),label:'',amount:0}]);render();}
function salesRemoveAdjustment(i){if(!soDraft||!soDraft.adjustments)return;soDraft.adjustments.splice(i,1);if(!soDraft.adjustments.length)delete soDraft.adjustments;touch();render();}
function salesSetAdjustment(i,key,value){
 const a=soDraft&&(soDraft.adjustments||[])[i];if(!a)return;
 if(key==='label'){a.label=String(value).slice(0,120);return;}
 const n=Number(value);if(!Number.isFinite(n)){alert('Enter an amount. Minus — less to pay.');render();return;}
 a.amount=Math.round(n*100)/100;touch();render();
}
function salesAdjustmentsHTML(){
 const list=soDraft.adjustments||[];
 return `<div class="metric-adjustments" data-adjustments><b>Adjustments</b>${list.map((a,i)=>`<div class="metric-adjustment-row" data-adjustment="${i}"><input type="text" data-adjustment-label value="${esc(a.label)}" maxlength="120" placeholder="Price correction" oninput="salesSetAdjustment(${i},'label',this.value)" onchange="touch()"><input type="number" step="0.01" data-adjustment-amount value="${esc(a.amount)}" onchange="salesSetAdjustment(${i},'amount',this.value)"><span>${esc(soDraft.currency)}</span><button type="button" class="sm dl" aria-label="Remove adjustment" onclick="salesRemoveAdjustment(${i})">×</button></div>`).join('')}<button type="button" class="sm" data-adjustment-add onclick="salesAddAdjustment()">+ Adjustment</button><small>Minus — less to pay. Goes to the subtotal.</small></div>`;
}
function salesOrderChargesPanel(){
 const c=normalizeSalesOrderCharges(soDraft.orderCharges),toggle=(key,label,body)=>`<div class="metric-order-charge-row ${c[key].enabled?'on':''}"><label><input type="checkbox" ${c[key].enabled?'checked':''} onchange="salesSetOrderChargeEnabled('${key}',this.checked)"><b>${label}</b></label>${body}</div>`;
 const pct=(key)=>`<label>${'Rate'}<input type="number" min="0" step="0.01" value="${c[key].rate}" onchange="salesSetOrderChargeValue('${key}','rate',this.value)"><span>%</span></label>`;
 return `<p class="mut">${'Charges apply from top to bottom. A disabled row keeps its rate and can be enabled again. Defaults: Data → Setup.'}</p><div class="metric-order-charge-editor">
  ${toggle('energy','Energy Surcharge',pct('energy'))}
  ${toggle('hst','HST',pct('hst')+`<small>${salesChargeBaseText(c.hst.base)}. ${'Payment method does not disable tax automatically.'}</small>`)}
   ${toggle('card','Card fee',`<label>${'Card'}<select onchange="salesSetCardNetwork(this.value)">${(()=>{const list=orderSetup().cardNetworks.slice();if(c.card.network&&!list.some(n=>n.id===c.card.network))list.push({id:c.card.network,name:c.card.name});return list.map(n=>`<option value="${esc(n.id)}" ${c.card.network===n.id?'selected':''}>${esc(n.name||n.id)}</option>`).join('');})()}</select></label>${pct('card')}<small>${salesChargeBaseText(c.card.base)}</small>`)}
   ${toggle('delivery','Delivery',`<label>${'Fixed amount'}<input type="number" min="0" step="0.01" value="${c.delivery.amount}" onchange="salesSetOrderChargeValue('delivery','amount',this.value)"><span>${esc(soDraft.currency)}</span></label><small>${(b=>b.length?'In the '+b.join(' and ')+' base.':'Excluded from the ES, HST and Card fee bases.')([['hst','HST'],['card','Card fee']].filter(([k])=>c[k].base.includes('delivery')).map(x=>x[1]))}</small>`)}
   ${toggle('skidDeposit','Skid Deposit',`<label>${'Fixed amount'}<input type="number" min="0" step="0.01" value="${c.skidDeposit.amount}" onchange="salesSetOrderChargeValue('skidDeposit','amount',this.value)"><span>${esc(soDraft.currency)}</span></label><small>${'Customer skid deposit; excluded from all fee bases.'}</small>`)}
 </div>${salesAdjustmentsHTML()}<div class="metric-order-charge-preview">${salesCommercialOrderSummary()}</div>`;
}
function salesColumnsPanel(){
 const p=salesLoadViewPrefs();
 const order=salesOrderColumnOrder(),rows=order.map((key,i)=>{const c=SALES_METRIC_COLUMNS.find(x=>x.key===key)||SALES_ORDER_BASE_COLUMNS.find(x=>x.key===key),metric=SALES_METRIC_COLUMNS.some(x=>x.key===key);return `<div class="metric-column-row" draggable="true" ondragstart="salesMetricDragStart(event,'${c.key}')" ondragend="salesMetricDragEnd(event)" ondragover="event.preventDefault()" ondrop="salesMetricDrop(event,'${c.key}')"><span class="metric-drag" title="${'Drag column'}">⋮⋮</span><span data-raw>${c.label}</span><span class="metric-move"><button type="button" aria-label="Move ${c.label} left" ${i===0?'disabled':''} onclick="salesMoveMetricColumn('${c.key}',-1)">←</button><button type="button" aria-label="Move ${c.label} right" ${i===order.length-1?'disabled':''} onclick="salesMoveMetricColumn('${c.key}',1)">→</button></span>${metric?['screen'].map(ctx=>`<label><input type="checkbox" aria-label="${ctx} ${c.label}" ${salesMetricColumnsFor(ctx).some(x=>x.key===c.key)?'checked':''} onchange="salesSetMetricColumn('${ctx}','${c.key}',this.checked)"></label>`).join(''):`<span class="metric-required" title="${'Required order column'}">●</span>`}</div>`;}).join('');
 return `<label class="metric-profile">${'View preferences for'}<select onchange="salesSetViewProfile(this.value)"><option value="browser">${'This browser'}</option>${(DB.user||[]).map(u=>`<option data-raw value="${esc(u.viewProfileId)}" ${p.active===u.viewProfileId?'selected':''}>${esc(u.name)}</option>`).join('')}</select></label><p class="mut">${'Visibility, order and widths save automatically in this browser. Drag a row or use the arrows.'}</p><div class="metric-column-grid"><div class="metric-column-head"><span></span><span>${'Column'}</span><span>${'Order'}</span><b>${'Screen'}</b></div>${rows}</div><div class="sl-actions metric-column-actions"><button type="button" class="sl-btn" data-standard-view onclick="salesResetMetricColumns('screen')">Standard view</button><button type="button" class="sl-btn" data-reset-widths ${cwFixed('lines')?'':'disabled'} onclick="salesResetLineWidths()">Reset widths</button></div>${salesViewSaveFailed?`<p class="metric-incomplete">${'Browser preferences could not be saved. Selections apply until this page closes.'}</p>`:''}`;
}
function salesAreaPanel(line){
 const a=salesLineAreas(line,soDraft);
 return `<div class="metric-explanation"><p>${'Areas are per unit. Qty does not change a single unit’s area.'}</p><dl><dt>Actual Area</dt><dd>${a.valid?a.actual.toFixed(4):'—'} ft²</dd><dt>Rounded Area</dt><dd>${a.valid?`${a.roundedWidth} × ${a.roundedHeight}″ ÷ 144 → ${a.rounded.toFixed(1)} ft²`:'—'}</dd><dt>Billable Area</dt><dd>${a.valid?a.billable.toFixed(1):'—'} ft²${a.minArea?' · '+esc(a.minArea.name):''}</dd></dl><p>${'Actual Area is the finished contour area. Rounded Area uses bounding dimensions, each rounded up to a whole inch, then rounds the area to one decimal place. Billable Area applies the billing minimum.'}</p><p>${'Materials and Shape Unit use Billable Area. Edges use length, per-piece work uses quantity, and surface treatments retain their processing area. Weight uses actual geometry.'}</p></div>`;
}
/* Цена руками: своя цена юнита вместо расчёта, в любой строке, даже в батче
   и после выдачи. Clear возвращает расчёт. */
function salesSetLinePriceManual(lineId,value){
 const l=soDraft&&(soDraft.lines||[]).find(x=>x.id===lineId);if(!l)return;
 if(String(value).trim()===''){delete l.priceManual;}else{const n=salesNonNegOrNull(value);if(n==null){alert('Enter a price of zero or greater.');render();return;}l.priceManual=n;}
 touch();render();
}
function salesPriceManualHTML(line,p,cur){
 const on=line.priceManual!=null,calc=p.manual?p.computedUnit:p.unit;
 return `<div class="metric-manual${on?' on':''}" data-price-manual><label>Price by hand<input type="number" min="0" step="0.01" data-price-manual-input value="${on?esc(line.priceManual):''}" placeholder="${calc==null?'':calc.toFixed(2)}" onchange="salesSetLinePriceManual('${esc(line.id)}',this.value)"><span>${cur} / unit</span></label>${on?`<button type="button" class="sm" data-price-manual-clear onclick="salesSetLinePriceManual('${esc(line.id)}','')">Clear</button>`:''}<small>${on?'Calculated '+(calc==null?'—':calc.toFixed(2)+' '+cur):'Empty — calculated price'}</small></div>`;
}
/* Части материалов, когда у айтема своя единица продажи или минимум, и
   всегда — части обвязки по рецепту (этап 3 плана Master Data). */
function salesMaterialRowsHTML(p){
 if(!(p.materialRows||[]).some(r=>r.special||r.cavity!=null))return '';
 const unit=u=>{const x=mdUnit(u);return x?x.nameEn:u;},num=v=>v==null?'—':(Math.round(v*1000)/1000).toString();
 return `<div class="metric-material-rows mut" data-material-rows>${p.materialRows.map(r=>`<div class="metric-price-row"><span>${esc(r.label)} · ${r.price==null?'no price':esc(r.price.toFixed(2))+' / '+esc(unit(r.unit))+' × '+esc(num(r.qty))}${r.note?` <span class="pill warn">${esc(r.note)}</span>`:''}</span><b data-raw>${r.amount==null?'—':r.amount.toFixed(2)}</b></div>`).join('')}</div>`;
}
function salesPricePanel(line){
 const p=salesLineCommercialPrice(line,soDraft),cur=esc(soDraft.currency),row=(label,value)=>`<div class="metric-price-row"><span>${label}</span><b data-raw>${value==null?'—':value.toFixed(2)+' '+cur}</b></div>`;
 return salesPriceManualHTML(line,p,cur)+`<p class="mut">${'Calculation for one finished unit'}</p>${row('Materials'+((p.materialRows||[]).some(r=>r.special||r.cavity!=null)?'':` · ${p.materialRate.toFixed(2)} × ${p.areas.billable==null?'—':p.areas.billable.toFixed(1)} ft²`),p.missingMaterials||p.unsupportedCurrency?null:p.materials)}${salesMaterialRowsHTML(p)}${row('Services and processing',p.missingServices||p.unsupportedCurrency?null:p.services)}${row('Base unit price',p.missingMaterials||p.missingServices||p.unsupportedCurrency?null:p.base)}${p.adjustments.map(a=>row(`${esc(a.label)} · +${a.percent}% × ${a.base.toFixed(2)}`,p.complete?a.amount:null)).join('')}${row('Unit Price',p.unit)}${row('Line Total · Qty '+p.qty,p.line)}${p.unsupportedCurrency?`<p class="metric-incomplete">${'Catalog prices are in CAD. USD totals require a defined currency conversion; CAD amounts are not relabelled as USD.'}</p>`:''}${!p.complete?`<p class="metric-incomplete">${'Calculation incomplete: check dimensions and material / service prices.'}</p>`:''}<p class="mut">${'Surcharges from Data → Works. Before energy surcharge, tax and delivery.'}</p><button type="button" onclick="salesMetricsPanel=null;salesOpenLineServices('${esc(line.id)}')">${'Open services'}</button>`;
}
/* Надбавки — работы Data → Works с правилом. Окно показывает каталог этого
   заказа (сохранённый — снимок на Save) и числа самого заказа: процент,
   минимальную площадь и порог площади меняют только для этого заказа
   (пункт 15 плана, владелец 29.10.2026; вид — вариант 1 с включателем из
   варианта 3). Data → Works, прайсы и другие заказы не меняются. Пустое поле
   или Reset — каталог; 0 или выключатель — надбавка не идёт в цену. */
let salesSurchargeError=null;
function salesOrderSurchargeCount(o){const own=o&&o.surchargeRates;return own?salesSurchargeCatalog(o).filter(x=>own[x.id]).length:0;}
function salesSurchargeLocked(){return !soDraft||salesOrderReadOnly(soDraft)||typeof salesSaveJob!=='undefined'&&!!salesSaveJob;}
function salesSurchargeEdit(id,fn){
 if(salesSurchargeLocked())return;
 const all=Object.assign({},soDraft.surchargeRates||{}),x=Object.assign({},all[id]||{});
 fn(x);
 if(Object.keys(x).length)all[id]=x;else delete all[id];
 if(Object.keys(all).length)soDraft.surchargeRates=all;else delete soDraft.surchargeRates;
 render();
}
function salesSetOrderSurcharge(id,field,value){
 if(!['value','areaOver','areaUnder'].includes(field))return;
 const txt=String(value==null?'':value).trim(),n=Number(txt);
 if(txt!==''&&(!Number.isFinite(n)||n<0||field!=='value'&&n===0)){salesSurchargeError={id,field,text:field==='value'?'Enter 0 or more':'Enter more than 0'};render();return;}
 salesSurchargeError=null;
 salesSurchargeEdit(id,x=>{
  if(txt===''){delete x[field];return;}
  if(field==='value'&&n===0){x.off=true;delete x.value;return;}
  x[field]=Math.round(n*10000)/10000;if(field==='value')delete x.off;
 });
}
function salesSetOrderSurchargeOn(id,on){salesSurchargeError=null;salesSurchargeEdit(id,x=>{if(on)delete x.off;else x.off=true;});}
function salesResetOrderSurcharge(id){salesSurchargeError=null;salesSurchargeEdit(id,x=>{Object.keys(x).forEach(k=>delete x[k]);});}
function salesSurchargeInput(x,field,own,locked){
 const err=salesSurchargeError&&salesSurchargeError.id===x.id&&salesSurchargeError.field===field?salesSurchargeError.text:'';
 const set=own&&own[field]!=null,catalog=field==='value'?x.value:x.rule[field];
 return `<input type="text" inputmode="decimal" class="${set?'own':''}${err?' bad':''}" data-surcharge-input="${esc(x.id)}:${field}" aria-label="${esc(x.name)} ${field==='value'?'order value':field==='areaOver'?'area over':'area under'}" value="${set?esc(own[field]):''}" placeholder="${esc(catalog)}" ${locked?'disabled':''} onchange="salesSetOrderSurcharge('${esc(x.id)}','${field}',this.value)">${err?`<em class="metric-surcharge-error" data-surcharge-error>${esc(err)}</em>`:''}`;
}
function salesRulePanel(){
 const rows=salesSurchargeCatalog(soDraft),own=soDraft.surchargeRates||{},cur=esc(soDraft.currency||'CAD'),locked=salesSurchargeLocked();
 const groups=new Map(salesOrderCommercialAdjustments(soDraft).map(g=>[g.key,g])),total=salesMoney([...groups.values()].reduce((n,g)=>n+g.total,0));
 const minLines=id=>(soDraft.lines||[]).filter(l=>{const a=salesLineAreas(l,soDraft);return a.minArea&&a.minArea.id===id;}).length;
 const plural=(n,w)=>n+' '+w+(n===1?'':'s');
 const row=x=>{
  const o=own[x.id]||null,eff=salesSurcharges(soDraft).find(y=>y.id===x.id)||null,on=!!eff,min=x.rule.kind==='minArea',unit=min?'ft²':'%';
  const types=x.rule.unitTypes&&x.rule.unitTypes.length?x.rule.unitTypes.map(t=>t[0].toUpperCase()+t.slice(1)).join(' / ')+' units':'Any unit';
  const applies=types+(x.rule.areaOver!=null?`, area &gt; ${salesSurchargeInput(x,'areaOver',o,locked)} ft²`:'')+(x.rule.areaUnder!=null?`, area &lt; ${salesSurchargeInput(x,'areaUnder',o,locked)} ft²`:'');
  const tag=!on?['off','OFF']:o?['order','ORDER']:x.from?['list','LIST']:['catalog','CATALOG'];
  const g=groups.get('svc:'+x.id),lines=min&&on?minLines(x.id):0;
  const effect=!on?'<span class="mut">Off · not charged</span>':min?(lines?`${plural(lines,'line')} at ${esc(eff.value)} ft²`:`<span class="mut">No lines under ${esc(eff.value)} ft²</span>`)
   :g?`<small>${plural(g.lines,'line')} · ${plural(g.qty,'unit')}</small><b data-raw>${g.incomplete?'—':'+'+g.total.toFixed(2)+' '+cur}</b>`:'<span class="mut">Not in this order</span>';
  return `<div class="metric-surcharge-row${on?'':' off'}" data-surcharge="${esc(x.id)}"><label class="ncr-switch" title="${on?'On':'Off'}"><input type="checkbox" role="switch" aria-label="${esc(x.name)} on" ${on?'checked':''} ${locked?'disabled':''} onchange="salesSetOrderSurchargeOn('${esc(x.id)}',this.checked)"><span></span></label><span><b>${esc(x.name)}</b><small>${min?'Billable area per unit':'% of unit price'}</small></span><span class="metric-surcharge-applies">${applies}</span><span data-raw>${esc(salesSurchargeShown(x))}${x.from?`<small>${esc(priceListName(x.from))}</small>`:''}</span><span class="metric-surcharge-rate"><span>${salesSurchargeInput(x,'value',o,locked)}<i>${unit}</i></span><small class="sales-rate-origin ${tag[0]}">${tag[1]}</small></span><span class="metric-surcharge-effect">${effect}</span><button type="button" class="sm" ${o&&!locked?'':'disabled'} onclick="salesResetOrderSurcharge('${esc(x.id)}')">Reset to Catalog</button></div>`;
 };
 return `<div class="metric-surcharges" data-surcharge-list><p class="mut">${'This order only. Data → Works unchanged.'}</p>${rows.length?`<div class="metric-surcharge-table"><div class="metric-surcharge-row head"><span></span><span>Surcharge</span><span>Applies to</span><span>Catalog</span><span>Order</span><span>This order</span><span></span></div>${rows.map(row).join('')}</div><div class="metric-surcharge-foot"><span><b>Off</b> — not charged · <b>Empty</b> — Catalog</span><span>Surcharges in this order <b data-raw>${total.toFixed(2)} ${cur}</b></span></div>`:`<p class="mut">No surcharges</p>`}</div>`;
}
function salesWeightNormDisplay(row){
 if(row.rate==null)return {value:'',unit:row.unit||'',factor:1};
 if(row.unit==='kg/ft²')return {value:String(Math.round(row.rate*1000000)/1000),unit:'g/ft²',factor:1000};
 if(row.unit==='kg/unit')return {value:String(Math.round(row.rate*1000000)/1000),unit:'g/unit',factor:1000};
 return {value:String(Math.round(row.rate*1000000)/1000000),unit:row.unit||'',factor:1};
}
function salesWeightBasisDisplay(row){
 if(row.basisText)return row.basisText;
 if(!row.key||row.basis==null)return '—';
 const unit={'kg/ft²':'ft²','kg/unit':'unit','kg/m³':'m³','kg/m':'m','kg/m²':'m²'}[row.unit]||'';
 const digits=row.unit==='kg/m³'?5:row.unit==='kg/unit'?0:3;
 return row.basis.toFixed(digits)+(unit?' '+unit:'');
}
function salesWeightRow(row,index,editable){
 const d=salesWeightNormDisplay(row),norm=row.key?(editable?`<input aria-label="Weight norm ${index+1}" type="number" min="0" step="any" value="${d.value}" data-row="${index}" data-factor="${d.factor}" onchange="salesSaveWeightNorm(+this.dataset.row,this.value,+this.dataset.factor)">`:d.value||'—'):'—';
 return `<tr><td>${raw(row.label)}<small>${esc(row.note)}</small></td><td data-raw>${salesWeightBasisDisplay(row)}</td><td>${norm}<small>${d.unit}</small></td><td data-raw>${row.kg==null?'—':row.kg.toFixed(3)}</td></tr>`;
}
function salesWeightPanel(line){
 const w=salesLineWeight(line,soDraft);
 return `<p>${'Calculated weight of all components in one unit. An empty norm means missing data, not zero weight.'}</p><button type="button" onclick="salesMetricsEditWeights=!salesMetricsEditWeights;render()">${salesMetricsEditWeights?'Close weight norms':'Edit weight norms'}</button>${salesMetricsEditWeights?`<p class="mut">${'Norms apply across all orders. Area norms and connectors are entered in grams; calculation converts them to kg.'}</p>`:''}<div class="metric-detail-scroll"><table class="metric-weight-table"><thead><tr><th>${'Component'}</th><th>${'Basis'}</th><th>${'Norm'}</th><th>kg / unit</th></tr></thead><tbody>${w.rows.map((r,i)=>salesWeightRow(r,i,salesMetricsEditWeights)).join('')}</tbody></table></div><div class="metric-price-row"><span>Unit Weight</span><b data-raw>${w.complete?w.kg.toFixed(2)+' kg':'—'}</b></div><div class="metric-price-row"><span>Line Weight · Qty ${line.qty}</span><b data-raw>${w.complete?w.lineKg.toFixed(2)+' kg':'—'}</b></div>${!w.complete?`<p class="metric-incomplete">${'Weight incomplete. Known components'}: ${w.knownKg.toFixed(2)} kg/unit · ${w.missing} ${'items need data'}</p>${w.gaps.length?`<p class="metric-incomplete" data-weight-where>${w.gaps.map(g=>esc(g.what)+' → '+esc(g.where)).join('<br>')}</p>`:''}`:''}<h4>${'Additional components'}</h4><p class="mut">${'Supplied items only: hardware, fasteners and other components. A Clamp / Hinge processing mark does not itself mean hardware is supplied.'}</p>${(line.weightExtras||[]).map((x,i)=>`<div class="metric-extra"><input aria-label="Component name ${i+1}" value="${esc(x.label)}" placeholder="Component" oninput="salesSetWeightExtra(${i},'label',this.value)"><input aria-label="Component kg ${i+1}" type="number" min="0" step="any" value="${x.kg==null?'':x.kg}" placeholder="kg / unit" onchange="salesSetWeightExtra(${i},'kg',this.value)"><button type="button" onclick="salesRemoveWeightExtra(${i})">×</button></div>`).join('')}<button type="button" onclick="salesAddWeightExtra()">+ ${'Component'}</button>`;
}
function salesMetricsLine(){return soDraft&&(soDraft.lines||[]).find(l=>l.id===salesMetricsLineId);}
function salesSaveWeightNorm(index,value,factor){
 const line=salesMetricsLine();if(!line)return;
 const row=salesLineWeight(line,soDraft).rows[index];if(!row||!row.key)return;
 const shown=mdNonNeg(value),rate=shown==null?null:shown/(factor||1);if(value.trim()!==''&&shown==null){alert('Enter a non-negative weight norm.');render();return;}
 const old=(DB.materialWeightRates||[]).find(r=>r.key===row.key);
 if(old){old.rate=rate;old.derived=false;}else DB.materialWeightRates.push({key:row.key,rate:rate,note:'',derived:false});
 /* Норма, замороженная в этом заказе, меняется вместе с общей — как правила цены. */
 if(soDraft.priceBook&&Object.prototype.hasOwnProperty.call(soDraft.priceBook,'weight:'+row.key))soDraft.priceBook['weight:'+row.key]=rate;touch();render();
}
function salesAddWeightExtra(){const l=salesMetricsLine();if(!l)return;if(!l.weightExtras)l.weightExtras=[];l.weightExtras.push({label:'',kg:null});render();}
function salesRemoveWeightExtra(i){const l=salesMetricsLine();if(l){l.weightExtras.splice(i,1);render();}}
function salesSetWeightExtra(i,key,value){const l=salesMetricsLine(),x=l&&l.weightExtras[i];if(!x)return;if(key==='label')x.label=value;else{x.kg=mdNonNeg(value);render();}}
function salesMetricsModal(){
 if(!salesMetricsPanel||!soDraft)return '';
 const panel=salesMetricsPanel,line=salesMetricsLine(),titles={columns:'Order columns',rules:'Surcharges',orderCharges:'Order charges',area:'Unit area',weight:'Unit weight',price:'Unit price'};
 if(!titles[panel]||!line&&['area','weight','price'].includes(panel))return '';
 const content=panel==='columns'?salesColumnsPanel():panel==='rules'?salesRulePanel():panel==='orderCharges'?salesOrderChargesPanel():panel==='area'?salesAreaPanel(line):panel==='weight'?salesWeightPanel(line):salesPricePanel(line);
 return `<div class="sales-service-modal-back metric-modal-back" onclick="if(event.target===this)salesCloseMetrics()"><div role="dialog" aria-modal="true" aria-label="${esc(titles[panel])}" class="sales-service-modal metric-modal${panel==='rules'?' metric-modal-wide':''}"><div class="sales-service-modal-head"><h3>${esc(titles[panel])}${line?' · '+(soDraft.lines.indexOf(line)+1):''}</h3><button type="button" aria-label="Close" onclick="salesCloseMetrics()">×</button></div><div class="metric-modal-body">${content}</div></div></div>`;
}
/* Refresh computed cells without replacing the input currently receiving Tab. */
function salesRefreshLineMetrics(line){
 const tr=Array.from(document.querySelectorAll('tr[data-metrics-line-id]')).find(el=>el.dataset.metricsLineId===line.id);
 if(tr){
  const holder=document.createElement('tr');holder.innerHTML=salesMetricCells(line,'screen');
  const next=Array.from(holder.children);tr.querySelectorAll('td[data-metric]').forEach((cell,i)=>{if(next[i])cell.replaceWith(next[i]);});
  const services=tr.querySelector('.line-services-cell');if(services)services.innerHTML=salesLineServicesSummary(line);
 }
 const total=document.querySelector('.sales-lines-block>.metric-order-total');if(total){const warning=total.previousElementSibling;if(warning&&warning.matches('[data-order-review]'))warning.remove();total.outerHTML=salesCommercialOrderSummary();}
 const prices=document.querySelector('.sales-services-order-btn .sales-order-price-summary');
 if(prices){const p=salesOrderPricingSummary(),commercial=salesOrderCommercialAdjustments(soDraft),commercialLines=commercial.reduce((n,g)=>n+g.lines,0);prices.innerHTML=`<b>${p.total.toFixed(2)} ${esc(soDraft.currency)}</b>${p.unpriced?`<small>${p.unpriced} no rate</small>`:(commercial.length?`<small>${commercialLines} price adjustment${commercialLines===1?'':'s'}</small>`:'')}`;}

}
