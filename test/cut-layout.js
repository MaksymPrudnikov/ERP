/* Раскрой батча: отступы от четырёх краёв листа (Trim X снизу, Trim Y слева,
   Border X сверху, Border Y справа), Safety border внутри заготовки Shape, без
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
  /* Стёкла листа 1 — в один ряд, как есть: тесты правок руками и мыши проверяют
     правки, а не выбор укладчика (маленький батч может лечь и столбиком). */
  window.ctRow=n=>{const plan=cutPlanFor(n),g=plan.groups[0],s=g.sheets[0],u=cutUsable(s.size,cutGroupParams(g,s.size));let x=u.x0;
   s.pieces.forEach(p=>{if(p.rot){const w=p.w;p.w=p.h;p.h=w;}p.turn=0;p.rot=false;p.x=x;p.y=u.y0;x+=p.w;});cutPlanRefresh(plan);return plan;};
  /* Правка параметров, как на экране: Reset → правка → Build (параметры
     собранного раскроя закрыты). Возвращает результат Build. */
  window.ctSet=(n,...edits)=>{const p=cutPlanFor(n);if(p&&!p.reset)cutPlanReset(n);for(const e of edits){const r=e();if(r&&r.error)return r;}return cutPlanRun(n);};
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

 eq('параметры реза по толщине: обрезка кромки, Safety border формы, минимальное расстояние; правка и сброс',await t.p.evaluate(()=>{
  oqReset();const base=[3,6,10,19].map(mm=>{const p=cutParamsFor(mm);return mm+': '+frac16(p.trim)+' / '+frac16(p.border)+' / '+frac16(p.minDist);});
  tab='masterdata';mdSetTab('cutting');const row=document.querySelector('[data-cut-trim="6"]');row.value='1';row.dispatchEvent(new Event('change'));
  const saved=cutParamsFor(6).trim;document.querySelector('[data-cut-reset]').click();
  return {base,between:frac16(cutParamsFor(7).trim),saved,reset:cutParamsFor(6).trim,russian:/[А-яЁё]/.test(document.querySelector('[data-cut-md]').innerText)};
 }),{base:['3: 3/4 / 3/4 / 1/2','6: 7/8 / 7/8 / 3/4','10: 1 1/4 / 1 1/4 / 1','19: 0 / 4 / 4'],between:'7/8',saved:1,reset:0.875,russian:false});

 eq('четыре края листа: Trim X снизу, Trim Y слева, Border X сверху, Border Y справа — детали за линии не заходят',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,144);ctOrder([[46,60,3],[34,52,4]]);const b=DB.glassBatch[0];
  ctSet(b.number,()=>['trimX:1','trimY:2','borderX:3','borderY:4'].forEach(x=>{const [f,v]=x.split(':');cutSetParam(b.number,'6CLEAR',f,v);}));
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
  const plan=cutPlanRun(b.number).plan,placed=plan.stats.placed;
  /* Без правила (Min distance 0) одна и та же стратегия кладёт полоски — значит правило работает. */
  const pieces=cutPieces(b,{}),stock=cutStockFor('6CLEAR',null),pack=md=>cutPack(pieces,stock,size=>Object.assign(cutRunParams(6,size,null),{minDist:md}),CUT_STRATEGIES[0],[],6);
  const asPlan=r=>({groups:[{glass:'6CLEAR',mm:6,sheet:stock[0],pick:null,params:{},sheets:r.sheets}]});
  /* Правило про полосу: в ряду одной высоты полосок нет. Победитель может
     положить стёкла столбиками — там сквозной рез идёт между ними. */
  const clean=ctSlivers(asPlan(pack(0.75)),0.75);
  const loose=ctSlivers(asPlan(pack(0)),0.75).length>0&&clean.length===0;
  return {clean,placed,loose,overlap:ctOverlap(cutPlanFor(b.number))};
 }),{clean:[],placed:3,loose:true,overlap:[]});

 eq('столбики и ряды не оставляют между своими торцами полоску тоньше Min distance',await t.p.evaluate(()=>{
  const stock=[{key:'130x96',w:130,h:96,supplier:''}],pf=md=>()=>({trimX:1.25,trimY:1.25,borderX:0,borderY:0,minDist:md,rotate:false});
  const pc=(piece,w,h)=>({piece,w,h,shape:false,priority:0,norot:true});
  /* Колонки владельца: две высотой 80 1/4″ и одна из двух деталей высотой
     80 1/2″. Их ширины вместе ровно заполняют usable 128 3/4″. */
  const columns=[pc('A1',24.25,80.25),pc('A2',24.25,80.25),pc('B1',80.25,40.25),pc('B2',80.25,40.25)];
  /* Тот же дефект после транспонирования обязан быть закрыт и в rows. */
  const rows=[pc('C1',80.25,24.25),pc('C2',80.25,24.25),pc('D1',40.25,40.25),pc('D2',40.25,40.25)];
  const bad=(r,T,md)=>r.sheets.reduce((n,s)=>{
   const groups=new Map();s.pieces.forEach(p=>{const k=String(T?p.y:p.x);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p);});
   const levels=[...groups.values()].map(a=>Math.max(...a.map(p=>T?p.x+p.w:p.y+p.h)));
   levels.forEach((a,i)=>levels.slice(i+1).forEach(b=>{const d=Math.abs(a-b);if(d>1e-6&&d<md-1e-6)n++;}));return n;
  },0);
  const run=(list,T,md,fit)=>cutPackColumns(list,stock,pf(md),[],{rows:T,orient:'asis',fit});
  const looseCols=run(columns,false,0,'ffd'),looseRows=run(rows,true,0,'ffd');
  const safe=[];[false,true].forEach(T=>['ffd','bfd'].forEach(fit=>{const r=run(T?rows:columns,T,1,fit);safe.push({T,fit,sheets:r.sheets.length,bad:bad(r,T,1)});}));
  return {looseCols:{sheets:looseCols.sheets.length,bad:bad(looseCols,false,1)>0},looseRows:{sheets:looseRows.sheets.length,bad:bad(looseRows,true,1)>0},safe};
 }),{looseCols:{sheets:1,bad:true},looseRows:{sheets:1,bad:true},safe:[
  {T:false,fit:'ffd',sheets:2,bad:0},{T:false,fit:'bfd',sheets:2,bad:0},
  {T:true,fit:'ffd',sheets:2,bad:0},{T:true,fit:'bfd',sheets:2,bad:0}
 ]});

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
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctSheet("6CLEAR",96,144);ctOrder([[46,60,5],[28,38,4]]);const b=DB.glassBatch[0];
  const plan=cutPlanRun(b.number).plan,g=plan.groups[0],withCut=g.sheets.find(s=>(s.offcuts||[]).length),hint=Object.assign({},withCut.offcuts[0]);
  const before={net:plan.stats.net,gross:plan.stats.gross,keep:plan.stats.keep,usedPct:plan.stats.usedPct,honest:Math.abs(plan.stats.usedPct-Math.round(plan.stats.used/plan.stats.area*1000)/10)<0.05};
  /* Подсказка годится по правилу цеха: 40 × 40 либо 10 ft² — длинная полоса тоже кусок. */
  const min=[cutSettings().minOffcutW,cutSettings().minOffcutH],big=g.sheets.every(s=>(s.offcuts||[]).every(o=>cutOffcutOk(o.w,o.h,cutGroupParams(g,s.size))));
  const noHint=g.sheets.find(s=>!(s.offcuts||[]).length);
  const kept=cutStockTake(b.number,g.glass,withCut.no,0),after=cutPlanFor(b.number).stats,area=cutFt2(cutArea(hint.w,hint.h));
  const none=cutStockTake(b.number,g.glass,noHint?noHint.no:999,0).error;
  /* Взят вариант, что тратит квадратных футов не больше любой стратегии полос. */
  const params=size=>cutRunParams(g.mm,size,null),pieces=cutPieces(b,{}).filter(p=>!p.off);
  const areas=CUT_STRATEGIES.map(st=>{const r=cutPack(pieces,cutStockFor(g.glass,null),params,st,[],g.mm);return r.unplaced.length?Infinity:r.sheets.reduce((a,s)=>a+cutArea(s.size.w,s.size.h),0);});
  const chosen=g.sheets.reduce((a,s)=>a+cutArea(s.size.w,s.size.h),0);
  /* Старое умолчание 12 × 12 переводится на 40 × 40 один раз. */
  DB.cutting={minOffcutW:12,minOffcutH:12};normalizeCutting();const migrated=[DB.cutting.minOffcutW,DB.cutting.minOffcutH];
  DB.cutting.minOffcutW=12;DB.cutting.minOffcutH=12;normalizeCutting();const own=[DB.cutting.minOffcutW,DB.cutting.minOffcutH];
  return {netIsGross:before.net===before.gross,keep0:before.keep,honest:before.honest,min,big,kept:!!kept.ok,keepAfter:after.keep===area,netAfter:Math.abs(after.net-(after.gross-area))<0.02,
   usedSame:after.usedPct===before.usedPct,none,leastArea:chosen<=Math.min(...areas)+1e-6,migrated,own};
 }),{netIsGross:true,keep0:0,honest:true,min:[40,40],big:true,kept:true,keepAfter:true,netAfter:true,usedSame:true,none:'No such offcut.',leastArea:true,migrated:[40,40],own:[12,12]});

 eq('Safety border остаётся внутри Shape, а оптимизатор не добавляет снаружи ни border, ни Min distance',await t.p.evaluate(()=>{
  /* Внешние коробки уже содержат Safety border: между ними проверяется только
     настоящее пересечение, без повторного раздувания. */
  const bad=plan=>{const out=[];plan.groups.forEach(g=>g.sheets.forEach(sh=>{
   const pr=cutGroupParams(g,sh.size||g.sheet);
   sh.pieces.forEach((a,i)=>sh.pieces.slice(i+1).forEach(c=>{
    const gp=cutGapBetween(a,c,pr);
    if(a.x<c.x+c.w+gp-1e-6&&c.x<a.x+a.w+gp-1e-6&&a.y<c.y+c.h+gp-1e-6&&c.y<a.y+a.h+gp-1e-6)out.push(a.piece+'/'+c.piece);}));}));return out;};
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);const id=ctOrder([[40,50,2]]);
  const o=salesRecord(id),l=o.lines[0],s=newShapeDef('raked');s.w='40';s.h='50';Object.assign(s.params,{shortHeight:'44',rakeSide:'top',shortSide:'right'});
  s.ownerLineId=l.id;DB.shapeDef.push(s);l.shapeRef=salesShapeRefFrom(s);
  const b=DB.glassBatch[0],plan=cutPlanRun(b.number).plan,pieces=cutPieces(b,{});
  /* Столбики должны уметь класть готовые коробки Shape без наружной рамки. */
  const stock=cutStockFor(plan.groups[0].glass,plan.groups[0].pick,plan.groups[0].mm,b.number);
  const cols=cutPackColumns(pieces,stock,size=>cutRunParams(plan.groups[0].mm,size,plan.groups[0].pick),[],{rows:false,orient:'asis',fit:'ffd'});
  const colPlan={groups:[{glass:plan.groups[0].glass,mm:plan.groups[0].mm,sheet:cols&&cols.sheets[0].size,pick:plan.groups[0].pick,sheets:(cols&&cols.sheets)||[]}]};
  /* Прямоугольники стоят вплотную. */
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);ctOrder([[40,50,4]]);
  const rect=cutPlanRun(DB.glassBatch[0].number).plan;
  return {shape:pieces.every(p=>p.shape),params:frac16(plan.groups[0].params.minDist),
   bad:bad(plan),cols:!!cols,colPieces:cols?cols.sheets.reduce((a,x)=>a+x.pieces.length,0):0,
   colShape:cols?cols.sheets.every(x=>x.pieces.every(q=>q.shape)):false,colBad:bad(colPlan),
   rectGap:ctMinGap(rect),rectBad:bad(rect)};
 }),{shape:true,params:'3/4',bad:[],cols:true,colPieces:2,colShape:true,colBad:[],rectGap:0,rectBad:[]});

 eq('все укладчики стыкуют внешние коробки Shape вплотную',await t.p.evaluate(()=>{
  const raw=[{piece:'S1',w:40,h:50,shape:true,pad:1.5,priority:0,norot:true},{piece:'S2',w:40,h:50,shape:true,pad:1.5,priority:0,norot:true}];
  const stock=[{key:'84x52',w:84,h:52,supplier:''}],pf=()=>({trimX:0,trimY:0,borderX:0,borderY:0,minDist:1,rotate:false});
  const gap=pieces=>{let best=Infinity;pieces.forEach((a,i)=>pieces.slice(i+1).forEach(b=>{
   if(a.y<b.y+b.h-1e-6&&b.y<a.y+a.h-1e-6)best=Math.min(best,Math.max(a.x-b.x-b.w,b.x-a.x-a.w));
   if(a.x<b.x+b.w-1e-6&&b.x<a.x+a.w-1e-6)best=Math.min(best,Math.max(a.y-b.y-b.h,b.y-a.y-a.h));
  }));return best===Infinity?null:cutRound(best);};
  const strip=cutPack(raw,stock,pf,CUT_STRATEGIES[0],[],10);
 const fill=cutFillSheet(raw,{x0:0,y0:0,x1:80,y1:50,W:80,H:50},pf(),{s:0,r:0,p:0,c:0,t:0},new Map());
  const cols=cutPackColumns(raw,stock,pf,[],{rows:false,orient:'asis',fit:'ffd'});
  /* Даже если Min distance больше собственного border, footprint Shape не
     раздувается: это разные правила. Второй аргумент намеренно лишний. */
  const geom=cutShapeGeom({cutW:40,cutH:50,cuttingPoints:[[0,0],[40,0],[40,50],[0,50]],footprint:{width:40.25,height:50,pad:{right:.25}}},1);
  const out=r=>({placed:r.sheets?r.sheets.reduce((n,s)=>n+s.pieces.length,0):r.placed.length,gap:gap(r.sheets?r.sheets.flatMap(s=>s.pieces):r.placed)});
  return {strip:out(strip),fill:out(fill),cols:out(cols),footprint:{w:geom.w,h:geom.h,pad:geom.pad}};
 }),{strip:{placed:2,gap:0},fill:{placed:2,gap:0},cols:{placed:2,gap:0},footprint:{w:40.25,h:50,pad:.25}});

 eq('прямая сторона формы не получает safety border от соседнего скоса',await t.p.evaluate(()=>{
  const points=[[0,0],[40,0],[40,50],[25,50],[20,0]],plan={applies:true,segValues:[0,0,0,1.25,0]};
  const fp=shapeBorderFootprint(points,plan),geom=cutShapeGeom({cutW:40,cutH:50,cuttingPoints:points,footprint:fp});
  return {right:fp.pad.right,width:fp.width,box:geom.w,other:fp.pad.left};
 }),{right:0,width:40,box:40,other:0});

 eq('исключить деталь: количество 0 убирает её из реза и из листа',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);ctOrder([[46,60,3]]);const b=DB.glassBatch[0];
  const plan=cutPlanRun(b.number).plan,first=plan.groups[0].sheets[0].pieces[0].piece,before=plan.stats.placed;
  /* Собранный раскрой — список стёкол закрыт, как параметры. */
  const closed=cutSetting(b.number,first,'off',true).error;
  const again=ctSet(b.number,()=>cutSetting(b.number,first,'off',true)).plan,excluded=again.stats.excluded,placed=again.stats.placed,onSheet=ctAll(again).some(p=>p.piece===first);
  ctSet(b.number,()=>cutSetting(b.number,first,'off',false));
  return {before,closed,onSheet,excluded,placed,back:cutPlanFor(b.number).stats.placed};
 }),{before:3,closed:'Reset the optimization to change settings.',onSheet:false,excluded:1,placed:2,back:3});

 eq('правки руками: снять, положить, повернуть, закрепить; на занятое место и за лист не кладёт',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);ctOrder([[46,60,2]]);const b=DB.glassBatch[0];
  cutPlanRun(b.number);const plan=ctRow(b.number),id=plan.groups[0].sheets[0].pieces[0].piece,other=Object.assign({},plan.groups[0].sheets[0].pieces[1]);
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

 eq('Shape вручную поворачивается 0 → 90 → 180 → 270°, контур и отверстия идут вместе; старый rot читается',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);const id=ctOrder([[48.125,79,1]]);
  const o=salesRecord(id),l=o.lines[0],sh=newShapeDef('raked');sh.w='48.125';sh.h='79';
  Object.assign(sh.params,{shortHeight:'62',rakeSide:'top',shortSide:'left'});sh.ownerLineId=l.id;DB.shapeDef.push(sh);l.shapeRef=salesShapeRefFrom(sh);
  const b=DB.glassBatch[0],plan=cutPlanRun(b.number).plan,g=plan.groups[0],sheet=g.sheets[0],src=cutPieces(b,{})[0];
  const signature=()=>{
   const p=cutFind(plan,src.piece).piece,draw=Object.assign({},src,{holes:[{x:7,y:11,d:2}],cutouts:[[[10,12],[14,12],[14,15],[10,15]]]});
   const d=document.createElement('div');d.innerHTML=cutSheetSVG(g,sheet,520,[draw],{ids:true});
   const r=d.querySelector('rect.cut-blank'),poly=d.querySelector('polygon.cut-glass'),hole=d.querySelector('circle.cut-hole'),cutout=d.querySelector('polygon.cut-hole');
   const rx=+r.getAttribute('x'),ry=+r.getAttribute('y'),round=v=>Math.round(v*10)/10;
   const pts=el=>el.getAttribute('points').split(' ').map(q=>q.split(',').map(Number)).map(q=>[round(q[0]-rx),round(q[1]-ry)]);
   return {turn:cutPieceTurn(p),rot:p.rot,w:p.w,h:p.h,sig:JSON.stringify({poly:pts(poly),hole:[round(+hole.getAttribute('cx')-rx),round(+hole.getAttribute('cy')-ry)],cutout:pts(cutout)})};
  };
  const states=[signature()];for(let i=0;i<4;i++){const r=cutPieceRotate(b.number,src.piece);if(r.error)return {error:r.error};states.push(signature());}
  const turns=states.map(x=>x.turn),rots=states.map(x=>x.rot),dims=states.every((x,i)=>Math.abs(x.w-(i%2?src.h:src.w))<1e-6&&Math.abs(x.h-(i%2?src.w:src.h))<1e-6);
  const unique=new Set(states.slice(0,4).map(x=>x.sig)).size,back=states[0].sig===states[4].sig;
  let p=cutFind(plan,src.piece).piece;delete p.turn;p.rot=true;normalizeCutPlans();p=cutFind(cutPlanFor(b.number),src.piece).piece;const legacy={turn:p.turn,rot:p.rot};
  p.turn=3;p.rot=false;normalizeCutPlans();p=cutFind(cutPlanFor(b.number),src.piece).piece;const saved={turn:p.turn,rot:p.rot};
  return {turns,rots,dims,unique,back,legacy,saved};
 }),{turns:[0,1,2,3,0],rots:[false,true,false,true,false],dims:true,unique:4,back:true,legacy:{turn:1,rot:true},saved:{turn:3,rot:true}});

 eq('Shape можно сразу повернуть на 180°, даже когда для промежуточных 90° нет места; отдельная кнопка видна',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);const id=ctOrder([[50,80,2]]);
  const o=salesRecord(id),l=o.lines[0],sh=newShapeDef('raked');sh.w='50';sh.h='80';
  Object.assign(sh.params,{shortHeight:'62',rakeSide:'top',shortSide:'left'});sh.ownerLineId=l.id;DB.shapeDef.push(sh);l.shapeRef=salesShapeRefFrom(sh);
  const b=DB.glassBatch[0],plan=cutPlanRun(b.number).plan;ctRow(b.number);
  const g=plan.groups[0],pcs=g.sheets[0].pieces.slice().sort((a,c)=>a.x-c.x),p=pcs[0],before={x:p.x,y:p.y,w:p.w,h:p.h};
  const ninety=cutPieceRotate(b.number,p.piece),sameAfterNinety=cutPieceTurn(cutFind(plan,p.piece).piece)===0;
  const half=cutPieceRotate(b.number,p.piece,2),after=cutFind(plan,p.piece).piece;
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:g.glass,sheet:1,sel:'',drag:''};render();cutUiPick(p.piece);
  const button=document.querySelector('[data-cut-rotate-180]');
  return {pieces:pcs.length,ninety:ninety.error,sameAfterNinety,
   half:!!half.ok,turn:cutPieceTurn(after),sameBox:[after.x,after.y,after.w,after.h].join()===[before.x,before.y,before.w,before.h].join(),
   overlap:ctOverlap(plan),button:button&&button.textContent.trim()};
 }),{pieces:2,ninety:'No room to rotate on this sheet.',sameAfterNinety:true,half:true,turn:2,sameBox:true,overlap:[],button:'Rotate 180°'});

 eq('после поворота и снятия стёкла подъезжают к краю или к соседу; стало шире — соседи отодвигаются; нет места — отказ',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[30,40,3]]);const b=DB.glassBatch[0];
  const g0=ctSet(b.number,()=>cutSetParam(b.number,'6CLEAR','rotate',false)).plan.groups[0],u=cutUsable(g0.sheets[0].size,cutGroupParams(g0,g0.sheets[0].size));
  const pcs=()=>cutPlanFor(b.number).groups[0].sheets[0].pieces.slice().sort((a,c)=>a.x-c.x);
  const row=()=>pcs().map(p=>[cutRound(p.x-u.x0),p.w,p.h].join(':'));
  const start=row(),mid=pcs()[1].piece;
  const wide=cutPieceRotate(b.number,mid),wideTurn=cutPieceTurn(cutFind(cutPlanFor(b.number),mid).piece),afterWide=row();
  const narrow=cutPieceRotate(b.number,mid),narrowTurn=cutPieceTurn(cutFind(cutPlanFor(b.number),mid).piece),afterNarrow=row();
  cutPieceTake(b.number,pcs()[0].piece);const afterTake=row(),overlap=ctOverlap(cutPlanFor(b.number));
  /* Ряд забит: повернуть шире некуда — отказ, ряд не тронут. */
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[32,40,4]]);const c=DB.glassBatch[0];
  cutPlanRun(c.number);ctRow(c.number);
  const full=cutPlanFor(c.number).groups[0].sheets[0].pieces.slice().sort((a,d)=>a.x-d.x),before=JSON.stringify(full.map(p=>[p.x,p.w]));
  const no=cutPieceRotate(c.number,full[1].piece),same=JSON.stringify(cutPlanFor(c.number).groups[0].sheets[0].pieces.slice().sort((a,d)=>a.x-d.x).map(p=>[p.x,p.w]))===before;
  return {start,wide:!!wide.ok,wideTurn,afterWide,narrow:!!narrow.ok,narrowTurn,afterNarrow,afterTake,overlap,no:no.error,same};
 }),{start:['0:30:40','30:30:40','60:30:40'],wide:true,wideTurn:1,afterWide:['0:30:40','30:40:30','70:30:40'],narrow:true,narrowTurn:0,afterNarrow:['0:30:40','30:30:40','60:30:40'],
  afterTake:['0:30:40','30:30:40'],overlap:[],no:'No room to rotate on this sheet.',same:true});

 eq('заблокированный лист переживает пересчёт и идёт первым',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);ctOrder([[46,60,4],[30,40,4]]);const b=DB.glassBatch[0];
  cutPlanRun(b.number);const plan=cutPlanFor(b.number),g=plan.groups[0];
  const keep=g.sheets[g.sheets.length-1],ids=keep.pieces.map(p=>p.piece).join();
  /* Reset: листов раскладки нет, заблокированный остаётся; Build ставит его первым. */
  cutSheetLock(b.number,g.glass,keep.no);const draft=cutPlanReset(b.number).plan.groups[0].sheets.length;cutPlanRun(b.number);
  const after=cutPlanFor(b.number).groups[0];
  return {draft,locked:after.sheets[0].locked,same:after.sheets[0].pieces.map(p=>p.piece).join()===ids,sheets:after.sheets.length};
 }),{draft:1,locked:true,same:true,sheets:2});

 eq('приоритет тянет деталь на первый лист; раскрой детерминирован',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);ctOrder([[46,60,4],[30,40,4]]);const b=DB.glassBatch[0];
  const first=cutPlanRun(b.number).plan,a=JSON.stringify(first.groups),c=JSON.stringify(cutPlanRun(b.number).plan.groups);
  const last=cutPlanIndex(b.number),late=[...last.entries()].find(([id,at])=>at.sheet===2);
  if(late)ctSet(b.number,()=>cutSetting(b.number,late[0],'priority',1));
  return {same:a===c,moved:late?cutPlanIndex(b.number).get(late[0]).sheet:1};
 }),{same:true,moved:1});

 eq('экран: список стёкол, подписи на детали, полоса потерь, выбор и перенос, блокировка листа, печать',await t.p.evaluate(()=>{
  const b=DB.glassBatch[0];glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  const stats='',rows=document.querySelectorAll('[data-cut-list]').length;
  const cur=!!document.querySelector('[data-cut-current]'),total=document.querySelector('[data-cut-total]').textContent;
  const pageHead=document.querySelector('.page-head'),card=document.querySelector('.cut-card');
  const lifted={total:!!pageHead.querySelector('[data-cut-total]'),current:!!pageHead.querySelector('[data-cut-current]'),
   controls:['full','print','sheet-delete','sheet-add','sheet-lock'].every(x=>!!pageHead.querySelector('[data-cut-'+x+']')),
   icons:['full','print','sheet-lock'].every(x=>!!pageHead.querySelector('[data-cut-'+x+'] svg')),
   once:document.querySelectorAll('[data-cut-total]').length===1&&document.querySelectorAll('[data-cut-current]').length===1,
   clean:!card.querySelector(':scope > .cut-toolbar')&&!card.querySelector('.cut-sheet-head'),fits:document.body.scrollWidth<=innerWidth};
  const svg=document.querySelector('.cut-paper').textContent,tabs=document.querySelectorAll('[data-cut-tab]').length;
  /* Лист лёжа, ноль слева внизу, обрезка кромки — сплошной вектор (для станка), без пунктира. */
  const tl=document.querySelector('.cut-paper [data-cut-edge]'),vb=document.querySelector('.cut-paper svg').getAttribute('viewBox').split(' ').map(Number);
  const sheetView={landscape:vb[2]>vb[3],trim:!!tl&&!tl.hasAttribute('stroke-dasharray'),dashed:document.querySelectorAll('.cut-paper [stroke-dasharray]').length,zero:[...document.querySelectorAll('.cut-paper text')].some(x=>x.textContent==='0')&&/^X \d/.test([...document.querySelectorAll('.cut-paper text')].map(x=>x.textContent).find(x=>/^X /.test(x))||'')};
  const edgeHeads=[...document.querySelectorAll('.cut-edge-head')],paramHeads=edgeHeads.length===5&&edgeHeads.every(x=>getComputedStyle(x).textAlign==='center'&&x.children.length===2);
  const id=document.querySelector('[data-cut-list]').dataset.cutList;cutUiPick(id);
  const actions=!!document.querySelector('[data-cut-actions]'),highlighted=!!document.querySelector('[data-cut-list="'+id+'"].on')&&!!document.querySelector('[data-cut-piece="'+id+'"].sel');
  document.querySelector('[data-cut-take]').click();
  const waiting=/Not on a sheet · 1/.test(document.querySelector('[data-cut-waiting]').textContent);
  cutUiPick(id);cutUiRun(()=>cutPieceAuto(cutUi.batch,id,1));const backOn=!!cutFind(cutPlanFor(b.number),id);
  document.querySelector('[data-cut-sheet-lock]').click();const locked=document.querySelector('[data-cut-sheet-lock]').getAttribute('aria-label')==='Unlock sheet';
  document.querySelector('[data-cut-sheet-lock]').click();
  document.querySelector('[data-cut-print]').click();const pages=document.querySelectorAll('#cutPrintHost .cut-print-page').length;cutPrintCleanup();
  return {stats:['Used','Scrap','Net','Net %','Sheets','Pieces','To stock'].every(x=>[...document.querySelectorAll('[data-cut-total] small')].some(e=>e.textContent===x)),rows,cur,total:/^[\d.]+%/.test(document.querySelector('[data-cut-total] [data-cut-used-pct] b').textContent),lifted,labels:/Northside/.test(svg)&&/76002/.test(svg),
   sheetView,paramHeads,tabs,actions,waiting,backOn,locked,pages,orders:!!document.querySelector('[data-cut-orders]'),russian:/[А-яЁё]/.test(document.querySelector('.oq-card').innerText)};
 }),{stats:true,rows:8,cur:true,total:true,lifted:{total:true,current:true,controls:true,icons:true,once:true,clean:true,fits:true},labels:true,sheetView:{landscape:true,trim:true,dashed:0,zero:true},paramHeads:true,tabs:2,actions:true,waiting:true,backOn:true,locked:true,pages:2,orders:true,russian:false});

 eq('общая строка динамически считает листы 1–текущий, отдельные цифры листа остаются',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',96,130);ctOrder([[46,60,13]]);const b=DB.glassBatch[0],plan=cutPlanRun(b.number).plan,g=plan.groups[0];
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};
  const expected=no=>cutTotals([Object.assign({},g,{sheets:g.sheets.filter(x=>x.no<=no)})]);
  const read=no=>{cutUi.sheet=no;render();const row=document.querySelector('[data-cut-total]'),cur=document.querySelector('[data-cut-current]'),e=expected(no),cap=row.querySelector('.cut-tiles-cap').textContent;
   const vals=Object.fromEntries([...row.querySelectorAll('.cut-tile')].map(x=>[x.querySelector('small').textContent,x.querySelector('b').textContent]));
   return {cap,current:!!cur,vals,expected:{cap:'Sheets 1–'+no,used:cutNum(e.usedPct,1)+'%',scrap:cutNum(e.gross,1)+' ft²',net:cutNum(e.net,1)+' ft²',netPct:cutNum(e.netPct,1)+'%'}};};
  const first=read(1),second=read(2),last=read(g.sheets.length),all=cutTotals([g]);
  const ok=x=>x.current&&x.cap===x.expected.cap&&x.vals['Used %']===x.expected.used&&x.vals.Scrap===x.expected.scrap&&x.vals.Net===x.expected.net&&x.vals['Net %']===x.expected.netPct;
  return {sheets:g.sheets.length,first:ok(first),second:ok(second),last:ok(last),lastAll:last.vals['Used %']===cutNum(all.usedPct,1)+'%'&&last.vals['Net %']===cutNum(all.netPct,1)+'%',extra:!document.querySelector('[data-cut-progressive]')};
 }),{sheets:4,first:true,second:true,last:true,lastAll:true,extra:true});

 eq('склад прогона: несколько размеров листа со своим количеством — 10 листов 130 и 40 листов 144',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctSheet('6CLEAR',96,144);ctOrder([[28,38,30]]);const b=DB.glassBatch[0];
  const base=cutPlanRun(b.number).plan,sizes=cutSheetOptions('6CLEAR').map(x=>frac16(x.w)+'×'+frac16(x.h));
  const firstSize=cutSheetKey(base.groups[0].sheets[0].size);
  /* Сначала 144, и только один такой лист: остальное уходит на 130. */
  /* Один лист 144 — остальное уходит на 130. */
  const mixed=ctSet(b.number,()=>cutSetStock(b.number,'6CLEAR','144x96','limit',1)).plan,used=mixed.groups[0].sheets.map(s=>cutSheetKey(s.size));
  const off=ctSet(b.number,()=>cutSetStock(b.number,'6CLEAR','144x96','off',true)).plan,only=[...new Set(off.groups[0].sheets.map(s=>cutSheetKey(s.size)))];
  const back=ctSet(b.number,()=>cutResetParams(b.number,'6CLEAR')).plan;
  const runs=used.filter((k,i)=>i===0||k!==used[i-1]);
  return {sizes,known:['144x96','130x96'].includes(firstSize),one144:used.filter(k=>k==='144x96').length<=1,placed:mixed.stats.placed===mixed.stats.total,
   grouped:runs.length<=2,smallFirst:runs.length<2||runs[0]==='130x96',only,back:cutPlanFor(b.number).stats.area===base.stats.area};
 }),{sizes:['144×96','130×96'],known:true,one144:true,placed:true,grouped:true,smallFirst:true,only:['130x96'],back:true});

 eq('параметры реза правятся прямо на экране, Master Data остаётся значением по умолчанию',await t.p.evaluate(()=>{
  const b=DB.glassBatch[0],g0=cutPlanFor(b.number).groups[0],was=g0.params.trimX;
  const changed=ctSet(b.number,()=>cutSetParam(b.number,'6CLEAR','trimX','2')).plan.groups[0];
  const piece=changed.sheets[0].pieces[0];
  const bad=ctSet(b.number,()=>cutSetParam(b.number,'6CLEAR','minDist','abc'));
  const rot=ctSet(b.number,()=>cutSetParam(b.number,'6CLEAR','rotate',false)).plan.groups[0].params.rotate;
  const md=cutParamsFor(6).trim;
  const back=ctSet(b.number,()=>cutResetParams(b.number,'6CLEAR')).plan.groups[0].params;
  return {was,trimX:changed.params.trimX,y:piece.y,bad:bad.error,rot,md,backTrim:back.trimX,backRot:back.rotate};
 }),{was:0.875,trimX:2,y:2,bad:'Enter a size like 3/4 or 1 1/2.',rot:false,md:0.875,backTrim:0.875,backRot:true});

 eq('обрезка кромки своя у каждого размера листа: 130 и 144 режутся по-разному',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctSheet('6CLEAR',96,144);ctOrder([[46,60,2]]);const b=DB.glassBatch[0];
  const base=cutPlanRun(b.number).plan.groups[0],start=base.sheets[0].pieces[0].x;
  cutSheetTrimSet('130x96','trimX','2');cutSheetTrimSet('130x96','trimY','1 1/2');
  const own=ctSet(b.number,()=>cutSetStock(b.number,'6CLEAR','144x96','off',true)).plan.groups[0];
  const other=cutSheetTrim('144x96');
  tab='masterdata';mdSetTab('cutting');const shown=document.querySelector('[data-cut-trimx="130x96"]').value,rows=document.querySelectorAll('[data-cut-sheet-row]').length;
  return {start,trimX:own.params.trimX,trimY:own.params.trimY,x:own.sheets[0].pieces[0].x,y:own.sheets[0].pieces[0].y,other,shown,rows};
 }),{start:0.875,trimX:2,trimY:1.5,x:1.5,y:2,other:null,shown:'2',rows:2});

 eq('в прогоне у каждого размера свои Trim и Border: 144 и 130 правятся отдельно',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctSheet('6CLEAR',96,144);ctOrder([[28,38,30]]);const b=DB.glassBatch[0];
  /* Один лист 144 и два 130 — в раскрой идут оба размера. */
  cutSetStock(b.number,'6CLEAR','144x96','limit',1);cutSetStock(b.number,'6CLEAR','130x96','limit',2);
  cutSetStock(b.number,'6CLEAR','144x96','trimX','2');cutSetStock(b.number,'6CLEAR','130x96','trimY','1 1/2');
  const bad=cutSetStock(b.number,'6CLEAR','130x96','borderY','abc').error;cutPlanRun(b.number);
  const plan=cutPlanFor(b.number),g=plan.groups[0],by=k=>ctAll(plan).filter(p=>cutSheetKey(g.sheets.find(s=>s.no===p.sheet).size)===k);
  const a=by('144x96'),c=by('130x96');
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  const shown=[...document.querySelectorAll('[data-cut-stock]')].map(r=>r.dataset.cutStock+' '+r.querySelector('[data-cut-edge-trimx]').value+' '+r.querySelector('[data-cut-edge-trimy]').value);
  cutPlanReset(b.number);cutSetStock(b.number,'6CLEAR','144x96','trimX','');const back=cutGroupParams(cutPlanFor(b.number).groups[0],{key:'144x96',w:144,h:96}).trimX;
  return {y144:Math.min(...a.map(p=>p.y)),x144:Math.min(...a.map(p=>p.x)),y130:Math.min(...c.map(p=>p.y)),x130:Math.min(...c.map(p=>p.x)),
   outside:ctOutside(plan),bad,shown,back,md:cutSheetTrim('144x96')};
 }),{y144:2,x144:0.875,y130:0.875,x130:1.5,outside:[],bad:'Enter a size like 3/4 or 1 1/2.',shown:['144x96 2 7/8','130x96 7/8 1 1/2'],back:0.875,md:null});

 eq('нет размера листа: экран говорит, для какого стекла, размер добавляется прямо здесь и сразу раскладывает',await t.p.evaluate(async()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctOrder([[46,60,2]]);const b=DB.glassBatch[0];
  const none=cutPlanRun(b.number).error;
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};
  document.querySelector('[data-tab-optimization]').click();document.querySelector('[data-cut-run]').click();await cutBuildDone();
  const need=document.querySelector('[data-cut-need]'),needText=need?need.textContent.replace(/\s+/g,' ').trim():'';
  const shownError=!!document.querySelector('[data-cut-error]');
  document.getElementById('cutNeedW').value='3300';document.getElementById('cutNeedH').value='96';document.querySelector('[data-cut-need-add]').click();
  const inches=document.querySelector('[data-cut-error]').textContent;
  document.getElementById('cutNeedW').value='96';document.getElementById('cutNeedH').value='130';document.querySelector('[data-cut-need-add]').click();await cutBuildDone();
  const plan=cutPlanFor(b.number);
  return {none,shownError,needText:/No sheet size · 6CLEAR/.test(needText),inches,
   laid:plan?plan.stats.placed:0,size:plan?cutSheetKey(plan.groups[0].sheets[0].size):'',gone:!document.querySelector('[data-cut-need]'),
   error:!!document.querySelector('[data-cut-error]'),shop:cutShopSizes().map(x=>x.key),stockRow:!!document.querySelector('[data-cut-stock="130x96"]'),
   russian:/[А-яЁё]/.test(document.querySelector('.oq-card').innerText)};
 }),{none:'No sheet size for 6CLEAR. Add one below.',shownError:false,needText:true,inches:'Sheet size is in inches, for example 130 × 96.',
  laid:2,size:'130x96',gone:true,error:false,shop:['130x96'],stockRow:true,russian:false});

 eq('размер с экрана прогона и из Master Data: добавить, повтор и ошибка, убрать; сброс таблицы цеха размеры не трогает',await t.p.evaluate(()=>{
  const b=DB.glassBatch[0];cutPlanReset(b.number);render();
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
  const options=cutSheetOptions('6CLEAR').map(x=>cutSheetKey(x)+(x.shop?' shop':'')),used=cutPlanRun(b.number).plan.groups[0].sheets.map(x=>cutSheetKey(x.size));
  const md=cutSheetSizes().map(x=>x.key+' '+(x.shop?'shop':'')+' '+x.codes.join());
  return {options,known:used.every(k=>['130x96','144x96'].includes(k)),md};
 }),{options:['130x96','144x96 shop'],known:true,md:['144x96 shop ','130x96 shop 6CLEAR']});

 eq('размеры цеха в JSON: не массив — отказ, мусор и повторы чистятся',await t.p.evaluate(()=>{
  let shape='accepted';try{validateCuttingPayload({cutting:{sizes:{}}});}catch(e){shape=e.message;}
  DB.cutting={sizes:[{w:96,h:130},{w:'130',h:'96'},{w:0,h:5},{w:'abc',h:1},{w:3300,h:96},null]};normalizeCutting();
  const sizes=DB.cutting.sizes;oqReset();
  return {shape,sizes};
 }),{shape:'Cutting sheet sizes must be an array.',sizes:[{key:'130x96',w:130,h:96}]});

 eq('большой батч: десятки листов, всё разложено, ничего не налезает, есть переходы на соседний, первый и последний лист',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,120],[28,38,60]]);const b=DB.glassBatch[0];
  const t0=Date.now(),plan=cutPlanRun(b.number).plan,ms=Date.now()-t0;
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  const nav=!!document.querySelector('[data-cut-strip]');
  document.querySelector('[data-cut-next]').click();const second=cutUi.sheet;
  document.querySelector('[data-cut-last]').click();const last=cutUi.sheet,lastDisabled=document.querySelector('[data-cut-last]').disabled;
  document.querySelector('[data-cut-first]').click();const first=cutUi.sheet,firstDisabled=document.querySelector('[data-cut-first]').disabled;
  return {sheets:plan.stats.sheets>=10&&plan.stats.sheets<=60,placed:plan.stats.placed,total:plan.stats.total,
   overlap:ctOverlap(plan).length,outside:ctOutside(plan).length,fast:ms<20000,nav,second,last:last===plan.stats.sheets,lastDisabled,first,firstDisabled,
   compressed:document.querySelectorAll('[data-cut-range]').length>0&&document.querySelectorAll('[data-cut-tab]').length<plan.stats.sheets};
 }),{sheets:true,placed:180,total:180,overlap:0,outside:0,fast:true,nav:true,second:2,last:true,lastDisabled:true,first:1,firstDisabled:true,compressed:true});

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
  const errors=[err('length','abc'),err('diagonal','40'),err('length',String(o.w+1)),err('width','2')];
  const cut=cutStockSplit(b.number,g.glass,1,0,'length','50'),s=cutPlanFor(b.number).groups[0].sheets[0],x=Object.assign({},s.stock[0]);
  const piece1=[x.x===o.x,x.y===o.y,x.w,x.h===o.h];
  /* Хвост после реза целиком внутри подсказки (она может быть и больше — до низа листа). */
  const rest=s.offcuts.some(r=>Math.abs(r.x-(o.x+50))<1e-6&&Math.abs(r.w-(o.w-50))<1e-6&&r.y<=o.y+1e-6&&r.y+r.h>=o.y+o.h-1e-6);
  const lockedNow=cutPiecePlace(b.number,s.pieces[0].piece,1,x.x,x.y).error;cutSheetLock(b.number,g.glass,1);
  const onStock=cutPiecePlace(b.number,s.pieces[0].piece,1,x.x,x.y).error;
  const back=cutStockCancel(b.number,cut.id),rec=stockOffcutFind(cut.id);
  const wide=cutStockSplit(b.number,g.glass,1,0,'width','40'),y=cutPlanFor(b.number).groups[0].sheets[0].stock[0];
  return {errors,id:cut.id,piece1,rest,lockedNow,onStock,back:!!back.ok,status:rec.status,next:wide.id,piece2:[y.w===o.w,y.h]};
 }),{errors:['Enter the size, for example 40.','Cut along length or width.','Longer than this offcut.','Smaller than the minimum offcut 40 × 40″ or 10 ft².'],
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
 }),{printed:0,again:1,row:true,stockNo:true,bar:true,glass:true,size:true,overflow:[],type:true,fits:'0,0,0,0'});

 eq('стикер стока печатается вместе с листом: при печати «By sheet» он идёт сразу за стёклами своего листа',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,5]]);const b=DB.glassBatch[0];
  const g=cutPlanRun(b.number).plan.groups[0];const withHint=g.sheets.find(x=>(x.offcuts||[]).length);const id=cutStockTake(b.number,g.glass,withHint.no,0).id;
  const jobs=stkBatchJobs(b,null,'sheet'),i=jobs.findIndex(j=>j.type==='stock');
  const pages=stkPages(jobs,'4x6',null),stockPage=pages[i].items.some(x=>x.t==='text'&&x.s==='STOCK  S-0000001');
  const inOrder=jobs.slice(0,i).every(j=>j.sort[1]<=withHint.no)&&jobs.slice(i+1).every(j=>j.sort[1]>withHint.no);
  return {id,one:jobs.filter(j=>j.type==='stock').length,stockPage,inOrder,picked:stkBatchJobs(b,[jobs[0].c?glassPieceAt(glassPieceMap(jobs[0].o.id).get(jobs[0].c.key),jobs[0].unit):''],'sheet').filter(j=>j.type==='stock').length};
 }),{id:'S-0000001',one:1,stockPage:true,inOrder:true,picked:0});

 eq('остатки мышью: правая кнопка по остатку — To stock и Split с размером; по стоку — печать и возврат в отход',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,30,2]]);const b=DB.glassBatch[0];
  cutPlanRun(b.number);glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();window.cutPrinted=0;
  const ctx=el=>{const r=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));return [...document.querySelectorAll('#cutMenu [data-cut-menu]')].map(x=>x.dataset.cutMenu);};
  const oh=cutPlanFor(b.number).groups[0].sheets[0].offcuts[0].h,hintMenu=ctx(document.querySelector('.cut-paper [data-cut-offcut="0"] rect'));
  document.getElementById('cutSplitL').value='50';document.querySelector('#cutMenu [data-cut-menu="split-length"]').click();
  const s=cutPlanFor(b.number).groups[0].sheets[0],split=s.stock.map(x=>x.id+' '+x.w+'×'+x.h),printed=window.cutPrinted,menuGone=!document.getElementById('cutMenu');
  const stockMenu=ctx(document.querySelector('.cut-paper [data-cut-stock="S-0000001"] rect'));
  document.querySelector('#cutMenu [data-cut-menu="stock-cancel"]').click();
  return {hintMenu,split:split.map(x=>x.replace('×'+oh,'×H')),printed,menuGone,stockMenu,back:cutPlanFor(b.number).groups[0].sheets[0].stock.length,russian:/[А-яЁё]/.test(document.querySelector('.oq-card').innerText)};
 }),{hintMenu:['stock','split-length','split-width','sheet-lock'],split:['S-0000001 50×H'],printed:0,menuGone:true,stockMenu:['stock-print','stock-cancel','sheet-lock'],back:0,russian:false});

 eq('полезный остаток: 40 × 40 либо 10 ft² — длинная полоса идёт в подсказки; обе величины правятся на экране и в Master Data',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);ctOrder([[34,36,8]]);const b=DB.glassBatch[0];
  const def=[cutSettings().minOffcutW,cutSettings().minOffcutH,cutSettings().minOffcutFt2];
  const pr=size=>cutRunParams(6,size,null);
  const rule=[cutOffcutOk(33,101,pr(null)),cutOffcutOk(40,40,pr(null)),cutOffcutOk(33,30,pr(null)),cutOffcutOk(10,144,pr(null))];
  /* Полоса 33 × 101 — 23 ft², её видно в подсказках листа. */
  const plan=cutPlanRun(b.number).plan,g=plan.groups[0];
  const strip=g.sheets.some(s=>(s.offcuts||[]).some(o=>Math.min(o.w,o.h)<40&&cutArea(o.w,o.h)>=10));
  /* Правится на экране прогона и в Master Data. */
  const run=ctSet(b.number,()=>cutSetParam(b.number,'6CLEAR','minOffcutFt2','0')).plan.groups[0];
  const noStrip=!run.sheets.some(s=>(s.offcuts||[]).some(o=>Math.min(o.w,o.h)<40));
  tab='masterdata';mdSetTab('cutting');const box=document.querySelector('[data-cut-offcut-ft2]');
  box.value='6';box.dispatchEvent(new Event('change'));
  const md=cutSettings().minOffcutFt2,small=cutOffcutOk(20,50,cutRunParams(6,null,null));
  return {def,rule,strip,noStrip,box:!!box,md,small};
 }),{def:[40,40,10],rule:[true,true,false,true],strip:true,noStrip:true,box:true,md:6,small:true});

 eq('сток в резе: отмеченный кусок со стеллажа идёт листом прогона (кромку ему не режут) — квадратных футов меньше; What if его предлагает; в журнале видно батч',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);ctOrder([[46,60,5]]);const b1=DB.glassBatch[0];
  cutPlanRun(b1.number);const g1=cutPlanFor(b1.number).groups[0];
  let take=null;g1.sheets.forEach(s=>(s.offcuts||[]).forEach((o,i)=>{if(!take&&o.w>=90&&o.h>=90)take={no:s.no,i};}));
  const id=cutStockTake(b1.number,g1.glass,take.no,take.i).id;
  ctOrder([[40,44,10]]);const b2=DB.glassBatch[1];
  const before=cutPlanRun(b2.number).plan.stats.area;
  /* Пока кусок не отмечен — его в прогоне нет, но What if его предлагает. */
  const hidden=!cutStockFor('6CLEAR',(cutPlanFor(b2.number).sheetPick||{})['6CLEAR']||null,6).some(r=>r.key===id);
  const offered=cutWhatIfCases(cutPlanFor(b2.number)).some(c=>c.key==='stock:'+id);
  cutPlanReset(b2.number);cutSetStock(b2.number,'6CLEAR',id,'off',false);
  const p=cutPlanRun(b2.number).plan,g2=p.groups[0],sheet=g2.sheets.find(s=>s.size.key===id),pr=sheet&&cutGroupParams(g2,sheet.size);
  tab='optimization';optimizationSetTab('stock');render();
  const inBatch=(document.querySelector('[data-stock-in]')||{}).textContent;
  return {before,hidden,offered,used:!!sheet,less:p.stats.area<before-1e-6,edges:pr?[pr.trimX,pr.trimY,pr.borderX,pr.borderY].join():'',
   placed:p.stats.placed===p.stats.total,inBatch,clean:!ctOverlap(p).length&&!ctOutside(p).length};
 }),{before:204,hidden:true,offered:true,used:true,less:true,edges:'0,0,0,0',placed:true,inBatch:'In B-0002',clean:true});

 eq('кусок со стеллажа выбирается для батча прямо из журнала: отметка встаёт в его SHEETS, другому батчу он больше не предлагается; Release возвращает',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);
  ctOrder([[46,60,5]]);const b1=DB.glassBatch[0];cutPlanRun(b1.number);const g1=cutPlanFor(b1.number).groups[0];
  let take=null;g1.sheets.forEach(s=>(s.offcuts||[]).forEach((o,i)=>{if(!take&&o.w>=90&&o.h>=90)take={no:s.no,i};}));
  const id=cutStockTake(b1.number,g1.glass,take.no,take.i).id;
  ctOrder([[40,44,10]]);ctOrder([[30,30,8]]);const b2=DB.glassBatch[1],b3=DB.glassBatch[2];
  cutPlanRun(b2.number);
  tab='optimization';optimizationSetTab('stock');render();
  /* Свой батч не предлагается: пока его не порежут, куска физически нет. */
  const offered=stockUiBatches(stockOffcutFind(id)).map(x=>x.number);
  stockUiUse(id,b2.number);
  const picked=((cutPlanFor(b2.number).sheetPick||{})['6CLEAR']||{}).sizes.filter(r=>/^S-/.test(r.key)).map(r=>r.key+':'+r.off).join();
  const reset=!!cutPlanFor(b2.number).reset,where=(document.querySelector('[data-stock-in]')||{}).textContent;
  const forOther=cutStockPieces('6CLEAR',6,b3.number).map(x=>x.key);
  const built=cutPlanRun(b2.number).plan,used=built.groups[0].sheets.some(s=>s.size.key===id);
  stockUiRelease(id,b2.number);
  const back=cutStockPieces('6CLEAR',6,b3.number).map(x=>x.key),free=!document.querySelector('[data-stock-in]');
  return {offered,picked,reset,where,forOther,used,back,free,russian:/[А-яЁё]/.test(document.querySelector('.oq-card').innerText)};
 }),{offered:['B-0003','B-0002'],picked:'S-0000001:false',reset:true,where:'Picked for B-0002',forOther:[],used:true,back:['S-0000001'],free:true,russian:false});

 eq('журнал стока (Optimization → Stock): что лежит, откуда и когда; возврат в отход снимает кусок и с листа',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,5],[50,50,2]]);const b=DB.glassBatch[0];
  cutPlanRun(b.number);const g=cutPlanFor(b.number).groups[0],ids=[];
  g.sheets.forEach(s=>{if((s.offcuts||[]).length&&ids.length<2){const r=cutStockTake(b.number,g.glass,s.no,0);if(r.id)ids.push(r.id);}});
  tab='optimization';optimizationSetTab('stock');render();
  const rows=[...document.querySelectorAll('[data-stock-row]')].map(r=>r.dataset.stockRow);
  const areas=rows.map(id=>{const r=stockOffcutFind(id);return r.w*r.h;});
  const total=document.querySelector('[data-stock-total]').textContent,count=document.querySelector('[data-queue-tab="stock"] b').textContent;
  const before=cutPlanFor(b.number).groups[0].sheets.reduce((n,s)=>n+(s.stock||[]).length,0);
  /* Возврат в отход из журнала — кусок уходит и с листа раскроя. */
  document.querySelector('[data-stock-row="'+rows[0]+'"] [data-stock-drop]').click();
  const after=cutPlanFor(b.number).groups[0].sheets.reduce((n,s)=>n+(s.stock||[]).length,0),gone=!document.querySelector('[data-stock-row="'+rows[0]+'"]');
  stockUiShowOff(true);const withOff=!!document.querySelector('[data-stock-row="'+rows[0]+'"]');stockUiShowOff(false);
  const again=stockOffcutDrop(rows[0]).error;
  return {two:ids.length===2,rows:rows.length,big:areas[0]>=areas[1],total:/^2 in stock · \d/.test(total),count,before,after,gone,withOff,
   status:stockOffcutFind(rows[0]).status,again,russian:/[А-яЁё]/.test(document.querySelector('.oq-card').innerText)};
 }),{two:true,rows:2,big:true,total:true,count:'2',before:2,after:1,gone:true,withOff:true,status:'cancelled',again:'Already off stock.',russian:false});

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
  cutUi.sheet=last.no;render();document.querySelector('[data-cut-move-sheet]').click();document.querySelector('#cutMenu [data-cut-menu="move-new"]').click();
  const info=(document.querySelector('[data-cut-info]')||{}).textContent||'',rec=stockOffcutFind(hint);
  document.querySelector('[data-cut-open-batch]').click();
  const np=cutPlanFor('B-0002'),sh=np.groups[0].sheets[0];
  return {info:/→ B-0002/.test(info),rec:[rec.batch,rec.sheet,rec.status].join(),sheetStock:sh.stock.map(x=>x.id),locked:sh.locked,opened:glassBatchOpenNumber,tab:glassBatchDetailTab,paper:!!document.querySelector('.cut-paper')};
 }),{info:true,rec:'B-0002,1,stock',sheetStock:['S-0000001'],locked:true,opened:'B-0002',tab:'optimization',paper:true});

 eq('кнопки − / + удаляют лист и добавляют пустой лист текущего размера для ручной раскладки',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,3]]);const b=DB.glassBatch[0];
  const plan=cutPlanRun(b.number).plan,g=plan.groups[0],n=g.sheets.length,key=cutSheetKey(g.sheets[0].size||g.sheet);
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:g.glass,sheet:1,sel:'',drag:''};render();
  const minus=document.querySelector('[data-cut-sheet-delete]'),plus=document.querySelector('[data-cut-sheet-add]'),labels={minus:minus.textContent.trim(),plus:plus.textContent.trim(),minusTitle:minus.title,plusTitle:plus.title};
  plus.click();const added=cutPlanFor(b.number).groups[0],addedOne=added.sheets.length===n+1,empty=added.sheets[added.sheets.length-1],opened=cutUi.sheet;
  document.querySelector('[data-cut-sheet-delete]').click();const after=cutPlanFor(b.number).groups[0];
  return {labels,added:addedOne,empty:empty.pieces.length===0&&(empty.stock||[]).length===0,sameSize:cutSheetKey(empty.size)===key,
   opened:opened===empty.no,deleted:after.sheets.length===n,numbers:after.sheets.every((s,i)=>s.no===i+1)};
 }),{labels:{minus:'−',plus:'+',minusTitle:'Delete sheet',plusTitle:'Add empty sheet'},added:true,empty:true,sameSize:true,opened:true,deleted:true,numbers:true});

 eq('очередь резки собирает размеры в цельные блоки; стрелки меняют порядок без перестановки стекла',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctSheet('6CLEAR',96,144);ctOrder([[20,20,4]]);
  const b=DB.glassBatch[0],plan=cutPlanRun(b.number).plan,g=plan.groups[0],pieces=cutPieces(b,plan.settings||{}),stock=cutStockFor(g.glass,g.pick,g.mm,b.number);
  const small=stock.find(z=>z.w===130),big=stock.find(z=>z.w===144);
  g.sheets=pieces.map((p,i)=>({no:i+1,size:i%2?small:big,locked:false,stock:[],pieces:[{piece:p.piece,x:1,y:1,w:p.w,h:p.h,turn:0,rot:false}]}));
  cutPlanRefresh(plan);const before=g.sheets.map(s=>s.pieces[0].piece+':'+s.pieces[0].x+','+s.pieces[0].y).sort().join('|');
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:g.glass,sheet:1,sel:'',drag:''};render();
  const mixed=!!document.querySelector('[data-cut-size-group]');document.querySelector('[data-cut-size-group]').click();
  const grouped=g.sheets.map(s=>s.size.w).join(),ranges=[...document.querySelectorAll('[data-cut-size-block] small')].map(x=>x.textContent.trim());
  const first=g.sheets[0],earlier=document.querySelector('[data-cut-size-earlier="144x96"]');earlier.click();
  const swapped=g.sheets.map(s=>s.size.w).join(),same=before===g.sheets.map(s=>s.pieces[0].piece+':'+s.pieces[0].x+','+s.pieces[0].y).sort().join('|');
  first.locked=true;const blocked=cutSheetSizeMove(b.number,g.glass,'130x96',-1).error;first.locked=false;
  return {mixed,grouped,swapped,ranges,same,blocked:!!blocked,numbers:g.sheets.every((s,i)=>s.no===i+1)};
 }),{mixed:true,grouped:'130,130,144,144',swapped:'144,144,130,130',ranges:['2 sheets · 1–2','2 sheets · 3–4'],same:true,blocked:true,numbers:true});

 eq('одинаковые соседние раскладки сворачиваются в диапазон и раскрываются без потери номера листа',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,144);ctOrder([[20,20,3]]);
  const b=DB.glassBatch[0],plan=cutPlanRun(b.number).plan,g=plan.groups[0],size=g.sheets[0].size||g.sheet,parts=cutPieces(b,plan.settings||{});
  g.sheets=parts.map((p,i)=>({no:i+1,size,locked:false,stock:[],pieces:[{piece:p.piece,x:1,y:1,w:p.w,h:p.h,turn:0,rot:false}]}));cutPlanRefresh(plan);
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:g.glass,sheet:1,sel:'',drag:''};render();
  const range=document.querySelector('[data-cut-range="1-3"]'),collapsed=!!range&&document.querySelectorAll('[data-cut-tab]').length===0;
  range.click();const open=document.querySelectorAll('[data-cut-tab]').length===3&&document.querySelector('[data-cut-range]').getAttribute('aria-expanded')==='true';
  document.querySelector('[data-cut-tab="2"]').click();const chosen=cutUi.sheet===2;
  document.querySelector('[data-cut-range]').click();const closed=!!document.querySelector('[data-cut-range="1-3"].on')&&cutUi.sheet===2;
  return {collapsed,open,chosen,closed,pieces:g.sheets.reduce((n,s)=>n+s.pieces.length,0)};
 }),{collapsed:true,open:true,chosen:true,closed:true,pieces:3});

 eq('финальное уплотнение переносит детали и убирает пустой лист только с безопасными резами',await t.p.evaluate(()=>{
  const size={key:'100x100',w:100,h:100},params={trimX:0,trimY:0,borderX:0,borderY:0,minDist:0.75,rotate:true};
  const source=new Map([['A',{piece:'A',w:50,h:50,priority:0,norot:false}],['B',{piece:'B',w:50,h:50,priority:0,norot:false}],['C',{piece:'C',w:20,h:20,priority:0,norot:false}]]);
  const group={sheet:size,sheets:[{no:1,size,stock:[],pieces:[{piece:'A',x:0,y:0,w:50,h:50},{piece:'B',x:50,y:0,w:50,h:50}]},
   {no:2,size,stock:[],pieces:[{piece:'C',x:0,y:0,w:20,h:20}]}]};
  const removed=cutConsolidateSheets(group,()=>params,source);
  return {removed,sheets:group.sheets.length,pieces:group.sheets[0].pieces.length,cut:cutSheetCuts(group.sheets[0],size,params).ok};
 }),{removed:1,sheets:1,pieces:3,cut:true});

 eq('укладчик забивает лист: пример владельца — девять 50 × 30 на 144 × 102; 46 штук — 6 листов; смешанный батч не хуже рядов',await t.p.evaluate(()=>{
  const one=(sheet,sizes)=>{oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',sheet[1],sheet[0]);ctOrder(sizes);const b=DB.glassBatch[0];
   const g=cutPlanRun(b.number).plan.groups[0],pieces=cutPieces(b,{}),stock=cutStockFor('6CLEAR',null),pf=size=>cutRunParams(6,size,null);
   const strips=Math.min(...CUT_STRATEGIES.map(st=>cutPack(pieces,stock,pf,st,[],6).sheets.length));
   return {sheets:g.sheets.length,per:g.sheets.map(x=>x.pieces.length).join(),strips,overlap:ctOverlap(cutPlanFor(b.number)).length,outside:ctOutside(cutPlanFor(b.number)).length,slivers:ctSlivers(cutPlanFor(b.number)).length};};
  const a=one([144,102],[[50,30,9]]),c=one([144,102],[[50,30,46]]),m=one([144,102],[[50,30,20],[20,100,4],[46,60,10],[28,38,20],[36,72,6]]);
  return {example:a.per,many:c.sheets,mixedBetter:m.sheets<=m.strips,clean:[a,c,m].every(x=>!x.overlap&&!x.outside)};
 }),{example:'9',many:6,mixedBetter:true,clean:true});

 eq('удалить лист: стёкла — в «Not on a sheet», сток — в отход, листы перенумерованы',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,5]]);const b=DB.glassBatch[0];
  const g=cutPlanRun(b.number).plan.groups[0],n=g.sheets.length,s1=g.sheets[0],ids=s1.pieces.map(p=>p.piece);
  const hint=(s1.offcuts||[]).length?cutStockTake(b.number,g.glass,1,0).id:'';
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  document.querySelector('[data-cut-sheet-delete]').click();
  const p2=cutPlanFor(b.number),g2=p2.groups[0],waiting=document.querySelector('[data-cut-waiting]').textContent;
  return {sheets:g2.sheets.length===n-1,numbers:g2.sheets.map(x=>x.no).join()===g2.sheets.map((x,i)=>i+1).join(),gone:!ids.some(id=>cutFind(p2,id)),
   waiting:/Not on a sheet · 2/.test(waiting)||new RegExp('Not on a sheet · '+ids.length).test(waiting),stock:hint?stockOffcutFind(hint).status:'cancelled'};
 }),{sheets:true,numbers:true,gone:true,waiting:true,stock:'cancelled'});

 eq('оверсайз: стекло больше поля между линиями — подсказка и «+ same size» без Trim и Border; у размера свои Used % и отход',await t.p.evaluate(async()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,3],[129.5,95.5,1]]);const b=DB.glassBatch[0];
  cutPlanRun(b.number);glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  const over=(document.querySelector('[data-cut-over]')||{}).textContent||'';
  /* Одна кнопка: Reset, строка размера без Trim и Border, Build. */
  document.querySelector('[data-cut-over-add]').click();await cutBuildDone();
  const p=cutPlanFor(b.number),g=p.groups[0],keys=g.sheets.map(x=>cutSheetKey(x.size)),row=document.querySelector('[data-cut-stock="130x96#2"]');
  const nums=[...document.querySelectorAll('[data-cut-size-nums]')].map(x=>x.dataset.cutSizeNums+' '+x.textContent.replace(/\s+/g,' ').trim());
  const edges=['trimx','trimy','borderx','bordery'].map(f=>row.querySelector('[data-cut-edge-'+f+']').value).join();
  const placed=p.stats.placed,total=p.stats.total;
  document.querySelector('[data-cut-reset-plan]').click();document.querySelector('[data-cut-same-remove="130x96#2"]').click();document.querySelector('[data-cut-run]').click();await cutBuildDone();
  return {over:/1 glass larger than the sheet/.test(over),variant:keys.includes('130x96#2'),placed:placed===total,edges,nums:nums.some(x=>/^130x96#2 \d+ · .*% used · .*% waste · .* ft²/.test(x)),removed:!document.querySelector('[data-cut-stock="130x96#2"]'),overBack:!!document.querySelector('[data-cut-over]')};
 }),{over:true,variant:true,placed:true,edges:'0,0,0,0',nums:true,removed:true,overBack:true});

 eq('перенос листа в уже открытый батч с тем же стеклом: стёкла и лист — туда, история «Added from»',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,5]]);ctOrder([[28,38,3]]);
  const [b1,b2]=DB.glassBatch;cutPlanRun(b1.number);cutPlanRun(b2.number);
  const g=cutPlanFor(b1.number).groups[0],last=g.sheets[g.sheets.length-1],ids=last.pieces.map(p=>p.piece),before=cutPlanFor(b2.number).groups[0].sheets.length;
  const targets=cutMoveTargets(b1.number,'6CLEAR').map(x=>x.number);
  const r=cutMoveSheet(b1.number,'6CLEAR',last.no,b2.number),g2=cutPlanFor(b2.number).groups[0];
  return {targets,ok:!!r.ok,sheets:g2.sheets.length===before+1,same:g2.sheets[g2.sheets.length-1].pieces.map(p=>p.piece).join()===ids.join(),
   active:ids.every(id=>b2.items.some(i=>i.piece===id&&!i.releasedAt)),history:b2.history[b2.history.length-1].action,stale:cutPlanStale(b2.number),
   bad:cutMoveSheet(b1.number,'6CLEAR',1,'B-0099').error};
 }),{targets:['B-0002'],ok:true,sheets:true,same:true,active:true,history:'Added from B-0001',stale:false,bad:'Batch B-0099 cannot take this glass.'});

 eq('линии реза: сквозной рез через весь лист, ни один рез не пересекает стекло; клик переворачивает и возвращает; лист без сквозных резов помечен и чинится кнопкой',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);ctOrder([[46,60,6],[28,38,8]]);const b=DB.glassBatch[0];
  const plan=cutPlanRun(b.number).plan,g=plan.groups[0];
  const cuts=g.sheets.map(s=>cutSheetCutsFor(g,s));
  const ok=cuts.every(c=>c.ok),first=cuts[0].lines.filter(l=>l.level===1).length;
  /* Рез не пересекает ни одно стекло. */
  const cross=cuts.some((c,i)=>c.lines.some(l=>cutTaken(g.sheets[i]).some(p=>l.axis==='x'
   ?p.x<l.at-1e-6&&p.x+p.w>l.at+1e-6&&p.y<l.y1-1e-6&&p.y+p.h>l.y0+1e-6
   :p.y<l.at-1e-6&&p.y+p.h>l.at+1e-6&&p.x<l.x1-1e-6&&p.x+p.w>l.x0+1e-6)));
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  const shown=document.querySelectorAll('[data-cut-line]').length,lines=()=>JSON.stringify(cutSheetCutsFor(cutPlanFor(b.number).groups[0],cutPlanFor(b.number).groups[0].sheets[0]).lines.map(l=>l.axis+l.at));
  const before=lines(),click=()=>document.querySelector('[data-cut-line]').dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));
  click();const turned=lines()!==before,flip=(cutPlanFor(b.number).groups[0].sheets[0].flip||[]).length;
  click();const back=lines()===before;
  /* Вертушка руками: сквозных резов нет. */
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);ctOrder([[60,40,2],[40,60,2]]);const c=DB.glassBatch[0];
  cutPlanRun(c.number);const gc=cutPlanFor(c.number).groups[0],sc=gc.sheets[0],P=sc.pieces;
  [[0.875,0.875,60,40],[60.875,0.875,40,60],[40.875,60.875,60,40],[0.875,40.875,40,60]].forEach(([x,y,w,h],i)=>{P[i].x=x;P[i].y=y;P[i].w=w;P[i].h=h;});
  cutPlanRefresh(cutPlanFor(c.number));
  const broke=cutSheetCutsFor(gc,sc);
  glassBatchOpen(c.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  const badge=!!document.querySelector('[data-cut-not-cuttable]'),stuck=document.querySelectorAll('.cut-paper [data-cut-stuck]').length;
  document.querySelector('[data-cut-repack]').click();
  const g2=cutPlanFor(c.number).groups[0],fixed=cutSheetCutsFor(g2,g2.sheets[0]);
  return {ok,first,cross,shown:shown>0,turned,flip,back,broken:!broke.ok&&broke.stuck.length>=1,badge,stuck:stuck>=1,
   fixed:fixed.ok,pieces:g2.sheets[0].pieces.length,noBadge:!document.querySelector('[data-cut-not-cuttable]')};
 }),{ok:true,first:1,cross:false,shown:true,turned:true,flip:1,back:true,broken:true,badge:true,stuck:true,fixed:true,pieces:4,noBadge:true});

 {
  /* Высоту меряем на настоящем окне: лист не должен съедать пол-экрана. */
  const view=t.p.viewportSize();await t.p.setViewportSize({width:1440,height:900});
  eq('экран ниже: лист не выше половины окна, таблица листов видна без прокрутки; стекло контрастнее пустого листа',await t.p.evaluate(async()=>{
   oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);ctOrder([[46,60,6],[28,38,8]]);const b=DB.glassBatch[0];
   glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};cutUiFull(true);render();
   document.querySelector('[data-cut-run]').click();await cutBuildDone();
   const svg=document.querySelector('.cut-paper svg').getBoundingClientRect(),params=document.querySelector('[data-cut-params]').getBoundingClientRect();
   const css=q=>getComputedStyle(document.querySelector(q));
   return {low:svg.height<=window.innerHeight*0.5,sheets:params.bottom<=window.innerHeight,
    free:css('.cut-sheet-free').fill,glass:/url/.test(css('.cut-glass').fill),stop:css('.cut-g2').stopColor,
    line:/^rgb/.test(css('.cut-glass').stroke),dashed:document.querySelectorAll('.cut-paper [stroke-dasharray]').length};
  }),{low:true,sheets:true,free:'rgb(238, 241, 245)',glass:true,stop:'rgb(207, 228, 246)',line:true,dashed:0});
  await t.p.setViewportSize(view||{width:1280,height:720});
 }

 eq('подпись куска влезает в кусок; лист на весь экран и обратно по Esc',await t.p.evaluate(()=>{
  const narrow=cutFitLabel(0,0,116,180,['S-0000001','29 1/16 × 45 1/4″'],'#000'),wide=cutFitLabel(0,0,400,60,['S-0000001','40 × 40″'],'#000'),tiny=cutFitLabel(0,0,20,20,['S-0000001','1 × 1″'],'#000');
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,2]]);const b=DB.glassBatch[0];
  cutPlanRun(b.number);glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  /* Полный экран — по умолчанию: «базово увеличить экран». */
  const hidden=getComputedStyle(document.querySelector('.side')).display==='none',label=document.querySelector('[data-cut-full]').getAttribute('aria-label');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));const back=getComputedStyle(document.querySelector('.side')).display!=='none';
  document.querySelector('[data-cut-full]').click();const again=getComputedStyle(document.querySelector('.side')).display==='none';
  return {narrow:(narrow.match(/<text/g)||[]).length===2||/rotate/.test(narrow),wide:(wide.match(/<text/g)||[]).length===1,tiny,hidden,label,back,again};
 }),{narrow:true,wide:true,tiny:'',hidden:true,label:'Exit full screen',back:true,again:true});

 eq('Build и Reset, как в Perfect Cut: собранный раскрой — параметры закрыты; Reset убирает листы (заблокированный остаётся) и открывает параметры; Build с полоской хода; Cancel ничего не меняет',await t.p.evaluate(async()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,5]]);const b=DB.glassBatch[0];
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  /* Раскроя ещё нет: параметры открыты, пустой лист с линиями Trim и Border, кнопка Build. */
  const fresh={empty:!!document.querySelector('[data-cut-empty] [data-cut-edge]'),stats:document.querySelector('[data-cut-stats]').textContent,open:!document.querySelector('[data-cut-edge-trimx]').disabled,
   btn:document.querySelector('[data-cut-run]').textContent,reset:!!document.querySelector('[data-cut-reset-plan]'),saved:!!cutPlanFor(b.number)};
  document.querySelector('[data-cut-run]').click();
  const bar=!!document.querySelector('[data-cut-progress]'),busy=!!document.querySelector('.cut-busy');
  await cutBuildDone();
  const built={sheets:cutPlanFor(b.number).groups[0].sheets.length>=2,bar:!!document.querySelector('[data-cut-progress]'),run:document.querySelector('[data-cut-run]').disabled,
   closed:['[data-cut-edge-trimx]','[data-cut-qty]','[data-cut-use]','[data-cut-rot]','[data-cut-priority]','[data-cut-on]'].every(q=>document.querySelector(q).disabled),hint:!!document.querySelector('[data-cut-locked]'),
   refused:cutSetStock(b.number,'6CLEAR','130x96','trimX','2').error,soft:!!cutSetParam(b.number,'6CLEAR','minOffcutW','24').ok};
  /* Reset: заблокированный лист остаётся, параметры открыты. */
  const g0=cutPlanFor(b.number).groups[0];cutSheetLock(b.number,'6CLEAR',g0.sheets.length);const lockedIds=g0.sheets[g0.sheets.length-1].pieces.map(p=>p.piece).join();render();
  document.querySelector('[data-cut-reset-plan]').click();
  const p1=cutPlanFor(b.number);
  const reset={flag:!!p1.reset,sheets:p1.groups[0].sheets.length,open:!document.querySelector('[data-cut-edge-trimx]').disabled,run:!document.querySelector('[data-cut-run]').disabled,
   waiting:/Not on a sheet/.test(document.querySelector('[data-cut-waiting]').textContent)};
  /* Правка отступа видна сразу: стекло заблокированного листа за новой линией — красное. */
  const trim=document.querySelector('[data-cut-edge-trimx]');trim.value='20';trim.dispatchEvent(new Event('change'));
  const red=document.querySelectorAll('.cut-paper [data-cut-out]').length>0;
  /* Cancel — раскрой остаётся сброшенным. */
  document.querySelector('[data-cut-run]').click();cutUiCancel();const cancel=await cutBuildDone();
  const stillReset=!!cutPlanFor(b.number).reset&&!!(cancel&&cancel.cancelled);
  document.querySelector('[data-cut-run]').click();await cutBuildDone();
  const p=cutPlanFor(b.number),g=p.groups[0];
  return {fresh,bar,busy,built,reset,red,stillReset,rebuilt:!p.reset,first:g.sheets[0].locked&&g.sheets[0].pieces.map(x=>x.piece).join()===lockedIds,
   moved:g.sheets.filter(x=>!x.locked).every(x=>x.pieces.every(q=>q.y>=20-1e-6)),russian:/[А-яЁё]/.test(document.querySelector('.oq-card').innerText)};
 }),{fresh:{empty:true,stats:'Not built',open:true,btn:'Build',reset:false,saved:false},bar:true,busy:true,
  built:{sheets:true,bar:false,run:true,closed:true,hint:true,refused:'Reset the optimization to change settings.',soft:true},
  reset:{flag:true,sheets:1,open:true,run:true,waiting:true},red:true,stillReset:true,rebuilt:true,first:true,moved:true,russian:false});

 eq('приоритет по умолчанию 0 — «нет»; Min dist — у каждой строки размера листа',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,2]]);const b=DB.glassBatch[0];
  cutPlanRun(b.number);glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  const prios=cutPieces(b,{}).map(p=>p.priority).join(),box=document.querySelector('[data-cut-priority]');
  const value=box.value,ph=box.placeholder;
  document.querySelector('[data-cut-reset-plan]').click();
  const md=document.querySelector('[data-cut-edge-mindist]');md.value='1 1/2';md.dispatchEvent(new Event('change'));
  const g=cutPlanFor(b.number).groups[0];
  return {prios,value,ph,rank:[cutPrioRank(0),cutPrioRank(1)].join(),row:cutGroupParams(g,{key:'130x96',w:130,h:96}).minDist,reset:!!cutPlanFor(b.number).reset};
 }),{prios:'0,0',value:'',ph:'—',rank:'11,1',row:1.5,reset:true});

 eq('случайные варианты к правильным порядкам: смешанный батч 117 стёкол — 13 листов вместо 14; раскладка повторяется',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);
  ctOrder([[46.25,58.5,14],[33,71,9],[28,28,40],[62,40,7],[19.5,44,25],[70,24,6],[38,52,16]]);const b=DB.glassBatch[0];
  const a=cutPlanRun(b.number).plan,one=JSON.stringify(a.groups[0].sheets.map(x=>x.pieces.map(p=>[p.piece,p.x,p.y,p.rot]))),n=a.groups[0].sheets.length;
  const c=cutPlanRun(b.number).plan,two=JSON.stringify(c.groups[0].sheets.map(x=>x.pieces.map(p=>[p.piece,p.x,p.y,p.rot])));
  return {n,placed:c.stats.placed===c.stats.total,same:one===two,clean:!ctOverlap(c).length&&!ctOutside(c).length&&!ctSlivers(c).length};
 }),{n:13,placed:true,same:true,clean:true});

 eq('столбиками без полоски 1/4″: тест владельца — 23 безопасных листа; подпись вдоль',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);
  ctOrder([[20.25,100.25,111],[60.25,50.25,30],[12.25,50.25,10]]);const b=DB.glassBatch[0];
  const c=ctSet(b.number,()=>[['trimX','1'],['trimY','1'],['borderX','0'],['borderY','0']].forEach(([f,v])=>cutSetParam(b.number,'6CLEAR',f,v))).plan,g=c.groups[0],narrow=g.sheets.find(s=>s.pieces.length&&s.pieces.every(p=>p.w===20.25));
  const list=cutPieces(b,c.settings||{}),stock=cutStockFor('6CLEAR',g.pick,6,b.number),paramsFor=size=>cutRunParams(6,size,g.pick);
  const old=cutPackColumns(list,stock,paramsFor,[],{rows:false,orient:'asis',fit:'ffd'});
  const trial={glass:'6CLEAR',mm:6,sheet:stock[0],pick:g.pick,params:paramsFor(stock[0]),sheets:old.sheets,unplaced:old.unplaced};
  const firstBad=old.sheets.find(s=>!cutSheetCutsFor(trial,s).ok),sliver=firstBad&&cutSheetCutsFor(trial,firstBad).stuck.find(x=>x.reason==='minDist');
  const healed=firstBad&&cutHealEdgeSlivers(firstBad,stock[0],paramsFor(stock[0]));
  return {sheets:g.sheets.length,placed:c.stats.placed===c.stats.total,clean:!ctOverlap(c).length&&!ctOutside(c).length,
   safe:cutGroupCutQuality(g).bad===0,oldSliver:sliver&&sliver.width,healed:!!healed&&cutSheetCutsFor(trial,firstBad).ok,
   turned:!!narrow&&/rotate\(-90\)/.test(cutSheetSVG(g,narrow,480,[],{}))};
 }),{sheets:23,placed:true,clean:true,safe:true,oldSliver:0.5,healed:true,turned:true});

 eq('общий левый Trim Y: уступ 5/16″ исправляется тримом 1 5/16″ на всём листе',await t.p.evaluate(()=>{
  const size={w:144,h:96,key:'144x96'},params={trimX:0,trimY:1,borderX:0,borderY:0,minDist:.75};
  const bottom=Array.from({length:6},(_,i)=>({piece:'B'+i,x:1.3125+i*24,y:0,w:i===5?22.6875:24,h:58.75}));
  const top=Array.from({length:5},(_,i)=>({piece:'T'+i,x:1+i*24,y:58.75,w:24,h:27.0625}));
  const sheet={size,pieces:bottom.concat(top),stock:[]};
  const before=cutSheetCuts(sheet,size,params),fixed=cutHealEdgeSlivers(sheet,size,params),after=cutSheetCuts(sheet,size,params);
  const group={mm:6,sheet:size,pick:{trimX:0,trimY:1,borderX:0,borderY:0,minDist:.75},sheets:[sheet]};
  const host=document.createElement('div');host.innerHTML=cutSheetSVG(group,sheet,520,[],{ids:true});
  const line=host.querySelector('[data-cut-edge="trimY"]');
  return {bad:before.stuck.some(x=>x.reason==='minDist'&&Math.abs(x.width-.3125)<1e-6),fixed,
   safe:after.ok,trim:cutEffectiveTrimY(sheet,params),both:sheet.pieces.every(p=>p.x>=1.3125-1e-6),
   left:Math.min(...top.map(p=>p.x)),wideOffcut:cutEffectiveTrimY({pieces:[{x:20,y:0,w:24,h:24}],stock:[]},params),line:line&&Math.abs(+line.getAttribute('x1')-1.3125*520/144)<.06,
   label:line&&line.querySelector('title').textContent.includes('1 5/16″')};
 }),{bad:true,fixed:true,safe:true,trim:1.3125,both:true,left:1.3125,wideOffcut:1,line:true,label:true});

 eq('машинный снимок передаёт фактический Trim Y, а не нижнюю настройку',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',144,96);
  ctOrder([[24,58.75,5],[22.6875,58.75,1],[24,27.0625,5]]);
  const b=DB.glassBatch[0],plan=cutPlanRun(b.number).plan,g=plan.groups[0],size={w:144,h:96,key:'144x96'};
  g.pick=Object.assign(g.pick||{},{trimX:0,trimY:1,borderX:0,borderY:0,minDist:.75});
  if(g.params)g.params.minDist=.75;
  const src=cutPieces(b,plan.settings||{}),bottom=src.filter(p=>p.h===58.75),top=src.filter(p=>p.h===27.0625);
  let x=1.3125;const placed=bottom.map(p=>{const q={piece:p.piece,x,y:0,w:p.w,h:p.h,rot:false};x+=p.w;return q;});
  x=1.3125;top.forEach(p=>{placed.push({piece:p.piece,x,y:58.75,w:p.w,h:p.h,rot:false});x+=p.w;});
  g.sheets=[{no:1,size,pieces:placed,stock:[]}];
  cutPlanRefresh(plan);cutUi={batch:'',glass:g.glass,sheet:1,sel:'',drag:''};
  const job=cutMachineSnapshot(b.number),s=job.sheets[0];
  const header=document.createElement('div');header.innerHTML=cutLayoutHeader(b,'Awaiting cutting');
  const view=document.createElement('div');view.innerHTML=viewCutLayout(b);
  const badge=header.querySelector('[data-cut-auto-trim]'),tab=view.querySelector('[data-cut-tab-trim]');
  cutPrintLayouts(b.number);const print=document.getElementById('cutPrintHost').textContent.includes('Trim Y 1″ → 1 5/16″');cutPrintCleanup();
  const taken=cutPieceTake(b.number,top[0].piece),manualSafe=cutSheetCutsFor(g,g.sheets[0]).ok;
  return {valid:job.valid,errors:job.errors,actual:s.margins.trimY,minimum:s.minimumMargins.trimY,usable:s.usable.x0,
   badge:badge&&badge.textContent.includes('1″ → 1 5/16″'),tab:tab&&tab.textContent==='Trim +5/16″',print,
   taken:!!taken.ok,manualSafe,manualTrim:cutEffectiveTrimY(g.sheets[0],cutGroupParams(g,size))};
 }),{valid:true,errors:[],actual:1.3125,minimum:1,usable:1.3125,badge:true,tab:true,print:true,taken:true,manualSafe:true,manualTrim:1.3125});

 eq('два размера листа — берутся оба, где выгоднее: квадратных футов меньше, чем одним размером; количество листов размера соблюдается',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);ctSheet('6CLEAR',96,130);
  ctOrder([[31,25,10],[32,15,11],[67,50,13],[51,76,3]]);const b=DB.glassBatch[0];
  const kinds=plan=>[...new Set(plan.groups[0].sheets.map(s=>cutSheetKey(s.size)))].sort();
  const mix=cutPlanRun(b.number).plan,area=mix.stats.area,both=kinds(mix);
  const only144=ctSet(b.number,()=>cutSetStock(b.number,'6CLEAR','130x96','off',true)).plan.stats.area;
  const only130=ctSet(b.number,()=>cutSetStock(b.number,'6CLEAR','130x96','off',false),()=>cutSetStock(b.number,'6CLEAR','144x102','off',true)).plan.stats.area;
  const lim=ctSet(b.number,()=>cutSetStock(b.number,'6CLEAR','144x102','off',false),()=>cutSetStock(b.number,'6CLEAR','144x102','limit',3)).plan;
  return {both,less:area<Math.min(only144,only130)-1e-6,limit:lim.groups[0].sheets.filter(s=>cutSheetKey(s.size)==='144x102').length<=3,placed:lim.stats.placed===lim.stats.total,
   clean:!ctOverlap(mix).length&&!ctOutside(mix).length&&!ctOverlap(lim).length&&!ctOutside(lim).length};
 }),{both:['130x96','144x102'],less:true,limit:true,placed:true,clean:true});

 eq('«а что если»: обрезка кромки парой Trim X & Y, под ней — каждая сторона отдельно; только цифры, раскрой не тронут; Use пересобирает',await t.p.evaluate(async()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);ctOrder([[34,36,18]]);const b=DB.glassBatch[0];
  ['borderX','borderY'].forEach(f=>cutSetParam(b.number,'6CLEAR',f,'0'));
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};render();
  document.querySelector('[data-cut-run]').click();await cutBuildDone();
  const built=cutPlanFor(b.number).stats.sheets,none=!document.querySelector('[data-cut-what]');
  document.querySelector('[data-cut-whatif]').click();await cutBuildDone();
  const rows=[...document.querySelectorAll('[data-cut-what-row]')].map(r=>r.dataset.cutWhatRow);
  /* Пара выиграла — под ней посчитаны и стороны по отдельности. */
  const pair=cutWhat.rows.find(x=>x.key==='trimX+trimY'),trim=cutWhat.rows.find(x=>x.key==='trimX');
  const sub=!!trim.sub&&!pair.sub,same=cutPlanFor(b.number).stats.sheets===built&&!cutPlanFor(b.number).reset;
  document.querySelector('[data-cut-what-use="trimX"]').click();await cutBuildDone();
  const g=cutPlanFor(b.number).groups[0];
  return {built,none,rows,sub,pair:pair.delta<=trim.delta+1e-6,less:trim.sheets<built,delta:trim.delta<0,same,after:cutPlanFor(b.number).stats.sheets,
   trimX:cutGroupParams(g,g.sheet).trimX,closed:!document.querySelector('[data-cut-what]'),placed:cutPlanFor(b.number).stats.placed===18};
 }),{built:3,none:true,rows:['now','trimX+trimY','trimX','trimY'],sub:true,pair:true,less:true,delta:true,same:true,after:2,trimX:0,closed:true,placed:true});

 eq('What if для большого батча помечает быстрый расчёт как приблизительный и не меняет раскрой',await t.p.evaluate(()=>{
  const b=DB.glassBatch[0],plan=cutPlanFor(b.number),before=JSON.stringify(plan.groups),total=plan.stats.total;
  plan.stats.total=301;const result=cutDrain(cutWhatIfSteps(b.number));plan.stats.total=total;
  cutWhat={batch:b.number,rows:result.rows};
  return {estimated:result.rows.length>1&&result.rows.slice(1).every(r=>r.estimated),unchanged:JSON.stringify(plan.groups)===before,
   labelled:/Fast estimate/.test(cutWhatTable(b.number,false))};
 }),{estimated:true,unchanged:true,labelled:true});

 /* Мышь — настоящими событиями Playwright, как рукой. */
 {
  /* Большое окно и одна прокрутка к листу: дальше меряем без прокрутки, иначе
     координаты, снятые раньше, уезжают. */
  const P=t.p,view=P.viewportSize();await P.setViewportSize({width:1600,height:1200});
  const at=sel=>P.evaluate(q=>{const el=document.querySelector(q);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,l:r.x,t:r.y,w:r.width,h:r.height};},sel);
  const toSheet=()=>P.evaluate(()=>{const el=document.querySelector('.cut-grid');if(el)el.scrollIntoView({block:'start'});});
  const setup=()=>P.evaluate(()=>{
   oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[30,40,3]]);const b=DB.glassBatch[0];
   cutPlanRun(b.number);ctRow(b.number);glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};cutNotice='';render();
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

 eq('лишний лист после Build растаскивается по ранним листам: стёкла целы, листы режутся; заблокированный лист не трогают',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);ctOrder([[46,60,2],[28,38,2]]);const b=DB.glassBatch[0];
  const plan=cutPlanRun(b.number).plan,g=plan.groups[0],one=g.sheets.length;
  const src=new Map(cutPieces(b,{}).filter(p=>!p.off).map(p=>[p.piece,p]));
  const pf=size=>cutGroupParams(g,size);
  /* Так ошибается укладчик: место на первом листе есть, а стекло уехало на свой лист. */
  const split=()=>{const s0=cutPlanFor(b.number).groups[0].sheets[0],u=cutUsable(s0.size,pf(s0.size)),last=s0.pieces.pop();
   cutPlanFor(b.number).groups[0].sheets.push({no:2,size:s0.size,locked:false,stock:[],pieces:[Object.assign({},last,{x:u.x0,y:u.y0})]});};
  split();const two=cutPlanFor(b.number).groups[0].sheets.length;
  const gone=cutTightenGroup(cutPlanFor(b.number).groups[0],pf,src),g1=cutPlanFor(b.number).groups[0];
  const back=g1.sheets.length,kept=g1.sheets.reduce((a,s)=>a+s.pieces.length,0);
  const ids=new Set(g1.sheets.flatMap(s=>s.pieces.map(p=>p.piece))),all=[...src.keys()].every(id=>ids.has(id));
  const cuts=g1.sheets.every(s=>cutSheetCutsFor(g1,s).ok);
  /* Заблокированный лист Build не перекладывает. */
  split();const g2=cutPlanFor(b.number).groups[0];g2.sheets[0].locked=true;
  const held=cutTightenGroup(g2,pf,src)===0&&g2.sheets.length===2;
  return {one,two,gone,back,kept,all,cuts,held};
 }),{one:1,two:2,gone:1,back:1,kept:4,all:true,cuts:true,held:true});

 eq('полоса отхода отрезается целиком: ни один рез не проходит сквозь самый большой остаток листа',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);ctOrder([[46,60,6],[28,38,8]]);const b=DB.glassBatch[0];
  cutPlanRun(b.number);const g=ctRow(b.number).groups[0];
  const bad=[];let hints=0;
  g.sheets.forEach(s=>{
   const size=s.size||g.sheet,c=cutSheetCutsFor(g,s),off=(s.offcuts||[])[0];
   if(!off)return;hints++;
   /* Рез внутри куска — кусок разваливается; по краю куска это и есть его рез. */
   c.lines.forEach(l=>{
    const cross=l.axis==='x'
     ?l.at>off.x+1e-6&&l.at<off.x+off.w-1e-6&&l.y0<off.y+off.h-1e-6&&l.y1>off.y+1e-6
     :l.at>off.y+1e-6&&l.at<off.y+off.h-1e-6&&l.x0<off.x+off.w-1e-6&&l.x1>off.x+1e-6;
    if(cross)bad.push('sheet '+s.no+' '+l.axis+l.at);
   });
  });
  return {hints:hints>0,bad};
 }),{hints:true,bad:[]});

 eq('после укладки стёкла подъезжают друг к другу: отход одним куском, а не полосками между стёклами; заблокированный лист не трогают',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);ctOrder([[34,36,8],[24,24,4]]);const b=DB.glassBatch[0];
  const plan=cutPlanRun(b.number).plan,g0=plan.groups[0];
  const list=cutPieces(b,{}).filter(p=>!p.off),stock=cutStockFor(g0.glass,g0.pick,g0.mm,b.number);
  const pf=size=>cutRunParams(g0.mm,size,g0.pick);
  /* Столбиками колонка шириной по самому широкому стеклу: 24″ стекло в
     колонке 34″ оставляло полоску 10″, и так четыре раза подряд. */
  const mk=()=>{const r=cutPackColumns(list,stock,pf,[],{rows:false,orient:'asis',fit:'ffd'});
   const sz=r.sheets[0].size;return {glass:g0.glass,mm:g0.mm,sheet:sz,stock,pick:g0.pick,params:pf(sz),sheets:r.sheets,unplaced:r.unplaced};};
  const g=mk(),sheet=g.sheets[0],size=sheet.size,pr=pf(size);
  const xs=()=>sheet.pieces.filter(p=>p.w===24).map(p=>cutRound(p.x)).sort((a,c)=>a-c);
  const big=()=>{const f=cutSheetCuts(sheet,size,pr,null,true).free||[];
   return f.map(r=>[cutRound(r.x1-r.x0),cutRound(r.y1-r.y0)]).sort((a,c)=>c[0]*c[1]-a[0]*a[1])[0]||null;};
  const before=xs(),bigBefore=big();
  const moved=cutTidyGroup(g,pf);
  const after=xs(),bigAfter=big(),cuts=cutSheetCuts(sheet,size,pr,null).ok;
  const g2=mk();g2.sheets[0].locked=true;const held=cutTidyGroup(g2,pf)===0;
  return {before,after,moved,bigBefore,bigAfter,cuts,held};
 }),{before:[0.875,34.875,68.875,102.875],after:[0.875,24.875,48.875,72.875],moved:1,bigBefore:[6.25,100.25],bigAfter:[40,24],cuts:true,held:true});

 eq('форма занимает border внутри своей коробки; снаружи укладчики дополнительного зазора не создают',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);
  const id=ctOrder([[40,50,3],[38,18,10],[20,12,8]]);
  const o=salesRecord(id),l=o.lines[0],sh=newShapeDef('raked');sh.w='40';sh.h='50';
  Object.assign(sh.params,{shortHeight:'44',rakeSide:'top',shortSide:'right'});
  sh.ownerLineId=l.id;DB.shapeDef.push(sh);l.shapeRef=salesShapeRefFrom(sh);
  const b=DB.glassBatch[0],plan=cutPlanRun(b.number).plan,g=plan.groups[0];
  const pieces=cutPieces(b,{}),stock=cutStockFor(g.glass,g.pick,g.mm,b.number),pf=size=>cutRunParams(g.mm,size,g.pick);
  const md=cutGroupParams(g,g.sheet).minDist;
  /* Место у скоса отложено внутри заготовки — не меньше Min distance. */
  const shaped=pieces.filter(p=>p.shape);
  const padOk=shaped.every(p=>(+p.pad||0)>=md-1e-6);
  /* Прямая сторона ничего не прибавляет: ширина заготовки равна размеру реза. */
  const flat=shaped.every(p=>Math.abs(p.w-cutRound(p.w))<1e-6);
  const bad=sheets=>{const out=[];sheets.forEach(x=>{const pr=cutGroupParams(g,x.size||g.sheet);
   x.pieces.forEach((a,i)=>x.pieces.slice(i+1).forEach(c=>{const gp=cutGapBetween(a,c,pr);
    if(a.x<c.x+c.w+gp-1e-6&&c.x<a.x+a.w+gp-1e-6&&a.y<c.y+c.h+gp-1e-6&&c.y<a.y+a.h+gp-1e-6)out.push(a.piece+'/'+c.piece);}));});return out;};
  /* Даже запасная форма без footprint не получает выдуманную наружную рамку:
     оптимизатор всегда работает с переданной ему внешней коробкой. */
  const raw=[{piece:'S1',w:40,h:50,shape:true,priority:0},{piece:'S2',w:40,h:50,shape:true,priority:0}]
   .concat([1,2,3,4,5,6,7,8].map(i=>({piece:'R'+i,w:38,h:18,shape:false,priority:0})));
  const strips=CUT_STRATEGIES.map(st=>{const r=cutPack(raw,stock,pf,st,[],g.mm);return r?bad(r.sheets).length:-1;});
  const cols=cutPackColumns(raw,stock,pf,[],{rows:false,orient:'asis',fit:'ffd'});
  return {shapes:shaped.length,padOk,flat,planBad:bad(g.sheets),strips,colsBad:cols?bad(cols.sheets):[-1],
   overlap:ctOverlap(plan)};
 }),{shapes:3,padOk:true,flat:true,planBad:[],strips:[0,0,0,0],colsBad:[],overlap:[]});
 eq('форма на листе: контур реза внутри заготовки, Safety border занимает место, поворот контур не ломает; прямоугольник остаётся прямоугольником',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);const id=ctOrder([[48.125,79,3]]);
  /* Трапеция владельца: скошенный верх, короткая сторона слева. */
  const o=salesRecord(id),l=o.lines[0],sh=newShapeDef('raked');
  sh.w='48.125';sh.h='79';Object.assign(sh.params,{shortHeight:'62',rakeSide:'top',shortSide:'left'});
  sh.ownerLineId=l.id;DB.shapeDef.push(sh);l.shapeRef=salesShapeRefFrom(sh);
  const b=DB.glassBatch[0],pieces=cutPieces(b,{}),one=pieces[0];
  const xs=one.pts.map(p=>p[0]),ys=one.pts.map(p=>p[1]);
  const box=[cutRound(Math.max(...xs)-Math.min(...xs)),cutRound(Math.max(...ys)-Math.min(...ys))];
  const poly=pp=>{let a=0;for(let i=0;i<pp.length;i++){const q=pp[i],r=pp[(i+1)%pp.length];a+=q[0]*r[1]-r[0]*q[1];}return Math.abs(a)/2;};
  const plan=cutPlanRun(b.number).plan,g=plan.groups[0],sheet=g.sheets[0];
  const d=document.createElement('div');d.innerHTML=cutSheetSVG(g,sheet,520,pieces,{ids:true});
  const gs=[...d.querySelectorAll('g')].filter(x=>x.querySelector('polygon.cut-glass'));
  /* Контур каждого стекла лежит в своей заготовке и занимает её целиком. */
  const inside=gs.every(x=>{
   const r=x.querySelector('rect.cut-blank'),pg=x.querySelector('polygon.cut-glass');
   if(!r||!pg)return false;
   const pts=pg.getAttribute('points').split(' ').map(q=>q.split(',').map(Number));
   const rx=+r.getAttribute('x'),ry=+r.getAttribute('y'),rw=+r.getAttribute('width'),rh=+r.getAttribute('height');
   const fit=(v,lo,hi)=>v>=lo-0.2&&v<=hi+0.2;
   return pts.every(q=>fit(q[0],rx,rx+rw)&&fit(q[1],ry,ry+rh));
  });
  /* Safety border — это место на листе: заготовка выше контура на бордер,
     и белое поле у скоса видно, как у Perfect Cut. */
  const margin=gs.every(x=>{
   const r=x.querySelector('rect.cut-blank'),pg=x.querySelector('polygon.cut-glass');
   const pts=pg.getAttribute('points').split(' ').map(q=>q.split(',').map(Number));
   const ry=+r.getAttribute('y'),rh=+r.getAttribute('height'),rx=+r.getAttribute('x'),rw=+r.getAttribute('width');
   const dy=Math.min(...pts.map(q=>q[1]))-ry+(ry+rh)-Math.max(...pts.map(q=>q[1]));
   const dx=Math.min(...pts.map(q=>q[0]))-rx+(rx+rw)-Math.max(...pts.map(q=>q[0]));
   return dx+dy>0.5;
  });
  /* Прямоугольное стекло рисуется как раньше. */
  oqReset();DB.glassSheet=[];ctSheet('6CLEAR',102,144);ctOrder([[46,60,2]]);const b2=DB.glassBatch[0];
  const p2=cutPlanRun(b2.number).plan,g2=p2.groups[0];
  const flat=cutPieces(b2,{});
  const d2=document.createElement('div');d2.innerHTML=cutSheetSVG(g2,g2.sheets[0],520,flat,{ids:true});
  /* У прямоугольника полей формы нет вовсе: укладчик копирует стекло на
     каждый из сотен вариантов, и лишние поля стоили 60 % времени Build. */
  const lean=flat.every(x=>!('pts' in x)&&!('holes' in x)&&!('cutouts' in x));
  return {lean,margin,shape:one.shape,n:one.pts.length,box,blank:[one.w,one.h],
   less:poly(one.pts)<one.w*one.h-100,polys:d.querySelectorAll('polygon.cut-glass').length,
   blanks:d.querySelectorAll('rect.cut-blank').length,rects:d.querySelectorAll('rect.cut-glass').length,
   turned:sheet.pieces.some(p=>p.rot),inside,
   plainPoly:d2.querySelectorAll('polygon.cut-glass').length,plainRect:d2.querySelectorAll('rect.cut-glass').length};
 }),{lean:true,margin:true,shape:true,n:4,box:[48.125,79],blank:[48.125,80],less:true,polys:3,blanks:3,rects:0,turned:true,inside:true,plainPoly:0,plainRect:2});

 eq('размеры пустого места: кусок от 4 ft² подписан, мелкий — только по наведению; годный остаток не задваивается; переворот реза пересчитывает остатки',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',102,144);ctOrder([[46,60,6],[28,38,8]]);const b=DB.glassBatch[0];
  const plan=cutPlanRun(b.number).plan,g=plan.groups[0];
  const rows=[];
  g.sheets.forEach(s=>{
   const size=s.size||g.sheet,pr=cutGroupParams(g,size),cuts=cutSheetCuts(s,size,pr,s.flip,true);
   const d=document.createElement('div');d.innerHTML=cutSheetSVG(g,s,520,cutPieces(b,{}),{ids:true});
   const free=[...d.querySelectorAll('[data-cut-free]')],off=d.querySelectorAll('[data-cut-offcut]').length;
   /* Каждый пустой кусок дерева резов показан ровно один раз. */
   rows.push({leaves:(cuts.free||[]).filter(r=>r.x1-r.x0>1e-6&&r.y1-r.y0>1e-6).length,shown:free.length+off,
    titled:free.every(x=>/^Free · .+ · [\d.]+ ft²$/.test(x.querySelector('title').textContent))});
  });
  const okShown=rows.every(r=>r.leaves===r.shown),titled=rows.every(r=>r.titled);
  /* Подпись только у крупных. */
  const s0=g.sheets[0],size0=s0.size||g.sheet,pr0=cutGroupParams(g,size0);
  const d0=document.createElement('div');d0.innerHTML=cutSheetSVG(g,s0,520,cutPieces(b,{}),{ids:true});
  const texts=[...d0.querySelectorAll('text')].map(x=>x.textContent);
  const big=(cutSheetCuts(s0,size0,pr0,s0.flip).free||[]).filter(r=>cutArea(r.x1-r.x0,r.y1-r.y0)>=4)
   .filter(r=>!(s0.offcuts||[]).some(q=>Math.abs(q.x-cutRound(r.x0))<1e-6&&Math.abs(q.y-cutRound(r.y0))<1e-6));
  const labelled=big.every(r=>texts.some(t=>t.indexOf(frac16(cutRound(r.x1-r.x0))+' × '+frac16(cutRound(r.y1-r.y0))+'″')>=0));
  /* Переворот реза пересчитывает подсказки остатков. */
  const line=cutSheetCutsFor(g,s0).lines.find(x=>x.level===1);
  const was=JSON.stringify((cutPlanFor(b.number).groups[0].sheets[0].offcuts||[]).map(o=>[o.w,o.h]));
  const flip=cutFlipCut(b.number,g.glass,s0.no,line.key);
  const now=JSON.stringify((cutPlanFor(b.number).groups[0].sheets[0].offcuts||[]).map(o=>[o.w,o.h]));
  return {okShown,titled,labelled,flip:!!flip.ok,fresh:was!==now||!JSON.parse(was).length};
 }),{okShown:true,titled:true,labelled:true,flip:true,fresh:true});

 eq('снятая последняя галочка размера не запирает экран: таблица размеров остаётся, лишний размер удаляется отсюда же',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[40,50,2]]);const b=DB.glassBatch[0];
  cutPlanRun(b.number);cutPlanReset(b.number);
  /* Лишний размер цеха — как у владельца от опечатки. */
  cutShopSizeAdd('222','22');
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:b.number,glass:'6CLEAR',sheet:1,sel:'',drag:'',sort:null};render();
  const rowsOf=()=>[...document.querySelectorAll('[data-cut-stock]')].map(x=>x.dataset.cutStock);
  const before=rowsOf().length;
  /* Снимаем галочку с единственного отмеченного размера. */
  const on=[...document.querySelectorAll('[data-cut-stock]')].filter(x=>x.querySelector('[data-cut-use]').checked).map(x=>x.dataset.cutStock);
  on.forEach(k=>cutUiStock('6CLEAR',k,'off',true));render();
  const after=rowsOf(),trapped=!after.length,need=!!document.querySelector('[data-cut-need]');
  /* Галочку можно поставить обратно, и Build снова работает. */
  const box=document.querySelector('[data-cut-stock="'+on[0]+'"] [data-cut-use]');
  if(box)cutUiStock('6CLEAR',on[0],'off',false);
  const built=cutPlanRun(b.number),sheets=built.plan?built.plan.groups[0].sheets.length:0;
  /* Удалить лишний размер прямо отсюда. */
  cutPlanReset(b.number);render();
  const drop=document.querySelector('[data-cut-size-drop="222x22"]');
  const gone=drop?(cutShopSizeRemove('222x22'),render(),!document.querySelector('[data-cut-stock="222x22"]')):false;
  /* У размера, на котором лежат листы, кнопки удаления нет. */
  cutPlanRun(b.number);render();
  const used=document.querySelector('[data-cut-stock="130x96"] [data-cut-size-drop]');
  return {before:before>1,trapped,kept:after.length>1,need,sheets,hasDrop:!!drop,gone,noDropWhenUsed:!used};
 }),{before:true,trapped:false,kept:true,need:true,sheets:1,hasDrop:true,gone:true,noDropWhenUsed:true});

 eq('список стёкол: столбики сортируются кликом, приоритет не уводит экран в начало',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[46,60,2],[20,24,3]]);const b=DB.glassBatch[0];
  cutPlanRun(b.number);cutPlanReset(b.number);
  glassBatchOpen(b.number);glassBatchDetailTab='optimization';cutUi={batch:b.number,glass:'6CLEAR',sheet:1,sel:'',drag:'',sort:null};render();
  const ids=()=>[...document.querySelectorAll('[data-cut-list]')].map(x=>x.dataset.cutList);
  const sizes=()=>[...document.querySelectorAll('[data-cut-list]')].map(x=>x.children[2].textContent.trim());
  const plain=ids();
  cutUiSort('size');const asc=sizes();
  cutUiSort('size');const desc=sizes();
  cutUiSort('size');const off=ids();
  /* Приоритет: фокус остаётся в том же поле того же стекла. */
  cutUiSort('piece');
  const target=ids()[1],inp=document.querySelector('[data-cut-list="'+target+'"] [data-cut-priority]');
  inp.focus();inp.value='3';
  cutUiSet(target,'priority','3');
  const now=document.activeElement,stay=!!now&&!!now.closest('[data-cut-list="'+target+'"]')&&now.matches('[data-cut-priority]');
  const saved=cutPieces(glassBatchFind(b.number),cutPlanFor(b.number).settings||{}).find(p=>p.piece===target).priority;
  return {n:plain.length,sortedUp:asc[0]===asc.slice().sort()[0],reversed:desc[0]===asc[asc.length-1],back:off.join()===plain.join(),stay,saved};
 }),{n:5,sortedUp:true,reversed:true,back:true,stay:true,saved:3});

 eq('список без поиска: выбранное стекло за пределами первых 200 всё равно видно',await t.p.evaluate(()=>{
  cutUi={batch:'test',glass:'',sheet:1,sel:'G-0000220',drag:'',sort:null};
  const list=Array.from({length:220},(_,i)=>({piece:'G-'+String(i+1).padStart(7,'0'),w:20,h:30,order:'76002',orderId:'o',line:1,customer:'1'}));
  const ctx={waiting:[],onSheet:list,off:[],at:new Map(),sel:cutUi.sel,lock:false,sort:x=>x,table:body=>'<table><tbody>'+body+'</tbody></table>'};
  const host=document.createElement('div');host.innerHTML=cutListHTML(ctx);
  return {rows:host.querySelectorAll('[data-cut-list]').length,selected:!!host.querySelector('[data-cut-list="G-0000220"].on'),more:!!host.querySelector('[data-cut-list-more]'),search:!!host.querySelector('[data-cut-search]')};
 }),{rows:200,selected:true,more:true,search:false});

 eq('на стекле нет дублирующего размера: ширина и высота подписаны по осям',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[40,50,1]]);
  const b=DB.glassBatch[0],plan=cutPlanRun(b.number).plan,g=plan.groups[0],s=g.sheets[0],host=document.createElement('div');
  host.innerHTML=cutSheetSVG(g,s,520,cutPieces(b,{}),{ids:true});
  const pc=host.querySelector('[data-cut-piece]'),texts=[...pc.querySelectorAll('text')].map(x=>x.textContent);
  return {both:texts.some(x=>x.includes('×')),width:texts.includes('40″'),height:texts.includes('50″')};
 }),{both:false,width:true,height:true});

 eq('нережущийся лист объясняет минимальную полоску и ограничение переборки',await t.p.evaluate(()=>{
  const issue=cutCutIssue({stuck:[{reason:'minDist',width:.3125,required:1}]}),other=cutCutIssue({stuck:[{x0:0,y0:0,x1:1,y1:1}]});
  return {thin:issue.includes('5/16″')&&issue.includes('1″'),other:other.includes('straight-through')};
 }),{thin:true,other:true});

 eq('машинный снимок: только готовый рез, без пустого листа; раскрой не меняется',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[40,50,2]]);
  const b=DB.glassBatch[0],plan=cutPlanRun(b.number).plan,g=plan.groups[0],before=JSON.stringify(plan);
  const job=cutMachineSnapshot(b.number),after=JSON.stringify(plan);
  const added=cutSheetAdd(b.number,g.glass,g.sheets[0].no),withEmpty=cutMachineSnapshot(b.number);
  return {valid:job.valid,errors:job.errors,pieces:job.sheets.flatMap(s=>s.pieces).length,
   cuts:job.sheets.some(s=>s.throughCuts.length>0),unchanged:before===after,
   emptyAdded:!!added.ok,emptySkipped:withEmpty.valid&&withEmpty.sheets.length===job.sheets.length};
 }),{valid:true,errors:[],pieces:2,cuts:true,unchanged:true,emptyAdded:true,emptySkipped:true});

 eq('машинный снимок отвергает устаревший план и пропавшую деталь',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[40,50,2]]);
  const b=DB.glassBatch[0],plan=cutPlanRun(b.number).plan,stamp=plan.stamp;
  plan.stamp='old';const stale=cutMachineSnapshot(b.number);plan.stamp=stamp;
  const lost=plan.groups[0].sheets[0].pieces.pop(),missing=cutMachineSnapshot(b.number);
  return {stale:!stale.valid&&stale.errors.some(x=>x.includes('changed after Build')),
   missing:!missing.valid&&missing.errors.some(x=>x.includes(lost.piece+' is not on any sheet'))};
 }),{stale:true,missing:true});

 eq('машинный снимок не пропускает пересечение и выход детали за лист',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);ctOrder([[40,50,2]]);
  const b=DB.glassBatch[0],plan=cutPlanRun(b.number).plan,s=plan.groups[0].sheets[0],a=s.pieces[0],p=s.pieces[1],old={x:p.x,y:p.y};
  p.x=a.x;p.y=a.y;const overlap=cutMachineSnapshot(b.number);
  p.x=s.size.w;p.y=old.y;const outside=cutMachineSnapshot(b.number);
  p.x=old.x;p.y=old.y;
  return {overlap:!overlap.valid&&overlap.errors.some(x=>x.includes('overlapping occupants')),
   outside:!outside.valid&&outside.errors.some(x=>x.includes('outside the usable area'))};
 }),{overlap:true,outside:true});

 eq('машинный снимок формы: поворот 180° сохраняет настоящий контур, без отверстий и вырезов',await t.p.evaluate(()=>{
  oqReset();DB.glassSheet=[];DB.cutting=cutSettingsDefault();ctSheet('6CLEAR',96,130);const id=ctOrder([[40,50,1]]);
  const o=salesRecord(id),l=o.lines[0],shape=newShapeDef('raked');shape.w='40';shape.h='50';
  Object.assign(shape.params,{shortHeight:'44',rakeSide:'top',shortSide:'right'});
  shape.ownerLineId=l.id;DB.shapeDef.push(shape);l.shapeRef=salesShapeRefFrom(shape);
  const b=DB.glassBatch[0],plan=cutPlanRun(b.number).plan,p=plan.groups[0].sheets[0].pieces[0],src=cutPieces(b,{})[0];
  p.turn=2;p.rot=false;const job=cutMachineSnapshot(b.number),part=job.sheets[0].pieces[0];
  const q=src.pts[0],first=[p.x+p.w-q[0],p.y+p.h-q[1]];
  const area=Math.abs(part.contour.reduce((a,c,i)=>{const n=part.contour[(i+1)%part.contour.length];return a+c[0]*n[1]-n[0]*c[1];},0))/2;
  return {valid:job.valid,turn:part.turn,shape:part.shape,firstOk:part.contour[0].every((v,i)=>Math.abs(v-first[i])<1e-6),
   shaped:area<part.footprint.w*part.footprint.h-1,
   noMachining:!('holes' in part)&&!('cutouts' in part)};
 }),{valid:true,turn:2,shape:true,firstOk:true,shaped:true,noMachining:true});

 eq('раскрой без ошибок страницы',t.errs,[]);await t.c.close();
};
