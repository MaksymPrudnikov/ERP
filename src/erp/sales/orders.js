/* =====================================================================
   erp/sales/orders · sales-0.3b-makeup
   Draft order behavior, order-scoped makeups, Excel entry and bridges to
   the existing Shape / Muntin configurators.
   ===================================================================== */

let soEdit=null,soDraft=null,soSearch='',soMakeupId=null;
let soExcelMode='current';
let soSelectedLines=new Set();
let soOpenSectionKey=null;
let salesBridge=null;

function salesFindCustomer(id){return (DB.customer||[]).find(c=>c.id===id)||null;}
function salesApplyCustomerDefaults(id){
 const c=salesFindCustomer(id);soDraft.customerId=id||'';if(!c)return;
 if(c.paymentTerms)soDraft.paymentTerms=c.paymentTerms;if(c.currency)soDraft.currency=c.currency;
 const dm=String(c.defaultDeliveryMethod||'').toLowerCase();if(dm.includes('pickup'))soDraft.delivery='pickup';else if(dm)soDraft.delivery='delivery';
}
function salesOrderSearchChange(el){soSearch=el.value;const pos=el.selectionStart;render();requestAnimationFrame(()=>{const e=document.getElementById('salesOrderSearch');if(e){e.focus();try{e.setSelectionRange(pos,pos);}catch(x){}}});}
function salesOrderNew(){soEdit='new';soDraft=newSalesOrderDraft();soMakeupId=soDraft.makeups[0].id;soSelectedLines=new Set();soOpenSectionKey=null;subtab='orders';render();}
function salesOrderEdit(id){const o=DB.salesOrder.find(x=>x.id===id);if(!o)return;soEdit=id;soDraft=JSON.parse(JSON.stringify(o));soDraft=normalizeSalesOrder(soDraft);soMakeupId=(soDraft.makeups[0]||{}).id||null;soSelectedLines=new Set();soOpenSectionKey=null;subtab='orders';render();}
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
 soEdit=null;soDraft=null;soMakeupId=null;soSelectedLines=new Set();soOpenSectionKey=null;salesBridge=null;render();
}
function salesOrderSave(){
 const e=document.getElementById('e_sales_order');if(e)e.style.display='none';
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
function salesGlassCandidates(p){const fam=salesProductFamilyForPane(p);return activeGlassProducts().filter(g=>(!p.manufacturer||g.manufacturer===p.manufacturer)&&(!p.thicknessMm||g.thicknessMm===+p.thicknessMm)&&(!fam||g.family===fam));}
function salesPaneEnsureProduct(p){const rows=salesGlassCandidates(p);if(!rows.some(x=>x.id===p.glassProductId))p.glassProductId=(rows[0]||{}).id||'';}
function salesPaneSetManufacturer(i,v){const p=salesCurrentMakeup().panes[i];p.manufacturer=v;salesPaneEnsureProduct(p);render();}
function salesPaneSetThickness(i,v){const p=salesCurrentMakeup().panes[i];p.thicknessMm=+v||6;salesPaneEnsureProduct(p);render();}
function salesPaneSetVisionType(i,v){const p=salesCurrentMakeup().panes[i];if(!SALES_VISION_TYPES.includes(v))return;p.visionType=v;p.coatingSurface=null;if(v==='frit')p.frit.surface=null;salesPaneEnsureProduct(p);render();}
function salesPaneSetProduct(i,v){const p=salesCurrentMakeup().panes[i],g=glassProductById(v);p.glassProductId=v;if(g){p.manufacturer=g.manufacturer;p.thicknessMm=g.thicknessMm;}render();}
function salesPaneSetHeat(i,v){salesCurrentMakeup().panes[i].heatTreatmentId=v;render();}
function salesPaneSetCoatingSurface(i,v){const p=salesCurrentMakeup().panes[i];p.coatingSurface=normalizeSurface(v,salesPaneSurfaces(i));render();}
function salesPaneSetFrit(i,k,v){const p=salesCurrentMakeup().panes[i];if(k==='surface')p.frit.surface=normalizeSurface(v,salesPaneSurfaces(i));else p.frit[k]=v;render();}
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

function salesShapeByRef(ref){return ref&&ref.id?DB.shapeDef.find(s=>s.id===ref.id)||null:null;}
function salesMuntinByRef(ref){return ref&&ref.id?DB.muntinDef.find(m=>m.id===ref.id)||null:null;}
function salesShapeRefFrom(s){const r=s&&ShapeModule.compute(s);return s&&r&&r.valid?{id:s.id,revision:s.revision||0,fingerprint:r.fingerprint||''}:{id:'',revision:null,fingerprint:''};}
function salesMuntinRefFrom(m){return m?{id:m.id,shapeId:m.shapeId||'',shapeRevision:m.shapeRevision==null?null:m.shapeRevision}:{id:'',shapeId:'',shapeRevision:null};}
function salesSyncLineFromShape(line,s){const r=s&&ShapeModule.compute(s);if(!r||!r.valid)return false;line.width16=Math.round(r.width*16);line.height16=Math.round(r.height*16);line.shapeRef=salesShapeRefFrom(s);if(line.muntinRef&&line.muntinRef.id&&line.muntinRef.shapeId!==s.id)line.muntinRef=normalizeMuntinRef({});return true;}
function salesOrderConfigureShape(i){
 const line=soDraft.lines[i];if(!line)return;salesBridge={kind:'shape',lineId:line.id};tab='configurators';subtab='shape';sView='setup';sEdgeworkOpen=false;sFeaturesOpen=false;
 const current=salesShapeByRef(line.shapeRef);if(current){const idx=DB.shapeDef.findIndex(s=>s.id===current.id);sEdit=idx;sDraft=normalizeShapeDef(JSON.parse(JSON.stringify(current)));}
 else{sEdit='new';sDraft=newShapeDef('rectangle');sDraft.name=(soDraft.businessNumber||'SO')+' · '+(line.mark||('Line '+(i+1)));if(line.width16)sDraft.w=salesDimFrom16(line.width16);if(line.height16)sDraft.h=salesDimFrom16(line.height16);}
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
