/* Долли и скиды: четыре типа DL · DA · SL · SA с номером внутри типа, скан
   тары на станции — «кладу на неё» или «приехала, покажи стопку», скан
   стекла пишет, на что его положили, стопка сверху вниз, «Not on» для
   стекла в руках, колонка On в Production, Master Data и этикетка. */
module.exports=async function({page,eq,ok}){
 console.log('carriers');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{window.cvPrinted=(window.cvPrinted||0)+1;};
  window.cvReset=function(){oqReset();DB.stationScan=[];DB.stationScanSeq=0;DB.carrier=[];DB.sheetBreak=[];stationLast=null;stationSheetView=null;stationIncoming='';stationNote='';stationDrawer=null;stationTab='scan';
   if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));};
  window.cvOrder=function(sizes,extra){
   const id=oqOrder(oqCustomer({legalName:'North Shore Windows'}),Object.assign({dueDate:'2026-10-06'},extra||{}));
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q||1,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return id;
  };
  window.cvIds=function(id){return [...glassPieceMap(id).values()].flatMap(r=>r.ids);};
  window.cvLogin=function(station,name){DB.user=DB.user.filter(u=>u.name!==name);DB.user.push({name,role:'Shop',station,skills:[],pin:'0000'});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode=station;tab='station';stationIncoming='';stationLogin(DB.user[DB.user.length-1].viewProfileId);};
 });

 eq('четыре типа тары и номер внутри типа; мусор отсеивается, импорт без массива — ошибка',await t.p.evaluate(()=>{
  cvReset();carrierAdd('DL',2);carrierAdd('DA',1);carrierAdd('SL',1);carrierAdd('SA',1);carrierAdd('DL',1);
  const codes=DB.carrier.map(c=>c.code).join(),types=['DL-1','DA-1','SL-1','SA-1','S-0000001','G-0000001'].map(c=>carrierType(c)?carrierType(c).label:'-').join('|');
  DB.carrier.push({code:'dl-9 '},{code:'XX-1'},{code:'DL-1'},null);normalizeCarriers();
  let err='';try{prepareImportedState(Object.assign(JSON.parse(JSON.stringify(DB)),{carrier:{}}));}catch(e){err=e.message;}
  return {codes,types,after:DB.carrier.map(c=>c.code).join(),err};
 }),{codes:'DL-1,DL-2,DA-1,SL-1,SA-1,DL-3',types:'L-shape dolly|A-shape dolly|L-shape skid|A-shape skid|-|-',after:'DL-1,DL-2,DA-1,SL-1,SA-1,DL-3,DL-9',err:'The "carrier" field must be an array.'});

 eq('CUT: скан долли — «кладу на неё», стёкла пишутся на неё; стопка сверху вниз; другая долли — дальше на неё; Not on — стекло в руках',await t.p.evaluate(()=>{
  cvReset();carrierAdd('DL',2);const id=cvOrder([[36,24,5]]);const g=cvIds(id);cvLogin('CUT','Ivan P.');
  const put=stationSubmit('DL-1');g.slice(0,3).forEach(x=>stationSubmit(x));stationSubmit('DL-2');stationSubmit(g[3]);stationSubmit(g[4]);
  const chip=document.querySelector('[data-station-puton]').textContent.replace(/\s+/g,' ').trim();
  document.querySelector('[data-station-off]').click();
  const c=carrierContents();
  const out={put,dl1:(c.get('DL-1')||[]).map(x=>x.id===g[2]?'top':x.id===g[0]?'bottom':'mid').join(),dl2:(c.get('DL-2')||[]).length,on:DB.stationScan.map(s=>s.on||'—').join(),chip,
   journalOn:[...document.querySelectorAll('.st-journal tbody tr')].map(tr=>tr.children[5].textContent).join()};
  stationSwitch();tab='dashboard';render();return out;
 }),{put:'carrier',dl1:'top,mid,bottom',dl2:1,on:'DL-1,DL-1,DL-1,DL-2,—',chip:'Putting on DL-2✕',journalOn:'—,DL-2,DL-1,DL-1,DL-1'});

 eq('ARRIS: долли со стеклом для ARRIS — «приехала», стопка справа, кладу не меняется; пустая — кладу на неё; стекло уходит со старой долли на новую',await t.p.evaluate(()=>{
  cvReset();carrierAdd('DL',1);carrierAdd('DA',1);const id=cvOrder([[36,24,3]]);const g=cvIds(id);
  cvLogin('CUT','Ivan P.');stationSubmit('DL-1');g.forEach(x=>stationSubmit(x));stationSwitch();
  cvLogin('ARRIS','Oleg K.');const inc=stationSubmit('DL-1'),incKind=stationLast.check.kind,putAfterIn=stationPutOn();
  const stack=[...document.querySelectorAll('[data-station-stack] tbody tr')].length,waiting=[...document.querySelectorAll('[data-station-incoming]')].map(x=>x.dataset.stationIncoming).join();
  stationSubmit('DA-1');const putKind=stationLast.check.kind;stationSubmit(g[2]);
  const c=carrierContents(),left=(c.get('DL-1')||[]).length,onDA=(c.get('DA-1')||[]).map(x=>x.place.waiting).join();
  const bad=stationSubmit('DL-77')&&stationLast.check.kind;DB.carrier.find(x=>x.code==='DA-1').active=false;stationSubmit('DA-1');const inactive=stationLast.check.kind;
  stationSwitch();tab='dashboard';render();
  return {inc,incKind,putAfterIn,stack,waiting,putKind,left,onDA,bad,inactive};
 }),{inc:'carrier',incKind:'carrierIn',putAfterIn:'',stack:3,waiting:'DL-1',putKind:'carrierPut',left:2,onDA:'HEAT',bad:'carrierBad',inactive:'carrierBad'});

 eq('долли ждут на станции: Critical первой, потом кто раньше',await t.p.evaluate(()=>{
  cvReset();carrierAdd('DL',2);const a=cvOrder([[36,24,1]]),b=cvOrder([[30,20,1]],{priority:'critical'});
  cvLogin('CUT','Ivan P.');stationSubmit('DL-1');stationSubmit(cvIds(a)[0]);stationSubmit('DL-2');stationSubmit(cvIds(b)[0]);stationSwitch();
  cvLogin('ARRIS','Oleg K.');const order=[...document.querySelectorAll('[data-station-incoming]')].map(x=>x.dataset.stationIncoming).join();stationSwitch();tab='dashboard';render();
  return order;
 }),'DL-2,DL-1');

 eq('Production: колонка On — на какой таре лежат стёкла заказа и позиции',await t.p.evaluate(()=>{
  cvReset();carrierAdd('DL',1);carrierAdd('SA',1);const id=cvOrder([[36,24,2],[30,20,1]]);const g=cvIds(id);
  cvLogin('CUT','Ivan P.');stationSubmit('DL-1');stationSubmit(g[0]);stationSubmit('SA-1');stationSubmit(g[2]);stationSwitch();
  tab='production';subtab='orders';prodOpen=new Set([id]);const p=salesListLoadPrefs();p.filters={};render();
  const heads=[...document.querySelectorAll('.pb-table thead th')].map(th=>th.textContent.trim()),on=heads.indexOf('On');
  const row=document.querySelector(`[data-prod-order="${id}"]`).children[on].textContent.trim(),sub=[...document.querySelectorAll('.pb-sub')].map(tr=>tr.children[on].textContent.trim()).join('|');
  tab='dashboard';render();return {row,sub};
 }),{row:'DL-1 SA-1',sub:'DL-1|SA-1'});

 eq('Master Data → Dollies & Skids: добавить, что на таре сейчас, этикетка 4 × 6 с кодом и штрихкодом',await t.p.evaluate(()=>{
  cvReset();tab='masterdata';mdSetTab('carriers');document.querySelector('[data-carrier-add="DA"]').click();document.querySelector('[data-carrier-add="DA"]').click();document.querySelector('[data-carrier-add="SL"]').click();
  const rows=[...document.querySelectorAll('[data-carrier]')].map(r=>r.dataset.carrier+':'+r.children[2].textContent+':'+r.children[3].textContent).join('|');
  const printed=carrierPrintLabels(['DA-2','SL-1','ZZ-1']),labels=[...document.querySelectorAll('[data-carrier-label]')].map(x=>x.dataset.carrierLabel).join(),bars=document.querySelector('[data-carrier-label] svg').querySelectorAll('rect').length;
  stkPrintCleanup();tab='dashboard';render();
  return {rows,printed,labels,bars:bars>20,calls:window.cvPrinted};
 }),{rows:'DA-1:A-shape dolly:empty|DA-2:A-shape dolly:empty|SL-1:L-shape skid:empty',printed:2,labels:'DA-2,SL-1',bars:true,calls:1});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
