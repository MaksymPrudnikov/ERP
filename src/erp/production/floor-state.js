/* =====================================================================
   erp/production/floor-state  ·  floor-2.0
   Что сейчас в цеху для плана Production → Floor (A2): состояние станций и
   станков, где стоит тара, цифры карточки станции за период. Только счёт —
   рисует views/floor.
   IN : prodBoard() (views/production-board) · DB.stationScan, DB.station,
        DB.ncr, DB.sheetBreak · repWorkFacts (reports/facts; с архивом —
        reports/archive-facts, как в Reports)
   OUT: floorLive() — {at, st:{code:{waiting, last, working, status,
        machines:{P1:{last, working}}}}, carriers:[{code, skid, station,
        count, split}]} · floorUsualGap(code) · floorWorkingMin(code) ·
        floorPeriodRange(p, today) · floorCard(code, p); status 'help' — открыт
        вызов HELP (erp/shopfloor/station-call), он важнее Working / Waiting
   Владелец, 20.11.2026 (docs/ЗАДАЧА_КАРТА_ЦЕХА.md, A2):
   - Working — неотменённый скан станции за последние N минут; N — свой у
     станции (workingMin, «на закалке перерывы между партиями 20 минут, на
     CNC 1–2 часа»); подсказка «обычный перерыв» — только подсказка;
   - станция со станками в работе, если работает хотя бы один станок;
   - долли стоит в зоне станции, которую ждёт её стекло; стекло на разные
     станции — значок один, где его больше («3 стекла могли положить, не
     глядя на экран»); пустая тара на план не попадает;
   - работа станции — в её единицах (ft², дюймы, отверстия, катауты), станции
     между собой не сравниваются; брак — две цифры: разбито здесь и NCR, где
     причиной указана станция.
   ===================================================================== */
const FLOOR_WORKING_MIN=15,FLOOR_PERIODS=['today','yesterday','7','30'];
let floorLiveMemo={key:'',data:null};

function floorWorkingMin(code){const s=(DB.station||[]).find(x=>x.code===code),n=s&&+s.workingMin;return Number.isInteger(n)&&n>0?n:FLOOR_WORKING_MIN;}

/* Обычный перерыв станции: 90-й процентиль промежутков между соседними
   сканами внутри одного дня за 14 дней (ночь и выходные — не промежутки). */
function floorUsualGap(code,now){
 const end=now?new Date(now):new Date(),from=new Date(end.getTime()-14*864e5).toISOString(),byDay=new Map();
 (DB.stationScan||[]).forEach(s=>{if(s.station!==code||s.undoneAt||s.park||s.at<from)return;const d=repDay(s.at);if(!byDay.has(d))byDay.set(d,[]);byDay.get(d).push(Date.parse(s.at));});
 const gaps=[];byDay.forEach(a=>{a.sort((x,y)=>x-y);for(let i=1;i<a.length;i++){const g=(a[i]-a[i-1])/6e4;if(g>0.5)gaps.push(g);}});
 if(gaps.length<5)return null;
 gaps.sort((x,y)=>x-y);return Math.round(gaps[Math.min(gaps.length-1,Math.floor(gaps.length*0.9))]);
}

/* Сейчас: ждёт, последний скан, Working по порогу станции, станки, тара. */
function floorLive(now){
 const at=now||new Date().toISOString(),key=(typeof prodBoardStamp==='function'?prodBoardStamp():'')+'|'+at.slice(0,16)+'|'+(DB.station||[]).map(s=>s.code+(s.workingMin||'')+(s.machines||[]).join()).join()+'|'+(DB.stationCall||[]).map(c=>c.id+c.closedAt).join();
 if(floorLiveMemo.key===key&&!now)return floorLiveMemo.data;
 const t=Date.parse(at),st={},board=typeof prodBoard==='function'?prodBoard():[];
 const calls=typeof stationCallsOpen==='function'?stationCallsOpen():new Map();
 (DB.station||[]).forEach(s=>{st[s.code]={waiting:0,last:'',working:false,status:'idle',machines:{},help:calls.get(s.code)||null};(s.machines||[]).forEach(m=>{st[s.code].machines[m]={last:'',working:false};});});
 board.forEach(x=>Object.keys(x.counts||{}).forEach(k=>{if(st[k])st[k].waiting+=x.counts[k];}));
 (DB.stationScan||[]).forEach(s=>{
  if(s.undoneAt)return;const r=st[s.station];if(!r)return;
  if(s.at>r.last)r.last=s.at;
  if(s.machine&&r.machines[s.machine]&&s.at>r.machines[s.machine].last)r.machines[s.machine].last=s.at;
 });
 Object.keys(st).forEach(code=>{
  const r=st[code],lim=floorWorkingMin(code)*6e4,fresh=v=>!!v&&t-Date.parse(v)<=lim&&Date.parse(v)<=t+6e4;
  Object.values(r.machines).forEach(m=>{m.working=fresh(m.last);});
  r.working=fresh(r.last);
  r.status=r.help?'help':r.working?'working':r.waiting>0?'waiting':'idle';
 });
 /* Тара: у каждой — сколько её стекла ждёт какую станцию; место — где больше,
    ничья — раньше по маршруту (шаг станции). */
 const by=new Map();
 board.forEach(x=>Object.keys(x.onAt||{}).forEach(code=>Object.keys(x.onAt[code]).forEach(c=>{if(!c)return;let m=by.get(c);if(!m)by.set(c,m={});m[code]=(m[code]||0)+x.onAt[code][c];})));
 const seq=c=>{const s=(DB.station||[]).find(x=>x.code===c);return s?s.seq:1e9;};
 const carriers=[...by.entries()].map(([code,split])=>{
  const station=Object.keys(split).sort((a,b)=>split[b]-split[a]||seq(a)-seq(b))[0];
  return {code,skid:/^S/.test(code),station,count:Object.values(split).reduce((n,v)=>n+v,0),split};
 }).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
 const data={at,st,carriers};
 if(!now)floorLiveMemo={key,data};
 return data;
}

/* Период карточки: today · yesterday · 7 · 30 (дней по сегодня). */
function floorPeriodRange(p,today){
 const day=d=>{const x=new Date(today+'T12:00:00');x.setDate(x.getDate()-d);return repDay(x.toISOString());};
 if(p==='yesterday'){const y=day(1);return {from:y,to:y,days:[y]};}
 if(p==='7'||p==='30'){const n=+p,days=[];for(let i=n-1;i>=0;i--)days.push(day(i));return {from:days[0],to:today,days};}
 return {from:today,to:today,days:[today]};
}
/* Ключи фактов работы, которые читает карточка (архивные месяцы — только они). */
const FLOOR_WORK_KEYS=['station','machine','day','hour','personId','area','inches','workFt2','pcs','works','unitDone','asm','at'];

/* Цифры карточки станции за период. archive: 'none' | 'loading' | 'ready'. */
function floorCard(code,p,today){
 const r=floorPeriodRange(p,today),one=r.days.length===1;
 let archive='none';
 if(!one&&typeof archiveScopeFor==='function'&&typeof archiveIndex!=='undefined'&&archiveIndex.size)
  archive=archiveScopeFor([[r.from,r.to]],new Map([['work',new Set(FLOOR_WORK_KEYS)]]));
 /* Только эта станция за эти дни (repWorkSpan); заказы из архива — как Reports. */
 let list=one?repWorkFacts(r.from).filter(f=>f.station===code):repWorkSpan(code,r.from,r.to);
 if(!one&&archive==='ready'&&typeof archiveFactsMerge==='function')list=archiveFactsMerge('work',list,[]).filter(f=>f.station===code&&f.day>=r.from&&f.day<=r.to);
 const merge=typeof stationMergeCodes==='function'&&stationMergeCodes().includes(code);
 const measures=floorMeasures(list,merge);
 /* Работы станции по видам: «Holes 34 pcs» и размеры «12 mm 20 · 25 mm 14». */
 const ops=new Map();
 list.forEach(f=>(f.works||[]).forEach(w=>{
  const name=w.op||w.label,unit=w.unit==='in'?'in':w.unit==='ft²'?'ft²':'pcs';let o=ops.get(name+'|'+unit);
  if(!o)ops.set(name+'|'+unit,o={name,unit,qty:0,sizes:new Map()});o.qty+=+w.qty||0;
  const size=(/ · ([\d.]+ mm)$/.exec(String(w.label||''))||[])[1];if(size)o.sizes.set(size,(o.sizes.get(size)||0)+(+w.qty||0));
 }));
 /* Брак и NCR — один проход по сканам и NCR на весь период, по дням
    (прежде — проход всех сканов года на каждый день периода). */
 const brokenBy=new Map(),ncrBy=new Map(),add=(m,d,n)=>m.set(d,(m.get(d)||0)+n);
 (DB.stationScan||[]).forEach(s=>{if(s.station!==code||!s.broken||s.undoneAt)return;const d=repDay(s.at);if(d>=r.from&&d<=r.to)add(brokenBy,d,1);});
 if(typeof stationCutCode==='function'&&code===stationCutCode())(DB.sheetBreak||[]).forEach(b=>{const d=b.at?repDay(b.at):'';if(d>=r.from&&d<=r.to)add(brokenBy,d,1);});
 (DB.ncr||[]).forEach(n=>{if(n.where!==code||!n.createdAt)return;const d=repDay(n.createdAt);if(d>=r.from&&d<=r.to)add(ncrBy,d,(n.glass||[]).reduce((k,g)=>k+(+g.qty||1),0));});
 const sumOf=m=>[...m.values()].reduce((n,v)=>n+v,0),broken=sumOf(brokenBy),ncr=sumOf(ncrBy);
 const people=new Set(list.map(f=>f.personId).filter(Boolean)).size;
 const st=(DB.station||[]).find(x=>x.code===code),machines=st&&st.machines||[];
 const main=floorMainMeasure(list),val=rows=>rows.reduce((n,f)=>n+(+f[main.k]||0),0);
 const byMachine=machines.map(m=>{const rows=list.filter(f=>f.machine===m);return {code:m,done:rows.length,main:val(rows)};});
 const rowsBy=new Map();list.forEach(f=>{let a=rowsBy.get(f.day);if(!a)rowsBy.set(f.day,a=[]);a.push(f);});
 /* Рабочие дни (задание: «рабочие дни, пустой день — 0»): суббота и воскресенье
    без работы, брака и NCR — не строки и не столбики. */
 const weekend=d=>{const w=new Date(d+'T12:00:00').getDay();return w===0||w===6;};
 const byDay=r.days.filter(d=>!weekend(d)||rowsBy.has(d)||brokenBy.has(d)||ncrBy.has(d)).map(d=>{const rows=rowsBy.get(d)||[];return {day:d,done:rows.length,main:val(rows),people:new Set(rows.map(f=>f.personId).filter(Boolean)).size,machines:new Set(rows.map(f=>f.machine).filter(Boolean)).size,
  broken:brokenBy.get(d)||0,ncr:ncrBy.get(d)||0};});
 const byHour=one?Array.from({length:24},(_,h)=>({hour:h,done:list.filter(f=>f.hour===h).length})).filter(x=>x.done):[];
 return {range:r,archive,done:list.length,measures,ops:[...ops.values()],broken,ncr,people,byMachine,byDay,byHour,
  machinesDays:machines.map((_,i)=>({k:i+1,days:byDay.filter(d=>d.machines===i+1).length})),main};
}
/* Меры станции — как на её экране (Board): только то, что у станции есть. */
function floorMeasures(list,merge){
 const sum=k=>list.reduce((n,f)=>n+(+f[k]||0),0),out=[{label:'Glass',value:list.length,digits:0}];
 const area=sum('area');if(area)out.push({label:'Glass ft²',value:area,digits:1});
 if(merge)out.push({label:'Units',value:new Set(list.filter(f=>f.unitDone&&f.asm).map(f=>f.asm)).size,digits:0});
 [['inches','Linear in',0],['workFt2','Work ft²',1],['pcs','Works, pcs',0]].forEach(([k,label,digits])=>{const v=sum(k);if(v)out.push({label,value:v,digits});});
 return out;
}
/* Главная мера станции для строк по дням и станкам: дюймы, ft² работы, штуки работ, ft² стекла. */
function floorMainMeasure(rows){
 const sum=k=>rows.reduce((n,f)=>n+(+f[k]||0),0);
 for(const [k,label,digits] of [['inches','Linear in',0],['workFt2','Work ft²',1],['pcs','Works, pcs',0],['area','Glass ft²',1]]){const v=sum(k);if(v)return {k,label,value:v,digits};}
 return {k:'area',label:'Glass ft²',value:0,digits:1};
}
