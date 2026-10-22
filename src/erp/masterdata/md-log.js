/* =====================================================================
   erp/masterdata/md-log  ·  md-log-1.0
   Журнал Master Data «было → стало» и перенос только Master Data (план
   Master Data как конструктора, этап 1; владелец, 22.10.2026: «журнал
   нужен» — кто, когда, что было и что стало по каждой правке карточек,
   цен и норм).
   IN : набор изменений базы (storageDiff) перед записью — touch в
        erp/storage; кто — orderLogActor (erp/sales/order-log)
   OUT: DB.masterDataEvent {id, at, by, byId, tbl, rowId, row, what, field,
        was, now}; mdLogRows — строки вкладки Change log;
        mdExportData / mdImportPlan / mdImportApply — Export / Import только
        Master Data

   Как журнал заказа, правки не размечаются по коду: журнал сравнивает строку
   с тем, что лежит в базе, поэтому ловит правку из любого экрана (Data, окно
   веса в заказе, импорт CSV). Таблица, которой в базе ещё нет, — это засев,
   не правка. Общий Import JSON заменяет базу целиком и в журнал не идёт.
   ===================================================================== */
DEFAULT.masterDataEvent=[];
if(!Array.isArray(DB.masterDataEvent))DB.masterDataEvent=[];
/* Что считается Master Data: таблицы строк и настройки одним объектом. */
const MD_LOG_TABLES={
 glassProduct:'Glass',glassSheet:'Supply points',stockItem:'Stock items',heatTreatment:'Heat treatment',
 spacerVariant:'Spacers',gasProduct:'Gas',sealantProduct:'Sealants',interlayerProduct:'Interlayers',
 fritProduct:'Frit',spandrelProduct:'Spandrel',spandrelColour:'Spandrel colours',serviceRate:'Works',
 hardwareKind:'Hardware kinds',hardwareModel:'Hardware models',materialWeightRates:'Weight norms',
 edgeAllowance:'Cutting allowance',station:'Stations',ncrReason:'NCR reasons',carrier:'Dollies & Skids',truck:'Trucks'
};
const MD_LOG_SETTINGS={cutting:'Cutting',company:'Company',stickerTemplate:'Stickers',salesMetricRules:'Pricing rules'};
const MD_LOG_TEXT=120;

function normalizeMdLog(){
 if(!Array.isArray(DB.masterDataEvent))DB.masterDataEvent=[];
 const s=v=>typeof v==='string'?v:'';
 DB.masterDataEvent=DB.masterDataEvent.filter(e=>e&&typeof e==='object'&&typeof e.tbl==='string'&&typeof e.at==='string'&&typeof e.what==='string')
  .map(e=>({id:s(e.id)||salesUid('MDE'),at:e.at,by:s(e.by),byId:s(e.byId),tbl:e.tbl,rowId:s(e.rowId),row:s(e.row),what:e.what,field:s(e.field),was:s(e.was),now:s(e.now)}));
}
function mdLogValue(v){
 if(v===undefined||v===null||v==='')return '';
 const t=typeof v==='object'?JSON.stringify(v):String(v);
 return t.length>MD_LOG_TEXT?t.slice(0,MD_LOG_TEXT-1)+'…':t;
}
function mdLogRowName(row,id){return mdLogValue(row&&(row.name||row.label||row.code||row.key))||id;}
/* Поля строки «было → стало»: только те, что поменялись. */
function mdLogFields(a,b){
 const out=[],keys=new Set(Object.keys(a||{}).concat(Object.keys(b||{})));
 /* Пусто, null и нет поля — одно и то же «пусто»: нормализатор, дописавший
    пустую заметку, — не правка. */
 const same=v=>v===undefined||v===null||v===''?null:v;
 keys.forEach(k=>{const x=a?a[k]:undefined,y=b?b[k]:undefined;if(JSON.stringify(same(x))!==JSON.stringify(same(y)))out.push([k,mdLogValue(x),mdLogValue(y)]);});
 return out;
}
function mdLogPairs(c){
 /* Таблица без ключей строк хранится одной записью «*»: сравниваем по строкам. */
 const base=storageBase.get(c.tbl),parse=t=>{try{return JSON.parse(t);}catch(e){return null;}};
 if(c.id==='*'){
  const was=new Map((parse(base&&base.get('*')&&base.get('*').t)||[]).map((r,i)=>[storageRowKey(c.tbl,r)||'#'+(i+1),r]));
  const now=new Map((c.del?[]:parse(c.data)||[]).map((r,i)=>[storageRowKey(c.tbl,r)||'#'+(i+1),r]));
  const out=[];now.forEach((r,id)=>out.push([id,was.get(id),r]));was.forEach((r,id)=>{if(!now.has(id))out.push([id,r,undefined]);});return out;
 }
 const b=base&&base.get(c.id);
 if(b&&!c.del&&b.t===c.data)return [];
 return [[c.id,b?parse(b.t):undefined,c.del?undefined:parse(c.data)]];
}
/* touch(): события по набору изменений до записи. true — журнал пополнился,
   набор нужно собрать заново. */
function mdLogCapture(changes){
 if(typeof storageImporting!=='undefined'&&storageImporting)return false;
 if(typeof storageStarting!=='undefined'&&storageStarting)return false;
 const at=new Date().toISOString(),who=typeof orderLogActor==='function'?orderLogActor():{by:'',byId:''};
 const push=(tbl,rowId,row,what,field,was,now)=>DB.masterDataEvent.push(Object.assign({id:salesUid('MDE'),at,tbl,rowId:String(rowId),row,what,field:field||'',was:was||'',now:now||''},who));
 const meta=storageBase.get('_meta');let n=0;
 if(!Array.isArray(DB.masterDataEvent))DB.masterDataEvent=[];
 changes.forEach(c=>{
  if(c.tbl==='_meta'){
   if(!MD_LOG_SETTINGS[c.id]||!meta||!meta.has(c.id)||c.del)return;
   let a,b;try{a=JSON.parse(meta.get(c.id).t);b=JSON.parse(c.data);}catch(e){return;}
   mdLogFields(a,b).forEach(([k,x,y])=>{push(c.id,c.id,MD_LOG_SETTINGS[c.id],'Edited',k,x,y);n++;});
   return;
  }
  /* Таблицы, которой в базе ещё нет, — засев, а не правка. */
  if(!MD_LOG_TABLES[c.tbl]||!storageBase.has(c.tbl))return;
  mdLogPairs(c).forEach(([id,a,b])=>{
   if(!a&&b){push(c.tbl,id,mdLogRowName(b,id),'Created');n++;return;}
   if(a&&!b){push(c.tbl,id,mdLogRowName(a,id),'Deleted');n++;return;}
   if(a&&b)mdLogFields(a,b).forEach(([k,x,y])=>{push(c.tbl,id,mdLogRowName(b,id),'Edited',k,x,y);n++;});
  });
 });
 return n>0;
}
function mdLogWhere(tbl){return MD_LOG_TABLES[tbl]||MD_LOG_SETTINGS[tbl]||tbl;}
/* Строки вкладки Change log: новые сверху, фильтр по месту и поиск. */
function mdLogRows(where,q){
 q=String(q||'').trim().toLowerCase();
 return (DB.masterDataEvent||[]).filter(e=>(!where||e.tbl===where)&&(!q||[e.row,e.field,e.was,e.now,e.by,mdLogWhere(e.tbl)].some(x=>String(x).toLowerCase().includes(q)))).slice().reverse();
}

/* ---------------- Export / Import только Master Data ----------------
   Общий Import заменяет всю базу и архив; этот переносит только справочники:
   строка узнаётся по ключу, повтор файла не плодит дубли. В строке файла
   нет поля — значение остаётся; null — поле очищается; 0 — это ноль.
   Строки базы, которых нет в файле, остаются: удаляют в Data. */
const MD_FILE_KIND='glass-erp-master-data';
function mdExportData(){
 const tables={},settings={};
 Object.keys(MD_LOG_TABLES).forEach(k=>{if(Array.isArray(DB[k]))tables[k]=JSON.parse(JSON.stringify(DB[k]));});
 Object.keys(MD_LOG_SETTINGS).forEach(k=>{if(DB[k]&&typeof DB[k]==='object')settings[k]=JSON.parse(JSON.stringify(DB[k]));});
 return {kind:MD_FILE_KIND,version:1,exportedAt:new Date().toISOString(),tables,settings};
}
/* Что сделает файл: по таблицам — новые, изменённые, без изменений, отказы. */
function mdImportPlan(file){
 if(!file||typeof file!=='object'||file.kind!==MD_FILE_KIND)throw new Error('This is not a Master Data file.');
 const out={tables:[],settings:[],errors:[]};
 Object.keys(file.tables||{}).forEach(tbl=>{
  if(!MD_LOG_TABLES[tbl]){out.errors.push(tbl+': unknown table');return;}
  const rows=file.tables[tbl];if(!Array.isArray(rows)){out.errors.push(tbl+': not a list');return;}
  const have=new Map((DB[tbl]||[]).map(r=>[storageRowKey(tbl,r),r])),seen=new Set(),t={tbl,label:MD_LOG_TABLES[tbl],added:0,changed:0,same:0,rejected:0};
  rows.forEach((r,i)=>{
   const id=storageRowKey(tbl,r);
   if(!id||seen.has(id)){t.rejected++;out.errors.push(MD_LOG_TABLES[tbl]+' row '+(i+1)+': '+(id?'repeats '+id:'no key'));return;}
   seen.add(id);const was=have.get(id);
   if(!was)t.added++;else if(mdLogFields(was,Object.assign({},was,r)).length)t.changed++;else t.same++;
  });
  out.tables.push(t);
 });
 Object.keys(file.settings||{}).forEach(k=>{
  const v=file.settings[k];
  if(!MD_LOG_SETTINGS[k]||!v||typeof v!=='object'||Array.isArray(v)){out.errors.push(k+': unknown settings');return;}
  out.settings.push({key:k,label:MD_LOG_SETTINGS[k],changed:mdLogFields(DB[k]||{},Object.assign({},DB[k]||{},v)).length});
 });
 return out;
}
/* Пишет файл в базу одной командой: всё или ничего. */
function mdImportApply(file){
 const plan=mdImportPlan(file);
 return storageCommand(()=>{
  plan.tables.forEach(t=>{
   if(!Array.isArray(DB[t.tbl]))DB[t.tbl]=[];
   const list=DB[t.tbl],at=new Map(list.map((r,i)=>[storageRowKey(t.tbl,r),i])),seen=new Set();
   file.tables[t.tbl].forEach(r=>{
    const id=storageRowKey(t.tbl,r);if(!id||seen.has(id))return;seen.add(id);
    const i=at.get(id),copy=JSON.parse(JSON.stringify(r));
    if(i==null)list.push(copy);else Object.assign(list[i],copy);
   });
  });
  plan.settings.forEach(s=>{DB[s.key]=Object.assign({},DB[s.key]||{},JSON.parse(JSON.stringify(file.settings[s.key])));});
  normalizeDB();
  return true;
 });
}
