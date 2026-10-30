/* Лист долли/скида по станциям (15.10.2026): набор колонок листа у каждой
   станции в Data → Stations с образцом, окно в офисе — с набором станции,
   что положила стекло (свой набор человека важнее), кнопка печати на экранах
   станций (SHIPR: «Print what is on SA-11»), Shipping → Skid sheet — тот же
   лист. */
module.exports=async function({page,eq,ok}){
 console.log('carrier-sheet');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{window.csPrinted=(window.csPrinted||0)+1;};
  window.csReset=function(){oqReset();DB.stationScan=[];DB.stationScanSeq=0;DB.carrier=[];DB.carrierSeq={};DB.carrierCols=[];DB.skidReturn=[];DB.truck=[];carrierWin=null;sfSheetEdit='';salesDialog=null;stationDrawer=null;stationLast=null;
   DB.station.forEach(s=>{delete s.sheetCols;});carrierAdd('DL',3);carrierAdd('SL',3);window.csPrinted=0;};
  /* Стеклопакеты заказа — готовы, на скиде SL-1, положил SHIPR. */
  window.csSkid=function(name){const c=oqCustomer({legalName:name||'Kingsway Renovations'}),id=oqOrder(c);salesDraftDrop();oqThrough(id,'ready');
   shippingAvailable(salesRecord(id)).forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-1';}));return id;};
  window.csLogin=function(station,name){DB.user=DB.user.filter(u=>u.name!==name);DB.user.push({name,role:'Shop',station,skills:[],pin:'0000'});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode=station;tab='station';stationIncoming='';stationLogin(DB.user[DB.user.length-1].viewProfileId);render();};
  window.csHeads=function(){return [...document.querySelectorAll('#carrierPrintHost thead th')].map(th=>th.textContent).join(',');};
  window.csWinHeads=function(){return [...document.querySelectorAll('[data-carrier-window] thead th')].map(th=>th.textContent).filter(Boolean).slice(0,4).join(',');};
 });

 eq('Data → Stations: колонка Dolly / skid sheet, у SHIPR свой набор — без Customer, Size вторым, образец листа справа; переживает нормализацию и импорт; All columns — снова все; в Production → Stations — только чтение',await t.p.evaluate(()=>{
  csReset();csSkid();tab='masterdata';mdTab='stations';render();
  const head=[...document.querySelectorAll('thead th')].some(th=>th.textContent==='Dolly / skid sheet'),before=document.querySelector('[data-sf-sheet-cols="SHIPR"]').textContent;
  document.querySelector('[data-sf-sheet="SHIPR"]').click();const preview=document.querySelector('[data-sf-sheet-editor="SHIPR"] [data-carrier-sheet]');
  document.querySelector('[data-sf-sheet-editor="SHIPR"] [data-sf-sheet-toggle="customer"]').click();sfSheetMove('SHIPR','size',-5);
  const after=document.querySelector('[data-sf-sheet-cols="SHIPR"]').textContent,heads=[...document.querySelectorAll('[data-sf-sheet-editor="SHIPR"] [data-carrier-sheet] thead th')].map(th=>th.textContent).slice(0,3).join(',');
  normalizeShopFloor();const kept=(DB.station.find(s=>s.code==='SHIPR').sheetCols||[]).filter(c=>!c.on).map(c=>c.k).join();
  const imported=(prepareImportedState(JSON.parse(JSON.stringify(DB))).station.find(s=>s.code==='SHIPR').sheetCols||[]).slice(0,2).map(c=>c.k).join();
  const others=DB.station.filter(s=>s.sheetCols).map(s=>s.code).join();
  tab='production';subtab='stations';render();const readOnly=document.querySelector('[data-sf-sheet-cols="SHIPR"]').textContent+(document.querySelector('[data-sf-sheet="SHIPR"]')?'+edit':'');
  tab='masterdata';render();document.querySelector('[data-sf-sheet-all]').click();const reset=!DB.station.find(s=>s.code==='SHIPR').sheetCols;
  return {head,before,preview:!!preview,after,heads,kept,imported,others,readOnly,reset};
 }),{head:true,before:'All columns',preview:true,after:'14 columns',heads:'#,Size,Line',kept:'customer',imported:'pos,size',others:'SHIPR',readOnly:'14 columns',reset:true});

 eq('окно в офисе: без своего набора — колонки станции, что положила стекло (SHIPR); свой набор человека важнее; Standard view — снова набор станции',await t.p.evaluate(()=>{
  csReset();csSkid();carrierStationColsSave('SHIPR',[{k:'customer',on:false},{k:'pos',on:true},{k:'size',on:true}]);
  const real=window.carrierMe;window.carrierMe=()=>({id:'view-tom',name:'Tom'});
  carrierWinOpen('SL-1');const station=csWinHeads();carrierColMove('order',-3);const mine=csWinHeads(),stored=DB.carrierCols.map(r=>r.userId).join();
  carrierColsStandard();const back=csWinHeads();window.carrierMe=real;carrierWinClose();
  return {station,mine,stored,back};
 }),{station:'#,Size,Order,Customer PO',mine:'Order,#,Size,Customer PO',stored:'view-tom',back:'#,Size,Order,Customer PO'});

 eq('SHIPR: в окне скида «Print what is on SL-1» — лист набором SHIPR, печатает вошедший на станции, в подвале «at SHIPR»; при выборе юнитов кнопки нет',await t.p.evaluate(()=>{
  csReset();csSkid();carrierStationColsSave('SHIPR',[{k:'customer',on:false},{k:'makeup',on:false}]);
  csLogin(shippingStations().ready,'Oleg');stationSkidOpen('SL-1');
  const btn=document.querySelector('[data-station-print="SL-1"]'),label=btn&&btn.textContent;btn.click();
  const sheet=document.querySelector('#carrierPrintHost [data-carrier-sheet="SL-1"]'),heads=csHeads(),by=[...sheet.querySelectorAll('.cs-strip div')].find(d=>d.querySelector('small').textContent==='Printed by').querySelector('b').textContent,foot=document.getElementById('carrierPageStyle').textContent;
  window.dispatchEvent(new Event('afterprint'));stationSkidPick(stationSkidItems('SL-1')[0].key);const hidden=!document.querySelector('[data-station-print]');
  stationDrawer=null;stationSwitch();tab='dashboard';render();
  return {label,printed:window.csPrinted,heads,by,at:/by Oleg at SHIPR/.test(foot),hidden};
 }),{label:'Print what is on SL-1',printed:1,heads:'#,Line,Mark,Size,Glass,Glass / unit ID,Batch,Next,Due,Weight kg,Put on',by:'Oleg',at:true,hidden:true});

 eq('CUT: в окне долли — кнопка печати, набор CUT; Shipping → Ready: Skid sheet печатает тот же лист скида',await t.p.evaluate(()=>{
  csReset();const id=csSkid();
  const d=oqOrder(oqCustomer({legalName:'Vista Railings'}));salesDraftDrop();oqThrough(d,'batched');const g=[...glassPieceMap(d).values()].flatMap(r=>r.ids).slice(0,2);
  csLogin('CUT','Roman H.');stationSubmit('DL-1');g.forEach(x=>stationSubmit(x));stationDollyOpen('DL-1');
  const dolly=!!document.querySelector('[data-station-print="DL-1"]');document.querySelector('[data-station-print="DL-1"]').click();const cut=!!document.querySelector('#carrierPrintHost [data-carrier-sheet="DL-1"]');
  window.dispatchEvent(new Event('afterprint'));stationDrawer=null;stationSwitch();
  tab='shipping';shippingTab='ready';render();const b=document.querySelector('[data-skid-sheet="SL-1"]');b.click();
  const sheet=document.querySelector('#carrierPrintHost [data-carrier-sheet="SL-1"]'),old=document.querySelectorAll('.doc-print-page').length;window.dispatchEvent(new Event('afterprint'));tab='dashboard';render();
  return {dolly,cut,shipping:!!sheet,kind:sheet&&sheet.querySelector('.cs-code small').textContent,old,printed:window.csPrinted};
 }),{dolly:true,cut:true,shipping:true,kind:'SKID CONTENTS',old:0,printed:2});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
