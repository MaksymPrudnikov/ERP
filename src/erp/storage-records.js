/* =====================================================================
   erp/storage-records  ·  erp-1.0
   База по записям в IndexedDB (задание «База», этап 1). Одна запись — одна
   строка таблицы: заказ, скан, стекло. Разделы работают с DB в памяти, как
   раньше; здесь — как DB раскладывается на записи и обратно, что изменилось
   с прошлой записи и как изменённое пишется одной транзакцией.
   IN : DB, DEFAULT
   OUT: storageBase (что лежит в базе), storageDiff, storageBaseApply,
        storageJoin, storageApplyRecords, storageIdb* (открыть, прочитать,
        записать, мета, копия до импорта)

   Запись — {tbl, id, seq, data}:
   - tbl — ключ таблицы в DB (salesOrder, stationScan…); `_meta` — всё, что
     не массив (счётчики, настройки): id — имя ключа;
   - id — то, по чему узнаётся строка (STORAGE_ROW_KEY). Таблица, где ключа
     нет у всех строк или он повторяется, хранится одной записью `*`;
   - seq — порядок строки в массиве: порядок в DB важен (новые — в конце,
     сортировки по номеру);
   - data — строка JSON, как раньше весь localStorage: после F5 база та же
     байт в байт.
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
function storageSeqs(ids,base){
 const n=ids.length,seq=new Array(n),keep=new Array(n);
 let last=-Infinity;
 for(let i=0;i<n;i++){const b=base.get(ids[i]);keep[i]=!!b&&b.s>last;if(keep[i]){seq[i]=b.s;last=b.s;}}
 for(let i=0;i<n;){
  if(keep[i]){i++;continue;}
  let j=i;while(j<n&&!keep[j])j++;
  const lo=i>0?seq[i-1]:null,hi=j<n?seq[j]:null,k=j-i;
  for(let m=0;m<k;m++)seq[i+m]=lo==null&&hi==null?m:lo==null?hi-(k-m):hi==null?lo+m+1:lo+(hi-lo)*(m+1)/(k+1);
  for(let m=i;m<j;m++)if((m>0&&!(seq[m]>seq[m-1]))||(hi!=null&&!(seq[m]<hi)))return ids.map((x,q)=>q);
  i=j;
 }
 return seq;
}
/* Что изменилось в db против опорного состояния: записи для put и delete. */
function storageDiff(db){
 const out=[],meta=storageBase.get('_meta')||new Map(),keys=new Set(Object.keys(db));
 storageBase.forEach((m,tbl)=>{if(tbl!=='_meta')keys.add(tbl);});
 meta.forEach((x,k)=>keys.add(k));
 keys.forEach(k=>{
  const v=db[k],base=storageBase.get(k);
  if(Array.isArray(v)){
   if(meta.has(k))out.push({tbl:'_meta',id:k,del:true});
   const was=base||new Map(),ids=storageTableIds(k,v);
   if(!ids){
    const t=JSON.stringify(v),b=was.get('*');
    if(!b||b.t!==t)out.push({tbl:k,id:'*',seq:0,data:t});
    was.forEach((x,id)=>{if(id!=='*')out.push({tbl:k,id,del:true});});
    return;
   }
   const seq=storageSeqs(ids,was),now=new Set(ids);
   for(let i=0;i<v.length;i++){
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
 changes.forEach(c=>{
  let m=storageBase.get(c.tbl);
  if(!m){if(c.del)return;m=new Map();storageBase.set(c.tbl,m);}
  if(c.del)m.delete(c.id);else m.set(c.id,{t:c.data,s:c.seq});
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
 const m=new Map();[a,b].forEach(list=>(list||[]).forEach(c=>m.set(c.tbl+'\u0000'+c.id,c)));
 return [...m.values()];
}

/* ---- IndexedDB: record — записи; meta — rev (номер последней записи),
   build (версия, что писала последней), copyAt, test (метка TEST); copy —
   копия до импорта. */
function storageIdbOpen(){
 return new Promise((resolve,reject)=>{
  let q;try{q=indexedDB.open(STORAGE_IDB_NAME,1);}catch(e){reject(e);return;}
  q.onupgradeneeded=()=>{const d=q.result;d.createObjectStore('record',{keyPath:['tbl','id']});d.createObjectStore('meta');d.createObjectStore('copy');};
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
 return storageIdbTx(['record','meta'],'readonly',tx=>{
  const out={records:[],rev:0,build:'',copyAt:'',test:false},ms=tx.objectStore('meta');
  tx.objectStore('record').getAll().onsuccess=e=>{out.records=e.target.result||[];};
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
   меткой TEST (test не передан — метка не трогается). */
function storageIdbWrite(changes,rev,build,test){
 return storageIdbTx(['record','meta'],'readwrite',tx=>{
  const rs=tx.objectStore('record'),ms=tx.objectStore('meta');
  changes.forEach(c=>{if(c.del)rs.delete([c.tbl,c.id]);else rs.put({tbl:c.tbl,id:c.id,seq:c.seq,data:c.data});});
  ms.put(rev,'rev');ms.put(build,'build');if(test!==undefined)ms.put(test===true,'test');
 });
}
function storageIdbMetaPut(key,value){return storageIdbTx(['meta'],'readwrite',tx=>{tx.objectStore('meta').put(value,key);});}
function storageIdbCopyPut(text,at){return storageIdbTx(['copy','meta'],'readwrite',tx=>{tx.objectStore('copy').put(text,'before-import');tx.objectStore('meta').put(at,'copyAt');});}
function storageIdbCopyGet(){return storageIdbTx(['copy'],'readonly',tx=>{const out={text:null};tx.objectStore('copy').get('before-import').onsuccess=e=>{out.text=e.target.result==null?null:e.target.result;};return out;}).then(o=>o.text);}
function storageIdbCopyDrop(){return storageIdbTx(['copy','meta'],'readwrite',tx=>{tx.objectStore('copy').delete('before-import');tx.objectStore('meta').delete('copyAt');});}
