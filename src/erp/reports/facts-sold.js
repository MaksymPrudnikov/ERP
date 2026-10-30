/* =====================================================================
   reports/facts-sold  ·  facts-1.0
   Продано: что именно купил клиент — стекло, плёнка, обвязка, каждая
   работа и сервис, позиции каталога, сборы заказа. Строка — одна часть
   цены строки заказа в своей единице: ft² стекла, ft² плёнки, линейные
   дюймы, штуки.
   IN : DB.salesOrder — цена та же, что у самого заказа
        (salesLineCommercialPrice, строки начислений salesLineChargeRows);
        вид работы — карточка Works (Data)
   OUT: repSoldFacts() — массив строк, кэш по заказам
   Правило: файл ничего не рисует.

   Владелец, 26.10.2026: «замер по всем видам работ и сервисов —
   количество, чтобы можно было сделать анализ по каждому продукту»;
   «сколько ft² плёнки продано, сколько петель в штуках и клем и других
   айтемов, сколько всего продано в деньгах и измерительных параметрах»;
   Fabrication — разбить на виды.
   · Сумма строк заказа = его итог до HST, до цента: копейки округления
     получает самая крупная строка позиции.
   · Цена юнита руками — своя строка «Price set by hand» (разница с
     расчётом), а не размазанная по работам: цены работ остаются как в
     заказе, видно, сколько дали руками.
   · Переделка NCR без оплаты — количество есть, денег 0 (Charged).
   · Заказ не в CAD — количество есть, денег нет: прайс в CAD, а курса нет.
   · Отменённые юниты не проданы; плата за них — своя строка.
   ===================================================================== */
const REP_SOLD_KIND={EDGE:'Edgework',MI:'Fabrication',GLAZE:'Coating & paint',HEATSOAK:'Heat treatment',MUNTIN:'Muntins',SURCHARGE:'Surcharges',EXTRA:'Extra services'};
const REP_SOLD_UNIT={in:'in',inch:'in','ft²':'ft²',sqft:'ft²',pc:'pcs',pcs:'pcs',each:'pcs'};
/* Строка начислений: категория, работа Works, вид и продукт. Вид — семья
   работы (Hole) или сама работа (Hinge, Clamp, Notch by CNC); продукт —
   строка как в заказе (Hole 1/2″–1″, Mitering 45°). */
function repSoldCharge(row){
 const p=String(row.key||'').split(':'),f=p[0]==='FEATURE'?p[1]||'':'';
 const category=p[0]==='FEATURE'?(/^sandblast-/.test(f)?'Sandblasting':/^mirror-/.test(f)?'Mirror':'Fabrication'):REP_SOLD_KIND[p[0]]||'Other services';
 const id=row.svc||(p[0]==='MI'&&p[1]!=='hole'?p[1]:p[0]==='FEATURE'?REP_FEATURE_WORK[f]:p[0]==='EDGE'?p[1]:p[0]==='HEATSOAK'?'heat_soak':p[0]==='MUNTIN'?'muntinSection':'');
 const w=id?salesServiceRateRow(id):null,product=String(row.label||'').replace(/ · [\d.]+ mm$/,'').replace(/ × \d+ glass layers?$/,'');
 const fam=w&&w.family?w.family.charAt(0).toUpperCase()+w.family.slice(1):'';
 return {category,type:fam||(w&&w.name)||product,product,station:w&&w.station||''};
}
function repSoldUnit(u){return REP_SOLD_UNIT[u]||u||'—';}
/* Строки — по заказу: заказ не менялся (время правки, статус, день
   отгрузки, Works) — его строки те же, пересчитывается только изменённый.
   want — период графика (reports/query, repSelect): считаются только
   заказы, у которых этот день в периоде; без периода — все. */
let repSoldCache={stamp:'',sets:new Map()},repSoldByOrder=new Map();
function repSoldFacts(want){
 const works=(DB.serviceRate||[]).map(w=>w&&w.id+w.name+w.family).join(',');
 const stamp=[(DB.salesOrder||[]).map(o=>o.id+(o.updatedAt||'')+o.status).join(','),(DB.shipment||[]).map(s=>s.id+s.status+s.date).join(','),works].join('|');
 if(repSoldCache.stamp!==stamp)repSoldCache={stamp,sets:new Map()};
 const pick=want&&want.range&&['created','due','shipped'].includes(want.df)?want:null,key=pick?pick.df+'|'+pick.range.join('~'):'all';
 if(repSoldCache.sets.has(key))return repSoldCache.sets.get(key);
 const rows=[],seen=new Set();
 (DB.salesOrder||[]).forEach(o=>{if(salesIsDraft(o))return;
  if(!o||salesIsQuote(o)||o.status==='cancelled')return;seen.add(o.id);
  const shipped=repOrderShipped(o);
  if(pick){const d=repIsoDay(pick.df==='created'?salesListIsoDay(o.createdAt):pick.df==='due'?o.dueDate:shipped);if(!d||(pick.range[0]&&d<pick.range[0])||(pick.range[1]&&d>pick.range[1]))return;}
  const k=[o.updatedAt||'',o.status,shipped,works].join('|'),was=repSoldByOrder.get(o.id);
  let mine=was&&was.key===k?was.rows:null;
  /* Заказ целиком или никак: сломанный расчёт одного заказа не оставляет
     в отчёте его половину. */
  if(!mine){mine=[];try{finWithOrder(o,()=>repSoldOrder(o,shipped,mine));}catch(e){mine=[];}repSoldByOrder.set(o.id,{key:k,rows:mine});}
  mine.forEach(x=>rows.push(x));
 });
 if(!pick)repSoldByOrder.forEach((v,id)=>{if(!seen.has(id))repSoldByOrder.delete(id);});
 repSoldCache.sets.set(key,rows);
 return rows;
}
function repSoldOrder(o,shipped,rows){
 const free=!!o.noCharge,cad=!o.currency||o.currency==='CAD';
 const base=Object.assign({},repOrderInfo(o),{orderId:o.id,order:o.businessNumber||'',customerId:o.customerId||'',at:o.createdAt||'',created:salesListIsoDay(o.createdAt),shipped,
  status:salesStatusLabel(o),priority:SALES_LIST_PRIORITY[o.priority]||'Normal',charge:free?'No charge':'Charged'});
 const put=r=>{const x=Object.assign({},base,{type:'',product:'',unitName:'—',mm:null,heat:'',station:'',qty:0,amount:null,list:null,glassFt2:0,filmFt2:0,lamFt2:0,spacerFt:0,inches:0,pcs:0,workFt2:0,units:0,unitFt2:0},r);
  if(free&&x.amount!=null)x.amount=0;x.unitPrice=x.amount!=null&&x.qty>0?x.amount/x.qty:null;x.id=o.id+'#'+rows.length;rows.push(x);return x;};
 (o.lines||[]).forEach(l=>repSoldLine(o,l,cad,put));
 (o.extraItems||[]).forEach(x=>{const it=salesExtraItemRow(x.table,x.itemId),n=salesPositiveInt(x.qty,1);
  put({category:'Catalog items',type:it&&it.subcategory||'Catalog item',product:salesExtraItemName(x),unitName:'pcs',qty:n,pcs:n,amount:cad?salesExtraItemLineTotal(x):null});});
 (o.cancellations||[]).forEach(c=>put({category:'Cancelled units',type:'Cancelled units',product:'Charge for cancelled units',unitName:'units',qty:c.units.length,amount:cad?unitChargeOf(c):null}));
 (o.adjustments||[]).forEach(a=>put({category:'Adjustments',type:'Adjustment',product:a.label||'Adjustment',amount:a.amount}));
 const t=finOrderTotals(o);
 [['energy','Energy surcharge'],['delivery','Delivery'],['card','Card fee'],['skidDeposit','Skid deposit']].forEach(([k,label])=>{if(t[k])put({category:'Order charges',type:label,product:label,amount:t[k]});});
}
/* Позиция: стекло и плёнка по лайтам, обвязка, работы, надбавки; деньги —
   на все живые юниты позиции. */
function repSoldLine(o,l,cad,put){
 const p=salesLineCommercialPrice(l,o),live=p.qty;if(!live)return;
 const m=salesMakeupById(o,l.makeupId),a=p.areas,bill=a.valid?a.billable:0,money=v=>cad&&v!=null?salesMoney(v*live):null;
 const thick=salesPricingThickness(l),L=Object.assign({unitType:m?(m.unitType==='single'&&(m.panes||[]).some(x=>x.category==='laminated')?'Laminated':docUnitLabel(m.unitType)):'',
  makeup:m?docMakeupShort(m):'',sizeBand:repSizeBand(bill)},repLineInfo(l));
 const mine=[],add=r=>{const x=put(Object.assign({},L,r));mine.push(x);return x;};
 const heatOf=x=>{const ht=x&&mdById('heatTreatment',x.heatTreatmentId);return ht?ht.name||ht.code||'':'';};
 (p.materialRows||[]).forEach(r=>{
  /* Без цены единица продажи неизвестна — количество по площади. */
  const none=r.price==null,unitName=none?'ft²':repSoldUnit(r.unit),qty=none?bill*live:r.qty==null?0:r.qty*live,pane=m&&r.pane!=null?(m.panes||[])[r.pane]:null;
  /* Часть обвязки за $0 (осушитель, PIB, уголки) входит в цену рамки, её
     ft² — те же Unit ft²: строки не добавляют ничего, кроме веса отчёту
     (на годе — почти половина строк). Без цены — остаётся: её видно. */
  if(r.cavity!=null&&r.price===0&&!r.amount&&r.table!=='spacerVariant')return;
  if(r.cavity!=null){const x=r.itemId&&mdById(r.table,r.itemId),t=typeof CONS_TABLES!=='undefined'&&CONS_TABLES.find(c=>c[0]===r.table);
   add({category:'IGU surround',type:t?t[1]:'Surround',product:x?x.name:'Surround · price by hand',unitName,qty,amount:money(r.amount),spacerFt:r.table==='spacerVariant'&&a.valid?a.perimeterIn/12*live:0});return;}
  if(r.table==='interlayerProduct'){const x=mdById('interlayerProduct',r.itemId),layers=r.layers||1,lam=bill*live,sq=unitName==='ft²';
   add({category:'Interlayer',type:x&&x.family||'Interlayer',product:x?x.name:'Interlayer',unitName,qty:sq?lam*layers:qty,amount:money(r.amount),lamFt2:lam,filmFt2:lam*layers});return;}
  const ply=pane&&r.ply?(pane.laminated||{})[r.ply]:pane,g=r.itemId&&glassProductById(r.itemId);
  /* Ламинат одной ценой руками: обе плиты — одной строкой. */
  const plies=pane&&pane.category==='laminated'&&!r.ply?2:1;
  add({category:'Glass',type:g?salesVisionTypeLabel(g.coatingFamily):pane&&pane.category==='laminated'?'Laminated':'Glass',product:g?g.code:pane&&pane.category==='laminated'?'Laminated · price by hand':'Glass',
   unitName,qty,amount:money(r.amount),mm:g&&g.thicknessMm||ply&&+ply.thicknessMm||null,heat:heatOf(ply),maker:g&&g.manufacturer||'',glassFt2:bill*live*plies});
 });
 (p.chargeRows||[]).forEach(row=>{
  const st=salesChargePricingState(l,row),c=repSoldCharge(row),unitName=repSoldUnit(row.unit),qty=row.basis*live;
  const mm=/ · ([\d.]+) mm$/.exec(row.label||''),work=!['Surcharges'].includes(c.category);
  add(Object.assign(c,{unitName,qty,amount:money(salesChargeUnitAmount(row,st.effectiveRate)),list:money(salesChargeUnitAmount(row,st.catalogRate)),mm:mm?+mm[1]:thick.ok?thick.thickness:null,
   inches:work&&unitName==='in'?qty:0,pcs:work&&unitName==='pcs'?qty:0,workFt2:work&&unitName==='ft²'?qty:0}));
 });
 (p.adjustments||[]).forEach(x=>add({category:'Surcharges',type:x.label,product:x.label,unitName:'units',qty:live,amount:money(x.amount)}));
 if(mine.length){mine[0].units=live;mine[0].unitFt2=bill*live;}
 /* Цена руками и копейки: позиция в сумме — ровно её итог. */
 if(!cad||o.noCharge||p.line==null||!mine.length)return;
 const sum=salesMoney(mine.reduce((n,x)=>n+(x.amount||0),0)),diff=salesMoney(p.line-sum);
 if(p.manual){add({category:'Price set by hand',type:'Price set by hand',product:'Price set by hand',amount:diff});return;}
 if(!diff)return;
 const big=mine.reduce((b,x)=>Math.abs(x.amount||0)>Math.abs(b.amount||0)?x:b,mine[0]);
 big.amount=salesMoney((big.amount||0)+diff);big.unitPrice=big.qty>0?big.amount/big.qty:null;
}
