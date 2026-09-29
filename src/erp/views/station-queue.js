/* =====================================================================
   view/station-queue  ·  station-queue-1.0
   Очередь станций после резки. Владелец, 29.09.2026: «только CUT знает,
   что его ждёт, другие ничего не знают». Вкладка Queue на каждой станции:
   что уже здесь и что едет — где оно сейчас, какие батчи CUT его везут.
   Порядок, как и на CUT, — совет: Critical, потом срок; решает оператор.
   Своё у станций:
   - закалка — загрузки печи: «закалку запускают по толщине стекла —
     программы разные между толщиной и типом стекла, ну и типом закалки»
     (владелец, 29.09.2026) — группа = толщина · стекло · закалка, штуки и
     кв. футы здесь и в пути;
   - IGU — юниты: все лайты здесь — «готово к сборке», один здесь, другой
     в пути — где он; вынутые на долли — «ждут пару»;
   - остальные — сводка по работам станции (Rough arris, Flat polish…).
   IN : stationWaiting · stationRouteOf · glassBatchCutQueue · stkGlassInfo
   OUT: html
   ===================================================================== */
function stationHeatCode(){return typeof salesRouteStationOf==='function'?salesRouteStationOf('tempering',salesRouteStationOf('heat_soak','HEAT')):'HEAT';}
/* Площадь стекла — кв. футы готового размера; один раз на позицию и версию заказа. */
let stationAreaCache=new Map();
function stationSqft(g){
 const k=g.o.id+'|'+g.l.id+'|'+(g.o.updatedAt||'');
 if(!stationAreaCache.has(k)){let a=null;try{a=finWithOrder(g.o,()=>stkPieceArea(g.l,g.o));}catch(e){}stationAreaCache.set(k,Number.isFinite(+a)&&+a>0?+a:(+g.l.width16||0)*(+g.l.height16||0)/256/144);}
 return stationAreaCache.get(k);
}
/* Что здесь и что едет на станцию S (стекло, в маршруте которого S впереди). */
function stationFlowData(S){
 const w=stationWaiting(),here=w.get(S)||[],coming=[];
 w.forEach((list,at)=>{if(at===S)return;list.forEach(x=>{const r=x.place.route,iA=x.place.far+1;if(r.indexOf(S,iA+1)>iA)coming.push(Object.assign({at},x));});});
 return {here,coming};
}
function stationWorksAt(g,S){return (stationRouteOf(g).services||[]).filter(s=>s.station===S).map(s=>s.text);}
function stationFmtSqft(v){return v>=100?String(Math.round(v)):v.toFixed(1).replace(/\.0$/,'');}
function stationPlural(n,one,many){return n+' '+(n===1?one:many);}
function stationUrgPill(o){const u=stationUrgency(o);return u?' <span class="pill '+(u===2?'bad':'warn')+'">'+(u===2?'Critical':'Rush')+'</span>':'';}

/* Поток: откуда едет — станции по порядку цеха, резка разделена на «на
   столе» (батч начат) и «в следующих батчах». */
function stationFlowTiles(S,d){
 const cut=stationCutCode(),byAt=new Map();
 d.coming.forEach(x=>{let k=x.at;if(x.at===cut)k=x.g.entry&&x.g.entry.batch.items.some(i=>i.cutStartedAt&&!i.releasedAt)?'CUT:table':'CUT:next';byAt.set(k,(byAt.get(k)||0)+1);});
 const seq=c=>{const s=(DB.station||[]).find(x=>x.code===c);return s?s.seq:99;};
 const keys=[...byAt.keys()].sort((a,b)=>(seq(a.split(':')[0])-seq(b.split(':')[0]))||(a==='CUT:next'?-1:1));
 const label=k=>k==='CUT:next'?'NEXT BATCHES':k==='CUT:table'?'ON THE CUT TABLE':'AT '+k;
 const tiles=keys.map(k=>'<div class="st-fb" data-flow-at="'+esc(k)+'"><small>'+esc(label(k))+'</small><b>'+byAt.get(k)+'</b></div><div class="st-fa">›</div>').join('');
 return '<div class="card"><div class="st-sec"><h3>Flow to '+esc(S)+'</h3><span class="mut">glass</span></div><div class="st-flow">'+tiles+
  '<div class="st-fb here" data-flow-at="here"><small>HERE NOW</small><b>'+d.here.length+'</b><span>'+stationPlural([...new Set(d.here.map(x=>x.last&&x.last.on).filter(Boolean))].length,'dolly','dollies')+'</span></div></div></div>';
}
/* Здесь сейчас: заказ → позиция → стекло, работа станции, тара, срок. */
function stationFlowHere(S,d){
 const groups=new Map();
 d.here.forEach(x=>{const g=x.g,k=g.o.id+'|'+g.l.id+'|'+(g.c?g.c.key:'');
  if(!groups.has(k))groups.set(k,{g,n:0,on:new Set(),li:(g.o.lines||[]).indexOf(g.l)+1});const G=groups.get(k);G.n++;if(x.last&&x.last.on)G.on.add(x.last.on);});
 const rows=[...groups.values()].sort((a,b)=>stationUrgency(b.g.o)-stationUrgency(a.g.o)||String(a.g.o.dueDate||'9').localeCompare(String(b.g.o.dueDate||'9'))||String(a.g.o.businessNumber).localeCompare(String(b.g.o.businessNumber))||a.li-b.li).slice(0,60);
 return '<div class="card"><div class="st-sec"><h3>Here now</h3><span class="pill info">'+d.here.length+' glass</span><span class="sp"></span><span class="mut">Critical first, then due</span></div>'+
  (rows.length?'<table data-flow-here><thead><tr><th>Order</th><th>Line</th><th>Glass</th><th>Work</th><th class="n">Pcs</th><th>On</th><th>Due</th></tr></thead><tbody>'+rows.map(x=>{const o=x.g.o,l=x.g.l;
   return '<tr'+(stationUrgency(o)===2?' class="st-hot"':'')+'><td><b>'+esc(o.businessNumber||'')+'</b>'+stationUrgPill(o)+'</td><td>Line '+x.li+' · <b>'+esc(frac16(l.width16/16)+' × '+frac16(l.height16/16))+'</b></td><td data-raw>'+esc(x.g.c?x.g.c.glass:'')+'</td><td>'+esc(stationWorksAt(x.g,S).join(', '))+'</td><td class="n"><b>'+x.n+'</b></td><td>'+[...x.on].map(c=>'<b class="st-on">'+esc(c)+'</b>').join(' ')+'</td><td class="mut">'+esc(o.dueDate?salesListShortDay(o.dueDate):'')+'</td></tr>';}).join('')+'</tbody></table>':'<div class="empty">Nothing here yet</div>')+'</div>';
}
/* Работы станции: сколько здесь и сколько едет. */
function stationFlowWorks(S,d){
 const m=new Map(),add=(x,col)=>stationWorksAt(x.g,S).forEach(t=>{if(!m.has(t))m.set(t,{t,here:0,coming:0});m.get(t)[col]++;});
 d.here.forEach(x=>add(x,'here'));d.coming.forEach(x=>add(x,'coming'));
 if(!m.size)return '';
 return '<div class="card"><div class="st-sec"><h3>By work</h3><span class="mut">here · coming</span></div><table data-flow-works><thead><tr><th>Work</th><th class="n">Here</th><th class="n">Coming</th></tr></thead><tbody>'+
  [...m.values()].sort((a,b)=>b.here-a.here||b.coming-a.coming).map(r=>'<tr><td><b>'+esc(r.t)+'</b></td><td class="n st-qbig">'+r.here+'</td><td class="n">'+r.coming+'</td></tr>').join('')+'</tbody></table></div>';
}
/* Закалка: загрузка печи — толщина · стекло · тип закалки. */
function stationFlowLoads(S,d){
 const m=new Map(),add=(x,col)=>{
  const g=x.g;if(!g.c||g.c.missing)return;const gi=stkGlassInfo(g.c.pane,g.c.index,g.c.ply),k=(gi.mm||0)+'|'+(gi.code||g.c.glass)+'|'+(gi.heat||'')+'|'+(gi.heatSoak?1:0);
  if(!m.has(k))m.set(k,{mm:gi.mm||0,code:gi.code||g.c.glass,heat:gi.heat||'',soak:gi.heatSoak,here:0,hereFt:0,coming:0,comingFt:0,urg:0,at:new Map()});
  const r=m.get(k),ft=stationSqft(g);r[col]++;r[col+'Ft']+=ft;r.urg=Math.max(r.urg,stationUrgency(g.o));if(col==='coming')r.at.set(x.at,(r.at.get(x.at)||0)+1);
 };
 d.here.forEach(x=>add(x,'here'));d.coming.forEach(x=>add(x,'coming'));
 if(!m.size)return '';
 const rows=[...m.values()].sort((a,b)=>a.mm-b.mm||a.code.localeCompare(b.code)||a.heat.localeCompare(b.heat)),max=Math.max(1,...rows.map(r=>r.hereFt+r.comingFt));
 let mm=null;
 return '<div class="card"><div class="st-sec"><h3>Furnace loads</h3><span class="mut">thickness · glass · treatment — one program each</span></div><table class="st-loads" data-flow-loads><thead><tr><th>Load</th><th class="n">Here</th><th class="n">Coming</th><th style="width:30%"></th></tr></thead><tbody>'+
  rows.map(r=>{const head=r.mm!==mm?'<tr class="st-load-mm"><td colspan="4">'+(r.mm?r.mm+' mm':'—')+'</td></tr>':'';mm=r.mm;
   const from=[...r.at.entries()].map(([a,n])=>a+' '+n).join(' · ');
   return head+'<tr'+(r.urg===2?' class="st-hot"':'')+' data-load="'+esc(r.code+' · '+(r.heat||'—'))+'"><td><b data-raw>'+esc(r.code)+'</b> · '+esc(r.heat||'—')+(r.soak?' · Heat soak':'')+(r.urg===2?' <span class="pill bad">Critical</span>':'')+'</td>'+
    '<td class="n st-nw"><b>'+stationFmtSqft(r.hereFt)+'</b> sq ft<div class="mut">'+r.here+' pcs</div></td><td class="n st-nw">'+stationFmtSqft(r.comingFt)+' sq ft<div class="mut">'+r.coming+' pcs'+(from?' · '+esc(from):'')+'</div></td>'+
    '<td><div class="st-lbar"><i style="width:'+(r.hereFt/max*100).toFixed(1)+'%"></i><i class="c" style="width:'+(r.comingFt/max*100).toFixed(1)+'%"></i></div></td></tr>';}).join('')+'</tbody></table></div>';
}
/* IGU: сколько юнитов можно собрать сейчас и каким не хватает лайта. */
function stationFlowUnits(S,d){
 const inAsm=new Set();(DB.stationScan||[]).forEach(s=>{if(!s.undoneAt&&s.asm&&s.station===S)inAsm.add(s.piece);});
 const lines=new Map(),line=g=>{const k=g.o.id+'|'+g.l.id;if(!lines.has(k))lines.set(k,{g,comps:glassBatchComponents(g.o,g.l).filter(c=>!c.missing),here:new Map(),coming:new Map()});return lines.get(k);};
 d.here.forEach(x=>{if(inAsm.has(x.id)||!x.g.c||stationUnitMerge(x.g.o,x.g.l)!==S)return;const L=line(x.g);L.here.set(x.g.c.key,(L.here.get(x.g.c.key)||0)+1);});
 d.coming.forEach(x=>{if(!x.g.c||stationUnitMerge(x.g.o,x.g.l)!==S)return;const L=line(x.g);if(!L.coming.has(x.g.c.key))L.coming.set(x.g.c.key,new Map());const c=L.coming.get(x.g.c.key);c.set(x.at,(c.get(x.at)||0)+1);});
 const ready=[],partial=[];
 lines.forEach(L=>{
  if(!L.here.size||L.comps.length<2)return;
  const n=Math.min(...L.comps.map(c=>L.here.get(c.key)||0)),top=Math.max(...L.comps.map(c=>L.here.get(c.key)||0));
  if(n)ready.push({L,n});
  if(top>n)partial.push({L,n:top-n,has:L.comps.filter(c=>(L.here.get(c.key)||0)>n),miss:L.comps.filter(c=>(L.here.get(c.key)||0)<top)});
 });
 const sort=(a,b)=>stationUrgency(b.L.g.o)-stationUrgency(a.L.g.o)||String(a.L.g.o.dueDate||'9').localeCompare(String(b.L.g.o.dueDate||'9'));
 const lineTd=L=>{const o=L.g.o,l=L.g.l;return '<td><b>'+esc(o.businessNumber||'')+'</b>'+stationUrgPill(o)+'</td><td>Line '+((o.lines||[]).indexOf(l)+1)+' · <b>'+esc(frac16(l.width16/16)+' × '+frac16(l.height16/16))+'</b></td>';};
 const where=(L,c)=>{const m=L.coming.get(c.key);return m&&m.size?[...m.entries()].map(([a,n])=>'<b>'+esc(a)+'</b> '+n).join(' · '):'<span class="mut">not in production</span>';};
 return '<div class="card"><div class="st-sec"><h3>Ready to assemble</h3><span class="pill ok">'+stationPlural(ready.reduce((s,x)=>s+x.n,0),'unit','units')+'</span><span class="sp"></span><span class="mut">all lites here</span></div>'+
  (ready.length?'<table data-flow-ready><thead><tr><th>Order</th><th>Line</th><th>Makeup</th><th class="n">Units</th><th>Due</th></tr></thead><tbody>'+ready.sort(sort).map(x=>'<tr'+(stationUrgency(x.L.g.o)===2?' class="st-hot"':'')+'>'+lineTd(x.L)+'<td data-raw>'+esc(x.L.comps.map(c=>c.glass).join(' / '))+'</td><td class="n st-qbig">'+x.n+'</td><td class="mut">'+esc(x.L.g.o.dueDate?salesListShortDay(x.L.g.o.dueDate):'')+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">No full sets here yet</div>')+'</div>'+
  (partial.length?'<div class="card"><div class="st-sec"><h3>Waiting for a lite</h3><span class="pill warn">'+stationPlural(partial.reduce((s,x)=>s+x.n,0),'unit','units')+'</span><span class="sp"></span><span class="mut">one lite here, the other on its way</span></div><table data-flow-partial><thead><tr><th>Order</th><th>Line</th><th>Here</th><th>Missing — now at</th><th class="n">Units</th></tr></thead><tbody>'+
   partial.sort(sort).map(x=>'<tr>'+lineTd(x.L)+'<td data-raw>'+x.has.map(c=>'Lite '+esc(c.lite)+' · '+esc(c.glass)).join(', ')+'</td><td data-raw>'+x.miss.map(c=>'Lite '+esc(c.lite)+' · '+esc(c.glass)+' — '+where(x.L,c)).join('<br>')+'</td><td class="n"><b>'+x.n+'</b></td></tr>').join('')+'</tbody></table></div>':'');
}
/* Батчи CUT, которые везут стекло на эту станцию, — в порядке офиса. */
function stationFlowBatches(S,d){
 const cut=stationCutCode(),by=new Map();
 d.coming.forEach(x=>{if(x.at!==cut||!x.g.entry)return;const b=x.g.entry.batch;by.set(b.number,(by.get(b.number)||0)+1);});
 const q=glassBatchCutQueue().filter(b=>by.has(b.number));if(!q.length)return '';
 return '<div class="card"><div class="st-sec"><h3>Coming from CUT</h3><span class="mut">batches in the suggested order</span></div><table data-flow-batches><thead><tr><th>Batch</th><th>Glass</th><th class="n">For '+esc(S)+'</th></tr></thead><tbody>'+
  q.map(b=>{const live=b.items.filter(i=>!i.releasedAt),started=live.some(i=>i.cutStartedAt),glass=[...new Set(live.map(i=>{const p=b.parts[i.part];return p&&p.snapshot?p.snapshot.glass:'';}).filter(Boolean))];
   const orders=[...new Set(live.map(i=>b.parts[i.part]&&b.parts[i.part].orderId))].map(salesRecord).filter(Boolean),urg=Math.max(0,...orders.map(stationUrgency));
   return '<tr><td><b class="mono">'+esc(b.number)+'</b>'+(started?' <span class="pill ok">cutting now</span>':'')+(urg===2?' <span class="pill bad">Critical</span>':'')+'</td><td data-raw>'+esc(glass.join(', '))+'</td><td class="n"><b>'+by.get(b.number)+'</b></td></tr>';}).join('')+'</tbody></table></div>';
}
function stationFlowView(){
 const S=stationCode,d=stationFlowData(S),merge=stationMergeCodes().includes(S)&&S!==salesRouteStationOf('lamination','LAM');
 const right=(S===stationHeatCode()?stationFlowLoads(S,d):merge?'':stationFlowWorks(S,d))+(merge?stationPairsCard():'')+stationFlowBatches(S,d);
 return '<div class="st-body st-queue" data-station-flow="'+esc(S)+'"><div class="st-col">'+stationFlowTiles(S,d)+(merge?stationFlowUnits(S,d):'')+stationFlowHere(S,d)+'</div><div class="st-col">'+right+'</div></div>';
}
