/* =====================================================================
   erp/shopfloor/carrier-count  ·  carriers-3.0
   Учёт тары (план доработок v1.16, пункт 7, этап 8, 30.10.2026): сводка
   «сколько у нас долли и скидов и где они» и пересчёт.
   IN : DB.carrier, carrierSeenSet(), carrierContents() (erp/shopfloor/carriers)
        · skidsOut() (erp/shipping/skids)
   OUT: DB.carrierCount {id, startedAt, by, finishedAt, obs[], missing[]}
        obs: {at, code, place, by, res:'ok'|'dup'|'unknown'|'out'|'retired'|'twin'|'nolabel', info, customerId, kind, note, fixed}
   Владелец выбрал вариант 1 офиса (30.10.2026): плитки на Production →
   Dollies & Skids и кнопка Count — пересчёт на месте доски.
   Пересчёт только смотрит: каждый скан — отметка «видели здесь», повтор не
   добавляет тару; стекло не двигается, скид не «возвращается» сам
   (P7-R13, P7-R14). Что не сходится — «по учёту у клиента, а стоит у нас»,
   неизвестный код, две тары с одной этикеткой, тара без этикетки — офису
   на разбор; исправляет офис своей кнопкой.
   ===================================================================== */
DEFAULT.carrierCount=[];
const CARRIER_COUNTED=['ok','out','retired'];
function carrierCountOpen(){return (DB.carrierCount||[]).find(n=>!n.finishedAt)||null;}
function carrierCountFind(id){return (DB.carrierCount||[]).find(n=>n.id===id)||null;}
function carrierCountLast(){return (DB.carrierCount||[]).filter(n=>n.finishedAt).sort((a,b)=>a.finishedAt.localeCompare(b.finishedAt)).pop()||null;}
function carrierCountStart(who){return storageCommand(()=>{
 const open=carrierCountOpen();if(open)return open;
 if(!Array.isArray(DB.carrierCount))DB.carrierCount=[];
 const n={id:salesUid('CC'),startedAt:new Date().toISOString(),by:String(who&&who.name||'').slice(0,80),finishedAt:'',obs:[],missing:[]};
 DB.carrierCount.push(n);return n;
});}
/* Отмена — пересчёта не было: его отметки уходят целиком. */
function carrierCountCancel(id){return storageCommand(()=>{
 const n=carrierCountFind(id);if(!n||n.finishedAt)throw new Error('No count to cancel.');
 DB.carrierCount=DB.carrierCount.filter(x=>x!==n);return true;
});}
function carrierCountScan(id,raw,place,who){return storageCommand(()=>{
 const n=carrierCountFind(id);if(!n||n.finishedAt)throw new Error('Start a count first.');
 const code=carrierCode(raw).slice(0,20),rec=CARRIER_RE.test(code)?carrierFind(code):null,now=new Date().toISOString();
 const o={at:now,code,place:String(place||'').slice(0,40),by:String(who&&who.name||'').slice(0,80),res:'ok',info:''};
 const first=rec&&n.obs.find(x=>x.code===code&&CARRIER_COUNTED.includes(x.res));
 if(!rec)o.res='unknown';
 else if(first){o.res='dup';o.info=first.at;}
 else if(!rec.active)o.res='retired';
 else{const x=typeof skidsOut==='function'&&skidsOut().get(code);if(x){o.res='out';o.customerId=x.customerId;o.info=x.ps;}}
 n.obs.push(o);return o;
});}
/* Тара без этикетки — отдельной строкой, без выдуманного кода (P7-R11, случай 3). */
function carrierCountNoLabel(id,kind,place,note,who){return storageCommand(()=>{
 const n=carrierCountFind(id);if(!n||n.finishedAt)throw new Error('Start a count first.');
 n.obs.push({at:new Date().toISOString(),code:'',place:String(place||'').slice(0,40),by:String(who&&who.name||'').slice(0,80),res:'nolabel',info:'',kind:kind==='skid'?'skid':'dolly',note:String(note||'').slice(0,80)});return true;
});}
/* «Уже учтено», а перед глазами другая тара с той же этикеткой — для разбора
   офисом; переименования сами по себе нет (P7-R13). */
function carrierCountTwin(id,i){return storageCommand(()=>{
 const n=carrierCountFind(id),o=n&&n.obs[i];if(!o||o.res!=='dup')throw new Error('Nothing to mark.');o.res='twin';return true;
});}
/* По учёту скид у клиента, а стоит у нас: офис подтверждает возврат — тем же
   возвратом, что скан скида на станции, временем отметки (P7-R14). */
function carrierCountBack(id,i,who){return storageCommand(()=>{
 const n=carrierCountFind(id),o=n&&n.obs[i];if(!o||o.res!=='out'||o.fixed)throw new Error('Nothing to fix.');
 const x=skidsOut().get(o.code);if(x)skidReturnPush(o.code,x,'back','',who&&who.name,o.at);
 o.fixed=true;return true;
});}
/* Какую тару ждём увидеть в цеху: действующая, подтверждённая и не у клиента. */
function carrierExpected(){
 const seen=carrierSeenSet(),out=typeof skidsOut==='function'?skidsOut():new Map();
 return (DB.carrier||[]).filter(c=>c.active&&seen.has(c.code)&&!out.has(c.code)).map(c=>c.code);
}
function carrierCountCounted(n){return new Set((n&&n.obs||[]).filter(o=>CARRIER_COUNTED.includes(o.res)).map(o=>o.code));}
/* Закончили — что ждали в цеху и не увидели, запоминается на этот день. */
function carrierCountFinish(id){return storageCommand(()=>{
 const n=carrierCountFind(id);if(!n||n.finishedAt)throw new Error('No count to finish.');
 const got=carrierCountCounted(n);n.missing=carrierExpected().filter(c=>!got.has(c));n.finishedAt=new Date().toISOString();return n;
});}
/* Проверка у клиента (P7-R12, P7-R15): по номерам — какие видели; только
   числом — хранится число, номера не отмечаются. */
function carrierCustomerCheck(customerId,text,who){return storageCommand(()=>{
 const t=String(text||'').toUpperCase(),codes=[...new Set((t.match(/\b(DL|DA|SL|SA)\s*-\s*\d{1,5}\b/g)||[]).map(carrierCode))].filter(c=>carrierFind(c));
 const num=/(^|[^\w-])(\d{1,4})(?![\w-])/.exec(t.replace(/\b(DL|DA|SL|SA)\s*-\s*\d{1,5}\b/g,' '));
 if(!codes.length&&!num)throw new Error('Type the skids you saw or how many.');
 carrierEventPush({kind:'check',customerId:String(customerId||''),codes,count:codes.length||+num[2],by:String(who&&who.name||'').slice(0,80)});return true;
});}
function carrierCustomerChecks(customerId){return (DB.carrierEvent||[]).filter(e=>e.kind==='check'&&e.customerId===customerId).sort((a,b)=>a.at.localeCompare(b.at));}

/* Сводка для плиток (P7-R12): физическая тара отдельно от номеров без
   подтверждения и от списанной; у клиента — по отгрузкам. */
function carrierSummary(){
 const seen=carrierSeenSet(),out=typeof skidsOut==='function'?skidsOut():new Map(),contents=carrierContents(),byType={},shop={loaded:0,empty:0,items:[]};
 let reg=0,unconfirmed=0,retired=0,outN=0,oldest='';
 (DB.carrier||[]).forEach(c=>{
  if(!c.active){retired++;return;}
  const x=out.get(c.code);if(x){outN++;if(!oldest||x.since<oldest)oldest=x.since;}
  if(!seen.has(c.code)&&!x){unconfirmed++;return;}
  reg++;const k=c.code.slice(0,2);byType[k]=(byType[k]||0)+1;
  if(x)return;const on=contents.get(c.code);if(on&&on.length){shop.loaded++;shop.items=shop.items.concat(on);}else shop.empty++;
 });
 const last=carrierCountLast(),act=new Set((DB.carrier||[]).filter(c=>c.active).map(c=>c.code));
 return {reg,byType,shop,outN,oldest,unconfirmed,retired,last,missing:last?last.missing.filter(c=>act.has(c)&&!out.has(c)):[],nolabel:last?last.obs.filter(o=>o.res==='nolabel').length:0};
}
function normalizeCarrierCounts(){
 if(!Array.isArray(DB.carrierCount))DB.carrierCount=[];
 const seen=new Set(),iso=v=>typeof v==='string'&&!isNaN(Date.parse(v)),txt=(v,n)=>String(v==null?'':v).slice(0,n);
 const RES=['ok','dup','unknown','out','retired','twin','nolabel'];
 DB.carrierCount=DB.carrierCount.filter(n=>n&&typeof n==='object'&&salesRefId(n.id)&&!seen.has(n.id)&&(seen.add(n.id),true)&&iso(n.startedAt))
  .map(n=>({id:n.id,startedAt:n.startedAt,by:txt(n.by,80),finishedAt:iso(n.finishedAt)?n.finishedAt:'',
   obs:(Array.isArray(n.obs)?n.obs:[]).filter(o=>o&&iso(o.at)&&RES.includes(o.res)).map(o=>{const r={at:o.at,code:txt(carrierCode(o.code),20),place:txt(o.place,40),by:txt(o.by,80),res:o.res,info:txt(o.info,80)};
    if(o.customerId)r.customerId=txt(o.customerId,80);if(o.res==='nolabel'){r.kind=o.kind==='skid'?'skid':'dolly';r.note=txt(o.note,80);}if(o.fixed)r.fixed=true;return r;}),
   missing:(Array.isArray(n.missing)?n.missing:[]).map(carrierCode).filter(c=>CARRIER_RE.test(c))}));
 /* Открытым бывает один пересчёт — лишние закрываются. */
 const open=DB.carrierCount.filter(n=>!n.finishedAt);open.slice(0,-1).forEach(n=>{n.finishedAt=n.obs.length?n.obs[n.obs.length-1].at:n.startedAt;});
}
