/* Вызов HELP со станции (часть C задания «Карта цеха», 20.11.2026): рабочий
   нажимает HELP — станция красная на Floor (2D и 3D), в сводке «1 help · DRILL»,
   в карточке полоса и Resolved; Resolved и на самой станции. Один открытый
   вызов на станцию; записи остаются в базе. */
module.exports=async function({page,eq,ok}){
 console.log('station-help');const t=await page();
 await t.p.evaluate(()=>{
  window.shReset=function(){DB.stationCall=[];floorEdit=null;floorPick='';floorFind='';floorFilter='';floor3d=false;floorCam=null;floorLiveMemo={key:'',data:null};stationNote='';
   DB.floorItem=[floorClean({id:'h',kind:'hall',w:40,l:30})].concat(DB.station.map((s,i)=>floorClean({id:'m-'+s.code,kind:'machine',station:s.code,x:1+i*2.5,y:5,w:2,l:4})));
   DB.user=DB.user.filter(u=>u.name!=='Ivan P.');DB.user.push({name:'Ivan P.',role:'Shop',station:'DRILL',skills:[],pin:'0000'});normalizeUsers();touch();};
  window.shStation=function(code){stationCode=code;tab='station';stationTab='scan';stationDrawer=null;stationLogin(DB.user[DB.user.length-1].viewProfileId);};
  window.shText=function(sel){const el=document.querySelector(sel);return el?(el.innerText==null?el.textContent:el.innerText).replace(/\s+/g,' ').trim():'';};
 });

 eq('экран станции: HELP — вызов в базе (станция, кто, когда); повторное нажатие нового не заводит; в шапке «Help · 0 min» и Resolved',await t.p.evaluate(()=>{
  shReset();shStation('DRILL');document.querySelector('[data-station-help]').click();
  const c=DB.stationCall[0],chip=shText('[data-station-help-open]');
  shStation('DRILL');const again=stationHelpCommand('DRILL',{name:'Ivan P.'},'').ok;
  return {n:DB.stationCall.length,station:c.station,by:c.by,open:!c.closedAt,chip,again,stored:testStoredState().stationCall.length};
 }),{n:1,station:'DRILL',by:'Ivan P.',open:true,chip:'Help · 0 min Resolved',again:true,stored:1});

 eq('Floor: станция с вызовом — красная (is-help), в сводке «1 help · DRILL» — клик открывает её карточку с полосой Help и Resolved; в 3D тоже красная',await t.p.evaluate(()=>{
  shReset();stationHelpCommand('DRILL',{name:'Ivan P.'},'');tab='production';subtab='floor';render();
  const block=document.querySelector('[data-floor-item="m-DRILL"]').getAttribute('class').includes('is-help'),chip=shText('[data-floor-help]');
  document.querySelector('[data-floor-help]').click();const card=shText('[data-floor-help-card]'),pill=shText('[data-floor-status]');
  floor3dToggle(true);const three=[...document.querySelectorAll('polygon[data-floor-item="m-DRILL"]')].every(p=>p.getAttribute('class').includes('is-help'));
  const row=floorLive().st.DRILL.status;floor3d=false;render();
  return {block,chip,card:card.startsWith('Help · 0 min')&&card.endsWith('Resolved'),pill,three,row};
 }),{block:true,chip:'1 help · DRILL',card:true,pill:'Help',three:true,row:'help'});

 eq('Resolved из офиса — вызов закрыт (кто и когда), станция снова обычная; на экране станции снова HELP',await t.p.evaluate(()=>{
  shReset();stationHelpCommand('DRILL',{name:'Ivan P.'},'');floorOpenStation('DRILL');
  document.querySelector('[data-floor-resolved]').click();const c=DB.stationCall[0];
  const after=document.querySelector('[data-floor-item="m-DRILL"]').getAttribute('class').includes('is-help'),chip=!!document.querySelector('[data-floor-help]');
  shStation('DRILL');const btn=!!document.querySelector('[data-station-help]');
  return {closed:!!c.closedAt,by:c.closedBy!=='',after,chip,btn,kept:DB.stationCall.length};
 }),{closed:true,by:true,after:false,chip:false,btn:true,kept:1});

 eq('Resolved на самой станции; со станком экрана — вызов помнит станок; Export / Import сохраняет вызовы, мусор отброшен',await t.p.evaluate(()=>{
  shReset();DB.station.find(s=>s.code==='POLISH').machines=['P1','P2'];shStation('POLISH');stationMachineSet('P2');
  document.querySelector('[data-station-help]').click();const m=DB.stationCall[0].machine;
  document.querySelector('[data-station-resolved]').click();const closed=!!DB.stationCall[0].closedAt,note=stationNote;
  const src=JSON.parse(JSON.stringify(DB));src.stationCall.push({id:'bad',station:'X',at:'x'},null);const imp=prepareImportedState(src);
  try{localStorage.removeItem(STATION_MACHINE_KEY);}catch(e){}delete DB.station.find(s=>s.code==='POLISH').machines;
  return {m,closed,note,imported:imp.stationCall.length};
 }),{m:'P2',closed:true,note:'Help resolved',imported:1});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
