/* =====================================================================
   erp/production/floor  ·  floor-1.0
   План цеха для Production → Floor: зал, стены, станки станций, объекты и
   зоны ожидания — прямоугольники в метрах. Данные, набросок и запись плана;
   рисунок и редактор — views/floor.
   IN : DB.station (коды станций, цвет станции)
   OUT: DB.floorItem {id, kind, station, machine, label, x, y, w, l, h} — метры,
        два знака; kind: hall · machine · wall · object · zone ·
        DB.station[].color — имя токена series-1…24 ·
        normalizeFloor, floorClean, floorSketchItems, floorParseLen,
        floorStationColor, floorWrite (команда записи плана)
   Владелец, 19–20.11.2026 (docs/ЗАДАЧА_КАРТА_ЦЕХА.md):
   - размещает и меряет сам, в метрах («полировка 2 × 6, завтра померяю —
     окажется 7»); поле понимает 6.5, 650 cm, 6500 mm;
   - поворота как поля нет: Rotate 90° меняет местами ширину и длину;
   - зону ожидания станции рисует сам, где угодно, и за залом («я сам
     нарисую, не нужно их ставить сразу возле станции»); одна на станцию;
   - цвет станции выбирает сам; хранится у станции именем токена, не hex —
     обе темы ERP;
   - пустая таблица на старте: план заводит кнопка Start from sketch, а не
     нормализатор — иначе два ПК завели бы план дважды. Save плана,
     начатого с наброска, проверяет, что таблица всё ещё пуста.
   ===================================================================== */
DEFAULT.floorItem=[];
const FLOOR_KINDS=['hall','machine','wall','object','zone'];
const FLOOR_COLORS=Array.from({length:24},(_,i)=>'series-'+(i+1));
const FLOOR_HEIGHT={hall:0,machine:1.2,wall:3,object:2,zone:0};

function floorRound(n){return Math.round(n*100)/100;}
function floorNum(v,d,min,max){const n=+v;return isFinite(n)?floorRound(Math.min(max,Math.max(min,n))):d;}
function floorStr(v,n){return String(v==null?'':v).trim().slice(0,n);}
function floorId(){return typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'fl-'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);}

/* Строка плана: плохие числа — безопасные, размеры не меньше 0.1 м. */
function floorClean(r){
 const kind=FLOOR_KINDS.includes(r&&r.kind)?r.kind:'object';
 const code=v=>typeof sfCode==='function'?sfCode(v):floorStr(v,40).toUpperCase();
 return {id:floorStr(r&&r.id,80)||floorId(),kind,
  station:kind==='hall'||kind==='wall'?'':code(r.station),
  machine:kind==='machine'?code(r.machine):'',
  label:floorStr(r.label,60),
  x:kind==='hall'?0:floorNum(r.x,0,-500,1000),y:kind==='hall'?0:floorNum(r.y,0,-500,1000),
  w:floorNum(r.w,1,0.1,1000),l:floorNum(r.l,1,0.1,1000),
  h:kind==='zone'||kind==='hall'?0:floorNum(r.h,FLOOR_HEIGHT[kind],0,50)};
}
/* Зал — одна строка; id уникальны. */
function normalizeFloor(){
 const seen=new Set();let hall=false;
 DB.floorItem=(Array.isArray(DB.floorItem)?DB.floorItem:[])
  .filter(r=>r&&typeof r==='object'&&typeof r.id==='string'&&r.id&&!seen.has(r.id)&&(seen.add(r.id),true))
  .map(floorClean).filter(r=>r.kind!=='hall'||(!hall&&(hall=true)));
}

/* Длина в метрах: 6.5 · 6.5 m · 650 cm · 6500 mm. Иначе NaN. */
function floorParseLen(v){
 const m=/^\s*(-?\d+(?:[.,]\d+)?)\s*(m|cm|mm)?\s*$/i.exec(String(v==null?'':v));
 if(!m)return NaN;
 const n=+m[1].replace(',','.'),u=(m[2]||'m').toLowerCase();
 return floorRound(u==='cm'?n/100:u==='mm'?n/1000:n);
}

/* Цвет станции: свой (токен) или по порядку станции — соседи не совпадают. */
function floorStationColor(code,colors){
 if(colors&&Object.prototype.hasOwnProperty.call(colors,code)&&colors[code])return colors[code];
 const i=(DB.station||[]).findIndex(s=>s.code===code);if(i<0)return '';
 const c=DB.station[i].color;return FLOOR_COLORS.includes(c)?c:FLOOR_COLORS[i%FLOOR_COLORS.length];
}

/* Набросок владельца 19.11: зал 65 × 70, полоса 8.80 м внизу со стеной,
   внутренняя стена x = 32.5 до y = 40, блоки 1–17 без станций — подпись —
   номер блока наброска; станцию владелец выбирает сам в Edit. */
const FLOOR_SKETCH=[
 ['1',3.7,0.6,3.7,11.9],['2',8.1,7.0,2.0,9.9],['3',18.1,1.9,12.0,2.1],['4',1.1,20.0,2.0,14.0],
 ['5',10.8,19.8,7.1,17.0],['6',27.5,11.0,2.6,3.6],['7',23.0,20.2,2,6],['8',29.1,20.2,2,6],['9',29.1,29.2,2,6],
 ['10',34.0,1.9,2,6],['11',40.1,1.9,2,6],['12',34.0,9.9,2,6],['13',34.0,20.0,6,6],
 ['14',34.0,27.0,1,12],['14',39.0,27.0,1,12],['14',35.0,30.0,4,3],['15',46.0,9.9,6,6],
 ['16',46.0,17.0,1,22],['16',51.0,17.0,1,22],['16',47.0,20.0,4,3],['17',53.1,0.6,2.0,40.0]
];
function floorSketchItems(){
 const row=(kind,x,y,w,l,label)=>floorClean({id:floorId(),kind,x,y,w,l,label:label||''});
 return [row('hall',0,0,65,70),row('wall',0,61.2,65,0.2),row('wall',32.5,0,0.2,40)]
  .concat(FLOOR_SKETCH.map(([n,x,y,w,l])=>row('machine',x,y,w,l,n)));
}

/* Запись плана — одна команда. fresh: план начат с наброска или с пустого
   зала — если другой ПК уже завёл свой, второго плана нет. colors —
   правка цвета станций в том же Save. */
function floorWrite(draft){
 return storageCommand(()=>{
  if(draft.fresh&&(DB.floorItem||[]).length)throw new Error('Plan already exists on another PC.');
  DB.floorItem=(draft.items||[]).map(floorClean);
  normalizeFloor();
  Object.entries(draft.colors||{}).forEach(([code,c])=>{
   const s=(DB.station||[]).find(x=>x.code===code);if(!s)return;
   if(FLOOR_COLORS.includes(c))s.color=c;else delete s.color;
  });
  return true;
 });
}
