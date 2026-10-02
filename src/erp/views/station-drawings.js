/* =====================================================================
   view/station-drawings  ·  station-drawings-1.0
   Чертежи на станциях. Владелец, 29.09.2026: «нужно, чтобы на всех
   станциях можно было просмотреть чертежи по заказам или при сканировании
   стикера». Лист — тот же PRODUCTION DRAWING, что печатается из заказа
   (salesLineDrawing): форма, размеры, отверстия, вырезы, маршрут.
   Скан стекла с формой, отверстиями или вырезами — мини-лист на карточке,
   нажатие — крупно. Кнопка Drawings в шапке — любой заказ: номер заказа или
   стикер стекла, заказы этой станции — одним нажатием.
   IN : salesLineDrawing · salesSheetFitDrawing · stationDrawer
   OUT: html
   ===================================================================== */
/* Лист строится ~40 мс на строку — один раз на строку и версию заказа. */
let stationDrawCache=new Map();
function stationDrawingOf(o,l){
 const k=o.id+'|'+l.id+'|'+(o.updatedAt||'');
 if(stationDrawCache.has(k))return stationDrawCache.get(k);
 let d=null;
 try{d=finWithOrder(o,()=>salesLineDrawing(l));}catch(e){d={line:l,error:String(e&&e.message||e)};}
 if(stationDrawCache.size>200)stationDrawCache=new Map();
 stationDrawCache.set(k,d);return d;
}
function stationDrawLines(o){return (o&&o.lines||[]).filter(l=>l.shapeRef&&salesShapeByRef(l.shapeRef));}
function stationDrawOpen(orderId,lineId){
 const o=salesRecord(orderId);if(!o)return false;
 const lines=stationDrawLines(o);
 stationMenu=null;stationDrawer={kind:'draw',orderId:o.id,lineId:lines.length?(lines.find(l=>l.id===lineId)||lines[0]).id:'',error:''};render();return true;
}
/* Кнопка в шапке: без заказа — выбор заказа. */
function stationDrawPick(){stationMenu=null;stationDrawer={kind:'draw',orderId:'',lineId:'',error:''};render();}
/* Номер заказа или стикер стекла: стекло открывает свою строку. */
function stationDrawFind(raw){
 const v=String(raw==null?'':raw).trim();if(!v)return false;
 const code=stationCodeOf(v),g=glassPieceValid(code)?stationGlass(code):null;
 if(g)return stationDrawOpen(g.o.id,g.l.id);
 const o=(DB.salesOrder||[]).find(x=>String(x.businessNumber||'').toUpperCase()===v.toUpperCase()&&!salesIsQuote(x));
 if(o)return stationDrawOpen(o.id,'');
 stationDrawer.error='Order '+v+' not found';render();return false;
}
function stationDrawStep(d){
 const x=stationDrawer;if(!x||x.kind!=='draw'||!x.orderId)return;
 const lines=stationDrawLines(salesRecord(x.orderId)),at=lines.findIndex(l=>l.id===x.lineId),next=lines[Math.max(0,Math.min(lines.length-1,at+d))];
 if(next&&next.id!==x.lineId){x.lineId=next.id;render();}
}
function stationDrawZoom(){return Math.max(.2,Math.min(1,(Math.min(1400,window.innerWidth)-160)/850,(window.innerHeight-64-150)/1100));}
/* Чертёж — белый лист и в тёмной теме: класс gf-light держит светлые токены. */
function stationDrawSheet(d){return !d?'':d.html?'<div class="print-sheet gf-light">'+printSheetUniqueIds(d.html)+'</div>':'<div class="doc-drawing-error">'+esc(d.error||'No drawing')+'</div>';}
function stationDrawFit(){document.querySelectorAll('[data-station-draw] .print-sheet,.st-drawthumb .print-sheet').forEach(el=>salesSheetFitDrawing(el));}
/* Заказы этой станции — те, чьи стёкла здесь ждут или здесь сканировались. */
function stationDrawOrders(){
 const ids=[];
 (stationWaiting().get(stationCode)||[]).forEach(x=>{if(!ids.includes(x.g.o.id))ids.push(x.g.o.id);});
 (DB.stationScan||[]).filter(s=>s.station===stationCode&&!s.undoneAt).slice(-60).reverse().forEach(s=>{const g=stationGlass(s.piece);if(g&&!ids.includes(g.o.id))ids.push(g.o.id);});
 return ids.map(salesRecord).filter(o=>o&&stationDrawLines(o).length).slice(0,24);
}
function stationDrawHTML(){
 const x=stationDrawer,o=x.orderId?salesRecord(x.orderId):null;
 const find='<label class="st-draw-find">'+ico('scan')+'<input data-station-keep data-station-draw-find autocomplete="off" spellcheck="false" placeholder="Order # or glass sticker" onkeydown="if(event.key===\'Enter\'){event.preventDefault();stationDrawFind(this.value);}"></label>';
 const head=(title)=>'<div class="st-draw-h"><h2>'+title+'</h2><span class="sp"></span>'+find+'<button type="button" class="b st-draw-close" onclick="stationCloseDrawer()">× Close</button></div>'+(x.error?'<div class="st-pin-err">'+esc(x.error)+'</div>':'');
 if(!o){
  /* Окно выбора (владелец, 2 октября 2026: «провалился в окно и не понял,
     куда попал и зачем»): настоящее окно поверх станции, одна строка о том,
     что здесь делают, крупная Close; в плитке — клиент и число чертежей. */
  const list=stationDrawOrders();
  return '<div class="st-dim" onclick="stationCloseDrawer()"></div><div class="st-drawer st-drawer-draw st-draw-pick" role="dialog" aria-label="Drawings" data-station-draw>'+head('Drawings · '+esc(stationCode))+
   '<p class="st-draw-hint">Open any order\'s drawing: tap an order, type its number or scan a glass sticker.</p>'+
   '<div class="st-rgroup">Orders with glass at '+esc(stationCode)+'</div><div class="st-draw-orders">'+(list.length?list.map(r=>{const n=stationDrawLines(r).length;return '<button type="button" class="st-draw-order" data-station-draw-order="'+esc(r.businessNumber||'')+'" onclick="stationDrawOpen(\''+esc(r.id)+'\',\'\')"><b>'+esc(r.businessNumber||'')+'</b><span data-raw>'+esc(salesCustomerDisplay(r.customerId))+'</span><small>'+n+' drawing'+(n===1?'':'s')+'</small></button>';}).join(''):'<div class="mut">No orders here yet — type the order number or scan a glass sticker</div>')+'</div></div>';
 }
 const lines=stationDrawLines(o),l=lines.find(y=>y.id===x.lineId)||lines[0],at=lines.indexOf(l);
 const title='Drawings · <b>'+esc(o.businessNumber||'')+'</b> <span class="mut" data-raw>'+esc(salesCustomerDisplay(o.customerId))+'</span>';
 if(!l)return '<div class="st-dim" onclick="stationCloseDrawer()"></div><div class="st-drawer st-drawer-draw" role="dialog" aria-label="Drawings" data-station-draw>'+head(title)+'<div class="empty">No drawings in this order</div></div>';
 setTimeout(stationDrawFit,0);
 const li=(o.lines||[]).indexOf(l)+1,many=lines.length>1;
 const step=(sign,off)=>many?'<button type="button" class="doc-step" '+(off?'disabled':'')+' onclick="stationDrawStep('+sign+')">'+(sign<0?'‹':'›')+'</button>':'';
 return '<div class="st-dim" onclick="stationCloseDrawer()"></div><div class="st-drawer st-drawer-draw" role="dialog" aria-label="Drawings" data-station-draw="'+esc(l.id)+'">'+head(title)+
  '<div class="st-draw-stage">'+step(-1,at<=0)+'<figure class="doc-drawing" style="zoom:'+stationDrawZoom().toFixed(3)+'">'+stationDrawSheet(stationDrawingOf(o,l))+'</figure>'+step(1,at>=lines.length-1)+'</div>'+
  (many?'<div class="st-draw-film">'+lines.map(y=>{const n=(o.lines||[]).indexOf(y)+1;return '<button type="button" class="st-draw-chip'+(y===l?' on':'')+'" data-station-draw-line="'+n+'" onclick="stationDrawer.lineId=\''+esc(y.id)+'\';render()"><b>Line '+n+'</b><span>'+esc(frac16(y.width16/16)+' × '+frac16(y.height16/16))+(y.mark?' · '+esc(y.mark):'')+'</span></button>';}).join('')+'</div>':'')+
  '<div class="st-draw-foot mut">Line '+li+' · '+(at+1)+' of '+lines.length+(many?' · ← → to flip':'')+'</div></div>';
}
/* Мини-лист на карточке скана: у стекла форма, отверстия или вырезы. */
function stationDrawThumb(g,d){
 if(!g||!d||!d.shape||!g.l.shapeRef)return '';
 const sheet=stationDrawingOf(g.o,g.l);if(!sheet||!sheet.html)return '';
 setTimeout(stationDrawFit,0);
 return '<button type="button" class="st-drawthumb" data-station-drawthumb onclick="stationDrawOpen(\''+esc(g.o.id)+'\',\''+esc(g.l.id)+'\')" title="Open the drawing"><span class="st-drawthumb-paper"><span class="st-drawthumb-sheet">'+stationDrawSheet(sheet)+'</span></span><span class="st-drawthumb-t">Drawing</span></button>';
}
/* Прямоугольник под плашкой NEXT (владелец, 1 октября 2026): у фигуры там
   миниатюра чертежа, у прямоугольника было пусто. Стекло в пропорциях, тем же
   голубым, что на листе раскроя, с размерами по сторонам — рабочий сверяет
   форму и ориентацию (30 × 20 не перепутать с 20 × 30). Нажатие — чертёж. */
function stationGlassPreview(g,size){
 if(!g||!size||!(size.w>0)||!(size.h>0))return '';
 const k=Math.min(196/size.w,130/size.h),W=Math.round(size.w*k),H=Math.round(size.h*k),open=g.l.shapeRef?' onclick="stationDrawOpen(\''+esc(g.o.id)+'\',\''+esc(g.l.id)+'\')"':'';
 const svg='<svg width="'+(W+34)+'" height="'+(H+30)+'" viewBox="-28 -4 '+(W+34)+' '+(H+30)+'" aria-hidden="true">'+
  '<defs><linearGradient id="st-glass-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--cut-glass-a)"/><stop offset="1" style="stop-color:var(--cut-glass-c)"/></linearGradient></defs>'+
  '<rect x="0" y="0" width="'+W+'" height="'+H+'" rx="2" class="st-glassprev-glass"/>'+
  '<path d="M'+(W*.62)+' '+(H*.18)+' L'+(W*.82)+' '+(H*.07)+'" class="st-glassprev-glint"/>'+
  '<path d="M0 '+(H+14)+'H'+W+'M0 '+(H+9)+'V'+(H+19)+'M'+W+' '+(H+9)+'V'+(H+19)+'M-12 0V'+H+'M-17 0H-7M-17 '+H+'H-7" class="st-glassprev-dim"/>'+
  '<text x="'+(W/2)+'" y="'+(H+10)+'" text-anchor="middle">'+esc(frac16(size.w))+'″</text>'+
  '<text x="-16" y="'+(H/2)+'" text-anchor="middle" transform="rotate(-90 -16 '+(H/2)+')">'+esc(frac16(size.h))+'″</text></svg>';
 return '<button type="button" class="st-glassprev" data-station-glassprev'+(open||' disabled')+' title="'+(open?'Open the drawing':'Glass')+'">'+svg+
  '<span class="st-glassprev-t">Rectangle · '+esc(frac16(size.w)+' × '+frac16(size.h))+(open?' · tap for drawing':'')+'</span></button>';
}
document.addEventListener('keydown',function(e){
 if(tab!=='station'||!stationDrawer||stationDrawer.kind!=='draw'||e.altKey||e.ctrlKey||e.metaKey)return;
 if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();stationDrawStep(e.key==='ArrowRight'?1:-1);}
});
