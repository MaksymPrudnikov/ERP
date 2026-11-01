/* ============================================================================
   Синхронизация с сервером — этап 4 задания «База» (docs/ЗАДАЧА_БАЗА.md)
   IN : набор изменений каждой записи (touch → cloudOutbox), сервер
        erp_apply / erp_changes / erp_get (tools/supabase/schema.sql)
   OUT: cloudSync, cloudOutbox, cloudSyncStart, cloudUpload, cloudDownload,
        cloudSyncStop, cloudSyncText, cloudSeq
   Каждый компьютер работает со своей базой браузера, как раньше; сервер —
   общая копия. Свои изменения уходят командами (очередь лежит в складе
   cloud той же транзакцией, что и строки: без сети и после F5 не теряется),
   чужие приходят опросом erp_changes. Конфликт по версии строки или нет
   раздела — команда не пишется целиком, строки этого компьютера
   возвращаются к серверной копии и об этом говорится. Синхронизирует только
   вкладка, которая пишет. Архив тоже на сервере (24.10.2026): уход заказа в
   архив — строки с cold, указатель Sales и выписки — строки _archive;
   опрос и Download приносят архивные строки без данных, на компьютер они не
   копируются: записи заказа приходят при открытии (erp_cold_of, 01.11.2026);
   возврат из архива — обычная строка. Строка
   едет текстом JSON как есть: jsonb переставил бы ключи, и после F5 база
   сочла бы чужую строку изменённой и отправила её обратно.
   Склад cloud: ref — адрес сервера, с которым связана эта база; since —
   курсор erp_changes; n — счётчик очереди; v␀tbl␀id — версия строки;
   o␀000000000001 — команда в очереди; b␀scan — блоки внутренних номеров;
   r␀tbl␀id — строка, которую сервер перенумеровал: опрос возьмёт её копию.
   Номера (владелец, 23.10.2026): заказы, квоты, счета, PS, NCR и документы
   закупки — подряд с сервера: компьютер ставит свой следующий, сервер при
   записи даёт следующий по счётчику (занят — следующий свободный). Стёкла,
   юниты, сканы, обрезки и батчи — блоками с сервера (номер — ключ строки
   или уже на стикере, менять его нельзя); пропуски допустимы. Счётчики
   базы (_meta …Seq) на сервер не ходят: каждый компьютер ведёт свой.
   ============================================================================ */
/* Команда — до 500 строк и около 1 МБ: заказ с чертежами весит десятки КБ. */
const CLOUD_CHUNK=500,CLOUD_CHUNK_BYTES=1e6,CLOUD_POLL_MS=5000;
/* Номер документа новой строки: [счётчик, поле, префикс, цифр не меньше]. */
const CLOUD_NUMBER={
 salesOrder:o=>o.kind==='quote'?['quote','businessNumber','Q-',0]:['order','businessNumber','',0],
 receipt:()=>['receipt','number','R-',4],shipment:()=>['shipment','number','PS-',4],ncr:()=>['ncr','number','NCR',0],
 purchaseOrder:()=>['po','number','PO-',4],purchaseInvoice:()=>['pi','number','PI-',4],purchasePayment:()=>['pp','number','PP-',4],
 purchaseReceipt:()=>['gr','number','GR-',4],purchaseDeliveryRequest:()=>['dr','number','DR-',4]};
/* Блоки внутренних номеров: [размер, последний номер в базе]. Осталось
   меньше половины — берётся следующий. */
const CLOUD_BLOCK={
 glass:[1000,()=>DB.glassPieceSeq],unit:[500,()=>DB.glassUnitIdSeq],scan:[1000,()=>DB.stationScanSeq],
 offcut:[100,()=>DB.stockOffcutSeq],batch:[20,()=>typeof salesBatchTop==='function'?salesBatchTop():0],journal:[50,()=>finJournalTop()]};
let cloudSync={loaded:false,on:false,ref:'',since:0,n:0,vers:new Map(),out:[],early:[],lost:new Set(),blocks:new Map(),blockDirty:new Set(),refresh:new Set(),
 uploading:false,dirty:null,running:false,timer:null,wait:CLOUD_POLL_MS,busy:'',error:'',warn:'',offline:false,at:''};
function cloudKey(tbl,id){return tbl+'\u0000'+id;}
/* Следующий внутренний номер name. Без связи — local, как раньше; связь
   есть, а блока нет (ещё не пришёл или кончился без сети) — тоже local, с
   предупреждением: такой номер может совпасть с чужим. */
function cloudSeq(name,local){
 const s=cloudSync;if(!s.loaded||!s.on)return local;
 const b=s.blocks.get(name)||[];
 while(b.length&&b[0][0]>b[0][1])b.shift();
 if(!b.length){s.warn='No server numbers here yet. IDs may repeat.';cloudSoon();return local;}
 const n=b[0][0]++;s.blocks.set(name,b);s.blockDirty.add(name);
 if(cloudBlockLeft(b)<CLOUD_BLOCK[name][0]/2)cloudSoon();
 return n;
}
function cloudSeqTie(){
 const s=cloudSync;if(!s.on)return 0;
 if(!s.tie){let h=0;for(const ch of cloudDevice())h=(h*31+ch.charCodeAt(0))>>>0;s.tie=(h%9973+1)/10000;}
 return s.tie;
}
function cloudBlockLeft(b){return (b||[]).reduce((n,r)=>n+Math.max(0,r[1]-r[0]+1),0);}
async function cloudBlocksFill(){
 const s=cloudSync,ops=[];
 for(const name of Object.keys(CLOUD_BLOCK)){
  const [size,top]=CLOUD_BLOCK[name],b=s.blocks.get(name)||[];
  if(cloudBlockLeft(b)>=size/2)continue;
  const first=+await cloudRpc('erp_take',{counter:name,n:size,from_n:(Math.floor(+top())||0)+1});
  if(!Number.isSafeInteger(first)||first<1)continue;
  b.push([first,first+size-1]);s.blocks.set(name,b);ops.push(['b\u0000'+name,b]);
 }
 if(ops.length)storageWrite([],ops);
}
/* Номер, который дал этот компьютер новой строке документа. */
function cloudNumber(c){
 const f=CLOUD_NUMBER[c.tbl];if(!f||typeof c.data!=='string')return null;
 let r;try{r=JSON.parse(c.data);}catch(e){return null;}
 const [name,field,prefix,pad]=f(r),v=String(r&&r[field]||'');
 return v.startsWith(prefix)&&/^\d{1,15}$/.test(v.slice(prefix.length))?{name,value:v,prefix,pad}:null;
}
/* Номер занят — в командах очереди старый меняется на новый, как на
   сервере (erp_apply): только значение поля номера или ссылки на документ
   и строка списка (рейс — список PS). PO клиента, Mark, Notes с тем же
   текстом не меняются (аудит 25.10.2026, A-4). */
const CLOUD_NUMBER_KEYS='businessNumber|number|no|order|orderNumber|ps|doc|before|after';
function cloudNumberRe(tbl,a){return new RegExp('("(?:'+CLOUD_NUMBER_KEYS+(tbl==='orderEvent'?'|note':'')+')"\\s*:\\s*|[\\[,]\\s*)"'+a+'"(?=\\s*[,\\]}])','g');}
function cloudRenumber(changes,moved){
 let hit=false;
 changes.forEach(c=>{if(typeof c.data!=='string')return;let t=c.data;
  moved.forEach(([a],i)=>{t=t.replace(cloudNumberRe(c.tbl,a),'$1"\u0001'+i+'\u0001"');});
  moved.forEach(([,b],i)=>{t=t.split('"\u0001'+i+'\u0001"').join('"'+b+'"');});
  if(t!==c.data){c.data=t;hit=true;}});
 return hit;
}
function cloudText(d){return typeof d==='string'?d:JSON.stringify(d);}
function cloudChunks(rows){
 const out=[];let part=[],bytes=0;
 rows.forEach(c=>{const b=c.data?c.data.length:0;if(part.length&&(part.length>=CLOUD_CHUNK||bytes+b>CLOUD_CHUNK_BYTES)){out.push(part);part=[];bytes=0;}part.push(c);bytes+=b;});
 if(part.length)out.push(part);return out;
}
function cloudId(){try{if(globalThis.crypto&&typeof crypto.randomUUID==='function')return crypto.randomUUID();}catch(e){}return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);}
function cloudDevice(){const c=cloudConfig();if(!c.device){c.device=cloudId();cloudConfigSave(c);}return c.device;}
async function cloudLoad(){
 const got=await storageIdbCloudAll(),s=cloudSync;
 s.vers=new Map();s.out=[];s.ref='';s.since=0;s.n=0;
 got.keys.forEach((k,i)=>{
  const v=got.values[i];
  if(k==='ref')s.ref=v;else if(k==='since')s.since=+v||0;else if(k==='n')s.n=+v||0;
  else if(k.startsWith('v\u0000'))s.vers.set(k.slice(2),v);
  else if(k.startsWith('o\u0000'))s.out.push(Object.assign({key:k},v));
  else if(k.startsWith('b\u0000'))s.blocks.set(k.slice(2),v);
  else if(k.startsWith('r\u0000'))s.refresh.add(k.slice(2));
 });
 s.on=!!s.ref&&s.ref===cloudConfig().url;s.loaded=true;
 /* Правки, сделанные до чтения склада, — в очередь теперь. */
 const early=s.early;s.early=[];
 if(s.on&&early.length){const out=cloudOutbox([].concat(...early));if(out){storageWrite([],out.ops);out.done();}}
}
/* Набор изменений записи → команды очереди (ops — в ту же транзакцию, done —
   после того, как запись принята). Версия известна — сервер сверит её; новой
   строки — её не должно быть на сервере (ver 0). Строка уже есть в очереди —
   chain: версию даст ответ на ту команду (иначе вторая правка подряд без
   сети спорила бы с первой). */
function cloudOutbox(changes){
 const s=cloudSync;
 const rows=changes.filter(c=>!c.coldClear&&c.tbl&&!(c.tbl==='_meta'&&/Seq$/.test(c.id)));
 const ops=[...s.blockDirty].map(name=>['b\u0000'+name,s.blocks.get(name)]);s.blockDirty.clear();
 if(!rows.length||!s.loaded||!s.on||s.uploading){
  if(!s.loaded&&rows.length&&cloudConfig().session)s.early.push(rows);
  if(s.uploading)rows.forEach(c=>s.dirty.add(cloudKey(c.tbl,c.id)));
  return ops.length?{ops,done(){}}:null;
 }
 const cmds=[],queued=new Set();let n=s.n;
 s.out.forEach(cmd=>cmd.changes.forEach(c=>queued.add(cloudKey(c.tbl,c.id))));
 cloudChunks(rows).forEach(part=>{
  const expect=[],fresh=new Set();
  part.forEach(c=>{const k=cloudKey(c.tbl,c.id),v=s.vers.get(k);
   if(queued.has(k))expect.push({tbl:c.tbl,id:c.id,chain:true});else if(v)expect.push({tbl:c.tbl,id:c.id,ver:v});else if(!c.del){expect.push({tbl:c.tbl,id:c.id,ver:0});fresh.add(c);}
   queued.add(k);});
  const cmd={id:cloudId(),expect,changes:part.map(cloudChange)};
  cmd.changes.forEach((x,i)=>{const num=fresh.has(part[i])&&!x.cold&&cloudNumber(part[i]);if(num)x.number=num;});
  const key='o\u0000'+String(++n).padStart(12,'0');
  cmds.push(Object.assign({key},cmd));ops.push([key,cmd]);
 });
 ops.push(['n',n]);
 return {ops,done(){s.n=n;s.out.push(...cmds);cloudSoon();}};
}
/* Строка набора изменений → строка команды erp_apply. */
function cloudChange(c){
 const x={tbl:c.tbl,id:c.id,seq:c.seq||0,data:c.del?null:c.data};
 if(c.cold&&!c.del)Object.assign(x,{cold:true,month:c.month||'',owners:c.owners||[]});
 return x;
}
/* Архив живёт на сервере: записи заказов owners — по запросу, пачками. */
async function cloudColdOf(owners){
 const out=[];
 for(let i=0;i<owners.length;i+=CLOUD_CHUNK){
  const got=await cloudRpc('erp_cold_of',{owners:owners.slice(i,i+CLOUD_CHUNK)});
  (Array.isArray(got)?got:[]).forEach(x=>out.push({tbl:x.tbl,id:x.id,seq:+x.seq||0,data:cloudText(x.data),owners:x.owners||[],month:x.month||''}));
 }
 return out;
}
/* Серверные строки → база этого компьютера (как запись другой вкладки:
   storageApplySaved). asked — ключи, о которых спрашивали: нет в ответе —
   строки нет на сервере, у нас её тоже не будет. */
function cloudApplyServer(rows,asked,ops){
 const s=cloudSync,list=[],seen=new Set();
 rows.forEach(r=>{
  const k=cloudKey(r.tbl,r.id);seen.add(k);
  if(r.deleted){
   const b=storageBase.get(r.tbl);
   if(s.vers.has(k)){s.vers.delete(k);ops.push(['v\u0000'+k,null]);}
   if(asked||r.tbl==='_archive'||b&&b.has(r.id))list.push({tbl:r.tbl,id:r.id,del:true});
   return;
  }
  /* Своя же запись вернулась опросом — версия та же (перенумерованная
     сервером — нет: у нас ещё старый номер). */
  if(s.refresh.has(k)){s.refresh.delete(k);ops.push(['r\u0000'+k,null]);}
  else if(!asked&&s.vers.get(k)===r.ver)return;
  /* Строка ушла в архив: у нас её больше нет, данные — на сервере. */
  if(r.cold&&r.data==null){
   s.vers.set(k,r.ver);ops.push(['v\u0000'+k,r.ver]);
   const b=storageBase.get(r.tbl);if(b&&b.has(r.id))list.push({tbl:r.tbl,id:r.id,del:true});
   return;
  }
  if(r.data==null)return;
  s.vers.set(k,r.ver);ops.push(['v\u0000'+k,r.ver]);
  /* Горячая строка — и из cold (возврат). */
  list.push({tbl:r.tbl,id:r.id,seq:+r.seq||0,data:cloudText(r.data),warm:r.tbl!=='_archive'});
 });
 if(asked)asked.forEach(a=>{const k=cloudKey(a.tbl,a.id);if(seen.has(k))return;if(s.vers.has(k)){s.vers.delete(k);ops.push(['v\u0000'+k,null]);}list.push({tbl:a.tbl,id:a.id,del:true});});
 cloudWriteLocal(list,ops);
 return list.length;
}
function cloudWriteLocal(list,ops){
 if(!list.length){if(ops.length)storageWrite([],ops);return;}
 const shapes=typeof soDraft!=='undefined'&&soDraft&&Array.isArray(DB.shapeDef)?{shapeDef:DB.shapeDef.slice()}:null;
 storageApplyRecords(list.filter(c=>c.tbl!=='_archive').map(c=>c.cold?{tbl:c.tbl,id:c.id,del:true}:c));
 const index=list.filter(c=>c.tbl==='_archive');
 if(index.length&&typeof archiveIndexApply==='function')archiveIndexApply(index.map(c=>[c.id,c.del?null:JSON.parse(c.data)]));
 if(shapes&&typeof salesDraftKeepShapes==='function')salesDraftKeepShapes(shapes,DB);
 storageWrite(list,ops);storageInvalidate();storageRerenderQuiet();
}
async function cloudPushAll(){
 const s=cloudSync;
 while(s.out.length){
  const cmd=s.out[0],ops=[[cmd.key,null]];
  /* Строка, чья прошлая команда не прошла, не уходит и следующей. */
  const lost=cmd.expect.some(e=>e.chain&&s.lost.has(cloudKey(e.tbl,e.id)));
  const expect=cmd.expect.map(e=>e.chain?{tbl:e.tbl,id:e.id,ver:s.vers.get(cloudKey(e.tbl,e.id))||0}:e);
  const r=lost?{ok:false,conflict:[]}:await cloudRpc('erp_apply',{command_id:cmd.id,build:storageBuildId(),device:cloudDevice(),expect,changes:cmd.changes});
  if(s.out[0]!==cmd)return;
  if(r&&r.ok){
   cmd.changes.forEach(c=>{const k=cloudKey(c.tbl,c.id),v=r.vers&&r.vers[c.tbl+'|'+c.id];
    if(c.data===null||!v){s.vers.delete(k);ops.push(['v\u0000'+k,null]);}else{s.vers.set(k,v);ops.push(['v\u0000'+k,v]);}});
   s.out.shift();
   /* Номер занят: сервер дал следующий. Строки команды — серверной копией
      с опросом; в очереди и в открытом заказе старый номер меняется. */
   const moved=cmd.changes.map(c=>c.number&&[c.number.value,r.numbers&&r.numbers[c.tbl+'|'+c.id]]).filter(m=>m&&m[1]&&m[1]!==m[0]);
   if(moved.length){
    s.out.forEach(o=>{if(cloudRenumber(o.changes,moved)){o.renum=true;ops.push([o.key,{id:o.id,expect:o.expect,changes:o.changes,renum:true}]);}});
    if(typeof soDraft!=='undefined'&&soDraft)moved.forEach(([a,b])=>{if(soDraft.businessNumber===a)soDraft.businessNumber=b;});
   }
   if(moved.length||cmd.renum)cmd.changes.forEach(c=>{if(c.data===null)return;const k=cloudKey(c.tbl,c.id);s.refresh.add(k);ops.push(['r\u0000'+k,1]);});
   if(!s.out.length)s.lost.clear();cloudWriteLocal([],ops);continue;
  }
  /* Отказ: строки команды — как на сервере сейчас. */
  const keys=cmd.changes.map(c=>({tbl:c.tbl,id:c.id}));
  const now=await cloudRpc('erp_get',{keys});
  if(s.out[0]!==cmd)return;
  s.out.shift();keys.forEach(k=>s.lost.add(cloudKey(k.tbl,k.id)));cloudApplyServer(Array.isArray(now)?now:[],keys,ops);
  const names=[...new Set((r&&r.conflict||[]).map(x=>x.id))].slice(0,3).join(', ');
  if(!s.out.length)s.lost.clear();
  s.warn=r&&r.denied?'No access on server: '+r.denied.join(', ')+'. Server copy shown.':'Changed on another computer: '+(names||'rows')+'. Server copy shown.';
 }
}
async function cloudPull(){
 const s=cloudSync;
 for(;;){
  const from=s.since,r=await cloudRpc('erp_changes',{since:from,lim:2000});
  if(s.since!==from)return;
  const last=+r.last||from;
  s.since=last;cloudApplyServer(Array.isArray(r.rows)?r.rows:[],null,[['since',last]]);
  if(last===from)return;
 }
}
/* GF_CLOUD_MANUAL — тесты сами зовут cloudSyncTick: порядок двух компьютеров
   задаёт проверка, а не таймер. */
function cloudSoon(){const s=cloudSync;if(window.GF_CLOUD_MANUAL)return;if(s.timer)clearTimeout(s.timer);s.timer=setTimeout(cloudSyncTick,300);}
function cloudSyncStart(){if(!cloudSync.timer&&!window.GF_CLOUD_MANUAL)cloudSync.timer=setTimeout(cloudSyncTick,0);}
async function cloudSyncTick(){
 const s=cloudSync;s.timer=null;
 if(s.running)return;
 const was=cloudSyncText();
 if(!storageWriter||storageStale||storageRecovery){s.loaded=false;s.early=[];}
 else if(cloudConfig().session&&!storageFailed&&!s.busy){
  s.running=true;
  try{
   if(!s.loaded)await cloudLoad();
   if(s.on&&storageWriter){await cloudPushAll();await cloudPull();await cloudBlocksFill();s.offline=false;s.error='';s.wait=CLOUD_POLL_MS;s.at=new Date().toISOString();}
  }catch(e){
   if(/No connection/.test(e.message))s.offline=true;else s.error=e.message;
   s.wait=Math.min(60000,s.wait*2);
  }finally{s.running=false;}
 }
 if(cloudSyncText()!==was)afterRender();
 if(!s.timer&&!window.GF_CLOUD_MANUAL)s.timer=setTimeout(cloudSyncTick,s.wait);
}
/* Статус — в Users → Cloud и внизу экрана. */
function cloudSyncText(){
 const s=cloudSync,n=s.out.length;
 if(s.busy)return s.busy;
 if(!s.on)return '';
 if(!cloudConfig().session)return 'Sign in to sync'+(n?' · '+n+' waiting':'');
 if(s.offline)return 'Offline · '+n+' waiting';
 if(s.error)return s.error;
 return n?n+' waiting':'Synced';
}
/* Связать базы. Upload — эта база становится серверной (сервер пуст).
   Download — эта база заменяется серверной. Stop — компьютер больше не
   синхронизирует, его база остаётся как есть. */
async function cloudSaveAll(ref,since,vers){
 await storageFlush();
 await storageIdbTx(['cloud'],'readwrite',tx=>{
  const st=tx.objectStore('cloud');st.clear();
  if(ref){st.put(ref,'ref');st.put(since,'since');st.put(0,'n');vers.forEach((v,k)=>st.put(v,'v\u0000'+k));}
 });
 Object.assign(cloudSync,{loaded:true,on:!!ref,ref:ref||'',since:since||0,n:0,vers:ref?vers:new Map(),out:[],early:[],blocks:new Map(),blockDirty:new Set(),refresh:new Set()});
}
async function cloudRun(label,fn){
 const s=cloudSync;
 if(!storageWriter){alert('Editing is open in another tab.');return false;}
 if(s.busy||s.running){alert('Sync is busy. Try again in a moment.');return false;}
 s.busy=label;s.warn='';s.error='';render();
 try{return await fn();}
 catch(e){s.error=e.message;return false;}
 finally{s.busy='';render();}
}
/* Строки базы, как они лежат в ней. storageHotRecords добавляет пустой
   таблице строку «*» — в базе её нет, и следующая строка этой таблицы
   легла бы на сервер рядом с ней («Table shapeDef is stored twice» при
   Download, 23.10.2026). */
function cloudRecords(){
 return storageHotRecords().filter(r=>r.tbl!=='_archive'&&!(r.id==='*'&&r.data==='[]'&&!(storageBase.get(r.tbl)||new Map()).has('*')));
}
function cloudUpload(){
 return cloudRun('Uploading…',async()=>{
  const me=await cloudRpc('erp_whoami');
  if(!me||!me.admin)throw new Error('Only a server admin can upload.');
  const first=await cloudRpc('erp_changes',{since:0,lim:1});
  if(first&&(+first.last>0))throw new Error('The server already has data. Use Download.');
  if(!confirm('Send this database to the server?\n\nOther computers will download it from there.'))return false;
  await storageFlush();
  const s=cloudSync,vers=new Map(),url=cloudConfig().url;
  const recs=cloudRecords().concat((await storageIdbColdAll()).map(r=>({tbl:r.tbl,id:r.id,seq:r.seq,data:r.data,cold:true,month:r.month,owners:r.owners})),
   (await storageIdbArchiveAll()).map(a=>({tbl:'_archive',id:a.id,seq:0,data:JSON.stringify(a.row)})));
  s.uploading=true;s.dirty=new Set();
  let last=0;
  try{
   let sent=0;
   for(const part of cloudChunks(recs)){
    sent+=part.length;s.busy='Uploading '+sent+' / '+recs.length;afterRender();
    const r=await cloudRpc('erp_apply',{command_id:'up-'+cloudId(),build:storageBuildId(),device:cloudDevice(),expect:[],
     changes:part.map(cloudChange)});
    if(!r||!r.ok)throw new Error(r&&r.denied?'No access on server: '+r.denied.join(', '):'Upload refused by the server.');
    part.forEach(c=>{const v=r.vers&&r.vers[c.tbl+'|'+c.id];if(v)vers.set(cloudKey(c.tbl,c.id),v);});
    last=+r.rev||last;
   }
   await cloudSaveAll(url,last,vers);
  }finally{s.uploading=false;}
  /* Правки во время отправки — следом обычной командой. */
  const dirty=s.dirty;s.dirty=null;
  if(dirty&&dirty.size){const again=cloudRecords().filter(r=>dirty.has(cloudKey(r.tbl,r.id)));
   const gone=[...dirty].filter(k=>!again.some(r=>cloudKey(r.tbl,r.id)===k)).map(k=>{const i=k.indexOf('\u0000');return {tbl:k.slice(0,i),id:k.slice(i+1),del:true};});
   const out=cloudOutbox(again.concat(gone));if(out){storageWrite([],out.ops);out.done();}}
  cloudSoon();return true;
 });
}
/* Номера журнала денег, совпавшие у двух компьютеров до блоков: у всех
   компьютеров одинаково — по времени и id, следующие свободные. */
function cloudJournalUnique(state){
 const list=Array.isArray(state.financeEvent)?state.financeEvent:[],used=new Set();let top=list.reduce((n,e)=>Math.max(n,e&&e.seq||0),0);
 list.slice().sort((a,b)=>String(a.at).localeCompare(String(b.at))||String(a.id).localeCompare(String(b.id))).forEach(e=>{if(used.has(e.seq))e.seq=++top;used.add(e.seq);});
}
function cloudDownload(){
 return cloudRun('Downloading…',async()=>{
  const s=cloudSync,url=cloudConfig().url;
  if(s.out.length&&!confirm(s.out.length+' changes here are not on the server yet and will be lost. Download anyway?'))return false;
  const got=new Map();let since=0;
  for(;;){
   const r=await cloudRpc('erp_changes',{since,lim:1000});
   (r.rows||[]).forEach(x=>got.set(cloudKey(x.tbl,x.id),x));
   const last=+r.last||since;if(last===since)break;since=last;
   s.busy='Downloading '+got.size;afterRender();
  }
  const all=[...got.values()].filter(x=>!x.deleted),vers=new Map(all.map(x=>[cloudKey(x.tbl,x.id),x.ver]));
  const rows=all.filter(x=>!x.cold&&x.tbl!=='_archive'),archive=all.filter(x=>x.tbl==='_archive').map(x=>({id:x.id,row:JSON.parse(cloudText(x.data))}));
  if(!rows.length)throw new Error('The server is empty. Upload a database first.');
  /* Пустая таблица целиком («*») рядом со строками — осталась от Upload до
     v5.257: строки главнее. Пустые таблицы — как в новой базе. */
  const byRows=new Set(rows.filter(x=>x.id!=='*').map(x=>x.tbl));
  const state=storageJoin(rows.filter(x=>!(x.id==='*'&&byRows.has(x.tbl))).map(x=>({tbl:x.tbl,id:x.id,seq:+x.seq||0,data:cloudText(x.data)})));
  Object.keys(DEFAULT).forEach(k=>{if(Array.isArray(DEFAULT[k])&&!Object.prototype.hasOwnProperty.call(state,k))state[k]=[];});
  cloudJournalUnique(state);
  /* Связь снимается перед самой заменой (замена сама на сервер не уходит),
     а не раньше: Cancel на «Replace this browser database?» оставляет связь,
     версии и очередь этого ПК как были (аудит 25.10.2026, A-1). */
  const ok=await storageImportState(state,{test:storageTest,cold:[],archive,cloud:true,before:()=>cloudSaveAll('',0,null)});
  if(!ok)return false;
  await cloudSaveAll(url,since,vers);cloudSoon();return true;
 });
}
async function cloudSyncStop(){
 const n=cloudSync.out.length;
 if(!confirm(n?n+' changes are not on the server yet. Stop syncing anyway?':'Stop syncing this computer?'))return false;
 return cloudRun('Stopping…',async()=>{await cloudSaveAll('',0,null);cloudSync.warn='';return true;});
}
