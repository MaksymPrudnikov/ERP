/* Заказы-эталоны расчёта (этап 4 плана «до 10»): стекло по прайсу и по
   прайсу клиента, дроби, минимум ft², IGU, тройной пакет, ламинат, фрит,
   Heat Soak, фигура с отверстиями и петлями, ставка работы на заказ, цена
   руками, поправка, позиция каталога, отменённый юнит, сборы Energy → HST →
   Card, доставка и депозит скидов. Все сохраняются через Save: цены заказа
   замораживаются в priceBook, а прайс после этого меняется.
   otSnap(o) — что о заказе знает расчёт: итоги, каждая строка, работы, вес,
   итог бланка Invoice. Используют test/order-totals.js. */
module.exports=async function(p){
 await p.evaluate(()=>{
  const r6=v=>typeof v==='number'?+v.toFixed(6):v;
  window.otSnap=function(o){
   const t=salesOrderCommercialTotals(o),pick=(x,ks)=>ks.map(k=>r6(x&&x[k]));
   const lines=(o.lines||[]).map(l=>{
    const p=salesLineCommercialPrice(l,o),a=salesLineAreas(l,o),w=salesLineWeight(l,o);
    return {price:pick(p,['materials','services','base','unit','exact','line','complete']),area:pick(a,['actual','rounded','billable','perimeterIn']),kg:r6(w.kg),
     works:salesLineChargeRows(l,o).map(r=>[r.key,r6(r.basis),salesChargePricingState(l,r,o).effectiveRate])};
   });
   const inv=docBuildModel('invoice',o,docDefaultOptions('invoice'));
   return {totals:pick(t,['subtotal','energy','hst','card','delivery','skidDeposit','grand','complete','missing','qty']),finance:finOrderTotals(o).grand,lines,
    invoice:JSON.stringify([inv.end,(inv.items||[]).map(x=>x.amount)])};
  };
  window.otBuild=function(){
   oqReset();DB.priceList=[];
   const g6=glassProductByCode('6CLEAR'),g10=glassProductByCode('10FLOATGLASS'),g4=glassProductByCode('4CLEAR')||g6;
   g6.salePriceTempered=5.85;g6.salePriceAnnealed=4.2;g10.salePriceTempered=9.05;g4.salePriceAnnealed=4.2;g4.salePriceTempered=5.1;
   const work=id=>DB.serviceRate.find(r=>r.id===id);
   [['roughArris',0.01],['flatPolish',0.07],['cncShapePolish',0.28],['hole:0.5-1',5],['hinge',15],['heat_soak',3.95],['lamiPolish',0.28],['triple',8],['minArea',4]].forEach(([id,v])=>{const w=work(id);if(w&&w.tiers&&w.tiers[0]){w.tiers.forEach(t=>{t.price=v;});w.active=true;}});
   const film=mdById('interlayerProduct','INT-EVA-CL');if(film)film.salePrice=10;
   DB.stockItem.push({id:'STK-OT',type:'stock',name:'OT Handle',code:'',thicknessMm:0,salePrice:37.5,availability:'stock',supplier:'',leadTimeDays:0,subcategory:'door',sellsAsOwnLine:true,active:true});
   const a=oqCustomer({legalName:'Cash Customer'}),b=oqCustomer({legalName:'Price List Customer'});
   DB.priceList.push({id:'PL-OT',kind:'customer',name:'',customerId:b.id,rows:[{id:'PLR-OT',at:'2026-10-22T11:00:00Z',target:'glass:'+g6.id+':salePriceTempered',price:6.1}]});
   const ids=[];
   const order=(c,type,build,extra)=>{
    tab='sales';salesOrderNew('order');salesSetUnitType(type);soDraft.lines=[];
    build(soDraft.makeups[0]);
    salesApplyCustomerDefaults(c.id);soDraft.customerPo='PO-OT';Object.assign(soDraft,extra||{});
    if(!salesOrderSave())throw new Error('Benchmark order did not save');ids.push(soDraft.id);soDraft=null;soEdit=null;
   };
   const line=(m,w,h,q,more)=>{const l=normalizeSalesOrderLine(Object.assign({makeupId:m.id,width16:Math.round(w*16),height16:Math.round(h*16),qty:q},more||{}));soDraft.lines.push(l);salesEnsureLineShape(l);return l;};
   const glass=(p,g,ht,mm)=>{p.glassProductId=g.id;p.thicknessMm=mm||g.thicknessMm;p.heatTreatmentId=ht;p.priceOverride=null;p.heatSoak=false;};
   const charges=on=>{const c=normalizeSalesOrderCharges(soDraft.orderCharges);c.energy.enabled=true;c.hst.enabled=true;if(on){c.card.enabled=true;c.delivery.enabled=true;c.delivery.amount=50;c.skidDeposit.enabled=true;c.skidDeposit.amount=75;}soDraft.orderCharges=c;};
   /* 1. Одиночное 6 мм по прайсу: 36 × 48, дроби, минимум; все сборы. */
   order(a,'single',m=>{glass(m.panes[0],g6,'HT-FT',6);line(m,36,48,2);line(m,23+5/16,47+7/8,3);line(m,10,12,1);charges(true);});
   /* 2. То же стекло клиенту с личным прайсом. */
   order(b,'single',m=>{glass(m.panes[0],g6,'HT-FT',6);line(m,36,48,2);charges(false);});
   /* 3. IGU 6 + 6 с камерой по рецепту, Heat Soak на первом стекле, маленький юнит под минимумом. */
   order(a,'double',m=>{glass(m.panes[0],g6,'HT-FT',6);m.panes[0].heatSoak=true;glass(m.panes[1],g6,'HT-FT',6);(m.cavities||[]).forEach(c=>{c.priceOverride=null;});line(m,35.5,59.75,4);line(m,14,18,2);charges(false);});
   /* 4. Тройной пакет: надбавка Triple. */
   order(a,'triple',m=>{m.panes.forEach(p=>glass(p,g4,'HT-AN',4));(m.cavities||[]).forEach(c=>{c.priceOverride=2.65;});line(m,30,40,1);charges(false);});
   /* 5. Ламинат 6 + 6 EVA. */
   order(a,'single',m=>{const pn=salesDefaultPane(0);pn.category='laminated';['outer','inner'].forEach(k=>{Object.assign(pn.laminated[k],{glassProductId:g6.id,thicknessMm:6,heatTreatmentId:'HT-FT',priceOverride:null});});
    (pn.laminated.interlayers||[]).forEach(f=>{f.productId='INT-EVA-CL';f.priceOverride=null;});m.panes=[pn];line(m,30,72,1);charges(false);});
   /* 6. Фрит на стекле 6 мм. */
   order(a,'single',m=>{const p=m.panes[0];glass(p,g6,'HT-FT',6);p.category='vision';p.visionType='frit';p.frit=Object.assign({},p.frit||{},{enabled:true,productId:'FRIT-DIGITAL',surface:2});line(m,48,96,2);charges(false);});
   /* 7. Фигура 10 мм: скос, отверстия и петли; ставка работы на заказ; цена руками; поправка; позиция каталога. */
   order(a,'single',m=>{glass(m.panes[0],g10,'HT-FT',10);
    const l=line(m,40,60,1),sh=newShapeDef('raked');sh.w='40';sh.h='60';Object.assign(sh.params,{shortHeight:'54',rakeSide:'top',shortSide:'left'});
    sh.manufacturingItems=[shapeNormalizeManufacturingItem({type:'hinge',edge:'left',distance:'10'}),shapeNormalizeManufacturingItem({type:'hinge',edge:'left',distance:'45'})];
    sh.ownerLineId=l.id;DB.shapeDef.push(normalizeShapeDef(sh));l.shapeRef=salesShapeRefFrom(sh);
    line(m,28,76,1,{priceManual:150});
    soDraft.servicePricing={'EDGE:flatPolish':{orderRate:0.1}};soDraft.adjustments=[{id:'ADJ-OT',label:'Correction',amount:-12.4}];
    soDraft.extraItems=[normalizeSalesExtraItem({table:'stockItem',itemId:'STK-OT',qty:2})];charges(true);});
   /* После Save прайс стекла и плёнки меняется: сохранённые заказы остаются
      при своих ценах (priceBook). */
   g6.salePriceTempered=9.99;g10.salePriceTempered=19.99;if(film)film.salePrice=99;
   return ids;
  };
 });
};
