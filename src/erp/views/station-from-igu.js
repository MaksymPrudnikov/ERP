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
let stationIguSel=new Set();   // выбранное для переноса: s|заказ|скид · n|заказ
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
    const places=u.pieces.map(p=>{const g=stationGlass(p,ctx.index,ctx.batches);return g&&stationPlace(g,ctx.scans.get(p)||[]);});
    const at=u.pieces.flatMap(p=>(ctx.scans.get(p)||[]).filter(s=>s.station===igu&&s.unit).map(s=>s.at)).sort().pop()||'';
    const x=Object.assign({},u,{l,at});if(at>r.lastAt)r.lastAt=at;
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
/* Юниты IGU на этой станции — в листе «From IGU», а не в «Waiting here». */
function stationHereShown(x){return !(stationIsReady()&&x.unit&&stationUnitMerge(x.g.o,x.g.l)===stationIguCode());}
function stationIguUnits(b,keys){
 const out=[];(b?b.orders:[]).forEach(r=>{
  r.skids.forEach((list,code)=>{if(keys.has('s|'+r.o.id+'|'+code))out.push(...list);});
  if(keys.has('n|'+r.o.id))out.push(...r.noSkid);
 });
 return out;
}
function stationIguPick(key){if(stationIguSel.has(key))stationIguSel.delete(key);else stationIguSel.add(key);stationNote='';render();}
function stationIguClear(){stationIguSel.clear();render();}
function stationIguToggle(piece){stationIguOpen=stationIguOpen===piece?'':piece;render();}
/* Выбранное — на скид: нажатием, номером или сканом скида. Undo — как у
   переноса в окне тары. */
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
function stationIguSize(l){return frac16(l.width16/16)+' × '+frac16(l.height16/16);}
function stationIguLabels(list){return list.slice(0,4).map(u=>u.label||u.pieces[0]).join(', ')+(list.length>4?' +'+(list.length-4):'');}
function stationIguOrder(r){
 const id=r.o.id,customer=salesCustomerDisplay(r.o.customerId);
 const chips=[...r.skids].map(([code,list])=>{const k='s|'+id+'|'+code,on=stationIguSel.has(k);
  return '<button type="button" class="st-igu-sk'+(on?' sel':'')+'" data-igu-pick="'+esc(code)+'" onclick="stationIguPick(\''+esc(k)+'\')"><b>'+esc(code)+'</b> '+list.length+(r.mix.get(code)?' <i>mix</i>':'')+'</button>';}).join('');
 const head='<div class="st-igu-o'+(r.rank===3?' done':'')+'" data-igu-order="'+esc(r.o.businessNumber||'')+'"><span class="st-igu-who"><b>'+esc(r.o.businessNumber||'')+'</b> <span data-raw>'+esc(customer)+'</span></span>'+
  '<span class="st-igu-sks">'+chips+'</span><b class="st-igu-n">'+r.done+' / '+r.total+(r.done===r.total?' ✓':'')+'</b></div>';
 const missed=r.missed.slice(0,STATION_IGU_ROWS).map(u=>{const p=u.pieces[0],open=stationIguOpen===p;
  return '<div class="st-igu-r bad'+(open?' open':'')+'" data-igu-missed="'+esc(u.label||p)+'" onclick="stationIguToggle(\''+esc(p)+'\')"><span class="st-dchip st-igu-x">✕</span><span><b class="mono">'+esc(u.label||p)+'</b> · '+esc(stationIguSize(u.l))+' · '+esc(stationTime(u.at))+'</span><span class="st-igu-tag">NOT SCANNED</span></div>'+
   (open?'<div class="st-igu-acts"><button type="button" class="b" data-igu-mark onclick="stationMark(\''+esc(p)+'\')">✓ Mark ready</button><button type="button" class="b" data-igu-print onclick="stationPrintUnit(\''+esc(p)+'\')">Print sticker</button><button type="button" class="b st-red-b" data-igu-broken onclick="stationOpenRecut(\''+esc(p)+'\')">Broken</button></div>':'');}).join('')+
  (r.missed.length>STATION_IGU_ROWS?'<div class="mut st-more">+'+(r.missed.length-STATION_IGU_ROWS)+' more not scanned</div>':'');
 const nk='n|'+id,noSkid=r.noSkid.length?'<div class="st-igu-r warn'+(stationIguSel.has(nk)?' sel':'')+'" data-igu-noskid onclick="stationIguPick(\''+esc(nk)+'\')"><span class="st-dchip none">No skid</span><span><b>'+r.noSkid.length+'</b> <span class="mono mut">'+esc(stationIguLabels(r.noSkid))+'</span></span><span class="st-igu-tag">NO SKID</span></div>':'';
 const line=r.line.length?'<div class="st-igu-r line" data-igu-line><span class="st-dchip none">In line</span><span><b>'+r.line.length+'</b> <span class="mono mut">'+esc(stationIguLabels(r.line))+'</span></span><span class="mut">coming</span></div>':'';
 return '<div class="st-igu-g">'+head+missed+noSkid+line+'</div>';
}
function stationIguFoot(b){
 if(!stationIguSel.size)return '';
 const n=stationIguUnits(b,stationIguSel).length,skids=[];
 carrierContents().forEach((list,code)=>{if(/^S[LA]-/.test(code)&&list.some(x=>x.scan.station===stationCode))skids.push(code);});
 const put=stationPutOn();if(put&&/^S[LA]-/.test(put)&&!skids.includes(put))skids.push(put);
 skids.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 return '<div class="st-igu-foot" data-igu-foot><b>'+stationPlural(n,'unit','units')+'</b> →'+skids.slice(0,8).map(c=>'<button type="button" class="b sm" data-igu-to="'+esc(c)+'" onclick="stationIguMove(\''+esc(c)+'\')">'+esc(c)+'</button>').join('')+
  '<input class="st-mv-to" data-station-keep data-igu-to-input placeholder="SL-5" onkeydown="if(event.key===\'Enter\'){event.preventDefault();stationIguMove(this.value)}"><button type="button" class="b st-yes" onclick="stationIguMove(document.querySelector(\'[data-igu-to-input]\').value)">Move</button>'+
  '<button type="button" class="b" onclick="stationIguClear()">Clear</button></div>';
}
function stationIguCard(){
 if(!stationIsReady())return '';
 const b=stationIguBoard();if(!b||!b.orders.length)return '';
 const shown=b.orders.slice(0,STATION_IGU_ORDERS);
 return '<div class="card st-igu" data-station-igu><div class="st-sec"><h3>From '+esc(stationIguCode())+'</h3>'+
  (b.missed?'<span class="pill bad" data-igu-missed-count>'+b.missed+' not scanned</span>':'')+(b.noSkid?'<span class="pill warn" data-igu-noskid-count>'+b.noSkid+' no skid</span>':'')+
  '<span class="sp"></span><span class="mut">tap a skid to move</span></div>'+shown.map(stationIguOrder).join('')+
  (b.orders.length>shown.length?'<div class="mut st-more">+'+(b.orders.length-shown.length)+' more orders</div>':'')+stationIguFoot(b)+'</div>';
}
