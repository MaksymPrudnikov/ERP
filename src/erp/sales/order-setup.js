/* =====================================================================
   erp/sales/order-setup  ·  order-setup-2.0
   Настройки нового заказа (план Master Data, этап 5): сборы заказа —
   Energy, HST, комиссия карты, доставка, депозит за скид и свои сборы —
   и коды сборов; умолчания фрита — точка, отступ и угол; дни Due date.
   Раньше это были числа в коде (9.75, 13, 2.34 / 2.39 / 3.15, 5 мм, 1″).
   Теперь их правят в Data → Setup, а код только читает.
   IN : DB.orderSetup
   OUT: orderSetup(); salesOrderChargeDefaults() — снимок для нового
        заказа; orderSetupCodeOn() — набор кода; orderSetupFrit() —
        умолчания фрита нового лайта
   Правило: сохранённый заказ живёт по своему снимку orderCharges (ставки,
   карта, коды и наборы сборов); правка Setup его не меняет.
   Коды сборов (вариант A владельца, 27.11.2026: «нужно понимать, он будет с
   HST или ES или без… и чтобы кредитка не упустила этот сервис… максимально
   манёвренный результат»): код — именованный набор процентных сборов (ES,
   HST, свои %, Card fee), которые начисляются на вещь. Код есть у стекла и
   работ (первый код — по умолчанию), у работы, разового сервиса, у ES, HST, доставки, депозита и своего сбора. Начисление — сверху
   вниз: ES → HST → свои % → Card fee; на Card fee ничего не начисляется.
   ===================================================================== */
const ORDER_SETUP_DEFAULT={
 energyOn:true,energyRate:9.75,
 hstOn:true,hstRate:13,
 cardOn:false,
 cardNetworks:[{id:'visa',name:'Visa card fee',rate:2.34},{id:'mastercard',name:'Mastercard fee',rate:2.39},{id:'amex',name:'American Express fee',rate:3.15}],
 deliveryOn:false,deliveryAmount:0,
 skidDepositOn:false,skidDepositAmount:0,
 fritDotMm:5,fritMargin16:16,fritCorner:'Top right',
 /* Due date по приоритету — рабочих дней Пн–Пт (владелец 17.11.2026). */
 dueNormalDays:7,dueRushDays:3,dueCriticalDays:1
};
/* Засев кодов (картинка, одобренная владельцем 27.11.2026). Прежнее
   поведение кода: ES — под HST и картой, HST — под картой, доставка и
   депозит — ни под чем; стекло и работы — под всеми. */
const ORDER_CODE_SEED=[{id:'std',name:'Standard',on:['energy','hst','card']},{id:'hst-card',name:'HST + card',on:['hst','card']},{id:'card',name:'Card only',on:['card']},{id:'none',name:'No charges',on:[]}];
/* Сборы, у которых свой код (на Card fee ничего не начисляется — кода нет). */
const ORDER_CHARGE_CODED=['energy','hst','delivery','skidDeposit'];
DEFAULT.orderSetup=JSON.parse(JSON.stringify(Object.assign({},ORDER_SETUP_DEFAULT,{chargeCodes:ORDER_CODE_SEED,energyCode:'hst-card',hstCode:'card',deliveryCode:'none',skidDepositCode:'none',charges:[]})));
if(!DB.orderSetup||typeof DB.orderSetup!=='object'||Array.isArray(DB.orderSetup))DB.orderSetup=JSON.parse(JSON.stringify(DEFAULT.orderSetup));

function orderSetupNumber(v,fallback){const n=Number(v);return v!==''&&v!=null&&Number.isFinite(n)&&n>=0?Math.round(n*10000)/10000:fallback;}
function normalizeOrderSetup(){
 const s=DB.orderSetup&&typeof DB.orderSetup==='object'&&!Array.isArray(DB.orderSetup)?DB.orderSetup:{},d=ORDER_SETUP_DEFAULT,out={};
 Object.keys(d).forEach(k=>{
  if(typeof d[k]==='boolean')out[k]=typeof s[k]==='boolean'?s[k]:d[k];
  else if(typeof d[k]==='number')out[k]=orderSetupNumber(s[k],d[k]);
 });
 out.fritDotMm=out.fritDotMm>0?out.fritDotMm:d.fritDotMm;
 out.fritMargin16=Math.round(out.fritMargin16);
 ['dueNormalDays','dueRushDays','dueCriticalDays'].forEach(k=>{out[k]=Math.round(out[k]);});
 out.fritCorner=FRIT_MARGIN_CORNERS.includes(s.fritCorner)?s.fritCorner:d.fritCorner;
 /* Списка карт нет вовсе (старая база) — засев; список очищен руками —
    остаётся пустым: комиссии тогда нет, пока её не заведут. */
 const ids=new Set();
 out.cardNetworks=(Array.isArray(s.cardNetworks)?s.cardNetworks:d.cardNetworks).filter(x=>x&&typeof x==='object').map(x=>{
  let id=typeof x.id==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(x.id)?x.id:'card-'+Math.random().toString(36).slice(2,8);
  while(ids.has(id))id=id+'-2';ids.add(id);
  return {id,name:String(x.name==null?'':x.name).trim().slice(0,60),rate:orderSetupNumber(x.rate,0)};
 });
 /* Свои сборы (+ Charge): % или сумма, включён ли в новом заказе, код. */
 const cids=new Set(['energy','hst','card','delivery','skidDeposit']);
 out.charges=(Array.isArray(s.charges)?s.charges:[]).filter(x=>x&&typeof x==='object').map(x=>{
  let id=orderChargeId(x.id,'ch-');while(cids.has(id))id=id+'-2';cids.add(id);
  return {id,name:String(x.name==null?'':x.name).trim().slice(0,60)||'Charge',kind:x.kind==='percent'?'percent':'fixed',value:orderSetupNumber(x.value,0),enabled:x.enabled===true,code:typeof x.code==='string'?x.code:''};
 });
 const pct=orderChargePctIds(out.charges);
 /* Коды. Нет вовсе (база до 27.11.2026) — засев, а прежние галочки базы
    («HST: ES, Delivery», «Card fee: ES, HST, Delivery») становятся кодами
    ES, HST и доставки: суммы заказов не меняются. */
 let codes=Array.isArray(s.chargeCodes)?s.chargeCodes:null;const was=!codes;
 if(was)codes=JSON.parse(JSON.stringify(ORDER_CODE_SEED));
 const kids=new Set();
 out.chargeCodes=codes.filter(x=>x&&typeof x==='object').map(x=>{
  let id=orderChargeId(x.id,'code-');while(kids.has(id))id=id+'-2';kids.add(id);
  const on=orderChargeSet(x.on,pct);
  return {id,name:String(x.name==null?'':x.name).trim().slice(0,40)||orderCodeName(on,out.charges),on};
 });
 if(!out.chargeCodes.length)out.chargeCodes=JSON.parse(JSON.stringify(ORDER_CODE_SEED));
 const first=out.chargeCodes[0].id,has=id=>out.chargeCodes.some(c=>c.id===id);
 if(was){
  const flag=(k,def)=>typeof s[k]==='boolean'?s[k]:def;
  out.energyCode=orderCodeFor(out,[flag('hstOnEnergy',true)&&'hst',flag('cardOnEnergy',true)&&'card']);
  out.hstCode=orderCodeFor(out,[flag('cardOnHst',true)&&'card']);
  out.deliveryCode=orderCodeFor(out,[flag('hstOnDelivery',false)&&'hst',flag('cardOnDelivery',false)&&'card']);
  out.skidDepositCode=orderCodeFor(out,[]);
 }else ORDER_CHARGE_CODED.forEach(k=>{out[k+'Code']=has(s[k+'Code'])?s[k+'Code']:first;});
 out.charges.forEach(x=>{if(!has(x.code))x.code=first;});
 /* Код новой работы и нового разового сервиса. */
 ['workCode','extraCode'].forEach(k=>{out[k]=has(s[k])?s[k]:first;});
 DB.orderSetup=out;
}
function orderChargeId(v,prefix){return typeof v==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(v)?v:prefix+Math.random().toString(36).slice(2,8);}
/* Процентные сборы по порядку начисления: ES → HST → свои % → Card fee. */
function orderChargePctIds(charges){return ['energy','hst'].concat((charges||[]).filter(x=>x.kind==='percent').map(x=>x.id),['card']);}
/* Набор сборов: только известные процентные, по порядку начисления. */
function orderChargeSet(on,pct){const l=Array.isArray(on)?on:typeof on==='string'?on.split(','):[];return pct.filter(k=>l.includes(k));}
function orderChargeLabel(k,charges){return k==='energy'?'ES':k==='hst'?'HST':k==='card'?'Card fee':((charges||[]).find(x=>x.id===k)||{}).name||k;}
/* Набор словами: «ES · HST · Card fee», пусто — «nothing». */
function orderChargeSetText(on,charges){return on.length?on.map(k=>orderChargeLabel(k,charges)).join(' · '):'nothing';}
/* Имя кода по набору: Standard, HST + card, Card only, No charges… */
function orderCodeName(on,charges){
 if(!on.length)return 'No charges';
 const all=orderChargePctIds(charges);if(all.every(k=>on.includes(k)))return 'Standard';
 const n=on.map(k=>k==='card'?'card':orderChargeLabel(k,charges));
 return on.length===1?(on[0]==='card'?'Card only':n[0]+' only'):n.join(' + ');
}
/* Код с этим набором; нет — заводится. */
function orderCodeFor(s,set){
 const pct=orderChargePctIds(s.charges),on=orderChargeSet(set.filter(Boolean),pct),key=on.join(',');
 const hit=s.chargeCodes.find(c=>c.on.join(',')===key);if(hit)return hit.id;
 const id='code-'+(key.replace(/[^a-z0-9]+/gi,'-')||'none');s.chargeCodes.push({id,name:orderCodeName(on,s.charges),on});return id;
}
normalizeOrderSetup();
function orderSetup(){return DB.orderSetup||ORDER_SETUP_DEFAULT;}
/* Due date по приоритету (владелец 17.11.2026): Normal 7, Rush 3, Critical 1
   рабочих дней (Пн–Пт, праздники не считаем) от дня from (пусто — сегодня).
   Числа — Data → Setup. Ответ — 'YYYY-MM-DD' по местному времени. */
function salesDueDays(priority){const s=orderSetup();return priority==='critical'?s.dueCriticalDays:priority==='rush'?s.dueRushDays:s.dueNormalDays;}
function salesDueDate(priority,from){
 const d=from?new Date(from):new Date();if(isNaN(d))return '';
 d.setHours(12,0,0,0);let n=Math.max(0,Math.round(+salesDueDays(priority)||0));
 while(n>0){d.setDate(d.getDate()+1);const w=d.getDay();if(w!==0&&w!==6)n--;}
 const p=x=>String(x).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
function orderSetupNetwork(id){return orderSetup().cardNetworks.find(x=>x.id===id)||null;}
function orderSetupCode(id){const s=orderSetup();return s.chargeCodes.find(c=>c.id===id)||null;}
/* Набор кода Setup: null — кода нет (значит «по умолчанию»). */
function orderSetupCodeOn(id){const c=id&&orderSetupCode(id);return c?c.on.slice():null;}
/* Снимок для нового заказа: ставки, первая карта списка, коды и наборы. */
function salesOrderChargeDefaults(){
 const s=orderSetup(),n=s.cardNetworks[0]||{id:'',name:'Card fee',rate:0},on=id=>orderSetupCodeOn(id)||[];
 return {
  codes:JSON.parse(JSON.stringify(s.chargeCodes)),
  items:{code:s.chargeCodes[0].id,on:on(s.chargeCodes[0].id)},
  energy:{enabled:s.energyOn,rate:s.energyRate,code:s.energyCode,on:on(s.energyCode)},
  hst:{enabled:s.hstOn,rate:s.hstRate,code:s.hstCode,on:on(s.hstCode)},
  card:{enabled:s.cardOn,network:n.id,name:n.name||'Card fee',rate:n.rate},
  delivery:{enabled:s.deliveryOn,amount:s.deliveryAmount,code:s.deliveryCode,on:on(s.deliveryCode)},
  skidDeposit:{enabled:s.skidDepositOn,amount:s.skidDepositAmount,code:s.skidDepositCode,on:on(s.skidDepositCode)},
  extra:s.charges.map(x=>({id:x.id,name:x.name,kind:x.kind,value:x.value,enabled:x.enabled,code:x.code,on:on(x.code)}))
 };
}
function orderSetupFrit(){const s=orderSetup();return {dotMm:s.fritDotMm,margin16:s.fritMargin16,marginFrom:s.fritCorner};}
