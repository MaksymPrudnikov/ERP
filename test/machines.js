/* Станки у станции (часть M задания «Карта цеха», 20.11.2026): у трёх POLISH —
   P1, P2, P3, у каждого свой экран скана. Станок выбирают один раз на экране,
   компьютер помнит; скан получает только пометку machine — маршрут, очереди,
   место стекла и переходы остаются по станции. Нет станка — скан как прежде. */
module.exports=async function({page,eq,ok}){
 console.log('machines');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.mReset=function(){oqReset();DB.stationScan=[];DB.stationScanSeq=0;DB.station.forEach(s=>{delete s.machines;});try{localStorage.removeItem(STATION_MACHINE_KEY);}catch(e){}
   if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));};
  /* Одинарное стекло, как в test/dollies-skids. */
  window.mOrder=function(sizes,name){
   const id=oqOrder(oqCustomer({legalName:name||'North Shore Windows'}),{dueDate:'2026-10-20'});
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q||1,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!soDraft.customerPo)soDraft.customerPo='PO-QA';if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return id;
  };
  window.mIds=function(id){return [...glassPieceMap(id).values()].flatMap(r=>r.ids);};
  window.mScan=function(pieces,opts){pieces.forEach(p=>{const g=stationGlass(p),pl=stationPlace(g),c=stationCheck(pl.waiting,p);stationMove(pl.waiting,c,{name:'Roman H.'},opts||{});});};
  window.mWait=function(p){return stationPlace(stationGlass(p)).waiting;};
  /* Станция, куда стекло придёт после первого скана, получает станки. */
  window.mStationAfterFirst=function(ids){mScan(ids);return mWait(ids[0]);};
 });

 eq('Master Data → Stations: поле Machines «p1, P2 p3» — станки P1, P2, P3; повтор — ошибка без записи; колонка Machines; пусто — станков нет',await t.p.evaluate(()=>{
  mReset();tab='masterdata';mdSetTab('stations');const i=DB.station.findIndex(s=>s.code==='POLISH');
  stEditOpen(i);document.getElementById('sf_machines').value='p1, P2 p3';saveSfStation();
  const set=JSON.stringify(DB.station.find(s=>s.code==='POLISH').machines),cell=document.querySelector('[data-sf-station="POLISH"]').innerText.includes('P1 · P2 · P3');
  const head=[...document.querySelectorAll('thead th')].some(th=>th.textContent==='Machines');
  stEditOpen(i);document.getElementById('sf_machines').value='P1, P1';const bad=saveSfStation();const err=document.getElementById('e_sfStation').textContent;
  stEditCancel();const kept=JSON.stringify(DB.station.find(s=>s.code==='POLISH').machines);
  stEditOpen(i);document.getElementById('sf_machines').value='';saveSfStation();
  return {set,cell,head,bad,err,kept,none:'machines' in DB.station.find(s=>s.code==='POLISH')};
 }),{set:'["P1","P2","P3"]',cell:true,head:true,bad:false,err:'Machines: short codes like P1, P2 — A–Z, 0–9, no repeats',kept:'["P1","P2","P3"]',none:false});

 eq('станция без станков и экран без станка — скан как прежде, без поля machine; станок чужой станции не пишется',await t.p.evaluate(()=>{
  mReset();const id=mOrder([[36,24,3]]),ids=mIds(id),st=mStationAfterFirst(ids);
  mScan([ids[0]]);const plain=DB.stationScan.at(-1);
  DB.station.find(s=>s.code===st).machines=['P1','P2'];
  mScan([ids[1]],{machine:'X9'});const foreign=DB.stationScan.at(-1);
  return {plain:'machine' in plain,foreign:'machine' in foreign,st:plain.station===st&&foreign.station===st};
 }),{plain:false,foreign:false,st:true});

 eq('экран станции: станок не выбран — жёлтая подсказка, скан идёт без пометки; выбрал P2 — скан с machine P2; выбор хранится в этом браузере',await t.p.evaluate(async()=>{
  mReset();const id=mOrder([[36,24,3]]),ids=mIds(id),st=mStationAfterFirst(ids);
  DB.station.find(s=>s.code===st).machines=['P1','P2','P3'];touch();
  DB.user.push({name:'Ivan P.',role:'Shop',station:st,skills:[],pin:'0000'});normalizeUsers();
  stationCode=st;tab='station';stationTab='scan';stationDrawer=null;stationLogin(DB.user[DB.user.length-1].viewProfileId);
  const chip=document.querySelector('[data-station-machine]'),warn=chip.classList.contains('warn'),opts=[...chip.querySelectorAll('option')].map(o=>o.textContent).join();
  stationSubmit(ids[0]);const first=DB.stationScan.at(-1);
  const sel=document.querySelector('[data-station-machine] select');sel.value='P2';sel.dispatchEvent(new Event('change',{bubbles:true}));
  stationSubmit(ids[1]);const second=DB.stationScan.at(-1);
  const after=!document.querySelector('[data-station-machine]').classList.contains('warn');
  return {warn,opts,first:[first.piece===ids[0],'machine' in first],second:[second.piece===ids[1],second.machine],after,stored:JSON.parse(localStorage.getItem(STATION_MACHINE_KEY))[st]};
 }),{warn:true,opts:'Not set,P1,P2,P3',first:[true,false],second:[true,'P2'],after:true,stored:'P2'});

 eq('поток не меняется: со станком и без — то же место стекла, тот же маршрут и те же числа In production',await t.p.evaluate(()=>{
  mReset();const a=mOrder([[36,24,2]],'Granite City Glazing'),b=mOrder([[36,24,2]],'Vista Railings'),ia=mIds(a),ib=mIds(b);
  mScan(ia);mScan(ib);const st=mWait(ia[0]);DB.station.find(s=>s.code===st).machines=['P1','P2'];
  mScan(ia,{machine:'P1'});mScan(ib);
  const pa=ia.map(p=>JSON.stringify(stationPlace(stationGlass(p)))),pb=ib.map(p=>JSON.stringify(stationPlace(stationGlass(p))));
  const route=p=>stationRouteOf(stationGlass(p)).codes.join('>');
  const board=prodBoard(),ca=board.find(x=>x.o.id===a),cb=board.find(x=>x.o.id===b);
  return {marked:DB.stationScan.filter(s=>s.machine==='P1').length,place:pa.join()===pb.join(),route:route(ia[0])===route(ib[0]),counts:JSON.stringify(ca.counts)===JSON.stringify(cb.counts)};
 }),{marked:2,place:true,route:true,counts:true});

 eq('Export / Import: пометка станка и станки станции сохраняются; мусор в machine отброшен; старый файл без machine импортируется',await t.p.evaluate(()=>{
  mReset();const id=mOrder([[36,24,2]]),ids=mIds(id),st=mStationAfterFirst(ids);
  DB.station.find(s=>s.code===st).machines=['P1','P2'];mScan([ids[0]],{machine:'P1'});
  const src=JSON.parse(JSON.stringify(DB)),imported=prepareImportedState(src);
  const kept=imported.stationScan.find(s=>s.piece===ids[0]&&s.station===st).machine,machines=JSON.stringify(imported.station.find(s=>s.code===st).machines);
  const junk=JSON.parse(JSON.stringify(DB));junk.stationScan.forEach(s=>{if(s.machine)s.machine='bad code!';});junk.station.forEach(s=>{if(s.machines)s.machines=['P1','P1','',null,'TOO-LONG-MACHINE-CODE'];});
  const j=prepareImportedState(junk);
  const old=JSON.parse(JSON.stringify(DB));old.stationScan.forEach(s=>{delete s.machine;});old.station.forEach(s=>{delete s.machines;});
  const o=prepareImportedState(old);
  return {kept,machines,junkScan:j.stationScan.some(s=>'machine' in s),junkSt:JSON.stringify(j.station.find(s=>s.code===st).machines),old:o.stationScan.length===DB.stationScan.length};
 }),{kept:'P1',machines:'["P1","P2"]',junkScan:false,junkSt:'["P1"]',old:true});

 eq('Reports: факты работы несут станок; в «Station work» поле Machine; группировка по станку — по P1, P2 и без станка',await t.p.evaluate(()=>{
  mReset();const id=mOrder([[36,24,3]]),ids=mIds(id),st=mStationAfterFirst(ids);
  DB.station.find(s=>s.code===st).machines=['P1','P2'];
  mScan([ids[0]],{machine:'P1'});mScan([ids[1]],{machine:'P2'});mScan([ids[2]]);
  const rows=repWorkFacts().filter(f=>f.station===st),by={};rows.forEach(f=>{const k=f.machine||'—';by[k]=(by[k]||0)+1;});
  const src=REP_SRC.glass,field=src.fields().find(f=>f.k==='machine');
  const ops=repOpFacts().filter(f=>f.station===st).every(f=>typeof f.machine==='string');
  return {by,label:field&&field.label,value:field?[field.get?field.get(rows.find(f=>f.machine==='P2')):rows.find(f=>f.machine==='P2').machine,field.get?field.get(rows.find(f=>!f.machine)):''].join():'',ops};
 }),{by:{'P1':1,'P2':1,'—':1},label:'Machine',value:'P2,—',ops:true});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
