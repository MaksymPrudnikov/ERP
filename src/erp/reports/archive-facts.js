/* =====================================================================
   reports/archive-facts  ·  facts-1.0
   Отчёт за прошлые месяцы без стены (задание правок 02.11, 7б). Записи
   ушедших заказов в DB больше не ставятся: архив читается частями в фоне,
   из каждой части считаются строки отчёта (те же функции фактов), записи
   выгружаются. Строки закрытого месяца лежат на диске (склад facts) —
   повторное открытие читает только их.
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
 igu:{fn:'repIguMaterialFacts',shared:true,sum:['qty','units','missing','spacerFt','sealantKg','gasKg','partsKg']}
};
/* Источник отчёта → функция фактов. Чего здесь нет — не зависит от архива:
   закупки, склад без заказов, то, что есть сейчас (now). */
const REP_ARCH_SRC={glass:'work',cutting:'work',tempering:'work',assembly:'work',shipping:'work',time:'work',edgework:'op',drilling:'op',ops:'op',breaks:'break',orders:'order',ordered:'ordered',
 sold:'sold',quotes:'quote',deliveries:'delivery',sheets:'sheet',sheetcut:'sheetcut',batches:'batch',payments:'receipt',payorders:'payorder',refunds:'refund',moves:'move',igumat:'igu'};
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
 if(m.agg==='distinct'){const f=repField(S,m.f);if(f)repArchFieldKeys(f,keys);else keys.add(m.f);return;}
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
  (q.metrics&&q.metrics.length?q.metrics:[S.metrics[0].k]).forEach(k=>repArchMetricKeys(S,repMetric(S,k),keys));
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
/* Строки части → столбцы. Значения не примитивы (works) на диск не идут. */
function archColsOf(rows){
 const keys=new Set();rows.forEach(r=>Object.keys(r).forEach(k=>keys.add(k)));
 const cols={};keys.forEach(k=>{const vals=rows.map(r=>r[k]);if(vals.some(v=>v!=null&&typeof v==='object'))return;cols[k]=archColPack(vals);});
 return cols;
}
function archFactsGet(keys){return storageIdbTx(['facts'],'readonly',tx=>{const st=tx.objectStore('facts'),out={v:new Array(keys.length)};keys.forEach((k,i)=>{st.get(k).onsuccess=e=>{out.v[i]=e.target.result;};});return out;}).then(o=>o.v);}
/* Запись месяца: заголовок последним — без него столбцы не читаются. */
function archFactsPut(gen,month,stamp,rows){
 const cols=archColsOf(rows);
 return storageIdbTx(['facts'],'readwrite',tx=>{const st=tx.objectStore('facts');Object.entries(cols).forEach(([k,c])=>st.put(c,'c|'+gen+'|'+month+'|'+k));st.put({stamp,n:rows.length,keys:Object.keys(cols)},'h|'+gen+'|'+month);}).then(()=>cols);
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
 const st=archiveScope={key,months,orders:archiveScopeCount(ranges),done:0,pct:0,rows:new Map(),merged:new Map(),hot:null,ready:false};
 archiveFactsBuild(st,need).catch(e=>{if(archiveScope===st)archiveScope=null;console.warn('Archive was not read:',e.message);});
 return 'loading';
}
function archiveScopeDrop(){archiveScope=null;}
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
/* Отпечаток того, что не в записях заказа и попало в строки: версия кода,
   прайс, поля клиента, каталог стекла. */
function archiveFactsBase(){
 const c=(DB.customer||[]).map(x=>{const i=repCustomerInfo(x.id);return x.id+i.rep+i.city+i.province+i.ctype;}).join(','),g=(DB.glassProduct||[]).map(x=>x&&x.id+(x.manufacturer||'')).join(',');
 return [storageBuildId(),repCatalogStamp(),archHash(c),archHash(g),archHash(JSON.stringify(DB.tripKm||[]))].join('|');
}
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
/* Строки части по каждой функции фактов — на подменённых таблицах. */
function archiveCalc(recs,owners,gens,ix){
 const by=new Map(),set=new Set(owners);
 recs.sort((a,b)=>a.seq-b.seq).forEach(r=>{let a=by.get(r.tbl);if(!a)by.set(r.tbl,a=[]);a.push(JSON.parse(r.data));});
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
   ушедшим другой частью — их заказы читаются только для этой строки. */
async function archiveCalcPart(st,owners,gens){
 const recs=await archiveRead(owners),rest=gens.filter(g=>g!=='delivery'),out=new Map();
 if(rest.length)archiveCalc(recs,owners,rest,st.hot).forEach((rows,i)=>out.set(rest[i],rows));
 if(gens.includes('delivery')){
  const own=new Set(owners),more=[...new Set(recs.filter(r=>r.tbl==='shipment').flatMap(r=>r.owners||[]))].filter(id=>!own.has(id)&&archiveIndex.has(id));
  const extra=more.length?(await archiveRead(more)).filter(r=>r.tbl==='salesOrder'):[];
  out.set('delivery',archiveCalc(recs.concat(extra),owners,['delivery'],st.hot)[0]);
 }
 return out;
}
/* Строки месяца: с диска или посчитать по частям и записать. */
async function archiveMonthCols(st,mo,gens,base){
 const stamp=archiveMonthStamp(base,mo),heads=await archFactsGet(gens.map(g=>'h|'+g+'|'+mo.m)),out=new Map(),todo=[];
 gens.forEach((g,i)=>{const h=heads[i];if(h&&h.stamp===stamp)out.set(g,h);else todo.push(g);});
 if(todo.length){
  const parts=archiveParts(mo.owners),all=new Map(todo.map(g=>[g,[]]));
  for(let i=0;i<parts.length;i++){
   if(archiveScope!==st)return null;
   (await archiveCalcPart(st,parts[i],todo)).forEach((rows,g)=>{const a=all.get(g);rows.forEach(r=>a.push(r));});
   st.pct=Math.floor((st.done+(i+1)/parts.length)/st.months.length*100);archiveFactsShow(st);
   await new Promise(r=>setTimeout(r));
  }
  /* Диск полон — отчёт всё равно строится: столбцы из памяти. */
  for(const g of todo){const rows=all.get(g);let cols=null;try{cols=await archFactsPut(g,mo.m,stamp,rows);}catch(e){console.warn('Report rows were not stored:',e.message);cols=archColsOf(rows);}out.set(g,{n:rows.length,cols});}
 }
 return out;
}
function archiveFactsShow(st){const el=document.querySelector('[data-rep-archive-wait]');if(el)el.textContent=archiveFactsText(st);}
function archiveFactsText(st){return `Reading ${st.orders} archived orders · ${st.pct}%`;}
/* Столбцы месяца → строки с полями страницы. */
async function archiveMonthRows(mo,gen,head,keys){
 const list=[...keys],cols=head.cols||Object.fromEntries((await archFactsGet(list.map(k=>'c|'+gen+'|'+mo.m+'|'+k))).map((c,i)=>[list[i],c]));
 const have=list.filter(k=>cols[k]),rows=new Array(head.n);
 for(let i=0;i<head.n;i++){const r={};for(const k of have)r[k]=archColAt(cols[k],i);rows[i]=r;}
 return rows;
}
async function archiveFactsBuild(st,need){
 const gens=[...need.keys()],base=archiveFactsBase(),raw=new Map(gens.map(g=>[g,[]]));
 st.hot=archiveHotIndex();
 for(const mo of st.months){
  if(archiveScope!==st)return;
  const heads=await archiveMonthCols(st,mo,gens,base);if(!heads)return;
  for(const g of gens){const rows=await archiveMonthRows(mo,g,heads.get(g),need.get(g));if(archiveScope!==st)return;const a=raw.get(g);for(const r of rows)a.push(r);}
  st.done++;st.pct=Math.floor(st.done/st.months.length*100);archiveFactsShow(st);
  await new Promise(r=>setTimeout(r));
 }
 raw.forEach((rows,g)=>st.rows.set(g,archiveJoin(g,rows)));
 st.hot=null;st.ready=true;render();
}
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
