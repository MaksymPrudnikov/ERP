/* =====================================================================
   erp/masterdata/glass · masterdata-1.0
   Каталог стекла, точки поставки и остальные материалы Makeup.
   IN : templates/GLASS_PRODUCTS.csv (засев — erp/masterdata/glass-catalog)
        templates/GLASS_SHEETS.csv  (импорт)
   OUT: DEFAULT.glassProduct · DEFAULT.glassSheet · DEFAULT.<материалы>
   Правило: файл не знает про цены продажи, клиентов и заказы. Только вход→выход.

   ПРОДУКТ И ПОСТАВКА — ДВЕ ТАБЛИЦЫ, А НЕ ОДНА

   Раньше `supplier`, `sheetSizes` и `leadTimeDays` висели прямо на продукте, и
   на вопрос «почём» ответа не было вовсе: валюты в модели не существовало. Но
   валюта принадлежит ТОЧКЕ ПОСТАВКИ, а не поставщику — Vitro Barrie отгружает
   в CAD, Vitro USA то же самое стекло в USD. Один продукт, две строки цены,
   две даты, два срока.

   Поэтому:
     glassProduct  ЧТО за стекло: подложка, покрытие, толщина, закалка, гейты
     glassSheet    ГДЕ и ПОЧЁМ:  точка поставки, валюта, размер листа, цена

   Ключ строки поставки — тройка «продукт · точка поставки · размер листа».
   Один поставщик держит один и тот же продукт двумя форматами листа, и это
   две разные закупки, а не переписанная строка.

   TEMPER_MODE — ЭТО ДВА ЖЁСТКИХ ГЕЙТА, А НЕ СПРАВКА

     temper_required  (`Q` у Cardinal, `VT` у Vitro) — БЕЗ ПЕЧИ НЕ ВЫПУСКАТЬ.
       Цвет приходит к финальному только после закалки; невыпеченный лист не
       сойдётся с соседним в том же фасаде.
     annealed_only    (`E`, без `VT`) — В ПЕЧЬ НЕ ПУСКАТЬ. Там гибнет товар,
       а не портится деталь.

   Обе версии лежат на складе как РАЗНЫЕ товары; в каталоге таких пар десять.
   Пустая клетка в файле означает «закаливается штатно» (подтверждено
   пользователем): печь допустима, но не обязательна, гейт не срабатывает.

   STOCKED И AVAILABILITY — РАЗНЫЕ ВОПРОСЫ

     stocked       на ПРОДУКТЕ: держим ли мы это у себя на складе
     availability  на СТРОКЕ ПОСТАВКИ: через какую точку и за сколько дней

   Позиция без `stocked` из выбора НЕ выпадает — она помечается «по
   предзаказу». Из выбора выпадает только снятая с производства (`active`).

   ДОСТУПНОСТИ НА ПРОДУКТЕ БОЛЬШЕ НЕТ. Старое поле `availability:'inactive'`
   означало ровно «снято с производства» и переезжает в `active:false` — иначе
   рядом оказались бы два поля об одном и том же («stock» и «stocked»), и
   однажды они разошлись бы.
   ===================================================================== */

const MATERIAL_AVAILABILITY=['stock','order','special','inactive'];
const GLASS_SUBSTRATES=['clear','low_iron','tinted','patterned','wired'];
/* Базовая кромка стекла. Правило владельца 31 августа 2026: Rough Arris до
   8 mm, Flat Polish от 10 mm. CNC базовой кромкой не бывает — это исключение и
   задаётся на форме. Пустое значение = авто по толщине; на продукте оно
   переопределяется руками: зеркалам 5/6 mm ставят полировку, потому что
   клиенты чаще заказывают именно её. */
const GLASS_BASE_EDGEWORK=['','arris','polish'];
function glassAutoBaseEdgework(mm){const v=+mm;return Number.isFinite(v)&&v>=10?'polish':'arris';}
function glassBaseEdgework(product){
 if(!product)return '';
 const set=GLASS_BASE_EDGEWORK.includes(product.baseEdgework)?product.baseEdgework:'';
 return set||glassAutoBaseEdgework(product.thicknessMm);
}
function glassBaseEdgeworkLabel(kind){return kind==='polish'?'Flat Polish':kind==='arris'?'Rough Arris':'—';}
function glassBaseEdgeworkOp(kind){return kind==='polish'?{type:'Flat Polish'}:kind==='arris'?{type:'Rough Arris'}:null;}
const GLASS_COATING_FAMILIES=['uncoated','lowe','reflective'];
const GLASS_TEMPER_MODES=['temperable','temper_required','annealed_only','unknown'];
/* exposure_rule определяется СПОСОБОМ НАНЕСЕНИЯ, а не эмиссивностью:
   пиролитика стойкая (`any`), напыление мягкое и живёт только внутри пакета
   (`cavity_only`). */
const GLASS_EXPOSURE_RULES=['any','cavity_only','exterior_only','interior_only'];
const GLASS_DEPOSITIONS=['pyrolytic','sputtered'];
/* Толщины каталога — предел пользователя, а не мира. Строка вне диапазона
   отклоняется с названным диапазоном в причине: расширять — здесь. */
const GLASS_MIN_MM=3, GLASS_MAX_MM=19;
/* Плюс в коде законен: `3Q340+` — фирменное обозначение Cardinal (LoE 340+).
   А вот `3E+272` фирменным НЕ был: так Excel записал 3E272, приняв код за
   научную нотацию, и порча уехала в каталог вместе с импортом. Исправлено
   4 сентября 2026; регулярка плюс по-прежнему пропускает — он нужен 340+. */
const GLASS_CODE_RE=/^[A-Za-z0-9][A-Za-z0-9+._/-]{0,39}$/;
/* Валюта точки поставки. Список не закрываем: пользователь пересчитывает
   прайсы вручную и вносит по канадским меркам, но чужая строка с USD обязана
   заезжать без правки кода. Проверяем формат — три буквы. */
const CURRENCY_RE=/^[A-Za-z]{3}$/;
const GLASS_DEFAULT_CURRENCY='CAD';
/* Единица закупки стекла по умолчанию — квадратный фут; всё, что покупается
   иначе, выбирается из MD_UNITS (см. erp/masterdata/units). */
const GLASS_DEFAULT_UNIT='sqft';

function mdString(v){return String(v==null?'':v).trim();}
function mdNum(v){if(v==null||v==='')return null;const n=+v;return Number.isFinite(n)?n:null;}
function mdNonNeg(v){const n=mdNum(v);return n!=null&&n>=0?n:null;}
function mdInt(v){const n=mdNum(v);return n!=null&&Number.isInteger(n)&&n>=0?n:null;}
function mdAvailability(v){return MATERIAL_AVAILABILITY.includes(v)?v:'order';}
/* Дата цены — только ISO. Прайс без даты бесполезен не тем, что он пуст, а
   тем, что неизвестно, насколько он устарел; поэтому мусор становится пустотой,
   а не сегодняшним числом. */
const ISO_DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
function mdDate(v){const s=mdString(v);return ISO_DATE_RE.test(s)?s:'';}

/* --- 1. Продукт ------------------------------------------------------ */

/* Оптика IGDB. Она здесь не для показа: из неё считаются U-value и SHGC на
   более позднем этапе, и потерять её при первой же правке каталога нельзя.
   Мусор в клетке превращается в пустоту, а не роняет строку — это справочные
   числа, а не идентичность продукта. */
const GLASS_OPTICS_KEYS=['tvis','tsol','rvis1','rvis2','rsol1','rsol2','emis1','emis2','conductivity'];
function normalizeGlassOptics(o){
 o=o&&typeof o==='object'?o:{};
 const out={};
 GLASS_OPTICS_KEYS.forEach(k=>{out[k]=mdNum(o[k]);});
 out.coatedSide=[1,2].includes(+o.coatedSide)?+o.coatedSide:null;
 return out;
}
/* Происхождение строки: какой файл IGDB и какая запись в нём. Нужно, чтобы
   пересборка каталога могла сойтись с прошлой, а спорное число — с источником. */
function normalizeGlassOrigin(o){
 o=o&&typeof o==='object'?o:{};
 return {igdbId:mdString(o.igdbId),igdbName:mdString(o.igdbName),igdbSource:mdString(o.igdbSource)};
}
/* Номера поверхностей: 1–8 (четырёхкамерных пакетов не бывает). Пусто = любая. */
function normalizeSurfaceList(v){
 const seen=Object.create(null),out=[];
 (Array.isArray(v)?v:[]).forEach(x=>{
  const n=+x;
  if(Number.isInteger(n)&&n>=1&&n<=8&&!seen[n]){seen[n]=true;out.push(n);}
 });
 return out.sort((a,b)=>a-b);
}
/* ---- Прайс продажи -----------------------------------------------------
   Лист владельца от 4 сентября 2026: у позиции ДВЕ цены за sq ft — без
   закалки и с закалкой, и Heat Treatment в конструкторе выбирает нужную.
   Пустое значение значит «в прайсе цены нет»: у восьми позиций листа её нет
   вовсе, и показывать вместо неё ноль было бы враньём.

   Ключ — код продукта. Коды 3E272 · 4E272 · 6E272 Excel записывает научной
   нотацией (3.0000000000000002E+272), и раньше порча уехала в каталог. И там,
   и здесь коды приведены к настоящему виду. */
const GLASS_SALE_PRICES={
 '6LAM015':[8.65,null],
 '4Q180ESC':[null,7.45],
 '6Q270':[null,8.65],
 '4Q272':[null,7.45],
 '6Q272':[null,8.65],
 '4Q366':[null,7.85],
 '6Q366':[null,9.2],
 '6E180ESC':[6.25,null],
 '3E272':[5,null],
 '4E272':[5.45,null],
 '4E366':[5.85,null],
 '6E272':[6.25,null],
 '6E366':[6.65,null],
 '6SOLARE':[8.27,11.9],
 '6SUPERGREY':[9.25,10.85],
 '10CLEAR':[7.35,9.05],
 '12CLEAR':[8.3,10.8],
 '16CLEAR':[24.25,34.5],
 '19CLEAR':[32.1,41.8],
 '3CLEAR':[3.7,null],
 '4CLEAR':[4.2,5.2],
 '5CLEAR':[4.7,5.6],
 '6CLEAR':[4.85,5.85],
 '8CLEAR':[7.3,8.8],
 '4SBN60':[6,null],
 '4SBN60VT':[null,7.85],
 '5SBN60VT':[null,7.65],
 '6SBN60':[7.36,null],
 '6SBN60VT':[null,8.65],
 '6SOLARBLUE':[10.75,12.75],
 '10SOLARBRONZE':[23.5,25.5],
 '12SOLARBRONZE':[28.8,31.8],
 '6SOLARBRONZE':[6.85,7.85],
 '6SOLARCOOL-SBZ':[8.4,10.95],
 '6SOLARCOOL-SGY':[8.4,10.95],
 '10SOLARGRAY':[22.5,24.5],
 '12SOLARGRAY':[28.8,31.8],
 '6SOLARGRAY':[6.85,7.85],
 '6SOLEXIA':[7.13,8.45],
 '10STARPHIRE':[14.65,16.65],
 '12STARPHIRE':[18.9,21.8],
 '16STARPHIRE':[52.9,58.75],
 '19STARPHIRE':[41.7,72.45],
 '6STARPHIRE':[9.65,10.65],
 '8STARPHIRE':[7.43,12.2]
};
/* Цены проставляются продукту, если он их ещё не имеет: заведённая руками
   цена всегда старше заводской и переписываться не должна. */
function glassApplySalePrices(){
 (DB.glassProduct||[]).forEach(function(p){
  const row=GLASS_SALE_PRICES[p.code];
  if(!row)return;
  if(p.salePriceAnnealed==null)p.salePriceAnnealed=row[0];
  if(p.salePriceTempered==null)p.salePriceTempered=row[1];
 });
}
function normalizeGlassProduct(p){
 p=p&&typeof p==='object'?p:{};
 /* `family` — имя поля прежней схемы; читаем, чтобы сохранённый браузер не
    потерял покрытие ещё до пересева. */
 const fam=GLASS_COATING_FAMILIES.includes(p.coatingFamily)?p.coatingFamily
  :(GLASS_COATING_FAMILIES.includes(p.family)?p.family:'uncoated');
 return {
  id:mdString(p.id),code:mdString(p.code),manufacturer:mdString(p.manufacturer),name:mdString(p.name),
  substrate:GLASS_SUBSTRATES.includes(p.substrate)?p.substrate:'clear',
  coatingFamily:fam,
  thicknessMm:mdNum(p.thicknessMm),actualThicknessMm:mdNum(p.actualThicknessMm),
  temperMode:GLASS_TEMPER_MODES.includes(p.temperMode)?p.temperMode:'temperable',
  exposureRule:GLASS_EXPOSURE_RULES.includes(p.exposureRule)?p.exposureRule:'any',
  allowedSurfaces:normalizeSurfaceList(p.allowedSurfaces),
  edgeDeletion:p.edgeDeletion===true,
  baseEdgework:GLASS_BASE_EDGEWORK.includes(p.baseEdgework)?p.baseEdgework:'',
  deposition:GLASS_DEPOSITIONS.includes(p.deposition)?p.deposition:'',
  stocked:p.stocked===true,
  legacyCode:mdString(p.legacyCode),note:mdString(p.note),
  salePriceAnnealed:mdNonNeg(p.salePriceAnnealed),
  salePriceTempered:mdNonNeg(p.salePriceTempered),
  stockingUnit:mdUnitCode(p.stockingUnit,GLASS_DEFAULT_UNIT),
  salesUnit:mdUnitCode(p.salesUnit,GLASS_DEFAULT_UNIT),
  optics:normalizeGlassOptics(p.optics),
  origin:normalizeGlassOrigin(p.origin),
  /* миграция прежней схемы: снятое с производства было availability='inactive' */
  active:p.active!==false&&p.availability!=='inactive'
 };
}
/* Идентификатор переживает переименование кода, и это не украшение: пользователь
   переписывает `6BIRDSMART…` в свои цеховые коды, а сохранённые Makeup ссылаются
   на стекло по id. Совпадает с tools/catalog-to-js.py — иначе пересобранный
   каталог приехал бы новыми записями вместо обновления старых. */
function glassProductId(code){return 'GL-'+mdString(code).toUpperCase().replace(/[^A-Za-z0-9_-]/g,'-');}

/* --- 2. Строка поставки ---------------------------------------------- */

/* Ключ — тройка «продукт · точка поставки · размер листа». Размер входит в
   ключ намеренно: тот же лист по новой цене обновляет строку, другой формат
   листа добавляет свою. */
function glassSheetKey(code,supplier,wIn,hIn){
 return [mdString(code).toUpperCase(),mdString(supplier).toLowerCase(),wIn==null?'':wIn,hIn==null?'':hIn].join('|');
}
function glassSheetId(code,supplier,wIn,hIn){
 const slug=s=>mdString(s).toUpperCase().replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'');
 return ['GS',slug(code),slug(supplier),(wIn==null?'':wIn)+'x'+(hIn==null?'':hIn)].join('-');
}
function normalizeGlassSheet(s){
 s=s&&typeof s==='object'?s:{};
 const code=mdString(s.productCode||s.code),supplier=mdString(s.supplier);
 const wIn=mdNonNeg(s.sheetWIn),hIn=mdNonNeg(s.sheetHIn);
 const cur=mdString(s.currency).toUpperCase();
 return {
  id:mdString(s.id)||glassSheetId(code,supplier,wIn,hIn),
  productCode:code,supplier,
  currency:CURRENCY_RE.test(cur)?cur:GLASS_DEFAULT_CURRENCY,
  sheetWIn:wIn,sheetHIn:hIn,
  purchaseUnit:mdUnitCode(s.purchaseUnit,GLASS_DEFAULT_UNIT),
  purchasePrice:mdNonNeg(s.purchasePrice),
  priceDate:mdDate(s.priceDate),
  freightPct:mdNonNeg(s.freightPct),
  leadTimeDays:mdInt(s.leadTimeDays),
  availability:mdAvailability(s.availability),
  note:mdString(s.note)
 };
}

/* --- 3. Разбор CSV каталога ------------------------------------------ */

/* Один разбор на засев и на импорт. Вторая схема разбора однажды разойдётся с
   первой, и заводские данные начнут отличаться от загруженных тем же файлом. */
const GLASS_TEMPER_CSV={
 '':'temperable',
 'TEMPERED':'temper_required',
 'NO TEMPERABLE':'annealed_only',
 'NOT TEMPERABLE':'annealed_only',
 'TEMPER REQUIRED':'temper_required',
 'TEMPERABLE':'temperable',
 'ANNEALED ONLY':'annealed_only',
 'UNKNOWN':'unknown'
};
const GLASS_YES=['yes','y','true','1','да','+','x'];
const GLASS_NO=['','no','n','false','0','нет','-'];
/* undefined — «не разобрали», это отказ строки; пустая клетка означает «нет». */
function glassBoolCell(v){
 const s=mdString(v).toLowerCase();
 if(GLASS_YES.includes(s))return true;
 if(GLASS_NO.includes(s))return false;
 return undefined;
}
function glassSurfacesCell(v){
 const s=mdString(v);
 if(!s)return [];
 const parts=s.split(/[,;\s]+/).filter(Boolean),out=[];
 for(let i=0;i<parts.length;i++){
  const n=+parts[i];
  if(!Number.isInteger(n)||n<1||n>8)return null;
  out.push(n);
 }
 return normalizeSurfaceList(out);
}

/* Разбор файла каталога. Возвращает отчёт и список принятых строк; каждая
   строка несёт ТОЛЬКО те поля, колонки которых в файле есть.

   Это не мелочь: файл возвращается из Excel то с потерянными колонками, то с
   `LoE` в каждой пустой клетке. Обновлять запись целиком таким файлом значит
   стереть оптику и примечания всего каталога одной загрузкой. Чего в шапке
   нет — того импорт не трогает. */
function glassParseProductsCsv(text){
 const parsed=parseCsv(text),header=parsed.header,rep=sfReport(),out=[];
 if(!header.includes('code')||!header.includes('name')){
  sfReject(rep,0,'','файл не похож на GLASS_PRODUCTS.csv: нет колонок code и name');
  return {rep,out};
 }
 const has=c=>header.includes(c);
 const seen=Object.create(null);
 parsed.rows.forEach((r,n)=>{
  const line=n+2,code=mdString(r.code);
  if(!code)return sfReject(rep,line,'','пустой код');
  if(!GLASS_CODE_RE.test(code))return sfReject(rep,line,code,'код: только буквы, цифры и + . _ - /');
  if(seen[code.toUpperCase()])return sfReject(rep,line,code,'код повторяется в файле');
  const name=mdString(r.name);
  if(!name)return sfReject(rep,line,code,'пустое название');
  const f={code,name};

  if(has('manufacturer'))f.manufacturer=mdString(r.manufacturer);
  if(has('substrate')){
   const v=mdString(r.substrate).toLowerCase();
   if(!GLASS_SUBSTRATES.includes(v))return sfReject(rep,line,code,'substrate: ожидается '+GLASS_SUBSTRATES.join(' · '));
   f.substrate=v;
  }
  if(has('coating_family')){
   const v=mdString(r.coating_family).toLowerCase();
   if(!GLASS_COATING_FAMILIES.includes(v))return sfReject(rep,line,code,'coating_family: ожидается '+GLASS_COATING_FAMILIES.join(' · '));
   f.coatingFamily=v;
  }
  if(has('thickness_mm')){
   const t=mdNum(r.thickness_mm);
   if(t==null)return sfReject(rep,line,code,'thickness_mm: не число');
   if(t<GLASS_MIN_MM||t>GLASS_MAX_MM)return sfReject(rep,line,code,'толщина вне диапазона '+GLASS_MIN_MM+'–'+GLASS_MAX_MM+' мм');
   f.thicknessMm=t;
  }
  if(has('actual_thickness_mm'))f.actualThicknessMm=mdNum(r.actual_thickness_mm);
  if(has('temper_mode')){
   const key=mdString(r.temper_mode).toUpperCase();
   const v=GLASS_TEMPER_CSV[key];
   if(!v)return sfReject(rep,line,code,'temper_mode: ожидается пусто · TEMPERED · NO TEMPERABLE');
   f.temperMode=v;
  }
  if(has('exposure_rule')){
   const v=mdString(r.exposure_rule).toLowerCase()||'any';
   if(!GLASS_EXPOSURE_RULES.includes(v))return sfReject(rep,line,code,'exposure_rule: ожидается '+GLASS_EXPOSURE_RULES.join(' · '));
   f.exposureRule=v;
  }
  if(has('allowed_surfaces')){
   const v=glassSurfacesCell(r.allowed_surfaces);
   if(v===null)return sfReject(rep,line,code,'allowed_surfaces: номера поверхностей 1–8 через запятую');
   f.allowedSurfaces=v;
  }
  if(has('edge_deletion')){
   const v=glassBoolCell(r.edge_deletion);
   if(v===undefined)return sfReject(rep,line,code,'edge_deletion: ожидается YES или пусто');
   f.edgeDeletion=v;
  }
  if(has('deposition')){
   const v=mdString(r.deposition).toLowerCase();
   if(v&&!GLASS_DEPOSITIONS.includes(v))return sfReject(rep,line,code,'deposition: ожидается пусто · '+GLASS_DEPOSITIONS.join(' · '));
   f.deposition=v;
  }
  if(has('stocked')){
   const v=glassBoolCell(r.stocked);
   if(v===undefined)return sfReject(rep,line,code,'stocked: ожидается YES или пусто');
   f.stocked=v;
  }
  if(has('legacy_code'))f.legacyCode=mdString(r.legacy_code);
  if(has('notes'))f.note=mdString(r.notes);
  if(has('stocking_unit'))f.stockingUnit=mdUnitCode(r.stocking_unit,GLASS_DEFAULT_UNIT);
  if(has('sales_unit'))f.salesUnit=mdUnitCode(r.sales_unit,GLASS_DEFAULT_UNIT);

  const optics={};let anyOptics=false;
  GLASS_OPTICS_KEYS.forEach(k=>{if(has(k)){optics[k]=mdNum(r[k]);anyOptics=true;}});
  if(has('coated_side')){optics.coatedSide=mdNum(r.coated_side);anyOptics=true;}
  if(anyOptics)f.optics=optics;
  if(has('igdb_id')||has('igdb_name')||has('igdb_source'))
   f.origin={igdbId:mdString(r.igdb_id),igdbName:mdString(r.igdb_name),igdbSource:mdString(r.igdb_source)};

  seen[code.toUpperCase()]=true;
  rep.accepted++;
  out.push({line,code,fields:f});
 });
 return {rep,out};
}

/* --- 4. Заводской каталог -------------------------------------------- */

/* 511 позиций приезжают из того же файла, который лежит в templates/ — см.
   erp/masterdata/glass-catalog. Отклонённая строка засева означает, что
   каталог пересобрали сломанным, и молчать об этом нельзя. */
function glassSeedProducts(){
 const parsed=glassParseProductsCsv(typeof GLASS_PRODUCTS_CSV==='string'?GLASS_PRODUCTS_CSV:'');
 if(parsed.rep.rejected.length)
  console.warn('glass catalog seed: '+parsed.rep.rejected.length+' row(s) rejected — '+
   parsed.rep.rejected.map(x=>x.line+' '+x.code+': '+x.why).join('; '));
 return parsed.out.map(x=>normalizeGlassProduct(Object.assign({id:glassProductId(x.code)},x.fields)));
}
DEFAULT.glassProduct=glassSeedProducts();
/* Строки поставки заводскими НЕ бывают: точки поставки, размеры листа, цены и
   сроки пользователем ещё не подтверждены, а выдуманная цена в прайсе хуже
   отсутствующей. Таблица стартует пустой и заполняется экраном или CSV.

   И по той же причине её НЕТ в REFERENCE_TABLES (см. erp/data): пересев
   заменяет справочник заводским, то есть стёр бы все введённые цены. */
DEFAULT.glassSheet=[];

function normalizeSimpleMaterial(p,type){p=p&&typeof p==='object'?p:{};return {id:mdString(p.id),type,name:mdString(p.name),code:mdString(p.code),thicknessMm:mdNum(p.thicknessMm),salePrice:mdNonNeg(p.salePrice),availability:mdAvailability(p.availability),supplier:mdString(p.supplier),leadTimeDays:mdNum(p.leadTimeDays),active:p.active!==false};}

DEFAULT.heatTreatment=[
 {id:'HT-AN',name:'Annealed',code:'AN'},{id:'HT-HS',name:'Heat Strengthened',code:'HS'},{id:'HT-FT',name:'Tempered',code:'FT'}
].map(x=>normalizeSimpleMaterial(x,'heatTreatment'));
/* Дистанционная рамка отвечает на ТРИ разных вопроса, и ответы у неё расходятся:

     семейство   определяет ЦЕНУ           Aluminum · Warm Edge · Stainless
     номинал     определяет ВЫБОР          дробь, по ней рамку и называют
     факт, мм    определяет РАСЧЁТ пакета  7/16 у Aluminum 11.1, у Black Warm Edge 11.5

   Держать одно число на все три значит однажды собрать пакет не той толщины.

   thicknessMm заводскими данными НЕ заполняется намеренно. Пустое поле честно
   говорит «фактическая толщина не подтверждена», и расчёт показывает номинал
   с пометкой. Заполненное значение введено руками и переживает пересев
   справочников — см. reseedReferenceTables в erp/data. */
const SPACER_SYSTEMS=[
 {code:'AL',  family:'aluminum',  system:'Aluminum'},
 {code:'BL',  family:'aluminum',  system:'Black Aluminum'},
 {code:'WWE', family:'warm_edge', system:'White Warm Edge'},
 {code:'LGWE',family:'warm_edge', system:'Light Grey Warm Edge'},
 {code:'BWE', family:'warm_edge', system:'Black Warm Edge'},
 {code:'SS',  family:'stainless', system:'Stainless Steel'},
 {code:'BSS', family:'stainless', system:'Black Stainless Steel'}
];
const SPACER_FAMILIES=['aluminum','warm_edge','stainless'];
const SPACER_FAMILY_LABELS={aluminum:'Aluminum',warm_edge:'Warm Edge',stainless:'Stainless Steel'};
/* Наличие по типам: таблица склада, сентябрь 2026. У Aluminum весь ряд,
   у Stainless три позиции — размеры семейств не совпадают. */
const SPACER_STOCK={
 AL:  ['3/16','7/32','1/4','5/16','3/8','13/32','7/16','15/32','1/2','17/32','9/16','5/8','11/16','3/4','27/32','15/16'],
 BL:  ['3/16','3/8','7/16','1/2','17/32','9/16','5/8','11/16'],
 WWE: ['3/8','1/2','17/32','5/8','11/16'],
 LGWE:['5/16','3/8','1/2','17/32','11/16'],
 BWE: ['5/16','3/8','7/16','1/2','17/32','9/16','5/8','11/16','27/32'],
 SS:  ['7/16','1/2','5/8'],
 BSS: ['17/32','5/8','27/32']
};
/* Дробь разбирается здесь своими силами, а не через fabParseDim: справочнику
   нужна ровно одна форма записи, зависимость от модуля размеров ему ни к чему. */
function spacerSizeParts(size){
 const p=String(size==null?'':size).trim().split('/');
 if(p.length!==2)return null;
 const a=+p[0],b=+p[1];
 if(!isFinite(a)||!isFinite(b)||b<=0||a<0)return null;
 return {num:p[0].trim(),den:p[1].trim(),value:a/b};
}
function spacerNominalMm(size){const q=spacerSizeParts(size);return q?Math.round(q.value*25.4*10)/10:null;}
function spacerSizeKey(size){const q=spacerSizeParts(size);return q?(q.num+q.den).padStart(3,'0'):'';}
/* Толщина для расчёта: фактическая, если она введена, иначе номинал из дроби.
   Фактическую вводят руками по мере получения данных от поставщика — до тех
   пор пакет считается по номиналу. */
function spacerThicknessMm(sp){
 if(!sp)return null;
 const actual=mdNum(sp.thicknessMm);
 return actual!=null&&actual>0?actual:spacerNominalMm(sp.size);
}
/* Семейство у старых записей не хранилось — выводим его из кода id, а если и он
   чужой, то из названия системы. Цена висит на семействе, пустым оно быть не может. */
function spacerFamilyOf(sp){
 const f=mdString(sp&&sp.family);
 if(SPACER_FAMILIES.indexOf(f)>=0)return f;
 const parts=String((sp&&sp.id)||'').split('-');
 const known=parts.length>2&&parts[0]==='SP'?SPACER_SYSTEMS.find(x=>x.code===parts[1].toUpperCase()):null;
 if(known)return known.family;
 const sys=String((sp&&sp.system)||'').toLowerCase();
 if(sys.indexOf('stainless')>=0)return 'stainless';
 if(sys.indexOf('warm')>=0)return 'warm_edge';
 return 'aluminum';
}
DEFAULT.spacerVariant=SPACER_SYSTEMS.reduce(function(out,s){
 return out.concat((SPACER_STOCK[s.code]||[]).map(function(size){
  const id='SP-'+s.code+'-'+spacerSizeKey(size);
  return {id:id,family:s.family,system:s.system,size:size,thicknessMm:null,name:s.system+' '+size+'″',code:id,availability:'stock',supplier:'',leadTimeDays:null,active:true};
 }));
},[]);
DEFAULT.gasProduct=[{id:'GAS-AIR',name:'Air',code:'AIR'},{id:'GAS-ARGON',name:'Argon',code:'ARG'}].map(x=>normalizeSimpleMaterial(x,'gas'));
/* Полисульфид — базовый вторичный герметик прайса, силикон дороже и идёт
   опцией. Без него самый ходовой вариант в систему не заносился вообще. */
DEFAULT.sealantProduct=[{id:'SEAL-PIB',name:'PIB',code:'PIB'},{id:'SEAL-PS',name:'Polysulphide',code:'PS'},{id:'SEAL-SIL',name:'Silicone',code:'SIL'},{id:'SEAL-HM',name:'Hot Melt',code:'HM'}].map(x=>normalizeSimpleMaterial(x,'sealant'));
/* Interlayer Product answers only WHAT film is used. Thickness is not part of
   the product: the Laminated builder stores the independently selected number
   of 0.38 mm layers. Old ids encoded .030 / .060 / .035 in the product itself;
   keep an explicit migration map so saved orders retain their physical stack. */
const INTERLAYER_PRODUCT_ALIASES={
 'INT-PVB':{id:'INT-EVA-CL',layers:2},
 'INT-SGP':{id:'INT-SGP-CL',layers:2},
 'INT-PVB030':{id:'INT-EVA-CL',layers:2},
 'INT-PVB060':{id:'INT-EVA-CL',layers:4},
 'INT-SGP035':{id:'INT-SGP-CL',layers:2}
};
function interlayerProductMigration(id){return INTERLAYER_PRODUCT_ALIASES[mdString(id)]||null;}
function interlayerCanonicalProductId(id){const old=interlayerProductMigration(id);return old?old.id:mdString(id);}
/* Плёнка выбирается в два шага, как её и заказывают: сначала СЕМЕЙСТВО
   (EVA или SGP), потом исполнение внутри него. Цена задана за один слой
   0.38 мм и правится в справочнике.

   PVB из базы убран намеренно: цеха он больше не касается, цены в прайсе у него
   нет, и оставлять его значением по умолчанию значило бы отдавать ламинат
   без цены. Сохранённые позиции со старым PVB переезжают на EVA Clear
   через INTERLAYER_PRODUCT_ALIASES. */
const INTERLAYER_FAMILIES=[
 {id:'eva',label:'EVA'},
 {id:'sgp',label:'SGP'}
];
DEFAULT.interlayerProduct=[
 {id:'INT-EVA-CL',family:'eva',name:'EVA Clear',code:'EVA-CL',thicknessMm:null,salePrice:3.00},
 {id:'INT-EVA-UC',family:'eva',name:'EVA Ultra Clear',code:'EVA-UC',thicknessMm:null,salePrice:3.00},
 {id:'INT-EVA-FW',family:'eva',name:'EVA Frosted White',code:'EVA-FW',thicknessMm:null,salePrice:3.00},
 {id:'INT-EVA-MW',family:'eva',name:'EVA Milky Way',code:'EVA-MW',thicknessMm:null,salePrice:3.00},
 {id:'INT-SGP-CL',family:'sgp',name:'SGP Clear',code:'SGP-CL',thicknessMm:null,salePrice:5.00},
 {id:'INT-SGP-UC',family:'sgp',name:'SGP Ultra Clear',code:'SGP-UC',thicknessMm:null,salePrice:5.00},
 {id:'INT-SGP-FR',family:'sgp',name:'SGP Frosted',code:'SGP-FR',thicknessMm:null,salePrice:5.00}
].map(x=>Object.assign(normalizeSimpleMaterial(x,'interlayer'),{family:mdString(x.family)}));
const INTERLAYER_DEFAULT_ID='INT-EVA-CL';
function interlayerFamilyOf(id){
 const p=mdById('interlayerProduct',id);
 const f=mdString(p&&p.family);
 if(f)return f;
 return String(id||'').indexOf('SGP')>=0?'sgp':'eva';
}
DEFAULT.fritProduct=[
 {id:'FRIT-CERAMIC',name:'Ceramic Frit',code:'FRIT-CER',salePrice:3.10},{id:'FRIT-DIGITAL',name:'Digital Ceramic Print',code:'FRIT-DIG',salePrice:3.10}
].map(x=>normalizeSimpleMaterial(x,'frit'));
DEFAULT.spandrelProduct=[
 {id:'SPAN-CERAMIC',name:'Ceramic Spandrel',code:'SPAN-CER',salePrice:5.00},{id:'SPAN-SILICONE',name:'Silicone Spandrel',code:'SPAN-SIL',salePrice:5.00}
].map(x=>normalizeSimpleMaterial(x,'spandrel'));

/* Frit = силкскрин, и ассортимент цеха узкий (хендофф, раздел 9л; спецификация
   снята со скриншотов рабочего интерфейса). Здесь стояли выдуманные 'Black',
   'Gray', 'Bronze', 'Full coverage', 'Lines' — цех такого не делает, а новый
   лист получал их по умолчанию. Узоров ровно три плюс отсылка к бумажному
   листу спецификации; цвета два. Позиции прайса CERM FRIT - FULL / PATTERN /
   GRADIENT подтверждены пользователем как мёртвые. */
const FRIT_COLORS=['White','Acid Etched'];
const FRIT_PATTERNS=['2 x 2 square','4 x 4 square','2 x 4 diamond','Custom — see silk screen sheet'];
/* Узор кладётся ОТ конкретного угла детали, и этот угол маркируется в цеху:
   иначе трафарет ляжет зеркально. Это производственный параметр, а не
   оформление. На рабочих листах стоит Top right. */
const FRIT_MARGIN_CORNERS=['Top left','Top right','Bottom left','Bottom right'];
const FRIT_DEFAULT_CORNER='Top right';
const FRIT_DEFAULT_DOT_MM=5;
/* 1″ в канонических 1/16″. Это ПРЕДЗАПОЛНЕНИЕ, а не правило: пользователь
   подтвердил, что отступ 0 законен, поэтому минимум не проверяем. */
const FRIT_DEFAULT_MARGIN16=16;
const SPANDREL_COLORS=['Black','White','Gray','Bronze','Custom'];

/* --- 5. Нормализация -------------------------------------------------- */

function normalizeMasterData(){
 if(!Array.isArray(DB.glassProduct))DB.glassProduct=JSON.parse(JSON.stringify(DEFAULT.glassProduct));
 const gSeen=Object.create(null);
 DB.glassProduct=DB.glassProduct.filter(x=>x&&typeof x==='object').map(normalizeGlassProduct)
  .map(p=>{if(!p.id&&p.code)p.id=glassProductId(p.code);return p;})
  .filter(p=>p.id&&p.name&&!gSeen[p.id]&&(gSeen[p.id]=true));
 glassApplySalePrices();

 /* Строка поставки на продукт, которого в каталоге нет, НЕ выбрасывается.
    Пользователь переименовывает коды каталога под цех, и выброшенная строка
    унесла бы с собой цену и срок — молча. Осиротевшая строка остаётся видимой
    на экране Master Data и чинится там же. */
 if(!Array.isArray(DB.glassSheet))DB.glassSheet=[];
 const sSeen=Object.create(null);
 DB.glassSheet=DB.glassSheet.filter(x=>x&&typeof x==='object').map(normalizeGlassSheet)
  .filter(s=>s.productCode&&s.supplier&&!sSeen[s.id]&&(sSeen[s.id]=true));

 /* каталог пересобран — индекс базовых стёкол больше не действителен */
 glassInvalidateNameIndex();

 [['heatTreatment','heatTreatment'],['gasProduct','gas'],['sealantProduct','sealant'],['interlayerProduct','interlayer'],['fritProduct','frit'],['spandrelProduct','spandrel']].forEach(pair=>{
  const k=pair[0],type=pair[1];if(!Array.isArray(DB[k]))DB[k]=JSON.parse(JSON.stringify(DEFAULT[k]));
  /* Migrate only the old built-in thickness-as-product rows. Custom film
     products remain untouched, while canonical built-ins are added if absent. */
  if(k==='interlayerProduct'){
   DB[k]=DB[k].filter(x=>!x||!interlayerProductMigration(x.id));
   DEFAULT[k].forEach(seed=>{if(!DB[k].some(x=>x&&x.id===seed.id))DB[k].push(JSON.parse(JSON.stringify(seed)));});
  }
  DB[k]=DB[k].filter(x=>x&&typeof x==='object').map(x=>normalizeSimpleMaterial(x,type)).filter(x=>x.id&&x.name);
 });
 if(!Array.isArray(DB.spacerVariant))DB.spacerVariant=JSON.parse(JSON.stringify(DEFAULT.spacerVariant));
 DB.spacerVariant=DB.spacerVariant.filter(x=>x&&typeof x==='object').map(x=>({id:mdString(x.id),family:spacerFamilyOf(x),system:mdString(x.system),size:mdString(x.size),thicknessMm:mdNum(x.thicknessMm),name:mdString(x.name)||[mdString(x.system),mdString(x.size)].filter(Boolean).join(' '),code:mdString(x.code),availability:mdAvailability(x.availability),supplier:mdString(x.supplier),leadTimeDays:mdNum(x.leadTimeDays),active:x.active!==false})).filter(x=>x.id&&x.system&&x.size);
}

/* --- 6. Выборки ------------------------------------------------------- */

function mdById(key,id){return (DB[key]||[]).find(x=>x.id===id)||null;}
function glassProductById(id){return mdById('glassProduct',id);}
function glassProductByCode(code){const c=mdString(code).toUpperCase();return (DB.glassProduct||[]).find(x=>x.code.toUpperCase()===c)||null;}
/* Из выбора выпадает только снятое с производства. Отсутствие на складе —
   не запрет, а пометка «по предзаказу»: пользователь начал разговор именно
   с того, что заказать можно и то, чего у него нет. */
function activeGlassProducts(){return (DB.glassProduct||[]).filter(x=>x.active!==false);}
function activeSimple(key){return (DB[key]||[]).filter(x=>x.active!==false&&x.availability!=='inactive');}
function glassIsPreorder(g){return !!g&&g.stocked!==true;}
/* Два жёстких гейта. Названы функциями, а не сравнением по месту, потому что
   на них будет опираться проверка маршрута (этап 7·2), а не только показ. */
function glassNeedsFurnace(g){return !!g&&g.temperMode==='temper_required';}
function glassBannedFromFurnace(g){return !!g&&g.temperMode==='annealed_only';}

function glassSheetsFor(code){const c=mdString(code).toUpperCase();return (DB.glassSheet||[]).filter(s=>s.productCode.toUpperCase()===c);}
/* Срок поставки — минимальный из живых точек: заказ уедет туда, где быстрее. */
function glassLeadTimeDays(code){
 const days=glassSheetsFor(code).filter(s=>s.availability!=='inactive'&&s.leadTimeDays!=null).map(s=>s.leadTimeDays);
 return days.length?Math.min.apply(null,days):null;
}
function glassOrphanSheets(){return (DB.glassSheet||[]).filter(s=>!glassProductByCode(s.productCode));}

/* --- 7. Покрытие и базовое стекло ------------------------------------- */

/* В каталоге одна строка на пару «покрытие × базовое стекло», и у Vitro на
   6 мм Low-E таких строк 92. Выбирать из 92 нельзя: у самого поставщика тот
   же выбор сделан ДВУМЯ шагами — сначала покрытие (Solarban 60), потом на
   каком стекле оно лежит (on Acuity, on Azuria, on Clear).

   Отдельных колонок под это в выгрузке IGDB нет — есть имя. Поэтому имя
   разбирается, и правила ровно те, по которым имена и написаны:

     Solarban 60 on Acuity 6mm     → «on»: покрытие · базовое стекло
     LoE 180 on 3mm Clear          → то же, толщина снимается заранее
     Eclipse Advantage + Grey      → «+» у Pilkington значит то же самое
     Eclipse Advantage Grey        → хвост совпал с известным базовым стеклом

   Список базовых стёкол берётся ИЗ САМОГО КАТАЛОГА: непокрытые позиции
   производителя плюс всё, что нашлось после «on» и «+» у него же. Он не
   выдуман, переживает пересборку каталога и растёт вместе с ним.

   Что не разобралось (тридцать позиций Pilkington вида «Energy Advantage OW»)
   остаётся покрытием без базы, и второй список показывает у него подложку.
   Это честно: базового стекла в имени нет, а придумывать его нельзя. */

const GLASS_THICK_RE=/\b\d+(?:[.,]\d+)?\s*mm\b/ig;
function glassCleanName(name){
 return mdString(name).replace(GLASS_THICK_RE,' ')
  .replace(/\s+glass\s*$/i,'')
  .replace(/[\s\-–—]+$/,'')
  .replace(/\s{2,}/g,' ').trim();
}
/* Делим по ПЕРВОМУ вхождению: «Solarban 70 on Optiblue (Solarban z75)» не
   должно разъезжаться на три части. */
function glassSplitAt(text,re){
 const m=text.match(re);
 if(!m||m.index<=0)return null;
 const head=text.slice(0,m.index).trim(),tail=text.slice(m.index+m[0].length).trim();
 return (head&&tail)?[head,tail]:null;
}
/* Индекс базовых стёкол по производителям. Строится лениво и сбрасывается
   нормализацией: каталог меняют импортом и экраном справочников, и
   переименованная позиция обязана перегруппироваться сразу. */
let glassBaseIndex=null;
function glassInvalidateNameIndex(){glassBaseIndex=null;}
function glassBaseNames(manufacturer){
 if(!glassBaseIndex){
  glassBaseIndex=Object.create(null);
  const add=(mfr,name)=>{
   const key=mdString(mfr).toLowerCase();
   if(!name)return;
   if(!glassBaseIndex[key])glassBaseIndex[key]=Object.create(null);
   glassBaseIndex[key][name]=true;
  };
  (DB.glassProduct||[]).forEach(p=>{
   const n=glassCleanName(p.name);
   const on=glassSplitAt(n,/\s+on\s+/i);
   if(on)return add(p.manufacturer,on[1]);
   const plus=glassSplitAt(n,/\s+\+\s+/);
   if(plus)return add(p.manufacturer,plus[1]);
   if(p.coatingFamily==='uncoated')add(p.manufacturer,n);
  });
  Object.keys(glassBaseIndex).forEach(k=>{
   /* сначала длинные: «Arctic Blue» должно выиграть у «Blue» */
   glassBaseIndex[k]=Object.keys(glassBaseIndex[k]).sort((a,b)=>b.length-a.length);
  });
 }
 return glassBaseIndex[mdString(manufacturer).toLowerCase()]||[];
}
function glassNameParts(p){
 if(!p)return {coating:'',base:''};
 const n=glassCleanName(p.name);
 const on=glassSplitAt(n,/\s+on\s+/i);
 if(on)return {coating:on[0],base:on[1]};
 const plus=glassSplitAt(n,/\s+\+\s+/);
 if(plus)return {coating:plus[0]+' +',base:plus[1]};
 const bases=glassBaseNames(p.manufacturer);
 for(let i=0;i<bases.length;i++){
  const b=bases[i];
  if(n.length>b.length+1&&n.slice(-b.length).toLowerCase()===b.toLowerCase()&&n.charAt(n.length-b.length-1)===' ')
   return {coating:n.slice(0,n.length-b.length-1).trim(),base:n.slice(n.length-b.length)};
 }
 return {coating:n,base:''};
}
function glassCoatingName(p){return glassNameParts(p).coating;}
/* Имя базового стекла, а если в имени его нет — подложка. Пустой строки здесь
   не бывает: пользователю нужно что-то выбрать во втором списке. */
function glassBaseName(p){
 const parts=glassNameParts(p);
 return parts.base||(p?glassLabel('substrate',p.substrate):'');
}

/* --- 8. Имена значений на языке интерфейса ---------------------------- */

/* Тот же приём, что sfName в цеховом справочнике: обе колонки лежат здесь, а
   язык только выбирает нужную. Доменные термины через словарь интерфейса не
   гоняем — иначе «прозрачное» однажды переведётся там, где стоит имя товара.
   Значение, которого в таблице нет, показывается как есть: пустая ячейка врёт
   меньше, чем подставленное наугад слово. */
const GLASS_VOCAB={
 substrate:{clear:['прозрачное','clear'],low_iron:['осветлённое','low iron'],tinted:['тонированное','tinted'],patterned:['узорчатое','patterned'],wired:['армированное','wired']},
 coatingFamily:{uncoated:['без покрытия','uncoated'],lowe:['Low-E','Low-E'],reflective:['рефлективное','reflective']},
 temperMode:{temperable:['закаливается','temperable'],temper_required:['только закалённым','temper required'],annealed_only:['в печь нельзя','no tempering'],unknown:['не указано','unknown']},
 exposureRule:{any:['любая поверхность','any surface'],cavity_only:['только внутрь пакета','cavity only'],exterior_only:['только наружу','exterior only'],interior_only:['только в помещение','interior only']},
 deposition:{pyrolytic:['пиролитическое','pyrolytic'],sputtered:['напыление','sputtered']},
 availability:{stock:['склад','stock'],order:['под заказ','order'],special:['спецзаказ','special'],inactive:['снято','inactive']},
 /* Ответ на вопрос, с которого пользователь начал разговор: позиция, которой у
    нас нет, из выбора не исчезает — она берётся по предзаказу. */
 stock:{stocked:['на складе','in stock'],preorder:['по предзаказу','pre-order']}
};
function glassLabel(kind,value){
 const row=(GLASS_VOCAB[kind]||{})[value];
 if(!row)return mdString(value);
 return (typeof LANG!=='undefined'&&LANG==='en')?row[1]:row[0];
}

/* --- 9. Импорт -------------------------------------------------------- */

/* Слияние ПО КОДУ, а не замена таблицы: строки, которые пользователь завёл
   руками, чужой файл сносить не должен. Чего в файле нет — попадает в
   `missing` отчёта, а не удаляется молча. */
function importGlassProductsCsv(text){
 const parsed=glassParseProductsCsv(text),rep=parsed.rep,inFile=Object.create(null);
 parsed.out.forEach(row=>{
  const at=DB.glassProduct.findIndex(p=>p.code.toUpperCase()===row.code.toUpperCase());
  inFile[row.code.toUpperCase()]=true;
  if(at<0){
   DB.glassProduct.push(normalizeGlassProduct(Object.assign({id:glassProductId(row.code)},row.fields)));
   rep.added++;
  }else{
   /* id сохраняется: на него ссылаются Makeup сохранённых заказов. */
   DB.glassProduct[at]=normalizeGlassProduct(Object.assign({},DB.glassProduct[at],row.fields,{id:DB.glassProduct[at].id}));
   rep.updated++;
  }
 });
 DB.glassProduct.forEach(p=>{if(!inFile[p.code.toUpperCase()])rep.missing.push(p.code);});
 normalizeMasterData();
 return rep;
}

/* Импорт GLASS_SHEETS.csv — «почём и каким листом». Строка на неизвестный код
   отклоняется: цена, привязанная к продукту, которого нет, не поддаётся
   проверке и тихо ляжет в себестоимость. */
function importGlassSheetsCsv(text){
 const parsed=parseCsv(text),header=parsed.header,rep=sfReport(),inFile=Object.create(null);
 if(!header.includes('code')||!header.includes('supplier')){
  sfReject(rep,0,'','файл не похож на GLASS_SHEETS.csv: нет колонок code и supplier');
  return rep;
 }
 const has=c=>header.includes(c);
 parsed.rows.forEach((r,n)=>{
  const line=n+2,code=mdString(r.code),supplier=mdString(r.supplier);
  const label=code+(supplier?' · '+supplier:'');
  if(!code)return sfReject(rep,line,'','пустой код продукта');
  if(!supplier)return sfReject(rep,line,code,'пустая точка поставки');
  const product=glassProductByCode(code);
  if(!product)return sfReject(rep,line,label,'продукта '+code+' нет в каталоге');
  if(has('thickness_mm')){
   const t=mdNum(r.thickness_mm);
   if(t!=null&&product.thicknessMm!=null&&t!==product.thicknessMm)
    return sfReject(rep,line,label,'толщина '+t+' мм не совпадает с каталогом ('+product.thicknessMm+' мм)');
  }
  const cur=mdString(r.currency).toUpperCase();
  if(cur&&!CURRENCY_RE.test(cur))return sfReject(rep,line,label,'currency: три буквы кода валюты, например CAD');
  const wIn=mdNonNeg(r.sheet_w_in),hIn=mdNonNeg(r.sheet_h_in);
  if(has('sheet_w_in')&&has('sheet_h_in')&&(wIn==null)!==(hIn==null))
   return sfReject(rep,line,label,'размер листа заполняется парой: sheet_w_in и sheet_h_in');
  const unit=mdUnitCode(r.purchase_unit,'');
  if(mdString(r.purchase_unit)&&!unit)
   return sfReject(rep,line,label,'purchase_unit: неизвестная единица, ожидается '+MD_UNITS.map(u=>u.code).join(' · '));
  const price=mdNonNeg(r.purchase_price);
  if(mdString(r.purchase_price)&&price==null)return sfReject(rep,line,label,'purchase_price: неотрицательное число');
  const lead=mdInt(r.lead_time_days);
  if(mdString(r.lead_time_days)&&lead==null)return sfReject(rep,line,label,'lead_time_days: целое неотрицательное число');
  const avail=mdString(r.availability).toLowerCase();
  if(avail&&!MATERIAL_AVAILABILITY.includes(avail))
   return sfReject(rep,line,label,'availability: ожидается '+MATERIAL_AVAILABILITY.join(' · '));
  const priceDate=mdString(r.price_date);
  if(priceDate&&!ISO_DATE_RE.test(priceDate))return sfReject(rep,line,label,'price_date: дата вида ГГГГ-ММ-ДД');

  const key=glassSheetKey(product.code,supplier,wIn,hIn);
  if(inFile[key])return sfReject(rep,line,label,'та же точка поставки и тот же размер листа повторяются в файле');
  inFile[key]=true;

  const next={productCode:product.code,supplier,sheetWIn:wIn,sheetHIn:hIn};
  if(cur)next.currency=cur;
  if(unit)next.purchaseUnit=unit;
  if(has('purchase_price'))next.purchasePrice=price;
  if(has('price_date'))next.priceDate=priceDate;
  if(has('freight_pct'))next.freightPct=mdNonNeg(r.freight_pct);
  if(has('lead_time_days'))next.leadTimeDays=lead;
  if(avail)next.availability=avail;
  if(has('note'))next.note=mdString(r.note);

  const at=DB.glassSheet.findIndex(s=>glassSheetKey(s.productCode,s.supplier,s.sheetWIn,s.sheetHIn)===key);
  if(at<0){DB.glassSheet.push(normalizeGlassSheet(next));rep.added++;}
  else{DB.glassSheet[at]=normalizeGlassSheet(Object.assign({},DB.glassSheet[at],next,{id:DB.glassSheet[at].id}));rep.updated++;}
  rep.accepted++;
 });
 DB.glassSheet.forEach(s=>{
  if(!inFile[glassSheetKey(s.productCode,s.supplier,s.sheetWIn,s.sheetHIn)])rep.missing.push(s.productCode+' · '+s.supplier);
 });
 normalizeMasterData();
 return rep;
}

/* ---------- Вес стекла ----------
   Считается от ФАКТИЧЕСКОЙ толщины: «10 mm» стекло на деле 9.7 mm, и на
   больших листах разница уже видна в накладной. Номинал берётся только когда
   фактического значения в каталоге нет — тогда вес помечается приблизительным.
   Плотность натрий-кальциевого стекла — именованная константа, а не число
   внутри выражения: её меняют один раз и в одном месте. */
const GLASS_DENSITY_KG_M3=2500;
const GLASS_M2_PER_FT2=0.09290304;
function glassEffectiveThicknessMm(product){
  var a=product&&+product.actualThicknessMm;
  if(isFinite(a)&&a>0)return {mm:a,exact:true};
  var n=product&&+product.thicknessMm;
  return isFinite(n)&&n>0?{mm:n,exact:false}:{mm:0,exact:false};
}
/* Плёнка легче стекла. Одна цифра на все интерлееры: PVB ~ 1070, EVA ~ 950,
   а доля плёнки в весе юнита около процента — точнее делить смысла нет. */
const GLASS_INTERLAYER_DENSITY_KG_M3=1070;
/* Вес слоя известной толщины. Ламинат — это стёкла И плёнка между ними, и
   каждый слой считается своей плотностью. */
function glassLayerWeightKg(mm,density,areaFt2){
  var a=+areaFt2;
  if(!(+mm>0)||!isFinite(a)||a<=0)return 0;
  return a*GLASS_M2_PER_FT2*(+mm/1000)*density;
}
/* areaFt2 — площадь ОДНОГО стекла. Возвращает {kg, exact} либо null. */
function glassWeightKg(product,areaFt2){
  var t=glassEffectiveThicknessMm(product),a=+areaFt2;
  if(!(t.mm>0)||!isFinite(a)||a<=0)return null;
  return {kg:glassLayerWeightKg(t.mm,GLASS_DENSITY_KG_M3,areaFt2),exact:t.exact};
}
function glassWeightText(product,areaFt2){
  var w=glassWeightKg(product,areaFt2);
  if(!w)return '';
  return (w.exact?'':'~')+(w.kg>=10?Math.round(w.kg):w.kg.toFixed(1))+' kg';
}
