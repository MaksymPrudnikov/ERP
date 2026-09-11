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

const MD_TABS=[
 {k:'glass',    label:'Каталог стекла'},
 {k:'supply',   label:'Точки поставки'},
 {k:'spacer',   label:'Spacers & rates'},
 {k:'weight',   label:'Weight norms'},
 {k:'hardware', label:'Hardware'},
 {k:'allowance',label:'Припуск на рез'},
 /* Не «Справочники»: словарь RU->EN переводит это слово как Master Data, и
    вкладка называлась бы так же, как весь экран. */
 {k:'catalogues',label:'Catalogues'},
 {k:'overview', label:'Обзор базы'}
];
/* Каталог длиннее любого экрана: показываем страницу и честно говорим, сколько
   осталось за краем. Молчаливая обрезка списка читается как «это всё». */
const MD_PAGE=60;

let mdTab='glass';
let mdSearch='',mdMfr='',mdThick='',mdCoating='',mdStatus='all';
let mdEdit=null,mdDraft=null;
let mdSheetEdit=null,mdSheetDraft=null;
let mdSpacerEdit=null,mdSpacerDraft=null;
let mdHwKindEdit=null,mdHwKindDraft=null,mdHwModelEdit=null,mdHwModelDraft=null,mdHwFilter='';
let mdWeightFilter='';
let mdCatKind='spandrelColour',mdCatEdit=null,mdCatDraft=null;
let mdImportReport=null;

/* --- Общее ------------------------------------------------------------ */

function viewMasterData(){
 if(!MD_TABS.some(t=>t.k===mdTab))mdTab='glass';
 const total=DB.glassProduct.length,stocked=DB.glassProduct.filter(p=>p.stocked).length;
 const inactive=DB.glassProduct.filter(p=>p.active===false).length;
 const sheets=DB.glassSheet.length,orphans=glassOrphanSheets().length;
 return `<div class="page-head"><div><h2>Справочники</h2><p>Каталог стекла и точки поставки. Продукт отвечает, ЧТО это за стекло, строка поставки — где и почём его берут: валюта принадлежит точке поставки, а не поставщику.</p></div><span class="pill info">Master Data · v1</span></div>
  <div class="kpi-grid">
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('layers')}</div></div><div class="kpi-num">${total}</div><div class="kpi-label">позиций каталога</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('inventory')}</div></div><div class="kpi-num">${stocked}</div><div class="kpi-label">держим на складе</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('purchase')}</div></div><div class="kpi-num">${sheets}</div><div class="kpi-label">строк поставки</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico(orphans||inactive?'alert':'check')}</div></div><div class="kpi-num">${orphans}</div><div class="kpi-label">поставок без продукта</div></div>
  </div>
  <div class="card">
   <div class="tabs">${MD_TABS.map(t=>`<button class="${mdTab===t.k?'on':''}" onclick="mdSetTab('${t.k}')">${t.label}</button>`).join('')}</div>
   ${({glass:viewMdGlass,supply:viewMdSupply,spacer:viewMdSpacer,weight:viewMdWeight,hardware:viewMdHardware,allowance:viewMdAllowance,catalogues:viewMdCatalogues,overview:viewMdOverview})[mdTab]()}
  </div>
  ${mdTab==='overview'||mdTab==='hardware'||mdTab==='spacer'||mdTab==='weight'||mdTab==='allowance'||mdTab==='catalogues'?'':mdImportCard()}`;
}
function mdSetTab(k){mdTab=k;mdEdit=null;mdSheetEdit=null;mdSpacerEdit=null;mdHwKindEdit=null;mdHwModelEdit=null;mdCatEdit=null;mdCatDraft=null;mdImportReport=null;render();}
function mdVocabOptions(kind,value,blank){
 const rows=Object.keys(GLASS_VOCAB[kind]||{});
 return (blank?`<option value="">${esc(blank)}</option>`:'')+rows.map(v=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(glassLabel(kind,v))}</option>`).join('');
}
function mdUnitOptions(value){
 return MD_UNITS.map(u=>`<option value="${esc(u.code)}" ${u.code===value?'selected':''}>${esc(mdUnitName(u.code))} · ${esc(mdUnitCalcName(u.calc))}</option>`).join('');
}
function mdUnitCalcName(calc){
 const row={area:['площадь','area'],linear:['длина','linear'],flat:['штуки','flat']}[calc];
 return row?(LANG==='en'?row[1]:row[0]):calc;
}
function mdVal(id){const el=document.getElementById(id);return el?el.value.trim():'';}
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
 const rows=mdVisibleProducts(),shown=rows.slice(0,MD_PAGE);
 const mfrs=[...new Set(DB.glassProduct.map(p=>p.manufacturer).filter(Boolean))].sort();
 const thicks=[...new Set(DB.glassProduct.map(p=>p.thicknessMm).filter(x=>x!=null))].sort((a,b)=>a-b);
 return `<div class="customer-toolbar">
   <div class="customer-search"><input id="mdSearch" value="${esc(mdSearch)}" placeholder="Поиск по коду, названию, примечанию…" oninput="mdSearchChange(this)"></div>
   <div class="customer-actions"><button class="pri" onclick="mdGlassNew()">+ Новая позиция</button></div>
  </div>
  <div class="customer-filterbar">
   <select onchange="mdMfr=this.value;render()"><option value="">Все производители</option>${mfrs.map(m=>`<option data-raw value="${esc(m)}" ${mdMfr===m?'selected':''}>${esc(m)}</option>`).join('')}</select>
   <select onchange="mdThick=this.value;render()"><option value="">Любая толщина</option>${thicks.map(t=>`<option data-raw value="${t}" ${mdThick===String(t)?'selected':''}>${t} mm</option>`).join('')}</select>
   <select onchange="mdCoating=this.value;render()"><option value="">Любое покрытие</option>${mdVocabOptions('coatingFamily',mdCoating,'')}</select>
   ${[['all','Все'],['stocked','На складе'],['preorder','По предзаказу'],['inactive','Снятые']].map(x=>`<button class="sm ${mdStatus===x[0]?'customer-filter-on':''}" onclick="mdStatus='${x[0]}';render()">${x[1]}</button>`).join('')}
   <span class="mut">Показано: ${shown.length} / ${rows.length}</span>
  </div>
  <div class="customer-table-wrap"><table><thead><tr><th>Код</th><th>Название</th><th>Толщина</th><th>Подложка</th><th>Покрытие</th><th>Закалка</th><th>Price AN</th><th>Price FT</th><th>Поверхности</th><th>Склад</th><th>Поставка</th><th></th></tr></thead>
  <tbody>${shown.map(mdGlassRow).join('')||'<tr><td colspan="10" class="empty">позиции не найдены</td></tr>'}</tbody></table></div>
  ${rows.length>shown.length?`<div class="hint">Сузь поиск или фильтр, чтобы увидеть остальные позиции: <b data-raw>${rows.length-shown.length}</b></div>`:''}`;
}
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
 return `<tr class="${p.active===false?'md-row-off':''}"><td class="mono"><b>${raw(p.code)}</b>${p.active===false?' <span class="pill warn">снята</span>':''}</td>
  <td><b>${raw(p.name)}</b><div class="mut">${raw(p.manufacturer)}</div></td>
  <td class="mono">${p.thicknessMm==null?'—':p.thicknessMm+' mm'}</td>
  <td>${esc(glassLabel('substrate',p.substrate))}</td>
  <td>${esc(glassLabel('coatingFamily',p.coatingFamily))}${p.deposition?`<div class="mut">${esc(glassLabel('deposition',p.deposition))}</div>`:''}</td>
  <td><span class="pill ${temper}">${esc(glassLabel('temperMode',p.temperMode))}</span></td>
  <td>${mdGlassPriceInput(p,"salePriceAnnealed")}</td>
  <td>${mdGlassPriceInput(p,"salePriceTempered")}</td>
  <td>${p.allowedSurfaces.length?p.allowedSurfaces.map(n=>`<span class="pill" data-raw>#${n}</span>`).join(' '):`<span class="mut">${esc(glassLabel('exposureRule',p.exposureRule))}</span>`}</td>
  <td>${p.stocked?`<span class="pill ok">${esc(glassLabel('stock','stocked'))}</span>`:`<span class="pill info">${esc(glassLabel('stock','preorder'))}</span>`}</td>
  <td>${sheets?`<span class="pill" data-raw>${sheets}</span>`:'<span class="mut">нет</span>'}</td>
  <td style="white-space:nowrap"><button class="sm" onclick="mdGlassEdit('${esc(p.id)}')">Изменить</button>
   <button class="sm" onclick="mdGlassToggle('${esc(p.id)}')">${p.active===false?'Вернуть':'Снять'}</button>
   <button class="sm dl" onclick="mdGlassDelete('${esc(p.id)}')">×</button></td></tr>`;
}
function mdGlassNew(){
 mdEdit='new';
 mdDraft=normalizeGlassProduct({id:'',code:'',name:'',manufacturer:'',thicknessMm:6,substrate:'clear',coatingFamily:'uncoated'});
 render();
}
function mdGlassEdit(id){const p=glassProductById(id);if(!p)return;mdEdit=id;mdDraft=JSON.parse(JSON.stringify(p));render();}
function mdGlassForm(){
 const r=mdDraft,isNew=mdEdit==='new';
 const used=!isNew&&salesGlassProductHasReferences(r.id);
 return `<div class="form"><h3>${isNew?'Новая позиция каталога':'Изменение позиции'}</h3>
  ${used?'<div class="note">Эта позиция уже стоит в Makeup. Код менять можно — ссылки держатся на внутреннем идентификаторе и переживут переименование; удалить её нельзя.</div>':''}
  <div class="grid">
   <div><label>Код *</label><input id="md_code" value="${esc(r.code)}"><div class="hint">Цеховой код позиции. Именно он печатается на стикере и по нему сливается загруженный CSV.</div></div>
   <div><label>Название *</label><input id="md_name" value="${esc(r.name)}"></div>
   <div><label>Производитель</label><input id="md_mfr" value="${esc(r.manufacturer)}"></div>
   <div><label>Толщина, мм *</label><input id="md_thick" type="number" step="0.1" min="${GLASS_MIN_MM}" max="${GLASS_MAX_MM}" value="${r.thicknessMm==null?'':r.thicknessMm}"></div>
   <div><label>Фактическая толщина, мм</label><input id="md_actual" type="number" step="0.01" value="${r.actualThicknessMm==null?'':r.actualThicknessMm}"><div class="hint">Замер, а не гарантия: допуски дают разброс, точного числа поставщик не даёт.</div></div>
   <div><label>Подложка</label><select id="md_substrate">${mdVocabOptions('substrate',r.substrate)}</select></div>
   <div><label>Покрытие</label><select id="md_coating">${mdVocabOptions('coatingFamily',r.coatingFamily)}</select></div>
   <div><label>Нанесение</label><select id="md_deposition"><option value="">не установлено</option>${mdVocabOptions('deposition',r.deposition)}</select><div class="hint">Пиролитика стойкая, напыление мягкое — отсюда и правило поверхности.</div></div>
   <div><label>Закалка</label><select id="md_temper">${mdVocabOptions('temperMode',r.temperMode)}</select><div class="hint">«Только закалённым» — без печи не выпускать: цвет придёт к финальному лишь после неё. «В печь нельзя» — там гибнет товар.</div></div>
   <div><label>Правило поверхности</label><select id="md_exposure">${mdVocabOptions('exposureRule',r.exposureRule)}</select></div>
   <div><label>Разрешённые поверхности</label><input id="md_surfaces" value="${esc(r.allowedSurfaces.join(','))}" placeholder="2,3"><div class="hint">Номера через запятую. Пусто — любая поверхность.</div></div>
   <div><label>Единица хранения</label><select id="md_stockunit">${mdUnitOptions(r.stockingUnit)}</select></div>
   <div><label>Единица продажи</label><select id="md_salesunit">${mdUnitOptions(r.salesUnit)}</select></div>
   <div><label>Базовая кромка</label><select id="md_baseedge"><option value="" ${!r.baseEdgework?'selected':''}>Авто по толщине · ${esc(glassBaseEdgeworkLabel(glassAutoBaseEdgework(r.thicknessMm)))}</option><option value="arris" ${r.baseEdgework==='arris'?'selected':''}>Rough Arris</option><option value="polish" ${r.baseEdgework==='polish'?'selected':''}>Flat Polish</option></select><div class="hint">Арис до 8 мм, полировка от 10 мм. Ручной выбор для исключений — например, зеркалам 5/6 мм ставят полировку.</div></div>
   <div><label>Прежний код</label><input id="md_legacy" value="${esc(r.legacyCode)}"><div class="hint">Код той же позиции в Spil — по нему сходятся старые заказы.</div></div>
  </div>
  <div class="row" style="margin-top:12px">
   <label class="chk"><input type="checkbox" id="md_stocked" ${r.stocked?'checked':''}> Держим на складе</label>
   <label class="chk"><input type="checkbox" id="md_edge" ${r.edgeDeletion?'checked':''}> Требуется снятие покрытия по кромке</label>
   <label class="chk"><input type="checkbox" id="md_active" ${r.active!==false?'checked':''}> Позиция в производстве</label>
  </div>
  <div style="margin-top:12px"><label>Примечание</label><input id="md_note" value="${esc(r.note)}"></div>
  <div class="err" id="e_mdGlass"></div>
  <div class="row"><button class="pri" onclick="mdGlassSave()">Сохранить</button><button onclick="mdEdit=null;mdDraft=null;render()">Отмена</button></div></div>`;
}
function mdGlassSave(){
 const e=document.getElementById('e_mdGlass');e.style.display='none';
 const code=mdVal('md_code'),name=mdVal('md_name'),thick=mdVal('md_thick');
 if(!code||!name)return fail(e,'Код и название обязательны');
 if(!GLASS_CODE_RE.test(code))return fail(e,'Код: только буквы, цифры и + . _ - /');
 if(DB.glassProduct.some(p=>p.code.toUpperCase()===code.toUpperCase()&&p.id!==mdDraft.id))return fail(e,'Такой код уже есть');
 const t=+thick;
 if(!Number.isFinite(t)||t<GLASS_MIN_MM||t>GLASS_MAX_MM)return fail(e,'Толщина: число от '+GLASS_MIN_MM+' до '+GLASS_MAX_MM+' мм');
 const surfaces=glassSurfacesCell(mdVal('md_surfaces'));
 if(surfaces===null)return fail(e,'Поверхности: номера от 1 до 8 через запятую');
 const next=Object.assign({},mdDraft,{
  code,name,manufacturer:mdVal('md_mfr'),thicknessMm:t,
  actualThicknessMm:mdVal('md_actual')===''?null:+mdVal('md_actual'),
  substrate:mdVal('md_substrate'),coatingFamily:mdVal('md_coating'),deposition:mdVal('md_deposition'),
  temperMode:mdVal('md_temper'),exposureRule:mdVal('md_exposure'),allowedSurfaces:surfaces,
  stockingUnit:mdVal('md_stockunit'),salesUnit:mdVal('md_salesunit'),legacyCode:mdVal('md_legacy'),
  note:mdVal('md_note'),stocked:mdChecked('md_stocked'),edgeDeletion:mdChecked('md_edge'),baseEdgework:mdVal('md_baseedge'),active:mdChecked('md_active')
 });
 if(mdEdit==='new'){
  next.id=glassProductId(code);
  if(DB.glassProduct.some(p=>p.id===next.id))return fail(e,'Позиция с таким идентификатором уже есть');
  DB.glassProduct.push(normalizeGlassProduct(next));
 }else{
  const at=DB.glassProduct.findIndex(p=>p.id===mdDraft.id);
  if(at<0)return fail(e,'Позиция не найдена');
  /* идентификатор НЕ пересчитывается по новому коду: на него ссылаются Makeup */
  DB.glassProduct[at]=normalizeGlassProduct(next);
 }
 mdEdit=null;mdDraft=null;normalizeMasterData();touch();render();
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

function viewMdSupply(){
 if(mdSheetEdit!==null)return mdSheetForm();
 const rows=DB.glassSheet.slice().sort((a,b)=>a.productCode.localeCompare(b.productCode)||a.supplier.localeCompare(b.supplier));
 const orphans=glassOrphanSheets().length;
 return `<div class="sub">Одна строка — один продукт у одной точки поставки в одном формате листа. Тот же лист по новой цене обновляет строку; другой формат листа заводит свою. Валюта принадлежит точке поставки: Vitro Barrie отгружает в CAD, Vitro USA то же стекло в USD.</div>
  ${orphans?`<div class="note">Строк без продукта: <b>${orphans}</b>. Так бывает после переименования кода в каталоге — цена не потерялась, но продукт ей надо вернуть.</div>`:''}
  <div class="customer-table-wrap"><table><thead><tr><th>Продукт</th><th>Точка поставки</th><th>Лист</th><th>Единица</th><th>Цена закупки</th><th>Дата</th><th>Фрахт</th><th>Срок</th><th>Доступность</th><th></th></tr></thead>
  <tbody>${rows.map(mdSheetRow).join('')||'<tr><td colspan="10" class="empty">строк поставки нет — загрузи GLASS_SHEETS.csv или заведи строку вручную</td></tr>'}</tbody></table></div>
  <div class="row"><button class="pri" onclick="mdSheetNew()">+ Новая строка поставки</button></div>`;
}
function mdSheetRow(s){
 const p=glassProductByCode(s.productCode);
 return `<tr><td class="mono"><b>${raw(s.productCode)}</b>${p?`<div class="mut">${raw(p.name)}</div>`:'<div><span class="pill warn">продукта нет</span></div>'}</td>
  <td>${raw(s.supplier)}</td>
  <td class="mono">${s.sheetWIn!=null&&s.sheetHIn!=null?esc(s.sheetWIn+' × '+s.sheetHIn+' in'):'<span class="mut">не задан</span>'}</td>
  <td>${esc(mdUnitName(s.purchaseUnit))}<div class="mut">${esc(mdUnitCalcName(mdUnitCalc(s.purchaseUnit)))}</div></td>
  <td class="mono">${s.purchasePrice==null?'<span class="mut">нет</span>':esc(s.currency+' '+s.purchasePrice.toFixed(2))}</td>
  <td class="mono">${s.priceDate?esc(s.priceDate):'<span class="mut">—</span>'}</td>
  <td class="mono">${s.freightPct==null?'—':esc(s.freightPct+'%')}</td>
  <td class="mono">${s.leadTimeDays==null?'<span class="mut">—</span>':esc(s.leadTimeDays+' дн.')}</td>
  <td><span class="pill ${s.availability==='stock'?'ok':s.availability==='inactive'?'warn':'info'}">${esc(glassLabel('availability',s.availability))}</span></td>
  <td style="white-space:nowrap"><button class="sm" onclick="mdSheetEditRow('${esc(s.id)}')">Изменить</button>
   <button class="sm dl" onclick="mdSheetDelete('${esc(s.id)}')">×</button></td></tr>`;
}
function mdSheetNew(){
 mdSheetEdit='new';
 mdSheetDraft=normalizeGlassSheet({productCode:'',supplier:'',currency:GLASS_DEFAULT_CURRENCY,purchaseUnit:GLASS_DEFAULT_UNIT,availability:'order'});
 render();
}
function mdSheetEditRow(id){
 const s=(DB.glassSheet||[]).find(x=>x.id===id);if(!s)return;
 mdSheetEdit=id;mdSheetDraft=JSON.parse(JSON.stringify(s));render();
}
function mdSheetForm(){
 const r=mdSheetDraft,isNew=mdSheetEdit==='new';
 const codes=DB.glassProduct.slice().sort((a,b)=>a.code.localeCompare(b.code));
 return `<div class="form"><h3>${isNew?'Новая строка поставки':'Изменение строки поставки'}</h3>
  <div class="grid">
   <div><label>Продукт *</label><select id="md_sheetCode"><option value="">— выбрать —</option>${codes.map(p=>`<option data-raw value="${esc(p.code)}" ${p.code===r.productCode?'selected':''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select></div>
   <div><label>Точка поставки *</label><input id="md_sheetSupplier" value="${esc(r.supplier)}" placeholder="Vitro Barrie"><div class="hint">Именно точка, а не компания: у Vitro Barrie и Vitro USA разные валюты и сроки.</div></div>
   <div><label>Валюта</label><input id="md_sheetCurrency" value="${esc(r.currency)}" maxlength="3"></div>
   <div><label>Лист, ширина (in)</label><input id="md_sheetW" type="number" step="0.1" min="0" value="${r.sheetWIn==null?'':r.sheetWIn}"></div>
   <div><label>Лист, высота (in)</label><input id="md_sheetH" type="number" step="0.1" min="0" value="${r.sheetHIn==null?'':r.sheetHIn}"><div class="hint">Размер заполняется парой: половина габарита хуже, чем его отсутствие.</div></div>
   <div><label>Единица закупки</label><select id="md_sheetUnit">${mdUnitOptions(r.purchaseUnit)}</select><div class="hint">Не всякий товар покупается площадью — коробку или бочку площадью не мерят.</div></div>
   <div><label>Цена закупки</label><input id="md_sheetPrice" type="number" step="0.01" min="0" value="${r.purchasePrice==null?'':r.purchasePrice}"><div class="hint">Это ЗАКУПКА, у точки поставки. Цена ПРОДАЖИ живёт у продукта в каталоге стекла — колонки Price AN и Price FT.</div></div>
   <div><label>Дата цены</label><input id="md_sheetDate" value="${esc(r.priceDate)}" placeholder="2026-08-22"><div class="hint">Прайс без даты не говорит, насколько он устарел.</div></div>
   <div><label>Фрахт, %</label><input id="md_sheetFreight" type="number" step="0.1" min="0" value="${r.freightPct==null?'':r.freightPct}"></div>
   <div><label>Срок поставки, дней</label><input id="md_sheetLead" type="number" step="1" min="0" value="${r.leadTimeDays==null?'':r.leadTimeDays}"></div>
   <div><label>Доступность</label><select id="md_sheetAvail">${mdVocabOptions('availability',r.availability)}</select></div>
  </div>
  <div style="margin-top:12px"><label>Примечание</label><input id="md_sheetNote" value="${esc(r.note)}"></div>
  <div class="err" id="e_mdSheet"></div>
  <div class="row"><button class="pri" onclick="mdSheetSave()">Сохранить</button><button onclick="mdSheetEdit=null;mdSheetDraft=null;render()">Отмена</button></div></div>`;
}
function mdSheetSave(){
 const e=document.getElementById('e_mdSheet');e.style.display='none';
 const code=mdVal('md_sheetCode'),supplier=mdVal('md_sheetSupplier'),cur=mdVal('md_sheetCurrency').toUpperCase();
 if(!code||!supplier)return fail(e,'Продукт и точка поставки обязательны');
 if(cur&&!CURRENCY_RE.test(cur))return fail(e,'Валюта: три буквы кода, например CAD');
 const w=mdVal('md_sheetW'),h=mdVal('md_sheetH');
 if((w==='')!==(h===''))return fail(e,'Размер листа заполняется парой: ширина и высота');
 const date=mdVal('md_sheetDate');
 if(date&&!ISO_DATE_RE.test(date))return fail(e,'Дата цены: вид ГГГГ-ММ-ДД');
 const next=normalizeGlassSheet({
  id:mdSheetEdit==='new'?'':mdSheetDraft.id,
  productCode:code,supplier,currency:cur||GLASS_DEFAULT_CURRENCY,
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
 if(clash)return fail(e,'Эта точка поставки с таким листом уже заведена');
 if(mdSheetEdit==='new')DB.glassSheet.push(next);
 else{const at=DB.glassSheet.findIndex(s=>s.id===mdSheetDraft.id);if(at<0)return fail(e,'Строка не найдена');DB.glassSheet[at]=next;}
 mdSheetEdit=null;mdSheetDraft=null;normalizeMasterData();touch();render();
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
 return `<div class="sub" style="margin-top:22px">Surcharges are added on top of the glass price, per sq ft. Frit and spandrel keep the glass they are applied to — painting a lite is cheaper than buying a different one.</div>
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
function viewMdSpacer(){
 if(mdSpacerEdit!==null)return mdSpacerForm();
 const all=(DB.spacerVariant||[]).slice();
 all.sort((a,b)=>{
  const fa=SPACER_FAMILIES.indexOf(spacerFamilyOf(a)),fb=SPACER_FAMILIES.indexOf(spacerFamilyOf(b));
  if(fa!==fb)return fa-fb;
  if(a.system!==b.system)return String(a.system).localeCompare(String(b.system));
  const qa=spacerSizeParts(a.size),qb=spacerSizeParts(b.size);
  return (qa?qa.value:0)-(qb?qb.value:0);
 });
 return `<div class="sub">A spacer answers three different questions. <b>Family</b> drives the IGU surround price, <b>nominal size</b> is how the spacer is picked and named, <b>actual thickness</b> feeds the overall unit thickness. They do not always match: 7/16 is 11.1 mm in Aluminum and 11.5 mm in Black Warm Edge. Until an actual value is entered, the unit is calculated from the nominal size.</div>
  <div class="customer-table-wrap"><table><thead><tr><th>System</th><th>Family</th><th>Nominal</th><th>Nominal, mm</th><th>Actual, mm</th><th>Difference</th><th>Availability</th><th></th></tr></thead>
  <tbody>${all.map(mdSpacerRow).join('')||'<tr><td colspan="8" class="empty">no spacers</td></tr>'}</tbody></table></div>
  <div class="row"><button class="pri" onclick="mdSpacerNew()">+ New spacer</button></div>
  ${mdSurchargeTable()}`;
}
function mdSpacerRow(sp){
 const nominal=spacerNominalMm(sp.size),fact=mdNum(sp.thicknessMm);
 const diff=fact!=null&&nominal!=null?Math.round((fact-nominal)*10)/10:null;
 return `<tr>
  <td><b>${raw(sp.system)}</b><div class="mut mono">${raw(sp.id)}</div></td>
  <td>${esc(SPACER_FAMILY_LABELS[spacerFamilyOf(sp)]||spacerFamilyOf(sp))}</td>
  <td class="mono"><b>${raw(sp.size)}″</b></td>
  <td class="mono mut">${nominal==null?'—':esc(nominal.toFixed(1))}</td>
  <td><input class="md-mm" type="number" step="0.1" min="0" style="width:88px" value="${fact==null?'':fact}" placeholder="${nominal==null?'':esc(nominal.toFixed(1))}" onchange="mdSpacerSetThickness('${esc(sp.id)}',this.value)"></td>
  <td class="mono">${diff==null?'<span class="mut">—</span>':(diff===0?'<span class="mut">same</span>':'<b>'+esc((diff>0?'+':'')+diff.toFixed(1))+'</b>')}</td>
  <td><span class="pill ${sp.availability==='stock'?'ok':sp.availability==='inactive'?'warn':'info'}">${esc(glassLabel('availability',sp.availability))}</span></td>
  <td style="white-space:nowrap"><button class="sm" onclick="mdSpacerEditRow('${esc(sp.id)}')">Edit</button>
   <button class="sm dl" onclick="mdSpacerDelete('${esc(sp.id)}')">×</button></td></tr>`;
}
/* Пустое поле возвращает рамку к номиналу — это законный ответ «факт неизвестен»,
   а не ошибка ввода. Ноль и мусор не принимаются: рамки 0 мм не бывает. */
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
 mdSpacerDraft={id:'',family:'warm_edge',system:'Black Warm Edge',size:'',thicknessMm:null,availability:'stock',supplier:'',leadTimeDays:null,active:true};
 render();
}
function mdSpacerEditRow(id){
 const sp=(DB.spacerVariant||[]).find(x=>x.id===id);if(!sp)return;
 mdSpacerEdit=id;mdSpacerDraft=JSON.parse(JSON.stringify(sp));render();
}
function mdSpacerForm(){
 const r=mdSpacerDraft,isNew=mdSpacerEdit==='new';
 const nominal=spacerNominalMm(r.size);
 return `<div class="form"><h3>${isNew?'New spacer':'Edit spacer'}</h3>
  <div class="grid">
   <div><label>System *</label><select id="md_spSystem">${SPACER_SYSTEMS.map(x=>`<option data-raw value="${esc(x.system)}" ${x.system===r.system?'selected':''}>${esc(x.system)} · ${esc(SPACER_FAMILY_LABELS[x.family])}</option>`).join('')}</select><div class="hint">Family comes with the system — the surround price hangs on it.</div></div>
   <div><label>Nominal size *</label><input id="md_spSize" value="${esc(r.size)}" placeholder="17/32"><div class="hint">As a fraction, the way it is printed on the box. Nominal from it: ${nominal==null?'—':esc(nominal.toFixed(1)+' mm')}</div></div>
   <div><label>Actual thickness, mm</label><input id="md_spMm" type="number" step="0.1" min="0" value="${r.thicknessMm==null?'':r.thicknessMm}" placeholder="${nominal==null?'':esc(nominal.toFixed(1))}"><div class="hint">Empty — unit thickness is calculated from the nominal size.</div></div>
   <div><label>Availability</label><select id="md_spAvail">${mdVocabOptions('availability',r.availability)}</select></div>
   <div><label>Supplier</label><input id="md_spSupplier" value="${esc(r.supplier)}"></div>
   <div><label>Lead time, days</label><input id="md_spLead" type="number" step="1" min="0" value="${r.leadTimeDays==null?'':r.leadTimeDays}"></div>
  </div>
  <div class="err" id="e_mdSpacer"></div>
  <div class="row"><button class="pri" onclick="mdSpacerSave()">Save</button><button onclick="mdSpacerEdit=null;mdSpacerDraft=null;render()">Cancel</button></div></div>`;
}
function mdSpacerSave(){
 const e=document.getElementById('e_mdSpacer');e.style.display='none';
 const system=mdVal('md_spSystem'),size=mdVal('md_spSize');
 if(!system||!size)return fail(e,'System and nominal size are required');
 const q=spacerSizeParts(size);
 if(!q)return fail(e,'Nominal size is a fraction, for example 17/32');
 const known=SPACER_SYSTEMS.find(x=>x.system===system);
 const id=mdSpacerEdit==='new'?'SP-'+(known?known.code:'X')+'-'+spacerSizeKey(size):mdSpacerDraft.id;
 if(mdSpacerEdit==='new'&&(DB.spacerVariant||[]).some(x=>x.id===id))return fail(e,'This spacer already exists: '+id);
 const mmTyped=mdVal('md_spMm'),leadTyped=mdVal('md_spLead');
 const mm=mmTyped===''?null:+mmTyped;
 if(mm!=null&&(!isFinite(mm)||mm<=0))return fail(e,'Actual thickness: a positive number of millimetres');
 const next={
  id:id,family:known?known.family:'aluminum',system:system,size:size,
  thicknessMm:mm,
  name:system+' '+size+'″',code:id,
  availability:mdVal('md_spAvail'),supplier:mdVal('md_spSupplier'),
  leadTimeDays:leadTyped===''?null:+leadTyped,active:mdSpacerDraft.active!==false
 };
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
function mdWeightSearchChange(el){mdWeightFilter=el.value;const pos=el.selectionStart;render();requestAnimationFrame(()=>{const e=document.getElementById('mdWeightSearch');if(e){e.focus();try{e.setSelectionRange(pos,pos);}catch(x){}}});}
function viewMdWeight(){
 const q=mdWeightFilter.trim().toLowerCase(),rows=(DB.materialWeightRates||[]).filter(r=>!q||[r.label,r.key,r.note,r.unit].join(' ').toLowerCase().includes(q));
 return `<div class="sub">Weight norms are shared by every order. Glass uses geometry × thickness × density; the rows below supply measured material consumption. Empty means unknown and keeps Line Weight visibly incomplete.</div>
  <div class="filters"><input id="mdWeightSearch" value="${esc(mdWeightFilter)}" placeholder="Search component" oninput="mdWeightSearchChange(this)"></div>
  <div class="customer-table-wrap"><table><thead><tr><th>Component</th><th>Norm</th><th>Unit</th><th>Note</th></tr></thead><tbody>${rows.map(r=>{const d=mdWeightDisplay(r);return `<tr><td><b>${raw(r.label||r.key)}</b><div class="mut mono">${raw(r.key)}</div></td><td><input type="number" min="0" step="any" style="width:110px" value="${d.value}" placeholder="unknown" onchange="mdWeightSet('${esc(r.key)}',this.value,${d.factor})"></td><td>${esc(d.unit)}</td><td>${raw(r.note||'')}</td></tr>`;}).join('')||'<tr><td colspan="4" class="empty">No matching norms</td></tr>'}</tbody></table></div>`;
}
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
function viewMdHardware(){
 if(mdHwKindEdit!==null)return mdHwKindForm();
 if(mdHwModelEdit!==null)return mdHwModelForm();
 const kinds=DB.hardwareKind||[],models=DB.hardwareModel||[];
 const shown=mdHwFilter?models.filter(m=>m.kind===mdHwFilter):models;
 const sorted=shown.slice().sort((a,b)=>String(a.kind).localeCompare(String(b.kind))||String(a.series||'').localeCompare(String(b.series||''))||String(a.name).localeCompare(String(b.name)));
 const orphans=models.filter(m=>!hardwareKindRow(m.kind)).length;
 return `<div class="sub">The shop works by name: a person sees “Vienna 180” on the drawing and picks that template. So the catalog keeps the model name, not the seat dimensions — the template knows them. Kinds are created here as well: a pivot, or anything else, needs no code change.</div>
  ${orphans?`<div class="note">Models without a kind: <b>${orphans}</b>. That happens after a kind is deleted — the model itself is not lost, but it needs its kind back.</div>`:''}
  <div class="section-title"><h3>Kinds</h3><span class="pill info">the kind code goes into the drawing mark</span></div>
  <table><thead><tr><th>Kind</th><th>Code</th><th>On the drawing</th><th>Models</th><th>On drawings</th><th>Status</th><th></th></tr></thead>
  <tbody>${kinds.map(k=>{
   const used=mdHwKindUsage(k.code);
   return `<tr><td><b>${raw(hardwareKindName(k.code))}</b><div class="mut"><span data-raw>${esc(k.name)} · ${esc(k.nameEn)}</span></div></td>
    <td class="mono"><span data-raw>${esc(k.code)}</span></td>
    <td class="mono"><span data-raw>${esc(k.short)}</span></td>
    <td class="mono">${hardwareModelsFor(k.code,true).length}</td>
    <td class="mono">${used}</td>
    <td><span class="pill ${k.active===false?'warn':'ok'}">${k.active===false?'inactive':'active'}</span></td>
    <td style="white-space:nowrap"><button class="sm" onclick="mdHwKindEditRow('${esc(k.code)}')">Edit</button><button class="sm dl" onclick="mdHwKindDelete('${esc(k.code)}')">×</button></td></tr>`;
  }).join('')||'<tr><td colspan="7" class="empty">no kinds</td></tr>'}</tbody></table>
  <div class="row"><button onclick="mdHwKindNew()">+ New kind</button></div>
  <div class="section-title"><h3>Models</h3><span class="pill info">the name exactly as it reads on the shop template</span></div>
  <div class="row"><label>Kind</label><select onchange="mdHwFilter=this.value;render()"><option value="">— all —</option>${kinds.map(k=>`<option value="${esc(k.code)}" ${mdHwFilter===k.code?'selected':''} data-raw>${esc(hardwareKindName(k.code))}</option>`).join('')}</select></div>
  <table><thead><tr><th>Model</th><th>Kind</th><th>Series</th><th>On the drawing</th><th>Glass thickness</th><th>Supplier code</th><th>On drawings</th><th>Status</th><th></th></tr></thead>
  <tbody>${sorted.map(m=>{
   const used=mdHwModelUsage(m.id),kind=hardwareKindRow(m.kind);
   return `<tr><td><b>${raw(m.name)}</b>${m.note?`<div class="mut">${raw(m.note)}</div>`:''}</td>
    <td>${kind?raw(hardwareKindName(m.kind)):'<span class="pill warn">no kind</span>'}</td>
    <td>${m.series?raw(m.series):'<span class="mut">—</span>'}</td>
    <td class="mono"><b>${raw(hardwareModelShort(m))}</b>${m.short?'':'<div class="mut">auto</div>'}</td>
    <td class="mono">${m.thickness?raw(m.thickness):'<span class="mut">—</span>'}</td>
    <td class="mono">${m.supplierCode?raw(m.supplierCode):'<span class="mut">—</span>'}</td>
    <td class="mono">${used}</td>
    <td><span class="pill ${m.active===false?'warn':'ok'}">${m.active===false?'inactive':'active'}</span></td>
    <td style="white-space:nowrap"><button class="sm" onclick="mdHwModelEditRow('${esc(m.id)}')">Edit</button><button class="sm dl" onclick="mdHwModelDelete('${esc(m.id)}')">×</button></td></tr>`;
  }).join('')||'<tr><td colspan="9" class="empty">no models</td></tr>'}</tbody></table>
  <div class="row"><button class="pri" onclick="mdHwModelNew()">+ New model</button></div>`;
}
function mdHwKindNew(){mdHwKindEdit='new';mdHwKindDraft={code:'',name:'',nameEn:'',short:'',active:true,note:''};render();}
function mdHwKindEditRow(code){const k=hardwareKindRow(code);if(!k)return;mdHwKindEdit=code;mdHwKindDraft=JSON.parse(JSON.stringify(k));render();}
function mdHwKindForm(){
 const r=mdHwKindDraft,isNew=mdHwKindEdit==='new';
 return `<div class="form"><h3>${isNew?'New hardware kind':'Edit вида'}</h3>
  <div class="grid">
   <div><label>Code *</label><input id="md_hwKindCode" value="${esc(r.code)}" placeholder="pivot" ${isNew?'':'readonly class="ro"'}><div class="hint">Latin letters, no spaces. The code goes into the drawing mark and into the pricing key, so it never changes once the kind exists.</div></div>
   <div><label>Name *</label><input id="md_hwKindName" value="${esc(r.name)}" placeholder="Pivot"></div>
   <div><label>Name (EN) *</label><input id="md_hwKindNameEn" value="${esc(r.nameEn)}" placeholder="Pivot"><div class="hint">Both columns are filled in here: the interface language picks one of them instead of translating the database.</div></div>
   <div><label>Drawing code</label><input id="md_hwKindShort" value="${esc(r.short)}" placeholder="PVT" maxlength="6"><div class="hint">Short label next to the mark. Empty — taken from the kind code.</div></div>
   <div><label>Status</label><select id="md_hwKindActive"><option value="1" ${r.active===false?'':'selected'}>active</option><option value="0" ${r.active===false?'selected':''}>inactive</option></select><div class="hint">An inactive kind gets no button in the editor, but old drawings still read.</div></div>
  </div>
  <div style="margin-top:12px"><label>Note</label><input id="md_hwKindNote" value="${esc(r.note||'')}"></div>
  <div class="err" id="e_mdHwKind"></div>
  <div class="row"><button class="pri" onclick="mdHwKindSave()">Save</button><button onclick="mdHwKindEdit=null;mdHwKindDraft=null;render()">Cancel</button></div></div>`;
}
function mdHwKindSave(){
 const e=document.getElementById('e_mdHwKind');e.style.display='none';
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
function mdHwModelEditRow(id){const m=hardwareModelById(id);if(!m)return;mdHwModelEdit=id;mdHwModelDraft=JSON.parse(JSON.stringify(m));render();}
function mdHwModelForm(){
 const r=mdHwModelDraft,isNew=mdHwModelEdit==='new',kinds=DB.hardwareKind||[];
 return `<div class="form"><h3>${isNew?'New hardware model':'Edit модели'}</h3>
  <div class="grid">
   <div><label>Kind *</label><select id="md_hwModelKind">${kinds.map(k=>`<option value="${esc(k.code)}" ${k.code===r.kind?'selected':''} data-raw>${esc(hardwareKindName(k.code))}</option>`).join('')}</select></div>
   <div><label>Name *</label><input id="md_hwModelName" value="${esc(r.name)}" placeholder="Vienna 180"><div class="hint">Exactly the name the shop uses to find its template. Do not tidy it up.</div></div>
   <div><label>Series</label><input id="md_hwModelSeries" value="${esc(r.series||'')}" placeholder="Vienna"><div class="hint">Only for the order of the list: Vienna 90 · 135 · 180 end up next to each other.</div></div>
   <div><label>On the drawing</label><input id="md_hwModelShort" value="${esc(r.short||'')}" placeholder="${esc(hwDeriveModelShort(r.name,r.series)||'GEN37')}" maxlength="10"><div class="hint">Short name next to the mark: Geneva 37 does not fit, GEN37 does. Empty — derived from the name.</div></div>
   <div><label>Glass thickness</label><input id="md_hwModelThickness" value="${esc(r.thickness||'')}" placeholder="3/8″ · 1/2″"><div class="hint">A note for the salesperson. Not used in calculations: a line listing several sizes has nothing to compute.</div></div>
   <div><label>Supplier code</label><input id="md_hwModelCode" value="${esc(r.supplierCode||'')}"></div>
   <div><label>Status</label><select id="md_hwModelActive"><option value="1" ${r.active===false?'':'selected'}>active</option><option value="0" ${r.active===false?'selected':''}>inactive</option></select><div class="hint">An inactive model is not offered in new orders but stays visible in the old ones.</div></div>
  </div>
  <div style="margin-top:12px"><label>Note</label><input id="md_hwModelNote" value="${esc(r.note||'')}"></div>
  <div class="err" id="e_mdHwModel"></div>
  <div class="row"><button class="pri" onclick="mdHwModelSave()">Save</button><button onclick="mdHwModelEdit=null;mdHwModelDraft=null;render()">Cancel</button></div></div>`;
}
function mdHwModelSave(){
 const e=document.getElementById('e_mdHwModel'),isNew=mdHwModelEdit==='new';e.style.display='none';
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
 {key:'glassProduct',   label:'Каталог стекла',      what:'что за стекло и почём продаём: подложка, покрытие, толщина, закалка, две цены'},
 {key:'glassSheet',     label:'Точки поставки',      what:'где и почём: валюта, размер листа, цена, срок'},
 {key:'hardwareKind',   label:'Hardware kinds',      what:'hinge, clamp, patch and whatever is added next'},
 {key:'hardwareModel',  label:'Hardware models',    what:'the shop picks its template by the model name'},
 {key:'heatTreatment',  label:'Термообработка',      what:'annealed · heat strengthened · tempered'},
 {key:'spacerVariant',  label:'Дистанционные рамки', what:'семейство для цены, номинал для выбора, факт для расчёта'},
 {key:'gasProduct',     label:'Газ',                 what:'заполнение камеры'},
 {key:'sealantProduct', label:'Герметики',           what:'первичный и вторичный контур'},
 {key:'interlayerProduct',label:'Плёнки ламинации',  what:'EVA и SGP по исполнениям, цена за слой'},
 {key:'fritProduct',    label:'Силкскрин',           what:'керамика и цифровая печать, надбавка за sq ft'},
 {key:'spandrelProduct',label:'Спандрел',            what:'непрозрачные панели'},
 {key:'station',        label:'Станции маршрута',    what:'одиннадцать шагов маршрута'},
 {key:'edgeAllowance',  label:'Припуск на рез',       what:'съём на сторону: монолит по стеклу, ламинат по плите'},

 {key:'terminal',       label:'Терминалы',           what:'экраны сканирования в цеху'},
 {key:'customer',       label:'Клиенты',             what:'контакты, адреса, условия'},
 {key:'salesOrder',     label:'Заказы',              what:'заказы с makeup и позициями'},
 {key:'shapeDef',       label:'Контуры Shape',       what:'геометрия деталей'},
 {key:'user',           label:'Пользователи',        what:'роли и рабочие места'}
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
const MD_ALLOWANCE_SCOPES=[{k:'mono',label:'Monolithic · по стеклу'},{k:'lami',label:'Laminated · по ПЛИТЕ'}];
/* Пробник: владелец видит результат правки, не открывая заказ. */
const MD_ALLOWANCE_SAMPLES=[
 {label:'Монолит 6 мм · Flat Polish',op:'Flat Polish',mm:6,scope:'mono'},
 {label:'Монолит 12 мм · Flat Polish',op:'Flat Polish',mm:12,scope:'mono'},
 {label:'Монолит 10 мм · CNC Shape Polish',op:'CNC Shape Polish',mm:10,scope:'mono'},
 {label:'Ламинат 6+6 · Flat Polish (плита 6)',op:'Flat Polish',mm:6,scope:'lami'},
 {label:'Ламинат 6+6 · Lami Polish (плита 6)',op:'Lami Polish',mm:6,scope:'lami'},
 {label:'Ламинат 10+10 · Lami Polish (плита 10)',op:'Lami Polish',mm:10,scope:'lami'},
 {label:'Ламинат 12+12 · CNC Lami Polish (плита 12)',op:'CNC Lami Polish',mm:12,scope:'lami'}
];
function mdAllowanceSorted(){
 return (DB.edgeAllowance||[]).slice().sort((a,b)=>
  SHAPE_EDGE_OPS.indexOf(a.op)-SHAPE_EDGE_OPS.indexOf(b.op)
  ||String(a.scope).localeCompare(String(b.scope))
  ||(+a.minMm)-(+b.minMm));
}
function mdAllowanceShow(v){
 const p=fabParseDimStrict(String(v==null?'':v).trim());
 if(!p.ok)return '<span class="pill warn">не число</span>';
 if(p.v>SHAPE_ALLOWANCE_MAX_IN)return '<span class="pill warn">слишком много</span>';
 return `<span class="mono">${p.v?esc(dimIn(p.v)):'0″'}</span>`;
}
function viewMdAllowance(){
 const rows=mdAllowanceSorted();
 return `<div class="sub" style="margin-top:6px">Съём на сторону: насколько лист больше готового размера, чтобы после кромки выйти в размер. Одна толщина встречается дважды не по ошибке: монолит меряется по стеклу, а ламинат по ПЛИТЕ склейки, потому что при резке каждое стекло отдельная панель. Из совпавших строк выигрывает самая узкая, поэтому широкая задаёт умолчание, а узкая — исключение внутри него.</div>
  <div class="customer-table-wrap"><table><thead><tr><th>Операция</th><th>Мера</th><th>От, мм</th><th>До, мм</th><th>Припуск</th><th>Пример</th><th></th></tr></thead>
  <tbody>${rows.map(r=>`<tr>
   <td><select onchange="mdAllowanceSet('${esc(r.id)}','op',this.value)">${SHAPE_EDGE_OPS.map(o=>`<option value="${esc(o)}" ${o===r.op?'selected':''}>${esc(o)}</option>`).join('')}</select></td>
   <td><select onchange="mdAllowanceSet('${esc(r.id)}','scope',this.value)">${MD_ALLOWANCE_SCOPES.map(s=>`<option value="${s.k}" ${s.k===r.scope?'selected':''}>${esc(s.label)}</option>`).join('')}</select></td>
   <td><input class="md-mm" type="number" step="0.1" min="0" style="width:78px" value="${esc(String(r.minMm))}" onchange="mdAllowanceSet('${esc(r.id)}','minMm',this.value)"></td>
   <td><input class="md-mm" type="number" step="0.1" min="0" style="width:78px" value="${esc(String(r.maxMm))}" onchange="mdAllowanceSet('${esc(r.id)}','maxMm',this.value)"></td>
   <td><input style="width:92px" value="${esc(String(r.allowance))}" placeholder="1/16" onchange="mdAllowanceSet('${esc(r.id)}','allowance',this.value)"></td>
   <td>${mdAllowanceShow(r.allowance)}${r.note?`<div class="mut">${esc(r.note)}</div>`:''}</td>
   <td><button class="btn-ghost" onclick="mdAllowanceRemove('${esc(r.id)}')">×</button></td>
  </tr>`).join('')}</tbody></table></div>
  <div style="margin-top:10px"><button class="btn-ghost" onclick="mdAllowanceAdd()">+ строка</button></div>
  <div class="sub" style="margin-top:22px">Что получится с текущими значениями</div>
  <div class="customer-table-wrap"><table><thead><tr><th>Случай</th><th>Припуск на сторону</th></tr></thead>
  <tbody>${MD_ALLOWANCE_SAMPLES.map(s=>{
    const r=ShapeModule.productionAllowanceRule(s.op,s.mm,s.scope);
    return `<tr><td>${esc(s.label)}</td><td>${r.ok?`<b class="mono">${r.value?'+'+esc(dimIn(r.value)):'0″'}</b>`:'<span class="pill warn">правила нет — рез заблокирован</span>'}</td></tr>`;
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
function viewMdOverview(){
 const rows=MD_COLLECTIONS.map(c=>{
  const n=Array.isArray(DB[c.key])?DB[c.key].length:0;
  return `<tr><td><b>${c.label}</b><div class="mut">${c.what}</div></td>
   <td class="mono"><span data-raw>${esc(c.key)}</span></td>
   <td class="mono"><b>${n}</b></td>
   <td>${n?'<span class="pill ok">заполнено</span>':'<span class="pill info">пусто</span>'}</td></tr>`;
 }).join('');
 return `<div class="sub">Все коллекции системы одним списком. Это ответ на вопрос «что вообще в базе есть» — и место, где видно, чего не хватает.</div>
  <table><thead><tr><th>Коллекция</th><th>Ключ данных</th><th>Записей</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  <div class="hint">При смене смысла справочной таблицы версия поднимается, и заводские данные заменяют старые — введённые руками цены поставки при этом не трогаются. Версия справочников: <b data-raw>${DB.refVersion}</b></div>`;
}

/* --- 5. Импорт -------------------------------------------------------- */

function mdImportCard(){
 const isGlass=mdTab==='glass';
 const which=isGlass?'GLASS_PRODUCTS.csv':'GLASS_SHEETS.csv';
 return `<div class="card">
  <div class="section-title"><h3>Загрузить ${which}</h3><span class="pill info">слияние по коду</span></div>
  <div class="sub">${isGlass
   ?'Файл обновляет позиции с теми же кодами и добавляет новые. Колонок, которых нет в шапке файла, импорт не трогает — вернувшийся из Excel файл без пяти колонок не сотрёт оптику остального каталога.'
   :'Строка опознаётся тройкой продукт · точка поставки · размер листа. Строка на код, которого нет в каталоге, отклоняется: цена без продукта тихо ляжет в себестоимость.'}</div>
  <div class="row"><button onclick="document.getElementById('mdCsv').click()">Выбрать файл</button>
   <input type="file" id="mdCsv" accept=".csv,.txt" style="display:none" onchange="mdImportCsv(this,'${mdTab}')"></div>
  ${mdImportReport&&mdImportReport.which===mdTab?sfReportHTML(mdImportReport.rep):''}</div>`;
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
 {k:'interlayerProduct', label:'Interlayers',      prefix:'ILR',  what:'lamination films, price per ply'},
 {k:'fritProduct',       label:'Frit',             prefix:'FRIT', what:'silkscreen, surcharge per ft²'},
 {k:'spandrelProduct',   label:'Spandrel',         prefix:'SPAN', what:'opaque panels, surcharge per ft²'},
 {k:'stockItem',         label:'Stock items',      prefix:'STK',  what:'doors, kits, consumables — sold as their own order line'},
 {k:'spandrelColour',    label:'Spandrel colours', prefix:'SPC',  what:'palette with manufacturer codes'},
 {k:'serviceRate',       label:'Works',            prefix:'SVC',  what:'shop work: station, price and application range'}
];
function mdCatDef(){return MD_CATALOGUES.find(c=>c.k===mdCatKind)||MD_CATALOGUES[0];}
function mdCatRows(){return Array.isArray(DB[mdCatKind])?DB[mdCatKind]:[];}
function mdCatIsColour(){return mdCatKind==='spandrelColour';}
/* Прайс — не свободный список. Каждая строка отвечает работе, которую система
   умеет посчитать: у неё есть база (штука, дюйм, площадь) и место в счёте.
   Строка, заведённая руками, ни в один счёт не попадёт — начислять её некому.
   Поэтому здесь можно править цену, единицу, вид и выключать строку, но нельзя
   добавлять и удалять: это была бы кнопка, которая делает вид, что работает. */
function mdCatIsRate(){return mdCatKind==='serviceRate';}
/* Диапазон применения человеку: «9–15 mm», «from 2 1/16″», «up to 1 3/4″». */
function mdWorkRangeText(r){
 if(!r||!r.appliesBy)return '';
 const u=r.appliesBy==='thickness'?' mm':'″';
 const f=r.appliesFrom,t=r.appliesTo;
 if(f!=null&&t!=null)return f+'–'+t+u;
 if(f!=null)return 'from '+f+u;
 if(t!=null)return 'up to '+t+u;
 return '';
}
function mdRateBandText(r,band){
  if(r.kind==='flat')return band==='6'?(r.flat==null?'—':Number(r.flat).toFixed(2)):'';
  var v=r.bands?r.bands[band]:null;
  return v==null?'—':Number(v).toFixed(2);
}
function mdSetCatKind(k){if(!MD_CATALOGUES.some(c=>c.k===k))return;mdCatKind=k;mdCatEdit=null;mdCatDraft=null;render();}

function viewMdCatalogues(){
 if(!MD_CATALOGUES.some(c=>c.k===mdCatKind))mdCatKind=MD_CATALOGUES[0].k;
 if(mdCatEdit!==null)return mdCatForm();
 const def=mdCatDef(),rows=mdCatRows(),colour=mdCatIsColour(),rate=mdCatIsRate();
 const cols=rate?8:colour?5:6;
 return `<div class="sub">The owner keeps these catalogues. Rows added here <b>survive system updates</b>: factory content is filled in by id, anything typed by hand is left untouched. A position an order already references is safer to switch off than to delete — otherwise the old order would no longer know what it was.</div>
  <div class="row"><label>Catalogue</label><select onchange="mdSetCatKind(this.value)">${MD_CATALOGUES.map(c=>`<option value="${esc(c.k)}" ${c.k===mdCatKind?'selected':''}>${esc(c.label)}</option>`).join('')}</select><span class="mut">${esc(def.what)}</span></div>
  <div class="customer-table-wrap"><table><thead><tr><th>Name</th>${rate?'<th>Station</th><th>Unit</th><th>up to 7 mm</th><th>8–11 mm</th><th>12–19 mm</th>':`<th>Code</th>${colour?'<th>Family</th><th>Spandrel</th>':'<th>Supplier</th><th>Price, CAD</th>'}`}<th>Status</th><th></th></tr></thead>
  <tbody>${rows.map(mdCatRowHTML).join('')||`<tr><td colspan="${cols}" class="empty">empty</td></tr>`}</tbody></table></div>
  <div class="row"><button class="pri" onclick="mdCatNew()">+ New</button></div>
  ${rate?'<div class="sub">You can add a work yourself: name it, pick a station, a unit and a rate. If its bands don\'t match the standard ones, set an application range and the work will be found by it. Rows are never deleted, only <b>switched off</b>: an old order still points at a switched-off row and it must keep its name there. A switched-off row enters the invoice as <b>Rate required</b> and stays out of the monetary total — an honest "the work exists, the price doesn\'t", not a zero.</div>':''}`;
}
function mdCatRowHTML(x){
 const colour=mdCatIsColour();
 if(mdCatIsRate())return `<tr>
  <td><b>${raw(x.name)}</b><div class="mut mono">${raw(x.id)}</div>${x.note?`<div class="mut">${raw(x.note)}</div>`:''}</td>
  <td class="mono">${x.station?esc(x.station):'<span class="mut">—</span>'}${x.appliesBy?`<div class="mut">${esc(mdWorkRangeText(x))}</div>`:''}</td>
  <td class="mono">${esc(x.unit)}</td>
  <td class="mono">${esc(mdRateBandText(x,'6'))}${x.kind==='flat'?'<div class="mut">flat rate</div>':''}</td>
  <td class="mono">${esc(mdRateBandText(x,'8-10'))}</td>
  <td class="mono">${esc(mdRateBandText(x,'12-19'))}</td>
  <td><span class="pill ${x.active===false?'warn':'ok'}">${x.active===false?'no rate':'active'}</span></td>
  <td style="white-space:nowrap"><button class="sm" onclick="mdCatEditRow('${esc(x.id)}')">Edit</button></td></tr>`;
 const scope=colour?(x.productId?((DB.spandrelProduct||[]).find(p=>p.id===x.productId)||{}).name||x.productId:'any'):'';
 return `<tr>
  <td><b>${raw(x.name)}</b><div class="mut mono">${raw(x.id)}${x.subcategory?' · '+esc(x.subcategory):''}</div>${x.sellsAsOwnLine?'<span class="pill info">own order line</span>':''}</td>
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
  ?{id:'',name:'',unit:'pc',station:'',kind:'band',flat:null,bands:{},
    family:'',appliesBy:'',appliesFrom:null,appliesTo:null,note:'',active:true}
  :{id:'',name:'',code:'',supplier:'',salePrice:null,subcategory:'consumable',sellsAsOwnLine:mdCatKind==='stockItem',active:true};
 render();
}
function mdCatEditRow(id){
 const x=mdCatRows().find(r=>r.id===id);if(!x)return;
 mdCatEdit=id;mdCatDraft=JSON.parse(JSON.stringify(x));render();
}
function mdCatForm(){
 const r=mdCatDraft,isNew=mdCatEdit==='new',colour=mdCatIsColour(),def=mdCatDef();
 /* Подсказка собирается из уже заведённых значений плюс заводской список —
    но вписать можно любое: закрытых списков в этом справочнике больше нет. */
 const familyHints=Array.from(new Set(SPANDREL_COLOUR_FAMILIES.concat((DB.spandrelColour||[]).map(c=>c.family).filter(Boolean))));
 if(mdCatIsRate()){
  const band=b=>r.bands&&r.bands[b]!=null?r.bands[b]:'';
  const stations=(DB.station||[]).slice().sort((a,b)=>(+a.seq||0)-(+b.seq||0));
  return `<div class="form"><h3>${isNew?'New work':'Edit · '+esc(r.name)}</h3>
   <div class="sub mono">${isNew?'the id appears after saving':esc(r.id)}</div>
   <div class="grid">
    <div><label>Name *</label><input id="md_catName" value="${esc(r.name)}"></div>
    <div><label>Unit</label><select id="md_catUnit">${['pc','in','ft²'].map(u=>`<option value="${esc(u)}" ${u===r.unit?'selected':''}>${esc(u)}</option>`).join('')}</select><div class="hint">Per piece, per calculated edge inch, or per area. The billing basis doesn't change with this — that's set by the calculation; the unit only labels the number.</div></div>
    <div><label>Rate shape</label><select id="md_catRateKind" onchange="mdCatDraft.kind=this.value;render()"><option value="band" ${r.kind!=='flat'?'selected':''}>By glass thickness</option><option value="flat" ${r.kind==='flat'?'selected':''}>One rate for any thickness</option></select></div>
   </div>
   <div class="grid">
    <div><label>Station</label><select id="md_catStation"><option value="">— no station —</option>${stations.map(st=>`<option value="${esc(st.code)}" ${st.code===(r.station||'')?'selected':''}>${esc(st.code)} · ${esc(LANG==='en'?(st.nameEn||st.name):(st.name||st.nameEn))}</option>`).join('')}</select><div class="hint">Where the work is done. The route learns from this which area the part goes to. Empty means there is no shop work at all — it's a pure price uplift.</div></div>
    <div><label>Applies by</label><select id="md_catAppliesBy" onchange="mdCatDraft.appliesBy=this.value;render()"><option value="" ${r.appliesBy?'':'selected'}>always</option><option value="thickness" ${r.appliesBy==='thickness'?'selected':''}>by thickness, mm</option><option value="diameter" ${r.appliesBy==='diameter'?'selected':''}>by diameter, inches</option></select><div class="hint">A range is needed when the work's bands don't match the standard ones — as with beveling.</div></div>
   </div>
   ${r.appliesBy?`<div class="grid">
    <div><label>Family</label><input id="md_catFamily" value="${esc(r.family||'')}"><div class="hint">A shared name for rows of one work with different ranges. For beveling it's <b>bevel</b> across all three bands.</div></div>
    <div><label>From</label><input id="md_catFrom" type="number" step="0.01" min="0" value="${r.appliesFrom==null?'':r.appliesFrom}"><div class="hint">Empty — no lower bound</div></div>
    <div><label>To</label><input id="md_catTo" type="number" step="0.01" min="0" value="${r.appliesTo==null?'':r.appliesTo}"><div class="hint">Empty — no upper bound</div></div>
   </div><div class="hint">Ranges within one family must not overlap: on an overlap the system won't pick a row silently — it honestly leaves the work without a rate.</div>`:''}
   ${r.kind==='flat'
    ?`<div class="grid"><div><label>Rate, CAD</label><input id="md_catFlat" type="number" step="0.01" min="0" value="${r.flat==null?'':r.flat}"><div class="hint">Empty — no price: the row enters the invoice as Rate required.</div></div></div>`
    :`<div class="grid">
      <div><label>up to 7 mm</label><input id="md_catB6" type="number" step="0.01" min="0" value="${esc(band('6'))}"></div>
      <div><label>8–11 mm</label><input id="md_catB810" type="number" step="0.01" min="0" value="${esc(band('8-10'))}"></div>
      <div><label>12–19 mm</label><input id="md_catB1219" type="number" step="0.01" min="0" value="${esc(band('12-19'))}"></div>
     </div><div class="hint">An empty cell means there is no price for that thickness. The bands meet end to end and cover everything from 0 to 19 mm: purchased laminate 6.38 falls into the first, 11.52 into the second.</div>`}
   <div class="grid">
    <div><label>Note</label><input id="md_catNote" value="${esc(r.note||'')}"></div>
    <div><label>Status</label><select id="md_catActive"><option value="1" ${r.active!==false?'selected':''}>active</option><option value="0" ${r.active===false?'selected':''}>no rate</option></select></div>
   </div>
   <div class="err" id="e_mdCat"></div>
   <div class="row"><button class="pri" onclick="mdCatSave()">Save</button><button onclick="mdCatEdit=null;mdCatDraft=null;render()">Cancel</button></div></div>`;
 }
 return `<div class="form"><h3>${isNew?'New':'Edit'} · ${esc(def.label)}</h3>
  <div class="grid">
   <div><label>Name *</label><input id="md_catName" value="${esc(r.name)}"></div>
   <div><label>Code</label><input id="md_catCode" value="${esc(r.code)}"><div class="hint">The manufacturer's code, as written in their table. It's the same code that goes to the shop.</div></div>
   ${colour
    ?`<div><label>Family</label><input id="md_catFamily" list="md_catFamilyList" value="${esc(r.family||'')}"><datalist id="md_catFamilyList">${familyHints.map(f=>`<option value="${esc(f)}">`).join('')}</datalist><div class="hint">Empty — a colour without a family. Type your own name; the list above is only a hint.</div></div>
      <div><label>Spandrel</label><select id="md_catProduct"><option value="" ${r.productId?'':'selected'}>— any spandrel —</option>${(DB.spandrelProduct||[]).map(p=>`<option value="${esc(p.id)}" ${p.id===r.productId?'selected':''}>${esc(p.name)}</option>`).join('')}</select><div class="hint">Empty — the colour is available to any spandrel type. Pick one when a product has its own palette.</div></div>`
    :`<div><label>Supplier</label><input id="md_catSupplier" value="${esc(r.supplier||'')}"></div>
      <div><label>Price, CAD</label><input id="md_catPrice" type="number" step="0.01" min="0" value="${r.salePrice==null?'':r.salePrice}"><div class="hint">Surcharge per ft², if the catalogue uses one — or the sale price, for a stock item. Empty — no price, and the row honestly enters the invoice as Rate required, not a zero.</div></div>
      ${mdCatKind==='stockItem'?`<div><label>Subcategory</label><select id="md_catSubcategory"><option value="door" ${r.subcategory==='door'?'selected':''}>Door</option><option value="kit" ${r.subcategory==='kit'?'selected':''}>Kit</option><option value="consumable" ${r.subcategory==='consumable'||!r.subcategory?'selected':''}>Consumable</option></select></div>`:''}
      <div style="grid-column:1/-1"><label class="chk"><input type="checkbox" id="md_catOwnLine" ${r.sellsAsOwnLine?'checked':''}> Sells as its own order line</label>
       <div class="hint">Shows up in the order-line picker next to Single / Double / Triple: no geometry, no route, just this item, a quantity and a price. Turn this on for anything you sell as-is — a stock door, a kit, or your own roll of interlayer film.</div></div>`}
   <div><label>Status</label><select id="md_catActive"><option value="1" ${r.active!==false?'selected':''}>active</option><option value="0" ${r.active===false?'selected':''}>inactive</option></select></div>
  </div>
  <div class="err" id="e_mdCat"></div>
  <div class="row"><button class="pri" onclick="mdCatSave()">Save</button><button onclick="mdCatEdit=null;mdCatDraft=null;render()">Cancel</button></div></div>`;
}
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
 const colour=mdCatIsColour(),def=mdCatDef(),rows=mdCatRows();
 const name=mdVal('md_catName');
 if(!name)return fail(e,'Name is required');
 if(mdCatIsRate()){
  const kindPicked=mdVal('md_catRateKind')==='flat'?'flat':'band';
  const num=id=>{const v=mdVal(id);return v===''?null:+v;};
  const bad=v=>v!=null&&(!isFinite(v)||v<0);
  const flat=kindPicked==='flat'?num('md_catFlat'):mdCatDraft.flat;
  const b6=kindPicked==='band'?num('md_catB6'):(mdCatDraft.bands||{})['6'];
  const b810=kindPicked==='band'?num('md_catB810'):(mdCatDraft.bands||{})['8-10'];
  const b1219=kindPicked==='band'?num('md_catB1219'):(mdCatDraft.bands||{})['12-19'];
  if([flat,b6,b810,b1219].some(bad))return fail(e,'Rate must be a non-negative number or empty');
  const appliesBy=mdVal('md_catAppliesBy');
  const from=appliesBy?num('md_catFrom'):null,to=appliesBy?num('md_catTo'):null;
  if([from,to].some(bad))return fail(e,'Range bound must be a non-negative number or empty');
  if(from!=null&&to!=null&&from>to)return fail(e,'The lower bound of the range is above the upper one');
  const family=appliesBy?mdVal('md_catFamily'):'';
  if(appliesBy&&!family)return fail(e,'A work with a range needs a family: the system uses it to find the matching row');
  const isNewRow=mdCatEdit==='new';
  const id=isNewRow?mdCatIdFrom(def.prefix,'',name,rows):mdCatDraft.id;
  const next=normalizeServiceRate(Object.assign({},mdCatDraft,{
   id:id,name:name,unit:mdVal('md_catUnit'),station:mdVal('md_catStation'),
   kind:kindPicked,flat:flat,bands:{'6':b6,'8-10':b810,'12-19':b1219},
   family:family,appliesBy:appliesBy,appliesFrom:from,appliesTo:to,
   note:mdVal('md_catNote'),active:mdVal('md_catActive')!=='0'
  }));
  /* Пересечение диапазонов внутри одной family — ошибка данных: система не
     должна выбирать строку молча, иначе цена зависит от порядка в справочнике.
     Ловим на сохранении, чтобы владелец увидел это сразу, а не через месяц на
     заказе, где работа вдруг осталась без ставки. */
  if(next.appliesBy&&next.active!==false){
    const lo=next.appliesFrom==null?-Infinity:next.appliesFrom;
    const hi=next.appliesTo==null?Infinity:next.appliesTo;
    const clash=rows.find(x=>x&&x.id!==next.id&&x.active!==false&&x.family===next.family&&
      x.appliesBy===next.appliesBy&&
      (x.appliesFrom==null?-Infinity:x.appliesFrom)<=hi&&
      (x.appliesTo==null?Infinity:x.appliesTo)>=lo);
    if(clash)return fail(e,'The range overlaps row "'+clash.name+'". Separate the bounds: on an overlap the work stays without a rate.');
  }
  const at=rows.findIndex(x=>x.id===next.id);
  if(!Array.isArray(DB.serviceRate))DB.serviceRate=[];
  if(at<0)DB.serviceRate.push(next);else DB.serviceRate[at]=next;
  mdCatEdit=null;mdCatDraft=null;normalizeMasterData();touch();render();
  return;
 }
 const code=mdVal('md_catCode');
 const id=mdCatEdit==='new'?mdCatIdFrom(def.prefix,code,name,rows):mdCatDraft.id;
 const active=mdVal('md_catActive')!=='0';
 let next;
 if(colour){
  next={id:id,name:name,code:code,family:mdVal('md_catFamily'),productId:mdVal('md_catProduct'),active:active};
 }else{
  const typed=mdVal('md_catPrice'),price=typed===''?null:+typed;
  if(price!=null&&(!isFinite(price)||price<0))return fail(e,'Price must be a non-negative number or empty');
  /* Правка сохраняет поля, которых нет на форме: наличие, срок поставки,
     толщина. Иначе редактирование имени стирало бы их молча. */
  const prev=mdCatEdit==='new'?{}:mdCatDraft;
  const ownLineEl=document.getElementById('md_catOwnLine'),subcatEl=document.getElementById('md_catSubcategory');
  next=Object.assign({},prev,{id:id,name:name,code:code,supplier:mdVal('md_catSupplier'),salePrice:price,
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
