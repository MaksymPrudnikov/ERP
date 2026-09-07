/* =====================================================================
   erp/data  ·  erp-1.0
   Справочники прототипа, дефолтные данные, нормализация после загрузки.
   IN : localStorage / импорт JSON
   OUT: DB
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function normalizeSalesModules(){
  if(!Array.isArray(DB.shapeDef))DB.shapeDef=[];
  var shapeIds=Object.create(null);
  function uniqueId(raw){
    var id=String(raw==null?'':raw).trim();
    if(!id||shapeIds[id]){do{id=newShapeId();}while(shapeIds[id]);}
    shapeIds[id]=true;return id;
  }
  DB.shapeDef=DB.shapeDef.map(function(s,i){
    var src=s&&typeof s==='object'?s:{},legacy=Array.isArray(src.points)&&src.points.length>=3;
    if(legacy&&!src.type){
      var xs=src.points.map(function(p){return +p.x||0}),ys=src.points.map(function(p){return +p.y||0}),minX=Math.min.apply(null,xs),minY=Math.min.apply(null,ys);
      src=Object.assign({},src,{type:'polygon',w:String(Math.max.apply(null,xs)-minX||48),h:String(Math.max.apply(null,ys)-minY||36),polygon:src.points.map(function(p,n){return {id:'PV'+(n+1),x:String((+p.x||0)-minX),y:String((+p.y||0)-minY)};})});
    }
    var out=normalizeShapeDef(src);out.id=uniqueId(src.id);out.name=String(src.name==null?(shapePresetInfo(out.type).label+' '+(i+1)):src.name);return out;
  });
}

/* Реальные должности компании (хендофф, раздел 7): Продажи · Бухгалтер ·
   Админ · Владелец. Прежние семь ролей были выдумкой прототипа — проектировать
   права под несуществующие должности нельзя. Цех, отгрузка и снабжение
   именованных учёток не получают: учётка принадлежит терминалу станции, а
   человек опознаётся сканом бейджа при действии.
   Прибыль видит только Владелец; Админ — техническая роль без денег. */
const ROLES=['Продажи','Бухгалтер','Админ','Владелец'];
/* Неизвестная роль из импорта или из старых данных падает в самую слабую —
   Продажи: она не видит ни себестоимости, ни настроек системы. */
const SAFE_DEFAULT_ROLE='Продажи';
const SKILLS=['Резка','Кромка (arris/polish)','ЧПУ полировка','Сверловка/выемки','Закалка','Контроль качества','Отгрузка/погрузка'];
const SKILL_LEVELS=['Новичок','Мидл','Синьор'];
/* Старые записи могли хранить навык строкой — для них сохраняем исторический
   уровень «Мидл». Объект с неизвестным навыком/уровнем не угадываем и удаляем. */
const normSkill = x => {
 const src=typeof x==='string'?{skill:x,level:'Мидл'}:(x&&typeof x==='object'?x:null);
 if(!src)return null;
 const skill=String(src.skill==null?'':src.skill).trim();if(!SKILLS.includes(skill))return null;
 const level=typeof x==='string'?'Мидл':src.level;if(!SKILL_LEVELS.includes(level))return null;return {skill,level};
};
/* Пользователь привязан к РАБОЧЕМУ МЕСТУ, а не к станции: станция теперь шаг
   маршрута, и «привязать человека к шагу маршрута» не значит ничего.

   Старое поле `station` держало код станка (CUT1, CNC1, FURN1) — по коду оно
   и переносится в `workPosition`. Код, которому в реальном цеху ничего не
   соответствует (`EDGE1` — выдуманная «кромкообрабатывающая линия», вместо
   неё стоят ARRIS-H/M, POL1–3, MITER1, BEVEL1), обнуляется. Угадывать, за
   каким из шести мест стоял человек, нельзя: это ровно та подмена, из-за
   которой у Spil расстановка смены оказалась структурой цеха.

   И это ПРЕФИЛЛ, не назначение. Правда о том, кто сделал работу, приходит со
   скана и живёт в событии (хендофф, раздел 9м §3). */
function normalizeUsers(){
 if(!Array.isArray(DB.user))DB.user=[];
 DB.user=DB.user.filter(u=>u&&typeof u==='object');
 DB.user.forEach(u=>{
  u.name=String(u.name==null?'':u.name);u.role=ROLES.includes(u.role)?u.role:SAFE_DEFAULT_ROLE;
  const legacy=u.workPosition==null?u.station:u.workPosition;
  const code=String(legacy==null?'':legacy).trim().toUpperCase();
  u.workPosition=DB.workPosition.some(w=>w.code===code)?code:'';
  delete u.station;
  const seen=Object.create(null);u.skills=(Array.isArray(u.skills)?u.skills:[]).map(normSkill).filter(x=>x&&!seen[x.skill]&&(seen[x.skill]=true));
 });
}
/* =====================================================================
   ПЕРЕСЕВ СПРАВОЧНИКОВ

   Проблема, которую это чинит: mergeState при загрузке делает DB[k]=v, то есть
   сохранённый массив ЦЕЛИКОМ заменяет заводскую заготовку. Значит правка сида
   в коде до работающего браузера не доезжает никогда — там лежат старые данные,
   и они переживают любую заливку. Экспорт с импортом не помогает: из своего же
   JSON приедут те же старые записи.

   Решение: у данных есть версия справочников. Если она отстала — справочные
   таблицы заменяются заводскими, а рабочие данные (пользователи, клиенты,
   заказы, чертежи) не трогаются вообще.

   Версия живёт В ДАННЫХ, а не в localStorage: тогда чужой импорт со старым
   каталогом тоже пересеется, а это именно то поведение, которое нужно.

   ОГРАНИЧЕНИЕ, ЗНАТЬ ОБЯЗАТЕЛЬНО: пересев затирает ручные правки справочников.
   Пока экрана справочников нет, править их можно только на экране Производства,
   и цена невелика. Как появится Master Data (Этап 5) — заменить на слияние по
   коду: свои строки пользователя оставлять, заводские обновлять.
   ===================================================================== */
/* `level` из списка ушёл вместе с таблицей: шагом маршрута теперь является
   сама СТАНЦИЯ, и держать рядом второй справочник тех же одиннадцати строк
   означало бы два источника правды. На его место встали три новые таблицы
   цеха — операции, рабочие места и терминалы (см. erp/shopfloor/data). */
const REFERENCE_TABLES=['station','operation','workPosition','terminal','glassProduct','heatTreatment','spacerVariant','gasProduct','sealantProduct','interlayerProduct','fritProduct','spandrelProduct'];
/* 2 → 3: у сохранённых данных под ключом `station` лежат СТАНКИ прежней
   модели. Пересев меняет там смысл таблицы, а не только её содержимое,
   поэтому версия обязана подняться — иначе браузер пользователя навсегда
   останется со станками там, где код ждёт шаги маршрута.

   3 → 4: каталог стекла перестал быть шестнадцатью выдуманными заглушками —
   в `glassProduct` встали 511 реальных позиций, и схема записи изменилась
   целиком: подложка, режим закалки, правило поверхности, единицы хранения и
   продажи, оптика IGDB. Поставка при этом уехала в отдельную таблицу
   `glassSheet`. Без подъёма версии браузер пользователя остался бы со
   старыми заглушками, а конфигуратор — с шестнадцатью строками выбора.

   `glassSheet` в списке пересева НЕТ намеренно: там лежат цены и сроки,
   введённые руками, а пересев заменяет таблицу заводской — то есть стёр бы
   их при следующем же подъёме версии. Заводского содержимого у поставки не
   бывает (см. erp/masterdata/glass).

   4 → 5: в `spacerVariant` встали все семь систем рамок со складским рядом
   размеров — было восемь позиций двух систем. Появились семейство (на нём
   висит цена) и ФАКТИЧЕСКАЯ толщина, отдельная от номинала: 7/16 у Aluminum
   11.1 мм, а у Black Warm Edge 11.5, и общая толщина пакета считалась по
   номиналу, то есть занижалась. В `sealantProduct` добавлен полисульфид —
   базовый вторичный герметик прайса, без которого самый ходовой вариант не
   заносился вообще.

   5 → 6: плёнки разбиты по исполнению (SGP Ultra Clear · Clear · Frosted,
   EVA Ultra Clear · Clear · Frosted White · Milky Way) и получили цену за слой;
   у фрита и спандрела появилась надбавка за sq ft.

   6 → 7: появилась полировка склеенной кромки — операция `lami_polish` рядом с
   уже заведённой `cnc_lami_polish`, обе на полировочных местах и ЧПУ. Вместе с
   ними приехала таблица припуска `edgeAllowance`: цифры съёма перестали быть
   ветками в коде и правятся в Справочниках. У ламината припуск меряется по
   ПЛИТЕ, а не по суммарной толщине склейки, — до этой версии 6+6 резался на
   четверть дюйма крупнее, а 3+3, 10+10 и 12+12 не резались вовсе. */
const REFERENCE_VERSION=7;
let referenceReseeded=false;
/* Версия справочников обязана быть целым числом: из руками правленного JSON
   она приезжала строкой или мусором, и сравнение `have>=REFERENCE_VERSION`
   тихо давало не тот ответ. Раньше эта строка жила в normalizeStations —
   таблица уехала в erp/shopfloor, проверка осталась здесь. */
function normalizeRefVersion(){
 const rv=+DB.refVersion;DB.refVersion=isFinite(rv)&&Number.isInteger(rv)&&rv>0?rv:0;
}
/* hadSaved — были ли в браузере сохранённые данные. Нужен ТОЛЬКО для
   уведомления: на чистой установке пересев тоже проходит (версия 0 → 2), но
   говорить «справочники обновлены» там не о чем, ничего не заменялось. */
function reseedReferenceTables(hadSaved){
 const have=Number.isInteger(+DB.refVersion)?+DB.refVersion:0;
 if(have>=REFERENCE_VERSION)return false;
 const done=[];
 /* Фактические толщины рамок вводит пользователь руками — заводскими данными
    они пустые. Пересев меняет СОСТАВ таблицы, но введённое стирать нельзя: это
    ровно та причина, по которой glassSheet вообще не пересевается. Ключ — id
    рамки, поэтому правка переживает и добавление новых позиций. */
 /* Габариты рабочих мест снимают в цеху рулеткой, заводскими данными они
    пустые. Пересев меняет СОСТАВ таблицы, но снятое стирать нельзя — та же
    причина, что у толщин рамок ниже. Ключ — код места. */
 const keptPositionSize={};
 (Array.isArray(DB.workPosition)?DB.workPosition:[]).forEach(x=>{
  if(!x||!x.code)return;
  const w=+x.maxW,l=+x.maxL;
  if(isFinite(w)&&w>0||isFinite(l)&&l>0)keptPositionSize[x.code]={maxW:isFinite(w)&&w>0?w:null,maxL:isFinite(l)&&l>0?l:null};
 });
 const keptSpacerMm={};
 (Array.isArray(DB.spacerVariant)?DB.spacerVariant:[]).forEach(x=>{
  const mm=x&&+x.thicknessMm;
  if(x&&x.id&&isFinite(mm)&&mm>0)keptSpacerMm[x.id]=mm;
 });
 REFERENCE_TABLES.forEach(k=>{if(Array.isArray(DEFAULT[k])){DB[k]=JSON.parse(JSON.stringify(DEFAULT[k]));done.push(k);}});
 /* Припуск пересевается СЛИЯНИЕМ по id, а не заменой. Владельцу прямо сказано
    править эту таблицу, поэтому список REFERENCE_TABLES ей не подходит: он
    стирает и правленые значения, и заведённые вручную строки. Диапазон и
    подпись — «личность» строки и обновляются; само значение припуска
    принадлежит цеху и переживает пересев. */
 if(typeof reseedEdgeAllowance==='function'){reseedEdgeAllowance();done.push('edgeAllowance');}
 (Array.isArray(DB.spacerVariant)?DB.spacerVariant:[]).forEach(x=>{if(x&&keptSpacerMm[x.id]!=null)x.thicknessMm=keptSpacerMm[x.id];});
 (Array.isArray(DB.workPosition)?DB.workPosition:[]).forEach(x=>{
  const kept=x&&keptPositionSize[x.code];if(!kept)return;
  if(kept.maxW!=null)x.maxW=kept.maxW;
  if(kept.maxL!=null)x.maxL=kept.maxL;
 });
 DB.refVersion=REFERENCE_VERSION;
 referenceReseeded=!!hadSaved;
 console.info('reference tables reseeded '+have+' \u2192 '+REFERENCE_VERSION+': '+done.join(', '));
 return true;
}
function skillIconName(skill){
 return ({
  'Резка':'cut',
  'Кромка (arris/polish)':'edge',
  'ЧПУ полировка':'cnc',
  'Сверловка/выемки':'cnc',
  'Закалка':'furnace',
  'Контроль качества':'check',
  'Отгрузка/погрузка':'shipping'
 })[skill] || 'report';
}
function skillBadgeHTML(skillObj){
 const s=normSkill(skillObj);
 if(!s)return '';
 return `<span class="skill-badge">${ico(skillIconName(s.skill),'icon-inline')}<span>${esc(s.skill)}</span><span class="pill">${esc(s.level)}</span></span>`;
}
function salesSkillCards(){
 const cards=[
  {id:'shape', icon:'shape', title:'Production Shape', desc:'finished geometry · features · edgework · cutting', meta:'schema v2 · fail closed'}
 ];
 return `<div class="skill-card-grid sales-skill-grid">${cards.map(c=>`<button type="button" class="skill-card ${subtab===c.id?'active':''}" onclick="subtab='${c.id}';sEdit=null;sDraft=null;render()"><div class="skill-card-icon">${ico(c.icon)}</div><div class="skill-card-body"><b>${c.title}</b><small>${c.desc}</small><div class="skill-card-meta"><span class="pill ${subtab===c.id?'ok':'info'}">${c.meta}</span></div></div></button>`).join('')}</div>`;
}

/* B8 · демо-пользователи. Прототип стартовал с пустым DB.user: дашборд
   показывал ноль, отчёт по навыкам был пуст, а привязку к станции и роли
   проверить было не на ком. Трое — по одному на роль, которую в жизни держит
   человек; Админ не засеян намеренно, это техническая роль. Рабочее место у
   всех троих пустое: это офисные роли, за станком они не стоят.
   Имена латиницей: имя пользователя — данные, переводчик их не трогает, и
   русское имя осталось бы русским в английском интерфейсе. */
const DEMO_USERS=[
 {name:'Demo Sales',role:'Продажи',workPosition:'',skills:[]},
 {name:'Demo Accounting',role:'Бухгалтер',workPosition:'',skills:[]},
 {name:'Demo Owner',role:'Владелец',workPosition:'',skills:[]}
];
const DEMO_USERS_KEY='glazing_system_demo_users_v1';
/* Засев ОДИН раз на браузер. Отметка живёт в localStorage, а не в DB, потому
   что это свойство установки, а не данных: иначе удалённые демо-записи
   возвращались бы после каждого F5, а импорт чужого экспорта засевал бы их
   заново поверх настоящих людей. */
function seedDemoUsers(){
 try{if(localStorage.getItem(DEMO_USERS_KEY))return false;localStorage.setItem(DEMO_USERS_KEY,'1');}catch(e){return false;}
 if(!Array.isArray(DB.user)||DB.user.length)return false;
 DB.user=JSON.parse(JSON.stringify(DEMO_USERS));
 return true;
}

/* Справочники цеха — станции, операции, рабочие места и терминалы — живут в
   erp/shopfloor/data.js и дописываются в DEFAULT оттуда: там же лежит разбор,
   почему их четыре, а не одна таблица.
   Здесь остаётся только то, что к цеху не относится. */
const DEFAULT={
 user:[],
 /* НУЛЬ, а не текущая версия, и это не описка. mergeState копирует только те
    ключи, которые ЕСТЬ в сохранённых данных: у старого браузера refVersion нет
    вовсе, значение из DEFAULT остаётся нетронутым. Поставь сюда 2 — и данные
    без версии выглядели бы уже актуальными, пересев не сработал бы никогда
    ровно там, где он и нужен. Ноль означает «версия неизвестна». */
 refVersion:0,
 /* Форм по умолчанию нет. Демо-прямоугольник был тестовым балластом: тянулся
    за каждым новым запуском и мозолил глаза в списке. Форма заводится из
    строки заказа или из рабочего места Configurators. */
 shapeDef:[]
};
let DB=JSON.parse(JSON.stringify(DEFAULT)), dirty=false;
