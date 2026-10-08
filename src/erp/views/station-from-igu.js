/* =====================================================================
   erp/views/station-from-igu  ·  7 октября 2026
   Shipping ready у IGU: лист всего, что собрал IGU, и что из этого
   отсканировал Shipping ready. Владелец, 7.10.2026:
   - спейсер (Андрей) и силикон со скидами (Олег) — в 50 метрах; Андрей
     сканирует только лайты, Олег — стикер каждого юнита и скид, он и есть
     Shipping ready для IGU;
   - «ему лист нужен, который подсвечивает, что он не отсканировал»;
   - «один заказ может быть на множестве скидов… на скиде до 20–25 юнитов»;
   - перевести заказ на другой скид — по имени клиента, руками.
   Пропущен (красным) — юнит собран раньше того, что Олег уже отсканировал:
   линия юниты не обгоняет. Собранные позже — «in line», ещё едут. Без
   скида (жёлтым) — отсканирован, но скид не указан: работа не стоит,
   просто видно. Микс и заказ на нескольких скидах — норма, не ошибка.
   Сушку система не считает (владелец: «не учитывай… бывают разные
   ситуации»).
   ===================================================================== */
let stationIguSel=new Set();   // «No skid» заказа, выбранное для переноса: n|заказ
let stationIguOpen='';         // пропущенный юнит, раскрытый нажатием
const STATION_IGU_ORDERS=25,STATION_IGU_ROWS=12;
function stationIguCode(){return typeof salesRouteStationOf==='function'?salesRouteStationOf('igu_assembly','IGU'):'IGU';}
/* Заказы с юнитами IGU, которые ещё не погружены; по каждому — скиды,
   без скида, пропущенные и в линии. */
function stationIguBoard(){
 const igu=stationIguCode(),st=shippingStations();if(!igu||!st.ready||!st.ship)return null;
 return shippingWithCtx(()=>{
  const ctx=shippingCtx(),ids=new Set(),lastOf=p=>{const l=ctx.scans.get(p);return l&&l[l.length-1];};
  ctx.asm.forEach((list,k)=>{if(list.some(s=>s.station===igu&&s.unit&&!ctx.broken.has(s.piece)&&(lastOf(s.piece)||{}).station!==st.ship))ids.add(k.split('|')[0]);});
  const mix=new Map();carrierContents().forEach((list,code)=>mix.set(code,new Set(list.map(x=>x.g.o.customerId)).size>1));
  let edge='';const orders=[];
  ids.forEach(id=>{
   const o=salesRecord(id);if(!o)return;
   const igus=(o.lines||[]).filter(l=>stationUnitMerge(o,l)===igu);if(!igus.length)return;
   const r={o,total:igus.reduce((n,l)=>n+shippingLineQty(l),0),done:0,skids:new Map(),noSkid:[],pending:[],lastAt:''};
   shippingUnits(o).forEach(u=>{
    const l=igus.find(x=>x.id===u.lineId);if(!l)return;
    const gs=u.pieces.map(p=>stationGlass(p,ctx.index,ctx.batches)),places=gs.map((g,i)=>g&&stationPlace(g,ctx.scans.get(u.pieces[i])||[]));
    const at=u.pieces.flatMap(p=>(ctx.scans.get(p)||[]).filter(s=>s.station===igu&&s.unit).map(s=>s.at)).sort().pop()||'';
    /* Размер — как на станции: у стекла Recut со своим чертежом — его (stationGeo, PR #234). */
    const x=Object.assign({},u,{l,at,geo:typeof stationGeo==='function'&&gs[0]?stationGeo(gs[0]):l});if(at>r.lastAt)r.lastAt=at;
    if(u.loaded||places.every(p=>p&&p.waiting===st.ship)){
     r.done++;if(at>edge)edge=at;if(u.loaded)return;
     if(u.skid){if(!r.skids.has(u.skid))r.skids.set(u.skid,[]);r.skids.get(u.skid).push(x);}else r.noSkid.push(x);
    }else if(places.every(p=>p&&!p.assembling&&p.waiting===st.ready))r.pending.push(x);
   });
   if(r.skids.size||r.noSkid.length||r.pending.length)orders.push(r);
  });
  orders.forEach(r=>{
   r.missed=r.pending.filter(x=>x.at<edge).sort((a,b)=>a.at.localeCompare(b.at));r.line=r.pending.filter(x=>x.at>=edge);
   r.mix=new Map([...r.skids.keys()].map(k=>[k,!!mix.get(k)]));
   r.rank=r.missed.length?0:r.noSkid.length?1:r.line.length?2:3;
  });
  orders.sort((a,b)=>a.rank-b.rank||b.lastAt.localeCompare(a.lastAt));
  return {orders,missed:orders.reduce((n,r)=>n+r.missed.length,0),noSkid:orders.reduce((n,r)=>n+r.noSkid.length,0)};
 });
}
function stationIguUnits(b,keys){return (b?b.orders:[]).flatMap(r=>keys.has('n|'+r.o.id)?r.noSkid:[]);}
function stationIguPick(key){if(stationIguSel.has(key))stationIguSel.delete(key);else stationIguSel.add(key);stationNote='';render();}
function stationIguClear(){stationIguSel.clear();stationNote='';render();}
/* Что выбрано и что сделать — пока выбрано, скан не проходит. Выбранное уже
   ушло со строки «No skid» (Mark ready, скан) — выбор снят, ответ пустой. */
function stationIguBlockNote(){
 const b=stationIguBoard(),orders=(b?b.orders:[]).filter(r=>stationIguSel.has('n|'+r.o.id)&&r.noSkid.length),n=stationIguUnits(b,stationIguSel).length;
 if(!n){stationIguSel.clear();return '';}
 return 'Selected in From '+stationIguCode()+': '+orders.map(r=>salesCustomerDisplay(r.o.customerId)).join(', ')+' · '+stationPlural(n,'unit','units')+' — tap a skid or Clear';
}
function stationIguToggle(piece){stationIguOpen=stationIguOpen===piece?'':piece;render();}
/* «No skid» — на скид: нажатием, номером или сканом скида. Undo — как у
   переноса в окне тары. Скид заказа нажатием открывает окно скида
   (stationSkidOpen) с этим заказом. */
function stationIguMove(to){
 const who=stationWho();if(!who||!stationIguSel.size)return false;
 const code=typeof carrierCode==='function'?carrierCode(to):'';
 if(!code||!carrierType(code)){stationNote='Scan the skid or type its number';stationBeep('error');render();return false;}
 const units=stationIguUnits(stationIguBoard(),stationIguSel),from=[...new Set(units.map(u=>u.skid||'No skid'))].join(', ');
 const r=carrierMove(units.flatMap(u=>u.pieces),code,who);
 if(r.error){stationNote=r.error;stationBeep('error');render();return false;}
 stationIguSel.clear();stationMenu=null;stationNote='';
 const ids=new Set(r.was.map(w=>w.id)),moved=new Set((DB.stationScan||[]).filter(s=>ids.has(s.id)).map(s=>s.piece));
 stationLast={check:{kind:'carrierMoved',code:r.to,from,count:units.filter(u=>u.pieces.some(p=>moved.has(p))).length,word:'unit',puton:false},move:r,rec:null,data:null,place:null,at:new Date().toISOString()};
 stationBeep('ok');render();return r;
}
function stationMovedWhat(c){return stationPlural(c.count,c.word||'glass',c.word?c.word+'s':'glass');}
function stationIguSize(g){return frac16(g.width16/16)+' × '+frac16(g.height16/16);}
function stationIguLabels(list){return list.slice(0,4).map(u=>u.label||u.pieces[0]).join(', ')+(list.length>4?' +'+(list.length-4):'');}
function stationIguOrder(r){
 const id=r.o.id,customer=salesCustomerDisplay(r.o.customerId);
 const chips=[...r.skids].map(([code,list])=>{
  return '<button type="button" class="st-igu-sk" data-igu-pick="'+esc(code)+'" onclick="stationSkidOpen(\''+esc(code)+'\',\''+esc(id)+'\')"><b>'+esc(code)+'</b> '+list.length+(r.mix.get(code)?' <i>mix</i>':'')+'</button>';}).join('');
 const head='<div class="st-igu-o'+(r.rank===3?' done':'')+'" data-igu-order="'+esc(r.o.businessNumber||'')+'"><span class="st-igu-who"><b>'+esc(r.o.businessNumber||'')+'</b> <span data-raw>'+esc(customer)+'</span></span>'+
  '<span class="st-igu-sks">'+chips+'</span><b class="st-igu-n">'+r.done+' / '+r.total+(r.done===r.total?' ✓':'')+'</b></div>';
 const missed=r.missed.slice(0,STATION_IGU_ROWS).map(u=>{const p=u.pieces[0],open=stationIguOpen===p;
  return '<div class="st-igu-r bad'+(open?' open':'')+'" data-igu-missed="'+esc(u.label||p)+'" onclick="stationIguToggle(\''+esc(p)+'\')"><span class="st-dchip st-igu-x">✕</span><span><b class="mono">'+esc(u.label||p)+'</b> · '+esc(stationIguSize(u.geo))+' · '+esc(stationTime(u.at))+'</span><span class="st-igu-tag">NOT SCANNED</span></div>'+
   (open?'<div class="st-igu-acts"><button type="button" class="b" data-igu-mark onclick="stationMark(\''+esc(p)+'\')">✓ Mark ready</button><button type="button" class="b" data-igu-print onclick="stationPrintUnit(\''+esc(p)+'\')">Print sticker</button><button type="button" class="b st-red-b" data-igu-broken onclick="stationOpenRecut(\''+esc(p)+'\')">Broken</button></div>':'');}).join('')+
  (r.missed.length>STATION_IGU_ROWS?'<div class="mut st-more">+'+(r.missed.length-STATION_IGU_ROWS)+' more not scanned</div>':'');
 const nk='n|'+id,noSkid=r.noSkid.length?'<div class="st-igu-r warn'+(stationIguSel.has(nk)?' sel':'')+'" data-igu-noskid onclick="stationIguPick(\''+esc(nk)+'\')"><span class="st-dchip none">No skid</span><span><b>'+r.noSkid.length+'</b> <span class="mono mut">'+esc(stationIguLabels(r.noSkid))+'</span></span><span class="st-igu-tag">NO SKID</span></div>':'';
 const line=r.line.length?'<div class="st-igu-r line" data-igu-line><span class="st-dchip none">In line</span><span><b>'+r.line.length+'</b> <span class="mono mut">'+esc(stationIguLabels(r.line))+'</span></span><span class="mut">coming</span></div>':'';
 return '<div class="st-igu-g">'+head+missed+noSkid+line+'</div>';
}
/* Куда переносить: скиды, загруженные на этой станции, и тот, на который
   кладут. */
function stationSkidTargets(except){
 const skids=[];carrierContents().forEach((list,code)=>{if(/^S[LA]-/.test(code)&&code!==except&&list.some(x=>x.scan.station===stationCode))skids.push(code);});
 const put=stationPutOn();if(put&&/^S[LA]-/.test(put)&&put!==except&&!skids.includes(put))skids.push(put);
 return skids.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).slice(0,8);
}
function stationIguFoot(b){
 if(!stationIguSel.size)return '';
 const n=stationIguUnits(b,stationIguSel).length;
 return '<div class="st-igu-foot" data-igu-foot><b>'+stationPlural(n,'unit','units')+'</b> →'+stationSkidTargets('').map(c=>'<button type="button" class="b sm" data-igu-to="'+esc(c)+'" onclick="stationIguMove(\''+esc(c)+'\')">'+esc(c)+'</button>').join('')+
  '<input class="st-mv-to" data-station-keep data-igu-to-input placeholder="SL-5" onkeydown="if(event.key===\'Enter\'){event.preventDefault();stationIguMove(this.value)}"><button type="button" class="b st-yes" onclick="stationIguMove(document.querySelector(\'[data-igu-to-input]\').value)">Move</button>'+
  '<button type="button" class="b" onclick="stationIguClear()">Clear</button></div>';
}
function stationIguCard(){
 if(!stationIsReady())return '';
 const b=stationIguBoard();if(!b||!b.orders.length)return '';
 const shown=b.orders.slice(0,STATION_IGU_ORDERS);
 return '<div class="card st-igu" data-station-igu><div class="st-sec"><h3>From '+esc(stationIguCode())+'</h3>'+
  (b.missed?'<span class="pill bad" data-igu-missed-count>'+b.missed+' not scanned</span>':'')+(b.noSkid?'<span class="pill warn" data-igu-noskid-count>'+b.noSkid+' no skid</span>':'')+
  '<span class="sp"></span><span class="mut">tap a skid — what is on it</span></div>'+shown.map(stationIguOrder).join('')+
  (b.orders.length>shown.length?'<div class="mut st-more">+'+(b.orders.length-shown.length)+' more orders</div>':'')+stationIguFoot(b)+'</div>';
}

/* ------------------- Окно скида: юнитами, по клиентам ------------------- */
/* Владелец, 7.10.2026: «если я нажму на скид, то покажет всё, что внутри?» —
   юнитами, а не по два лайта, по заказам с именем клиента. Нажал клиента —
   выбраны все его юниты на этом скиде, нажал юнит — по одному; дальше скид
   кнопкой, номером или сканом. Окно стёкол диапазоном остаётся у долли. */
function stationSkidItems(code){
 const list=carrierContents().get(code)||[],unitOf=new Map(),items=new Map();
 (DB.stationScan||[]).forEach(s=>{if(!s.undoneAt&&s.asm&&s.unit)unitOf.set(s.piece,s);});
 list.forEach(x=>{
  const s=unitOf.get(x.id),u=s&&stationUnitMerge(x.g.o,x.g.l)===s.station?s:null,key=u?'a|'+u.asm:'g|'+x.id;
  if(!items.has(key))items.set(key,{key,o:x.g.o,l:x.g.l,geo:typeof stationGeo==='function'?stationGeo(x.g):x.g.l,pieces:[],unit:u?u.unit:0,label:u&&typeof unitIdAt==='function'&&unitIdAt(x.g.o.id,x.g.l.id,u.unit)||x.id,at:''});
  const it=items.get(key);it.pieces.push(x.id);if(String(x.scan.at)>it.at)it.at=String(x.scan.at);
 });
 return [...items.values()];
}
function stationSkidOpen(code,orderId){
 const sel=new Set(orderId?stationSkidItems(code).filter(i=>i.o.id===orderId).map(i=>i.key):[]);
 stationMenu=null;stationDrawer={kind:'skid',code,sel,error:''};render();return true;
}
function stationSkidPickOrder(id){
 const d=stationDrawer;if(!d||d.kind!=='skid')return;
 const keys=stationSkidItems(d.code).filter(i=>i.o.id===id).map(i=>i.key),all=keys.every(k=>d.sel.has(k));
 keys.forEach(k=>{if(all)d.sel.delete(k);else d.sel.add(k);});d.error='';render();
}
function stationSkidPick(key){const d=stationDrawer;if(!d||d.kind!=='skid')return;if(d.sel.has(key))d.sel.delete(key);else d.sel.add(key);d.error='';render();}
function stationSkidMove(to){
 const d=stationDrawer,who=stationWho();if(!d||d.kind!=='skid'||!d.sel.size||!who)return false;
 const code=typeof carrierCode==='function'?carrierCode(to):'';
 if(!code||!carrierType(code)){d.error='Scan the skid or type its number';stationBeep('error');render();return false;}
 if(code===d.code){d.error='Already on '+code;stationBeep('error');render();return false;}
 const items=stationSkidItems(d.code).filter(i=>d.sel.has(i.key)),r=carrierMove(items.flatMap(i=>i.pieces),code,who);
 if(r.error){d.error=r.error;stationBeep('error');render();return false;}
 stationDrawer=null;stationNote='';
 stationLast={check:{kind:'carrierMoved',code:r.to,from:d.code,count:items.length,word:items.every(i=>i.unit)?'unit':'',puton:false},move:r,rec:null,data:null,place:null,at:new Date().toISOString()};
 stationBeep('ok');render();return r;
}
function stationSkidHTML(){
 const d=stationDrawer,list=carrierContents().get(d.code)||[],items=stationSkidItems(d.code),orders=new Map();
 items.forEach(i=>{if(!orders.has(i.o.id))orders.set(i.o.id,{o:i.o,items:[],at:i.at});const g=orders.get(i.o.id);g.items.push(i);if(i.at<g.at)g.at=i.at;});
 const rows=[...orders.values()].sort((a,b)=>a.at.localeCompare(b.at)).map(g=>{
  const all=g.items.every(i=>d.sel.has(i.key));
  g.items.sort((a,b)=>(a.unit||1e9)-(b.unit||1e9)||a.label.localeCompare(b.label));
  return '<tr class="st-skid-oh'+(all?' on':'')+'" data-skid-order="'+esc(g.o.businessNumber||'')+'" onclick="stationSkidPickOrder(\''+esc(g.o.id)+'\')"><td class="st-pos">'+(all?'✓':'')+'</td><td colspan="2"><b>'+esc(g.o.businessNumber||'')+'</b> · <span data-raw>'+esc(salesCustomerDisplay(g.o.customerId))+'</span></td><td class="n"><b>'+stationPlural(g.items.length,g.items.every(i=>i.unit)?'unit':'glass',g.items.every(i=>i.unit)?'units':'glass')+'</b></td></tr>'+
   g.items.map(i=>{const on=d.sel.has(i.key);return '<tr class="st-mv-row'+(on?' on':'')+'" data-skid-unit="'+esc(i.label)+'" onclick="stationSkidPick(\''+esc(i.key)+'\')"><td class="st-pos">'+(on?'✓':'')+'</td><td class="mono"><b>'+esc(i.label)+'</b></td><td>Line '+((g.o.lines||[]).indexOf(i.l)+1)+' · <b>'+esc(frac16(i.geo.width16/16)+' × '+frac16(i.geo.height16/16))+'</b></td><td class="mut">'+esc(stationTime(i.at))+'</td></tr>';}).join('');
 }).join('');
 const n=items.filter(i=>d.sel.has(i.key)).length,since=list.length&&typeof carrierSince==='function'?' · since '+carrierSince(list):'';
 return '<div class="st-dim" onclick="stationCloseDrawer()"></div><div class="st-drawer st-drawer-wide" role="dialog" aria-label="Skid" data-station-skid-window="'+esc(d.code)+'">'+
  '<h2><span class="st-dchip skid">'+esc(d.code)+'</span>'+(list.length?stationTareCount(list):'Empty')+'</h2>'+
  '<div class="mut">Tap a customer — all its units; tap a unit — one by one'+esc(since)+'</div>'+
  (items.length?'<table class="st-mv st-skid-t"><tbody>'+rows+'</tbody></table>':'<div class="empty">Nothing on it</div>')+
  (d.error?'<div class="st-pin-err" role="alert">'+esc(d.error)+'</div>':'')+
  '<div class="st-drawer-foot">'+(n?'<span data-skid-sel><b>'+n+' selected</b> →</span>'+stationSkidTargets(d.code).map(c=>'<button type="button" class="b sm" data-skid-to="'+esc(c)+'" onclick="stationSkidMove(\''+esc(c)+'\')">'+esc(c)+'</button>').join('')+
   '<input class="st-mv-to" data-station-keep data-skid-to-input placeholder="SL-5" onkeydown="if(event.key===\'Enter\'){event.preventDefault();stationSkidMove(this.value)}"><button type="button" class="b st-yes" data-skid-move onclick="stationSkidMove(document.querySelector(\'[data-skid-to-input]\').value)">Move</button>':
   '<span class="mut">Select to move</span>'+stationEmptyButton(d.code))+
  '<button type="button" class="b" onclick="stationCloseDrawer()">Close</button></div></div>';
}
