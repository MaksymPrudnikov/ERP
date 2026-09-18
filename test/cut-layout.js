/* Раскрой батча: отступы от четырёх краёв листа (Trim X снизу, Trim Y слева,
   Border X сверху, Border Y справа), расстояние только вокруг форм, без
   полосок тоньше Min distance,
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
  window.ctAll=plan=>plan.groups.flatMap(g=>g.sheets.flatMap(s=>{const sz=s.size||g.sheet,u=cutUsable(sz,cutGroupParams(g,sz));return s.pieces.map(p=>Object.assign({sheet:s.no,u,sw:sz.w,sh:sz.h},p));}));
  window.ctOverlap=plan=>{const bad=[];plan.groups.forEach(g=>g.sheets.forEach(s=>
   s.pieces.forEach((a,i)=>s.pieces.slice(i+1).forEach(b=>{if(a.x<b.x+b.w-1e-6&&b.x<a.x+a.w-1e-6&&a.y<b.y+b.h-1e-6&&b.y<a.y+a.h-1e-6)bad.push(a.piece+'/'+b.piece);}))));return bad;};
  window.ctOutside=plan=>ctAll(plan).filter(p=>p.x<p.u.x0-1e-6||p.y<p.u.y0-1e-6||p.x+p.w>p.u.x1+1e-6||p.y+p.h>p.u.y1+1e-6).map(p=>p.piece);
  /* Полоски внутри полосы: у деталей одной полосы разница высот 0 или не меньше Min distance. */
  window.ctSlivers=(plan,limit)=>{const bad=[];plan.groups.forEach(g=>g.sheets.forEach(s=>{const md=limit!=null?limit:cutGroupParams(g,s.size||g.sheet).minDist,rows=new Map();
   s.pieces.forEach(p=>{const k=String(p.y);if(!rows.has(k))rows.set(k,[]);rows.get(k).push(p);});
   rows.forEach(list=>{const top=Math.max(...list.map(p=>p.h));list.forEach(p=>{const d=top-p.h;if(d>1e-6&&d<md-1e-6)bad.push(p.piece+' '+frac16(d));});});}));return bad;};
  /* Соседи в одной полосе: минимальный зазор между их краями. */
  window.ctMinGap=plan=>{let min=Infinity;plan.groups.forEach(g=>g.sheets.forEach(s=>
   s.pieces.forEach((a,i)=>s.pieces.slice(i+1).forEach(b=>{
    const sameRow=a.y<b.y+b.h-1e-6&&b.y<a.y+a.h-1e-6,dx=Math.max(a.x-(b.x+b.w),b.x-(a.x+a.w));
    if(sameRow&&dx>=0)min=Math.min(min,dx);}))));return min===Infinity?null:Math.round(min*16)/16;};
 });};
 await helpers();

 eq('параметры реза по толщине: обрезка кромки, зазор вокруг формы, минимальное расстояние; правка и сброс',await t.p.evaluate(()=>{
  oqReset();const base=[3,6,10,19].map(mm=>{const p=cutParamsFor(mm);return mm+': '+frac16(p.trim)+' / '+frac16(p.border)+' / '+frac16(p.minDist);});
  tab='masterdata';mdSetTab('cutting');const row=document.querySelector('[data-cut-trim="6"]');row.value='1';row.dispatchEvent(new Event('change'));
  const saved=cutParamsFor(6).trim;document.querySelector('[data-cut-reset]').click();
  return {base,between:frac16(cutParamsFor(7).trim),saved,reset:cutParamsFor(6).trim,russian:/[А-яЁё]/.test(document.querySelector('[data-cut-md]').innerText)};
 }),{base:['3: 3/4 / 3/4 / 1/2','6: 7/8 / 7/8 / 3/4','10: 1 1/4 / 1 1/4 / 1','19: 0 / 4 / 4'],between:'7/8',saved:1,reset:0.875,russian:false});

 eq('четыре края листа: Trim X снизу, Trim Y слева, Border X сверху, Border Y справа — детали за линии не заходят',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,144);ctOrder([[46,60,3],[34,52,4]]);const b=DB.glassBatch[0];
  cutPlanRun(b.number);['trimX:1','trimY:2','borderX:3','borderY:4'].forEach(x=>{const [f,v]=x.split(':');cutSetParam(b.number,'6CLEAR',f,v);});
  const plan=cutPlanFor(b.number),g=plan.groups[0],all=ctAll(plan).filter(p=>p.sheet===1);
  const low=Math.min(...all.map(p=>p.y)),left=Math.min(...all.map(p=>p.x)),top=Math.max(...all.map(p=>p.y+p.h)),right=Math.max(...all.map(p=>p.x+p.w));
  const u=cutUsable(g.sheets[0].size,cutGroupParams(g,g.sheets[0].size));
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  const lines=[...document.querySelectorAll('.cut-paper [data-cut-edge]')].map(l=>l.dataset.cutEdge+(l.getAttribute('x1')===l.getAttribute('x2')?' |':' —'));
  const bad=cutSetParam(b.number,'6CLEAR','gap','1');cutResetParams(b.number,'6CLEAR');
  return {u:[u.x0,u.y0,u.x1,u.y1],low,left,topOk:top<=141+1e-6,rightOk:right<=140+1e-6,outside:ctOutside(plan),lines,dashed:document.querySelectorAll('.cut-paper [stroke-dasharray]').length,bad:bad.error};
 }),{u:[2,1,140,93],low:1,left:2,topOk:true,rightOk:true,outside:[],lines:['trimX —','trimY |','borderX —','borderY |'],dashed:0,bad:'Unknown cutting parameter.'});

 eq('полоска 1/16 не остаётся: в полосе деталь либо той же высоты, либо ниже не меньше чем на Min distance',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,144);ctOrder([[46,60,1],[46,59.9375,2]]);const b=DB.glassBatch[0];
  const plan=cutPlanRun(b.number).plan,clean=ctSlivers(plan),placed=plan.stats.placed;
  /* Без правила (Min distance 0) одна и та же стратегия кладёт полоски — значит правило работает. */
  const pieces=cutPieces(b,{}),stock=cutStockFor('6CLEAR',null),pack=md=>cutPack(pieces,stock,size=>Object.assign(cutRunParams(6,size,null),{minDist:md}),CUT_STRATEGIES[0],[],6);
  const asPlan=r=>({groups:[{glass:'6CLEAR',mm:6,sheet:stock[0],pick:null,params:{},sheets:r.sheets}]});
  const loose=ctSlivers(asPlan(pack(0)),0.75).length>0&&ctSlivers(asPlan(pack(0.75)),0.75).length===0;
  return {clean,placed,loose,overlap:ctOverlap(cutPlanFor(b.number))};
 }),{clean:[],placed:3,loose:true,overlap:[]});

 eq('прямоугольники лежат впритык: зазор между ними 0, за лист не выходят, не налезают',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);ctOrder([[46,60,4],[30,40,3]]);const b=DB.glassBatch[0];
  const plan=cutPlanRun(b.number).plan;
  return {gap:ctMinGap(plan),overlap:ctOverlap(plan),outside:ctOutside(plan),placed:plan.stats.placed,total:plan.stats.total,sheets:plan.stats.sheets};
 }),{gap:0,overlap:[],outside:[],placed:7,total:7,sheets:2});

 eq('цифры как в Perfect Cut: used + scrap = площадь листов, net = scrap − полезный остаток, Used % = used / (used + net)',await t.p.evaluate(()=>{
  const b=DB.glassBatch[0],plan=cutPlanFor(b.number),s=plan.stats;
  const sheet=plan.groups[0].sheets[0],keep=Math.round((sheet.stock||[]).reduce((a,x)=>a+x.w*x.h/144,0)*100)/100;
  return {sum:Math.abs(s.used+s.gross-s.area)<0.05,net:Math.abs(s.net-(s.gross-s.keep))<0.05,
   usedPct:Math.abs(s.usedPct-Math.round(s.used/(s.used+s.net)*1000)/10)<0.05,sheetKeep:Math.abs(sheet.keep-keep)<0.01,
   netPct:s.netPct>0&&s.netPct<100,orders:plan.orders.length};
 }),{sum:true,net:true,usedPct:true,sheetKeep:true,netPct:true,orders:1});

 eq('остаток — подсказка: пока не отмечен «в сток», он отход; Used % — доля листа под заказы; раскрой берёт меньше квадратных футов',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctSheet('6CLEAR',96,144);ctOrder([[46,60,5],[28,38,6]]);const b=DB.glassBatch[0];
  const plan=cutPlanRun(b.number).plan,g=plan.groups[0],withCut=g.sheets.find(s=>(s.offcuts||[]).length),hint=Object.assign({},withCut.offcuts[0]);
  const before={net:plan.stats.net,gross:plan.stats.gross,keep:plan.stats.keep,usedPct:plan.stats.usedPct,honest:Math.abs(plan.stats.usedPct-Math.round(plan.stats.used/plan.stats.area*1000)/10)<0.05};
  const min=[cutSettings().minOffcutW,cutSettings().minOffcutH],big=g.sheets.every(s=>(s.offcuts||[]).every(o=>o.w>=40&&o.h>=40));
  const noHint=g.sheets.find(s=>!(s.offcuts||[]).length);
  const kept=cutStockTake(b.number,g.glass,withCut.no,0),after=cutPlanFor(b.number).stats,area=cutFt2(cutArea(hint.w,hint.h));
  const none=cutStockTake(b.number,g.glass,noHint?noHint.no:999,0).error;
  /* Из всех стратегий взята та, что тратит меньше квадратных футов листа. */
  const params=size=>cutRunParams(g.mm,size,null),pieces=cutPieces(b,{}).filter(p=>!p.off);
  const areas=CUT_STRATEGIES.map(st=>{const r=cutPack(pieces,cutStockFor(g.glass,null),params,st,[],g.mm);return r.unplaced.length?Infinity:r.sheets.reduce((a,s)=>a+cutArea(s.size.w,s.size.h),0);});
  const chosen=g.sheets.reduce((a,s)=>a+cutArea(s.size.w,s.size.h),0);
  /* Старое умолчание 12 × 12 переводится на 40 × 40 один раз. */
  DB.cutting={minOffcutW:12,minOffcutH:12};normalizeCutting();const migrated=[DB.cutting.minOffcutW,DB.cutting.minOffcutH];
  DB.cutting.minOffcutW=12;DB.cutting.minOffcutH=12;normalizeCutting();const own=[DB.cutting.minOffcutW,DB.cutting.minOffcutH];
  return {netIsGross:before.net===before.gross,keep0:before.keep,honest:before.honest,min,big,kept:!!kept.ok,keepAfter:after.keep===area,netAfter:Math.abs(after.net-(after.gross-area))<0.02,
   usedSame:after.usedPct===before.usedPct,none,leastArea:Math.abs(chosen-Math.min(...areas))<1e-6,migrated,own};
 }),{netIsGross:true,keep0:0,honest:true,min:[40,40],big:true,kept:true,keepAfter:true,netAfter:true,usedSame:true,none:'No such offcut.',leastArea:true,migrated:[40,40],own:[12,12]});

 eq('вокруг формы со скосом зазор появляется, у прямоугольников остаётся 0',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);const id=ctOrder([[40,50,2]]);
  const o=salesRecord(id),l=o.lines[0],s=newShapeDef('raked');s.w='40';s.h='50';Object.assign(s.params,{shortHeight:'44',rakeSide:'top',shortSide:'right'});
  s.ownerLineId=l.id;DB.shapeDef.push(s);l.shapeRef=salesShapeRefFrom(s);
  const b=DB.glassBatch[0],plan=cutPlanRun(b.number).plan,pieces=cutPieces(b,{});
  return {shape:pieces.every(p=>p.shape),gap:ctMinGap(plan),params:frac16(plan.groups[0].params.minDist)};
 }),{shape:true,gap:0.75,params:'3/4'});

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
  const u=cutUsable(plan.groups[0].sheets[0].size,cutGroupParams(plan.groups[0],plan.groups[0].sheets[0].size));
  const took=cutPieceTake(b.number,id),gone=!cutFind(cutPlanFor(b.number),id);
  /* Сосед подъехал к краю — место снятого стекла не остаётся дырой. */
  const now=Object.assign({},cutFind(cutPlanFor(b.number),other.piece).piece),slid=now.x===u.x0;
  const onTop=cutPiecePlace(b.number,id,1,now.x,now.y),far=cutPiecePlace(b.number,id,1,900,900);
  const back=cutPiecePlace(b.number,id,1,now.x+now.w,u.y0),at=cutFind(cutPlanFor(b.number),id),size=[at.piece.w,at.piece.h];
  const rot=cutPieceRotate(b.number,id),after=cutFind(cutPlanFor(b.number),id);
  const lock=cutPieceLock(b.number,id),locked=cutFind(cutPlanFor(b.number),id).piece.locked;
  return {took:!!took.ok,gone,slid,onTop:/Overlaps/.test(onTop.error||''),far:far.error,
   back:!!back.ok,rot:!!rot.ok,turned:[after.piece.w,after.piece.h].join()===[size[1],size[0]].join(),lock:!!lock.ok,locked};
 }),{took:true,gone:true,slid:true,onTop:true,far:'Outside the sheet',back:true,rot:true,turned:true,lock:true,locked:true});

 eq('после поворота и снятия стёкла подъезжают к краю или к соседу; стало шире — соседи отодвигаются; нет места — отказ',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[30,40,3]]);const b=DB.glassBatch[0];
  cutPlanRun(b.number);const g0=cutSetParam(b.number,'6CLEAR','rotate',false).plan.groups[0],u=cutUsable(g0.sheets[0].size,cutGroupParams(g0,g0.sheets[0].size));
  const pcs=()=>cutPlanFor(b.number).groups[0].sheets[0].pieces.slice().sort((a,c)=>a.x-c.x);
  const row=()=>pcs().map(p=>[cutRound(p.x-u.x0),p.w,p.h].join(':'));
  const start=row(),mid=pcs()[1].piece;
  const wide=cutPieceRotate(b.number,mid),afterWide=row();
  const narrow=cutPieceRotate(b.number,mid),afterNarrow=row();
  cutPieceTake(b.number,pcs()[0].piece);const afterTake=row(),overlap=ctOverlap(cutPlanFor(b.number));
  /* Ряд забит: повернуть шире некуда — отказ, ряд не тронут. */
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[32,40,4]]);const c=DB.glassBatch[0];
  const full=cutPlanRun(c.number).plan.groups[0].sheets[0].pieces.slice().sort((a,d)=>a.x-d.x),before=JSON.stringify(full.map(p=>[p.x,p.w]));
  const no=cutPieceRotate(c.number,full[1].piece),same=JSON.stringify(cutPlanFor(c.number).groups[0].sheets[0].pieces.slice().sort((a,d)=>a.x-d.x).map(p=>[p.x,p.w]))===before;
  return {start,wide:!!wide.ok,afterWide,narrow:!!narrow.ok,afterNarrow,afterTake,overlap,no:no.error,same};
 }),{start:['0:30:40','30:30:40','60:30:40'],wide:true,afterWide:['0:30:40','30:40:30','70:30:40'],narrow:true,afterNarrow:['0:30:40','30:30:40','60:30:40'],
  afterTake:['0:30:40','30:30:40'],overlap:[],no:'No room to rotate on this sheet.',same:true});

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
  /* Лист лёжа, ноль слева внизу, обрезка кромки — сплошной вектор (для станка), без пунктира. */
  const tl=document.querySelector('.cut-paper [data-cut-edge]'),vb=document.querySelector('.cut-paper svg').getAttribute('viewBox').split(' ').map(Number);
  const sheetView={landscape:vb[2]>vb[3],trim:!!tl&&!tl.hasAttribute('stroke-dasharray'),dashed:document.querySelectorAll('.cut-paper [stroke-dasharray]').length,zero:[...document.querySelectorAll('.cut-paper text')].some(x=>x.textContent==='0')&&/^X \d/.test([...document.querySelectorAll('.cut-paper text')].map(x=>x.textContent).find(x=>/^X /.test(x))||'')};
  const id=document.querySelector('[data-cut-list]').dataset.cutList;cutUiPick(id);
  const actions=!!document.querySelector('[data-cut-actions]');
  document.querySelector('[data-cut-take]').click();
  const waiting=/Not on a sheet · 1/.test(document.querySelector('[data-cut-waiting]').textContent);
  cutUiPick(id);cutUiRun(()=>cutPieceAuto(cutUi.batch,id,1));const backOn=!!cutFind(cutPlanFor(b.number),id);
  document.querySelector('[data-cut-sheet-lock]').click();const locked=/Unlock/.test(document.querySelector('[data-cut-sheet-lock]').textContent);
  document.querySelector('[data-cut-sheet-lock]').click();
  document.querySelector('[data-cut-print]').click();const pages=document.querySelectorAll('#cutPrintHost .cut-print-page').length;cutPrintCleanup();
  return {stats:/sheets? · \d+ \/ \d+ pcs · used \d/.test(stats),rows,cur,total:/All sheets/.test(total),labels:/Northside/.test(svg)&&/76002/.test(svg),
   sheetView,tabs,actions,waiting,backOn,locked,pages,orders:!!document.querySelector('[data-cut-orders]'),russian:/[А-яЁё]/.test(document.querySelector('.oq-card').innerText)};
 }),{stats:true,rows:8,cur:true,total:true,labels:true,sheetView:{landscape:true,trim:true,dashed:0,zero:true},tabs:2,actions:true,waiting:true,backOn:true,locked:true,pages:2,orders:true,russian:false});

 eq('склад прогона: несколько размеров листа со своим количеством — 10 листов 130 и 40 листов 144',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctSheet('6CLEAR',96,144);ctOrder([[28,38,30]]);const b=DB.glassBatch[0];
  const base=cutPlanRun(b.number).plan,sizes=cutSheetOptions('6CLEAR').map(x=>frac16(x.w)+'×'+frac16(x.h));
  const firstSize=cutSheetKey(base.groups[0].sheets[0].size);
  /* Сначала 144, и только один такой лист: остальное уходит на 130. */
  cutSetStock(b.number,'6CLEAR','144x96','first',1);
  const mixed=cutSetStock(b.number,'6CLEAR','144x96','limit',1).plan,used=mixed.groups[0].sheets.map(s=>cutSheetKey(s.size));
  const off=cutSetStock(b.number,'6CLEAR','144x96','off',true).plan,only=[...new Set(off.groups[0].sheets.map(s=>cutSheetKey(s.size)))];
  cutResetParams(b.number,'6CLEAR');
  return {sizes,firstSize,mixed:used.slice(0,3),mixedKinds:[...new Set(used)].length,only,back:cutSheetKey(cutPlanFor(b.number).groups[0].sheets[0].size)};
 }),{sizes:['144×96','130×96'],firstSize:'144x96',mixed:['144x96','130x96','130x96'],mixedKinds:2,only:['130x96'],back:'144x96'});

 eq('параметры реза правятся прямо на экране, Master Data остаётся значением по умолчанию',await t.p.evaluate(()=>{
  const b=DB.glassBatch[0],g0=cutPlanFor(b.number).groups[0],was=g0.params.trimX;
  const changed=cutSetParam(b.number,'6CLEAR','trimX','2').plan.groups[0];
  const piece=changed.sheets[0].pieces[0];
  const bad=cutSetParam(b.number,'6CLEAR','minDist','abc');
  const rot=cutSetParam(b.number,'6CLEAR','rotate',false).plan.groups[0].params.rotate;
  const md=cutParamsFor(6).trim;
  const back=cutResetParams(b.number,'6CLEAR').plan.groups[0].params;
  return {was,trimX:changed.params.trimX,y:piece.y,bad:bad.error,rot,md,backTrim:back.trimX,backRot:back.rotate};
 }),{was:0.875,trimX:2,y:2,bad:'Enter a size like 3/4 or 1 1/2.',rot:false,md:0.875,backTrim:0.875,backRot:true});

 eq('обрезка кромки своя у каждого размера листа: 130 и 144 режутся по-разному',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctSheet('6CLEAR',96,144);ctOrder([[46,60,2]]);const b=DB.glassBatch[0];
  const base=cutPlanRun(b.number).plan.groups[0],start=base.sheets[0].pieces[0].x;
  cutSheetTrimSet('130x96','trimX','2');cutSheetTrimSet('130x96','trimY','1 1/2');
  cutSetStock(b.number,'6CLEAR','144x96','off',true);
  const own=cutPlanRun(b.number).plan.groups[0];
  const other=cutSheetTrim('144x96');
  tab='masterdata';mdSetTab('cutting');const shown=document.querySelector('[data-cut-trimx="130x96"]').value,rows=document.querySelectorAll('[data-cut-sheet-row]').length;
  return {start,trimX:own.params.trimX,trimY:own.params.trimY,x:own.sheets[0].pieces[0].x,y:own.sheets[0].pieces[0].y,other,shown,rows};
 }),{start:0.875,trimX:2,trimY:1.5,x:1.5,y:2,other:null,shown:'2',rows:2});

 eq('в прогоне у каждого размера свои Trim и Border: 144 и 130 правятся отдельно',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctSheet('6CLEAR',96,144);ctOrder([[28,38,30]]);const b=DB.glassBatch[0];
  cutPlanRun(b.number);cutSetStock(b.number,'6CLEAR','144x96','first',1);cutSetStock(b.number,'6CLEAR','144x96','limit',1);
  cutSetStock(b.number,'6CLEAR','144x96','trimX','2');cutSetStock(b.number,'6CLEAR','130x96','trimY','1 1/2');
  const bad=cutSetStock(b.number,'6CLEAR','130x96','borderY','abc').error;
  const plan=cutPlanFor(b.number),g=plan.groups[0],by=k=>ctAll(plan).filter(p=>cutSheetKey(g.sheets.find(s=>s.no===p.sheet).size)===k);
  const a=by('144x96'),c=by('130x96');
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  const shown=[...document.querySelectorAll('[data-cut-stock]')].map(r=>r.dataset.cutStock+' '+r.querySelector('[data-cut-edge-trimx]').value+' '+r.querySelector('[data-cut-edge-trimy]').value);
  cutSetStock(b.number,'6CLEAR','144x96','trimX','');const back=cutGroupParams(cutPlanFor(b.number).groups[0],{key:'144x96',w:144,h:96}).trimX;
  return {y144:Math.min(...a.map(p=>p.y)),x144:Math.min(...a.map(p=>p.x)),y130:Math.min(...c.map(p=>p.y)),x130:Math.min(...c.map(p=>p.x)),
   outside:ctOutside(plan),bad,shown,back,md:cutSheetTrim('144x96')};
 }),{y144:2,x144:0.875,y130:0.875,x130:1.5,outside:[],bad:'Enter a size like 3/4 or 1 1/2.',shown:['144x96 2 7/8','130x96 7/8 1 1/2'],back:0.875,md:null});

 eq('нет размера листа: экран говорит, для какого стекла, размер добавляется прямо здесь и сразу раскладывает',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctOrder([[46,60,2]]);const b=DB.glassBatch[0];
  const none=cutPlanRun(b.number).error;
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};
  document.querySelector('[data-tab-optimization]').click();document.querySelector('[data-cut-run]').click();
  const need=document.querySelector('[data-cut-need]'),needText=need?need.textContent.replace(/\s+/g,' ').trim():'';
  const shownError=!!document.querySelector('[data-cut-error]');
  document.getElementById('cutNeedW').value='3300';document.getElementById('cutNeedH').value='96';document.querySelector('[data-cut-need-add]').click();
  const inches=document.querySelector('[data-cut-error]').textContent;
  document.getElementById('cutNeedW').value='96';document.getElementById('cutNeedH').value='130';document.querySelector('[data-cut-need-add]').click();
  const plan=cutPlanFor(b.number);
  return {none,shownError,needText:/No sheet size · 6CLEAR/.test(needText),inches,
   laid:plan?plan.stats.placed:0,size:plan?cutSheetKey(plan.groups[0].sheets[0].size):'',gone:!document.querySelector('[data-cut-need]'),
   error:!!document.querySelector('[data-cut-error]'),shop:cutShopSizes().map(x=>x.key),stockRow:!!document.querySelector('[data-cut-stock="130x96"]'),
   russian:/[А-яЁё]/.test(document.querySelector('.oq-card').innerText)};
 }),{none:'No sheet size for 6CLEAR. Add one below.',shownError:false,needText:true,inches:'Sheet size is in inches, for example 130 × 96.',
  laid:2,size:'130x96',gone:true,error:false,shop:['130x96'],stockRow:true,russian:false});

 eq('размер с экрана прогона и из Master Data: добавить, повтор и ошибка, убрать; сброс таблицы цеха размеры не трогает',await t.p.evaluate(()=>{
  const b=DB.glassBatch[0];
  document.getElementById('cutRunSizeW').value='144';document.getElementById('cutRunSizeH').value='96';document.querySelector('[data-cut-size-new]').click();
  const run=[...document.querySelectorAll('[data-cut-stock]')].map(r=>r.dataset.cutStock);
  const dup=cutShopSizeAdd('96','130').error,bad=cutShopSizeAdd('abc','96').error;
  cutSheetTrimSet('144x96','borderY','2');
  tab='masterdata';mdSetTab('cutting');
  const rows=[...document.querySelectorAll('[data-cut-sheet-row]')].map(r=>r.dataset.cutSheetRow+' '+r.children[1].textContent);
  document.getElementById('cutMdSizeW').value='84';document.getElementById('cutMdSizeH').value='130';document.querySelector('[data-cut-size-add] button').click();
  const added=cutShopSizes().map(x=>x.key);
  document.getElementById('cutMdSizeW').value='130';document.getElementById('cutMdSizeH').value='84';document.querySelector('[data-cut-size-add] button').click();
  const mdError=(document.querySelector('[data-cut-md-error]')||{}).textContent;
  document.querySelector('[data-cut-size-remove="144x96"]').click();
  const removed=cutShopSizes().map(x=>x.key),edgesGone=cutSheetTrim('144x96');
  document.querySelector('[data-cut-reset]').click();
  return {run,dup,bad,rows,added,mdError,removed,edgesGone,afterReset:cutShopSizes().map(x=>x.key)};
 }),{run:['144x96','130x96'],dup:'This sheet size is already there.',bad:'Enter the sheet size, for example 130 × 96.',
  rows:['144x96 All glass','130x96 All glass'],added:['144x96','130x96','130x84'],mdError:'This sheet size is already there.',
  removed:['130x96','130x84'],edgesGone:null,afterReset:['130x96','130x84']});

 eq('размеры поставки стекла идут первыми, размеры цеха — за ними; один размер от двух поставщиков — одна строка',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);
  DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Guardian',sheetWIn:130,sheetHIn:96,availability:'stock'}));
  cutShopSizeAdd('144','96');cutShopSizeAdd('130','96');ctOrder([[46,60,4]]);const b=DB.glassBatch[0];
  const options=cutSheetOptions('6CLEAR').map(x=>cutSheetKey(x)+(x.shop?' shop':'')),first=cutSheetKey(cutPlanRun(b.number).plan.groups[0].sheets[0].size);
  const chosen=cutSheetKey(cutSetStock(b.number,'6CLEAR','144x96','first',1).plan.groups[0].sheets[0].size);
  const md=cutSheetSizes().map(x=>x.key+' '+(x.shop?'shop':'')+' '+x.codes.join());
  return {options,first,chosen,md};
 }),{options:['130x96','144x96 shop'],first:'130x96',chosen:'144x96',md:['144x96 shop ','130x96 shop 6CLEAR']});

 eq('размеры цеха в JSON: не массив — отказ, мусор и повторы чистятся',await t.p.evaluate(()=>{
  let shape='accepted';try{validateCuttingPayload({cutting:{sizes:{}}});}catch(e){shape=e.message;}
  DB.cutting={sizes:[{w:96,h:130},{w:'130',h:'96'},{w:0,h:5},{w:'abc',h:1},{w:3300,h:96},null]};normalizeCutting();
  const sizes=DB.cutting.sizes;oqReset();
  return {shape,sizes};
 }),{shape:'Cutting sheet sizes must be an array.',sizes:[{key:'130x96',w:130,h:96}]});

 eq('большой батч: десятки листов, всё разложено, ничего не налезает, лист выбирается стрелками',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,120],[28,38,60]]);const b=DB.glassBatch[0];
  const t0=Date.now(),plan=cutPlanRun(b.number).plan,ms=Date.now()-t0;
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  const nav=!!document.querySelector('[data-cut-jump]');
  document.querySelector('[data-cut-next]').click();const second=cutUi.sheet;
  return {sheets:plan.stats.sheets>=10&&plan.stats.sheets<=60,placed:plan.stats.placed,total:plan.stats.total,
   overlap:ctOverlap(plan).length,outside:ctOutside(plan).length,fast:ms<20000,nav,second,tabs:document.querySelectorAll('[data-cut-tab]').length};
 }),{sheets:true,placed:180,total:180,overlap:0,outside:0,fast:true,nav:true,second:2,tabs:0});

 eq('остатки: все куски от 40 × 40 на листе, в сток — номер S-0000001, лист блокируется, из отходов уходит только взятое',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[50,50,1]]);const b=DB.glassBatch[0];
  const plan=cutPlanRun(b.number).plan,g=plan.groups[0],s=g.sheets[0],hints=s.offcuts.map(o=>Object.assign({},o));
  const clash=(a,c)=>a.x<c.x+c.w-1e-6&&c.x<a.x+a.w-1e-6&&a.y<c.y+c.h-1e-6&&c.y<a.y+a.h-1e-6;
  const clean=hints.every((o,i)=>o.w>=40&&o.h>=40&&!s.pieces.some(p=>clash(o,p))&&!hints.some((q,j)=>j!==i&&clash(o,q)));
  const gross=s.gross,first=cutStockTake(b.number,g.glass,1,0),s1=cutPlanFor(b.number).groups[0].sheets[0],keep1=s1.keep,net1=s1.net,hints1=s1.offcuts.slice(),box1=Object.assign({},s1.stock[0]);
  const rec=stockOffcutFind(first.id),area=Math.round(hints[0].w*hints[0].h/144*100)/100;
  const recOk=!!rec&&rec.glass==='6CLEAR'&&rec.mm===6&&rec.w===hints[0].w&&rec.h===hints[0].h&&rec.batch===b.number&&rec.sheet===1&&rec.status==='stock';
  const second=cutStockTake(b.number,g.glass,1,0),s2=cutPlanFor(b.number).groups[0].sheets[0];
  return {many:hints.length>=2,clean,id:first.id,locked:s1.locked,recOk,keep:keep1===area,net:Math.abs(net1-(gross-area))<0.02,
   gone:!hints1.some(o=>clash(o,box1)),second:second.id,stock:s2.stock.length};
 }),{many:true,clean:true,id:'S-0000001',locked:true,recOk:true,keep:true,net:true,gone:true,second:'S-0000002',stock:2});

 eq('Split — один рез до линии Border: кусок в сток на всю вторую сторону, остаток снова подсказка; минимум 40; снять со стока — номер не повторяется; сток — препятствие',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,30,2]]);const b=DB.glassBatch[0];
  const g=cutPlanRun(b.number).plan.groups[0],o=Object.assign({},g.sheets[0].offcuts[0]);
  const err=(a,v)=>cutStockSplit(b.number,g.glass,1,0,a,v).error;
  const errors=[err('length','abc'),err('diagonal','40'),err('length',String(o.w+1)),err('width','30')];
  const cut=cutStockSplit(b.number,g.glass,1,0,'length','50'),s=cutPlanFor(b.number).groups[0].sheets[0],x=Object.assign({},s.stock[0]);
  const piece1=[x.x===o.x,x.y===o.y,x.w,x.h===o.h];
  /* Хвост после реза целиком внутри подсказки (она может быть и больше — до низа листа). */
  const rest=s.offcuts.some(r=>Math.abs(r.x-(o.x+50))<1e-6&&Math.abs(r.w-(o.w-50))<1e-6&&r.y<=o.y+1e-6&&r.y+r.h>=o.y+o.h-1e-6);
  const lockedNow=cutPiecePlace(b.number,s.pieces[0].piece,1,x.x,x.y).error;cutSheetLock(b.number,g.glass,1);
  const onStock=cutPiecePlace(b.number,s.pieces[0].piece,1,x.x,x.y).error;
  const back=cutStockCancel(b.number,cut.id),rec=stockOffcutFind(cut.id);
  const wide=cutStockSplit(b.number,g.glass,1,0,'width','40'),y=cutPlanFor(b.number).groups[0].sheets[0].stock[0];
  return {errors,id:cut.id,piece1,rest,lockedNow,onStock,back:!!back.ok,status:rec.status,next:wide.id,piece2:[y.w===o.w,y.h]};
 }),{errors:['Enter the size, for example 40.','Cut along length or width.','Longer than this offcut.','Smaller than the minimum offcut 40 × 40″.'],
  id:'S-0000001',piece1:[true,true,50,true],rest:true,lockedNow:'Sheet is locked.',onStock:'Overlaps S-0000001',back:true,status:'cancelled',next:'S-0000002',piece2:[true,40]});

 eq('пересчёт: заблокированный лист держит свой сток; разблокированный пересобран — его сток снят',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,30,2]]);const b=DB.glassBatch[0];
  const g=cutPlanRun(b.number).plan.groups[0];const id=cutStockTake(b.number,g.glass,1,0).id;
  const again=cutPlanRun(b.number),kept=again.plan.groups[0].sheets[0].stock.map(x=>x.id),cancelled1=again.cancelled.length;
  cutSheetLock(b.number,g.glass,1);const third=cutPlanRun(b.number);
  return {kept,cancelled1,cancelled:third.cancelled,status:stockOffcutFind(id).status,stock:third.plan.groups[0].sheets.reduce((n,s)=>n+s.stock.length,0)};
 }),{kept:['S-0000001'],cancelled1:0,cancelled:['S-0000001'],status:'cancelled',stock:0});

 eq('стикер стока: тип Stock offcut в конструкторе, номер, штрихкод, стекло с толщиной, размер; печать по кнопке',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,30,2]]);const b=DB.glassBatch[0];
  const g=cutPlanRun(b.number).plan.groups[0];window.cutPrinted=0;
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  document.querySelector('[data-cut-stock-take]').click();const id='S-0000001',printed=window.cutPrinted;
  const pg=stkLayout(stkTemplate('stock','4x6'),'4x6',stkStockData(stockOffcutFind(id))),texts=pg.items.filter(i=>i.t==='text').map(i=>i.s);
  const row=!!document.querySelector('[data-cut-stock-row="S-0000001"]');document.querySelector('[data-cut-stock-print]').click();
  stkPrintCleanup();
  tab='masterdata';mdSetTab('stickers');const types=[...document.querySelectorAll('.stk-ctl button')].map(x=>x.textContent);
  return {printed,again:window.cutPrinted,row,stockNo:texts.includes('STOCK  S-0000001'),bar:pg.items.some(i=>i.t==='rect')&&texts.includes(id),
   glass:texts.some(x=>/Clear/.test(x)),size:texts.some(x=>/×/.test(x)),overflow:pg.overflow,type:types.includes('Stock offcut'),
   fits:['4x6','3x4'].flatMap(z=>['portrait','landscape'].map(or=>stkLayout(stkBase('stock',z,or),z,stkStockData(stockOffcutFind(id))).overflow.length)).join()};
 }),{printed:1,again:2,row:true,stockNo:true,bar:true,glass:true,size:true,overflow:[],type:true,fits:'0,0,0,0'});

 eq('остатки мышью: правая кнопка по остатку — To stock и Split с размером; по стоку — печать и возврат в отход',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,30,2]]);const b=DB.glassBatch[0];
  cutPlanRun(b.number);glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();window.cutPrinted=0;
  const ctx=el=>{const r=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));return [...document.querySelectorAll('#cutMenu [data-cut-menu]')].map(x=>x.dataset.cutMenu);};
  const hintMenu=ctx(document.querySelector('.cut-paper [data-cut-offcut="0"] rect'));
  document.getElementById('cutSplitL').value='50';document.querySelector('#cutMenu [data-cut-menu="split-length"]').click();
  const s=cutPlanFor(b.number).groups[0].sheets[0],split=s.stock.map(x=>x.id+' '+x.w+'×'+x.h),printed=window.cutPrinted,menuGone=!document.getElementById('cutMenu');
  const stockMenu=ctx(document.querySelector('.cut-paper [data-cut-stock="S-0000001"] rect'));
  document.querySelector('#cutMenu [data-cut-menu="stock-cancel"]').click();
  return {hintMenu,split,printed,menuGone,stockMenu,back:cutPlanFor(b.number).groups[0].sheets[0].stock.length,russian:/[А-яЁё]/.test(document.querySelector('.oq-card').innerText)};
 }),{hintMenu:['stock','split-length','split-width','sheet-lock'],split:['S-0000001 50×64.25'],printed:1,menuGone:true,stockMenu:['stock-print','stock-cancel','sheet-lock'],back:0,russian:false});

 eq('остатки в JSON: не массив и повтор номера — отказ; мусор чистится, счётчик не отстаёт',await t.p.evaluate(()=>{
  const fail=v=>{try{validateStockOffcutPayload({stockOffcut:v});return 'accepted';}catch(e){return e.message;}};
  const shape=fail({}),bad=fail([{id:'X-1'}]),dup=fail([{id:'S-0000004'},{id:'S-0000004'}]);
  DB.stockOffcut=[{id:'S-0000009',glass:'6CLEAR',w:40,h:40},{id:'bad',w:1,h:1},{id:'S-0000003',w:0,h:5},null];DB.stockOffcutSeq=2;normalizeStockOffcuts();
  const ids=DB.stockOffcut.map(r=>r.id),next=stockIdNext();oqReset();
  return {shape,bad,dup,ids,next};
 }),{shape:'Stock offcuts must be an array.',bad:'Invalid stock offcut.',dup:'Duplicate stock offcut S-0000004.',ids:['S-0000009'],next:'S-0000010'});

 eq('лист не режем: стёкла листа уходят в новый батч с тем же Glass ID, раскладка — с ними; заказ остаётся в Batched; начатый рез не переносится',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,5]]);const b=DB.glassBatch[0];
  const plan=cutPlanRun(b.number).plan,g=plan.groups[0],last=g.sheets[g.sheets.length-1],ids=last.pieces.map(p=>p.piece);
  const layout=JSON.stringify(last.pieces.map(p=>[p.piece,p.x,p.y,p.w,p.h])),before=g.sheets.length;
  const r=cutMoveSheet(b.number,g.glass,last.no),nb=glassBatchFind(r.number),np=cutPlanFor(r.number),o=salesRecord(b.parts[0].orderId);
  const oldActive=glassBatchActiveItems(b).map(i=>i.piece),newActive=glassBatchActiveItems(nb).map(i=>i.piece);
  const out={ok:!!r.ok,number:r.number,same:newActive.join()===ids.join(),oldClean:!oldActive.some(id=>ids.includes(id)),
   sheets:(cutPlanFor(b.number).groups[0]||{sheets:[]}).sheets.length===before-1,stale:cutPlanStale(b.number),newStale:cutPlanStale(r.number),
   layout:JSON.stringify(np.groups[0].sheets[0].pieces.map(p=>[p.piece,p.x,p.y,p.w,p.h]))===layout,unlocked:!np.groups[0].sheets[0].locked,
   status:o.status,batchNo:o.batchNo,moved:b.items.filter(i=>ids.includes(i.piece)).every(i=>i.releasedAt&&i.movedTo===r.number),
   history:[b.history[b.history.length-1].action,nb.history[0].action],
   valid:(()=>{try{validateImportedState(JSON.parse(JSON.stringify(DB)));return true;}catch(e){return e.message;}})()};
  glassBatchOpen(b.number);out.contents=/Moved to B-0002/.test(document.querySelector('.oq-card').innerText);
  /* Начатый рез: такой лист не переносится. */
  const first=cutPlanFor(b.number).groups[0].sheets[0],it=b.items.find(i=>i.piece===first.pieces[0].piece);it.cutStartedAt=new Date().toISOString();
  out.started=cutMoveSheet(b.number,'6CLEAR',first.no).error;it.cutStartedAt='';
  return out;
 }),{ok:true,number:'B-0002',same:true,oldClean:true,sheets:true,stale:false,newStale:false,layout:true,unlocked:true,status:'batched',batchNo:'B-0002',moved:true,
  history:['Moved to B-0002','Created from B-0001'],valid:true,contents:true,started:'Cutting has started on this glass.'});

 eq('перенос листа со стоком: сток уходит с листом, лист в новом батче заблокирован; кнопка и ссылка на новый батч',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,3]]);const b=DB.glassBatch[0];
  const g=cutPlanRun(b.number).plan.groups[0],last=g.sheets[g.sheets.length-1];const hint=cutStockTake(b.number,g.glass,last.no,0).id;
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:last.no,sel:'',drag:''};render();
  cutUi.sheet=last.no;render();document.querySelector('[data-cut-move-sheet]').click();
  const info=(document.querySelector('[data-cut-info]')||{}).textContent||'',rec=stockOffcutFind(hint);
  document.querySelector('[data-cut-open-batch]').click();
  const np=cutPlanFor('B-0002'),sh=np.groups[0].sheets[0];
  return {info:/→ B-0002/.test(info),rec:[rec.batch,rec.sheet,rec.status].join(),sheetStock:sh.stock.map(x=>x.id),locked:sh.locked,opened:glassBatchOpenNumber,tab:glassBatchDetailTab,paper:!!document.querySelector('.cut-paper')};
 }),{info:true,rec:'B-0002,1,stock',sheetStock:['S-0000001'],locked:true,opened:'B-0002',tab:'optimization',paper:true});

 /* Мышь — настоящими событиями Playwright, как рукой. */
 {
  /* Большое окно и одна прокрутка к листу: дальше меряем без прокрутки, иначе
     координаты, снятые раньше, уезжают. */
  const P=t.p,view=P.viewportSize();await P.setViewportSize({width:1600,height:1200});
  const at=sel=>P.evaluate(q=>{const el=document.querySelector(q);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,l:r.x,t:r.y,w:r.width,h:r.height};},sel);
  const toSheet=()=>P.evaluate(()=>{const el=document.querySelector('.cut-grid');if(el)el.scrollIntoView({block:'start'});});
  const setup=()=>P.evaluate(()=>{
   oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[30,40,3]]);const b=DB.glassBatch[0];
   cutPlanRun(b.number);glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};cutNotice='';render();
   const ps=cutPlanFor(b.number).groups[0].sheets[0].pieces.slice().sort((a,c)=>a.x-c.x).map(p=>p.piece);return {n:b.number,ps};
  });
  const piece=(n,id)=>P.evaluate(([n,id])=>{const a=cutFind(cutPlanFor(n),id);return a?{x:a.piece.x,y:a.piece.y,w:a.piece.w,h:a.piece.h,locked:a.piece.locked}:null;},[n,id]);
  let r=await setup();await toSheet();const n=r.n,[a,b2,c]=r.ps;
  /* Клик по подписи выбирает стекло. */
  const txt=await at(`[data-cut-piece="${a}"] text`);await P.mouse.click(txt.x,txt.y);
  const byLabel=await P.evaluate(()=>cutUi.sel);
  /* Двойной клик — поворот. */
  const before=await piece(n,c),pc=await at(`[data-cut-piece="${c}"] rect`);await P.mouse.click(pc.x,pc.y);await P.mouse.click(pc.x,pc.y);
  const turned=await piece(n,c);
  /* Тянем стекло вверх на пустое место: легло там, где бросили, и подъехало к краю. */
  const g=await at(`[data-cut-piece="${c}"] rect`),paper=await at('.cut-paper svg');
  await P.mouse.move(g.x,g.y);await P.mouse.down();await P.mouse.move(g.x+10,g.y-20,{steps:3});await P.mouse.move(g.x+20,paper.t+paper.h*0.25,{steps:5});
  const ghost=await P.evaluate(()=>{const x=document.querySelector('[data-cut-ghost]');return x?x.getAttribute('data-ok'):null;});
  await P.mouse.up();const moved=await piece(n,c);
  const u=await P.evaluate(n=>{const g=cutPlanFor(n).groups[0],s=g.sheets[0];return cutUsable(s.size,cutGroupParams(g,s.size));},n);
  /* Клавиши: R — поворот, Delete — снять. */
  const pa=await at(`[data-cut-piece="${a}"] rect`);await P.mouse.click(pa.x,pa.y);const ka=await piece(n,a);
  await P.keyboard.press('r');const kr=await piece(n,a);await P.keyboard.press('Delete');const kd=await piece(n,a);
  /* Правая кнопка: меню, «Lock glass». */
  const pb=await at(`[data-cut-piece="${b2}"] rect`);await P.mouse.click(pb.x,pb.y,{button:'right'});
  const menu=await P.evaluate(()=>[...document.querySelectorAll('#cutMenu [data-cut-menu]')].map(x=>x.dataset.cutMenu));
  await P.click('#cutMenu [data-cut-menu="lock"]');const locked=(await piece(n,b2)).locked,menuGone=await P.evaluate(()=>!document.getElementById('cutMenu'));
  /* Наведение подсвечивает строку списка. */
  const ph=await at(`[data-cut-piece="${b2}"] rect`);await P.mouse.move(ph.x,ph.y);
  const hover=await P.evaluate(id=>document.querySelector(`[data-cut-list="${id}"]`).classList.contains('cut-hl'),b2);
  /* Из списка на лист: тень и укладка там, где бросили. */
  const fromList=await P.evaluate(([n,id])=>{
   cutUiDragStart({dataTransfer:{setData(){},effectAllowed:''}},id);
   const paper=document.querySelector('.cut-paper'),svg=paper.querySelector('svg'),r=svg.getBoundingClientRect();
   const ev={preventDefault(){},currentTarget:paper,clientX:r.x+r.width*0.8,clientY:r.y+r.height*0.3};
   cutUiDragOver(ev,'6CLEAR',1);const ghost=!!svg.querySelector('[data-cut-ghost]');cutUiDrop(ev,'6CLEAR',1);
   const at=cutFind(cutPlanFor(n),id);return {ghost,on:!!at};
  },[n,a]);
  /* Стекло тащим в список — оно снято. */
  const pl=await at(`[data-cut-piece="${c}"] rect`),side=await at('.cut-side tbody tr');
  await P.mouse.move(pl.x,pl.y);await P.mouse.down();await P.mouse.move(pl.x-30,pl.y,{steps:3});await P.mouse.move(side.x,side.y,{steps:6});await P.mouse.up();
  const offList=!(await piece(n,c));
  /* Клик по пустому месту снимает выбор. */
  const empty=await at('.cut-paper svg');await P.mouse.click(empty.l+empty.w-6,empty.t+8);const unsel=await P.evaluate(()=>cutUi.sel);
  eq('мышь: клик по подписи, двойной клик, перетаскивание с тенью, правая кнопка, клавиши, подсветка, бросок из списка и в список',
   {byLabel:byLabel===a,turned:turned.w===before.h&&turned.h===before.w,ghost,moved:moved.y>=40&&moved.x===u.x0,menu,locked,menuGone,
    keyTurn:kr.w===ka.h&&kr.h===ka.w,keyTake:kd===null,hover,fromList,offList,unsel:unsel===''},
   {byLabel:true,turned:true,ghost:'1',moved:true,menu:['rotate','take','lock','sheet-lock'],locked:true,menuGone:true,
    keyTurn:true,keyTake:true,hover:true,fromList:{ghost:true,on:true},offList:true,unsel:true});
  /* Бросок на вкладку другого листа — перенос на тот лист. */
  const tabs=await P.evaluate(()=>{
   oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,5]]);const b=DB.glassBatch[0];
   cutPlanRun(b.number);glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};cutNotice='';render();
   const g=cutPlanFor(b.number).groups[0];return {n:b.number,id:g.sheets[0].pieces[0].piece,count:g.sheets.length};
  });
  await toSheet();
  const tp=await at(`[data-cut-piece="${tabs.id}"] rect`),tab=await at('[data-cut-tab="2"]');
  await P.mouse.move(tp.x,tp.y);await P.mouse.down();await P.mouse.move(tp.x+20,tp.y,{steps:3});await P.mouse.move(tab.x,tab.y,{steps:6});await P.mouse.up();
  const onTab=await P.evaluate(([n,id])=>{const a=cutFind(cutPlanFor(n),id);return a?a.sheet.no:0;},[tabs.n,tabs.id]);
  eq('мышь: стекло, брошенное на вкладку листа, переезжает на тот лист',{sheets:tabs.count>=2,onTab},{sheets:true,onTab:2});
  await P.setViewportSize(view||{width:1280,height:720});
 }

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
