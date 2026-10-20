/* Сервисы, добавленные к строке руками (владелец, 20.10.2026): «+» в окне
   сервисов строки, в Services & prices заказа и в панели выбранных строк.
   Из Master Data — ставка прайса и станция в маршруте; свой — только в этом
   заказе, станции нет, цена — Line rate. */
module.exports=async function({page,eq}){
 console.log('extra-services');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.exOrder=function(){const id=oqOrder(oqCustomer());salesOrderEdit(id);return soDraft;};
  window.exAdd=function(target,form){salesExtraFormOpen(target);if(form.rateId)salesExtraFormSet('rateId',form.rateId);Object.assign(soExtraForm,form);return salesExtraAdd();};
  window.exRows=function(l){return salesLineChargeRows(l).filter(r=>r.key.indexOf('EXTRA:')===0).map(r=>{const st=salesChargePricingState(l,r);return [r.label,r.basis,r.unit,st.effectiveRate,st.origin,r.source];});};
  window.exRoute=function(l){return salesPrintRoute(l,soDraft,salesLineGeometryShape(l),ShapeModule.compute(salesLineGeometryShape(l))).lites[0].stations.map(s=>s.code+':'+s.items.join('/')).join(' > ');};
 });
 eq('строка: свой сервис — цена строки, без станции; из прайса — ставка прайса, площадь юнита по размеру, станция SAND после печи',await t.p.evaluate(()=>{
  const o=exOrder(),l=o.lines[0];
  const n=[exAdd('line:'+l.id,{name:' Crating ',unit:'pc',rate:'25'}),exAdd('line:'+l.id,{rateId:'sandblastFull'})];
  const area=+salesLineAreas(l,o).billable.toFixed(4);
  return {n,rows:exRows(l),area,route:exRoute(l)};
 }),{n:[1,1],rows:[['Crating',1,'pc',25,'line','Custom'],['Simple Sandblasting',18.3,'ft²',4,'catalog','Added']],area:18.3,
  route:'CUT:37″ × 71″ > ARRIS:Rough Arris > HEAT:TEMPERING > SAND:Simple Sandblasting > IGU:IGU assembly'});
 eq('форма: без имени, с нулём и с отрицательной ставкой — отказ с причиной; Cancel закрывает',await t.p.evaluate(()=>{
  const o=exOrder(),l=o.lines[0],out=[];
  out.push([exAdd('line:'+l.id,{name:''}),soExtraForm.error]);
  out.push([exAdd('line:'+l.id,{name:'Crate',qty:'0'}),soExtraForm.error]);
  out.push([exAdd('line:'+l.id,{name:'Crate',rate:'-1'}),soExtraForm.error]);
  salesExtraFormClose();out.push(soExtraForm);return out;
 }),[[0,'Enter a name.'],[0,'Enter a quantity above 0.'],[0,'Enter a valid rate.'],null]);
 eq('заказ: «+» во все строки, где такого ещё нет; одинаковые — одна группа, общая цена ставится разом (и снимает цену строки, как у всех сервисов); повтор — «Already on these lines.»',await t.p.evaluate(()=>{
  const o=exOrder();exAdd('line:'+o.lines[0].id,{name:'Crating',unit:'pc',rate:'25'});
  const n=exAdd('order',{name:'crating',unit:'pc'}),counts=o.lines.map(l=>(l.extraServices||[]).length);
  const again=[exAdd('order',{name:'Crating',unit:'pc'}),soExtraForm.error];salesExtraFormClose();
  const g=salesOrderChargeGroups().find(g=>g.label==='Crating');salesSetOrderGroupRate(g.key,'30');
  return {n,counts,again,group:[g.entries.length,g.unpriced],rates:o.lines.map(l=>exRows(l)[0][3])};
 }),{n:1,counts:[1,1],again:[0,'Already on these lines.'],group:[2,1],rates:[30,30]});
 eq('выбранные строки: «+ Service» в панели — только в них; Remove убирает строку и её цену',await t.p.evaluate(()=>{
  const o=exOrder(),[a,b]=o.lines;soSelectedLines=new Set([b.id]);render();
  const bulk=!!document.querySelector('[data-extra-bulk]');
  document.querySelector('[data-extra-bulk]').click();const label=document.querySelector('[data-extra-add]').textContent;
  Object.assign(soExtraForm,{name:'Delivery',unit:'pc',rate:'40'});salesExtraAdd();
  const got=[(a.extraServices||[]).length,(b.extraServices||[]).length],key=salesLineChargeRows(b).find(r=>r.label==='Delivery').key;
  salesExtraRemove(b.id,b.extraServices[0].id);soSelectedLines=new Set();salesCloseServices();
  return {bulk,label,got,after:[b.extraServices===undefined,!!(b.chargePricing||{})[key]]};
 }),{bulk:true,label:'Add',got:[0,1],after:[true,false]});
 eq('сохранение: сервисы в заказе; мусор чистится; документ клиента — с ценой за юнит; работа из прайса в строке из батча — изменение, свой сервис — нет',await t.p.evaluate(()=>{
  const o=exOrder(),l=o.lines[0];exAdd('line:'+l.id,{name:'Crating',unit:'pc',rate:'25'});salesOrderSave();
  const saved=salesRecord(o.id).lines[0].extraServices.map(x=>[x.rateId,x.name,x.unit,x.qty]);
  const bad=normalizeSalesOrderLine({extraServices:[{rateId:'sandblastFull',name:'x',unit:'m',qty:-2},{name:'Fee',unit:'kg',qty:'3'}]}).extraServices.map(x=>[x.rateId,x.name,x.unit,x.qty]);
  const doc=docServiceRows(salesRecord(o.id).lines[0]).filter(r=>r.label==='Crating').map(r=>r.value);
  const snap=x=>{const c=JSON.parse(JSON.stringify(l));c.extraServices=x;return salesLockedLineSnapshot(o,c);};
  const base=snap([]);
  return {saved,bad,doc,custom:snap([{id:'SX-1',rateId:'',name:'Fee',unit:'pc',qty:null}])===base,catalog:snap([{id:'SX-2',rateId:'sandblastFull',name:'',unit:'',qty:null}])===base};
 }),{saved:[['','Crating','pc',null]],bad:[['sandblastFull','','',null],['','Fee','pc',3]],doc:[25],custom:true,catalog:false});
 eq('окно строки: «+ Add service», у добавленного — Remove; у Services & prices — «+ Add service to all 2 lines»',await t.p.evaluate(()=>{
  const o=exOrder(),l=o.lines[0];salesOpenLineServices(l.id);
  const open=document.querySelector('[data-extra-open]').textContent;exAdd('line:'+l.id,{name:'Crating',unit:'pc',rate:'25'});
  const remove=document.querySelectorAll('[data-extra-remove]').length;salesOpenOrderServices();
  const order=document.querySelector('[data-extra-open]').textContent;salesCloseServices();
  return {open,remove,order};
 }),{open:'+ Add service',remove:1,order:'+ Add service to all 2 lines'});
 /* Имя без латиницы давало пустой ключ группы: «Шлифовка» и «Покраска»
    склеивались, второй сервис не добавлялся (аудит 21.10.2026). Латинские
    имена сохраняют прежний ключ — их сохранённые цены не сдвигаются. */
 eq('свой сервис: имена без латиницы — разные группы, латинские — прежний ключ',await t.p.evaluate(()=>{
  const o=exOrder(),l=o.lines[0],n=[exAdd('line:'+l.id,{name:'Шлифовка',unit:'pc'}),exAdd('line:'+l.id,{name:'Покраска',unit:'pc'}),exAdd('line:'+l.id,{name:'шлифовка',unit:'pc'})];
  return {n,names:exRows(l).map(r=>r[0]),latin:salesExtraServiceGroup(normalizeSalesExtraService({name:'Touch-up paint',unit:'pc'}))};
 }),{n:[1,1,0],names:['Шлифовка','Покраска'],latin:'EXTRA:custom-touch-up-paint-1'});
 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
