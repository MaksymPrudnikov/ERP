/* Optimization 18.11.2026 (владелец): куски со стеллажа — отдельным блоком под
   таблицей Sheets, отмеченные — под полоской From stock; Offset у куска S-;
   Build the rest — готовые листы стоят, стёкла без листа ложатся на
   отмеченные размеры и куски; + Sheet ▾ — какой пустой лист добавить;
   быстрый фильтр колонки-списка (Stock → Thickness); один Delete recipe. */
module.exports=async function({page,eq}){
 console.log('optimization stock sheets');const t=await page(undefined,{width:1600,height:1000});
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.osReset=function(){
   oqReset();DB.sheetBreak=[];DB.inventoryEvent=[];DB.inventoryMin={};DB.cutting=cutSettingsDefault();cutNotice='';
   DB.glassSheet=[normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:130,sheetHIn:96,availability:'stock'})];
   const at=new Date().toISOString();
   DB.stockOffcut=[1,2,3,4,5,6,7,8,9].map(i=>({id:'S-00009'+String(i).padStart(2,'0'),glass:'6CLEAR',w:125,h:85-i,status:'stock',batch:'B-0900',sheet:i,at}))
    .concat([{id:'S-0000950',glass:'6CLEAR',w:30,h:20,status:'stock',batch:'B-0900',sheet:10,at}]);
  };
  /* 12 стёкол 60 × 40: кусок 125 × 84 берёт четыре. */
  window.osBatch=function(){
   const id=oqOrder(oqCustomer({legalName:'Northside Windows'}),{dueDate:'2026-10-20'});
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=[normalizeSalesOrderLine({makeupId:m.id,width16:60*16,height16:40*16,qty:12,mark:'M1'})];salesEnsureLineShape(soDraft.lines[0]);
   salesLineChargeRows(soDraft.lines[0]).forEach(r=>{salesEnsureChargePricing(soDraft.lines[0],r).orderRate=0.013;});
   if(!soDraft.customerPo)soDraft.customerPo='PO-QA';if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');
   glassBatchAssign(glassBatchRows([salesRecord(id)]),{});const n=DB.glassBatch[DB.glassBatch.length-1].number;cutPlanReset(n);return n;
  };
  /* Только кусок S-0000901, лист 130 × 96 снят: Build кладёт 4 стекла, 8 — без листа. */
  window.osBuilt=function(){
   osReset();const n=osBatch();cutSetStock(n,'6CLEAR','130x96','off',true);cutSetStock(n,'6CLEAR','S-0000901','off',false);
   const r=cutPlanRun(n);if(r.error)throw new Error(r.error);return n;
  };
  window.osG=n=>cutPlanFor(n).groups[0];
  window.osOpen=n=>{tab='optimization';optimizationSetTab('production');glassBatchOpen(n);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();};
 });

 eq('Offset on a stock offcut: laid smaller by the offset on every edge, key stays S-',await t.p.evaluate(()=>{
  osReset();const n=osBatch();cutSetStock(n,'6CLEAR','130x96','off',true);cutSetStock(n,'6CLEAR','S-0000901','off',false);
  const r=cutSetStock(n,'6CLEAR','S-0000901','inset','1/16');cutPlanRun(n);const z=osG(n).sheets[0].size;
  return {ok:!r.error,size:[z.key,z.w,z.h,z.inset]};
 }),{ok:true,size:['S-0000901',124.875,83.875,0.0625]});

 eq('Build the rest: sheet 1 stays byte for byte; the rest goes on the ticked offcut, then on the ticked sheet size',await t.p.evaluate(()=>{
  const n=osBuilt(),before=JSON.stringify(osG(n).sheets[0]),loose=()=>12-osG(n).sheets.reduce((a,s)=>a+s.pieces.length,0);
  const out={first:[osG(n).sheets.length,loose()]};
  out.used=cutSetStock(n,'6CLEAR','S-0000901','inset','1/16').error||'';
  out.tick=cutSetStock(n,'6CLEAR','S-0000902','off',false).error||'';out.reset=!!cutPlanFor(n).reset;
  let r=cutDrain(cutPlanRestSteps(n));
  out.rest=[!!r.error,osG(n).sheets.length,loose(),osG(n).sheets[1].size.key,JSON.stringify(osG(n).sheets[0])===before];
  const two=JSON.stringify(osG(n).sheets[1]);
  cutSetStock(n,'6CLEAR','130x96','off',false);r=cutDrain(cutPlanRestSteps(n));
  out.sheet=[!!r.error,loose(),osG(n).sheets.slice(2).every(s=>s.size.key==='130x96'),JSON.stringify(osG(n).sheets[0])===before,JSON.stringify(osG(n).sheets[1])===two];
  out.again=cutDrain(cutPlanRestSteps(n)).error||'';
  return out;
 }),{first:[1,8],used:'Reset the optimization to change settings.',tick:'',reset:false,rest:[false,2,4,'S-0000902',true],sheet:[false,0,true,true,true],again:''});

 eq('Build the rest keeps a locked sheet locked and its booked stock; a stock piece already on a sheet is not taken twice',await t.p.evaluate(()=>{
  const n=osBuilt();cutUi={batch:n,glass:'6CLEAR',sheet:1,sel:'',drag:''};cutSheetLock(n,'6CLEAR',1);
  cutSetStock(n,'6CLEAR','S-0000902','off',false);cutDrain(cutPlanRestSteps(n));const g=osG(n);
  return [g.sheets[0].locked,g.sheets.filter(s=>s.size.key==='S-0000901').length,g.sheets.filter(s=>s.size.key==='S-0000902').length];
 }),[true,1,1]);

 eq('+ Sheet: an empty sheet of the chosen size; a stock piece on a sheet is not copied',await t.p.evaluate(()=>{
  const n=osBuilt();
  const a=cutSheetAdd(n,'6CLEAR',1).error,b=cutSheetAdd(n,'6CLEAR',1,'S-0000901').error,c=cutSheetAdd(n,'6CLEAR',1,'S-0000903').error;
  cutSetStock(n,'6CLEAR','130x96','off',false);const d=cutSheetAdd(n,'6CLEAR',1,'130x96');
  cutSetStock(n,'6CLEAR','S-0000903','off',false);const e=cutSheetAdd(n,'6CLEAR',1,'S-0000903');
  return [a,b,c,!!d.ok,osG(n).sheets.map(s=>s.size.key+':'+s.pieces.length),!!e.ok];
 }),['A stock offcut cannot be duplicated.','This offcut is already on a sheet.','Tick this sheet in Sheets first.',true,['S-0000901:4','130x96:0','S-0000903:0'],true]);

 eq('Sheets panel: Add sheet size right under the sizes, a From stock strip, the rack block collapsed with the not-placed filter, Build the rest',await t.p.evaluate(()=>{
  const n=osBuilt();osOpen(n);
  const tb=document.querySelector('[data-cut-params] table.cut-stock tbody'),rows=[...tb.children].map(tr=>tr.matches('[data-cut-stock-band]')?'band':tr.matches('.cut-stock-add')?'add':tr.getAttribute('data-cut-stock'));
  const band=document.querySelector('[data-cut-stock-band]').textContent.trim(),inset=!!document.querySelector('[data-cut-stock="S-0000901"] [data-cut-inset]');
  const rack=document.querySelector('[data-cut-rack]'),closed=!rack.querySelector('[data-cut-rack-row]'),head=rack.querySelector('[data-cut-rack-toggle]').textContent.trim();
  cutUiRack('Open',true);const fit=[...document.querySelectorAll('[data-cut-rack-row]')].map(r=>r.getAttribute('data-cut-rack-row'));
  const more=(document.querySelector('[data-cut-rack-all]')||{}).textContent||'';
  cutUiRack('Fit',false);const all=document.querySelectorAll('[data-cut-rack-row]').length;cutUiRack('Q','S-0000950');const q=[...document.querySelectorAll('[data-cut-rack-row]')].map(r=>r.getAttribute('data-cut-rack-row'));
  const rest=document.querySelector('[data-cut-rest]').textContent.replace(/\s+/g,' ').trim();
  const free=!document.querySelector('[data-cut-stock="130x96"] [data-cut-use]').disabled,laid=document.querySelector('[data-cut-stock="S-0000901"] [data-cut-use]').disabled;
  return {rows,band,inset,closed,head,fit:fit.length,more,all,q,rest,free,laid,russian:/[А-яЁё]/.test(document.getElementById('app').innerText)};
 }),{rows:['130x96','add','band','S-0000901'],band:'From stock · 1 in this cut',inset:true,closed:true,head:'▾ Offcuts on the rack · 9',fit:7,more:'1 more · Show all',all:7,q:['S-0000950'],
   rest:'8 glass not on a sheet · 60 × 40, 60 × 40, 60 × 40 … Tick sheets or offcuts belowBuild the rest',free:true,laid:true,russian:false});

 eq('Build the rest from the screen opens the first new sheet; ticking a rack offcut moves it under the strip',await t.p.evaluate(async()=>{
  const n=osBuilt();osOpen(n);cutUiRack('Open',true);
  const box=document.querySelector('[data-cut-rack-row="S-0000902"] [data-cut-use]');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));
  const moved=!!document.querySelector('[data-cut-stock="S-0000902"]')&&!document.querySelector('[data-cut-rack-row="S-0000902"]');
  document.querySelector('[data-cut-build-rest]').click();await cutBuildDone();
  return {moved,sheet:cutUi.sheet,count:osG(n).sheets.length,err:cutNotice};
 }),{moved:true,sheet:2,count:2,err:''});

 eq('+ Sheet menu lists the ticked sizes and offcuts, and From stock opens the rack',await t.p.evaluate(()=>{
  const n=osBuilt();cutSetStock(n,'6CLEAR','130x96','off',false);osOpen(n);
  document.querySelector('[data-cut-sheet-add]').click();
  const items=[...document.querySelectorAll('#cutMenu button')].map(b=>b.textContent.trim());
  [...document.querySelectorAll('#cutMenu button')].find(b=>/^From stock/.test(b.textContent)).click();
  return {items,open:!!document.querySelector('[data-cut-rack-row]')};
 }),{items:['130 × 96','From stock… · 9'],open:true});

 eq('Stock → Use in batch on a built layout ticks the offcut without Reset',await t.p.evaluate(()=>{
  const n=osBuilt(),before=JSON.stringify(osG(n).sheets);stockUiUse('S-0000904',n);
  const p=cutPlanFor(n);return [!!p.reset,JSON.stringify(osG(n).sheets)===before,p.sheetPick['6CLEAR'].sizes.find(x=>x.key==='S-0000904').off,stockInfo&&stockInfo.rest];
 }),[false,true,false,true]);

 eq('Stock list: the header filter of a list column filters (4 in Thickness keeps 4 mm)',await t.p.evaluate(()=>{
  const at=new Date().toISOString();
  DB.stockOffcut=[{id:'S-0000801',glass:'12CLEAR',mm:12,w:100,h:90,status:'stock',batch:'B-0001',sheet:1,at},{id:'S-0000802',glass:'4CLEAR',mm:4,w:80,h:70,status:'stock',batch:'B-0002',sheet:1,at},{id:'S-0000803',glass:'5CLEAR',mm:5,w:60,h:50,status:'stock',batch:'B-0003',sheet:1,at}];
  tab='optimization';optimizationSetTab('stock');render();
  const rows=()=>[...document.querySelectorAll('tr[data-stock-row]')].map(r=>r.getAttribute('data-stock-row'));
  salesListQuick={wrap:'',scope:'glassStock',k:'mm',v:'4'};salesListQuickApply();salesListQuick=null;render();const mm=rows();
  salesListClearFilter('mm');salesListQuick={wrap:'',scope:'glassStock',k:'glass',v:'5'};salesListQuickApply();salesListQuick=null;render();const glass=rows();
  salesListClearFilter('glass');return {mm,glass,all:rows().length};
 }),{mm:['S-0000802'],glass:['S-0000803'],all:3});

 eq('Data → IGU surround: a selected recipe has one Delete recipe in the bar, not a Delete per part',await t.p.evaluate(()=>{
  tab='masterdata';mdPreview=true;mdCatalogGo('surroundRecipe');const rc=DB.surroundRecipe[0];mdPeek='surroundRecipe:'+rc.id;render();mdSyncBar();
  const bar=[...document.querySelectorAll('[data-md-acts] button')].map(b=>b.textContent.trim());
  const cells=[...document.querySelectorAll('[data-recipe="'+rc.id+'"] tbody tr')].map(tr=>tr.querySelectorAll('button').length);
  return {bar,cells:cells.every(n=>n===1)};
 }),{bar:['Open recipe','Hide preview','Delete recipe'],cells:true});

 eq('optimization stock sheets has no JavaScript errors',t.errs,[]);await t.c.close();
};
