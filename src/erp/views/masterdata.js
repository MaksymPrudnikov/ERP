/* =====================================================================
   view/masterdata  ·  masterdata-1.0
   Каталог стекла, точки поставки и обзор всей базы справочников.
   IN : DB.glassProduct · DB.glassSheet · остальные справочники
   OUT: html
   Правило: файл не знает про цены продажи, клиентов и заказы. Только вход→выход.

   Зачем экран вообще нужен: 511 позиций каталога собраны скриптом из выгрузки
   IGDB, и первое, что с ними придётся сделать, — дописать своего поставщика и
   переименовать чужие коды в цеховые. Без экрана это означает Excel, повторную
   сборку каталога и новую заливку ради одной строки.

   Позиция, на которую ссылается Makeup, НЕ УДАЛЯЕТСЯ — только помечается
   неактивной. Иначе старый заказ показал бы `?` вместо кода стекла, и никто
   не узнал бы, из чего его считали.
   ===================================================================== */

/* Этап 2 схемы, часть третья: ОДИН ЭКРАН. Было восемь вкладок, каждая из
   которых заводилась под очередной справочник; стало пять — по видам данных
   раздела 7. Главное правило схемы: «новый справочник больше не создаёт
   вкладку — он становится подкатегорией». Стекло, спейсер, газ, герметик,
   плёнка, фрит, спандрел, палитра и сток перестали быть девятью пунктами
   меню и стали категориями одного экрана Materials. */
const MD_TABS=[
 {k:'materials', label:'Materials'},
 {k:'works',     label:'Works'},
 {k:'prices',    label:'Prices'},
 {k:'stations',  label:'Stations'},
 {k:'hardware',  label:'Hardware'},
 {k:'company',   label:'Company'},
 {k:'stickers',  label:'Stickers'},
 {k:'cutting',   label:'Cutting'},
 {k:'carriers',  label:'Dollies & Skids'},
 {k:'trucks',    label:'Trucks'},
 {k:'ncr',       label:'NCR'},
 {k:'stockreasons',label:'Stock reasons'},
 {k:'setup',     label:'Setup'},
 {k:'overview',  label:'Data overview'}
];
/* Шесть разделов вместо вкладок в ряд (план Master Data, «Структура»;
   владелец 23.10.2026): раздел — по вопросу, с которым пришли. Вкладка
   внутри раздела — прежний mdTab; Catalog — дерево (view/md-catalog). */
const MD_SECTIONS=[
 {k:'catalog',   label:'Catalog',         tabs:['materials','works','hardware']},
 {k:'prices',    label:'Prices',          tabs:['prices']},
 {k:'production',label:'Production',      tabs:['stations','cutting','carriers','ncr','stockreasons']},
 {k:'shipping',  label:'Shipping',        tabs:['trucks']},
 {k:'print',     label:'Company & print', tabs:['company','stickers']},
 {k:'setup',     label:'Setup',           tabs:['setup','overview']}
];
/* Категория → чем она наполнена. Стекло и спейсер держат свои экраны (у них
   свои фильтры, импорт CSV и точки поставки), остальные категории рисуются
   общей машинкой Catalogues — разница только в том, какая таблица открыта.
   Порядок здесь — порядок кнопок на экране. */
const MD_MATERIAL_VIEWS={
 glass:     [{k:'glassProduct',     label:'Glass catalogue', view:'glass'},
             {k:'glassSheet',       label:'Supply points',   view:'supply'}],
 igu:       [{k:'spacerVariant',    label:'Spacers',         view:'spacer'},
             {k:'surroundRecipe',   label:'Surround recipes', view:'recipe'},
             {k:'gasProduct',       label:'Gas'},
             {k:'sealantProduct',   label:'Sealants'},
             {k:'iguPart',          label:'IGU parts'}],
 lamination:[{k:'interlayerProduct',label:'Interlayers'}],
 stock:     [{k:'stockItem',        label:'Stock items'}]
};
const MD_MATERIAL_CATEGORY_LABELS={glass:'Glass',igu:'IGU assembly',lamination:'Lamination',stock:'Stock & consumables'};
/* Тепловая обработка материалом не является — её нет в разделе 7 и у неё нет
   ни закупки, ни хранения. Это режим цеха, поэтому живёт рядом с работами, а
   не среди материалов. */
/* Фрит и спандрел — работы по поверхности (этап 4, часть 2 плана Master
   Data): карточка говорит, какая работа Works их делает. */
const MD_WORK_CATALOGUES=['serviceRate','heatTreatment','fritProduct','spandrelProduct','spandrelColour'];
const MD_CAT_WORK=['fritProduct','spandrelProduct'];
/* Каталог длиннее любого экрана: показываем страницу и честно говорим, сколько
   осталось за краем. Молчаливая обрезка списка читается как «это всё». */
const MD_PAGE=60;

let mdTab='materials';
let mdMatCategory='glass',mdMatView='glassProduct';
let mdSearch='',mdMfr='',mdThick='',mdCoating='',mdStatus='all';
let mdEdit=null,mdDraft=null;
let mdSheetEdit=null,mdSheetDraft=null;
let mdSpacerEdit=null,mdSpacerDraft=null;
let mdHwKindEdit=null,mdHwKindDraft=null,mdHwModelEdit=null,mdHwModelDraft=null,mdHwFilter='';
let mdCatKind='spandrelColour',mdCatEdit=null,mdCatDraft=null;
/* Начатая форма: новая версия ERP не перезагружает вкладку сама (erp/storage). */
(window.STORAGE_UNSAVED=window.STORAGE_UNSAVED||[]).push(()=>!!(mdDraft||mdSheetDraft||mdSpacerDraft||mdHwKindDraft||mdHwModelDraft||mdCatDraft));
let mdImportReport=null;

/* --- Общее ------------------------------------------------------------ */

function viewMasterData(){
 if(!MD_TABS.some(t=>t.k===mdTab))mdTab='materials';
 const sec=MD_SECTIONS.find(s=>s.tabs.includes(mdTab))||MD_SECTIONS[0];
 const total=DB.glassProduct.length,stocked=DB.glassProduct.filter(p=>p.stocked).length;
 const inactive=DB.glassProduct.filter(p=>p.active===false).length;
 const sheets=DB.glassSheet.length,orphans=glassOrphanSheets().length;
 /* Плитки каталога — только в его обзоре: над Prices, Company, Setup и
    открытой карточкой они место отнимали, а не помогали (аудит 25.10.2026,
    D-3). */
 const kpi=sec.k==='catalog'&&!mdRowFormOpen()&&!mdCatalogQuery.trim();
 return `<div class="page-head"><div><h2>Master Data</h2><p>Items, works, prices and settings.</p></div><span class="pill info">Master Data · v2</span></div>
  ${kpi?`<div class="kpi-grid" data-md-kpi>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('layers')}</div></div><div class="kpi-num">${total}</div><div class="kpi-label">catalog items</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('inventory')}</div></div><div class="kpi-num">${stocked}</div><div class="kpi-label">kept in stock</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('purchase')}</div></div><div class="kpi-num">${sheets}</div><div class="kpi-label">supply rows</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico(orphans||inactive?'alert':'check')}</div></div><div class="kpi-num">${orphans}</div><div class="kpi-label">supply rows without a product</div></div>
  </div>`:''}
  <div class="card">
   <div class="tabs" data-md-sections>${MD_SECTIONS.map(s=>`<button class="${s.tabs.includes(mdTab)?'on':''}" data-md-section="${s.k}" onclick="mdSetTab('${s.tabs[0]}')">${s.label}</button>`).join('')}</div>
   ${sec.k!=='catalog'&&sec.tabs.length>1?`<div class="md-mat-subs" data-md-subtabs>${sec.tabs.map(k=>`<button class="sm ${mdTab===k?'on':''}" onclick="mdSetTab('${k}')">${esc(MD_TABS.find(t=>t.k===k).label)}</button>`).join('')}</div>`:''}
   ${sec.k==='catalog'?viewMdCatalog():({prices:viewMdPrices,stations:viewMdStations,setup:viewMdSetup,hardware:viewMdHardware,company:viewMdCompany,stickers:viewMdStickers,cutting:viewMdCutting,carriers:viewMdCarriers,trucks:viewMdTrucks,ncr:viewMdNcr,stockreasons:viewMdStockReasons,overview:viewMdOverview})[mdTab]()}
  </div>
  ${mdTab==='materials'&&mdMatCategory==='glass'&&(mdMatView==='glassProduct'||accessCost())?mdImportCard():''}`;
}
/* Станции — шаги маршрута; работы в Works ссылаются на них. Сверху — дерево
   (этап 4, часть 3 плана Master Data): шаги по порядку, у станции всё, что
   на неё назначено. Только вид: станцию ставят в карточках. */
function viewMdStations(){return mdStationTreeHTML()+viewSfStations(true);}
/* Материалы приходят на станцию через работу, на которой их тратят: плёнка —
   склейка, части пакета — сборка. Своего поля станции у айтема нет: иначе
   маршрут и сканы спорили бы с работой о том, где склеивают. */
const MD_STATION_VIA=[['lamination',[['interlayerProduct','Interlayers']]],
 ['igu_assembly',[['spacerVariant','Spacers'],['gasProduct','Gas'],['sealantProduct','Sealants'],['iguPart','IGU parts']]]];
function mdStationAssigned(code){
 const works=(DB.serviceRate||[]).filter(w=>w&&w.station===code&&!w.rule),ids=new Set(works.map(w=>w.id)),items=[];
 [['fritProduct','Frit'],['spandrelProduct','Spandrel']].forEach(([t,k])=>(DB[t]||[]).forEach(x=>{
  if(x&&x.active!==false&&x.workId&&ids.has(x.workId))items.push({text:k+' · '+(x.name||x.id),n:1});}));
 MD_STATION_VIA.forEach(([w,tables])=>{if(!ids.has(w))return;
  tables.forEach(([t,label])=>{const n=(DB[t]||[]).filter(x=>x&&x.active!==false).length;if(n)items.push({text:label,n});});});
 return {works,items};
}
/* Станция материала в его карточке — та, что у работы, где его тратят. */
function mdStationViaHTML(table){
 const hit=MD_STATION_VIA.find(([,tables])=>tables.some(([t])=>t===table));if(!hit)return '';
 const w=salesServiceRateRow(hit[0]);
 return `<div data-md-station-via><label>Station</label><div class="mono">${w&&w.station?esc(w.station):'—'}</div><div class="hint">From work ${esc(w?w.name:hit[0])}</div></div>`;
}
function mdStationTreeHTML(){
 const pill=(t,cls)=>`<span class="pill ${cls}" data-raw>${esc(t)}</span>`;
 const steps=sfSteps().map(([seq,list])=>`<li class="md-st-step"><span class="md-st-seq">${seq}</span><ul>${list.map(s=>{
  const a=mdStationAssigned(s.code),n=a.works.length+a.items.reduce((m,x)=>m+x.n,0);
  return `<li class="md-st-node" data-md-st="${esc(s.code)}"><div><b class="mono">${raw(s.code)}</b> ${sfLabel(s)}${s.always?' '+pill('always','ok'):''} <span class="mut">${n?n+' assigned':'nothing assigned'}</span></div>
   ${n?`<div class="md-st-kids">${a.works.map(w=>pill(w.name||w.id,'info')).join(' ')}${a.items.map(x=>' '+pill(x.text+(x.n>1?' · '+x.n:''),'')).join('')}</div>`:''}</li>`;}).join('')}</ul></li>`).join('');
 return `<div class="md-st-tree" data-md-station-tree><div class="sub">Steps in order; same step — parallel.</div><ol>${steps}</ol></div>`;
}
/* Setup (этап 5 плана Master Data): сборы и умолчания нового заказа —
   erp/sales/order-setup. Сохранённые заказы держат свой снимок. */
function viewMdSetup(){
 const s=orderSetup(),cur='CAD';
 const on=k=>`<input type="checkbox" data-setup="${k}" ${s[k]?'checked':''} onchange="orderSetupSet('${k}',this.checked)">`;
 const num=(k,unit)=>`<input type="number" min="0" step="0.01" data-setup="${k}" value="${s[k]}" onchange="orderSetupSet('${k}',this.value)"> <span class="mut">${unit}</span>`;
 const inBase=(k,label)=>`<label class="md-setup-base">${on(k)} ${label}</label>`;
 const row=(label,onKey,value,base)=>`<tr><td><b>${label}</b></td><td class="n">${on(onKey)}</td><td>${value}</td><td>${base}</td></tr>`;
 const cards=s.cardNetworks.map((n,i)=>`<tr data-setup-card="${esc(n.id)}"><td><input type="text" maxlength="60" value="${esc(n.name)}" onchange="orderSetupCardSet(${i},'name',this.value)"></td><td><input type="number" min="0" step="0.01" value="${n.rate}" onchange="orderSetupCardSet(${i},'rate',this.value)"> <span class="mut">%</span></td><td><button type="button" onclick="orderSetupCardRemove(${i})">Remove</button></td></tr>`).join('');
 return `<div class="md-setup" data-md-setup>
  <h3>Order charges</h3><p class="mut">Defaults for new orders.</p>
  <div class="sales-table-wrap"><table class="ncr-table"><thead><tr><th>Charge</th><th class="n">On</th><th>Value</th><th>Base besides Subtotal</th></tr></thead><tbody>
   ${row('Energy surcharge (ES)','energyOn',num('energyRate','%'),'<span class="mut">—</span>')}
   ${row('HST','hstOn',num('hstRate','%'),inBase('hstOnEnergy','ES')+inBase('hstOnDelivery','Delivery'))}
   ${row('Card fee','cardOn','<span class="mut">by card below</span>',inBase('cardOnEnergy','ES')+inBase('cardOnHst','HST')+inBase('cardOnDelivery','Delivery'))}
   ${row('Delivery','deliveryOn',num('deliveryAmount',cur),'<span class="mut">—</span>')}
   ${row('Skid deposit','skidDepositOn',num('skidDepositAmount',cur),'<span class="mut">Not in any base</span>')}
  </tbody></table></div>
  <h4>Cards</h4><p class="mut">The first card is the default.</p>
  <div class="sales-table-wrap"><table class="ncr-table" data-setup-cards><thead><tr><th>Name on order</th><th>Rate</th><th></th></tr></thead><tbody>${cards||'<tr><td colspan="3" class="mut">No cards</td></tr>'}</tbody></table></div>
  <button type="button" data-setup-card-add onclick="orderSetupCardAdd()">+ Card</button>
  <h3>Weights</h3><p class="mut">Unit weight on orders and stickers.</p>
  <div class="grid">${(()=>{const g=(DB.materialWeightRates||[]).find(r=>r.key==='glass');return `<div><label>Glass density, kg/m³</label><input type="number" min="0" step="any" data-setup-density value="${g&&g.rate!=null?g.rate:''}" placeholder="unknown" onchange="mdWeightSet('glass',this.value,1)"></div>`;})()}</div>
  <h3>Frit</h3><p class="mut">Prefilled on a new frit lite.</p>
  <div class="grid">
   <div><label>Dot, mm</label><input type="number" min="0.1" step="0.1" data-setup="fritDotMm" value="${s.fritDotMm}" onchange="orderSetupSet('fritDotMm',this.value)"></div>
   <div><label>Margin</label><input type="text" data-setup="fritMargin16" value="${esc(salesMarginFrom16(s.fritMargin16))}" onchange="orderSetupSet('fritMargin16',this.value)"></div>
   <div><label>From corner</label><select data-setup="fritCorner" onchange="orderSetupSet('fritCorner',this.value)">${FRIT_MARGIN_CORNERS.map(c=>`<option ${s.fritCorner===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
  </div></div>`;
}
/* Предупреждать, а не запрещать: ноль законен, отрицательное и не число —
   не значение. */
function orderSetupSet(k,v){
 const s=DB.orderSetup,d=ORDER_SETUP_DEFAULT;if(!s||!Object.prototype.hasOwnProperty.call(d,k)||k==='cardNetworks')return;
 if(typeof d[k]==='boolean')s[k]=!!v;
 else if(k==='fritCorner')s[k]=v;
 else{const n=k==='fritMargin16'?salesMarginTo16(v):Number(v);
  if(n==null||!Number.isFinite(n)||n<0||(k==='fritDotMm'&&!n)){alert('Enter a value of zero or greater.');render();return;}
  s[k]=n;}
 normalizeOrderSetup();touch();render();
}
function orderSetupCardAdd(){DB.orderSetup.cardNetworks.push({id:'card-'+Date.now().toString(36),name:'Card fee',rate:0});normalizeOrderSetup();touch();render();}
function orderSetupCardSet(i,k,v){
 const n=DB.orderSetup.cardNetworks[i];if(!n)return;
 if(k==='rate'){const r=Number(v);if(!Number.isFinite(r)||r<0){alert('Enter a value of zero or greater.');render();return;}n.rate=r;}
 else n.name=String(v);
 normalizeOrderSetup();touch();render();
}
function orderSetupCardRemove(i){DB.orderSetup.cardNetworks.splice(i,1);normalizeOrderSetup();touch();render();}
function mdSetTab(k){mdTab=k;if(typeof stEdit!=='undefined')stEdit=null;if(typeof cutMdNotice!=='undefined')cutMdNotice='';mdEdit=null;mdSheetEdit=null;mdSpacerEdit=null;mdHwKindEdit=null;mdHwModelEdit=null;mdCatEdit=null;mdCatDraft=null;mdImportReport=null;
 /* Работы и материалы делят одну машинку Catalogues, поэтому при переходе
    между вкладками открытая таблица обязана соответствовать вкладке —
    иначе Works показал бы палитру спандрела. */
 if(k==='works'&&MD_WORK_CATALOGUES.indexOf(mdCatKind)<0)mdCatKind='serviceRate';
 if(k==='materials')mdMatSwitch(mdMatCategory,mdMatView);
 render();}
/* Экран материалов: категория сверху, подкатегория внутри неё. Обе — кнопки,
   а не выпадающий список: их немного, и владелец должен видеть, что у него
   вообще есть, не открывая меню. */
/* Привести выбор к допустимому — БЕЗ побочных эффектов: её зовёт и отрисовка,
   тоже. Раньше сброс черновика жил здесь же, и открытая форма закрывалась на
   каждой перерисовке — то есть при первом же вводе символа в поле. */
function mdMatResolve(category,viewKey){
 const cat=MD_MATERIAL_VIEWS[category]?category:'glass';
 const list=MD_MATERIAL_VIEWS[cat];
 return {category:cat,hit:list.find(v=>v.k===viewKey)||list[0],list};
}
function mdMatSelect(category,viewKey){
 const r=mdMatResolve(category,viewKey);
 mdMatCategory=r.category;mdMatView=r.hit.k;
 /* Таблицы без своего экрана рисует Catalogues — ему нужно знать, какая
    открыта. Для стекла и спейсера это поле не трогаем: у них свои экраны. */
 if(!r.hit.view&&MD_CATALOGUES.some(c=>c.k===r.hit.k))mdCatKind=r.hit.k;
}
function mdMatSwitch(category,viewKey){
 mdMatSelect(category,viewKey);
 mdEdit=null;mdSheetEdit=null;mdSpacerEdit=null;mdCatEdit=null;mdCatDraft=null;
}
function mdSetMatCategory(k){mdMatSwitch(k,null);render();}
function mdSetMatView(k){mdMatSwitch(mdMatCategory,k);render();}
function viewMdMaterials(){
 mdMatSelect(mdMatCategory,mdMatView);
 const list=MD_MATERIAL_VIEWS[mdMatCategory],hit=list.find(v=>v.k===mdMatView)||list[0];
 const cats=Object.keys(MD_MATERIAL_VIEWS).map(c=>`<button class="sm ${c===mdMatCategory?'on':''}" onclick="mdSetMatCategory('${c}')">${esc(MD_MATERIAL_CATEGORY_LABELS[c])} <span class="mut">${materialEntries(c).length}</span></button>`).join('');
 const subs=list.length>1?`<div class="md-mat-subs">${list.map(v=>`<button class="sm ${v.k===mdMatView?'on':''}" onclick="mdSetMatView('${v.k}')">${esc(v.label)}</button>`).join('')}</div>`:'';
 const body=hit.view?({glass:viewMdGlass,supply:viewMdSupply,spacer:viewMdSpacer,recipe:viewMdRecipes})[hit.view]():viewMdCatalogues();
 return `<div class="md-mat-cats">${cats}</div>${subs}${body}`;
}
/* Работы и припуск на рез — один вид данных: и то и другое про то, что цех
   делает со стеклом, и раздел 7 сводит их на один экран. */
function viewMdWorks(){
 if(MD_WORK_CATALOGUES.indexOf(mdCatKind)<0)mdCatKind='serviceRate';
 const subs=MD_WORK_CATALOGUES.map(k=>{const def=MD_CATALOGUES.find(c=>c.k===k);return `<button class="sm ${k===mdCatKind?'on':''}" onclick="mdSetCatKind('${k}')">${esc(def?def.label:k)}</button>`;}).join('');
 return `<div class="md-mat-subs">${subs}</div>${viewMdCatalogues()}${mdCatEdit===null&&mdCatKind==='serviceRate'?viewMdAllowance():''}`;
}
function mdVocabOptions(kind,value,blank){
 const rows=Object.keys(GLASS_VOCAB[kind]||{});
 return (blank?`<option value="">${esc(blank)}</option>`:'')+rows.map(v=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(glassLabel(kind,v))}</option>`).join('');
}
function mdUnitOptions(value){
 return MD_UNITS.map(u=>`<option value="${esc(u.code)}" ${u.code===value?'selected':''}>${esc(mdUnitName(u.code))} · ${esc(mdUnitCalcName(u.calc))}</option>`).join('');
}
function mdUnitCalcName(calc){
 const row={area:['площадь','area'],linear:['длина','linear'],flat:['штуки','flat']}[calc];
 return row?row[1]:calc;
}
function mdVal(id){const el=document.getElementById(id);return el?el.value.trim():'';}
/* Закупочная цена (Cost & margin, аудит 25.10.2026, D-2): без галочки поле
   есть в форме, но скрыто — Save берёт прежнее значение и его не стирает. */
function mdCostOnly(html){return accessCost()?html:'<div hidden data-md-cost-hidden>'+html+'</div>';}
function mdChecked(id){const el=document.getElementById(id);return !!(el&&el.checked);}

/* --- 1. Каталог стекла ------------------------------------------------ */

function mdVisibleProducts(){
 const q=mdSearch.trim().toLowerCase();
 return DB.glassProduct.filter(p=>{
  if(mdStatus==='stocked'&&!p.stocked)return false;
  if(mdStatus==='preorder'&&(p.stocked||p.active===false))return false;
  if(mdStatus==='inactive'&&p.active!==false)return false;
  if(mdMfr&&p.manufacturer!==mdMfr)return false;
  if(mdThick&&String(p.thicknessMm)!==mdThick)return false;
  if(mdCoating&&p.coatingFamily!==mdCoating)return false;
  if(q&&![p.code,p.name,p.manufacturer,p.legacyCode,p.note].join(' ').toLowerCase().includes(q))return false;
  return true;
 });
}
function mdSearchChange(el){
 mdSearch=el.value;const pos=el.selectionStart;render();
 requestAnimationFrame(()=>{const e=document.getElementById('mdSearch');if(e){e.focus();try{e.setSelectionRange(pos,pos);}catch(x){}}});
}
function viewMdGlass(){
 if(mdEdit!==null)return mdGlassForm();
 const rows=mdVisibleProducts(),shown=rows.slice(0,mdGlassLimit);
 const mfrs=[...new Set(DB.glassProduct.map(p=>p.manufacturer).filter(Boolean))].sort();
 const thicks=[...new Set(DB.glassProduct.map(p=>p.thicknessMm).filter(x=>x!=null))].sort((a,b)=>a-b);
 /* Одна строка инструментов, как у остальных списков (аудит D-4). */
 return `<div class="md-toolbar" data-md-toolbar>
   <input id="mdSearch" class="md-toolbar-search" value="${esc(mdSearch)}" placeholder="Search glass: code, name, note…" oninput="mdSearchChange(this)">
   <select aria-label="Manufacturer" onchange="mdMfr=this.value;mdGlassLimit=MD_PAGE;render()"><option value="">All manufacturers</option>${mfrs.map(m=>`<option data-raw value="${esc(m)}" ${mdMfr===m?'selected':''}>${esc(m)}</option>`).join('')}</select>
   <select aria-label="Thickness" onchange="mdThick=this.value;mdGlassLimit=MD_PAGE;render()"><option value="">Any thickness</option>${thicks.map(t=>`<option data-raw value="${t}" ${mdThick===String(t)?'selected':''}>${t} mm</option>`).join('')}</select>
   <select aria-label="Coating" onchange="mdCoating=this.value;mdGlassLimit=MD_PAGE;render()"><option value="">Any coating</option>${mdVocabOptions('coatingFamily',mdCoating,'')}</select>
   <select aria-label="Status" data-md-status onchange="mdStatus=this.value;mdGlassLimit=MD_PAGE;render()">${[['all','Any status'],['stocked','In stock'],['preorder','Pre-order'],['inactive','Discontinued']].map(x=>`<option value="${x[0]}" ${mdStatus===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select>
   <button class="pri" onclick="mdGlassNew()">+ New item</button>
  </div>
  <div class="customer-table-wrap"><table><thead><tr><th>Code</th><th class="md-name-col">Name</th><th>Thickness</th><th>Substrate</th><th>Coverage</th><th>Tempering</th><th>Price AN</th><th>Price FT</th><th>Surfaces</th><th>Inventory</th><th>Supply</th><th></th></tr></thead>
  <tbody>${shown.map(mdGlassRow).join('')||'<tr><td colspan="10" class="empty">no items found</td></tr>'}</tbody></table></div>
  <div class="md-more"><span class="mut" data-md-shown>${shown.length} of ${rows.length}</span>${rows.length>shown.length?` <button class="sm" data-md-more onclick="mdGlassLimit+=MD_PAGE;render()">Show ${Math.min(MD_PAGE,rows.length-shown.length)} more</button>`:''}</div>`;
}
let mdGlassLimit=MD_PAGE;
/* Цена продажи правится прямо в строке каталога: заполнять её придётся по многим
   позициям, и форма на каждую превратила бы это в работу на день. Пустое поле
   значит «в прайсе цены нет» — ровно как «no price» в присланном листе. */
function mdGlassPriceInput(p,field){
 const v=p[field];
 return `<input class="md-mm" type="number" step="0.01" min="0" style="width:82px" value="${v==null?'':v}" placeholder="—" onchange="mdGlassSetPrice('${esc(p.id)}','${field}',this.value)">`;
}
function mdGlassSetPrice(id,field,v){
 const p=(DB.glassProduct||[]).find(x=>x.id===id);if(!p)return;
 const typed=String(v==null?'':v).trim();
 if(typed===''){p[field]=null;touch();render();return;}
 const n=+typed;
 if(!isFinite(n)||n<0){render();return;}
 p[field]=Math.round(n*100)/100;touch();render();
}
function mdGlassRow(p){
 const sheets=glassSheetsFor(p.code).length;
 const temper=p.temperMode==='temper_required'?'bad':p.temperMode==='annealed_only'?'warn':'info';
 return `<tr class="${p.active===false?'md-row-off':''}" data-md-row="glassProduct:${esc(p.id)}"><td class="mono"><b>${raw(p.code)}</b>${p.active===false?' <span class="pill warn">discontinued</span>':''}</td>
  <td><b>${raw(p.name)}</b><div class="mut">${raw(p.manufacturer)}</div></td>
  <td class="mono">${p.thicknessMm==null?'—':p.thicknessMm+' mm'}</td>
  <td>${esc(glassLabel('substrate',p.substrate))}</td>
  <td>${esc(glassLabel('coatingFamily',p.coatingFamily))}${p.deposition?`<div class="mut">${esc(glassLabel('deposition',p.deposition))}</div>`:''}</td>
  <td><span class="pill ${temper}">${esc(glassLabel('temperMode',p.temperMode))}</span></td>
  <td>${mdGlassPriceInput(p,"salePriceAnnealed")}</td>
  <td>${mdGlassPriceInput(p,"salePriceTempered")}</td>
  <td>${p.allowedSurfaces.length?p.allowedSurfaces.map(n=>`<span class="pill" data-raw>#${n}</span>`).join(' '):`<span class="mut">${esc(glassLabel('exposureRule',p.exposureRule))}</span>`}</td>
  <td>${p.cut===false?'<span class="pill">No cut</span>':p.stocked?`<span class="pill ok">${esc(glassLabel('stock','stocked'))}</span>`:`<span class="pill info">${esc(glassLabel('stock','preorder'))}</span>`}</td>
  <td>${sheets?`<span class="pill" data-raw>${sheets}</span>`:'<span class="mut">none</span>'}</td>
  <td style="white-space:nowrap"><button class="sm" onclick="mdGlassEdit('${esc(p.id)}')">Edit</button>
   <button class="sm" onclick="mdGlassToggle('${esc(p.id)}')">${p.active===false?'Restore':'Discontinue'}</button>
   <button class="sm dl" onclick="mdGlassDelete('${esc(p.id)}')">×</button></td></tr>`;
}
function mdGlassNew(){
 mdEdit='new';
 mdDraft=normalizeGlassProduct({id:'',code:'',name:'',manufacturer:'',thicknessMm:6,substrate:'clear',coatingFamily:'uncoated'});
 render();
}
/* Форма помнит запись, какой её открыли (mdSeen): старая форма из другой
   вкладки не пишет поверх свежей правки и не возвращает удалённое — как
   карточка клиента (аудит 19.10.2026, F08; владелец 20.10.2026). */
const mdSeen={};
function mdStale(form,cur){return !cur?'This item was deleted':JSON.stringify(cur)!==mdSeen[form]?'Changed elsewhere — reopen':'';}
function mdGlassEdit(id){const p=glassProductById(id);if(!p)return;mdEdit=id;mdDraft=JSON.parse(JSON.stringify(p));mdSeen.glass=JSON.stringify(p);render();}
/* Карточка стекла в виде плана (md-card). Поставка и склад — только
   вид: правят их в Supply points и Inventory. */
function mdGlassForm(){
 const r=mdDraft,isNew=mdEdit==='new';
 const used=!isNew&&salesGlassProductHasReferences(r.id);
 const money=v=>v==null?'—':esc(Number(v).toFixed(2));
 const general=`${used?'<div class="note">Used in a Makeup: rename only, no delete.</div>':''}<div class="grid">
   ${mdField('Code *',`<input id="md_code" value="${esc(r.code)}">`,'Printed on stickers.')}
   ${mdField('Name *',`<input id="md_name" value="${esc(r.name)}">`)}
   ${mdField('Manufacturer',`<input id="md_mfr" value="${esc(r.manufacturer)}">`)}
   ${mdField('Thickness, mm *',`<input id="md_thick" type="number" step="0.1" min="${GLASS_MIN_MM}" max="${GLASS_MAX_MM}" value="${r.thicknessMm==null?'':r.thicknessMm}">`)}
   ${mdField('Actual thickness, mm',`<input id="md_actual" type="number" step="0.01" value="${r.actualThicknessMm==null?'':r.actualThicknessMm}">`,'Measured, not exact.')}
   ${mdField('Substrate',`<select id="md_substrate">${mdVocabOptions('substrate',r.substrate)}</select>`)}
   ${mdField('Coverage',`<select id="md_coating">${mdVocabOptions('coatingFamily',r.coatingFamily)}</select>`)}
   ${mdField('Deposition',`<select id="md_deposition"><option value="">not set</option>${mdVocabOptions('deposition',r.deposition)}</select>`,'Sputtered is soft.')}
   ${mdField('Legacy code',`<input id="md_legacy" value="${esc(r.legacyCode)}">`,'Code in Spil.')}
  </div>
  <div class="row" style="margin-top:12px"><label class="chk"><input type="checkbox" id="md_active" ${r.active!==false?'checked':''}> Item is in production</label></div>
  <div style="margin-top:12px">${mdField('Note',`<input id="md_note" value="${esc(r.note)}">`)}</div>`;
 const prod=`<div class="grid">
   ${mdField('Tempering',`<select id="md_temper">${mdVocabOptions('temperMode',r.temperMode)}</select>`,'Furnace rule.')}
   ${mdField('Surface rule',`<select id="md_exposure">${mdVocabOptions('exposureRule',r.exposureRule)}</select>`)}
   ${mdField('Allowed surfaces',`<input id="md_surfaces" value="${esc(r.allowedSurfaces.join(','))}" placeholder="2,3">`,'Comma list; empty — any.')}
   ${mdField('Base edgework',`<select id="md_baseedge"><option value="" ${!r.baseEdgework?'selected':''}>Auto by thickness · ${esc(glassBaseEdgeworkLabel(glassAutoBaseEdgework(r.thicknessMm)))}</option><option value="arris" ${r.baseEdgework==='arris'?'selected':''}>Rough Arris</option><option value="polish" ${r.baseEdgework==='polish'?'selected':''}>Flat Polish</option></select>`,'Default edge.')}
  </div>
  <div class="row" style="margin-top:12px">
   <label class="chk" title="Off — bought glass, no cutting"><input type="checkbox" id="md_cut" ${r.cut!==false?'checked':''}> We cut it</label>
   <label class="chk"><input type="checkbox" id="md_edge" ${r.edgeDeletion?'checked':''}> Edge deletion required</label>
  </div>`;
 const units=`<div class="grid">
   ${mdField('Stocking unit',`<select id="md_stockunit">${mdUnitOptions(r.stockingUnit)}</select>`)}
   ${mdField('Sales unit',`<select id="md_salesunit">${mdUnitOptions(r.salesUnit)}</select>`)}
  </div>`;
 const measure=`<div class="grid">${mdSaleRulesFields(r,['minAreaFt2','minWidthIn','minHeightIn','maxWidthIn','maxHeightIn'])}</div>`;
 const sheets=isNew?[]:glassSheetsFor(r.code);
 const cost=accessCost();
 const purchase=sheets.length?`<div class="sales-table-wrap"><table class="ncr-table" data-md-glass-supply><thead><tr><th>Supplier</th><th>Sheet</th>${cost?'<th class="n">Price</th>':''}<th>Unit</th><th>Date</th><th class="n">Lead, days</th></tr></thead><tbody>${sheets.map(x=>`<tr><td>${raw(x.supplier||'—')}</td><td class="mono">${x.sheetWIn!=null&&x.sheetHIn!=null?esc(x.sheetWIn+' × '+x.sheetHIn+' in'):'—'}</td>${cost?`<td class="n mono">${money(x.purchasePrice)} <span class="mut">${esc(x.currency||'')}</span></td>`:''}<td>${esc(mdUnitName(x.purchaseUnit))}</td><td class="mono">${esc(x.priceDate||'—')}</td><td class="n mono">${x.leadTimeDays==null?'—':esc(String(x.leadTimeDays))}</td></tr>`).join('')}</tbody></table></div><p class="mut">Edited in Supply points.</p>`:`<p class="mut" data-md-glass-supply>No supply rows.</p>${isNew?'':`<button type="button" class="sm" data-md-glass-supply-add onclick="mdSheetNewFor('${esc(r.code)}')">+ Supply row</button>`}`;
 const price=(id,k,label)=>mdField(label,`<input id="${id}" type="number" step="0.01" min="0" value="${r[k]==null?'':r[k]}" placeholder="—">`,'Empty — no price.');
 const prices=`<div class="grid">${price('md_priceAN','salePriceAnnealed','Price annealed, CAD')}${price('md_priceFT','salePriceTempered','Price tempered, CAD')}${mdSaleRulesFields(r,['minCharge'])}</div>
  ${isNew?'':mdPriceListsHTML('glass:'+r.id+':salePriceAnnealed').replace('<h4>Customer price lists</h4>','<h4>Customer price lists · annealed</h4>')+mdPriceListsHTML('glass:'+r.id+':salePriceTempered').replace('<h4>Customer price lists</h4>','<h4>Customer price lists · tempered</h4>')}`;
 const racks=isNew||r.cut===false?[]:invSheetRows().filter(x=>x.code.toUpperCase()===String(r.code).toUpperCase());
 const stock=`<div class="row"><label class="chk"><input type="checkbox" id="md_stocked" ${r.stocked?'checked':''}> Kept in stock</label></div>
  ${racks.length?`<div class="sales-table-wrap"><table class="ncr-table" data-md-glass-stock><thead><tr><th>Sheet</th><th class="n">On rack</th><th class="n">Reserved</th><th class="n">Free</th><th class="n">Min</th><th>Status</th></tr></thead><tbody>${racks.map(x=>`<tr><td class="mono">${esc(invSizeText(x))}</td><td class="n mono">${x.onRack}</td><td class="n mono">${x.reserved}</td><td class="n mono">${x.free}</td><td class="n mono">${x.min==null?'—':x.min}</td><td>${esc(x.status)}</td></tr>`).join('')}</tbody></table></div><p class="mut">Sizes and counts: Inventory.</p>`:`<p class="mut">No sheet size. Add a supply row.</p>${isNew?'':`<button type="button" class="sm" onclick="mdSheetNewFor('${esc(r.code)}')">+ Supply row</button>`}`}`;
 return mdCardHTML({form:'glass',crumb:['Materials','Glass'].concat(r.manufacturer?[r.manufacturer]:[]),
  title:isNew?'New catalog item':raw(r.name||r.code),status:isNew?null:r.active===false?['discontinued','warn']:r.stocked?[glassLabel('stock','stocked'),'ok']:[glassLabel('stock','preorder'),'info'],code:isNew?'':r.code,
  tabs:[{k:'general',label:'General',html:general},{k:'production',label:'Production',html:prod},{k:'units',label:'Units',html:units},{k:'measure',label:'Measurements',html:measure},
   {k:'purchase',label:'Purchase',html:purchase,missing:!isNew&&!sheets.length},{k:'prices',label:'Prices',html:prices,missing:r.salePriceAnnealed==null&&r.salePriceTempered==null},{k:'stock',label:'Stock',html:stock,missing:racks.some(x=>x.sizeMissing)}],
  foot:`<div class="err" id="e_mdGlass"></div><div class="row"><button class="pri" onclick="mdGlassSave()">Save</button><button onclick="mdEdit=null;mdDraft=null;render()">Cancel</button></div>`});
}
/* Минимумы и размеры продажи в карточке (erp/masterdata/glass mdSaleRulesOf). */
const MD_SALE_RULES=[['md_minArea','minAreaFt2','Min area, ft²','Bills at least this area.'],['md_minCharge','minCharge','Min charge, CAD','Bills at least this per lite.'],
 ['md_minW','minWidthIn','Min width, in','Warning only.'],['md_minH','minHeightIn','Min height, in',''],['md_maxW','maxWidthIn','Max width, in','Warning only.'],['md_maxH','maxHeightIn','Max height, in','']];
/* keys — только эти правила: карточка с вкладками раскладывает их по своим
   вкладкам (минимум суммы — в Prices, размеры — в Measurements). */
function mdSaleRulesFields(r,keys){
 return MD_SALE_RULES.filter(x=>!keys||keys.includes(x[1])).map(([id,k,label,hint])=>`<div><label>${label}</label><input id="${id}" type="number" min="0" step="0.01" value="${r[k]==null?'':esc(r[k])}" placeholder="—">${hint?`<div class="hint">${hint}</div>`:''}</div>`).join('');
}
function mdSaleRulesRead(){
 const v=id=>{const el=document.getElementById(id);return el?el.value:'';};
 return mdSaleRulesOf({minAreaFt2:v('md_minArea'),minCharge:v('md_minCharge'),minWidthIn:v('md_minW'),minHeightIn:v('md_minH'),maxWidthIn:v('md_maxW'),maxHeightIn:v('md_maxH')});
}
function mdGlassSave(){
 const e=document.getElementById('e_mdGlass');e.style.display='none';
 if(mdEdit!=='new'){const stale=mdStale('glass',glassProductById(mdDraft.id));if(stale)return fail(e,stale);}
 const code=mdVal('md_code'),name=mdVal('md_name'),thick=mdVal('md_thick');
 if(!code||!name)return fail(e,'Code and name are required');
 if(!GLASS_CODE_RE.test(code))return fail(e,'Code: letters, digits and + . _ - / only');
 if(DB.glassProduct.some(p=>p.code.toUpperCase()===code.toUpperCase()&&p.id!==mdDraft.id))return fail(e,'This code already exists');
 const t=+thick;
 if(!Number.isFinite(t)||t<GLASS_MIN_MM||t>GLASS_MAX_MM)return fail(e,'Thickness: a number from '+GLASS_MIN_MM+' to '+GLASS_MAX_MM+' mm');
 const surfaces=glassSurfacesCell(mdVal('md_surfaces'));
 if(surfaces===null)return fail(e,'Surfaces: numbers 1 to 8 separated by commas');
 const money=id=>{const t=mdVal(id);return t===''?null:isFinite(+t)&&+t>=0?Math.round(+t*100)/100:NaN;},priceAN=money('md_priceAN'),priceFT=money('md_priceFT');
 if([priceAN,priceFT].some(v=>v!=null&&(!isFinite(v)||v<0)))return fail(e,'Price: a non-negative number or empty');
 const next=Object.assign({},mdDraft,{
  code,name,manufacturer:mdVal('md_mfr'),thicknessMm:t,
  actualThicknessMm:mdVal('md_actual')===''?null:+mdVal('md_actual'),
  substrate:mdVal('md_substrate'),coatingFamily:mdVal('md_coating'),deposition:mdVal('md_deposition'),
  temperMode:mdVal('md_temper'),exposureRule:mdVal('md_exposure'),allowedSurfaces:surfaces,
  stockingUnit:mdVal('md_stockunit'),salesUnit:mdVal('md_salesunit'),legacyCode:mdVal('md_legacy'),
  ...mdSaleRulesRead(),
  salePriceAnnealed:priceAN,salePriceTempered:priceFT,
  note:mdVal('md_note'),stocked:mdChecked('md_stocked'),cut:mdChecked('md_cut'),edgeDeletion:mdChecked('md_edge'),baseEdgework:mdVal('md_baseedge'),active:mdChecked('md_active')
 });
 if(mdEdit==='new'){
  next.id=glassProductId(code);
  if(DB.glassProduct.some(p=>p.id===next.id))return fail(e,'An item with this id already exists');
  DB.glassProduct.push(normalizeGlassProduct(next));
 }else{
  const at=DB.glassProduct.findIndex(p=>p.id===mdDraft.id);
  if(at<0)return fail(e,'Item not found');
  /* идентификатор НЕ пересчитывается по новому коду: на него ссылаются Makeup */
  DB.glassProduct[at]=normalizeGlassProduct(next);
 }
 /* «We cut it» меняет маршрут станций — кэш маршрутов сбрасывается. */
 mdEdit=null;mdDraft=null;normalizeMasterData();if(typeof stationRouteReset==='function')stationRouteReset();touch();render();
}
/* Снятие с производства — обратимая пометка, а не удаление: позиция исчезает
   из выбора, но остаётся видимой в старых заказах и в этой таблице. */
function mdGlassToggle(id){
 const p=glassProductById(id);if(!p)return;
 p.active=p.active===false;touch();render();
}
function mdGlassDelete(id){
 const p=glassProductById(id);if(!p)return;
 if(salesGlassProductHasReferences(id))
  return alert('Cannot delete — this glass is used in a Makeup. Mark it out of production instead.');
 if(glassSheetsFor(p.code).length&&!confirm('Supply rows for this glass will be left without a product. Delete anyway?'))return;
 if(!confirm('Delete this glass product?'))return;
 DB.glassProduct=DB.glassProduct.filter(x=>x.id!==id);
 touch();render();
}

/* --- 2. Точки поставки ------------------------------------------------ */

/* Таблица точек поставки — на общем движке Sales (владелец, 2 октября 2026:
   «разбросано, без корректных фильтров»; правило: таблицы как в Sales —
   фильтры колонок, без общего поиска). Своя область mdSupply, свои настройки. */
function mdListScope(){return mdTab==='materials'&&mdMatCategory==='glass'&&mdMatView==='glassSheet'&&mdSheetEdit===null?'mdSupply':'';}
function mdSupplyColumns(){
 const col=(k,label,type,def)=>({k,label,type:type||'text',def:def!==false});
 return [col('product','Product'),col('glass','Glass'),col('supplier','Supply point','list'),col('sheet','Sheet'),col('unit','Unit','list'),col('price','Purchase price','number'),col('currency','Currency','list'),col('date','Price date','date'),col('freight','Freight, %','number'),col('lead','Lead time, days','number'),col('availability','Availability','list')];
}
/* Без Cost & margin колонок закупки на экране нет; в настройках колонок
   они остаются — сохранённый порядок не ломается при смене человека. */
const MD_SUPPLY_COST_COLS=['price','currency','date','freight'];
function mdSupplyInfos(){
 return (DB.glassSheet||[]).map(s=>{const p=glassProductByCode(s.productCode);return {o:{createdAt:s.priceDate||''},s,p,memo:{product:s.productCode,glass:p?p.name:'no product',supplier:s.supplier,
  sheet:s.sheetWIn!=null&&s.sheetHIn!=null?s.sheetWIn+' × '+s.sheetHIn+' in':'',unit:mdUnitName(s.purchaseUnit),price:s.purchasePrice,currency:s.currency,date:s.priceDate||'',freight:s.freightPct,lead:s.leadTimeDays,availability:glassLabel('availability',s.availability)}};});
}
function mdSupplyHeader(c){const active=salesListFilterActive(salesListLoadPrefs().filters[c.k]);return `<th class="${c.type==='number'?'n':''}"><span class="sl-th">${esc(c.label)}<button type="button" class="sl-fbtn${active?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${esc(c.label)}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span></th>`;}
function mdSupplyCell(i,c){
 const s=i.s,v=salesListValue(i,c.k);
 if(c.k==='product')return `<td class="mono"><b>${raw(s.productCode)}</b></td>`;
 if(c.k==='glass')return `<td>${i.p?raw(i.p.name):'<span class="pill warn">no product</span>'}</td>`;
 if(c.k==='price')return `<td class="n mono">${s.purchasePrice==null?'<span class="mut">none</span>':esc(s.purchasePrice.toFixed(2))}</td>`;
 if(c.k==='date')return `<td>${v?esc(salesListShortDay(v)):'<span class="mut">—</span>'}</td>`;
 if(c.k==='freight')return `<td class="n">${v==null?'—':esc(v+'%')}</td>`;
 if(c.k==='lead')return `<td class="n">${v==null?'<span class="mut">—</span>':esc(v+' days')}</td>`;
 if(c.k==='availability')return `<td><span class="pill ${s.availability==='stock'?'ok':s.availability==='inactive'?'warn':'info'}">${esc(v)}</span></td>`;
 return `<td>${v==null||v===''?'<span class="mut">—</span>':raw(String(v))}</td>`;
}
function viewMdSupply(){
 if(mdSheetEdit!==null)return mdSheetForm();
 const infos=mdSupplyInfos(),rows=salesListRows(infos),cost=accessCost(),cols=salesListColumns().filter(c=>cost||!MD_SUPPLY_COST_COLS.includes(c.k)),orphans=glassOrphanSheets().length;
 const settings=`<button type="button" class="gb-settings" data-columns-button title="Columns" aria-label="Columns" onclick="salesListOpenColumns(event)">${ico('settings')}</button>`;
 return `<div class="md-supply-head"><span class="mut">Glass · supplier · sheet size.</span><span class="sp"></span><button class="pri" onclick="mdSheetNew()">+ New supply row</button></div>
  ${orphans?`<div class="note">Supply rows without a product: <b>${orphans}</b> — give them a product back.</div>`:''}
  ${salesListFilterChips()}
  <div class="sales-table-wrap"><table class="sl-table md-supply-table"><thead><tr><th><span class="sl-header-tools">${settings}</span></th>${cols.map(mdSupplyHeader).join('')}<th></th></tr></thead>
  <tbody>${rows.map(i=>`<tr data-supply-row="${esc(i.s.id)}" data-md-row="glassSheet:${esc(i.s.id)}"><td></td>${cols.map(c=>mdSupplyCell(i,c)).join('')}<td style="white-space:nowrap"><button class="sm" onclick="mdSheetEditRow('${esc(i.s.id)}')">Edit</button> <button class="sm dl" onclick="mdSheetDelete('${esc(i.s.id)}')">×</button></td></tr>`).join('')||`<tr><td colspan="${cols.length+2}" class="empty">${infos.length?'Nothing matches the filters.':'No supply rows yet — load GLASS_SHEETS.csv or add a row'}</td></tr>`}</tbody></table></div>
  <div class="mut md-supply-foot">${rows.length} of ${infos.length} rows</div>${salesListMenuHTML(infos)}`;
}
function mdSheetNew(){
 mdSheetEdit='new';mdSheetPick={mfr:'',thick:'',coat:''};
 mdSheetDraft=normalizeGlassSheet({productCode:'',supplier:'',currency:GLASS_DEFAULT_CURRENCY,purchaseUnit:GLASS_DEFAULT_UNIT,availability:'order'});
 render();
}
/* Строка поставки из карточки стекла: стекло уже выбрано. */
function mdSheetNewFor(code){mdSetTab('materials');mdMatSwitch('glass','glassSheet');mdSheetNew();mdSheetDraft.productCode=code;mdSheetPick={mfr:'',thick:'',coat:''};render();}
function mdSheetEditRow(id){
 const s=(DB.glassSheet||[]).find(x=>x.id===id);if(!s)return;
 mdSheetEdit=id;mdSheetDraft=JSON.parse(JSON.stringify(s));mdSeen.sheet=JSON.stringify(s);mdSheetPick={mfr:'',thick:'',coat:''};render();
}
/* Форма из двух блоков (владелец, 2 октября 2026): Glass — стекло, Supply —
   точка поставки из уже заведённых (валюта подставляется от неё), лист,
   цена, дата календарём. Стекло выбирается как в Sales (владелец,
   23.10.2026: «почему он не как сейл удобный»): производитель → толщина →
   покрытие → на каком стекле, под выбором — что выбрано. Фильтры
   перестраивают только списки стёкол: набранное в Supply не теряется. */
let mdSheetPick={mfr:'',thick:'',coat:''};
function mdSheetProducts(coat){
 return DB.glassProduct.filter(p=>(!mdSheetPick.mfr||p.manufacturer===mdSheetPick.mfr)&&(!mdSheetPick.thick||String(p.thicknessMm)===mdSheetPick.thick)&&(!coat||!mdSheetPick.coat||glassCoatingName(p)===mdSheetPick.coat)).sort((a,b)=>a.code.localeCompare(b.code));
}
function mdSheetCoatOptions(){
 const c=[...new Set(mdSheetProducts(false).map(glassCoatingName).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 return '<option value="">Any coating</option>'+c.map(n=>`<option data-raw value="${esc(n)}" ${n===mdSheetPick.coat?'selected':''}>${esc(n)}</option>`).join('');
}
function mdSheetProductOptions(code){
 const list=mdSheetProducts(true),chosen=code&&!list.some(p=>p.code===code)?glassProductByCode(code):null;
 return '<option value="">— select —</option>'+(chosen?[chosen]:[]).concat(list).map(p=>`<option data-raw value="${esc(p.code)}" ${p.code===code?'selected':''}>${esc(mdSheetPick.coat?glassBaseName(p):p.name)} · ${esc(p.code)}</option>`).join('');
}
function mdSheetThickOptions(){
 const t=[...new Set(DB.glassProduct.filter(p=>!mdSheetPick.mfr||p.manufacturer===mdSheetPick.mfr).map(p=>+p.thicknessMm).filter(n=>n>0))].sort((a,b)=>a-b);
 return '<option value="">Any thickness</option>'+t.map(n=>`<option value="${n}" ${String(n)===mdSheetPick.thick?'selected':''}>${n} mm</option>`).join('');
}
function mdSheetPickSet(k,v){
 mdSheetPick[k]=String(v==null?'':v);
 if(k==='mfr'){mdSheetPick.thick='';const t=document.getElementById('md_sheetThick');if(t)t.innerHTML=mdSheetThickOptions();}
 if(k!=='coat'){mdSheetPick.coat='';const c=document.getElementById('md_sheetCoat');if(c)c.innerHTML=mdSheetCoatOptions();}
 const sel=document.getElementById('md_sheetCode'),cur=sel?sel.value:'';if(sel)sel.innerHTML=mdSheetProductOptions(cur);
 mdSheetGlassPicked();
}
function mdSheetGlassPicked(){
 const sel=document.getElementById('md_sheetCode'),m=document.getElementById('md_sheetMeta');
 if(m)m.innerHTML=salesGlassMetaFor((glassProductByCode(sel?sel.value:'')||{}).id);
}
/* Точка поставки знает свою валюту: Vitro Barrie — CAD, Vitro USA — USD. */
function mdSheetPoints(){const m=new Map();(DB.glassSheet||[]).forEach(s=>{if(s.supplier&&!m.has(s.supplier))m.set(s.supplier,s.currency||'');});return m;}
function mdSheetPointPicked(v){const cur=mdSheetPoints().get(String(v||'').trim()),el=document.getElementById('md_sheetCurrency');if(cur&&el)el.value=cur;}
/* Card links do not rename established supply points or reprice a sheet. */
function mdSheetSupplierPicked(id){
 const card=purSupplierFind(id),point=document.getElementById('md_sheetSupplier');
 if(card&&point&&!point.value.trim()){point.value=card.name;document.getElementById('md_sheetCurrency').value=card.currency;}
}
function mdSheetForm(){
 const r=mdSheetDraft,isNew=mdSheetEdit==='new',p=r.productCode?glassProductByCode(r.productCode):null;
 if(!mdSheetPick.touched){mdSheetPick={mfr:p?p.manufacturer:'',thick:p?String(p.thicknessMm):'',coat:p?glassCoatingName(p):'',touched:true};}
 const mfrs=[...new Set(DB.glassProduct.map(x=>x.manufacturer).filter(Boolean))].sort(),points=mdSheetPoints();
 return `<div class="form md-sheet-form"><h3>${isNew?'New supply row':'Edit supply row'}</h3><div class="md-sheet-grid">
  <div class="md-sheet-box"><h4>Glass</h4><div class="md-sheet-fields">
   <div><label>Manufacturer</label><select id="md_sheetMfr" onchange="mdSheetPickSet('mfr',this.value)"><option value="">All manufacturers</option>${mfrs.map(m=>`<option data-raw value="${esc(m)}" ${m===mdSheetPick.mfr?'selected':''}>${esc(m)}</option>`).join('')}</select></div>
   <div><label>Thickness</label><select id="md_sheetThick" onchange="mdSheetPickSet('thick',this.value)">${mdSheetThickOptions()}</select></div>
   <div class="md-sheet-wide"><label>Coating</label><select id="md_sheetCoat" onchange="mdSheetPickSet('coat',this.value)">${mdSheetCoatOptions()}</select></div>
   <div class="md-sheet-wide"><label>Glass *</label><select id="md_sheetCode" onchange="mdSheetGlassPicked()">${mdSheetProductOptions(r.productCode)}</select><div id="md_sheetMeta">${salesGlassMetaFor(p&&p.id)}</div></div>
  </div></div>
  <div class="md-sheet-box"><h4>Supply</h4><div class="md-sheet-fields md-sheet-3">
   <div class="md-sheet-wide"><label>Supplier card</label><select id="md_sheetSupplierId" onchange="mdSheetSupplierPicked(this.value)"><option value="">Match by supply point</option>${(DB.supplier||[]).slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s=>`<option value="${esc(s.id)}" ${s.id===r.supplierId?'selected':''} data-raw>${esc(s.name)}${s.active?'':' · Archived'}</option>`).join('')}</select></div>
   <div><label>Supply point *</label><input id="md_sheetSupplier" list="md_sheetPoints" autocomplete="off" value="${esc(r.supplier)}" placeholder="Vitro Barrie" onchange="mdSheetPointPicked(this.value)"><datalist id="md_sheetPoints">${[...points.keys()].map(n=>`<option value="${esc(n)}"></option>`).join('')}</datalist></div>
   ${mdCostOnly(`<div><label>Currency</label><input id="md_sheetCurrency" value="${esc(r.currency)}" maxlength="3" title="Filled from the supply point"></div>`)}
   <div><label>Availability</label><select id="md_sheetAvail">${mdVocabOptions('availability',r.availability)}</select></div>
   <div><label>Sheet, in</label><div class="md-sheet-pair"><input id="md_sheetW" type="number" step="0.1" min="0" placeholder="W" value="${r.sheetWIn==null?'':r.sheetWIn}"><span>×</span><input id="md_sheetH" type="number" step="0.1" min="0" placeholder="H" value="${r.sheetHIn==null?'':r.sheetHIn}"></div></div>
   <div><label>Purchase unit</label><select id="md_sheetUnit">${mdUnitOptions(r.purchaseUnit)}</select></div>
   ${mdCostOnly(`<div><label>Purchase price</label><input id="md_sheetPrice" type="number" step="0.01" min="0" value="${r.purchasePrice==null?'':r.purchasePrice}"></div>
   <div><label>Price date</label><input id="md_sheetDate" type="date" value="${esc(r.priceDate)}"></div>
   <div><label>Freight, %</label><input id="md_sheetFreight" type="number" step="0.1" min="0" value="${r.freightPct==null?'':r.freightPct}"></div>`)}
   <div><label>Lead time, days</label><input id="md_sheetLead" type="number" step="1" min="0" value="${r.leadTimeDays==null?'':r.leadTimeDays}"></div>
   <div class="md-sheet-wide"><label>Note</label><input id="md_sheetNote" value="${esc(r.note)}"></div>
  </div>${accessCost()?'<div class="mut md-sheet-tiny">Purchase prices.</div>':''}</div>
 </div>
  <div class="err" id="e_mdSheet"></div>
  <div class="row"><button class="pri" onclick="mdSheetSave()">Save</button><button onclick="mdSheetEdit=null;mdSheetDraft=null;mdSheetPick={mfr:'',thick:'',coat:''};render()">Cancel</button></div></div>`;
}
function mdSheetSave(){
 const e=document.getElementById('e_mdSheet');e.style.display='none';
 if(mdSheetEdit!=='new'){const stale=mdStale('sheet',(DB.glassSheet||[]).find(x=>x.id===mdSheetDraft.id));if(stale)return fail(e,stale);}
 const code=mdVal('md_sheetCode'),supplier=mdVal('md_sheetSupplier'),cur=mdVal('md_sheetCurrency').toUpperCase();
 if(!code||!supplier)return fail(e,'Product and supply point are required');
 if(cur&&!CURRENCY_RE.test(cur))return fail(e,'Currency: a three-letter code, for example CAD');
 const w=mdVal('md_sheetW'),h=mdVal('md_sheetH');
 if((w==='')!==(h===''))return fail(e,'The sheet size is filled in as a pair: width and height');
 const date=mdVal('md_sheetDate');
 if(date&&!ISO_DATE_RE.test(date))return fail(e,'Price date: format YYYY-MM-DD');
 const next=normalizeGlassSheet({
  id:mdSheetEdit==='new'?'':mdSheetDraft.id,
  productCode:code,supplier,supplierId:mdVal('md_sheetSupplierId'),currency:cur||GLASS_DEFAULT_CURRENCY,
  sheetWIn:w===''?null:+w,sheetHIn:h===''?null:+h,
  purchaseUnit:mdVal('md_sheetUnit'),
  purchasePrice:mdVal('md_sheetPrice')===''?null:+mdVal('md_sheetPrice'),
  priceDate:date,
  freightPct:mdVal('md_sheetFreight')===''?null:+mdVal('md_sheetFreight'),
  leadTimeDays:mdVal('md_sheetLead')===''?null:+mdVal('md_sheetLead'),
  availability:mdVal('md_sheetAvail'),note:mdVal('md_sheetNote')
 });
 const clash=(DB.glassSheet||[]).some(s=>s.id!==mdSheetDraft.id&&
  glassSheetKey(s.productCode,s.supplier,s.sheetWIn,s.sheetHIn)===glassSheetKey(next.productCode,next.supplier,next.sheetWIn,next.sheetHIn));
 if(clash)return fail(e,'This supply point with this sheet is already there');
 const result=storageCommand(()=>{
  if(mdSheetEdit==='new')DB.glassSheet.push(next);
  else{const at=DB.glassSheet.findIndex(s=>s.id===mdSheetDraft.id);if(at<0)throw new Error('Row not found.');DB.glassSheet[at]=next;}
  normalizeMasterData();normalizePurchasing();
 });
 if(!result.ok)return fail(e,result.error);
 mdSheetEdit=null;mdSheetDraft=null;mdSheetPick={mfr:'',thick:'',coat:''};render();
}
function mdSheetDelete(id){
 if(!confirm('Delete this supply row?'))return;
 DB.glassSheet=DB.glassSheet.filter(s=>s.id!==id);touch();render();
}

/* --- 3. Дистанционные рамки -------------------------------------------
   Экран на английском, как и конструктор Makeup: Width · Spacer · Gas ·
   Sealant там уже английские, и рамки читаются рядом с ними одним языком.

   Фактическая толщина правится ПРЯМО В ТАБЛИЦЕ, а не через форму: заполнять
   её придётся по всему ряду, и открывать сорок девять форм подряд — работа,
   которую никто не доводит до конца. Форма нужна, только чтобы завести новую
   позицию или снять её с наличия.

   Номинал стоит рядом с фактом намеренно: расхождение видно сразу, и опечатка
   в миллиметрах (115 вместо 11.5) не уезжает в расчёт пакета молча. */
/* Надбавки за обработку: фрит и спандрел продаются поверх цены стекла своей
   ставкой за sq ft. Держим их рядом с рамками, потому что вопрос один и тот же —
   «сколько стоит то, что мы делаем с листом», и правится так же, в строке. */
function mdSurchargeTable(){
 const rows=[]
  .concat((DB.fritProduct||[]).map(x=>({x:x,kind:'fritProduct',group:'Frit'})))
  .concat((DB.spandrelProduct||[]).map(x=>({x:x,kind:'spandrelProduct',group:'Spandrel'})));
 if(!rows.length)return '';
 return `<div class="sub" style="margin-top:22px">Added per sq ft of glass.</div>
  <div class="customer-table-wrap"><table><thead><tr><th>Product</th><th>Kind</th><th>Surcharge, sq ft</th><th></th></tr></thead>
  <tbody>${rows.map(r=>`<tr>
   <td><b>${raw(r.x.name)}</b><div class="mut mono">${raw(r.x.code||r.x.id)}</div></td>
   <td>${esc(r.group)}</td>
   <td><input class="md-mm" type="number" step="0.01" min="0" style="width:88px" value="${r.x.salePrice==null?'':r.x.salePrice}" placeholder="—" onchange="mdSurchargeSet('${esc(r.kind)}','${esc(r.x.id)}',this.value)"></td>
   <td>${r.x.active===false?'<span class="pill warn">off</span>':'<span class="pill ok">active</span>'}</td>
  </tr>`).join('')}</tbody></table></div>`;
}
function mdSurchargeSet(kind,id,v){
 const row=(DB[kind]||[]).find(x=>x.id===id);if(!row)return;
 const typed=String(v==null?'':v).trim();
 if(typed===''){row.salePrice=null;touch();render();return;}
 const n=+typed;
 if(!isFinite(n)||n<0){render();return;}
 row.salePrice=Math.round(n*100)/100;touch();render();
}
/* Карточка рамки (этап 3 плана Master Data): цена и единица продажи, вес
   с отметкой «замерено», рецепт обвязки. Счётчики сверху только
   предупреждают — заказ всё равно считается и сохраняется. */
function viewMdSpacer(){
 if(mdSpacerEdit!==null)return mdSpacerForm();
 const all=(DB.spacerVariant||[]).slice(),fam=sp=>{const x=spacerSystemByName(sp.system);return x?x.family:'';};
 all.sort((a,b)=>{
  const fa=fam(a),fb=fam(b);if(fa!==fb)return String(fa).localeCompare(String(fb));
  if(a.system!==b.system)return String(a.system).localeCompare(String(b.system));
  const qa=spacerSizeParts(a.size),qb=spacerSizeParts(b.size);
  return (qa?qa.value:0)-(qb?qb.value:0);
 });
 /* Счётчики этого списка — в шапке каталога (mdCatalogHealth), здесь их нет. */
 return `<div class="md-toolbar"><span class="mut">Price, weight and recipe per spacer.</span><span class="sp"></span><button class="pri" onclick="mdSpacerNew()">+ New spacer</button></div>
  <div class="customer-table-wrap"><table><thead><tr><th>System</th><th>Nominal</th><th>Actual, mm</th><th>Price</th><th>Weight</th><th>Recipe</th><th>Availability</th><th></th></tr></thead>
  <tbody>${all.map(mdSpacerRow).join('')||'<tr><td colspan="8" class="empty">no spacers</td></tr>'}</tbody></table></div>
  ${mdSpacerSystemsTable()}
  ${mdSurchargeTable()}`;
}
function mdSpacerRow(sp){
 const nominal=spacerNominalMm(sp.size),fact=mdNum(sp.thicknessMm),rec=surroundRecipeById(sp.recipeId),sys=spacerSystemByName(sp.system);
 return `<tr data-spacer="${esc(sp.id)}" data-md-row="spacerVariant:${esc(sp.id)}">
  <td><b>${raw(sp.system)}</b>${sys?'':' <span class="pill warn">no system</span>'}<div class="mut mono">${raw(sp.id)}${sys&&sys.family?' · '+esc(sys.family):''}</div></td>
  <td class="mono"><b>${raw(sp.size)}″</b><div class="mut">${nominal==null?'—':esc(nominal.toFixed(1))} mm</div></td>
  <td><input class="md-mm" type="number" step="0.1" min="0" style="width:88px" value="${fact==null?'':fact}" placeholder="${nominal==null?'':esc(nominal.toFixed(1))}" onchange="mdSpacerSetThickness('${esc(sp.id)}',this.value)"></td>
  <td class="mono">${sp.salePrice==null?'<span class="pill warn">no price</span>':esc(Number(sp.salePrice).toFixed(2))+' <span class="mut">/ '+esc(salesPriceUnitLabel(sp.salesUnit))+'</span>'}</td>
  <td class="mono">${sp.weightG==null?'<span class="pill warn">no weight</span>':esc(String(sp.weightG))+' <span class="mut">'+esc(SPACER_WEIGHT_PER[sp.weightPer])+'</span>'+(sp.weightMeasured?'':' <span class="pill info">not measured</span>')}</td>
  <td>${rec?raw(rec.name):'<span class="pill warn">no recipe</span>'}</td>
  <td><span class="pill ${sp.availability==='stock'?'ok':sp.availability==='inactive'?'warn':'info'}">${esc(glassLabel('availability',sp.availability))}</span></td>
  <td style="white-space:nowrap"><button class="sm" onclick="mdSpacerEditRow('${esc(sp.id)}')">Edit</button>
   <button class="sm dl" onclick="mdSpacerDelete('${esc(sp.id)}')">×</button></td></tr>`;
}
function mdSpacerSetThickness(id,v){
 const sp=(DB.spacerVariant||[]).find(x=>x.id===id);if(!sp)return;
 const typed=String(v==null?'':v).trim();
 if(typed===''){sp.thicknessMm=null;touch();render();return;}
 const mm=+typed;
 if(!isFinite(mm)||mm<=0){render();return;}
 sp.thicknessMm=Math.round(mm*100)/100;touch();render();
}
function mdSpacerNew(){
 mdSpacerEdit='new';
 const sys=(DB.spacerSystem||[])[0];
 mdSpacerDraft={id:'',system:sys?sys.name:'',size:'',thicknessMm:null,availability:'stock',supplier:'',leadTimeDays:null,active:true,salePrice:null,salesUnit:'',recipeId:'',weightG:null,weightPer:'ft',weightMeasured:false};
 render();
}
function mdSpacerEditRow(id){
 const sp=(DB.spacerVariant||[]).find(x=>x.id===id);if(!sp)return;
 mdSpacerEdit=id;mdSpacerDraft=JSON.parse(JSON.stringify(sp));mdSeen.spacer=JSON.stringify(sp);render();
}
/* Карточка рамки в виде плана (md-card): вкладки как в Spiel плюс
   расход по рецепту обвязки и склад расходников. */
function mdSpacerForm(){
 const r=mdSpacerDraft,isNew=mdSpacerEdit==='new';
 const nominal=spacerNominalMm(r.size),systems=DB.spacerSystem||[],sys=spacerSystemByName(r.system),rec=surroundRecipeById(r.recipeId);
 const sysOpts=systems.map(x=>`<option data-raw value="${esc(x.name)}" ${x.name===r.system?'selected':''}>${esc(x.name)}${x.family?' · '+esc(x.family):''}</option>`).join('')+(r.system&&!sys?`<option data-raw value="${esc(r.system)}" selected>${esc(r.system)} · not in the list</option>`:'');
 const num=(id,v,attrs)=>`<input id="${id}" type="number" ${attrs||'step="any" min="0"'} value="${v==null?'':esc(v)}" placeholder="—">`;
 const unit=(id,v)=>`<select id="${id}"><option value="">—</option>${mdUnitOptions(v)}</select>`;
 const cost=r.purchasePrice!=null&&r.packQty?r.purchasePrice/r.packQty:null;
 const general=`<div class="grid">
   ${mdField('System *',`<select id="md_spSystem">${sysOpts}</select>`,'Systems: below the list.')}
   ${mdField('Nominal size *',`<input id="md_spSize" value="${esc(r.size)}" placeholder="17/32">`,'Nominal: '+(nominal==null?'—':esc(nominal.toFixed(1)+' mm')))}
   ${mdField('Actual thickness, mm',num('md_spMm',r.thicknessMm,'step="0.1" min="0"').replace('placeholder="—"',`placeholder="${nominal==null?'':esc(nominal.toFixed(1))}"`),'Empty — nominal.')}
   ${mdField('Availability',`<select id="md_spAvail">${mdVocabOptions('availability',r.availability)}</select>`)}
  </div><div style="margin-top:12px">${mdField('Note',`<input id="md_spNote" value="${esc(r.note)}">`)}</div>`;
 const units=`<div class="grid">
   ${mdField('Stocking unit',unit('md_spStockUnit',r.stockingUnit))}
   ${mdField('Purchase unit',unit('md_spBuyUnit',r.purchaseUnit))}
   ${mdField('Per purchase unit',num('md_spPack',r.packQty),'1 box = 1880 ft')}
   ${mdField('Sales unit',`<select id="md_salesunit"><option value="">sq ft</option>${mdUnitOptions(r.salesUnit)}</select>`)}
  </div>`;
 const measure=`<div class="grid">
   ${mdField('Weight, g',num('md_spWeight',r.weightG).replace('placeholder="—"','placeholder="unknown"'))}
   ${mdField('Per',`<select id="md_spWeightPer">${Object.keys(SPACER_WEIGHT_PER).map(k=>`<option value="${k}" ${k===r.weightPer?'selected':''}>${esc(SPACER_WEIGHT_PER[k])}</option>`).join('')}</select>`)}
   <div><label class="chk"><input type="checkbox" id="md_spMeasured" ${r.weightMeasured?'checked':''}> Measured</label><div class="hint">Off — an estimate.</div></div>
  </div><h4>Size limits</h4><div class="grid">${mdSaleRulesFields(r,['minAreaFt2','minWidthIn','minHeightIn','maxWidthIn','maxHeightIn'])}</div>`;
 const purchase=`<div class="grid">
   ${mdField('Supplier',`<input id="md_spSupplier" value="${esc(r.supplier)}">`)}
   ${mdCostOnly(mdField('Purchase price',num('md_spBuyPrice',r.purchasePrice,'step="0.01" min="0"'),'Per purchase unit.')+mdField('Currency',`<input id="md_spCurrency" value="${esc(r.currency||'CAD')}" maxlength="3">`)+mdField('Price date',`<input id="md_spPriceDate" type="date" value="${esc(r.priceDate)}">`))}
   ${mdField('Lead time, days',num('md_spLead',r.leadTimeDays,'step="1" min="0"'))}
   ${accessCost()?mdField('Cost per '+esc(mdUnitName(r.stockingUnit)||'stock unit'),`<div class="mono" data-md-cost>${cost==null?'—':esc(cost.toFixed(4))+' '+esc(r.currency||'CAD')}</div>`,'Price ÷ per unit.'):''}
  </div>`;
 const prices=`<div class="grid">
   ${mdField('Price, CAD',num('md_spPrice',r.salePrice,'step="0.01" min="0"'),'Empty — no price.')}
   ${mdSaleRulesFields(r,['minCharge'])}
  </div>${isNew?'':mdPriceListsHTML('item:spacerVariant:'+r.id)}`;
 const st=isNew?null:consRows().find(x=>x.key===consKey('spacerVariant',r.id));
 const q=v=>esc((Math.round(v*10)/10).toFixed(1))+' ft';
 const stock=st?`<dl class="md-kv" data-md-stock><dt>On hand</dt><dd>${q(st.onHand)}</dd><dt>Reserved</dt><dd>${q(st.reserved)}</dd><dt>Free</dt><dd>${q(st.free)}</dd><dt>Status</dt><dd>${esc(st.status)}</dd></dl><p class="mut">Counted in Inventory → Consumables.</p>`:'<p class="mut">Save first.</p>';
 const parts=rec?`<table class="ncr-table" data-md-recipe-parts><thead><tr><th>Part</th><th class="n">Amount</th><th class="n">Waste</th></tr></thead><tbody>${rec.rows.map(x=>`<tr><td>${raw(surroundPartLabel(x.part))}</td><td class="n mono">${x.amount==null?(x.part==='spacer'||x.part==='gas'?'<span class="mut">by size</span>':'<span class="pill warn">no norm</span>'):esc(String(x.amount))+' <span class="mut">'+esc(SURROUND_PER[x.per])+'</span>'}</td><td class="n mono">${esc(String(x.wastePct||0))}%</td></tr>`).join('')}</tbody></table>`:'';
 const use=`<div class="grid">${mdField('Surround recipe',`<select id="md_spRecipe"><option value="">— no recipe —</option>${(DB.surroundRecipe||[]).map(x=>`<option value="${esc(x.id)}" ${x.id===r.recipeId?'selected':''}>${esc(x.name||x.id)}</option>`).join('')}</select>`,'Edited in Surround recipes.')}</div>${parts}`;
 return mdCardHTML({form:'spacer',crumb:['Materials','IGU assembly','Spacers'].concat(r.system?[r.system]:[]),
  title:isNew?'New spacer':raw(r.name||r.id),status:isNew?null:[glassLabel('availability',r.availability),r.availability==='stock'?'ok':r.availability==='inactive'?'warn':'info'],code:isNew?'':(r.code||r.id),
  tabs:[{k:'general',label:'General',html:general,missing:!sys},{k:'units',label:'Units',html:units},{k:'measure',label:'Measurements',html:measure,missing:r.weightG==null},
   {k:'purchase',label:'Purchase',html:purchase},{k:'prices',label:'Prices',html:prices,missing:r.salePrice==null},{k:'stock',label:'Stock',html:stock},{k:'use',label:'Consumption',html:use,missing:!rec}],
  foot:`<div class="err" id="e_mdSpacer"></div><div class="row"><button class="pri" onclick="mdSpacerSave()">Save</button><button onclick="mdSpacerEdit=null;mdSpacerDraft=null;render()">Cancel</button></div>`})
  .replace('data-md-card="spacer"','data-md-card="spacer" data-spacer-card');
}
function mdSpacerSave(){
 const e=document.getElementById('e_mdSpacer');e.style.display='none';
 if(mdSpacerEdit!=='new'){const stale=mdStale('spacer',(DB.spacerVariant||[]).find(x=>x.id===mdSpacerEdit));if(stale)return fail(e,stale);}
 const system=mdVal('md_spSystem'),size=mdVal('md_spSize');
 if(!system||!size)return fail(e,'System and nominal size are required');
 const q=spacerSizeParts(size);
 if(!q)return fail(e,'Nominal size is a fraction, for example 17/32');
 const sys=spacerSystemByName(system);
 const id=mdSpacerEdit==='new'?'SP-'+(sys&&sys.code?sys.code:'X')+'-'+spacerSizeKey(size):mdSpacerDraft.id;
 if(mdSpacerEdit==='new'&&(DB.spacerVariant||[]).some(x=>x.id===id))return fail(e,'This spacer already exists: '+id);
 const num=k=>{const t=mdVal(k);return t===''?null:+t;},bad=v=>v!=null&&(!isFinite(v)||v<0);
 const mm=num('md_spMm'),price=num('md_spPrice'),weight=num('md_spWeight'),lead=num('md_spLead'),pack=num('md_spPack'),buy=num('md_spBuyPrice');
 if(mm!=null&&(!isFinite(mm)||mm<=0))return fail(e,'Actual thickness: a positive number of millimetres');
 if([price,weight,lead,pack,buy].some(bad))return fail(e,'Prices, weight, pack and lead time: a non-negative number or empty');
 const next=Object.assign({},mdSpacerDraft,mdSaleRulesRead(),{
  id:id,system:system,size:size,thicknessMm:mm,
  name:system+' '+size+'″',code:mdSpacerEdit==='new'?id:(mdSpacerDraft.code||id),
  salePrice:price,salesUnit:mdVal('md_salesunit'),
  weightG:weight,weightPer:mdVal('md_spWeightPer'),weightMeasured:mdChecked('md_spMeasured'),recipeId:mdVal('md_spRecipe'),
  availability:mdVal('md_spAvail'),supplier:mdVal('md_spSupplier'),leadTimeDays:lead,active:mdSpacerDraft.active!==false,
  note:mdVal('md_spNote'),stockingUnit:mdVal('md_spStockUnit'),purchaseUnit:mdVal('md_spBuyUnit'),packQty:pack,
  purchasePrice:buy,currency:mdVal('md_spCurrency').toUpperCase()||'CAD',priceDate:mdVal('md_spPriceDate')
 });
 /* Единица закупки и «в упаковке» — первая строка «Bought in» склада. */
 if(Array.isArray(next.packs)&&next.packs.length&&next.purchaseUnit&&pack>0)next.packs=[{unit:next.purchaseUnit,qty:pack}].concat(next.packs.slice(1).filter(p=>p.unit!==next.purchaseUnit));
 if(mdSpacerEdit==='new')DB.spacerVariant.push(next);
 else{const at=DB.spacerVariant.findIndex(x=>x.id===mdSpacerDraft.id);if(at<0)return fail(e,'Spacer not found');DB.spacerVariant[at]=next;}
 mdSpacerEdit=null;mdSpacerDraft=null;normalizeMasterData();touch();render();
}
/* Рамка может стоять в уже сохранённом заказе, поэтому удаление говорит об этом
   прямо: снять с наличия обычно правильнее, чем стереть. */
function mdSpacerDelete(id){
 const used=(DB.salesOrder||[]).some(o=>(o.makeups||[]).some(m=>(m.cavities||[]).some(c=>c.spacerVariantId===id)));
 if(!confirm(used?'This spacer is used in saved orders. Delete anyway? It will become unknown there.':'Delete this spacer?'))return;
 DB.spacerVariant=DB.spacerVariant.filter(x=>x.id!==id);touch();render();
}

/* Weight coefficients remain editable master data. Area-based shop norms are
   shown in grams because that is how they are measured, while calculation
   stores kg in one canonical unit. */
function mdWeightDisplay(row){if(row.unit==='kg/ft²')return {value:row.rate==null?'':row.rate*1000,unit:'g/ft²',factor:1000};if(row.unit==='kg/unit')return {value:row.rate==null?'':row.rate*1000,unit:'g/unit',factor:1000};return {value:row.rate==null?'':row.rate,unit:row.unit||'kg/unit',factor:1};}
function mdWeightSet(key,value,factor){
 const row=(DB.materialWeightRates||[]).find(r=>r.key===key);if(!row)return;
 const typed=String(value==null?'':value).trim();
 if(typed===''){row.rate=null;row.derived=false;touch();render();return;}
 const n=Number(typed);if(!Number.isFinite(n)||n<0){render();return;}
 row.rate=n/(factor||1);row.derived=false;touch();render();
}

/* --- 3. Фурнитура ------------------------------------------------------
   Просьба владельца дословно: «создать так, чтобы я потом мог добавлять
   информацию о петлях пивотах и клемах и прочее». Поэтому редактируются ОБЕ
   таблицы — и модели, и сами виды: пивота в присланном списке нет вовсе, а
   значит добавлять придётся не только строки, но и семейства.

   Геометрии посадочного места здесь нет намеренно. Владелец: «у нас нет
   машины, которая считает геометрию и потом вырезает петли — это делает
   человек, у него есть заготовленные шаблоны». Каталог отвечает на вопрос
   «какой шаблон брать», заказ — «где поставить». Появится станок — к записи
   модели доцепится геометрия, и заказы переделывать не придётся.

   Позиция, на которую ссылается заказ, НЕ УДАЛЯЕТСЯ — только помечается
   неактивной. Иначе старый чертёж показал бы метку без имени, и никто не
   узнал бы, какую петлю ставили. То же правило, что в каталоге стекла. */

function mdHwKindUsage(code){
 return (DB.shapeDef||[]).reduce((n,s)=>n+((s.manufacturingItems||[]).filter(i=>i.type===code).length),0);
}
function mdHwModelUsage(id){
 return (DB.shapeDef||[]).reduce((n,s)=>n+((s.manufacturingItems||[]).filter(i=>i.modelId===id).length),0);
}
/* Hardware деревом (этап 5 плана Master Data): вид → серия → модели;
   модель открывается по клику. Только вид: правят в карточках ниже. */
function mdHwTreeHTML(){
 const kinds=DB.hardwareKind||[],models=DB.hardwareModel||[];
 const node=k=>{const list=models.filter(m=>m.kind===k.code),series=[...new Set(list.map(m=>m.series||''))].sort();
  return `<li class="md-st-node" data-md-hw-kind="${esc(k.code)}"><div><b data-raw>${esc(hardwareKindName(k.code))}</b> <span class="mono" data-raw>${esc(k.code)}</span> <span class="mut">${list.length} models</span>${k.active===false?' <span class="pill warn">inactive</span>':''}</div>
   ${series.map(sr=>`<div class="md-st-kids"><span class="mut">${sr?esc(sr):'No series'} ·</span> ${list.filter(m=>(m.series||'')===sr).sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(m=>`<button type="button" class="pill${m.active===false?' warn':''}" data-raw onclick="mdHwModelEditRow('${esc(m.id)}')">${esc(m.name)}</button>`).join(' ')}</div>`).join('')}</li>`;};
 return `<div class="md-st-tree" data-md-hw-tree><ol><li class="md-st-step"><ul>${kinds.map(node).join('')||'<li class="mut">No kinds</li>'}</ul></li></ol></div>`;
}
/* Дерево, потом модели — их правят чаще; виды ниже (аудит D-4). */
function viewMdHardware(){
 if(mdHwKindEdit!==null)return mdHwKindForm();
 if(mdHwModelEdit!==null)return mdHwModelForm();
 const kinds=DB.hardwareKind||[],models=DB.hardwareModel||[];
 const shown=mdHwFilter?models.filter(m=>m.kind===mdHwFilter):models;
 const sorted=shown.slice().sort((a,b)=>String(a.kind).localeCompare(String(b.kind))||String(a.series||'').localeCompare(String(b.series||''))||String(a.name).localeCompare(String(b.name)));
 const orphans=models.filter(m=>!hardwareKindRow(m.kind)).length;
 return `<div class="sub">Kind → series → models.</div>
  ${mdHwTreeHTML()}
  ${orphans?`<div class="note">Models without a kind: <b>${orphans}</b>. Give them a kind.</div>`:''}
  <div class="section-title"><h3>Models</h3><span class="pill info">as on the shop template</span></div>
  <div class="md-toolbar" data-md-hw-models><select aria-label="Kind" onchange="mdHwFilter=this.value;render()"><option value="">All kinds</option>${kinds.map(k=>`<option value="${esc(k.code)}" ${mdHwFilter===k.code?'selected':''} data-raw>${esc(hardwareKindName(k.code))}</option>`).join('')}</select><span class="sp"></span><button class="pri" onclick="mdHwModelNew()">+ New model</button></div>
  <div class="sales-table-wrap"><table><thead><tr><th>Model</th><th>Kind</th><th>Series</th><th>On the drawing</th><th>Glass thickness</th><th>Supplier code</th><th>On drawings</th><th>Status</th><th></th></tr></thead>
  <tbody>${sorted.map(m=>{
   const used=mdHwModelUsage(m.id),kind=hardwareKindRow(m.kind);
   return `<tr data-md-row="hardwareModel:${esc(m.id)}"><td><b>${raw(m.name)}</b>${m.note?`<div class="mut">${raw(m.note)}</div>`:''}</td>
    <td>${kind?raw(hardwareKindName(m.kind)):'<span class="pill warn">no kind</span>'}</td>
    <td>${m.series?raw(m.series):'<span class="mut">—</span>'}</td>
    <td class="mono"><b>${raw(hardwareModelShort(m))}</b>${m.short?'':'<div class="mut">auto</div>'}</td>
    <td class="mono">${m.thickness?raw(m.thickness):'<span class="mut">—</span>'}</td>
    <td class="mono">${m.supplierCode?raw(m.supplierCode):'<span class="mut">—</span>'}</td>
    <td class="mono">${used}</td>
    <td><span class="pill ${m.active===false?'warn':'ok'}">${m.active===false?'inactive':'active'}</span></td>
    <td style="white-space:nowrap"><button class="sm" onclick="mdHwModelEditRow('${esc(m.id)}')">Edit</button><button class="sm dl" onclick="mdHwModelDelete('${esc(m.id)}')">×</button></td></tr>`;
  }).join('')||'<tr><td colspan="9" class="empty">no models</td></tr>'}</tbody></table></div>
  <div class="section-title"><h3>Kinds</h3><span class="pill info">code goes on the drawing</span></div>
  <div class="sales-table-wrap"><table><thead><tr><th>Kind</th><th>Code</th><th>On the drawing</th><th>Models</th><th>On drawings</th><th>Status</th><th></th></tr></thead>
  <tbody>${kinds.map(k=>{
   const used=mdHwKindUsage(k.code);
   return `<tr><td><b>${raw(hardwareKindName(k.code))}</b><div class="mut"><span data-raw>${esc(k.name)} · ${esc(k.nameEn)}</span></div></td>
    <td class="mono"><span data-raw>${esc(k.code)}</span></td>
    <td class="mono"><span data-raw>${esc(k.short)}</span></td>
    <td class="mono">${hardwareModelsFor(k.code,true).length}</td>
    <td class="mono">${used}</td>
    <td><span class="pill ${k.active===false?'warn':'ok'}">${k.active===false?'inactive':'active'}</span></td>
    <td style="white-space:nowrap"><button class="sm" onclick="mdHwKindEditRow('${esc(k.code)}')">Edit</button><button class="sm dl" onclick="mdHwKindDelete('${esc(k.code)}')">×</button></td></tr>`;
  }).join('')||'<tr><td colspan="7" class="empty">no kinds</td></tr>'}</tbody></table></div>
  <div class="row"><button onclick="mdHwKindNew()">+ New kind</button></div>`;
}
function mdHwKindNew(){mdHwKindEdit='new';mdHwKindDraft={code:'',name:'',nameEn:'',short:'',active:true,note:''};render();}
function mdHwKindEditRow(code){const k=hardwareKindRow(code);if(!k)return;mdHwKindEdit=code;mdHwKindDraft=JSON.parse(JSON.stringify(k));mdSeen.hwKind=JSON.stringify(k);render();}
function mdHwKindForm(){
 const r=mdHwKindDraft,isNew=mdHwKindEdit==='new';
 return `<div class="form"><h3>${isNew?'New hardware kind':'Edit kind'}</h3>
  <div class="grid">
   <div><label>Code *</label><input id="md_hwKindCode" value="${esc(r.code)}" placeholder="pivot" ${isNew?'':'readonly class="ro"'}><div class="hint">Latin, no spaces; fixed once set.</div></div>
   <div><label>Name *</label><input id="md_hwKindName" value="${esc(r.name)}" placeholder="Pivot"></div>
   <div><label>Name (EN) *</label><input id="md_hwKindNameEn" value="${esc(r.nameEn)}" placeholder="Pivot"><div class="hint">Name in each language.</div></div>
   <div><label>Drawing code</label><input id="md_hwKindShort" value="${esc(r.short)}" placeholder="PVT" maxlength="6"><div class="hint">Empty — from the code.</div></div>
   <div><label>Status</label><select id="md_hwKindActive"><option value="1" ${r.active===false?'':'selected'}>active</option><option value="0" ${r.active===false?'selected':''}>inactive</option></select><div class="hint">Inactive — hidden in new drawings.</div></div>
  </div>
  <div style="margin-top:12px"><label>Note</label><input id="md_hwKindNote" value="${esc(r.note||'')}"></div>
  <div class="err" id="e_mdHwKind"></div>
  <div class="row"><button class="pri" onclick="mdHwKindSave()">Save</button><button onclick="mdHwKindEdit=null;mdHwKindDraft=null;render()">Cancel</button></div></div>`;
}
function mdHwKindSave(){
 const e=document.getElementById('e_mdHwKind');e.style.display='none';
 if(mdHwKindEdit!=='new'){const stale=mdStale('hwKind',hardwareKindRow(mdHwKindEdit));if(stale)return fail(e,stale);}
 const isNew=mdHwKindEdit==='new',code=isNew?mdVal('md_hwKindCode').toLowerCase():mdHwKindDraft.code;
 if(!code)return fail(e,'The kind code is required');
 if(!HW_CODE_RE.test(code))return fail(e,'Kind code: latin letters, digits and a hyphen, starting with a letter');
 if(code==='hole')return fail(e,'The code hole belongs to the drilled hole — it has its own price by diameter');
 if(isNew&&hardwareKindRow(code))return fail(e,'This kind already exists');
 const next=normalizeHardwareKind({code,name:mdVal('md_hwKindName'),nameEn:mdVal('md_hwKindNameEn'),short:mdVal('md_hwKindShort'),active:mdVal('md_hwKindActive')==='1',note:mdVal('md_hwKindNote'),system:!isNew&&mdHwKindDraft.system===true});
 if(!next)return fail(e,'Enter the kind name — at least one of the two');
 if(!mdVal('md_hwKindName')||!mdVal('md_hwKindNameEn'))return fail(e,'The name is required both in Russian and in English');
 if(isNew)DB.hardwareKind.push(next);
 else{const at=DB.hardwareKind.findIndex(k=>k.code===code);if(at<0)return fail(e,'Kind not found');DB.hardwareKind[at]=next;}
 mdHwKindEdit=null;mdHwKindDraft=null;normalizeHardwareCatalog();touch();render();
}
function mdHwKindDelete(code){
 const used=mdHwKindUsage(code),models=hardwareModelsFor(code,true).length;
 if(used)return alert('This hardware kind is used by a Shape. Mark it inactive instead.');
 if(models)return alert('Delete or move the models of this kind first.');
 if(!confirm('Delete this hardware kind?'))return;
 DB.hardwareKind=DB.hardwareKind.filter(k=>k.code!==code);touch();render();
}
function mdHwModelNew(){mdHwModelEdit='new';mdHwModelDraft={id:'',kind:mdHwFilter||((DB.hardwareKind[0]||{}).code||''),name:'',series:'',thickness:'',supplierCode:'',active:true,note:''};render();}
function mdHwModelEditRow(id){const m=hardwareModelById(id);if(!m)return;mdHwModelEdit=id;mdHwModelDraft=JSON.parse(JSON.stringify(m));mdSeen.hwModel=JSON.stringify(m);render();}
function mdHwModelForm(){
 const r=mdHwModelDraft,isNew=mdHwModelEdit==='new',kinds=DB.hardwareKind||[];
 return `<div class="form"><h3>${isNew?'New hardware model':'Edit model'}</h3>
  <div class="grid">
   <div><label>Kind *</label><select id="md_hwModelKind">${kinds.map(k=>`<option value="${esc(k.code)}" ${k.code===r.kind?'selected':''} data-raw>${esc(hardwareKindName(k.code))}</option>`).join('')}</select></div>
   <div><label>Name *</label><input id="md_hwModelName" value="${esc(r.name)}" placeholder="Vienna 180"><div class="hint">As on the shop template.</div></div>
   <div><label>Series</label><input id="md_hwModelSeries" value="${esc(r.series||'')}" placeholder="Vienna"><div class="hint">List order only.</div></div>
   <div><label>On the drawing</label><input id="md_hwModelShort" value="${esc(r.short||'')}" placeholder="${esc(hwDeriveModelShort(r.name,r.series)||'GEN37')}" maxlength="10"><div class="hint">Empty — from the name.</div></div>
   <div><label>Glass thickness</label><input id="md_hwModelThickness" value="${esc(r.thickness||'')}" placeholder="3/8″ · 1/2″"><div class="hint">Note, not calculated.</div></div>
   <div><label>Supplier code</label><input id="md_hwModelCode" value="${esc(r.supplierCode||'')}"></div>
   <div><label>Status</label><select id="md_hwModelActive"><option value="1" ${r.active===false?'':'selected'}>active</option><option value="0" ${r.active===false?'selected':''}>inactive</option></select><div class="hint">Inactive — hidden in new orders.</div></div>
  </div>
  <div style="margin-top:12px"><label>Note</label><input id="md_hwModelNote" value="${esc(r.note||'')}"></div>
  <div class="err" id="e_mdHwModel"></div>
  <div class="row"><button class="pri" onclick="mdHwModelSave()">Save</button><button onclick="mdHwModelEdit=null;mdHwModelDraft=null;render()">Cancel</button></div></div>`;
}
function mdHwModelSave(){
 const e=document.getElementById('e_mdHwModel'),isNew=mdHwModelEdit==='new';e.style.display='none';
 if(!isNew){const stale=mdStale('hwModel',hardwareModelById(mdHwModelEdit));if(stale)return fail(e,stale);}
 const kind=mdVal('md_hwModelKind'),name=mdVal('md_hwModelName');
 if(!kind)return fail(e,'Create a hardware kind first');
 if(!name)return fail(e,'The model name is required');
 const next=normalizeHardwareModel({id:isNew?'':mdHwModelDraft.id,kind,name,series:mdVal('md_hwModelSeries'),short:mdVal('md_hwModelShort'),thickness:mdVal('md_hwModelThickness'),supplierCode:mdVal('md_hwModelCode'),active:mdVal('md_hwModelActive')==='1',note:mdVal('md_hwModelNote'),system:!isNew&&mdHwModelDraft.system===true});
 if(!next)return fail(e,'The model name is required');
 const clash=(DB.hardwareModel||[]).some(m=>m.id!==next.id&&m.kind===next.kind&&m.name.toLowerCase()===next.name.toLowerCase());
 if(clash)return fail(e,'A model with this name already exists for this kind');
 if(isNew)DB.hardwareModel.push(next);
 else{const at=DB.hardwareModel.findIndex(m=>m.id===next.id);if(at<0)return fail(e,'Model not found');DB.hardwareModel[at]=next;}
 mdHwModelEdit=null;mdHwModelDraft=null;normalizeHardwareCatalog();touch();render();
}
function mdHwModelDelete(id){
 if(mdHwModelUsage(id))return alert('This hardware model is used by a Shape. Mark it inactive instead.');
 if(!confirm('Delete this hardware model?'))return;
 DB.hardwareModel=(DB.hardwareModel||[]).filter(m=>m.id!==id);touch();render();
}

/* --- 4. Обзор базы ---------------------------------------------------- */

/* Инструмент пользователя сказать «этого не хватает, это лишнее»: все
   коллекции системы одним списком со счётчиками. Пустая таблица здесь — не
   ошибка, а честный ответ «сюда ещё ничего не завели». */
const MD_COLLECTIONS=[
 {key:'glassProduct',   label:'Glass catalog',      what:'what the glass is and what we sell it for: substrate, coating, thickness, tempering, two prices'},
 {key:'glassSheet',     label:'Supply points',      what:'where and at what price: currency, sheet size, price, lead time'},
 {key:'hardwareKind',   label:'Hardware kinds',      what:'hinge, clamp, patch and whatever is added next'},
 {key:'hardwareModel',  label:'Hardware models',    what:'the shop picks its template by the model name'},
 {key:'heatTreatment',  label:'Heat treatment',      what:'annealed · heat strengthened · tempered'},
 {key:'spacerVariant',  label:'Spacers', what:'price, weight and surround recipe per spacer; nominal picks it, actual drives the calculation'},
 {key:'spacerSystem',   label:'Spacer systems',      what:'Swiss Spacer, Thermix and the rest: name, code, family'},
 {key:'surroundRecipe', label:'Surround recipes',    what:'parts of the IGU surround, norms and waste'},
 {key:'iguPart',        label:'IGU parts',           what:'desiccant, connectors'},
 {key:'gasProduct',     label:'Gas',                 what:'cavity fill'},
 {key:'sealantProduct', label:'Sealants',           what:'primary and secondary seal'},
 {key:'interlayerProduct',label:'Interlayers',  what:'EVA and SGP by grade, price per ply'},
 {key:'fritProduct',    label:'Ceramic paint',           what:'ceramic and digital print, surcharge per sq ft'},
 {key:'spandrelProduct',label:'Spandrel',            what:'opaque panels'},
 {key:'station',        label:'Route stations',    what:'the eleven steps of the route'},
 {key:'edgeAllowance',  label:'Cutting allowance',       what:'removal per side: monolithic by the glass, laminate by the ply'},

 {key:'terminal',       label:'Terminals',           what:'scanning screens on the shop floor'},
 {key:'customer',       label:'Customers',             what:'contacts, addresses, terms'},
 {key:'salesOrder',     label:'Orders',              what:'orders with makeups and lines'},
 {key:'shapeDef',       label:'Shape contours',       what:'part geometry'},
 {key:'user',           label:'Users',        what:'roles and work positions'}
];
/* --- Припуск на рез ---------------------------------------------------
   Съём на сторону: насколько лист обязан быть больше готового размера, чтобы
   после обработки кромки выйти в размер. Раньше эти цифры были ветками в
   модуле Shape, и «делаем по памяти» оставалось единственным местом, где они
   записаны.

   Одна и та же толщина встречается в таблице дважды с РАЗНЫМИ числами, и это
   не ошибка: монолит меряется по самому стеклу, ламинат — по ПЛИТЕ склейки,
   потому что при резке каждое стекло отдельная панель.

   Выигрывает самая узкая подходящая строка, поэтому широкая задаёт умолчание,
   а узкая описывает исключение внутри него — порядок строк ничего не решает. */
const MD_ALLOWANCE_SCOPES=[{k:'mono',label:'Monolithic · per glass'},{k:'lami',label:'Laminated · per PLY'}];
/* Пробник: владелец видит результат правки, не открывая заказ. */
const MD_ALLOWANCE_SAMPLES=[
 {label:'Monolithic 6 mm · Flat Polish',op:'Flat Polish',mm:6,scope:'mono'},
 {label:'Monolithic 12 mm · Flat Polish',op:'Flat Polish',mm:12,scope:'mono'},
 {label:'Monolithic 10 mm · CNC Shape Polish',op:'CNC Shape Polish',mm:10,scope:'mono'},
 {label:'Laminated 6+6 · Flat Polish (ply 6)',op:'Flat Polish',mm:6,scope:'lami'},
 {label:'Laminated 6+6 · Lami Polish (ply 6)',op:'Lami Polish',mm:6,scope:'lami'},
 {label:'Laminated 10+10 · Lami Polish (ply 10)',op:'Lami Polish',mm:10,scope:'lami'},
 {label:'Laminated 12+12 · CNC Lami Polish (ply 12)',op:'CNC Lami Polish',mm:12,scope:'lami'}
];
function mdAllowanceSorted(){
 return (DB.edgeAllowance||[]).slice().sort((a,b)=>
  SHAPE_EDGE_OPS.indexOf(a.op)-SHAPE_EDGE_OPS.indexOf(b.op)
  ||String(a.scope).localeCompare(String(b.scope))
  ||(+a.minMm)-(+b.minMm));
}
function mdAllowanceShow(v){
 const p=fabParseDimStrict(String(v==null?'':v).trim());
 if(!p.ok)return '<span class="pill warn">not a number</span>';
 if(p.v>SHAPE_ALLOWANCE_MAX_IN)return '<span class="pill warn">too much</span>';
 return `<span class="mono">${p.v?esc(dimIn(p.v)):'0″'}</span>`;
}
function viewMdAllowance(){
 const rows=mdAllowanceSorted();
 return `<div class="sub" style="margin-top:6px">Stock removal per side. Narrowest row wins.</div>
  <div class="customer-table-wrap"><table><thead><tr><th>Operation</th><th>Measured by</th><th>From, mm</th><th>To, mm</th><th>Allowance</th><th>Preview</th><th></th></tr></thead>
  <tbody>${rows.map(r=>`<tr>
   <td><select onchange="mdAllowanceSet('${esc(r.id)}','op',this.value)">${SHAPE_EDGE_OPS.map(o=>`<option value="${esc(o)}" ${o===r.op?'selected':''}>${esc(o)}</option>`).join('')}</select></td>
   <td><select onchange="mdAllowanceSet('${esc(r.id)}','scope',this.value)">${MD_ALLOWANCE_SCOPES.map(s=>`<option value="${s.k}" ${s.k===r.scope?'selected':''}>${esc(s.label)}</option>`).join('')}</select></td>
   <td><input class="md-mm" type="number" step="0.1" min="0" style="width:78px" value="${esc(String(r.minMm))}" onchange="mdAllowanceSet('${esc(r.id)}','minMm',this.value)"></td>
   <td><input class="md-mm" type="number" step="0.1" min="0" style="width:78px" value="${esc(String(r.maxMm))}" onchange="mdAllowanceSet('${esc(r.id)}','maxMm',this.value)"></td>
   <td><input style="width:92px" value="${esc(String(r.allowance))}" placeholder="1/16" onchange="mdAllowanceSet('${esc(r.id)}','allowance',this.value)"></td>
   <td>${mdAllowanceShow(r.allowance)}${r.note?`<div class="mut">${esc(r.note)}</div>`:''}</td>
   <td><button class="btn-ghost" onclick="mdAllowanceRemove('${esc(r.id)}')">×</button></td>
  </tr>`).join('')}</tbody></table></div>
  <div style="margin-top:10px"><button class="btn-ghost" onclick="mdAllowanceAdd()">+ row</button></div>
  <div class="sub" style="margin-top:22px">What the current values produce</div>
  <div class="customer-table-wrap"><table><thead><tr><th>Case</th><th>Allowance per side</th></tr></thead>
  <tbody>${MD_ALLOWANCE_SAMPLES.map(s=>{
    const r=ShapeModule.productionAllowanceRule(s.op,s.mm,s.scope);
    return `<tr><td>${esc(s.label)}</td><td>${r.ok?`<b class="mono">${r.value?'+'+esc(dimIn(r.value)):'0″'}</b>`:'<span class="pill warn">no rule — cutting is blocked</span>'}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function mdAllowanceSet(id,field,v){
 const row=(DB.edgeAllowance||[]).find(x=>x.id===id);if(!row)return;
 const typed=String(v==null?'':v).trim();
 if(field==='op'){
  if(SHAPE_EDGE_OPS.indexOf(typed)<0){render();return;}
  row.op=typed;
 }else if(field==='scope'){
  row.scope=typed==='lami'?'lami':'mono';
 }else if(field==='minMm'||field==='maxMm'){
  const n=+typed;
  if(!isFinite(n)||n<0){render();return;}
  /* Перевёрнутый диапазон молча выбросил бы строку из расчёта — правку не
     принимаем, старое значение остаётся на экране. */
  const lo=field==='minMm'?n:+row.minMm,hi=field==='maxMm'?n:+row.maxMm;
  if(hi<lo){render();return;}
  row[field]=n;
 }else if(field==='allowance'){
  const p=fabParseDimStrict(typed);
  if(!p.ok||!(p.v>=0)||p.v>SHAPE_ALLOWANCE_MAX_IN){render();return;}
  row.allowance=typed;
 }else return;
 normalizeEdgeAllowance();touch();render();
}
function mdAllowanceAdd(){
 const rows=Array.isArray(DB.edgeAllowance)?DB.edgeAllowance:(DB.edgeAllowance=[]);
 let id='ALW-OWN-1',i=1;
 while(rows.some(r=>r&&r.id===id))id='ALW-OWN-'+(++i);
 rows.push({id:id,op:'Flat Polish',scope:'mono',minMm:0,maxMm:1000,allowance:'1/16',note:''});
 normalizeEdgeAllowance();touch();render();
}
function mdAllowanceRemove(id){
 DB.edgeAllowance=(DB.edgeAllowance||[]).filter(x=>x&&x.id!==id);
 normalizeEdgeAllowance();touch();render();
}
/* Data overview: коллекции, журнал правок и файл Master Data — одним местом
   «проверка и журнал» (план Master Data, раздел Setup → Check & log). */
let mdOverviewView='collections';
function viewMdOverview(){
 const views=[['collections','Collections'],['log','Change log'],['file','Master Data file']];
 const subs=`<div class="md-mat-subs" data-md-overview-subs>${views.map(([k,label])=>`<button class="sm ${k===mdOverviewView?'on':''}" onclick="mdOverviewView='${k}';render()">${label}</button>`).join('')}</div>`;
 /* Файл Master Data несёт закупочные цены — с галочкой Cost & margin. */
 return subs+(mdOverviewView==='log'?viewMdLog():mdOverviewView==='file'?(accessCost()?mdTransferCard():'<div class="mut">Needs Cost &amp; margin.</div>'):viewMdCollections());
}
function viewMdCollections(){
 const rows=MD_COLLECTIONS.map(c=>{
  const n=Array.isArray(DB[c.key])?DB[c.key].length:0;
  return `<tr><td><b>${c.label}</b><div class="mut">${c.what}</div></td>
   <td class="mono"><span data-raw>${esc(c.key)}</span></td>
   <td class="mono"><b>${n}</b></td>
   <td>${n?'<span class="pill ok">filled</span>':'<span class="pill info">empty</span>'}</td></tr>`;
 }).join('');
 return `<div class="sub">All collections.</div>
  <table><thead><tr><th>Collection</th><th>Data key</th><th>Records</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  <div class="hint">Reference version: <b data-raw>${DB.refVersion}</b></div>`;
}

/* --- Журнал и перенос Master Data (erp/masterdata/md-log) ------------- */
let mdLogFilter='',mdLogQuery='',mdLogShown=200,mdTransfer=null;
/* Было → стало закупочной цены — с галочкой Cost & margin (D-2). */
const MD_COST_FIELDS=['purchasePrice','freightPct','supply','priceDate','currency'];
function mdLogValueCells(e){
 if(!accessCost()&&MD_COST_FIELDS.includes(e.field))return '<td class="mut" colspan="2">Cost &amp; margin</td>';
 return `<td class="mono" data-raw>${esc(e.was)}</td><td class="mono" data-raw>${esc(e.now)}</td>`;
}
function viewMdLog(){
 const rows=mdLogRows(mdLogFilter,mdLogQuery),places=[...new Set((DB.masterDataEvent||[]).map(e=>e.tbl))].sort((a,b)=>mdLogWhere(a).localeCompare(mdLogWhere(b)));
 const when=t=>esc(String(t||'').slice(0,16).replace('T',' '));
 const body=rows.slice(0,mdLogShown).map(e=>`<tr data-md-log-row><td class="mono">${when(e.at)}</td><td>${esc(e.by||'—')}</td><td>${esc(mdLogWhere(e.tbl))}</td><td><b data-raw>${esc(e.row)}</b></td><td>${esc(e.what)}${e.field?' · <span class="mono" data-raw>'+esc(e.field)+'</span>':''}</td>${mdLogValueCells(e)}</tr>`).join('');
 return `<div class="row" style="gap:8px;margin-bottom:10px"><input aria-label="Search the log" placeholder="Search" value="${esc(mdLogQuery)}" oninput="mdLogQuery=this.value;mdLogShown=200;render()" style="max-width:260px">
  <select aria-label="Section" style="max-width:220px" onchange="mdLogFilter=this.value;mdLogShown=200;render()"><option value="">All sections</option>${places.map(k=>`<option value="${esc(k)}"${k===mdLogFilter?' selected':''}>${esc(mdLogWhere(k))}</option>`).join('')}</select>
  <span class="mut" data-md-log-count>${rows.length} changes</span></div>
  <table><thead><tr><th>When</th><th>Who</th><th>Section</th><th>Item</th><th>Change</th><th>Was</th><th>Now</th></tr></thead><tbody>${body||'<tr><td colspan="7" class="mut">No changes yet.</td></tr>'}</tbody></table>
  ${rows.length>mdLogShown?`<button type="button" onclick="mdLogShown+=200;render()">Show ${Math.min(200,rows.length-mdLogShown)} more</button>`:''}`;
}
function mdTransferCard(){
 const p=mdTransfer;
 const plan=p&&p.plan?`<table data-md-import-plan><thead><tr><th>Section</th><th>New</th><th>Changed</th><th>Same</th><th>Rejected</th></tr></thead><tbody>${p.plan.tables.filter(t=>t.added||t.changed||t.rejected).map(t=>`<tr><td>${esc(t.label)}</td><td class="mono">${t.added}</td><td class="mono">${t.changed}</td><td class="mono">${t.same}</td><td class="mono">${t.rejected}</td></tr>`).join('')}${p.plan.settings.filter(x=>x.changed).map(x=>`<tr><td>${esc(x.label)}</td><td class="mono">—</td><td class="mono">${x.changed?'yes':'—'}</td><td class="mono">—</td><td class="mono">—</td></tr>`).join('')}</tbody></table>
  <div class="mut">${p.plan.tables.filter(t=>!t.added&&!t.changed&&!t.rejected).length+p.plan.settings.filter(x=>!x.changed).length} sections without changes</div>
  ${p.plan.errors.length?`<div class="hint" data-md-import-errors>${p.plan.errors.slice(0,20).map(esc).join('<br>')}</div>`:''}
  <div class="row" style="gap:8px"><button class="pri" type="button" onclick="mdTransferApply()">Import ${esc(p.name)}</button><button type="button" onclick="mdTransfer=null;render()">Cancel</button></div>`:'';
 return `<div data-md-transfer>
  <div class="sub">Master Data only; orders untouched.</div>
  <div class="row" style="gap:8px"><button type="button" onclick="mdTransferExport()">Export Master Data</button><button type="button" onclick="document.getElementById('mdTransferFile').click()">Import Master Data</button>
  <input type="file" id="mdTransferFile" accept=".json,application/json" style="display:none" onchange="mdTransferPick(this)"></div>
  ${p&&p.error?`<div class="hint" data-md-import-error>${esc(p.error)}</div>`:''}${p&&p.done?`<div class="hint" data-md-import-done>Imported.</div>`:''}${plan}</div>`;
}
function mdTransferExport(){storageDownload('master-data-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(mdExportData(),null,1));}
function mdTransferPick(inp){
 const f=inp.files[0];inp.value='';if(!f)return;
 const r=new FileReader();
 r.onload=()=>{try{const file=JSON.parse(r.result);mdTransfer={name:f.name,file,plan:mdImportPlan(file)};}catch(e){mdTransfer={error:'File not readable: '+e.message};}render();};
 r.readAsText(f);
}
function mdTransferApply(){
 if(!mdTransfer||!mdTransfer.file)return;
 const out=mdImportApply(mdTransfer.file);
 mdTransfer=out.ok?{done:true}:{error:out.error};render();
}

/* --- 5. Импорт -------------------------------------------------------- */

/* Каталог стекла и точки поставки — подвиды Materials → Glass; файл идёт в
   парсер открытого подвида (аудит 05.10.2026: после переезда в Materials
   проверка mdTab==='glass' не срабатывала, GLASS_PRODUCTS.csv не грузился). */
function mdImportCard(){
 const isGlass=mdMatView==='glassProduct',kind=isGlass?'glass':'sheets';
 const which=isGlass?'GLASS_PRODUCTS.csv':'GLASS_SHEETS.csv';
 return `<div class="card">
  <div class="section-title"><h3>Load ${which}</h3><span class="pill info">merged by code</span></div>
  <div class="sub">${isGlass
   ?'Same code — updated; new — added.'
   :'Unknown codes are rejected.'}</div>
  <div class="row"><button onclick="document.getElementById('mdCsv').click()">Choose file</button>
   <input type="file" id="mdCsv" accept=".csv,.txt" style="display:none" onchange="mdImportCsv(this,'${kind}')"></div>
  ${mdImportReport&&mdImportReport.which===kind?sfReportHTML(mdImportReport.rep):''}</div>`;
}
function mdImportCsv(inp,which){
 const f=inp.files[0];inp.value='';
 if(!f)return;
 if(f.size>4*1024*1024){alert('File not readable: CSV exceeds 4 MB.');return;}
 const r=new FileReader();
 r.onload=()=>{
  try{
   mdImportReport={which,rep:which==='glass'?importGlassProductsCsv(r.result):importGlassSheetsCsv(r.result)};
   touch();render();
  }catch(e){alert('File not readable: '+e.message);}
 };
 r.readAsText(f);
}

/* --- Справочники, которые ведёт владелец -------------------------------
   Требование владельца 10 сентября 2026: «сделай мне мастер-дату максимально
   от тебя не зависящую, чтобы я мог ней управлять, добавлять, изменять без
   тебя». До этого экрана завести позицию было нельзя вовсе: у надбавок
   правилась одна цена, а имя, код и поставщик жили в коде.

   Один экран на все таблицы: шесть простых справочников устроены внутри
   одинаково (normalizeSimpleMaterial), седьмая — палитра спандрела со своими
   полями. Отдельный экран на каждую означал бы семь мест, где чинить одну и ту
   же ошибку.

   `prefix` — начало идентификатора новой строки. Идентификатор выводится из
   кода производителя, а не из порядкового номера: по нему позицию узнают в
   сохранённых заказах, и он обязан быть читаемым. */
const MD_CATALOGUES=[
 {k:'heatTreatment',     label:'Heat treatment',   prefix:'HT',   what:'annealed · heat strengthened · tempered'},
 {k:'gasProduct',        label:'Gas',              prefix:'GAS',  what:'cavity fill'},
 {k:'sealantProduct',    label:'Sealants',         prefix:'SEAL', what:'primary and secondary seal'},
 {k:'iguPart',           label:'IGU parts',        prefix:'IGU',  what:'desiccant, connectors and other surround parts'},
 {k:'interlayerProduct', label:'Interlayers',      prefix:'ILR',  what:'lamination films, price per ply'},
 {k:'fritProduct',       label:'Frit',             prefix:'FRIT', what:'silkscreen, surcharge per ft²'},
 {k:'spandrelProduct',   label:'Spandrel',         prefix:'SPAN', what:'opaque panels, surcharge per ft²'},
 {k:'stockItem',         label:'Stock items',      prefix:'STK',  what:'doors, kits, consumables — sold as their own order line'},
 {k:'spandrelColour',    label:'Spandrel colours', prefix:'SPC',  what:'palette with manufacturer codes'},
 {k:'serviceRate',       label:'Works',            prefix:'SVC',  what:'shop work: station, price and application range'}
];
/* Свою единицу продажи держат плёнка и части обвязки (этап 3 плана Master
   Data): газ, герметики, осушитель продаются за ft², дюйм периметра, вес. */
const MD_CAT_SALE_UNIT=['interlayerProduct','gasProduct','sealantProduct','iguPart'];
function mdCatDef(){return MD_CATALOGUES.find(c=>c.k===mdCatKind)||MD_CATALOGUES[0];}
function mdCatRows(){return Array.isArray(DB[mdCatKind])?DB[mdCatKind]:[];}
function mdCatIsColour(){return mdCatKind==='spandrelColour';}
/* Прайс — не свободный список. Каждая строка отвечает работе, которую система
   умеет посчитать: у неё есть база (штука, дюйм, площадь) и место в счёте.
   Строка, заведённая руками, ни в один счёт не попадёт — начислять её некому.
   Поэтому здесь можно править цену, единицу, вид и выключать строку, но нельзя
   добавлять и удалять: это была бы кнопка, которая делает вид, что работает. */
function mdCatIsRate(){return mdCatKind==='serviceRate';}
/* Диапазон диаметра человеку: «from 2 1/16″», «up to 1″». */
function mdWorkRangeText(r){
 if(!r||!r.appliesBy)return '';
 const f=r.appliesFrom,t=r.appliesTo;
 if(f!=null&&t!=null)return f+'–'+t+'″';
 if(f!=null)return 'from '+f+'″';
 if(t!=null)return 'up to '+t+'″';
 return '';
}
/* Таблица цен строкой списка: «≤7: 5.00 · 8–11: 8.00». */
function mdWorkTiersText(r){
 const tiers=r&&r.tiers||[];
 if(r&&r.rule){const t=tiers[0],v=t&&t.price!=null?t.price:null;
  return (v==null?'—':r.rule.kind==='percent'?'+'+v+'%':'min '+v+' ft²')+' · '+serviceRuleText(r.rule);}
 if(!tiers.length)return '—';
 return tiers.map(t=>(tiers.length===1&&t.from==null&&t.to==null?'':serviceRateTierShort(t)+': ')+(t.price==null?'—':Number(t.price).toFixed(2))).join(' · ');
}
/* Предупреждения карточки работы: таблица цен и нахлёст диапазона диаметра
   с другой работой той же семьи. Только предупреждают. */
function mdWorkWarnings(r){
 if(r&&r.rule)return (r.tiers||[]).length===1&&r.tiers[0].price!=null?[]:['Surcharge needs one value'];
 const out=serviceRateTierWarnings(r);
 if(r&&r.appliesBy&&r.active!==false){
  const lo=r.appliesFrom==null?-Infinity:r.appliesFrom,hi=r.appliesTo==null?Infinity:r.appliesTo;
  if(lo>hi)out.push('Diameter: from is above to');
  (DB.serviceRate||[]).forEach(x=>{if(x&&x.id!==r.id&&x.active!==false&&x.family===r.family&&x.appliesBy===r.appliesBy&&
   (x.appliesFrom==null?-Infinity:x.appliesFrom)<=hi&&(x.appliesTo==null?Infinity:x.appliesTo)>=lo)out.push('Diameter overlaps "'+x.name+'": no rate there');});
 }
 return out;
}
function mdSetCatKind(k){if(!MD_CATALOGUES.some(c=>c.k===k))return;mdCatKind=k;mdCatEdit=null;mdCatDraft=null;render();}

function viewMdCatalogues(){
 if(!MD_CATALOGUES.some(c=>c.k===mdCatKind))mdCatKind=MD_CATALOGUES[0].k;
 if(mdCatEdit!==null)return mdCatForm();
 const def=mdCatDef(),rows=mdCatRows(),colour=mdCatIsColour(),rate=mdCatIsRate();
 const cols=rate?6:colour?5:6;
 return `<div class="md-toolbar"><span class="mut">${esc(def.what.charAt(0).toUpperCase()+def.what.slice(1))} · used rows: switch off, don't delete.</span><span class="sp"></span><button class="pri" onclick="mdCatNew()">+ New</button></div>
  <div class="customer-table-wrap"><table><thead><tr><th>Name</th>${rate?'<th>Station</th><th>Unit</th><th>Price by thickness, mm</th>':`<th>Code</th>${colour?'<th>Family</th><th>Spandrel</th>':'<th>Supplier</th><th>Price, CAD</th>'}`}<th>Status</th><th></th></tr></thead>
  <tbody>${rows.map(mdCatRowHTML).join('')||`<tr><td colspan="${cols}" class="empty">empty</td></tr>`}</tbody></table></div>
  ${rate?'<div class="sub">Price by glass thickness.</div>':''}`;
}
function mdCatRowHTML(x){
 const colour=mdCatIsColour();
 if(mdCatIsRate()){const warn=mdWorkWarnings(x);return `<tr data-md-work="${esc(x.id)}" data-md-row="serviceRate:${esc(x.id)}">
  <td><b>${raw(x.name)}</b><div class="mut mono">${raw(x.id)}</div>${x.note?`<div class="mut">${raw(x.note)}</div>`:''}</td>
  <td class="mono">${x.station?esc(x.station):'<span class="mut">—</span>'}${x.appliesBy?`<div class="mut">Ø ${esc(mdWorkRangeText(x))}</div>`:''}</td>
  <td class="mono">${esc(x.unit)}</td>
  <td class="mono">${esc(mdWorkTiersText(x))}${warn.length?` <span class="pill warn" title="${esc(warn.join('; '))}">${warn.length} warning${warn.length===1?'':'s'}</span>`:''}</td>
  <td><span class="pill ${x.active===false?'warn':'ok'}">${x.active===false?'no rate':'active'}</span></td>
  <td style="white-space:nowrap"><button class="sm" onclick="mdCatEditRow('${esc(x.id)}')">Edit</button></td></tr>`;}
 const scope=colour?(x.productId?((DB.spandrelProduct||[]).find(p=>p.id===x.productId)||{}).name||x.productId:'any'):'';
 return `<tr data-md-row="${esc(mdCatKind)}:${esc(x.id)}">
  <td><b>${raw(x.name)}</b><div class="mut mono">${raw(x.id)}${x.subcategory?' · '+esc(x.subcategory):''}</div>${x.sellsAsOwnLine?'<span class="pill info">own order line</span>':''}${MD_CAT_WORK.includes(mdCatKind)?`<div class="mut">Work: ${x.workId?esc((salesServiceRateRow(x.workId)||{}).name||x.workId):'—'}</div>`:''}</td>
  <td class="mono">${x.code?raw(x.code):'<span class="mut">—</span>'}</td>
  ${colour?`<td>${x.family?raw(x.family):'<span class="mut">—</span>'}</td><td class="mut">${raw(scope)}</td>`
          :`<td>${x.supplier?raw(x.supplier):'<span class="mut">—</span>'}</td>
            <td class="mono">${x.salePrice==null?'<span class="mut">—</span>':esc(Number(x.salePrice).toFixed(2))}</td>`}
  <td><span class="pill ${x.active===false?'warn':'ok'}">${x.active===false?'inactive':'active'}</span></td>
  <td style="white-space:nowrap"><button class="sm" onclick="mdCatEditRow('${esc(x.id)}')">Edit</button><button class="sm dl" onclick="mdCatDelete('${esc(x.id)}')">×</button></td></tr>`;
}
function mdCatNew(){
 mdCatEdit='new';
 mdCatDraft=mdCatIsColour()
  ?{id:'',name:'',code:'',family:'Gray',productId:'',active:true}
  :mdCatIsRate()
  ?{id:'',name:'',unit:'pc',station:'',tiers:[{id:'t1',from:null,to:null,price:null}],
    family:'',appliesBy:'',appliesFrom:null,appliesTo:null,note:'',active:true}
  :{id:'',name:'',code:'',supplier:'',salePrice:null,subcategory:'consumable',sellsAsOwnLine:mdCatKind==='stockItem',active:true};
 render();
}
function mdCatEditRow(id){
 const x=mdCatRows().find(r=>r.id===id);if(!x)return;
 mdCatEdit=id;mdCatDraft=JSON.parse(JSON.stringify(x));mdSeen.cat=JSON.stringify(x);render();
}
function mdCatForm(){
 const r=mdCatDraft,isNew=mdCatEdit==='new',colour=mdCatIsColour(),def=mdCatDef();
 /* Подсказка собирается из уже заведённых значений плюс заводской список —
    но вписать можно любое: закрытых списков в этом справочнике больше нет. */
 const familyHints=Array.from(new Set(SPANDREL_COLOUR_FAMILIES.concat((DB.spandrelColour||[]).map(c=>c.family).filter(Boolean))));
 const subcatHints=Array.from(new Set(SALES_STOCK_SUBCATEGORIES.concat((DB.stockItem||[]).map(x=>x.subcategory).filter(Boolean))));
 if(mdCatIsRate()){
  const stations=(DB.station||[]).slice().sort((a,b)=>(+a.seq||0)-(+b.seq||0));
  const v=x=>x==null?'':esc(x),warn=mdWorkWarnings(mdWorkDraftRead(false)||r);
  /* Карточка работы в виде плана (md-card): общее, когда применяется, цены. */
  const general=`<div class="grid">
    <div><label>Name *</label><input id="md_catName" value="${esc(r.name)}"></div>
    <div><label>Unit</label><select id="md_catUnit">${(r.rule?[r.unit]:['pc','in','ft²']).map(u=>`<option value="${esc(u)}" ${u===r.unit?'selected':''}>${esc(u)}</option>`).join('')}</select><div class="hint">Label of the price</div></div>
    ${r.rule?'':`<div><label>Station</label><select id="md_catStation"><option value="">— no station —</option>${stations.map(st=>`<option value="${esc(st.code)}" ${st.code===(r.station||'')?'selected':''}>${esc(st.code)} · ${esc(st.nameEn||st.name)}</option>`).join('')}</select><div class="hint">Empty: price only</div></div>`}
   </div>
   <div class="grid">
    <div><label>Note</label><input id="md_catNote" value="${esc(r.note||'')}"></div>
    <div><label>Status</label><select id="md_catActive"><option value="1" ${r.active!==false?'selected':''}>active</option><option value="0" ${r.active===false?'selected':''}>no rate</option></select></div>
   </div>`;
  const applies=`<div class="grid">
    ${r.rule?'':`<div><label>Applies by</label><select id="md_catAppliesBy" onchange="mdWorkDraftRead(true);render()"><option value="" ${r.appliesBy?'':'selected'}>always</option><option value="diameter" ${r.appliesBy==='diameter'?'selected':''}>hole diameter, inches</option></select></div>
    ${r.appliesBy?`<div><label>Family</label><input id="md_catFamily" value="${esc(r.family||'')}"><div class="hint">Shared by all hole rows</div></div>
    <div><label>Diameter from</label><input id="md_catFrom" type="number" step="any" min="0" value="${v(r.appliesFrom)}" placeholder="no limit"></div>
    <div><label>Diameter to</label><input id="md_catTo" type="number" step="any" min="0" value="${v(r.appliesTo)}" placeholder="no limit"></div>`:''}`}
   </div>
   <div class="grid" data-md-rule>
    <div><label>Surcharge</label><select id="md_ruleKind" onchange="mdWorkDraftRead(true);render()">${[['','no — a work'],['percent','percent of unit price'],['minArea','minimum billed area']].map(([k,t])=>`<option value="${k}" ${(r.rule?r.rule.kind:'')===k?'selected':''}>${t}</option>`).join('')}</select><div class="hint">Changes the unit price</div></div>
    ${r.rule?`<div><label>${r.rule.kind==='percent'?'Percent':'Minimum, ft²'}</label><input id="md_tierPrice0" type="number" step="any" min="0" value="${v(r.tiers&&r.tiers[0]?r.tiers[0].price:null)}" placeholder="no value"></div>
    <div><label>Unit types</label><div>${SERVICE_RULE_UNIT_TYPES.map(t=>`<label class="chk"><input type="checkbox" id="md_ruleT_${t}" ${r.rule.unitTypes.includes(t)?'checked':''}> ${t}</label>`).join(' ')}</div><div class="hint">None: any unit</div></div>
    <div><label>Unit area over, ft²</label><input id="md_ruleOver" type="number" step="any" min="0" value="${v(r.rule.areaOver)}" placeholder="no limit"></div>
    <div><label>Unit area under, ft²</label><input id="md_ruleUnder" type="number" step="any" min="0" value="${v(r.rule.areaUnder)}" placeholder="no limit"></div>
    ${r.rule.kind==='percent'?`<div><label>Order</label><input id="md_rulePriority" type="number" step="1" value="${v(r.rule.priority)}"><div class="hint">Smaller first</div></div>
    <div><label class="chk"><input type="checkbox" id="md_ruleOnTop" ${r.rule.onTop?'checked':''}> On top of earlier surcharges</label></div>`:''}`:''}
   </div>`;
  const prices=`${r.rule?'<p class="mut">Value: Applies tab.</p>':`<label>Price by glass thickness</label>
   <table class="md-work-tiers" data-md-tiers><thead><tr><th>From, mm</th><th>To, mm</th><th>Price, CAD</th><th></th></tr></thead><tbody>
    ${(r.tiers||[]).map((t,i)=>`<tr data-md-tier="${esc(t.id)}"><td><input id="md_tierFrom${i}" type="number" step="any" min="0" value="${v(t.from)}" placeholder="no limit" style="width:90px"></td><td><input id="md_tierTo${i}" type="number" step="any" min="0" value="${v(t.to)}" placeholder="no limit" style="width:90px"></td><td><input id="md_tierPrice${i}" type="number" step="0.01" min="0" value="${v(t.price)}" placeholder="no price" style="width:90px"></td><td><button class="sm dl" title="Remove row" onclick="mdWorkTierRemove(${i})">×</button></td></tr>`).join('')}
   </tbody></table>
   <div class="row"><button class="sm" data-md-tier-add onclick="mdWorkTierAdd()">+ Row</button><span class="hint">From and to included. Empty: no limit.</span></div>
   <div class="grid">
    <div><label>Round quantity up to</label><input id="md_catRoundTo" type="number" step="any" min="0" value="${v(r.roundTo)}" placeholder="no rounding"><div class="hint">In the work's unit</div></div>
    <div><label>Min charge, CAD</label><input id="md_catMinCharge" type="number" step="0.01" min="0" value="${v(r.minCharge)}" placeholder="no minimum"><div class="hint">Per unit</div></div>
   </div>`}
   ${isNew||r.rule?'':mdPriceListsHTML('service:'+r.id)}`;
  return mdCardHTML({form:'work',crumb:['Works',r.rule?'Surcharges':'Works'],title:isNew?'New work':raw(r.name||r.id),
   status:isNew?null:r.active===false?['no rate','warn']:['active','ok'],code:isNew?'':r.id,
   tabs:[{k:'general',label:'General',html:general},{k:'applies',label:'Applies',html:applies},{k:'prices',label:'Prices',html:prices,missing:warn.length>0}],
   foot:`${warn.length?`<div class="sales-pricing-warning" data-md-work-warn><b>Check</b><span>${warn.map(esc).join('<br>')}</span></div>`:''}<div class="err" id="e_mdCat"></div>
   <div class="row"><button class="pri" onclick="mdCatSave()">Save</button><button onclick="mdCatEdit=null;mdCatDraft=null;render()">Cancel</button></div>`})
   .replace('data-md-card="work"','data-md-card="work" data-md-work-form');
 }
 const f={
  name:mdField('Name *',`<input id="md_catName" value="${esc(r.name)}">`),
  code:mdField('Code',`<input id="md_catCode" value="${esc(r.code)}">`,'Manufacturer\'s code.'),
  status:mdField('Status',`<select id="md_catActive"><option value="1" ${r.active!==false?'selected':''}>active</option><option value="0" ${r.active===false?'selected':''}>inactive</option></select>`)};
 const foot=`<div class="err" id="e_mdCat"></div><div class="row"><button class="pri" onclick="mdCatSave()">Save</button><button onclick="mdCatEdit=null;mdCatDraft=null;render()">Cancel</button></div>`;
 const card=tabs=>mdCardHTML({form:'cat-'+mdCatKind,crumb:[MD_WORK_CATALOGUES.includes(mdCatKind)?'Works':'Materials',def.label],title:isNew?'New':raw(r.name||r.id),
  status:isNew?null:r.active===false?['inactive','warn']:['active','ok'],code:isNew?'':(r.code||r.id),tabs,foot});
 if(colour)return card([{k:'general',label:'General',html:`<div class="grid">${f.name}${f.code}
   ${mdField('Family',`<input id="md_catFamily" list="md_catFamilyList" value="${esc(r.family||'')}"><datalist id="md_catFamilyList">${familyHints.map(x=>`<option value="${esc(x)}">`).join('')}</datalist>`,'Empty — no family.')}
   ${mdField('Spandrel',`<select id="md_catProduct"><option value="" ${r.productId?'':'selected'}>— any spandrel —</option>${(DB.spandrelProduct||[]).map(p=>`<option value="${esc(p.id)}" ${p.id===r.productId?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`,'Empty — any spandrel.')}
   ${f.status}</div>`}]);
 f.supplier=mdField('Supplier',`<input id="md_catSupplier" value="${esc(r.supplier||'')}">`);
 f.price=mdField('Price, CAD',`<input id="md_catPrice" type="number" step="0.01" min="0" value="${r.salePrice==null?'':r.salePrice}">`,'Empty — Rate required.');
 f.unit=MD_CAT_SALE_UNIT.includes(mdCatKind)?mdField('Sales unit',`<select id="md_salesunit"><option value="">sq ft</option>${mdUnitOptions(r.salesUnit)}</select>`):'';
 f.ownLine=`<div style="grid-column:1/-1"><label class="chk"><input type="checkbox" id="md_catOwnLine" ${r.sellsAsOwnLine?'checked':''}> Sells as its own order line</label><div class="hint">Sold as-is: quantity and price.</div></div>`;
 f.work=MD_CAT_WORK.includes(mdCatKind)?mdField('Work',`<select id="md_catWork"><option value="">— no work —</option>${(DB.serviceRate||[]).filter(w=>w&&!w.rule).map(w=>`<option value="${esc(w.id)}" ${w.id===r.workId?'selected':''}>${esc(w.name)}${w.station?' · '+esc(w.station):''}</option>`).join('')}</select>`,'Station in the route'):'';
 /* Плёнка — большая карточка: вкладки как у рамки. Плотность — норма
    film:<id> (раньше вкладка Weight norms). */
 const filmRate=(DB.materialWeightRates||[]).find(x=>x.key==='film:'+r.id),filmDensity=filmRate?filmRate.rate:null;
 if(mdCatKind==='interlayerProduct')return card([
  {k:'general',label:'General',html:`<div class="grid">${f.name}${f.code}${mdStationViaHTML(mdCatKind)}${f.status}${f.ownLine}</div>`},
  {k:'units',label:'Units',html:`<div class="grid">${f.unit}</div>`},
  {k:'measure',label:'Measurements',html:`<div class="grid">${mdFilmFields(r)}${mdField('Density, kg/m³',`<input id="md_filmDensity" type="number" step="any" min="0" value="${filmDensity==null?'':filmDensity}" placeholder="unknown">`,'Film weight.')}</div><h4>Size limits</h4><div class="grid">${mdSaleRulesFields(r,['minAreaFt2','minWidthIn','minHeightIn','maxWidthIn','maxHeightIn'])}</div>`,missing:!(r.plyMm>0)||filmDensity==null},
  {k:'purchase',label:'Purchase',html:`<div class="grid">${f.supplier}</div>${mdFilmSupplyHTML(r)}`,missing:!isNew&&!(r.supply||[]).length},
  {k:'prices',label:'Prices',html:`<div class="grid">${f.price}${mdSaleRulesFields(r,['minCharge'])}</div>${isNew?'':mdPriceListsHTML('item:interlayerProduct:'+r.id)}`,missing:r.salePrice==null}]);
 f.density=mdCatKind==='gasProduct'?mdField('Density, kg/m³',`<input id="md_catDensity" type="number" step="any" min="0" value="${r.densityKgM3==null?'':r.densityKgM3}" placeholder="unknown">`,'Gas weight = density × cavity volume.'):'';
 /* Части обвязки продаются за свою единицу — те же вкладки, что у рамки. */
 if(f.unit)return card([
  {k:'general',label:'General',html:`<div class="grid">${f.name}${f.code}${f.supplier}${mdStationViaHTML(mdCatKind)}${f.status}${f.ownLine}</div>`},
  {k:'units',label:'Units',html:`<div class="grid">${f.unit}</div>`},
  {k:'measure',label:'Measurements',html:`<div class="grid">${f.density}${mdSaleRulesFields(r,['minAreaFt2','minWidthIn','minHeightIn','maxWidthIn','maxHeightIn'])}</div>`,missing:mdCatKind==='gasProduct'&&r.densityKgM3==null},
  {k:'prices',label:'Prices',html:`<div class="grid">${f.price}${mdSaleRulesFields(r,['minCharge'])}</div>${isNew?'':mdPriceListsHTML('item:'+mdCatKind+':'+r.id)}`,missing:r.salePrice==null}]);
 return card([{k:'general',label:'General',html:`<div class="grid">${f.name}${f.code}${f.supplier}${f.price}
   ${mdStationViaHTML(mdCatKind)}${f.work}
   ${mdCatKind==='stockItem'?mdField('Subcategory',`<input id="md_catSubcategory" list="md_catSubcategoryList" value="${esc(r.subcategory||'')}"><datalist id="md_catSubcategoryList">${subcatHints.map(x=>`<option value="${esc(x)}">`).join('')}</datalist>`,'Group in the order picker.'):''}
   ${f.ownLine}${f.status}</div>`}]);
}
/* Плёнка (этап 5): слой, разрешённые толщины и строки поставки. Строки
   поставки добавляются и убираются без перерисовки — введённое в форме не
   пропадает; Save читает их с экрана. */
function mdFilmSupplyRow(x){x=x||{};const v=k=>x[k]==null?'':esc(x[k]);
 return `<tr data-md-film-supply><td><input data-k="supplier" value="${v('supplier')}"></td><td><input data-k="widthIn" type="number" min="0" step="any" value="${v('widthIn')}"></td><td><input data-k="thicknessMm" type="number" min="0" step="any" value="${v('thicknessMm')}"></td><td${accessCost()?'':' hidden'}><input data-k="price" type="number" min="0" step="any" value="${v('price')}"></td><td${accessCost()?'':' hidden'}><input data-k="per" value="${v('per')}" placeholder="roll"></td><td><button type="button" class="sm dl" onclick="this.closest('tr').remove()">×</button></td></tr>`;}
function mdFilmFields(r){
 return `<div><label>Ply, mm</label><input id="md_filmPly" type="number" min="0" step="any" value="${r.plyMm==null?'':r.plyMm}"><div class="hint">One layer; price is per layer</div></div>
  <div><label>Thicknesses, mm</label><input id="md_filmThick" value="${esc((r.thicknessesMm||[]).join(', '))}"><div class="hint">Offered in the order</div></div>`;
}
function mdFilmSupplyHTML(r){
 return `<div data-md-film-supplies><label>Supply</label><div class="sales-table-wrap"><table class="ncr-table"><thead><tr><th>Supplier</th><th>Roll width, in</th><th>Thickness, mm</th>${accessCost()?'<th>Price, CAD</th><th>Per</th>':''}<th></th></tr></thead><tbody>${(r.supply||[]).map(mdFilmSupplyRow).join('')}</tbody></table></div>
   <button type="button" onclick="this.previousElementSibling.querySelector('tbody').insertAdjacentHTML('beforeend',mdFilmSupplyRow())">+ Supply row</button></div>`;
}
function mdFilmRead(){
 const ply=mdVal('md_filmPly');if(!(+ply>0))return {error:'Ply must be a positive number'};
 const list=mdVal('md_filmThick').split(/[,;\s]+/).filter(Boolean);
 if(list.some(v=>!(+v>0)))return {error:'Thicknesses must be positive numbers'};
 const supply=[...document.querySelectorAll('[data-md-film-supply]')].map(tr=>{const o={};tr.querySelectorAll('[data-k]').forEach(i=>{o[i.dataset.k]=i.value;});return o;});
 return {plyMm:+ply,thicknessesMm:list.map(Number),supply};
}
/* Форма работы → запись. Поля читаются с экрана: строка таблицы
   добавляется и убирается перерисовкой, и введённое не должно пропасть.
   keep — записать прочитанное в черновик. Нахлёст и пропуск строк таблицы не
   запрещаются: карточка о них предупреждает. */
function mdWorkDraftRead(keep){
 const r=mdCatDraft;if(!r||!document.getElementById('md_catName'))return null;
 const num=id=>{const el=document.getElementById(id);if(!el)return undefined;const t=el.value.trim();return t===''?null:+t;};
 const bad=v=>v!=null&&v!==undefined&&(!isFinite(v)||v<0);
 const tiers=(r.tiers||[]).map((t,i)=>{const f=num('md_tierFrom'+i),to=num('md_tierTo'+i),p=num('md_tierPrice'+i);
  return {id:t.id,from:f===undefined?t.from:f,to:to===undefined?t.to:to,price:p===undefined?t.price:p};});
 const appliesEl=document.getElementById('md_catAppliesBy'),appliesBy=appliesEl?appliesEl.value:r.appliesBy;
 const from=num('md_catFrom'),to=num('md_catTo');
 /* Надбавка: вид правила с экрана; число — одна строка таблицы без границ. */
 const kindEl=document.getElementById('md_ruleKind'),kind=kindEl?kindEl.value:(r.rule?r.rule.kind:'');
 let rule=null,unit=mdVal('md_catUnit')||r.unit,useTiers=tiers;
 if(kind){
  const was=r.rule&&r.rule.kind===kind?r.rule:{unitTypes:[],areaOver:null,areaUnder:null,onTop:false,priority:0};
  const chk=id=>{const el=document.getElementById(id);return el?el.checked:undefined;};
  const types=SERVICE_RULE_UNIT_TYPES.filter(t=>{const c=chk('md_ruleT_'+t);return c===undefined?was.unitTypes.includes(t):c;});
  const over=num('md_ruleOver'),under=num('md_ruleUnder'),prio=num('md_rulePriority'),onTop=chk('md_ruleOnTop');
  rule={kind,unitTypes:types,areaOver:over===undefined?was.areaOver:over,areaUnder:under===undefined?was.areaUnder:under,
   onTop:onTop===undefined?was.onTop:onTop,priority:prio===undefined||prio===null?was.priority:prio};
  const first=tiers[0]||{},p0=num('md_tierPrice0');
  useTiers=[{id:'flat',from:null,to:null,price:r.rule?(p0===undefined?first.price:p0):null}];
  unit=kind==='percent'?'%':'ft²';
 }else if(r.rule)useTiers=[{id:'flat',from:null,to:null,price:null}];
 const roundTo=num('md_catRoundTo'),minCharge=num('md_catMinCharge');
 const next=Object.assign({},r,{name:mdVal('md_catName'),unit:unit,station:mdVal('md_catStation'),tiers:useTiers,rule,
  roundTo:rule?null:roundTo===undefined?r.roundTo:roundTo,minCharge:rule?null:minCharge===undefined?r.minCharge:minCharge,
  appliesBy:appliesBy,family:appliesBy?(document.getElementById('md_catFamily')?mdVal('md_catFamily'):r.family||'hole'):'',
  appliesFrom:appliesBy?(from===undefined?r.appliesFrom:from):null,appliesTo:appliesBy?(to===undefined?r.appliesTo:to):null,
  note:mdVal('md_catNote'),active:mdVal('md_catActive')!=='0'});
 if(useTiers.some(t=>bad(t.from)||bad(t.to)||bad(t.price))||[next.appliesFrom,next.appliesTo,next.roundTo,next.minCharge].some(bad)||rule&&[rule.areaOver,rule.areaUnder].some(bad))next.bad='Numbers must be 0 or more, or empty';
 if(keep){mdCatDraft=Object.assign({},next);delete mdCatDraft.bad;}
 return next;
}
function mdWorkTierAdd(){
 mdWorkDraftRead(true);const r=mdCatDraft;if(!r)return;
 let n=(r.tiers||[]).length+1;while((r.tiers||[]).some(t=>t.id==='t'+n))n++;
 r.tiers=(r.tiers||[]).concat([{id:'t'+n,from:null,to:null,price:null}]);render();
}
function mdWorkTierRemove(i){mdWorkDraftRead(true);const r=mdCatDraft;if(!r)return;r.tiers=(r.tiers||[]).filter((t,k)=>k!==i);render();}
/* Идентификатор выводится из кода, а при его отсутствии из названия. Совпадения
   разводятся суффиксом, а не молча перезаписывают чужую строку. */
function mdCatIdFrom(prefix,code,name,taken){
 const base=String(code||name||'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'');
 let id=prefix+'-'+(base||'NEW'),n=2;
 while(taken.some(x=>x.id===id)){id=prefix+'-'+(base||'NEW')+'-'+n;n++;}
 return id;
}
function mdCatSave(){
 const e=document.getElementById('e_mdCat');if(e)e.style.display='none';
 if(mdCatEdit!=='new'){const stale=mdStale('cat',mdCatRows().find(r=>r.id===mdCatEdit));if(stale)return fail(e,stale);}
 const colour=mdCatIsColour(),def=mdCatDef(),rows=mdCatRows();
 const name=mdVal('md_catName');
 if(!name)return fail(e,'Name is required');
 if(mdCatIsRate()){
  const next=mdWorkDraftRead(false);
  if(next.bad)return fail(e,next.bad);
  if(next.appliesBy&&!next.family)return fail(e,'A work with a diameter range needs a family');
  const isNewRow=mdCatEdit==='new';
  next.id=isNewRow?mdCatIdFrom(def.prefix,'',name,rows):mdCatDraft.id;
  const row=normalizeServiceRate(next),at=rows.findIndex(x=>x.id===row.id);
  if(!Array.isArray(DB.serviceRate))DB.serviceRate=[];
  if(at<0)DB.serviceRate.push(row);else DB.serviceRate[at]=row;
  mdCatEdit=null;mdCatDraft=null;normalizeMasterData();if(typeof stationRouteReset==='function')stationRouteReset();touch();render();
  return;
 }
 const code=mdVal('md_catCode');
 const id=mdCatEdit==='new'?mdCatIdFrom(def.prefix,code,name,rows):mdCatDraft.id;
 const active=mdVal('md_catActive')!=='0';
 let next,filmD=null;
 if(colour){
  next={id:id,name:name,code:code,family:mdVal('md_catFamily'),productId:mdVal('md_catProduct'),active:active};
 }else{
  const typed=mdVal('md_catPrice'),price=typed===''?null:+typed;
  if(price!=null&&(!isFinite(price)||price<0))return fail(e,'Price must be a non-negative number or empty');
  /* Правка сохраняет поля, которых нет на форме: наличие, срок поставки,
     толщина. Иначе редактирование имени стирало бы их молча. */
  const prev=mdCatEdit==='new'?{}:mdCatDraft;
  const ownLineEl=document.getElementById('md_catOwnLine'),subcatEl=document.getElementById('md_catSubcategory');
  const film=mdCatKind==='interlayerProduct'?mdFilmRead():null;
  if(film&&film.error)return fail(e,film.error);
  if(film)filmD=mdVal('md_filmDensity');
  if(film&&filmD!==''&&!(+filmD>=0))return fail(e,'Density must be a non-negative number or empty');
  const density=mdVal('md_catDensity');
  if(mdCatKind==='gasProduct'&&density!==''&&(!isFinite(+density)||+density<0))return fail(e,'Density must be a non-negative number or empty');
  next=Object.assign({},prev,MD_CAT_SALE_UNIT.includes(mdCatKind)?Object.assign(mdSaleRulesRead(),{salesUnit:mdVal('md_salesunit')}):{},mdCatKind==='gasProduct'?{densityKgM3:density===''?null:+density}:{},film||{},MD_CAT_WORK.includes(mdCatKind)?{workId:mdVal('md_catWork')}:{},{id:id,name:name,code:code,supplier:mdVal('md_catSupplier'),salePrice:price,
   sellsAsOwnLine:ownLineEl?ownLineEl.checked:!!prev.sellsAsOwnLine,
   subcategory:subcatEl?subcatEl.value:(prev.subcategory||''),active:active});
 }
 if(!Array.isArray(DB[mdCatKind]))DB[mdCatKind]=[];
 if(mdCatEdit==='new')DB[mdCatKind].push(next);
 else{
  const at=DB[mdCatKind].findIndex(x=>x.id===mdCatDraft.id);
  if(at<0)return fail(e,'Row not found');
  DB[mdCatKind][at]=next;
 }
 if(filmD!=null){const key='film:'+id,row=(DB.materialWeightRates||[]).find(x=>x.key===key),rate=filmD===''?null:+filmD;
  if(row)row.rate=rate;else if(rate!=null)DB.materialWeightRates.push({key,label:'Interlayer density · '+name,rate,unit:'kg/m³',note:''});}
 mdCatEdit=null;mdCatDraft=null;normalizeMasterData();touch();render();
}
/* Ссылку ищем грубо — по идентификатору в тексте сохранённого заказа. Точный
   разбор потребовал бы знать поле для каждой из семи таблиц, а цена ошибки
   несимметрична: лишнее предупреждение человек прочитает и решит сам, а
   пропущенное молча испортит старый заказ. */
function mdCatUsed(id){
 const needle='"'+id+'"';
 return (DB.salesOrder||[]).some(o=>{try{return JSON.stringify(o).indexOf(needle)>=0;}catch(err){return false;}});
}
function mdCatDelete(id){
 const used=mdCatUsed(id);
 if(!confirm(used?'This row is used in saved orders. Delete it anyway? It will become unknown there. Usually it\'s better to switch it off instead of deleting.':'Delete this row?'))return;
 if(!Array.isArray(DB[mdCatKind]))return;
 DB[mdCatKind]=DB[mdCatKind].filter(x=>x.id!==id);
 mdCatEdit=null;mdCatDraft=null;touch();render();
}
