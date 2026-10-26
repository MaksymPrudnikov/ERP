/* =====================================================================
   view/md-catalog  ·  md-catalog-1.0
   Data → Catalog в виде плана Master Data («Как выглядит Catalog»;
   владелец, 23.10.2026: «доделай до конца»): слева дерево групп со
   счётчиками, в центре список выбранного типа, справа превью строки.
   Поиск сверху — по всему каталогу. Счётчики «не хватает» только
   предупреждают.
   IN : таблицы Master Data; экраны списков из view/masterdata
   OUT: html

   Списки и карточки остались прежними функциями (viewMdGlass, viewMdSpacer,
   viewMdCatalogues, viewMdHardware): узел дерева только выбирает, какой
   из них открыт, — поэтому mdTab остаётся materials / works / hardware.
   ===================================================================== */
const MD_CATALOG_TREE=[
 ['Items',[['glassProduct','Glass','materials','glass'],['glassSheet','Supply points','materials','glass']]],
 ['IGU parts',[['spacerVariant','Spacers','materials','igu'],['gasProduct','Gas','materials','igu'],['sealantProduct','Sealants','materials','igu'],['iguPart','IGU parts','materials','igu']]],
 ['Lamination',[['interlayerProduct','Interlayers','materials','lamination']]],
 ['Surface',[['fritProduct','Frit','works'],['spandrelProduct','Spandrel','works'],['spandrelColour','Spandrel colours','works']]],
 ['Hardware',[['hardwareModel','Hinges, clamps, patches','hardware']]],
 ['Stock',[['stockItem','Stock items','materials','stock']]],
 ['Services',[['serviceRate','Works','works'],['heatTreatment','Heat treatment','works']]],
 ['Recipes',[['surroundRecipe','IGU surround','materials','igu']]]
];
const MD_CATALOG_TABS=['materials','works','hardware'];
let mdCatalogQuery='',mdPeek='';
function mdCatalogNode(){
 if(mdTab==='hardware')return 'hardwareModel';
 if(mdTab==='works')return mdCatKind;
 return mdMatView;
}
function mdCatalogGo(key){
 const hit=MD_CATALOG_TREE.flatMap(g=>g[1]).find(n=>n[0]===key);if(!hit)return;
 mdSetTab(hit[2]);if(hit[2]==='materials')mdMatSwitch(hit[3],key);else if(hit[2]==='works')mdCatKind=key;
 mdCatalogQuery='';mdPeek='';render();
}
function mdCatalogCount(key){return (DB[key]||[]).filter(x=>x&&x.active!==false).length;}
/* Чего не хватает по всему каталогу: цена, станция работы, замер рамки. */
function mdCatalogHealth(){
 const live=t=>(DB[t]||[]).filter(x=>x&&x.active!==false);
 const noPrice=live('glassProduct').filter(g=>g.salePriceAnnealed==null&&g.salePriceTempered==null).length
  +['spacerVariant','gasProduct','sealantProduct','iguPart','interlayerProduct','fritProduct','spandrelProduct'].reduce((n,t)=>n+live(t).filter(x=>x.salePrice==null).length,0);
 return [['No price',noPrice],['No station',live('serviceRate').filter(w=>!w.rule&&!w.station).length],['Not measured',live('spacerVariant').filter(x=>!x.weightMeasured).length]];
}
/* Поиск по всему каталогу: имя, код, поставщик. */
function mdCatalogSearch(q){
 q=q.trim().toLowerCase();if(!q)return [];
 const out=[];
 MD_CATALOG_TREE.forEach(([,nodes])=>nodes.forEach(([t,label])=>(DB[t]||[]).forEach(x=>{
  if(!x||![x.name,x.code,x.id,x.supplier,x.manufacturer,x.productCode].join(' ').toLowerCase().includes(q))return;
  out.push({t,label,x});})));
 return out;
}
function mdCatalogSearchChange(el){
 mdCatalogQuery=el.value;const pos=el.selectionStart;render();
 requestAnimationFrame(()=>{const e=document.getElementById('mdCatalogSearch');if(e){e.focus();try{e.setSelectionRange(pos,pos);}catch(x){}}});
}
/* Открыть карточку строки: узел дерева, затем форма своего списка. */
function mdCatalogOpen(t,id){
 mdCatalogGo(t);
 if(t==='glassProduct')mdGlassEdit(id);else if(t==='spacerVariant')mdSpacerEditRow(id);else if(t==='glassSheet')mdSheetEditRow(id);
 else if(t==='hardwareModel')mdHwModelEditRow(id);else if(t==='surroundRecipe')mdRecipeShow(id);else mdCatEditRow(id);
}
/* Рецепт правится прямо в своей карточке: Open — к ней на экране. */
function mdRecipeShow(id){
 const el=document.querySelector('[data-recipe="'+CSS.escape(id)+'"]');if(!el)return;
 el.scrollIntoView({block:'start'});el.classList.add('md-recipe-on');setTimeout(()=>el.classList.remove('md-recipe-on'),1500);
}
/* Превью: клик по строке списка (не по полю и не по кнопке). */
function mdCatalogRowClick(ev){
 const tr=ev.target.closest('[data-md-row]');if(!tr||ev.target.closest('input,select,button,a,textarea'))return;
 mdPeek=tr.getAttribute('data-md-row');render();
}
function mdPeekFacts(t,x){
 const money=v=>v==null?null:Number(v).toFixed(2),f=[],miss=[];
 if(t==='glassProduct'){f.push(['Thickness',x.thicknessMm==null?null:x.thicknessMm+' mm'],['Manufacturer',x.manufacturer],['Price AN',money(x.salePriceAnnealed)],['Price FT',money(x.salePriceTempered)],['Supply rows',String(glassSheetsFor(x.code).length)]);
  if(x.salePriceAnnealed==null&&x.salePriceTempered==null)miss.push('no price');if(!glassSheetsFor(x.code).length)miss.push('no supply');}
 else if(t==='spacerVariant'){const rec=surroundRecipeById(x.recipeId);f.push(['System',x.system],['Size',x.size],['Price',money(x.salePrice)],['Weight',x.weightG==null?null:x.weightG+' '+SPACER_WEIGHT_PER[x.weightPer]],['Recipe',rec?rec.name:null]);
  if(x.salePrice==null)miss.push('no price');if(x.weightG==null)miss.push('no weight');else if(!x.weightMeasured)miss.push('not measured');if(!rec)miss.push('no recipe');}
 else if(t==='serviceRate'){f.push(['Station',x.station],['Unit',x.unit],['Price',mdWorkTiersText(x)]);if(!x.rule&&!x.station)miss.push('no station');mdWorkWarnings(x).forEach(w=>miss.push(w));}
 /* Supply points, Hardware, Recipes (аудит 25.10.2026, D-1). Закупочная
    цена — с галочкой Cost & margin, не здесь. */
 else if(t==='glassSheet'){const g=glassProductByCode(x.productCode),sup=x.supplierId&&typeof purSupplierFind==='function'?purSupplierFind(x.supplierId):null;
  f.push(['Glass',g?g.code+' · '+g.name:x.productCode],['Supplier',sup?sup.name:x.supplier],['Sheet',x.sheetWIn&&x.sheetHIn?x.sheetWIn+' × '+x.sheetHIn+' in':null],['Unit',mdUnitName(x.purchaseUnit)],['Availability',x.availability],['Lead time',x.leadTimeDays==null?null:x.leadTimeDays+' days'],['Price date',x.priceDate]);
  if(!g)miss.push('no product');if(!x.sheetWIn||!x.sheetHIn)miss.push('size missing');}
 else if(t==='hardwareModel'){const kind=hardwareKindRow(x.kind);
  f.push(['Kind',kind?hardwareKindName(x.kind):null],['Series',x.series],['On the drawing',hardwareModelShort(x)],['Glass thickness',x.thickness],['Supplier code',x.supplierCode],['On drawings',String(mdHwModelUsage(x.id))],['Note',x.note]);
  if(!kind)miss.push('no kind');}
 else if(t==='surroundRecipe'){const fixed=p=>p==='spacer'||p==='gas',users=mdRecipeUsers(x.id);
  f.push(['PIB per side',x.pibPerSideMm==null?null:x.pibPerSideMm+' mm'],...x.rows.map(r=>[surroundPartLabel(r.part),fixed(r.part)?(r.part==='spacer'?'from the spacer card':'from the gas card'):r.amount==null?null:r.amount+' '+SURROUND_PER[r.per]+(r.wastePct?' · waste '+r.wastePct+'%':'')]),['Used by',users.length+' spacer'+(users.length===1?'':'s')]);
  if(x.rows.some(r=>!fixed(r.part)&&r.amount==null))miss.push('norm missing');}
 else{f.push(['Code',x.code],['Supplier',x.supplier],['Price',money(x.salePrice)]);if('salePrice' in x&&x.salePrice==null&&t!=='stockItem'&&t!=='heatTreatment')miss.push('no price');}
 return {facts:f,miss};
}
function mdPeekHTML(){
 const i=mdPeek.indexOf(':'),t=mdPeek.slice(0,i),id=mdPeek.slice(i+1),x=(DB[t]||[]).find(r=>r&&r.id===id);
 if(!x)return '<aside class="md-peek"><span class="mut">Click a row to preview.</span></aside>';
 const p=mdPeekFacts(t,x),label=(MD_CATALOG_TREE.flatMap(g=>g[1]).find(n=>n[0]===t)||[])[1]||t;
 const last=(DB.masterDataEvent||[]).filter(e=>e.tbl===t&&e.rowId===id).sort((a,b)=>String(b.at).localeCompare(String(a.at)))[0];
 const title=t==='glassSheet'?(x.productCode||'—')+' · '+(x.supplier||'—'):x.name||x.code||x.id;
 return `<aside class="md-peek" data-md-peek="${esc(mdPeek)}"><div class="md-peek-sec">${esc(label)}</div><h4>${raw(title)}</h4>
  <div class="md-peek-chips">${x.active===false?'<span class="pill warn">inactive</span>':''}${p.miss.map(m=>`<span class="pill warn">${esc(m)}</span>`).join('')}${!p.miss.length&&x.active!==false?'<span class="pill ok">complete</span>':''}</div>
  <dl class="md-kv">${p.facts.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${v==null||v===''?'<span class="mut">—</span>':raw(v)}</dd>`).join('')}</dl>
  <div class="md-peek-sec">Last change</div><div class="mut">${last?raw(last.what+(last.field?' · '+last.field:'')+' · '+(last.by||'—')+' · '+String(last.at).slice(0,10)):'No changes logged'}</div>
  <div class="row"><button class="pri" onclick="mdCatalogOpen('${esc(t)}','${esc(id)}')">${t==='surroundRecipe'?'Open recipe':'Open card'}</button><button onclick="mdPeek='';render()">Close</button></div></aside>`;
}
/* Открыта карточка строки каталога (форма своего списка). */
function mdRowFormOpen(){return mdEdit!==null||mdSheetEdit!==null||mdSpacerEdit!==null||mdCatEdit!==null||mdHwKindEdit!==null||mdHwModelEdit!==null;}
function viewMdCatalog(){
 const node=mdCatalogNode(),open=mdRowFormOpen();
 const tree=MD_CATALOG_TREE.map(([g,nodes])=>`<div class="md-tree-group">${esc(g)}</div>`+nodes.map(([k,label])=>`<button type="button" class="${k===node?'on':''}" data-md-node="${k}" onclick="mdCatalogGo('${k}')">${esc(label)} <span class="mut">${mdCatalogCount(k)}</span></button>`).join('')).join('');
 const label=(MD_CATALOG_TREE.flatMap(g=>g[1]).find(n=>n[0]===node)||[])[1]||'';
 const health=mdCatalogHealth().map(([k,n])=>`<span class="pill ${n?'warn':'ok'}">${esc(k)} ${n}</span>`).join(' ');
 const hits=mdCatalogSearch(mdCatalogQuery);
 let body;
 if(mdCatalogQuery.trim())body=`<div class="customer-table-wrap"><table data-md-search><thead><tr><th>Type</th><th>Name</th><th>Code</th><th></th></tr></thead><tbody>${hits.slice(0,MD_PAGE).map(h=>`<tr><td>${esc(h.label)}</td><td><b>${raw(h.x.name||h.x.id)}</b></td><td class="mono">${raw(h.x.code||h.x.productCode||'')}</td><td><button class="sm" onclick="mdCatalogOpen('${esc(h.t)}','${esc(h.x.id)}')">Open</button></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Nothing found</td></tr>'}</tbody></table></div>${hits.length>MD_PAGE?`<div class="hint">More: ${hits.length-MD_PAGE}</div>`:''}`;
 else if(mdTab==='hardware')body=viewMdHardware();
 else if(mdTab==='works')body=viewMdCatalogues()+(mdCatEdit===null&&mdCatKind==='serviceRate'?viewMdAllowance():'');
 else{const hit=mdMatResolve(mdMatCategory,mdMatView).hit;body=hit.view?({glass:viewMdGlass,supply:viewMdSupply,spacer:viewMdSpacer,recipe:viewMdRecipes})[hit.view]():viewMdCatalogues();}
 const peek=mdPeek&&!open&&!mdCatalogQuery.trim()?mdPeekHTML():'';
 return `<div class="md-catalog${peek?' md-catalog-peek':''}" data-md-catalog>
  <nav class="md-tree" aria-label="Catalog">${tree}</nav>
  <div class="md-catalog-main">
   <div class="md-catalog-head"><div><span class="md-crumb">Master Data › Catalog</span><h3>${esc(mdCatalogQuery.trim()?'Search':label)}</h3></div><div class="md-catalog-health" data-md-health>${health}</div></div>
   <div class="customer-search md-catalog-search"><input id="mdCatalogSearch" value="${esc(mdCatalogQuery)}" placeholder="Search all catalog: name, code, supplier…" oninput="mdCatalogSearchChange(this)"></div>
   <div onclick="mdCatalogRowClick(event)">${body}</div>
  </div>${peek}</div>`;
}
