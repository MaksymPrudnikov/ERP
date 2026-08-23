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
  function uniqueId(raw,prefix){
    var id=String(raw==null?'':raw).trim();
    if(!id||shapeIds[id]){do{id=prefix==='s'?newShapeId():newMuntinId();}while(shapeIds[id]);}
    shapeIds[id]=true;return id;
  }
  DB.shapeDef=DB.shapeDef.map(function(s,i){
    var src=s&&typeof s==='object'?s:{},legacy=Array.isArray(src.points)&&src.points.length>=3;
    if(legacy&&!src.type){
      var xs=src.points.map(function(p){return +p.x||0}),ys=src.points.map(function(p){return +p.y||0}),minX=Math.min.apply(null,xs),minY=Math.min.apply(null,ys);
      src=Object.assign({},src,{type:'polygon',w:String(Math.max.apply(null,xs)-minX||48),h:String(Math.max.apply(null,ys)-minY||36),polygon:src.points.map(function(p,n){return {id:'PV'+(n+1),x:String((+p.x||0)-minX),y:String((+p.y||0)-minY)};})});
    }
    var out=normalizeShapeDef(src);out.id=uniqueId(src.id,'s');out.name=String(src.name==null?(shapePresetInfo(out.type).label+' '+(i+1)):src.name);return out;
  });
  if(!Array.isArray(DB.muntinDef))DB.muntinDef=[];
  var firstShapeId=(DB.shapeDef[0]||{}).id||'',muntinIds=Object.create(null);
  function uniqueMuntinId(raw){var id=String(raw==null?'':raw).trim();if(!id||muntinIds[id]){do{id=newMuntinId();}while(muntinIds[id]);}muntinIds[id]=true;return id;}
  DB.muntinDef=DB.muntinDef.map(function(m,i){
    if(m&&typeof m==='object'&&m.muntin){m.id=uniqueMuntinId(m.id);m.name=String(m.name==null?'':m.name);m.shapeId=String(m.shapeId||firstShapeId);m.muntin=normalizeMuntinModel(m.muntin);var ms=DB.shapeDef.find(function(s){return s.id===m.shapeId;});if(ms&&!m.shapeFingerprint)pinMuntinShape(m,ms);return m;}
    var M=defaultMuntinModel();if(m){M.layout.verticalBars=clampBars(m.cols==null?2:m.cols);M.layout.horizontalBars=clampBars(m.rows==null?1:m.rows);}
    var out={id:uniqueMuntinId(m&&m.id),name:String((m&&m.name)||('Adaptive Muntin '+(i+1))),shapeId:String((m&&m.shapeId)||firstShapeId),muntin:M},shape=DB.shapeDef.find(function(s){return s.id===out.shapeId;});if(shape)pinMuntinShape(out,shape);return out;
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
/* УРОВНИ ВЛАДЕНИЯ УБРАНЫ (24 авг 2026). Навык — это «умеет / не умеет».
   Грейд (Новичок · Мидл · Синьор) не спрашивал никто: ни маршрут, ни очередь,
   ни норма времени, ни цена, ни права — он был виден только сам себе, а
   выставлять его честно значило завести оценку сотрудника со всеми вопросами
   про пересмотр и деньги. Настоящий вопрос здесь один — bus factor: на
   скольких людях держится навык, — и для него хватает галочки. Появится журнал
   событий со сканом бейджа — покрытие будет считаться из фактов, а не из
   отметок, проставленных руками.

   Навык приезжает строкой, объектом {skill} и старым {skill, level} из уже
   сохранённых данных: уровень молча отбрасываем, сам навык сохраняем — иначе
   импорт прежнего экспорта падал бы на валидации (см. validateUsersPayload).
   Неизвестный навык не угадываем и удаляем. */
const normSkill = x => {
 const src=typeof x==='string'?x:(x&&typeof x==='object'?x.skill:null);
 const skill=String(src==null?'':src).trim();
 return SKILLS.includes(skill)?skill:null;
};
function normalizeUsers(){
 if(!Array.isArray(DB.user))DB.user=[];
 DB.user=DB.user.filter(u=>u&&typeof u==='object');
 DB.user.forEach(u=>{
  u.name=String(u.name==null?'':u.name);u.role=ROLES.includes(u.role)?u.role:SAFE_DEFAULT_ROLE;
  const station=String(u.station==null?'':u.station).trim().toUpperCase();u.station=DB.station.some(s=>s.code===station)?station:'';
  const seen=Object.create(null);u.skills=(Array.isArray(u.skills)?u.skills:[]).map(normSkill).filter(s=>s&&!seen[s]&&(seen[s]=true));
 });
}
/* Этап станка обязан быть ЧИСЛОМ. Из импортированного/руками правленного JSON
   он приезжал строкой ("1"), и станок молча выпадал из маршрута, потому что
   сравнение строгое.

   ОДИН СТАНОК СТОИТ НА НЕСКОЛЬКИХ ЭТАПАХ (авг 2026). Раньше здесь было поле
   `level` — ровно один этап на станок. Реальность другая: ЧПУ полирует контур
   (этап 2) и обрабатывает тело стекла (этап 3), это подтверждено пользователем.
   Одним числом такое не выражается, поэтому поле стало массивом `levels`.
   Старое `level` из сохранённых данных подхватывается и переносится. */
function normalizeStations(){
 const levelSeen=Object.create(null),stationSeen=Object.create(null);
 DB.level=DB.level.filter(l=>l&&isFinite(+l.n)&&Number.isInteger(+l.n)&&+l.n>0&&!levelSeen[+l.n]&&(levelSeen[+l.n]=true))
   .map(l=>({n:+l.n,label:String(l.label==null?'':l.label).trim()}))
   .sort((a,b)=>a.n-b.n);
 DB.station=DB.station.filter(s=>{if(!s||!s.code)return false;const code=String(s.code).trim().toUpperCase();if(!code||stationSeen[code])return false;stationSeen[code]=true;return true;}).map(s=>{
  const raw=Array.isArray(s.levels)?s.levels:((s.level===''||s.level==null)?[]:[s.level]);
  const seen=Object.create(null);
  s.levels=raw.map(v=>+v).filter(v=>isFinite(v)&&Number.isInteger(v)&&DB.level.some(l=>l.n===v)&&!seen[v]&&(seen[v]=true)).sort((a,b)=>a-b);
  delete s.level;
  ['maxW','maxL','minTh','maxTh'].forEach(k=>{const v=(s[k]===''||s[k]==null)?null:+s[k];s[k]=isFinite(v)&&v>0?v:null;});
  if(s.maxW==null||s.maxL==null)s.maxW=s.maxL=null;
  if(s.minTh==null||s.maxTh==null||s.minTh>s.maxTh)s.minTh=s.maxTh=null;
  s.code=String(s.code).trim().toUpperCase();s.name=String(s.name==null?'':s.name).trim();s.note=String(s.note==null?'':s.note);
  return s;
 });
 const rv=+DB.refVersion;DB.refVersion=isFinite(rv)&&Number.isInteger(rv)&&rv>0?rv:0;
 /* этап, на который никто не ссылается, оставляем; станок без этапа — тоже
    штатное состояние: так выглядит только что заведённое железо */
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
const REFERENCE_TABLES=['level','station','glassProduct','heatTreatment','spacerVariant','gasProduct','sealantProduct','interlayerProduct','fritProduct','spandrelProduct'];
const REFERENCE_VERSION=2;
let referenceReseeded=false;
/* hadSaved — были ли в браузере сохранённые данные. Нужен ТОЛЬКО для
   уведомления: на чистой установке пересев тоже проходит (версия 0 → 2), но
   говорить «справочники обновлены» там не о чем, ничего не заменялось. */
function reseedReferenceTables(hadSaved){
 const have=Number.isInteger(+DB.refVersion)?+DB.refVersion:0;
 if(have>=REFERENCE_VERSION)return false;
 const done=[];
 REFERENCE_TABLES.forEach(k=>{if(Array.isArray(DEFAULT[k])){DB[k]=JSON.parse(JSON.stringify(DEFAULT[k]));done.push(k);}});
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
function skillBadgeHTML(skill){
 const s=normSkill(skill);
 if(!s)return '';
 return `<span class="skill-badge">${ico(skillIconName(s),'icon-inline')}<span>${esc(s)}</span></span>`;
}
function salesSkillCards(){
 const cards=[
  {id:'shape', icon:'shape', title:'Production Shape', desc:'finished geometry · features · edgework · cutting', meta:'schema v2 · fail closed'},
  {id:'muntin', icon:'muntin', title:'Adaptive Muntin', desc:'pinned Shape revision · 1/16″ grid · real cut lengths', meta:'shape-driven · v4.5'}
 ];
 return `<div class="skill-card-grid sales-skill-grid">${cards.map(c=>`<button type="button" class="skill-card ${subtab===c.id?'active':''}" onclick="subtab='${c.id}';${c.id==='shape'?'sEdit=null;sDraft=null;':'mEdit=null;mDraft=null;'}render()"><div class="skill-card-icon">${ico(c.icon)}</div><div class="skill-card-body"><b>${c.title}</b><small>${c.desc}</small><div class="skill-card-meta"><span class="pill ${subtab===c.id?'ok':'info'}">${c.meta}</span></div></div></button>`).join('')}</div>`;
}

/* B8 · демо-пользователи. Прототип стартовал с пустым DB.user: дашборд
   показывал ноль, отчёт по навыкам был пуст, а привязку к станции и роли
   проверить было не на ком. Трое — по одному на роль, которую в жизни держит
   человек; Админ не засеян намеренно, это техническая роль.
   Имена латиницей: имя пользователя — данные, переводчик их не трогает, и
   русское имя осталось бы русским в английском интерфейсе. */
const DEMO_USERS=[
 {name:'Demo Sales',role:'Продажи',station:'',skills:[]},
 {name:'Demo Accounting',role:'Бухгалтер',station:'',skills:[]},
 {name:'Demo Owner',role:'Владелец',station:'',skills:[]}
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

/* Этапы маршрута — реальная последовательность цеха, снятая с рабочей таблицы
   Main Station и уточнённая пользователем 21–22 августа 2026.
   Мойки среди этапов НЕТ намеренно: она не шаг маршрута, а часть операций
   термообработки и сборки стеклопакета — грязное стекло туда просто не пустят.
   Названия по-русски: перевод накладывается словарём i18n (см. SEED_TEXT). */
const DEFAULT={
 user:[],
 /* НУЛЬ, а не текущая версия, и это не описка. mergeState копирует только те
    ключи, которые ЕСТЬ в сохранённых данных: у старого браузера refVersion нет
    вовсе, значение из DEFAULT остаётся нетронутым. Поставь сюда 2 — и данные
    без версии выглядели бы уже актуальными, пересев не сработал бы никогда
    ровно там, где он и нужен. Ноль означает «версия неизвестна». */
 refVersion:0,
 level:[
  {n:1, label:'Резка'},
  {n:2, label:'Кромка'},
  {n:3, label:'Обработка тела стекла'},
  {n:4, label:'Силкскрин'},
  {n:5, label:'Термообработка'},
  {n:6, label:'Пескоструй'},
  {n:7, label:'Покраска'},
  {n:8, label:'Ламинация'},
  {n:9, label:'Сборка стеклопакета'},
  {n:10,label:'Готово к отгрузке'},
  {n:11,label:'Отгрузка'}
 ],
 station:[
  {code:'CUT1', name:'Раскроечный стол', levels:[1], maxW:null, maxL:null, minTh:3, maxTh:19, note:'Режется только отожжённое стекло'},
  {code:'EDGE1', name:'Кромкообрабатывающая линия', levels:[2], maxW:null, maxL:null, minTh:3, maxTh:19, note:''},
  {code:'BEVEL1', name:'Фацетный станок', levels:[2], maxW:70, maxL:100, minTh:3, maxTh:19, note:''},
  {code:'CNC1', name:'Обрабатывающий центр ЧПУ', levels:[2,3], maxW:60, maxL:122, minTh:3, maxTh:19, note:'Полирует контур (этап 2) и обрабатывает тело стекла (этап 3) — один станок на двух этапах'},
  {code:'FURN1', name:'Печь закалки', levels:[5], maxW:90, maxL:150, minTh:3, maxTh:19, note:'Работает садками, а не поштучно; минимальный размер детали 6 × 12 in'}
 ],
 shapeDef:[{id:'s1', name:'Rectangle 48×36', w:'48', h:'36', smart:{elbowsOn:false,A:{len:'',out:'0',dir:null,elbow:{to:'0',elbowLen:'0',past:'0',mode:null}},B:{len:'',out:'0',dir:null,elbow:{to:'0',elbowLen:'0',past:'0',mode:null}},C:{len:'',out:'0',dir:null,elbow:{to:'0',elbowLen:'0',past:'0',mode:null}},corners:{tl:'none',tr:'none',br:'none',bl:'none'},extraEdges:{},cornerOffsets:{tl:{plumb:'0',plumbDir:null,level:'0',levelDir:null},tr:{plumb:'0',plumbDir:null,level:'0',levelDir:null},br:{plumb:'0',plumbDir:null,level:'0',levelDir:null},bl:{plumb:'0',plumbDir:null,level:'0',levelDir:null}}}}],
 muntinDef:[{id:'m1', name:'Adaptive 2V × 1H', shapeId:'s1', muntin:{enabled:true,productId:'mb058_black',flipped:false,layout:{type:'grid',verticalBars:2,horizontalBars:1},production:{mode:'equal',edgeInsetX:0.4375,edgeInsetY:0.4375,endClearance:0,edgeMode:'offset',verticalPositions:[],horizontalPositions:[]}}}]
};
let DB=JSON.parse(JSON.stringify(DEFAULT)), dirty=false;
