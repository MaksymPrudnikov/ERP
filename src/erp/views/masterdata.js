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
 {k:'overview', label:'Обзор базы'}
];
/* Каталог длиннее любого экрана: показываем страницу и честно говорим, сколько
   осталось за краем. Молчаливая обрезка списка читается как «это всё». */
const MD_PAGE=60;

let mdTab='glass';
let mdSearch='',mdMfr='',mdThick='',mdCoating='',mdStatus='all';
let mdEdit=null,mdDraft=null;
let mdSheetEdit=null,mdSheetDraft=null;
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
   ${({glass:viewMdGlass,supply:viewMdSupply,overview:viewMdOverview})[mdTab]()}
  </div>
  ${mdTab==='overview'?'':mdImportCard()}`;
}
function mdSetTab(k){mdTab=k;mdEdit=null;mdSheetEdit=null;mdImportReport=null;render();}
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
  <div class="customer-table-wrap"><table><thead><tr><th>Код</th><th>Название</th><th>Толщина</th><th>Подложка</th><th>Покрытие</th><th>Закалка</th><th>Поверхности</th><th>Склад</th><th>Поставка</th><th></th></tr></thead>
  <tbody>${shown.map(mdGlassRow).join('')||'<tr><td colspan="10" class="empty">позиции не найдены</td></tr>'}</tbody></table></div>
  ${rows.length>shown.length?`<div class="hint">Сузь поиск или фильтр, чтобы увидеть остальные позиции: <b data-raw>${rows.length-shown.length}</b></div>`:''}`;
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
  note:mdVal('md_note'),stocked:mdChecked('md_stocked'),edgeDeletion:mdChecked('md_edge'),active:mdChecked('md_active')
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
   <div><label>Цена закупки</label><input id="md_sheetPrice" type="number" step="0.01" min="0" value="${r.purchasePrice==null?'':r.purchasePrice}"><div class="hint">Это ЗАКУПКА. Цены продажи в справочнике нет вообще — она вычисляется.</div></div>
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

/* --- 3. Обзор базы ---------------------------------------------------- */

/* Инструмент пользователя сказать «этого не хватает, это лишнее»: все
   коллекции системы одним списком со счётчиками. Пустая таблица здесь — не
   ошибка, а честный ответ «сюда ещё ничего не завели». */
const MD_COLLECTIONS=[
 {key:'glassProduct',   label:'Каталог стекла',      what:'что за стекло: подложка, покрытие, толщина, закалка'},
 {key:'glassSheet',     label:'Точки поставки',      what:'где и почём: валюта, размер листа, цена, срок'},
 {key:'heatTreatment',  label:'Термообработка',      what:'annealed · heat strengthened · tempered'},
 {key:'spacerVariant',  label:'Дистанционные рамки', what:'система и размер'},
 {key:'gasProduct',     label:'Газ',                 what:'заполнение камеры'},
 {key:'sealantProduct', label:'Герметики',           what:'первичный и вторичный контур'},
 {key:'interlayerProduct',label:'Плёнки ламинации',  what:'PVB и структурные плёнки'},
 {key:'fritProduct',    label:'Силкскрин',           what:'керамика и цифровая печать'},
 {key:'spandrelProduct',label:'Спандрел',            what:'непрозрачные панели'},
 {key:'station',        label:'Станции маршрута',    what:'одиннадцать шагов маршрута'},
 {key:'operation',      label:'Операции',            what:'что именно делают и до или после печи'},
 {key:'workPosition',   label:'Рабочие места',       what:'где делают: габарит и загрузка'},
 {key:'terminal',       label:'Терминалы',           what:'экраны сканирования в цеху'},
 {key:'customer',       label:'Клиенты',             what:'контакты, адреса, условия'},
 {key:'salesOrder',     label:'Заказы',              what:'заказы с makeup и позициями'},
 {key:'shapeDef',       label:'Контуры Shape',       what:'геометрия деталей'},
 {key:'muntinDef',      label:'Схемы Muntin',        what:'раскладка баров'},
 {key:'user',           label:'Пользователи',        what:'роли и рабочие места'}
];
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

/* --- 4. Импорт -------------------------------------------------------- */

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
