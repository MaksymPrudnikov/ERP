/* Чертежи на станциях. У прямоугольника под плашкой NEXT — схема стекла в
   пропорциях с размерами (владелец, 01.10.2026). Владелец, 29.09.2026: «на всех станциях можно было
   просмотреть чертежи по заказам или при сканировании стикера». Скан стекла
   с формой — мини-лист на карточке, нажатие — крупно; у прямоугольника —
   кнопка Drawing; в шапке Drawings — заказы станции, номер заказа или
   стикер стекла; листание ‹ › и ← →; в «Waiting here» — Drawing. */
module.exports=async function({page,eq,ok}){
 console.log('station-drawings');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.sdReset=function(){oqReset();DB.stationScan=[];DB.stationScanSeq=0;stationLast=null;stationSheetView=null;stationNote='';stationDrawer=null;stationMenu=null;stationTab='scan';stationHereOpen='';
   if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));};
  window.sdOrder=function(){
   const id=oqOrder(oqCustomer({legalName:'North Shore Windows'}),{dueDate:'2026-10-06'});
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=[[36,36,2],[30,20,1],[24,24,1]].map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;
   const o=salesRecord(id),l=o.lines[0],s=newShapeDef('custom');s.type='circle';s.w='36';s.h='36';
   const def=normalizeShapeDef(s);def.ownerLineId=l.id;DB.shapeDef.push(def);l.shapeRef=salesShapeRefFrom(def);salesSyncLineFromShape(l,def);
   oqThrough(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
   const pm=glassPieceMap(id),o2=salesRecord(id),ids=o2.lines.map(x=>{const c=glassBatchComponents(o2,x)[0];return pm.get(c.key).ids[0];});
   return {id,no:o2.businessNumber,ids};
  };
  window.sdLogin=function(station){DB.user=DB.user.filter(u=>u.name!=='Oleg K.');DB.user.push({name:'Oleg K.',role:'Shop',station,skills:[],pin:'0000'});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode=station;tab='station';stationLogin(DB.user[DB.user.length-1].viewProfileId);};
  window.sdOut=function(){stationSwitch();tab='dashboard';render();};
 });

 eq('скан стекла с формой: мини-лист на карточке; нажатие — лист крупно, строки заказа лентой, ← → листают; прямоугольник — только кнопка Drawing',await (async()=>{
  const r=await t.p.evaluate(()=>{
   sdReset();const x=sdOrder();window.sdX=x;x.ids.forEach(g=>{const c=stationCheck('CUT',g);stationRecord('CUT',c,{id:'x',name:'Ivan'});});sdLogin('ARRIS');
   stationSubmit(x.ids[0]);
   const thumb=document.querySelector('[data-station-drawthumb]'),out={thumb:!!thumb,thumbSvg:!!(thumb&&thumb.querySelector('svg')),btn:!!document.querySelector('[data-station-drawing]')};
   thumb.click();return out;
  });
  await t.p.waitForTimeout(80);
  const big=await t.p.evaluate(()=>{
   const box=document.querySelector('[data-station-draw]'),first=box.dataset.stationDraw===salesRecord(sdX.id).lines[0].id;
   const chips=[...box.querySelectorAll('[data-station-draw-line]')].map(b=>b.dataset.stationDrawLine).join(),svg=!!box.querySelector('.print-sheet svg'),title=box.querySelector('h2').textContent.includes(sdX.no);
   return {first,chips,svg,title};
  });
  await t.p.keyboard.press('ArrowRight');
  const flip=await t.p.evaluate(()=>{
   const second=document.querySelector('[data-station-draw]').dataset.stationDraw===salesRecord(sdX.id).lines[1].id;
   stationCloseDrawer();stationSubmit(sdX.ids[1]);
   const pv=document.querySelector('[data-station-glassprev]'),box=pv&&pv.querySelector('rect').getBBox();
   const rect={thumb:!!document.querySelector('[data-station-drawthumb]'),btn:!!document.querySelector('[data-station-drawing]'),
    preview:!!pv&&pv.textContent.includes('Rectangle · 30 × 20'),wide:!!box&&box.width>box.height*1.4&&box.width<box.height*1.6};
   sdOut();return {second,rect};
  });
  return Object.assign(r,big,flip);
 })(),{thumb:true,thumbSvg:true,btn:true,first:true,chips:'1,2,3',svg:true,title:true,second:true,rect:{thumb:false,btn:true,preview:true,wide:true}});

 eq('шапка Drawings: заказы станции одним нажатием; номер заказа или стикер стекла; неизвестный — подсказка; в «Waiting here» — Drawing',await t.p.evaluate(()=>{
  sdReset();const x=sdOrder();x.ids.forEach(g=>stationRecord('CUT',stationCheck('CUT',g),{id:'x',name:'Ivan'}));sdLogin('ARRIS');
  document.querySelector('[data-station-drawings]').click();
  const orders=[...document.querySelectorAll('[data-station-draw-order]')].map(b=>b.dataset.stationDrawOrder).join()===x.no;
  document.querySelector('[data-station-draw-order]').click();const byOrder=document.querySelector('[data-station-draw]').dataset.stationDraw===salesRecord(x.id).lines[0].id;
  stationDrawFind(x.ids[2]);const byGlass=document.querySelector('[data-station-draw]').dataset.stationDraw===salesRecord(x.id).lines[2].id;
  stationDrawFind(String(+x.ids[1].slice(2)));const byDigits=document.querySelector('[data-station-draw]').dataset.stationDraw===salesRecord(x.id).lines[1].id;
  stationDrawFind('99999');const miss=document.querySelector('[data-station-draw] .st-pin-err').textContent;
  stationDrawPick();stationDrawFind(x.no);const byNumber=document.querySelector('[data-station-draw]').dataset.stationDraw===salesRecord(x.id).lines[0].id;
  stationCloseDrawer();document.querySelector('[data-station-here]').click();const here=!!document.querySelector('[data-station-here-drawing]');
  document.querySelector('[data-station-here-drawing]').click();const fromHere=!!document.querySelector('[data-station-draw]');
  const scans=DB.stationScan.filter(s=>s.station==='ARRIS').length;
  sdOut();return {orders,byOrder,byGlass,byDigits,miss,byNumber,here,fromHere,scans};
 }),{orders:true,byOrder:true,byGlass:true,byDigits:true,miss:'Order 99999 not found',byNumber:true,here:true,fromHere:true,scans:0});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
