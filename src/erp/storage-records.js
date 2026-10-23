/* =====================================================================
   erp/storage-records  ·  erp-1.0
   База по записям в IndexedDB (задание «База», этап 1). Одна запись — одна
   строка таблицы: заказ, скан, стекло. Разделы работают с DB в памяти, как
   раньше; здесь — как DB раскладывается на записи и обратно, что изменилось
   с прошлой записи и как изменённое пишется одной транзакцией.
   IN : DB, DEFAULT
   OUT: storageBase (что лежит в базе), storageDiff, storageBaseApply,
        storageJoin, storageApplyRecords, storageIdb* (открыть, прочитать,
        записать, мета, копия до импорта, архив)

   Запись — {tbl, id, seq, data}:
   - tbl — ключ таблицы в DB (salesOrder, stationScan…); `_meta` — всё, что
     не массив (счётчики, настройки): id — имя ключа;
   - id — то, по чему узнаётся строка (STORAGE_ROW_KEY). Таблица, где ключа
     нет у всех строк или он повторяется, хранится одной записью `*`;
   - seq — порядок строки в массиве: порядок в DB важен (новые — в конце,
     сортировки по номеру);
   - data — строка JSON, как раньше весь localStorage: после F5 база та же
     байт в байт.

   Архив (задание «База», этап 3) — те же записи в отдельном складе `cold`
   с `owners` (заказы, которым запись принадлежит) и `month`. При F5 он не
   читается, сравнение базы его не видит. Запись либо в работе, либо в
   архиве: перенос — изменение `cold` в той же транзакции, возврат —
   запись с `warm`, она же удаляет копию из архива. Указатель архива —
   склад `archive`: короткая строка Sales ушедшего заказа (`tbl` `_archive`
   в наборе изменений); при старте читается целиком, в сравнение не входит.
   ===================================================================== */

const STORAGE_IDB_NAME='glass-erp';
/* По чему узнаётся строка. Остальные таблицы — по id, без id — по code
   (станции, тара, терминалы). Проверено на базах симулятора 21.10.2026: у
   каждой строки ключ есть и не повторяется. */
const STORAGE_ROW_KEY={glassBatch:'number',cutPlan:'batch',productionRoute:'key',glassPiece:'key',glassUnitId:'key',
 materialWeightRates:'key',tripKm:'key',financeTerms:'orderId',user:'viewProfileId'};
/* Опорное состояние — то, что лежит в базе (или уже ушло в запись):
   tbl → Map id → {t: текст JSON, s: seq}. */
let storageBase=new Map();
let storageIdb=null;
/* Строки на просмотре из архива (erp/archive, archiveOpen): tbl → Set id.
   Они в DB, пока заказ открыт, но сравнение базы их не видит — в базу не
   пишутся и «удалёнными» не считаются. */
let storageVisit=new Map();

function storageRowKey(tbl,row){
 if(!row||typeof row!=='object')return '';
 const f=STORAGE_ROW_KEY[tbl],v=f?row[f]:(row.id!=null&&row.id!==''?row.id:row.code);
 return v==null||v===''||typeof v==='object'?'':String(v);
}
/* Ключи строк по порядку или null — тогда таблица хранится целиком. */
function storageTableIds(tbl,rows){
 const ids=new Array(rows.length),seen=new Set();
 for(let i=0;i<rows.length;i++){
  const id=storageRowKey(tbl,rows[i]);
  if(!id||id==='*'||seen.has(id))return null;
  seen.add(id);ids[i]=id;
 }
 return ids;
}
/* seq по порядку строк. Строка, которая не сдвинулась, свой seq сохраняет —
   тогда её не нужно переписывать: новая в конце, правка на месте, удаление
   пишут только себя. Вставка между строками берёт середину промежутка;
   промежуток кончился — таблица нумеруется заново. */
/* Новые строки. Со связью с сервером у каждого компьютера своя дробная
   часть t: два компьютера вставили по строке в одно место — seq разные,
   порядок у обоих один, и ни один не переписывает чужую строку
   (erp/cloud-sync, 23.10.2026). Без связи t = 0 — как раньше. */
function storageSeqTie(){return typeof cloudSeqTie==='function'?cloudSeqTie():0;}
function storageSeqNext(lo){const t=storageSeqTie();return t?Math.floor(lo)+1+t:lo+1;}
function storageSeqs(ids,base){
 const n=ids.length,seq=new Array(n),keep=new Array(n),t=storageSeqTie();
 let last=-Infinity;
 for(let i=0;i<n;i++){const b=base.get(ids[i]);keep[i]=!!b&&b.s>last;if(keep[i]){seq[i]=b.s;last=b.s;}}
 for(let i=0;i<n;){
  if(keep[i]){i++;continue;}
  let j=i;while(j<n&&!keep[j])j++;
  const lo=i>0?seq[i-1]:null,hi=j<n?seq[j]:null,k=j-i;
  for(let m=0;m<k;m++)seq[i+m]=lo==null&&hi==null?m+t:lo==null?(t?Math.ceil(hi)-1-t:hi-1)-(k-1-m):hi==null?storageSeqNext(lo)+m:lo+(hi-lo)*(t?m+0.5+t:m+1)/(k+1);
  for(let m=i;m<j;m++)if((m>0&&!(seq[m]>seq[m-1]))||(hi!=null&&!(seq[m]<hi)))return ids.map((x,q)=>q);
  i=j;
 }
 return seq;
}
/* Строки таблицы, какими их видело прошлое сравнение (задание «База», скан
   подряд): tbl → {rows, ids, seq}. Команда с областью из ключей
   (storageDiffTail) не перебирает 100 тысяч сканов: те же объекты на тех
   же местах при той же базе — не тронуты (правка на месте вне
   области — её дело, как и раньше); сравниваются названные строки и
   дописанные в конец. Иначе — полный проход. */
let storageSeen=new Map();
function storageDiffTail(k,v,was,rows,out){
 const s=storageSeen.get(k),n=s?s.rows.length:0;
 if(!s||v.length<n||was.size!==n)return false;
 for(let i=0;i<n;i++)if(v[i]!==s.rows[i])return false;
 /* База та же, что видело сравнение: тот же размер и тот же seq у первой и
    последней строки (перенумерация меняет все). */
 for(const i of n?[0,n-1]:[]){const b=was.get(s.ids[i]);if(!b||b.s!==s.seq[i])return false;}
 if(!s.at){s.at=new Map();s.ids.forEach((id,i)=>s.at.set(id,i));}
 const add=[];
 for(let i=n;i<v.length;i++){const id=storageRowKey(k,v[i]);if(!id||id==='*'||s.at.has(id)||was.has(id)||add.some(x=>x.id===id))return false;add.push({id,row:v[i]});}
 rows.forEach(id=>{const i=s.at.get(id);if(i==null)return;const t=JSON.stringify(v[i]),b=was.get(id);if(b.t!==t)out.push({tbl:k,id,seq:s.seq[i],data:t});});
 let last=n?s.seq[n-1]:-1;
 add.forEach(x=>{last=storageSeqNext(last);const i=s.rows.length;s.rows.push(x.row);s.ids.push(x.id);s.seq.push(last);s.at.set(x.id,i);out.push({tbl:k,id:x.id,seq:last,data:JSON.stringify(x.row)});});
 return true;
}
/* Что изменилось в db против опорного состояния: записи для put и delete. */
function storageDiff(db,only){
 const out=[],meta=storageBase.get('_meta')||new Map(),keys=new Set(Object.keys(db));
 storageBase.forEach((m,tbl)=>{if(tbl!=='_meta')keys.add(tbl);});
 meta.forEach((x,k)=>keys.add(k));
 keys.forEach(k=>{
  /* only — сравнить только эти таблицы (storageCommand: до команды). Map
     таблица → Set ключей: из строк на месте — только эти (область записи
     команды); новые, удалённые и сдвинутые видны всегда. */
  if(only&&!only.has(k))return;
  const rows=only instanceof Map?only.get(k):null;
  const vis=storageVisit.size?storageVisit.get(k):null,v=vis&&Array.isArray(db[k])?db[k].filter(r=>!vis.has(storageRowKey(k,r))):db[k],base=storageBase.get(k);
  if(Array.isArray(v)){
   if(meta.has(k))out.push({tbl:'_meta',id:k,del:true});
   const was=base||new Map();
   if(rows&&storageDiffTail(k,v,was,rows,out))return;
   const ids=storageTableIds(k,v);
   if(!ids){
    const t=JSON.stringify(v),b=was.get('*');
    if(!b||b.t!==t)out.push({tbl:k,id:'*',seq:0,data:t});
    was.forEach((x,id)=>{if(id!=='*')out.push({tbl:k,id,del:true});});
    return;
   }
   const seq=storageSeqs(ids,was),now=new Set(ids);storageSeen.set(k,{rows:v.slice(),ids,seq,at:null});
   for(let i=0;i<v.length;i++){
    if(rows){const x=was.get(ids[i]);if(x&&x.s===seq[i]&&!rows.has(ids[i]))continue;}
    const t=JSON.stringify(v[i]),b=was.get(ids[i]);
    if(!b||b.t!==t||b.s!==seq[i])out.push({tbl:k,id:ids[i],seq:seq[i],data:t});
   }
   was.forEach((x,id)=>{if(!now.has(id))out.push({tbl:k,id,del:true});});
   return;
  }
  if(base)base.forEach((x,id)=>out.push({tbl:k,id,del:true}));
  const t=v===undefined?undefined:JSON.stringify(v),b=meta.get(k);
  if(t===undefined){if(b)out.push({tbl:'_meta',id:k,del:true});return;}
  if(!b||b.t!==t)out.push({tbl:'_meta',id:k,seq:0,data:t});
 });
 return out;
}
function storageBaseApply(changes){
 if(typeof finTotalsForget==='function')finTotalsForget(changes);
 changes.forEach(c=>{
  let m=storageBase.get(c.tbl);
  if(c.coldClear||c.tbl==='_archive')return;
  if(!m){if(c.del||c.cold)return;m=new Map();storageBase.set(c.tbl,m);}
  if(c.del||c.cold)m.delete(c.id);else m.set(c.id,{t:c.data,s:c.seq});
  if(!m.size)storageBase.delete(c.tbl);
 });
}
function storageBaseFrom(records){storageBase=new Map();storageBaseApply(records.map(r=>({tbl:r.tbl,id:r.id,seq:r.seq,data:r.data})));}
/* Строки таблицы из опорного состояния — по порядку seq; overlay —
   изменения поверх (откат к состоянию до команды). */
function storageBaseRows(tbl,overlay){
 const m=new Map(storageBase.get(tbl)||[]);
 (overlay||[]).forEach(c=>{if(c.del)m.delete(c.id);else m.set(c.id,{t:c.data,s:c.seq});});
 const whole=m.get('*');if(whole)return JSON.parse(whole.t);
 return [...m.values()].sort((a,b)=>a.s-b.s).map(x=>JSON.parse(x.t));
}
/* id → текст строки, как лежит в базе (журнал заказа сравнивает с ним). */
function storageBaseTexts(tbl){
 const m=storageBase.get(tbl);if(!m)return new Map();
 if(!m.has('*')){const out=new Map();m.forEach((x,id)=>out.set(id,x.t));return out;}
 return new Map(storageBaseRows(tbl).filter(r=>r&&r.id).map(r=>[String(r.id),JSON.stringify(r)]));
}
/* Записи → объект базы, как прежде JSON.parse всего localStorage. parsed —
   data уже объект (строки файла Export v2), а не текст JSON. */
function storageJoin(records,parsed){
 const state={},tables=new Map(),value=r=>parsed?r.data:JSON.parse(r.data);
 records.forEach(r=>{
  if(!r||typeof r.tbl!=='string'||typeof r.id!=='string'||(!parsed&&typeof r.data!=='string')||!Number.isFinite(r.seq))throw new Error('A stored record is damaged.');
  if(r.tbl==='_meta'){state[r.id]=value(r);return;}
  let list=tables.get(r.tbl);if(!list)tables.set(r.tbl,list=[]);list.push(r);
 });
 tables.forEach((list,tbl)=>{
  if(Object.prototype.hasOwnProperty.call(state,tbl))throw new Error('Table '+tbl+' is stored twice.');
  const whole=list.find(r=>r.id==='*');
  if(whole){
   const rows=value(whole);
   if(list.length>1||!Array.isArray(rows))throw new Error('Table '+tbl+' is stored twice.');
   state[tbl]=rows;return;
  }
  state[tbl]=list.sort((a,b)=>a.seq-b.seq).map(value);
 });
 return state;
}
/* Записи, пришедшие из базы (чужая вкладка) или из опорного состояния
   (откат), — в DB и в опорное состояние. Немного строк — правка на месте;
   много или таблица целиком — таблица собирается заново из опорного. */
function storageApplyRecords(list){
 const byTbl=new Map();
 list.forEach(c=>{
  if(c.tbl==='_meta'){
   if(c.del){if(Array.isArray(DEFAULT[c.id]))DB[c.id]=[];else delete DB[c.id];}
   else DB[c.id]=JSON.parse(c.data);
   return;
  }
  let a=byTbl.get(c.tbl);if(!a)byTbl.set(c.tbl,a=[]);a.push(c);
 });
 byTbl.forEach((cs,tbl)=>{
  const before=storageBase.get(tbl),wasWhole=!!before&&before.has('*'),rows=Array.isArray(DB[tbl])?DB[tbl]:null;
  storageBaseApply(cs);
  if(!rows||cs.length>50||cs.some(c=>c.id==='*')||wasWhole){DB[tbl]=storageBaseRows(tbl);return;}
  /* Сначала убрать все тронутые строки, потом вставлять по порядку seq:
     у оставшихся seq прежние, и они стоят по нему — поиск места верен.
     По одной (убрал-вставил) чужая перестановка ложилась не в том порядке
     (проверка Codex 22.10.2026). Массив тот же: на него держат ссылки. */
  const base=storageBase.get(tbl)||new Map(),seqOf=r=>{const b=base.get(storageRowKey(tbl,r));return b?b.s:Infinity;},touched=new Set(cs.map(c=>c.id));
  let n=0;for(let i=0;i<rows.length;i++)if(!touched.has(storageRowKey(tbl,rows[i])))rows[n++]=rows[i];rows.length=n;
  cs.filter(c=>!c.del).sort((a,b)=>a.seq-b.seq).forEach(c=>{
   let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>1;if(seqOf(rows[mid])<c.seq)lo=mid+1;else hi=mid;}
   rows.splice(lo,0,JSON.parse(c.data));
  });
 });
 storageBaseApply(list.filter(c=>c.tbl==='_meta'));
}
/* Вернуть в DB то, что лежит в базе, — только таблицы и ключи, которые
   изменились. overlay — несохранённое, что было в памяти до команды: оно
   возвращается тоже, и откат даёт ровно прежнюю DB. */
function storageRestore(changes,overlay){
 const meta=storageBase.get('_meta')||new Map(),over=new Map(),keyOf=c=>c.tbl==='_meta'?'_meta\u0000'+c.id:c.tbl;
 (overlay||[]).forEach(c=>{const k=keyOf(c);let a=over.get(k);if(!a)over.set(k,a=[]);a.push(c);});
 const keys=new Set(changes.concat(overlay||[]).map(keyOf));
 keys.forEach(k=>{
  if(!k.startsWith('_meta\u0000'))return;
  const id=k.slice(6),o=over.get(k),b=meta.get(id),last=o?o[o.length-1]:b?{data:b.t}:{del:true};
  if(last.del){if(Array.isArray(DEFAULT[id]))DB[id]=[];else delete DB[id];}else DB[id]=JSON.parse(last.data);
 });
 keys.forEach(k=>{
  if(k.startsWith('_meta\u0000'))return;
  if(!storageBase.has(k)&&!over.has(k)&&meta.has(k))return;
  DB[k]=storageBaseRows(k,over.get(k));
 });
}
/* Наборы изменений, ждущие записи, — по ключу записи, последнее побеждает. */
function storageMerge(a,b){
 /* Возврат из архива, перекрытый следующей правкой той же строки, остаётся
    возвратом: иначе копия в архиве пережила бы её. */
 const m=new Map();[a,b].forEach(list=>(list||[]).forEach(c=>{const k=c.tbl+'\u0000'+c.id,p=m.get(k);m.set(k,p&&p.warm&&!c.del&&!c.cold&&!c.warm?Object.assign({},c,{warm:true}):c);}));
 return [...m.values()];
}

/* ---- IndexedDB: record — записи; meta — rev (номер последней записи),
   build (версия, что писала последней), copyAt, test (метка TEST); copy —
   копия до импорта; cold — архив (указатель owners — по заказу); archive —
   указатель архива (строка Sales ушедшего заказа); cloud — синхронизация с
   сервером (erp/cloud-sync.js): версии строк, очередь на отправку, курсор. */
function storageIdbOpen(){
 return new Promise((resolve,reject)=>{
  let q;try{q=indexedDB.open(STORAGE_IDB_NAME,4);}catch(e){reject(e);return;}
  q.onupgradeneeded=()=>{const d=q.result,has=n=>d.objectStoreNames.contains(n);
   if(!has('record'))d.createObjectStore('record',{keyPath:['tbl','id']});if(!has('meta'))d.createObjectStore('meta');if(!has('copy'))d.createObjectStore('copy');
   if(!has('cold'))d.createObjectStore('cold',{keyPath:['tbl','id']}).createIndex('owners','owners',{multiEntry:true});
   if(!has('archive'))d.createObjectStore('archive',{keyPath:'id'});if(!has('cloud'))d.createObjectStore('cloud');};
  q.onsuccess=()=>{storageIdb=q.result;storageIdb.onversionchange=()=>{storageIdb.close();storageIdb=null;};resolve(storageIdb);};
  q.onerror=()=>reject(q.error||new Error('The database could not be opened.'));
 });
}
function storageIdbTx(stores,mode,fill){
 return new Promise((resolve,reject)=>{
  if(!storageIdb){reject(new Error('The database is not open.'));return;}
  let tx,out;
  try{tx=storageIdb.transaction(stores,mode);out=fill(tx);}catch(e){try{if(tx)tx.abort();}catch(x){}reject(e);return;}
  tx.oncomplete=()=>resolve(out);
  tx.onabort=()=>reject(tx.error||new Error('The database write was cancelled.'));
  if(mode==='readwrite'&&tx.commit)tx.commit();
 });
}
function storageIdbReadAll(){
 return storageIdbTx(['record','meta','archive'],'readonly',tx=>{
  const out={records:[],rev:0,build:'',copyAt:'',test:false,archive:[]},ms=tx.objectStore('meta');
  tx.objectStore('record').getAll().onsuccess=e=>{out.records=e.target.result||[];};
  tx.objectStore('archive').getAll().onsuccess=e=>{out.archive=e.target.result||[];};
  ['rev','build','copyAt','test'].forEach(k=>{ms.get(k).onsuccess=e=>{if(e.target.result!=null)out[k]=e.target.result;};});
  return out;
 });
}
function storageIdbMeta(){
 return storageIdbTx(['meta'],'readonly',tx=>{
  const out={rev:0,build:'',test:false},ms=tx.objectStore('meta');
  ['rev','build','test'].forEach(k=>{ms.get(k).onsuccess=e=>{if(e.target.result!=null)out[k]=e.target.result;};});
  return out;
 });
}
function storageIdbGet(keys){
 return storageIdbTx(['record','meta'],'readonly',tx=>{
  const rs=tx.objectStore('record'),out={records:new Array(keys.length),rev:0};
  keys.forEach((k,i)=>{rs.get(k).onsuccess=e=>{out.records[i]=e.target.result;};});
  tx.objectStore('meta').get('rev').onsuccess=e=>{out.rev=e.target.result||0;};
  return out;
 });
}
/* Набор изменений — одной транзакцией вместе с номером записи, версией и
   меткой TEST (test не передан — метка не трогается). cold — запись уходит
   в архив; warm — запись вернулась из архива (её копия там удаляется);
   coldClear — архив и его указатель очищаются (Import заменяет базу
   целиком); `_archive` — строка указателя архива. Остальные записи склад
   архива не трогают: старт новой установки пишет всё сразу. cloud — пары
   [ключ, значение] склада cloud той же транзакцией (null — удалить): строка
   и её отправка на сервер не расходятся. */
function storageIdbWrite(changes,rev,build,test,cloud){
 return storageIdbTx(cloud&&cloud.length?['record','cold','archive','meta','cloud']:['record','cold','archive','meta'],'readwrite',tx=>{
  const rs=tx.objectStore('record'),cs=tx.objectStore('cold'),as=tx.objectStore('archive'),ms=tx.objectStore('meta');
  changes.forEach(c=>{
   if(c.coldClear){cs.clear();as.clear();return;}
   if(c.tbl==='_archive'){if(c.del)as.delete(c.id);else as.put({id:c.id,row:JSON.parse(c.data)});return;}
   const k=[c.tbl,c.id];
   if(c.cold){rs.delete(k);cs.put({tbl:c.tbl,id:c.id,seq:c.seq,data:c.data,owners:c.owners||[],month:c.month||''});}
   else if(c.del)rs.delete(k);else{rs.put({tbl:c.tbl,id:c.id,seq:c.seq,data:c.data});if(c.warm)cs.delete(k);}
  });
  ms.put(rev,'rev');ms.put(build,'build');if(test!==undefined)ms.put(test===true,'test');
  if(cloud&&cloud.length){const st=tx.objectStore('cloud');cloud.forEach(([k,v])=>{if(v==null)st.delete(k);else st.put(v,k);});}
 });
}
function storageIdbCloudAll(){
 return storageIdbTx(['cloud'],'readonly',tx=>{
  const st=tx.objectStore('cloud'),out={keys:[],values:[]};
  st.getAllKeys().onsuccess=e=>{out.keys=e.target.result||[];};st.getAll().onsuccess=e=>{out.values=e.target.result||[];};
  return out;
 });
}
function storageIdbMetaPut(key,value){return storageIdbTx(['meta'],'readwrite',tx=>{tx.objectStore('meta').put(value,key);});}
/* Архив заказа (все записи, где он среди owners) и весь архив (Export). */
/* Записи многих заказов одним чтением (отчёт, выписка): запросы по
   указателю owners в одной транзакции — по одному они шли ~5 мс каждый. */
function storageIdbColdOfMany(owners){return storageIdbTx(['cold'],'readonly',tx=>{const ix=tx.objectStore('cold').index('owners'),out={lists:new Array(owners.length)};owners.forEach((o,i)=>{ix.getAll(o).onsuccess=e=>{out.lists[i]=e.target.result||[];};});return out;}).then(o=>o.lists);}
function storageIdbColdOf(owner){return storageIdbTx(['cold'],'readonly',tx=>{const out={records:[]};tx.objectStore('cold').index('owners').getAll(owner).onsuccess=e=>{out.records=e.target.result||[];};return out;}).then(o=>o.records);}
function storageIdbArchiveGet(ids){return storageIdbTx(['archive'],'readonly',tx=>{const st=tx.objectStore('archive'),out={rows:new Array(ids.length)};ids.forEach((id,i)=>{st.get(id).onsuccess=e=>{out.rows[i]=e.target.result||null;};});return out;}).then(o=>o.rows);}
function storageIdbArchiveAll(){return storageIdbTx(['archive'],'readonly',tx=>{const out={rows:[]};tx.objectStore('archive').getAll().onsuccess=e=>{out.rows=e.target.result||[];};return out;}).then(o=>o.rows);}
function storageIdbColdAll(){return storageIdbTx(['cold'],'readonly',tx=>{const out={records:[]};tx.objectStore('cold').getAll().onsuccess=e=>{out.records=e.target.result||[];};return out;}).then(o=>o.records);}
function storageIdbMetaPut(key,value){return storageIdbTx(['meta'],'readwrite',tx=>{tx.objectStore('meta').put(value,key);});}
/* Копия до импорта — по записям, частями по 1000 (в работе и архив): одной
   огромной строки нет (проверка Codex 22.10.2026, находка 6). Прежняя копия
   одной строкой ('before-import') ещё читается. */
function storageIdbCopyPut(text,at){return storageIdbTx(['copy','meta'],'readwrite',tx=>{tx.objectStore('copy').put(text,'before-import');tx.objectStore('meta').put(at,'copyAt');});}
function storageIdbCopyPutRecords(hot,cold,at,test,archive){
 archive=archive||[];
 return storageIdbTx(['copy','meta'],'readwrite',tx=>{
  const cp=tx.objectStore('copy');cp.clear();
  for(let i=0;i<hot.length;i+=1000)cp.put(hot.slice(i,i+1000),['h',i/1000]);
  for(let i=0;i<cold.length;i+=1000)cp.put(cold.slice(i,i+1000),['c',i/1000]);
  for(let i=0;i<archive.length;i+=1000)cp.put(archive.slice(i,i+1000),['a',i/1000]);
  cp.put({at,test:!!test,hot:hot.length,cold:cold.length,archive:archive.length},'head');tx.objectStore('meta').put(at,'copyAt');
 });
}
/* {text} — прежняя копия одной строкой; {head, hot, cold} — по записям; null — копии нет. */
function storageIdbCopyRead(){
 return storageIdbTx(['copy'],'readonly',tx=>{
  const out={text:null,head:null,hot:[],cold:[],archive:[]};
  tx.objectStore('copy').openCursor().onsuccess=e=>{const c=e.target.result;if(!c)return;const k=c.key;
   if(k==='before-import')out.text=c.value;else if(k==='head')out.head=c.value;else if(Array.isArray(k))(k[0]==='h'?out.hot:k[0]==='a'?out.archive:out.cold).push(...c.value);c.continue();};
  return out;
 }).then(o=>o.head?o:o.text!=null?{text:o.text}:null);
}
function storageIdbCopyGet(){return storageIdbCopyRead().then(o=>o&&o.text!=null?o.text:null);}
function storageIdbCopyDrop(){return storageIdbTx(['copy','meta'],'readwrite',tx=>{tx.objectStore('copy').clear();tx.objectStore('meta').delete('copyAt');});}
