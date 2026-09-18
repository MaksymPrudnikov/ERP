/* Раскрой батча: параметры реза по толщине, зазор только вокруг форм,
   выбор лучшего варианта по NetScrap, правки руками (снять, положить,
   повернуть, закрепить, заблокировать лист), цифры потерь, экран и печать. */
module.exports=async function({page,eq,ok}){
 console.log('cut-layout');const t=await page();
 const helpers=async()=>{await require('./optimization-fixture')(t.p);await t.p.evaluate(()=>{
  window.print=()=>{window.cutPrinted=(window.cutPrinted||0)+1;};
  window.ctSheet=(code,w,h)=>{DB.glassSheet.push(normalizeGlassSheet({productCode:code,supplier:'Vitro',sheetWIn:w,sheetHIn:h,availability:'stock'}));};
  window.ctOrder=(sizes,extra)=>{
   const id=oqOrder(oqCustomer({legalName:'Northside Windows'}),Object.assign({dueDate:'2026-09-25'},extra||{}));
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q||1,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');
   glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return id;
  };
  window.ctAll=plan=>plan.groups.flatMap(g=>g.sheets.flatMap(s=>s.pieces.map(p=>Object.assign({sheet:s.no,trim:g.params.trim,sw:g.sheet.w,sh:g.sheet.h},p))));
  window.ctOverlap=plan=>{const bad=[];plan.groups.forEach(g=>g.sheets.forEach(s=>
   s.pieces.forEach((a,i)=>s.pieces.slice(i+1).forEach(b=>{if(a.x<b.x+b.w-1e-6&&b.x<a.x+a.w-1e-6&&a.y<b.y+b.h-1e-6&&b.y<a.y+a.h-1e-6)bad.push(a.piece+'/'+b.piece);}))));return bad;};
  window.ctOutside=plan=>ctAll(plan).filter(p=>p.x<p.trim-1e-6||p.y<p.trim-1e-6||p.x+p.w>p.sw-p.trim+1e-6||p.y+p.h>p.sh-p.trim+1e-6).map(p=>p.piece);
  /* Соседи в одной полосе: минимальный зазор между их краями. */
  window.ctMinGap=plan=>{let min=Infinity;plan.groups.forEach(g=>g.sheets.forEach(s=>
   s.pieces.forEach((a,i)=>s.pieces.slice(i+1).forEach(b=>{
    const sameRow=a.y<b.y+b.h-1e-6&&b.y<a.y+a.h-1e-6,dx=Math.max(a.x-(b.x+b.w),b.x-(a.x+a.w));
    if(sameRow&&dx>=0)min=Math.min(min,dx);}))));return min===Infinity?null:Math.round(min*16)/16;};
 });};
 await helpers();

 eq('параметры реза по толщине: обрезка кромки, зазор вокруг формы, минимальное расстояние; правка и сброс',await t.p.evaluate(()=>{
  oqReset();const base=[3,6,10,19].map(mm=>{const p=cutParamsFor(mm);return mm+': '+frac16(p.trim)+' / '+frac16(p.gap)+' / '+frac16(p.minDist);});
  tab='masterdata';mdSetTab('cutting');const row=document.querySelector('[data-cut-trim="6"]');row.value='1';row.dispatchEvent(new Event('change'));
  const saved=cutParamsFor(6).trim;document.querySelector('[data-cut-reset]').click();
  return {base,between:frac16(cutParamsFor(7).trim),saved,reset:cutParamsFor(6).trim,russian:/[А-яЁё]/.test(document.querySelector('[data-cut-md]').innerText)};
 }),{base:['3: 3/4 / 3/4 / 1/2','6: 3/4 / 7/8 / 3/4','10: 1 1/4 / 1 1/4 / 1','19: 1 1/2 / 4 / 3'],between:'3/4',saved:1,reset:0.75,russian:false});

 eq('прямоугольники лежат впритык: зазор между ними 0, за лист не выходят, не налезают',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);ctOrder([[46,60,4],[30,40,3]]);const b=DB.glassBatch[0];
  const plan=cutPlanRun(b.number).plan;
  return {gap:ctMinGap(plan),overlap:ctOverlap(plan),outside:ctOutside(plan),placed:plan.stats.placed,total:plan.stats.total,sheets:plan.stats.sheets};
 }),{gap:0,overlap:[],outside:[],placed:7,total:7,sheets:2});

 eq('цифры как в Perfect Cut: used + scrap = площадь листов, net = scrap − полезный остаток, Used % = used / (used + net)',await t.p.evaluate(()=>{
  const b=DB.glassBatch[0],plan=cutPlanFor(b.number),s=plan.stats;
  const sheet=plan.groups[0].sheets[0],keep=sheet.offcut?Math.round(sheet.offcut.w*sheet.offcut.h/144*100)/100:0;
  return {sum:Math.abs(s.used+s.gross-s.area)<0.05,net:Math.abs(s.net-(s.gross-s.keep))<0.05,
   usedPct:Math.abs(s.usedPct-Math.round(s.used/(s.used+s.net)*1000)/10)<0.05,sheetKeep:Math.abs(sheet.keep-keep)<0.01,
   netPct:s.netPct>0&&s.netPct<100,orders:plan.orders.length};
 }),{sum:true,net:true,usedPct:true,sheetKeep:true,netPct:true,orders:1});

 eq('вокруг формы со скосом зазор появляется, у прямоугольников остаётся 0',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);const id=ctOrder([[40,50,2]]);
  const o=salesRecord(id),l=o.lines[0],s=newShapeDef('raked');s.w='40';s.h='50';Object.assign(s.params,{shortHeight:'44',rakeSide:'top',shortSide:'right'});
  s.ownerLineId=l.id;DB.shapeDef.push(s);l.shapeRef=salesShapeRefFrom(s);
  const b=DB.glassBatch[0],plan=cutPlanRun(b.number).plan,pieces=cutPieces(b,{});
  return {shape:pieces.every(p=>p.shape),gap:ctMinGap(plan),params:frac16(plan.groups[0].params.gap)};
 }),{shape:true,gap:0.875,params:'7/8'});

 eq('исключить деталь: количество 0 убирает её из реза и из листа',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);ctOrder([[46,60,3]]);const b=DB.glassBatch[0];
  const plan=cutPlanRun(b.number).plan,first=plan.groups[0].sheets[0].pieces[0].piece,before=plan.stats.placed;
  cutSetting(b.number,first,'off',true);
  const after=cutPlanFor(b.number),onSheet=ctAll(after).some(p=>p.piece===first);
  cutPlanRun(b.number);const again=cutPlanFor(b.number),excluded=again.stats.excluded,placed=again.stats.placed;
  cutSetting(b.number,first,'off',false);cutPlanRun(b.number);
  return {before,onSheet,excluded,placed,back:cutPlanFor(b.number).stats.placed};
 }),{before:3,onSheet:false,excluded:1,placed:2,back:3});

 eq('правки руками: снять, положить, повернуть, закрепить; на занятое место и за лист не кладёт',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);ctOrder([[46,60,2]]);const b=DB.glassBatch[0];
  const plan=cutPlanRun(b.number).plan,id=plan.groups[0].sheets[0].pieces[0].piece,other=Object.assign({},plan.groups[0].sheets[0].pieces[1]);
  const took=cutPieceTake(b.number,id),gone=!cutFind(cutPlanFor(b.number),id);
  const onTop=cutPiecePlace(b.number,id,1,other.x,other.y),far=cutPiecePlace(b.number,id,1,900,900);
  const back=cutPiecePlace(b.number,id,1,0.75,65),at=cutFind(cutPlanFor(b.number),id),size=[at.piece.w,at.piece.h];
  const rot=cutPieceRotate(b.number,id),after=cutFind(cutPlanFor(b.number),id);
  const lock=cutPieceLock(b.number,id),locked=cutFind(cutPlanFor(b.number),id).piece.locked;
  return {took:!!took.ok,gone,onTop:/Overlaps/.test(onTop.error||''),far:far.error,
   back:!!back.ok,rot:!!rot.ok,turned:[after.piece.w,after.piece.h].join()===[size[1],size[0]].join(),lock:!!lock.ok,locked};
 }),{took:true,gone:true,onTop:true,far:'Outside the sheet',back:true,rot:true,turned:true,lock:true,locked:true});

 eq('заблокированный лист переживает пересчёт и идёт первым',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);ctOrder([[46,60,4],[30,40,4]]);const b=DB.glassBatch[0];
  cutPlanRun(b.number);const plan=cutPlanFor(b.number),g=plan.groups[0];
  const keep=g.sheets[g.sheets.length-1],ids=keep.pieces.map(p=>p.piece).join();
  cutSheetLock(b.number,g.glass,keep.no);cutPlanRun(b.number);
  const after=cutPlanFor(b.number).groups[0];
  return {locked:after.sheets[0].locked,same:after.sheets[0].pieces.map(p=>p.piece).join()===ids,sheets:after.sheets.length};
 }),{locked:true,same:true,sheets:2});

 eq('приоритет тянет деталь на первый лист; раскрой детерминирован',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);ctOrder([[46,60,4],[30,40,4]]);const b=DB.glassBatch[0];
  const first=cutPlanRun(b.number).plan,a=JSON.stringify(first.groups),c=JSON.stringify(cutPlanRun(b.number).plan.groups);
  const last=cutPlanIndex(b.number),late=[...last.entries()].find(([id,at])=>at.sheet===2);
  if(late)cutSetting(b.number,late[0],'priority',1);
  cutPlanRun(b.number);
  return {same:a===c,moved:late?cutPlanIndex(b.number).get(late[0]).sheet:1};
 }),{same:true,moved:1});

 eq('экран: список стёкол, подписи на детали, полоса потерь, выбор и перенос, блокировка листа, печать',await t.p.evaluate(()=>{
  const b=DB.glassBatch[0];glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  const stats=document.querySelector('[data-cut-stats]').textContent,rows=document.querySelectorAll('[data-cut-list]').length;
  const cur=!!document.querySelector('[data-cut-current]'),total=document.querySelector('[data-cut-total]').textContent;
  const svg=document.querySelector('.cut-paper').textContent,tabs=document.querySelectorAll('[data-cut-tab]').length;
  const id=document.querySelector('[data-cut-list]').dataset.cutList;cutUiPick(id);
  const actions=!!document.querySelector('[data-cut-actions]');
  document.querySelector('[data-cut-take]').click();
  const waiting=/Not on a sheet · 1/.test(document.querySelector('[data-cut-waiting]').textContent);
  cutUiPick(id);cutUiRun(()=>cutPieceAuto(cutUi.batch,id,1));const backOn=!!cutFind(cutPlanFor(b.number),id);
  document.querySelector('[data-cut-sheet-lock]').click();const locked=/Unlock/.test(document.querySelector('[data-cut-sheet-lock]').textContent);
  document.querySelector('[data-cut-sheet-lock]').click();
  document.querySelector('[data-cut-print]').click();const pages=document.querySelectorAll('#cutPrintHost .cut-print-page').length;cutPrintCleanup();
  return {stats:/sheets? · \d+ \/ \d+ pcs · net \d/.test(stats),rows,cur,total:/All sheets/.test(total),labels:/Northside/.test(svg)&&/76002/.test(svg),
   tabs,actions,waiting,backOn,locked,pages,orders:!!document.querySelector('[data-cut-orders]'),russian:/[А-яЁё]/.test(document.querySelector('.oq-card').innerText)};
 }),{stats:true,rows:8,cur:true,total:true,labels:true,tabs:2,actions:true,waiting:true,backOn:true,locked:true,pages:2,orders:true,russian:false});

 eq('склад прогона: несколько размеров листа со своим количеством — 10 листов 130 и 40 листов 144',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctSheet('6CLEAR',96,144);ctOrder([[28,38,30]]);const b=DB.glassBatch[0];
  const base=cutPlanRun(b.number).plan,sizes=cutSheetOptions('6CLEAR').map(x=>frac16(x.w)+'×'+frac16(x.h));
  const firstSize=cutSheetKey(base.groups[0].sheets[0].size);
  /* Сначала 144, и только один такой лист: остальное уходит на 130. */
  cutSetStock(b.number,'6CLEAR','96x144','first',1);
  const mixed=cutSetStock(b.number,'6CLEAR','96x144','limit',1).plan,used=mixed.groups[0].sheets.map(s=>cutSheetKey(s.size));
  const off=cutSetStock(b.number,'6CLEAR','96x144','off',true).plan,only=[...new Set(off.groups[0].sheets.map(s=>cutSheetKey(s.size)))];
  cutResetParams(b.number,'6CLEAR');
  return {sizes,firstSize,mixed:used.slice(0,3),mixedKinds:[...new Set(used)].length,only,back:cutSheetKey(cutPlanFor(b.number).groups[0].sheets[0].size)};
 }),{sizes:['96×144','96×130'],firstSize:'96x144',mixed:['96x144','96x130','96x130'],mixedKinds:2,only:['96x130'],back:'96x144'});

 eq('параметры реза правятся прямо на экране, Master Data остаётся значением по умолчанию',await t.p.evaluate(()=>{
  const b=DB.glassBatch[0],g0=cutPlanFor(b.number).groups[0],was=g0.params.trimX;
  const changed=cutSetParam(b.number,'6CLEAR','trimX','2').plan.groups[0];
  const piece=changed.sheets[0].pieces[0];
  const bad=cutSetParam(b.number,'6CLEAR','gap','abc');
  const rot=cutSetParam(b.number,'6CLEAR','rotate',false).plan.groups[0].params.rotate;
  const md=cutParamsFor(6).trim;
  const back=cutResetParams(b.number,'6CLEAR').plan.groups[0].params;
  return {was,trimX:changed.params.trimX,x:piece.x,bad:bad.error,rot,md,backTrim:back.trimX,backRot:back.rotate};
 }),{was:0.75,trimX:2,x:2,bad:'Enter a size like 3/4 or 1 1/2.',rot:false,md:0.75,backTrim:0.75,backRot:true});

 eq('обрезка кромки своя у каждого размера листа: 130 и 144 режутся по-разному',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctSheet('6CLEAR',96,144);ctOrder([[46,60,2]]);const b=DB.glassBatch[0];
  const base=cutPlanRun(b.number).plan.groups[0],start=base.sheets[0].pieces[0].x;
  cutSheetTrimSet('96x130','trimX','2');cutSheetTrimSet('96x130','trimY','1 1/2');
  cutSetStock(b.number,'6CLEAR','96x144','off',true);
  const own=cutPlanRun(b.number).plan.groups[0];
  const other=cutSheetTrim('96x144');
  tab='masterdata';mdSetTab('cutting');const shown=document.querySelector('[data-cut-trimx="96x130"]').value,rows=document.querySelectorAll('[data-cut-sheet-row]').length;
  return {start,trimX:own.params.trimX,trimY:own.params.trimY,x:own.sheets[0].pieces[0].x,y:own.sheets[0].pieces[0].y,other,shown,rows};
 }),{start:0.75,trimX:2,trimY:1.5,x:2,y:1.5,other:null,shown:'2',rows:2});

 eq('большой батч: десятки листов, всё разложено, ничего не налезает, лист выбирается стрелками',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,120],[28,38,60]]);const b=DB.glassBatch[0];
  const t0=Date.now(),plan=cutPlanRun(b.number).plan,ms=Date.now()-t0;
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  const nav=!!document.querySelector('[data-cut-jump]');
  document.querySelector('[data-cut-next]').click();const second=cutUi.sheet;
  return {sheets:plan.stats.sheets>=10&&plan.stats.sheets<=60,placed:plan.stats.placed,total:plan.stats.total,
   overlap:ctOverlap(plan).length,outside:ctOutside(plan).length,fast:ms<20000,nav,second,tabs:document.querySelectorAll('[data-cut-tab]').length};
 }),{sheets:true,placed:180,total:180,overlap:0,outside:0,fast:true,nav:true,second:2,tabs:0});

 eq('раскрой в JSON: повтор батча отклоняется, после перезагрузки план и правки те же',await t.p.evaluate(()=>{
  const src=JSON.parse(JSON.stringify(DB));
  const fail=fn=>{const x=JSON.parse(JSON.stringify(src));fn(x);try{validateImportedState(x);return 'accepted';}catch(e){return e.message;}};
  const before=JSON.stringify(DB.cutPlan.map(p=>p.groups));
  DB=JSON.parse(JSON.stringify(src));normalizeDB();
  return {same:JSON.stringify(DB.cutPlan.map(p=>p.groups))===before,rows:DB.cutting.rows.length,
   dup:fail(x=>{x.cutPlan.push(JSON.parse(JSON.stringify(x.cutPlan[0])));}),settings:fail(x=>{x.cutPlan[0].settings=[];}),shape:fail(x=>{x.cutting=[];})};
 }),{same:true,rows:9,dup:'Duplicate cut plan for B-0001.',settings:'Invalid cut plan settings.',shape:'Cutting parameters must be an object.'});

 eq('раскрой без ошибок страницы',t.errs,[]);await t.c.close();
};
