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
/* Правила продажи из карточки (план Master Data, этап 2, часть 3): свой
   минимум площади и суммы поднимает счёт, мин./макс. размер Ш × В в дюймах
   только предупреждает (владелец, 22.10.2026). Пусто — правила нет. */
const MD_SALE_RULE_FIELDS=['minAreaFt2','minCharge','minWidthIn','minHeightIn','maxWidthIn','maxHeightIn'];
function mdSaleRulesOf(p){const out={};MD_SALE_RULE_FIELDS.forEach(k=>{out[k]=mdNonNeg(p&&p[k]);});return out;}
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
/* --- 1а. Общая шапка материала (раздел 3.1 схемы) ---------------------
   Этап 2 схемы, часть первая: ОДНА ФОРМА. Девять справочников материалов
   физически остаются своими таблицами — переезд хранилища это отдельное
   решение со своей ценой (живая localStorage владельца и совместимость
   Export/Import JSON), — но форма строки у всех становится одна. Поля шапки
   перечислены в разделе 3.1: то, что есть у материала независимо от того,
   стекло это, спейсер или стоковая дверь.

   Приём намеренно аддитивный: `materialHeader` НЕ трогает поля категории и
   не затирает уже сохранённые значения — она только гарантирует, что шапка
   есть и приведена к типу. Поэтому её можно наложить на любую из девяти
   нормализаций, не переписывая ни одну из них. */
const MATERIAL_CATEGORIES=['glass','igu','lamination','surface','stock'];
/* Физическая таблица → категория схемы. Единственное место, где это знание
   записано: и аксессоры, и экран читают отсюда, а не повторяют список.
   Подкатегорию здесь не держим — её несёт сама строка (см. materialHeader),
   и второе место с тем же ответом рано или поздно разошлось бы с первым. */
const MATERIAL_TABLE_MAP={
 glassProduct:     {category:'glass'},
 spacerVariant:    {category:'igu'},
 gasProduct:       {category:'igu'},
 sealantProduct:   {category:'igu'},
 iguPart:          {category:'igu'},
 interlayerProduct:{category:'lamination'},
 fritProduct:      {category:'surface'},
 spandrelProduct:  {category:'surface'},
 spandrelColour:   {category:'surface'},
 stockItem:        {category:'stock'}
};
/* Закупка и хранение — заготовка под инвентаризацию: раздел 3.1 прямо
   говорит «поле есть, движений нет». Заводить их сейчас дёшево, добавлять
   потом в девять нормализаций и в сохранённые данные — дорого. */
function materialHeader(p,category,subcategory){
 p=p&&typeof p==='object'?p:{};
 return {
  category:MATERIAL_CATEGORIES.includes(category)?category:'',
  subcategory:mdString(subcategory||p.subcategory),
  purchasePrice:mdNonNeg(p.purchasePrice),
  purchaseUnit:mdString(p.purchaseUnit),
  currency:mdString(p.currency)||'CAD',
  priceDate:mdString(p.priceDate),
  stockQty:mdNum(p.stockQty)
 };
}
function normalizeGlassProduct(p){
 p=p&&typeof p==='object'?p:{};
 /* `family` — имя поля прежней схемы; читаем, чтобы сохранённый браузер не
    потерял покрытие ещё до пересева. */
 const fam=GLASS_COATING_FAMILIES.includes(p.coatingFamily)?p.coatingFamily
  :(GLASS_COATING_FAMILIES.includes(p.family)?p.family:'uncoated');
 return Object.assign(materialHeader(p,'glass',fam),{
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
  /* Галочка «режем сами», как в Спиле (владелец, 14.10.2026). Снята — стекло
     покупное (COG): в раскрой и батчи не идёт, лайт едет сразу на сборку. */
  cut:p.cut!==false,
  legacyCode:mdString(p.legacyCode),note:mdString(p.note),
  salePriceAnnealed:mdNonNeg(p.salePriceAnnealed),
  salePriceTempered:mdNonNeg(p.salePriceTempered),
  stockingUnit:mdUnitCode(p.stockingUnit,GLASS_DEFAULT_UNIT),
  salesUnit:mdUnitCode(p.salesUnit,GLASS_DEFAULT_UNIT),
  ...mdSaleRulesOf(p),
  optics:normalizeGlassOptics(p.optics),
  origin:normalizeGlassOrigin(p.origin),
  /* У стекла закупка не одно число — она живёт точками поставки
     (`glassSheet`), поэтому срок берёт `glassLeadTimeDays`, а не поле
     карточки. Наличие у стекла тоже своё — `stocked` («по предзаказу»), а не
     общий `availability`: держать оба значило бы два ответа на один вопрос.
     Плюс `availability` нельзя внести в шапку стекла технически — строкой
     ниже она читается как разовая миграция прежней схемы, и сохранённое
     поле перезапускало бы её на каждой нормализации, навсегда запирая
     легаси-стекло выключенным. */
  sellsAsOwnLine:p.sellsAsOwnLine===true,
  /* миграция прежней схемы: снятое с производства было availability='inactive' */
  active:p.active!==false&&p.availability!=='inactive'
 });
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
  productCode:code,supplier,supplierId:mdString(s.supplierId),
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
const GLASS_NO=['','no','n','false','0','none','-'];
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
  sfReject(rep,0,'','this file does not look like GLASS_PRODUCTS.csv: no code and name columns');
  return {rep,out};
 }
 const has=c=>header.includes(c);
 const seen=Object.create(null);
 parsed.rows.forEach((r,n)=>{
  const line=n+2,code=mdString(r.code);
  if(!code)return sfReject(rep,line,'','empty code');
  if(!GLASS_CODE_RE.test(code))return sfReject(rep,line,code,'code: letters, digits and + . _ - / only');
  if(seen[code.toUpperCase()])return sfReject(rep,line,code,'the code is repeated in the file');
  const name=mdString(r.name);
  if(!name)return sfReject(rep,line,code,'empty name');
  const f={code,name};

  if(has('manufacturer'))f.manufacturer=mdString(r.manufacturer);
  if(has('substrate')){
   const v=mdString(r.substrate).toLowerCase();
   if(!GLASS_SUBSTRATES.includes(v))return sfReject(rep,line,code,'substrate: expected '+GLASS_SUBSTRATES.join(' · '));
   f.substrate=v;
  }
  if(has('coating_family')){
   const v=mdString(r.coating_family).toLowerCase();
   if(!GLASS_COATING_FAMILIES.includes(v))return sfReject(rep,line,code,'coating_family: expected '+GLASS_COATING_FAMILIES.join(' · '));
   f.coatingFamily=v;
  }
  if(has('thickness_mm')){
   const t=mdNum(r.thickness_mm);
   if(t==null)return sfReject(rep,line,code,'thickness_mm: not a number');
   if(t<GLASS_MIN_MM||t>GLASS_MAX_MM)return sfReject(rep,line,code,'thickness out of range '+GLASS_MIN_MM+'–'+GLASS_MAX_MM+' mm');
   f.thicknessMm=t;
  }
  if(has('actual_thickness_mm'))f.actualThicknessMm=mdNum(r.actual_thickness_mm);
  if(has('temper_mode')){
   const key=mdString(r.temper_mode).toUpperCase();
   const v=GLASS_TEMPER_CSV[key];
   if(!v)return sfReject(rep,line,code,'temper_mode: expected empty · TEMPERED · NO TEMPERABLE');
   f.temperMode=v;
  }
  if(has('exposure_rule')){
   const v=mdString(r.exposure_rule).toLowerCase()||'any';
   if(!GLASS_EXPOSURE_RULES.includes(v))return sfReject(rep,line,code,'exposure_rule: expected '+GLASS_EXPOSURE_RULES.join(' · '));
   f.exposureRule=v;
  }
  if(has('allowed_surfaces')){
   const v=glassSurfacesCell(r.allowed_surfaces);
   if(v===null)return sfReject(rep,line,code,'allowed_surfaces: surface numbers 1–8, comma separated');
   f.allowedSurfaces=v;
  }
  if(has('edge_deletion')){
   const v=glassBoolCell(r.edge_deletion);
   if(v===undefined)return sfReject(rep,line,code,'edge_deletion: expected YES or empty');
   f.edgeDeletion=v;
  }
  if(has('deposition')){
   const v=mdString(r.deposition).toLowerCase();
   if(v&&!GLASS_DEPOSITIONS.includes(v))return sfReject(rep,line,code,'deposition: expected empty · '+GLASS_DEPOSITIONS.join(' · '));
   f.deposition=v;
  }
  if(has('stocked')){
   const v=glassBoolCell(r.stocked);
   if(v===undefined)return sfReject(rep,line,code,'stocked: expected YES or empty');
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
/* COG — стекло, которое не режем: привёз клиент или купили (владелец,
   14.10.2026): «базово COG 3–19 мм и всё», один производитель, без вариантов
   вроде «Vitro COG». Толщины — те же, что у каталога. «We cut it» снята.
   Цена стекла 0: «базово 0, если нужно — введём руками» — за COG берут
   сервисы, цену стекла при надобности вписывают на лайте. */
const GLASS_COG_MM=[3,4,5,6,8,10,12,16,19];
function glassCogProducts(){return GLASS_COG_MM.map(mm=>normalizeGlassProduct({id:glassProductId(mm+'COG'),code:mm+'COG',manufacturer:'COG',name:'COG '+mm+'mm',thicknessMm:mm,substrate:'clear',coatingFamily:'uncoated',cut:false,salePriceAnnealed:0,salePriceTempered:0}));}
DEFAULT.glassProduct=glassSeedProducts().concat(glassCogProducts());
/* Строки поставки заводскими НЕ бывают: точки поставки, размеры листа, цены и
   сроки пользователем ещё не подтверждены, а выдуманная цена в прайсе хуже
   отсутствующей. Таблица стартует пустой и заполняется экраном или CSV.

   И по той же причине её НЕТ в REFERENCE_TABLES (см. erp/data): пересев
   заменяет справочник заводским, то есть стёр бы все введённые цены. */
DEFAULT.glassSheet=[];

/* `sellsAsOwnLine` — 11 сентября 2026, владелец: «нужна опция не только для
   стоковых дверей, у меня могут быть доп. опции для продажи — возможно, кому-то
   я должен продать свой рулон EVA». Признак принадлежит МАТЕРИАЛУ, а не
   категории: у стоковых позиций (`type==='stock'`) он включён по умолчанию, у
   остальных выключен, но переключить можно любую строку — интерлеер, герметик,
   газ, фрит, спандрел. `subcategory` осмысленна только у стока и у остальных
   типов остаётся пустой строкой.

   Список door/kit/consumable — заводская ПОДСКАЗКА, не закрытый список: тот же
   приём, что и у семейства цвета спандрела (владелец, 11 сентября: «максимально
   от тебя не зависящую»). Пустая или новая строка от пользователя сохраняется
   как есть, дефолт 'consumable' подставляется только когда поле реально пусто. */
function normalizeSimpleMaterial(p,type){p=p&&typeof p==='object'?p:{};
 /* Категория берётся по типу, а не по таблице: `type` — то же самое знание,
    только уже разложенное по строкам. Тепловая обработка материалом не
    является (её нет в разделе 7) и категории не получает. */
 const cat=SIMPLE_MATERIAL_CATEGORY[type]||'';
 /* У стока подкатегорию вписывает владелец, у плёнки ею уже служит семейство
    (EVA / SGP), у остальных она совпадает с типом. Второго поля с тем же
    смыслом не заводим — разойдутся. */
 const sub=type==='stock'?(mdString(p.subcategory)||'consumable')
  :(type==='interlayer'?mdString(p.family):(SIMPLE_MATERIAL_SUBCATEGORY[type]||''));
 return Object.assign(materialHeader(p,cat,sub),{id:mdString(p.id),type,name:mdString(p.name),code:mdString(p.code),thicknessMm:mdNum(p.thicknessMm),salePrice:mdNonNeg(p.salePrice),salesUnit:mdString(p.salesUnit),...mdSaleRulesOf(p),availability:mdAvailability(p.availability),supplier:mdString(p.supplier),leadTimeDays:mdNum(p.leadTimeDays),stockingUnit:mdString(p.stockingUnit),note:mdString(p.note),sellsAsOwnLine:p.sellsAsOwnLine!=null?p.sellsAsOwnLine===true:type==='stock',active:p.active!==false},type==='gas'?{densityKgM3:mdNonNeg(p.densityKgM3)}:{},
 /* Фрит и спандрел — работы (этап 4): карточка называет работу Works, а
    станцию и место в маршруте даёт она. Пусто — работа не назначена. */
 type==='frit'||type==='spandrel'?{workId:mdString(p.workId)}:{},
 type==='interlayer'?interlayerCardFields(p):{});}
/* Плёнка (план Master Data, этап 5): толщина слоя и разрешённые толщины —
   карточка, а не код (Ultra Clear: 0.76 и 1.52, без 0.38); строки
   поставки — поставщик, ширина рулона, толщина, цена. Пусто у старой строки —
   засев: слой 0.38, толщины 1–6 слоёв. */
const INTERLAYER_SEED_PLY_MM=0.38,INTERLAYER_SEED_PLIES=6;
function interlayerCardFields(p){
 const ply=mdNonNeg(p.plyMm)>0?mdNonNeg(p.plyMm):INTERLAYER_SEED_PLY_MM;
 const list=Array.isArray(p.thicknessesMm)?p.thicknessesMm:Array.from({length:INTERLAYER_SEED_PLIES},(_,i)=>(i+1)*ply);
 const thicknessesMm=[...new Set(list.map(v=>mdNonNeg(v)).filter(v=>v>0).map(v=>+v.toFixed(2)))].sort((a,b)=>a-b);
 const supply=(Array.isArray(p.supply)?p.supply:[]).filter(x=>x&&typeof x==='object').map(x=>({supplier:mdString(x.supplier),widthIn:mdNonNeg(x.widthIn),thicknessMm:mdNonNeg(x.thicknessMm),price:mdNonNeg(x.price),per:mdString(x.per)})).filter(x=>x.supplier||x.widthIn!=null||x.thicknessMm!=null||x.price!=null);
 return {plyMm:ply,thicknessesMm,supply};
}
const SIMPLE_MATERIAL_CATEGORY={gas:'igu',sealant:'igu',iguPart:'igu',interlayer:'lamination',frit:'surface',spandrel:'surface',stock:'stock'};
const SIMPLE_MATERIAL_SUBCATEGORY={gas:'gas',sealant:'sealant',iguPart:'part',frit:'frit',spandrel:'spandrel'};
/* Готовые изделия и расходка: покупаем целиком, перепродаём целиком, без
   геометрии и без маршрута. Раздел 3·2 схемы — «сейчас такого нет вообще».
   Сценарий владельца: заказ из левой фиксированной панели, правой панели и
   стоковой двери посередине, потому что дверь $80, а такая же кастомная с
   разницей 1/8″ — $150. Таблица стартует пустой: выдумывать ассортимент
   владельца нельзя, он заведёт его сам. */
const SALES_STOCK_SUBCATEGORIES=['door','kit','consumable'];
DEFAULT.stockItem=[];

DEFAULT.heatTreatment=[
 {id:'HT-AN',name:'Annealed',code:'AN'},{id:'HT-HS',name:'Heat Strengthened',code:'HS'},{id:'HT-FT',name:'Tempered',code:'FT'}
].map(x=>normalizeSimpleMaterial(x,'heatTreatment'));
/* Дистанционная рамка: номинал (дробь) — по нему её выбирают и называют;
   факт, мм — по нему считается толщина пакета (7/16 у Aluminum 11.1, у Black
   Warm Edge 11.5). Цена, вес и рецепт обвязки — в карточке рамки (этап 3
   плана Master Data), не в семействе.

   thicknessMm заводскими данными НЕ заполняется намеренно. Пустое поле честно
   говорит «фактическая толщина не подтверждена», и расчёт показывает номинал
   с пометкой.

   SPACER_SYSTEMS — только засев справочника систем (DB.spacerSystem) и рамок;
   системы ведёт владелец в Data. */
const SPACER_SYSTEMS=[
 {code:'AL',  family:'Aluminum',  system:'Aluminum',             price:2.40},
 {code:'BL',  family:'Aluminum',  system:'Black Aluminum',       price:2.40},
 {code:'WWE', family:'Warm Edge', system:'White Warm Edge',      price:2.85},
 {code:'LGWE',family:'Warm Edge', system:'Light Grey Warm Edge', price:2.85},
 {code:'BWE', family:'Warm Edge', system:'Black Warm Edge',      price:2.85},
 {code:'SS',  family:'Stainless', system:'Stainless Steel',      price:2.85},
 {code:'BSS', family:'Stainless', system:'Black Stainless Steel',price:2.85}
];
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
/* Засев рамок (этап 3 плана Master Data): цена — та, что до этапа 3 висела
   на семействе; вес — оценка 30 g/ft² для 17/32 Black Warm Edge, пересчитанная
   по толщине, «не замерено». Это стартовые данные, их правят в карточке. */
DEFAULT.spacerVariant=SPACER_SYSTEMS.reduce(function(out,s){
 const refMm=spacerNominalMm('17/32');
 return out.concat((SPACER_STOCK[s.code]||[]).map(function(size){
  const id='SP-'+s.code+'-'+spacerSizeKey(size),mm=spacerNominalMm(size);
  return {id:id,system:s.system,size:size,thicknessMm:null,name:s.system+' '+size+'″',code:id,availability:'stock',supplier:'',leadTimeDays:null,active:true,
   salePrice:s.price,recipeId:id==='SP-BWE-1732'?'REC-BWE-1732':'REC-STD',weightG:Math.round(30*mm/refMm*1000)/1000,weightPer:'ft2',weightMeasured:false};
 }));
},[]);
DEFAULT.gasProduct=[{id:'GAS-AIR',name:'Air',code:'AIR',salePrice:0,densityKgM3:1.225},{id:'GAS-ARGON',name:'Argon',code:'ARG',salePrice:.25,densityKgM3:1.784}].map(x=>normalizeSimpleMaterial(x,'gas'));
/* Полисульфид — базовый вторичный герметик прайса, силикон дороже и идёт
   опцией. Без него самый ходовой вариант в систему не заносился вообще. */
DEFAULT.sealantProduct=[{id:'SEAL-PIB',name:'PIB',code:'PIB',salePrice:0},{id:'SEAL-PS',name:'Polysulphide',code:'PS',salePrice:0},{id:'SEAL-SIL',name:'Silicone',code:'SIL',salePrice:.20},{id:'SEAL-HM',name:'Hot Melt',code:'HM',salePrice:0}].map(x=>normalizeSimpleMaterial(x,'sealant'));
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
 /* 5.00 — цена владельца от 10 сентября 2026 на весь фрит. Прежние 3.10 были
    выдуманы: «я указал с головы». Цифровая печать заведена ВЫКЛЮЧЕННОЙ —
    «пока не работает», — чтобы её нельзя было выбрать в заказ по ошибке. */
 {id:'FRIT-CERAMIC',name:'Ceramic Frit',code:'FRIT-CER',salePrice:5.00,workId:'ceramic_frit'},
 {id:'FRIT-DIGITAL',name:'Digital Ceramic Print',code:'FRIT-DIG',salePrice:5.00,active:false,workId:'digital_print'}
].map(x=>normalizeSimpleMaterial(x,'frit'));
/* Покраска — это спандрел, а не отдельная услуга. Решение владельца
   10 сентября 2026: «Backpainting и Opaci Coat — это всё спандрел,
   силиконовый», а `Opaci Coat` — код производителя ICD, а не название работы.

   ТИПОВ РОВНО ДВА. Первым заходом я развёл Opaci-Coat стандартный, Opaci-Coat
   кастомный и Backpainting в три отдельных типа — и владелец это отбил:
   «не нужно разбивать на 5 типов; кастомный цвет должен жить в цветах, это всё
   ещё Opaci, просто кастомный; краска заказчика — тоже Opaci, только заказчика».
   Различие между ними — не тип панели, а строка палитры. Тип отвечает, ЧЕМ
   красят: силикон ICD или керамика. */
DEFAULT.spandrelProduct=[
 {id:'SPAN-CERAMIC', name:'Ceramic Spandrel',            code:'SPAN-CER',salePrice:5.00,workId:'painting'},
 {id:'SPAN-SILICONE',name:'Opaci-Coat · Silicone Spandrel',code:'SPAN-SIL',supplier:'ICD',salePrice:5.00,workId:'painting'}
].map(x=>normalizeSimpleMaterial(x,'spandrel'));
/* Пять типов свели к двум решением владельца (раздел 5·7): «не нужно разбивать
   на 5 типов; кастомный цвет должен жить в цветах, это всё ещё Opaci, просто
   кастомный; краска заказчика — тоже Opaci, только заказчика». В браузере
   владельца три отменённых id пережили этот переход, потому что `spandrelProduct`
   намеренно выведен из пересева (см. normalizeMasterData) — и долив по id умеет
   только добавлять, не снимать отменённое.

   Alias-карта переносит старую ссылку на новый тип и, где смысл старого типа
   был именно в цвете, подставляет цвет из палитры: SPC-OC-CUSTOM для «свой
   цвет», SPC-OC-OWN для «краска заказчика». SPAN-OC-STD цвет не трогает — его
   палитра всегда жила под SPAN-SILICONE, и сохранённый цвет там уже валиден. */
const SPANDREL_PRODUCT_ALIASES={
 'SPAN-OC-STD': {id:'SPAN-SILICONE',colour:null},
 'SPAN-OC-CUST':{id:'SPAN-SILICONE',colour:'SPC-OC-CUSTOM'},
 'SPAN-BP':     {id:'SPAN-SILICONE',colour:'SPC-OC-OWN'}
};
function spandrelProductMigration(id){return SPANDREL_PRODUCT_ALIASES[mdString(id)]||null;}
function spandrelCanonicalProductId(id){const m=spandrelProductMigration(id);return m?m.id:mdString(id);}

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
/* Угол, точка и отступ по умолчанию — в Data → Setup (erp/sales/order-setup).
   Отступ — ПРЕДЗАПОЛНЕНИЕ, а не правило: 0 законен (пользователь). */
/* Цвета спандрела — СПРАВОЧНИК, а не список в коде. Прежние пять слов
   ('Black', 'White', 'Gray', 'Bronze', 'Custom') были выдумкой: настоящая
   палитра принадлежит производителю и имеет коды, по которым цех и заказывает.
   Владелец 10 сентября 2026 прислал палитру Opaci Coat и потребовал управлять
   ею сам: «сделай мне мастер-дату максимально от тебя не зависящую».

   Поэтому таблицы НЕТ в REFERENCE_TABLES: пересев заменяет перечисленные там
   таблицы заводскими целиком и стёр бы и правки, и заведённые вручную цвета.
   Недостающие заводские строки доливаются по id в normalizeMasterData — тем же
   приёмом, что у плёнок ламинации.

   Цвет принадлежит ТИПУ: у силикона ICD своя палитра из шестнадцати цветов,
   у керамики своя короткая — «только белый, чёрный, серый и кастомный, всё,
   больше ничего». Пустой `productId` означает «доступен любому типу»: так
   заводятся цвета, добавленные владельцем, пока он не привязал их к типу. */
function normalizeSpandrelColour(c){
 c=c&&typeof c==='object'?c:{};
 return Object.assign(materialHeader(c,'surface','spandrelColour'),{
  id:mdString(c.id),name:mdString(c.name),code:mdString(c.code),
  family:mdString(c.family),productId:mdString(c.productId),
  note:mdString(c.note),active:c.active!==false});
}
DEFAULT.spandrelColour=[
 {id:'SPC-3-818', family:'Black',name:'Black',           code:'#3-818'},
 {id:'SPC-3-3234',family:'Gray', name:'Whale Grey',      code:'#3-3234'},
 {id:'SPC-3-0770',family:'Gray', name:'Warm Grey',       code:'#3-0770'},
 {id:'SPC-4-2388',family:'Gray', name:'Solar Day',       code:'#4-2388'},
 {id:'SPC-3-2646',family:'Gray', name:'Telegray',        code:'#3-2646'},
 {id:'SPC-3-820', family:'Gray', name:'Harmony Grey',    code:'#3-820'},
 {id:'SPC-3-2625',family:'Gray', name:'Iron Grey',       code:'#3-2625'},
 {id:'SPC-3-1371',family:'Gray', name:'West Lake',       code:'#3-1371'},
 {id:'SPC-3-8471',family:'Gray', name:'North Cape Grey', code:'#3-8471'},
 {id:'SPC-3-3371',family:'Gray', name:'Basalt Grey',     code:'#3-3371'},
 {id:'SPC-3-3867',family:'Gray', name:'Racoon Fur',      code:'#3-3867'},
 {id:'SPC-6-0025',family:'Blue', name:'Harmony Blue',    code:'#6-0025'},
 {id:'SPC-4-3630',family:'Brown',name:'Sturdy Brown',    code:'#4-3630'},
 {id:'SPC-4-822', family:'Brown',name:'Harmony Bronze',  code:'#4-822'},
 {id:'SPC-3-1060',family:'White',name:'White',           code:'#3-1060'},
 {id:'SPC-0-1409',family:'White',name:'Snow Bound',      code:'#0-1409'},
 /* Кастомный цвет и краска заказчика — строки ПАЛИТРЫ, а не типы панели.
    Кода производителя у них нет: он появится, когда цвет назовут. */
 {id:'SPC-OC-CUSTOM',family:'',name:'Custom Colour',      code:''},
 {id:'SPC-OC-OWN',   family:'',name:"Customer's Own Paint",code:''}
].map(x=>normalizeSpandrelColour(Object.assign({productId:'SPAN-SILICONE'},x)))
/* Керамика: «только белый, чёрный, серый и кастомный, всё, больше ничего».
   Скринов по ней у владельца нет, поэтому кодов производителя тоже нет. */
.concat([
 {id:'SPC-CER-WHITE', family:'White',name:'White'},
 {id:'SPC-CER-BLACK', family:'Black',name:'Black'},
 {id:'SPC-CER-GREY',  family:'Gray', name:'Grey'},
 {id:'SPC-CER-CUSTOM',family:'',     name:'Custom'}
].map(x=>normalizeSpandrelColour(Object.assign({code:'',productId:'SPAN-CERAMIC'},x))));
const SPANDREL_COLOUR_FAMILIES=['Black','Gray','Blue','Brown','White'];

/* --- Ставки услуг ------------------------------------------------------
   Прайс цеха. До 10 сентября 2026 он был константой в коде: чтобы поправить
   цену нотча, нужен был разработчик. Владелец: «сделай мне мастер-дату
   максимально от тебя не зависящую».

   Цена работы — таблица «от – до мм → цена» (serviceRateTiersOf). Ключ
   начисления кончается id строки таблицы: по нему сохранённый заказ находит
   свою ручную ставку, поэтому id строки не меняется при правке границ.

   Отверстия разложены по диаметру отдельными строками (`hole:0.5-1` и так
   далее): у каждой свой диапазон диаметра и своя таблица по толщине. */
/* Строка прайса — это РАБОТА, а не только цена. Станция, момент маршрута и
   габаритное ограничение живут здесь же: пока станция лежала в отдельной
   таблице цеха, маршрут и счёт читали разные источники и расходились. Правило
   владельца 10 сентября 2026 — сводим в одну строку.

   `family` + `appliesBy` / `appliesFrom` / `appliesTo` — диапазон диаметра у
   отверстий (family 'hole'). Пустой диапазон — «применяется всегда». */
function normalizeServiceRate(r){
 r=r&&typeof r==='object'?r:{};
 const num=v=>{if(v==null||v==='')return null;const n=+v;return isFinite(n)&&n>=0?n:null;};
 const appliesBy=r.appliesBy==='diameter'?'diameter':'';
 return {
  id:mdString(r.id),name:mdString(r.name),unit:mdString(r.unit)||'pc',
  tiers:serviceRateTiersOf(r),
  /* Станция пустая — законное состояние: у надбавки за фигурную единицу
     операции в цеху нет вовсе, она чистая цена. */
  station:mdString(r.station),
  stage:['pre_temper','heat','post_temper','any'].includes(r.stage)?r.stage:'pre_temper',
  afterMerge:r.afterMerge===true,
  family:appliesBy?mdString(r.family):'',appliesBy:appliesBy,
  appliesFrom:appliesBy?num(r.appliesFrom):null,
  appliesTo:appliesBy?num(r.appliesTo):null,
  /* Габарит: своё ограничение работы, если оно жёстче станции. Пусто — берётся
     станция. Норма времени пустая означает «не замерено», как у фактической
     толщины рамки: выдуманная минута тише и опаснее пустой. */
  maxW:num(r.maxW),maxL:num(r.maxL),
  /* Округление количества вверх до шага (1 — до целого дюйма) и минимальная
     сумма за юнит. Пусто — без округления и без минимума. */
  roundTo:num(r.roundTo)||null,minCharge:num(r.minCharge),
  rule:normalizeServiceRule(r.rule),
  minutesPerUnit:num(r.minutesPerUnit),setupMinutes:num(r.setupMinutes),
  note:mdString(r.note),active:r.active!==false
 };
}
/* Надбавка (этап 4, часть 2): работа, которая не начисляется строкой за
   операцию, а меняет цену юнита. Числа — цена работы (строка таблицы, прайс
   клиента может дать свою): процент или минимальная площадь. Когда
   применяется — условия ниже; пустое условие не ограничивает.
     kind      'percent' — процент к базовой цене юнита (материалы + работы);
               'minArea' — площадь к оплате не меньше, ft²;
     unitTypes single / double / triple / laminated, пусто — любой юнит;
     areaOver / areaUnder — площадь к оплате одного юнита строго больше /
               меньше, ft²;
     onTop     процент считается от цены с предыдущими надбавками, а не от
               базовой;
     priority  порядок применения, меньше — раньше. */
const SERVICE_RULE_UNIT_TYPES=['single','double','triple','laminated'];
function normalizeServiceRule(x){
 if(!x||typeof x!=='object'||!['percent','minArea'].includes(x.kind))return null;
 const num=v=>{if(v==null||v==='')return null;const n=+v;return isFinite(n)&&n>=0?n:null;};
 return {kind:x.kind,unitTypes:(Array.isArray(x.unitTypes)?x.unitTypes:[]).filter(t=>SERVICE_RULE_UNIT_TYPES.includes(t)),
  areaOver:num(x.areaOver),areaUnder:num(x.areaUnder),onTop:x.onTop===true,priority:+x.priority||0};
}
/* Когда применяется надбавка — коротко, для списка Works и счёта. */
function serviceRuleText(rule){
 if(!rule)return '';
 const out=[];
 out.push(rule.unitTypes&&rule.unitTypes.length?rule.unitTypes.map(t=>t[0].toUpperCase()+t.slice(1)).join(' / ')+' units':'Any unit');
 if(rule.areaOver!=null)out.push('area > '+rule.areaOver+' ft²');
 if(rule.areaUnder!=null)out.push('area < '+rule.areaUnder+' ft²');
 if(rule.kind==='percent'&&rule.onTop)out.push('on top');
 return out.join(', ');
}
/* Таблица цен работы «от – до мм → цена» (план Master Data, этап 4). Строк
   сколько угодно, границы включительно, пустая граница — без предела. Одна
   строка без границ — одна цена на любую толщину. До этапа 4 у работы было
   ровно три полосы с границами в коде (salesPricingBandFor) или одна цена
   `flat`: такие записи читаются здесь, id строк те же ('6', '8-10', '12-19',
   'flat') — по ним сохранённый заказ и прайс клиента находят свою цену. */
function serviceRateTiersOf(r){
 const num=v=>{if(v==null||v==='')return null;const n=+v;return isFinite(n)&&n>=0?n:null;};
 let src=Array.isArray(r.tiers)?r.tiers:null;
 if(!src){
  const b=r.bands&&typeof r.bands==='object'?r.bands:{};
  src=r.kind==='flat'?[{id:'flat',price:r.flat}]
   :[{id:'6',to:7,price:b['6']},{id:'8-10',from:8,to:11,price:b['8-10']},{id:'12-19',from:12,to:19,price:b['12-19']}];
 }
 const seen=new Set();
 return src.filter(t=>t&&typeof t==='object').map((t,i)=>{
  let id=mdString(t.id)||'t'+(i+1);while(seen.has(id))id+='+';seen.add(id);
  return {id,from:num(t.from),to:num(t.to),price:num(t.price)};
 });
}
/* Строка таблицы для толщины. Нахлёст строк — ошибка данных: молча выбранная
   первая означала бы, что цена зависит от порядка строк, поэтому и нахлёст, и
   пропуск дают null — работа встаёт в счёт как Rate required, а карточка
   предупреждает (serviceRateTierWarnings). */
function serviceRateTierFor(row,mm){
 const tiers=row&&row.tiers||[];
 if(tiers.length===1&&tiers[0].from==null&&tiers[0].to==null)return tiers[0];
 const t=+mm;if(!(mm!=null&&mm!==''&&isFinite(t)))return null;
 const hit=tiers.filter(x=>(x.from==null||t>=x.from)&&(x.to==null||t<=x.to));
 return hit.length===1?hit[0]:null;
}
function serviceRateTierLabel(t){
 if(!t)return '';
 if(t.from==null&&t.to==null)return 'any mm';
 if(t.from==null)return 'up to '+t.to+' mm';
 if(t.to==null)return t.from+' mm and up';
 return t.from===t.to?t.from+' mm':t.from+'–'+t.to+' mm';
}
/* Коротко для прайса клиента и журнала: ≤7, 8–11, ≥20, all. */
function serviceRateTierShort(t){
 if(!t)return '';
 if(t.from==null&&t.to==null)return 'all';
 if(t.from==null)return '≤'+t.to;
 if(t.to==null)return '≥'+t.from;
 return t.from===t.to?String(t.from):t.from+'–'+t.to;
}
/* Предупреждения таблицы, не запреты (владелец: «предупреждать, а не
   запрещать»). Пропуск ищется по толщинам стёкол каталога: своих чисел у кода
   нет, а «7.5 мм без цены» при отсутствии такого стекла — шум. */
function serviceRateTierWarnings(row){
 const tiers=row&&row.tiers||[],out=[];
 tiers.forEach((a,i)=>tiers.slice(i+1).forEach(b=>{
  const lo=Math.max(a.from==null?-Infinity:a.from,b.from==null?-Infinity:b.from),hi=Math.min(a.to==null?Infinity:a.to,b.to==null?Infinity:b.to);
  if(lo<=hi)out.push('Rows '+serviceRateTierLabel(a)+' and '+serviceRateTierLabel(b)+' overlap');
 }));
 tiers.forEach(t=>{if(t.from!=null&&t.to!=null&&t.from>t.to)out.push('Row '+t.from+'–'+t.to+' mm: from is above to');});
 if(tiers.length&&!(tiers.length===1&&tiers[0].from==null&&tiers[0].to==null)){
  const mm=new Set();
  (DB.glassProduct||[]).forEach(g=>{if(g&&g.active!==false&&+g.thicknessMm>0)mm.add(+g.thicknessMm);});
  const gaps=[...mm].sort((a,b)=>a-b).filter(t=>!tiers.some(x=>(x.from==null||t>=x.from)&&(x.to==null||t<=x.to)));
  if(gaps.length)out.push('No row for catalog glass '+gaps.join(', ')+' mm');
 }
 if(!tiers.length)out.push('No price rows');
 return out;
}
/* Работа по значению: отверстия ищутся по диаметру — своя строка у каждой
   полосы диаметра, границы в карточке (до этапа 4 — в коде,
   salesPricingHoleBand). Нахлёст — null, как и в таблице цен. Выключенная
   строка находится, только если включённой нет: тогда отверстие встанет в счёт
   с её именем и без цены. */
function salesWorkForValue(family,value){
 const v=+value;if(!isFinite(v))return null;
 const fits=r=>r&&r.family===family&&(r.appliesFrom==null||v>=r.appliesFrom)&&(r.appliesTo==null||v<=r.appliesTo);
 const rows=DB.serviceRate||[],on=rows.filter(r=>fits(r)&&r.active!==false);
 if(on.length)return on.length===1?on[0]:null;
 const off=rows.filter(fits);
 return off.length===1?off[0]:null;
}
/* Диаметр отверстий, дюймы, включительно. Меньше 1/2″ своей полосы в прайсе
   нет — идёт по 1/2″–1″ (владелец, 18.10.2026: в DXF клиентов бывают 3/8″),
   поэтому у первой строки нижней границы нет. */
/* Порог ручного сверла 1 3/4″ — граница строк 1-1/16″–1-3/4″ (DRILL) и
   1-13/16″–2″ (CNC): станцию отверстия даёт строка его диапазона (этап 4,
   часть 3 плана Master Data), в коде порога больше нет. */
const SERVICE_HOLE_SEED={'hole:0.5-1':[null,1],'hole:1-2':[1.0625,1.75],'hole:1.75-2':[1.8125,2],'hole:2-3':[2.0625,3],'hole:3-4':[3.0625,4],'hole:4+':[4.0625,null]};
const SERVICE_RATE_SEED=[
 /* Четвёртое поле — СТАНЦИЯ. С 11 сентября 2026 работа несёт и станцию, и цену
    одной строкой: пока станция лежала отдельной таблицей цеха, маршрут и счёт
    читали разные источники и однажды разошлись бы. Сверловка и ЧПУ — две
    разные станции, зонтичная FAB упразднена. */
 ['clamp',            'Clamp',                 'pc',  'DRILL', [5,8,10]],
 ['hinge',            'Hinge',                 'pc',  'DRILL', [10,15,20]],
 /* Патч — та же петля под другим именем: «патч является тоже петлей, только
    имеет другое название». Цена принадлежит ВИДУ фурнитуры, а не модели. */
 ['patch',            'Patch',                 'pc',  'DRILL', [10,15,20]],
 /* Отверстия до 1 3/4" делают ручным сверлом, крупнее — на ЧПУ: свёрл такого
    размера у цеха нет. Полоса 1-1/16"-2" пересекала этот порог и выключена
    владельцем 11 сентября; с 22.10.2026 она разделена по станку, обе части
    без цены, пока её не введёт владелец. */
 ['hole:0.5-1',       'Hole 1/2″–1″',          'pc',  'DRILL', [5,6,7]],
 ['hole:1-2',         'Hole 1-1/16″–1-3/4″',   'pc',  'DRILL', [6,7,8],  false],
 ['hole:1.75-2',      'Hole 1-13/16″–2″',      'pc',  'CNC',   [6,7,8],  false],
 ['hole:2-3',         'Hole 2-1/16″–3″',       'pc',  'CNC',   [7,8,9]],
 ['hole:3-4',         'Hole 3-1/16″–4″',       'pc',  'CNC',   [8,12,15]],
 ['hole:4+',          'Hole over 4″',          'pc',  'CNC',   [10,15,25]],
 ['roughArris',       'Rough Arris',           'in',  'ARRIS',  [.01,.02,.03]],
 ['flatPolish',       'Flat Polish',           'in',  'POLISH',  [.07,.10,.13]],
 ['cncShapePolish',   'CNC Shape Polish',      'in',  'CNC',  [.28,.38,.48]],
 ['miter225',         'Mitering 22.5°',        'in',  'MITER',  [.28,.38,.45]],
 /* Митры 45° в прайсе нет; владелец 10 сентября: «столько же, сколько и 22,5».
    Отдельной строкой, а не ссылкой: когда цены разойдутся, правится одно
    число, а ключи сохранённых заказов не поедут. */
 ['miter45',          'Mitering 45°',          'in',  'MITER',  [.28,.38,.45]],
 ['radiusCorner',     'Radius Corner',         'pc',  'CNC',   [10,12,15]],
 ['notchHand',        'Notch by hand',         'pc',  'DRILL', [10,15,20]],
 ['notchCnc',         'Notch by CNC',          'pc',  'CNC',   [15,20,25]],
 ['cutout',           'Cutout',                'pc',  'CNC',   [15,20,25]],
 ['sandblastFull',    'Simple Sandblasting',   'ft²', 'SAND',  [4,4,4]],
 ['sandblastPattern', 'Pattern Sandblasting',  'ft²', 'SAND',  [6,6,6]]
].map(x=>normalizeServiceRate(Object.assign({id:x[0],name:x[1],unit:x[2],station:x[3],
  tiers:[{id:'6',to:7,price:x[4][0]},{id:'8-10',from:8,to:11,price:x[4][1]},{id:'12-19',from:12,to:19,price:x[4][2]}],active:x[5]!==false},
  SERVICE_HOLE_SEED[x[0]]?{family:'hole',appliesBy:'diameter',appliesFrom:SERVICE_HOLE_SEED[x[0]][0],appliesTo:SERVICE_HOLE_SEED[x[0]][1]}:{})))
/* Ставки, у которых цена одна на любую толщину. Разводить три одинаковые
   цифры значило бы придумать различие, которого у цеха нет; а появятся банды —
   владелец переключит вид строки на экране, кода это не потребует. */
.concat([
 ['lamiPolish',    'Lami Polish',          'in',  'POLISH', .28,  'One rate for any laminate thickness',  true],
 ['cncLamiPolish', 'CNC Lami Polish',      'in',  'CNC', .28,  'Price list: POLISH LAMI GLASS',        true],
 ['muntinSection', 'Muntin section',       'pc',  'IGU',  4.50, 'Bars are installed at IGU assembly'],
 /* Станция пустая намеренно: это надбавка за фигурность юнита, отдельной
    операции в цеху под неё нет. Владелец 11 сентября: «просто за то, что юнит
    фигурный и требует дополнительных работ». */
 ['shapeUnit',     'Shape Unit',           'ft²', '',     1.25, 'Surcharge for a shaped unit, by billable area'],
 /* Ступенчатый юнит (step / offset). Владелец, 20.10.2026: цена 0, «в будущем
    цена возможна — заложим загодя». Единицу можно сменить на экране: строка
    заказа берёт количество по ней (sales/step-unit). */
 ['stepUnit',      'Step Unit',            'pc',  'IGU',  0,    'Step / offset unit: extra sealant on the step',true],
 ['mirrorBacker',  'Mirror Safety Backer', 'ft²', 'SAND', 4,    ''],
 ['mirrorSealant', 'Mirror Edge Sealant',  'in',  'SAND', .07,  'By the finished contour perimeter, not by area']
].map(x=>normalizeServiceRate({id:x[0],name:x[1],unit:x[2],station:x[3],tiers:[{id:'flat',price:x[4]}],note:x[5],
  afterMerge:x[6]===true,stage:x[6]===true?'post_temper':'pre_temper'})))
/* Фацет. Полосы у него СВОИ: прайс владельца давал 3-8 / 10-15 / 13-19, то
   есть 9 мм не попадало никуда, а 13, 14 и 15 стоили одновременно 0.65 и 1.20.
   Владелец 11 сентября развёл: «до 15 — 0.65, с 16 — 1.20», девятка уходит в
   верхнюю полосу. До этапа 4 это были три строки работы с диапазоном толщины;
   теперь одна работа со своей таблицей. */
.concat([normalizeServiceRate({id:'bevel',name:'Beveling',unit:'in',station:'BEVEL',
  tiers:[{id:'3-8',to:8,price:.45},{id:'9-15',from:9,to:15,price:.65},{id:'16-19',from:16,to:19,price:1.20}]})])
/* Шаги маршрута, которые не выставляются отдельной строкой в счёт: резка
   заложена в цену стекла, печь — в термообработку, склейка и сборка пакета — в
   цену изделия. Работами они всё равно являются: у них есть станция и момент
   маршрута, и без них путь стекла по цеху обрывается. Ставки нет — и это не
   «цена ноль», а «отдельно не продаётся».

   Исключение — Heat Soak: он продаётся отдельной строкой счёта по площади
   каждого стекла с HST. Владелец 14 сентября 2026: $5 за ft² на любую толщину.
   Пятое и шестое поле — цена и единица; у остальных шагов их нет. */
.concat([
 ['cutting',            'Cutting',            'CUT',  'pre_temper'],
 ['ceramic_frit',       'Ceramic Frit',       'CERP', 'pre_temper'],
 ['digital_print',      'Digital Print',      'CERP', 'pre_temper'],
 ['tempering',          'Tempering',          'HEAT', 'heat'],
 ['heat_strengthening', 'Heat Strengthening', 'HEAT', 'heat'],
 ['heat_soak',          'Heat Soak',          'HEAT', 'heat', 5, 'ft²'],
 ['sandblasting',       'Sandblasting',       'SAND', 'any'],
 ['painting',           'Painting',           'PAINT','any'],
 ['lamination',         'Lamination',         'LAM',  'post_temper'],
 ['igu_assembly',       'IGU Assembly',       'IGU',  'post_temper']
].map(x=>normalizeServiceRate({id:x[0],name:x[1],station:x[2],stage:x[3],tiers:[{id:'flat',price:x[4]!=null?x[4]:null}],unit:x[5]||'pc'})));
/* Надбавки — работы с правилом (этап 4, часть 2). До этого — константы
   кода SALES_METRIC_RULE_DEFAULTS: минимум 4 ft², Triple +50 %, больше
   60 ft² +50 %, обе от базовой цены юнита. */
SERVICE_RATE_SEED.push(
 normalizeServiceRate({id:'minArea',name:'Minimum area',unit:'ft²',station:'',tiers:[{id:'flat',price:4}],rule:{kind:'minArea'},note:'Each unit is billed at least this area'}),
 normalizeServiceRate({id:'triple',name:'Triple unit',unit:'%',station:'',tiers:[{id:'flat',price:50}],rule:{kind:'percent',unitTypes:['triple'],priority:1}}),
 normalizeServiceRate({id:'largeUnit',name:'Large unit',unit:'%',station:'',tiers:[{id:'flat',price:50}],rule:{kind:'percent',areaOver:60,priority:2}}));
DEFAULT.serviceRate=SERVICE_RATE_SEED;
/* Перенос сохранённого прайса на этап 4: три строки фацета с диапазоном
   толщины становятся одной работой `bevel` с таблицей (цены владельца
   переезжают), у отверстий диапазон диаметра встаёт из заводского. */
function serviceRateStage4Migrate(){
 if(!Array.isArray(DB.serviceRate))return;
 const old=DB.serviceRate.filter(r=>r&&/^bevel:/.test(r.id)&&r.appliesBy==='thickness');
 if(old.length){
  if(!DB.serviceRate.some(r=>r&&r.id==='bevel'))DB.serviceRate.push(Object.assign({},old[0],{id:'bevel',name:'Beveling',family:'',appliesBy:'',appliesFrom:null,appliesTo:null,kind:undefined,flat:undefined,
   tiers:old.map(r=>({id:r.id.slice(6),from:r.appliesFrom||null,to:r.appliesTo,price:r.flat}))}));
  DB.serviceRate=DB.serviceRate.filter(r=>old.indexOf(r)<0);
 }
 /* Строка 1-1/16″–2″ делится по порогу ручного сверла один раз; цены и
    включённость владельца переезжают в обе части. */
 const h12=DB.serviceRate.find(r=>r&&r.id==='hole:1-2');
 if(h12&&h12.appliesBy==='diameter'&&+h12.appliesTo===2&&!DB.serviceRate.some(r=>r&&r.id==='hole:1.75-2')){
  if(h12.name==='Hole 1-1/16″–2″')h12.name='Hole 1-1/16″–1-3/4″';
  DB.serviceRate.push(Object.assign(JSON.parse(JSON.stringify(h12)),{id:'hole:1.75-2',name:'Hole 1-13/16″–2″',station:'CNC',appliesFrom:1.8125,appliesTo:2}));
  h12.appliesTo=1.75;
 }
 DB.serviceRate.forEach(r=>{const h=r&&SERVICE_HOLE_SEED[r.id];if(h&&!r.appliesBy)Object.assign(r,{family:'hole',appliesBy:'diameter',appliesFrom:h[0],appliesTo:h[1]});});
 /* Правила цены из настройки Pricing rules переезжают в надбавки со своими
    числами владельца — один раз, пока надбавок ещё нет. */
 const mr=DB.salesMetricRules;
 if(mr&&typeof mr==='object'&&!DB.serviceRate.some(r=>r&&r.id==='triple')){
  const n=(v,d)=>Number.isFinite(+v)&&+v>=0&&v!==''&&v!=null?+v:d,onTop=mr.combination==='compound';
  DB.serviceRate.push(Object.assign({},SERVICE_RATE_SEED.find(r=>r.id==='minArea'),{tiers:[{id:'flat',price:n(mr.minimumAreaFt2,4)}]}),
   Object.assign({},SERVICE_RATE_SEED.find(r=>r.id==='triple'),{tiers:[{id:'flat',price:n(mr.triplePercent,50)}],rule:{kind:'percent',unitTypes:['triple'],priority:1,onTop}}),
   Object.assign({},SERVICE_RATE_SEED.find(r=>r.id==='largeUnit'),{tiers:[{id:'flat',price:n(mr.largePercent,50)}],rule:{kind:'percent',areaOver:n(mr.largeThresholdFt2,60),priority:2,onTop}}));
 }
 delete DB.salesMetricRules;
}
/* Цвета, доступные выбранному продукту: свои плюс общие (без продукта). */
function spandrelColoursFor(productId){
 return (DB.spandrelColour||[]).filter(c=>c.active!==false&&(!c.productId||c.productId===productId));
}
function spandrelColourById(id){return (DB.spandrelColour||[]).find(c=>c.id===id)||null;}
function spandrelColourLabel(c){return c?(c.name+(c.code?' '+c.code:'')):'';}
/* Цвет спандрела хранится идентификатором строки справочника. У заказов,
   сохранённых до появления палитры, там лежит слово — 'Black', 'Bronze',
   'Custom'. Такое значение отдаётся как есть: заказ покажет его нетронутым, и
   человек выберет настоящий цвет сам. Молчаливая подмена «Bronze -> Harmony
   Bronze» была бы выдуманным за цех выбором, а цвет уходит в покраску. */
function spandrelColourText(value,note){
 const row=spandrelColourById(value);
 const label=row?spandrelColourLabel(row):mdString(value);
 const n=mdString(note);
 /* Заметка показывается только у строк БЕЗ кода производителя: у обычного
    цвета код уже говорит цеху, что заказывать, и повторное название только
    путало бы. */
 return (row&&!row.code&&n)?label+' · '+n:label;
}

/* --- 5. Нормализация -------------------------------------------------- */

/* ОДИН механизм пересборки справочника вместо четырёх почти одинаковых.

   Шаги у всех таблиц одни и те же: таблицы нет — берём заводскую; убираем
   отменённые заводские строки; доливаем недостающие заводские по id; гоняем
   миграции; нормализуем; выбрасываем негодные; при необходимости снимаем
   дубли. Различались они деталями — и именно расхождение этих деталей уже
   дважды стоило багов: Opaci Coat и Backpainting не доезжали до владельца,
   потому что долив был заведён у плёнки и забыт у спандрела; у палитры цветов
   долив есть, у спейсера нет, и никто не мог сказать, так задумано или
   недосмотрели.

   Теперь различия — ПАРАМЕТРЫ в одном месте, и «так задумано» видно глазом:

     seedWhenMissing  пустая таблица берётся из DEFAULT (по умолчанию) либо
                      остаётся пустой — как у точек поставки, где заводского
                      списка нет и быть не может;
     dropLegacy       отменённая заводская строка убирается ДО долива;
     topUp            недостающие заводские строки доливаются по id. Это не
                      пересев: правки владельца не трогаются, поэтому долив
                      стоит там, где таблица ушла из REFERENCE_TABLES ради
                      сохранности его позиций;
     migrate          разовый перенос по уже долитым строкам;
     repair           починка строки после нормализации (id из кода у стекла);
     valid            что считается годной строкой;
     dedupe           снять повторы по id.

   Порядок шагов важен и повторяет прежний: снять отменённые → долить →
   мигрировать → нормализовать. */
function mdRebuildTable(key,opts){
 const o=opts||{};
 if(!Array.isArray(DB[key]))DB[key]=o.seedWhenMissing===false?[]:JSON.parse(JSON.stringify(DEFAULT[key]||[]));
 if(o.dropLegacy)DB[key]=DB[key].filter(x=>!x||!o.dropLegacy(x));
 if(o.topUp)(DEFAULT[key]||[]).forEach(seed=>{if(!DB[key].some(x=>x&&x.id===seed.id))DB[key].push(JSON.parse(JSON.stringify(seed)));});
 if(o.migrate)DB[key].forEach(x=>{if(x)o.migrate(x);});
 let rows=DB[key].filter(x=>x&&typeof x==='object').map(o.normalize);
 if(o.repair)rows=rows.map(o.repair);
 rows=rows.filter(o.valid);
 if(o.dedupe){const seen=Object.create(null);rows=rows.filter(x=>x.id&&!seen[x.id]&&(seen[x.id]=true));}
 DB[key]=rows;
}
/* Материалы, которые нормализуются общей `normalizeSimpleMaterial`: таблица и
   её тип. Новый простой справочник добавляется строкой сюда и больше нигде. */
const MD_SIMPLE_MATERIALS=[['heatTreatment','heatTreatment'],['gasProduct','gas'],['sealantProduct','sealant'],['iguPart','iguPart'],
 ['interlayerProduct','interlayer'],['fritProduct','frit'],['spandrelProduct','spandrel'],['stockItem','stock']];

function normalizeMasterData(){
 mdRebuildTable('glassProduct',{
  normalize:normalizeGlassProduct,
  repair:p=>{if(!p.id&&p.code)p.id=glassProductId(p.code);return p;},
  valid:p=>p.id&&p.name,
  dedupe:true
 });
 glassApplySalePrices();

 /* Строка поставки на продукт, которого в каталоге нет, НЕ выбрасывается.
    Пользователь переименовывает коды каталога под цех, и выброшенная строка
    унесла бы с собой цену и срок — молча. Осиротевшая строка остаётся видимой
    на экране Master Data и чинится там же. */
 mdRebuildTable('glassSheet',{
  seedWhenMissing:false,
  normalize:normalizeGlassSheet,
  valid:s=>s.productCode&&s.supplier,
  dedupe:true
 });

 /* каталог пересобран — индекс базовых стёкол больше не действителен */
 glassInvalidateNameIndex();

 /* Долив стоит у плёнки, фрита и спандрела: эти таблицы убраны из
    REFERENCE_TABLES ради сохранности позиций владельца, и без долива
    заводские строки (Opaci Coat, Backpainting) не доехали бы до него вовсе.
    У плёнки вдобавок снимаются старые строки «толщина как товар», у спандрела
    отменённые типы выключаются, а не удаляются: на них ссылается старый заказ. */
 MD_SIMPLE_MATERIALS.forEach(pair=>{
  const k=pair[0],type=pair[1];
  mdRebuildTable(k,{
   dropLegacy:k==='interlayerProduct'?(x=>interlayerProductMigration(x.id)):null,
   topUp:k==='interlayerProduct'||k==='spandrelProduct'||k==='fritProduct',
   /* Фрит и спандрел получают работу по прежнему правилу кода маршрута
      (цифровая печать — digital_print, остальной фрит — ceramic_frit,
      спандрел — painting), один раз: пустую работу владелец мог выбрать сам. */
   migrate:k==='spandrelProduct'?(x=>{if(spandrelProductMigration(x.id))x.active=false;if(x.workId===undefined)x.workId='painting';})
    :k==='fritProduct'?(x=>{if(x.workId===undefined)x.workId=x.id==='FRIT-DIGITAL'?'digital_print':'ceramic_frit';}):null,
   normalize:x=>normalizeSimpleMaterial(x,type),
   valid:x=>x.id&&x.name
  });
 });
 /* Ставки услуг доливаются по той же причине: прайс ведёт владелец, и пересев
    стёр бы его цены. */
 serviceRateStage4Migrate();
 mdRebuildTable('serviceRate',{topUp:true,normalize:normalizeServiceRate,valid:r=>r.id&&r.name,dedupe:true});
 /* Палитра спандрела: заводские цвета доливаются по id, пользовательские не
    трогаются. Пустая таблица — не «нет цветов», а «ещё не заводили». */
 mdRebuildTable('spandrelColour',{topUp:true,normalize:normalizeSpandrelColour,valid:c=>c.id&&c.name,dedupe:true});
 /* У спейсера долива нет намеренно: номиналы ведёт владелец, и заводской
    список не должен возвращаться к нему после того, как он его подчистил. */
 /* Рецепты, системы рамок и перенос норм в карточки — до нормализации
    рамки: перенос читает старые поля строки. */
 normalizeSurround();
 mdRebuildTable('spacerVariant',{
  normalize:x=>Object.assign(materialHeader(x,'igu','spacer'),{id:mdString(x.id),system:mdString(x.system),size:mdString(x.size),thicknessMm:mdNum(x.thicknessMm),name:mdString(x.name)||[mdString(x.system),mdString(x.size)].filter(Boolean).join(' '),code:mdString(x.code),availability:mdAvailability(x.availability),supplier:mdString(x.supplier),leadTimeDays:mdNum(x.leadTimeDays),salePrice:mdNonNeg(x.salePrice),salesUnit:mdString(x.salesUnit),...mdSaleRulesOf(x),stockingUnit:mdString(x.stockingUnit),note:mdString(x.note),sellsAsOwnLine:x.sellsAsOwnLine===true,active:x.active!==false,
   recipeId:mdString(x.recipeId),weightG:mdNonNeg(x.weightG),weightPer:SPACER_WEIGHT_PER[x.weightPer]?x.weightPer:'ft2',weightMeasured:x.weightMeasured===true}),
  valid:x=>x.id&&x.system&&x.size
 });
}

/* --- 6. Выборки ------------------------------------------------------- */

/* Этап 2 схемы, часть вторая: ОДИН ДОСТУП. Девять таблиц физически на месте,
   но спрашивать «какие есть материалы этой категории» теперь можно один раз,
   не зная, в какой таблице они лежат. Пара `{table,row}`, а не голая строка:
   таблица нужна для записи назад, и выводить её из категории обратным
   отображением значило бы держать знание в двух местах. */
function materialTables(){return Object.keys(MATERIAL_TABLE_MAP);}
function materialEntries(category){
 const out=[];
 materialTables().forEach(table=>{
  if(category&&MATERIAL_TABLE_MAP[table].category!==category)return;
  (DB[table]||[]).forEach(row=>{if(row&&typeof row==='object')out.push({table,row});});
 });
 return out;
}
function materialById(id){
 if(!id)return null;
 const hit=materialEntries().find(e=>e.row.id===id);
 return hit||null;
}
/* Живые — то же правило, что у `activeSimple`: снятое с производства уходит
   из выбора, отсутствие на складе остаётся пометкой «по предзаказу». */
function materialEntriesActive(category){
 return materialEntries(category).filter(e=>e.row.active!==false&&e.row.availability!=='inactive');
}
function materialSubcategories(category){
 const seen=[];
 materialEntries(category).forEach(e=>{const s=mdString(e.row.subcategory);if(s&&seen.indexOf(s)<0)seen.push(s);});
 return seen;
}
/* Запись каталога по id — в отрисовке по указателю (erp/read-scope, П4 «Базы»). */
function mdById(key,id){
 if(readOn())return readMemo('mdById:'+key,[DB[key]],()=>{const m=new Map();(DB[key]||[]).forEach(x=>{if(x&&!m.has(x.id))m.set(x.id,x);});return m;}).get(id)||null;
 return (DB[key]||[]).find(x=>x.id===id)||null;
}
function glassProductById(id){return mdById('glassProduct',id);}
function glassProductByCode(code){const c=mdString(code).toUpperCase();return (DB.glassProduct||[]).find(x=>x.code.toUpperCase()===c)||null;}
/* Из выбора выпадает только снятое с производства. Отсутствие на складе —
   не запрет, а пометка «по предзаказу»: пользователь начал разговор именно
   с того, что заказать можно и то, чего у него нет. */
function activeGlassProducts(){return (DB.glassProduct||[]).filter(x=>x.active!==false);}
function activeSimple(key){return (DB[key]||[]).filter(x=>x.active!==false&&x.availability!=='inactive');}
function glassIsPreorder(g){return !!g&&g.stocked!==true&&g.cut!==false;}
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
 return row[1]||row[0];
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
  sfReject(rep,0,'','this file does not look like GLASS_SHEETS.csv: no code and supplier columns');
  return rep;
 }
 const has=c=>header.includes(c);
 parsed.rows.forEach((r,n)=>{
  const line=n+2,code=mdString(r.code),supplier=mdString(r.supplier);
  const label=code+(supplier?' · '+supplier:'');
  if(!code)return sfReject(rep,line,'','empty product code');
  if(!supplier)return sfReject(rep,line,code,'empty supply point');
  const product=glassProductByCode(code);
  if(!product)return sfReject(rep,line,label,'product '+code+' is not in the catalogue');
  if(has('thickness_mm')){
   const t=mdNum(r.thickness_mm);
   if(t!=null&&product.thicknessMm!=null&&t!==product.thicknessMm)
    return sfReject(rep,line,label,'thickness '+t+' mm does not match the catalogue ('+product.thicknessMm+' mm)');
  }
  const cur=mdString(r.currency).toUpperCase();
  if(cur&&!CURRENCY_RE.test(cur))return sfReject(rep,line,label,'currency: three-letter currency code, for example CAD');
  const wIn=mdNonNeg(r.sheet_w_in),hIn=mdNonNeg(r.sheet_h_in);
  if(has('sheet_w_in')&&has('sheet_h_in')&&(wIn==null)!==(hIn==null))
   return sfReject(rep,line,label,'sheet size is filled in as a pair: sheet_w_in and sheet_h_in');
  const unit=mdUnitCode(r.purchase_unit,'');
  if(mdString(r.purchase_unit)&&!unit)
   return sfReject(rep,line,label,'purchase_unit: unknown unit, expected '+MD_UNITS.map(u=>u.code).join(' · '));
  const price=mdNonNeg(r.purchase_price);
  if(mdString(r.purchase_price)&&price==null)return sfReject(rep,line,label,'purchase_price: a non-negative number');
  const lead=mdInt(r.lead_time_days);
  if(mdString(r.lead_time_days)&&lead==null)return sfReject(rep,line,label,'lead_time_days: a non-negative whole number');
  const avail=mdString(r.availability).toLowerCase();
  if(avail&&!MATERIAL_AVAILABILITY.includes(avail))
   return sfReject(rep,line,label,'availability: expected '+MATERIAL_AVAILABILITY.join(' · '));
  const priceDate=mdString(r.price_date);
  if(priceDate&&!ISO_DATE_RE.test(priceDate))return sfReject(rep,line,label,'price_date: a date in YYYY-MM-DD form');

  const key=glassSheetKey(product.code,supplier,wIn,hIn);
  if(inFile[key])return sfReject(rep,line,label,'the same supply point and sheet size repeat in this file');
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
 if(typeof normalizePurchasing==='function')normalizePurchasing();
 return rep;
}

/* ---------- Вес стекла ----------
   Считается от ФАКТИЧЕСКОЙ толщины: «10 mm» стекло на деле 9.7 mm, и на
   больших листах разница уже видна в накладной. Номинал берётся только когда
   фактического значения в каталоге нет — тогда вес помечается приблизительным.
   Плотность стекла — норма веса «glass» в Data → Weight norms (план Master
   Data, этап 5); засев 2500 кг/м³. Нормы нет — веса нет, без выдумки. */
const GLASS_DENSITY_SEED_KG_M3=2500;
function glassDensityKgM3(order){const v=salesWeightRate('glass',order);return v>0?v:null;}
const GLASS_M2_PER_FT2=0.09290304;
function glassEffectiveThicknessMm(product){
  var a=product&&+product.actualThicknessMm;
  if(isFinite(a)&&a>0)return {mm:a,exact:true};
  var n=product&&+product.thicknessMm;
  return isFinite(n)&&n>0?{mm:n,exact:false}:{mm:0,exact:false};
}
/* Вес слоя известной толщины. Ламинат — это стёкла И плёнка между ними, и
   каждый слой считается своей плотностью. */
function glassLayerWeightKg(mm,density,areaFt2){
  var a=+areaFt2;
  if(!(+mm>0)||!isFinite(a)||a<=0)return 0;
  return a*GLASS_M2_PER_FT2*(+mm/1000)*density;
}
/* areaFt2 — площадь ОДНОГО стекла. Возвращает {kg, exact} либо null. */
function glassWeightKg(product,areaFt2){
  var t=glassEffectiveThicknessMm(product),a=+areaFt2,d=glassDensityKgM3();
  if(!(t.mm>0)||!isFinite(a)||a<=0||!d)return null;
  return {kg:glassLayerWeightKg(t.mm,d,areaFt2),exact:t.exact};
}
function glassWeightText(product,areaFt2){
  var w=glassWeightKg(product,areaFt2);
  if(!w)return '';
  return (w.exact?'':'~')+(w.kg>=10?Math.round(w.kg):w.kg.toFixed(1))+' kg';
}
