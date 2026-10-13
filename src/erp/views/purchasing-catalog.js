/* Purchasing uses Sales' compact header, blocks, tables and catalogue
   selects. New supplier names create a reusable card explicitly. A name
   typed on a document must never become a second supplier account. */
let purNewSupplier=null,purGlassFilter={},purActiveGlass='';
function purSupplierControl(d,target){
 const prefix=target==='po'?'pur_po':target==='money'?'pur_money':'pur_delivery',id=target==='po'?prefix+'_card':prefix+'_supplier',change=target==='po'?'purPickSupplier':target==='money'?'purMoneySetSupplier':'purFulfilSetSupplier';
 const rows=(DB.supplier||[]).filter(s=>s.active||s.id===d.supplierId).slice().sort((a,b)=>a.name.localeCompare(b.name));
 const legacy=!d.supplierId&&d.supplierName,missing=d.supplierId&&!purSupplierFind(d.supplierId);
 return '<div class="pur-supplier-select"><label for="'+id+'">Supplier</label><div class="pur-select-add"><select id="'+id+'" onchange="'+change+'(this.value)"><option value="">Choose supplier</option>'+rows.map(s=>salesOption(s.id,s.name+(s.active?'':' · Archived'),d.supplierId,true)).join('')+(legacy?'<option value="" selected data-raw>'+esc(d.supplierName)+' · Legacy name</option>':'')+(missing?'<option selected value="'+esc(d.supplierId)+'" data-raw>'+esc(d.supplierName)+' · Missing card</option>':'')+'</select><button type="button" class="sm" aria-label="Add supplier" onclick="purNewSupplier={target:\''+target+'\',name:\'\'};render()">+</button></div>'+
  (purNewSupplier&&purNewSupplier.target===target?'<div class="pur-new-supplier"><label for="'+prefix+'_supplierName">New supplier name</label><input id="'+prefix+'_supplierName" value="'+esc(purNewSupplier.name)+'" oninput="purNewSupplier.name=this.value"><button type="button" class="sm" onclick="purSupplierCreate(\''+target+'\')">Add supplier</button><button type="button" class="sm" onclick="purNewSupplier=null;render()">Cancel</button></div>':'')+'</div>';
}
function purSupplierCreate(target){
 if(!purNewSupplier)return;const name=purText(purNewSupplier.name);if(!name){purNotice='Enter a supplier name.';render();return;}
 const existing=purSupplierNamed(name),r=existing?{ok:true,value:existing}:purSupplierSave({name,currency:'CAD'});
 if(!r.ok){purNotice=r.error;render();return;}purNewSupplier=null;purNotice='';
 if(target==='po')purPickSupplier(r.value.id);else if(target==='money')purMoneySetSupplier(r.value.id);else purFulfilSetSupplier(r.value.id);
}
function purFulfilSetSupplier(id){const d=purFulfilDraft.data,s=purSupplierFind(id);d.supplierId=id;d.supplierName=s?s.name:'';if(s)d.to=s.email;render();}
function purCurrencyControl(d,id,change){
 return '<div><label for="'+id+'">Currency</label><select id="'+id+'" onchange="'+change+';render()">'+[...new Set(['CAD','USD',d.currency].filter(Boolean))].map(c=>salesOption(c,c,d.currency,true)).join('')+'</select></div>';
}
function purGlassSelect(l,i,target){
 const key=target+':'+l.id,g=purGlassProduct(l),f=purGlassFilter[key]||{manufacturer:g?g.manufacturer:'',mm:g?String(g.thicknessMm):''},all=activeGlassProducts(),rows=all.filter(x=>(!f.manufacturer||x.manufacturer===f.manufacturer)&&(!f.mm||x.thicknessMm===+f.mm));
 if(g&&!rows.some(x=>x.id===g.id))rows.push(g);
 const handler=target==='po'?'purPOGlassPicked':'purReceiptGlassPicked';
 const filter=(field,options)=>'<select aria-label="'+(field==='manufacturer'?'Manufacturer ':'Thickness ')+(i+1)+'" onchange="purGlassFilterChanged('+i+',\''+target+'\',\''+field+'\',this.value)">'+options+'</select>';
 return '<div class="mu-field-grid mu-field-grid-4 pur-glass-selector"><div><label>Manufacturer</label>'+filter('manufacturer','<option value="">All manufacturers</option>'+salesUnique(all.map(g=>g.manufacturer)).sort().map(n=>salesOption(n,n,f.manufacturer,true)).join(''))+'</div><div><label>Thickness</label>'+filter('mm','<option value="">All thicknesses</option>'+salesUnique(all.filter(g=>!f.manufacturer||g.manufacturer===f.manufacturer).map(g=>g.thicknessMm)).sort((a,b)=>a-b).map(n=>salesOption(String(n),n+' mm',f.mm,true)).join(''))+'</div>'+
  '<div><label>Glass</label><select id="pur_'+target+'_glass_'+i+'" aria-label="Glass '+(i+1)+'" onchange="'+handler+'('+i+',this.value)"><option value="">Choose glass</option>'+salesSortGlass(rows,false).map(x=>salesOption(x.id,salesGlassLabel(x)+(glassIsPreorder(x)?' · '+glassLabel('stock','preorder'):''),g?g.id:l.productId,true)).join('')+(!g&&(l.productId||l.productCode)?'<option selected value="'+esc(l.productId)+'">'+esc(l.description||l.productCode)+' · Missing glass</option>':'')+'</select>'+(g?salesGlassMetaFor(g.id):'')+'</div>'+
  (target==='po'?purSupplyControl(l,i):'<div><label>Code</label><span class="mono" data-raw>'+esc(l.productCode||'—')+'</span></div>')+'</div>';
}
function purSupplyControl(l,i){
 const g=purGlassProduct(l),sheets=(DB.glassSheet||[]).filter(s=>s.productCode===(g?g.code:l.productCode)&&(!purOrderDraft.supplierId||s.supplierId===purOrderDraft.supplierId));
 return '<div><label for="pur_po_supply_'+i+'">Supply point / sheet size</label><select id="pur_po_supply_'+i+'" onchange="purPOSupplyPicked('+i+',this.value)"><option value="">Agreed size / price</option>'+sheets.map(s=>salesOption(s.id,[s.supplier,s.sheetWIn+' × '+s.sheetHIn+' in',s.currency].join(' · '),l.sheetId,true)).join('')+'</select></div>';
}
function purGlassLetter(i){return String.fromCharCode(65+i%26)+(i>=26?Math.floor(i/26):'');}
function purPOGlassBuilder(entries){
 if(!entries.length)return '';
 const active=entries.find(x=>x.l.id===purActiveGlass)||entries[0],l=active.l,i=active.i,letter=purGlassLetter(i),g=purGlassProduct(l);
 const tabs=entries.map(({l,i})=>'<button type="button" class="mu-tab '+(l.id===active.l.id?'on':'')+'" onclick="purActiveGlass='+purArg(l.id)+';render()"><b>'+purGlassLetter(i)+'</b><span data-raw>'+esc(l.description||'Choose glass')+'</span></button>').join('');
 return '<section class="sales-block"><div class="sales-block-head"><div><b>GLASS / PURCHASE ITEMS</b></div></div><div class="mu-strip"><div class="mu-strip-scroll">'+tabs+'</div><button type="button" class="mu-add" data-pur-add-glass onclick="purOrderAddLine(\'glass\');purActiveGlass=purOrderDraft.lines.at(-1).id;render()">+ Glass</button></div><div class="mu-builder"><div class="mu-builder-head"><div><b>GLASS '+letter+'</b><span data-raw>'+esc(l.description||'Choose glass')+'</span></div><div class="mu-builder-actions"><button type="button" class="sm" onclick="purPicker={kind:\'sheet\'};render()">From supply points</button><button type="button" class="sm" onclick="purPicker={kind:\'order\',orderId:\'\',lineId:\'\'};render()">From customer order</button></div></div><details class="mu-section" open><summary><span class="mu-chevron">⌄</span><b>GLASS '+letter+'</b><span class="mu-summary" data-raw>'+esc(g?g.code:l.spec?l.spec.orderNumber:'')+'</span></summary><div class="mu-section-body">'+(l.kind==='order'?'<div data-raw>'+purSpecTexts(l.spec).map(x=>'<p>'+esc(x)+'</p>').join('')+'</div>':purGlassSelect(l,i,'po'))+'</div></details></div></section>';
}
function purPOGlassPicked(i,id){
 const d=purOrderDraft,l=d.lines[i],g=glassProductById(id);if(!g)return;
 Object.assign(l,{kind:'glass',productId:g.id,productCode:g.code,description:g.name,sheetId:'',sourceCurrency:'',price:null});render();
}
function purPOSupplyPicked(i,id){
 const l=purOrderDraft.lines[i],s=(DB.glassSheet||[]).find(s=>s.id===id);if(!s){l.sheetId='';render();return;}
 if(!purOrderDraft.supplierId&&s.supplierId)purPickSupplier(s.supplierId,false);
 if(s.supplierId!==purOrderDraft.supplierId){purNotice='Choose a supply point for the selected supplier.';render();return;}
 const row=purSheetLine(id);Object.assign(l,row,{id:l.id,qty:l.qty,unit:l.unit||row.unit,held:l.held,note:l.note,expectedDate:l.expectedDate,sheetsPerBlock:l.sheetsPerBlock});render();
}
function purPOCell(l,i,k,label,type){
 const input=purLineInput(l,i,k,label,type);return '<td>'+input+'</td>';
}
function purPOGlassRow(l,i){
 const total=purLineTotal(l);
 return '<tr data-pur-line="'+i+'"><td class="mono line-num">'+(i+1)+'</td><td><button type="button" class="line-link-btn" data-pur-glass-ref="'+i+'" onclick="purActiveGlass='+purArg(l.id)+';render()">'+purGlassLetter(i)+' · '+esc(l.description||'Choose glass')+'</button></td>'+purPOCell(l,i,'qty','Quantity','number')+purPOCell(l,i,'widthIn','Width, in','number')+purPOCell(l,i,'heightIn','Height, in','number')+'<td><label class="pur-cell-label" for="pur_line_'+i+'_unit">Order unit</label><select id="pur_line_'+i+'_unit" onchange="purOrderDraft.lines['+i+'].unit=this.value;render()">'+[...new Set(['sheet','block','each',l.unit].filter(Boolean))].map(u=>salesOption(u,mdUnitName(u)||u,l.unit,true)).join('')+'</select></td>'+purPOCell(l,i,'sheetsPerBlock','Sheets per block','number')+purPOCell(l,i,'price','Price','number')+purPOCell(l,i,'priceUnit','Price per')+'<td class="n"><b data-pur-line-total="'+i+'">'+(total==null?'—':esc(docNum(total,2)))+'</b></td><td><input type="checkbox" aria-label="Held at supplier '+(i+1)+'" '+(l.held?'checked':'')+' onchange="purOrderDraft.lines['+i+'].held=this.checked"></td><td><button type="button" class="sm dl line-delete" aria-label="Remove line '+(i+1)+'" onclick="purOrderDraft.lines.splice('+i+',1);render()">×</button></td></tr>'+
  '<tr class="pur-glass-detail"><td colspan="12"><details class="pur-spec"><summary>Line note / expected date</summary><div class="sales-header-compact">'+purLineInput(l,i,'expectedDate','Expected','date')+purLineInput(l,i,'note','Line note')+'</div></details>'+(l.sourceCurrency&&l.sourceCurrency!==purOrderDraft.currency?'<p class="warn">Supply quote: '+esc(l.sourceCurrency)+'. Enter the agreed price in '+esc(purOrderDraft.currency)+'.</p>':'')+'</td></tr>';
}
function purPOLinesHTML(){
 const glass=purOrderDraft.lines.map((l,i)=>({l,i})).filter(x=>purIsGlass(x.l)),extra=purOrderDraft.lines.map((l,i)=>({l,i})).filter(x=>!purIsGlass(x.l));
 return purPOGlassBuilder(glass)+'<section class="sales-block sales-lines-block"><div class="sales-lines-head"><div><b>ORDER LINES</b></div><div class="sales-line-tools"><button type="button" class="pri" onclick="purOrderAddLine(\'glass\');purActiveGlass=purOrderDraft.lines.at(-1).id;render()">+ Line</button></div></div><div class="sales-table-wrap"><table class="sales-lines-table pur-glass-table"><thead><tr>'+['#','Glass','Qty','Width, in','Height, in','Unit','Sheets / block','Price','Price per','Line total','Held',''].map(n=>'<th>'+esc(n)+'</th>').join('')+'</tr></thead><tbody>'+glass.map(({l,i})=>purPOGlassRow(l,i)).join('')+(!glass.length?'<tr><td colspan="12" class="empty">No glass in this order.</td></tr>':'')+'</tbody></table></div></section>'+
  (extra.length?'<section class="sales-block sales-extra-items"><div class="sales-block-head"><b>STOCK &amp; EXTRA ITEMS</b></div><div class="customer-table-wrap"><table class="sales-lines-table pur-extra-table"><thead><tr>'+['Item','Qty','Unit','Price','Price per','Note','Total',''].map(n=>'<th>'+n+'</th>').join('')+'</tr></thead><tbody>'+extra.map(({l,i})=>purOrderLineHTML(l,i)).join('')+'</tbody></table></div></section>':'')+
  '<div class="sales-extra-items-quiet"><button type="button" class="sm" onclick="purPicker={kind:\'stock\'};render()">+ Add Stock Item</button><button type="button" class="sm" data-pur-add-line onclick="purOrderAddLine(\'other\')">+ Other item</button></div>';
}
function purReceiptGlassPicked(i,id){const l=purFulfilDraft.data.lines[i],g=glassProductById(id);if(g){Object.assign(l,{kind:'glass',productId:g.id,productCode:g.code,description:g.name,sheetId:''});render();}}

function purFulfilAddLine(kind){const d=purFulfilDraft.data;if(kind==='other'&&d.lines.length===1&&!d.lines[0].description&&!d.lines[0].productCode)d.lines=[];d.lines.push(purFulfilLine({id:salesUid('RL'),kind,unit:kind==='glass'?'sheet':''},0));render();}

function purPOStatusStrip(p){
 const status=purOrderStatus(p),states=['Draft','Sent','Partially received','Received','Closed'];
 return '<div class="sales-status-row"><div class="sales-steps">'+states.map(n=>'<div class="sales-step '+(status===n?'cur':'')+'"><span class="sales-step-label"><i></i><b>'+n+'</b></span></div>').join('')+'</div><div class="sales-status-readonly">Status history · read only</div></div>';
}

/* The lists use the same visible controls and preference engine as Sales. */
function purListStatus(value){if(value)salesListSetFilter('status',{values:[value]});else salesListClearFilter('status');}
function purListFilters(infos){
 const columns=salesListCatalog(),has=k=>columns.some(c=>c.k===k),prefs=salesListLoadPrefs();
 let quick='';
 if(has('status')){
  const base=salesListRows(infos,['status']),statuses=purView==='orders'?['Draft','Sent','Partially received','Received','Closed','Cancelled']:purView==='suppliers'?['Active','Archived']:[...new Set(base.map(i=>salesListValue(i,'status')).filter(Boolean))],f=prefs.filters.status,selected=f&&f.values&&f.values.length===1?f.values[0]:'';
  quick='<div class="sl-quick" role="tablist" aria-label="Purchase status">'+['',...statuses].map(status=>'<button type="button" role="tab" aria-selected="'+(!status?!salesListFilterActive(f):selected===status)+'" class="sl-quick-pill '+((!status?!salesListFilterActive(f):selected===status)?'on':'')+'" data-pur-status="'+esc(status)+'" onclick="purListStatus('+purArg(status)+')">'+esc(status||'All')+' <b>'+base.filter(i=>!status||salesListValue(i,'status')===status).length+'</b></button>').join('')+'</div>';
 }
 const button=(k,label)=>'<button type="button" class="sl-quiet" data-pur-filter="'+k+'" onclick="salesListOpenFilter(event,\''+k+'\')">'+label+'<span class="sl-disclosure">▾</span></button>';
 const date=purListDateColumn();
 return quick+'<div class="sl-view-controls">'+(has('supplierName')?button('supplierName','Supplier'):purView==='suppliers'?button('name','Supplier'):'')+(date?salesListDateButton(date):'')+(has('currency')?button('currency','Currency'):'')+(purView==='history'?button('entity','Document')+button('by','Recorded by'):'')+'</div>'+salesListFilterChips();
}

function purListDefaults(){return ['orders','receipts','requests','invoices','payments'].includes(purView)?{date:{preset:'last30'}}:purView==='history'?{at:{preset:'last30'}}:{};}
let purPages={};
function purPageState(rows){
 const scope=purListScope(),prefs=salesListLoadPrefs(),signature=JSON.stringify([prefs.filters,prefs.sort]);
 if(!purPages[scope]||purPages[scope].signature!==signature)purPages[scope]={signature,index:0};
 const state=purPages[scope];state.index=Math.max(0,Math.min(state.index,Math.ceil(rows.length/50)-1));return state;
}
function purPageRows(rows){const p=purPageState(rows);return rows.slice(p.index*50,p.index*50+50);}
function purListPager(rows){
 const p=purPageState(rows),from=rows.length?p.index*50+1:0,to=Math.min(rows.length,(p.index+1)*50);
 return '<div class="pur-pagination"><span>'+from+'–'+to+' of '+rows.length+' records</span><span class="sales-toolbar-sp"></span><button type="button" class="sl-quiet" aria-label="Previous page" '+(!p.index?'disabled':'')+' onclick="purPages[purListScope()].index--;render()">←</button><button type="button" class="sl-quiet" aria-label="Next page" '+(to>=rows.length?'disabled':'')+' onclick="purPages[purListScope()].index++;render()">→</button></div>';
}

function purListDateColumn(){const columns=purListColumns();return ['date','at','expectedDate'].find(k=>columns.some(c=>c.k===k&&c.type==='date'))||'';}

function purGlassFilterChanged(i,target,field,value){
 const l=target==='po'?purOrderDraft.lines[i]:purFulfilDraft.data.lines[i],g=purGlassProduct(l),key=target+':'+l.id,f=purGlassFilter[key]||{manufacturer:g?g.manufacturer:'',mm:g?String(g.thicknessMm):''};
 f[field]=value;if(field==='manufacturer')f.mm='';purGlassFilter[key]=f;
 if(g&&((f.manufacturer&&g.manufacturer!==f.manufacturer)||(f.mm&&g.thicknessMm!==+f.mm)))Object.assign(l,{kind:'glass',productId:'',productCode:'',description:'',sheetId:'',sourceCurrency:'',price:null});
 render();
}
