/* =====================================================================
   erp/production/cut-layout  ·  cut-2.0
   Раскрой батча по листам: раскладка, правки руками, потери.
   IN : батч (erp/production/glass-batches), листы (DB.glassSheet),
        параметры реза по толщине (masterdata/cutting)
   OUT: DB.cutPlan — листы с местами стёкол, остаток, Used / Gross / Net

   Владелец, 17 сентября 2026, по своему проекту Perfect Cut:
   - между прямоугольниками зазора НЕТ; минимальное расстояние нужно,
     «только когда шейп кривой, имеет скос специфичный»;
   - Trim и Border — отступы от краёв листа (18 сентября): Trim X снизу,
     Trim Y слева, Border X сверху, Border Y справа; детали за эти линии
     не заходят;
   - «основной задачей является оптимизация под низший процент», приоритет
     лишь тянет деталь на первые листы;
   - главное — порезать заказы, потратив меньше стекла; сток — только бонус
     (18 сентября: «моя задача оптимизировать заказы под хороший процент, а не
     хорошо коллекционировать стекло в стоке»). Раскладку выбираем по площади
     листов, остаток решает лишь при равенстве;
   - потери нужно видеть по каждому листу и по всем: по ним считают цену
     большого заказа;
   - раскладку правят руками: снять, положить, повернуть, перенести,
     закрепить деталь, заблокировать лист — «заблокированный лист будет
     первый в очереди, остальные после».
   Счёт потерь как у Perfect Cut: Gross Scrap — весь остаток листа,
   NetScrap — остаток за вычетом куска, который кладут на стеллаж,
   Used % = used / (used + net). Кусок на стеллаж программа только
   подсказывает; пока его не отметили «в сток», он отход и Net = Gross:
   «если мы его не выбрали, значит, оно не сток, а отход».
   ===================================================================== */
DEFAULT.cutPlan=[];
const CUT_STRATEGIES=[
 {k:'area',   order:(a,b)=>b.w*b.h-a.w*a.h,                       prefer:'more'},
 {k:'long',   order:(a,b)=>Math.max(b.w,b.h)-Math.max(a.w,a.h),   prefer:'more'},
 {k:'height', order:(a,b)=>b.h-a.h||b.w-a.w,                      prefer:'tall'},
 {k:'width',  order:(a,b)=>b.w-a.w||b.h-a.h,                      prefer:'wide'}
];
function cutRound(v){return Math.round(v*16)/16;}
function cutArea(w,h){return (+w||0)*(+h||0)/144;}
function cutFt2(v){return Math.round(v*100)/100;}
function cutPct(part,whole){return whole>0?Math.round(part/whole*1000)/10:0;}
/* ------------------------------ Детали ------------------------------ */
/* Стёкла батча как прямоугольники реза: тот же размер, что печатает стикер.
   shape — деталь не прямоугольная: вокруг неё нужен зазор. */
function cutPieces(batch,settings){
 const out=[],set=settings||{};
 (typeof glassBatchActiveItems==='function'?glassBatchActiveItems(batch):[]).forEach(item=>{
  const part=batch.parts[item.part],o=salesRecord(part.orderId),l=o&&(o.lines||[]).find(x=>x.id===part.lineId);
  if(!o||!l)return;
  const c=glassBatchComponents(o,l).find(x=>x.key===part.key);if(!c||c.missing)return;
  const plan=finWithOrder(o,()=>{try{return salesEffectiveCuttingPlan(l,salesLineGeometryShape(l),o);}catch(e){return {valid:false};}});
  const lite=plan.valid&&(plan.lites||[]).find(x=>x.index===c.index);if(!lite||!(+lite.cutW>0)||!(+lite.cutH>0))return;
  const g=glassProductById(c.glassId),own=set[item.piece]||{};
  out.push({piece:item.piece,key:part.key,unit:item.unit,orderId:o.id,order:o.businessNumber||'',customer:salesCustomerDisplay(o.customerId),
   line:o.lines.indexOf(l)+1,mark:l.mark||'',lite:c.lite,glass:c.glass,mm:+((g&&g.thicknessMm)||lite.thickness)||0,
   w:cutRound(+lite.cutW),h:cutRound(+lite.cutH),shape:!!(typeof stkShapeOf==='function'&&stkShapeOf(lite)),
   off:!!own.off,priority:cutPriority(own.priority),norot:!!own.norot});
 });
 return out.sort((a,b)=>a.piece.localeCompare(b.piece));
}
/* Приоритет: 0 — нет (по умолчанию), 1 — самый срочный … 10. «Приоритизация
   базово 0 у всех, если она будет нужна — я сам выберу» (владелец,
   18 сентября 2026). cutPrioRank — порядок (без приоритета — последним),
   cutPrioWeight — вес срочности (0 у стекла без приоритета). */
function cutPriority(v){const n=Math.round(+v);return Number.isFinite(n)&&n>=0&&n<=10?n:0;}
function cutPrioRank(p){return p>0?p:11;}
function cutPrioWeight(p){return p>0?11-p:0;}
/* Размеры листов этого стекла из поставок Master Data. Лист всегда лёжа:
   длинная сторона — X по горизонтали, как на столе и в Perfect Cut
   (владелец, 18 сентября 2026: «ориентация щита должна быть по горизонтали»). */
/* Сначала размеры из поставок этого стекла, за ними — размеры цеха
   (Master Data → Cutting): их берут, когда поставок с размером нет, или
   кнопкой use first. Один размер — одна строка, даже если поставщиков два. */
function cutSheetOptions(glassCode){
 const seen=new Set(),out=[];
 (typeof glassSheetsFor==='function'?glassSheetsFor(glassCode):[]).filter(s=>s&&s.availability!=='inactive'&&+s.sheetWIn>0&&+s.sheetHIn>0)
  .map(s=>({w:Math.max(+s.sheetWIn,+s.sheetHIn),h:Math.min(+s.sheetWIn,+s.sheetHIn),supplier:s.supplier||'',productCode:s.productCode||glassCode}))
  .sort((a,b)=>b.w*b.h-a.w*a.h||String(a.supplier).localeCompare(String(b.supplier)))
  .forEach(s=>{const k=cutSheetKey(s);if(!seen.has(k)){seen.add(k);out.push(s);}});
 (typeof cutShopSizes==='function'?cutShopSizes():[]).forEach(s=>{const k=cutSheetKey(s);if(!seen.has(k)){seen.add(k);out.push({w:s.w,h:s.h,supplier:'',productCode:glassCode,shop:true});}});
 return out;
}
/* Ключ размера: «130x96». Второй лист того же размера со своими Trim и
   Border — «130x96#2»: «хочу добавить новый лист с теми же размерами, только
   уже без тримов и бордеров… специально для этого дела, потому что стекло
   овер» (владелец, 18 сентября 2026). */
function cutSheetKey(size){return size?(size.key&&String(size.key).indexOf('#')>0?size.key:cutRound(size.w)+'x'+cutRound(size.h)):'';}
function cutBaseKey(key){return String(key||'').split('#')[0];}
/* Параметры прогона: по толщине, а отступы от краёв — свои у каждого размера
   листа: «Trim X Y Border для каждого размера индивидуальные… лучше сделать
   их отдельными и флексибл» (владелец, 18 сентября 2026).
   Порядок: размер листа в этом прогоне → весь прогон → размер листа в
   Master Data → толщина. */
function cutRunParams(mm,size,pick){
 const p=cutParamsFor(mm),key=cutSheetKey(size),own=typeof cutSheetTrim==='function'?cutSheetTrim(cutBaseKey(key)):null,run=pick||{};
 const row=Array.isArray(run.sizes)&&run.sizes.find(x=>x&&x.key===key)||{};
 const num=(v,fallback)=>v!=null&&v!==''&&Number.isFinite(+v)&&+v>=0?+v:fallback;
 const edge=(f,base)=>num(row[f],num(run[f],own&&own[f]!=null?own[f]:base));
 return Object.assign({},p,{
  trimX:edge('trimX',p.trim),trimY:edge('trimY',p.trim),borderX:edge('borderX',p.border),borderY:edge('borderY',p.border),
  minDist:num(row.minDist,num(run.minDist,p.minDist)),
  rotate:typeof run.rotate==='boolean'?run.rotate:p.rotate,
  minOffcutW:num(run.minOffcutW,p.minOffcutW),minOffcutH:num(run.minOffcutH,p.minOffcutH)});
}
function cutGroupParams(group,size){
 const use=size||group.sheet;
 const p=cutRunParams(group.mm,use,group.pick);
 return Object.assign(p,group.params&&(!size||cutSheetKey(use)===cutSheetKey(group.sheet))?{minDist:group.params.minDist,rotate:group.params.rotate}:{});
}
/* Рабочее поле листа между линиями: слева Trim Y, снизу Trim X, справа
   Border Y, сверху Border X. Ноль — левый нижний угол листа. */
function cutUsable(size,params){
 const x0=+params.trimY||0,y0=+params.trimX||0,x1=cutRound(size.w-(+params.borderY||0)),y1=cutRound(size.h-(+params.borderX||0));
 return {x0,y0,x1,y1,W:cutRound(x1-x0),H:cutRound(y1-y0)};
}
/* Склад прогона: какие размеры листов берём и сколько их есть. «Иногда мы
   используем 10 листов 130 и 40 листов 144» (владелец, 18 сентября 2026):
   листы берутся по порядку списка, пока не кончится их количество. */
function cutStockFor(glassCode,pick){
 const rows=cutSheetOptions(glassCode);if(!rows.length)return [];
 const own=pick&&Array.isArray(pick.sizes)?pick.sizes:null;
 const out=rows.map(r=>{
  const set=own&&own.find(x=>x&&x.key===cutSheetKey(r));
  return {key:cutSheetKey(r),w:r.w,h:r.h,supplier:r.supplier,limit:set&&+set.limit>0?Math.floor(+set.limit):0,off:!!(set&&set.off)};
 }).filter(r=>!r.off);
 /* Строки «+ same size» этого прогона. */
 (own||[]).filter(x=>x&&x.base&&+x.w>0&&+x.h>0&&!x.off).forEach(x=>out.push({key:x.key,w:+x.w,h:+x.h,supplier:'',limit:+x.limit>0?Math.floor(+x.limit):0,off:false,base:x.base}));
 if(own&&own.length)out.sort((a,b)=>{
  const ia=own.findIndex(x=>x&&x.key===a.key),ib=own.findIndex(x=>x&&x.key===b.key);
  return (ia<0?99:ia)-(ib<0?99:ib);
 });
 return out;
}
/* Расстояние между парой деталей: у прямоугольников 0, у формы со скосом —
   Min distance по толщине. */
function cutGapBetween(a,b,params){
 const g=x=>x&&x.shape?+params.minDist||0:0;
 return Math.max(g(a),g(b));
}
function cutEdgeGap(p,params){return p&&p.shape?+params.minDist||0:0;}
/* Полоска между деталью и линией реза: 0 или не меньше Min distance.
   «1/16 — это ошибка: сломать нельзя, слишком маленькое расстояние;
   отправлять на полировку — это время; а если это LowE — это брак, его
   нельзя полировать» (владелец, 18 сентября 2026). У краёв листа это
   держат линии Border, внутри полосы — это правило. */
function cutSliverOk(rest,params){return rest>=-1e-6&&(rest<=1e-6||rest>=(+params.minDist||0)-1e-6);}

/* ---------------------------- Раскладка ---------------------------- */
/* Гильотинные полосы: рез идёт через весь лист, как режет стол. У каждого
   листа свой размер из склада прогона и свои отступы от краёв. */
function cutPack(list,stock,paramsFor,strategy,fixed,mm){
 const sheets=(fixed||[]).map(s=>cutCloneSheet(s)),unplaced=[];
 const used=new Map();sheets.forEach(s=>used.set(s.size.key,(used.get(s.size.key)||0)+1));
 const room=size=>{const p=paramsFor(size),u=cutUsable(size,p);return {W:u.W,H:u.H,x0:u.x0,y0:u.y0,p};};
 const ways=(p,size)=>{
  const {W,H,p:pr}=room(size),a=[{w:p.w,h:p.h,rot:false}];
  if(pr.rotate&&!p.norot&&p.w!==p.h)a.push({w:p.h,h:p.w,rot:true});
  return a.filter(o=>o.w<=W+1e-6&&o.h<=H+1e-6);
 };
 /* Ориентация детали, открывающей полосу: больше штук в полосу, либо
    шире (полоса ниже), либо выше — у каждой стратегии своя. Разные стратегии
    дают разные раскладки, а лучшую выбирает cutScore. */
 const best=(list,W)=>list.slice().sort((a,b)=>strategy.prefer==='wide'?b.w-a.w||a.h-b.h:strategy.prefer==='tall'?b.h-a.h||a.w-b.w:Math.floor(W/b.w)-Math.floor(W/a.w)||a.h-b.h)[0];
 const order=list.slice().sort((a,b)=>cutPrioRank(a.priority)-cutPrioRank(b.priority)||strategy.order(a,b)||a.piece.localeCompare(b.piece));
 const push=(s,st,o,p)=>{
  const {x0,y0,p:pr}=room(s.size),gap=st.pieces.length?cutGapBetween(p,st.pieces[st.pieces.length-1],pr):0;
  const x=st.pieces.length?st.x+gap:st.x;st.x=x+o.w;st.pieces.push(p);
  s.pieces.push({piece:p.piece,shape:!!p.shape,x:cutRound(x0+x),y:cutRound(y0+st.y),w:cutRound(o.w),h:cutRound(o.h),rot:o.rot,locked:false});
 };
 /* Новый лист: первый размер склада, который ещё остался. */
 const open=p=>{
  for(const row of stock){
   if(row.limit&&(used.get(row.key)||0)>=row.limit)continue;
   if(!ways(p,row).length)continue;
   used.set(row.key,(used.get(row.key)||0)+1);
   const s={no:sheets.length+1,size:{key:row.key,w:row.w,h:row.h,supplier:row.supplier},locked:false,stock:[],pieces:[],strips:[]};
   sheets.push(s);return s;
  }
  return null;
 };
 order.forEach(p=>{
  if(!stock.some(row=>ways(p,row).length)){unplaced.push({piece:p.piece,reason:'Larger than the sheet'});return;}
  for(const s of sheets){
   if(s.locked)continue;
   const {W,H}=room(s.size),list=ways(p,s.size);if(!list.length)continue;
   let done=false;
   for(const st of s.strips){
    const pr=paramsFor(s.size),gap=st.pieces.length?cutGapBetween(p,st.pieces[st.pieces.length-1],pr):0;
    const o=list.find(x=>cutSliverOk(st.h-x.h,pr)&&st.x+gap+x.w<=W+1e-6);
    if(o){push(s,st,o,p);done=true;break;}
   }
   if(done)return;
   const usedH=s.strips.length?Math.max(...s.strips.map(x=>x.y+x.h)):0;
   const vgap=s.strips.length?cutEdgeGap(p,paramsFor(s.size)):0,y=usedH?usedH+vgap:0;
   const o=best(list.filter(x=>y+x.h<=H+1e-6),W);
   if(o){const st={y,h:o.h,x:0,pieces:[]};s.strips.push(st);push(s,st,o,p);return;}
  }
  const s=open(p);
  if(!s){unplaced.push({piece:p.piece,reason:'No sheets left'});return;}
  const {W,H}=room(s.size),o=best(ways(p,s.size).filter(x=>x.h<=H+1e-6),W),st={y:0,h:o.h,x:0,pieces:[]};
  s.strips.push(st);push(s,st,o,p);
 });
 sheets.forEach(s=>{delete s.strips;});
 return {sheets,unplaced};
}
/* --------------------- Лист за листом: забить лист ---------------------
   Владелец, 18 сентября 2026: «в первую очередь максимально забить лист и
   оставить максимально мало вейстеджа»; «ложить стёкла близко друг к другу
   по горизонтали и вертикали, и если нужно поворачивать — поворачивать на
   90 градусов». Пример владельца: 144 × 102, девять стёкол 50 × 30 — шесть
   стоя в три столбика и три лёжа столбиком справа.
   Поэтому листы заполняются по одному. Для каждого листа пробуются сотни
   вариантов гильотинной укладки (каждый рез — сквозной, как режет стол):
   порядок стёкол, какой поворот пробовать первым, в какой свободный кусок
   класть, как резать остаток, рядами или столбиками. Берётся вариант, где на
   лист легло больше всего стекла; при равенстве — где больше срочных. */
const CUT_FILL_SORTS=[
 (a,b)=>b.w*b.h-a.w*a.h,
 (a,b)=>Math.max(b.w,b.h)-Math.max(a.w,a.h)||Math.min(b.w,b.h)-Math.min(a.w,a.h),
 (a,b)=>Math.min(b.w,b.h)-Math.min(a.w,a.h)||Math.max(b.w,b.h)-Math.max(a.w,a.h),
 (a,b)=>(b.w+b.h)-(a.w+a.h),
 (a,b)=>b.h-a.h||b.w-a.w,
 (a,b)=>b.w-a.w||b.h-a.h
];
/* Куда класть: меньше лишнего места, ближе по короткой или длинной стороне;
   последний — смотрит вперёд: сколько таких же стёкол ещё ляжет в этот кусок
   в этом повороте (не больше, чем их осталось). Так на листе 144 × 102
   девять стёкол 50 × 30 встают тремя столбиками стоя и столбиком лёжа. */
const CUT_FILL_PLACE=[
 (F,w,h)=>(F.w*F.h-w*h)+Math.min(F.w-w,F.h-h)*1e-6,
 (F,w,h)=>Math.min(F.w-w,F.h-h)+Math.max(F.w-w,F.h-h)*1e-6,
 (F,w,h)=>Math.max(F.w-w,F.h-h)+Math.min(F.w-w,F.h-h)*1e-6,
 (F,w,h,same)=>-Math.min(same,Math.floor((F.w+1e-6)/w)*Math.floor((F.h+1e-6)/h))*w*h+(F.w*F.h-w*h)*1e-6
];
/* Какой рез остатка: true — поперёк (верх на всю ширину куска). */
const CUT_FILL_SPLIT=[
 (rw,rh)=>rw<=rh,
 (rw,rh)=>rw>rh,
 (rw,rh,w,h)=>w*rh>rw*h,
 (rw,rh,w,h)=>w*rh<=rw*h
];
/* Один лист: u — поле между линиями, t — укладка столбиками (оси
   переставлены). Возвращает места стёкол в координатах листа и остаток. */
function cutFillSheet(list,u,params,v){
 const md=+params.minDist||0,T=!!v.t;
 const U=T?{x0:u.y0,y0:u.x0,x1:u.y1,y1:u.x1}:u;
 const free=[{x:U.x0,y:U.y0,w:cutRound(U.x1-U.x0),h:cutRound(U.y1-U.y0)}],placed=[],rest=[];
 /* v.u — срочные первыми: приоритет тянет стекло на ранние листы, если лист
    от этого не хуже забит (выбор между вариантами решает площадь). */
 const order=list.map(p=>T?Object.assign({},p,{w:p.h,h:p.w,t0:p}):Object.assign({},p,{t0:p})).sort((a,b)=>(v.u?cutPrioRank(a.priority)-cutPrioRank(b.priority):0)||CUT_FILL_SORTS[v.s](a,b)||cutPrioRank(a.priority)-cutPrioRank(b.priority)||a.piece.localeCompare(b.piece));
 let used=0,urgent=0;
 const kind=p=>Math.max(p.w,p.h)+'x'+Math.min(p.w,p.h),left=new Map();order.forEach(p=>left.set(kind(p),(left.get(kind(p))||0)+1));
 for(const p of order){
  const same=left.get(kind(p))||1;
  const turn=params.rotate&&!p.norot&&p.w!==p.h,ways=[{w:p.w,h:p.h,rot:false}].concat(turn?[{w:p.h,h:p.w,rot:true}]:[]);
  if(v.r&&ways.length>1)ways.reverse();
  let best=null;
  for(let i=0;i<free.length;i++){
   const F=free[i],atR=Math.abs(F.x+F.w-U.x1)<1e-6,atT=Math.abs(F.y+F.h-U.y1)<1e-6;
   for(const o of ways){
    /* У формы со скосом — Min distance до соседей; у края листа не нужно. */
    const g=p.shape?md:0,gl=g&&F.x>U.x0+1e-6?g:0,gb=g&&F.y>U.y0+1e-6?g:0;
    let W=gl+o.w,H=gb+o.h;
    if(W>F.w+1e-6||H>F.h+1e-6)continue;
    if(g){W=Math.min(F.w,W+g);H=Math.min(F.h,H+g);if(W<gl+o.w+g-1e-6&&!atR)continue;if(H<gb+o.h+g-1e-6&&!atT)continue;}
    const rw=cutRound(F.w-W),rh=cutRound(F.h-H);
    /* Полоска тоньше Min distance у реза — её не сломать; у края листа она
       сливается с Border. */
    if(!atR&&rw>1e-6&&rw<md-1e-6)continue;
    if(!atT&&rh>1e-6&&rh<md-1e-6)continue;
    const sc=CUT_FILL_PLACE[v.p](F,W,H,same);
    if(!best||sc<best.sc-1e-9)best={sc,i,o,W,H,gl,gb,rw,rh};
   }
  }
  left.set(kind(p),same-1);
  if(!best){rest.push(p.t0);continue;}
  const F=free[best.i];free.splice(best.i,1);
  const across=CUT_FILL_SPLIT[v.c](best.rw,best.rh,best.W,best.H);
  const right=across?{x:F.x+best.W,y:F.y,w:best.rw,h:best.H}:{x:F.x+best.W,y:F.y,w:best.rw,h:F.h};
  const top=across?{x:F.x,y:F.y+best.H,w:F.w,h:best.rh}:{x:F.x,y:F.y+best.H,w:best.W,h:best.rh};
  [right,top].forEach(r=>{if(r.w>1e-6&&r.h>1e-6)free.push({x:cutRound(r.x),y:cutRound(r.y),w:cutRound(r.w),h:cutRound(r.h)});});
  const x=cutRound(F.x+best.gl),y=cutRound(F.y+best.gb),q=p.t0;
  placed.push(T?{piece:q.piece,shape:!!q.shape,x:y,y:x,w:best.o.h,h:best.o.w,rot:(best.o.h!==q.w),locked:false}
   :{piece:q.piece,shape:!!q.shape,x,y,w:best.o.w,h:best.o.h,rot:best.o.w!==q.w,locked:false});
  used+=q.w*q.h;urgent+=cutPrioWeight(q.priority);
 }
 return {placed,rest,used,urgent};
}
const CUT_FILL_VARIANTS=(()=>{const out=[];for(let s=0;s<CUT_FILL_SORTS.length;s++)for(let r=0;r<2;r++)for(let p=0;p<CUT_FILL_PLACE.length;p++)for(let c=0;c<CUT_FILL_SPLIT.length;c++)for(let t=0;t<2;t++)out.push({s,r,p,c,t});return out;})();
/* urgent — лист берёт срочные первыми, даже если так он чуть хуже забит;
   какой из вариантов лучше в целом, решает cutScore. */
function cutPackFill(list,stock,paramsFor,fixed,urgent){
 const sheets=(fixed||[]).map(s=>cutCloneSheet(s)),unplaced=[],used=new Map();
 sheets.forEach(s=>used.set(s.size.key,(used.get(s.size.key)||0)+1));
 const fitsRow=(p,row)=>{const pr=paramsFor(row),u=cutUsable(row,pr),W=u.W,H=u.H;return p.w<=W+1e-6&&p.h<=H+1e-6||pr.rotate&&!p.norot&&p.h<=W+1e-6&&p.w<=H+1e-6;};
 let rest=[];
 list.forEach(p=>{if(stock.some(row=>fitsRow(p,row)))rest.push(p);else unplaced.push({piece:p.piece,reason:'Larger than the sheet'});});
 while(rest.length){
  const row=stock.find(r=>(!r.limit||(used.get(r.key)||0)<r.limit)&&rest.some(p=>fitsRow(p,r)));
  if(!row){rest.forEach(p=>unplaced.push({piece:p.piece,reason:'No sheets left'}));break;}
  const pr=paramsFor(row),u=cutUsable(row,pr),fit=rest.filter(p=>fitsRow(p,row)),other=rest.filter(p=>!fitsRow(p,row));
  let best=null;
  const urgentOn=fit.some(p=>p.priority!==fit[0].priority);
  for(const v of urgentOn?CUT_FILL_VARIANTS.concat(CUT_FILL_VARIANTS.map(x=>Object.assign({u:1},x))):CUT_FILL_VARIANTS){
   const r=cutFillSheet(fit,u,pr,v);
   if(!best||(urgent?r.urgent>best.urgent||r.urgent===best.urgent&&r.used>best.used+1e-6:r.used>best.used+1e-6||Math.abs(r.used-best.used)<=1e-6&&r.urgent>best.urgent))best=r;
   if(!r.rest.length&&best===r)break;
  }
  if(!best.placed.length){unplaced.push({piece:fit[0].piece,reason:'Larger than the sheet'});rest=fit.slice(1).concat(other);continue;}
  used.set(row.key,(used.get(row.key)||0)+1);
  sheets.push({no:sheets.length+1,size:{key:row.key,w:row.w,h:row.h,supplier:row.supplier},locked:false,stock:[],pieces:best.placed.map(q=>Object.assign(q,{x:cutRound(q.x),y:cutRound(q.y)}))});
  rest=best.rest.concat(other);
 }
 return {sheets,unplaced};
}
function cutCloneSheet(s){return {no:s.no,size:Object.assign({},s.size),locked:!!s.locked,stock:(s.stock||[]).map(x=>Object.assign({},x)),pieces:s.pieces.map(p=>Object.assign({},p)),strips:[]};}
/* Что занято на листе: стёкла и забуканные в сток куски. */
function cutTaken(sheet){return sheet.pieces.concat((sheet.stock||[]).map(x=>({piece:x.id,x:x.x,y:x.y,w:x.w,h:x.h,shape:false,locked:true})));}
/* Самый большой свободный прямоугольник листа — тот кусок, который кладут
   на стеллаж. Остальной остаток — брак (NetScrap). */
/* Самый большой свободный кусок не меньше минимального. extra — уже
   найденные куски: так на одном листе находятся все хорошие остатки, а не
   один («показывать оба, конечно» — владелец, 18 сентября 2026). */
function cutFreeRect(sheet,size,params,extra){
 const {x0,y0,W,H}=cutUsable(size,params);
 if(!(W>0&&H>0))return null;
 const xs=[0,W],ys=[0,H],taken=cutTaken(sheet).concat(extra||[]);
 taken.forEach(p=>{xs.push(cutRound(p.x-x0),cutRound(p.x-x0+p.w));ys.push(cutRound(p.y-y0),cutRound(p.y-y0+p.h));});
 const X=[...new Set(xs.filter(v=>v>=0&&v<=W))].sort((a,b)=>a-b),Y=[...new Set(ys.filter(v=>v>=0&&v<=H))].sort((a,b)=>a-b);
 const cols=X.length-1,rows=Y.length-1;if(cols<1||rows<1)return null;
 const busy=[];
 for(let r=0;r<rows;r++){busy.push(new Array(cols).fill(false));}
 taken.forEach(p=>{
  const px=cutRound(p.x-x0),py=cutRound(p.y-y0);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
   if(X[c]>=px-1e-6&&X[c+1]<=px+p.w+1e-6&&Y[r]>=py-1e-6&&Y[r+1]<=py+p.h+1e-6)busy[r][c]=true;
  }
 });
 const minW=+params.minOffcutW||0,minH=+params.minOffcutH||0;
 const good=(w,h)=>Math.min(w,h)>=Math.min(minW,minH)-1e-6&&Math.max(w,h)>=Math.max(minW,minH)-1e-6;
 let best=null;
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
  if(busy[r][c])continue;
  let maxC=cols;
  for(let r2=r;r2<rows;r2++){
   let c2=c;while(c2<maxC&&!busy[r2][c2])c2++;
   maxC=Math.min(maxC,c2);if(maxC<=c)break;
   const w=X[maxC]-X[c],h=Y[r2+1]-Y[r];
   if(good(w,h)&&(!best||w*h>best.w*best.h))best={x:cutRound(x0+X[c]),y:cutRound(y0+Y[r]),w:cutRound(w),h:cutRound(h)};
  }
 }
 return best;
}
function cutFreeRects(sheet,size,params){
 const out=[];
 for(let i=0;i<8;i++){const r=cutFreeRect(sheet,size,params,out);if(!r)break;out.push(r);}
 return out;
}
/* Цифры листа: Used, Gross Scrap, NetScrap — как в Perfect Cut. Из брака
   вычитаются только куски, забуканные в сток (sheet.stock, номер S-…);
   подсказки (sheet.offcuts) — отход, пока их не взяли. */
function cutSheetNumbers(sheet,size,params){
 size=sheet.size||size;
 if(!Array.isArray(sheet.stock))sheet.stock=[];
 const used=sheet.pieces.reduce((a,p)=>a+cutArea(p.w,p.h),0),total=cutArea(size.w,size.h);
 const keep=sheet.stock.reduce((a,x)=>a+cutArea(x.w,x.h),0);
 sheet.offcuts=cutFreeRects(sheet,size,params);delete sheet.offcut;delete sheet.keepOffcut;
 sheet.used=cutFt2(used);sheet.gross=cutFt2(total-used);sheet.net=cutFt2(Math.max(0,total-used-keep));sheet.keep=cutFt2(keep);
 return sheet;
}
function cutGroupNumbers(group,paramsFor){group.sheets.forEach(s=>cutSheetNumbers(s,s.size||group.sheet,paramsFor(s.size||group.sheet)));return group;}
function cutTotals(groups){
 const t={pieces:0,placed:0,sheets:0,used:0,gross:0,net:0,keep:0,area:0};
 groups.forEach(g=>g.sheets.forEach(s=>{
  const size=s.size||g.sheet;t.sheets++;t.placed+=s.pieces.length;t.used+=s.used;t.gross+=s.gross;t.net+=s.net;t.keep+=s.keep;t.area+=cutArea(size.w,size.h);
 }));
 ['used','gross','net','keep','area'].forEach(k=>{t[k]=cutFt2(t[k]);});
 /* Used % — сколько листа ушло в заказы: «главный процент — это сколько
    использовано, мы должны максимально использовать лист» (владелец,
    18 сентября 2026). Сток его не улучшает. */
 t.usedPct=cutPct(t.used,t.area);t.grossPct=cutPct(t.gross,t.area);t.netPct=cutPct(t.net,t.area);
 return t;
}
/* Потери по заказу: NetScrap делится по площади деталей заказа. По этой
   цифре владелец считает цену большого заказа. */
function cutByOrder(plan,pieces){
 const by=new Map();
 plan.groups.forEach(g=>g.sheets.forEach(s=>s.pieces.forEach(p=>{
  const src=pieces.find(x=>x.piece===p.piece);if(!src)return;
  const row=by.get(src.order)||{order:src.order,customer:src.customer,pieces:0,used:0};
  row.pieces++;row.used+=cutArea(p.w,p.h);by.set(src.order,row);
 })));
 const total=plan.stats.used||0;
 return [...by.values()].map(r=>Object.assign(r,{used:cutFt2(r.used),
  net:cutFt2(total?plan.stats.net*r.used/total:0),
  pct:total?cutPct(plan.stats.net*r.used/total,r.used+plan.stats.net*r.used/total):0})).sort((a,b)=>b.used-a.used);
}

/* ------------------------------ Прогон ------------------------------ */
function cutPlanFor(number){return (DB.cutPlan||[]).find(p=>p&&p.batch===number)||null;}
function cutStamp(pieces){return pieces.filter(p=>!p.off).map(p=>p.piece+':'+p.w+'x'+p.h).join('|');}
function cutSettingsOf(number){const p=cutPlanFor(number);return p&&p.settings&&typeof p.settings==='object'?p.settings:{};}
function cutPlanRun(number){
 const b=glassBatchFind(number);if(!b)return {error:'Batch not found.'};
 const settings=cutSettingsOf(number),prev=cutPlanFor(number);
 const all=cutPieces(b,settings),live=all.filter(p=>!p.off);
 if(!live.length)return {error:'No glass to optimize.'};
 const groups=[],missing=[];
 const byGlass=new Map();live.forEach(p=>{const k=p.glass+'|'+p.mm;if(!byGlass.has(k))byGlass.set(k,[]);byGlass.get(k).push(p);});
 [...byGlass.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([k,list])=>{
  const glass=list[0].glass,mm=list[0].mm,pick=(prev&&prev.sheetPick&&prev.sheetPick[glass])||null,stock=cutStockFor(glass,pick);
  if(!stock.length){missing.push(glass);return;}
  const paramsFor=size=>cutRunParams(mm,size,pick);
  /* Заблокированные листы прошлого прогона остаются как есть и идут первыми. */
  const keptSheets=[],keptIds=new Set();
  const old=prev&&prev.groups.find(g=>g.glass===glass&&g.mm===mm);
  if(old)old.sheets.filter(s=>s.locked).forEach(s=>{
   const alive=s.pieces.filter(p=>list.some(x=>x.piece===p.piece));
   if(alive.length||(s.stock||[]).length){keptSheets.push({no:keptSheets.length+1,size:s.size||old.sheet,locked:true,stock:(s.stock||[]).map(x=>Object.assign({},x)),pieces:alive.map(p=>Object.assign({},p))});alive.forEach(p=>keptIds.add(p.piece));}
  });
  const rest=list.filter(p=>!keptIds.has(p.piece));
  /* Несколько стратегий — берём вариант с наименьшим NetScrap. */
  let win=null;
  const candidates=CUT_STRATEGIES.map(strategy=>({strategy,packed:cutPack(rest,stock,paramsFor,strategy,keptSheets,mm)}));
  candidates.push({strategy:{k:'fill'},packed:cutPackFill(rest,stock,paramsFor,keptSheets)});
  const prio=new Map(rest.map(p=>[p.piece,p.priority]));
  if(rest.some(p=>p.priority>0))candidates.push({strategy:{k:'fill-urgent'},packed:cutPackFill(rest,stock,paramsFor,keptSheets,true)});
  candidates.forEach(({strategy,packed})=>{
   const first=packed.sheets[0]&&packed.sheets[0].size||stock[0];
   /* pick — правки прогона на экране: по ним же проверяются ручные правки и рисуется лист. */
   const g={glass,mm,sheet:first,stock,pick,params:paramsFor(first),sheets:packed.sheets,unplaced:packed.unplaced};
   cutGroupNumbers(g,paramsFor);
   const score=cutScore(g,prio);
   if(!win||cutScoreLess(score,win.score))win={g,score,strategy:strategy.k};
  });
  win.g.strategy=win.strategy;groups.push(win.g);
 });
 if(!groups.length)return {error:missing.length?'No sheet size for '+missing.join(', ')+'. Add one below.':'No glass to optimize.'};
 const plan={batch:number,at:new Date().toISOString(),stamp:cutStamp(all),settings,sheetPick:(prev&&prev.sheetPick)||{},groups,missing,
  excluded:all.filter(p=>p.off).map(p=>p.piece),stats:{}};
 /* Незаблокированный лист пересобран — его куски в стоке больше не на месте:
    снимаем их со стока, номера не выдаются повторно. */
 const cancelled=[];
 if(prev)prev.groups.forEach(g=>g.sheets.filter(s=>!s.locked).forEach(s=>(s.stock||[]).forEach(x=>{if(typeof stockOffcutCancel==='function')stockOffcutCancel(x.id);cancelled.push(x.id);})));
 cutPlanRefresh(plan,all);
 DB.cutPlan=(DB.cutPlan||[]).filter(p=>p&&p.batch!==number).concat([plan]);
 touch();
 return {plan,cancelled};
}
/* Какой вариант лучше: сначала разложить все заказы, потом меньше площади
   листов (стекла потрачено меньше), потом меньше листов. Кусок на сток
   решает лишь при полном равенстве — это бонус, а не цель. */
/* Срочность: срочное стекло (приоритет выше 5) на позднем листе — штраф.
   Срочность идёт после ft² и числа листов: «максимально дать приоритизацию к
   первым листам, но основной задачей является оптимизация под низший
   процент» (владелец, 17 сентября 2026). */
function cutScore(g,prio){
 const area=g.sheets.reduce((a,s)=>{const z=s.size||g.sheet;return a+cutArea(z.w,z.h);},0);
 const offcut=g.sheets.reduce((a,s)=>a+((s.offcuts||[])[0]?cutArea(s.offcuts[0].w,s.offcuts[0].h):0),0);
 const late=prio?g.sheets.reduce((a,s,i)=>a+s.pieces.reduce((b,p)=>b+cutPrioWeight(prio.get(p.piece))*i,0),0):0;
 return [(g.unplaced||[]).length,area,g.sheets.length,late,-offcut];
}
function cutScoreLess(a,b){for(let i=0;i<a.length;i++){if(a[i]<b[i]-1e-9)return true;if(a[i]>b[i]+1e-9)return false;}return false;}
/* ------------------------------ Остатки в сток ------------------------------
   Решает человек, не программа: подсказанный кусок (sheet.offcuts) идёт в сток
   кнопкой — получает номер S-…, запись в DB.stockOffcut и стикер. Лист при
   этом блокируется: кусок забукан с этого места, пересчёт его не сдвинет.
   Split — отрезать от подсказки кусок нужного размера (от угла ближе к нулю). */
function cutSheetAt(number,glass,sheetNo){
 const plan=cutPlanFor(number),g=plan&&plan.groups.find(x=>x.glass===glass),s=g&&g.sheets.find(x=>x.no===+sheetNo);
 return s?{plan,g,s}:null;
}
function cutStockBook(number,glass,sheetNo,rect){
 const at=cutSheetAt(number,glass,sheetNo);if(!at)return {error:'No such sheet.'};
 const {plan,g,s}=at,params=cutGroupParams(g,s.size),u=cutUsable(s.size||g.sheet,params);
 const box={x:cutRound(+rect.x),y:cutRound(+rect.y),w:cutRound(+rect.w),h:cutRound(+rect.h)};
 if(!(box.w>0&&box.h>0))return {error:'Enter the size, for example 40 × 40.'};
 if(box.x<u.x0-1e-6||box.y<u.y0-1e-6||box.x+box.w>u.x1+1e-6||box.y+box.h>u.y1+1e-6)return {error:'Outside the sheet'};
 const hit=cutTaken(s).find(p=>box.x<p.x+p.w-1e-6&&p.x<box.x+box.w-1e-6&&box.y<p.y+p.h-1e-6&&p.y<box.y+box.h-1e-6);
 if(hit)return {error:'Overlaps '+hit.piece};
 const rec=stockOffcutAdd({glass:g.glass,mm:g.mm,w:box.w,h:box.h,batch:number,sheet:s.no,x:box.x,y:box.y});
 s.stock.push(Object.assign({id:rec.id},box));s.locked=true;
 cutPlanRefresh(plan);touch();return {ok:true,id:rec.id};
}
function cutStockTake(number,glass,sheetNo,index){
 const at=cutSheetAt(number,glass,sheetNo),o=at&&(at.s.offcuts||[])[+index];
 if(!o)return {error:'No such offcut.'};
 return cutStockBook(number,glass,sheetNo,o);
}
/* Split — один рез, как на столе: по длине (X) или по ширине (Y). Кусок в
   сток получает вторую сторону целиком — до линии Border: «40 × 40 — это
   минимальный размер, а не базовый; всё, что вне, можно использовать —
   экстендед размер прям до края бордера» (владелец, 18 сентября 2026).
   Кусок — от стороны нуля, у стёкол; остаток — к краю листа, он снова
   подсказка, если не меньше минимума. */
function cutStockSplit(number,glass,sheetNo,index,axis,size){
 const at=cutSheetAt(number,glass,sheetNo),o=at&&(at.s.offcuts||[])[+index];
 if(!o)return {error:'No such offcut.'};
 if(axis!=='length'&&axis!=='width')return {error:'Cut along length or width.'};
 const v=typeof cutIn==='function'?cutIn(size,null):+size,full=axis==='length'?o.w:o.h;
 if(!(v>0))return {error:'Enter the size, for example 40.'};
 if(v>full+1e-6)return {error:'Longer than this offcut.'};
 const box=axis==='length'?{x:o.x,y:o.y,w:v,h:o.h}:{x:o.x,y:o.y,w:o.w,h:v};
 const params=cutGroupParams(at.g,at.s.size),minW=+params.minOffcutW||0,minH=+params.minOffcutH||0;
 if(Math.min(box.w,box.h)<Math.min(minW,minH)-1e-6||Math.max(box.w,box.h)<Math.max(minW,minH)-1e-6)
  return {error:'Smaller than the minimum offcut '+frac16(minW)+' × '+frac16(minH)+'″.'};
 return cutStockBook(number,glass,sheetNo,box);
}
/* Ещё одна строка того же размера в складе прогона — сразу без Trim и Border;
   поля правятся как у любой строки. */
/* Правка параметров прогона: пересчитать сразу или отложить до кнопки
   Rebuild. Экран всегда откладывает: «изменил и нажал пересобрать» —
   человек сам решает, когда пересобрать (владелец, 18 сентября 2026). Пока
   не пересобрали, стёкла стоят где стояли; линии, подсказки остатков и
   цифры уже по новым значениям; план помечен pending. */
function cutApply(number,later,soft){
 if(!later)return cutPlanRun(number);
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 plan.groups.forEach(g=>{g.pick=plan.sheetPick&&plan.sheetPick[g.glass]||null;g.params=cutRunParams(g.mm,g.sheet,g.pick);});
 if(!soft)plan.pending=true;
 cutPlanRefresh(plan);touch();return {ok:true,pending:!!plan.pending,plan};
}
function cutAddSameSize(number,glass,key,later){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 const base=cutBaseKey(key),opt=cutSheetOptions(glass).find(r=>cutSheetKey(r)===base);if(!opt)return {error:'No such sheet size.'};
 const pick=cutRunPick(plan,glass);
 if(!Array.isArray(pick.sizes))pick.sizes=cutSheetOptions(glass).map(r=>({key:cutSheetKey(r),limit:0,off:false}));
 let n=2;while(pick.sizes.some(x=>x&&x.key===base+'#'+n))n++;
 const row={key:base+'#'+n,base,w:opt.w,h:opt.h,limit:0,off:false,trimX:0,trimY:0,borderX:0,borderY:0};
 const at=pick.sizes.map(x=>x&&cutBaseKey(x.key)).lastIndexOf(base);
 pick.sizes.splice(at<0?pick.sizes.length:at+1,0,row);
 touch();return Object.assign(cutApply(number,later),{key:row.key});
}
function cutRemoveSameSize(number,glass,key,later){
 const plan=cutPlanFor(number);if(!plan||String(key).indexOf('#')<0)return {error:'No such sheet size.'};
 const pick=cutRunPick(plan,glass);pick.sizes=(pick.sizes||[]).filter(x=>x&&x.key!==key);
 touch();return cutApply(number,later);
}
/* Удалить лист: его стёкла уходят в «Not on a sheet», сток с него — в отход
   («нет функции удаления листа… нужно добавить удаление любого листа, а если
   на нём были стёкла — скидывать их как не на листе»). */
function cutSheetDelete(number,glass,sheetNo){
 const at=cutSheetAt(number,glass,sheetNo);if(!at)return {error:'No such sheet.'};
 const {plan,g,s}=at;
 (s.stock||[]).forEach(x=>{if(typeof stockOffcutCancel==='function')stockOffcutCancel(x.id);});
 g.sheets=g.sheets.filter(x=>x!==s);g.sheets.forEach((x,i)=>{x.no=i+1;});
 cutPlanRefresh(plan);touch();
 return {ok:true,pieces:s.pieces.length,stock:(s.stock||[]).length};
}
/* Куда можно перенести лист: открытые батчи с тем же стеклом, где рез не начат. */
function cutMoveTargets(number,glass){
 return (DB.glassBatch||[]).filter(b=>b.number!==number).map(b=>{
  const live=b.items.filter(i=>!i.releasedAt);if(!live.length||live.some(i=>i.cutStartedAt))return null;
  const pieces=cutPieces(b,{});return pieces.length&&pieces.every(p=>p.glass===glass)?{number:b.number,pieces:pieces.length}:null;
 }).filter(Boolean).sort((a,b)=>b.number.localeCompare(a.number));
}
/* Не резать лист сейчас: его стёкла уходят в новый батч, раскладка листа — с
   ними (как владелец делает сейчас: «вырезая или копируя с прошлой
   оптимизации»), забуканный на листе сток — тоже. В новом батче лист без
   стока не заблокирован: придут новые заказы — пересчёт дозаполнит место. */
/* target — номер уже открытого батча с тем же стеклом; пусто — новый батч.
   «Процесс: идём в батч, где последний пустой лист, мув в новый проект,
   копируем 3–5 стёкол и вставляем в новый батч… если можно упростить — нужно
   упростить» (владелец, 18 сентября 2026). Лист встаёт в раскрой того батча
   последним листом, как есть. */
function cutMoveSheet(number,glass,sheetNo,target){
 const at=cutSheetAt(number,glass,sheetNo);if(!at)return {error:'No such sheet.'};
 const {plan,g,s}=at,ids=s.pieces.map(p=>p.piece);if(!ids.length)return {error:'No glass on this sheet.'};
 if(target&&!cutMoveTargets(number,glass).some(x=>x.number===target))return {error:'Batch '+target+' cannot take this glass.'};
 const tplan=target?cutPlanFor(target):null,tStale=tplan?cutPlanStale(target):false;
 const wasStale=cutPlanStale(number),moved=glassBatchMove(number,ids,{deferTouch:true,to:target||''});if(moved.error)return moved;
 /* Со стоком лист остаётся заблокированным — иначе пересчёт в новом батче снял бы сток. */
 const to=moved.number,sheet=cutCloneSheet(s);delete sheet.strips;sheet.locked=!!(sheet.stock||[]).length;
 g.sheets=g.sheets.filter(x=>x!==s);g.sheets.forEach((x,i)=>{x.no=i+1;});
 if(!g.sheets.length)plan.groups=plan.groups.filter(x=>x!==g);
 const settings={};ids.forEach(id=>{if(plan.settings&&plan.settings[id])settings[id]=Object.assign({},plan.settings[id]);});
 const pick=plan.sheetPick&&plan.sheetPick[glass]?JSON.parse(JSON.stringify(plan.sheetPick[glass])):null;
 let np=tplan;
 if(np){
  np.settings=Object.assign({},np.settings||{},settings);
  let tg=np.groups.find(x=>x.glass===g.glass&&x.mm===g.mm);
  if(!tg){tg={glass:g.glass,mm:g.mm,sheet:Object.assign({},s.size||g.sheet),stock:g.stock,pick:np.sheetPick&&np.sheetPick[glass]||null,params:g.params,sheets:[],unplaced:[],strategy:'moved'};np.groups.push(tg);}
  sheet.no=tg.sheets.length+1;tg.sheets.push(sheet);
 }else{
  sheet.no=1;
  np={batch:to,at:new Date().toISOString(),stamp:'',settings,sheetPick:pick?{[glass]:pick}:{},
   groups:[{glass:g.glass,mm:g.mm,sheet:Object.assign({},s.size||g.sheet),stock:g.stock,pick,params:g.params,sheets:[sheet],unplaced:[],strategy:'moved'}],missing:[],excluded:[],stats:{}};
  DB.cutPlan.push(np);
 }
 (s.stock||[]).forEach(x=>{const r=typeof stockOffcutFind==='function'&&stockOffcutFind(x.id);if(r){r.batch=to;r.sheet=sheet.no;}});
 if(!tStale)np.stamp=cutStamp(cutPieces(glassBatchFind(to),np.settings));
 cutPlanRefresh(np);
 if(!wasStale)plan.stamp=cutStamp(cutPieces(glassBatchFind(number),plan.settings||{}));
 cutPlanRefresh(plan);touch();
 return {ok:true,number:to,pieces:ids.length,sheet:sheet.no,added:!!target};
}
/* Снять со стока — обратно в отход. Номер остаётся за записью: стикер с ним
   мог уже уйти на стеллаж. */
function cutStockCancel(number,id){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 for(const g of plan.groups)for(const s of g.sheets){
  const i=(s.stock||[]).findIndex(x=>x.id===id);
  if(i>=0){s.stock.splice(i,1);if(typeof stockOffcutCancel==='function')stockOffcutCancel(id);cutPlanRefresh(plan);touch();return {ok:true};}
 }
 return {error:'Not in stock.'};
}
/* Пересчёт цифр после любой правки руками. */
function cutPlanRefresh(plan,pieces){
 const b=glassBatchFind(plan.batch);
 pieces=pieces||cutPieces(b,plan.settings||{});
 plan.groups.forEach(g=>cutGroupNumbers(g,size=>cutGroupParams(g,size)));
 const t=cutTotals(plan.groups),live=pieces.filter(p=>!p.off);
 plan.stats=Object.assign(t,{total:live.length,excluded:pieces.length-live.length,
  unplaced:plan.groups.reduce((n,g)=>n+(g.unplaced||[]).length,0)});
 plan.orders=cutByOrder(plan,pieces);
 return plan;
}
function cutPlanStale(number){
 const plan=cutPlanFor(number),b=glassBatchFind(number);
 return !!(plan&&b&&plan.stamp!==cutStamp(cutPieces(b,plan.settings||{})));
}
function cutPlanIndex(number){
 const plan=cutPlanFor(number),m=new Map();if(!plan)return m;
 plan.groups.forEach(g=>g.sheets.forEach(s=>s.pieces.forEach((p,i)=>m.set(p.piece,{sheet:s.no,pos:i+1,glass:g.glass}))));
 return m;
}

/* --------------------------- Правки руками --------------------------- */
function cutFind(plan,pieceId){
 for(const g of plan.groups)for(const s of g.sheets){
  const i=s.pieces.findIndex(p=>p.piece===pieceId);
  if(i>=0)return {group:g,sheet:s,piece:s.pieces[i],index:i};
 }
 return null;
}
/* Всё, чем управляет владелец прямо на экране: склад листов прогона и
   параметры реза. «Чтобы в моменте никуда не нужно лезть в Master Data»
   (владелец, 18 сентября 2026) — Master Data остаётся значением по умолчанию. */
function cutRunPick(plan,glass){
 if(!plan.sheetPick||typeof plan.sheetPick!=='object')plan.sheetPick={};
 return plan.sheetPick[glass]||(plan.sheetPick[glass]={});
}
function cutSetStock(number,glass,key,field,value,later){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 let edge=null;
 /* Min dist — тоже у каждой строки размера, как на макете владельца. */
 const rowField=CUT_EDGES.includes(field)||field==='minDist';
 if(rowField&&String(value==null?'':value).trim()!==''){
  edge=typeof cutIn==='function'?cutIn(value,null):+value;
  if(edge==null||!Number.isFinite(edge))return {error:'Enter a size like 3/4 or 1 1/2.'};
 }
 const pick=cutRunPick(plan,glass);
 if(!Array.isArray(pick.sizes))pick.sizes=cutSheetOptions(glass).map(r=>({key:cutSheetKey(r),limit:0,off:false}));
 let row=pick.sizes.find(x=>x&&x.key===key);if(!row){row={key,limit:0,off:false};pick.sizes.push(row);}
 if(field==='limit'){const n=Math.floor(+value);row.limit=Number.isFinite(n)&&n>0?n:0;}
 if(field==='off')row.off=!!value;
 if(field==='first')pick.sizes=[row].concat(pick.sizes.filter(x=>x!==row));
 /* Пусто — снова значение из Master Data. */
 if(rowField){if(edge==null)delete row[field];else row[field]=edge;}
 touch();return cutApply(number,later);
}
const CUT_RUN_FIELDS=['trimX','trimY','borderX','borderY','minDist','minOffcutW','minOffcutH','rotate'];
function cutSetParam(number,glass,field,value,later){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 if(!CUT_RUN_FIELDS.includes(field))return {error:'Unknown cutting parameter.'};
 const pick=cutRunPick(plan,glass);
 if(field==='rotate')pick.rotate=!!value;
 else{const v=typeof cutIn==='function'?cutIn(value,null):+value;if(v==null||!Number.isFinite(v))return {error:'Enter a size like 3/4 or 1 1/2.'};pick[field]=v;}
 /* Минимальный остаток стёкла не двигает — только подсказки остатков. */
 touch();return cutApply(number,later,/^minOffcut/.test(field));
}
function cutResetParams(number,glass,later){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 if(plan.sheetPick)delete plan.sheetPick[glass];
 touch();return cutApply(number,later);
}
function cutSetting(number,pieceId,field,value){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 if(!plan.settings||typeof plan.settings!=='object')plan.settings={};
 const own=plan.settings[pieceId]||(plan.settings[pieceId]={});
 if(field==='off'){own.off=!!value;if(own.off){const at=cutFind(plan,pieceId);if(at)at.sheet.pieces.splice(at.index,1);}}
 if(field==='priority')own.priority=cutPriority(value);
 if(field==='norot')own.norot=!!value;
 cutPlanRefresh(plan);touch();return {ok:true};
}
/* Помещается ли деталь: внутри листа и не задевает соседей с их зазором. */
function cutRoom(group,sheet,box,params,ignore,src){
 const u=cutUsable(sheet.size||group.sheet,params);
 if(box.x<u.x0-1e-6||box.y<u.y0-1e-6||box.x+box.w>u.x1+1e-6||box.y+box.h>u.y1+1e-6)return 'Outside the sheet';
 const hit=cutTaken(sheet).find(p=>{
  if(p.piece===ignore)return false;
  const gap=cutGapBetween(src,{shape:p.shape},params);
  return box.x<p.x+p.w+gap-1e-6&&p.x<box.x+box.w+gap-1e-6&&box.y<p.y+p.h+gap-1e-6&&p.y<box.y+box.h+gap-1e-6;
 });
 return hit?'Overlaps '+hit.piece:'';
}
/* После каждой правки руками стёкла листа сдвигаются к нулю — влево, пока не
   упрутся в линию Trim Y или в соседнее стекло (у форм — с Min distance).
   «Нужно, чтобы второе стекло подвигалось к ближнему краю или бордеру другого
   стекла — мы же говорим про оптимизацию» (владелец, 18 сентября 2026).
   Только влево и только в своём ряду по высоте: ряд остаётся рядом, и лист
   по-прежнему режется сквозными резами. Закреплённые стёкла стоят. */
function cutCompactSheet(group,sheet){
 if(!sheet||sheet.locked)return;
 const params=cutGroupParams(group,sheet.size),u=cutUsable(sheet.size||group.sheet,params);
 sheet.pieces.slice().sort((a,b)=>a.x-b.x||a.y-b.y).forEach(p=>{
  if(p.locked)return;
  let x=u.x0;
  cutTaken(sheet).forEach(q=>{
   if(q===p||q.piece===p.piece)return;
   const gap=cutGapBetween(p,q,params);
   if(q.y<p.y+p.h+gap-1e-6&&p.y<q.y+q.h+gap-1e-6&&q.x+q.w<=p.x+1e-6)x=Math.max(x,cutRound(q.x+q.w+gap));
  });
  if(x<p.x-1e-6)p.x=x;
 });
}
function cutPieceTake(number,pieceId){
 const plan=cutPlanFor(number),at=plan&&cutFind(plan,pieceId);if(!at)return {error:'Piece is not on a sheet.'};
 if(at.sheet.locked)return {error:'Sheet is locked.'};
 at.sheet.pieces.splice(at.index,1);cutCompactSheet(at.group,at.sheet);cutPlanRefresh(plan);touch();return {ok:true};
}
function cutPiecePlace(number,pieceId,sheetNo,x,y,turn){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 const pieces=cutPieces(glassBatchFind(number),plan.settings||{}),src=pieces.find(p=>p.piece===pieceId);
 if(!src||src.off)return {error:'Piece is not in this cut.'};
 const group=plan.groups.find(g=>g.glass===src.glass&&g.mm===src.mm);if(!group)return {error:'No layout for this glass.'};
 const at=cutFind(plan,pieceId);
 const sheet=group.sheets.find(s=>s.no===+sheetNo)||(at&&at.sheet);if(!sheet)return {error:'No such sheet.'};
 const params=cutGroupParams(group,sheet.size);
 if(sheet.locked||at&&at.sheet.locked)return {error:'Sheet is locked.'};
 const rot=typeof turn==='boolean'?turn:at?!!at.piece.rot:false,w=rot?src.h:src.w,h=rot?src.w:src.h;
 const box={x:cutRound(+x),y:cutRound(+y),w,h},bad=cutRoom(group,sheet,box,params,pieceId,src);
 if(bad)return {error:bad};
 if(at)at.sheet.pieces.splice(at.index,1);
 sheet.pieces.push({piece:pieceId,shape:!!src.shape,x:box.x,y:box.y,w,h,rot,locked:at?!!at.piece.locked:false});
 if(at&&at.sheet!==sheet)cutCompactSheet(group,at.sheet);
 cutCompactSheet(group,sheet);cutPlanRefresh(plan);touch();return {ok:true};
}
/* Положить деталь на лист самому: первое свободное место сверху вниз.
   Так работает бросок на вкладку листа — координаты человеку не нужны. */
function cutPieceAuto(number,pieceId,sheetNo){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 const pieces=cutPieces(glassBatchFind(number),plan.settings||{}),src=pieces.find(p=>p.piece===pieceId);
 if(!src||src.off)return {error:'Piece is not in this cut.'};
 const group=plan.groups.find(g=>g.glass===src.glass&&g.mm===src.mm);if(!group)return {error:'No layout for this glass.'};
 const sheet=group.sheets.find(x=>x.no===+sheetNo);if(!sheet)return {error:'No such sheet.'};
 const params=cutGroupParams(group,sheet.size),u=cutUsable(sheet.size||group.sheet,params),xs=[u.x0].concat(cutTaken(sheet).map(p=>cutRound(p.x+p.w))),ys=[u.y0].concat(cutTaken(sheet).map(p=>cutRound(p.y+p.h)));
 /* Своя ориентация, а если не лезет и поворот разрешён — повёрнутая. */
 const turns=[false].concat(params.rotate&&!src.norot&&src.w!==src.h?[true]:[]);
 for(const y of [...new Set(ys)].sort((a,b)=>a-b))for(const x of [...new Set(xs)].sort((a,b)=>a-b))for(const rot of turns){
  const box={x,y,w:rot?src.h:src.w,h:rot?src.w:src.h};
  if(!cutRoom(group,sheet,box,params,pieceId,src))return cutPiecePlace(number,pieceId,sheetNo,x,y,rot);
 }
 return {error:'No room on this sheet.'};
}
function cutPieceRotate(number,pieceId){
 const plan=cutPlanFor(number),at=plan&&cutFind(plan,pieceId);if(!at)return {error:'Piece is not on a sheet.'};
 if(at.sheet.locked)return {error:'Sheet is locked.'};
 const params=cutGroupParams(at.group,at.sheet.size),p=at.piece,box={x:p.x,y:p.y,w:p.h,h:p.w};
 const src=cutPieces(glassBatchFind(number),plan.settings||{}).find(x=>x.piece===pieceId)||{};
 /* Стала шире — стёкла справа в её ряду отодвигаются, если на листе есть
    место; стала уже — после поворота они сами подъедут. */
 const grow=cutRound(box.w-p.w),moved=[];
 if(grow>0)at.sheet.pieces.filter(q=>q!==p&&q.x>=p.x+p.w-1e-6&&q.y<box.y+box.h-1e-6&&box.y<q.y+q.h-1e-6).forEach(q=>{moved.push([q,q.x]);q.x=cutRound(q.x+grow);});
 const back=()=>moved.forEach(([q,x])=>{q.x=x;});
 if(moved.some(([q])=>q.locked)){back();return {error:'A locked piece is in the way.'};}
 const blocked=moved.map(([q])=>cutRoom(at.group,at.sheet,q,params,q.piece,q)).find(Boolean);
 if(blocked){back();return {error:blocked==='Outside the sheet'?'No room to rotate on this sheet.':blocked};}
 const bad=cutRoom(at.group,at.sheet,box,params,pieceId,src);if(bad){back();return {error:bad};}
 /* В ряду не должно остаться полоски тоньше Min distance — её не сломать. */
 const row=at.sheet.pieces.filter(q=>q!==p&&Math.abs(q.y-box.y)<1e-6).map(q=>q.h).concat([box.h]),top=Math.max(...row);
 if(row.some(h=>!cutSliverOk(top-h,params))){back();return {error:'Leaves a strip thinner than Min dist.'};}
 p.w=box.w;p.h=box.h;p.rot=!p.rot;cutCompactSheet(at.group,at.sheet);cutPlanRefresh(plan);touch();return {ok:true};
}
function cutPieceLock(number,pieceId){
 const plan=cutPlanFor(number),at=plan&&cutFind(plan,pieceId);if(!at)return {error:'Piece is not on a sheet.'};
 at.piece.locked=!at.piece.locked;cutPlanRefresh(plan);touch();return {ok:true};
}
function cutSheetLock(number,glass,sheetNo){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 const g=plan.groups.find(x=>x.glass===glass);const s=g&&g.sheets.find(x=>x.no===+sheetNo);
 if(!s)return {error:'No such sheet.'};
 s.locked=!s.locked;cutPlanRefresh(plan);touch();return {ok:true};
}

/* ------------------------------ Хранение ------------------------------ */
function normalizeCutPlans(){
 if(!Array.isArray(DB.cutPlan))DB.cutPlan=[];
 const seen=new Set();
 DB.cutPlan=DB.cutPlan.filter(p=>p&&typeof p==='object'&&typeof p.batch==='string'&&Array.isArray(p.groups)&&!seen.has(p.batch)&&(seen.add(p.batch),true)&&(typeof glassBatchFind!=='function'||glassBatchFind(p.batch)))
  .map(p=>{
   const plan=Object.assign({},p,{settings:p.settings&&typeof p.settings==='object'&&!Array.isArray(p.settings)?p.settings:{},
    groups:p.groups.filter(g=>g&&Array.isArray(g.sheets)&&g.sheet).map(g=>Object.assign({},g,{
     sheets:g.sheets.filter(s=>s&&Array.isArray(s.pieces)).map((s,i)=>Object.assign({},s,{no:i+1,locked:!!s.locked,
      stock:(Array.isArray(s.stock)?s.stock:[]).filter(x=>x&&typeof x.id==='string'&&+x.w>0&&+x.h>0).map(x=>({id:x.id,x:+x.x||0,y:+x.y||0,w:+x.w,h:+x.h})),
      pieces:s.pieces.filter(x=>x&&typeof x.piece==='string'&&+x.w>0&&+x.h>0)})),
     unplaced:Array.isArray(g.unplaced)?g.unplaced:[]}))});
   if(typeof cutParamsFor==='function')try{cutPlanRefresh(plan);}catch(e){}
   return plan;
  });
}
function validateCutPlanPayload(src){
 if(src.cutPlan==null)return;
 if(!Array.isArray(src.cutPlan))throw new Error('Cut plans must be an array.');
 const seen=new Set();
 src.cutPlan.forEach(p=>{
  if(!p||typeof p!=='object'||typeof p.batch!=='string'||!p.batch||!Array.isArray(p.groups))throw new Error('Invalid cut plan.');
  if(seen.has(p.batch))throw new Error('Duplicate cut plan for '+p.batch+'.');seen.add(p.batch);
  if(p.settings!=null&&(typeof p.settings!=='object'||Array.isArray(p.settings)))throw new Error('Invalid cut plan settings.');
 });
}
