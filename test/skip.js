/* Skip — ручной проход стекла из офиса (владелец, 7 октября 2026: «клиенты
   приходят в субботу и забирают заказ… его нужно скипнуть от cutting по
   выдали»; «максимально флексибл»). Меню только у Users и Finance; весь
   заказ от New до выдачи; одно стекло по Glass ID; станция вместо выдачи;
   Undo в Activity log; запреты; JSON. */
module.exports=async function({page,eq}){
 console.log('skip');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.skWho={id:'sk',name:'Skip tester'};
  window.skScan=(st,id)=>{const c=stationCheck(st,id);return STATION_RECORDED.includes(c.kind)?stationMove(st,c,skWho):{kind:c.kind};};
  window.skDay=finAddDays(finToday(),-3);
  window.skPieces=id=>[...stationPieceIndex()].filter(([,h])=>h.orderId===id).map(([p])=>p);
  window.skNew=(extra)=>{oqReset();DB.skip=[];DB.productionRoute=[];stationRouteReset();const id=oqOrder(oqCustomer(),extra);soDraft=null;soEdit=null;tab='sales';return id;};
  /* Одинарное стекло 36 × 24, 10 шт — «одно стекло из большого заказа». */
  window.skSingle=()=>{
   oqReset();DB.skip=[];DB.productionRoute=[];stationRouteReset();const c=oqCustomer();tab='sales';salesOrderNew('order');salesSetUnitType('single');
   const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;p.priceOverride=5.55;p.heatTreatmentId='HT-FT';});
   soDraft.lines=[];const l=normalizeSalesOrderLine({makeupId:m.id,width16:36*16,height16:24*16,qty:10,mark:'Big'});soDraft.lines.push(l);salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});
   salesApplyCustomerDefaults(c.id);if(!salesOrderSave())throw Error('Fixture save failed');const id=soDraft.id;salesDraftDrop();return id;
  };
  /* Права: вход включён, у человека только эти разделы. */
  window.skAs=access=>{const keep={no:window.GF_NO_SIGNIN,user:window.signinUser,on:window.signinOn};window.GF_NO_SIGNIN=false;window.signinUser=()=>({name:'T',viewProfileId:'t',access});window.signinOn=()=>true;
   return ()=>{window.GF_NO_SIGNIN=keep.no;window.signinUser=keep.user;window.signinOn=keep.on;};};
 });

 eq('Skip… в меню заказа только у Users и Finance',await t.p.evaluate(()=>{
  const id=skNew(),menu=()=>salesListContextHTML({id},'').includes('data-menu="skip"'),out={};
  [['sales',['sales']],['finance',['sales','finance']],['users',['sales','users']]].forEach(([k,a])=>{const back=skAs(a);out[k]=[menu(),skipAllowed(),skipRun({orderId:id,lines:{},to:'pickup'}).error||''];back();});
  return out;
 }),{sales:[false,false,'Only Users or Finance can skip.'],finance:[true,true,'Choose what to skip.'],users:[true,true,'Choose what to skip.']});

 eq('весь заказ от New до выдачи одним Skip: ручные отметки на всех станциях, юниты собраны, PS самовывоза этим днём выдан, заказ Done',await t.p.evaluate(()=>{
  const id=skNew();window.skId=id;skipOpen(id);skipSetAll(true);skipSet('date',skDay);skipSet('reason','Picked up Saturday');skipSet('receivedBy','ABS');
  const lines=[...document.querySelectorAll('[data-skip-line] [data-skip-qty]')].map(i=>i.value),ok=skipConfirm();
  const o=salesRecord(id),ps=shippingForOrder(id),scans=DB.stationScan.filter(s=>!s.undoneAt),pieces=skPieces(id);
  return {lines,ok,dialog:!!skipDialog,status:o.status,ps:ps.map(s=>[s.method,s.status,s.date===skDay,s.receivedBy,s.items.length,!!s.skip]),
   shipped:pieces.every(p=>stationPlace(stationGlass(p)).shipped),manual:scans.every(s=>s.manual),by:[...new Set(scans.map(s=>s.by.split(' · ')[0]))],
   units:o.lines.map(l=>stationAsms(o,l,'IGU').map(a=>a.unit).sort()),queue:glassBatchRows([o]).length,invoice:finInvoiceDate(o)===skDay,
   log:DB.orderEvent.filter(e=>e.orderId===id&&e.what==='Skipped').map(e=>e.note)};
 }),{lines:['2','1'],ok:true,dialog:false,status:'done',ps:[['pickup','delivered',true,'ABS',3,true]],shipped:true,manual:true,by:['Skip'],
  units:[[1,2],[1]],queue:0,invoice:true,log:['6 glass · → Picked up · '+await t.p.evaluate(()=>skDay)+' · Picked up Saturday · by ABS · PS-0001']});

 eq('Undo в Activity log снимает весь Skip: PS отменён, отметки сняты, заказ снова New',await t.p.evaluate(()=>{
  orderLogOpen(skId);const btn=document.querySelector('[data-skip-undo]'),had=!!btn;btn.click();
  const o=salesRecord(skId),k=DB.skip[0];orderLogClose();
  return {had,status:o.status,ps:shippingForOrder(skId).map(s=>s.status),live:DB.stationScan.filter(s=>!s.undoneAt&&!s.broken).length,undone:!!k.undoneAt,
   waiting:stationPlace(stationGlass(skPieces(skId)[0])).waiting,again:skipUndo(k.id).error,log:DB.orderEvent.some(e=>e.orderId===skId&&e.what==='Skip undone')};
 }),{had:true,status:'new',ps:['cancelled'],live:0,undone:true,waiting:'CUT',again:'Skip not found.',log:true});

 eq('одно стекло из 10 по Glass ID — порезано из стока, выдано; остальные 9 в To batch, заказ Shipping',await t.p.evaluate(()=>{
  const id=skSingle();oqThrough(id,'verified');const o=salesRecord(id),before=glassBatchRows([o]).length,piece=glassBatchRows([o])[4].piece;
  const r=skipRun({orderId:id,codes:[piece],to:'pickup',date:finToday(),reason:'Rush'});
  const s=shippingForOrder(id)[0];
  return {before,ok:!r.error,status:salesRecord(id).status,ps:[s.status,s.items.map(i=>i.label).join()===piece],queue:glassBatchRows([salesRecord(id)]).map(r=>r.piece).includes(piece),left:glassBatchRows([salesRecord(id)]).length,
   marks:DB.stationScan.filter(x=>x.piece===piece).map(x=>x.station)};
 }),{before:10,ok:true,status:'shipping',ps:['delivered',true],queue:false,left:9,marks:['CUT','ARRIS','HEAT','SHIPR','SHIP']});

 eq('ламинат: весь заказ — плиты собираются на LAM в юниты; Recut без поломки не даёт лишних юнитов',await t.p.evaluate(()=>{
  oqReset();DB.skip=[];DB.recut=[];const c=oqCustomer();tab='sales';salesOrderNew('order');salesSetUnitType('single');const m=soDraft.makeups[0];
  m.panes=[normalizeSalesPane({category:'laminated',laminated:{outerGlassProductId:'GL-6CLEAR',innerGlassProductId:'GL-6CLEAR',interlayerProductId:'INT-PVB030'}},0)];m.cavities=[];m.panes[0].priceOverride=9;
  soDraft.lines=[];const l=normalizeSalesOrderLine({makeupId:m.id,width16:40*16,height16:30*16,qty:2,mark:'Lami'});soDraft.lines.push(l);salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});
  salesApplyCustomerDefaults(c.id);salesOrderSave();const id=soDraft.id;salesDraftDrop();
  const rs=ncrReasonsFor('OFFICE',{activeOnly:true})[0];recutCreate({orderId:id,where:'OFFICE',reasonId:rs.id,lines:{[l.id]:{on:true,qty:1,which:'unit'}}});
  const o=salesRecord(id),left=skipLineLeft(o,o.lines[0]),r=skipRun({orderId:id,lines:{[o.lines[0].id]:'all'},to:'pickup',date:finToday()});
  return {left,ok:!r.error,units:stationAsms(o,o.lines[0],'LAM').filter(a=>a.unit).map(a=>[a.lites.size,a.unit]),ps:shippingForOrder(id)[0].items.length,status:salesRecord(id).status};
 }),{left:2,ok:true,units:[[2,1],[2,2]],ps:2,status:'done'});

 eq('станция вместо выдачи: «SHIPR done» — стекло ждёт SHIP, PS нет, заказ Ready; Undo закрыт, если стекло ушло дальше',await t.p.evaluate(()=>{
  const id=skNew();oqThrough(id,'batched');const o=salesRecord(id);
  const r=skipRun({orderId:id,lines:{[o.lines[1].id]:'all'},to:'HEAT',date:finToday()}),pieces=skPieces(id).filter(p=>stationGlass(p).l.id===o.lines[1].id);
  const at=pieces.map(p=>stationPlace(stationGlass(p)).waiting);skScan('IGU',pieces[0]);
  const blocked=skipUndo(DB.skip[0].id).error==='Glass '+pieces[0]+' has moved on. Undo the later scans first.';
  const r2=skipRun({orderId:id,lines:{[o.lines[0].id]:1},to:'SHIPR',date:finToday()});
  return {ok:!r.error&&!r2.error,at,blocked,ps:shippingForOrder(id).length,waiting:DB.skip[1].pieces.map(p=>stationPlace(stationGlass(p)).waiting),status:salesRecord(id).status};
 }),{ok:true,at:['IGU','IGU'],blocked:true,ps:0,waiting:['SHIP','SHIP'],status:'batched'});

 eq('нельзя: On Hold, дата в будущем, стекло сканировали после даты, пустой выбор, лишнее количество',await t.p.evaluate(()=>{
  const id=skNew();oqThrough(id,'batched');const o=salesRecord(id),l=o.lines[0],run=d=>skipRun(Object.assign({orderId:id,to:'pickup',date:finToday()},d)).error||'';
  const piece=skPieces(id)[0];skScan('CUT',piece);
  const out={empty:run({}),future:run({lines:{[l.id]:1},date:finAddDays(finToday(),1)}),late:run({codes:[piece],date:finAddDays(finToday(),-5)})==='Glass '+piece+' was scanned after this date. Pick a later date.',many:run({lines:{[l.id]:5}}),foreign:run({codes:['G-9999999']})};
  salesHoldApply([id],'Unpaid');out.hold=run({lines:{[l.id]:1}});return out;
 }),{empty:'Choose what to skip.',future:'Check the date.',late:true,many:'Line 1: only 2 of 5 can be skipped.',foreign:'G-9999999 is not in this order.',hold:'Order is On Hold. Release it first.'});

 eq('JSON: Skip переживает экспорт и импорт; не массив — понятная ошибка',await t.p.evaluate(()=>{
  const id=skNew();skipRun({orderId:id,lines:{[salesRecord(id).lines[1].id]:'all'},to:'pickup',date:finToday()});
  const src=JSON.parse(JSON.stringify(DB)),next=prepareImportedState(JSON.parse(JSON.stringify(src)));let err='';try{const x=JSON.parse(JSON.stringify(src));x.skip={};prepareImportedState(x);}catch(e){err=e.message;}
  return {same:JSON.stringify(next.skip)===JSON.stringify(src.skip),n:src.skip.length,err};
 }),{same:true,n:1,err:'The "skip" field must be an array.'});

 eq('окно Skip без русского и без ошибок страницы',await t.p.evaluate(()=>{const id=skNew();skipOpen(id);const text=document.querySelector('[data-skip-dialog]').innerText;skipClose();return /[А-яЁё]/.test(text);}),false);
 eq('Skip без ошибок страницы',t.errs,[]);await t.c.close();
};
