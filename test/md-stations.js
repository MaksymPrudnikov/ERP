/* Станции в Master Data. Владелец, 29.09.2026: станции заводит, удаляет и
   ставит в производственный порядок он сам; «CNC shape edge стоит на уровне
   с полировкой» — одинаковый номер шага = параллельные станции. Работа в
   Works называет станцию — маршрут стекла меняется сразу, и на экранах
   станций тоже. */
module.exports=async function({page,eq,ok}){
 console.log('md-stations');const t=await page();
 await require('./optimization-fixture')(t.p);

 eq('Master Data → Stations: добавить станцию на тот же шаг — параллельная; работа Works на неё — маршрут стекла сразу меняется; шаг в таблице; Tidy',await t.p.evaluate(()=>{
  oqReset();DB.stationScan=[];DB.stationScanSeq=0;
  const keep=JSON.parse(JSON.stringify({st:DB.station,sr:DB.serviceRate}));
  const id=oqOrder(oqCustomer({legalName:'North Shore Windows'}));soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
  const g=[...glassPieceMap(id).values()][0].ids[0],before=stationRouteOf(stationGlass(g)).codes.join('>');
  tab='masterdata';mdSetTab('stations');
  const edgeStep=DB.station.find(s=>s.code==='EDGE').seq;
  document.querySelector('[data-sf-add]').click();
  document.getElementById('sf_seq').value=String(edgeStep);document.getElementById('sf_code').value='arris';document.getElementById('sf_nameEn').value='Arrising';
  document.querySelector('[data-sf-save]').click();
  const arris=DB.station.find(s=>s.code==='ARRIS'),parallel=[...document.querySelectorAll('[data-sf-station]')].filter(tr=>tr.textContent.includes('parallel')).map(tr=>tr.dataset.sfStation).join();
  const step=[...document.querySelectorAll('.pipeline .stage-step')].find(x=>x.textContent.includes('ARRIS')).querySelectorAll('.stage').length;
  mdSetTab('works');mdCatKind='serviceRate';mdCatEditRow('roughArris');render();document.getElementById('md_catStation').value='ARRIS';mdCatSave();
  const after=stationRouteOf(stationGlass(g)).codes.join('>'),sticker=finWithOrder(salesRecord(id),()=>{const o=salesRecord(id),l=o.lines[0];return stkRoute(o,l,glassBatchComponents(o,l)[0]).codes.join('>');});
  mdSetTab('stations');const inp=document.querySelector('[data-sf-step="ARRIS"]');inp.value='40';inp.dispatchEvent(new Event('change'));
  const moved=DB.station.map(s=>s.code).indexOf('ARRIS')>DB.station.map(s=>s.code).indexOf('SHIP');
  document.querySelector('[data-sf-step="ARRIS"]').value=String(edgeStep);document.querySelector('[data-sf-step="ARRIS"]').dispatchEvent(new Event('change'));
  DB.station.find(s=>s.code==='SHIP').seq=90;document.querySelector('[data-sf-tidy]').click();const tidy=DB.station.map(s=>s.seq).join();
  DB.station=keep.st;DB.serviceRate=keep.sr;stationRouteReset();tab='dashboard';render();
  return {arris:arris&&[arris.seq===edgeStep,arris.nameEn,arris.always].join('|'),parallel,step,before,after,sticker,moved,tidy};
 }),{arris:'true|Arrising|false',parallel:'EDGE,ARRIS',step:2,before:'CUT>EDGE>HEAT>IGU>SHIPR>SHIP',after:'CUT>ARRIS>HEAT>IGU>SHIPR>SHIP',sticker:'CUT>ARRIS>HEAT>IGU>SHIPR>SHIP',moved:true,tidy:'1,2,2,3,4,5,6,7,8,9,10,11,12'});

 eq('удалить станцию нельзя, пока на неё идут работы — названы работы; переименование кода переносит работы; Production → Stations — только просмотр и ссылка в Master Data',await t.p.evaluate(()=>{
  const keep=JSON.parse(JSON.stringify({st:DB.station,sr:DB.serviceRate}));
  let msg='';const al=window.alert;window.alert=m=>{msg=m;};
  tab='masterdata';mdSetTab('stations');document.querySelector('[data-sf-del="HEAT"]').click();window.alert=al;
  const i=DB.station.findIndex(s=>s.code==='SAND');stEdit=i;render();document.getElementById('sf_code').value='BLAST';document.querySelector('[data-sf-save]').click();
  const renamed={station:!!DB.station.find(s=>s.code==='BLAST'),works:DB.serviceRate.filter(w=>w.station==='SAND').length,moved:DB.serviceRate.filter(w=>w.station==='BLAST').length>0};
  tab='production';subtab='stations';render();const ro={edit:!!document.querySelector('[data-sf-step]'),del:!!document.querySelector('[data-sf-del]'),link:!!document.querySelector('[data-sf-to-md]')};
  document.querySelector('[data-sf-to-md]').click();const md=mdTab;
  DB.station=keep.st;DB.serviceRate=keep.sr;stationRouteReset();tab='dashboard';render();
  return {msg:/^Cannot delete HEAT — works go to it: .+\. Move them to another station in Master Data → Works first\.$/.test(msg),renamed,ro,md};
 }),{msg:true,renamed:{station:true,works:0,moved:true},ro:{edit:false,del:false,link:true},md:'stations'});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
