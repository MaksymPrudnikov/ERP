/* Свой раскрой батча: параметры реза по толщине (таблица цеха), гильотинные
   полосы, листы и остаток, выход, экран Optimization у батча, печать схем и
   печать стикеров «по листу». */
module.exports=async function({page,eq,ok}){
 console.log('cut-layout');const t=await page();
 const helpers=async()=>{await require('./optimization-fixture')(t.p);await t.p.evaluate(()=>{
  window.print=()=>{window.cutPrinted=(window.cutPrinted||0)+1;};
  window.ctSheet=(code,w,h,supplier)=>{DB.glassSheet.push(normalizeGlassSheet({productCode:code,supplier:supplier||'Vitro',sheetWIn:w,sheetHIn:h,availability:'stock'}));};
  /* Заказ с одним стеклом на позицию: раскладка считается по лайтам. */
  window.ctOrder=(sizes,extra)=>{
   const id=oqOrder(oqCustomer({legalName:'Northside Windows'}),Object.assign({dueDate:'2026-09-25'},extra||{}));
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q||1,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');
   glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return id;
  };
  window.ctPieces=plan=>plan.groups.flatMap(g=>g.sheets.flatMap(s=>s.pieces.map(p=>Object.assign({sheet:s.no,glass:g.glass,trim:g.params.trim,gap:g.params.gap,sw:g.sheet.w,sh:g.sheet.h},p))));
  window.ctOverlap=plan=>{const bad=[];plan.groups.forEach(g=>g.sheets.forEach(s=>{
   s.pieces.forEach((a,i)=>s.pieces.slice(i+1).forEach(b=>{if(a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h)bad.push(a.piece+'/'+b.piece);}));}));return bad;};
  window.ctOutside=plan=>ctPieces(plan).filter(p=>p.x<p.trim-1e-6||p.y<p.trim-1e-6||p.x+p.w>p.sw-p.trim+1e-6||p.y+p.h>p.sh-p.trim+1e-6).map(p=>p.piece);
  /* Зазор: соседи в одной полосе и соседние полосы не ближе gap. */
  window.ctGapBad=plan=>{const bad=[];plan.groups.forEach(g=>g.sheets.forEach(s=>{
   s.pieces.forEach((a,i)=>s.pieces.slice(i+1).forEach(b=>{
    const dx=Math.max(a.x-(b.x+b.w),b.x-(a.x+a.w)),dy=Math.max(a.y-(b.y+b.h),b.y-(a.y+a.h));
    if(Math.max(dx,dy)<g.params.gap-1e-6)bad.push(a.piece+'/'+b.piece);}));}));return bad;};
 });};
 await helpers();

 eq('параметры реза по толщине — таблица цеха; вне таблицы берётся ближайшая снизу; правка сохраняется',await t.p.evaluate(()=>{
  oqReset();const base=[3,6,10,12,19].map(mm=>{const p=cutParamsFor(mm);return mm+': '+frac16(p.trim)+' / '+frac16(p.gap);});
  const between=cutParamsFor(7),thin=cutParamsFor(2);
  tab='masterdata';mdSetTab('cutting');const row=document.querySelector('[data-cut-trim="6"]');row.value='1';row.dispatchEvent(new Event('change'));
  const saved=cutParamsFor(6).trim;document.querySelector('[data-cut-rotate]').click();const rotate=cutParamsFor(6).rotate;
  document.querySelector('[data-cut-reset]').click();
  return {base,between:frac16(between.gap),thin:frac16(thin.gap),saved,rotate,reset:cutParamsFor(6).trim,rotateBack:cutParamsFor(6).rotate};
 }),{base:['3: 3/4 / 3/4','6: 7/8 / 7/8','10: 1 1/4 / 1 1/4','12: 1 1/2 / 1 1/2','19: 1 1/2 / 4'],between:'7/8',thin:'3/4',saved:1,rotate:false,reset:0.875,rotateBack:true});

 eq('раскрой: детали не налезают, не вылезают за лист с обрезкой кромки, зазор соблюдён, счёт листов и выход',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);const id=ctOrder([[46,60,4],[30,40,3]]);const b=DB.glassBatch[0];
  const r=cutPlanRun(b.number),plan=r.plan;
  const sheets=plan.groups[0].sheets.length,used=plan.stats.usedFt2;
  return {error:r.error||'',overlap:ctOverlap(plan),outside:ctOutside(plan),gap:ctGapBad(plan),placed:plan.stats.placed,sheets,
   yieldOk:plan.stats.yield>0&&plan.stats.yield<=100,used:Math.round(used),sheet:[plan.groups[0].sheet.w,plan.groups[0].sheet.h],stored:DB.cutPlan.length};
 }),{error:'',overlap:[],outside:[],gap:[],placed:7,sheets:2,yieldOk:true,used:102,sheet:[96,130],stored:1});

 eq('один и тот же батч даёт один и тот же раскрой; поворот кладёт деталь, которая иначе не влезает',await t.p.evaluate(()=>{
  const b=DB.glassBatch[0],a=JSON.stringify(cutPlanRun(b.number).plan.groups),c=JSON.stringify(cutPlanRun(b.number).plan.groups);
  const rows=ctPieces(cutPlanFor(b.number)).filter(p=>p.sheet===1),twoPerStrip=rows.filter(p=>p.y===rows[0].y).length;
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);ctOrder([[100,40,1]]);const b2=DB.glassBatch[0];
  const rot=ctPieces(cutPlanRun(b2.number).plan).map(p=>p.rot);
  const s=cutSettings();s.rotate=false;normalizeCutting();const off=cutPlanRun(b2.number).plan;
  const skipped=off.stats.skipped;s.rotate=true;normalizeCutting();
  return {same:a===c,twoPerStrip,rot,skipped};
 }),{same:true,twoPerStrip:2,rot:[true],skipped:1});

 eq('нет размера листа — понятная ошибка; деталь больше листа — в пропущенных; состав изменился — раскрой устарел',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];const id=ctOrder([[40,50,1]]);const b=DB.glassBatch[0];
  const none=cutPlanRun(b.number).error;
  ctSheet('6CLEAR',48,60);cutPlanRun(b.number);
  const stale0=cutPlanStale(b.number);
  const big=ctOrder([[70,90,1]]),b2=DB.glassBatch.find(x=>x.number!==b.number)||DB.glassBatch[0];window.ctDebug={batches:DB.glassBatch.length};
  const r=cutPlanRun(b2.number),skipped=r.plan?r.plan.stats.skipped:-1;
  glassBatchRelease(glassBatchEntries(id).slice(0,1),{confirmed:true});
  return {none,stale0,skipped,stale:cutPlanStale(b.number)};
 }),{none:'No sheet size for 6CLEAR. Add it in Master Data.',stale0:false,skipped:1,stale:true});

 eq('вкладка Optimization у батча: Optimize рисует листы, Re-optimize, предупреждение об изменении, печать схем',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);ctOrder([[46,60,4]]);const b=DB.glassBatch[0];
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';render();
  const before=document.querySelector('[data-cut-stats]').textContent,btn=document.querySelector('[data-cut-run]').textContent;
  document.querySelector('[data-cut-run]').click();
  const stats=document.querySelector('[data-cut-stats]').textContent,sheets=document.querySelectorAll('[data-cut-sheet]').length,rects=document.querySelectorAll('.cut-svg rect').length;
  const again=document.querySelector('[data-cut-run]').textContent;
  document.querySelector('[data-cut-print]').click();
  const pages=document.querySelectorAll('#cutPrintHost .cut-print-page').length;cutPrintCleanup();
  return {before,btn,stats:/1 sheet · 4 pcs · yield \d/.test(stats),sheets,rects:rects>4,again,pages,russian:/[А-яЁё]/.test(document.querySelector('.oq-card').innerText)};
 }),{before:'Not optimized',btn:'Optimize',stats:true,sheets:1,rects:true,again:'Re-optimize',pages:1,russian:false});

 eq('стикеры «по листу»: порядок лист → место, блок Sheet печатает «Sheet 1 · #2»',await t.p.evaluate(()=>{
  const b=DB.glassBatch[0],plan=cutPlanFor(b.number),first=plan.groups.flatMap(g=>g.sheets.flatMap(s=>s.pieces.map(p=>p.piece)));
  stkOpenForBatch(b.number);const order=stkDialog.order,byId=stkDialogJobs().jobs.map(j=>glassPieceAt(glassPieceMap(j.o.id).get(j.c.key),j.unit));
  stkDialogOrder('in');const inOrder=stkDialogJobs().jobs.map(j=>glassPieceAt(glassPieceMap(j.o.id).get(j.c.key),j.unit));
  stkDialogOrder('sheet');
  const tpl=stkTemplate('production','4x6');tpl.blocks.find(x=>x.k==='sheet').on=true;
  const o=salesRecord(DB.salesOrder[0].id),l=o.lines[0],c=glassBatchComponents(o,l)[0];
  const d=stkGlassData('production',o,l,c,1,{batch:b.number});
  const text=stkLayout(tpl,'4x6',d).items.filter(i=>i.t==='text').map(i=>i.s).filter(x=>/^Sheet /.test(x));
  stkDialogClose();
  return {order,bySheet:JSON.stringify(byId)===JSON.stringify(first),inOrder:inOrder.length===first.length,sheet:text,pos:!!d.sheet};
 }),{order:'sheet',bySheet:true,inOrder:true,sheet:['Sheet 1 · #1'],pos:true});

 eq('раскрой в JSON: повтор батча отклоняется, после перезагрузки план тот же; параметры реза тоже переживают',await t.p.evaluate(()=>{
  const src=JSON.parse(JSON.stringify(DB));
  const fail=fn=>{const x=JSON.parse(JSON.stringify(src));fn(x);try{validateImportedState(x);return 'accepted';}catch(e){return e.message;}};
  const next=JSON.parse(JSON.stringify(src));DB=next;normalizeDB();
  return {plans:DB.cutPlan.length,same:JSON.stringify(DB.cutPlan)===JSON.stringify(src.cutPlan),rows:DB.cutting.rows.length,
   dup:fail(x=>{x.cutPlan.push(JSON.parse(JSON.stringify(x.cutPlan[0])));}),shape:fail(x=>{x.cutting=[];}),bad:fail(x=>{x.cutPlan=[{batch:'',groups:[]}];})};
 }),{plans:1,same:true,rows:9,dup:'Duplicate cut plan for B-0001.',shape:'Cutting parameters must be an object.',bad:'Invalid cut plan.'});

 eq('раскрой без ошибок страницы',t.errs,[]);await t.c.close();
};
