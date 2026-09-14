/* =====================================================================
   erp/documents/model  ·  documents-1.0
   Бланк как данные: что печатать из открытого заказа при данном наборе полей.
   IN : вид бланка, заказ (открытый в редакторе soDraft), набор полей
   OUT: модель листа для erp/documents/layout
   Правило: ВСЕ деньги берутся из расчёта заказа (salesLineCommercialPrice,
   salesOrderCommercialTotals). Бланк ничего не пересчитывает по-своему —
   иначе цифра на бумаге однажды разошлась бы с цифрой на экране заказа.
   ===================================================================== */

const DOC_TITLES={workOrder:'WORK ORDER',proforma:'PROFORMA INVOICE',confirmation:'ORDER CONFIRMATION'};
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
function docPaneCode(p){
 if(p.category==='laminated'){
  const lam=p.laminated||{},o=glassProductById(lam.outer&&lam.outer.glassProductId),i=glassProductById(lam.inner&&lam.inner.glassProductId);
  return 'LAM '+(o?o.code:'?')+docHeatCode(lam.outer)+'+'+(i?i.code:'?')+docHeatCode(lam.inner);
 }
 const g=glassProductById(p.glassProductId);let s=(g?g.code:'?')+docHeatCode(p);
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
 const sys=sp&&typeof SPACER_SYSTEMS!=='undefined'?SPACER_SYSTEMS.find(x=>x.system===sp.system):null;
 return (sp?[sp.size,sys?sys.code:sp.system].filter(Boolean).join(' '):'Cavity')+(gas&&gas.code&&gas.code!=='AIR'?' '+gas.code:'');
}
function docCavityText(c){
 const sp=mdById('spacerVariant',c.spacerVariantId),gas=mdById('gasProduct',c.gasProductId);
 const seals=[c.primarySealantId,c.secondarySealantId].map(id=>{const x=mdById('sealantProduct',id);return x?x.name:'';}).filter(Boolean);
 return [sp?sp.name:'Spacer not selected',gas?gas.name:'',seals.join(' + ')].filter(Boolean).join(' · ');
}
function docMakeupShort(m){
 const bits=[];(m.panes||[]).forEach((p,i)=>{if(i&&m.cavities[i-1])bits.push(docCavityCode(m.cavities[i-1]));bits.push(docPaneCode(p));});
 return bits.join(' / ');
}
function docMakeupFullLines(m){
 const out=[];
 (m.panes||[]).forEach((p,i)=>{
  const lam=p.category==='laminated',g=lam?null:glassProductById(p.glassProductId);
  let s='Lite '+(i+1)+': '+docPaneName(p)+(g&&g.code?' ('+g.code+')':'');
  const heat=docHeatName(lam?(p.laminated||{}).outer:p);if(heat)s+=' · '+heat;
  if(p.coatingSurface)s+=' · coating #'+p.coatingSurface;
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

/* Разбивка строки в цифрах: каждая сумма округляется до цента отдельно, и
   сумма округлённых могла бы разойтись с ценой штуки на цент. Разница
   уходит в самую крупную позицию группы — так на бланке строки всегда
   складываются ровно в Unit price, как на счёте из бухгалтерии. */
function docReconcile(rows,target){
 const known=rows.filter(r=>r.value!=null);if(!known.length||target==null)return;
 const diff=salesMoney(target-known.reduce((s,r)=>s+r.value,0));
 if(diff!==0&&Math.abs(diff)<=0.05){const big=known.reduce((a,b)=>b.value>a.value?b:a);big.value=salesMoney(big.value+diff);}
}
function docIncompleteReason(p){
 if(p.unsupportedCurrency)return 'catalog prices are in CAD';
 if(!p.areas.valid)return 'size or shape is not valid';
 if(p.missingMaterials)return 'glass or cavity price is missing';
 if(p.missingServices)return p.missingServices+' service rate'+(p.missingServices>1?'s':'')+' required';
 return 'check the line';
}
function docServiceRows(line){
 return salesLineChargeRows(line).map(row=>{const st=salesChargePricingState(line,row);return {label:row.label,basis:row.basis,unit:row.unit,rate:st.effectiveRate,value:st.effectiveRate==null?null:salesMoney(row.basis*st.effectiveRate)};});
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

function docCompanyBlock(){
 const c=DB.company||{};
 /* Провинция без города и индекса — ещё не адрес: пока реквизиты не
    заполнены, под названием компании печаталось одинокое «ON». */
 const city=c.city||c.postalCode?[c.city,[c.province,c.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', '):'';
 return {name:c.legalName||'',logo:c.logo||'',lines:[[c.address1,c.address2].filter(Boolean).join(', '),city,[c.phone,c.email,c.website].filter(Boolean).join(' · '),c.hstNumber?'HST # '+c.hstNumber:''].filter(Boolean)};
}

/* ------------------------------ Строка ------------------------------ */
function docSaleItem(model,line,index,order){
 const opts=model.opts,mode=model.mode,m=salesMakeupById(order,line.makeupId),p=salesLineCommercialPrice(line,order),a=p.areas,q=p.qty;
 const it=docItemBase(opts,line,index,m,q);
 const glassLine=p.complete?salesMoney(p.materials*q):null;
 it.amount=mode==='none'?null:mode==='glass'?docMoney(glassLine):docMoney(p.line);
 const bits=[];
 if(opts.billableArea&&a.valid)bits.push('Billable '+docNum(a.billable,1)+' ft² per unit');
 if(opts.perFt2&&['split','glass','unit'].includes(mode)&&!p.missingMaterials&&a.valid)bits.push('glass '+docMoney(p.materialRate)+'/ft²');
 if(bits.length)it.sub.push({text:bits.join(' · ')});
 docItemDetails(it,opts,line,m,order);
 if(!p.complete&&mode!=='none')it.sub.push({text:'Pricing incomplete — '+docIncompleteReason(p),tone:'warn'});
 const services=docServiceRows(line),names=services.map(s=>s.label).join(', ');
 const fmt=r=>({desc:r.desc,basis:opts.basisRate?r.basis||'':'',rate:opts.basisRate?r.rate||'':'',amount:r.value==null?(r.required?'Rate required':''):docMoney(r.value),tone:r.tone||''});
 if(mode==='full'){
  const mat=[],svc=[];
  (m?m.panes:[]).forEach((pn,i)=>{
   const rate=pn.priceOverride!=null?pn.priceOverride:salesPaneCatalogPrice(pn),heat=docHeatName(pn.category==='laminated'?(pn.laminated||{}).outer:pn);
   mat.push({desc:'Lite '+(i+1)+' · '+docPaneName(pn)+(heat?' · '+heat:''),basis:a.valid?docNum(a.billable,1)+' ft²':'',rate:rate==null?'':docMoney(rate),value:rate==null||!a.valid?null:salesMoney(rate*a.billable),required:rate==null});
  });
  (m?m.cavities:[]).forEach((c,i)=>{
   const rate=c.priceOverride!=null?c.priceOverride:salesCavityCatalogPrice(c);
   mat.push({desc:'Cavity '+(i+1)+' · '+docCavityText(c),basis:a.valid?docNum(a.billable,1)+' ft²':'',rate:rate==null?'':docMoney(rate),value:rate==null||!a.valid?null:salesMoney(rate*a.billable),required:rate==null});
  });
  services.forEach(s=>svc.push({desc:s.label,basis:docBasis(s.basis,s.unit),rate:s.rate==null?'':docMoney(s.rate),value:s.value,required:s.rate==null}));
  if(p.complete){docReconcile(mat,p.materials);docReconcile(svc,salesMoney(p.base-p.materials));}
  if(mat.length)it.groups.push({label:'Materials · per unit',rows:mat.map(fmt)});
  if(svc.length)it.groups.push({label:'Processing · per unit',rows:svc.map(fmt)});
  if(p.adjustments.length)it.groups.push({label:'Surcharges · per unit',rows:p.adjustments.map(x=>fmt({desc:x.label,basis:docMoney(x.base),rate:'+'+x.percent+'%',value:p.complete?x.amount:null,tone:'adj'}))});
 }else if(mode==='split'){
  const rows=[{desc:'Glass & IGU',basis:a.valid?docNum(a.billable,1)+' ft²':'',rate:p.missingMaterials?'':docMoney(p.materialRate),value:p.missingMaterials?null:p.materials}];
  if(services.length)rows.push({desc:'Services · '+names,value:p.complete?salesMoney(p.base-p.materials):null});
  p.adjustments.forEach(x=>rows.push({desc:x.label,basis:docMoney(x.base),rate:'+'+x.percent+'%',value:p.complete?x.amount:null,tone:'adj'}));
  it.groups.push({label:'',rows:rows.map(fmt)});
 }else if(mode==='glass'){
  it.groups.push({label:'',rows:[fmt({desc:'Glass & IGU · per unit',basis:a.valid?docNum(a.billable,1)+' ft²':'',rate:p.missingMaterials?'':docMoney(p.materialRate),value:p.missingMaterials?null:p.materials})]});
  if(services.length||p.adjustments.length)it.note=(services.length?'Services on this line: '+names:'Surcharges on this line')+' — priced separately in totals';
 }else if(opts.serviceNames&&services.length){
  it.note=(mode==='unit'?'Includes: ':'Services: ')+names;
 }
 if(mode==='glass')it.unitRow=[{label:'Glass price per unit',value:docMoney(p.complete?p.materials:null)},{label:'×',value:String(q)},{label:'Glass total',value:docMoney(glassLine)}];
 else if(mode!=='none')it.unitRow=[{label:'Unit price',value:docMoney(p.unit)},{label:'×',value:String(q)},{label:'Line total',value:docMoney(p.line)}];
 return it;
}
function docItemBase(opts,line,index,m,q){
 return {n:index+1,mark:opts.mark?salesString(line.mark):'',prefix:opts.makeupShort&&m?docUnitLabel(m.unitType)+' '+m.code:'',short:opts.makeupShort&&m?docMakeupShort(m):'',
  size:opts.size?docSize(line):'',qty:'Qty '+q,amount:null,info:'',sub:[],full:[],drawing:null,groups:[],note:'',unitRow:null,lites:[],cavities:[]};
}
function docItemDetails(it,opts,line,m,order){
 if(opts.thickness&&m){const mm=salesMakeupThicknessMm(m);if(mm)it.sub.push({text:'Unit thickness '+docNum(mm,1)+' mm'});}
 if(opts.makeupFull&&m)it.full=docMakeupFullLines(m);
 if(opts.shapeDrawing)it.drawing=docLineDrawing(line,order);
}
function docShopItem(model,line,index,order){
 const opts=model.opts,m=salesMakeupById(order,line.makeupId),a=salesLineAreas(line,order),q=salesPositiveInt(line.qty,1);
 const it=docItemBase(opts,line,index,m,q),info=[];
 if(opts.actualArea&&a.valid)info.push(docNum(a.actual,1)+' ft²');
 if(opts.weight){const w=salesLineWeight(line,order);info.push(w.complete?docNum(w.kg,1)+' kg/unit':'— kg');}
 it.info=info.join(' · ');
 docItemDetails(it,opts,line,m,order);
 if(opts.route){
  const r=docLineRoute(line,order);
  ((r&&r.lites)||[]).forEach(x=>it.lites.push({label:x.label||'Glass',glass:x.glass||'',chips:(x.stations||[]).map(s=>({code:s.code,text:docChipText(s,opts)}))}));
 }
 if(opts.cavities&&m)(m.cavities||[]).forEach((c,k)=>it.cavities.push({label:'Cavity '+(k+1),text:docCavityText(c)}));
 return it;
}

/* ------------------------------ Бланк ------------------------------- */
function docBuildModel(kind,order,opts){
 order=order||soDraft;opts=Object.assign(docBaseOptions(kind),opts||{});
 const sale=kind!=='workOrder',mode=sale?opts.priceMode:'none',C=salesFindCustomer(order.customerId),company=DB.company||{};
 const number=order.businessNumber||'Draft',docName=docKindLabel(kind),terms=paymentTermsFrom(C||{});
 const model={kind,sale,mode,opts,title:DOC_TITLES[kind],docName,number,customerName:C?(C.legalName||C.displayName):'',po:order.customerPo||'',
  company:opts.company?docCompanyBlock():null,meta:[],boxes:[],
  table:{amount:sale&&mode!=='none',basisRate:sale&&['full','split','glass'].includes(mode)&&opts.basisRate,perUnit:['full','split','glass'].includes(mode)},
  items:[],extra:null,end:null,terms:'',signature:'',summary:null,notes:'',footerLeft:'',footerRight:''};

 const cell=(on,label,value)=>{if(on)model.meta.push({label,value:value||'—'});};
 cell(opts.date,sale?'Date':'Order date',docDate(order.createdAt)||docDate(new Date().toISOString()));
 cell(opts.customerPo,'Customer PO',order.customerPo);
 cell(opts.dueDate,'Due date',docDate(order.dueDate));
 if(sale)cell(opts.terms,'Terms',paymentTermsLabel(terms));
 cell(opts.priority,'Priority',salesPriorityLabel(order.priority));
 cell(opts.delivery,'Delivery',salesDeliveryLabel(order.delivery));
 cell(opts.salesRep,'Sales rep',C&&C.salesRep);
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
  if(order.delivery==='delivery'){const ad=C?customerAddressByType(C,'delivery'):null,t=docAddressText(ad);model.boxes.push({label:'Ship to',title:(ad&&ad.addressee)||model.customerName||'Delivery',lines:[t||'Delivery address not set']});}
  else model.boxes.push({label:'Pickup',title:'Customer pickup',lines:[]});
 }

 (order.lines||[]).forEach((l,i)=>model.items.push(sale?docSaleItem(model,l,i,order):docShopItem(model,l,i,order)));
 if(opts.extraItems&&(order.extraItems||[]).length){
  const priced=sale&&mode!=='none';
  model.extra={title:sale?'Additional items':'From stock',rows:order.extraItems.map(x=>{const total=salesExtraItemLineTotal(x),unit=salesExtraItemUnitPrice(x);
   return {name:salesExtraItemName(x),qty:'Qty '+salesPositiveInt(x.qty,1),rate:priced&&unit!=null?docMoney(unit):'',amount:priced?(total==null?'Rate required':docMoney(total)):''};})};
 }

 if(sale){
  const t=salesOrderCommercialTotals(order),c=t.charges,money=v=>t.complete?docMoney(v):'—',left=[];
  if(opts.paymentInstructions)left.push({label:'Payment',text:[company.paymentInstructions,'Please reference order '+number+' with your payment.'].filter(Boolean).join('\n')});
  if(opts.notes&&order.notes)left.push({label:'Order notes',text:order.notes});
  let rows=null,grand=null,deposit=null;
  if(opts.totals){
   rows=[];
   if(opts.groupTotals||mode==='glass'){
    const g={glass:0,services:0,surcharges:0,extra:0};
    (order.lines||[]).forEach(l=>{const p=salesLineCommercialPrice(l,order);if(!p.complete)return;const gl=salesMoney(p.materials*p.qty),su=salesMoney((p.unit-p.base)*p.qty);g.glass+=gl;g.surcharges+=su;g.services+=salesMoney(p.line-gl-su);});
    (order.extraItems||[]).forEach(x=>{const v=salesExtraItemLineTotal(x);if(v!=null)g.extra+=v;});
    rows.push({label:'Glass & IGU',value:money(salesMoney(g.glass))},{label:'Services and processing',value:money(salesMoney(g.services))});
    if(g.surcharges)rows.push({label:'Surcharges',value:money(salesMoney(g.surcharges))});
    if(g.extra)rows.push({label:'Additional items',value:money(salesMoney(g.extra))});
    rows.push({label:'Subtotal',value:money(t.subtotal),strong:true,sep:true});
   }else rows.push({label:'Subtotal',value:money(t.subtotal)});
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
   paid=[{label:'Paid to date · '+got.receipts+' receipt'+(got.receipts>1?'s':''),value:docMoney(got.paid)},{label:rest>0?'Balance due':rest<0?'Overpaid':'Paid in full',value:t.complete?docMoney(Math.abs(rest)):'—',tone:rest>0?'due':''}];
  }
  if(opts.payment){
   const pct=paymentDepositPercent(terms);
   if(terms.paymentMode==='credit')deposit=[{label:'Payment terms · '+paymentTermsLabel(terms),value:money(t.grand),strong:true},{label:terms.creditDays!=null?'Due within '+terms.creditDays+' days of invoice · no deposit':'On credit · no deposit',value:''}];
   else if(pct>0){
    const dep=salesMoney(t.grand*pct/100);
    if(paidSoFar>0&&paidSoFar>=dep)deposit=[{label:'Deposit received · '+pct+'%',value:money(dep),strong:true}];
    else deposit=[{label:(kind==='proforma'?'Deposit due now · ':'Deposit before production · ')+pct+'%',value:money(salesMoney(dep-paidSoFar)),strong:true},{label:'Balance on completion',value:money(salesMoney(t.grand-dep))}];
   }
   else deposit=[{label:'Payment due on completion',value:money(t.grand),strong:true}];
  }
  if(left.length||rows||deposit)model.end={left,rows,grand,paid,deposit,missing:t.complete?'':t.missing+(t.missing>1?' items need pricing':' item needs pricing')};
  if(opts.termsText&&company.termsText)model.terms=company.termsText;
  if(opts.signature)model.signature='Please check sizes, makeups and quantities. Production starts after this confirmation is signed'+(terms.paymentMode==='cash'&&paymentDepositPercent(terms)>0?' and the deposit is received.':'.');
  model.footerLeft=company.footerText||'';
 }else{
  if(opts.orderSummary){
   let units=0,area=0,kg=0,kgKnown=true;
   (order.lines||[]).forEach(l=>{const q=salesPositiveInt(l.qty,1),a=salesLineAreas(l,order),w=salesLineWeight(l,order);units+=q;if(a.valid)area+=a.actual*q;if(w.complete)kg+=w.lineKg;else kgKnown=false;});
   model.summary=[{label:'Glass units',value:String(units)},{label:'Total area',value:docNum(area,1)+' ft²'},{label:'Total weight',value:kgKnown?docNum(kg,0)+' kg':'—'},{label:'Due date',value:docDate(order.dueDate)||'—'}];
  }
  if(opts.notes&&order.notes)model.notes=order.notes;
  model.footerLeft='Internal · no prices';
 }
 model.footerRight=[company.legalName,docName+' '+number].filter(Boolean).join(' · ');
 return model;
}
