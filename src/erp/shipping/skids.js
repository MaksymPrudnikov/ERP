/* Shipping · скиды у клиентов (PR 4, 6 октября 2026).
   IN : отправленные PS со способом Delivery (скиды в их составе) · DB.carrier
   OUT: DB.skidReturn {id, at, code, customerId, kind:'back'|'swap', newCode, by}
   Владелец: «бывает, скид остаётся и нам на замену дают другие; бывает,
   оставляем и забираем через какое-то количество дней». Наш скид с кодом
   возвращается сканом; чужой заводим новым кодом с этикеткой, а наш,
   оставшийся у клиента, списывается как обменянный.
   Где скид — не хранится, а считается (как «где стекло»): последний
   отправленный PS с ним против последнего возврата. Скид-микс (на нём стекло
   нескольких клиентов) уезжает только с последним своим стеклом. Самовывоз
   увозит скид, только если его погрузили сканом скида на станции отгрузки. Skid Deposit — отдельно,
   деньги этот учёт не трогает. */
DEFAULT.skidReturn=[];
/* skidsOut пишет отгрузка: скиды, на которых после неё ничего не осталось.
   У PS, отправленных до 6.10.2026, поля нет — берём скиды из документа. */
function skidCodes(s){return Array.isArray(s.skidsOut)?s.skidsOut:s.method!=='delivery'?[]:s.document?s.document.skids.map(k=>k.code):[...new Set((s.items||[]).map(i=>i.skid).filter(Boolean))];}
/* Скиды, которые сейчас у клиентов: код → {customerId, since, ps, psId}. */
function skidsOut(){
 const out=new Map(),back=new Map();
 (DB.skidReturn||[]).forEach(r=>{if(!back.has(r.code)||r.at>back.get(r.code))back.set(r.code,r.at);});
 (DB.shipment||[]).filter(shippingSent).sort((a,b)=>a.shippedAt.localeCompare(b.shippedAt)).forEach(s=>skidCodes(s).forEach(code=>out.set(code,{code,customerId:s.customerId,since:s.shippedAt,ps:s.number,psId:s.id})));
 out.forEach((x,code)=>{if(back.has(code)&&back.get(code)>=x.since)out.delete(code);});
 return out;
}
function skidDays(since){return Math.max(0,Math.round((Date.parse(finToday()+'T12:00:00')-Date.parse(finLocalDate(since)+'T12:00:00'))/864e5));}
/* По клиентам: у кого наши скиды, самый давний первым. */
function skidsByCustomer(){
 const by=new Map();skidsOut().forEach(x=>{if(!by.has(x.customerId))by.set(x.customerId,[]);by.get(x.customerId).push(x);});
 return [...by].map(([customerId,list])=>({customerId,list:list.sort((a,b)=>a.since.localeCompare(b.since)||a.code.localeCompare(b.code,undefined,{numeric:true}))})).sort((a,b)=>a.list[0].since.localeCompare(b.list[0].since));
}
function skidReturnPush(code,x,kind,newCode,by,now){
 if(!Array.isArray(DB.skidReturn))DB.skidReturn=[];
 const r={id:salesUid('SKR'),at:now||new Date().toISOString(),code,customerId:x.customerId,kind,newCode:newCode||'',by:String(by||'').slice(0,80)};DB.skidReturn.push(r);return r;
}
/* Скан скида в цеху: если он числится у клиента — вернулся. Иначе null. */
function skidBack(code,who){
 const x=skidsOut().get(carrierCode(code));if(!x)return null;
 const out=storageCommand(()=>skidReturnPush(x.code,x,'back','',who&&who.name));
 return out.ok?{code:x.code,customerId:x.customerId,customer:salesCustomerDisplay(x.customerId),days:skidDays(x.since),ps:x.ps}:{error:out.error};
}
/* Обмен: клиент отдал свой скид вместо нашего. Чужой заводится новым кодом,
   самый давний наш скид у этого клиента списывается. */
function skidSwap(customerId,prefix){return storageCommand(()=>{
 const mine=skidsByCustomer().find(x=>x.customerId===customerId);shippingAssert(mine,'This customer has none of our skids.');
 shippingAssert(['SL','SA'].includes(prefix),'Choose the skid type.');
 const old=mine.list[0],made=carrierAdd(prefix,1,{deferTouch:true});shippingAssert(made&&made.codes&&made.codes.length,made&&made.error||'The skid was not added.');
 const c=carrierFind(old.code);if(c){c.active=false;c.note=('left at '+salesCustomerDisplay(customerId)+' (swap)').slice(0,80);}
 const who=orderLogActor();skidReturnPush(old.code,old,'swap',made.codes[0],who.by||'Office');
 return {old:old.code,code:made.codes[0]};
});}
function normalizeSkidReturns(){
 if(!Array.isArray(DB.skidReturn))DB.skidReturn=[];
 const seen=new Set(),iso=v=>typeof v==='string'&&!isNaN(Date.parse(v));
 DB.skidReturn=DB.skidReturn.filter(r=>r&&typeof r==='object'&&salesRefId(r.id)&&!seen.has(r.id)&&(seen.add(r.id),true)&&CARRIER_RE.test(carrierCode(r.code))&&iso(r.at)&&['back','swap'].includes(r.kind))
  .map(r=>({id:r.id,at:r.at,code:carrierCode(r.code),customerId:String(r.customerId==null?'':r.customerId),kind:r.kind,newCode:r.kind==='swap'&&CARRIER_RE.test(carrierCode(r.newCode))?carrierCode(r.newCode):'',by:String(r.by==null?'':r.by).slice(0,80)}));
}
function validateSkidReturnPayload(src){
 if(src&&Object.prototype.hasOwnProperty.call(src,'skidReturn')&&!Array.isArray(src.skidReturn))throw new Error('The "skidReturn" field must be an array.');
}
