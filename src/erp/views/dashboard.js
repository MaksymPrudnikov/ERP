/* =====================================================================
   view/dashboard  ·  Overview
   Главная офиса — «что сейчас»: что горит в заказах, что ждёт в цеху, что
   уезжает сегодня, сколько переделок. Владелец, 9 октября 2026: дашборды в
   производстве и в офисе; «я бы не сильно сверкал деньгами — людям это не
   надо видеть»: денег здесь нет. Цифры за недели и месяцы — в Reports.
   Карта разделов убрана: её повторяет левое меню.

   · Блок виден, только если у человека есть галочка его раздела в Users
     (accessCan): без Shipping нет отгрузок, без Production — цеха.
   · Каждая цифра нажимается и открывает свой список: Sales с быстрым видом,
     очередь Optimization, Production с фильтром станции, вкладку Shipping.
   · Цех — все станции: ждёт сейчас · прошло сегодня; сутки — 0:00–24:00.
     На Board станции — только своя станция; вместе — только здесь.
   IN : заказы, prodBoard(), repWorkFacts(), DB.shipment, DB.recut
   OUT: html
   ===================================================================== */

/* Переход из Overview в раздел — сразу с нужным видом. Уход может придержать
   несохранённый заказ (NAV_GUARDS) — тогда вид не ставится. */
function dashGo(k,then){navGo(k);if(tab===k&&then)then();}
function dashSalesQuick(key){dashGo('sales',()=>salesQuickSet(key));}
function dashQueue(key){dashGo('optimization',()=>optimizationSetTab(key));}
function dashShipping(key){dashGo('shipping',()=>{if(key==='delivery')deliveryDate='';shippingSetTab(key);});}
/* Станция в Production → In production: остаётся фильтр только этой станции. */
function dashStation(code){
 dashGo('production',()=>{
  subtab='orders';salesListMenu=null;const p=salesListLoadPrefs();
  Object.keys(p.filters).filter(k=>/^st_/.test(k)).forEach(k=>delete p.filters[k]);
  const f=salesListCleanFilter('st_'+code,{mode:'include',conds:[{op:'gt',v:'0',v2:'',join:'and'}],values:null,preset:''});if(f)p.filters['st_'+code]=f;
  salesListSavePrefs();render();
 });
}
function dashTile(label,n,sub,go,attr,warn){
 return `<button type="button" class="ch-stat ch-go${warn&&n?' warn':''}" data-dash-tile="${attr}" onclick="${go}">${'<span>'+esc(label)+'</span><b>'+chNum(n)+'</b>'}${sub?`<small>${esc(sub)}</small>`:''}</button>`;
}

/* 1. Заказы: быстрые виды Sales и очередь Optimization — число заказов. */
function dashOrders(){
 const tiles=[];
 if(accessCan('sales')){
  const orders=(DB.salesOrder||[]).filter(o=>o&&!salesIsQuote(o)).map(o=>({o})),n=k=>orders.filter(x=>salesQuickTest(k,x)).length;
  tiles.push(dashTile('Due today',n('today'),'orders',"dashSalesQuick('today')",'today'),
   dashTile('Due this week',n('week'),'orders',"dashSalesQuick('week')",'week'),
   dashTile('Needs attention',n('attention'),'on hold · overdue',"dashSalesQuick('attention')",'attention',true));
 }
 if(accessCan('optimization'))tiles.push(dashTile('To verify',optimizationTabCount('new'),'orders',"dashQueue('new')",'verify'),dashTile('To batch',optimizationTabCount('batch'),'orders',"dashQueue('batch')",'batch'));
 return tiles.length?`<div class="card dash-card" data-dash-orders><div class="section-title"><h3>Orders</h3></div><div class="ch-stats">${tiles.join('')}</div></div>`:'';
}
/* 2. Цех: ждёт сейчас и прошло сегодня по каждой станции — две полосы со
   своим масштабом. Все станции вместе — только здесь, у офиса и менеджера:
   на Board станция видит только себя (владелец, 9 октября 2026). */
function dashShopRows(d){
 const waiting={},tare={},done={},cut=stationCutCode();
 d.orders.forEach(x=>{
  Object.keys(x.counts).forEach(k=>{if(k!=='queue')waiting[k]=(waiting[k]||0)+x.counts[k];});
  Object.keys(x.onAt||{}).forEach(k=>Object.keys(x.onAt[k]).forEach(c=>{if(c)(tare[k]||(tare[k]=new Set())).add(c);}));
 });
 d.facts.forEach(f=>{done[f.station]=(done[f.station]||0)+1;});
 return [{label:'To batch',cells:{w:d.orders.reduce((n,x)=>n+(x.counts.queue||0),0),d:null},notes:{w:'in queue'}}].concat((DB.station||[]).map(s=>{
  const t=tare[s.code],n=t?t.size:0,word=t&&[...t].every(c=>/^S/.test(c))?(n===1?'skid':'skids'):(n===1?'dolly':'dollies'),go=`dashStation('${esc(s.code)}')`;
  return {label:s.code,labelHTML:`<b>${esc(s.code)}</b>`,attrs:` data-board-station="${esc(s.code)}" role="button" tabindex="0" onclick="${go}" onkeydown="if(event.key==='Enter')${go}"`,
   cells:{w:waiting[s.code]||0,d:done[s.code]||0},notes:{w:s.code===cut&&waiting[s.code]?'in batches':n?n+' '+word:''}};
 }));
}
function dashShop(d){
 return `<div class="card dash-card" data-dash-shop><div class="section-title"><h3>Shop now</h3><span class="mut">glass · tap a station</span></div>${chartBarGrid(dashShopRows(d),[{k:'w',label:'Waiting now'},{k:'d',label:'Done today'}])}</div>`;
}
/* 3. Отгрузки: те же счётчики, что на вкладках Shipping, и PS на сегодня. */
function dashShip(d){
 const tiles=[dashTile('Ready',shippingTabCount('ready'),'orders to ship',"dashShipping('ready')",'ready'),
  dashTile('Deliveries today',shippingTabCount('delivery'),'packing slips',"dashShipping('delivery')",'delivery'),
  dashTile('Open packing slips',shippingTabCount('shipments'),'planned · shipped',"dashShipping('shipments')",'shipments'),
  dashTile('Backorders',shippingTabCount('backorders'),'orders',"dashShipping('backorders')",'backorders')];
 const rows=stationBoardShipRows(d);
 return `<div class="card dash-card" data-dash-ship><div class="section-title"><h3>Shipping</h3></div><div class="ch-stats">${tiles.join('')}</div><div class="dash-sub">Today</div>${rows||'<div class="mut">No packing slips today.</div>'}</div>`;
}
/* 4. Переделки: стекло Recut за последние 7 дней — где разбили. */
function dashQuality(){
 const from=stationBoardDay(-6),by={};
 (DB.recut||[]).forEach(r=>{const day=repDay(r.createdAt);if(!day||day<from)return;const k=r.where||'—';by[k]=(by[k]||0)+(+r.qty||0)*Math.max(1,(r.keys||[]).length);});
 const codes=(DB.station||[]).map(s=>s.code).filter(c=>by[c]).concat(Object.keys(by).filter(c=>!(DB.station||[]).some(s=>s.code===c)));
 const total=codes.reduce((n,c)=>n+by[c],0);
 return `<div class="card dash-card" data-dash-quality><div class="section-title"><h3>Recuts · 7 days</h3><span class="mut">${chNum(total)} glass</span></div>${codes.length?chartBarGrid(codes.map(c=>({label:c,labelHTML:`<b>${esc(c)}</b>`,cells:{n:by[c]}})),[{k:'n',label:'Glass to recut'}]):'<div class="mut">No recuts in the last 7 days.</div>'}</div>`;
}
function viewDashboard(){
 const shop=accessCan('production'),ship=accessCan('shipping'),today=finToday(),d=shop||ship?{today,orders:prodBoard(),facts:repWorkFacts().filter(f=>f.day===today)}:null;
 const orders=dashOrders(),left=shop?dashShop(d):'',right=(ship?dashShip(d):'')+(shop?dashQuality():'');
 const body=orders+(left||right?`<div class="dash-grid">${left?`<div class="dash-col">${left}</div>`:''}${right?`<div class="dash-col">${right}</div>`:''}</div>`:'');
 return (body||'<div class="card empty">Nothing to show here.</div>')+`<p class="dash-build">Glass Farm${typeof ERP_BUILD!=='undefined'?' · build '+esc(ERP_BUILD):''} · data lives in this browser — Export JSON keeps a copy.</p>`;
}
