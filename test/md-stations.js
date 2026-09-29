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
  const edgeStep=DB.station.find(s=>s.code==='ARRIS').seq;
  document.querySelector('[data-sf-add]').click();
  document.getElementById('sf_seq').value=String(edgeStep);document.getElementById('sf_code').value='seam';document.getElementById('sf_nameEn').value='Seaming';
  document.querySelector('[data-sf-save]').click();
  const arris=DB.station.find(s=>s.code==='SEAM'),parallel=[...document.querySelectorAll('[data-sf-station]')].filter(tr=>tr.textContent.includes('parallel')).map(tr=>tr.dataset.sfStation).join();
  const step=[...document.querySelectorAll('.pipeline .stage-step')].find(x=>x.textContent.includes('SEAM')).querySelectorAll('.stage').length;
  mdSetTab('works');mdCatKind='serviceRate';mdCatEditRow('roughArris');render();document.getElementById('md_catStation').value='SEAM';mdCatSave();
  const after=stationRouteOf(stationGlass(g)).codes.join('>'),sticker=finWithOrder(salesRecord(id),()=>{const o=salesRecord(id),l=o.lines[0];return stkRoute(o,l,glassBatchComponents(o,l)[0]).codes.join('>');});
  mdSetTab('stations');const inp=document.querySelector('[data-sf-step="SEAM"]');inp.value='40';inp.dispatchEvent(new Event('change'));
  const moved=DB.station.map(s=>s.code).indexOf('SEAM')>DB.station.map(s=>s.code).indexOf('SHIP');
  document.querySelector('[data-sf-step="SEAM"]').value=String(edgeStep);document.querySelector('[data-sf-step="SEAM"]').dispatchEvent(new Event('change'));
  DB.station.find(s=>s.code==='SHIP').seq=90;document.querySelector('[data-sf-tidy]').click();const tidy=DB.station.map(s=>s.seq).join();
  DB.station=keep.st;DB.serviceRate=keep.sr;stationRouteReset();tab='dashboard';render();
  return {arris:arris&&[arris.seq===edgeStep,arris.nameEn,arris.always].join('|'),parallel,step,before,after,sticker,moved,tidy};
 }),{arris:'true|Seaming|false',parallel:'ARRIS,POLISH,BEVEL,MITER,CNC,SEAM',step:6,before:'CUT>ARRIS>HEAT>IGU>SHIPR>SHIP',after:'CUT>SEAM>HEAT>IGU>SHIPR>SHIP',sticker:'CUT>SEAM>HEAT>IGU>SHIPR>SHIP',moved:true,tidy:'1,2,2,2,2,2,2,3,4,5,6,7,8,9,10,11'});

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

 eq('сохранённые данные со старой EDGE перестраиваются сами: станции, работы (своя станция владельца остаётся), причины брака, терминалы, сканы на EDGE; повторно не срабатывает',await t.p.evaluate(()=>{
  oqReset();DB.stationScan=[];DB.stationScanSeq=0;
  const id=oqOrder(oqCustomer({legalName:'North Shore Windows'}));soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
  const g=[...glassPieceMap(id).values()][0].ids[0],who={id:'x',name:'Ivan'};
  ['CUT','ARRIS'].forEach(st=>stationRecord(st,stationCheck(st,g),who));
  const old=JSON.parse(JSON.stringify(DB));
  old.station=old.station.filter(x=>!['ARRIS','POLISH','BEVEL','MITER'].includes(x.code));
  old.station.push({seq:2,code:'EDGE',name:'Edge work',nameEn:'Edge work',always:false,maxW:130,maxL:200,sizeMeasured:true,note:''});
  old.station.find(x=>x.code==='CNC').seq=4;
  ['roughArris','flatPolish','cncShapePolish','miter225','miter45','cncLamiPolish','bevel:3-8','bevel:9-15','bevel:16-19'].forEach(k=>{old.serviceRate.find(w=>w.id===k).station='EDGE';});
  old.serviceRate.find(w=>w.id==='lamiPolish').station='LAM';
  old.ncrReason=old.ncrReason.filter(r=>!['ARRIS','POLISH','BEVEL','MITER'].includes(r.where)).concat(['Wrong edgework','Bevel width wrong','Miter angle wrong','Polish burn'].map((name,i)=>({id:'NR-EDGE-0'+(i+1),where:'EDGE',name,active:true})));
  old.terminal=[{code:'T1',name:'Edge PC',nameEn:'',stations:['EDGE','CUT'],note:''}];
  old.stationScan.forEach(x=>{if(x.station==='ARRIS')x.station='EDGE';});old.dataFix=3;
  const next=prepareImportedState(old);
  const keep=DB;DB=next;stationRouteReset();
  const out={stations:DB.station.filter(x=>x.seq===2).map(x=>x.code).join(),edge:DB.station.some(x=>x.code==='EDGE'),size:[DB.station.find(x=>x.code==='ARRIS').maxW,DB.station.find(x=>x.code==='POLISH').sizeMeasured].join(),
   works:['roughArris','flatPolish','cncShapePolish','miter45','bevel:9-15','cncLamiPolish','lamiPolish'].map(k=>DB.serviceRate.find(w=>w.id===k).station).join(),
   reasons:['Wrong edgework','Bevel width wrong','Miter angle wrong','Polish burn'].map(n=>DB.ncrReason.filter(r=>r.name===n).map(r=>r.where).sort().join('+')).join('|'),
   terminal:DB.terminal[0].stations.join(),scans:DB.stationScan.map(x=>x.station).join(),waiting:stationPlace(stationGlass(g)).waiting,fix:DB.dataFix};
  const again=JSON.stringify(prepareImportedState(JSON.parse(JSON.stringify(DB))).station)===JSON.stringify(DB.station);
  DB=keep;stationRouteReset();
  return Object.assign(out,{again});
 }),{stations:'ARRIS,POLISH,BEVEL,MITER,CNC',edge:false,size:'130,true',works:'ARRIS,POLISH,CNC,MITER,BEVEL,CNC,LAM',
  reasons:'ARRIS+BEVEL+MITER+POLISH|BEVEL|MITER|POLISH',terminal:'ARRIS,POLISH,BEVEL,MITER,CUT',scans:'CUT,ARRIS',waiting:'HEAT',fix:5,again:true});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
