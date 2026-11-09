/* Расчёт заказа без soDraft (этап 4 плана «до 10»): заказ → итоги — одна
   функция с заказом в параметре. Итоги эталонов до цента те же, что считал
   прежний расчёт (снятые с main до правки); расчёт не читает открытый в Sales
   заказ: soDraft-ловушка (любое чтение — ошибка) и другой открытый заказ
   дают те же числа. Эталоны — test/order-totals-fixture.js. */
module.exports=async function({page,eq}){
 console.log('order totals');const t=await page();
 await require('./optimization-fixture')(t.p);
 await require('./order-totals-fixture')(t.p);
 await t.p.evaluate(()=>{window.otIds=otBuild();soDraft=null;soEdit=null;tab='sales';render();});

 /* Числа — с main до правки (finWithOrder): Subtotal, Energy, HST, Card,
    Delivery, Skid deposit, Total, полный, без цены, юнитов. Эталон 7 — фигура
    40 × 60, 10 мм: с 09.11.2026 её стекло по режущему прямоугольнику (Safety
    Border сверху 1 1/2″ → 40 × 62, test/shape-cut-billing): 17.3 ft² вместо
    16.7, строка 206.065 вместо 200.635. */
 eq('эталоны: итоги заказа до цента те же, что до этапа 4',await t.p.evaluate(()=>otIds.map(id=>otSnap(salesRecord(id)).totals)),
  [[312.32,30.45,44.56,9.06,50,75,521.39,true,0,6],[149.76,14.6,21.37,0,0,0,185.73,true,0,2],[1270.88,123.91,181.32,0,0,0,1576.11,true,0,6],[166.92,16.28,23.82,0,0,0,207.02,true,0,1],
   [329.58,32.13,47.02,0,0,0,408.73,true,0,1],[700.16,68.27,99.9,0,0,0,868.33,true,0,2],[418.67,40.82,59.73,12.15,50,75,656.37,true,0,4]]);
 eq('эталоны: сумма каждой строки точно и в центах',await t.p.evaluate(()=>otIds.map(id=>{const o=salesRecord(id);return o.lines.map(l=>{const p=salesLineCommercialPrice(l,o);return [+p.exact.toFixed(6),p.line];});})),
  [[[143.76,143.76],[144.72,144.72],[23.84,23.84]],[[149.76,149.76]],[[1136.094548,1136.09],[134.785,134.78]],[[166.9248,166.92]],[[329.58,329.58]],[[700.16,700.16]],[[206.065,206.06],[150,150]]]);
 eq('Finance и бланк Invoice берут тот же итог',await t.p.evaluate(()=>otIds.map(id=>{const s=otSnap(salesRecord(id));return s.finance===s.totals[6]&&JSON.parse(s.invoice)[0].grand.value==='$'+s.totals[6].toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');})),[true,true,true,true,true,true,true]);

 eq('расчёт не читает soDraft: ловушка на месте открытого заказа — те же числа, работы, вес и бланк',await t.p.evaluate(()=>{
  const plain=otIds.map(id=>JSON.stringify(otSnap(salesRecord(id))));
  const trap=()=>{throw new Error('soDraft read');};let got,error='';
  soDraft=new Proxy({},{get:trap,has:trap,set:trap,ownKeys:trap,getOwnPropertyDescriptor:trap,defineProperty:trap,deleteProperty:trap,getPrototypeOf:trap});
  try{got=otIds.map(id=>JSON.stringify(otSnap(salesRecord(id))));}catch(e){error=e.message;}finally{soDraft=null;soEdit=null;}
  return {error,same:!error&&got.every((s,i)=>s===plain[i])};
 }),{error:'',same:true});

 eq('открыт в Sales другой заказ — числа чужих заказов те же; finWithOrder больше нет',await t.p.evaluate(()=>{
  const plain=otIds.map(id=>JSON.stringify(otSnap(salesRecord(id))));
  tab='sales';salesOrderEdit(otIds[otIds.length-1]);const open=soDraft.id;
  const got=otIds.map(id=>id===open?null:JSON.stringify(otSnap(salesRecord(id))));
  soDraft=null;soEdit=null;render();
  return {same:got.every((s,i)=>s===null||s===plain[i]),gone:typeof finWithOrder==='undefined'};
 }),{same:true,gone:true});

 eq('цех и документы чужого заказа без soDraft: наклейка, маршрут, чертёж, Work Order',await t.p.evaluate(()=>{
  const read=()=>otIds.map(id=>{const o=salesRecord(id);return JSON.stringify(o.lines.map(l=>{
   const comps=glassBatchComponents(o,l).filter(c=>!c.missing),d=l.shapeRef&&salesShapeByRef(l.shapeRef)&&salesShapeByRef(l.shapeRef).type!=='rectangle'?salesLineDrawing(l,null,null,o):null;
   return [comps.map(c=>{const g=stkGlassData('production',o,l,c,1);delete g.route;return [g.area,g.weight,g.cut,g.finished,stkRoute(o,l,c).codes];}),d?[!!d.html,d.error||'',(d.html||'').length]:null];
  }).concat([docBuildModel('workOrder',o,docDefaultOptions('workOrder')).items.length]));});
  const plain=read(),trap=()=>{throw new Error('soDraft read');};let got,error='';
  soDraft=new Proxy({},{get:trap,has:trap,set:trap,ownKeys:trap,getOwnPropertyDescriptor:trap,defineProperty:trap,deleteProperty:trap,getPrototypeOf:trap});
  try{got=read();}catch(e){error=e.message;}finally{soDraft=null;soEdit=null;}
  return {error,same:!error&&got.every((s,i)=>s===plain[i]),drawn:plain[6].includes('[true,"",')};
 }),{error:'',same:true,drawn:true});

 eq('расчёт итогов без ошибок страницы',t.errs,[]);await t.c.close();
};
