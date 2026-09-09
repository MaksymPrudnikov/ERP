/* User-selectable screen and print columns; stored independently of orders. */
const SALES_METRIC_COLUMNS=[
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
 {key:'mark',label:'Mark'},{key:'shape',label:'Shape'},{key:'services',label:'Services'},{key:'status',label:'Status'},{key:'notes',label:'Notes'}
];
const SALES_ORDER_DEFAULT_COLUMN_ORDER=['mu','set','qty','width','height','mark','shape','services'].concat(SALES_METRIC_COLUMNS.map(c=>c.key),['status','notes']);
let salesMetricsPanel=null,salesMetricsLineId=null,salesMetricsEditWeights=false;
let salesViewPrefs=null,salesViewSaveFailed=false,salesMetricDragKey=null;
const salesMetricText=(ru,en)=>LANG==='ru'?ru:en;
function salesLoadViewPrefs(){
 if((DB.user||[]).some(u=>!u.viewProfileId)){normalizeUsers();touch();}
 if(salesViewPrefs)return salesViewPrefs;
 try{const p=JSON.parse(localStorage.getItem('glass_erp_line_columns_v1')||'{}');salesViewPrefs=p&&typeof p==='object'&&!Array.isArray(p)?p:{};}catch(e){salesViewPrefs={};}
 if(!salesViewPrefs.profiles||typeof salesViewPrefs.profiles!=='object'||Array.isArray(salesViewPrefs.profiles))salesViewPrefs.profiles={};
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
function salesMetricsTools(){return `<button type="button" onclick="salesOpenMetrics('columns')">${salesMetricText('Колонки','Columns')}</button><button type="button" onclick="salesOpenMetrics('rules')">${salesMetricText('Правила цены','Pricing rules')}</button><button type="button" onclick="salesOpenMetrics('print')">${salesMetricText('Печать заказа','Print order')}</button>`;}
function salesMetricHeaders(context){return salesMetricColumnsFor(context).map(c=>`<th class="line-metric" data-metric="${c.key}"><span data-raw>${c.label}</span></th>`).join('');}
function salesMetricCells(line,context){
 const columns=salesMetricColumnsFor(context),price=salesLineCommercialPrice(line,soDraft),a=price.areas;
 const weight=columns.some(c=>/Weight/.test(c.key))?salesLineWeight(line,soDraft):null;
 return columns.map(c=>salesMetricCell(line,c,context,price,a,weight)).join('');
}
function salesMetricCell(line,c,context,price,a,weight){
 price=price||salesLineCommercialPrice(line,soDraft);a=a||price.areas;
 if(!weight&&/Weight/.test(c.key))weight=salesLineWeight(line,soDraft);
  let value=null,detail='',panel='price';
  if(['actual','rounded','billable'].includes(c.key)){value=a[c.key];panel='area';detail=c.key==='billable'&&a.billable>a.rounded?salesMetricText('Минимум','Minimum'):'';}
  else if(c.key==='unitPrice'||c.key==='lineTotal'){value=c.key==='unitPrice'?price.unit:price.line;detail=price.complete?'':salesMetricText('Нужна цена','Price incomplete');}
  else{value=c.key==='unitWeight'?weight.kg:weight.lineKg;panel='weight';detail=weight.complete?salesMetricText('Расчётный','Calculated'):salesMetricText('Вес неполный','Weight incomplete');}
  const text=value==null?'—':value.toFixed(c.key==='actual'?4:['rounded','billable'].includes(c.key)?1:2);
  const body=`<b data-raw>${text}</b>${detail?`<small>${esc(detail)}</small>`:''}`;
  return `<td class="line-metric${value==null?' metric-incomplete':''}" data-metric="${c.key}">${context==='screen'?`<button type="button" class="metric-cell-btn" data-line-id="${esc(line.id)}" onclick="salesOpenMetrics('${panel}',this.dataset.lineId)">${body}</button>`:body}</td>`;
}
function salesCommercialOrderSummary(){
 let total=0,missing=0,qty=0;
 (soDraft.lines||[]).forEach(l=>{const p=salesLineCommercialPrice(l,soDraft);qty+=p.qty;if(p.complete)total+=p.line;else missing++;});
 return `<div class="metric-order-total"><span>${salesMetricText('Весь заказ','Entire order')} · ${qty} ${salesMetricText('шт.','units')}</span><span>${salesMetricText('Итого строки','Line totals')} <b data-raw>${missing?'—':salesMoney(total).toFixed(2)+' '+esc(soDraft.currency)}</b>${missing?`<small>${missing} ${salesMetricText('строк с неполной ценой','lines need pricing')}</small>`:''}</span><small>${salesMetricText('До energy surcharge, налога и доставки','Before energy surcharge, tax and delivery')}</small></div>`;
}
function salesColumnsPanel(){
 const p=salesLoadViewPrefs();
 const order=salesOrderColumnOrder(),rows=order.map((key,i)=>{const c=SALES_METRIC_COLUMNS.find(x=>x.key===key)||SALES_ORDER_BASE_COLUMNS.find(x=>x.key===key),metric=SALES_METRIC_COLUMNS.some(x=>x.key===key);return `<div class="metric-column-row" draggable="true" ondragstart="salesMetricDragStart(event,'${c.key}')" ondragend="salesMetricDragEnd(event)" ondragover="event.preventDefault()" ondrop="salesMetricDrop(event,'${c.key}')"><span class="metric-drag" title="${salesMetricText('Перетащите колонку','Drag column')}">⋮⋮</span><span data-raw>${c.label}</span><span class="metric-move"><button type="button" aria-label="Move ${c.label} left" ${i===0?'disabled':''} onclick="salesMoveMetricColumn('${c.key}',-1)">←</button><button type="button" aria-label="Move ${c.label} right" ${i===order.length-1?'disabled':''} onclick="salesMoveMetricColumn('${c.key}',1)">→</button></span>${metric?['screen','print'].map(ctx=>`<label><input type="checkbox" aria-label="${ctx} ${c.label}" ${salesMetricColumnsFor(ctx).some(x=>x.key===c.key)?'checked':''} onchange="salesSetMetricColumn('${ctx}','${c.key}',this.checked)"></label>`).join(''):`<span class="metric-required" title="${salesMetricText('Основная колонка заказа','Required order column')}">●</span><span class="metric-required">—</span>`}</div>`;}).join('');
 return `<label class="metric-profile">${salesMetricText('Настройки вида для','View preferences for')}<select onchange="salesSetViewProfile(this.value)"><option value="browser">${salesMetricText('Этот браузер','This browser')}</option>${(DB.user||[]).map(u=>`<option data-raw value="${esc(u.viewProfileId)}" ${p.active===u.viewProfileId?'selected':''}>${esc(u.name)}</option>`).join('')}</select></label><p class="mut">${salesMetricText('Выбор, порядок экрана и печати сохраняются автоматически в этом браузере. Перетяните строку или используйте стрелки.','Visibility and order for screen and print save automatically in this browser. Drag a row or use the arrows.')}</p><div class="metric-column-grid"><div class="metric-column-head"><span></span><span>${salesMetricText('Колонка','Column')}</span><span>${salesMetricText('Порядок','Order')}</span><b>${salesMetricText('Экран','Screen')}</b><b>${salesMetricText('Печать','Print')}</b></div>${rows}<div class="metric-column-reset"><span>${salesMetricText('Стандартный вид','Standard view')}</span>${['screen','print'].map(ctx=>`<button type="button" class="sm" onclick="salesResetMetricColumns('${ctx}')">${salesMetricText('Вернуть','Reset')}</button>`).join('')}</div></div>${salesViewSaveFailed?`<p class="metric-incomplete">${salesMetricText('Не удалось сохранить настройки браузера. Выбор действует до закрытия страницы.','Browser preferences could not be saved. Selections apply until this page closes.')}</p>`:''}`;
}
function salesAreaPanel(line){
 const a=salesLineAreas(line,soDraft);
 return `<div class="metric-explanation"><p>${salesMetricText('Площади указаны для одного изделия. Qty не меняет площадь одного юнита.','Areas are per unit. Qty does not change a single unit’s area.')}</p><dl><dt>Actual Area</dt><dd>${a.valid?a.actual.toFixed(4):'—'} ft²</dd><dt>Rounded Area</dt><dd>${a.valid?`${a.roundedWidth} × ${a.roundedHeight}″ ÷ 144 → ${a.rounded.toFixed(1)} ft²`:'—'}</dd><dt>Billable Area</dt><dd>${a.valid?a.billable.toFixed(1):'—'} ft²</dd></dl><p>${salesMetricText('Actual Area — площадь готового контура. Rounded Area — габариты, каждый округлён вверх до целого дюйма; площадь округлена до десятых. Billable Area учитывает минимум к оплате.','Actual Area is the finished contour area. Rounded Area uses bounding dimensions, each rounded up to a whole inch, then rounds the area to one decimal place. Billable Area applies the billing minimum.')}</p><p>${salesMetricText('Материалы и Shape Unit считаются от Billable Area. Кромки — по длине, поштучные работы — по количеству; нанесение покрытий сохраняет свою площадь обработки. Вес считается по фактической геометрии.','Materials and Shape Unit use Billable Area. Edges use length, per-piece work uses quantity, and surface treatments retain their processing area. Weight uses actual geometry.')}</p></div>`;
}
function salesPricePanel(line){
 const p=salesLineCommercialPrice(line,soDraft),cur=esc(soDraft.currency),row=(label,value)=>`<div class="metric-price-row"><span>${label}</span><b data-raw>${value==null?'—':value.toFixed(2)+' '+cur}</b></div>`;
 return `<p class="mut">${salesMetricText('Расчёт для одного готового юнита','Calculation for one finished unit')}</p>${row(salesMetricText('Материалы','Materials')+` · ${p.materialRate.toFixed(2)} × ${p.areas.billable==null?'—':p.areas.billable.toFixed(1)} ft²`,p.missingMaterials||p.unsupportedCurrency?null:p.materials)}${row(salesMetricText('Сервисы и обработка','Services and processing'),p.missingServices||p.unsupportedCurrency?null:p.services)}${row(salesMetricText('Исходная цена юнита','Base unit price'),p.missingMaterials||p.missingServices||p.unsupportedCurrency?null:p.base)}${p.adjustments.map(a=>row(`${esc(a.label)} · +${a.percent}% × ${a.base.toFixed(2)}`,p.complete?a.amount:null)).join('')}${row('Unit Price',p.unit)}${row('Line Total · Qty '+p.qty,p.line)}${p.unsupportedCurrency?`<p class="metric-incomplete">${salesMetricText('Каталог цен задан в CAD. Для USD сначала требуется согласованный пересчёт валюты; итог не подменяется суммой CAD.','Catalog prices are in CAD. USD totals require a defined currency conversion; CAD amounts are not relabelled as USD.')}</p>`:''}${!p.complete?`<p class="metric-incomplete">${salesMetricText('Расчёт неполный: проверьте размеры и цены материалов / сервисов.','Calculation incomplete: check dimensions and material / service prices.')}</p>`:''}<p class="mut">${salesMetricText('Надбавки Triple и Large unit начисляются каждая от исходной цены юнита, включая сервисы. До energy surcharge, налога и доставки.','Triple and Large unit each apply to the base unit price including services. Before energy surcharge, tax and delivery.')}</p><button type="button" onclick="salesMetricsPanel=null;salesOpenLineServices('${esc(line.id)}')">${salesMetricText('Открыть сервисы','Open services')}</button>`;
}
function salesRulePanel(){
 const r=salesMetricRules(soDraft),labels={triplePercent:salesMetricText('Triple units, %','Triple units, %'),largePercent:salesMetricText('Large units, %','Large units, %'),largeThresholdFt2:salesMetricText('Large units: площадь строго больше, ft²','Large units: area strictly above, ft²'),minimumAreaFt2:salesMetricText('Минимальная оплачиваемая площадь, ft²','Minimum billable area, ft²')};
 return `<form class="metric-rule-form" onsubmit="event.preventDefault();salesSaveMetricRules(this)">${Object.keys(labels).map(k=>`<label>${labels[k]}<input name="${k}" type="number" min="0" step="0.1" required value="${r[k]}"></label>`).join('')}<p>${salesMetricText('Обе надбавки — от исходной цены юнита с сервисами. При двух надбавках по 50%: 100 → 200. Порог проверяется по Billable Area одного изделия, до умножения на Qty.','Both surcharges use the base unit price including services. Two 50% surcharges: 100 → 200. The threshold uses one unit’s Billable Area, before Qty.')}</p><p class="mut">${salesMetricText('Сохранённые заказы удерживают свои правила. Здесь изменения применятся к открытому заказу и станут значениями по умолчанию для новых.','Saved orders retain their rules. Changes here apply to this order and become defaults for new orders.')}</p><button class="pri" type="submit">${salesMetricText('Применить к этому и новым заказам','Apply to this and new orders')}</button></form>`;
}
function salesSaveMetricRules(form){
 const rules={combination:'additive'};
 for(const key of ['triplePercent','largePercent','largeThresholdFt2','minimumAreaFt2']){const n=Number(form.elements[key].value);if(!Number.isFinite(n)||n<0)return;rules[key]=n;}
 DB.salesMetricRules=salesNormalizeMetricRules(rules);soDraft.metricRules=Object.assign({},DB.salesMetricRules);touch();salesCloseMetrics();
}
function salesWeightPanel(line){
 const w=salesLineWeight(line,soDraft);
 return `<p>${salesMetricText('Расчётный вес всех компонентов одного юнита. Пустая норма означает отсутствие данных, а не нулевой вес.','Calculated weight of all components in one unit. An empty norm means missing data, not zero weight.')}</p><button type="button" onclick="salesMetricsEditWeights=!salesMetricsEditWeights;render()">${salesMetricsEditWeights?salesMetricText('Закрыть нормы','Close weight norms'):salesMetricText('Редактировать весовые нормы','Edit weight norms')}</button>${salesMetricsEditWeights?`<p class="mut">${salesMetricText('Нормы общие для этого продукта во всех заказах. Используйте данные поставщика или измеренные нормы расхода; для компонентов, уже учтённых в другой норме, укажите 0.','Norms apply to this product across all orders. Use supplier data or measured consumption; enter 0 for components already included in another norm.')}</p>`:''}<div class="metric-detail-scroll"><table class="metric-weight-table"><thead><tr><th>${salesMetricText('Компонент','Component')}</th><th>${salesMetricText('База','Basis')}</th><th>${salesMetricText('Норма','Norm')}</th><th>kg / unit</th></tr></thead><tbody>${w.rows.map((r,i)=>`<tr><td>${raw(r.label)}<small>${esc(r.note)}</small></td><td data-raw>${r.key?r.basis==null?'—':r.basis.toFixed(5):'—'}</td><td>${r.key&&salesMetricsEditWeights?`<input aria-label="Weight norm ${i+1}" type="number" min="0" step="any" value="${r.rate==null?'':r.rate}" data-row="${i}" onchange="salesSaveWeightNorm(+this.dataset.row,this.value)">`:r.key?r.rate==null?'—':r.rate:'—'}<small>${r.unit||''}</small></td><td data-raw>${r.kg==null?'—':r.kg.toFixed(3)}</td></tr>`).join('')}</tbody></table></div><div class="metric-price-row"><span>Unit Weight</span><b data-raw>${w.complete?w.kg.toFixed(2)+' kg':'—'}</b></div><div class="metric-price-row"><span>Line Weight · Qty ${line.qty}</span><b data-raw>${w.complete?w.lineKg.toFixed(2)+' kg':'—'}</b></div>${!w.complete?`<p class="metric-incomplete">${salesMetricText('Вес неполный. Известная часть','Weight incomplete. Known components')}: ${w.knownKg.toFixed(2)} kg/unit · ${w.missing} ${salesMetricText('позиций требуют данных','items need data')}</p>`:''}<h4>${salesMetricText('Дополнительные компоненты','Additional components')}</h4><p class="mut">${salesMetricText('Только то, что входит в поставку: фурнитура, крепёж и прочее. Метка обработки Clamp / Hinge сама по себе не означает поставку фурнитуры.','Supplied items only: hardware, fasteners and other components. A Clamp / Hinge processing mark does not itself mean hardware is supplied.')}</p>${(line.weightExtras||[]).map((x,i)=>`<div class="metric-extra"><input aria-label="Component name ${i+1}" value="${esc(x.label)}" placeholder="Component" oninput="salesSetWeightExtra(${i},'label',this.value)"><input aria-label="Component kg ${i+1}" type="number" min="0" step="any" value="${x.kg==null?'':x.kg}" placeholder="kg / unit" onchange="salesSetWeightExtra(${i},'kg',this.value)"><button type="button" onclick="salesRemoveWeightExtra(${i})">×</button></div>`).join('')}<button type="button" onclick="salesAddWeightExtra()">+ ${salesMetricText('Компонент','Component')}</button>`;
}
function salesMetricsLine(){return soDraft&&(soDraft.lines||[]).find(l=>l.id===salesMetricsLineId);}
function salesSaveWeightNorm(index,value){
 const line=salesMetricsLine();if(!line)return;
 const row=salesLineWeight(line,soDraft).rows[index];if(!row||!row.key)return;
 const rate=mdNonNeg(value);if(value.trim()!==''&&rate==null){alert('Enter a non-negative weight norm.');render();return;}
 const old=(DB.materialWeightRates||[]).find(r=>r.key===row.key);
 if(old)old.rate=rate;else DB.materialWeightRates.push({key:row.key,rate:rate,note:''});touch();render();
}
function salesAddWeightExtra(){const l=salesMetricsLine();if(!l)return;if(!l.weightExtras)l.weightExtras=[];l.weightExtras.push({label:'',kg:null});render();}
function salesRemoveWeightExtra(i){const l=salesMetricsLine();if(l){l.weightExtras.splice(i,1);render();}}
function salesSetWeightExtra(i,key,value){const l=salesMetricsLine(),x=l&&l.weightExtras[i];if(!x)return;if(key==='label')x.label=value;else{x.kg=mdNonNeg(value);render();}}
function salesOrderPrintMarkup(){
 return `<div class="metric-print-order"><h2>${raw(soDraft.businessNumber||'Draft Sales Order')}</h2><p>${raw(salesCustomerDisplay(soDraft.customerId))}${soDraft.customerPo?' · PO '+raw(soDraft.customerPo):''}</p><table><thead><tr><th>#</th><th>MU</th><th>Qty</th><th>Width</th><th>Height</th><th>Mark</th>${salesMetricHeaders('print')}</tr></thead><tbody>${soDraft.lines.map((l,i)=>`<tr><td>${i+1}</td><td>${raw((salesMakeupById(soDraft,l.makeupId)||{}).code)}</td><td>${l.qty}</td><td data-raw>${esc(salesDimFrom16(l.width16))}″</td><td data-raw>${esc(salesDimFrom16(l.height16))}″</td><td>${raw(l.mark)}</td>${salesMetricCells(l,'print')}</tr>`).join('')}</tbody></table>${salesMetricColumnsFor('print').some(c=>c.key==='lineTotal')?salesCommercialOrderSummary():''}</div>`;
}
function salesMetricsModal(){
 if(!salesMetricsPanel||!soDraft)return '';
 const panel=salesMetricsPanel,line=salesMetricsLine(),titles={columns:salesMetricText('Колонки заказа','Order columns'),rules:salesMetricText('Правила цены','Pricing rules'),print:salesMetricText('Предпросмотр печати','Print preview'),area:salesMetricText('Площадь изделия','Unit area'),weight:salesMetricText('Вес изделия','Unit weight'),price:salesMetricText('Цена изделия','Unit price')};
 if(!titles[panel]||!line&&['area','weight','price'].includes(panel))return '';
 const content=panel==='columns'?salesColumnsPanel():panel==='rules'?salesRulePanel():panel==='area'?salesAreaPanel(line):panel==='weight'?salesWeightPanel(line):panel==='price'?salesPricePanel(line):`<div class="metric-print-actions"><button onclick="salesOpenMetrics('columns')">${salesMetricText('Колонки печати','Print columns')}</button><button class="pri" onclick="printSheet(salesOrderPrintMarkup())">${salesMetricText('Печать','Print')}</button></div><div class="metric-print-preview">${salesOrderPrintMarkup()}</div>`;
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
 if(prices){const p=salesOrderPricingSummary();prices.innerHTML=`<b>${p.total.toFixed(2)} ${esc(soDraft.currency)}</b>${p.unpriced?`<small>${p.unpriced} no rate</small>`:''}`;}
 if(tr)applyLang(tr);
}
