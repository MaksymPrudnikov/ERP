/* =====================================================================
   reports/archive-facts  ·  facts-1.0
   Отчёт за прошлые месяцы без стены (задание правок 02.11, 7б). Записи
   ушедших заказов в DB больше не ставятся: архив читается частями в фоне,
   из каждой части считаются строки отчёта (те же функции фактов), записи
   выгружаются. Строки закрытого месяца лежат на диске (склад facts) и на
   сервере (erp_report_month, владелец 04.11.2026: закрытие месяца, как в
   больших ERP) — повторное открытие и другой компьютер читают только их.
   Порядок: диск → сервер → посчитать из заказов и положить в оба места.
   Месяц считается сразу для всех функций фактов; главная вкладка с сервером
   сама досчитывает недостающие месяцы в фоне (archiveFactsFill).
   IN : archiveIndex (erp/archive), записи cold, функции фактов reports/*
   OUT: archiveScopeFor(ranges, need) → 'none' | 'loading' | 'ready',
        archiveScopeDrop(), archiveScopeCount(ranges), archiveFactsText(st),
        repArchiveNeed(report, page), обёртки функций фактов
   Правило: файл ничего не рисует, кроме процента в строке ожидания.

   Как считается часть. Месяц — заказы, ушедшие в этом месяце (квота — вся
   группа вместе). Часть — до ARCHIVE_PART заказов. На время одного
   синхронного расчёта таблицы DB подменяются записями части: заказы, сканы
   и всё, что принадлежит одному заказу, — только свои; батчи, накладные и
   оплаты в работе — только те, что касаются этих заказов. Таблицы
   возвращаются в том же кадре: await между подменой и возвратом нет, запись
   и отрисовка внутрь не попадают.

   Как складываются строки. Строка скана, заказа, продажи принадлежит одному
   заказу и встречается один раз. Строка общей записи (батч, накладная, лист,
   оплата на два заказа) приходит с каждым её заказом: одинаковый id —
   одна строка, из двух — более ранняя. Работа важнее архива (shared), кроме
   строк, которым нужен заказ (cold: батч × заказ, оплата × заказ: в работе
   заказа нет, номер и дни известны только из архива), и первого реза листа
   (early: лист резали два заказа, ранний скан мог уйти в архив, поздний
   остаться в работе). Материалы IGU — итоги день × человек: одинаковый id
   складывается (sum).
   ===================================================================== */
const ARCHIVE_PART=40;
const ARCH_GENS={
 work:{fn:'repWorkFacts'},op:{fn:'repOpFacts'},break:{fn:'repBreakFacts'},order:{fn:'repOrderFacts'},ordered:{fn:'repOrderedFacts'},sold:{fn:'repSoldFacts'},quote:{fn:'repQuoteFacts'},
 delivery:{fn:'repDeliveryFacts',shared:true},sheet:{fn:'repSheetFacts',shared:true},sheetcut:{fn:'repSheetCutFacts',shared:true,early:true},move:{fn:'repSheetMoveFacts',shared:true,early:true},
 receipt:{fn:'repReceiptFacts',shared:true},refund:{fn:'repRefundFacts',shared:true},
 batch:{fn:'repBatchFacts',shared:true,cold:true,own:r=>r.orderId},payorder:{fn:'repPayOrderFacts',shared:true,cold:true,own:r=>String(r.id).split('|')[1]},
 plan:{fn:'repPlanFacts',shared:true},
 igu:{fn:'repIguMaterialFacts',shared:true,sum:['qty','units','missing','spacerFt','sealantKg','gasKg','partsKg']}
};
/* Источник отчёта → функция фактов. Чего здесь нет — не зависит от архива:
   закупки, склад без заказов, то, что есть сейчас (now). */
const REP_ARCH_SRC={glass:'work',cutting:'work',tempering:'work',assembly:'work',shipping:'work',time:'work',edgework:'op',drilling:'op',ops:'op',breaks:'break',orders:'order',ordered:'ordered',
 sold:'sold',quotes:'quote',deliveries:'delivery',sheets:'sheet',sheetcut:'sheetcut',batches:'batch',payments:'receipt',payorders:'payorder',refunds:'refund',moves:'move',igumat:'igu',plan:'plan'};
/* Поля, которые читают сами функции поверх строк. */
const REP_ARCH_KEYS={work:['station'],op:['station','kind','unit'],igu:['record','norm'],delivery:['trip','km','tripFirst','kmDone']};
const REP_ARCH_TIME=['day','personId','person','station','at','area'];
/* Таблицы одного заказа: в части только свои записи. */
const ARCH_OWN=['salesOrder','stationScan','glassPiece','glassUnitId','productionRoute','orderEvent','recut','ncr','skip','productionUnbatch','financeTerms'];

/* ------------------------- Какие поля нужны странице ------------------ */
function repArchFieldKeys(f,keys){
 if(!f.get){keys.add(f.k);return;}
 [undefined,'x'].forEach(v=>{try{f.get(new Proxy({},{get:(t,k)=>{if(typeof k==='string')keys.add(k);return v;}}));}catch(e){}});
}
function repArchMetricKeys(S,m,keys){
 if(!m)return;if(m.agg==='calc'){repArchMetricKeys(S,m.a,keys);repArchMetricKeys(S,m.b,keys);return;}
 if(m.agg==='formula'){repFormulaWalk(m.ast,n=>{if(n.t==='agg'&&n.f)repArchFieldKeys(n.f,keys);if(n.t==='met')repArchMetricKeys(S,n.m,keys);});return;}
 if(m.agg==='distinct'||m.agg==='nonempty'){const f=repField(S,m.f);if(f)repArchFieldKeys(f,keys);else keys.add(m.f);return;}
 [m.f,m.num,m.den,m.unitBy].forEach(k=>{if(k)keys.add(k);});
}
/* Что нужно странице: функция фактов → поля строки. Строк за годы миллионы:
   в памяти только поля этой страницы, на диске — все. */
function repArchiveNeed(r,p){
 const need=new Map();
 p.widgets.forEach(w=>{
  const q=repWidgetQuery(r,w),S=REP_SRC[q.source],gen=REP_ARCH_SRC[q.source];if(!S||S.now||!gen)return;
  let keys=need.get(gen);if(!keys)need.set(gen,keys=new Set(['id','at'].concat(REP_ARCH_KEYS[gen]||[])));
  if(q.source==='time')REP_ARCH_TIME.forEach(k=>keys.add(k));
  const dates=repDates(S),df=q.date&&dates.includes(q.date.f)?q.date.f:dates[0];if(df)keys.add(df);
  const field=k=>{const f=repField(S,k);if(f)repArchFieldKeys(f,keys);};
  (q.dims||[]).concat(q.more||[]).forEach(d=>field(repDimParse(d).f));(q.filters||[]).forEach(x=>field(x.f));r.controls.forEach(field);
  (q.metrics&&q.metrics.length?q.metrics:[S.metrics[0].k]).concat((q.having||[]).map(h=>h.m)).forEach(k=>repArchMetricKeys(S,repMetric(S,k,q.custom),keys));
 });
 return need;
}

/* ------------------------- Столбцы на диске --------------------------- */
/* Числа — Float64Array (пусто — NaN), остальное — словарь и номера. */
function archColPack(vals){
 const n=vals.length;
 if(vals.every(v=>v==null||typeof v==='number')){const a=new Float64Array(n);for(let i=0;i<n;i++){const v=vals[i];a[i]=v==null?NaN:v;}return a;}
 const m=new Map(),ix=new Uint32Array(n);for(let i=0;i<n;i++){const v=vals[i]==null?null:vals[i];let k=m.get(v);if(k===undefined)m.set(v,k=m.size);ix[i]=k;}
 return {d:[...m.keys()],i:ix};
}
function archColAt(c,i){if(c instanceof Float64Array){const v=c[i];return v===v?v:null;}return c.d[c.i[i]];}
/* Строки части → столбцы части. Значения не примитивы (works) на диск не
   идут: такой ключ (skip) выпадает из всего месяца. */
function archColsPart(rows){
 const keys=new Set();rows.forEach(r=>Object.keys(r).forEach(k=>keys.add(k)));
 const cols={},skip=new Set();keys.forEach(k=>{const vals=rows.map(r=>r[k]);if(vals.some(v=>v!=null&&typeof v==='object')){skip.add(k);return;}cols[k]=archColPack(vals);});
 return {n:rows.length,cols,skip};
}
/* Части месяца → столбцы месяца, те же, что из всех строк сразу: ключи и
   словарь — в порядке первого появления. Месяц на 900 заказов не держит
   строки всех частей до конца расчёта — только столбцы (владелец 05.11.2026,
   «Reports на 10 лет», правка А). */
function archColsJoin(parts){
 const keys=new Set(),skip=new Set();let n=0;
 parts.forEach(p=>{p.skip.forEach(k=>skip.add(k));Object.keys(p.cols).forEach(k=>keys.add(k));n+=p.n;});
 const cols={};
 keys.forEach(k=>{
  if(skip.has(k))return;
  if(parts.every(p=>!p.cols[k]||p.cols[k] instanceof Float64Array)){const a=new Float64Array(n);let o=0;parts.forEach(p=>{const c=p.cols[k];if(c)a.set(c,o);else a.fill(NaN,o,o+p.n);o+=p.n;});cols[k]=a;return;}
  const m=new Map(),ix=new Uint32Array(n),id=v=>{let x=m.get(v);if(x===undefined)m.set(v,x=m.size);return x;};let o=0;
  parts.forEach(p=>{
   const c=p.cols[k];
   if(!c){if(p.n)ix.fill(id(null),o,o+p.n);}
   else if(c instanceof Float64Array){for(let i=0;i<p.n;i++){const v=c[i];ix[o+i]=id(v===v?v:null);}}
   else{const to=new Array(c.d.length);for(let i=0;i<p.n;i++){const j=c.i[i];let x=to[j];if(x===undefined)x=to[j]=id(c.d[j]);ix[o+i]=x;}}
   o+=p.n;
  });
  cols[k]={d:[...m.keys()],i:ix};
 });
 return cols;
}
function archColsOf(rows){return archColsJoin([archColsPart(rows)]);}
/* Версия правил подсчёта. Метка месяца — она и отпечаток его заказов:
   номер сборки, прайс, клиенты, каталог месяц не пересчитывают (владелец
   04.11.2026, вариант А: прошлое в отчётах как было). PR, который меняет
   функции фактов, ARCH_GENS или расчёт части, поднимает её руками — все
   месяцы пересчитаются один раз, на каждом компьютере и на сервере. */
const ARCH_RULES=1;
const ARCH_ALL=Object.keys(ARCH_GENS);
function archFactsGet(keys){return storageIdbTx(['facts'],'readonly',tx=>{const st=tx.objectStore('facts'),out={v:new Array(keys.length)};keys.forEach((k,i)=>{st.get(k).onsuccess=e=>{out.v[i]=e.target.result;};});return out;}).then(o=>o.v);}
/* Запись месяца: заголовок последним — без него столбцы не читаются. Диск
   полон — отчёт всё равно строится: столбцы из памяти (disk false). */
async function archFactsStore(gen,month,stamp,n,cols){
 const head={stamp,n,keys:Object.keys(cols)};let disk=true;
 try{await storageIdbTx(['facts'],'readwrite',tx=>{const st=tx.objectStore('facts');Object.entries(cols).forEach(([k,c])=>st.put(c,'c|'+gen+'|'+month+'|'+k));st.put(head,'h|'+gen+'|'+month);});}
 catch(e){disk=false;console.warn('Report rows were not stored:',e.message);}
 return Object.assign({},head,{cols,disk});
}
/* Все столбцы месяца с диска (отправить на сервер). */
async function archFactsCols(gen,month,head){
 if(head.cols)return head.cols;
 const list=await archFactsGet(head.keys.map(k=>'c|'+gen+'|'+month+'|'+k));
 return list.every(Boolean)?Object.fromEntries(head.keys.map((k,i)=>[k,list[i]])):null;
}

/* ------------------------- Месяцы на сервере -------------------------- */
/* Столбцы → текст: описание (JSON) и байты чисел и номеров подряд, gzip,
   base64. Месяц всех источников на ~110 заказов — 100–150 КБ (симуляция,
   05.11.2026), а не 3 МБ записей на каждые 40 заказов. */
function archB64(u8){let s='';for(let i=0;i<u8.length;i+=32768)s+=String.fromCharCode.apply(null,u8.subarray(i,i+32768));return btoa(s);}
function archUnB64(s){const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}
async function archZip(u8,how){return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(how)).arrayBuffer());}
async function archPack(n,cols){
 const meta={n,c:{}},bins=[];let at=0;
 Object.entries(cols).forEach(([k,c])=>{const f=c instanceof Float64Array,a=f?c:c.i;meta.c[k]=f?{o:at,l:a.length}:{o:at,l:a.length,d:c.d};bins.push(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));at+=a.byteLength;});
 const head=new TextEncoder().encode(JSON.stringify(meta)),buf=new Uint8Array(4+head.length+at);
 new DataView(buf.buffer).setUint32(0,head.length,true);buf.set(head,4);let o=4+head.length;bins.forEach(b=>{buf.set(b,o);o+=b.length;});
 return 'z:'+archB64(await archZip(buf,new CompressionStream('gzip')));
}
async function archUnpack(text){
 if(!/^z:/.test(text))throw new Error('Unknown report month format.');
 const buf=await archZip(archUnB64(text.slice(2)),new DecompressionStream('gzip')),len=new DataView(buf.buffer).getUint32(0,true);
 const meta=JSON.parse(new TextDecoder().decode(buf.subarray(4,4+len))),base=4+len,cols={};
 Object.entries(meta.c).forEach(([k,c])=>{const b=buf.slice(base+c.o,base+c.o+c.l*(c.d?4:8)).buffer;cols[k]=c.d?{d:c.d,i:new Uint32Array(b)}:new Float64Array(b);});
 return {n:meta.n,cols};
}
/* Кто читает: SQL ещё не вставлен или нет связи — как раньше, считать
   самим (server false). Не видит всех таблиц — сервер ему не отдаёт и не
   берёт, а его месяцы на диске помечены им: без оплат они не годятся тому,
   кто оплаты видит. */
let archAccess=null;
async function archAccessOf(){
 if(typeof cloudSync==='undefined'||!cloudSync.on||typeof CompressionStream==='undefined')return {server:false,full:false,who:''};
 const email=(cloudConfig().session||{}).email||'';
 if(archAccess&&archAccess.email===email&&Date.now()-archAccess.at<(archAccess.server?60:10)*60e3)return archAccess;
 let a={server:false,full:false,who:''};
 try{const r=await cloudRpc('erp_facts_get',{keys:[],with_data:false});a={server:true,full:!!(r&&r.full),who:r&&r.full?'':'p:'+email};}
 catch(e){console.warn('Report months are counted here:',e.message);}
 return archAccess=Object.assign(a,{email,at:Date.now()});
}
async function archServerGet(keys,data){
 const out=[];
 for(let i=0;i<keys.length;i+=100){const r=await cloudRpc('erp_facts_get',{keys:keys.slice(i,i+100),with_data:data});(r&&r.rows||[]).forEach(x=>out.push(x));}
 return out;
}
/* Месяц на сервер — источник за запросом, по очереди. В очереди только
   заголовок: столбцы читаются с диска перед отправкой, медленная связь не
   держит в памяти весь пересчитанный архив. */
let archSend=Promise.resolve();
function archServerSend(gen,month,stamp,head){
 if(head.disk)head={stamp:head.stamp,n:head.n,keys:head.keys};
 archSend=archSend.then(async()=>{const cols=await archFactsCols(gen,month,head);if(cols)await cloudRpc('erp_facts_put',{items:[{key:'g|'+gen+'|'+month,stamp,data:await archPack(head.n,cols)}]});})
  .catch(e=>console.warn('Report month was not sent:',e.message));
 return archSend;
}

/* ------------------------- Период отчёта ------------------------------ */
/* ranges — список отрезков [from, to] днями, '' — без границы; need — что
   нужно странице (repArchiveNeed). Читаются месяцы, которые задевают отрезки,
   весь месяц: строки всё равно отберёт период запроса. */
let archiveScope=null;
function archiveScopeFor(ranges,need){
 const months=need.size?archiveMonths(ranges):[];
 if(!months.length){archiveScopeDrop();return 'none';}
 const key=months.map(x=>x.m).join()+'|'+[...need].map(([g,k])=>g+':'+[...k].sort().join()).sort().join(';')+'|'+archiveIndex.size;
 if(archiveScope&&archiveScope.key===key)return archiveScope.ready?'ready':'loading';
 archiveScopeDrop();
 const st=archiveScope={key,months,orders:archiveScopeCount(ranges),done:0,pct:0,rows:new Map(),merged:new Map(),job:null,ready:false};
 archiveFactsBuild(st,need).catch(e=>{if(archiveScope===st)archiveScope=null;console.warn('Archive was not read:',e.message);});
 return 'loading';
}
/* Операции и время людей считаются поверх работы вместе с архивом и
   помнят её до следующего расчёта: без сброса строки архива за все годы
   оставались в памяти и после выхода из отчёта (замер 05.11.2026). */
function archiveScopeDrop(){
 archiveScope=null;
 if(typeof repOpCache!=='undefined'&&repOpCache.src&&repOpCache.src!==repWorkCache.rows)repOpCache={src:null,rows:null};
 if(typeof repTimeCache!=='undefined'&&repTimeCache.src&&repTimeCache.src!==repWorkCache.rows)repTimeCache={src:null,rows:null};
}
/* Жизнь заказа пересекает хоть один отрезок — от самой ранней до самой поздней
   из его дат: создан, срок (Due), «действительна до» у квоты, день ухода. */
function archiveSpanIn(a,ranges){const span=[String(a.createdAt||'').slice(0,10),a.day,a.row&&a.row.due,a.row&&a.row.validUntil].filter(Boolean).map(String).sort(),lo=span[0],hi=span[span.length-1];return !!span.length&&ranges.some(r=>(!r[1]||lo<=r[1])&&(!r[0]||hi>=r[0]));}
/* Сколько ушедших заказов в периоде — для надписи на экране. */
function archiveScopeCount(ranges){let n=0;archiveIndex.forEach(a=>{if(archiveSpanIn(a,ranges))n++;});return n;}
/* Ушли из отчётов — строки архива уходят из памяти. */
(window.NAV_GUARDS=window.NAV_GUARDS||[]).push(function(k){if(archiveScope&&k!=='reports')archiveScopeDrop();return false;});

/* ------------------------- Месяцы и части ----------------------------- */
function archHash(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return h;}
/* Месяцы архива: заказы по дню ухода, квота — вся группа в месяце её
   последнего ушедшего. Только месяцы, которые задевают отрезки. */
function archiveMonths(ranges){
 const groups=new Map(),months=new Map(),hit=new Set(),monthOf=a=>String(a.day||'').slice(0,7)||'none';
 archiveIndex.forEach(a=>{if(a.groupId){const m=monthOf(a),was=groups.get(a.groupId);if(!was||m>was)groups.set(a.groupId,m);}});
 archiveIndex.forEach((a,id)=>{const m=a.groupId?groups.get(a.groupId):monthOf(a);let l=months.get(m);if(!l)months.set(m,l=[]);l.push(id);if(archiveSpanIn(a,ranges))hit.add(m);});
 return [...hit].sort().map(m=>({m,owners:months.get(m)}));
}
/* Метка месяца без заказов: версия правил и, если человек видит не все
   таблицы, он сам. */
function archiveFactsBase(acc){return 'v'+ARCH_RULES+(acc&&acc.who?'|'+acc.who:'');}
function archiveMonthStamp(base,mo){return base+'|'+mo.owners.length+'|'+archHash(mo.owners.map(id=>id+(archiveIndex.get(id).archivedAt||'')).sort().join(','));}
/* Части месяца: квота с группой не разрываются. */
function archiveParts(owners){
 const sorted=owners.slice().sort((a,b)=>String(archiveIndex.get(a).groupId||'').localeCompare(String(archiveIndex.get(b).groupId||''))),out=[];
 let cur=[],g=null;
 sorted.forEach(id=>{const x=archiveIndex.get(id).groupId||id;if(cur.length>=ARCHIVE_PART&&x!==g){out.push(cur);cur=[];}cur.push(id);g=x;});
 if(cur.length)out.push(cur);return out;
}

/* ------------------------- Расчёт части ------------------------------- */
/* Записи в работе, которые касаются ушедших заказов: батч, в котором есть
   ещё живой заказ, накладная, оплата. Указатель — один на чтение. */
function archiveHotIndex(){
 const add=(m,k,v)=>{let a=m.get(k);if(!a)m.set(k,a=[]);a.push(v);},by={batch:new Map(),plan:new Map(),brk:new Map(),ship:new Map(),pay:new Map(),back:new Map()};
 (DB.glassBatch||[]).forEach(b=>new Set(b.parts.map(p=>p.orderId)).forEach(id=>add(by.batch,id,b)));
 (DB.cutPlan||[]).forEach(p=>{if(p)add(by.plan,p.batch,p);});(DB.sheetBreak||[]).forEach(x=>{if(x)add(by.brk,x.batch,x);});
 (DB.shipment||[]).forEach(s=>new Set(shippingHistoryOrderIds(s)).forEach(id=>add(by.ship,id,s)));
 (DB.receipt||[]).forEach(r=>new Set((r.allocations||[]).map(a=>a.orderId)).forEach(id=>add(by.pay,id,r)));
 (DB.refund||[]).forEach(f=>{if(f)add(by.back,f.receiptId,f);});
 return by;
}
function archiveHotFor(ix,owners){
 const of=(m,keys)=>{const set=new Set();keys.forEach(k=>(m.get(k)||[]).forEach(x=>set.add(x)));return [...set];},batches=of(ix.batch,owners),nums=batches.map(b=>b.number),receipts=of(ix.pay,owners);
 return {glassBatch:batches,cutPlan:of(ix.plan,nums),sheetBreak:of(ix.brk,nums),shipment:of(ix.ship,owners),receipt:receipts,refund:of(ix.back,receipts.map(r=>r.id)),inventoryEvent:[],purchaseReceipt:[]};
}
/* Память расчётов по таблицам в работе: подмена её не портит, иначе после
   чтения отчёт считал бы работу заново. */
function archiveCalcSaved(){return [repWorkCache,repWorkDayCache,repOpCache,repBreakCache,repOrderCache,repOrderedCache,repDeliveryCache,repTimeCache,repQuoteCache,repPayCache,repBatchCache,repMoveCache,repIguCache,repSheetCutCache,repSoldCache,repSoldByOrder];}
function archiveCalcBack(x){[repWorkCache,repWorkDayCache,repOpCache,repBreakCache,repOrderCache,repOrderedCache,repDeliveryCache,repTimeCache,repQuoteCache,repPayCache,repBatchCache,repMoveCache,repIguCache,repSheetCutCache,repSoldCache,repSoldByOrder]=x;}
/* Записи части по таблицам, по порядку строк. */
function archiveParse(recs){const by=new Map();recs.slice().sort((a,b)=>a.seq-b.seq).forEach(r=>{let a=by.get(r.tbl);if(!a)by.set(r.tbl,a=[]);a.push(JSON.parse(r.data));});return by;}
/* Строки части по каждой функции фактов — на подменённых таблицах. */
function archiveCalc(by,owners,gens,ix){
 const set=new Set(owners);
 const hot=archiveHotFor(ix,owners),keep=new Map(),saved=archiveCalcSaved(),swap=(t,rows)=>{keep.set(t,DB[t]);DB[t]=rows;};
 ARCH_OWN.forEach(t=>swap(t,by.get(t)||[]));
 by.forEach((rows,t)=>{if(!ARCH_OWN.includes(t))swap(t,(hot[t]||DB[t]||[]).concat(rows));});
 Object.keys(hot).forEach(t=>{if(!keep.has(t))swap(t,hot[t]);});
 repSoldByOrder=new Map();archiveCalcOn=true;storageInvalidate();
 try{
  return readScope(()=>gens.map(gen=>{const g=ARCH_GENS[gen],rows=window[g.fn]();return (g.own?rows.filter(r=>set.has(g.own(r))):rows).filter(r=>!/^ARCH\|/.test(r.id)).map(r=>Object.assign({},r));}));
 }finally{keep.forEach((rows,t)=>{DB[t]=rows;});archiveCalcOn=false;storageInvalidate();archiveCalcBack(saved);}
}
/* Накладная на несколько заказов: вес считается по всем её заказам, даже
   ушедшим другой частью — их заказы читаются только для этой строки. Между
   функциями — пауза (rest): экран свободен. */
async function archiveCalcPart(ix,owners,gens,rest,put){
 const recs=await archiveRead(owners,true),by=archiveParse(recs);
 for(const g of gens){
  if(g==='delivery'){
   const own=new Set(owners),more=[...new Set(recs.filter(r=>r.tbl==='shipment').flatMap(r=>r.owners||[]))].filter(id=>!own.has(id)&&archiveIndex.has(id));
   const extra=more.length?(await archiveRead(more,true)).filter(r=>r.tbl==='salesOrder'):[];
   put(g,archiveCalc(extra.length?archiveParse(recs.concat(extra)):by,owners,[g],ix)[0]);
  }else put(g,archiveCalc(by,owners,[g],ix)[0]);
  await new Promise(r=>setTimeout(r,rest()));
 }
}
/* Месяц для всех функций фактов: диск → сервер → посчитать по частям и
   положить в оба места. Один расчёт месяца на вкладку: отчёт и фон ждут
   один и тот же; отчёт его торопит (bg false — без пауз). */
const ARCH_REST=300;
const archJobs=new Map();
function archiveMonthReady(mo,acc,bg){
 const stamp=archiveMonthStamp(archiveFactsBase(acc),mo),was=archJobs.get(mo.m);
 if(was&&was.stamp===stamp){if(!bg)was.bg=false;return was;}
 const job={stamp,bg:!!bg,part:0,parts:0,sent:new Set()};
 job.p=archiveMonthLoad(mo,acc,job).finally(()=>{if(archJobs.get(mo.m)===job)archJobs.delete(mo.m);});
 archJobs.set(mo.m,job);return job;
}
async function archiveMonthLoad(mo,acc,job){
 const stamp=job.stamp,heads=await archFactsGet(ARCH_ALL.map(g=>'h|'+g+'|'+mo.m)),out=new Map();
 ARCH_ALL.forEach((g,i)=>{const h=heads[i];if(h&&h.stamp===stamp)out.set(g,h);});
 let todo=ARCH_ALL.filter(g=>!out.has(g));if(!todo.length)return out;
 if(acc.full){
  let got=[];try{got=await archServerGet(todo.map(g=>'g|'+g+'|'+mo.m),true);}catch(e){console.warn('Report month was not read from the server:',e.message);}
  for(const r of got){const g=String(r.key).split('|')[1];if(r.stamp!==stamp||!r.data||!todo.includes(g)||out.has(g))continue;
   try{const x=await archUnpack(r.data);out.set(g,await archFactsStore(g,mo.m,stamp,x.n,x.cols));job.sent.add(g);}catch(e){console.warn('Report month was not read:',e.message);}}
  todo=todo.filter(g=>!out.has(g));if(!todo.length)return out;
 }
 /* Строки части сразу в столбцы: в памяти — одна часть строк и столбцы
    месяца, а не строки всех частей. */
 const parts=archiveParts(mo.owners),all=new Map(todo.map(g=>[g,[]])),ix=archiveHotIndex(),rest=()=>job.bg?ARCH_REST:0;
 job.parts=parts.length;
 for(let i=0;i<parts.length;i++){
  await archiveCalcPart(ix,parts[i],todo,rest,(g,rows)=>all.get(g).push(archColsPart(rows)));
  job.part=i+1;if(archiveScope&&archiveScope.job===job)archiveFactsShow(archiveScope);
 }
 for(const g of todo){const list=all.get(g),head=await archFactsStore(g,mo.m,stamp,list.reduce((s,p)=>s+p.n,0),archColsJoin(list));all.delete(g);out.set(g,head);if(acc.full){archServerSend(g,mo.m,stamp,head);job.sent.add(g);}}
 return out;
}
function archiveFactsShow(st){
 const j=st.job;st.pct=Math.floor((st.done+(j&&j.parts?j.part/j.parts:0))/st.months.length*100);
 const el=document.querySelector('[data-rep-archive-wait]');if(el)el.textContent=archiveFactsText(st);
}
function archiveFactsText(st){return `Reading ${st.orders} archived orders · ${st.pct}%`;}
/* Столбцы месяца → строки с полями страницы. */
async function archiveMonthRows(mo,gen,head,keys){
 const list=[...keys],cols=head.cols||Object.fromEntries((await archFactsGet(list.map(k=>'c|'+gen+'|'+mo.m+'|'+k))).map((c,i)=>[list[i],c]));
 const have=list.filter(k=>cols[k]),rows=new Array(head.n);
 for(let i=0;i<head.n;i++){const r={};for(const k of have)r[k]=archColAt(cols[k],i);rows[i]=r;}
 return rows;
}
async function archiveFactsBuild(st,need){
 const gens=[...need.keys()],raw=new Map(gens.map(g=>[g,[]])),acc=await archAccessOf();
 for(const mo of st.months){
  if(archiveScope!==st)return;
  const job=archiveMonthReady(mo,acc,false);st.job=job;
  const heads=await job.p;st.job=null;
  for(const g of gens){const rows=await archiveMonthRows(mo,g,heads.get(g),need.get(g));if(archiveScope!==st)return;const a=raw.get(g);for(const r of rows)a.push(r);}
  st.done++;archiveFactsShow(st);
  await new Promise(r=>setTimeout(r));
 }
 raw.forEach((rows,g)=>st.rows.set(g,archiveJoin(g,rows)));
 st.ready=true;render();
}
/* Фон (владелец 04.11.2026: отчёты открывают редко, но тогда нужно сразу):
   главная вкладка с сервером после входа сама готовит недостающие и
   изменённые месяцы — новые первыми, по части, с паузами, пока человек не
   печатает и не правит заказ. Кто видит все таблицы, кладёт на сервер и
   месяцы, которые лежат только на его диске. Тесты и инструменты выключают
   (window.GF_NO_ARCHIVE). */
let archFillTimer=null;
function archiveFactsFill(ms){
 if(archFillTimer||typeof window==='undefined'||window.GF_NO_ARCHIVE)return;
 archFillTimer=setTimeout(async()=>{
  let next=60*60e3;
  try{next=await archiveFactsFillRun();}catch(e){console.warn('Report months were not prepared:',e.message);next=10*60e3;}
  archFillTimer=null;archiveFactsFill(next);
 },ms);
}
function archFillCan(){return storageWriter&&!storageStarting&&!storageRecovery&&!storageStale&&typeof cloudSync!=='undefined'&&cloudSync.on&&accessCan('reports');}
function archFillBusy(){return Date.now()-archiveInputAt<5000||typeof soDraft!=='undefined'&&!!soDraft||!!archiveVisit;}
async function archiveFactsFillRun(){
 if(!archFillCan()||!archiveIndex.size)return 60e3;
 const acc=await archAccessOf(),months=archiveMonths([['','']]).reverse();
 const there=acc.full?new Map((await archServerGet([].concat(...months.map(mo=>ARCH_ALL.map(g=>'g|'+g+'|'+mo.m))),false)).map(r=>[r.key,r.stamp])):null;
 for(const mo of months){
  while(archFillBusy())await new Promise(r=>setTimeout(r,5000));
  if(!archFillCan())return 60e3;
  const job=archiveMonthReady(mo,acc,true),heads=await job.p;
  if(there)for(const g of ARCH_ALL){const h=heads.get(g);if(h&&!job.sent.has(g)&&there.get('g|'+g+'|'+mo.m)!==job.stamp)await archServerSend(g,mo.m,job.stamp,h);}
  await new Promise(r=>setTimeout(r,ARCH_REST));
 }
 return 60*60e3;
}
if(typeof window!=='undefined')archiveFactsFill(60e3);

/* Строка общей записи — одна (ранняя); итоги — сложить. */
function archiveJoin(gen,rows){
 const g=ARCH_GENS[gen];if(!g.shared)return rows;
 const m=new Map();
 rows.forEach(r=>{const was=m.get(r.id);if(!was){m.set(r.id,r);return;}if(g.sum)g.sum.forEach(k=>{was[k]=(+was[k]||0)+(+r[k]||0);});else if(r.at&&(!was.at||r.at<was.at))m.set(r.id,r);});
 return [...m.values()];
}

/* ------------------------- Строки в отчёте ---------------------------- */
let archiveCalcOn=false;
/* Обёртка функции фактов: работа + архив страницы. */
function archiveFactsMerge(gen,hot,args){
 const st=archiveScope,cold=st&&st.ready&&!archiveCalcOn&&!(gen==='work'&&args[0])?st.rows.get(gen):null;if(!cold)return hot;
 let memo=st.merged.get(gen);if(!memo)st.merged.set(gen,memo=new WeakMap());
 let out=memo.get(hot);if(out)return out;
 const g=ARCH_GENS[gen];
 if(!g.shared)out=hot.concat(cold);
 else if(g.sum)out=archiveIguJoin(g,hot,cold);
 else if(g.early){const m=new Map(hot.map(r=>[r.id,r]));cold.forEach(r=>{const was=m.get(r.id);if(!was||r.at<was.at)m.set(r.id,r);});out=[...m.values()];}
 else if(g.cold){const ids=new Set(cold.map(r=>r.id));out=hot.filter(r=>!ids.has(r.id)).concat(cold);}
 else{const ids=new Set(hot.map(r=>r.id));out=hot.concat(cold.filter(r=>!ids.has(r.id)));}
 if(gen==='delivery')out=archiveTripKm(out);
 memo.set(hot,out);return out;
}
/* Километры рейса — у одной строки: части видели свою первую остановку. */
function archiveTripKm(rows){
 const seen=new Set();
 return rows.map(r=>{if(r.km==null||!r.trip)return r;if(!seen.has(r.trip)){seen.add(r.trip);return r;}return Object.assign({},r,{km:null,tripFirst:0,kmDone:0});});
}
/* Материалы IGU: день × человек × материал складываются с работой; итог
   «Archived · total only» уменьшается на то, что пришло по дням. */
function archiveIguJoin(g,hot,cold){
 const m=new Map(),used=new Map();
 hot.forEach(r=>m.set(r.id,Object.assign({},r)));
 cold.forEach(r=>{const was=m.get(r.id);if(was)g.sum.forEach(k=>{was[k]=(+was[k]||0)+(+r[k]||0);});else m.set(r.id,Object.assign({},r));
  const k=String(r.id).split('|').slice(2).join('|'),u=used.get(k)||{qty:0,missing:0};u.qty+=+r.qty||0;u.missing+=+r.missing||0;used.set(k,u);});
 used.forEach((u,k)=>{const a=m.get('ARCH|'+k);if(!a)return;a.qty-=u.qty;a.missing=Math.max(0,a.missing-u.missing);g.sum.forEach(f=>{if(f.endsWith('Ft')||f.endsWith('Kg'))if(a[f])a[f]-=u.qty;});if(Math.abs(a.qty)<1e-6&&!a.missing)m.delete('ARCH|'+k);});
 return [...m.values()];
}
Object.keys(ARCH_GENS).forEach(gen=>{const name=ARCH_GENS[gen].fn,fn=window[name];window[name]=function(){return archiveFactsMerge(gen,fn.apply(this,arguments),arguments);};});
