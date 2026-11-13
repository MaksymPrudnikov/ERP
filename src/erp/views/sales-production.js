/* =====================================================================
   views/sales-production  ·  где продукт клиента сейчас
   Владелец 08.11.2026: клиент звонит на фронт-деск, называет PO и
   спрашивает, где его продукт. В Sales: заказ находят по PO (фильтр
   колонки PO), значок «заводик» в шапке рядом с ✂ или правый клик →
   Production. Окно — строки заказа, под каждой — стёкла пакета; колонки —
   станции маршрута. Клетка та же, что в Production → In production
   (prodStation): число — ждут здесь, под ним тара (клик — окно долли или
   скида), ✓ — все прошли, · — ещё не дошли. Вид согласован 08.11.2026
   («вид 1», «первый заводик»).
   IN : prodBoard (views/production-board), carrierWinOpen (views/carriers-board)
   OUT: окно поверх экрана (APP_OVERLAYS)
   ===================================================================== */
let salesProdWin=null;
function salesProdOpen(id){const o=(DB.salesOrder||[]).find(x=>x.id===id);if(!o||salesIsQuote(o))return;salesListMenu=null;salesProdWin={id};render();}
function salesProdClose(){salesProdWin=null;render();}
/* Сумма маршрута и тары по стёклам: строка заказа — итог её стёкол. */
function salesProdSum(lites){
 const route={},on={};
 lites.forEach(t=>{
  Object.entries(t.route||{}).forEach(([c,v])=>{const x=route[c]||(route[c]={w:0,p:0,n:0});x.w+=v.w;x.p+=v.p;x.n+=v.n;});
  Object.entries(t.onAt||{}).forEach(([c,m])=>{const x=on[c]||(on[c]={});Object.entries(m).forEach(([d,k])=>{x[d]=(x[d]||0)+k;});});
 });
 return {route,on};
}
function salesProdHTML(){
 if(!salesProdWin)return '';
 const o=(DB.salesOrder||[]).find(x=>x.id===salesProdWin.id);if(!o){salesProdWin=null;return '';}
 const bd=typeof prodBoard==='function'?prodBoard().find(x=>x.o.id===o.id):null,customer=salesCustomerDisplay(o.customerId);
 const head=`<div class="sales-service-modal-head"><div><span><span>Order</span> ${esc(o.businessNumber||'')}${o.customerPo?' · PO '+esc(o.customerPo):''}</span><h3>Production</h3><small>${esc(customer)}</small></div><button type="button" ${onAct('click',salesProdClose)} aria-label="Close">×</button></div>`;
 let body;
 if(!bd)body=`<p class="mut sales-prod-empty" data-prod-empty>Not in production yet · ${esc(typeof salesStatusLabel==='function'?salesStatusLabel(o):o.status||'')}</p>`;
 else{
  const route=[];bd.lines.forEach(l=>l.lites.forEach(t=>Object.keys(t.route||{}).forEach(c=>{if(!route.includes(c))route.push(c);})));
  const R=route.filter(c=>c!==(typeof shippingStations==='function'?shippingStations().ship:'SHIP'));
  const cells=(st,on)=>R.map(c=>`<td class="pb-st">${prodStation(st[c],c,on[c])}</td>`).join('');
  /* Размер стекла — свой у каждого лайта ступенчатого пакета (salesLineStepInfo);
     такой же, как у строки, — серым, другой — виден сразу (владелец 08.11.2026:
     «а как будет, когда разные размеры»). */
  const liteSize=(line,lite)=>{const info=line&&typeof salesLineStepInfo==='function'?salesLineStepInfo(line,o):null,k=parseInt(lite,10)-1,x=info&&info.step&&info.lites&&info.lites[k];return x?frac16(x.w)+' × '+frac16(x.h):'';};
  const rows=bd.lines.map(l=>{const s=salesProdSum(l.lites),line=(o.lines||[])[l.no-1];
   return `<tr class="sales-prod-line" data-prod-line="${l.no}"><td><b>${l.no}</b> ${esc(l.mark)}</td><td>${esc(l.size)}</td><td class="n">${esc(l.units)}</td>${cells(s.route,s.on)}</tr>`+
    l.lites.map((t,i)=>{const lite=t.lite!=null&&t.lite!==''?String(t.lite):String(i+1),own=liteSize(line,lite),diff=own&&own!==l.size;
     return `<tr class="sales-prod-glass"><td><span class="mono">${esc(glassCodeLabel(t.glass))}</span> <span class="mut">· Lite ${esc(lite)}</span></td><td class="${diff?'sales-prod-own':'mut'}" data-lite-size>${esc(diff?own:l.size)}</td><td class="n mut">${t.total}</td>${cells(t.route||{},t.onAt||{})}</tr>`;}).join('');}).join('');
  body=`<div class="sales-table-wrap"><table class="sl-table sales-prod-table" data-prod-table><thead><tr><th>Line · glass</th><th>Size</th><th class="n">Qty</th>${R.map(c=>`<th class="pb-st">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
 }
 return `<div class="sales-service-modal-back" ${onActSelf('click',salesProdClose)}><div class="sales-service-modal sales-prod-modal" role="dialog" aria-label="Production" data-sales-prod>${head}${body}</div></div>`;
}
(window.APP_OVERLAYS=window.APP_OVERLAYS||[]).push(salesProdHTML);
