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

 /* Владелец, 8.10.2026: «никаких ограничений, скип есть всегда… человеческий
    фактор в действии». Отказ — только там, где делать нечего. */
 eq('отказ только там, где делать нечего: пустой выбор, будущий день, больше штук, чужое стекло',await t.p.evaluate(()=>{
  const id=skNew();oqThrough(id,'batched');const l=salesRecord(id).lines[0],run=d=>skipRun(Object.assign({orderId:id,to:'pickup',date:finToday()},d)).error||'';
  return {empty:run({}),future:run({lines:{[l.id]:1},date:finAddDays(finToday(),1)}),many:run({lines:{[l.id]:5}}),foreign:run({codes:['G-9999999']}),skips:DB.skip.length};
 }),{empty:'Choose what to skip.',future:'Check the date.',many:'Line 1: only 2 of 5 can be skipped.',foreign:'G-9999999 is not in this order.',skips:0});

 eq('Skip есть всегда: заказ, строка и юнит на Hold — выдача проходит, Hold остаётся; стекло сканировали позже выбранного дня — проходит тем днём',await t.p.evaluate(()=>{
  const id=skNew();oqThrough(id,'batched');const o=salesRecord(id),[l1,l2]=o.lines;
  skPieces(id).filter(x=>stationGlass(x).l.id===l2.id).forEach(x=>skScan('CUT',x));
  salesHoldApply([id],'Unpaid');l2.onHold=true;l2.holdReason='Check';
  const r=skipRun({orderId:id,lines:{[l1.id]:1},to:'pickup',date:finToday()}),ps=shippingForOrder(id).map(s=>s.status);
  const later=skipRun({orderId:id,lines:{[l2.id]:'all'},to:'HEAT',date:finAddDays(finToday(),-5)});
  return {ok:[r.error||'ok',later.error||'ok'],ps,hold:[salesRecord(id).onHold,salesRecord(id).lines[1].onHold],day:later.date===finAddDays(finToday(),-5)};
 }),{ok:['ok','ok'],ps:['delivered'],hold:[true,true],day:true});

 eq('суббота: стекло порезали из стока в 15:00 и сразу отдали — Skip на субботу проходит, отметки после реза, PS и счёт — субботой',await t.p.evaluate(()=>{
  const id=skSingle();oqThrough(id,'verified');const piece=glassBatchRows([salesRecord(id)])[0].piece,sat=finAddDays(finToday(),-2);
  skScan('CUT',piece);const cut=DB.stationScan.filter(x=>x.piece===piece).pop();cut.at=new Date(sat+'T15:00:00').toISOString();
  const r=skipRun({orderId:id,codes:[piece],to:'pickup',date:sat,receivedBy:'ABS'}),marks=DB.stationScan.filter(x=>x.piece===piece&&x!==cut);
  const s=shippingForOrder(id)[0];
  return {ok:r.error||'ok',after:marks.every(x=>x.at>cut.at&&finLocalDate(x.at)===sat),stations:marks.map(x=>x.station),ps:[s.status,s.date===sat],shipped:stationPlace(stationGlass(piece)).shipped};
 }),{ok:'ok',after:true,stations:['ARRIS','HEAT','SHIPR','SHIP'],ps:['delivered',true],shipped:true});

 eq('ничего не висит: одно стекло из 10 — Skip до станции, 9 в батч → 10/10; весь заказ Skip из New — строк «без батча» нет, заказ закрывается',await t.p.evaluate(()=>{
  const id=skSingle();oqThrough(id,'verified');const piece=glassBatchRows([salesRecord(id)])[0].piece;
  skipRun({orderId:id,codes:[piece],to:'HEAT',date:finToday()});glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
  const o=salesRecord(id),p=glassBatchProgress(o),part=[p.assigned+'/'+p.total,salesUnbatchedLines(o).length,salesStatusPill(o).replace(/<[^>]+>/g,'')];
  const all=skNew();skipRun({orderId:all,lines:Object.fromEntries(salesRecord(all).lines.map(l=>[l.id,'all'])),to:'pickup',date:finToday()});const a=salesRecord(all);
  return {part,whole:[a.status,salesUnbatchedLines(a).length,salesRecordTransitionAllowed(a,'closed')]};
 }),{part:['10/10',0,'Batched 🔒'],whole:['done',0,true]});

 eq('Undo раннего Skip не стирает позднюю выдачу задним числом; отказ атомарен',await t.p.evaluate(()=>{
  const id=skNew(),l=salesRecord(id).lines[1],first=skipRun({orderId:id,lines:{[l.id]:'all'},to:'HEAT',date:finToday()});
  const last=skipRun({orderId:id,codes:[first.pieces[0]],to:'pickup',date:finAddDays(finToday(),-5)}),before=JSON.stringify(DB),r=skipUndo(first.id);
  return {picked:!last.error,blocked:!!r.error,same:JSON.stringify(DB)===before,delivered:shippingForOrder(id).every(s=>s.status==='delivered')};
 }),{picked:true,blocked:true,same:true,delivered:true});

 eq('Undo Skip до готовности не разрушает созданный после него packing slip',await t.p.evaluate(()=>{
  const id=skNew(),l=salesRecord(id).lines[1],k=skipRun({orderId:id,lines:{[l.id]:'all'},to:'SHIPR',date:finToday()}),o=salesRecord(id);
  const ps=shippingCreate({customerId:o.customerId,method:'pickup',date:finToday(),items:shippingAvailable(o).map(shippingItem)}),before=JSON.stringify(DB),r=skipUndo(k.id);
  return {planned:ps.ok,blocked:!!r.error,same:JSON.stringify(DB)===before};
 }),{planned:true,blocked:true,same:true});

 eq('Skip выбирает станцию реального маршрута: Single → IGU и повторный HEAT не пишут ложный успех',await t.p.evaluate(()=>{
  const id=skSingle(),l=salesRecord(id).lines[0],before=JSON.stringify(DB),bad=skipRun({orderId:id,lines:{[l.id]:'all'},to:'IGU',date:finToday()}),same=JSON.stringify(DB)===before;
  const good=skipRun({orderId:id,lines:{[l.id]:'all'},to:'HEAT',date:finToday()}),after=JSON.stringify(DB),repeat=skipRun({orderId:id,lines:{[l.id]:'all'},to:'HEAT',date:finToday()});
  return {offRoute:!!bad.error,same,good:!!good.actionId,repeat:!!repeat.error,unchanged:JSON.stringify(DB)===after};
 }),{offRoute:true,same:true,good:true,repeat:true,unchanged:true});

 eq('после полного Skip до HEAT / SHIPR / SHIP / выдачи нет пустого Batched из New или Verified',await t.p.evaluate(()=>{
  const results=[];for(const status of ['new','verified'])for(const to of ['HEAT','SHIPR','SHIP','pickup']){
   const id=skSingle();if(status==='verified')salesSetRecordStatus(id,'verified');const l=salesRecord(id).lines[0],r=skipRun({orderId:id,lines:{[l.id]:'all'},to,date:finToday()}),o=salesRecord(id),before=JSON.stringify(DB);
   results.push(!r.error&&!salesRecordTransitionAllowed(o,'batched')&&!salesSetRecordStatus(id,'batched')&&!glassBatchRows([o]).length&&before===JSON.stringify(DB));
  }return results;
 }),Array(8).fill(true));

 eq('частичный Skip оставляет девять свободных G для батча; Undo последнего Skip возвращает остаток',await t.p.evaluate(()=>{
  const id=skSingle(),l=salesRecord(id).lines[0],k=skipRun({orderId:id,lines:{[l.id]:1},to:'HEAT',date:finToday()}),rows=glassBatchRows([salesRecord(id)]),allowed=salesRecordTransitionAllowed(salesRecord(id),'batched');
  const assigned=salesSetRecordStatus(id,'batched'),pieces=DB.glassBatch.flatMap(b=>b.items.map(i=>i.piece));
  const restored=skipUndo(k.id);return {rows:rows.length,allowed,assigned,count:pieces.length,skipped:pieces.includes(k.pieces[0]),undone:!restored.error,left:glassBatchRows([salesRecord(id)]).length};
 }),{rows:9,allowed:true,assigned:true,count:9,skipped:false,undone:true,left:1});

 eq('Undo из станционного журнала не обходит защиту последующего Skip задним числом',await t.p.evaluate(()=>{
  const id=skSingle(),piece=skPieces(id)[0];skipRun({orderId:id,codes:[piece],to:'CUT',date:finToday()});const cut=stationScansFor(piece)[0];
  skipRun({orderId:id,codes:[piece],to:'HEAT',date:skDay});const before=JSON.stringify(DB),undo=stationUndo(cut.id,skWho);
  return {error:undo.error,same:JSON.stringify(DB)===before,live:stationScansFor(piece).map(s=>s.station)};
 }),{error:'Glass has moved on — undo the later scan first.',same:true,live:['CUT','ARRIS','HEAT']});

 eq('Skip сохраняет перекрёстно склеенные пары LAM внутри IGU; Undo возвращает их целыми',await t.p.evaluate(()=>{
  const out=[];for(const byCode of [false,true]){
   const id=skNew();salesOrderEdit(id);const m=soDraft.makeups[0];m.panes[0]=normalizeSalesPane({category:'laminated',laminated:{outerGlassProductId:'GL-6CLEAR',innerGlassProductId:'GL-6CLEAR',interlayerProductId:'INT-PVB030'}},0);m.panes[0].priceOverride=9;soDraft.lines=[soDraft.lines[0]];salesOrderSave();salesDraftDrop();salesSetRecordStatus(id,'verified');
   const o=salesRecord(id),l=o.lines[0],cs=glassBatchComponents(o,l),pm=glassPieceMap(id),ids=cs.map(c=>pm.get(c.key).ids.slice()),[a,b,plain]=ids;
   ids.flat().forEach(p=>{for(let n=0;n<12;n++){const st=stationPlace(stationGlass(p)).waiting;if(st===(plain.includes(p)?'IGU':'LAM'))break;skScan(st,p);}});
   [a[0],b[1],a[1],b[0]].forEach(p=>skScan('LAM',p));const lam=()=>stationAsms(salesRecord(id),salesRecord(id).lines[0],'LAM').map(x=>[...x.lites.values()]),before=JSON.stringify(lam());
   const r=skipRun({orderId:id,...(byCode?{codes:[a[0]]}:{lines:{[l.id]:1}}),to:'SHIPR',date:finToday()}),selected=r.pieces||[];
   const other=[a[1],b[0],plain[1]].map(p=>stationPlace(stationGlass(p)).waiting),undo=skipUndo(r.id);
   out.push({ok:!r.error,pair:selected.includes(a[0])&&selected.includes(b[1])&&!selected.includes(b[0]),other,undo:!undo.error,lam:JSON.stringify(lam())===before,allBack:ids.flat().every(p=>stationPlace(stationGlass(p)).waiting==='IGU')});
  }return out;
 }),[false,true].map(()=>({ok:true,pair:true,other:['IGU','IGU','IGU'],undo:true,lam:true,allBack:true})));

 eq('Skip: U плюс вся строка учитывает выбранный юнит один раз и не производит лишний Recut',await t.p.evaluate(()=>{
  const id=skNew();salesSetRecordStatus(id,'verified');const o=salesRecord(id),l=o.lines[0];skipRun({orderId:id,lines:{[l.id]:1},to:'IGU',date:finToday()});
  const reason=ncrReasonsFor('OFFICE',{activeOnly:true}).find(x=>x.name==='Drawing wrong'),made=recutCreate({orderId:id,where:'OFFICE',reasonId:reason.id,lines:{[l.id]:{on:true,qty:1,which:'unit'}}}),fresh=recutPieces(made.recuts[0]);
  skipOpen(id);skipSetLine(l.id,'all');skipSet('codes',unitIdAt(id,l.id,1));skipSet('to','SHIPR');const saved=skipConfirm(),r=DB.skip.at(-1);
  return {saved,glass:r.pieces.length,assemblies:stationAsms(salesRecord(id),salesRecord(id).lines[0],'IGU').filter(a=>a.unit).length,fresh:fresh.map(p=>stationPlace(stationGlass(p)).waiting),ready:shippingAvailable(salesRecord(id)).filter(u=>u.lineId===l.id).length};
 }),{saved:true,glass:4,assemblies:2,fresh:['CUT','CUT'],ready:2});

 eq('JSON: Skip переживает экспорт и импорт; не массив — понятная ошибка',await t.p.evaluate(()=>{
  const id=skNew();skipRun({orderId:id,lines:{[salesRecord(id).lines[1].id]:'all'},to:'pickup',date:finToday()});
  const src=JSON.parse(JSON.stringify(DB)),next=prepareImportedState(JSON.parse(JSON.stringify(src)));let err='';try{const x=JSON.parse(JSON.stringify(src));x.skip={};prepareImportedState(x);}catch(e){err=e.message;}
  return {same:JSON.stringify(next.skip)===JSON.stringify(src.skip),n:src.skip.length,err};
 }),{same:true,n:1,err:'The "skip" field must be an array.'});

 eq('окно Skip без русского и без ошибок страницы',await t.p.evaluate(()=>{const id=skNew();skipOpen(id);const text=document.querySelector('[data-skip-dialog]').innerText;skipClose();return /[А-яЁё]/.test(text);}),false);
 eq('Skip без ошибок страницы',t.errs,[]);await t.c.close();
};
