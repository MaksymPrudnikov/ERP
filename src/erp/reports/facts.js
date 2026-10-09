/* =====================================================================
   reports/facts  ·  facts-1.0
   Факты цеха для Board станции, Overview и отчётов: одна строка — одно
   событие. Только данные: на входе DB, на выходе массивы строк.
   IN : журнал сканов станций, заказы, работы (Works) и их прайс
   OUT: repWorkFacts() — скан станции с мерой сделанной работы
   Правило: файл ничего не рисует.

   Владелец, 9 октября 2026: работу человека и станции меряем физически —
   линейные дюймы кромки, ft², штуки — по толщине стекла; «даже там, где
   клиенту дали 0 за полировку». Доллары — по прайсу Works (ставка прайса,
   запомненная заказом при сохранении), а не то, что выставили клиенту: у
   клиентов бывают свои цены. День — сутки 0:00–24:00, без окон смен:
   работают и через полночь, «никаких лимитов и блоков по времени».
   ===================================================================== */

/* Работы стекла на станции берутся из тех же строк начислений, что идут в
   счёт (salesLineChargeRows): иначе дюймы отчёта разошлись бы с дюймами
   счёта. Строка начислений — на один юнит позиции и на все его стёкла;
   стеклу достаётся доля среди стёкол юнита, которые идут через эту станцию
   и имеют ту же толщину прайса. Станцию работе даёт то же правило, что
   маршруту стикера (sales/print-route). */
const REP_BANDS=['6','8-10','12-19'];
const REP_EDGE_TYPE={roughArris:'Rough Arris',flatPolish:'Flat Polish',cncShapePolish:'CNC Shape Polish',lamiPolish:'Lami Polish',cncLamiPolish:'CNC Lami Polish',bevel:'Beveling'};
const REP_FEATURE_WORK={radius:'radiusCorner',cutout:'cutout','notch-cnc':'notchCnc','notch-hand':'notchHand','mirror-sealant':'mirrorSealant'};
function repWorkStation(id){const w=salesRouteWork(id);return w&&w.station||'';}
function repChargeStation(row){
 const p=String(row&&row.key||'').split(':');
 if(p[0]==='EDGE'){
  const t=REP_EDGE_TYPE[p[1]]||(/^miter/.test(p[1])?'Mitering':'');
  return t?salesRouteStationOf(SALES_ROUTE_EDGE_OP[t],SALES_ROUTE_EDGE_HOME[t]||'POLISH'):'';
 }
 if(p[0]==='MI')return p[1]==='hole'?repWorkStation('hole:'+p[2]):salesRouteStationOf('hinge','DRILL');
 if(p[0]==='FEATURE'){
  const f=p[1]||'',id=REP_FEATURE_WORK[f]||(/^mirror-backer/.test(f)?'mirrorBacker':/^sandblast-pattern/.test(f)?'sandblastPattern':/^sandblast-/.test(f)?'sandblastFull':'');
  return id?repWorkStation(id):'';
 }
 if(p[0]==='HEATSOAK')return repWorkStation('heat_soak');
 if(p[0]==='MUNTIN')return repWorkStation('muntinSection');
 if(p[0]==='GLAZE')return p[1]==='frit'?repWorkStation('ceramic_frit'):'';
 return '';
}
/* Толщина прайса у строки — последний кусок ключа (EDGE:flatPolish:6,
   MI:hole:1-2:6). Нет её — строка общая для всех стёкол юнита. */
function repRowBand(row){const p=String(row&&row.key||'').split(':'),b=p[p.length-1];return p[0]!=='HEATSOAK'&&REP_BANDS.includes(b)?b:'';}
/* Подходит ли стекло юнита к строке начислений: толщина, плёнка, пакет.
   c — стекло позиции с его толщиной прайса (repLineWork). */
function repRowFits(row,c){
 const p=String(row.key||'').split(':'),band=repRowBand(row);
 if(p[0]==='HEATSOAK')return c.paneId===p[1]&&(!c.ply||(p[2]==='1'?'inner':'outer')===c.ply);
 if(p[0]==='EDGE'&&(p[1]==='lamiPolish'||p[1]==='cncLamiPolish'))return !!c.ply;
 return !band||c.band===band;
}

/* Расчёт строки заказа тяжёлый (форма, план резки) — одна позиция считается
   один раз, сколько бы её стёкол ни отсканировали. Прайс правят в Master
   Data — тогда память сбрасывается целиком. */
let repLineMemo={stamp:'',map:new Map()};
function repCatalogStamp(){let h=0;(DB.serviceRate||[]).forEach(r=>{const s=r?r.id+'|'+r.station+'|'+r.flat+'|'+JSON.stringify(r.bands||{}):'';for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;});return (DB.serviceRate||[]).length+':'+h;}
function repLineWork(o,l,geo,tag){
 const stamp=repCatalogStamp();if(repLineMemo.stamp!==stamp)repLineMemo={stamp,map:new Map()};
 const key=[o.id,o.updatedAt||'',l.id,tag].join('|');
 if(repLineMemo.map.has(key))return repLineMemo.map.get(key);
 let out={rows:[],plan:{valid:false},comps:[]};
 try{out=finWithOrder(o,()=>({
  rows:salesLineChargeRows(geo).map(row=>({row,station:repChargeStation(row),rate:salesChargePricingState(geo,row).catalogRate})).filter(x=>x.station),
  plan:stkPlan(o,geo),
  comps:glassBatchComponents(o,l).filter(c=>!c.missing).map(c=>{const mm=stkGlassInfo(c.pane,c.index,c.ply).mm;return Object.assign({},c,{mm:mm||null,band:mm?salesPricingBandFor(mm).band:''});})
 }));}catch(e){}
 if(repLineMemo.map.size>4000)repLineMemo.map=new Map();
 repLineMemo.map.set(key,out);return out;
}
/* Что сделано с одним стеклом на одной станции: площадь, толщина и работы
   с количеством в единице работы (in · ft² · pc) и $ по прайсу. */
function repGlassWork(g,station){
 const empty={area:null,mm:null,works:[]};
 if(!g||!g.c||g.c.missing)return empty;
 const geo=stationGeo(g)||g.l,tag=typeof g.unit==='string'?g.unit:'',lw=repLineWork(g.o,g.l,geo,tag);
 const me=lw.comps.find(c=>c.key===g.c.key);if(!me)return empty;
 const lite=lw.plan&&lw.plan.valid?(lw.plan.lites||[]).find(x=>x.index===g.c.index):null;
 let area=null;try{area=finWithOrder(g.o,()=>stkPieceArea(geo,g.o,lite));}catch(e){}
 const works=[];
 lw.rows.forEach(x=>{
  if(x.station!==station||!repRowFits(x.row,me))return;
  const mates=lw.comps.filter(c=>repRowFits(x.row,c)&&stationRouteOf({o:g.o,l:g.l,c,unit:g.unit}).codes.includes(station)).length||1;
  const qty=x.row.basis/mates;
  works.push({key:x.row.key,label:x.row.label,unit:x.row.unit,qty,usd:x.rate==null?null:qty*x.rate});
 });
 return {area:area>0?area:null,mm:me.mm,works};
}

/* День и час — по часам этого компьютера, как finToday. */
function repDay(iso){const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';const p=v=>String(v).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function repHour(iso){const d=new Date(iso);return Number.isNaN(d.getTime())?-1:d.getHours();}

/* Факты работы: скан, который продвинул стекло. Разбитое (Recut) и вынутое
   из машины на IGU («waits for a pair») — не сделанная работа. Отменённый
   скан не считается. Сумма по работам — в мерах: дюймы, ft² работ, штуки. */
let repWorkCache={stamp:'',rows:null};
let repWorkBuilds=0;
function repWorkStamp(){
 const scans=DB.stationScan||[];let undone=0;scans.forEach(s=>{if(s.undoneAt)undone++;});
 return [scans.length,undone,DB.stationScanSeq,repCatalogStamp(),(DB.salesOrder||[]).map(o=>o.id+(o.updatedAt||'')).join(',')].join('|');
}
function repWorkFacts(){
 const stamp=repWorkStamp();if(repWorkCache.stamp===stamp&&repWorkCache.rows)return repWorkCache.rows;
 repWorkBuilds++;
 const index=stationPieceIndex(),batches=stationBatchIndex(),rows=[];
 (DB.stationScan||[]).forEach(s=>{
  if(s.undoneAt||s.broken||s.park)return;
  const g=stationGlass(s.piece,index,batches),w=g?repGlassWork(g,s.station):{area:null,mm:null,works:[]};
  const sum=u=>w.works.filter(x=>x.unit===u).reduce((n,x)=>n+x.qty,0);
  const priced=w.works.filter(x=>x.usd!=null);
  rows.push({id:s.id,at:s.at,day:repDay(s.at),hour:repHour(s.at),station:s.station,personId:s.byId||s.by||'',person:s.by||'',piece:s.piece,
   orderId:g?g.o.id:'',order:g?g.o.businessNumber||'':'',customerId:g?g.o.customerId||'':'',priority:g?g.o.priority||'':'',
   glass:g&&g.c?g.c.glass:'',mm:w.mm,area:w.area,works:w.works,inches:sum('in'),workFt2:sum('ft²'),pcs:sum('pc'),
   usd:priced.length?priced.reduce((n,x)=>n+x.usd,0):null,unpriced:w.works.length-priced.length,
   asm:s.asm||'',unitDone:!!(s.unit||s.joined),manual:!!s.manual,confirmedAt:s.confirmedAt||''});
 });
 repWorkCache={stamp,rows};
 return rows;
}
