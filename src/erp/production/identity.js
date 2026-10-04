/* =====================================================================
   Production identity: immutable physical objects and permanent barcodes.
   Decimal counters cross JSON as strings; BigInt is used only in arithmetic.
   The built-in allocator covers ONE browser database. Web Locks do not make
   it a company-wide authority. Servers may supply disjoint reserved ranges.
   The separate issuance ledger is deliberately outside imported backups.
   ===================================================================== */
const PRODUCTION_IDENTITY_MAX='9223372036854775807';
const PRODUCTION_IDENTITY_LEDGER_KEY='glazing_system_v1-production-identity-ledger';
DEFAULT.productionIdentity={version:1,baseSeq:'0',lines:[],entities:[],requests:[],ranges:[],authority:'browser',reconciliationRequired:false};
let productionIdentityIndexes=null,productionIdentityReconciledState=null;
function productionIdentityDecimal(value,allowZero){
 const s=typeof value==='string'?value:typeof value==='number'&&Number.isSafeInteger(value)?String(value):'';
 if(!/^\d+$/.test(s))throw new Error('Production identity: expected a decimal counter string.');
 const n=s.replace(/^0+(?=\d)/,'');
 if(n.length>PRODUCTION_IDENTITY_MAX.length||n.length===PRODUCTION_IDENTITY_MAX.length&&n>PRODUCTION_IDENTITY_MAX||!allowZero&&n==='0')throw new Error('Production identity: counter is outside the 64-bit range.');
 return n;
}
function productionIdentityCounterCompare(a,b){a=productionIdentityDecimal(a,true);b=productionIdentityDecimal(b,true);return a.length===b.length?(a===b?0:a>b?1:-1):a.length>b.length?1:-1;}
function productionIdentityCounterMax(a,b){return productionIdentityCounterCompare(a,b)>=0?productionIdentityDecimal(a,true):productionIdentityDecimal(b,true);}
function productionIdentityCounterNext(value){const n=productionIdentityDecimal(value,true);if(n===PRODUCTION_IDENTITY_MAX)throw new Error('Production identity: numbering range exhausted.');return String(BigInt(n)+1n);}
function productionIdentityBarcodeParse(value){
 if(typeof value!=='string')return null;
 const s=value.trim().toUpperCase(),modern=/^([GU])-(\d{10,})-(\d+)$/.exec(s),old=/^([GU])-(\d{7,})$/.exec(s);
 try{
  if(modern){const base=productionIdentityDecimal(modern[2],false).padStart(10,'0'),instance=productionIdentityDecimal(modern[3],false);return {kind:modern[1],legacy:false,base,instance,code:modern[1]+'-'+base+'-'+instance};}
  if(old){productionIdentityDecimal(old[2],false);return {kind:old[1],legacy:true,base:null,instance:null,code:s};}
 }catch(e){}
 return null;
}
function productionIdentityBarcodeNormalize(value){const p=productionIdentityBarcodeParse(value);return p?p.code:'';}
function productionIdentityBarcodeValid(value,kind){const p=productionIdentityBarcodeParse(value);return !!p&&(!kind||p.kind===kind);}
function productionIdentityUUID(){
 if(typeof crypto==='undefined')throw new Error('Production identity: secure UUID generation is unavailable.');
 if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
 if(typeof crypto.getRandomValues!=='function')throw new Error('Production identity: secure UUID generation is unavailable.');
 const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const s=Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');
}
function productionIdentityLineKey(orderId,lineId){
 if(typeof orderId!=='string'||typeof lineId!=='string'||!orderId||!lineId||orderId.includes('|')||lineId.includes('|'))throw new Error('Production identity: order and line IDs are required.');
 return orderId+'|'+lineId;
}
function productionIdentityState(){
 if(!DB.productionIdentity||typeof DB.productionIdentity!=='object'||Array.isArray(DB.productionIdentity))DB.productionIdentity=JSON.parse(JSON.stringify(DEFAULT.productionIdentity));
 return DB.productionIdentity;
}
function productionIdentityReadyState(){
 const s=productionIdentityState();if(s!==productionIdentityReconciledState)return productionIdentityReconcile(DB);return s;
}
function productionIdentityIndex(){
 const s=productionIdentityReadyState(),c=productionIdentityIndexes;
 if(c&&c.state===s&&c.entityCount===s.entities.length&&c.lineCount===s.lines.length&&c.requestCount===s.requests.length)return c;
 const out={state:s,entityCount:s.entities.length,lineCount:s.lines.length,requestCount:s.requests.length,lines:new Map(),bases:new Map(),codes:new Map(),ids:new Map(),requests:new Map()};
 s.lines.forEach(l=>{out.lines.set(l.key,l);out.bases.set(l.base,l);});s.entities.forEach(e=>{out.ids.set(e.id,e);out.codes.set(e.code,e);(e.aliases||[]).forEach(a=>out.codes.set(a,e));});s.requests.forEach(r=>out.requests.set(r.id,r));productionIdentityIndexes=out;return out;
}
function productionIdentityFind(code){return productionIdentityIndex().codes.get(productionIdentityBarcodeNormalize(code))||null;}
function productionIdentityKind(kind){kind=String(kind||'').toUpperCase();if(kind!=='G'&&kind!=='U')throw new Error('Production identity: expected G or U.');return kind;}
function productionIdentityEnsureLine(orderId,lineId,options){
 const key=productionIdentityLineKey(orderId,lineId),s=productionIdentityReadyState(),idx=productionIdentityIndex();let line=idx.lines.get(key);
 if(line){if(options&&options.base&&line.base!==productionIdentityDecimal(options.base,false).padStart(10,'0'))throw new Error('Production identity: origin line already has a different base.');return line;}
 if(s.reconciliationRequired&&!(options&&options.base))throw new Error('Production identity: reconcile restored ranges with the authority before issuing numbers.');
 if(s.authority==='gateway'&&!(options&&options.base)){
  if(typeof productionIdentityRemote!=='function')throw new Error('Production identity: the production gateway is unavailable.');
  productionIdentityAcceptRemote(productionIdentityRemote('line',{requestId:'line:'+key,originLineKey:key}),orderId,lineId);
  line=productionIdentityIndex().lines.get(key);if(!line)throw new Error('Production identity: gateway returned no origin line.');return line;
 }
 let base;
 if(options&&options.base){base=productionIdentityDecimal(options.base,false).padStart(10,'0');s.ranges.filter(r=>r.kind==='BASE'&&productionIdentityCounterCompare(r.first,base)<=0&&productionIdentityCounterCompare(base,r.last)<=0).forEach(r=>{r.cursor=productionIdentityCounterMax(r.cursor,base);});}
 else if(s.authority!=='browser'){
  const r=s.ranges.find(r=>r.kind==='BASE'&&r.authority===s.authority&&productionIdentityCounterCompare(r.cursor,r.last)<0);
  if(!r)throw new Error('Production identity: no reserved line numbers remain.');r.cursor=productionIdentityCounterNext(r.cursor);base=r.cursor.padStart(10,'0');
 }else base=productionIdentityCounterNext(s.baseSeq).padStart(10,'0');
 if(idx.bases.has(base))throw new Error('Production identity: line base already belongs to another origin.');
 s.baseSeq=productionIdentityCounterMax(s.baseSeq,base);line={key,base,seqG:'0',seqU:'0'};s.lines.push(line);idx.lines.set(key,line);idx.bases.set(base,line);idx.lineCount=s.lines.length;return line;
}
function productionIdentityEntity(kind,code,orderId,lineId,options){
 const key=productionIdentityLineKey(orderId,lineId),o=options||{},parsed=productionIdentityBarcodeParse(code),old=o.replacesCode?productionIdentityFind(o.replacesCode):null;
 if(o.replacesCode&&(!old||old.kind!==kind))throw new Error('Production identity: replacement must refer to an existing object of the same kind.');
 const e={id:o.id||productionIdentityUUID(),kind,code,originLineKey:key,instance:parsed.instance,createdAt:typeof o.createdAt==='string'?o.createdAt:new Date().toISOString(),replacesId:old?old.id:'',orderId,lineId};
 if(o.slot!==undefined)e.slot=o.slot;if(typeof o.componentKey==='string')e.componentKey=o.componentKey;
 if(parsed.legacy)e.legacy=true;if(o.requestId)e.requestId=String(o.requestId);return e;
}
function productionIdentityAddEntity(e){
 const s=productionIdentityState(),idx=productionIdentityIndex();
 if(idx.codes.has(e.code)||idx.ids.has(e.id))throw new Error('Production identity: duplicate physical ID or barcode.');
 s.entities.push(e);idx.codes.set(e.code,e);idx.ids.set(e.id,e);idx.entityCount=s.entities.length;return e;
}
function productionIdentityAllocate(kind,orderId,lineId,options){
 kind=productionIdentityKind(kind);const o=options||{},key=productionIdentityLineKey(orderId,lineId),s=productionIdentityReadyState(),idx=productionIdentityIndex(),requestId=o.requestId?String(o.requestId):'';
 if(requestId&&idx.requests.has(requestId)){
  const r=idx.requests.get(requestId);if(r.kind!==kind||r.lineKey!==key)throw new Error('Production identity: request ID was already used for another allocation.');
  const e=idx.ids.get(r.entityId);if(!e)throw new Error('Production identity: allocation request has no registered object.');
  if(o.slot!==undefined&&e.slot!==o.slot||o.componentKey!==undefined&&e.componentKey!==o.componentKey||o.replacesCode&&(!productionIdentityFind(o.replacesCode)||productionIdentityFind(o.replacesCode).id!==e.replacesId))throw new Error('Production identity: request ID was already used with different allocation data.');return e;
 }
 if(s.reconciliationRequired)throw new Error('Production identity: reconcile restored ranges with the authority before issuing numbers.');
 const line=productionIdentityEnsureLine(orderId,lineId),field='seq'+kind;let instance;
 if(s.authority==='gateway'){
  if(typeof productionIdentityRemote!=='function')throw new Error('Production identity: the production gateway is unavailable.');
  const replacement=o.replacesCode?productionIdentityFind(o.replacesCode):null;
  if(o.replacesCode&&(!replacement||replacement.kind!==kind))throw new Error('Production identity: replacement must refer to an existing object of the same kind.');
  const remoteRequest=requestId||productionIdentityUUID(),body={requestId:remoteRequest,originLineKey:key,kind,count:1};
  if(o.componentKey!==undefined)body.componentKeys=[o.componentKey];if(o.slot!==undefined)body.slots=[o.slot];if(replacement)body.replacesIds=[replacement.id];
  const entities=productionIdentityAcceptRemote(productionIdentityRemote('issue',body),orderId,lineId,Object.assign({},o,{requestId:remoteRequest}));
  if(entities.length!==1||entities[0].kind!==kind)throw new Error('Production identity: gateway returned an invalid allocation.');return entities[0];
 }
 if(s.authority!=='browser'){
  const r=s.ranges.find(r=>r.kind===kind&&r.lineKey===key&&r.authority===s.authority&&productionIdentityCounterCompare(r.cursor,r.last)<0);
  if(!r)throw new Error('Production identity: no reserved '+kind+' numbers remain for this line.');instance=productionIdentityCounterNext(r.cursor);r.cursor=instance;
 }else instance=productionIdentityCounterNext(line[field]);
 line[field]=productionIdentityCounterMax(line[field],instance);
 const e=productionIdentityAddEntity(productionIdentityEntity(kind,kind+'-'+line.base+'-'+instance,orderId,lineId,o));
 if(requestId){const r={id:requestId,entityId:e.id,kind,lineKey:key};s.requests.push(r);idx.requests.set(requestId,r);idx.requestCount=s.requests.length;}
 return e;
}
function productionIdentityRegisterLegacy(kind,code,orderId,lineId,options){
 kind=productionIdentityKind(kind);const p=productionIdentityBarcodeParse(code),key=productionIdentityLineKey(orderId,lineId);
 if(!p||p.kind!==kind)throw new Error('Production identity: invalid legacy barcode.');
 const existing=productionIdentityFind(p.code);if(existing){if(existing.kind!==kind)throw new Error('Production identity: barcode kind conflict.');return existing;}
 const line=productionIdentityEnsureLine(orderId,lineId,p.legacy?undefined:{base:p.base});
 if(!p.legacy){if(line.base!==p.base)throw new Error('Production identity: barcode belongs to a different origin line.');line['seq'+kind]=productionIdentityCounterMax(line['seq'+kind],p.instance);}
 return productionIdentityAddEntity(productionIdentityEntity(kind,p.code,orderId,lineId,options));
}
/* Explicitly registered aliases keep historical stickers resolvable. An
   ambiguous legacy U must be handled by migration, never silently redirected. */
function productionIdentityAddAlias(code,entityId){
 const alias=productionIdentityBarcodeNormalize(code),idx=productionIdentityIndex(),e=idx.ids.get(entityId);
 if(!alias||!e)throw new Error('Production identity: alias requires a valid barcode and object.');
 const other=idx.codes.get(alias);if(other&&other.id!==e.id)throw new Error('Production identity: historical barcode is ambiguous.');
 if(alias!==e.code&&!(e.aliases||[]).includes(alias)){(e.aliases||(e.aliases=[])).push(alias);idx.codes.set(alias,e);}return e;
}
function productionIdentityAssign(code,orderId,lineId,options){
 const e=productionIdentityFind(code);if(!e)throw new Error('Production identity: object not found.');productionIdentityLineKey(orderId,lineId);
 e.orderId=orderId;e.lineId=lineId;const o=options||{};if(o.slot!==undefined)e.slot=o.slot;if(o.componentKey!==undefined)e.componentKey=String(o.componentKey);return e;
}
/* The caller authenticates the authority response. Installation does not
   fetch, invent or reuse leases. Last is inclusive, cursor is last issued. */
function productionIdentityInstallRanges(authority,ranges){
 if(typeof authority!=='string'||!authority||authority==='browser'||!Array.isArray(ranges))throw new Error('Production identity: an authority and reserved ranges are required.');
 const s=productionIdentityState();s.authority=authority;
 ranges.forEach(raw=>{
  const r=Object.assign({},raw,{authority});r.kind=r.kind==='BASE'?'BASE':productionIdentityKind(r.kind);
  r.first=productionIdentityDecimal(r.first,false);r.last=productionIdentityDecimal(r.last,false);r.cursor=productionIdentityDecimal(r.cursor==null?String(BigInt(r.first)-1n):r.cursor,true);
  if(!r.id||productionIdentityCounterCompare(r.first,r.last)>0||productionIdentityCounterCompare(r.cursor,r.last)>0||productionIdentityCounterCompare(r.cursor,String(BigInt(r.first)-1n))<0)throw new Error('Production identity: invalid reserved range.');
  if(r.kind!=='BASE'){productionIdentityLineKey(...String(r.lineKey||'').split('|'));productionIdentityEnsureLine(...r.lineKey.split('|'),{base:r.base});}
  const existing=s.ranges.find(x=>x.id===r.id);if(existing){if(existing.authority!==authority||existing.kind!==r.kind||existing.lineKey!==r.lineKey||existing.first!==r.first||existing.last!==r.last)throw new Error('Production identity: reserved range ID conflict.');existing.cursor=productionIdentityCounterMax(existing.cursor,r.cursor);return;}
  if(s.ranges.some(x=>x.kind===r.kind&&x.lineKey===r.lineKey&&productionIdentityCounterCompare(x.first,r.last)<=0&&productionIdentityCounterCompare(r.first,x.last)<=0))throw new Error('Production identity: reserved ranges overlap.');s.ranges.push(r);
 });
 s.reconciliationRequired=false;return s.ranges;
}
function productionIdentityAcceptRemote(response,orderId,lineId,options){
 if(!response||typeof response!=='object'||typeof response.then==='function')throw new Error('Production identity: gateway response must be synchronous JSON.');
 const s=productionIdentityState(),key=productionIdentityLineKey(orderId,lineId),rawLine=response.line||(response.base?response:null),o=options||{};
 if(rawLine){
  if((rawLine.originLineKey||rawLine.key||key)!==key)throw new Error('Production identity: gateway returned a different origin line.');
  const line=productionIdentityEnsureLine(orderId,lineId,{base:rawLine.base});
  if(rawLine.seqG!=null)line.seqG=productionIdentityCounterMax(line.seqG,rawLine.seqG);if(rawLine.seqU!=null)line.seqU=productionIdentityCounterMax(line.seqU,rawLine.seqU);
 }
 const results=[];
 (Array.isArray(response.entities)?response.entities:[]).forEach(raw=>{
  const p=productionIdentityBarcodeParse(raw.code),kind=productionIdentityKind(raw.kind);
  if(!p||p.legacy||p.kind!==kind||(raw.originLineKey&&raw.originLineKey!==key)||!productionIdentityUUIDValid(raw.id))throw new Error('Production identity: invalid gateway physical object.');
  const line=productionIdentityEnsureLine(orderId,lineId,{base:p.base});if(raw.instance!=null&&productionIdentityDecimal(raw.instance,false)!==p.instance)throw new Error('Production identity: gateway instance does not match its barcode.');
  let e=productionIdentityFind(p.code);if(e){if(e.id!==raw.id||e.originLineKey!==key)throw new Error('Production identity: gateway barcode conflicts with the registry.');}
  else{
   e=productionIdentityEntity(kind,p.code,orderId,lineId,Object.assign({},o,{id:raw.id,createdAt:raw.createdAt||o.createdAt}));
   if(raw.replacesId)e.replacesId=String(raw.replacesId);if(raw.slot!==undefined)e.slot=raw.slot;
   productionIdentityAddEntity(e);
  }
  line['seq'+kind]=productionIdentityCounterMax(line['seq'+kind],p.instance);
  const requestId=o.requestId||raw.requestId;if(requestId){
   const idx=productionIdentityIndex(),r=idx.requests.get(requestId);
   if(r&&r.entityId!==e.id)throw new Error('Production identity: gateway request conflicts with the registry.');
   if(!r){const record={id:requestId,entityId:e.id,kind,lineKey:key};s.requests.push(record);idx.requests.set(requestId,record);idx.requestCount=s.requests.length;}e.requestId=requestId;
  }
  results.push(e);
 });return results;
}
function productionIdentityUUIDValid(value){return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
function validateProductionIdentityPayload(payload){
 if(!payload||payload.productionIdentity==null)return;
 const s=payload.productionIdentity;
 if(!s||typeof s!=='object'||Array.isArray(s)||s.version!==1)throw new Error('Production identity: unsupported registry version.');
 ['lines','entities','requests','ranges'].forEach(k=>{if(!Array.isArray(s[k]))throw new Error('Production identity: '+k+' must be an array.');});
 productionIdentityDecimal(s.baseSeq,true);
 if(typeof s.authority!=='string'||!s.authority)throw new Error('Production identity: authority is required.');
 const lines=new Map(),bases=new Set(),codes=new Map(),ids=new Map(),requests=new Set();
 s.lines.forEach(l=>{
  if(!l||typeof l!=='object'||typeof l.key!=='string'||l.key.split('|').length!==2)throw new Error('Production identity: invalid origin line.');productionIdentityLineKey(...l.key.split('|'));
  const base=productionIdentityDecimal(l.base,false).padStart(10,'0');if(l.base!==base||lines.has(l.key)||bases.has(base))throw new Error('Production identity: duplicate or noncanonical origin line base.');
  productionIdentityDecimal(l.seqG,true);productionIdentityDecimal(l.seqU,true);lines.set(l.key,l);bases.add(base);
 });
 s.entities.forEach(e=>{
  const p=e&&productionIdentityBarcodeParse(e.code);
  if(!e||!productionIdentityUUIDValid(e.id)||!p||p.code!==e.code||p.kind!==e.kind||!lines.has(e.originLineKey)||(typeof e.createdAt!=='string'||!Number.isFinite(Date.parse(e.createdAt)))||ids.has(e.id))throw new Error('Production identity: invalid or duplicate physical object.');
  if(!p.legacy&&(lines.get(e.originLineKey).base!==p.base||e.instance!==p.instance))throw new Error('Production identity: physical barcode does not match its origin.');
  if(p.legacy&&e.instance!=null)throw new Error('Production identity: legacy objects do not have a series instance.');
  if(e.aliases!=null&&!Array.isArray(e.aliases))throw new Error('Production identity: aliases must be an array.');
  [e.code].concat(e.aliases||[]).forEach(code=>{if(productionIdentityBarcodeNormalize(code)!==code||productionIdentityBarcodeParse(code).kind!==e.kind||codes.has(code)&&codes.get(code)!==e.id)throw new Error('Production identity: duplicate or invalid barcode alias.');codes.set(code,e.id);});
  if(e.slot!==undefined&&e.slot!==null&&typeof e.slot!=='string'&&!(typeof e.slot==='number'&&Number.isSafeInteger(e.slot)&&e.slot>=0))throw new Error('Production identity: invalid order slot.');
  if(e.orderId!=null||e.lineId!=null)productionIdentityLineKey(e.orderId,e.lineId);ids.set(e.id,e);
 });
 s.entities.forEach(e=>{if(e.replacesId&&(!ids.has(e.replacesId)||ids.get(e.replacesId).kind!==e.kind||e.replacesId===e.id))throw new Error('Production identity: invalid replacement relationship.');});
 s.entities.forEach(e=>{
  if(e.componentIds!==undefined){
   if(e.kind!=='U'||!Array.isArray(e.componentIds)||!e.componentIds.length||new Set(e.componentIds).size!==e.componentIds.length||e.componentIds.some(id=>!ids.has(id)||ids.get(id).kind!=='G'))throw new Error('Production identity: unit composition must contain distinct physical glass IDs.');
   if(e.componentCodes!==undefined&&(!Array.isArray(e.componentCodes)||e.componentCodes.length!==e.componentIds.length||e.componentCodes.some((code,i)=>ids.get(e.componentIds[i]).code!==code)))throw new Error('Production identity: unit glass codes do not match physical IDs.');
  }
 });
 const checked=new Set();s.entities.forEach(e=>{if(checked.has(e.id))return;const chain=new Set();let current=e;while(current&&!checked.has(current.id)){if(chain.has(current.id))throw new Error('Production identity: replacement history contains a cycle.');chain.add(current.id);current=current.replacesId?ids.get(current.replacesId):null;}chain.forEach(id=>checked.add(id));});
 s.requests.forEach(r=>{if(!r||typeof r.id!=='string'||!r.id||requests.has(r.id)||!ids.has(r.entityId)||r.kind!==ids.get(r.entityId).kind||r.lineKey!==ids.get(r.entityId).originLineKey)throw new Error('Production identity: invalid or duplicate allocation request.');requests.add(r.id);});
 const rangeIds=new Set();
 s.ranges.forEach((r,i)=>{
  if(!r||typeof r.id!=='string'||!r.id||rangeIds.has(r.id)||!['BASE','G','U'].includes(r.kind)||typeof r.authority!=='string'||!r.authority||r.authority==='browser')throw new Error('Production identity: invalid reserved range.');rangeIds.add(r.id);
  const first=productionIdentityDecimal(r.first,false),last=productionIdentityDecimal(r.last,false),cursor=productionIdentityDecimal(r.cursor,true);
  if(productionIdentityCounterCompare(first,last)>0||productionIdentityCounterCompare(cursor,last)>0||productionIdentityCounterCompare(cursor,String(BigInt(first)-1n))<0)throw new Error('Production identity: invalid reserved range cursor.');
  if(r.kind!=='BASE'&&(!lines.has(r.lineKey)||r.base&&r.base!==lines.get(r.lineKey).base))throw new Error('Production identity: reserved range has an unknown origin.');
  if(s.ranges.slice(0,i).some(x=>x.kind===r.kind&&x.lineKey===r.lineKey&&productionIdentityCounterCompare(x.first,last)<=0&&productionIdentityCounterCompare(first,x.last)<=0))throw new Error('Production identity: reserved ranges overlap.');
 });
}
function productionIdentityNormalizeState(state){
 const s=state||JSON.parse(JSON.stringify(DEFAULT.productionIdentity));
 if(s.version==null)s.version=1;if(s.baseSeq==null)s.baseSeq='0';if(!s.authority)s.authority='browser';
 ['lines','entities','requests','ranges'].forEach(k=>{if(s[k]==null)s[k]=[];});if(s.reconciliationRequired!==true)s.reconciliationRequired=false;
 validateProductionIdentityPayload({productionIdentity:s});
 s.baseSeq=productionIdentityDecimal(s.baseSeq,true);s.lines.forEach(l=>{s.baseSeq=productionIdentityCounterMax(s.baseSeq,l.base);l.seqG=productionIdentityDecimal(l.seqG,true);l.seqU=productionIdentityDecimal(l.seqU,true);});
 s.ranges.forEach(r=>{r.first=productionIdentityDecimal(r.first,false);r.last=productionIdentityDecimal(r.last,false);r.cursor=productionIdentityDecimal(r.cursor,true);});
 const lines=new Map(s.lines.map(l=>[l.key,l]));s.entities.forEach(e=>{const p=productionIdentityBarcodeParse(e.code);if(!p.legacy){const l=lines.get(e.originLineKey);l['seq'+e.kind]=productionIdentityCounterMax(l['seq'+e.kind],p.instance);}});return s;
}
/* Merge registries only: restoring commercial data never erases issuance.
   Identity conflicts are rejected rather than repairing history by guessing. */
function productionIdentityMergeStates(target,source){
 target=productionIdentityNormalizeState(target);source=productionIdentityNormalizeState(source);
 if(source.authority!=='browser'){if(target.authority!=='browser'&&target.authority!==source.authority)throw new Error('Production identity: restored authority conflicts with the issuance ledger.');if(target.authority==='browser'){target.authority=source.authority;target.reconciliationRequired=true;}}
 const clone=v=>JSON.parse(JSON.stringify(v)),lines=new Map(target.lines.map(l=>[l.key,l])),bases=new Map(target.lines.map(l=>[l.base,l.key]));
 target.baseSeq=productionIdentityCounterMax(target.baseSeq,source.baseSeq);
 source.lines.forEach(l=>{
  const old=lines.get(l.key);if(old){if(old.base!==l.base)throw new Error('Production identity: restored origin line conflicts with an issued base.');old.seqG=productionIdentityCounterMax(old.seqG,l.seqG);old.seqU=productionIdentityCounterMax(old.seqU,l.seqU);}
  else{if(bases.has(l.base))throw new Error('Production identity: restored base belongs to another origin line.');const row=clone(l);target.lines.push(row);lines.set(row.key,row);bases.set(row.base,row.key);}
 });
 const ids=new Map(target.entities.map(e=>[e.id,e])),codes=new Map();target.entities.forEach(e=>[e.code].concat(e.aliases||[]).forEach(c=>codes.set(c,e.id)));
 source.entities.forEach(e=>{
  const old=ids.get(e.id);if(old){if(old.code!==e.code||old.kind!==e.kind||old.originLineKey!==e.originLineKey||old.replacesId&&e.replacesId&&old.replacesId!==e.replacesId)throw new Error('Production identity: restored physical object conflicts with its immutable identity.');if(!old.replacesId&&e.replacesId)old.replacesId=e.replacesId;
   if(old.assemblyId&&e.assemblyId&&old.assemblyId!==e.assemblyId)throw new Error('Production identity: restored unit has a different physical assembly.');
   ['componentIds','componentCodes'].forEach(field=>{if(old[field]&&e[field]&&JSON.stringify(old[field])!==JSON.stringify(e[field]))throw new Error('Production identity: restored unit composition conflicts with its identity.');if(!old[field]&&e[field])old[field]=clone(e[field]);});
   ['assemblyId','assembledAt'].forEach(field=>{if(!old[field]&&e[field])old[field]=e[field];});
   if(e.active===false||e.retiredAt){old.active=false;if(e.retiredAt)old.retiredAt=e.retiredAt;if(e.retiredReason)old.retiredReason=e.retiredReason;}
   if(['broken','withdrawn'].includes(e.status))old.status=e.status;else if(e.status==='assembled'&&(!old.status||old.status==='reserved'))old.status='assembled';
  }
  [e.code].concat(e.aliases||[]).forEach(code=>{if(codes.has(code)&&codes.get(code)!==e.id)throw new Error('Production identity: restored barcode conflicts with an issued object.');codes.set(code,e.id);});
  if(!old){const row=clone(e);target.entities.push(row);ids.set(row.id,row);}else if(e.aliases&&e.aliases.length)old.aliases=[...new Set((old.aliases||[]).concat(e.aliases))];
 });
 const reqs=new Map(target.requests.map(r=>[r.id,r]));source.requests.forEach(r=>{const old=reqs.get(r.id);if(old&&JSON.stringify(old)!==JSON.stringify(r))throw new Error('Production identity: restored request conflicts with its allocation.');if(!old){const row=clone(r);target.requests.push(row);reqs.set(row.id,row);}});
 source.ranges.forEach(r=>{const old=target.ranges.find(x=>x.id===r.id);if(old){if(old.kind!==r.kind||old.lineKey!==r.lineKey||old.first!==r.first||old.last!==r.last||old.authority!==r.authority)throw new Error('Production identity: restored reserved range conflicts with its lease.');old.cursor=productionIdentityCounterMax(old.cursor,r.cursor);}else target.ranges.push(clone(r));});
 return productionIdentityNormalizeState(target);
}
let productionIdentityLedgerText=null,productionIdentityLedgerValue=null;
function productionIdentityReadLedger(){
 if(typeof localStorage==='undefined')return null;
 let text;try{text=localStorage.getItem(PRODUCTION_IDENTITY_LEDGER_KEY);}catch(e){throw new Error('Production identity: issuance ledger cannot be read.');}
 if(text===null){productionIdentityLedgerText=null;productionIdentityLedgerValue=null;return null;}
 if(text===productionIdentityLedgerText&&productionIdentityLedgerValue)return JSON.parse(JSON.stringify(productionIdentityLedgerValue));
 try{const s=productionIdentityNormalizeState(JSON.parse(text));productionIdentityLedgerText=text;productionIdentityLedgerValue=s;return JSON.parse(JSON.stringify(s));}catch(e){throw new Error('Production identity: issuance ledger needs recovery before new numbers can be issued.');}
}
function productionIdentityReconcile(next,previous){
 if(!next||typeof next!=='object')throw new Error('Production identity: expected a database.');
 let s=productionIdentityNormalizeState(next.productionIdentity);const before=s.baseSeq,beforeEntities=s.entities.length,beforeLines=new Map(s.lines.map(l=>[l.key,[l.seqG,l.seqU]])),beforeRanges=new Map(s.ranges.map(r=>[r.id,r.cursor]));
 if(previous&&previous.productionIdentity)s=productionIdentityMergeStates(s,previous.productionIdentity);
 const ledger=productionIdentityReadLedger();if(ledger)s=productionIdentityMergeStates(s,ledger);
 if(s.authority!=='browser'&&(productionIdentityCounterCompare(s.baseSeq,before)>0||s.entities.length>beforeEntities||s.lines.some(l=>!beforeLines.has(l.key)||productionIdentityCounterCompare(l.seqG,beforeLines.get(l.key)[0])>0||productionIdentityCounterCompare(l.seqU,beforeLines.get(l.key)[1])>0)||s.ranges.some(r=>!beforeRanges.has(r.id)||productionIdentityCounterCompare(r.cursor,beforeRanges.get(r.id))>0)))s.reconciliationRequired=true;
 next.productionIdentity=s;productionIdentityIndexes=null;if(next===DB)productionIdentityReconciledState=s;return s;
}
function normalizeProductionIdentity(){return productionIdentityReconcile(DB);}
/* Called by the storage writer immediately before committing a database.
   Numbers are burned even if the following database write fails.
   A failed ledger write makes storage report the save as failed: printing
   must never proceed while durable issuance cannot be guaranteed. */
function productionIdentityPersistLedger(){
 if(typeof localStorage==='undefined')throw new Error('Production identity: durable browser storage is unavailable.');
 const s=productionIdentityNormalizeState(JSON.parse(JSON.stringify(productionIdentityState()))),ledger=productionIdentityReadLedger();if(ledger)productionIdentityMergeStates(s,ledger);
 const text=JSON.stringify(s);try{localStorage.setItem(PRODUCTION_IDENTITY_LEDGER_KEY,text);}catch(e){throw new Error('Production identity: issuance ledger could not be saved. Export data and free browser storage before printing.');}
 DB.productionIdentity=s;productionIdentityIndexes=null;productionIdentityReconciledState=s;productionIdentityLedgerText=text;productionIdentityLedgerValue=s;return true;
}

/* Call only after a fresh successful authority registration/status check. */
function productionIdentityAuthorityReconciled(authority){
 const s=productionIdentityReadyState();if(s.authority!==authority||authority==='browser')throw new Error('Production identity: reconciliation authority does not match.');s.reconciliationRequired=false;return true;
}
