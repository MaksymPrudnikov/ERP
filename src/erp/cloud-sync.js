/* ============================================================================
   Синхронизация с сервером — этап 4 задания «База» (docs/ЗАДАЧА_БАЗА.md)
   IN : набор изменений каждой записи (touch → cloudOutbox), сервер
        erp_apply / erp_changes / erp_get (tools/supabase/schema.sql)
   OUT: cloudSync, cloudOutbox, cloudSyncStart, cloudUpload, cloudDownload,
        cloudSyncStop, cloudSyncText
   Каждый компьютер работает со своей базой браузера, как раньше; сервер —
   общая копия. Свои изменения уходят командами (очередь лежит в складе
   cloud той же транзакцией, что и строки: без сети и после F5 не теряется),
   чужие приходят опросом erp_changes. Конфликт по версии строки или нет
   раздела — команда не пишется целиком, строки этого компьютера
   возвращаются к серверной копии и об этом говорится. Синхронизирует только
   вкладка, которая пишет. Архив (cold) пока не уходит на сервер. Строка
   едет текстом JSON как есть: jsonb переставил бы ключи, и после F5 база
   сочла бы чужую строку изменённой и отправила её обратно.
   Склад cloud: ref — адрес сервера, с которым связана эта база; since —
   курсор erp_changes; n — счётчик очереди; v␀tbl␀id — версия строки;
   o␀000000000001 — команда в очереди.
   ============================================================================ */
/* Команда — до 500 строк и около 1 МБ: заказ с чертежами весит десятки КБ. */
const CLOUD_CHUNK=500,CLOUD_CHUNK_BYTES=1e6,CLOUD_POLL_MS=5000;
let cloudSync={loaded:false,on:false,ref:'',since:0,n:0,vers:new Map(),out:[],early:[],lost:new Set(),
 uploading:false,dirty:null,running:false,timer:null,wait:CLOUD_POLL_MS,busy:'',error:'',warn:'',offline:false,at:''};
function cloudKey(tbl,id){return tbl+'\u0000'+id;}
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
 const rows=changes.filter(c=>c.tbl!=='_archive'&&!c.coldClear&&!c.cold&&c.tbl);
 if(!rows.length)return null;
 if(!s.loaded){if(cloudConfig().session)s.early.push(rows);return null;}
 if(!s.on)return null;
 if(s.uploading){rows.forEach(c=>s.dirty.add(cloudKey(c.tbl,c.id)));return null;}
 const cmds=[],ops=[],queued=new Set();let n=s.n;
 s.out.forEach(cmd=>cmd.changes.forEach(c=>queued.add(cloudKey(c.tbl,c.id))));
 cloudChunks(rows).forEach(part=>{
  const expect=[];
  part.forEach(c=>{const k=cloudKey(c.tbl,c.id),v=s.vers.get(k);
   if(queued.has(k))expect.push({tbl:c.tbl,id:c.id,chain:true});else if(v)expect.push({tbl:c.tbl,id:c.id,ver:v});else if(!c.del)expect.push({tbl:c.tbl,id:c.id,ver:0});
   queued.add(k);});
  const cmd={id:cloudId(),expect,changes:part.map(c=>({tbl:c.tbl,id:c.id,seq:c.seq||0,data:c.del?null:c.data}))};
  const key='o\u0000'+String(++n).padStart(12,'0');
  cmds.push(Object.assign({key},cmd));ops.push([key,cmd]);
 });
 ops.push(['n',n]);
 return {ops,done(){s.n=n;s.out.push(...cmds);cloudSoon();}};
}
/* Серверные строки → база этого компьютера (как запись другой вкладки:
   storageApplySaved). asked — ключи, о которых спрашивали: нет в ответе —
   строки нет на сервере, у нас её тоже не будет. */
function cloudApplyServer(rows,asked,ops){
 const s=cloudSync,list=[],seen=new Set();
 rows.forEach(r=>{
  const k=cloudKey(r.tbl,r.id);seen.add(k);
  if(r.cold)return;
  if(r.deleted){
   const b=storageBase.get(r.tbl);
   if(s.vers.has(k)){s.vers.delete(k);ops.push(['v\u0000'+k,null]);}
   if(asked||b&&b.has(r.id))list.push({tbl:r.tbl,id:r.id,del:true});
   return;
  }
  /* Своя же запись вернулась опросом — версия та же. */
  if(!asked&&s.vers.get(k)===r.ver)return;
  s.vers.set(k,r.ver);ops.push(['v\u0000'+k,r.ver]);
  list.push({tbl:r.tbl,id:r.id,seq:+r.seq||0,data:cloudText(r.data)});
 });
 if(asked)asked.forEach(a=>{const k=cloudKey(a.tbl,a.id);if(seen.has(k))return;if(s.vers.has(k)){s.vers.delete(k);ops.push(['v\u0000'+k,null]);}list.push({tbl:a.tbl,id:a.id,del:true});});
 cloudWriteLocal(list,ops);
 return list.length;
}
function cloudWriteLocal(list,ops){
 if(!list.length){if(ops.length)storageWrite([],ops);return;}
 const shapes=typeof soDraft!=='undefined'&&soDraft&&Array.isArray(DB.shapeDef)?{shapeDef:DB.shapeDef.slice()}:null;
 storageApplyRecords(list);
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
   s.out.shift();if(!s.out.length)s.lost.clear();cloudWriteLocal([],ops);continue;
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
   if(s.on&&storageWriter){await cloudPushAll();await cloudPull();s.offline=false;s.error='';s.wait=CLOUD_POLL_MS;s.at=new Date().toISOString();}
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
 Object.assign(cloudSync,{loaded:true,on:!!ref,ref:ref||'',since:since||0,n:0,vers:ref?vers:new Map(),out:[],early:[]});
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
function cloudUpload(){
 return cloudRun('Uploading…',async()=>{
  const me=await cloudRpc('erp_whoami');
  if(!me||!me.admin)throw new Error('Only a server admin can upload.');
  const first=await cloudRpc('erp_changes',{since:0,lim:1});
  if(first&&(+first.last>0))throw new Error('The server already has data. Use Download.');
  if(!confirm('Send this database to the server?\n\nOther computers will download it from there.'))return false;
  await storageFlush();
  const s=cloudSync,recs=storageHotRecords().filter(r=>r.tbl!=='_archive'),vers=new Map(),url=cloudConfig().url;
  s.uploading=true;s.dirty=new Set();
  let last=0;
  try{
   let sent=0;
   for(const part of cloudChunks(recs)){
    sent+=part.length;s.busy='Uploading '+sent+' / '+recs.length;afterRender();
    const r=await cloudRpc('erp_apply',{command_id:'up-'+cloudId(),build:storageBuildId(),device:cloudDevice(),expect:[],
     changes:part.map(c=>({tbl:c.tbl,id:c.id,seq:c.seq||0,data:c.data}))});
    if(!r||!r.ok)throw new Error(r&&r.denied?'No access on server: '+r.denied.join(', '):'Upload refused by the server.');
    part.forEach(c=>{const v=r.vers&&r.vers[c.tbl+'|'+c.id];if(v)vers.set(cloudKey(c.tbl,c.id),v);});
    last=+r.rev||last;
   }
   await cloudSaveAll(url,last,vers);
  }finally{s.uploading=false;}
  /* Правки во время отправки — следом обычной командой. */
  const dirty=s.dirty;s.dirty=null;
  if(dirty&&dirty.size){const again=storageHotRecords().filter(r=>dirty.has(cloudKey(r.tbl,r.id)));
   const gone=[...dirty].filter(k=>!again.some(r=>cloudKey(r.tbl,r.id)===k)).map(k=>{const i=k.indexOf('\u0000');return {tbl:k.slice(0,i),id:k.slice(i+1),del:true};});
   const out=cloudOutbox(again.concat(gone));if(out){storageWrite([],out.ops);out.done();}}
  cloudSoon();return true;
 });
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
  const rows=[...got.values()].filter(x=>!x.deleted&&!x.cold),vers=new Map(rows.map(x=>[cloudKey(x.tbl,x.id),x.ver]));
  if(!rows.length)throw new Error('The server is empty. Upload a database first.');
  const state=storageJoin(rows.map(x=>({tbl:x.tbl,id:x.id,seq:+x.seq||0,data:cloudText(x.data)})));
  /* Связь снимается до замены: замена сама на сервер не уходит. */
  await cloudSaveAll('',0,null);
  const ok=await storageImportState(state,{test:storageTest});
  if(!ok)return false;
  await cloudSaveAll(url,since,vers);cloudSoon();return true;
 });
}
async function cloudSyncStop(){
 const n=cloudSync.out.length;
 if(!confirm(n?n+' changes are not on the server yet. Stop syncing anyway?':'Stop syncing this computer?'))return false;
 return cloudRun('Stopping…',async()=>{await cloudSaveAll('',0,null);cloudSync.warn='';return true;});
}
