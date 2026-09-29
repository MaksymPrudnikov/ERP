/* =====================================================================
   erp/shopfloor/carriers  ·  carriers-1.0
   Долли и скиды: тара, на которой стекло едет между станциями.
   IN : DB.stationScan (поле on у скана)
   OUT: DB.carrier {code, note, active}
   Владелец, 29 сентября 2026:
   - «нужно L A shape dolly & skids… если мне нужно срочно найти, система
     скажет L-34, и я знаю, какой формы искать»; скиды тоже бывают L и A →
     четыре типа, код говорит оба признака: DL, DA, SL, SA;
   - «сначала скан скида или долли и потом то, что на ней»;
   - «иногда 2 долли свободно, иногда 3 — решает человек»: система не
     назначает тару, она записывает, на что положили.
   Префикс S- занят остатками стока (S-0000001) — у скидов вторая буква
   формы, спутать нельзя.
   Где стекло физически: последний скан стекла с полем on — оно лежит на этой
   таре, пока его не отсканируют снова.
   ===================================================================== */
DEFAULT.carrier=[];
const CARRIER_TYPES=[
 {k:'DL',kind:'Dolly',shape:'L',label:'L-shape dolly'},
 {k:'DA',kind:'Dolly',shape:'A',label:'A-shape dolly'},
 {k:'SL',kind:'Skid',shape:'L',label:'L-shape skid'},
 {k:'SA',kind:'Skid',shape:'A',label:'A-shape skid'}
];
const CARRIER_RE=/^(DL|DA|SL|SA)-([1-9]\d{0,4})$/;
function carrierCode(v){return String(v==null?'':v).trim().toUpperCase().replace(/\s+/g,'');}
function carrierType(code){const m=CARRIER_RE.exec(carrierCode(code));return m?CARRIER_TYPES.find(t=>t.k===m[1]):null;}
function carrierFind(code){const c=carrierCode(code);return (DB.carrier||[]).find(x=>x.code===c)||null;}
/* Номер — следующий внутри своего типа: DL-1, DL-2… и отдельно DA-1… */
function carrierAdd(prefix,count,opts){
 opts=opts||{};const t=CARRIER_TYPES.find(x=>x.k===prefix);if(!t)return {error:'Unknown type.'};
 const n=Math.max(1,Math.min(50,Math.floor(+count)||1));if(!Array.isArray(DB.carrier))DB.carrier=[];
 let top=DB.carrier.reduce((m,c)=>{const x=CARRIER_RE.exec(c.code);return x&&x[1]===prefix?Math.max(m,+x[2]):m;},0);
 const made=[];for(let i=0;i<n;i++){const code=prefix+'-'+(++top);DB.carrier.push({code,note:'',active:true});made.push(code);}
 if(!opts.deferTouch)touch();return {codes:made};
}
function carrierSet(code,field,value){
 const c=carrierFind(code);if(!c)return false;
 if(field==='active')c.active=!!value;else if(field==='note')c.note=String(value==null?'':value).slice(0,80);else return false;
 touch();return true;
}
/* Что сейчас на таре: стекло, чей последний скан положил его на неё, и
   которое с тех пор не сканировали, не разбили и не отгрузили. */
function carrierContents(){
 const last=new Map(),out=new Map();
 (DB.stationScan||[]).forEach(s=>{if(!s.undoneAt)last.set(s.piece,s);});
 const index=stationPieceIndex(),batches=stationBatchIndex();
 last.forEach((s,piece)=>{
  if(!s.on||s.broken)return;
  const g=stationGlass(piece,index,batches);if(!g)return;
  const place=stationPlace(g);if(place.broken||place.shipped)return;
  if(!out.has(s.on))out.set(s.on,[]);
  out.get(s.on).push({id:piece,g,place,scan:s});
 });
 /* Стопка: сверху — положенное последним. */
 out.forEach(list=>list.sort((a,b)=>String(b.scan.at).localeCompare(String(a.scan.at))||b.scan.id.localeCompare(a.scan.id)));
 return out;
}
function normalizeCarriers(){
 if(!Array.isArray(DB.carrier))DB.carrier=[];
 const seen=new Set();
 DB.carrier=DB.carrier.filter(c=>c&&typeof c==='object'&&CARRIER_RE.test(carrierCode(c.code))&&!seen.has(carrierCode(c.code))&&(seen.add(carrierCode(c.code)),true))
  .map(c=>({code:carrierCode(c.code),note:String(c.note==null?'':c.note).slice(0,80),active:c.active!==false}));
}
function validateCarrierPayload(src){
 if(src&&Object.prototype.hasOwnProperty.call(src,'carrier')&&!Array.isArray(src.carrier))throw new Error('The "carrier" field must be an array.');
}
