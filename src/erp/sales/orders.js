/* =====================================================================
   erp/sales/orders · sales-0.3b-makeup
   Draft order behavior, order-scoped makeups, Excel entry and bridges to
   the existing Shape / Muntin configurators.
   ===================================================================== */

let soEdit=null,soDraft=null,soSearch='',soMakeupId=null;
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
function salesOrderNew(){salesExcelReset();soEdit='new';soDraft=newSalesOrderDraft();soMakeupId=soDraft.makeups[0].id;soSelectedLines=new Set();soOpenSectionKey='lite-0';soPricingLineId=null;soServiceLineId=null;soServiceOrderOpen=false;subtab='orders';render();}
function salesOrderEdit(id){const o=DB.salesOrder.find(x=>x.id===id);if(!o)return;salesExcelReset();soEdit=id;soDraft=JSON.parse(JSON.stringify(o));soDraft=normalizeSalesOrder(soDraft);salesEnsureAllLineShapes();soMakeupId=(soDraft.makeups[0]||{}).id||null;soSelectedLines=new Set();soOpenSectionKey='lite-0';soPricingLineId=null;soServiceLineId=null;soServiceOrderOpen=false;subtab='orders';render();}
/* Закрытие черновика спрашивает подтверждение, если в нём есть что терять.
   Раньше Close молча стирал введённые строки — оператор терял работу без единого
   сообщения. Сравниваем с сохранённым состоянием: у нового заказа терять нечего,
   пока в нём нет строк. */
function salesDraftHasWork(){
 if(!soDraft)return false;
 if(soEdit==='new')return soDraft.lines.length>1||soDraft.lines.some(l=>!salesOrderLineIsBlank(l));
 const saved=DB.salesOrder.find(x=>x.id===soEdit);
 return saved?JSON.stringify(saved)!==JSON.stringify(normalizeSalesOrder(soDraft)):soDraft.lines.length>0;
}
function salesOrderClose(){
 if(salesDraftHasWork()&&!confirm('Close without saving? Unsaved changes to this order will be lost.'))return;
 salesExcelReset();soEdit=null;soDraft=null;soMakeupId=null;soSelectedLines=new Set();soOpenSectionKey=null;soPricingLineId=null;soServiceLineId=null;soServiceOrderOpen=false;salesBridge=null;render();
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
 const temperWarnings=salesTemperCompatibilityWarnings(soDraft);
 if(temperWarnings.length&&!confirm('Glass / heat-treatment warning:\n\n- '+temperWarnings.join('\n- ')+'\n\nSave this order anyway?'))return;
 if(!soDraft.businessNumber)soDraft.businessNumber=nextSalesOrderNumber();
 soDraft.updatedAt=new Date().toISOString();if(!soDraft.createdAt)soDraft.createdAt=soDraft.updatedAt;
 if(soEdit==='new')DB.salesOrder.push(soDraft);else{const i=DB.salesOrder.findIndex(x=>x.id===soEdit);if(i>=0)DB.salesOrder[i]=soDraft;else DB.salesOrder.push(soDraft);}
 normalizeSalesData();soEdit=soDraft.id;soDraft=JSON.parse(JSON.stringify(DB.salesOrder.find(x=>x.id===soEdit)));if(!salesMakeupById(soDraft,soMakeupId))soMakeupId=soDraft.makeups[0].id;touch();render();
}
function salesOrderDelete(id){const i=DB.salesOrder.findIndex(x=>x.id===id);if(i<0)return;if(!confirm('Delete this Draft Sales Order?'))return;DB.salesOrder.splice(i,1);touch();render();}

function salesCurrentMakeup(){if(!soDraft)return null;let m=salesMakeupById(soDraft,soMakeupId);if(!m)m=soDraft.makeups[0]||null;if(m)soMakeupId=m.id;return m;}
function salesSelectMakeup(id){if(salesMakeupById(soDraft,id)){soMakeupId=id;soOpenSectionKey='lite-0';render();}}
function salesAddMakeup(){const now=new Date().toISOString(),m=normalizeOrderMakeup({code:nextMakeupCode(soDraft),unitType:'double',createdAt:now,updatedAt:now},soDraft.makeups.length);soDraft.makeups.push(m);soMakeupId=m.id;soOpenSectionKey='lite-0';render();}
function salesDuplicateMakeup(id){const src=salesMakeupById(soDraft,id);if(!src)return;const copy=JSON.parse(JSON.stringify(src));copy.id=salesUid('MU');copy.code=nextMakeupCode(soDraft);copy.createdAt=copy.updatedAt=new Date().toISOString();copy.panes.forEach((p,i)=>p.id=salesUid('LITE'));copy.cavities.forEach(c=>c.id=salesUid('CAV'));soDraft.makeups.push(copy);soMakeupId=copy.id;soOpenSectionKey='lite-0';render();}
function salesDeleteMakeup(id){const m=salesMakeupById(soDraft,id);if(!m)return;if(soDraft.makeups.length<=1)return alert('A Sales Order must keep at least one Makeup.');const used=soDraft.lines.filter(l=>l.makeupId===id).length;if(used)return alert('Makeup '+m.code+' is used by '+used+' line(s). Reassign those lines first.');if(!confirm('Delete Makeup '+m.code+'?'))return;soDraft.makeups=soDraft.makeups.filter(x=>x.id!==id);if(soMakeupId===id)soMakeupId=soDraft.makeups[0].id;soOpenSectionKey='lite-0';render();}
function salesSetUnitType(v){const m=salesCurrentMakeup();if(!m||!SALES_UNIT_TYPES.includes(v))return;const count=salesPaneCount(v);m.unitType=v;while(m.panes.length<count)m.panes.push(salesDefaultPane(m.panes.length));m.panes=m.panes.slice(0,count).map(normalizeSalesPane);while(m.cavities.length<count-1)m.cavities.push(salesDefaultCavity(m.cavities.length));m.cavities=m.cavities.slice(0,Math.max(0,count-1)).map(normalizeSalesCavity);m.updatedAt=new Date().toISOString();soOpenSectionKey='lite-0';render();}
function salesSetPaneCategory(i,v){const m=salesCurrentMakeup();if(!m||!m.panes[i]||!SALES_LITE_CATEGORIES.includes(v))return;const p=m.panes[i];p.category=v;if(v==='spandrel'){p.visionType='uncoated';p.coatingSurface=null;salesPaneEnsureProduct(p);}render();}
function salesProductFamilyForPane(p){return p.visionType==='frit'?'uncoated':p.visionType;}
function salesGlassCandidates(p){const fam=salesProductFamilyForPane(p),rows=activeGlassProducts().filter(g=>(!p.manufacturer||g.manufacturer===p.manufacturer)&&(!p.thicknessMm||g.thicknessMm===+p.thicknessMm)&&(!fam||g.coatingFamily===fam));return fam==='lowe'||fam==='reflective'?salesSortCoatedGlass(rows):salesSortGlass(rows,false);}
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
function salesPaneLamPly(i,side){const p=salesCurrentMakeup().panes[i];return p&&p.laminated&&(side==='outer'||side==='inner')?p.laminated[side]:null;}
function salesPaneEnsureLamPly(ply){const rows=salesLaminatedPlyCandidates(ply);if(!rows.some(g=>g.id===ply.glassProductId))ply.glassProductId=(rows[0]||{}).id||'';}
function salesPaneSetLamPly(i,side,key,v){
 const ply=salesPaneLamPly(i,side);if(!ply)return;
 if(key==='visionType'&&!SALES_LAMINATED_GLASS_TYPES.includes(v))return;
 if(key==='thicknessMm')ply.thicknessMm=+v||6;else ply[key]=v;
 if(key==='manufacturer'){const th=salesThicknessesFor(ply);if(th.length&&th.indexOf(+ply.thicknessMm)<0)ply.thicknessMm=th[0];}
 salesPaneEnsureLamPly(ply);render();
}
/* Laminated повторяет привычный выбор TYPE. Frit остаётся свойством одной
   конкретной ply, но выбирается там же, где Low-E / Reflective / Uncoated. */
function salesPaneSetLamPlyType(i,side,v){
 const ply=salesPaneLamPly(i,side),f=salesPaneEnsureLamFrit(ply);if(!ply||!f)return;
 if(v==='frit'){ply.visionType='uncoated';f.enabled=true;f.position=SALES_LAMINATED_FRIT_POSITIONS.includes(f.position)?f.position:'outside';}
 else{if(!SALES_LAMINATED_GLASS_TYPES.includes(v))return;ply.visionType=v;f.enabled=false;}
 salesPaneEnsureLamPly(ply);render();
}
function salesPaneSetLamPlyCoating(i,side,coating){
 const ply=salesPaneLamPly(i,side),rows=ply?salesGlassVariants(ply,coating):[];if(!rows.length)return render();
 const base=glassBaseName(glassProductById(ply.glassProductId)),same=base?rows.find(g=>glassBaseName(g)===base):null;
 salesPaneSetLamPlyProduct(i,side,(same||rows[0]).id);
}
function salesPaneSetLamPlyProduct(i,side,v){const ply=salesPaneLamPly(i,side),g=glassProductById(v);if(!ply)return;ply.glassProductId=v;if(g){ply.manufacturer=g.manufacturer;ply.thicknessMm=g.thicknessMm;if(SALES_LAMINATED_GLASS_TYPES.includes(g.coatingFamily))ply.visionType=g.coatingFamily;}render();}
function salesPaneSetLamPlyHeat(i,side,v){const ply=salesPaneLamPly(i,side);if(ply)ply.heatTreatmentId=v;render();}
function salesPaneEnsureLamFrit(ply){if(!ply)return null;if(!ply.frit)ply.frit=salesDefaultLaminatedFrit();return ply.frit;}
function salesPaneSetLamFrit(i,side,key,v){const f=salesPaneEnsureLamFrit(salesPaneLamPly(i,side));if(!f)return;if(key==='position'){if(!SALES_LAMINATED_FRIT_POSITIONS.includes(v))return;f.position=v;}else f[key]=v;render();}
function salesPaneSetLamFritText(i,side,key,v){const f=salesPaneEnsureLamFrit(salesPaneLamPly(i,side));if(f)f[key]=v;}
function salesLamFritDotChange(i,side,el){const f=salesPaneEnsureLamFrit(salesPaneLamPly(i,side)),n=+String(el.value).trim();if(!f||!Number.isFinite(n)||n<=0){el.classList.add('bad');return;}f.dotMm=n;el.value=String(n);el.classList.remove('bad');}
function salesLamFritMarginChange(i,side,key,el){const f=salesPaneEnsureLamFrit(salesPaneLamPly(i,side)),n=salesMarginTo16(el.value);if(!f||n==null){el.classList.add('bad');return;}f[key]=n;el.value=salesMarginFrom16(n);el.classList.remove('bad');}
function salesPaneSetLamInterlayer(i,slot,v){const p=salesCurrentMakeup().panes[i],layer=p&&p.laminated&&p.laminated.interlayers[slot];if(!layer)return;layer.productId=v;layer.layers=salesInterlayerLayerCount(layer.layers);layer.thicknessMm=salesInterlayerThicknessForLayers(layer.layers);render();}
function salesPaneSetLamInterlayerLayers(i,slot,v){const p=salesCurrentMakeup().panes[i],layer=p&&p.laminated&&p.laminated.interlayers[slot];if(!layer)return;layer.layers=salesInterlayerLayerCount(v);layer.thicknessMm=salesInterlayerThicknessForLayers(layer.layers);render();}
function salesPaneAddLamInterlayer(i){const p=salesCurrentMakeup().panes[i],rows=p&&p.laminated&&p.laminated.interlayers;if(!rows||rows.length>=SALES_MAX_INTERLAYERS)return;rows.push(normalizeSalesInterlayer({},'INT-PVB'));render();}
function salesPaneRemoveLamInterlayer(i,slot){const p=salesCurrentMakeup().panes[i],rows=p&&p.laminated&&p.laminated.interlayers;if(!rows||rows.length<=1)return;rows.splice(slot,1);render();}
function salesCavitySet(i,k,v){const c=salesCurrentMakeup().cavities[i];if(c)c[k]=v;render();}
/* Width — первый фильтр. При смене размера сохраняем текущую spacer-систему,
   если она выпускается в этом размере; иначе берём первый доступный вариант. */
function salesCavitySetWidth(i,size){
 const c=salesCurrentMakeup().cavities[i];if(!c)return;
 const current=salesCavitySpacer(c),rows=salesActiveSpacerVariants().filter(x=>x.size===size);
 const next=rows.find(x=>current&&x.system===current.system)||rows[0];
 if(next)c.spacerVariantId=next.id;render();
}

function salesOrderLineIsBlank(l){return !!l&&!l.width16&&!l.height16&&!salesString(l.mark)&&!salesString(l.notes)&&!(l.shapeRef&&l.shapeRef.id)&&!(l.muntinRef&&l.muntinRef.id)&&!Object.keys(l.chargePricing||{}).length&&salesPositiveInt(l.qty,1)===1;}
function salesOrderAddLine(makeupId,focus){const m=salesMakeupById(soDraft,makeupId)||salesCurrentMakeup();if(!m)return;const prev=soDraft.lines[soDraft.lines.length-1];soDraft.lines.push(normalizeSalesOrderLine({makeupId:m.id,qty:prev?prev.qty:1}));render();if(focus)setTimeout(salesFocusLastWidth,0);}
function salesOrderAddTen(){for(let i=0;i<10;i++)soDraft.lines.push(normalizeSalesOrderLine({makeupId:(salesCurrentMakeup()||soDraft.makeups[0]).id,qty:1}));render();}
/* Форма принадлежала строке — уходит вместе с ней. */
function salesOrderRemoveLine(i){salesDropLineLiteShapes(soDraft.lines[i]);salesDropLineOwnedShape(soDraft.lines[i]);const l=soDraft.lines[i];if(l)soSelectedLines.delete(l.id);soDraft.lines.splice(i,1);render();}
function salesFocusLastWidth(){const a=document.querySelectorAll('[data-so-width]'),el=a[a.length-1];if(el&&!el.disabled){el.focus();try{el.select();}catch(e){}}}
function salesLineDimChange(i,key,el){
 const line=soDraft.lines[i],n=salesDimTo16(el.value);
 if(!n){line[key+'16']=null;el.classList.add('bad');return;}
 line[key+'16']=n;el.value=salesDimFrom16(n);el.classList.remove('bad');
 /* Размеры появились или изменились — заводим/двигаем форму строки. */
 /* Форма заводится/двигается молча: render() здесь увёл бы каретку из строки
    при переходе Tab между Width, Height и Mark. */
 if(!salesEnsureLineShape(line))salesSyncShapeFromLine(line);
 touch();
}
function salesLineMarkKey(i,e){if(e.key!=='Tab'||e.shiftKey)return;const l=soDraft.lines[i];if(!l||!l.width16||!l.height16)return;e.preventDefault();salesOrderAddLine(l.makeupId,true);}
function salesToggleLine(id,on){if(on)soSelectedLines.add(id);else soSelectedLines.delete(id);salesRefreshBulkBar();}
function salesToggleAllLines(on){soSelectedLines=new Set(on?soDraft.lines.map(l=>l.id):[]);render();}
function salesRefreshBulkBar(){const el=document.getElementById('salesBulkCount');if(el)el.textContent=soSelectedLines.size+' selected';}
function salesAssignSelected(makeupId){if(!makeupId||!salesMakeupById(soDraft,makeupId))return;soDraft.lines.forEach(l=>{if(soSelectedLines.has(l.id))l.makeupId=makeupId;});render();}

/* ---------- Excel paste ----------
   Ввод — это ТАБЛИЦА с колонками Qty | Width | Height | Mark, а не текстовое
   поле: пользователь видит те же колонки, что и в строках заказа, и ячейку
   правит на месте. Блок, скопированный в Excel, раскладывается по колонкам сам
   при вставке в любую ячейку; MU и Edgework Set — необязательные колонки,
   которые включаются, если они пришли в буфере, а иначе берутся из селектов
   над таблицей.

   Почему так, а не поле с текстом: в поле «12 22 33 A1» — одна строка, и
   человеку не видно, где кончается ширина и начинается высота. Разделителем
   там был только таб, поэтому набранное руками через пробелы слипалось в одну
   ячейку. Теперь колонка — это колонка: и на экране, и в разборе. Пробелы,
   табы, `;` и `,` понимаются одинаково, дробь остаётся при своём числе
   ('30 1/2' — одно значение, а не два). */
const SALES_EXCEL_ROW_FIELDS=['mu','set','qty','width','height','mark'];
const SALES_EXCEL_ROLES=['skip','mu','ss','qty','width','height','mark'];
const SALES_EXCEL_ROLE_LABEL={skip:'ignore',mu:'MU',ss:'Set',qty:'Qty',width:'Width',height:'Height',mark:'Mark'};
const SALES_EXCEL_MIN_ROWS=6;
/* Шапку в файле клиента пишут как придётся — принимаем оба языка цеха и
   сокращения. Строка шапки в заказ не попадает, она только размечает колонки. */
const SALES_EXCEL_HEADER_WORDS={
 qty:['qty','quantity','q-ty','qnt','pcs','pc','pieces','count','кол-во','колво','количество','шт'],
 width:['width','w','wd','ширина'],
 height:['height','h','ht','hgt','высота'],
 mark:['mark','marks','tag','label','метка','марка','тег'],
 mu:['mu','makeup','make-up','makeup code','мейкап'],
 ss:['ss','set','sets','edgework','edgework set','service set','набор']
};
let soExcelOpen=false,soExcelRows=[],soExcelMakeupId='',soExcelSetId='',soExcelNote='';
let soExcelShowMu=false,soExcelShowSet=false,soExcelBlock=null,soExcelMapOpen=false;

function salesExcelSets(){return (soDraft&&soDraft.serviceSets)||[];}
function salesExcelSetById(id){return salesExcelSets().find(function(s){return s.id===id;})||null;}
function salesExcelMakeups(){return (soDraft&&soDraft.makeups)||[];}
function salesExcelDefaultMakeup(){return (soDraft&&salesMakeupById(soDraft,soExcelMakeupId))||salesCurrentMakeup();}
function salesExcelByCode(list,code){const c=String(code||'').trim().toUpperCase();return c?(list.find(function(x){return String(x.code).toUpperCase()===c;})||null):null;}
function salesExcelBlankRow(){return {mu:'',set:'',qty:'',width:'',height:'',mark:''};}
function salesExcelRowIsBlank(r){return !SALES_EXCEL_ROW_FIELDS.some(function(f){return String((r&&r[f])||'').trim().length;});}
/* В таблице всегда есть куда напечатать следующую строку — как в Excel. */
function salesExcelEnsureRows(){
 soExcelRows=(soExcelRows||[]).filter(Boolean);
 while(soExcelRows.length<SALES_EXCEL_MIN_ROWS)soExcelRows.push(salesExcelBlankRow());
 if(!salesExcelRowIsBlank(soExcelRows[soExcelRows.length-1]))soExcelRows.push(salesExcelBlankRow());
}
function salesExcelReset(){
 soExcelOpen=false;soExcelRows=[];soExcelMakeupId='';soExcelSetId='';soExcelNote='';
 soExcelShowMu=false;soExcelShowSet=false;soExcelBlock=null;soExcelMapOpen=false;
 salesExcelEnsureRows();
}
/* Состояние окна живёт в модуле, а не в классе на DOM: render() перерисовывает
   весь экран, и класс .show вместе с набранным раньше терялся. */
function salesExcelOpen(){
 soExcelOpen=true;soExcelNote='';salesExcelEnsureRows();render();
 const el=document.querySelector('#salesExcelGrid input[data-c="qty"]');
 if(el){el.focus();try{el.select();}catch(e){}}
}
function salesExcelClose(){soExcelOpen=false;soExcelNote='';render();}
function salesExcelSetMakeup(id){soExcelMakeupId=(soDraft&&salesMakeupById(soDraft,id))?id:'';salesExcelRenderGrid();}
function salesExcelSetSet(id){soExcelSetId=salesExcelSetById(id)?id:'';salesExcelRenderGrid();}
function salesExcelToggleMu(){soExcelShowMu=!soExcelShowMu;if(!soExcelShowMu)soExcelRows.forEach(function(r){r.mu='';});render();}
function salesExcelToggleSet(){soExcelShowSet=!soExcelShowSet;if(!soExcelShowSet)soExcelRows.forEach(function(r){r.set='';});render();}
function salesExcelClearGrid(){soExcelRows=[];soExcelBlock=null;soExcelMapOpen=false;soExcelNote='';salesExcelEnsureRows();render();}
function salesExcelAddBlankRows(){for(let i=0;i<5;i++)soExcelRows.push(salesExcelBlankRow());salesExcelRenderGrid();}

/* ---- разбор вставленного блока ---- */
/* Кавычка открывает поле CSV только в НАЧАЛЕ ячейки: в этих данных '"' куда
   чаще знак дюйма ('30"'), чем обёртка поля, и трактовать его как обёртку
   значило бы склеивать соседние ячейки. */
function salesExcelSplitLine(line,sep){
 if(!sep)return salesExcelTokens(line);
 const out=[];let cur='',quoted=false,fresh=true;
 for(let i=0;i<line.length;i++){
  const ch=line.charAt(i);
  if(ch==='"'&&(fresh||quoted)){
   if(quoted&&line.charAt(i+1)==='"'){cur+='"';i++;fresh=false;continue;}
   quoted=!quoted;fresh=false;continue;
  }
  if(ch===sep&&!quoted){out.push(cur);cur='';quoted=false;fresh=true;continue;}
  cur+=ch;fresh=false;
 }
 out.push(cur);
 return out.map(salesExcelCellText);
}
function salesExcelCellText(v){return String(v==null?'':v).trim().replace(/^"([\s\S]*)"$/,'$1').trim();}
/* Разбивка по пробелам с одним правилом: дробь принадлежит предыдущему числу,
   иначе '34 13/16' развалилось бы на два размера. */
function salesExcelTokens(s){
 const out=[];
 String(s==null?'':s).trim().split(/\s+/).forEach(function(t){
  if(!t)return;
  const prev=out.length?out[out.length-1]:'';
  if(/^\d+\/\d+$/.test(t)&&/^\d+$/.test(prev))out[out.length-1]=prev+' '+t;
  else out.push(t);
 });
 return out;
}
function salesExcelHeaderRole(cell){
 const s=salesExcelCellText(cell).toLowerCase().replace(/[.:*#()]/g,'').replace(/\s+/g,' ').trim();
 if(!s)return '';
 let hit='';
 Object.keys(SALES_EXCEL_HEADER_WORDS).forEach(function(role){if(!hit&&SALES_EXCEL_HEADER_WORDS[role].indexOf(s)>=0)hit=role;});
 return hit;
}
/* Шапка — строка из слов без единого размера. '1 30 80 A1' под это не попадает
   и уедет в заказ строкой данных. */
function salesExcelIsHeader(cells){
 let named=0,numeric=0;
 (cells||[]).forEach(function(c){if(!c)return;if(salesExcelHeaderRole(c))named++;if(fabParseDimStrict(c).ok)numeric++;});
 return named>=2&&!numeric;
}
function salesExcelDetectRoles(rows,cols,header){
 const roles=[];for(let i=0;i<cols;i++)roles.push('skip');
 if(header){
  header.forEach(function(c,i){const r=salesExcelHeaderRole(c);if(r&&roles.indexOf(r)<0&&i<cols)roles[i]=r;});
  /* Шапке верим, если она назвала оба размера: Qty необязателен, пустое Qty —
     это одна штука. Раньше шапка без Qty отбрасывалась целиком, и разметка по
     содержимому уезжала на колонку влево: Width попадал в Qty, Height в Width. */
  if(roles.indexOf('width')>=0&&roles.indexOf('height')>=0)return roles;
  /* Шапка понята наполовину — вторую половину не угадываем, размечаем по данным. */
  for(let i=0;i<cols;i++)roles[i]='skip';
 }
 const filled=[];
 for(let i=0;i<cols;i++)if(rows.some(function(r){return (r[i]||'').length;}))filled.push(i);
 const all=function(i,fn){return rows.some(function(r){return (r[i]||'').length;})&&rows.every(function(r){const v=r[i]||'';return !v.length||fn(v);});};
 const codes=function(list){const s=new Set();(list||[]).forEach(function(x){if(x&&x.code)s.add(String(x.code).toUpperCase());});return s;};
 const muCodes=codes(salesExcelMakeups()),ssCodes=codes(salesExcelSets());
 let k=0;
 if(k<filled.length&&muCodes.size&&all(filled[k],function(v){return muCodes.has(v.toUpperCase());})){roles[filled[k]]='mu';k++;}
 if(k<filled.length&&ssCodes.size&&all(filled[k],function(v){return ssCodes.has(v.toUpperCase());})){roles[filled[k]]='ss';k++;}
 /* Дальше — заявленный порядок таблицы. Лишние колонки клиентского файла
    остаются 'ignore' и в заказ не попадают. */
 ['qty','width','height','mark'].forEach(function(role){if(k<filled.length){roles[filled[k]]=role;k++;}});
 return roles;
}
function salesExcelParseBlock(text){
 const lines=String(text==null?'':text).replace(/\r\n?/g,'\n').split('\n').filter(function(l){return l.trim().length;});
 if(!lines.length)return null;
 const joined=lines.join('\n');
 const sep=joined.indexOf('\t')>=0?'\t':joined.indexOf(';')>=0?';':joined.indexOf(',')>=0?',':'';
 const rows=lines.map(function(l){return salesExcelSplitLine(l,sep);});
 let cols=0;rows.forEach(function(r){if(r.length>cols)cols=r.length;});
 /* Пустые крайние колонки (выделили в Excel лишний столбец) убираем: иначе при
    вставке в конкретную колонку весь блок уезжает на одну вправо. */
 while(cols>1&&rows.every(function(r){return !(r[0]||'').length;})){rows.forEach(function(r){r.shift();});cols--;}
 while(cols>1&&rows.every(function(r){return !(r[cols-1]||'').length;})){rows.forEach(function(r){if(r.length>=cols)r.length=cols-1;});cols--;}
 const header=salesExcelIsHeader(rows[0])?rows.shift():null;
 if(!rows.length)return null;
 return {rows:rows,cols:cols,header:header,roles:salesExcelDetectRoles(rows,cols,header),sep:sep};
}
/* Блок ложится в таблицу начиная с указанной строки — как вставка в Excel. */
function salesExcelFillFromBlock(block,start){
 if(!block)return 0;
 const roles=block.roles;
 if(roles.indexOf('mu')>=0)soExcelShowMu=true;
 if(roles.indexOf('ss')>=0)soExcelShowSet=true;
 const from=Math.max(0,+start||0);
 block.rows.forEach(function(cells,n){
  const i=from+n;
  while(soExcelRows.length<=i)soExcelRows.push(salesExcelBlankRow());
  const row=salesExcelBlankRow();
  roles.forEach(function(role,c){
   const v=salesExcelCellText(cells[c]);
   if(role==='skip'||!v)return;
   row[role==='ss'?'set':role]=v;
  });
  soExcelRows[i]=row;
 });
 salesExcelEnsureRows();
 return block.rows.length;
}
/* Если курсор стоит не в первой колонке, блок ложится ОТ НЕЁ — как в Excel:
   скопировал две колонки Width/Height, встал в Width, вставил. Разметка по
   содержимому в этом случае не гадает: пользователь уже показал, куда класть. */
function salesExcelPositionalRoles(cols,startField){
 const order=salesExcelFieldOrder();
 let at=order.indexOf(startField);
 if(at<0)at=order.indexOf('qty');
 const roles=[];
 for(let i=0;i<cols;i++){const f=order[at+i];roles.push(f?(f==='set'?'ss':f):'skip');}
 return roles;
}
/* Отдельная от события функция: ею же пользуются тесты и «Change columns». */
function salesExcelPasteText(text,start){
 const block=salesExcelParseBlock(text);
 if(!block)return 0;
 const n=salesExcelFillFromBlock(block,start);
 block.startRow=Math.max(0,+start||0);
 soExcelBlock=block;
 return n;
}
function salesExcelPaste(ev){
 const dt=ev&&(ev.clipboardData||window.clipboardData);
 if(!dt)return;
 const text=dt.getData('text/plain')||'';
 if(!text.trim())return;
 const block=salesExcelParseBlock(text);
 /* Одно значение — обычная вставка в ячейку, браузер справится сам. */
 if(!block||(block.rows.length===1&&block.rows[0].length<2&&!block.header))return;
 const cell=ev.target&&ev.target.getAttribute?ev.target:null;
 const target=cell?cell.getAttribute('data-r'):null,field=cell?cell.getAttribute('data-c'):null;
 ev.preventDefault();
 const start=target==null?0:(+target||0);
 /* Шапка или узнанные коды MU/Set — это цельный блок, его разметку не трогаем. */
 const whole=!!block.header||block.roles.indexOf('mu')>=0||block.roles.indexOf('ss')>=0;
 const order=salesExcelFieldOrder();
 if(!whole&&field&&field!==order[0])block.roles=salesExcelPositionalRoles(block.cols,field);
 salesExcelFillFromBlock(block,start);
 block.startRow=start;soExcelBlock=block;soExcelMapOpen=false;soExcelNote='';
 render();
 const el=document.querySelector('#salesExcelGrid input[data-r="'+start+'"][data-c="qty"]');
 if(el)el.focus();
}

/* ---- проверка строки ---- */
function salesExcelQty(raw){
 const t=String(raw||'').replace(/\s/g,'');
 if(!/^\d+(\.0+)?$/.test(t))return 0;
 const n=parseInt(t,10);
 return n>0?n:0;
}
function salesExcelValidateRow(row){
 const out={blank:salesExcelRowIsBlank(row),ok:false,qty:1,qtyAssumed:false,width16:null,height16:null,mark:'',mu:null,set:null,err:{},errors:[]};
 if(out.blank)return out;
 out.mark=salesString(row.mark);
 const muRaw=salesString(row.mu);
 if(muRaw){const m=salesExcelByCode(salesExcelMakeups(),muRaw);if(m)out.mu=m;else out.err.mu='Makeup '+muRaw+' is not in this order';}
 else out.mu=salesExcelDefaultMakeup();
 const setRaw=salesString(row.set);
 if(setRaw){const s=salesExcelByCode(salesExcelSets(),setRaw);if(s)out.set=s;else out.err.set='Set '+setRaw+' is not in this order';}
 else out.set=salesExcelSetById(soExcelSetId);
 const qtyRaw=salesString(row.qty);
 /* Пустое Qty — одна штука: так этот столбец и заполняют в файлах клиентов.
    Подстановка не молчаливая, в строке результата она помечена. */
 if(!qtyRaw){out.qty=1;out.qtyAssumed=true;}
 else{const q=salesExcelQty(qtyRaw);if(q)out.qty=q;else out.err.qty='Qty must be a whole number';}
 [['width','Width'],['height','Height']].forEach(function(pair){
  const f=pair[0],label=pair[1],v=salesString(row[f]);
  if(!v){out.err[f]=label+' is empty';return;}
  const n=salesDimTo16(v);
  if(n)out[f+'16']=n;else out.err[f]=label+' is not a size';
 });
 SALES_EXCEL_ROW_FIELDS.forEach(function(f){if(out.err[f])out.errors.push(out.err[f]);});
 out.ok=!out.errors.length;
 return out;
}
function salesExcelCounts(){
 let ready=0,bad=0;
 (soExcelRows||[]).forEach(function(r){const v=salesExcelValidateRow(r);if(v.blank)return;if(v.ok)ready++;else bad++;});
 return {ready:ready,bad:bad};
}
function salesExcelAddLabel(c){return c.ready?('Add '+c.ready+(c.ready===1?' row':' rows')):'Add rows';}

/* ---- таблица ---- */
function salesExcelColumns(){
 const cols=[];
 if(soExcelShowMu)cols.push({f:'mu',label:'MU',ph:'A',list:'salesExcelMuCodes',cls:'code'});
 if(soExcelShowSet&&salesExcelSets().length)cols.push({f:'set',label:'Set',ph:'S1',list:'salesExcelSetCodes',cls:'code'});
 cols.push({f:'qty',label:'Qty',ph:'2',cls:'qty'});
 cols.push({f:'width',label:'Width',ph:'30',cls:'dim'});
 cols.push({f:'height',label:'Height',ph:'80 1/2',cls:'dim'});
 cols.push({f:'mark',label:'Mark',ph:'A1',cls:'mark'});
 return cols;
}
function salesExcelColumnHint(){return salesExcelColumns().map(function(c){return c.label;}).join(' | ');}
function salesExcelFieldOrder(){return salesExcelColumns().map(function(c){return c.f;});}
function salesExcelRowStatusHtml(v){
 if(v.blank)return '';
 if(!v.ok)return `<span class="excel-err">${esc(v.errors.join(' · '))}</span>`;
 return `<span class="excel-ok">${esc(v.qty+' × '+salesDimFrom16(v.width16)+'″ × '+salesDimFrom16(v.height16)+'″')}</span>`+(v.qtyAssumed?'<em class="excel-assumed">qty 1</em>':'');
}
function salesExcelRowHtml(i){
 const row=soExcelRows[i];if(!row)return '';
 const v=salesExcelValidateRow(row),cols=salesExcelColumns();
 return `<tr data-row="${i}" class="${v.blank?'':(v.ok?'row-ok':'row-bad')}"><td class="n">${i+1}</td>`
  +cols.map(function(c){
    return `<td class="cell ${c.cls}"><input data-r="${i}" data-c="${c.f}" class="${v.err[c.f]?'cell-bad':''}" value="${esc(row[c.f]||'')}"${i===0?` placeholder="${esc(c.ph)}"`:''}${c.list?` list="${c.list}"`:''} oninput="salesExcelCellInput(${i},'${c.f}',this)" onchange="salesExcelCellChange(${i},'${c.f}',this)" onkeydown="salesExcelCellKey(event,${i},'${c.f}')"></td>`;
   }).join('')
  +`<td class="res">${salesExcelRowStatusHtml(v)}</td></tr>`;
}
function salesExcelGridInnerHtml(){
 if(!soDraft)return '';
 const cols=salesExcelColumns();
 return `<datalist id="salesExcelMuCodes">${salesExcelMakeups().map(function(m){return `<option value="${esc(m.code)}">`;}).join('')}</datalist>`
  +`<datalist id="salesExcelSetCodes">${salesExcelSets().map(function(s){return `<option value="${esc(s.code)}">`;}).join('')}</datalist>`
  +`<table class="excel-grid"><thead><tr><th class="n">#</th>${cols.map(function(c){return `<th class="${c.cls}">${c.label}</th>`;}).join('')}<th class="res">Result</th></tr></thead>`
  +`<tbody>${soExcelRows.map(function(r,i){return salesExcelRowHtml(i);}).join('')}</tbody></table>`;
}
function salesExcelSummaryHtml(c){
 c=c||salesExcelCounts();
 return `<b class="${c.ready?'sum-ok':'sum-mut'}">${c.ready} ready</b>${c.bad?`<b class="sum-bad">${c.bad===1?'1 needs a fix':c.bad+' need a fix'}</b>`:''}`;
}
/* Что именно взяли из последней вставки — одной строкой, с возможностью
   переназначить колонки, если файл клиента идёт в своём порядке. */
function salesExcelMapHtml(){
 if(!soExcelBlock)return '';
 const b=soExcelBlock,used=b.roles.filter(function(r){return r!=='skip';}).map(function(r){return SALES_EXCEL_ROLE_LABEL[r];}).join(' · ');
 const ignored=b.roles.filter(function(r){return r==='skip';}).length;
 return `<div class="excel-map"><span>Pasted ${b.cols} column${b.cols===1?'':'s'} → <b>${esc(used||'nothing')}</b>${ignored?`, ${ignored} ignored`:''}${b.header?', header row skipped':''}</span>`
  +`<button class="sm" onclick="salesExcelToggleMap()">${soExcelMapOpen?'Hide columns':'Change columns'}</button></div>`
  +(soExcelMapOpen?`<div class="excel-map-grid"><table class="excel-grid"><thead><tr>${b.roles.map(function(role,i){
     return `<th><select onchange="salesExcelSetRole(${i},this.value)">${SALES_EXCEL_ROLES.map(function(r){return `<option value="${r}" ${role===r?'selected':''}>${SALES_EXCEL_ROLE_LABEL[r]}</option>`;}).join('')}</select></th>`;
    }).join('')}</tr></thead><tbody data-raw>${b.rows.slice(0,4).map(function(cells){
     return `<tr>${b.roles.map(function(role,i){return `<td class="${role==='skip'?'off':''}">${esc(cells[i]||'')}</td>`;}).join('')}</tr>`;
    }).join('')}</tbody></table></div>`:'');
}
function salesExcelToggleMap(){soExcelMapOpen=!soExcelMapOpen;render();}
/* Роль занимает ровно одну колонку: две Width — это перевёрнутый размер,
   самая дорогая ошибка в стекле. */
function salesExcelSetRole(col,role){
 if(!soExcelBlock||SALES_EXCEL_ROLES.indexOf(role)<0)return;
 const roles=soExcelBlock.roles.slice();
 if(col<0||col>=roles.length)return;
 if(role!=='skip')roles.forEach(function(r,i){if(r===role&&i!==col)roles[i]='skip';});
 roles[col]=role;soExcelBlock.roles=roles;
 salesExcelFillFromBlock(soExcelBlock,soExcelBlock.startRow||0);
 render();
}

/* ---- точечные обновления: полная перерисовка увела бы каретку из ячейки ---- */
function salesExcelRenderGrid(){
 const box=document.getElementById('salesExcelGrid');
 if(box){box.innerHTML=salesExcelGridInnerHtml();if(typeof applyLang==='function')applyLang(box);}
 salesExcelRefreshFooter();
}
function salesExcelRefreshFooter(){
 const c=salesExcelCounts();
 const sum=document.getElementById('salesExcelSummary');if(sum)sum.innerHTML=salesExcelSummaryHtml(c);
 const btn=document.getElementById('salesExcelAdd');
 if(btn){btn.textContent=salesExcelAddLabel(c);btn.disabled=!c.ready;}
}
function salesExcelRefreshRow(i){
 const row=soExcelRows[i];if(!row)return;
 const tr=document.querySelector('#salesExcelGrid tr[data-row="'+i+'"]');if(!tr)return;
 const v=salesExcelValidateRow(row);
 tr.className=v.blank?'':(v.ok?'row-ok':'row-bad');
 const res=tr.querySelector('td.res');if(res)res.innerHTML=salesExcelRowStatusHtml(v);
 Array.prototype.forEach.call(tr.querySelectorAll('input[data-c]'),function(el){
  el.classList.toggle('cell-bad',!!v.err[el.getAttribute('data-c')]);
 });
}
function salesExcelSyncRowInputs(i){
 const row=soExcelRows[i];if(!row)return;
 const tr=document.querySelector('#salesExcelGrid tr[data-row="'+i+'"]');if(!tr)return;
 Array.prototype.forEach.call(tr.querySelectorAll('input[data-c]'),function(el){el.value=row[el.getAttribute('data-c')]||'';});
}
function salesExcelAppendIfLast(i){
 if(i!==soExcelRows.length-1||salesExcelRowIsBlank(soExcelRows[i]))return;
 soExcelRows.push(salesExcelBlankRow());
 const tb=document.querySelector('#salesExcelGrid tbody');
 if(tb)tb.insertAdjacentHTML('beforeend',salesExcelRowHtml(soExcelRows.length-1));
}
function salesExcelCellInput(i,field,el){
 const row=soExcelRows[i];if(!row)return;
 row[field]=el.value;
 salesExcelRefreshRow(i);salesExcelRefreshFooter();salesExcelAppendIfLast(i);
}
/* Несколько значений, набранных в одну ячейку, раскладываются по колонкам
   вправо — ровно то, чего ждёшь, напечатав «12 22 33 A1» одной строкой. */
function salesExcelCellChange(i,field,el){
 const row=soExcelRows[i];if(!row)return;
 const order=salesExcelFieldOrder(),at=order.indexOf(field),tokens=salesExcelTokens(el.value);
 if(at<0||tokens.length<2||at>=order.length-1){salesExcelRefreshRow(i);salesExcelRefreshFooter();return;}
 tokens.forEach(function(t,n){
  const f=order[at+n];
  if(!f)return;
  row[f]=(at+n===order.length-1)?tokens.slice(n).join(' '):t;
 });
 salesExcelSyncRowInputs(i);salesExcelRefreshRow(i);salesExcelRefreshFooter();salesExcelAppendIfLast(i);
}
function salesExcelCellKey(ev,i,field){
 if(!ev||ev.key!=='Enter')return;
 ev.preventDefault();
 salesExcelAppendIfLast(i);
 const next=document.querySelector('#salesExcelGrid input[data-r="'+(i+1)+'"][data-c="'+field+'"]');
 if(next){next.focus();try{next.select();}catch(e){}}
}

function salesExcelApply(){
 if(!soDraft)return;
 const keep=[];let added=0;
 (soExcelRows||[]).forEach(function(row){
  const v=salesExcelValidateRow(row);
  if(v.blank)return;
  if(!v.ok||!v.mu){keep.push(row);return;}
  const fresh=normalizeSalesOrderLine({makeupId:v.mu.id,qty:v.qty,width16:v.width16,height16:v.height16,mark:v.mark});
  soDraft.lines.push(fresh);
  salesEnsureLineShape(fresh);
  /* Колонка Set в буфере — это рецепт: операции ложатся в форму строки, ссылки
     на строке не остаётся. */
  if(v.set)salesApplySetOpsToShape(fresh,v.set);
  added++;
 });
 if(!added)return;
 /* Строки с ошибкой не исчезают в счётчике «Skipped: N» — они остаются в
    таблице, чтобы их поправить и нажать Add ещё раз. Добавленные из таблицы
    убираются, поэтому повтор не дублирует их. */
 /* Блок последней вставки описывал ТУ сетку, которой уже нет: часть строк уехала
    в заказ. Если его сохранить, «Change columns» вернёт добавленные строки обратно
    и повторный Add их удвоит. */
 soExcelBlock=null;soExcelMapOpen=false;
 if(keep.length){
  soExcelRows=keep;
  soExcelNote=(added===1?'1 row added':added+' rows added')+'. '+(keep.length===1?'1 row below still needs a fix':keep.length+' rows below still need a fix')+' — correct it and press Add again.';
 }else{
  soExcelRows=[];soExcelNote='';soExcelOpen=false;
 }
 salesExcelEnsureRows();
 render();
}

/* ---------- Sales pricing · PR3 clickable prototype ----------
   Geometry and quantities are always derived from Shape / line Qty. Only the
   monetary rate can be overridden in the Sales Order. Catalog rates are snapped
   into the order on save so later catalog changes do not rewrite old orders. */
const SALES_SERVICE_RATE_TABLE={
 clamp:{'6':5,'8-10':8,'12-19':10},hinge:{'6':10,'8-10':15,'12-19':20},
 hole:{'0.5-1':{'6':5,'8-10':6,'12-19':7},'1-2':{'6':6,'8-10':7,'12-19':8},'2-3':{'6':7,'8-10':8,'12-19':9},'3-4':{'6':8,'8-10':12,'12-19':15},'4+':{'6':10,'8-10':15,'12-19':25}},
 roughArris:{'6':.01,'8-10':.02,'12-19':.03},flatPolish:{'6':.07,'8-10':.10,'12-19':.13},cncShapePolish:{'6':.28,'8-10':.38,'12-19':.48},miter225:{'6':.28,'8-10':.38,'12-19':.45},radiusCorner:{'6':10,'8-10':12,'12-19':15},
 notchHand:{'6':15,'8-10':15,'12-19':15},notchCnc:{'6':15,'8-10':15,'12-19':15},
 sandblastFull:{'6':4,'8-10':4,'12-19':4},sandblastPattern:{'6':6,'8-10':6,'12-19':6}
};
/* Полоса прайса по конкретной толщине стекла. Начисления за кромку считаются
   ПО ЛАЙТАМ, поэтому банд нужен на каждое стекло отдельно: у пакета 10 + 6 два
   разных стекла и две разные ставки. */
function salesPricingBandFor(mm){
 const t=+mm;
 if(t===6)return {ok:true,thickness:t,band:'6'};
 if(t>=8&&t<=10)return {ok:true,thickness:t,band:'8-10'};
 if(t>=12&&t<=19)return {ok:true,thickness:t,band:'12-19'};
 return {ok:false,thickness:Number.isFinite(t)?t:'',band:''};
}
function salesPricingThickness(line){const v=salesLineGlassThicknesses(line);if(v.length!==1)return {ok:false,thickness:v.length?v.join(' / '):'',band:''};const t=v[0];if(t===6)return {ok:true,thickness:t,band:'6'};if(t>=8&&t<=10)return {ok:true,thickness:t,band:'8-10'};if(t>=12&&t<=19)return {ok:true,thickness:t,band:'12-19'};return {ok:false,thickness:t,band:''};}
function salesPricingHoleBand(d){if(d>=.5&&d<=1)return {key:'0.5-1',label:'1/2″–1″'};if(d>1&&d<=2)return {key:'1-2',label:'1-1/16″–2″'};if(d>2&&d<=3)return {key:'2-3',label:'2-1/16″–3″'};if(d>3&&d<=4)return {key:'3-4',label:'3-1/16″–4″'};if(d>4)return {key:'4+',label:'> 4″'};return null;}
function salesCatalogRate(tableKey,ctx,subKey){if(!ctx.ok)return null;const t=SALES_SERVICE_RATE_TABLE[tableKey];if(!t)return null;if(subKey)return t[subKey]&&t[subKey][ctx.band]!=null?t[subKey][ctx.band]:null;return t[ctx.band]!=null?t[ctx.band]:null;}
function salesChargeRow(key,label,basis,unit,rate,source){return {key:key,label:label,basis:+basis||0,unit:unit,catalogRate:rate==null?null:+rate,source:source||'Shape'};}
/* Начисления по меткам (Hole и фурнитура) считаются в ОДНОМ месте. У строки
   заказа две ветки расчёта — обычная и через Service Set, — и в каждой лежала
   своя копия этого разбора. Копия и есть болезнь: добавленный владельцем вид
   фурнитуры попадал бы в счёт только в одной из веток.

   Виды перебираются ОБЩИМ правилом, а не перечислением clamp/hinge: справочник
   видов открытый. Ставки в прайсе у нового вида нет — строка встанет с `Rate
   required`, и это правильный ответ. Молчаливый ноль означал бы, что работу
   сделали и не выставили.

   Имя начисления английское и от языка интерфейса не зависит: оно уходит
   снимком в заказ и стоит в прайсе владельца (HNGS, CLMP). Модель
   («Vienna 180») в счёт не идёт — прайс один на вид, а не на модель. */
function salesManufacturingChargeRows(items,ctx){
 const rows=[],groups=Object.create(null),order=[];
 (Array.isArray(items)?items:[]).forEach(function(item){
  if(item.type==='hole'){const d=fabParseDimStrict(item.diameter),hb=d.ok?salesPricingHoleBand(d.v):null,key=hb?'hole:'+hb.key:'hole:unpriced';if(!groups[key]){groups[key]={qty:0,holeBand:hb};order.push(key);}groups[key].qty+=shapeHoleCount(item);return;}
  const key=item.type;if(!groups[key]){groups[key]={qty:0,kind:item.type};order.push(key);}groups[key].qty++;
 });
 order.forEach(function(k){const g=groups[k];
  if(g.kind)rows.push(salesChargeRow('MI:'+k+':'+ctx.band,shapeMiOperationName(g.kind),g.qty,'pc',salesCatalogRate(k,ctx),'Manufacturing item'));
  else rows.push(salesChargeRow('MI:'+k+':'+ctx.band,'Hole '+(g.holeBand?g.holeBand.label:'—'),g.qty,'pc',g.holeBand?salesCatalogRate('hole',ctx,g.holeBand.key):null,'Manufacturing item'));
 });
 return rows;
}
/* Пескоструй считается ПО ПЛОЩАДИ: ставка владельца — 4 доллара за ft² сплошной
   обработки и 6 за узор, база — Net area стекла. Сторона (Front / Back) на цену
   не влияет, но остаётся в имени начисления: цеху нужно знать, какую. */
function salesSandblastChargeRows(features,ctx,areaFt2){
 const groups=Object.create(null),order=[];
 (Array.isArray(features)?features:[]).filter(f=>f.type==='sandblast').forEach(f=>{const coverage=shapeSandblastCoverage(f),side=shapeSandblastSide(f),key=coverage+':'+side;if(!groups[key]){groups[key]={feature:f,qty:0};order.push(key);}groups[key].qty++;});
 const area=+areaFt2>0?+areaFt2:0;
 return order.map(key=>{const g=groups[key],coverage=shapeSandblastCoverage(g.feature),side=shapeSandblastSide(g.feature);
  return salesChargeRow('FEATURE:sandblast-'+coverage+'-'+side+':'+ctx.band,shapeSandblastServiceLabel(g.feature),
   +(area*g.qty).toFixed(4),'ft²',salesCatalogRate(coverage==='pattern'?'sandblastPattern':'sandblastFull',ctx),'Shape feature');});
}
function salesNotchChargeRows(def,ctx){
  var groups={},order=[];
  ssNotchList(def).forEach(function(n){if(!groups[n.method]){groups[n.method]=0;order.push(n.method);}groups[n.method]+=n.pieces;});
  return order.map(function(method){
    return salesChargeRow('FEATURE:notch-'+method+':'+ctx.band,ssNotchLabel(method),groups[method],'pc',
      salesCatalogRate(method==='cnc'?'notchCnc':'notchHand',ctx),'Shape feature');
  });
}
function salesLineChargeRows(line){
 const s=salesShapeByRef(line&&line.shapeRef),rows=[];if(!s)return rows;const r=ShapeModule.compute(s),ctx=salesPricingThickness(line),items=Array.isArray(s.manufacturingItems)?s.manufacturingItems:[];
 salesManufacturingChargeRows(items,ctx).forEach(function(row){rows.push(row);});
 salesSandblastChargeRows(s.features,ctx,r&&r.valid?r.area/144:0).forEach(function(row){rows.push(row);});
 if(r&&r.valid){(r.edges||[]).forEach(function(g){(shapeEdgeOps(s,g.id)||[]).forEach(function(op){let id='',label=op.type,rate=null;if(op.type==='Rough Arris'){id='roughArris';rate=salesCatalogRate(id,ctx);}else if(op.type==='Flat Polish'){id='flatPolish';rate=salesCatalogRate(id,ctx);}else if(op.type==='CNC Shape Polish'){id='cncShapePolish';rate=salesCatalogRate(id,ctx);}else if(op.type==='Mitering'){id='miter'+String(op.angle||45).replace('.','_');label='Mitering '+(op.angle||45)+'°';rate=+op.angle===22.5?salesCatalogRate('miter225',ctx):null;}else if(op.type==='Beveling'){id='bevel:'+String(op.width||'');label='Beveling '+String(op.width||'');rate=null;}else return;const key='EDGE:'+id+':'+ctx.band,found=rows.find(x=>x.key===key);if(found)found.basis+=g.length;else rows.push(salesChargeRow(key,label,g.length,'in',rate,'Edge Processing'));});});
  const radiusCount=(s.features||[]).filter(f=>f.type==='radius'&&inch(f.radius)>0).length;if(radiusCount)rows.push(salesChargeRow('FEATURE:radius:'+ctx.band,'Radius Corner',radiusCount,'pc',salesCatalogRate('radiusCorner',ctx),'Shape feature'));
  const cutoutCount=(s.features||[]).filter(f=>f.type==='cutout').length;if(cutoutCount)rows.push(salesChargeRow('FEATURE:cutout:'+ctx.band,'Cutout',cutoutCount,'pc',null,'Shape feature'));
  /* Нотч — работа, а не геометрия: контур раскроя от него не меняется, но угол
     кто-то должен вырезать и обработать. Ставка за штуку. */
  salesNotchChargeRows(s,ctx).forEach(function(row){rows.push(row);});
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
function salesChargeShortLabel(row){
 /* Короткий код вида берётся из справочника по ключу строки: у добавленного
    владельцем вида имени в этом коде нет и быть не может. */
 const kp=String(row.key||'').split(':');
 if(kp[0]==='MI'&&kp[1]&&kp[1]!=='hole'&&hardwareKindIsKnown(kp[1]))return hardwareKindShort(kp[1]);
 const l=String(row.label||'');if(l==='Clamp')return 'CLMP';if(l==='Hinge')return 'HNG';if(l.indexOf('Hole ')===0)return 'HOLE';if(l==='Flat Polish')return 'POLI';if(l==='Rough Arris')return 'ARRIS';if(l==='CNC Shape Polish')return 'CNC POL';if(l.indexOf('Mitering')===0)return 'MITER';if(l==='Radius Corner')return 'RAD';if(l==='Cutout')return 'CUT';if(l==='Hand notch'||l==='CNC notch')return 'NOTCH';return l.slice(0,8).toUpperCase();}
function salesLineServicesSummary(line){
 const rows=salesLineChargeRows(line),q=salesPositiveInt(line.qty,1),currency=soDraft.currency||'CAD';if(!rows.length)return `<button type='button' class='line-services-btn empty' onclick='salesOpenLineServices("${esc(line.id)}")'><span>—</span><small>Сервисы</small></button>`;
 const summary=salesLinePricingSummary(line),chips=rows.slice(0,2).map(function(r){const n=r.basis*q;return `<span>${esc(salesChargeShortLabel(r))}×${r.unit==='pc'?esc(n):esc(dimIn(n))}</span>`;}).join(''),more=rows.length>2?`<i>+${rows.length-2}</i>`:'';
 return `<button type='button' class='line-services-btn${summary.unpriced?' incomplete':''}' onclick='salesOpenLineServices("${esc(line.id)}")'><span class='line-services-chips'>${chips}${more}</span><span class='line-services-money'><b>${summary.total.toFixed(2)} ${esc(currency)}</b>${summary.unpriced?`<small><span data-raw>${summary.unpriced}</span> <span>без цены</span></small>`:''}</span></button>`;
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
 (m.panes||[]).forEach(p=>{
  const plies=p.category==='laminated'?[p.laminated.outer,p.laminated.inner]:[{glassProductId:p.glassProductId,thicknessMm:p.thicknessMm}];
  plies.forEach(ply=>{const g=glassProductById(ply&&ply.glassProductId),v=+(g&&g.thicknessMm!=null?g.thicknessMm:ply&&ply.thicknessMm);if(Number.isFinite(v)&&v>0&&out.indexOf(v)<0)out.push(v);});
 });
 return out.sort((a,b)=>a-b);
}
/* Толщина для припуска в редакторе формы. Раньше пакет из разных стёкол
   проваливал редактор целиком («Glass thickness … must come from the selected
   Sales Makeup»): одной безопасной толщины у такого юнита не было. Теперь есть —
   каждый лайт считается со своей, поэтому:
   · открыта форма конкретного лайта → берём толщину ЭТОГО стекла;
   · открыта общая форма → берём самое толстое из стёкол, которые на ней живут:
     предпросмотр показывает худший случай припуска, а настоящий рез всё равно
     считается по каждому лайту отдельно.
   Закрываемся только когда толщины нет вообще. */
function salesApplyLineGlassThicknessToShape(line,shape,liteIndex){
 if(!shape)return null;
 const lites=salesLineLites(line);
 if(liteIndex!=null){
  const one=lites.find(function(l){return l.index===liteIndex;});
  if(one&&+one.thicknessMm>0){shape.thickness=String(one.thicknessMm);return +one.thicknessMm;}
 }
 const values=salesLineGlassThicknesses(line);
 if(values.length===1){shape.thickness=String(values[0]);return values[0];}
 const shared=lites.filter(function(l){return !salesLineLiteShape(line,l.index);}).map(function(l){return +l.thicknessMm;}).filter(function(v){return v>0;});
 const pool=shared.length?shared:values.filter(function(v){return +v>0;});
 if(pool.length){const mx=Math.max.apply(null,pool);shape.thickness=String(mx);return mx;}
 shape.thickness='';
 return null;
}
function salesShapeRefFrom(s){const r=s&&ShapeModule.compute(s),ready=r&&(r.valid||(r.externalFile&&r.sourceValid));return s&&ready?{id:s.id,revision:s.revision||0,fingerprint:r.fingerprint||''}:{id:'',revision:null,fingerprint:''};}
function salesMuntinRefFrom(m){return m?{id:m.id,shapeId:m.shapeId||'',shapeRevision:m.shapeRevision==null?null:m.shapeRevision}:{id:'',shapeId:'',shapeRevision:null};}
function salesSyncLineFromShape(line,s){const r=s&&ShapeModule.compute(s),external=r&&r.externalFile&&r.sourceValid;if(!r||(!r.valid&&!external))return false;line.width16=Math.round(r.width*16);line.height16=Math.round(r.height*16);line.shapeRef=salesShapeRefFrom(s);if(line.muntinRef&&line.muntinRef.id&&line.muntinRef.shapeId!==s.id)line.muntinRef=normalizeMuntinRef({});return true;}
/* ---------- Геометрия строки: всегда настоящий прямоугольник ----------
   Раньше строка без формы считалась «неявным прямоугольником» — отдельной
   веткой расчёта, у которой кромки не было в принципе. Из-за этого кромку
   приходилось держать в Edgework Set, а он спорил с формой и переживал её
   смену. Теперь у строки с размерами появляется НАСТОЯЩАЯ форма-прямоугольник,
   кромка живёт на ней, и менять её можно там же, где и всю геометрию.

   Форма принадлежит строке (`ownerLineId`): в библиотеку форм она не
   показывается и удаляется вместе со строкой. Пока форма остаётся
   прямоугольником, ХОЗЯИН РАЗМЕРОВ — строка: ввод в таблице и вставка из Excel
   пишут в форму. Как только форму превратили в скошенную, с вырезом или
   загрузили DXF — хозяином становится форма, а поля размера в строке
   блокируются, как и раньше. */
function salesShapeIsLineOwned(s){return !!(s&&s.ownerLineId);}
function salesShapeIsLineRect(s){
 return !!(salesShapeIsLineOwned(s)&&s.type==='rectangle'&&!(s.features||[]).length&&!shapeIsDxfSource(s));
}
function salesLineOwnsDimensions(line){
 const s=salesShapeByRef(line&&line.shapeRef);
 return !s||salesShapeIsLineRect(s);
}
function salesEnsureLineShape(line){
 if(!soDraft||!line)return null;
 const current=salesShapeByRef(line.shapeRef);
 if(current)return current;
 if(!(salesStoredDim16(line.width16)&&salesStoredDim16(line.height16)))return null;
 const def=newShapeDef('rectangle');
 def.name=(soDraft.businessNumber||'SO')+' · '+(line.mark||('Line '+((soDraft.lines||[]).indexOf(line)+1)));
 def.w=salesDimFrom16(line.width16);def.h=salesDimFrom16(line.height16);
 def.ownerLineId=line.id;
 salesApplyLineGlassThicknessToShape(line,def);
 const saved=normalizeShapeDef(def);
 DB.shapeDef.push(saved);
 line.shapeRef=normalizeShapeRef({id:saved.id,revision:saved.revision||0});
 return saved;
}
/* Размер правится в строке — форма обязана поехать следом, иначе рез посчитают
   по старой геометрии. */
function salesSyncShapeFromLine(line){
 const s=salesShapeByRef(line&&line.shapeRef);
 if(!salesShapeIsLineRect(s))return false;
 const w=salesDimFrom16(line.width16),h=salesDimFrom16(line.height16);
 if(!w||!h)return false;
 if(s.w===w&&s.h===h)return false;
 s.w=w;s.h=h;s.revision=Math.max(0,Math.floor(+s.revision||0))+1;
 line.shapeRef=normalizeShapeRef({id:s.id,revision:s.revision});
 return true;
}
function salesEnsureAllLineShapes(){
 if(!soDraft)return 0;
 let made=0;
 (soDraft.lines||[]).forEach(function(line){
  if(salesEnsureLineShape(line))made++;else salesSyncShapeFromLine(line);
  salesMigrateLineEdgeworkToShape(line);
 });
 return made;
}
/* Старые заказы: обработка, которая жила в Edgework Set и в ручных правках
   строки, один раз переезжает в форму — иначе сохранённый заказ потерял бы
   кромку вместе с отменой этих двух источников. Правки строки ложатся поверх
   набора, как они и работали. После переезда на строке не остаётся ничего. */
function salesMigrateLineEdgeworkToShape(line){
 if(!line)return false;
 const set=line.serviceSetId?salesServiceSetById(soDraft,line.serviceSetId):null;
 const overrides=(line.serviceOverrides&&line.serviceOverrides.edges)||{};
 const hasOverrides=Object.keys(overrides).length>0;
 if(!set&&!hasOverrides)return false;
 const shape=salesEnsureLineShape(line)||salesShapeByRef(line.shapeRef);
 if(!shape)return false;
 if(set&&!Object.keys(shape.edgeOps||{}).length)salesApplySetOpsToShape(line,set);
 if(hasOverrides){
  const ops=shape.edgeOps||{};
  Object.keys(overrides).forEach(function(id){const list=salesServiceOps(overrides[id]);if(list.length)ops[id]=list;else delete ops[id];});
  shape.edgeOps=ops;shape.revision=Math.max(0,Math.floor(+shape.revision||0))+1;
  line.shapeRef=normalizeShapeRef({id:shape.id,revision:shape.revision});
 }
 line.serviceSetId='';line.serviceOverrides={pinnedTopology:'',edges:{}};
 return true;
}

/* ---------- Отдельная форма на лайт ----------
   Ступенчатый пакет с фигурой: у 10 мм один контур, у 6 мм — другой, меньший,
   и отступом от общего он не выводится. Такой лайт получает СВОЮ форму: копию
   общей на момент отделения, дальше живёт своей жизнью. Форма принадлежит
   строке (`ownerLineId`), в библиотеку не показывается и удаляется вместе со
   строкой. Лайт без своей формы живёт на общей — с отступом, если он задан. */
function salesLineLiteShapeRef(line,liteIndex){
 const map=(line&&line.liteShapes)||{};
 return map[String(liteIndex)]||null;
}
function salesLineLiteShape(line,liteIndex){
 const ref=salesLineLiteShapeRef(line,liteIndex);
 return ref?salesShapeByRef(ref):null;
}
function salesLineShapeForLite(line,liteIndex){
 return salesLineLiteShape(line,liteIndex)||salesLineGeometryShape(line);
}
function salesDetachLiteShape(lineId,liteIndex){
 const line=(soDraft&&soDraft.lines||[]).find(function(l){return l.id===lineId;});
 const base=line&&salesLineGeometryShape(line);
 if(!line||!base)return null;
 if(salesLineLiteShape(line,liteIndex))return salesLineLiteShape(line,liteIndex);
 const copy=normalizeShapeDef(JSON.parse(JSON.stringify(base)));
 copy.id=newShapeId();
 copy.ownerLineId=line.id;
 copy.name=(base.name||'Shape')+' · Lite '+(liteIndex+1);
 /* Копия отвечает только за свой лайт: чужие раскладки по лайтам ей не нужны. */
 copy.lites={};
 const own=(base.lites||{})[String(liteIndex)];
 if(own&&own.edgeOps)copy.edgeOps=Object.assign({},copy.edgeOps,JSON.parse(JSON.stringify(own.edgeOps)));
 DB.shapeDef.push(copy);
 if(!line.liteShapes)line.liteShapes={};
 line.liteShapes[String(liteIndex)]=normalizeShapeRef({id:copy.id,revision:copy.revision||0});
 touch();
 return copy;
}
function salesReattachLiteShape(lineId,liteIndex){
 const line=(soDraft&&soDraft.lines||[]).find(function(l){return l.id===lineId;});
 const shape=line&&salesLineLiteShape(line,liteIndex);
 if(!line||!shape)return false;
 if(!confirm('Return this lite to the shared Shape? Its own geometry will be deleted.'))return false;
 const i=DB.shapeDef.findIndex(function(x){return x.id===shape.id;});
 if(i>=0&&!(DB.muntinDef||[]).some(function(m){return m.shapeId===shape.id;}))DB.shapeDef.splice(i,1);
 delete line.liteShapes[String(liteIndex)];
 touch();render();
 return true;
}
/* Открыть форму лайта в конфигураторе: если своей ещё нет — отделить и открыть. */
function salesOpenLiteShape(lineId,liteIndex){
 const line=(soDraft&&soDraft.lines||[]).find(function(l){return l.id===lineId;});
 if(!line)return;
 const shape=salesLineLiteShape(line,liteIndex)||salesDetachLiteShape(lineId,liteIndex);
 if(!shape)return alert('Line needs Width and Height first.');
 const i=DB.shapeDef.findIndex(function(x){return x.id===shape.id;});
 salesBridge={kind:'shape',lineId:line.id,liteIndex:liteIndex};
 tab='configurators';subtab='shape';sView='setup';sEdgeLite=null;sEdgeworkOpen=false;sFeaturesOpen=false;
 sEdit=i;sDraft=normalizeShapeDef(JSON.parse(JSON.stringify(shape)));
 salesApplyLineGlassThicknessToShape(line,sDraft,liteIndex);
 soEdgeworkLineId=null;
 render();
}
/* Уборка: форма лайта уходит вместе со строкой. */
function salesDropLineLiteShapes(line){
 const map=(line&&line.liteShapes)||{};
 Object.keys(map).forEach(function(key){
  const ref=map[key],i=DB.shapeDef.findIndex(function(x){return x.id===ref.id;});
  if(i>=0&&!(DB.muntinDef||[]).some(function(m){return m.shapeId===ref.id;}))DB.shapeDef.splice(i,1);
 });
}
/* Форма принадлежала строке — со строкой и уходит, чтобы не копиться в базе. */
function salesDropLineOwnedShape(line){
 const s=salesShapeByRef(line&&line.shapeRef);
 if(!salesShapeIsLineOwned(s))return false;
 if((DB.muntinDef||[]).some(function(m){return m.shapeId===s.id;}))return false;
 const i=DB.shapeDef.findIndex(function(x){return x.id===s.id;});
 if(i<0)return false;
 DB.shapeDef.splice(i,1);
 return true;
}
/* ---------- Кромка считается ПО ЛАЙТАМ ----------
   Правила цеха, владелец 31 августа 2026:
   · стеклопакет (double / triple) — арис на всех лайтах в 99% случаев: кромка
     спрятана внутри пакета, её задача только безопасность реза;
   · одиночное стекло — по толщине: арис до 8 mm, полировка от 10 mm;
   · ламинат — ОДНА кромка на всю склейку: плёнка не делит её на два стекла,
     поэтому толщина берётся суммарная и обработка у обеих сторон одинаковая.
   Ручное значение на самом продукте стекла (Master Data) перебивает всё —
   ради зеркал 5/6 mm, которым клиенты заказывают полировку.

   Комбинация 10 + 6 в пакете — это два разных стекла: у каждого своя кромка,
   свой припуск и свой размер реза. Раньше строка считалась одним куском, и
   такой пакет упирался в «Exact Makeup thickness is unresolved». */
function salesPaneGlassThicknessMm(pane){
 if(!pane)return NaN;
 if(pane.category==='laminated'){
  const lam=pane.laminated||{},plies=[lam.outer,lam.inner],films=lam.interlayers||[];
  let total=0,known=true;
  plies.forEach(function(ply){
   const g=glassProductById(ply&&ply.glassProductId),v=+(g&&g.thicknessMm!=null?g.thicknessMm:ply&&ply.thicknessMm);
   if(Number.isFinite(v)&&v>0)total+=v;else known=false;
  });
  films.forEach(function(film){
   /* thicknessMm is already the total derived from the selected layer count.
      Multiplying it by layers again made production see four 0.38 mm layers
      as 6.08 mm instead of 1.52 mm. */
   const v=salesInterlayerThicknessForLayers(film&&film.layers);
   if(Number.isFinite(v)&&v>0)total+=v;else known=false;
  });
  return known?total:NaN;
 }
 const g=glassProductById(pane.glassProductId),v=+(g&&g.thicknessMm!=null?g.thicknessMm:pane.thicknessMm);
 return Number.isFinite(v)&&v>0?v:NaN;
}
function salesPaneBaseEdgework(pane,unitType){
 if(!pane)return '';
 /* Выбор на самом лайте сильнее всего: у пакета бывает, что одно стекло
    полируют, а второе только зачищают. */
 if(SALES_PANE_EDGEWORK.indexOf(pane.edgework)>0)return pane.edgework;
 /* Ручное значение на продукте — сильнее правила по толщине. */
 if(pane.category!=='laminated'){
  const g=glassProductById(pane.glassProductId);
  if(g&&g.baseEdgework)return g.baseEdgework;
 }
 if(unitType==='double'||unitType==='triple')return 'arris';
 const mm=salesPaneGlassThicknessMm(pane);
 return Number.isFinite(mm)&&mm>=10?'polish':'arris';
}
function salesPaneAutoEdgework(pane,unitType){
 const copy=Object.assign({},pane,{edgework:''});
 return salesPaneBaseEdgework(copy,unitType);
}
/* Тот же выбор, но для лайта КОНКРЕТНОЙ строки: окно Effective Production
   открывается из строки заказа, и makeup там может быть не тот, что выбран
   сейчас в билдере. */
function salesLineSetLiteEdgework(lineId,paneIndex,v){
 const line=(soDraft&&soDraft.lines||[]).find(function(l){return l.id===lineId;});
 const m=line?salesMakeupById(soDraft,line.makeupId):null,p=m&&m.panes[paneIndex];
 if(!p)return;
 p.edgework=SALES_PANE_EDGEWORK.indexOf(v)>0?v:'';
 m.updatedAt=new Date().toISOString();touch();render();
}
function salesPaneSetEdgework(i,v){
 const m=salesCurrentMakeup(),p=m&&m.panes[i];if(!p)return;
 p.edgework=SALES_PANE_EDGEWORK.indexOf(v)>0?v:'';
 m.updatedAt=new Date().toISOString();touch();render();
}
function salesLineLites(line){
 const m=line&&soDraft?salesMakeupById(soDraft,line.makeupId):null;
 if(!m)return [];
 return (m.panes||[]).map(function(pane,i){
  const mm=salesPaneGlassThicknessMm(pane),kind=salesPaneBaseEdgework(pane,m.unitType);
  return {
   index:i,label:'Lite '+(i+1),laminated:pane.category==='laminated',
   thicknessMm:Number.isFinite(mm)?mm:null,baseEdgework:kind,
   baseOps:glassBaseEdgeworkOp(kind)?[shapeNormalizeOp(glassBaseEdgeworkOp(kind))].filter(Boolean):[]
  };
 });
}
/* Совместимость: там, где по-прежнему нужен один ответ на строку, берём
   самую строгую обработку — полировка строже ариса. */
function salesLineBaseEdgeworkKind(line){
 let kind='';
 salesLineLites(line).forEach(function(l){if(l.baseEdgework==='polish')kind='polish';else if(l.baseEdgework==='arris'&&kind!=='polish')kind='arris';});
 return kind;
}
function salesLineBaseEdgeworkOps(line){
 const op=glassBaseEdgeworkOp(salesLineBaseEdgeworkKind(line));
 return op?[shapeNormalizeOp(op)].filter(Boolean):[];
}
function salesOrderConfigureShape(i){
 const line=soDraft.lines[i];if(!line)return;salesBridge={kind:'shape',lineId:line.id};tab='configurators';subtab='shape';sView='setup';sEdgeLite=null;sEdgeworkOpen=false;sFeaturesOpen=false;
 const current=salesShapeByRef(line.shapeRef);if(current){const idx=DB.shapeDef.findIndex(s=>s.id===current.id);sEdit=idx;sDraft=normalizeShapeDef(JSON.parse(JSON.stringify(current)));}
 else{sEdit='new';sDraft=newShapeDef('rectangle');sDraft.name=(soDraft.businessNumber||'SO')+' · '+(line.mark||('Line '+(i+1)));if(line.width16)sDraft.w=salesDimFrom16(line.width16);if(line.height16)sDraft.h=salesDimFrom16(line.height16);}
 salesApplyLineGlassThicknessToShape(line,sDraft);
 render();
}
function salesBridgeOnShapeSaved(id){
 if(!salesBridge||salesBridge.kind!=='shape'||!soDraft)return false;
 const line=soDraft.lines.find(l=>l.id===salesBridge.lineId),s=DB.shapeDef.find(x=>x.id===id);
 /* Сохранили форму ЛАЙТА — размеры строки от неё не зависят: строка живёт по
    общей форме, а у лайта своя геометрия. */
 if(line&&s&&salesBridge.liteIndex!=null){
  if(!line.liteShapes)line.liteShapes={};
  line.liteShapes[String(salesBridge.liteIndex)]=normalizeShapeRef({id:s.id,revision:s.revision||0});
 }
 else if(line&&s)salesSyncLineFromShape(line,s);salesBridge=null;sEdit=null;sDraft=null;tab='sales';subtab='orders';touch();render();return true;}
/* Строка без геометрии больше не существует: сброс формы возвращает простой
   прямоугольник по её же Width × Height, а не пустоту. */
function salesUnlinkShape(i){
 const l=soDraft.lines[i];if(!l)return;
 if(l.muntinRef&&l.muntinRef.id&&!confirm('This Shape is linked to a Muntin layout. Unlink both?'))return;
 salesDropLineOwnedShape(l);
 l.shapeRef=normalizeShapeRef({});l.muntinRef=normalizeMuntinRef({});
 salesEnsureLineShape(l);
 touch();render();
}
function salesOrderConfigureMuntin(i){
 const line=soDraft.lines[i];if(!line)return;const shape=salesShapeByRef(line.shapeRef);if(!shape)return alert('Configure the Shape for this line first.');salesBridge={kind:'muntin',lineId:line.id};tab='configurators';subtab='muntin';mFieldErrors={};
 const current=salesMuntinByRef(line.muntinRef);if(current){mEdit=DB.muntinDef.findIndex(m=>m.id===current.id);mDraft=JSON.parse(JSON.stringify(current));mDraft.muntin=normalizeMuntinModel(mDraft.muntin);}
 else{mEdit='new';mDraft=newMuntinDef(shape.id);mDraft.name=(soDraft.businessNumber||'SO')+' · '+(line.mark||('Line '+(i+1)))+' Muntin';pinMuntinShape(mDraft,shape);}
 render();
}
function salesBridgeOnMuntinSaved(id){if(!salesBridge||salesBridge.kind!=='muntin'||!soDraft)return false;const line=soDraft.lines.find(l=>l.id===salesBridge.lineId),m=DB.muntinDef.find(x=>x.id===id);if(line&&m)line.muntinRef=salesMuntinRefFrom(m);salesBridge=null;mEdit=null;mDraft=null;mFieldErrors={};tab='sales';subtab='orders';touch();render();return true;}
function salesUnlinkMuntin(i){const l=soDraft.lines[i];if(l){l.muntinRef=normalizeMuntinRef({});render();}}

function salesBridgeCancel(kind){if(!salesBridge||salesBridge.kind!==kind)return false;salesBridge=null;if(kind==='shape'){sEdit=null;sDraft=null;}if(kind==='muntin'){mEdit=null;mDraft=null;mFieldErrors={};}tab='sales';subtab='orders';render();return true;}
