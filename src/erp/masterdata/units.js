/* =====================================================================
   erp/masterdata/units  ·  masterdata-1.0
   Единицы измерения справочников.
   IN : —
   OUT: MD_UNITS · MD_UNIT_CALCS
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.

   ЕДИНИЦА — ЭТО ТРИ РАЗНЫХ ВОПРОСА, А НЕ ОДИН

   Пользователь назвал их прямо: закупка, хранение, продажа. У одного и того
   же товара они расходятся, и держать одну колонку «единица» значит однажды
   посчитать не то:

     закупка   в чём поставщик даёт ЦЕНУ           стекло — sq ft, герметик — карton
     хранение  в чём считаем ОСТАТОК на складе     стекло — sq ft, штапик — лист
     продажа   в чём выставляем клиенту            стекло — sq ft, услуга — штука

   Закупка принадлежит СТРОКЕ ПОСТАВКИ (один продукт у двух поставщиков может
   стоить за разные единицы), хранение и продажа — самому продукту.

   КАЛЬКУЛЯЦИЯ — САМОЕ ВАЖНОЕ ПОЛЕ

   Она отвечает, как из детали получается количество, и без неё единица — просто
   надпись:

     area    площадь детали      sq ft · sq m
     linear  длина или периметр  дюйм · фут · метр
     flat    штуки как есть      лист · штука · коробка · кг

   Именно поэтому не всякий товар покупается квадратными футами: коробку
   пластин или бочку герметика площадью не мерят, а на складе они лежат рядом
   со стеклом. Список открытый — новые единицы дописываются сюда.
   ===================================================================== */

const MD_UNIT_CALCS=['area','linear','flat'];
/* nameEn заполнен у каждой строки намеренно: имя единицы приходит из этого
   файла, а не из словаря интерфейса — так в EN не остаётся русского даже
   там, где строку показывает таблица, собранная данными. */
const MD_UNITS=[
 {code:'sqft',  calc:'area',  name:'кв. фут',   nameEn:'sq ft'},
 {code:'sqm',   calc:'area',  name:'кв. метр',  nameEn:'sq m'},
 {code:'inch',  calc:'linear',name:'дюйм',      nameEn:'inch'},
 {code:'ft',    calc:'linear',name:'фут',       nameEn:'ft'},
 {code:'m',     calc:'linear',name:'метр',      nameEn:'m'},
 {code:'each',  calc:'flat',  name:'штука',     nameEn:'each'},
 {code:'sheet', calc:'flat',  name:'лист',      nameEn:'sheet'},
 {code:'lite',  calc:'flat',  name:'деталь',    nameEn:'lite'},
 {code:'box',   calc:'flat',  name:'коробка',   nameEn:'box'},
 {code:'carton',calc:'flat',  name:'картон',    nameEn:'carton'},
 {code:'bag',   calc:'flat',  name:'мешок',     nameEn:'bag'},
 {code:'drum',  calc:'flat',  name:'бочка',     nameEn:'drum'},
 {code:'roll',  calc:'flat',  name:'рулон',     nameEn:'roll'},
 {code:'kg',    calc:'flat',  name:'кг',        nameEn:'kg'},
 {code:'lb',    calc:'flat',  name:'фунт',      nameEn:'lb'},
 {code:'liter', calc:'flat',  name:'литр',      nameEn:'liter'}
];
/* Написания, в которых единица приезжает из чужого файла. Прайс поставщика
   пишет `SQ FT`, выгрузка Spil — `ft2`, Excel — `sq. ft.`; всё это одна и та
   же единица, и отклонять её строкой отчёта было бы издевательством. */
const MD_UNIT_ALIASES={
 'ft2':'sqft','sf':'sqft','sqft':'sqft','sq ft':'sqft','sq.ft':'sqft','sq. ft.':'sqft','sqfeet':'sqft','square foot':'sqft','square feet':'sqft',
 'm2':'sqm','sqm':'sqm','sq m':'sqm','кв.м':'sqm','кв м':'sqm',
 'in':'inch','inch':'inch','inches':'inch','"':'inch',
 'foot':'ft','feet':'ft','lin ft':'ft','lft':'ft',
 'meter':'m','metre':'m','mtr':'m',
 'ea':'each','pc':'each','pcs':'each','piece':'each','pieces':'each','unit':'each','units':'each',
 'sheets':'sheet','plate':'sheet','lites':'lite',
 'boxes':'box','ctn':'carton','cartons':'carton','bags':'bag','drums':'drum','brum':'drum','rolls':'roll',
 'kgs':'kg','kilogram':'kg','lbs':'lb','pound':'lb','pounds':'lb',
 'l':'liter','ltr':'liter','litre':'liter','liters':'liter','litres':'liter'
};

function mdUnit(code){const c=String(code==null?'':code).trim().toLowerCase();return MD_UNITS.find(u=>u.code===c)||null;}
/* Приведение к коду списка. Пустая строка не угадывается: вызывающий сам
   решает, чем заполнить пропуск — у стекла это sq ft, у бочки герметика нет. */
function mdUnitCode(v,fallback){
 const raw=String(v==null?'':v).trim().toLowerCase();
 if(!raw)return fallback||'';
 const direct=mdUnit(raw);if(direct)return direct.code;
 const alias=MD_UNIT_ALIASES[raw]||MD_UNIT_ALIASES[raw.replace(/[\s.]+/g,'')];
 return alias||(fallback||'');
}
/* Калькуляция берётся у единицы, а не хранится второй раз рядом с ней: два
   поля об одном означают два ответа, и однажды они разойдутся. */
function mdUnitCalc(code){const u=mdUnit(code);return u?u.calc:'';}
/* Имя единицы на языке интерфейса. Не перевод словарём — обе колонки
   заполнены здесь, язык только выбирает нужную (тот же приём, что sfName). */
function mdUnitName(code){const u=mdUnit(code);if(!u)return String(code==null?'':code);return (typeof LANG!=='undefined'&&LANG==='en')?u.nameEn:u.name;}
