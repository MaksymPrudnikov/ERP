/* Заготовки отчётов и Board: заказ с нужным стеклом, батч, номера стёкол,
   человек с PIN, время «N дней назад в ЧЧ:ММ», скан станции, вход на станцию.
   Используют test/reports.js и test/report-engine.js. */
module.exports=async function(p){
 await p.evaluate(()=>{
  /* Заказ: стекло, тип юнита и строки [ширина, высота, кол-во]. Особая цена
     клиента на все работы — 0.013 за единицу, как в заготовке очередей. */
  window.rbOrder=function(c,code,type,lines,extra){
   tab='sales';salesOrderNew('order');salesSetUnitType(type);
   const m=soDraft.makeups[0],g=glassProductByCode(code);
   m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=g.thicknessMm;p.priceOverride=5.55;p.heatTreatmentId='HT-FT';p.heatSoak=false;});(m.cavities||[]).forEach(x=>{x.priceOverride=3.1;});soDraft.lines=[];
   lines.forEach(x=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:x[0]*16,height16:x[1]*16,qty:x[2]});soDraft.lines.push(l);salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});});
   salesApplyCustomerDefaults(c.id);Object.assign(soDraft,extra||{});if(!salesOrderSave())throw new Error('Order did not save');const id=soDraft.id;soDraft=null;soEdit=null;return id;
  };
  window.rbBatch=function(ids){ids.forEach(id=>salesSetRecordStatus(id,'verified'));glassBatchAssign(glassBatchRows(ids.map(salesRecord)),{});};
  window.rbIds=function(id){const o=salesRecord(id),pm=glassPieceMap(id);return o.lines.flatMap(l=>glassBatchComponents(o,l).flatMap(c=>pm.get(c.key).ids));};
  window.rbUser=function(name,pin){DB.user=DB.user.filter(u=>u.name!==name);DB.user.push({name,pin,access:[]});normalizeUsers();const u=DB.user.find(x=>x.name===name);return {id:u.viewProfileId,name};};
  window.rbAt=function(days,h,m){const d=new Date();d.setDate(d.getDate()+days);d.setHours(h,m,0,0);return d.toISOString();};
  window.rbGo=function(st,piece,who,now){const c=stationCheck(st,piece);if(!c||c.kind!=='ok')throw new Error(st+' '+piece+' '+(c&&c.kind));return stationRecord(st,c,who,now?{now}:{});};
  window.rbStation=function(code,who){try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode=code;tab='station';stationTab='scan';stationDrawer=null;stationLogin(who.id);};
 });

};
