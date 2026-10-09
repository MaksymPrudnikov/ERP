/* =====================================================================
   reports/query  ·  query-1.0
   Движок конструктора отчётов: один запрос — источник, период, фильтры,
   измерение и разбивка, метрики, сортировка, топ, сравнение с прошлым.
   IN : REP_SRC (reports/sources)
   OUT: repQuery(q, ctx) → итог, строки по измерению, ячейки по разбивке,
        то же за период сравнения
   Правило: файл ничего не рисует.

   Запрос q:
   { source, date:{f, preset | from,to}, filters:[{f, op, v}],
     dims:['station' | 'at:month'] (до двух: строки и разбивка),
     metrics:['count' | 'area' | 'area:avg' | 'distinct:customer' …],
     sort:{by:'label'|'metric', i, dir}, limit, other, compare:'prev'|'year' }
   ctx — подстановки экранов: {person, station} для '@me' и '@station'.
   Сутки — 0:00–24:00 по часам компьютера, неделя — с понедельника.
   ===================================================================== */
const REP_GRAINS=[['day','Day'],['week','Week'],['month','Month'],['quarter','Quarter'],['year','Year'],['weekday','Weekday'],['hour','Hour']];
const REP_PRESETS=[['today','Today'],['yesterday','Yesterday'],['thisWeek','This week'],['lastWeek','Last week'],['last7','Last 7 days'],['last30','Last 30 days'],['last90','Last 90 days'],
 ['thisMonth','This month'],['lastMonth','Last month'],['thisQuarter','This quarter'],['lastQuarter','Last quarter'],['thisYear','This year'],['lastYear','Last year'],['all','All time']];
const REP_AGGS=[['sum','Sum'],['avg','Average'],['min','Min'],['max','Max']];
const REP_WEEK=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const REP_OPS={dim:[['in','Is any of'],['notIn','Is none of']],text:[['contains','Contains'],['equals','Equals'],['notContains','Does not contain']],
 num:[['gt','>'],['gte','≥'],['lt','<'],['lte','≤'],['between','Between']],date:[['between','Between']]};

/* ------------------------------ Даты -------------------------------- */
function repYmd(d){const p=v=>String(v).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function repParse(ymd){const [y,m,d]=String(ymd).split('-').map(Number);return new Date(y,(m||1)-1,d||1,12);}
function repAddDays(ymd,n){const d=repParse(ymd);d.setDate(d.getDate()+n);return repYmd(d);}
function repMonday(ymd){const d=repParse(ymd);d.setDate(d.getDate()-(d.getDay()+6)%7);return repYmd(d);}
function repDaysBetween(a,b){return Math.round((repParse(b)-repParse(a))/864e5);}
function repPresetRange(key,now){
 const t=repYmd(now||new Date()),d=repParse(t),y=d.getFullYear(),m=d.getMonth(),q=Math.floor(m/3),last=(yy,mm)=>repYmd(new Date(yy,mm+1,0,12));
 switch(key){
  case 'today':return [t,t];
  case 'yesterday':{const x=repAddDays(t,-1);return [x,x];}
  case 'thisWeek':{const a=repMonday(t);return [a,repAddDays(a,6)];}
  case 'lastWeek':{const a=repAddDays(repMonday(t),-7);return [a,repAddDays(a,6)];}
  case 'last7':return [repAddDays(t,-6),t];
  case 'last30':return [repAddDays(t,-29),t];
  case 'last90':return [repAddDays(t,-89),t];
  case 'thisMonth':return [repYmd(new Date(y,m,1,12)),last(y,m)];
  case 'lastMonth':return [repYmd(new Date(y,m-1,1,12)),last(y,m-1)];
  case 'thisQuarter':return [repYmd(new Date(y,q*3,1,12)),last(y,q*3+2)];
  case 'lastQuarter':return [repYmd(new Date(y,q*3-3,1,12)),last(y,q*3-1)];
  case 'thisYear':return [y+'-01-01',y+'-12-31'];
  case 'lastYear':return [(y-1)+'-01-01',(y-1)+'-12-31'];
 }
 return null;
}
/* Период запроса: свои даты или пресет; null — всё время. */
function repRange(dt){
 if(!dt)return null;
 if(dt.from||dt.to)return [dt.from||'',dt.to||''];
 return repPresetRange(dt.preset);
}
/* Сравнение: прошлый период той же длины или те же даты год назад. */
function repCompareRange(r,kind){
 if(!r||!r[0]||!r[1])return null;
 if(kind==='year'){const s=x=>{const d=repParse(x);d.setFullYear(d.getFullYear()-1);return repYmd(d);};return [s(r[0]),s(r[1])];}
 if(kind==='prev'){const len=repDaysBetween(r[0],r[1])+1;return [repAddDays(r[0],-len),repAddDays(r[0],-1)];}
 return null;
}
function repIsoDay(v){return typeof salesListIsoDay==='function'?salesListIsoDay(v):String(v||'').slice(0,10);}

/* ------------------------------ Поля -------------------------------- */
function repFields(S){return S.fields();}
function repField(S,k){return repFields(S).find(f=>f.k===k)||null;}
function repGet(f,row){return f.get?f.get(row):row[f.k];}
function repDimParse(d){const i=String(d||'').indexOf(':');return i<0?{f:String(d||''),g:''}:{f:d.slice(0,i),g:d.slice(i+1)};}
/* Корзина даты: день, понедельник недели, месяц, квартал, год, день недели,
   час. Ключи — строки, по ним и сортируется. */
function repBucket(v,g){
 const day=repIsoDay(v);if(!day)return '';
 switch(g){
  case 'week':return repMonday(day);
  case 'month':return day.slice(0,7);
  case 'quarter':return day.slice(0,4)+'-Q'+(Math.floor((+day.slice(5,7)-1)/3)+1);
  case 'year':return day.slice(0,4);
  case 'weekday':return String((repParse(day).getDay()+6)%7);
  case 'hour':{const d=new Date(v);return /T/.test(String(v))&&!Number.isNaN(d.getTime())?String(d.getHours()).padStart(2,'0'):'';}
 }
 return day;
}
function repBucketText(g,v){
 if(v===''||v==null)return '—';
 switch(g){
  case 'week':return 'Wk '+salesListShortDay(v);
  case 'month':{const [y,m]=v.split('-');return new Date(+y,+m-1,1).toLocaleDateString('en-US',{month:'short',year:'numeric'});}
  case 'quarter':{const [y,q]=v.split('-');return q+' '+y;}
  case 'year':return v;
  case 'weekday':return REP_WEEK[+v]||v;
  case 'hour':return (+v)+':00';
 }
 return salesListShortDay(v);
}
function repDimValue(S,row,d){
 const p=repDimParse(d),f=repField(S,p.f);if(!f)return '—';
 const v=repGet(f,row);
 if(f.type==='date')return repBucket(v,p.g||'day');
 return v==null||v===''?'—':String(v);
}
function repDimText(S,d,v){const p=repDimParse(d),f=repField(S,p.f);return f&&f.type==='date'?repBucketText(p.g||'day',v):String(v);}
function repDimLabel(S,d){const p=repDimParse(d),f=repField(S,p.f);if(!f)return d;const g=REP_GRAINS.find(x=>x[0]===p.g);return f.type==='date'?(g?g[1]:'Day')+(repDates(S).length>1?' · '+f.label:''):f.label;}
function repDates(S){return (S.date||[]).filter(k=>repField(S,k));}
/* Что можно выбрать измерением: поля-списки и текст, даты по корзинам. */
function repDimOptions(S){
 const out=[];
 repFields(S).forEach(f=>{
  if(f.type==='dim'||f.type==='text')out.push([f.k,f.label]);
  if(f.type==='date')REP_GRAINS.forEach(([g,l])=>{if(g==='hour'&&!/at$/.test(f.k))return;out.push([f.k+':'+g,l+(repDates(S).length>1?' · '+f.label:'')]);});
 });
 return out;
}

/* ------------------------------ Метрики ------------------------------ */
/* Метрика по ключу: своя у источника или числовое поле с агрегатом
   («area:avg»), или число разных значений поля («distinct:customer»). */
function repMetric(S,k){
 const own=(S.metrics||[]).find(m=>m.k===k);if(own)return own;
 const i=String(k).indexOf(':'),a=i<0?k:k.slice(0,i),b=i<0?'':k.slice(i+1);
 if(a==='distinct'){const f=repField(S,b);return f?{k,label:f.label+' · distinct',agg:'distinct',f:b}:null;}
 const f=repField(S,a);if(!f||f.type!=='num')return null;
 const agg=REP_AGGS.some(x=>x[0]===b)?b:'sum';
 return {k,label:f.label+(agg==='sum'?'':' · '+REP_AGGS.find(x=>x[0]===agg)[1].toLowerCase()),agg,f:a,digits:agg==='avg'?Math.max(1,f.digits||0):f.digits,money:f.money};
}
function repMetricOptions(S){
 const out=(S.metrics||[]).map(m=>[m.k,m.label]);
 repFields(S).forEach(f=>{
  if(f.type==='num'){REP_AGGS.forEach(([a,l])=>{const k=a==='sum'?f.k:f.k+':'+a;if(!out.some(x=>x[0]===k))out.push([k,f.label+(a==='sum'?'':' · '+l.toLowerCase())]);});}
  if(f.type==='dim'||f.type==='text')out.push(['distinct:'+f.k,f.label+' · distinct']);
 });
 return out;
}
function repAgg(S,m,list){
 if(m.agg==='count')return list.length;
 if(m.agg==='distinct'){const f=repField(S,m.f),set=new Set();list.forEach(r=>{const v=f?repGet(f,r):r[m.f];if(v!=null&&v!==''&&v!=='—')set.add(v);});return set.size;}
 if(m.agg==='ratio'){let a=0,b=0;list.forEach(r=>{a+=+r[m.num]||0;b+=+r[m.den]||0;});return b?a/b*(m.pct?100:1):null;}
 let s=0,n=0,lo=null,hi=null;
 list.forEach(r=>{const v=r[m.f];if(v==null||v===''||!Number.isFinite(+v))return;const x=+v;s+=x;n++;if(lo==null||x<lo)lo=x;if(hi==null||x>hi)hi=x;});
 if(!n)return m.agg==='sum'&&!m.money?0:null;
 return m.agg==='avg'?s/n:m.agg==='min'?lo:m.agg==='max'?hi:s;
}
function repFmt(m,v){
 if(v==null||Number.isNaN(v))return '—';
 if(m.money)return (v<0?'-$':'$')+Math.abs(+v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 return chNum(v,m.digits||0)+(m.pct?'%':'');
}

/* ------------------------------ Фильтры ------------------------------ */
function repSub(v,ctx){return v==='@me'?ctx.person||'':v==='@station'?ctx.station||'':v;}
function repFilterTest(S,flt,row,ctx){
 const f=repField(S,flt.f);if(!f)return true;
 let v=repGet(f,row);if(f.type==='date')v=repIsoDay(v);
 const list=(Array.isArray(flt.v)?flt.v:[flt.v]).map(x=>repSub(x,ctx));
 const s=v==null?'':String(v),low=s.toLowerCase(),a=list[0],b=list[1];
 switch(flt.op){
  case 'in':return list.includes(s===''?'—':s);
  case 'notIn':return !list.includes(s===''?'—':s);
  case 'contains':return low.includes(String(a||'').toLowerCase());
  case 'notContains':return !low.includes(String(a||'').toLowerCase());
  case 'equals':return low===String(a||'').toLowerCase();
  case 'gt':return v!==''&&v!=null&&+v>+a;
  case 'gte':return v!==''&&v!=null&&+v>=+a;
  case 'lt':return v!==''&&v!=null&&+v<+a;
  case 'lte':return v!==''&&v!=null&&+v<=+a;
  case 'between':return f.type==='date'?!!s&&(!a||s>=a)&&(!b||s<=b):v!==''&&v!=null&&(a===''||a==null||+v>=+a)&&(b===''||b==null||+v<=+b);
 }
 return true;
}
function repSelect(S,df,range,filters,ctx){
 const f=df?repField(S,df):null;
 return S.rows().filter(r=>{
  if(f&&range){const d=repIsoDay(repGet(f,r));if(!d||(range[0]&&d<range[0])||(range[1]&&d>range[1]))return false;}
  return (filters||[]).every(x=>repFilterTest(S,x,r,ctx));
 });
}
/* Значения поля для фильтра «Is any of» — то, что есть в данных. */
function repFieldValues(S,k){const f=repField(S,k);if(!f)return [];const set=new Set();S.rows().forEach(r=>{const v=repGet(f,r);set.add(v==null||v===''?'—':String(v));});return [...set].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));}

/* ------------------------------ Порядок ------------------------------ */
/* Все корзины периода, и пустые: месяц без резки — ноль, а не дыра. Без
   границ периода — от первой до последней корзины в данных; слишком много
   корзин (дни за десять лет) — только те, где есть данные. */
function repDateKeys(g,range,present){
 if(g==='hour')return Array.from({length:24},(_,h)=>String(h).padStart(2,'0'));
 if(g==='weekday')return ['0','1','2','3','4','5','6'];
 const have=present.filter(Boolean).sort(),lo=range&&range[0]?repBucket(range[0],g):have[0],hi=range&&range[1]?repBucket(range[1],g):have[have.length-1],out=[];
 if(!lo||!hi)return have;
 if(g==='day'||g==='week'){for(let d=lo;d<=hi&&out.length<=400;d=repAddDays(d,g==='week'?7:1))out.push(d);}
 else if(g==='month'){let [y,m]=lo.split('-').map(Number);for(let k=lo;k<=hi&&out.length<=400;){out.push(k);if(++m>12){m=1;y++;}k=y+'-'+String(m).padStart(2,'0');}}
 else if(g==='quarter'){let y=+lo.slice(0,4),q=+lo.slice(6);for(let k=lo;k<=hi&&out.length<=400;){out.push(k);if(++q>4){q=1;y++;}k=y+'-Q'+q;}}
 else if(g==='year'){for(let y=+lo;y<=+hi&&out.length<=400;y++)out.push(String(y));}
 return out.length>400?have:out;
}
function repIsTime(S,d){const p=repDimParse(d),f=repField(S,p.f);return !!f&&f.type==='date';}
function repOrderKeys(S,d,groups,ms,q,range){
 const keys=[...groups.keys()],p=repDimParse(d);
 if(repIsTime(S,d)){
  const all=repDateKeys(p.g||'day',range,keys);
  const sorted=all.length?all:keys.sort();
  return q.sort&&q.sort.dir==='desc'&&(!q.sort.by||q.sort.by==='label')?sorted.slice().reverse():sorted;
 }
 const by=q.sort&&q.sort.by==='label'?'label':'metric',i=q.sort&&Number.isInteger(q.sort.i)?q.sort.i:0,dir=q.sort&&q.sort.dir==='asc'?1:-1;
 if(by==='label'||!ms.length){
  const seq=(DB.station||[]).map(s=>s.code),at=v=>{const n=seq.indexOf(v);return n<0?999:n;};
  if(p.f==='station'&&!(q.sort&&q.sort.by==='label'))return keys.sort((a,b)=>at(a)-at(b));
  return keys.sort((a,b)=>(q.sort&&q.sort.by==='label'?dir:1)*String(a).localeCompare(String(b),undefined,{numeric:true}));
 }
 const m=ms[Math.min(i,ms.length-1)],val=new Map(keys.map(k=>[k,repAgg(S,m,groups.get(k))]));
 return keys.sort((a,b)=>dir*((val.get(a)||0)-(val.get(b)||0))||String(a).localeCompare(String(b),undefined,{numeric:true}));
}
function repGroupBy(S,rows,d){const g=new Map();rows.forEach(r=>{const k=repDimValue(S,r,d);if(!g.has(k))g.set(k,[]);g.get(k).push(r);});return g;}

/* ------------------------------- Запрос ------------------------------ */
function repQuery(q,ctx){
 ctx=ctx||{};const S=REP_SRC[q&&q.source];if(!S)return null;
 const dates=repDates(S),df=q.date&&dates.includes(q.date.f)?q.date.f:dates[0]||'',range=df?repRange(q.date||{}):null;
 const ms=(q.metrics&&q.metrics.length?q.metrics:[S.metrics[0].k]).map(k=>repMetric(S,k)).filter(Boolean);
 const dims=(q.dims||[]).filter(d=>d&&repField(S,repDimParse(d).f)).slice(0,2);
 const vals=list=>ms.map(m=>repAgg(S,m,list));
 const rows=repSelect(S,df,range,q.filters,ctx);
 const out={source:q.source,label:S.label,df,range,dims,metrics:ms,count:rows.length,rows,total:vals(rows),keys:[],keys2:[],cells:new Map(),rowTotals:new Map(),colTotals:new Map(),groups:new Map()};
 if(dims[0]){
  const g1=repGroupBy(S,rows,dims[0]);let keys=repOrderKeys(S,dims[0],g1,ms,q,range);
  /* Топ N: остальное — строкой «Other», если попросили. Даты не режутся. */
  if(!repIsTime(S,dims[0])&&q.limit>0&&keys.length>q.limit){const rest=keys.slice(q.limit);keys=keys.slice(0,q.limit);if(q.other){g1.set('__other',rest.flatMap(k=>g1.get(k)));keys.push('__other');}}
  out.keys=keys;out.groups=g1;keys.forEach(k=>out.rowTotals.set(k,vals(g1.get(k)||[])));
  if(dims[1]){
   /* Разбивка — до восьми значений: семь самых больших по первой метрике
      и «Other»; дальше — по имени (станции — по маршруту). Цвет значению
      даёт экран по полному списку значений поля, а не по этой выборке. */
   const g2=repGroupBy(S,rows,dims[1]);let k2=repIsTime(S,dims[1])?repOrderKeys(S,dims[1],g2,ms,{},range).filter(k=>g2.has(k)):[...g2.keys()];
   if(!repIsTime(S,dims[1])){
    if(k2.length>8){const m=ms[0];k2=k2.sort((a,b)=>(repAgg(S,m,g2.get(b))||0)-(repAgg(S,m,g2.get(a))||0));const rest=k2.slice(7);k2=k2.slice(0,7);g2.set('__other',rest.flatMap(k=>g2.get(k)));}
    const seq=(DB.station||[]).map(s=>s.code),at=v=>{const n=seq.indexOf(v);return n<0?999:n;};
    k2=k2.sort(repDimParse(dims[1]).f==='station'?(a,b)=>at(a)-at(b):(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
    if(g2.has('__other'))k2.push('__other');
   }
   out.keys2=k2;
   const in2=new Map();k2.forEach(k=>in2.set(k,new Set(g2.get(k)||[])));
   keys.forEach(a=>{const list=g1.get(a)||[];k2.forEach(b=>out.cells.set(a+'\u0001'+b,vals(list.filter(r=>in2.get(b).has(r)))));});
   k2.forEach(b=>out.colTotals.set(b,vals(g2.get(b)||[])));
  }
 }
 if(q.compare&&range&&range[0]&&range[1]){
  const cr=repCompareRange(range,q.compare);
  if(cr){
   const crows=repSelect(S,df,cr,q.filters,ctx),c={range:cr,kind:q.compare,total:vals(crows),rowTotals:new Map()};
   if(dims[0]){
    const g=repGroupBy(S,crows,dims[0]);
    /* Даты сравниваются по месту: первый месяц с первым месяцем. */
    if(repIsTime(S,dims[0])){const ck=repDateKeys(repDimParse(dims[0]).g||'day',cr,[...g.keys()]);out.keys.forEach((k,i)=>c.rowTotals.set(k,vals(g.get(ck[i])||[])));}
    else out.keys.forEach(k=>c.rowTotals.set(k,vals(k==='__other'?[]:g.get(k)||[])));
   }
   out.compare=c;
  }
 }
 return out;
}
function repKeyText(S,d,k){return k==='__other'?'Other':repDimText(S,d,k);}
