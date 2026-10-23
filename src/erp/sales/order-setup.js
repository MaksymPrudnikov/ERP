/* =====================================================================
   erp/sales/order-setup  ·  order-setup-1.0
   Настройки нового заказа (план Master Data, этап 5): сборы заказа —
   Energy, HST, комиссия карты, доставка, депозит за скид — и что входит в
   базу каждого сбора; умолчания фрита — точка, отступ и угол. Раньше это
   были числа в коде (9.75, 13, 2.34 / 2.39 / 3.15, 5 мм, 1″). Теперь их
   правят в Data → Setup, а код только читает.
   IN : DB.orderSetup
   OUT: orderSetup(); salesOrderChargeDefaults() — снимок для нового
        заказа; orderSetupFrit() — умолчания фрита нового лайта
   Правило: сохранённый заказ живёт по своему снимку orderCharges (ставки,
   карта, база сборов); правка Setup его не меняет.
   ===================================================================== */
/* Порядок начисления один: Subtotal → Energy → HST → Card fee, доставка и
   депозит — в конце. Настраивается, что входит в базу HST и комиссии карты.
   Депозит за скид — деньги клиента, ни в одну базу не входит. Засев —
   прежнее поведение кода. */
const ORDER_SETUP_DEFAULT={
 energyOn:true,energyRate:9.75,
 hstOn:true,hstRate:13,hstOnEnergy:true,hstOnDelivery:false,
 cardOn:false,cardOnEnergy:true,cardOnHst:true,cardOnDelivery:false,
 cardNetworks:[{id:'visa',name:'Visa card fee',rate:2.34},{id:'mastercard',name:'Mastercard fee',rate:2.39},{id:'amex',name:'American Express fee',rate:3.15}],
 deliveryOn:false,deliveryAmount:0,
 skidDepositOn:false,skidDepositAmount:0,
 fritDotMm:5,fritMargin16:16,fritCorner:'Top right'
};
/* Что может входить в базу сбора, кроме Subtotal. */
const ORDER_CHARGE_BASE_PARTS={hst:['energy','delivery'],card:['energy','hst','delivery']};
DEFAULT.orderSetup=JSON.parse(JSON.stringify(ORDER_SETUP_DEFAULT));
if(!DB.orderSetup||typeof DB.orderSetup!=='object'||Array.isArray(DB.orderSetup))DB.orderSetup=JSON.parse(JSON.stringify(ORDER_SETUP_DEFAULT));

function orderSetupNumber(v,fallback){const n=Number(v);return v!==''&&v!=null&&Number.isFinite(n)&&n>=0?Math.round(n*10000)/10000:fallback;}
function normalizeOrderSetup(){
 const s=DB.orderSetup&&typeof DB.orderSetup==='object'&&!Array.isArray(DB.orderSetup)?DB.orderSetup:{},d=ORDER_SETUP_DEFAULT,out={};
 Object.keys(d).forEach(k=>{
  if(typeof d[k]==='boolean')out[k]=typeof s[k]==='boolean'?s[k]:d[k];
  else if(typeof d[k]==='number')out[k]=orderSetupNumber(s[k],d[k]);
 });
 out.fritDotMm=out.fritDotMm>0?out.fritDotMm:d.fritDotMm;
 out.fritMargin16=Math.round(out.fritMargin16);
 out.fritCorner=FRIT_MARGIN_CORNERS.includes(s.fritCorner)?s.fritCorner:d.fritCorner;
 /* Списка карт нет вовсе (старая база) — засев; список очищен руками —
    остаётся пустым: комиссии тогда нет, пока её не заведут. */
 const ids=new Set();
 out.cardNetworks=(Array.isArray(s.cardNetworks)?s.cardNetworks:d.cardNetworks).filter(x=>x&&typeof x==='object').map(x=>{
  let id=typeof x.id==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(x.id)?x.id:'card-'+Math.random().toString(36).slice(2,8);
  while(ids.has(id))id=id+'-2';ids.add(id);
  return {id,name:String(x.name==null?'':x.name).trim().slice(0,60),rate:orderSetupNumber(x.rate,0)};
 });
 DB.orderSetup=out;
}
normalizeOrderSetup();
function orderSetup(){return DB.orderSetup||ORDER_SETUP_DEFAULT;}
function orderSetupNetwork(id){return orderSetup().cardNetworks.find(x=>x.id===id)||null;}
function orderSetupBase(kind){const s=orderSetup(),key=kind+'On';return ORDER_CHARGE_BASE_PARTS[kind].filter(p=>s[key+p[0].toUpperCase()+p.slice(1)]);}
/* Снимок для нового заказа: ставки, первая карта списка, база сборов. */
function salesOrderChargeDefaults(){
 const s=orderSetup(),n=s.cardNetworks[0]||{id:'',name:'Card fee',rate:0};
 return {
  energy:{enabled:s.energyOn,rate:s.energyRate},
  hst:{enabled:s.hstOn,rate:s.hstRate,base:orderSetupBase('hst')},
  card:{enabled:s.cardOn,network:n.id,name:n.name||'Card fee',rate:n.rate,base:orderSetupBase('card')},
  delivery:{enabled:s.deliveryOn,amount:s.deliveryAmount},
  skidDeposit:{enabled:s.skidDepositOn,amount:s.skidDepositAmount}
 };
}
function orderSetupFrit(){const s=orderSetup();return {dotMm:s.fritDotMm,margin16:s.fritMargin16,marginFrom:s.fritCorner};}
