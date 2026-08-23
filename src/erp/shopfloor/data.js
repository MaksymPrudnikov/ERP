/* =====================================================================
   erp/shopfloor/data  ·  shopfloor-1.0
   Четыре РАЗНЫЕ сущности цеха, которые Spil держал в одной таблице.
   IN : templates/STATIONS.csv · templates/WORK_POSITIONS.csv
   OUT: DEFAULT.station · DEFAULT.operation · DEFAULT.workPosition · DEFAULT.terminal
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.

   ПОЧЕМУ ЧЕТЫРЕ ТАБЛИЦЫ, А НЕ ОДНА (хендофф, разделы 9м · 9н)

   В Spil «станция» означала сразу три вещи, и от этого ломались данные:
   экран сканирования, шаг маршрута и станок. Скан говорил «на CNC сделано»,
   но не говорил КАКАЯ операция — следующая запись ложилась на то же место и
   затирала предыдущую. Самый дорогой случай, названный пользователем: `CNC`
   показывал, что петли уже выполнены, хотя их не делали. Деталь уезжала без
   петель, а закалённое стекло не досверливается.

   Здесь эти три вещи разъехались, и к ним добавилась четвёртая:

     station      шаг маршрута, ровно 11, у каждого порядок и always/optional
     operation    что именно делают: единица, stage до/после печи
     workPosition где делают: габарит, batch_mode, список операций
     terminal     экран сканирования — ТОЛЬКО ввод, ключом шага не бывает

   Отдельно, чтобы не потерялось: подстанции Spil (cutting1 / cutting2) сюда
   НЕ переносятся ни одной строкой. Это были люди, станки, операции и смены
   вперемешку — все они разрезы журнала событий, а не единицы цеха.
   ===================================================================== */

const SF_STAGES=['pre_temper','heat','post_temper','any'];
const SF_KINDS=['machine','manual'];
const SF_BATCH_MODES=['single','batch'];
/* Единица услуги. `null` — «ещё не подтверждена пользователем», и это
   рабочее состояние: выдумывать единицу нельзя, на ней стоит цена. */
const SF_UNITS=['in','ft2','pcs','lb'];

function sfStr(v){return String(v==null?'':v).trim();}
function sfCode(v){return sfStr(v).toUpperCase();}
function sfNum(v){if(v==null||v==='')return null;const n=+v;return Number.isFinite(n)&&n>0?n:null;}
const SF_CODE_RE=/^[A-Z0-9][A-Z0-9_-]{0,39}$/;
const SF_OP_CODE_RE=/^[a-z0-9][a-z0-9_]{0,39}$/;

/* =====================================================================
   1. СТАНЦИИ — 11 шагов маршрута. Источник: templates/STATIONS.csv,
   колонка always_or_optional заполнена пользователем.

   Имена по правилу из раздела 9н: СТАНЦИЯ НАЗЫВАЕТСЯ ПО ТИПУ РАБОТЫ, а
   конкретная операция живёт услугой и печатается на стикере. Поэтому
   `POLISH` стал `EDGE` (на станции три операции), `Tempering` стал `HEAT`
   (три обработки), а `CNC` стал `FAB` — CNC это железо, а не тип работы.
   `HEAT` вместо `TEMP` уводит от тройной коллизии, где `TEMP` означал
   шаблон в услугах, стекло клиента на складе и печь в подстанциях.

   Мойки среди станций НЕТ намеренно: она не шаг маршрута, а часть операций
   термообработки и сборки стеклопакета. Как рабочее место она существует —
   её габарит ограничивает деталь.

   name / nameEn лежат ОБА: пользователь заполнил в CSV обе колонки, и
   выбрасывать половину его данных ради словаря i18n незачем. Переключатель
   языка берёт нужную колонку, а не переводит содержимое базы. */
DEFAULT.station=[
 {seq:1, code:'CUT',  name:'Резка',                  nameEn:'Cutting',        always:true,  note:'режется только отожжённое стекло'},
 {seq:2, code:'EDGE', name:'Кромка',                 nameEn:'Edge work',      always:false, note:'услуги: arris (machine/hand) · polish · cnc shape polish · miter · lami polish'},
 {seq:3, code:'FAB',  name:'Обработка тела стекла',  nameEn:'Fabrication',    always:false, note:'услуги: hole · notch · cutout · radius · hinge · clamp. Работа по телу стекла, в отличие от EDGE — по периметру'},
 {seq:4, code:'CERP', name:'Силкскрин',              nameEn:'Ceramic paint',  always:false, note:'услуги: ceramic frit (3 узора) · digital ceramic print'},
 {seq:5, code:'HEAT', name:'Термообработка',         nameEn:'Heat treatment', always:false, note:'услуги: tempering · heat strengthening · heat soak. Вся механика до неё'},
 {seq:6, code:'SAND', name:'Пескоструй',             nameEn:'Sandblasting',   always:false, note:'позиция в маршруте зависит от того, есть ли термообработка'},
 {seq:7, code:'PAINT',name:'Покраска',               nameEn:'Painting',       always:false, note:'услуги: opaci-coat standard/custom · backpainting'},
 {seq:8, code:'LAM',  name:'Ламинация',              nameEn:'Lamination',     always:false, note:'lead time 3 дня, у остальных 1. Точка слияния компонентов'},
 {seq:9, code:'IGU',  name:'Сборка стеклопакета',    nameEn:'IGU assembly',   always:false, note:'мойка входит в операцию. Точка слияния компонентов'},
 {seq:10,code:'SHIPR',name:'Готово к отгрузке',      nameEn:'Shipping ready', always:true,  note:''},
 {seq:11,code:'SHIP', name:'Отгрузка',               nameEn:'Shipping',       always:true,  note:'включает монтаж — развести при проектировании отгрузки'}
];

/* =====================================================================
   2. ОПЕРАЦИИ — что именно делают. Коды взяты из колонки `operations`
   файла WORK_POSITIONS.csv: это тот список, который заполнил пользователь.

   `stage` — свойство ОПЕРАЦИИ, а не станции, и это принципиально (9м §4).
   Одно и то же ЧПУ делает отверстия ДО печи и полирует ламинат ПОСЛЕ неё.
   Если бы stage принадлежал станции или станку, третий визит на CNC1 затёр
   бы первый — ровно та ошибка, которая была у Spil.

   `unit` заполнен ТОЛЬКО там, где единица подтверждена источником:
     · периметровые услуги — дюйм (9о §3: «какой периметр мы продали за год»);
     · fabrication — штука (стикер печатает «2 hole · 2 hng · 3 clamp»,
       а прайс раздела 9и даёт диапазоны цены по диаметру отверстия).
   Остальные оставлены пустыми намеренно. На единице стоит цена; выдуманная
   единица тише и опаснее пустой, потому что в неё верят. */
DEFAULT.operation=[
 {code:'cutting',            station:'CUT',  name:'Резка',                        nameEn:'Cutting',                  stage:'pre_temper',  unit:null,  note:''},
 {code:'arris_hand',         station:'EDGE', name:'Притупление ручное',           nameEn:'Manual arrising',          stage:'pre_temper',  unit:'in',  note:'себестоимость иная, чем у машинного, а в счёте позиция одна — RA'},
 {code:'arris_machine',      station:'EDGE', name:'Притупление машинное',         nameEn:'Machine arrising',         stage:'pre_temper',  unit:'in',  note:'себестоимость иная, чем у ручного, а в счёте позиция одна — RA'},
 {code:'polish',             station:'EDGE', name:'Полировка прямой кромки',      nameEn:'Flat polishing',           stage:'pre_temper',  unit:'in',  note:''},
 {code:'miter',              station:'EDGE', name:'Митра',                        nameEn:'Mitering',                 stage:'pre_temper',  unit:'in',  note:''},
 {code:'bevel',              station:'EDGE', name:'Фацет',                        nameEn:'Beveling',                 stage:'pre_temper',  unit:'in',  note:''},
 {code:'cnc_shape_polish',   station:'EDGE', name:'Полировка фигурной кромки',    nameEn:'CNC shape polishing',      stage:'pre_temper',  unit:'in',  note:'кромка, но выполняется на ЧПУ — поэтому рабочее место служит двум станциям'},
 {code:'cnc_lami_polish',    station:'EDGE', name:'Полировка ламината',           nameEn:'CNC lami polishing',       stage:'post_temper', unit:'in',  note:'только ПОСЛЕ склейки — то же ЧПУ, другой момент маршрута'},
 {code:'fabrication',        station:'FAB',  name:'Обработка тела стекла',        nameEn:'Fabrication',              stage:'pre_temper',  unit:'pcs', note:'отверстия · ноч · вырезы · радиусы · посадочные места под петли и клемы'},
 {code:'ceramic_frit',       station:'CERP', name:'Керамический фрит',            nameEn:'Ceramic frit',             stage:'pre_temper',  unit:null,  note:'из STATIONS.csv: 3 узора. Рабочего места нет — силкскрин переносится на этапе 5б'},
 {code:'digital_print',      station:'CERP', name:'Цифровая керамическая печать', nameEn:'Digital ceramic print',    stage:'pre_temper',  unit:null,  note:'из STATIONS.csv. Рабочего места нет — силкскрин переносится на этапе 5б'},
 {code:'tempering',          station:'HEAT', name:'Закалка',                      nameEn:'Tempering',                stage:'heat',        unit:null,  note:''},
 {code:'heat_strengthening', station:'HEAT', name:'Термоупрочнение',              nameEn:'Heat strengthening',       stage:'heat',        unit:null,  note:''},
 {code:'heat_soak',          station:'HEAT', name:'Heat soak',                    nameEn:'Heat soak',                stage:'heat',        unit:null,  note:''},
 {code:'sandblasting',       station:'SAND', name:'Пескоструй',                   nameEn:'Sandblasting',             stage:'any',         unit:null,  note:'позиция в маршруте зависит от того, есть ли термообработка'},
 {code:'painting',           station:'PAINT',name:'Покраска',                     nameEn:'Painting',                 stage:'any',         unit:null,  note:'opaci-coat standard/custom · backpainting — разнести на услуги при ценообразовании'},
 {code:'lamination',         station:'LAM',  name:'Ламинация',                    nameEn:'Lamination',               stage:'post_temper', unit:null,  note:'точка слияния компонентов: два L-номера сходятся здесь'},
 {code:'igu_assembly',       station:'IGU',  name:'Сборка стеклопакета',          nameEn:'IGU assembly',             stage:'post_temper', unit:null,  note:'мойка входит в операцию. Точка слияния компонентов'}
];

/* =====================================================================
   3. РАБОЧИЕ МЕСТА — 22 строки, дословно из templates/WORK_POSITIONS.csv.
   Подстанций Spil здесь нет ни одной.

   `defaultOperator` / `defaultHelper` — это ПРЕФИЛЛ ЭКРАНА, а не назначение
   человека на станок (9м §3). Сегодняшняя расстановка не должна быть
   структурой цеха: завтра встанет другой человек, и справочник оборудования
   править не придётся. Правда о том, кто сделал, приходит со скана и живёт
   в событии. `helper` заведён потому, что на части мест работают вдвоём.

   Габариты — рабочее ПОЛЕ, а не корпус станка: печь 90 × 150″ это стол.
   Модель отвечает на вопрос «влезет ли деталь». 19 позиций из 22 ждут
   замеров в цеху, и пустой габарит здесь — честное «не измерено», а не ноль.

   `station` — ДОМАШНЯЯ станция места. Полный список станций, которым место
   служит, НЕ хранится: он выводится из станций его операций (см.
   workPositionStations). У CNC1 из этого само собой получается FAB + EDGE —
   ровно то, что пользователь написал в примечании к строке. */
DEFAULT.workPosition=[
 {code:'CUT1',    station:'CUT',  name:'Резка 1',                  nameEn:'Cutting 1',          kind:'machine',operations:['cutting'],                                             defaultOperator:'squidly',defaultHelper:'ricardo',maxW:null,maxL:null,batchMode:'single',note:'снять рабочее поле стола'},
 {code:'CUT2',    station:'CUT',  name:'Резка 2',                  nameEn:'Cutting 2',          kind:'machine',operations:['cutting'],                                             defaultOperator:'bairon', defaultHelper:'loie',   maxW:null,maxL:null,batchMode:'single',note:'снять рабочее поле стола'},
 {code:'ARRIS-H', station:'EDGE', name:'Притупление ручное',       nameEn:'Manual arrising',    kind:'manual', operations:['arris_hand'],                                          defaultOperator:'jorje',  defaultHelper:'',       maxW:null,maxL:null,batchMode:'single',note:'станка нет — руки; габарит не нужен'},
 {code:'ARRIS-M', station:'EDGE', name:'Притупление машинное',     nameEn:'Machine arrising',   kind:'machine',operations:['arris_machine'],                                       defaultOperator:'artur',  defaultHelper:'jose',   maxW:null,maxL:null,batchMode:'single',note:'снять габарит'},
 {code:'POL1',    station:'EDGE', name:'Полировка прямой кромки 1',nameEn:'Flat polishing 1',   kind:'machine',operations:['polish'],                                              defaultOperator:'erik',   defaultHelper:'',       maxW:null,maxL:null,batchMode:'single',note:'снять габарит'},
 {code:'POL2',    station:'EDGE', name:'Полировка прямой кромки 2',nameEn:'Flat polishing 2',   kind:'machine',operations:['polish'],                                              defaultOperator:'djima',  defaultHelper:'',       maxW:null,maxL:null,batchMode:'single',note:'снять габарит'},
 {code:'POL3',    station:'EDGE', name:'Полировка прямой кромки 3',nameEn:'Flat polishing 3',   kind:'machine',operations:['polish'],                                              defaultOperator:'huan',   defaultHelper:'',       maxW:null,maxL:null,batchMode:'single',note:'снять габарит'},
 {code:'MITER1',  station:'EDGE', name:'Митра',                    nameEn:'Miter',              kind:'machine',operations:['miter'],                                               defaultOperator:'erik',   defaultHelper:'',       maxW:null,maxL:null,batchMode:'single',note:'снять габарит'},
 {code:'BEVEL1',  station:'EDGE', name:'Фацетный станок',          nameEn:'Beveling',           kind:'machine',operations:['bevel'],                                               defaultOperator:'',       defaultHelper:'',       maxW:70,  maxL:100, batchMode:'single',note:'габарит был известен — проверить'},
 {code:'CNC1',    station:'FAB',  name:'ЧПУ 1',                    nameEn:'CNC 1',              kind:'machine',operations:['fabrication','cnc_shape_polish','cnc_lami_polish'],    defaultOperator:'joseph', defaultHelper:'',       maxW:60,  maxL:122, batchMode:'single',note:'служит ДВУМ станциям: FAB и EDGE. Габарит проверить'},
 {code:'CNC2',    station:'FAB',  name:'ЧПУ 2',                    nameEn:'CNC 2',              kind:'machine',operations:['fabrication','cnc_shape_polish','cnc_lami_polish'],    defaultOperator:'roberto',defaultHelper:'',       maxW:null,maxL:null,batchMode:'single',note:'ОДИНАКОВ ЛИ С CNC1? если нет — маршрут обязан знать'},
 {code:'CNC3',    station:'FAB',  name:'ЧПУ 3',                    nameEn:'CNC 3',              kind:'machine',operations:['fabrication','cnc_shape_polish','cnc_lami_polish'],    defaultOperator:'ron',    defaultHelper:'',       maxW:null,maxL:null,batchMode:'single',note:'ОДИНАКОВ ЛИ С CNC1?'},
 {code:'FURN1',   station:'HEAT', name:'Печь',                     nameEn:'Furnace',            kind:'machine',operations:['tempering','heat_strengthening','heat_soak'],          defaultOperator:'',       defaultHelper:'',       maxW:90,  maxL:150, batchMode:'batch', note:'снять с шильдика ПАСПОРТНЫЙ вес садки — сейчас в модели прикидка ~305 кг'},
 {code:'WASH-T',  station:'HEAT', name:'Мойка у печи',             nameEn:'Washer at furnace',  kind:'machine',operations:[],                                                      defaultOperator:'',       defaultHelper:'',       maxW:null,maxL:null,batchMode:'single',note:'не шаг маршрута, но габарит ограничивает деталь — снять'},
 {code:'SAND1',   station:'SAND', name:'Пескоструйная камера',     nameEn:'Sandblasting',       kind:'machine',operations:['sandblasting'],                                        defaultOperator:'',       defaultHelper:'',       maxW:null,maxL:null,batchMode:'single',note:'НЕТ НИ В ОДНОЙ ВЫГРУЗКЕ — завести и снять габарит'},
 {code:'PAINT-S', station:'PAINT',name:'Покраска распылением',     nameEn:'Spray',              kind:'machine',operations:['painting'],                                            defaultOperator:'',       defaultHelper:'',       maxW:null,maxL:null,batchMode:'single',note:'НЕТ В ВЫГРУЗКАХ — завести'},
 {code:'PAINT-R', station:'PAINT',name:'Покраска валом',           nameEn:'Roller',             kind:'machine',operations:['painting'],                                            defaultOperator:'',       defaultHelper:'',       maxW:null,maxL:null,batchMode:'single',note:'НЕТ В ВЫГРУЗКАХ — завести'},
 {code:'PAINT-B', station:'PAINT',name:'Покрасочная камера',       nameEn:'Booth',              kind:'machine',operations:['painting'],                                            defaultOperator:'',       defaultHelper:'',       maxW:null,maxL:null,batchMode:'single',note:'НЕТ В ВЫГРУЗКАХ — завести'},
 {code:'LAM1',    station:'LAM',  name:'Линия ламинации',          nameEn:'Lamination line',    kind:'machine',operations:['lamination'],                                          defaultOperator:'',       defaultHelper:'',       maxW:null,maxL:null,batchMode:'batch', note:'НЕТ В ВЫГРУЗКАХ — завести и снять габарит'},
 {code:'AUTOCL1', station:'LAM',  name:'Автоклав',                 nameEn:'Autoclave',          kind:'machine',operations:['lamination'],                                          defaultOperator:'',       defaultHelper:'',       maxW:null,maxL:null,batchMode:'batch', note:'НЕТ В ВЫГРУЗКАХ — работает партиями, снять габарит и вместимость'},
 {code:'IGU1',    station:'IGU',  name:'Линия сборки стеклопакета',nameEn:'IGU line',           kind:'machine',operations:['igu_assembly'],                                        defaultOperator:'',       defaultHelper:'',       maxW:null,maxL:null,batchMode:'batch', note:'НЕТ В ВЫГРУЗКАХ — завести и снять габарит'},
 {code:'WASH-IGU',station:'IGU',  name:'Мойка на сборке',          nameEn:'Washer at IGU line', kind:'machine',operations:[],                                                      defaultOperator:'',       defaultHelper:'',       maxW:null,maxL:null,batchMode:'single',note:'не шаг маршрута, но габарит ограничивает деталь — снять'}
];

/* =====================================================================
   4. ТЕРМИНАЛЫ — экраны сканирования. Таблица заведена ПУСТОЙ, и это не
   недоделка.

   Про поведение терминала известно всё: оператор сканирует стикер, экран
   показывает открытые операции ЭТОЙ детали для ЭТОГО места, все отмечены
   заранее, он снимает галочку с того, чего не делал. Экраны никто не
   переключает — это условие задачи, а не то, что надо чинить. Главный
   выигрыш: закрыть операцию, которой нет в маршруте детали, физически
   невозможно, её просто нет на экране.

   А вот СКОЛЬКО экранов стоит в цеху и какие места висят на каждом —
   пользователь ещё не называл. Засеять «по одному на станцию» значило бы
   повторить болезнь подстанций Spil: справочник, распухший выдуманными
   строками. Пустая таблица с CRUD — честное состояние: модель готова,
   данные заводятся из цеха. */
DEFAULT.terminal=[];

/* ---------------------------------------------------------------------
   Выведенные связи. Ничего не хранят — считают из уже введённого.
   --------------------------------------------------------------------- */
/* Станции, которым служит рабочее место. НЕ отдельное поле: у CNC1 оно само
   даёт FAB + EDGE из его операций, и второй источник правды не заводится. */
function workPositionStations(wp){
 if(!wp||!Array.isArray(wp.operations))return [];
 const seen=Object.create(null),out=[];
 (wp.station?[wp.station]:[]).concat(wp.operations.map(c=>{
   const op=DB.operation.find(o=>o.code===c);return op?op.station:'';
 })).forEach(code=>{if(code&&!seen[code]){seen[code]=true;out.push(code);}});
 return out.sort((a,b)=>stationSeq(a)-stationSeq(b));
}
function stationSeq(code){const s=DB.station.find(x=>x.code===code);return s?s.seq:999;}
/* Рабочие места станции — по операциям, а не по домашнему полю: иначе CNC1
   не попал бы в EDGE, хотя фигурную кромку полируют именно на нём. */
function stationWorkPositions(code){return DB.workPosition.filter(w=>workPositionStations(w).includes(code));}
function stationOperations(code){return DB.operation.filter(o=>o.station===code);}
/* Операция без рабочего места — не ошибка, а видимый пробел: силкскрин ещё
   не перенесён, отгрузка ещё не спроектирована. */
function operationWorkPositions(code){return DB.workPosition.filter(w=>(w.operations||[]).includes(code));}
/* Рабочие места, которые ЖДУТ ЗАМЕРОВ. Не то же самое, что «без габарита»:
   у ручного места габарита нет и не будет — там руки, а не станок, и считать
   его недостающим замером значит вечно показывать долг, который никто не
   закроет. Определение одно на всю систему, чтобы экраны не спорили друг с
   другом о числе. */
function workPositionsAwaitingSize(){
 return DB.workPosition.filter(function(w){return w.maxW==null&&w.kind!=='manual';});
}
/* Станции, которые терминал в принципе может закрывать. Это СПРАВКА для
   экрана, а не право: ключом шага маршрута терминал не бывает никогда. */
function terminalStations(t){
 const seen=Object.create(null),out=[];
 ((t&&t.workPositions)||[]).forEach(code=>{
  const wp=DB.workPosition.find(w=>w.code===code);
  if(wp)workPositionStations(wp).forEach(s=>{if(!seen[s]){seen[s]=true;out.push(s);}});
 });
 return out.sort((a,b)=>stationSeq(a)-stationSeq(b));
}

/* ---------------------------------------------------------------------
   Нормализация. Идёт ДО normalizeUsers: пользователь ссылается на рабочее
   место, и проверять ссылку не на чем, пока места не приведены в порядок.

   Устойчивость здесь обязательна, а не желательна. В браузере пользователя
   под ключом `station` лежат СТАНКИ старой модели (CUT1, EDGE1, CNC1…), и
   этот код увидит их раньше, чем пересев успеет заменить таблицу
   заводской. Ронять загрузку он при этом не имеет права — иначе до пересева
   дело не дойдёт вообще.
   --------------------------------------------------------------------- */
function normalizeShopFloor(){
 const seen=Object.create(null);
 DB.station=(Array.isArray(DB.station)?DB.station:[]).filter(s=>{
  if(!s||typeof s!=='object')return false;
  const code=sfCode(s.code);if(!code||seen[code])return false;seen[code]=true;return true;
 }).map((s,i)=>{
  const seq=Number.isInteger(+s.seq)&&+s.seq>0?+s.seq:i+1;
  return {seq,code:sfCode(s.code),name:sfStr(s.name),nameEn:sfStr(s.nameEn),always:s.always===true,note:sfStr(s.note)};
 }).sort((a,b)=>a.seq-b.seq);

 const opSeen=Object.create(null);
 DB.operation=(Array.isArray(DB.operation)?DB.operation:[]).filter(o=>{
  if(!o||typeof o!=='object')return false;
  const code=sfStr(o.code).toLowerCase();if(!code||opSeen[code])return false;opSeen[code]=true;return true;
 }).map(o=>{
  const station=sfCode(o.station);
  return {
   code:sfStr(o.code).toLowerCase(),
   /* операция без своей станции — сирота, а не ошибка данных: станцию могли
      удалить. Пустая ссылка видна на экране, выдуманная — нет. */
   station:DB.station.some(s=>s.code===station)?station:'',
   name:sfStr(o.name),nameEn:sfStr(o.nameEn),
   stage:SF_STAGES.includes(o.stage)?o.stage:'any',
   unit:SF_UNITS.includes(o.unit)?o.unit:null,
   note:sfStr(o.note)
  };
 });

 const wpSeen=Object.create(null);
 DB.workPosition=(Array.isArray(DB.workPosition)?DB.workPosition:[]).filter(w=>{
  if(!w||typeof w!=='object')return false;
  const code=sfCode(w.code);if(!code||wpSeen[code])return false;wpSeen[code]=true;return true;
 }).map(w=>{
  const station=sfCode(w.station),opSet=Object.create(null);
  const maxW=sfNum(w.maxW),maxL=sfNum(w.maxL);
  return {
   code:sfCode(w.code),
   station:DB.station.some(s=>s.code===station)?station:'',
   name:sfStr(w.name),nameEn:sfStr(w.nameEn),
   kind:SF_KINDS.includes(w.kind)?w.kind:'machine',
   operations:(Array.isArray(w.operations)?w.operations:[]).map(c=>sfStr(c).toLowerCase())
     .filter(c=>c&&DB.operation.some(o=>o.code===c)&&!opSet[c]&&(opSet[c]=true)),
   defaultOperator:sfStr(w.defaultOperator),defaultHelper:sfStr(w.defaultHelper),
   /* габарит принимается только парой: одна сторона без второй не отвечает
      на вопрос «влезет ли деталь», а выглядит как заполненная строка */
   maxW:(maxW!=null&&maxL!=null)?maxW:null,
   maxL:(maxW!=null&&maxL!=null)?maxL:null,
   batchMode:SF_BATCH_MODES.includes(w.batchMode)?w.batchMode:'single',
   note:sfStr(w.note)
  };
 });

 const tSeen=Object.create(null);
 DB.terminal=(Array.isArray(DB.terminal)?DB.terminal:[]).filter(t=>{
  if(!t||typeof t!=='object')return false;
  const code=sfCode(t.code);if(!code||tSeen[code])return false;tSeen[code]=true;return true;
 }).map(t=>{
  const wpSet=Object.create(null);
  return {
   code:sfCode(t.code),name:sfStr(t.name),nameEn:sfStr(t.nameEn),
   workPositions:(Array.isArray(t.workPositions)?t.workPositions:[]).map(sfCode)
     .filter(c=>c&&DB.workPosition.some(w=>w.code===c)&&!wpSet[c]&&(wpSet[c]=true)),
   note:sfStr(t.note)
  };
 });
}

/* ---------------------------------------------------------------------
   Разбор CSV. Нужен здесь, а не в Этапе 5·3, по простой причине: 19 из 22
   рабочих мест ждут замеров в цеху. Без импорта каждый снятый габарит
   означал бы правку кода и новую сборку.

   Формат — тот, в котором пользователю отдают файлы: запятая, кавычки
   вокруг полей с запятыми, удвоенная кавычка внутри. BOM от Excel снимаем.
   --------------------------------------------------------------------- */
function parseCsv(text){
 const src=String(text==null?'':text).replace(/^﻿/,'');
 const rows=[];let row=[],field='',quoted=false,i=0;
 const endField=()=>{row.push(field);field='';};
 const endRow=()=>{endField();if(row.length>1||row[0]!=='')rows.push(row);row=[];};
 while(i<src.length){
  const c=src[i];
  if(quoted){
   if(c==='"'){ if(src[i+1]==='"'){field+='"';i+=2;continue;} quoted=false;i++;continue; }
   field+=c;i++;continue;
  }
  if(c==='"'){quoted=true;i++;continue;}
  if(c===','){endField();i++;continue;}
  if(c==='\r'){i++;continue;}
  if(c==='\n'){endRow();i++;continue;}
  field+=c;i++;
 }
 if(field!==''||row.length)endRow();
 if(!rows.length)return {header:[],rows:[]};
 const header=rows[0].map(h=>sfStr(h));
 return {header,rows:rows.slice(1).map(r=>{
  const o=Object.create(null);header.forEach((h,n)=>{o[h]=sfStr(r[n]);});return o;
 })};
}

/* Отчёт вместо тихого успеха: «принято N, отклонено M и почему». Строка,
   которую отклонили без причины, возвращается пользователю как загадка. */
function sfReport(){return {accepted:0,added:0,updated:0,rejected:[],missing:[]};}
function sfReject(rep,line,code,why){rep.rejected.push({line,code:code||'—',why});}

/* Импорт STATIONS.csv. Слияние ПО КОДУ, а не замена таблицы: строки, которые
   пользователь завёл руками, чужой файл сносить не должен. Чего в файле нет —
   попадает в `missing` отчёта, а не удаляется молча. */
function importStationsCsv(text){
 const {header,rows}=parseCsv(text),rep=sfReport();
 if(!header.includes('code')||!header.includes('seq'))
  {sfReject(rep,0,'','файл не похож на STATIONS.csv: нет колонок seq и code');return rep;}
 const inFile=Object.create(null);
 rows.forEach((r,n)=>{
  const line=n+2,code=sfCode(r.code);
  if(!code)return sfReject(rep,line,'','пустой код');
  if(!SF_CODE_RE.test(code))return sfReject(rep,line,code,'код: только A–Z, 0–9, дефис и подчёркивание');
  if(inFile[code])return sfReject(rep,line,code,'код повторяется в файле');
  const seq=+r.seq;
  if(!Number.isInteger(seq)||seq<=0)return sfReject(rep,line,code,'seq должен быть целым положительным');
  const flag=sfStr(r.always_or_optional).toLowerCase();
  if(flag!=='always'&&flag!=='optional')return sfReject(rep,line,code,'always_or_optional: ожидается always или optional');
  inFile[code]=true;
  const next={seq,code,name:sfStr(r.name_ru),nameEn:sfStr(r.name_en),always:flag==='always',note:sfStr(r.note)};
  const at=DB.station.findIndex(s=>s.code===code);
  if(at<0){DB.station.push(next);rep.added++;}else{Object.assign(DB.station[at],next);rep.updated++;}
  rep.accepted++;
 });
 DB.station.forEach(s=>{if(!inFile[s.code])rep.missing.push(s.code);});
 normalizeShopFloor();
 return rep;
}

/* Импорт WORK_POSITIONS.csv. Здесь же приезжают габариты, которых ждёт
   `check_route_fits()` этапа 7·2. Пустой габарит в файле означает «ещё не
   замерили» и стирает прежнее значение только вместе с парной стороной —
   половина габарита хуже, чем его отсутствие. */
function importWorkPositionsCsv(text){
 const {header,rows}=parseCsv(text),rep=sfReport();
 if(!header.includes('code')||!header.includes('station'))
  {sfReject(rep,0,'','файл не похож на WORK_POSITIONS.csv: нет колонок code и station');return rep;}
 const inFile=Object.create(null);
 rows.forEach((r,n)=>{
  const line=n+2,code=sfCode(r.code);
  if(!code)return sfReject(rep,line,'','пустой код');
  if(!SF_CODE_RE.test(code))return sfReject(rep,line,code,'код: только A–Z, 0–9, дефис и подчёркивание');
  if(inFile[code])return sfReject(rep,line,code,'код повторяется в файле');
  const station=sfCode(r.station);
  if(!DB.station.some(s=>s.code===station))return sfReject(rep,line,code,'станции '+(station||'—')+' нет в справочнике');
  const ops=sfStr(r.operations).split(/[,;]/).map(x=>sfStr(x).toLowerCase()).filter(Boolean);
  const unknown=ops.filter(c=>!DB.operation.some(o=>o.code===c));
  if(unknown.length)return sfReject(rep,line,code,'неизвестные операции: '+unknown.join(', '));
  const kind=sfStr(r.kind).toLowerCase()||'machine';
  if(!SF_KINDS.includes(kind))return sfReject(rep,line,code,'kind: ожидается machine или manual');
  const batchMode=sfStr(r.batch_mode).toLowerCase()||'single';
  if(!SF_BATCH_MODES.includes(batchMode))return sfReject(rep,line,code,'batch_mode: ожидается single или batch');
  const maxW=sfNum(r.max_w_in),maxL=sfNum(r.max_l_in);
  if((maxW==null)!==(maxL==null))return sfReject(rep,line,code,'габарит заполняется парой: max_w_in и max_l_in');
  inFile[code]=true;
  const seenOp=Object.create(null);
  const next={code,station,name:sfStr(r.name_ru),nameEn:sfStr(r.name_en),kind,
   operations:ops.filter(c=>!seenOp[c]&&(seenOp[c]=true)),
   defaultOperator:sfStr(r.default_operator),defaultHelper:sfStr(r.default_helper),
   maxW,maxL,batchMode,note:sfStr(r.note)};
  const at=DB.workPosition.findIndex(w=>w.code===code);
  if(at<0){DB.workPosition.push(next);rep.added++;}else{Object.assign(DB.workPosition[at],next);rep.updated++;}
  rep.accepted++;
 });
 DB.workPosition.forEach(w=>{if(!inFile[w.code])rep.missing.push(w.code);});
 normalizeShopFloor();
 return rep;
}

/* ---------------------------------------------------------------------
   Имя записи на языке интерфейса. Не перевод: обе колонки заполнил
   пользователь, здесь только выбор нужной. Пустая nameEn — не беда, тогда
   показываем то единственное имя, которое есть.
   --------------------------------------------------------------------- */
function sfName(row){
 if(!row)return '';
 return (LANG==='en'&&row.nameEn)?row.nameEn:(row.name||row.nameEn||'');
}
/* Локализованное имя — уже данные, а не интерфейс: переводчику его не отдаём. */
function sfLabel(row){return `<span data-raw>${esc(sfName(row))}</span>`;}
