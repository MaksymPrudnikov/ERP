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
/* `maxW` / `maxL` — габарит детали, который станция физически принимает. Нужен
   затем, чтобы расчёт заказа сказал «не влезет» ДО резки, а не цех после неё.

   Засев 144 × 100″ — габарит стандартного листа, то есть «не уже листа».
   Владелец 11 сентября 2026: «поставь пока ограничения 144х100 на всех
   станциях, я потом буду править». Это ЗАСЕВ, а не замер: числа из старой
   таблицы рабочих мест (70×100 у фацета, 60×122 у ЧПУ, 90×150 у печи) сюда не
   перенесены — они помечены в цеховых данных как «снять габарит» и «проверить»,
   то есть владельцем не подтверждены. Экран обязан показывать это отличие.

   `sizeMeasured` и есть это отличие: пока он false, габарит — предположение, и
   подпись «не проверено в цеху» обязана стоять рядом с числом. Иначе засев
   через месяц станет выглядеть замером, и когда фацет откажется брать деталь
   80 × 110, никто не поймёт почему — система-то говорила, что влезает. */
const STATION_SEED_MAX_W=144,STATION_SEED_MAX_L=100;
DEFAULT.station=[
 {seq:1, code:'CUT',  name:'Резка',                  nameEn:'Cutting',        always:true,  note:'режется только отожжённое стекло'},
 {seq:2, code:'EDGE', name:'Кромка',                 nameEn:'Edge work',      always:false, note:'услуги: arris · polish · cnc shape polish · miter · bevel · lami polish'},
 {seq:3, code:'DRILL',name:'Сверловка',              nameEn:'Drilling',       always:false, note:'петли · клемы · патчи · отверстия до 1 3/4" · ручной нотч. Свёрл крупнее в цеху нет'},
 {seq:4, code:'CNC',  name:'ЧПУ',                    nameEn:'CNC',            always:false, note:'нотч на ЧПУ · внутренние вырезы · радиусы · отверстия свыше 1 3/4"'},
 {seq:5, code:'CERP', name:'Силкскрин',              nameEn:'Ceramic paint',  always:false, note:'услуги: ceramic frit (3 узора) · digital ceramic print'},
 {seq:6, code:'HEAT', name:'Термообработка',         nameEn:'Heat treatment', always:false, note:'услуги: tempering · heat strengthening · heat soak. Вся механика до неё'},
 {seq:7, code:'SAND', name:'Пескоструй',             nameEn:'Sandblasting',   always:false, note:'позиция в маршруте зависит от того, есть ли термообработка'},
 {seq:8, code:'PAINT',name:'Покраска',               nameEn:'Painting',       always:false, note:'услуги: opaci-coat standard/custom · backpainting'},
 {seq:9, code:'LAM',  name:'Ламинация',              nameEn:'Lamination',     always:false, note:'lead time 3 дня, у остальных 1. Точка слияния компонентов'},
 {seq:10,code:'IGU',  name:'Сборка стеклопакета',    nameEn:'IGU assembly',   always:false, note:'мойка входит в операцию. Точка слияния компонентов'},
 {seq:11,code:'SHIPR',name:'Готово к отгрузке',      nameEn:'Shipping ready', always:true,  note:''},
 {seq:12,code:'SHIP', name:'Отгрузка',               nameEn:'Shipping',       always:true,  note:'включает монтаж — развести при проектировании отгрузки'}
].map(s=>Object.assign({maxW:STATION_SEED_MAX_W,maxL:STATION_SEED_MAX_L,sizeMeasured:false},s));
/* Станция FAB упразднена 11 сентября 2026. Она была зонтиком над сверловкой и
   ЧПУ — «работа по телу стекла», — и в маршруте печаталась одной строкой, из
   которой цех не понимал, на чём деталь делают. Владелец: «все петли, отверстия,
   клемы делаются на станции drill», «кроме больших отверстий на CNC». После
   того как работы разъехались по двум настоящим станциям, у зонтика не осталось
   ни одной операции. Перенос старых данных — в normalizeShopFloor. */

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
/* Справочники ОПЕРАЦИЙ и РАБОЧИХ МЕСТ удалены 11 сентября 2026.

   Операции ушли в работы (erp/masterdata/glass, DB.serviceRate): там у строки
   есть и станция, и момент маршрута, и цена. Пока таблиц было две, маршрут и
   счёт читали разные источники — расхождение было вопросом времени.

   Рабочие места несли ровно две вещи, и обе нашли правильные места. «Кто на
   нём стоит» — журнал сканов: по разделу 7 хендоффа учётка принадлежит
   терминалу станции, а человек опознаётся бейджем при действии. «Какой
   габарит» — ограничение станции (maxW / maxL выше).

   Владелец 11 сентября: «полишинг станция одна, CNC станция одна, и остальные
   тоже, все станции по одной». Три полировальных станка и трое человек за ними
   — это один участок, а не три строки справочника.

   Вернутся в фазе планирования загрузки: там понадобятся объекты с садкой и
   вместимостью — печь и автоклав. Заводить их сейчас, за полгода до нужды,
   значило бы повторить болезнь, от которой мы лечимся. */
DEFAULT.terminal=[];

/* Припуск на рез — цеховой факт про съём материала станком, поэтому таблица
   живёт рядом с операциями. Заводские строки берутся у модуля Shape: он же по
   ним и считает, и второй сид разошёлся бы с первым при первой же правке.
   Владелец меняет значения в Справочниках — «делаем по памяти» перестаёт быть
   единственным местом, где эти цифры записаны. */
DEFAULT.edgeAllowance=ShapeModule.allowanceDefaults();

/* Таблица уезжает в модуль: сам он про DB ничего не знает и знать не должен,
   а считать обязан по тем же строкам, что показаны в справочнике. Вызывается
   из normalizeShopFloor, то есть на загрузке, пересеве и импорте разом. */
function normalizeEdgeAllowance(){
 DB.edgeAllowance=(Array.isArray(DB.edgeAllowance)?DB.edgeAllowance:[]).filter(r=>r&&typeof r==='object');
 if(!DB.edgeAllowance.length)DB.edgeAllowance=ShapeModule.allowanceDefaults();
 const rows=ShapeModule.setAllowanceTable(DB.edgeAllowance);
 /* Пустая или сплошь битая таблица — не повод блокировать рез: модуль
    откатывается на заводские строки, и это видно в справочнике. */
 return rows;
}

/* ---------------------------------------------------------------------
   Выведенные связи. Ничего не хранят — считают из уже введённого.
   --------------------------------------------------------------------- */
function stationSeq(code){const s=DB.station.find(x=>x.code===code);return s?s.seq:999;}
/* Работы станции. Единственная выведенная связь, которая осталась: всё
   остальное держалось на рабочих местах. */
function stationOperations(code){return (DB.serviceRate||[]).filter(w=>w&&w.station===code);}

function normalizeShopFloor(){
 normalizeEdgeAllowance();
 const seen=Object.create(null);
 DB.station=(Array.isArray(DB.station)?DB.station:[]).filter(s=>{
  if(!s||typeof s!=='object')return false;
  const code=sfCode(s.code);if(!code||seen[code])return false;seen[code]=true;return true;
 }).map((s,i)=>{
  const seq=Number.isInteger(+s.seq)&&+s.seq>0?+s.seq:i+1;
  /* Габарит: положительное число либо null. Ноль и мусор становятся null, то
     есть «не задано», а не «станция ничего не принимает» — нулевое ограничение
     запретило бы вообще всё и выглядело бы как поломка расчёта. */
  const dim=v=>{const n=+v;return isFinite(n)&&n>0?n:null;};
  return {seq,code:sfCode(s.code),name:sfStr(s.name),nameEn:sfStr(s.nameEn),always:s.always===true,
   maxW:dim(s.maxW),maxL:dim(s.maxL),sizeMeasured:s.sizeMeasured===true,note:sfStr(s.note)};
 }).sort((a,b)=>a.seq-b.seq);

 const tSeen=Object.create(null);
 DB.terminal=(Array.isArray(DB.terminal)?DB.terminal:[]).filter(t=>{
  if(!t||typeof t!=='object')return false;
  const code=sfCode(t.code);if(!code||tSeen[code])return false;tSeen[code]=true;return true;
 }).map(t=>{
  const stSet=Object.create(null);
  return {
   code:sfCode(t.code),name:sfStr(t.name),nameEn:sfStr(t.nameEn),
   stations:(Array.isArray(t.stations)?t.stations:[]).map(sfCode)
     .filter(c=>c&&DB.station.some(x=>x.code===c)&&!stSet[c]&&(stSet[c]=true)),
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
