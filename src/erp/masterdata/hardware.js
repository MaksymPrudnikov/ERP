/* =====================================================================
   erp/masterdata/hardware  ·  masterdata-1.0
   Справочник фурнитуры: ВИДЫ (петля, зажим, патч, …) и МОДЕЛИ (Vienna 180).
   IN : —
   OUT: DEFAULT.hardwareKind · DEFAULT.hardwareModel · нормализация DB
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.

   ПОЧЕМУ В СПРАВОЧНИКЕ ТОЛЬКО ИМЯ, А НЕ ГЕОМЕТРИЯ ПОСАДОЧНОГО МЕСТА

   Решение владельца 31 августа 2026, дословно: «у нас нет машины которая
   считает геометрию и потом вырезает петли — это делает человек, у него есть
   заготовленные шаблоны петель, он видит например Vienna 180 и использует тот
   шаблон». Значит цеху нужно ЧТО и ГДЕ, а не как вырезать: название модели
   плюс расстояние по кромке. Рисовать вырез под петлю ERP не должна — она бы
   выдумала размеры, которых никто не проверял, и они уехали бы в файл реза.

   Отсюда главное следствие: петля, зажим и патч остаются МЕТКАМИ на чертеже
   (manufacturingItems) и по-прежнему не меняют Cutting Shape / Cutting DXF.
   Меняет рез только настоящая геометрия — внутренний вырез и радиусный угол.

   Когда появится станок, который режет посадочные места, к записи модели
   доцепится геометрия шаблона, и те же самые метки начнут отдавать вырезы.
   Заказы переделывать не придётся: в них уже лежит id модели и её имя.

   ПОЧЕМУ ВИДЫ — ТАБЛИЦА, А НЕ КОНСТАНТА В КОДЕ

   Просьба владельца: «создать так, чтобы я потом мог добавлять информацию о
   петлях, пивотах и клемах и прочее». Пивота в списке нет вовсе — значит
   добавлять придётся не только модели, но и сами виды. Список видов, зашитый
   в код, означал бы правку кода на каждую новую железку.

   ЧТО ХРАНИТ ЗАКАЗ. Строка заказа хранит id модели И её имя на момент выбора.
   Имя — снимок: справочник можно переименовать, а старый заказ обязан
   показывать то, что заказывали. Тот же приём, что со ставками каталога.
   ===================================================================== */

/* Код вида — латиница, потому что он уезжает в тип метки на чертеже и в ключ
   прайса (`MI:hinge`). Имя вида может быть любым, код — нет. */
const HW_CODE_RE=/^[a-z][a-z0-9_-]{0,23}$/;
/* Размещение подтверждено одно: фурнитура ставится на готовую кромку. Точка
   внутри стекла — это отверстие, у него своя единица и свой прайс по диаметру.
   Появится железка, которую ставят иначе, — здесь добавится второе значение,
   и вместе с ним ветка размещения в редакторе. Заводить её сейчас «на всякий
   случай» нельзя: непроверенная ветка размещения — это неверный чертёж. */
const HW_PLACES=['edge'];

function hwStr(v){return String(v==null?'':v).trim();}
function hwCode(v){return hwStr(v).toLowerCase().replace(/\s+/g,'-');}
function hwNewId(prefix){
  if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return prefix+crypto.randomUUID();
  return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
}
/* Короткий код на чертеже. HNG и CLMP уже стоят на старых чертежах и в прайсе
   (`HNGS`, `CLMP`), поэтому у заводских видов они именно такие. */
function hwShort(v,fallback){
  var s=hwStr(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
  return s?s.slice(0,6):String(fallback||'').toUpperCase().slice(0,6);
}

/* Заводские виды. `system:true` означает «строка пришла из кода». Признак
   информационный: он не даёт прав ни коду, ни владельцу — заводскую строку
   можно переименовать и удалить наравне с любой другой. */
/* Имена заводских видов английские в обеих колонках: в цеху фурнитуру называют
   по-английски (Vienna 180, PH20, SCU4), и русский ярлык рядом с ними читался бы
   как другая сущность. Владелец может переименовать вид в справочнике. */
DEFAULT.hardwareKind=[
 {code:'hinge',name:'Hinge',nameEn:'Hinge',short:'HNG',place:'edge',active:true,system:true,note:''},
 {code:'clamp',name:'Clamp',nameEn:'Clamp',short:'CLMP',place:'edge',active:true,system:true,note:''},
 {code:'patch',name:'Patch',nameEn:'Patch',short:'PATCH',place:'edge',active:true,system:true,note:''}
];
/* Модели из списка владельца (31 августа 2026). Имена записаны ровно так, как
   он их прислал: по этому имени человек в цеху находит свой шаблон, и
   «причёсанное» имя означало бы, что он ищет не то.

   `Zoom` есть и у зажимов, и у патчей — это разные изделия одного бренда,
   поэтому у них разные id и разные виды.

   Строки `Custom` из списка сюда НЕ попадают: «своя модель» — это не позиция
   каталога, а ввод текстом в самой метке. Иначе в справочнике завелись бы три
   одинаковые строки-заглушки, на которые ссылались бы разные заказы. */
DEFAULT.hardwareModel=[
 {id:'hw-hinge-vienna-180',   kind:'hinge',name:'Vienna 180',    series:'Vienna',thickness:'',supplierCode:'',active:true,system:true,note:''},
 {id:'hw-hinge-vienna-135-45',kind:'hinge',name:'Vienna 135 / 45',series:'Vienna',thickness:'',supplierCode:'',active:true,system:true,note:''},
 {id:'hw-hinge-vienna-90',    kind:'hinge',name:'Vienna 90',     series:'Vienna',thickness:'',supplierCode:'',active:true,system:true,note:''},
 {id:'hw-hinge-vienna-37',    kind:'hinge',name:'Vienna 37',     series:'Vienna',thickness:'',supplierCode:'',active:true,system:true,note:''},
 {id:'hw-hinge-geneva-180',   kind:'hinge',name:'Geneva 180',    series:'Geneva',thickness:'',supplierCode:'',active:true,system:true,note:''},
 {id:'hw-hinge-geneva-135-45',kind:'hinge',name:'Geneva 135 / 45',series:'Geneva',thickness:'',supplierCode:'',active:true,system:true,note:''},
 {id:'hw-hinge-geneva-90',    kind:'hinge',name:'Geneva 90',     series:'Geneva',thickness:'',supplierCode:'',active:true,system:true,note:''},
 {id:'hw-hinge-geneva-37',    kind:'hinge',name:'Geneva 37',    series:'Geneva',thickness:'',supplierCode:'',active:true,system:true,note:''},
 {id:'hw-clamp-scu4',    kind:'clamp',name:'SCU4',    series:'',thickness:'',supplierCode:'',active:true,system:true,note:''},
 {id:'hw-clamp-uc77',    kind:'clamp',name:'UC77',    series:'',thickness:'',supplierCode:'',active:true,system:true,note:''},
 {id:'hw-clamp-zoom',    kind:'clamp',name:'Zoom',    series:'',thickness:'',supplierCode:'',active:true,system:true,note:''},
 {id:'hw-clamp-zenzone', kind:'clamp',name:'ZenZone', series:'',thickness:'',supplierCode:'',active:true,system:true,note:''},
 {id:'hw-patch-ph20',    kind:'patch',name:'PH20',    series:'',thickness:'',supplierCode:'',active:true,system:true,note:''},
 {id:'hw-patch-zoom',    kind:'patch',name:'ZOOM',    series:'',thickness:'',supplierCode:'',active:true,system:true,note:''}
];

function normalizeHardwareKind(raw){
  raw=raw&&typeof raw==='object'?raw:{};
  var code=hwCode(raw.code);if(!HW_CODE_RE.test(code))return null;
  var name=hwStr(raw.name),nameEn=hwStr(raw.nameEn);
  if(!name&&!nameEn)return null;
  return {code:code,name:name||nameEn,nameEn:nameEn||name,
    short:hwShort(raw.short,code),
    place:HW_PLACES.indexOf(raw.place)>=0?raw.place:'edge',
    active:raw.active!==false,system:raw.system===true,note:hwStr(raw.note)};
}
function normalizeHardwareModel(raw){
  raw=raw&&typeof raw==='object'?raw:{};
  var name=hwStr(raw.name);if(!name)return null;
  var kind=hwCode(raw.kind);if(!HW_CODE_RE.test(kind))return null;
  return {id:hwStr(raw.id)||hwNewId('hw-'),kind:kind,name:name.slice(0,60),
    series:hwStr(raw.series).slice(0,40),
    /* Толщина стекла и артикул поставщика — справка для менеджера, а не
       расчётные поля: владелец назвал их необязательными, а считать по строке
       вроде «3/8″ · 1/2″» всё равно нечего. */
    thickness:hwStr(raw.thickness).slice(0,40),
    supplierCode:hwStr(raw.supplierCode).slice(0,40),
    active:raw.active!==false,system:raw.system===true,note:hwStr(raw.note).slice(0,200)};
}
/* Заводской засев идёт ОДИН раз на версию, а не при каждой загрузке. Разница
   принципиальная: удалённую владельцем заводскую модель обратно не возвращает.
   Строка, которая после удаления приходит снова, читается как поломка, и
   владелец удалял бы её каждое утро.

   Версия живёт В ДАННЫХ (как refVersion), поэтому чужой импорт со старым
   справочником тоже досеется. Когда в код добавят новые заводские строки —
   поднять HW_SEED_VERSION: они приедут один раз, вместе с теми, что владелец
   успел удалить. Это цена того, что список удалённых нигде не хранится.

   Именно поэтому hardwareKind / hardwareModel НЕ входят в REFERENCE_TABLES:
   там пересев заменяет таблицу целиком и стёр бы записи владельца (erp/data). */
const HW_SEED_VERSION=2;
DEFAULT.hardwareSeed=0;
function normalizeHardwareCatalog(){
  if(!Array.isArray(DB.hardwareKind))DB.hardwareKind=[];
  var kSeen=Object.create(null);
  DB.hardwareKind=DB.hardwareKind.map(normalizeHardwareKind).filter(function(k){
    if(!k||kSeen[k.code])return false;kSeen[k.code]=true;return true;});
  if(!Array.isArray(DB.hardwareModel))DB.hardwareModel=[];
  var mSeen=Object.create(null);
  DB.hardwareModel=DB.hardwareModel.map(normalizeHardwareModel).filter(function(m){
    if(!m||mSeen[m.id])return false;mSeen[m.id]=true;return true;});
  var have=Number.isInteger(+DB.hardwareSeed)?+DB.hardwareSeed:0;
  if(have<HW_SEED_VERSION){
    DEFAULT.hardwareKind.forEach(function(seed){
      if(!kSeen[seed.code]){DB.hardwareKind.push(normalizeHardwareKind(seed));kSeen[seed.code]=true;}
    });
    DEFAULT.hardwareModel.forEach(function(seed){
      if(!mSeen[seed.id]){DB.hardwareModel.push(normalizeHardwareModel(seed));mSeen[seed.id]=true;}
    });
    DB.hardwareSeed=HW_SEED_VERSION;
  }
  /* Модель без своего вида НЕ выбрасывается: вид могли выключить или
     переименовать, а вместе с моделью ушла бы ссылка из старого заказа. Она
     остаётся видимой на экране справочника и чинится там же — тот же приём,
     что с осиротевшей строкой поставки (см. erp/masterdata/glass). */
}

function hardwareKindRow(code){
  code=hwCode(code);
  return (DB.hardwareKind||[]).find(function(k){return k.code===code;})||null;
}
function hardwareKinds(includeInactive){
  return (DB.hardwareKind||[]).filter(function(k){return includeInactive||k.active!==false;});
}
/* Имя вида на языке интерфейса. Не перевод словарём: обе колонки заполнены в
   данных, язык только выбирает нужную (тот же приём, что sfName). */
function hardwareKindName(code){
  var k=hardwareKindRow(code);
  if(!k)return String(code==null?'':code);
  return (typeof LANG!=='undefined'&&LANG==='en')?(k.nameEn||k.name):(k.name||k.nameEn);
}
function hardwareKindShort(code){
  var k=hardwareKindRow(code);
  return k?k.short:hwShort(code,code);
}
function hardwareKindIsKnown(code){return !!hardwareKindRow(code);}
function hardwareModelById(id){
  id=hwStr(id);if(!id)return null;
  return (DB.hardwareModel||[]).find(function(m){return m.id===id;})||null;
}
/* Список моделей вида для выпадашки. Сортировка: серия, затем имя — так
   Vienna 90 / 135 / 180 стоят рядом, а не вперемешку с Geneva. */
function hardwareModelsFor(kind,includeInactive){
  kind=hwCode(kind);
  return (DB.hardwareModel||[]).filter(function(m){
    return m.kind===kind&&(includeInactive||m.active!==false);
  }).sort(function(a,b){
    var s=String(a.series||'').localeCompare(String(b.series||''));
    return s||String(a.name||'').localeCompare(String(b.name||''));
  });
}
/* Имя модели для показа. Приоритет — снимок в самой метке: справочник могли
   переименовать после того, как заказ приняли. */
function hardwareItemModelName(item){
  if(!item)return '';
  var snapshot=hwStr(item.model);if(snapshot)return snapshot;
  var row=hardwareModelById(item.modelId);
  return row?row.name:'';
}
function hardwareItemIsCustomModel(item){
  return !!(item&&!hwStr(item.modelId)&&hwStr(item.model));
}
