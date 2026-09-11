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
const salesMetricText=(ru,en)=>LANG==='ru'?ru:en;
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
 if(!['screen','print'].includes(context)||!SALES_METRIC_COLUMNS.some(c=>c.key===key))return;
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
 const p=salesLoadViewPrefs();if(p.profiles[p.active]){delete p.profiles[p.active][context];delete p.profiles[p.active].order;}
 salesSaveViewPrefs();render();
}
function salesOpenMetrics(panel,id){salesMetricsPanel=panel;salesMetricsLineId=id||null;salesMetricsEditWeights=false;render();}
function salesCloseMetrics(){salesMetricsPanel=null;render();}
function salesMetricsTools(){return `<button type="button" onclick="salesOpenMetrics('columns')">${salesMetricText('Columns','Columns')}</button><button type="button" onclick="salesOpenMetrics('rules')">${salesMetricText('Pricing rules','Pricing rules')}</button>`;}
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
  const body=`<b data-raw>${text}</b>`;
  return `<td class="line-metric${value==null?' metric-incomplete':''}" data-metric="${c.key}">${context==='screen'?`<button type="button" class="metric-cell-btn" data-line-id="${esc(line.id)}" onclick="salesOpenMetrics('${panel}',this.dataset.lineId)">${body}</button>`:body}</td>`;
}
function salesCommercialOrderSummary(interactive){
 const t=salesOrderCommercialTotals(soDraft),c=t.charges,cur=esc(soDraft.currency),money=v=>t.complete?v.toFixed(2):'—';
 const item=(key,label,rate,value,shown)=>`<span class="metric-order-charge-item charge-${key}${shown?'':' is-empty'}"><span class="metric-order-charge-label">${label}${rate!=null?` <small data-raw>${rate}%</small>`:''}</span><b data-raw>${shown?money(value):''}</b></span>`;
 const rows=[item('subtotal','Subtotal',null,t.subtotal,true),item('energy','ES',c.energy.rate,t.energy,c.energy.enabled),item('hst','HST',c.hst.rate,t.hst,c.hst.enabled),item('card',esc(salesCardNetworkLabel(c.card.network)),c.card.rate,t.card,c.card.enabled),item('delivery','Delivery',null,t.delivery,c.delivery.enabled),item('skid','Skid Deposit',null,t.skidDeposit,c.skidDeposit.enabled)];
 rows.push(`<span class="metric-order-charge-item charge-total metric-grand-total"><span class="metric-order-charge-label">Total</span><b data-raw>${money(t.grand)}</b>${t.missing?`<small>${t.missing} ${salesMetricText('lines need pricing','lines need pricing')}</small>`:''}</span>`);
 const serviceButton=interactive===false?'':`<button type="button" class="metric-order-service-add" onclick="salesOpenMetrics('orderCharges')">Service +</button>`;
 return `<div class="metric-order-total">${serviceButton}<div class="metric-order-total-main"><small>${salesMetricText('Entire order','Entire order')} · ${t.qty} ${salesMetricText('pcs','units')} · <span class="metric-order-currency" data-raw>${cur}</span></small><div class="metric-order-charge-lines">${rows.join('')}</div></div></div>`;
}
function salesCardNetworkLabel(value){return ({visa:'Visa card fee',mastercard:'Mastercard fee',amex:'American Express fee'})[value]||'Card fee';}
function salesSetOrderChargeEnabled(key,enabled){
 if(!['energy','hst','card','delivery','skidDeposit'].includes(key))return;
 soDraft.orderCharges=normalizeSalesOrderCharges(soDraft.orderCharges);soDraft.orderCharges[key].enabled=!!enabled;touch();render();
}
function salesSetOrderChargeValue(key,field,value){
 if(!soDraft||!['energy','hst','card','delivery','skidDeposit'].includes(key)||!['rate','amount'].includes(field))return;
 const n=Number(value);if(!Number.isFinite(n)||n<0){alert('Enter a value of zero or greater.');render();return;}
 soDraft.orderCharges=normalizeSalesOrderCharges(soDraft.orderCharges);soDraft.orderCharges[key][field]=n;touch();render();
}
function salesSetCardNetwork(network){
 if(!Object.prototype.hasOwnProperty.call(SALES_CARD_FEE_RATES,network))return;
 soDraft.orderCharges=normalizeSalesOrderCharges(soDraft.orderCharges);soDraft.orderCharges.card.network=network;soDraft.orderCharges.card.rate=SALES_CARD_FEE_RATES[network];touch();render();
}
function salesOrderChargesPanel(){
 const c=normalizeSalesOrderCharges(soDraft.orderCharges),toggle=(key,label,body)=>`<div class="metric-order-charge-row ${c[key].enabled?'on':''}"><label><input type="checkbox" ${c[key].enabled?'checked':''} onchange="salesSetOrderChargeEnabled('${key}',this.checked)"><b>${label}</b></label>${body}</div>`;
 const pct=(key)=>`<label>${salesMetricText('Rate','Rate')}<input type="number" min="0" step="0.01" value="${c[key].rate}" onchange="salesSetOrderChargeValue('${key}','rate',this.value)"><span>%</span></label>`;
 return `<p class="mut">${salesMetricText('Charges are applied top to bottom. A disabled row keeps its rate and can be switched back on.','Charges apply from top to bottom. A disabled row keeps its rate and can be enabled again.')}</p><div class="metric-order-charge-editor">
  ${toggle('energy','Energy Surcharge',pct('energy'))}
  ${toggle('hst','HST',pct('hst')+`<small>${salesMetricText('The payment method does not switch the tax off by itself.','Payment method does not disable tax automatically.')}</small>`)}
   ${toggle('card','Card fee',`<label>${salesMetricText('Card','Card')}<select onchange="salesSetCardNetwork(this.value)">${Object.keys(SALES_CARD_FEE_RATES).map(k=>`<option value="${k}" ${c.card.network===k?'selected':''}>${esc(salesCardNetworkLabel(k))}</option>`).join('')}</select></label>${pct('card')}`)}
   ${toggle('delivery','Delivery',`<label>${salesMetricText('Fixed amount','Fixed amount')}<input type="number" min="0" step="0.01" value="${c.delivery.amount}" onchange="salesSetOrderChargeValue('delivery','amount',this.value)"><span>${esc(soDraft.currency)}</span></label><small>${salesMetricText('Not included in the ES, HST or Card fee base.','Excluded from the ES, HST and Card fee bases.')}</small>`)}
   ${toggle('skidDeposit','Skid Deposit',`<label>${salesMetricText('Fixed amount','Fixed amount')}<input type="number" min="0" step="0.01" value="${c.skidDeposit.amount}" onchange="salesSetOrderChargeValue('skidDeposit','amount',this.value)"><span>${esc(soDraft.currency)}</span></label><small>${salesMetricText('Customer skid deposit; not part of the fee base.','Customer skid deposit; excluded from all fee bases.')}</small>`)}
 </div><div class="metric-order-charge-preview">${salesCommercialOrderSummary()}</div>`;
}
function salesColumnsPanel(){
 const p=salesLoadViewPrefs();
 const order=salesOrderColumnOrder(),rows=order.map((key,i)=>{const c=SALES_METRIC_COLUMNS.find(x=>x.key===key)||SALES_ORDER_BASE_COLUMNS.find(x=>x.key===key),metric=SALES_METRIC_COLUMNS.some(x=>x.key===key);return `<div class="metric-column-row" draggable="true" ondragstart="salesMetricDragStart(event,'${c.key}')" ondragend="salesMetricDragEnd(event)" ondragover="event.preventDefault()" ondrop="salesMetricDrop(event,'${c.key}')"><span class="metric-drag" title="${salesMetricText('Drag a column','Drag column')}">⋮⋮</span><span data-raw>${c.label}</span><span class="metric-move"><button type="button" aria-label="Move ${c.label} left" ${i===0?'disabled':''} onclick="salesMoveMetricColumn('${c.key}',-1)">←</button><button type="button" aria-label="Move ${c.label} right" ${i===order.length-1?'disabled':''} onclick="salesMoveMetricColumn('${c.key}',1)">→</button></span>${metric?['screen','print'].map(ctx=>`<label><input type="checkbox" aria-label="${ctx} ${c.label}" ${salesMetricColumnsFor(ctx).some(x=>x.key===c.key)?'checked':''} onchange="salesSetMetricColumn('${ctx}','${c.key}',this.checked)"></label>`).join(''):`<span class="metric-required" title="${salesMetricText('Core order column','Required order column')}">●</span><span class="metric-required">—</span>`}</div>`;}).join('');
 return `<label class="metric-profile">${salesMetricText('View settings for','View preferences for')}<select onchange="salesSetViewProfile(this.value)"><option value="browser">${salesMetricText('This browser','This browser')}</option>${(DB.user||[]).map(u=>`<option data-raw value="${esc(u.viewProfileId)}" ${p.active===u.viewProfileId?'selected':''}>${esc(u.name)}</option>`).join('')}</select></label><p class="mut">${salesMetricText('Selection and the screen and print order are saved automatically in this browser. Drag a row or use the arrows.','Visibility and order for screen and print save automatically in this browser. Drag a row or use the arrows.')}</p><div class="metric-column-grid"><div class="metric-column-head"><span></span><span>${salesMetricText('Column','Column')}</span><span>${salesMetricText('Order','Order')}</span><b>${salesMetricText('Screen','Screen')}</b><b>${salesMetricText('Print','Print')}</b></div>${rows}<div class="metric-column-reset"><span>${salesMetricText('Standard view','Standard view')}</span>${['screen','print'].map(ctx=>`<button type="button" class="sm" onclick="salesResetMetricColumns('${ctx}')">${salesMetricText('Restore','Reset')}</button>`).join('')}</div></div>${salesViewSaveFailed?`<p class="metric-incomplete">${salesMetricText('Browser settings could not be saved. The selection lasts until the page is closed.','Browser preferences could not be saved. Selections apply until this page closes.')}</p>`:''}`;
}
function salesAreaPanel(line){
 const a=salesLineAreas(line,soDraft);
 return `<div class="metric-explanation"><p>${salesMetricText('Areas are given for one unit. Qty does not change the area of a single unit.','Areas are per unit. Qty does not change a single unit’s area.')}</p><dl><dt>Actual Area</dt><dd>${a.valid?a.actual.toFixed(4):'—'} ft²</dd><dt>Rounded Area</dt><dd>${a.valid?`${a.roundedWidth} × ${a.roundedHeight}″ ÷ 144 → ${a.rounded.toFixed(1)} ft²`:'—'}</dd><dt>Billable Area</dt><dd>${a.valid?a.billable.toFixed(1):'—'} ft²</dd></dl><p>${salesMetricText('Actual Area is the area of the finished contour. Rounded Area uses the bounding size with each side rounded up to a whole inch and the area rounded to a tenth. Billable Area applies the minimum billable area.','Actual Area is the finished contour area. Rounded Area uses bounding dimensions, each rounded up to a whole inch, then rounds the area to one decimal place. Billable Area applies the billing minimum.')}</p><p>${salesMetricText('Materials and the Shape Unit are calculated from Billable Area. Edgework goes by length and per-piece works by count; coatings keep their own treated area. Weight is calculated from the actual geometry.','Materials and Shape Unit use Billable Area. Edges use length, per-piece work uses quantity, and surface treatments retain their processing area. Weight uses actual geometry.')}</p></div>`;
}
function salesPricePanel(line){
 const p=salesLineCommercialPrice(line,soDraft),cur=esc(soDraft.currency),row=(label,value)=>`<div class="metric-price-row"><span>${label}</span><b data-raw>${value==null?'—':value.toFixed(2)+' '+cur}</b></div>`;
 return `<p class="mut">${salesMetricText('Calculation for one finished unit','Calculation for one finished unit')}</p>${row(salesMetricText('Materials','Materials')+` · ${p.materialRate.toFixed(2)} × ${p.areas.billable==null?'—':p.areas.billable.toFixed(1)} ft²`,p.missingMaterials||p.unsupportedCurrency?null:p.materials)}${row(salesMetricText('Services and processing','Services and processing'),p.missingServices||p.unsupportedCurrency?null:p.services)}${row(salesMetricText('Base unit price','Base unit price'),p.missingMaterials||p.missingServices||p.unsupportedCurrency?null:p.base)}${p.adjustments.map(a=>row(`${esc(a.label)} · +${a.percent}% × ${a.base.toFixed(2)}`,p.complete?a.amount:null)).join('')}${row('Unit Price',p.unit)}${row('Line Total · Qty '+p.qty,p.line)}${p.unsupportedCurrency?`<p class="metric-incomplete">${salesMetricText('The price catalogue is kept in CAD. USD needs an agreed conversion first; the total is not silently replaced by the CAD amount.','Catalog prices are in CAD. USD totals require a defined currency conversion; CAD amounts are not relabelled as USD.')}</p>`:''}${!p.complete?`<p class="metric-incomplete">${salesMetricText('The calculation is incomplete: check the sizes and the material / service prices.','Calculation incomplete: check dimensions and material / service prices.')}</p>`:''}<p class="mut">${salesMetricText('The Triple and Large unit adjustments are each charged on the base unit price, services included. Before the energy surcharge, tax and delivery.','Triple and Large unit each apply to the base unit price including services. Before energy surcharge, tax and delivery.')}</p><button type="button" onclick="salesMetricsPanel=null;salesOpenLineServices('${esc(line.id)}')">${salesMetricText('Open services','Open services')}</button>`;
}
function salesRulePanel(){
 const r=salesMetricRules(soDraft),labels={triplePercent:salesMetricText('Triple units, %','Triple units, %'),largePercent:salesMetricText('Large units, %','Large units, %'),largeThresholdFt2:salesMetricText('Large units: area strictly greater than, ft²','Large units: area strictly above, ft²'),minimumAreaFt2:salesMetricText('Minimum billable area, ft²','Minimum billable area, ft²')};
 return `<form class="metric-rule-form" onsubmit="event.preventDefault();salesSaveMetricRules(this)">${Object.keys(labels).map(k=>`<label>${labels[k]}<input name="${k}" type="number" min="0" step="0.1" required value="${r[k]}"></label>`).join('')}<p>${salesMetricText('Both adjustments are charged on the base unit price with services. With two 50% adjustments: 100 → 200. The threshold is checked against the Billable Area of one unit, before Qty is applied.','Both surcharges use the base unit price including services. Two 50% surcharges: 100 → 200. The threshold uses one unit’s Billable Area, before Qty.')}</p><p class="mut">${salesMetricText('Saved orders keep their own rules. Changes here apply to the open order and become the defaults for new ones.','Saved orders retain their rules. Changes here apply to this order and become defaults for new orders.')}</p><button class="pri" type="submit">${salesMetricText('Apply to this order and to new ones','Apply to this and new orders')}</button></form>`;
}
function salesSaveMetricRules(form){
 const rules={combination:'additive'};
 for(const key of ['triplePercent','largePercent','largeThresholdFt2','minimumAreaFt2']){const n=Number(form.elements[key].value);if(!Number.isFinite(n)||n<0)return;rules[key]=n;}
 DB.salesMetricRules=salesNormalizeMetricRules(rules);soDraft.metricRules=Object.assign({},DB.salesMetricRules);touch();salesCloseMetrics();
}
function salesWeightNormDisplay(row){
 if(row.rate==null)return {value:'',unit:row.unit||'',factor:1};
 if(row.unit==='kg/ft²')return {value:String(Math.round(row.rate*1000000)/1000),unit:'g/ft²',factor:1000};
 if(row.unit==='kg/unit')return {value:String(Math.round(row.rate*1000000)/1000),unit:'g/unit',factor:1000};
 return {value:String(Math.round(row.rate*1000000)/1000000),unit:row.unit||'',factor:1};
}
function salesWeightBasisDisplay(row){
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
 return `<p>${salesMetricText('Calculated weight of every component of one unit. An empty norm means there is no data, not that the weight is zero.','Calculated weight of all components in one unit. An empty norm means missing data, not zero weight.')}</p><button type="button" onclick="salesMetricsEditWeights=!salesMetricsEditWeights;render()">${salesMetricsEditWeights?salesMetricText('Close norms','Close weight norms'):salesMetricText('Edit weight norms','Edit weight norms')}</button>${salesMetricsEditWeights?`<p class="mut">${salesMetricText('The norms are shared by this product across all orders. Area norms and connectors are entered in grams; the calculation converts them to kg itself.','Norms apply across all orders. Area norms and connectors are entered in grams; calculation converts them to kg.')}</p>`:''}<div class="metric-detail-scroll"><table class="metric-weight-table"><thead><tr><th>${salesMetricText('Component','Component')}</th><th>${salesMetricText('Basis','Basis')}</th><th>${salesMetricText('Norm','Norm')}</th><th>kg / unit</th></tr></thead><tbody>${w.rows.map((r,i)=>salesWeightRow(r,i,salesMetricsEditWeights)).join('')}</tbody></table></div><div class="metric-price-row"><span>Unit Weight</span><b data-raw>${w.complete?w.kg.toFixed(2)+' kg':'—'}</b></div><div class="metric-price-row"><span>Line Weight · Qty ${line.qty}</span><b data-raw>${w.complete?w.lineKg.toFixed(2)+' kg':'—'}</b></div>${!w.complete?`<p class="metric-incomplete">${salesMetricText('The weight is incomplete. Known part','Weight incomplete. Known components')}: ${w.knownKg.toFixed(2)} kg/unit · ${w.missing} ${salesMetricText('items need data','items need data')}</p>`:''}<h4>${salesMetricText('Additional components','Additional components')}</h4><p class="mut">${salesMetricText('Only what ships with the unit: hardware, fasteners and the like. A Clamp / Hinge preparation mark does not by itself mean the hardware is supplied.','Supplied items only: hardware, fasteners and other components. A Clamp / Hinge processing mark does not itself mean hardware is supplied.')}</p>${(line.weightExtras||[]).map((x,i)=>`<div class="metric-extra"><input aria-label="Component name ${i+1}" value="${esc(x.label)}" placeholder="Component" oninput="salesSetWeightExtra(${i},'label',this.value)"><input aria-label="Component kg ${i+1}" type="number" min="0" step="any" value="${x.kg==null?'':x.kg}" placeholder="kg / unit" onchange="salesSetWeightExtra(${i},'kg',this.value)"><button type="button" onclick="salesRemoveWeightExtra(${i})">×</button></div>`).join('')}<button type="button" onclick="salesAddWeightExtra()">+ ${salesMetricText('Component','Component')}</button>`;
}
function salesMetricsLine(){return soDraft&&(soDraft.lines||[]).find(l=>l.id===salesMetricsLineId);}
function salesSaveWeightNorm(index,value,factor){
 const line=salesMetricsLine();if(!line)return;
 const row=salesLineWeight(line,soDraft).rows[index];if(!row||!row.key)return;
 const shown=mdNonNeg(value),rate=shown==null?null:shown/(factor||1);if(value.trim()!==''&&shown==null){alert('Enter a non-negative weight norm.');render();return;}
 const old=(DB.materialWeightRates||[]).find(r=>r.key===row.key);
 if(old){old.rate=rate;old.derived=false;}else DB.materialWeightRates.push({key:row.key,rate:rate,note:'',derived:false});touch();render();
}
function salesAddWeightExtra(){const l=salesMetricsLine();if(!l)return;if(!l.weightExtras)l.weightExtras=[];l.weightExtras.push({label:'',kg:null});render();}
function salesRemoveWeightExtra(i){const l=salesMetricsLine();if(l){l.weightExtras.splice(i,1);render();}}
function salesSetWeightExtra(i,key,value){const l=salesMetricsLine(),x=l&&l.weightExtras[i];if(!x)return;if(key==='label')x.label=value;else{x.kg=mdNonNeg(value);render();}}
/* Стоковые позиции — не в цеховом маршруте (там у двери нет производства и
   быть не может), но в печатном ЗАКАЗЕ — обязаны быть: это коммерческий
   документ клиенту, и он должен видеть, за что платит целиком, а не только за
   стекло. Владелец 11 сентября: «в печати я не вижу» — пробел, а не решение. */
function salesOrderPrintExtraRows(){
 const items=soDraft.extraItems||[];if(!items.length)return '';
 const currency=soDraft.currency||'CAD';
 return `<table class="metric-print-extra" style="margin-top:14px"><caption style="text-align:left;font-size:11px;font-weight:700;padding-bottom:6px">Additional items</caption><thead><tr><th>Item</th><th>Qty</th><th>Price, ${esc(currency)}</th><th>Total</th></tr></thead><tbody>${items.map(x=>{
  const total=salesExtraItemLineTotal(x);
  return `<tr><td>${raw(salesExtraItemName(x))}</td><td>${x.qty}</td><td>${total!=null?(total/salesPositiveInt(x.qty,1)).toFixed(2):'—'}</td><td>${total!=null?total.toFixed(2)+' '+esc(currency):'Rate required'}</td></tr>`;
 }).join('')}</tbody></table>`;
}
function salesOrderPrintMarkup(){
 /* Заказ без стекла — только сток — не печатает пустую таблицу стекла с одними
    заголовками: документ клиенту, а не заготовка формы. */
 const glassTable=soDraft.lines.length?`<table><thead><tr><th>#</th><th>MU</th><th>Qty</th><th>Width</th><th>Height</th><th>Mark</th>${salesMetricHeaders('print')}</tr></thead><tbody>${soDraft.lines.map((l,i)=>`<tr><td>${i+1}</td><td>${raw((salesMakeupById(soDraft,l.makeupId)||{}).code)}</td><td>${l.qty}</td><td data-raw>${esc(salesDimFrom16(l.width16))}″</td><td data-raw>${esc(salesDimFrom16(l.height16))}″</td><td>${raw(l.mark)}</td>${salesMetricCells(l,'print')}</tr>`).join('')}</tbody></table>`:'';
 return `<div class="metric-print-order"><h2>${raw(soDraft.businessNumber||'Draft Sales Order')}</h2><p>${raw(salesCustomerDisplay(soDraft.customerId))}${soDraft.customerPo?' · PO '+raw(soDraft.customerPo):''}</p>${glassTable}${salesOrderPrintExtraRows()}${salesMetricColumnsFor('print').some(c=>c.key==='lineTotal')?salesCommercialOrderSummary(false):''}</div>`;
}
function salesMetricsModal(){
 if(!salesMetricsPanel||!soDraft)return '';
 const panel=salesMetricsPanel,line=salesMetricsLine(),titles={columns:salesMetricText('Order columns','Order columns'),rules:salesMetricText('Pricing rules','Pricing rules'),orderCharges:salesMetricText('Order charges','Order charges'),print:salesMetricText('Print preview','Print preview'),area:salesMetricText('Unit area','Unit area'),weight:salesMetricText('Unit weight','Unit weight'),price:salesMetricText('Unit price','Unit price')};
 if(!titles[panel]||!line&&['area','weight','price'].includes(panel))return '';
 const content=panel==='columns'?salesColumnsPanel():panel==='rules'?salesRulePanel():panel==='orderCharges'?salesOrderChargesPanel():panel==='area'?salesAreaPanel(line):panel==='weight'?salesWeightPanel(line):panel==='price'?salesPricePanel(line):`<div class="metric-print-actions"><button onclick="salesOpenMetrics('columns')">${salesMetricText('Print columns','Print columns')}</button><button class="pri" onclick="printSheet(salesOrderPrintMarkup())">${salesMetricText('Print','Print')}</button></div><div class="metric-print-preview">${salesOrderPrintMarkup()}</div>`;
 return `<div class="sales-service-modal-back metric-modal-back" onclick="if(event.target===this)salesCloseMetrics()"><div role="dialog" aria-modal="true" aria-label="${esc(titles[panel])}" class="sales-service-modal metric-modal ${panel==='print'?'metric-modal-wide':''}"><div class="sales-service-modal-head"><h3>${esc(titles[panel])}${line?' · '+(soDraft.lines.indexOf(line)+1):''}</h3><button type="button" aria-label="Close" onclick="salesCloseMetrics()">×</button></div><div class="metric-modal-body">${content}</div></div></div>`;
}
/* Refresh computed cells without replacing the input currently receiving Tab. */
function salesRefreshLineMetrics(line){
 const tr=Array.from(document.querySelectorAll('tr[data-metrics-line-id]')).find(el=>el.dataset.metricsLineId===line.id);
 if(tr){
  const holder=document.createElement('tr');holder.innerHTML=salesMetricCells(line,'screen');
  const next=Array.from(holder.children);tr.querySelectorAll('td[data-metric]').forEach((cell,i)=>{if(next[i])cell.replaceWith(next[i]);});
  const services=tr.querySelector('.line-services-cell');if(services)services.innerHTML=salesLineServicesSummary(line);
 }
 const total=document.querySelector('.sales-lines-block>.metric-order-total');if(total)total.outerHTML=salesCommercialOrderSummary();
 const prices=document.querySelector('.sales-services-order-btn .sales-order-price-summary');
 if(prices){const p=salesOrderPricingSummary(),commercial=salesOrderCommercialAdjustments(soDraft),commercialLines=commercial.reduce((n,g)=>n+g.lines,0);prices.innerHTML=`<b>${p.total.toFixed(2)} ${esc(soDraft.currency)}</b>${p.unpriced?`<small>${p.unpriced} no rate</small>`:(commercial.length?`<small>${commercialLines} price adjustment${commercialLines===1?'':'s'}</small>`:'')}`;}
 if(tr)applyLang(tr);
}
