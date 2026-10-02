/* Журнал листов Optimization → Sheets: строка — батч × стекло × размер листа,
   цифры те же, что у раскроя батча; лопнувший лист — ещё один лист и отход;
   сброшенный и пустой батч в учёт не идут; экран только читает базу. */
module.exports=async function({page,eq,ok}){
 console.log('sheet usage');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.suSheet=(code,w,h)=>{DB.glassSheet.push(normalizeGlassSheet({productCode:code,supplier:'Vitro',sheetWIn:w,sheetHIn:h,availability:'stock'}));};
  window.suOrder=(sizes)=>{
   const id=oqOrder(oqCustomer({legalName:'Northside Windows'}),{dueDate:'2026-10-20'});
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q||1,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');
   glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return DB.glassBatch[DB.glassBatch.length-1].number;
  };
  /* Два размера листа: одного 144 × 96 всего 1 лист, остальное — 130 × 96. */
  window.suSetup=()=>{
   oqReset();DB.cutPlan=[];DB.sheetBreak=[];DB.stockOffcut=[];DB.glassSheet=[];DB.cutting=cutSettingsDefault();
   suSheet('6CLEAR',96,144);suSheet('6CLEAR',96,130);
   const n=suOrder([[46,60,4],[34,52,5],[20,30,6]]);
   cutPlanReset(n);cutSetStock(n,'6CLEAR','144x96','limit',1);const r=cutPlanRun(n);if(r.error)throw new Error(r.error);
   return n;
  };
  /* Независимый счёт по листам раскроя — не через sheetUsageRows. */
  window.suExpect=n=>{const plan=cutPlanFor(n),m=new Map();
   plan.groups.forEach(g=>g.sheets.forEach(s=>{const z=s.size||g.sheet,k=cutRound(z.w)+'x'+cutRound(z.h),r=m.get(k)||{size:k,sheets:0,area:0,used:0,net:0};
    r.sheets++;r.area+=z.w*z.h/144;r.used+=s.used;r.net+=s.net;m.set(k,r);}));
   return [...m.values()].map(r=>({size:r.size,sheets:r.sheets,area:cutFt2(r.area),used:cutFt2(r.used),net:cutFt2(r.net),usedPct:cutPct(r.used,r.area)})).sort((a,b)=>a.size.localeCompare(b.size));};
  window.suRows=()=>sheetUsageRows().map(r=>({size:r.w+'x'+r.h,sheets:r.sheets,area:r.area,used:r.used,net:r.net,usedPct:r.usedPct})).sort((a,b)=>a.size.localeCompare(b.size));
 });

 eq('строки журнала: батч × стекло × размер — те же листы, ft², Used % и Net, что у раскроя батча',await t.p.evaluate(()=>{
  const n=suSetup(),rows=sheetUsageRows();
  return {same:JSON.stringify(suRows())===JSON.stringify(suExpect(n)),sizes:suRows().map(r=>r.size),one144:suRows().find(r=>r.size==='144x96').sheets,
   batch:[...new Set(rows.map(r=>r.batch))].join(),glass:[...new Set(rows.map(r=>r.glass+' '+r.mm))].join(),status:[...new Set(rows.map(r=>r.status))].join(),broken:rows.reduce((a,r)=>a+r.broken,0)};
 }),{same:true,sizes:['130x96','144x96'],one144:1,batch:'B-0001',glass:'6CLEAR 6',status:'Planned',broken:0});

 eq('лопнувший лист: +1 лист того же размера, его ft² целиком в отход; Used % падает',await t.p.evaluate(()=>{
  const n=suSetup(),g=cutPlanFor(n).groups[0],sh=g.sheets.find(s=>cutRound((s.size||g.sheet).w)===130),before=suRows().find(r=>r.size==='130x96');
  stationSheetBreak(n,'6CLEAR',sh.no,{name:'QA'});
  const after=sheetUsageRows().find(r=>r.w===130),a=130*96/144;
  return {broken:after.broken,sheets:after.sheets===before.sheets,area:Math.abs(after.area-before.area-a)<0.011,waste:Math.abs(after.net-before.net-a)<0.011,
   used:after.used===before.used,pct:after.usedPct<before.usedPct};
 }),{broken:1,sheets:true,area:true,waste:true,used:true,pct:true});

 eq('статус по батчу: Planned → Cutting → Cut; сброшенный и снятый с батча раскрой в учёт не идут',await t.p.evaluate(()=>{
  const n=suSetup(),b=glassBatchFind(n),st=()=>[...new Set(sheetUsageRows().map(r=>r.status))].join()||'none',out=[st()];
  b.items[0].cutStartedAt='2026-10-02T10:00:00.000Z';out.push(st());
  b.items.forEach(i=>{i.cutStartedAt='2026-10-02T10:00:00.000Z';});out.push(st());
  b.items.forEach(i=>{i.cutStartedAt='';});cutPlanReset(n);out.push(st());
  cutPlanRun(n);b.items.forEach(i=>{i.releasedAt='2026-10-02T11:00:00.000Z';});out.push(st());
  return out;
 }),['Planned','Cutting','Cut','none','none']);

 eq('экран Optimization → Sheets: вкладка со счётчиком, строки, итоги от сумм, фильтр дат, ссылка на раскрой батча; база не меняется',await t.p.evaluate(()=>{
  const n=suSetup(),before=JSON.stringify(DB);
  tab='optimization';optimizationSetTab('sheets');salesListClearAll();render();
  const tabBtn=document.querySelector('[data-queue-tab="sheets"]'),rows=document.querySelectorAll('[data-sheet-row]').length;
  const exp=suExpect(n),sum=k=>exp.reduce((a,r)=>a+r[k],0);
  const foot=k=>(document.querySelector('[data-sum="'+k+'"]')||{}).textContent||'';
  const totals={sheets:foot('sheets')===String(sum('sheets')),area:foot('area')===cutNum(sum('area'),1),waste:foot('waste')===cutNum(sum('net'),1),pct:foot('usedPct')===cutNum(cutPct(sum('used'),sum('area')),1)+'%'};
  const label=document.querySelector('[data-sheet-foot]').textContent,dateBtn=!!document.querySelector('[data-date-col="built"]');
  salesListSetFilter('built',{conds:[{op:'between',v:'2020-01-01',v2:'2020-01-31'}]});
  const empty=(document.querySelector('[data-sheet-empty]')||{}).textContent||'';
  salesListClearAll();
  const russian=/[А-яЁё]/.test(document.querySelector('.sheet-usage').innerText),same=JSON.stringify(DB)===before;
  document.querySelector('[data-sheet-batch]').click();
  return {tab:tabBtn.textContent.replace(/\s+/g,' ').trim(),rows,totals,label,dateBtn,empty,russian,same,opened:optimizationTab+' '+glassBatchOpenNumber+' '+glassBatchDetailTab};
 }),{tab:'Sheets 2',rows:2,totals:{sheets:true,area:true,waste:true,pct:true},label:'2 rows · 1 batch',dateBtn:true,empty:'Nothing matches the filters.',russian:false,same:true,opened:'production B-0001 optimization'});
};
