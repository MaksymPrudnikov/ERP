/* =====================================================================
   erp/sales/orders · sales-0.3b-makeup
   Draft order behavior, order-scoped makeups, Excel entry and bridges to
   the existing Shape / Muntin configurators.
   ===================================================================== */

let soEdit=null,soDraft=null,soSearch='',soMakeupId=null;
let soExcelMode='current';
let soSelectedLines=new Set();
let soOpenSectionKey=null;
let soPricingLineId=null,soServiceLineId=null,soServiceOrderOpen=false;
let salesBridge=null;

function salesFindCustomer(id){return (DB.customer||[]).find(c=>c.id===id)||null;}
function salesApplyCustomerDefaults(id){
 const c=salesFindCustomer(id);soDraft.customerId=id||'';if(!c)return;
 if(c.paymentTerms)soDraft.paymentTerms=c.paymentTerms;if(c.currency)soDraft.currency=c.currency;
 const dm=String(c.defaultDeliveryMethod||'').toLowerCase();if(dm.includes('pickup'))soDraft.delivery='pickup';else if(dm)soDraft.delivery='delivery';
}
function salesOrderSearchChange(el){soSearch=el.value;const pos=el.selectionStart;render();requestAnimationFrame(()=>{const e=document.getElementById('salesOrderSearch');if(e){e.focus();try{e.setSelectionRange(pos,pos);}catch(x){}}});}
function salesOrderNew(){soEdit='new';soDraft=newSalesOrderDraft();soMakeupId=soDraft.makeups[0].id;soSelectedLines=new Set();soOpenSectionKey=null;soPricingLineId=null;soServiceLineId=null;soServiceOrderOpen=false;subtab='orders';render();}
function salesOrderEdit(id){const o=DB.salesOrder.find(x=>x.id===id);if(!o)return;soEdit=id;soDraft=JSON.parse(JSON.stringify(o));soDraft=normalizeSalesOrder(soDraft);soMakeupId=(soDraft.makeups[0]||{}).id||null;soSelectedLines=new Set();soOpenSectionKey=null;soPricingLineId=null;soServiceLineId=null;soServiceOrderOpen=false;subtab='orders';render();}
/* Закрытие черновика спрашивает подтверждение, если в нём есть что терять.
   Раньше Close молча стирал введённые строки — оператор терял работу без единого
   сообщения. Сравниваем с сохранённым состоянием: у нового заказа терять нечего,
   пока в нём нет строк. */
function salesDraftHasWork(){
 if(!soDraft)return false;
 if(soEdit==='new')return soDraft.lines.length>0;
 const saved=DB.salesOrder.find(x=>x.id===soEdit);
 return saved?JSON.stringify(saved)!==JSON.stringify(normalizeSalesOrder(soDraft)):soDraft.lines.length>0;
}
function salesOrderClose(){
 if(salesDraftHasWork()&&!confirm('Close without saving? Unsaved changes to this order will be lost.'))return;
 soEdit=null;soDraft=null;soMakeupId=null;soSelectedLines=new Set();soOpenSectionKey=null;soPricingLineId=null;soServiceLineId=null;soServiceOrderOpen=false;salesBridge=null;render();
}
function salesOrderSave(){
 const e=document.getElementById('e_sales_order');if(e)e.style.display='none';
 salesSnapshotAllChargePricing();
 soDraft=normalizeSalesOrder(soDraft);if(!soDraft.customerId)return fail(e,'Select a Customer');
 const customer=salesFindCustomer(soDraft.customerId);if(!customer)return fail(e,'Customer not found');
 /* Строка без размера уезжала в Draft молча и всплывала уже в цеху.
    Размер обязателен всегда — и когда введён руками, и когда пришёл из Shape. */
 const noDim=soDraft.lines.map((l,i)=>(!l.width16||!l.height16)?i+1:0).filter(Boolean);
 if(noDim.length)return fail(e,noDim.length===1
   ?'Line '+noDim[0]+' has no width or height. Enter the size or remove the line.'
   :'Lines without width or height: '+noDim.join(', ')+'. Enter the sizes or remove these lines.');
 if(!soDraft.businessNumber)soDraft.businessNumber=nextSalesOrderNumber();
 soDraft.updatedAt=new Date().toISOString();if(!soDraft.createdAt)soDraft.createdAt=soDraft.updatedAt;
 if(soEdit==='new')DB.salesOrder.push(soDraft);else{const i=DB.salesOrder.findIndex(x=>x.id===soEdit);if(i>=0)DB.salesOrder[i]=soDraft;else DB.salesOrder.push(soDraft);}
 normalizeSalesData();soEdit=soDraft.id;soDraft=JSON.parse(JSON.stringify(DB.salesOrder.find(x=>x.id===soEdit)));if(!salesMakeupById(soDraft,soMakeupId))soMakeupId=soDraft.makeups[0].id;touch();render();
}
function salesOrderDelete(id){const i=DB.salesOrder.findIndex(x=>x.id===id);if(i<0)return;if(!confirm('Delete this Draft Sales Order?'))return;DB.salesOrder.splice(i,1);touch();render();}

function salesCurrentMakeup(){if(!soDraft)return null;let m=salesMakeupById(soDraft,soMakeupId);if(!m)m=soDraft.makeups[0]||null;if(m)soMakeupId=m.id;return m;}
function salesSelectMakeup(id){if(salesMakeupById(soDraft,id)){soMakeupId=id;soOpenSectionKey=null;render();}}
function salesAddMakeup(){const now=new Date().toISOString(),m=normalizeOrderMakeup({code:nextMakeupCode(soDraft),unitType:'double',createdAt:now,updatedAt:now},soDraft.makeups.length);soDraft.makeups.push(m);soMakeupId=m.id;soOpenSectionKey=null;render();}
function salesDuplicateMakeup(id){const src=salesMakeupById(soDraft,id);if(!src)return;const copy=JSON.parse(JSON.stringify(src));copy.id=salesUid('MU');copy.code=nextMakeupCode(soDraft);copy.createdAt=copy.updatedAt=new Date().toISOString();copy.panes.forEach((p,i)=>p.id=salesUid('LITE'));copy.cavities.forEach(c=>c.id=salesUid('CAV'));soDraft.makeups.push(copy);soMakeupId=copy.id;soOpenSectionKey=null;render();}
function salesDeleteMakeup(id){const m=salesMakeupById(soDraft,id);if(!m)return;if(soDraft.makeups.length<=1)return alert('A Sales Order must keep at least one Makeup.');const used=soDraft.lines.filter(l=>l.makeupId===id).length;if(used)return alert('Makeup '+m.code+' is used by '+used+' line(s). Reassign those lines first.');if(!confirm('Delete Makeup '+m.code+'?'))return;soDraft.makeups=soDraft.makeups.filter(x=>x.id!==id);if(soMakeupId===id)soMakeupId=soDraft.makeups[0].id;soOpenSectionKey=null;render();}
function salesSetUnitType(v){const m=salesCurrentMakeup();if(!m||!SALES_UNIT_TYPES.includes(v))return;const count=salesPaneCount(v);m.unitType=v;while(m.panes.length<count)m.panes.push(salesDefaultPane(m.panes.length));m.panes=m.panes.slice(0,count).map(normalizeSalesPane);while(m.cavities.length<count-1)m.cavities.push(salesDefaultCavity(m.cavities.length));m.cavities=m.cavities.slice(0,Math.max(0,count-1)).map(normalizeSalesCavity);m.updatedAt=new Date().toISOString();soOpenSectionKey=null;render();}
function salesSetPaneCategory(i,v){const m=salesCurrentMakeup();if(!m||!m.panes[i]||!SALES_LITE_CATEGORIES.includes(v))return;const p=m.panes[i];p.category=v;if(v==='spandrel'){p.visionType='uncoated';p.coatingSurface=null;salesPaneEnsureProduct(p);}render();}
function salesProductFamilyForPane(p){return p.visionType==='frit'?'uncoated':p.visionType;}
function salesGlassCandidates(p){const fam=salesProductFamilyForPane(p);return activeGlassProducts().filter(g=>(!p.manufacturer||g.manufacturer===p.manufacturer)&&(!p.thicknessMm||g.thicknessMm===+p.thicknessMm)&&(!fam||g.coatingFamily===fam));}
function salesPaneEnsureProduct(p){const rows=salesGlassCandidates(p);if(!rows.some(x=>x.id===p.glassProductId))p.glassProductId=(rows[0]||{}).id||'';}
function salesPaneSetManufacturer(i,v){const p=salesCurrentMakeup().panes[i];p.manufacturer=v;salesPaneEnsureProduct(p);render();}
function salesPaneSetThickness(i,v){const p=salesCurrentMakeup().panes[i];p.thicknessMm=+v||6;salesPaneEnsureProduct(p);render();}
function salesPaneSetVisionType(i,v){const p=salesCurrentMakeup().panes[i];if(!SALES_VISION_TYPES.includes(v))return;p.visionType=v;p.coatingSurface=null;if(v==='frit')p.frit.surface=null;salesPaneEnsureProduct(p);render();}
/* Поверхности, на которых это покрытие вообще законно. `allowed_surfaces`
   каталога — номера в пакете (2,3 у напылённых), а Lite держит свою пару
   (#1 #2 снаружи, #3 #4 внутри); пересечение и есть ответ. Пустое пересечение
   означает, что каталог и конструкция не сходятся — тогда показываем всё и не
   мешаем человеку работать. */
function salesAllowedCoatingSurfaces(p,index){
 const nums=salesPaneSurfaces(index),g=glassProductById(p.glassProductId);
 if(!g||!g.allowedSurfaces.length)return nums;
 const ok=nums.filter(n=>g.allowedSurfaces.indexOf(n)>=0);
 return ok.length?ok:nums;
}
/* Смена продукта подставляет ЗАКОННУЮ поверхность по умолчанию: у напыления
   это #2 снаружи. Выбор при этом не запирается — вторая кнопка остаётся
   нажимаемой, просто помечена как не по каталогу. */
function salesPaneSetProduct(i,v){
 const p=salesCurrentMakeup().panes[i],g=glassProductById(v);
 p.glassProductId=v;
 if(g){p.manufacturer=g.manufacturer;p.thicknessMm=g.thicknessMm;}
 if(g&&(p.visionType==='lowe'||p.visionType==='reflective')){
  const ok=salesAllowedCoatingSurfaces(p,i);
  if(ok.indexOf(+p.coatingSurface)<0)p.coatingSurface=ok[0]||null;
 }
 render();
}
/* Первый шаг выбора: ПОКРЫТИЕ. Второй — на каком стекле оно лежит. Пока шаг
   был один, Vitro 6 мм Low-E выкатывал 92 строки одним списком. */
function salesPaneSetCoating(i,coating){
 const p=salesCurrentMakeup().panes[i],rows=salesGlassVariants(p,coating);
 if(!rows.length)return render();
 /* уже выбранное стекло того же покрытия не сбрасываем */
 if(rows.some(g=>g.id===p.glassProductId))return render();
 /* Базовое стекло переносим: сменить покрытие — значит сменить покрытие, а не
    вернуться к первой подложке в списке. Solarban 60 on Azuria → Solarban 90
    on Azuria, и человек не выбирает подложку заново на каждом шаге. */
 const base=glassBaseName(glassProductById(p.glassProductId));
 const same=base?rows.filter(g=>glassBaseName(g)===base)[0]:null;
 salesPaneSetProduct(i,(same||rows[0]).id);
}
function salesPaneSetHeat(i,v){salesCurrentMakeup().panes[i].heatTreatmentId=v;render();}
function salesPaneSetCoatingSurface(i,v){const p=salesCurrentMakeup().panes[i];p.coatingSurface=normalizeSurface(v,salesPaneSurfaces(i));render();}
function salesPaneSetFrit(i,k,v){const p=salesCurrentMakeup().panes[i];if(k==='surface')p.frit.surface=normalizeSurface(v,salesPaneSurfaces(i));else p.frit[k]=v;render();}
/* Диаметр точки и отступы — числа, а не свободный текст: мусор ловим прямо на
   поле, как на размерах строки заказа. Ноль в отступе законен и обязан
   сохраниться, поэтому у него отдельный парсер (см. salesMarginTo16). */
function salesFritDotChange(i,el){
 const p=salesCurrentMakeup().panes[i],n=+String(el.value).trim();
 if(!Number.isFinite(n)||n<=0){el.classList.add('bad');return;}
 p.frit.dotMm=n;el.value=String(n);el.classList.remove('bad');
}
function salesFritMarginChange(i,key,el){
 const p=salesCurrentMakeup().panes[i],n=salesMarginTo16(el.value);
 if(n==null){el.classList.add('bad');return;}
 p.frit[key]=n;el.value=salesMarginFrom16(n);el.classList.remove('bad');
}
function salesPaneSetSpandrel(i,k,v){const p=salesCurrentMakeup().panes[i];if(k==='surface')p.spandrel.surface=normalizeSurface(v,salesPaneSurfaces(i));else p.spandrel[k]=v;render();}
function salesPaneSetLam(i,k,v){salesCurrentMakeup().panes[i].laminated[k]=v;render();}
function salesCavitySet(i,k,v){const c=salesCurrentMakeup().cavities[i];if(c)c[k]=v;render();}

function salesOrderAddLine(makeupId,focus){const m=salesMakeupById(soDraft,makeupId)||salesCurrentMakeup();if(!m)return;const prev=soDraft.lines[soDraft.lines.length-1];soDraft.lines.push(normalizeSalesOrderLine({makeupId:m.id,qty:prev?prev.qty:1}));render();if(focus)setTimeout(salesFocusLastWidth,0);}
function salesOrderAddTen(){for(let i=0;i<10;i++)soDraft.lines.push(normalizeSalesOrderLine({makeupId:(salesCurrentMakeup()||soDraft.makeups[0]).id,qty:1}));render();}
function salesOrderRemoveLine(i){const l=soDraft.lines[i];if(l)soSelectedLines.delete(l.id);soDraft.lines.splice(i,1);render();}
function salesFocusLastWidth(){const a=document.querySelectorAll('[data-so-width]'),el=a[a.length-1];if(el&&!el.disabled){el.focus();try{el.select();}catch(e){}}}
function salesLineDimChange(i,key,el){const n=salesDimTo16(el.value);if(!n){soDraft.lines[i][key+'16']=null;el.classList.add('bad');return;}soDraft.lines[i][key+'16']=n;el.value=salesDimFrom16(n);el.classList.remove('bad');}
function salesLineMarkKey(i,e){if(e.key!=='Tab'||e.shiftKey)return;const l=soDraft.lines[i];if(!l||!l.width16||!l.height16)return;e.preventDefault();salesOrderAddLine(l.makeupId,true);}
function salesToggleLine(id,on){if(on)soSelectedLines.add(id);else soSelectedLines.delete(id);salesRefreshBulkBar();}
function salesToggleAllLines(on){soSelectedLines=new Set(on?soDraft.lines.map(l=>l.id):[]);render();}
function salesRefreshBulkBar(){const el=document.getElementById('salesBulkCount');if(el)el.textContent=soSelectedLines.size+' selected';}
function salesAssignSelected(makeupId){if(!makeupId||!salesMakeupById(soDraft,makeupId))return;soDraft.lines.forEach(l=>{if(soSelectedLines.has(l.id))l.makeupId=makeupId;});render();}

function salesExcelOpen(){document.getElementById('salesExcelModal').classList.add('show');}
function salesExcelClose(){const m=document.getElementById('salesExcelModal');if(m)m.classList.remove('show');}
function salesExcelSetMode(v){soExcelMode=v==='withMakeup'?'withMakeup':'current';const hint=document.getElementById('salesExcelCols');if(hint)hint.textContent=soExcelMode==='withMakeup'?'MU | Qty | Width | Height | Mark':'Qty | Width | Height | Mark';}
function salesExcelApply(){
 const text=document.getElementById('salesExcelText').value,rows=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);let added=0,bad=0;const current=salesCurrentMakeup();
 /* Порядок колонок совпадает с таблицей строк заказа: Width, затем Height.
    Раньше вставка ждала Height первым, а таблица показывала Width — на пачке
    строк это давало перевёрнутые размеры, самую дорогую ошибку в стекле. */
 rows.forEach(r=>{const c=r.split(/\t|,|;/).map(x=>x.trim());let mu=current,q,h,w,mark;if(soExcelMode==='withMakeup'){if(c.length<5){bad++;return;}mu=soDraft.makeups.find(m=>m.code.toUpperCase()===String(c[0]).toUpperCase());q=salesPositiveInt(c[1],0);w=salesDimTo16(c[2]);h=salesDimTo16(c[3]);mark=c[4];}else{if(c.length<4){bad++;return;}q=salesPositiveInt(c[0],0);w=salesDimTo16(c[1]);h=salesDimTo16(c[2]);mark=c[3];}
  if(!mu||!q||!h||!w){bad++;return;}soDraft.lines.push(normalizeSalesOrderLine({makeupId:mu.id,qty:q,height16:h,width16:w,mark}));added++;
 });
 salesExcelClose();render();if(bad)alert('Rows added: '+added+'. Skipped: '+bad);else if(added)alert('Rows added: '+added);
}

/* ---------- Sales pricing · PR3 clickable prototype ----------
   Geometry and quantities are always derived from Shape / line Qty. Only the
   monetary rate can be overridden in the Sales Order. Catalog rates are snapped
   into the order on save so later catalog changes do not rewrite old orders. */
const SALES_SERVICE_RATE_TABLE={
 clamp:{'6':5,'8-10':8,'12-19':10},hinge:{'6':10,'8-10':15,'12-19':20},
 hole:{'0.5-1':{'6':5,'8-10':6,'12-19':7},'1-2':{'6':6,'8-10':7,'12-19':8},'2-3':{'6':7,'8-10':8,'12-19':9},'3-4':{'6':8,'8-10':12,'12-19':15},'4+':{'6':10,'8-10':15,'12-19':25}},
 roughArris:{'6':.01,'8-10':.02,'12-19':.03},flatPolish:{'6':.07,'8-10':.10,'12-19':.13},cncShapePolish:{'6':.28,'8-10':.38,'12-19':.48},miter225:{'6':.28,'8-10':.38,'12-19':.45},radiusCorner:{'6':10,'8-10':12,'12-19':15}
};
function salesPricingThickness(line){const v=salesLineGlassThicknesses(line);if(v.length!==1)return {ok:false,thickness:v.length?v.join(' / '):'',band:''};const t=v[0];if(t===6)return {ok:true,thickness:t,band:'6'};if(t>=8&&t<=10)return {ok:true,thickness:t,band:'8-10'};if(t>=12&&t<=19)return {ok:true,thickness:t,band:'12-19'};return {ok:false,thickness:t,band:''};}
function salesPricingHoleBand(d){if(d>=.5&&d<=1)return {key:'0.5-1',label:'1/2″–1″'};if(d>1&&d<=2)return {key:'1-2',label:'1-1/16″–2″'};if(d>2&&d<=3)return {key:'2-3',label:'2-1/16″–3″'};if(d>3&&d<=4)return {key:'3-4',label:'3-1/16″–4″'};if(d>4)return {key:'4+',label:'> 4″'};return null;}
function salesCatalogRate(tableKey,ctx,subKey){if(!ctx.ok)return null;const t=SALES_SERVICE_RATE_TABLE[tableKey];if(!t)return null;if(subKey)return t[subKey]&&t[subKey][ctx.band]!=null?t[subKey][ctx.band]:null;return t[ctx.band]!=null?t[ctx.band]:null;}
function salesChargeRow(key,label,basis,unit,rate,source){return {key:key,label:label,basis:+basis||0,unit:unit,catalogRate:rate==null?null:+rate,source:source||'Shape'};}
function salesLineChargeRows(line){
 const s=salesShapeByRef(line&&line.shapeRef),rows=[];if(!s)return rows;const r=ShapeModule.compute(s),ctx=salesPricingThickness(line),items=Array.isArray(s.manufacturingItems)?s.manufacturingItems:[];
 const miGroups={};items.forEach(function(item){if(item.type==='clamp'||item.type==='hinge'){const key=item.type;if(!miGroups[key])miGroups[key]={qty:0};miGroups[key].qty++;return;}if(item.type==='hole'){const d=fabParseDimStrict(item.diameter),hb=d.ok?salesPricingHoleBand(d.v):null,key=hb?'hole:'+hb.key:'hole:unpriced';if(!miGroups[key])miGroups[key]={qty:0,holeBand:hb};miGroups[key].qty++;}});
 if(miGroups.clamp)rows.push(salesChargeRow('MI:clamp:'+ctx.band,'Clamp',miGroups.clamp.qty,'pc',salesCatalogRate('clamp',ctx),'Manufacturing item'));
 if(miGroups.hinge)rows.push(salesChargeRow('MI:hinge:'+ctx.band,'Hinge',miGroups.hinge.qty,'pc',salesCatalogRate('hinge',ctx),'Manufacturing item'));
 Object.keys(miGroups).filter(k=>k.indexOf('hole:')===0).forEach(function(k){const g=miGroups[k],hb=g.holeBand,rate=hb?salesCatalogRate('hole',ctx,hb.key):null;rows.push(salesChargeRow('MI:'+k+':'+ctx.band,'Hole '+(hb?hb.label:'—'),g.qty,'pc',rate,'Manufacturing item'));});
 if(r&&r.valid){(r.edges||[]).forEach(function(g){(shapeEdgeOps(s,g.id)||[]).forEach(function(op){let id='',label=op.type,rate=null;if(op.type==='Rough Arris'){id='roughArris';rate=salesCatalogRate(id,ctx);}else if(op.type==='Flat Polish'){id='flatPolish';rate=salesCatalogRate(id,ctx);}else if(op.type==='CNC Shape Polish'){id='cncShapePolish';rate=salesCatalogRate(id,ctx);}else if(op.type==='Mitering'){id='miter'+String(op.angle||45).replace('.','_');label='Mitering '+(op.angle||45)+'°';rate=+op.angle===22.5?salesCatalogRate('miter225',ctx):null;}else if(op.type==='Beveling'){id='bevel:'+String(op.width||'');label='Beveling '+String(op.width||'');rate=null;}else return;const key='EDGE:'+id+':'+ctx.band,found=rows.find(x=>x.key===key);if(found)found.basis+=g.length;else rows.push(salesChargeRow(key,label,g.length,'in',rate,'Edge Processing'));});});
  const radiusCount=(s.features||[]).filter(f=>f.type==='radius'&&inch(f.radius)>0).length;if(radiusCount)rows.push(salesChargeRow('FEATURE:radius:'+ctx.band,'Radius Corner',radiusCount,'pc',salesCatalogRate('radiusCorner',ctx),'Shape feature'));
  const cutoutCount=(s.features||[]).filter(f=>f.type==='cutout').length;if(cutoutCount)rows.push(salesChargeRow('FEATURE:cutout:'+ctx.band,'Cutout',cutoutCount,'pc',null,'Shape feature'));
 }
 return rows.filter(x=>x.basis>0);
}
function salesChargeGroupKey(row){
 const p=String(row&&row.key||'').split(':');if(p[0]==='MI'){if(p[1]==='hole')return 'MI:hole:'+(p[2]||'unpriced');return 'MI:'+(p[1]||'');}
 if(p[0]==='EDGE'){if(p[1]==='bevel')return 'EDGE:bevel:'+(p[2]||'');return 'EDGE:'+(p[1]||'');}
 if(p[0]==='FEATURE')return 'FEATURE:'+(p[1]||'');return String(row&&row.key||'');
}
function salesOrderChargePricingRecord(row){const map=soDraft&&soDraft.servicePricing&&typeof soDraft.servicePricing==='object'?soDraft.servicePricing:{},r=map[salesChargeGroupKey(row)]||null;return r&&r.orderRate!=null?r.orderRate:null;}
function salesChargePricingState(line,row){
 const map=line.chargePricing&&typeof line.chargePricing==='object'?line.chargePricing:{},saved=Object.prototype.hasOwnProperty.call(map,row.key)?map[row.key]:null;
 /* Once an order is saved, even a missing catalog rate is a snapshot. Do not let
    a future catalog edit silently reprice an old order. */
 const catalog=saved?saved.catalogRate:row.catalogRate,lineRate=saved&&saved.orderRate!=null?saved.orderRate:null,orderRate=salesOrderChargePricingRecord(row);
 const effective=lineRate!=null?lineRate:(orderRate!=null?orderRate:catalog),origin=lineRate!=null?'line':(orderRate!=null?'order':(catalog!=null?'catalog':'missing'));
 return {catalogRate:catalog,orderRate:orderRate,lineRate:lineRate,effectiveRate:effective,manual:lineRate!=null,origin:origin,missing:effective==null};
}
function salesEnsureChargePricing(line,row){if(!line.chargePricing||typeof line.chargePricing!=='object')line.chargePricing={};if(!line.chargePricing[row.key])line.chargePricing[row.key]={catalogRate:row.catalogRate==null?null:row.catalogRate,orderRate:null};return line.chargePricing[row.key];}
function salesEnsureOrderServicePricing(){if(!soDraft.servicePricing||typeof soDraft.servicePricing!=='object')soDraft.servicePricing={};return soDraft.servicePricing;}
function salesSnapshotAllChargePricing(){if(!soDraft)return;(soDraft.lines||[]).forEach(function(line){salesLineChargeRows(line).forEach(function(row){salesEnsureChargePricing(line,row);});});}
function salesSetChargeOrderRate(lineId,key,v){const line=(soDraft.lines||[]).find(x=>x.id===lineId);if(!line)return;const row=salesLineChargeRows(line).find(x=>x.key===key);if(!row)return;const rec=salesEnsureChargePricing(line,row),txt=String(v==null?'':v).trim();if(txt===''){rec.orderRate=null;render();return;}const n=Number(txt);if(!Number.isFinite(n)||n<0){alert('Enter a valid non-negative line rate.');render();return;}rec.orderRate=Math.round(n*10000)/10000;render();}
function salesResetChargeRate(lineId,key){const line=(soDraft.lines||[]).find(x=>x.id===lineId);if(!line)return;const row=salesLineChargeRows(line).find(x=>x.key===key);if(!row)return;if(!line.chargePricing||typeof line.chargePricing!=='object')line.chargePricing={};const saved=Object.prototype.hasOwnProperty.call(line.chargePricing,key)?line.chargePricing[key]:null;line.chargePricing[key]={catalogRate:saved?saved.catalogRate:(row.catalogRate==null?null:row.catalogRate),orderRate:null};render();}
function salesSetOrderGroupRate(groupKey,v){
 const txt=String(v==null?'':v).trim(),map=salesEnsureOrderServicePricing();if(txt===''){delete map[groupKey];render();return;}const n=Number(txt);if(!Number.isFinite(n)||n<0){alert('Enter a valid non-negative order-wide rate.');render();return;}map[groupKey]={catalogRate:null,orderRate:Math.round(n*10000)/10000};
 /* A bulk order-rate edit means "all of this service". Clear old line exceptions
    for the same service; a specific line can be overridden again afterwards. */
 (soDraft.lines||[]).forEach(function(line){salesLineChargeRows(line).forEach(function(row){if(salesChargeGroupKey(row)!==groupKey)return;const rec=salesEnsureChargePricing(line,row);rec.orderRate=null;});});render();
}
function salesResetOrderGroupRate(groupKey){const map=salesEnsureOrderServicePricing();delete map[groupKey];(soDraft.lines||[]).forEach(function(line){salesLineChargeRows(line).forEach(function(row){if(salesChargeGroupKey(row)!==groupKey)return;const rec=salesEnsureChargePricing(line,row);rec.orderRate=null;});});render();}
function salesChargeBasisText(row,line){const q=salesPositiveInt(line.qty,1),total=row.basis*q;if(row.unit==='pc')return row.basis+' pc'+(q>1?' × '+q+' = '+total+' pc':'');return dimIn(row.basis)+(q>1?' × '+q+' = '+dimIn(total):'');}
function salesRateText(v,unit,currency){return v==null?'—':Number(v).toFixed(2)+' '+currency+'/'+(unit==='pc'?'pc':'in');}
function salesLinePricingSummary(line){const rows=salesLineChargeRows(line),q=salesPositiveInt(line.qty,1);let total=0,unpriced=0;rows.forEach(function(row){const st=salesChargePricingState(line,row);if(st.effectiveRate==null)unpriced++;else total+=row.basis*q*st.effectiveRate;});return {total:total,unpriced:unpriced,charges:rows.length,complete:unpriced===0};}
function salesOrderPricingSummary(){return (soDraft&&soDraft.lines||[]).reduce(function(a,l){const s=salesLinePricingSummary(l);a.total+=s.total;a.unpriced+=s.unpriced;a.charges+=s.charges;return a;},{total:0,unpriced:0,charges:0});}
function salesLinePricingTotal(line){return salesLinePricingSummary(line).total;}
function salesOrderPricingTotal(){return salesOrderPricingSummary().total;}
function salesTogglePricingLine(id){soPricingLineId=soPricingLineId===id?null:id;render();}
function salesOpenLineServices(id){soServiceLineId=id;soServiceOrderOpen=false;render();}
function salesOpenOrderServices(){soServiceLineId=null;soServiceOrderOpen=true;render();}
function salesCloseServices(){soServiceLineId=null;soServiceOrderOpen=false;render();}
function salesChargeShortLabel(row){const l=String(row.label||'');if(l==='Clamp')return 'CLMP';if(l==='Hinge')return 'HNG';if(l.indexOf('Hole ')===0)return 'HOLE';if(l==='Flat Polish')return 'POLI';if(l==='Rough Arris')return 'ARRIS';if(l==='CNC Shape Polish')return 'CNC POL';if(l.indexOf('Mitering')===0)return 'MITER';if(l==='Radius Corner')return 'RAD';if(l==='Cutout')return 'CUT';return l.slice(0,8).toUpperCase();}
function salesLineServicesSummary(line){
 const rows=salesLineChargeRows(line),q=salesPositiveInt(line.qty,1),currency=soDraft.currency||'CAD';if(!rows.length)return `<button type='button' class='line-services-btn empty' onclick='salesOpenLineServices("${esc(line.id)}")'><span>—</span><small>Сервисы</small></button>`;
 const summary=salesLinePricingSummary(line),chips=rows.slice(0,2).map(function(r){const n=r.basis*q;return `<span>${esc(salesChargeShortLabel(r))}×${r.unit==='pc'?esc(n):esc(dimIn(n))}</span>`;}).join(''),more=rows.length>2?`<i>+${rows.length-2}</i>`:'';
 return `<button type='button' class='line-services-btn${summary.unpriced?' incomplete':''}' onclick='salesOpenLineServices("${esc(line.id)}")'><span class='line-services-chips'>${chips}${more}</span><span class='line-services-money'><b>${summary.total.toFixed(2)} ${esc(currency)}</b>${summary.unpriced?`<small>${summary.unpriced} без цены</small>`:''}</span></button>`;
}
function salesOrderChargeGroups(){
 const groups=Object.create(null);(soDraft.lines||[]).forEach(function(line,lineIndex){salesLineChargeRows(line).forEach(function(row){const gk=salesChargeGroupKey(row),q=salesPositiveInt(line.qty,1);if(!groups[gk])groups[gk]={key:gk,label:row.label,unit:row.unit,entries:[],basis:0,catalogRates:[]};const g=groups[gk],st=salesChargePricingState(line,row),basis=row.basis*q;g.entries.push({line:line,lineIndex:lineIndex,row:row,state:st,basis:basis});g.basis+=basis;if(st.catalogRate!=null&&!g.catalogRates.includes(st.catalogRate))g.catalogRates.push(st.catalogRate);});});
 return Object.keys(groups).map(function(k){const g=groups[k];g.catalogRates.sort(function(a,b){return a-b;});g.orderRate=(soDraft.servicePricing&&soDraft.servicePricing[k]&&soDraft.servicePricing[k].orderRate!=null)?soDraft.servicePricing[k].orderRate:null;g.lineOverrides=g.entries.filter(function(e){return e.state.lineRate!=null;}).length;g.unpriced=g.entries.filter(function(e){return e.state.effectiveRate==null;}).length;g.total=g.entries.reduce(function(n,e){return n+(e.state.effectiveRate==null?0:e.basis*e.state.effectiveRate);},0);return g;});
}
function salesOrderGroupBasisText(g){return g.unit==='pc'?g.basis+' pc':dimIn(g.basis);}
function salesOrderGroupCatalogText(g,currency){if(!g.catalogRates.length)return '—';if(g.catalogRates.length===1)return salesRateText(g.catalogRates[0],g.unit,currency);return g.catalogRates.map(function(x){return Number(x).toFixed(2);}).join(' / ')+' '+currency+'/'+(g.unit==='pc'?'pc':'in');}

function salesShapeByRef(ref){return ref&&ref.id?DB.shapeDef.find(s=>s.id===ref.id)||null:null;}
function salesMuntinByRef(ref){return ref&&ref.id?DB.muntinDef.find(m=>m.id===ref.id)||null:null;}
/* Edge-processing allowance belongs to the glass selected in the line's Makeup,
   not to a manually entered Shape thickness. The Shape editor keeps the legacy
   schema field only as an internal calculation input so old saved definitions and
   v4.5 fingerprints remain compatible. */
function salesLineGlassThicknesses(line){
 const m=line&&soDraft?salesMakeupById(soDraft,line.makeupId):null,out=[];if(!m)return out;
 (m.panes||[]).forEach(p=>{const g=glassProductById(p.glassProductId),v=+(g&&g.thicknessMm!=null?g.thicknessMm:p.thicknessMm);if(Number.isFinite(v)&&v>0&&out.indexOf(v)<0)out.push(v);});
 return out.sort((a,b)=>a-b);
}
function salesApplyLineGlassThicknessToShape(line,shape){
 if(!shape)return null;const values=salesLineGlassThicknesses(line);
 if(values.length===1){shape.thickness=String(values[0]);return values[0];}
 /* Mixed-thickness IGUs do not have one safe allowance. Fail closed instead of
    silently using the old 6 mm default. A production rule can be added later if
    the owner defines how edgework should behave for mixed lite thicknesses. */
 if(values.length>1)shape.thickness='';
 return null;
}
function salesShapeRefFrom(s){const r=s&&ShapeModule.compute(s),ready=r&&(r.valid||(r.externalFile&&r.sourceValid));return s&&ready?{id:s.id,revision:s.revision||0,fingerprint:r.fingerprint||''}:{id:'',revision:null,fingerprint:''};}
function salesMuntinRefFrom(m){return m?{id:m.id,shapeId:m.shapeId||'',shapeRevision:m.shapeRevision==null?null:m.shapeRevision}:{id:'',shapeId:'',shapeRevision:null};}
function salesSyncLineFromShape(line,s){const r=s&&ShapeModule.compute(s),external=r&&r.externalFile&&r.sourceValid;if(!r||(!r.valid&&!external))return false;line.width16=Math.round(r.width*16);line.height16=Math.round(r.height*16);line.shapeRef=salesShapeRefFrom(s);if(line.muntinRef&&line.muntinRef.id&&line.muntinRef.shapeId!==s.id)line.muntinRef=normalizeMuntinRef({});return true;}
function salesOrderConfigureShape(i){
 const line=soDraft.lines[i];if(!line)return;salesBridge={kind:'shape',lineId:line.id};tab='configurators';subtab='shape';sView='setup';sEdgeworkOpen=false;sFeaturesOpen=false;
 const current=salesShapeByRef(line.shapeRef);if(current){const idx=DB.shapeDef.findIndex(s=>s.id===current.id);sEdit=idx;sDraft=normalizeShapeDef(JSON.parse(JSON.stringify(current)));}
 else{sEdit='new';sDraft=newShapeDef('rectangle');sDraft.name=(soDraft.businessNumber||'SO')+' · '+(line.mark||('Line '+(i+1)));if(line.width16)sDraft.w=salesDimFrom16(line.width16);if(line.height16)sDraft.h=salesDimFrom16(line.height16);}
 salesApplyLineGlassThicknessToShape(line,sDraft);
 render();
}
function salesBridgeOnShapeSaved(id){if(!salesBridge||salesBridge.kind!=='shape'||!soDraft)return false;const line=soDraft.lines.find(l=>l.id===salesBridge.lineId),s=DB.shapeDef.find(x=>x.id===id);if(line&&s)salesSyncLineFromShape(line,s);salesBridge=null;sEdit=null;sDraft=null;tab='sales';subtab='orders';touch();render();return true;}
function salesUnlinkShape(i){const l=soDraft.lines[i];if(!l)return;if(l.muntinRef&&l.muntinRef.id&&!confirm('This Shape is linked to a Muntin layout. Unlink both?'))return;l.shapeRef=normalizeShapeRef({});l.muntinRef=normalizeMuntinRef({});render();}
function salesOrderConfigureMuntin(i){
 const line=soDraft.lines[i];if(!line)return;const shape=salesShapeByRef(line.shapeRef);if(!shape)return alert('Configure the Shape for this line first.');salesBridge={kind:'muntin',lineId:line.id};tab='configurators';subtab='muntin';mFieldErrors={};
 const current=salesMuntinByRef(line.muntinRef);if(current){mEdit=DB.muntinDef.findIndex(m=>m.id===current.id);mDraft=JSON.parse(JSON.stringify(current));mDraft.muntin=normalizeMuntinModel(mDraft.muntin);}
 else{mEdit='new';mDraft=newMuntinDef(shape.id);mDraft.name=(soDraft.businessNumber||'SO')+' · '+(line.mark||('Line '+(i+1)))+' Muntin';pinMuntinShape(mDraft,shape);}
 render();
}
function salesBridgeOnMuntinSaved(id){if(!salesBridge||salesBridge.kind!=='muntin'||!soDraft)return false;const line=soDraft.lines.find(l=>l.id===salesBridge.lineId),m=DB.muntinDef.find(x=>x.id===id);if(line&&m)line.muntinRef=salesMuntinRefFrom(m);salesBridge=null;mEdit=null;mDraft=null;mFieldErrors={};tab='sales';subtab='orders';touch();render();return true;}
function salesUnlinkMuntin(i){const l=soDraft.lines[i];if(l){l.muntinRef=normalizeMuntinRef({});render();}}

function salesBridgeCancel(kind){if(!salesBridge||salesBridge.kind!==kind)return false;salesBridge=null;if(kind==='shape'){sEdit=null;sDraft=null;}if(kind==='muntin'){mEdit=null;mDraft=null;mFieldErrors={};}tab='sales';subtab='orders';render();return true;}
