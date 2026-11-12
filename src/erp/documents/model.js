/* =====================================================================
   erp/documents/model  ·  documents-1.0
   Бланк как данные: что печатать из открытого заказа при данном наборе полей.
   IN : вид бланка, заказ (открытый в редакторе soDraft), набор полей
   OUT: модель листа для erp/documents/layout
   Правило: ВСЕ деньги берутся из расчёта заказа (salesLineCommercialPrice,
   salesOrderCommercialTotals). Бланк ничего не пересчитывает по-своему —
   иначе цифра на бумаге однажды разошлась бы с цифрой на экране заказа.
   ===================================================================== */

const DOC_TITLES={workOrder:'WORK ORDER',proforma:'PROFORMA INVOICE',confirmation:'ORDER CONFIRMATION',invoice:'INVOICE',quote:'QUOTE'};
const DOC_MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function docNum(v,digits){return Number(v).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});}
function docMoney(v){return v==null||!Number.isFinite(+v)?'—':'$'+docNum(v,2);}
/* Дата без часового пояса: «2026-09-28» из поля Due Date через new Date()
   читается как полночь UTC и в Торонто превращается в 27-е. */
function docDate(v){
 const s=String(v||''),m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);let y,mo,d;
 if(m){y=+m[1];mo=+m[2];d=+m[3];}
 else{const t=new Date(s);if(!s||isNaN(t))return '';y=t.getFullYear();mo=t.getMonth()+1;d=t.getDate();}
 return DOC_MONTHS[mo-1]?DOC_MONTHS[mo-1]+' '+d+', '+y:'';
}
function docTitleCase(t){return /^[A-Z0-9 +.\-]+$/.test(t)?t.toLowerCase().replace(/(^|[\s+])\S/g,x=>x.toUpperCase()):t;}
function docAddressText(a){
 if(!a)return '';
 const city=[a.city,[a.province,a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
 return [a.address1,a.address2,a.address3,city].filter(Boolean).join(', ');
}
function docUnitLabel(t){return ({single:'Single lite',double:'IGU',triple:'Triple IGU'})[t]||'IGU';}
function docSize(line){const w=salesDimFrom16(line.width16),h=salesDimFrom16(line.height16);return w&&h?w+'" × '+h+'"':'';}
function docBasis(v,unit){
 if(unit==='in')return docNum(Math.round(v),0)+' in';
 if(unit==='pc')return docNum(v,0)+' pc';
 return docNum(v,1)+' '+unit;
}

/* --------------------------- Makeup словами --------------------------- */
function docHeatCode(spec){
 const h=mdById('heatTreatment',spec&&spec.heatTreatmentId),c=h?h.code:'';
 return c==='FT'?(spec.heatSoak?' T+HST':' T'):c==='HS'?' HS':'';
}
function docHeatName(spec){
 const h=mdById('heatTreatment',spec&&spec.heatTreatmentId);
 return (h?h.name:'')+(spec&&spec.heatSoak?' + Heat Soak':'');
}
/* Клиенту — Name, как в его проекте; Work order — цеху — Short name
   (владелец, 29.10.2026); поставщику — тоже Name. Без указания (отчёты) —
   код, как раньше. */
function docGlassName(g,opts){const how=opts&&opts.glassNames;return !g?'?':how==='short'?glassShortName(g):how==='name'?g.name||g.code:g.code;}
function docPaneCode(p,opts){
 /* Ламинат — как в Sales (salesLaminatedText), с закалкой и плёнкой. */
 if(p.category==='laminated')return salesLaminatedText(p,(opts&&opts.glassNames)||'code',true);
 const g=glassProductById(p.glassProductId);let s=docGlassName(g,opts)+docHeatCode(p);
 if(p.category==='spandrel')s+=' SP';else if(p.visionType==='frit')s+=' FRIT';
 return s;
}
function docPaneName(p){
 if(p.category==='laminated'){
  const lam=p.laminated||{},o=glassProductById(lam.outer&&lam.outer.glassProductId),i=glassProductById(lam.inner&&lam.inner.glassProductId);
  return 'Laminated '+(o?o.name:'?')+' + '+(i?i.name:'?');
 }
 const g=glassProductById(p.glassProductId);return g?g.name:'Glass not selected';
}
function docCavityCode(c){
 const sp=mdById('spacerVariant',c.spacerVariantId),gas=mdById('gasProduct',c.gasProductId);
 const sys=sp&&spacerSystemByName(sp.system);
 return (sp?[sp.size,sys&&sys.code?sys.code:sp.system].filter(Boolean).join(' '):'Cavity')+(gas&&gas.code&&gas.code!=='AIR'?' '+gas.code:'');
}
function docCavityText(c){
 const sp=mdById('spacerVariant',c.spacerVariantId),gas=mdById('gasProduct',c.gasProductId);
 const seals=[c.primarySealantId,c.secondarySealantId].map(id=>{const x=mdById('sealantProduct',id);return x?x.name:'';}).filter(Boolean);
 return [sp?sp.name:'Spacer not selected',gas?gas.name:'',seals.join(' + ')].filter(Boolean).join(' · ');
}
function docMakeupShort(m,opts){
 const bits=[];(m.panes||[]).forEach((p,i)=>{if(i&&m.cavities[i-1])bits.push(docCavityCode(m.cavities[i-1]));bits.push(docPaneCode(p,opts));});
 return bits.join(' / ');
}
function docMakeupFullLines(m,opts){
 const out=[];
 (m.panes||[]).forEach((p,i)=>{
  const lam=p.category==='laminated',g=lam?null:glassProductById(p.glassProductId);
  const how=opts&&opts.glassNames;let s='Lite '+(i+1)+': '+docPaneName(p)+(g&&g.code&&how!=='name'?' ('+(how==='short'?glassShortName(g):g.code)+')':'');
  const heat=docHeatName(lam?(p.laminated||{}).outer:p);if(heat)s+=' · '+heat;
  if(lam)['outer','inner'].forEach(side=>{const cs=salesCoatingSurfaceOf(p,i,side);if(cs)s+=' · coating '+(cs==='film'?'into film':'#'+cs);});
  else if(p.coatingSurface)s+=' · coating #'+p.coatingSurface;
  if(lam){
   const films=((p.laminated||{}).interlayers||[]).map(f=>{const x=mdById('interlayerProduct',f.productId);return (x?x.name:'Interlayer')+(f.thicknessMm?' '+f.thicknessMm+' mm':'');});
   if(films.length)s+=' · '+films.join(' + ');
  }
  if(p.category==='spandrel'){const x=mdById('spandrelProduct',p.spandrel&&p.spandrel.productId);s+=' · spandrel'+(x?' '+x.name:'');}
  if(p.visionType==='frit'){const x=mdById('fritProduct',p.frit&&p.frit.productId);s+=' · frit'+(x?' '+x.name:'');}
  out.push(s);
  const c=(m.cavities||[])[i];if(c)out.push('Cavity '+(i+1)+': '+docCavityText(c));
 });
 return out;
}

/* Сумма строки считается целиком, как в Spiel (владелец, 02.11.2026): цена
   юнита бывает не в целых центах, поэтому четыре знака — цена × Qty сходится
   на калькуляторе. */
function docUnitMoney(v){return v==null||!Number.isFinite(+v)?'—':salesExact(v)===salesCents(v)?docMoney(v):'$'+docNum(v,4);}
function docIncompleteReason(p){
 if(p.unsupportedCurrency)return 'catalog prices are in CAD';
 if(!p.areas.valid)return 'size or shape is not valid';
 if(p.missingMaterials)return 'glass or cavity price is missing';
 if(p.missingServices)return p.missingServices+' service rate'+(p.missingServices>1?'s':'')+' required';
 return 'check the line';
}
/* Step Unit клиент не видит, пока его ставка 0 (владелец, 20.10.2026): в ERP,
   на станции и на чертеже он виден всегда, с ценой появится в документах сам. */
function docServiceRows(line,qty,order){
 qty=qty===undefined?1:qty;
 return salesLineChargeRows(line,order).map(row=>{const st=salesChargePricingState(line,row,order);return {key:row.key,label:row.label,basis:row.basis,unit:row.unit,rate:st.effectiveRate,value:st.effectiveRate==null?null:salesCents(salesChargeUnitAmount(row,st.effectiveRate)*qty)};})
  .filter(r=>!(r.key==='SURCHARGE:step-unit'&&r.rate===0));
}
function docLineRoute(line,order){
 try{const shape=salesShapeByRef(line.shapeRef),result=shape?ShapeModule.compute(shape):null;return salesPrintRoute(line,order,shape,result);}
 catch(e){return null;}
}
function docChipText(station,opts){
 const items=(station.items||[]).filter(Boolean);
 if(items.length===1&&items[0]===station.name)return '';
 if(station.code==='CUT')return opts.cutSize?items.join(', '):'';
 return items.map(docTitleCase).join(', ');
}
/* Маленький чертёж — только у фигурной строки: прямоугольник 36 × 72 размером
   в заголовке строки сказан полностью. Контур берётся из того же плана реза,
   что и цех, а не из черновика фигуры. */
function docLineDrawing(line,order){
 const shape=salesShapeByRef(line.shapeRef);
 if(!shape||(shape.type==='rectangle'&&!shapeIsDxfSource(shape)))return null;
 try{
  const plan=salesEffectiveCuttingPlan(line,shape,order),lite=plan&&plan.valid&&(plan.lites||[])[0];
  const pts=lite&&lite.finishedPoints;
  return Array.isArray(pts)&&pts.length>2?{pts:pts.map(p=>[+p[0],+p[1]])}:null;
 }catch(e){return null;}
}

/* Счёт: куда на самом деле доставили — адрес последнего доставленного PS
   (адрес объекта), а не адрес доставки из карточки клиента. */
function docInvoiceShipTo(order){
 const s=(DB.shipment||[]).filter(x=>x.status==='delivered'&&x.method==='delivery'&&(x.items||[]).some(i=>i.orderId===order.id)).sort((a,b)=>String(a.deliveredAt||a.date).localeCompare(String(b.deliveredAt||b.date))).pop();
 return s&&s.shipTo?{title:s.shipTo.addressee||s.shipTo.label||'',text:docAddressText(s.shipTo)}:null;
}
/* Дата последней оплаты заказа — под отметкой PAID. */
function docLastPaidOn(order){
 return finLastPaymentDate(order.id);
}
function docCompanyBlock(src){
 const c=src||DB.company||{};
 /* Провинция без города и индекса — ещё не адрес: пока реквизиты не
    заполнены, под названием компании печаталось одинокое «ON». */
 const city=c.city||c.postalCode?[c.city,[c.province,c.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', '):'';
 return {name:c.legalName||'',logo:c.logo||'',lines:[[c.address1,c.address2].filter(Boolean).join(', '),city,[c.phone,c.email,c.website].filter(Boolean).join(' · '),c.hstNumber?'HST # '+c.hstNumber:''].filter(Boolean)};
}

/* ------------------------------ Строка ------------------------------ */
function docSaleItem(model,line,index,order){
 const opts=model.opts,mode=model.mode,m=salesMakeupById(order,line.makeupId),p=salesLineCommercialPrice(line,order),a=p.areas,q=p.qty;
 const it=docItemBase(opts,line,index,m,q);
 /* Отменённые юниты: заказанное число не меняется, в сумму идут оставшиеся. */
 if(p.cancelled)it.qty='Qty '+p.ordered+' · '+p.cancelled+' cancelled';
 const glassLine=p.manual?p.line:p.complete?salesCents(p.materials*q):null;
 /* Строки бланка — на всю позицию, как в Spiel: 149.20 ft² × ставка. */
 const areaAll=a.valid?docNum(a.billable*q,2)+' ft²':'';
 it.amount=mode==='none'?null:mode==='glass'?docMoney(glassLine):docMoney(p.line);
 const bits=[];
 if(opts.billableArea&&a.valid)bits.push('Billable '+docNum(a.billable,1)+' ft²'+(q>1?' × '+q+' = '+areaAll:''));
 /* Галочка Weight per unit / per line предлагается и бланкам продаж (пункт 14). */
 if(opts.weight)bits.push('Weight '+docLineWeightText(salesLineWeight(line,order),q,opts));
 if(opts.perFt2&&['split','glass','unit'].includes(mode)&&!p.missingMaterials&&a.valid)bits.push('glass '+docMoney(p.materialRate)+'/ft²');
 if(bits.length)it.sub.push({text:bits.join(' · ')});
 docItemDetails(it,opts,line,m,order);
 if(!p.complete&&mode!=='none')it.sub.push({text:'Pricing incomplete — '+docIncompleteReason(p),tone:'warn'});
 const services=docServiceRows(line,q,order),names=services.map(s=>s.label).join(', ');
 const adj=x=>fmt({desc:x.label,basis:docMoney(x.base*q),rate:'+'+x.percent+'%',value:p.complete?salesCents(x.amount*q):null,tone:'adj'});
 const fmt=r=>({desc:r.desc,basis:opts.basisRate?r.basis||'':'',rate:opts.basisRate?r.rate||'':'',amount:r.value==null?(r.required?'Rate required':''):docMoney(r.value),tone:r.tone||''});
 /* Цена руками — без разбивки: итог юнита не сложить из материалов и работ. */
 if(p.manual){}
 else if(mode==='full'){
  const mat=[],svc=[];
  (m?m.panes:[]).forEach((pn,i)=>{
   const rate=pn.priceOverride!=null?pn.priceOverride:salesPaneCatalogPrice(pn,order),heat=docHeatName(pn.category==='laminated'?(pn.laminated||{}).outer:pn);
   mat.push({desc:'Lite '+(i+1)+' · '+docPaneName(pn)+(heat?' · '+heat:''),basis:areaAll,rate:rate==null?'':docMoney(rate),value:rate==null||!a.valid?null:salesCents(rate*a.billable*q),required:rate==null});
  });
  (m?m.cavities:[]).forEach((c,i)=>{
   /* Обвязка по частям рецепта: сумма частей этой камеры, в том числе за
      дюйм периметра или штуку (erp/masterdata/surround). */
   const rate=c.priceOverride!=null?c.priceOverride:salesCavityCatalogPrice(c,order),parts=(p.materialRows||[]).filter(r=>r.cavity===i);
   const value=!a.valid||parts.some(r=>r.amount==null)?null:salesCents(parts.reduce((n,r)=>n+r.amount,0)*q);
   mat.push({desc:'Cavity '+(i+1)+' · '+docCavityText(c),basis:areaAll,rate:rate==null?'':docMoney(rate)+(salesCavityOtherUnits(c,order)?' +':''),value:value,required:value==null});
  });
  services.forEach(s=>svc.push({desc:s.label,basis:docBasis(s.basis*q,s.unit),rate:s.rate==null?'':docMoney(s.rate),value:s.value,required:s.rate==null}));
  if(mat.length)it.groups.push({label:'Materials',rows:mat.map(fmt)});
  if(svc.length)it.groups.push({label:'Processing',rows:svc.map(fmt)});
  if(p.adjustments.length)it.groups.push({label:'Surcharges',rows:p.adjustments.map(adj)});
 }else if(mode==='split'){
  const rows=[fmt({desc:'Glass & IGU',basis:areaAll,rate:p.missingMaterials?'':docMoney(p.materialRate),value:p.missingMaterials?null:salesCents(p.materials*q)})];
  if(services.length)rows.push(fmt({desc:'Services · '+names,value:p.complete?salesCents((p.base-p.materials)*q):null}));
  p.adjustments.forEach(x=>rows.push(adj(x)));
  it.groups.push({label:'',rows});
 }else if(mode==='glass'){
  it.groups.push({label:'',rows:[fmt({desc:'Glass & IGU',basis:areaAll,rate:p.missingMaterials?'':docMoney(p.materialRate),value:p.missingMaterials?null:salesCents(p.materials*q)})]});
  if(services.length||p.adjustments.length)it.note=(services.length?'Services on this line: '+names:'Surcharges on this line')+' — priced separately in totals';
 }else if(opts.serviceNames&&services.length){
  it.note=(mode==='unit'?'Includes: ':'Services: ')+names;
 }
 /* Unit price — только в режиме Unit price and line total и у цены руками:
    на обычном бланке нет числа, которое не сходится на калькуляторе. */
 if(mode==='glass'&&!p.manual)it.unitRow=[{label:'Glass total',value:docMoney(glassLine)}];
 else if(mode!=='none'&&(mode==='unit'||p.manual))it.unitRow=[{label:'Unit price',value:docUnitMoney(p.unit)},{label:'×',value:String(q)},{label:'Line total',value:docMoney(p.line)}];
 else if(mode!=='none')it.unitRow=[{label:'Line total',value:docMoney(p.line)}];
 return it;
}
function docItemBase(opts,line,index,m,q){
 return {n:index+1,mark:opts.mark?salesString(line.mark):'',prefix:opts.makeupShort&&m?docUnitLabel(m.unitType)+' '+m.code:'',panes:opts.makeupShort&&m?({single:1,double:2,triple:3})[m.unitType]||2:0,short:opts.makeupShort&&m?docMakeupShort(m,opts):'',
  size:opts.size?docSize(line):'',qty:'Qty '+q,amount:null,info:'',sub:[],full:[],drawing:null,groups:[],note:'',unitRow:null,lites:[],cavities:[]};
}
function docItemDetails(it,opts,line,m,order){
 if(opts.thickness&&m){const mm=salesMakeupThicknessMm(m,order);if(mm)it.sub.push({text:'Unit thickness '+docNum(mm,1)+' mm'});}
 if(opts.makeupFull&&m)it.full=docMakeupFullLines(m,opts);
 if(opts.shapeDrawing)it.drawing=docLineDrawing(line,order);
}
/* Вес юнита на бумаге (пункт 14, вариант 1 владельца 30.10.2026): известное
   число и Partial — клиент видит, что вес неполный, без внутренних подсказок;
   нет ничего — «—». */
/* Владелец 06.11.2026: вес на бумаге всегда; клиенту и цеху — примерный «≈»,
   без Partial и без «что не учтено» (лишнее путает); Partial — только офису на
   экранах. */
/* Вес на бланке продаж: кг, галочка Weight in lb — фунты; неполный — «≈»
   (на бумаге «~»). */
function docWeightText(kg,opts,approx,dec){const lb=opts&&opts.weightLb,v=lb?kg*2.20462:kg,d=dec!=null?dec:v<10?1:0;return (approx?'≈ ':'')+docNum(v,d)+(lb?' lb':' kg');}
/* Вес строки: штука × количество = строка (владелец 06.11.2026: «вес
   каждого и потом сумма»). */
function docLineWeightText(w,q,opts){
 const kg=w.complete?w.kg:w.knownKg>0?w.knownKg:null;if(kg==null)return '—';
 const approx=!w.complete||!!w.estimated,one=docWeightText(kg,opts,approx,1);
 return q>1?one+' × '+q+' = '+docWeightText(kg*q,opts,approx,1):one;
}
/* Оплаты заказа — каждая своей строкой (бухгалтер 06.11.2026: не одной
   суммой). До дня счёта — Deposit, с него — Payment. */
function docOrderCredits(order,billed){
 if(typeof finActiveReceipts!=='function')return [];
 const cur=finCurrency(order);
 return finActiveReceipts().filter(r=>finCurrency(r)===cur).map(r=>({r,a:finMoney((r.allocations||[]).filter(x=>x.orderId===order.id).reduce((s,x)=>s+x.amount,0))})).filter(x=>x.a>0)
  .sort((a,b)=>String(a.r.date).localeCompare(String(b.r.date))||String(a.r.number).localeCompare(String(b.r.number),undefined,{numeric:true}))
  .map(x=>({label:(billed&&x.r.date>=billed?'Payment':'Deposit')+' · '+x.r.number+' · '+docDate(x.r.date),amount:x.a}));
}
function docUnitWeightText(w,unit){
 return w.complete?(w.estimated?'≈ ':'')+docNum(w.kg,1)+' '+unit:w.knownKg>0?'≈ '+docNum(w.knownKg,1)+' '+unit:'— kg';
}
function docShopItem(model,line,index,order){
 const opts=model.opts,m=salesMakeupById(order,line.makeupId),a=salesLineAreas(line,order),q=salesPositiveInt(line.qty,1);
 const it=docItemBase(opts,line,index,m,q),info=[];
 if(opts.actualArea&&a.valid)info.push(docNum(a.actual,1)+' ft²');
 if(opts.weight)info.push(docUnitWeightText(salesLineWeight(line,order),'kg/unit'));
 it.info=info.join(' · ');
 docItemDetails(it,opts,line,m,order);
 if(opts.route){
  const r=docLineRoute(line,order);
  ((r&&r.lites)||[]).forEach(x=>it.lites.push({label:x.label||'Glass',glass:x.glass||'',chips:(x.stations||[]).map(s=>({code:s.code,text:docChipText(s,opts)}))}));
  if(opts.scanStatus&&model.scan)docScanStatus(it,model.scan,order,line);
 }
 if(opts.cavities&&m)(m.cavities||[]).forEach((c,k)=>it.cavities.push({label:'Cavity '+(k+1),text:docCavityText(c)}));
 return it;
}

/* -------------------- Статус стёкол по сканам (Work order) --------------------
   Владелец 06.11.2026, вариант G: «система сама должна распознавать, что done,
   а что нет» — маршрут стекла и есть статус. По каждому лайту строки: станция
   пройдена всеми его стёклами (done), стёкла стоят на ней сейчас (here — сколько
   и на какой таре: on последнего скана, «—» — ни на чём; на скиде — ещё номер
   PS, если стекло уже в packing slip), часть прошла (3/4). В конце маршрута —
   Shipping ready и Ship. Recut — своей строкой под лайтом. Бумага — снимок на
   момент печати. */
function docScanIndex(order){
 const out={lines:new Map(),ps:new Map()};
 if(typeof stationPieceIndex!=='function'||!order||!order.id)return out;
 stationPieceIndex().forEach((h,id)=>{
  if(h.orderId!==order.id)return;const g=stationGlass(id);if(!g)return;
  const scans=stationScansFor(id);let a=out.lines.get(h.lineId);if(!a)out.lines.set(h.lineId,a=[]);
  a.push({id,g,unit:String(g.unit),place:stationPlace(g,scans),scans});
 });
 (DB.shipment||[]).forEach(s=>{if(s.status==='cancelled'||(typeof shippingSent==='function'&&shippingSent(s)))return;(s.items||[]).forEach(i=>(i.pieces||[]).forEach(p=>out.ps.set(p,s.number)));});
 return out;
}
function docScanOn(p){let last=null;p.scans.forEach(s=>{if(!last||String(s.at)>String(last.at))last=s;});return last&&last.on||'—';}
function docScanChip(ps,code,psOf){
 const live=ps.filter(p=>!p.place.broken),on=live.filter(p=>p.place.route.includes(code));
 const done=on.filter(p=>p.place.route.indexOf(code)<=p.place.far).length,here=new Map();
 on.filter(p=>!p.place.shipped&&(p.place.far<0?p.place.route[0]:p.place.waiting)===code).forEach(p=>{const k=docScanOn(p)+(psOf.get(p.id)?' · '+psOf.get(p.id):'');here.set(k,(here.get(k)||0)+1);});
 return {done:on.length>0&&done===on.length,tag:!here.size&&done&&done<on.length?done+'/'+on.length:'',here:[...here].map(([k,n])=>n+' · '+k).join(', ')};
}
function docScanStatus(it,index,order,line){
 const ps=index.lines.get(line.id)||[],sh=typeof shippingStations==='function'?shippingStations():{},isR=p=>/^R/.test(p.unit),rows=[];
 const mark=(x,list)=>{
  const chips=x.chips.slice();if(list.length){[sh.ready,sh.ship].forEach(c=>{if(c&&!chips.some(ch=>ch.code===c))chips.push({code:c,text:''});});}
  return Object.assign({},x,{chips:chips.map(ch=>Object.assign({},ch,list.length?docScanChip(list,ch.code,index.ps):{})),broken:list.filter(p=>p.place.broken).length,scanned:true});
 };
 it.lites.forEach((x,k)=>{
  const mine=ps.filter(p=>p.g.c&&p.g.c.index===k);
  rows.push(mark(x,mine.filter(p=>!isR(p))));
  const rec=new Map();mine.filter(isR).forEach(p=>{const no=p.unit.split('.')[0].slice(1);if(!rec.has(no))rec.set(no,[]);rec.get(no).push(p);});
  rec.forEach((list,no)=>rows.push(Object.assign(mark(x,list),{label:'Recut '+no,recut:true})));
 });
 /* Recut заведён, а стёкол ещё нет — не в батче. */
 const have=new Set(ps.filter(isR).map(p=>p.unit.split('.')[0].slice(1)));
 (typeof recutForOrder==='function'?recutForOrder(order.id):[]).filter(r=>r.lineId===line.id&&!have.has(String(r.no))).forEach(r=>rows.push({label:'Recut '+r.no,glass:'',chips:[],recut:true,pending:['Not in a batch yet',r.reason].filter(Boolean).join(' · ')}));
 it.lites=rows;
 const live=ps.filter(p=>!p.place.broken),prod=live.some(p=>!p.place.shipped&&p.place.waiting!==sh.ready&&p.place.waiting!==sh.ship);
 const st=!ps.length?'Not in a batch':live.every(p=>p.place.shipped)?'Shipped':prod?'In work':'Made · waiting to ship';
 it.info=[st,it.info].filter(Boolean).join(' · ');
}
/* Кто ввёл заказ — первая запись журнала заказа (без станции), и когда. */
function docEnteredBy(order){
 const ev=(DB.orderEvent||[]).filter(e=>e.orderId===order.id).sort((a,b)=>String(a.at).localeCompare(String(b.at)))[0];
 const by=ev&&ev.by?String(ev.by).split(' · ')[0]:'';return [by,docDate(order.createdAt)].filter(Boolean).join(' · ')||'—';
}
/* Машина рейса, на который уже поставлен PS этого заказа. */
function docTruckText(order){
 const s=(DB.shipment||[]).find(x=>x.truckId&&x.status!=='cancelled'&&(x.items||[]).some(i=>i.orderId===order.id)),t=s&&typeof truckFind==='function'?truckFind(s.truckId):null;
 return t?'Truck: '+t.name+' · '+docDate(s.date):'Truck: not planned yet';
}
/* Строка Work order в итогах: юниты, стёкла (Panels), ft², кг (владелец
   06.11.2026: юниты и стёкла — раздельно, «в кашу» — баг Spiel). */
function docLineTotals(l,order){
 const q=salesPositiveInt(l.qty,1),m=salesMakeupById(order,l.makeupId),n=m?Math.max(1,(m.panes||[]).length):1,a=salesLineAreas(l,order),w=salesLineWeight(l,order);
 return {units:q,igu:n>1?q:0,single:n>1?0:q,panels:q*n,area:a.valid?a.actual*q:0,kg:(w.kg==null?w.knownKg||0:w.kg)*q};
}
function docShopSummary(order,w,weightText){
 const t=(order.lines||[]).map(l=>docLineTotals(l,order)).reduce((s,x)=>{Object.keys(x).forEach(k=>{s[k]=(s[k]||0)+x[k];});return s;},{});
 const lb=w.kg==null?'':' kg · '+docNum(w.kg*2.20462,0)+' lb';
 return [{label:'IGU units',value:String(t.igu||0)},{label:'Single lites',value:String(t.single||0)},{label:'Panels (glass)',value:String(t.panels||0)},{label:'Total area',value:docNum(t.area||0,1)+' ft²'},{label:'Total weight',value:lb?weightText.replace(' kg',lb):weightText},{label:'Required',value:docDateWeek(order.dueDate)||'—'}];
}
/* Дата с днём недели — Required на Work order: «Wed, Oct 7, 2026». */
function docDateWeek(v){
 const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/);if(!m)return docDate(v);
 return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(+m[1],+m[2]-1,+m[3]).getDay()]+', '+docDate(m[0]);
}

/* ------------------------------ Бланк ------------------------------- */
function docBuildModel(kind,order,opts){
 order=salesOrderArg(order);opts=Object.assign(docBaseOptions(kind),opts||{},{glassNames:kind==='workOrder'?'short':'name'});
 const sale=kind!=='workOrder',mode=sale?opts.priceMode:'none',C=salesFindCustomer(order.customerId),company=DB.company||{};
 const number=order.businessNumber||'Draft',docName=docKindLabel(kind),terms=finTermsFor(order);
 const model={kind,sale,mode,opts,title:DOC_TITLES[kind],docName,number,customerName:C?(C.legalName||C.displayName):'',po:order.customerPo||'',
  company:opts.company?docCompanyBlock():null,meta:[],boxes:[],
  table:{amount:sale&&mode!=='none',basisRate:sale&&['full','split','glass'].includes(mode)&&opts.basisRate},
  items:[],extra:null,end:null,terms:'',signature:'',summary:null,summaryNote:'',notes:'',footerLeft:'',footerRight:''};

 const cell=(on,label,value)=>{if(on)model.meta.push({label,value:value||'—'});};
 /* Счёт: дата — день выдачи последнего юнита, срок — оплаты (Net от него). */
 const invoice=kind==='invoice',billed=invoice&&typeof finInvoiceDate==='function'?finInvoiceDate(order):'',payDue=invoice&&billed?finPaymentDue(order):'';
 if(invoice)cell(opts.date,'Invoice date',docDate(billed)||'Not delivered yet');
 else cell(opts.date,sale?'Date':'Order date',docDate(kind==='quote'&&order.sentAt||order.createdAt)||docDate(new Date().toISOString()));
 if(kind==='quote')cell(opts.validUntil,'Valid until',docDate(salesQuoteValidUntil(order)));
 cell(opts.customerPo,'Customer PO',order.customerPo);
 if(invoice)cell(opts.dueDate,'Payment due',payDue?docDate(payDue):'On receipt');
 else if(kind==='workOrder')cell(opts.dueDate,'Required',docDateWeek(order.dueDate));
 else cell(opts.dueDate,'Due date',docDate(order.dueDate));
 if(sale)cell(opts.terms,'Terms',paymentTermsLabel(terms));
 cell(opts.priority,'Priority',salesPriorityLabel(order.priority));
 cell(opts.delivery,'Delivery',salesDeliveryLabel(order.delivery));
 if(kind==='workOrder')cell(opts.enteredBy,'Entered by',docEnteredBy(order));
 if(sale)cell(opts.currency,'Currency',order.currency);
 if(opts.accountCode&&C&&C.code)model.meta.push({label:'Account',value:C.code});
 if(sale&&opts.taxNumber&&C){const t=C.taxExempt?('Exempt '+(C.taxExemptionNumber||'')).trim():C.taxNumber;if(t)model.meta.push({label:C.taxExempt?'Tax status':'Customer tax #',value:t});}

 if(opts.billTo||opts.contact){
  const lines=[];
  if(opts.billTo&&C){const t=docAddressText(customerAddressByType(C,'billing'));if(t)lines.push(t);}
  if(opts.contact&&C){const pc=customerPrimaryContact(C),t=[pc.name,pc.phone,pc.email].filter(Boolean).join(' · ');if(t)lines.push(t);}
  model.boxes.push({label:sale?'Bill to':'Customer',title:C?(C.legalName||C.displayName):'No customer selected',lines});
 }
 if(opts.shipTo){
  const went=invoice?docInvoiceShipTo(order):null;
  if(went)model.boxes.push({label:'Shipped to',title:went.title||model.customerName||'Delivery',lines:[went.text||'Delivery address not set']});
  else if(order.delivery==='delivery'){const ad=C?customerAddressByType(C,'delivery'):null,t=docAddressText(ad),lines=[t||'Delivery address not set'];
   /* Work order: контакт на месте и машина (как Delivery instructions у Spiel). */
   if(kind==='workOrder'){const pc=C&&Array.isArray(C.contacts)?customerPrimaryContact(C):{},c=[pc.name,pc.phone].filter(Boolean).join(' · ');if(c)lines.push(c);lines.push(docTruckText(order));}
   model.boxes.push({label:'Ship to',title:(ad&&ad.addressee)||model.customerName||'Delivery',lines});}
  else model.boxes.push({label:'Pickup',title:'Customer pickup',lines:[]});
 }

 if(kind==='workOrder'&&opts.route&&opts.scanStatus)model.scan=docScanIndex(order);
 (order.lines||[]).forEach((l,i)=>model.items.push(sale?docSaleItem(model,l,i,order):docShopItem(model,l,i,order)));
 if(opts.extraItems&&(order.extraItems||[]).length){
  const priced=sale&&mode!=='none';
  model.extra={title:sale?'Additional items':'From stock',rows:order.extraItems.map(x=>{const total=salesExtraItemLineTotal(x,order),unit=salesExtraItemUnitPrice(x,order);
   return {name:salesExtraItemName(x),qty:'Qty '+salesPositiveInt(x.qty,1),rate:priced&&unit!=null?docMoney(unit):'',amount:priced?(total==null?'Rate required':docMoney(total)):''};})};
 }
 /* Поправки руками — строками, как товар (normalizeSalesAdjustments). */
 if(sale&&(order.adjustments||[]).length){
  const rows=order.adjustments.map(a=>({name:a.label||'Adjustment',qty:'',rate:'',amount:mode==='none'?'':(a.amount<0?'−':'')+docMoney(Math.abs(a.amount))}));
  if(model.extra)model.extra.rows=model.extra.rows.concat(rows);else model.extra={title:'Additional items',rows};
 }
 /* Отменённые юниты: работа, за которую платит клиент (erp/sales/unit-cancel). */
 if(sale&&(order.cancellations||[]).length){
  const rows=order.cancellations.map(c=>{const v=unitChargeOf(c);return {name:'Cancelled '+shippingCount(c.units.length,'unit')+' · line '+((order.lines||[]).findIndex(l=>l.id===c.lineId)+1)+' · work done',qty:'',rate:'',amount:mode==='none'?'':v==null?'Rate required':docMoney(v)};});
  if(model.extra)model.extra.rows=model.extra.rows.concat(rows);else model.extra={title:'Additional items',rows};
 }

 if(sale){
  const t=salesOrderCommercialTotals(order),c=t.charges,money=v=>t.complete?docMoney(v):'—',left=[],review=t.complete&&t.grand<0;
  /* Оплаченному счёту инструкции оплаты не нужны — на нём PAID. */
  const settled=invoice&&t.complete&&!review&&typeof finOrderPaid==='function'&&salesMoney(t.grand-finOrderPaid(order.id).paid)<=0;
  if(review)left.push({label:'Review required',text:'Negative order total. Please contact us to resolve it.'});
  if(opts.paymentInstructions&&!settled&&!review)left.push({label:'Payment',text:[company.paymentInstructions,'Please reference order '+number+' with your payment.'].filter(Boolean).join('\n')});
  if(opts.notes&&order.notes)left.push({label:'Order notes',text:order.notes});
  let rows=null,grand=null,deposit=null;
  if(opts.totals){
   rows=[];
   /* Бесплатная переделка NCR: строки по обычной цене, скидка на всю сумму
    строкой перед Subtotal — суммы сходятся, итог и налог $0 (владелец,
    05.10.2026: «главное, что 0»; аудит: строка $265.48 при Total $0). */
   const free=order.noCharge?salesOrderCommercialTotals(Object.assign({},order,{noCharge:false})):null;
   const ncr=free&&order.remakeNcrId&&typeof ncrFind==='function'?ncrFind(order.remakeNcrId):null,parent=ncr&&salesRecord(ncr.orderId);
   const freeRow=free&&{label:'No charge · remake'+(ncr?' for '+ncr.number:'')+(parent?' · order '+parent.businessNumber:''),value:free.complete?'−'+docMoney(free.subtotal):'—'};
   if(opts.groupTotals||mode==='glass'){
    const g={glass:0,services:0,surcharges:0,extra:0};
    (order.lines||[]).forEach(l=>{const p=salesLineCommercialPrice(l,order);if(!p.complete)return;const gl=p.manual?p.line:salesMoney(p.materials*p.qty),su=p.manual?0:salesMoney((p.unit-p.base)*p.qty);g.glass+=gl;g.surcharges+=su;g.services+=salesMoney(p.line-gl-su);});
    (order.extraItems||[]).forEach(x=>{const v=salesExtraItemLineTotal(x,order);if(v!=null)g.extra+=v;});
    (order.adjustments||[]).forEach(a=>{g.extra+=+a.amount||0;});
    rows.push({label:'Glass & IGU',value:money(salesMoney(g.glass))},{label:'Services and processing',value:money(salesMoney(g.services))});
    if(g.surcharges)rows.push({label:'Surcharges',value:money(salesMoney(g.surcharges))});
    if(g.extra)rows.push({label:'Additional items',value:money(salesMoney(g.extra))});
    if(freeRow)rows.push(freeRow);
    rows.push({label:'Subtotal',value:money(t.subtotal),strong:true,sep:true});
   }else{if(freeRow)rows.push(freeRow);rows.push({label:'Subtotal',value:money(t.subtotal),strong:!!freeRow,sep:!!freeRow});}
   if(c.energy.enabled)rows.push({label:'Energy surcharge '+c.energy.rate+'%',value:money(t.energy)});
   if(c.hst.enabled)rows.push({label:'HST '+c.hst.rate+'%',value:money(t.hst)});
   if(c.card.enabled)rows.push({label:'Card fee '+c.card.rate+'%',value:money(t.card)});
   if(c.delivery.enabled)rows.push({label:'Delivery',value:money(t.delivery)});
   if(c.skidDeposit.enabled)rows.push({label:'Skid deposit',value:money(t.skidDeposit)});
   grand={label:'Total '+order.currency,value:money(t.grand)};
  }
  /* Оплаты заказа (экран Finance): уже внесённое уменьшает депозит к оплате,
     а итог показывает, сколько внесено и сколько осталось. */
  const got=typeof finOrderPaid==='function'?finOrderPaid(order.id):{paid:0,receipts:0},paidSoFar=t.complete?got.paid:0;
  let paid=null;
  if(opts.receipts&&rows&&got.paid>0){
   const rest=salesMoney(t.grand-got.paid);
   paid=docOrderCredits(order,billed).map(c=>({label:c.label,value:'−'+docMoney(c.amount)})).concat([{label:'Credits total',value:'−'+docMoney(got.paid)}]);
   /* Счёт: остаток — в рамке «Balance · this order» ниже. */
   if(!invoice||!opts.payment||review)paid.push({label:review?'Review required':rest>0?'Balance due':rest<0?'Overpaid':'Paid in full',value:t.complete?docMoney(review?rest:Math.abs(rest)):'—',tone:rest>0?'due':''});
  }
  /* Счёт: к оплате — остаток и срок; оплачено полностью — отметка PAID
     (владелец: «у нас маленький штамп, но если будет PAID на бумаге — топ»). */
  const rest=t.complete?salesMoney(t.grand-got.paid):null;
  if(invoice&&t.complete&&!review&&rest<=0)model.stamp={text:'PAID',sub:docDate(docLastPaidOn(order))};
  if(review&&opts.payment)deposit=[{label:'Review required',value:money(t.grand),strong:true}];
  else if(invoice&&opts.payment){
   deposit=rest!=null&&rest<=0?[{label:'Paid in full · thank you',value:docMoney(0),strong:true}]
    :[{label:'Balance · this order',value:money(rest),strong:true}];
  }else if(opts.payment){
   const pct=paymentDepositPercent(terms);
   if(terms.paymentMode==='credit')deposit=[{label:'Payment terms · '+paymentTermsLabel(terms),value:money(t.grand),strong:true},{label:terms.creditDays!=null?'Due within '+terms.creditDays+' days of invoice · no deposit':'On credit · no deposit',value:''}];
   else if(pct>0){
    const dep=salesMoney(t.grand*pct/100);
    if(paidSoFar>0&&paidSoFar>=dep)deposit=[{label:'Deposit received · '+pct+'%',value:money(dep),strong:true}];
    else deposit=[{label:(kind==='proforma'?'Deposit due now · ':kind==='quote'?'Deposit to start production · ':'Deposit before production · ')+pct+'%',value:money(salesMoney(dep-paidSoFar)),strong:true},{label:'Balance on completion',value:money(salesMoney(t.grand-dep))}];
   }
   else deposit=[{label:'Payment due on completion',value:money(t.grand),strong:true}];
  }
  if(left.length||rows||deposit)model.end={left,rows,grand,paid,deposit,missing:t.complete?'':t.missing+(t.missing>1?' items need pricing':' item needs pricing')};
  /* Бланки заказа с ценами: условия и GST/HST — внизу слева, рядом с итогами
     (владелец 06.11.2026, как у Spiel). */
  if(DOC_ORDER_SALE.includes(kind)&&model.end){
   if(opts.termsText&&company.termsText)model.end.left.push({label:'Terms and conditions',text:company.termsText});
   if(opts.totals&&company.hstNumber)model.end.left.push({label:'GST/HST No.',text:company.hstNumber});
  }else if(opts.termsText&&company.termsText)model.terms=company.termsText;
  const depositFirst=terms.paymentMode==='cash'&&paymentDepositPercent(terms)>0;
 if(opts.signature)model.signature=kind==='quote'
  ?'Prices are valid until '+docDate(salesQuoteValidUntil(order))+'. To accept, reply to the email or sign and return this quote. Production starts after the order is confirmed'+(depositFirst?' and the deposit is received.':'.')
  :'Please check sizes, makeups and quantities. Production starts after this confirmation is signed'+(depositFirst?' and the deposit is received.':'.');
  model.footerLeft=company.footerText||'';
 }else{
  if(opts.notes&&order.notes)model.notes=order.notes;
  model.footerLeft='Internal · no prices';
 }
 /* Order summary — в каждом бланке, где его отметили в Customize (пункт 14:
    раньше только в бланках без цен). Вес — известное и Partial с тем, что не
    учтено, строкой под блоком: на бумаге без наведения. */
 let units=0,area=0;
 (order.lines||[]).forEach(l=>{const q=salesPositiveInt(l.qty,1),a=salesLineAreas(l,order);units+=q;if(a.valid)area+=a.actual*q;});
 const w=salesOrderWeight(order),weightText=w.kg==null?'Weight unavailable':(w.estimated||!w.complete?'≈ ':'')+docNum(w.kg,w.kg<10?2:0)+' kg';
 if(opts.orderSummary){
  const miss=salesWeightMissingText(w);
  model.summary=kind==='workOrder'?docShopSummary(order,w,weightText):[{label:'Glass units',value:String(units)},{label:'Total area',value:docNum(area,1)+' ft²'},{label:'Total weight',value:weightText},{label:'Due date',value:docDate(order.dueDate)||'—'}];

 }
 /* Строка итогов на первой странице: сколько к оплате видно сразу. */
 if(sale&&opts.totalsTop&&DOC_ORDER_SALE.includes(kind)){
  const st=salesOrderCommercialTotals(order),pd=typeof finOrderPaid==='function'?finOrderPaid(order.id).paid:0,cash=v=>st.complete?docMoney(v):'—';
  /* Оплачено — чётко (владелец 07.11.2026): Paid зелёным, Balance due
     красным, под строкой полоса «Paid … · % / Left …». */
  const left=salesMoney(st.grand-pd),paidTone=pd>0&&st.complete;
  model.strip=[{label:'Total '+order.currency,value:cash(st.grand)}].concat(pd>0?[{label:'Paid',value:docMoney(pd),tone:'paid',labelTone:true}]:[],
   [{label:'Balance due',value:cash(left),tone:paidTone?left>0?'due':'paid':''},{label:'Quantity',value:String(units)},{label:'Weight',value:w.kg==null?'—':docWeightText(w.kg,opts,w.estimated||!w.complete)},{label:'Area',value:docNum(area,0)+' ft²'}]);
  if(paidTone&&st.grand>0)model.stripPaid={paid:Math.min(pd,st.grand),left:Math.max(0,left)};
 }
 model.footerRight=[company.legalName,docName+' '+number].filter(Boolean).join(' · ');
 if(kind==='workOrder')model.lineTotals=(order.lines||[]).map(l=>docLineTotals(l,order));
 /* Значения полей для конструктора форм (окно Insert field): дни —
    YYYY-MM-DD (вид выбирает блок), остальное — как на бланке; деньги — только
    у бланков с ценами. */
 const pc=C&&Array.isArray(C.contacts)?customerPrimaryContact(C):null,ship=C&&order.delivery==='delivery'?customerAddressByType(C,'delivery'):null,went=invoice?docInvoiceShipTo(order):null;
 const tt=sale?salesOrderCommercialTotals(order):null,paid=sale&&typeof finOrderPaid==='function'?finOrderPaid(order.id).paid:0,cash=v=>tt&&tt.complete?docMoney(v):'';
 const day=v=>String(v||'').slice(0,10);
 model.data={date:day(invoice?billed:kind==='quote'&&order.sentAt||order.createdAt),dueDate:day(invoice?payDue:order.dueDate),validUntil:kind==='quote'?day(salesQuoteValidUntil(order)):'',
  customerPo:order.customerPo||'',terms:sale?paymentTermsLabel(terms):'',currency:sale?order.currency||'':'',priority:salesPriorityLabel(order.priority),delivery:salesDeliveryLabel(order.delivery),
  account:C&&C.code||'',billTo:C?docAddressText(customerAddressByType(C,'billing')):'',contact:pc?[pc.name,pc.phone,pc.email].filter(Boolean).join(' · '):'',
  shipTo:went?[went.title||model.customerName,went.text].filter(Boolean):order.delivery==='delivery'?[(ship&&ship.addressee)||model.customerName,docAddressText(ship)].filter(Boolean):['Customer pickup'],
  units:String(units),area:docNum(area,1)+' ft²',weight:weightText,lines:String((order.lines||[]).length),
  weightLb:w.kg==null?'':docWeightText(w.kg,{weightLb:true},w.estimated||!w.complete),credits:tt&&paid>0?'−'+docMoney(paid):'',
  creditLines:sale?docOrderCredits(order,billed).map(c=>c.label+' · '+docMoney(c.amount)):[],
  subtotal:tt?cash(tt.subtotal):'',hst:tt&&tt.charges.hst.enabled?cash(tt.hst):'',grand:tt?cash(tt.grand):'',paid:tt&&paid>0?cash(paid):'',balance:tt?cash(salesMoney(tt.grand-paid)):''};
 return model;
}
