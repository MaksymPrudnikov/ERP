/* =====================================================================
   views/inventory  ·  inventory-1.0
   Раздел Inventory: склад листов стекла.
   IN : invSheetRows, invMoves и команды erp/inventory/sheets
   OUT: Sheets — дашборд (плитки, таблица с минимумом в строке), Count —
        пересчёт и списание, Journal — все движения, Undo Sheet broke

   Владелец, 14 октября 2026: «нужен дашборд для инвентаризации, активный,
   с фильтрами». Таблицы — движок Sales (колонки, фильтры колонок, чипы
   статусов), как в Purchasing; меню разделов — одна кнопка, как purNav.
   Пересчитывает оптимизатор с галочкой Inventory; в Count все стёкла
   каталога сразу («каталог = то, что на складе»). Плитка статуса ставит
   тот же фильтр, что чип. Строка дашборда открывает журнал этого стекла.
   Offcuts (PR 2) — куски S-: где лежит, возраст, пересчёт Not found и
   Found; ушедшие куски скрыты, пока не отмечено «Show used and written off».
   ===================================================================== */
let invView='sheets',invCountDraft={},invJournalKey='',invMoveDraft=null,invNotice='',invPages={},invOffcutLostDraft=new Set(),invOffcutAll=false;
/* Начатая форма: новая версия ERP не перезагружает вкладку сама (erp/storage). */
(window.STORAGE_UNSAVED=window.STORAGE_UNSAVED||[]).push(()=>Object.keys(invCountDraft).length>0||!!invMoveDraft||invOffcutLostDraft.size>0);
const INV_VIEWS=[['sheets','Sheets'],['sizes','Sheet sizes'],['consumables','Consumables'],['offcuts','Offcuts'],['count','Count'],['journal','Journal']];
const INV_OFFCUT_TONE={'On rack':'ok','In batch':'info','Coming':'','Used':'','Broken':'bad','Written off':'warn','Back to waste':''};
const INV_TONE={'OK':'ok','Below minimum':'bad','Negative':'bad','Not counted':'','Size missing':'warn'};
function invArg(v){return esc(JSON.stringify(String(v)));}
/* Разделы склада кнопками в ряд (владелец, 23.10.2026): выпадашка
   прятала Count и Journal. */
function invNav(){return '<div class="tabs inv-tabs" data-inv-sections>'+INV_VIEWS.map(([k,n])=>'<button type="button" class="'+(k===invView?'on':'')+'" data-inv-section="'+k+'" onclick="invGo(\''+k+'\')">'+n+'</button>').join('')+'</div>';}
/* Раздел — с чистого листа: фильтр журнала по стеклу ставит только
   строка дашборда (аудит 15.10.2026: он оставался и при входе из меню). */
function invGo(v){if(!invCountLeave())return;invView=v;invSizeNotice='';consNotice='';consCountDraft={};invNotice='';invMoveDraft=null;invOffcutLostDraft.clear();invJournalKey='';salesListMenu=null;render();}
function invCountLeave(){
 if(Object.keys(invCountDraft).length&&!confirm('Discard counts you have not saved?'))return false;
 invCountDraft={};return true;
}
(window.NAV_GUARDS=window.NAV_GUARDS||[]).push(to=>tab==='inventory'&&to!=='inventory'&&!invCountLeave());

/* ----------------------- Движок списков Sales ----------------------- */
function invListScope(){return 'inventory-'+invView;}
function invListColumns(){
 const col=([k,label,type,def])=>({k,label,type,def:def!==false});
 if(invView==='journal')return [['day','When','date'],['glass','Glass','text'],['code','Code','list'],['size','Size','list'],['kind','What','list'],['ref','Reference','text'],['rack','On rack','number'],['by','Who','text'],['note','Note','text']].map(col);
 if(invView==='offcuts')return [['id','Stock','text'],['code','Glass','list'],['mm','mm','number'],['size','Size','list'],['area','ft²','number'],['from','From','text'],['booked','Booked','date',false],['age','Age, days','number'],['status','Where','list']].map(col);
 if(invView==='count')return [['glass','Glass','text'],['code','Code','list'],['mm','mm','number'],['size','Size','list'],['onRack','On rack','number'],['lastCount','Last count','date']].map(col);
 return [['glass','Glass','text'],['code','Code','list'],['mm','mm','number'],['size','Size','list'],['onRack','On rack','number'],['reserved','Reserved','number'],['free','Free','number'],['min','Minimum','number'],['held','At supplier','number'],['onOrder','On order','number'],['lastCount','Last count','date'],['status','Status','list']].map(col);
}
function invListDefaults(){return invView==='journal'?{day:{preset:'last30'}}:{};}
function invListDefaultSort(){return invView==='journal'?{k:'day',dir:'desc'}:invView==='offcuts'?{k:'age',dir:'desc'}:{k:'code',dir:'asc'};}
function invListDateColumn(){return invView==='journal'?'day':'';}
function invRowInfos(){
 return invSheetRows().map(r=>({o:{id:r.key},r,memo:{glass:r.name||r.code,code:r.code,mm:r.mm,size:invSizeText(r),onRack:r.onRack,reserved:r.reserved,free:r.free,min:r.min,
  held:r.held,onOrder:r.onOrder,lastCount:r.lastCount?salesListIsoDay(r.lastCount.at):'',status:r.status}}));
}
function invMoveInfos(){
 return invMoves().filter(m=>!invJournalKey||m.key===invJournalKey).map(m=>({o:{id:m.id,createdAt:m.at},m,memo:{day:m.day,glass:m.name||m.code,code:m.code,size:invSizeText(m),kind:m.kind,ref:m.ref,rack:m.rack,by:m.by,note:m.note}}));
}
function invPageState(rows){
 const scope=invListScope(),p=salesListLoadPrefs(),signature=JSON.stringify([p.filters,p.sort,invJournalKey]);
 if(!invPages[scope]||invPages[scope].signature!==signature)invPages[scope]={signature,index:0};
 const s=invPages[scope];s.index=Math.max(0,Math.min(s.index,Math.ceil(rows.length/50)-1));return s;
}
function invPageRows(rows){const p=invPageState(rows);return rows.slice(p.index*50,p.index*50+50);}
function invPager(rows){
 if(!rows.length)return '';const p=invPageState(rows),from=p.index*50+1,to=Math.min(rows.length,(p.index+1)*50);
 const buttons=rows.length>50?'<button type="button" class="sl-quiet" aria-label="Previous page" '+(!p.index?'disabled':'')+' onclick="invPages[invListScope()].index--;render()">←</button><button type="button" class="sl-quiet" aria-label="Next page" '+(to>=rows.length?'disabled':'')+' onclick="invPages[invListScope()].index++;render()">→</button>':'';
 return '<div class="pur-pagination"><span>'+from+'–'+to+' of '+rows.length+' rows</span><span class="sales-toolbar-sp"></span>'+buttons+'</div>';
}
function invListStatus(value){if(value)salesListSetFilter('status',{values:[value]});else salesListClearFilter('status');}
function invListFilters(infos){
 let status='';
 if(invView==='offcuts'){
  const base=salesListRows(infos,['status']),f=salesListLoadPrefs().filters.status,selected=f&&f.values&&f.values.length===1?f.values[0]:'';
  status=salesListStatusControlHTML(INV_OFFCUT_STATUSES.map(n=>({key:n,label:n,n:base.filter(i=>i.memo.status===n).length})).filter(c=>c.n||c.key===selected),selected,base.length,'invListStatus');
 }
 if(invView==='sheets'){
  const base=salesListRows(infos,['status']),f=salesListLoadPrefs().filters.status,selected=f&&f.values&&f.values.length===1?f.values[0]:'';
  status=salesListStatusControlHTML(INV_STATUSES.map(n=>({key:n,label:n,n:base.filter(i=>i.memo.status===n).length})).filter(c=>c.n||c.key===selected),selected,base.length,'invListStatus');
 }
 const date=invListDateColumn();
 return '<div class="sl-view-controls">'+status+(date?salesListDateButton(date):'')+'</div>'+salesListFilterChips();
}
function invHeader(c){
 const active=salesListFilterActive(salesListLoadPrefs().filters[c.k]);
 return '<th class="'+(c.type==='number'?'n':'')+'"><span class="sl-th">'+esc(c.label)+'<button type="button" class="sl-fbtn'+(active?' on':'')+'" data-filter-col="'+c.k+'" aria-label="Filter and sort '+esc(c.label)+'" onclick="salesListOpenFilter(event,\''+c.k+'\')"></button></span></th>';
}
/* lead — лишние ячейки слева, сразу за шестерёнкой: кнопки строки видны
   без прокрутки широкой таблицы. */
function invTable(cols,rows,cell,extraHead,extraCells,empty,lead){
 const head=cols.map(invHeader).join(''),body=i=>cols.map(c=>cell(i,c)).join(''),xh=extraHead||'',xc=i=>extraCells?extraCells(i):'';
 return '<div class="sales-table-wrap"><table class="sl-table inv-table"><thead><tr><th><button type="button" class="sl-settings" data-columns-button aria-label="Columns" onclick="salesListOpenColumns(event)">'+ico('settings')+'</button></th>'+(lead?xh+head:head+xh)+'</tr></thead><tbody>'+
  (invPageRows(rows).map(i=>'<tr data-inv-row="'+esc(i.o.id)+'"><td></td>'+(lead?xc(i)+body(i):body(i)+xc(i))+'</tr>').join('')||'<tr><td colspan="'+(cols.length+1+(extraHead?1:0))+'" class="empty" data-inv-empty>'+empty+'</td></tr>')+'</tbody></table></div>'+invPager(rows);
}
function invNum(v){return v==null||v===''?'<span class="mut">—</span>':esc(v);}
function invLastCount(r){return r.lastCount?esc(salesListShortDay(salesListIsoDay(r.lastCount.at)))+(r.lastCount.by?' <span class="mut">· '+esc(r.lastCount.by)+'</span>':''):'<span class="mut">—</span>';}

/* ------------------------------ Sheets ------------------------------ */
function invTile(label,n,opts){
 opts=opts||{};const tag=opts.click?'button type="button" onclick="'+opts.click+'"':'div';
 return '<'+tag+' class="inv-tile'+(opts.tone?' '+opts.tone:'')+(opts.on?' on':'')+'" data-inv-tile="'+esc(label)+'"><b>'+esc(n)+'</b><span>'+esc(label)+'</span></'+(opts.click?'button':'div')+'>';
}
function invTiles(rows){
 const by=s=>rows.filter(r=>r.status===s).length,sum=k=>rows.reduce((a,r)=>a+r[k],0),f=salesListLoadPrefs().filters.status,sel=f&&f.values&&f.values.length===1?f.values[0]:'';
 const st=(s,tone)=>invTile(s,by(s),{click:'invListStatus('+invArg(sel===s?'':s)+')',tone:by(s)?tone:'',on:sel===s});
 const enter=rows.reduce((a,r)=>a+r.enterSheets,0);
 return '<div class="inv-tiles">'+invTile('Glass × size',rows.length)+invTile('On rack',sum('onRack'))+invTile('Free',sum('free'))+
  st('Below minimum','bad')+st('Negative','bad')+st('Not counted','')+st('Size missing','warn')+
  invTile('Enter sheets',enter,{tone:enter?'warn':'',click:enter&&accessCan('purchasing')?'invOpenReceipts()':''})+'</div>';
}
function invOpenReceipts(){navGo('purchasing');if(tab==='purchasing')purGo('receipts');}
function invSheetCell(i,c){
 const r=i.r,v=salesListValue(i,c.k),n=c.type==='number'?' class="n"':'';
 if(c.k==='glass')return '<td data-raw><button type="button" class="fin-link inv-glass" title="Journal" onclick="invOpenJournal('+invArg(r.key)+')">'+esc(v)+'</button></td>';
 if(c.k==='size')return '<td class="nowrap"><b>'+esc(v)+'</b></td>';
 if(c.k==='onRack')return '<td class="n'+(r.onRack<0?' inv-neg':'')+'">'+esc(v)+(r.enterSheets?'<div class="inv-note warn">Enter sheets</div>':'')+'</td>';
 if(c.k==='reserved'){const b=[...r.batches.entries()];return '<td class="n">'+esc(v)+(b.length?'<div class="inv-note">'+esc(b.length>2?b.length+' batches':b.map(([n,k])=>n+(b.length>1?': '+k:'')).join(', '))+'</div>':'')+'</td>';}
 if(c.k==='free')return '<td class="n'+(r.free<0||r.min!=null&&r.free<r.min?' inv-neg':'')+'"><b>'+esc(v)+'</b></td>';
 if(c.k==='min')return '<td class="n">'+(r.sizeMissing?'<span class="mut">—</span>':'<input type="number" min="0" step="1" inputmode="numeric" class="inv-min" data-inv-min="'+esc(r.key)+'" aria-label="Minimum" value="'+(r.min==null?'':r.min)+'" onchange="invMinChange('+invArg(r.key)+',this.value)">')+'</td>';
 if(c.k==='held'||c.k==='onOrder'){const blocks=c.k==='held'?r.heldBlocks:r.onOrderBlocks;return '<td class="n">'+(v||blocks?esc(v||0)+(blocks?'<div class="inv-note">+ '+esc(blocks)+' block'+(blocks===1?'':'s')+'</div>':''):'<span class="mut">—</span>')+'</td>';}
 if(c.k==='lastCount')return '<td class="nowrap">'+invLastCount(r)+'</td>';
 if(c.k==='status')return '<td><span class="pill '+(INV_TONE[v]||'')+'">'+esc(v)+'</span></td>';
 return '<td'+n+(c.k==='code'?' data-raw':'')+'>'+invNum(v)+'</td>';
}
function invMinChange(key,value){const r=invSetMin(key,value);invNotice=r.ok?'':r.error;render();}
function invOpenJournal(key){invView='journal';invJournalKey=key;salesListMenu=null;const p=salesListLoadPrefs();delete p.filters.day;salesListSavePrefs();render();}
function invSheetsView(infos){
 const rows=salesListRows(infos),cols=salesListColumns();
 /* Плитки считают то же, что видно с фильтрами колонок; фильтр статуса —
    сами плитки, поэтому в их счёт он не входит (как статусы Sales). */
 return invTiles(salesListRows(infos,['status']).map(i=>i.r))+invMoveHTML()+invListFilters(infos)+invTable(cols,rows,invSheetCell,'<th></th>',invSheetActs,infos.length?'Nothing matches the filters.':'No glass in the catalogue yet.',true);
}

/* ------------------------------ Offcuts ------------------------------ */
function invOffcutInfos(){
 return invOffcutRows().filter(o=>invOffcutAll||INV_OFFCUT_HERE.includes(o.status)||o.status==='Coming').map(o=>({o:{id:o.id,createdAt:o.booked},x:o,
  memo:{id:o.id,code:o.glass,mm:o.mm||null,size:frac16(o.w)+' × '+frac16(o.h),area:o.area,from:o.batch+(o.sheet?' · sheet '+o.sheet:''),booked:salesListIsoDay(o.booked),age:o.age,status:o.status}}));
}
function invOffcutTiles(rows){
 const here=rows.filter(o=>INV_OFFCUT_HERE.includes(o.status)),n=s=>rows.filter(o=>o.status===s).length,f=salesListLoadPrefs().filters.status,sel=f&&f.values&&f.values.length===1?f.values[0]:'';
 const st=(label,s)=>invTile(label,n(s),{click:'invListStatus('+invArg(sel===s?'':s)+')',on:sel===s});
 const ft=Math.round(here.reduce((a,o)=>a+o.area,0)*10)/10,old=here.reduce((a,o)=>Math.max(a,o.age||0),0);
 return '<div class="inv-tiles">'+invTile('On rack, pcs',here.length)+invTile('On rack, ft²',cutNum(ft,1))+st('Coming','Coming')+st('In a batch','In batch')+invTile('Oldest, days',here.length?old:'—')+'</div>';
}
function invOffcutTick(id,on){if(on)invOffcutLostDraft.add(id);else invOffcutLostDraft.delete(id);const b=document.querySelector('[data-inv-lost-n]');if(b)b.textContent=invOffcutLostDraft.size;}
function invOffcutLostUi(){
 const ids=[...invOffcutLostDraft];if(!ids.length){invNotice='Tick the offcuts that are not on the rack.';render();return;}
 if(!confirm('Write off '+ids.length+' offcut'+(ids.length===1?'':'s')+' as not found?'))return;
 const r=invOffcutLost(ids);invNotice=r.ok?'':r.error;if(r.ok)invOffcutLostDraft.clear();render();
}
function invOffcutFoundUi(id){const r=invOffcutFound(id);invNotice=r.ok?'':r.error;render();}
function invOffcutCell(i,c){
 const o=i.x,v=salesListValue(i,c.k);
 if(c.k==='id')return '<td><span class="pill '+(INV_OFFCUT_HERE.includes(o.status)?'ok':'')+'" data-raw>'+esc(v)+'</span></td>';
 if(c.k==='size')return '<td class="nowrap"><b>'+esc(v)+'</b></td>';
 if(c.k==='area')return '<td class="n">'+cutNum(v,2)+'</td>';
 if(c.k==='from')return '<td class="nowrap">'+(o.batch&&accessCan('optimization')?'<button type="button" class="fin-link" onclick="invOpenBatch('+invArg(o.batch)+')">'+esc(v)+'</button>':invNum(v))+'</td>';
 if(c.k==='booked')return '<td class="nowrap">'+(v?esc(salesListShortDay(v)):'<span class="mut">—</span>')+'</td>';
 if(c.k==='status'){
  const label=o.status==='In batch'?'In '+o.claim:o.status==='Coming'?'Coming · '+o.batch:o.status==='Used'?'Used · '+o.used.batch:v;
  return '<td class="nowrap"><span class="pill '+(INV_OFFCUT_TONE[o.status]||'')+'" data-inv-offcut-status>'+esc(label)+'</span>'+(o.lost?' <span class="mut">'+esc(salesListShortDay(salesListIsoDay(o.lost.at))+(o.lost.by?' · '+o.lost.by:''))+'</span> <button type="button" class="sl-quiet sm" data-inv-found="'+esc(o.id)+'" onclick="invOffcutFoundUi('+invArg(o.id)+')">Found</button>':'')+'</td>';
 }
 return '<td'+(c.type==='number'?' class="n"':'')+(c.k==='code'?' data-raw':'')+'>'+invNum(v)+'</td>';
}
function invOffcutExtra(i){
 const o=i.x;if(!INV_OFFCUT_HERE.includes(o.status))return '<td></td>';
 return '<td class="inv-lost-cell"><input type="checkbox" data-inv-lost="'+esc(o.id)+'" aria-label="Not found" '+(invOffcutLostDraft.has(o.id)?'checked':'')+' onchange="invOffcutTick('+invArg(o.id)+',this.checked)"></td>';
}
function invOffcutFooter(rows){
 const here=rows.filter(i=>INV_OFFCUT_HERE.includes(i.x.status));
 return '<p class="mut inv-hint" data-inv-offcut-total>'+here.length+' on the rack shown · '+cutNum(here.reduce((a,i)=>a+i.x.area,0),1)+' ft²</p>';
}
function invOffcutsView(infos){
 const rows=salesListRows(infos),cols=salesListColumns();
 return invOffcutTiles(salesListRows(infos,['status']).map(i=>i.x))+invListFilters(infos)+invTable(cols,rows,invOffcutCell,'<th class="inv-lost-head">Not found</th>',invOffcutExtra,infos.length?'Nothing matches the filters.':'No offcuts on the rack.')+invOffcutFooter(rows);
}

/* ------------------------------ Count ------------------------------ */
function invCountInput(key,value,el){
 if(String(value).trim()==='')delete invCountDraft[key];else invCountDraft[key]=value;
 const r=el&&el.closest('tr'),d=r&&r.querySelector('[data-inv-diff]'),rack=el?+el.dataset.rack:0,n=Number(value);
 if(d)d.textContent=String(value).trim()!==''&&Number.isFinite(n)&&n!==rack?(n>rack?'+':'−')+Math.abs(n-rack):'';
 const s=document.querySelector('[data-inv-count-n]');if(s)s.textContent=Object.keys(invCountDraft).length;
}
function invCountSaveUi(){
 const r=invCountSave(invCountDraft);
 if(!r.ok){invNotice=r.error;render();return;}
 invNotice='';invCountDraft={};render();
}
function invCountCell(i,c){
 const r=i.r,v=salesListValue(i,c.k);
 if(c.k==='size')return '<td class="nowrap"><b>'+esc(v)+'</b></td>';
 if(c.k==='onRack')return '<td class="n'+(r.onRack<0?' inv-neg':'')+'">'+esc(v)+'</td>';
 if(c.k==='lastCount')return '<td class="nowrap">'+(r.lastCount?invLastCount(r):'<span class="mut">Not counted</span>')+'</td>';
 return '<td'+(c.type==='number'?' class="n"':'')+(c.k==='glass'||c.k==='code'?' data-raw':'')+'>'+invNum(v)+'</td>';
}
function invCountExtra(i){
 const r=i.r;if(r.sizeMissing)return '<td class="mut">Size missing</td>';
 const v=invCountDraft[r.key]==null?'':invCountDraft[r.key],n=Number(v),diff=v!==''&&Number.isFinite(n)&&n!==r.onRack?(n>r.onRack?'+':'−')+Math.abs(n-r.onRack):'';
 return '<td class="inv-count-cell"><input type="number" min="0" step="1" inputmode="numeric" class="inv-count" data-inv-count="'+esc(r.key)+'" data-rack="'+r.onRack+'" aria-label="Counted sheets" value="'+esc(v)+'" oninput="invCountInput('+invArg(r.key)+',this.value,this)"><span class="inv-diff" data-inv-diff>'+esc(diff)+'</span>'+
  '<button type="button" class="sl-quiet sm" data-inv-writeoff onclick="invMoveOpen('+invArg(r.key)+',\'writeoff\')">Write off</button></td>';
}
/* Движение листов одной строки или новое стекло на пирамиде (владелец,
   23.10.2026: «как пользователь — добавлять, пересчитывать, уменьшать»):
   + Add — приход мимо приёмки, − Remove — списание, Count — «стоит ровно N».
   Glass on rack — то же Add для стекла, которого нет в списке: выбор как в
   Sales, лист из поставки (можно поправить). Всё пишется в Journal. */
const INV_MOVE={add:['Add sheets','Add'],writeoff:['Remove sheets','Remove'],count:['Count','Save count']};
function invMoveOpen(key,kind){
 invMoveDraft={key,kind,qty:'',reason:key?'':'Opening stock',note:'',pick:{mfr:'',thick:'',coat:'',code:'',w:'',h:''}};invNotice='';render();
 setTimeout(()=>document.getElementById(key?'inv_wo_qty':'inv_mv_mfr')?.focus(),0);
}
function invPickGlass(f,stop){
 return activeGlassProducts().filter(g=>g.cut!==false&&(stop==='mfr'||!f.mfr||g.manufacturer===f.mfr)&&(stop==='mfr'||stop==='thick'||!f.thick||String(g.thicknessMm)===f.thick)&&(stop||!f.coat||glassCoatingName(g)===f.coat));
}
function invMovePick(k,v){
 const f=invMoveDraft.pick,order=['mfr','thick','coat','code'];f[k]=v;order.slice(order.indexOf(k)+1).forEach(x=>{f[x]='';});
 if(k==='code'){const z=v?invCatalogSizes(v)[0]:null;f.w=z?String(z.w):'';f.h=z?String(z.h):'';}
 render();
}
function invMovePickHTML(f){
 const opt=(v,label,on)=>'<option data-raw value="'+esc(v)+'"'+(v===on?' selected':'')+'>'+esc(label)+'</option>',uniq=a=>[...new Set(a.filter(x=>x!==''&&x!=null))];
 const sel=(k,label,any,list)=>'<label>'+label+'<select id="inv_mv_'+k+'" onchange="invMovePick(\''+k+'\',this.value)"><option value="">'+any+'</option>'+list.join('')+'</select></label>';
 return sel('mfr','Manufacturer','Any',uniq(invPickGlass(f,'mfr').map(g=>g.manufacturer)).sort().map(m=>opt(m,m,f.mfr)))+
  sel('thick','Thickness','Any',uniq(invPickGlass(f,'thick').map(g=>g.thicknessMm)).sort((a,b)=>a-b).map(n=>opt(String(n),n+' mm',f.thick)))+
  sel('coat','Coating','Any',uniq(invPickGlass(f,'coat').map(glassCoatingName)).sort().map(c=>opt(c,c,f.coat)))+
  '<label class="inv-wo-note">Glass *<select id="inv_mv_code" onchange="invMovePick(\'code\',this.value)"><option value="">— select —</option>'+invPickGlass(f).sort((a,b)=>a.code.localeCompare(b.code)).map(g=>opt(g.code,(f.coat?glassBaseName(g):g.name)+' · '+g.code,f.code)).join('')+'</select></label>'+
  '<label>Sheet, in *<span class="inv-mv-size"><input id="inv_mv_w" type="number" min="0" step="any" placeholder="length" value="'+esc(f.w)+'" oninput="invMoveDraft.pick.w=this.value"> × <input id="inv_mv_h" type="number" min="0" step="any" placeholder="width" value="'+esc(f.h)+'" oninput="invMoveDraft.pick.h=this.value"></span></label>';
}
function invMoveHTML(){
 const d=invMoveDraft;if(!d)return '';const r=d.key?invRowFind(d.key):null;if(d.key&&!r)return '';
 const [title,btn]=INV_MOVE[d.kind],reasons=d.kind==='add'?INV_ADD:d.kind==='writeoff'?INV_WRITE_OFF:null;
 return '<section class="card inv-writeoff" data-inv-writeoff-form data-inv-move="'+esc(d.kind)+'"><h3>'+(r?esc(title)+' · '+esc(r.code)+' '+esc(invSizeText(r))+' <span class="mut">· on rack '+esc(r.onRack)+'</span>':'Glass on rack')+'</h3><div class="inv-wo-fields">'+
  (r?'':invMovePickHTML(d.pick)+'</div><div class="inv-wo-fields inv-mv-row">')+
  '<label>'+(d.kind==='count'?'On the rack':'Sheets')+'<input id="inv_wo_qty" type="number" min="'+(d.kind==='count'?0:1)+'" step="1" inputmode="numeric" value="'+esc(d.qty)+'" oninput="invMoveDraft.qty=this.value"></label>'+
  (reasons?'<label>Reason<select id="inv_wo_reason" onchange="invMoveDraft.reason=this.value"><option value="">Choose…</option>'+reasons.map(x=>'<option'+(x===d.reason?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label>'+
   '<label class="inv-wo-note">Note<input id="inv_wo_note" type="text" maxlength="200" value="'+esc(d.note)+'" oninput="invMoveDraft.note=this.value"></label>':'')+
  '<div class="inv-wo-actions"><button type="button" onclick="invMoveDraft=null;invNotice=\'\';render()">Cancel</button><button type="button" class="pri" data-inv-writeoff-save onclick="invMoveSave()">'+esc(btn)+'</button></div></div></section>';
}
function invMoveSave(){
 const d=invMoveDraft;if(!d)return;let key=d.key;
 if(!key){
  const g=glassProductByCode(d.pick.code),size=invSize(d.pick.w,d.pick.h);
  if(!g){invNotice='Pick a glass.';render();return;}
  if(!size){invNotice='Enter the sheet size.';render();return;}
  key=invKey(g.code,size);
 }
 if(d.kind==='count'&&String(d.qty).trim()===''){invNotice='Enter sheets on the rack.';render();return;}
 const r=d.kind==='add'?invAdd(key,d.qty,d.reason,d.note):d.kind==='writeoff'?invWriteOff(key,d.qty,d.reason,d.note):invCountSave({[key]:d.qty});
 if(!r.ok){invNotice=r.error;render();return;}
 invMoveDraft=null;invNotice='';render();
}
function invSheetActs(i){
 const r=i.r;if(r.sizeMissing)return '<td></td>';const k=invArg(r.key);
 return '<td class="inv-acts"><button type="button" class="sl-quiet sm" data-inv-add title="Add sheets" aria-label="Add sheets" onclick="invMoveOpen('+k+',\'add\')">+</button><button type="button" class="sl-quiet sm" data-inv-remove title="Remove sheets" aria-label="Remove sheets" onclick="invMoveOpen('+k+',\'writeoff\')">−</button><button type="button" class="sl-quiet sm" data-inv-count-one onclick="invMoveOpen('+k+',\'count\')">Count</button></td>';
}
function invCountView(infos){
 const rows=salesListRows(infos),cols=salesListColumns();
 return invMoveHTML()+'<p class="mut inv-hint">Enter sheets on the rack. Only filled rows are saved.</p>'+invListFilters(infos)+
  invTable(cols,rows,invCountCell,'<th class="inv-count-head">Counted</th>',invCountExtra,infos.length?'Nothing matches the filters.':'No glass in the catalogue yet.');
}

/* ------------------------------ Journal ------------------------------ */
function invOpenBatch(n){navGo('optimization');if(tab!=='optimization')return;optimizationSetTab('production');glassBatchOpen(n);glassBatchDetailTab='optimization';render();}
function invOpenReceipt(id){navGo('purchasing');if(tab==='purchasing')purFulfilEdit('receipt',id);}
function invUndoBreak(id){
 if(!confirm('Undo sheet broke? The sheet goes back on the rack.'))return;
 const r=invBreakUndo(id);invNotice=r.ok?'':r.error;render();
}
function invMoveCell(i,c){
 const m=i.m,v=salesListValue(i,c.k);
 if(c.k==='day')return '<td class="nowrap">'+(v?esc(salesListShortDay(v)):'<span class="mut">—</span>')+'</td>';
 if(c.k==='size')return '<td class="nowrap"><b>'+esc(v)+'</b></td>';
 if(c.k==='kind')return '<td class="nowrap">'+esc(v)+(m.breakId&&!m.undone?' <button type="button" class="sl-quiet sm" data-inv-undo="'+esc(m.breakId)+'" onclick="invUndoBreak('+invArg(m.breakId)+')">Undo</button>':'')+(m.breakId&&m.undone?' <span class="mut">· undone</span>':'')+'</td>';
 if(c.k==='ref'){
  if(m.receipt&&accessCan('purchasing'))return '<td><button type="button" class="fin-link" onclick="invOpenReceipt('+invArg(m.receipt)+')">'+esc(v)+'</button></td>';
  if(m.batch&&!m.offcut&&accessCan('optimization'))return '<td class="nowrap"><button type="button" class="fin-link" onclick="invOpenBatch('+invArg(m.batch)+')">'+esc(v)+'</button></td>';
  return '<td>'+invNum(v)+'</td>';
 }
 if(c.k==='rack')return '<td class="n'+(m.rack<0?' inv-neg':'')+'">'+(m.rack==null?'<span class="mut">—</span>':esc((m.rack>0?'+':'')+m.rack))+'</td>';
 return '<td'+(c.type==='number'?' class="n"':'')+(c.k==='glass'||c.k==='code'||c.k==='note'||c.k==='by'?' data-raw':'')+'>'+invNum(v)+'</td>';
}
function invJournalView(infos){
 const rows=salesListRows(infos),cols=salesListColumns(),r=invJournalKey&&invRowFind(invJournalKey);
 const key=invJournalKey?'<div class="sl-chips"><span class="sl-chips-label">Glass</span><span class="sl-chip" data-inv-journal-key>'+esc(r?r.code+' '+invSizeText(r):invJournalKey)+'<button type="button" aria-label="Show all glass" onclick="invJournalKey=\'\';render()">×</button></span></div>':'';
 return key+invListFilters(infos)+invTable(cols,rows,invMoveCell,'','',infos.length?'Nothing matches the filters.':'No movements yet.');
}

/* Размеры листов (план Master Data, этап 5): размеры цеха заводят здесь,
   склад и раскрой берут их отсюда; размеры из поставок — только для
   чтения, их правят в точках поставки. Отступы листа — Data → Cutting. */
let invSizeNotice='';
function invSizesView(){
 const data=accessCan('masterdata'),link=(c,k)=>data?'<button type="button" class="fin-link" data-inv-size-supply="'+esc(c)+'" title="Supply row in Data" onclick="invSizeSupplyOpen('+invArg(c)+','+invArg(k)+')">'+esc(c)+'</button>':esc(c);
 const sizes=cutSheetSizes(),whose=x=>[x.shop?'All glass':'',x.codes.slice(0,4).map(c=>link(c,x.key)).join(', ')+(x.codes.length>4?' +'+(x.codes.length-4):'')].filter(Boolean).join(' · ');
 return '<p class="mut">Supply sizes of a glass go first; shop sizes work for any glass. Trim and border — Data → Cutting.</p>'+
  '<div class="sales-table-wrap"><table class="ncr-table" data-inv-sizes><thead><tr><th>Sheet</th><th>Glass</th><th>From</th><th></th></tr></thead><tbody>'+
  (sizes.map(x=>'<tr data-inv-size="'+esc(x.key)+'"><td><b>'+esc(frac16(x.w))+' × '+esc(frac16(x.h))+'″</b></td><td class="mut">'+whose(x)+'</td><td>'+(x.codes.length?'Supply'+(x.shop?' · Shop':''):'Shop')+'</td><td>'+
   (x.shop?'<button type="button" class="sm dl" data-inv-size-remove="'+esc(x.key)+'" aria-label="Remove '+esc(x.key)+'" onclick="invSizeRemoveUi('+invArg(x.key)+')">×</button>':'')+'</td></tr>').join('')||
   '<tr><td colspan="4" class="mut" data-inv-sizes-empty>No sheet sizes yet — glass shows Size missing.</td></tr>')+'</tbody></table></div>'+
  '<div class="cut-size-add" data-inv-size-add><input type="text" id="invSizeW" placeholder="length" aria-label="Sheet length, in"> × <input type="text" id="invSizeH" placeholder="width" aria-label="Sheet width, in"> <button type="button" onclick="invSizeAddUi()">+ Add sheet size</button>'+
  (invSizeNotice?'<span class="cut-md-error" role="alert" data-inv-size-error>'+esc(invSizeNotice)+'</span>':'')+'</div>';
}
/* Размер из поставки правят в его строке поставки (Data → Supply points). */
function invSizeSupplyOpen(code,key){
 const s=(DB.glassSheet||[]).find(x=>x&&x.productCode===code&&x.availability!=='inactive'&&cutSheetTrimKey(x.sheetWIn,x.sheetHIn)===key);if(!s)return;
 navGo('masterdata');if(tab!=='masterdata')return;mdSetTab('materials');mdMatSwitch('glass','glassSheet');mdSheetEditRow(s.id);
}
function invSizeAddUi(){const r=cutShopSizeAdd(mdVal('invSizeW'),mdVal('invSizeH'));invSizeNotice=r.error||'';render();}
function invSizeRemoveUi(key){if(!confirm('Remove this sheet size?'))return;const r=cutShopSizeRemove(key);invSizeNotice=r.error||'';render();}

/* Расходники обвязки (erp/inventory/consumables): приход, расход на скане
   IGU, резерв сохранённых заказов, пересчёт. */
let consCountDraft={},consNotice='';
function consQty(v,unit){return (Math.round(v*100)/100).toLocaleString('en-US',{maximumFractionDigits:2})+' '+unit;}
function invConsumablesView(){
 const rows=consRows(),tone={'OK':'ok','Short':'bad','Not counted':'','Pack size missing':'warn','Norm missing':'warn'};
 return '<p class="mut">Reserved on Save, used on IGU scan.</p>'+
  (consNotice?'<div class="ncr-error" role="alert">'+esc(consNotice)+'</div>':'')+
  '<div class="sales-table-wrap"><table class="ncr-table" data-cons-table><thead><tr><th>Item</th><th>Per pack</th><th class="n">Received</th><th class="n">Used</th><th class="n">Count adj.</th><th class="n">On hand</th><th class="n">Reserved</th><th class="n">Free</th><th>Status</th><th>Counted</th></tr></thead><tbody>'+
  (rows.map(r=>'<tr data-cons-row="'+esc(r.key)+'"><td><b data-raw>'+esc(r.name)+'</b><div class="mut">'+esc(r.group)+(r.code?' · <span data-raw>'+esc(r.code)+'</span>':'')+'</div></td>'+
   '<td><input type="number" min="0" step="any" class="inv-min" data-cons-pack="'+esc(r.key)+'" value="'+(r.pack==null?'':r.pack)+'" placeholder="—" onchange="consPackUi('+invArg(r.key)+',this.value)"> <span class="mut">'+esc(r.unit)+'</span></td>'+
   ['received','used','adjust','onHand','reserved','free'].map(k=>'<td class="n" data-cons-'+k+'>'+esc(consQty(r[k],r.unit))+'</td>').join('')+
   '<td><span class="pill '+(tone[r.status]||'')+'">'+esc(r.status)+'</span></td>'+
   '<td><input type="number" min="0" step="any" class="inv-min" data-cons-count="'+esc(r.key)+'" value="'+(consCountDraft[r.key]==null?'':esc(consCountDraft[r.key]))+'" oninput="consCountDraft['+invArg(r.key)+']=this.value"></td></tr>').join('')||
   '<tr><td colspan="10" class="mut">No spacers, sealants, gas or IGU parts in Master Data.</td></tr>')+'</tbody></table></div>';
}
function consPackUi(key,v){const r=consSetPack(key,v);consNotice=r.ok?'':r.error;render();}
function consCountSaveUi(){
 const counts={};Object.entries(consCountDraft).forEach(([k,v])=>{if(String(v).trim()!=='')counts[k]=v;});
 const r=consCountSave(counts);consNotice=r.ok?'':r.error;if(r.ok)consCountDraft={};render();
}

function viewInventory(){
 if(!accessCan('inventory'))return '<div class="empty">Inventory access is required.</div>';
 if(invView==='consumables')return '<div class="inventory-workspace"><div class="card sales-list-card"><div class="sales-toolbar">'+invNav()+'<span class="sales-toolbar-sp"></span><button type="button" class="pri" data-cons-count-save onclick="consCountSaveUi()">Save count</button></div>'+invConsumablesView()+salesListMenuHTML([])+'</div></div>';
 if(invView==='sizes')return '<div class="inventory-workspace"><div class="card sales-list-card"><div class="sales-toolbar">'+invNav()+'</div>'+invSizesView()+salesListMenuHTML([])+'</div></div>';
 const count=invView==='count',off=invView==='offcuts',infos=invView==='journal'?invMoveInfos():off?invOffcutInfos():invRowInfos(),body=invView==='journal'?invJournalView(infos):off?invOffcutsView(infos):count?invCountView(infos):invSheetsView(infos);
 const n=Object.keys(invCountDraft).length;
 return '<div class="inventory-workspace"><div class="card sales-list-card"><div class="sales-toolbar">'+invNav()+'<span class="sales-toolbar-sp"></span>'+
  (count||invView==='sheets'?'<button type="button" data-inv-glass-on-rack onclick="invMoveOpen(\'\',\'add\')">+ Glass on rack</button>':'')+(count?'<button type="button" class="pri" data-inv-count-save onclick="invCountSaveUi()">Save count · <span data-inv-count-n>'+n+'</span></button>':'')+
  (off?'<label class="chk"><input type="checkbox" data-inv-offcut-all '+(invOffcutAll?'checked':'')+' onchange="invOffcutAll=this.checked;render()"> Show used and written off</label><button type="button" data-inv-lost-save onclick="invOffcutLostUi()">Write off <span data-inv-lost-n>'+invOffcutLostDraft.size+'</span> not found</button>':'')+'</div>'+
  (invNotice?'<div class="ncr-error" role="alert">'+esc(invNotice)+'</div>':'')+body+salesListMenuHTML(infos)+'</div></div>';
}
