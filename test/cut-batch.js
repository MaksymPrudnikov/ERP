/* Батч на CUT без скана. Владелец, 29.09.2026: «пробовал открыть батч — не
   получилось»; «оператор сам выбирает, открывает и визуально оценивает, что
   ему предстоит резать». Экран открывается на первом листе первого батча
   очереди офиса; батч выбирается над листом и из Queue; «All sheets» — все
   листы батча картинками, нажатие — лист на столе; батч без раскроя —
   подсказка; порезан — следующий батч сам; из Batches — «Open on CUT». */
module.exports=async function({page,eq,ok}){
 console.log('cut-batch');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.cbReset=function(){oqReset();DB.stationScan=[];DB.stationScanSeq=0;DB.carrier=[];DB.sheetBreak=[];stationLast=null;stationSheetView=null;stationIncoming='';stationQuestions=[];stationNote='';stationDrawer=null;stationMenu=null;stationTab='scan';
   if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));};
  window.cbOrder=function(sizes){
   const id=oqOrder(oqCustomer({legalName:'North Shore Windows'}),{dueDate:'2026-10-06'});
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q||1,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return DB.glassBatch[DB.glassBatch.length-1].number;
  };
  window.cbLogin=function(){DB.user=DB.user.filter(u=>u.name!=='Ivan P.');DB.user.push({name:'Ivan P.',role:'Shop',station:'CUT',skills:[],pin:''});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode='CUT';tab='station';stationLogin(DB.user[DB.user.length-1].viewProfileId);};
  window.cbView=function(){const v=stationSheetView;return v?v.batch+':'+v.glass+':'+v.no:'';};
  window.cbOut=function(){stationSwitch();stationSheetView=null;tab='dashboard';render();};
 });

 eq('экран CUT без скана: первый неразрезанный лист первого батча очереди офиса; выбор батча над листом; Queue — «Cut this batch»',await t.p.evaluate(()=>{
  cbReset();const a=cbOrder([[36,24,8],[48,30,6],[20,30,10]]),b=cbOrder([[30,20,4]]);[a,b].forEach(n=>cutPlanRun(n));
  glassBatchCutMove(b,-1);cbLogin();
  const first=cbView(),opts=[...document.querySelectorAll('[data-station-batch] option')].map(o=>o.value).join(),svg=!!document.querySelector('.st-sheet-card .st-sheet-svg'),chip=document.querySelector('.st-top').textContent.includes('Batch '+b);
  const sel=document.querySelector('[data-station-batch]');sel.value=a;sel.dispatchEvent(new Event('change'));const picked=cbView();
  document.querySelector('[data-station-tab="queue"]').click();document.querySelector(`[data-queue-open="${b}"]`).click();const fromQueue={view:cbView(),tab:stationTab};
  cbOut();return {first:first===b+':6CLEAR:1',opts:opts===b+','+a,svg,chip,picked:picked===a+':6CLEAR:1',fromQueue:fromQueue.view===b+':6CLEAR:1'&&fromQueue.tab};
 }),{first:true,opts:true,svg:true,chip:true,picked:true,fromQueue:'scan'});

 eq('All sheets: все листы батча картинками, сколько стёкол и сколько порезано; нажатие на лист — он на столе; из Queue — View',await t.p.evaluate(()=>{
  cbReset();const a=cbOrder([[36,24,8],[48,30,6],[20,30,10]]);cutPlanRun(a);cbLogin();
  const sheets=cutPlanFor(a).groups[0].sheets,p=sheets[1].pieces[0].piece;stationSubmit(p);
  document.querySelector('[data-station-batch-view-open]').click();
  const box=document.querySelector(`[data-station-batch-view="${a}"]`),tiles=[...box.querySelectorAll('[data-batch-sheet]')];
  const view={tiles:tiles.length===sheets.length,pics:box.querySelectorAll('.st-sheet-mini').length===sheets.length,second:tiles[1].textContent.includes('1 cut'),head:box.querySelector('h2').textContent,cutBtn:!!box.querySelector('[data-batch-cut-open]')};
  tiles[tiles.length-1].click();const put=cbView()===a+':6CLEAR:'+sheets.length&&!stationDrawer;
  document.querySelector('[data-station-tab="queue"]').click();document.querySelector(`[data-queue-view="${a}"]`).click();const fromQueue=!!document.querySelector(`[data-station-batch-view="${a}"]`);
  stationSubmit(sheets[0].pieces[0].piece);const closedByScan=!stationDrawer&&stationTab==='scan';
  cbOut();return {view,put,fromQueue,closedByScan,sheets:sheets.length>1};
 }),{view:{tiles:true,pics:true,second:true,head:'Batch B-0001',cutBtn:true},put:true,fromQueue:true,closedByScan:true,sheets:true});

 eq('батч без раскроя — подсказка, скан работает; стекло без размера листа — отмечено над листом; нечего резать — пусто',await t.p.evaluate(()=>{
  cbReset();cbLogin();const empty=!!document.querySelector('[data-station-nobatch]');stationSwitch();
  const a=cbOrder([[36,24,2]]);cbLogin();const noplan=!!document.querySelector('[data-station-noplan]'),kind=stationSubmit(DB.glassBatch[0].items[0].piece);stationSwitch();
  cbReset();const id=oqOrder(oqCustomer({legalName:'North Shore Windows'}));soDraft=null;soEdit=null;salesRecord(id).makeups[0].panes[1].glassProductId=glassProductByCode('6Q240').id;salesSetRecordStatus(id,'verified');
  glassBatchAssign(glassBatchRows([salesRecord(id)]),{});cutPlanRun('B-0001');cbLogin();
  const missing=[...document.querySelectorAll('[data-station-glass-missing]')].map(x=>x.dataset.stationGlassMissing).join(),glassBtns=[...document.querySelectorAll('[data-station-glass]')].map(x=>x.dataset.stationGlass).join();
  cbOut();return {empty,noplan,kind,missing,glassBtns};
 }),{empty:true,noplan:true,kind:'ok',missing:'6Q240',glassBtns:'6CLEAR'});

 eq('последний лист батча — сразу следующий батч очереди; ссылка #station=CUT&batch= открывает батч; в Batches — «Open on CUT»',await t.p.evaluate(()=>{
  cbReset();const a=cbOrder([[36,24,2]]),b=cbOrder([[30,20,2]]);[a,b].forEach(n=>cutPlanRun(n));cbLogin();
  DB.glassBatch.find(x=>x.number===a).items.forEach(i=>stationSubmit(i.piece));
  const note=document.querySelector('.st-note').textContent,next=cbView();stationSwitch();
  stationSheetView=null;location.hash='station=CUT&batch='+a;
  return new Promise(res=>setTimeout(()=>{
   const hash={code:stationCode,view:cbView()};cbLogin();const shown=cbView();
   history.replaceState(null,'',location.href.split('#')[0]);cbOut();
   tab='optimization';optimizationSetTab('production');glassBatchOpen(b);const btn=document.querySelector('[data-open-cut]');
   let opened='';const w=window.open;window.open=u=>{opened=u;return {};};btn.click();window.open=w;
   tab='dashboard';glassBatchOpenNumber='';render();
   res({note,next:next===b+':6CLEAR:1',hash:hash.code,shown:shown===a+':6CLEAR:1',btn:btn.textContent,opened:/#station=CUT&batch=B-0002$/.test(opened)});
  },50));
 }),{note:'Sheet 1 done · batch B-0001 cut → batch B-0002',next:true,hash:'CUT',shown:true,btn:'Open on CUT',opened:true});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
