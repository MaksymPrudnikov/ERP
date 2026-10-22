/* =====================================================================
   erp/views/price-lists-ui  ·  price-lists-ui-1.0
   Экраны прайсов (erp/sales/price-lists): Data → Prices — группы клиентов,
   группы айтемов, одна цена сразу нескольким клиентам; вкладка Prices в
   карточке клиента — его личный прайс. Правка прайса пишется сразу, как в
   Works: журнал Master Data видит каждую цену «было → стало».
   ===================================================================== */
let plView='groups',plGroupId='',plItemGroupId='',plAddKind='',plBulk=null,plFile=null;

function plNow(){return new Date().toISOString();}
function plMoney(v){return v==null?'—':(+v).toFixed(2);}
function plRowText(r){return priceListRowText(r,plMoney)||'—';}
/* Цели строк прайса для выбора: группы айтемов первыми, потом по видам. */
function plTargetOptions(targets,withGroups,selected){
 const kinds=[...new Set(targets.map(t=>t.kind))];
 const g=withGroups?`<optgroup label="Item groups">${(DB.itemGroup||[]).map(x=>`<option value="group:${esc(x.id)}"${selected==='group:'+x.id?' selected':''}>${esc(x.name||'Unnamed')}</option>`).join('')}</optgroup>`:'';
 return `<option value="">— Item, service or group —</option>${g}${kinds.map(k=>`<optgroup label="${esc(k)}">${targets.filter(t=>t.kind===k).map(t=>`<option value="${esc(t.key)}"${selected===t.key?' selected':''}>${esc(t.label)}</option>`).join('')}</optgroup>`).join('')}`;
}
function plBaseText(t){
 if(!t)return '—';
 if(t.tiers)return t.tiers.map(x=>plMoney(x.price)).join(' / ');
 return plMoney(t.base);
}
/* Таблица строк одного прайса — общая для группы клиента и личного. */
function plListTable(list){
 const targets=salesPriceTargets(),byKey=new Map(targets.map(t=>[t.key,t]));
 const num=(row,field,band,v)=>`<input type="number" min="0" step="0.01" value="${v==null?'':esc(v)}" placeholder="—" style="width:84px" onchange="plSetPrice('${esc(list.id)}','${esc(row.id)}',${band?`'${esc(band)}'`:'null'},this.value)" aria-label="${esc(field)}">`;
 const body=list.rows.map(r=>{
  const t=byKey.get(r.target),tiers=t&&t.tiers;
  const price=tiers?`<div class="row" style="gap:4px;flex-wrap:wrap">${num(r,'All thicknesses',null,r.price)}${tiers.map(x=>`<label class="mut" style="display:flex;align-items:center;gap:3px">${esc(serviceRateTierShort(x))}${num(r,serviceRateTierLabel(x),x.id,r.bands?r.bands[x.id]:null)}</label>`).join('')}</div>`:num(r,'Price',null,r.price);
  return `<tr data-pl-row><td>${esc(salesPriceTargetLabel(r.target,targets))}</td><td class="mono mut">${t?esc(plBaseText(t))+(t.unit?' / '+esc(t.unit):''):'—'}</td><td>${price}</td><td><button class="sm dl" title="Remove" onclick="plRemoveRow('${esc(list.id)}','${esc(r.id)}')">×</button></td></tr>`;
 }).join('');
 return `<table data-pl-list="${esc(list.id)}"><thead><tr><th>Item</th><th>Base</th><th>Price${list.rows.some(r=>(byKey.get(r.target)||{}).tiers)?' · all / by mm':''}</th><th></th></tr></thead><tbody>${body||'<tr><td colspan="4" class="mut">No prices yet — base prices apply.</td></tr>'}</tbody></table>
  <div class="row" style="gap:8px;margin-top:8px"><select aria-label="Add price" style="max-width:360px" onchange="plAddRow('${esc(list.id)}',this.value)">${plTargetOptions(targets,true,'')}</select><span class="mut">Empty price — next list decides. 0 is a price.</span></div>`;
}
function plList(id){return priceListById(id);}
function plCommand(fn){const out=storageCommand(()=>{fn();normalizePriceLists();return true;});if(!out.ok)alert(out.error);render();}
function plAddRow(listId,target){
 if(!target)return;
 plCommand(()=>{const l=plList(listId);if(!l)return;if(l.rows.some(r=>r.target===target))return;l.rows.push({id:salesUid('PLR'),target,price:null,at:plNow()});});
}
function plSetPrice(listId,rowId,band,v){
 const txt=String(v==null?'':v).trim(),n=txt===''?null:Number(txt);
 if(n!=null&&(!Number.isFinite(n)||n<0)){alert('Enter a price of 0 or more.');render();return;}
 plCommand(()=>{const r=(plList(listId)||{rows:[]}).rows.find(x=>x.id===rowId);if(!r)return;
  if(band){r.bands=Object.assign({},r.bands||{});r.bands[band]=n;}else r.price=n;r.at=plNow();});
}
function plRemoveRow(listId,rowId){plCommand(()=>{const l=plList(listId);if(l)l.rows=l.rows.filter(r=>r.id!==rowId);});}

/* --- Data → Prices ------------------------------------------------------ */
function viewMdPrices(){
 const views=[['groups','Customer groups'],['items','Item groups'],['bulk','Set for customers'],['file','Excel']];
 const subs=`<div class="md-mat-subs" data-pl-subs>${views.map(([k,label])=>`<button class="sm ${k===plView?'on':''}" onclick="plView='${k}';render()">${label}</button>`).join('')}</div>`;
 return subs+(plView==='items'?plItemGroupsView():plView==='bulk'?plBulkView():plView==='file'?plFileView():plGroupsView());
}
function plGroupCustomers(id){return (DB.customer||[]).filter(c=>c.priceGroupId===id&&c.status!=='archived');}
function plGroupsView(){
 const groups=priceListGroups();if(plGroupId&&!groups.some(g=>g.id===plGroupId))plGroupId='';
 const g=priceListById(plGroupId);
 const list=groups.map(x=>`<tr data-pl-group class="${x.id===plGroupId?'sel':''}" style="cursor:pointer" onclick="plGroupId='${esc(x.id)}';render()"><td><b>${esc(x.name||'Unnamed group')}</b></td><td class="mono">${plGroupCustomers(x.id).length}</td><td class="mono">${x.rows.length}</td></tr>`).join('');
 return `<div class="sub">Customer group = special prices for its customers. A customer's personal prices beat the group; what neither has comes from base prices.</div>
  <div class="row" style="gap:16px;align-items:flex-start;flex-wrap:wrap">
   <div style="flex:0 0 300px"><table><thead><tr><th>Group</th><th>Customers</th><th>Prices</th></tr></thead><tbody>${list||'<tr><td colspan="3" class="mut">No groups yet.</td></tr>'}</tbody></table>
    <button class="pri" style="margin-top:8px" onclick="plNewGroup()">+ Customer group</button></div>
   <div style="flex:1 1 480px;min-width:0">${g?plGroupEditor(g):'<div class="mut">Pick a group.</div>'}</div>
  </div>`;
}
function plGroupEditor(g){
 const members=plGroupCustomers(g.id),others=(DB.customer||[]).filter(c=>c.status!=='archived'&&c.priceGroupId!==g.id);
 return `<div class="row" style="gap:8px;margin-bottom:10px"><input aria-label="Group name" value="${esc(g.name)}" onchange="plRenameGroup('${esc(g.id)}',this.value)" style="max-width:260px"><button class="sm dl" onclick="plDeleteGroup('${esc(g.id)}')">Delete group</button></div>
  <h4>Customers · ${members.length}</h4>
  <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:8px" data-pl-members>${members.map(c=>`<span class="pill info">${esc(c.displayName||c.legalName)} <button class="sm" title="Remove from group" onclick="plSetCustomerGroup('${esc(c.id)}','')">×</button></span>`).join('')||'<span class="mut">No customers.</span>'}</div>
  <select aria-label="Add customer" style="max-width:320px;margin-bottom:14px" onchange="plSetCustomerGroup(this.value,'${esc(g.id)}')"><option value="">+ Add customer</option>${others.map(c=>`<option value="${esc(c.id)}">${esc(c.displayName||c.legalName)}${c.priceGroupId?' · now '+esc(customerGroupName(c)):''}</option>`).join('')}</select>
  <h4>Prices</h4>${plListTable(g)}`;
}
function plNewGroup(){
 const name=prompt('Customer group name');if(name==null||!name.trim())return;
 const id=salesUid('PL');plCommand(()=>{DB.priceList.push({id,kind:'group',name:name.trim(),customerId:'',rows:[]});});plGroupId=id;render();
}
function plRenameGroup(id,name){plCommand(()=>{const g=plList(id);if(g)g.name=String(name||'').trim();});}
function plDeleteGroup(id){
 const n=plGroupCustomers(id).length;
 if(!confirm(n?n+' customer'+(n>1?'s':'')+' leave this group and get base prices. Delete the group?':'Delete this group?'))return;
 plCommand(()=>{DB.priceList=DB.priceList.filter(l=>l.id!==id);(DB.customer||[]).forEach(c=>{if(c.priceGroupId===id){c.priceGroupId='';c.group='';c.updatedAt=plNow();}});});
}
/* Клиент в группе один: добавить в другую — значит перевести. */
function plSetCustomerGroup(customerId,groupId){
 if(!customerId)return;
 plCommand(()=>{const c=(DB.customer||[]).find(x=>x.id===customerId);if(c){c.priceGroupId=groupId||'';c.group='';c.updatedAt=plNow();}});
}

function plItemGroupsView(){
 const groups=DB.itemGroup||[];if(plItemGroupId&&!groups.some(g=>g.id===plItemGroupId))plItemGroupId='';
 const g=itemGroupById(plItemGroupId),targets=salesPriceTargets();
 const list=groups.map(x=>`<tr data-pl-item-group class="${x.id===plItemGroupId?'sel':''}" style="cursor:pointer" onclick="plItemGroupId='${esc(x.id)}';render()"><td><b>${esc(x.name||'Unnamed')}</b></td><td class="mono">${x.members.length}</td></tr>`).join('');
 const editor=g?`<div class="row" style="gap:8px;margin-bottom:10px"><input aria-label="Item group name" value="${esc(g.name)}" onchange="plItemGroupSet('${esc(g.id)}',x=>{x.name=String(${'this.value'}).trim();})" style="max-width:260px"><button class="sm dl" onclick="plItemGroupDelete('${esc(g.id)}')">Delete group</button></div>
   <table><thead><tr><th>Item</th><th></th></tr></thead><tbody>${g.members.map(k=>`<tr data-pl-member><td>${esc(salesPriceTargetLabel(k,targets))}</td><td><button class="sm dl" title="Remove" onclick="plItemGroupSet('${esc(g.id)}',x=>{x.members=x.members.filter(m=>m!=='${esc(k)}');})">×</button></td></tr>`).join('')||'<tr><td colspan="2" class="mut">No items yet.</td></tr>'}</tbody></table>
   <select aria-label="Add item" style="max-width:360px;margin-top:8px" onchange="if(this.value)plItemGroupSet('${esc(g.id)}',x=>{x.members.push(this.value);})">${plTargetOptions(targets.filter(t=>!g.members.includes(t.key)),false,'')}</select>`:'<div class="mut">Pick a group.</div>';
 return `<div class="sub">Item group = one price line for many items, e.g. "Edge work". Inside a price list, an item's own price beats its group; an item in two groups takes the group priced last.</div>
  <div class="row" style="gap:16px;align-items:flex-start;flex-wrap:wrap">
   <div style="flex:0 0 300px"><table><thead><tr><th>Item group</th><th>Items</th></tr></thead><tbody>${list||'<tr><td colspan="2" class="mut">No item groups yet.</td></tr>'}</tbody></table>
    <button class="pri" style="margin-top:8px" onclick="plNewItemGroup()">+ Item group</button></div>
   <div style="flex:1 1 480px;min-width:0">${editor}</div>
  </div>`;
}
function plNewItemGroup(){
 const name=prompt('Item group name');if(name==null||!name.trim())return;
 const id=salesUid('IG');plCommand(()=>{DB.itemGroup.push({id,name:name.trim(),members:[]});});plItemGroupId=id;render();
}
function plItemGroupSet(id,fn){plCommand(()=>{const g=itemGroupById(id);if(g)fn(g);});}
function plItemGroupDelete(id){
 const used=(DB.priceList||[]).filter(l=>l.rows.some(r=>r.target==='group:'+id)).length;
 if(!confirm(used?'Used in '+used+' price list'+(used>1?'s':'')+'; those lines stop working. Delete the item group?':'Delete this item group?'))return;
 plCommand(()=>{DB.itemGroup=DB.itemGroup.filter(g=>g.id!==id);});
}

/* Одна цена сразу нескольким клиентам (владелец: массовая правка —
   фиксированной ценой, не процентом). Пишется в личные прайсы. */
function plBulkView(){
 const b=plBulk=plBulk||{target:'',price:'',bands:{},ids:[],q:''};
 const targets=salesPriceTargets(),t=targets.find(x=>x.key===b.target),q=b.q.trim().toLowerCase();
 const customers=(DB.customer||[]).filter(c=>c.status!=='archived'&&(!q||[c.displayName,c.legalName,c.code,customerGroupName(c)].some(x=>String(x||'').toLowerCase().includes(q))));
 const field=(label,v,set)=>`<label class="mut" style="display:flex;align-items:center;gap:4px">${label}<input type="number" min="0" step="0.01" value="${esc(v)}" style="width:84px" oninput="${set}=this.value"></label>`;
 return `<div class="sub">One fixed price into the personal price list of every ticked customer. Their other prices stay.</div>
  <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">
   <select aria-label="Item" style="max-width:360px" onchange="plBulk.target=this.value;plBulk.bands={};render()">${plTargetOptions(targets,true,b.target)}</select>
   ${field(t&&t.tiers?'All mm':'Price',b.price,'plBulk.price')}
   ${t&&t.tiers?t.tiers.map(x=>field(esc(serviceRateTierShort(x)),b.bands[x.id]==null?'':b.bands[x.id],`plBulk.bands['${esc(x.id)}']`)).join(''):''}
   <button class="pri" data-pl-bulk-apply onclick="plBulkApply()">Set for ${b.ids.length} customer${b.ids.length===1?'':'s'}</button>
  </div>
  <div class="row" style="gap:8px;margin-bottom:8px"><input aria-label="Find customers" placeholder="Find customer or group" value="${esc(b.q)}" oninput="plBulk.q=this.value;render()" style="max-width:260px">
   <button class="sm" onclick="plBulk.ids=[...new Set(plBulk.ids.concat(${esc(JSON.stringify(customers.map(c=>c.id)))}))];render()">Tick shown</button><button class="sm" onclick="plBulk.ids=[];render()">Clear</button></div>
  <table><thead><tr><th></th><th>Customer</th><th>Group</th><th>Now</th></tr></thead><tbody>${customers.map(c=>{const r=b.target?(priceListOfCustomer(c.id)||{rows:[]}).rows.find(x=>x.target===b.target):null;
   return `<tr data-pl-bulk-row><td><input type="checkbox" ${b.ids.includes(c.id)?'checked':''} onchange="plBulk.ids=this.checked?plBulk.ids.concat('${esc(c.id)}'):plBulk.ids.filter(x=>x!=='${esc(c.id)}');render()"></td><td>${esc(c.displayName||c.legalName)}</td><td>${esc(customerGroupName(c)||'—')}</td><td class="mono">${r?esc(plRowText(r)):'—'}</td></tr>`;}).join('')||'<tr><td colspan="4" class="mut">No customers.</td></tr>'}</tbody></table>`;
}
function plBulkApply(){
 const b=plBulk;if(!b||!b.target)return alert('Pick an item, service or group.');
 if(!b.ids.length)return alert('Tick at least one customer.');
 const num=v=>{const s=String(v==null?'':v).trim();if(s==='')return null;const n=Number(s);return Number.isFinite(n)&&n>=0?n:NaN;};
 const t=salesPriceTargets().find(x=>x.key===b.target),price=num(b.price),bands=Object.fromEntries(((t&&t.tiers)||[]).map(x=>[x.id,num(b.bands[x.id])]));
 if([price,...Object.values(bands)].some(v=>Number.isNaN(v)))return alert('Enter prices of 0 or more.');
 const useBands=Object.values(bands).some(v=>v!=null);
 if(price==null&&!useBands)return alert('Enter a price.');
 plCommand(()=>{const at=plNow();b.ids.forEach(id=>{
  let l=priceListOfCustomer(id);if(!l){l={id:salesUid('PL'),kind:'customer',name:'',customerId:id,rows:[]};DB.priceList.push(l);}
  let r=l.rows.find(x=>x.target===b.target);if(!r){r={id:salesUid('PLR'),target:b.target};l.rows.push(r);}
  r.price=price;if(useBands)r.bands=Object.assign({},bands);else delete r.bands;r.at=at;});});
}

/* --- Карточка клиента → Prices ----------------------------------------- */
function customerPricesTab(){
 const c=cDraft;if(cEdit==='new')return '<div class="mut">Save the customer first.</div>';
 const l=priceListOfCustomer(c.id),g=priceListById(c.priceGroupId);
 return `<div class="sub">Personal prices beat the group <b>${esc(g?g.name||'Unnamed group':'— none —')}</b>; what neither has comes from base prices. Changes save at once.</div>
  ${l?plListTable(l):`<button class="pri" data-pl-personal-new onclick="plNewPersonal('${esc(c.id)}')">+ Personal prices</button>`}`;
}
function plNewPersonal(customerId){plCommand(()=>{if(!priceListOfCustomer(customerId))DB.priceList.push({id:salesUid('PL'),kind:'customer',name:'',customerId,rows:[]});});}

/* --- Заказ: откуда цены и Update prices ---------------------------------- */
function salesPriceListStrip(o){
 const c=salesFindCustomer(o.customerId);if(!c)return '';
 const mine=priceListOfCustomer(c.id),g=priceListById(c.priceGroupId),saved=!!o.priceBook;
 const from=new Set(Object.values(o.priceFrom||{}));(o.lines||[]).forEach(l=>Object.values(l.chargePricing||{}).forEach(r=>{if(r&&r.from)from.add(r.from);}));
 const chain=[mine&&mine.rows.length?'Personal ('+mine.rows.length+')':'',g?(g.name||'Unnamed group')+' ('+g.rows.length+')':'','Base'].filter(Boolean).join(' → ');
 return `<div class="sales-price-lists mut" data-price-strip style="display:flex;gap:10px;align-items:center;margin:6px 0;font-size:12px">Prices: ${esc(chain)}${from.size?` · <span data-raw>used: ${esc([...from].map(priceListName).join(', '))}</span>`:''}${saved?`<button class="sm" data-update-prices onclick="if(confirm('Update prices from today\\'s price lists? Prices typed by hand stay.')){salesUpdatePrices();render();}">Update prices</button>`:''}</div>`;
}

/* --- Data → Prices → Excel: выгрузка и загрузка «было / станет» --------- */
let plFileScope='all';
function plFileView(){
 const f=plFile,groups=priceListGroups(),customers=(DB.customer||[]).filter(c=>c.status!=='archived');
 const opt=(v,label)=>`<option value="${esc(v)}"${plFileScope===v?' selected':''}>${esc(label)}</option>`;
 const scopes=opt('all','All price lists · priced rows')
  +(groups.length?`<optgroup label="Customer group · every item">${groups.map(g=>opt('list:'+g.id,g.name||'Unnamed group')).join('')}</optgroup>`:'')
  +(customers.length?`<optgroup label="Customer · every item">${customers.map(c=>opt('customer:'+c.id,priceFileCustomerName(c))).join('')}</optgroup>`:'');
 let body='';
 if(f&&f.plan){
  const p=f.plan,rows=p.changes.map(ch=>`<tr data-pl-file-change><td>${esc(ch.personal?'Personal · '+ch.listName:ch.listName)}${!ch.listId?' <span class="pill warn">new</span>':''}</td><td>${esc(ch.label)}</td><td class="mono mut">${esc(priceFileText(ch.was))}</td><td class="mono"><b>${esc(priceFileText(ch.next))}</b></td></tr>`).join('');
  body=`<h4>${esc(f.name)} · ${p.changes.length} change${p.changes.length===1?'':'s'} · ${p.same} same · ${p.errors.length} error${p.errors.length===1?'':'s'}</h4>
   ${p.newGroups.length?`<div class="sub">New customer groups: <b>${esc(p.newGroups.join(', '))}</b></div>`:''}
   <table data-pl-file-preview><thead><tr><th>List</th><th>Item</th><th>Was</th><th>Will be</th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="mut">Nothing to change.</td></tr>'}</tbody></table>
   ${p.errors.length?`<h4 style="margin-top:12px">Skipped rows</h4><table data-pl-file-errors><thead><tr><th>Row</th><th>Why</th></tr></thead><tbody>${p.errors.map(e=>`<tr><td class="mono">${e.line}</td><td>${esc(e.why)}</td></tr>`).join('')}</tbody></table>`:''}
   <div class="row" style="gap:8px;margin-top:10px"><button class="pri" data-pl-file-write ${p.changes.length?'':'disabled'} onclick="plFileWrite()">Write ${p.changes.length} change${p.changes.length===1?'':'s'}</button><button onclick="plFile=null;render()">Cancel</button></div>`;
 }else if(f&&f.done)body=`<div class="sub" data-pl-file-done>${esc(f.name)}: ${f.done.written} price${f.done.written===1?'':'s'} written${f.done.errors?', '+f.done.errors+' rows skipped':''}.</div>`;
 return `<div class="sub">Export, edit prices in Excel, load the file back. Nothing is written until you check "Was → Will be". Rows not in the file stay as they are; an empty price removes it.</div>
  <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:12px">
   <select aria-label="Export what" style="max-width:360px" onchange="plFileScope=this.value">${scopes}</select>
   <button onclick="plFileExport()">Export</button>
   <button onclick="document.getElementById('plCsv').click()">Load file</button>
   <input type="file" id="plCsv" accept=".csv,.txt" style="display:none" onchange="plFileLoad(this)">
  </div>${body}`;
}
function plFileExport(){
 const s=plFileScope,c=s.indexOf('customer:')===0?salesFindCustomer(s.slice(9)):null,g=s.indexOf('list:')===0?priceListById(s.slice(5)):null;
 const part=c?(c.code||priceFileCustomerName(c)):g?(g.name||'group'):'all';
 customerDownload('prices_'+String(part).replace(/[^A-Za-z0-9-]+/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.csv',priceFileExport(s),'text/csv;charset=utf-8');
}
function plFileLoad(inp){
 const f=inp.files[0];inp.value='';if(!f)return;
 if(f.size>4*1024*1024){alert('File not readable: CSV exceeds 4 MB.');return;}
 const r=new FileReader();
 r.onload=()=>{try{plFile={name:f.name,text:r.result,plan:priceFilePlan(r.result)};}catch(e){alert('File not readable: '+e.message);}render();};
 r.readAsText(f);
}
function plFileWrite(){
 if(!plFile||!plFile.text)return;
 const out=priceFileApply(plFile.text);if(!out.ok){alert(out.error);return;}
 plFile={name:plFile.name,done:out};render();
}
