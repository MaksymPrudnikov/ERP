/* =====================================================================
   view/carriers-board  ·  carriers-2.0
   Долли и скиды для офиса: Production → Dollies & Skids и одно окно «что на
   ней лежит» — с этой вкладки, с доски In production (код под цифрой
   станции) и из Data → Dollies & Skids.
   IN : carrierContents(), stationWaiting() (erp/shopfloor) · skidsOut()
        (erp/shipping/skids) · DB.carrierCols — колонки человека · движок
        фильтров Sales (views/sales-list-ui)
   OUT: html; Move / Take off / Empty — команды erp/shopfloor/carriers с Undo
   Владелец, 15 октября 2026: «на одной долли может быть 10–20 разных
   заказов, а иногда один — кликнуть на долли или скид и видеть, что на нём
   лежит, и если нужно — распечатать»; «стереть всё, что на долли, или
   передвинуть на другой номер — все или выбранные»; «то, что будет
   отображено, — тоже конструктор» (колонки — у каждого свои); пустые «не
   принадлежат станции»; печать — Letter с обычного принтера, «чтобы не было
   уродливо». Долли со стёклами на разные станции — карточкой под каждой
   («чтобы человек понимал»); на скиде юниты считают юнитами, стёкла —
   стёклами.
   ===================================================================== */
let carrierWin=null;             // открытое окно: {code, station, sel, to, error, done, menu}
let carrierBoardShow='loaded';   // Loaded · At customers · Empty · All
let carrierBoardMore=new Set();  // раскрытые длинные списки: 'out', 'DL', 'SA'…
let carrierWeightMemo=new Map();
let carrierColDrag='';

/* Кто нажал: вошедший в офис; без входа — пусто (колонки «этого
   компьютера», в журнале — без имени). */
function carrierMe(){const u=typeof signinUser==='function'?signinUser():null;return u?{id:u.viewProfileId,name:u.name}:{id:'',name:''};}
function carrierWord(code){const t=carrierType(code);return t&&t.kind==='Skid'?'skid':'dolly';}

/* ----------------------------- Строки ------------------------------ */
/* Стеклопакет, собранный на IGU, — одна строка: на скиде его считают
   юнитом; остальное — по стеклу. # — порядок укладки, #1 положили первым. */
function carrierItems(list){
 const unitOf=new Map(),items=new Map();
 (DB.stationScan||[]).forEach(s=>{if(!s.undoneAt&&s.asm&&s.unit)unitOf.set(s.piece,s);});
 list.forEach(x=>{
  const s=unitOf.get(x.id),u=s&&stationUnitMerge(x.g.o,x.g.l)===s.station?s:null,key=u?'a|'+u.asm:'g|'+x.id;
  if(!items.has(key))items.set(key,{key,g:x.g,o:x.g.o,l:x.g.l,unit:u?u.unit:0,label:u&&unitIdAt(x.g.o.id,x.g.l.id,u.unit)||x.id,pieces:[],glass:[],scan:x.scan,place:x.place});
  const it=items.get(key);it.pieces.push(x.id);it.glass.push(x.g);if(String(x.scan.at)>String(it.scan.at))it.scan=x.scan;
 });
 const out=[...items.values()].sort((a,b)=>String(a.scan.at).localeCompare(String(b.scan.at))||a.key.localeCompare(b.key));
 out.forEach((it,i)=>{it.pos=i+1;});
 return out;
}
/* Что уехало на скиде к клиенту: юниты этого скида в его последнем PS. */
function carrierShippedItems(x){
 const s=x&&typeof shippingFind==='function'?shippingFind(x.psId):null;if(!s)return [];
 const index=stationPieceIndex(),batches=stationBatchIndex();
 return s.items.filter(i=>i.skid===x.code).map((i,n)=>{
  const glass=i.pieces.map(p=>stationGlass(p,index,batches)).filter(Boolean);if(!glass.length)return null;
  return {key:'p|'+i.label,g:glass[0],o:glass[0].o,l:glass[0].l,unit:i.pieces.length>1?i.unit:0,label:i.label,pieces:i.pieces.slice(),glass,scan:{station:'',at:s.shippedAt,by:''},place:null,pos:n+1};
 }).filter(Boolean);
}
/* «3 units · 2 glass»: юниты — юнитами, стёкла — стёклами (владелец). */
function carrierCountText(items){const u=items.filter(i=>i.unit).length,g=items.length-u;return [u?stationPlural(u,'unit','units'):'',g||!u?stationPlural(g,'glass','glass'):''].filter(Boolean).join(' · ');}
/* Заказы на таре — в порядке, в каком их начали класть. */
function carrierOrders(items){
 const m=new Map();items.forEach(it=>{if(!m.has(it.o.id))m.set(it.o.id,{o:it.o,items:[]});m.get(it.o.id).items.push(it);});
 return [...m.values()];
}
/* Стекло без тары: последний скан — на станции, которая кладёт на долли
   или скид, а тару не записал. IGU тару не ставит — там это норма. */
function carrierLoose(){
 const by=new Map(),st=new Map((DB.station||[]).map(s=>[s.code,s]));
 stationWaiting().forEach((list,code)=>list.forEach(x=>{
  const s=x.last;if(!s||s.on||s.broken||s.park)return;
  const puts=sfPutsOn(st.get(s.station));if(puts==='none')return;
  if(!by.has(code))by.set(code,[]);by.get(code).push({id:x.id,g:x.g,place:x.place,scan:s,puts});
 }));
 return by;
}
function carrierLooseWord(list){return list.length&&list.every(x=>x.puts==='skid')?'No skid':'No dolly';}

/* ----------------------------- Колонки ----------------------------- */
/* Все колонки видны сразу (владелец: «добавь все, лишнее уберём
   конструктором»); порядок и галочки человек меняет сам — Columns. */
const CARRIER_COLS=[
 {k:'pos',label:'#'},
 {k:'order',label:'Order'},
 {k:'customer',label:'Customer'},
 {k:'po',label:'Customer PO'},
 {k:'line',label:'Line'},
 {k:'mark',label:'Mark'},
 {k:'size',label:'Size'},
 {k:'glass',label:'Glass'},
 {k:'makeup',label:'Makeup'},
 {k:'id',label:'Glass / unit ID'},
 {k:'batch',label:'Batch'},
 {k:'next',label:'Next'},
 {k:'due',label:'Due'},
 {k:'weight',label:'Weight kg'},
 {k:'puton',label:'Put on'}
];
/* Набор колонок: известные по порядку, новые колонки — видны. */
function carrierColsFill(list){
 const seen=new Set(),out=[];
 (list||[]).forEach(c=>{if(CARRIER_COLS.some(x=>x.k===c.k)&&!seen.has(c.k)){seen.add(c.k);out.push({k:c.k,on:!!c.on});}});
 CARRIER_COLS.forEach(c=>{if(!seen.has(c.k))out.push({k:c.k,on:true});});
 return out;
}
function carrierColsOn(list){return carrierColsFill(list).filter(c=>c.on).map(c=>CARRIER_COLS.find(x=>x.k===c.k));}
/* В окне: свой набор человека, иначе — набор станции, которая положила
   стекло на тару (Data → Stations), иначе все. */
function carrierColPrefs(){return carrierColsFill(carrierColsOf(carrierMe().id)||carrierStationCols(carrierWinLoader())||[]);}
function carrierColsShown(){return carrierColPrefs().filter(c=>c.on).map(c=>CARRIER_COLS.find(x=>x.k===c.k));}
function carrierColsStore(cols){const out=carrierColsSave(carrierMe().id,cols);if(!out.ok&&carrierWin)carrierWin.error=out.error;render();}
function carrierColSet(k,on){const cols=carrierColPrefs(),c=cols.find(x=>x.k===k);if(!c)return;c.on=!!on;if(!cols.some(x=>x.on))c.on=true;carrierColsStore(cols);}
function carrierColMove(k,delta){const cols=carrierColPrefs(),at=cols.findIndex(c=>c.k===k),to=at+delta;if(at<0||to<0||to>=cols.length)return;const [c]=cols.splice(at,1);cols.splice(to,0,c);carrierColsStore(cols);}
function carrierColDrop(k){const from=carrierColDrag;carrierColDrag='';if(!from||from===k)return;const cols=carrierColPrefs(),at=cols.findIndex(c=>c.k===from);if(at<0)return;const [c]=cols.splice(at,1);cols.splice(cols.findIndex(x=>x.k===k),0,c);carrierColsStore(cols);}
function carrierColsStandard(){carrierColsStore([]);}
function carrierColsHTML(){
 const cols=carrierColPrefs(),at=carrierWin&&carrierWin.menu||{},top=Math.max(8,at.y||80);
 return `<div class="sl-menu sl-cols cw-cols" style="left:${Math.max(8,(at.x||window.innerWidth)-300)}px;top:${top}px;max-height:${Math.max(200,window.innerHeight-top-12)}px" role="dialog" aria-label="Columns" data-carrier-cols><h5>Columns · drag to reorder</h5>${cols.map((c,i)=>{const col=CARRIER_COLS.find(x=>x.k===c.k);return `<div class="sl-cols-row" draggable="true" data-carrier-col="${c.k}" ondragstart="carrierColDrag='${c.k}'" ondragover="event.preventDefault()" ondrop="event.preventDefault();carrierColDrop('${c.k}')"><span class="h" aria-hidden="true">⋮⋮</span><label><input type="checkbox" data-carrier-col-toggle="${c.k}" ${c.on?'checked':''} onchange="carrierColSet('${c.k}',this.checked)"> ${esc(col.label)}</label><button type="button" class="sm" aria-label="Move ${esc(col.label)} up" ${i===0?'disabled':''} onclick="carrierColMove('${c.k}',-1)">↑</button><button type="button" class="sm" aria-label="Move ${esc(col.label)} down" ${i===cols.length-1?'disabled':''} onclick="carrierColMove('${c.k}',1)">↓</button></div>`;}).join('')}<div class="sl-actions"><button type="button" class="sl-btn" onclick="carrierColsStandard()">Standard view</button></div></div>`;
}

/* ----------------------------- Значения ---------------------------- */
function carrierLineNo(it){return (it.o.lines||[]).indexOf(it.l)+1;}
function carrierLites(it){return glassBatchComponents(it.o,it.l).filter(c=>!c.missing).length;}
function carrierSize(it,inch){const d=it.unit?stationIguGeometry(it.g,it.unit):stationGeo(it.g),q=inch?'"':'';return frac16(d.width16/16)+q+' × '+frac16(d.height16/16)+q;}
/* С какого времени лежит самое старое: сегодня — время, раньше — день. */
function carrierSinceShort(list){const at=list.map(x=>x.scan.at).filter(Boolean).sort()[0]||'';return at?carrierWhen(at):'—';}
function carrierWhen(iso){const d=finLocalDate(iso);return !d?'':d===finToday()?stationTime(iso):salesListShortDay(d)+' '+stationTime(iso);}
/* Вес строки: у юнита и одинарного стекла — вес юнита позиции, у лайта
   стеклопакета (едет на долли до IGU) — его стекло с покрытием (строки
   «Lite N» расчёта веса). Нет нормы покрытия — известная часть, со «~»,
   как в Shipping (владелец, 15.10.2026: «для одиночного стекла не увидел
   вес»). */
function carrierKg(it){
 const k=it.o.id+'|'+it.l.id;if(!carrierWeightMemo.has(k))carrierWeightMemo.set(k,finWithOrder(it.o,()=>salesLineWeight(it.l,it.o)));
 const w=carrierWeightMemo.get(k);if(!w||!(w.rows||[]).length)return null;
 if(it.unit||carrierLites(it)<=1)return w.kg!=null?{kg:w.kg,exact:true}:w.knownKg>0?{kg:w.knownKg,exact:false}:null;
 const c=it.g.c,rows=c?w.rows.filter(r=>String(r.label).startsWith('Lite '+c.lite+' ·')):[];if(!rows.length)return null;
 const kg=rows.reduce((n,r)=>n+(r.kg||0),0);return kg>0?{kg,exact:rows.every(r=>r.kg!=null)}:null;
}
function carrierText(it,k,print){
 const o=it.o,l=it.l;
 switch(k){
  case 'pos':return '#'+it.pos;
  case 'order':return o.businessNumber||'';
  case 'customer':return salesCustomerDisplay(o.customerId);
  case 'po':return o.customerPo||'';
  case 'line':return print?String(carrierLineNo(it)):'Line '+carrierLineNo(it);
  case 'mark':return l.mark||'';
  case 'size':return carrierSize(it,print);
  case 'glass':{
   if(it.unit)return [...new Set(it.glass.map(g=>g.c&&g.c.glass).filter(Boolean))].map(glassCodeLabel).join(' / ');
   const c=it.g.c;return c?(carrierLites(it)>1?'Lite '+c.lite+' · ':'')+glassCodeLabel(c.glass):'';
  }
  case 'makeup':{const m=salesMakeupById(o,l.makeupId);return m?salesMakeupSummary(m):'';}
  case 'id':return it.label;
  case 'batch':return [...new Set(it.glass.map(g=>g.entry&&g.entry.batch.number).filter(Boolean))].join(', ');
  case 'next':return it.place&&it.place.waiting||'';
  case 'due':return o.dueDate?salesListShortDay(o.dueDate):'';
  case 'weight':{const w=carrierKg(it);return w?(w.exact?'':'~')+docNum(w.kg,1):'';}
  case 'puton':{const s=it.scan||{},m=s.moved;if(m)return 'Moved '+carrierWhen(m.at)+(m.by?' · '+m.by:'');return s.station?s.station+' '+carrierWhen(s.at)+(s.by?' · '+s.by:''):'';}
 }
 return '';
}
function carrierPrio(o){return o.priority==='critical'?' <span class="pill bad">Critical</span>':o.priority==='rush'?' <span class="pill warn">Rush</span>':'';}
function carrierCell(it,c){
 const t=carrierText(it,c.k);
 switch(c.k){
  case 'pos':return `<td class="cw-pos">${esc(t)}</td>`;
  case 'order':return `<td class="cw-order"><b>${esc(t)}</b>${carrierPrio(it.o)}</td>`;
  case 'size':return `<td><b>${esc(t)}</b></td>`;
  case 'next':return `<td>${t?'→ '+esc(t):''}</td>`;
  case 'id':case 'batch':return `<td class="mono">${esc(t)}</td>`;
  case 'weight':return `<td class="n">${esc(t)}</td>`;
  case 'puton':return `<td class="mut" data-raw>${esc(t)}</td>`;
  case 'line':case 'due':return `<td>${esc(t)}</td>`;
  default:return `<td data-raw>${esc(t)}</td>`;
 }
}

/* ------------------------------ Окно ------------------------------- */
function carrierWinOpen(code,station){carrierWin={code:carrierCode(code||''),station:station||'',sel:new Set(),to:'',error:'',done:null,menu:false};render();return true;}
function carrierWinClose(){carrierWin=null;render();}
function carrierModelOf(code,station){
 if(code){
  const list=carrierContents().get(code)||[],out=typeof skidsOut==='function'?skidsOut().get(code)||null:null;
  return {code,type:carrierType(code),list,items:carrierItems(list),out,gone:out&&!list.length?carrierShippedItems(out):[]};
 }
 const list=carrierLoose().get(station)||[];
 return {code:'',station,word:carrierLooseWord(list),list,items:carrierItems(list),out:null,gone:[]};
}
function carrierWinModel(){const w=carrierWin;return w?carrierModelOf(w.code,w.station):null;}
/* Кто положил: станция последнего скана на эту тару. */
function carrierLoaderOf(m){const top=m&&m.items.length?m.items[m.items.length-1]:null;return top&&top.scan&&top.scan.station||'';}
function carrierWinLoader(){return carrierWin?carrierLoaderOf(carrierWinModel()):'';}
function carrierWinPick(key){const w=carrierWin;if(!w)return;if(w.sel.has(key))w.sel.delete(key);else w.sel.add(key);w.error='';render();}
function carrierWinPickOrder(id){
 const w=carrierWin,m=carrierWinModel();if(!w||!m)return;
 const keys=m.items.filter(i=>i.o.id===id).map(i=>i.key),all=keys.every(k=>w.sel.has(k));
 keys.forEach(k=>{if(all)w.sel.delete(k);else w.sel.add(k);});w.error='';render();
}
function carrierWinPickAll(on){const w=carrierWin,m=carrierWinModel();if(!w||!m)return;w.sel=new Set(on?m.items.map(i=>i.key):[]);w.error='';render();}
function carrierWinSelected(){const m=carrierWinModel();return m?m.items.filter(i=>carrierWin.sel.has(i.key)):[];}
function carrierWinMenu(e){if(e)e.stopPropagation();if(!carrierWin)return;const r=e&&e.currentTarget&&e.currentTarget.getBoundingClientRect?e.currentTarget.getBoundingClientRect():null;carrierWin.menu=carrierWin.menu?false:{x:r?r.right:window.innerWidth-40,y:r?r.bottom+6:80};render();}
/* Перенести выбранное на другую тару (carrierMove: «исправить ошибку
   рабочего»). Номер — как на этикетке, DL-15. */
function carrierWinMove(to){
 const w=carrierWin;if(!w)return false;const code=carrierCode(to),items=carrierWinSelected();
 if(!items.length){w.error='Select glass first';render();return false;}
 if(!code){w.error='Type the dolly or skid number';render();return false;}
 if(code===w.code){w.error='Already on '+code;render();return false;}
 const me=carrierMe(),r=carrierMove(items.flatMap(i=>i.pieces),code,me);
 if(r.error){w.error=r.error;render();return false;}
 w.sel=new Set();w.to='';w.error='';w.done={kind:'move',r,text:carrierCountText(items)+' moved '+(w.code?w.code+' → '+r.to:'onto '+r.to),by:me.name};
 render();return r;
}
function carrierWinTakeOff(){
 const w=carrierWin;if(!w||!w.code)return false;const items=carrierWinSelected();if(!items.length){w.error='Select glass first';render();return false;}
 const me=carrierMe(),r=carrierTakeOff(w.code,items.flatMap(i=>i.pieces),me);
 if(r.error){w.error=r.error;render();return false;}
 w.sel=new Set();w.error='';w.done={kind:'off',r,text:carrierCountText(items)+' taken off '+w.code+' · stays at its station',by:me.name};
 render();return r;
}
/* Empty — как в Data: спросить один раз, стекло остаётся на своей станции. */
function carrierWinEmpty(){
 const w=carrierWin,m=carrierWinModel();if(!w||!m||!m.code||!m.items.length)return false;
 const word=carrierWord(m.code),count=carrierCountText(m.items);
 salesDialogOpen({title:'Empty '+m.code+'?',note:count+' will be without a '+word+'. The glass stays at its station.',buttons:[{label:'Back'},{label:'Empty',kind:'pri',run:()=>{
  const me=carrierMe(),r=carrierEmpty(m.code,me);
  if(r.error){w.error=r.error;render();return;}
  w.sel=new Set();w.error='';w.done={kind:'empty',r,text:m.code+' emptied · '+count+' without a '+word,by:me.name};render();
 }}]});
 return true;
}
function carrierWinUndo(){
 const w=carrierWin,d=w&&w.done;if(!d)return false;
 const r=d.kind==='move'?carrierMoveUndo(d.r):carrierEmptyUndo(d.r);
 if(r&&r.error){w.error=r.error;render();return false;}
 w.done=null;w.error='';render();return true;
}
/* Скид числится у клиента, а он в цеху — «вернулся» (как скан скида на
   станции, erp/shipping/skids). */
function carrierWinBack(){
 const w=carrierWin;if(!w||!w.code)return false;const r=skidBack(w.code,carrierMe());
 if(!r||r.error){w.error=r?r.error:'Not at a customer';render();return false;}
 w.error='';w.done={kind:'back',text:r.code+' back from '+r.customer+' · '+r.days+' day'+(r.days===1?'':'s'),by:carrierMe().name};render();return r;
}
function carrierWinHTML(){
 const w=carrierWin;if(!w)return '';
 if(typeof accessCan==='function'&&!accessCan('production')&&!accessCan('masterdata')){carrierWin=null;return '';}
 carrierWeightMemo=new Map();
 const m=carrierWinModel(),cols=carrierColsShown(),loaded=m.items.length>0,rows=loaded?m.items:m.gone,keys=new Set(m.items.map(i=>i.key));
 w.sel=new Set([...w.sel].filter(k=>keys.has(k)));
 const sel=m.items.filter(i=>w.sel.has(i.key)),orders=carrierOrders(rows),word=m.code?carrierWord(m.code):'';
 const where=(()=>{const n=new Map();m.items.forEach(i=>{const s=i.place&&i.place.waiting||'';if(s)n.set(s,(n.get(s)||0)+1);});return n.size===1?'At <b>'+esc([...n.keys()][0])+'</b>':n.size?'At '+[...n].map(([s,c])=>'<b>'+esc(s)+'</b> '+c).join(' · '):'';})();
 const since=loaded?carrierSinceShort(m.list):'';
 const sub=[where,since&&since!=='—'?'since '+esc(since):'',loaded?'<b>'+esc(carrierCountText(m.items))+' · '+stationPlural(orders.length,'order','orders')+'</b>':''].filter(Boolean).join(' · ');
 const out=m.out?`<div class="cw-out" data-carrier-out>At <b data-raw>${esc(salesCustomerDisplay(m.out.customerId))}</b> since ${esc(salesListShortDay(finLocalDate(m.out.since)))} · ${skidDays(m.out.since)} day${skidDays(m.out.since)===1?'':'s'} · ${esc(m.out.ps)}${m.gone.length?' · went: '+esc(carrierCountText(m.gone)):''}</div>`:'';
 const done=w.done?`<div class="cw-done" role="status" data-carrier-done><b>${esc(w.done.text)}</b>${w.done.by?` · by <span data-raw>${esc(w.done.by)}</span>`:''}${w.done.kind==='back'?'':' <button type="button" class="sm" data-carrier-undo onclick="carrierWinUndo()">Undo</button>'}</div>`:'';
 const chips=loaded&&orders.length?`<div class="cw-orders">${orders.map(g=>{const all=g.items.every(i=>w.sel.has(i.key));return `<label class="cw-chip${all?' on':''}" data-carrier-order="${esc(g.o.businessNumber||'')}"><input type="checkbox" ${all?'checked':''} onchange="carrierWinPickOrder('${esc(g.o.id)}')"><b>${esc(g.o.businessNumber||'')}</b> <span data-raw>${esc(salesCustomerDisplay(g.o.customerId))}</span> · ${g.items.length}${carrierPrio(g.o)}</label>`;}).join('')}</div>`:'';
 const allSel=loaded&&sel.length===m.items.length;
 const head=`<tr>${loaded?`<th class="cw-check"><input type="checkbox" aria-label="Select all" data-carrier-all ${allSel?'checked':''} onchange="carrierWinPickAll(this.checked)"></th>`:''}${cols.map(c=>`<th${c.k==='weight'?' class="n"':''}>${esc(c.label)}</th>`).join('')}</tr>`;
 const body=rows.slice().reverse().map(it=>{const on=w.sel.has(it.key);return `<tr class="${on?'on':''}" data-carrier-row="${esc(it.label)}"${loaded?` onclick="if(event.target.tagName!=='INPUT')carrierWinPick('${esc(it.key)}')"`:''}>${loaded?`<td class="cw-check"><input type="checkbox" ${on?'checked':''} aria-label="Select ${esc(it.label)}" onchange="carrierWinPick('${esc(it.key)}')"></td>`:''}${cols.map(c=>carrierCell(it,c)).join('')}</tr>`;}).join('');
 const table=rows.length?`<div class="cw-table-wrap"><table class="sl-table cw-table"><thead>${head}</thead><tbody>${body}</tbody></table></div><div class="cw-note"><span>${loaded?'Top — put on last. #1 went on first.':'What went to the customer on '+esc(m.out.ps)+'.'}</span><b data-carrier-total>Total: ${esc(carrierCountText(rows))} · ${stationPlural(orders.length,'order','orders')}</b></div>`:'<div class="empty">Nothing on it</div>';
 const bar=sel.length?`<div class="cw-bar" data-carrier-sel><span><b>${esc(carrierCountText(sel))} selected</b> <span class="mut">${sel.map(i=>'#'+i.pos).join(', ')}</span></span><span class="cw-sp"></span><label class="cw-to">Move to <input data-carrier-to placeholder="DL-15" value="${esc(w.to)}" oninput="carrierWin.to=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();carrierWinMove(this.value)}"></label><button type="button" class="pri" data-carrier-move onclick="carrierWinMove(document.querySelector('[data-carrier-to]').value)">Move</button>${m.code?`<button type="button" class="cw-danger" data-carrier-takeoff onclick="carrierWinTakeOff()">Take off ${esc(m.code)}</button>`:''}</div>`:'';
 const title=m.code?`<span class="cw-code">${esc(m.code)}</span><h3>${esc(m.type?m.type.label:'')}</h3>`:`<span class="cw-code none">${esc(m.word)}</span><h3>Waiting at ${esc(m.station)}</h3>`;
 return `<div class="sales-service-modal-back cw-back" onclick="if(event.target===this)carrierWinClose()"><div class="sales-service-modal cw" role="dialog" aria-modal="true" aria-label="${esc(m.code||m.word)}" data-carrier-window="${esc(m.code||'none:'+m.station)}" onclick="if(carrierWin&&carrierWin.menu&&!event.target.closest('[data-carrier-cols],[data-carrier-cols-button]')){carrierWin.menu=false;render();}">
  <div class="cw-head"><div class="cw-title">${title}</div><button type="button" class="cw-cols-btn" data-carrier-cols-button onclick="carrierWinMenu(event)">Columns ▾</button>${w.menu?carrierColsHTML():''}<button type="button" class="cw-x" aria-label="Close" onclick="carrierWinClose()">×</button></div>
  ${sub?`<div class="cw-sub">${sub}</div>`:''}${out}${done}${w.error?`<div class="cw-err" role="alert" data-carrier-error>${esc(w.error)}</div>`:''}${chips}${table}${bar}
  <div class="cw-foot">${m.code&&loaded?`<button type="button" class="cw-danger" data-carrier-empty onclick="carrierWinEmpty()">Empty ${esc(m.code)}</button>`:''}${m.out?`<button type="button" data-carrier-back onclick="carrierWinBack()">Back at the shop</button>`:''}<span class="cw-sp"></span><button type="button" data-carrier-print ${rows.length?'':'disabled'} onclick="carrierPrint()">Print</button><button type="button" onclick="carrierWinClose()">Close</button></div>
 </div></div>`;
}
(window.APP_OVERLAYS=window.APP_OVERLAYS||[]).push(carrierWinHTML);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&carrierWin&&!(typeof salesDialog!=='undefined'&&salesDialog)){if(carrierWin.menu)carrierWin.menu=false;else carrierWin=null;render();}});

/* ------------------------------ Печать ----------------------------- */
/* Лист в стиле packing slip: шапка компании, крупный код, полоса (станция,
   с какого времени, сколько, вес, кто печатает), у одного заказа — клиент с
   адресом, заказ и PO, у нескольких — группы по заказам; колонки — те же,
   что в окне (заказ, клиент и PO уходят в шапку группы). Бумагу лист не
   задаёт — как чертёж (владелец, 15.10.2026: «печать на любом варианте,
   горизонтальный, вертикальный, просто отступы от краёв»): у страницы только
   поля, положение и размер выбирают человек и принтер, таблица ложится по
   ширине, шапка таблицы повторяется на каждой странице. Цвета — палитра
   документов (DOC_COLOR), а не темы экрана: тёмная тема на бумагу не идёт. */
const CARRIER_NOWRAP=['pos','line','size','id','next','due','weight'];
function carrierStamp(iso){return iso?docDate(finLocalDate(iso))+' · '+stationTime(iso):'—';}
function carrierSheetKind(m){return m.code?(carrierWord(m.code)==='skid'?'Skid contents':'Dolly contents'):'Not on a '+(m.word==='No skid'?'skid':'dolly');}
function carrierSheetHTML(m,cols,who){
 const C=DOC_COLOR,co=docCompanyBlock(),me=who||carrierMe(),loaded=m.items.length>0,rows=loaded?m.items:m.gone,orders=carrierOrders(rows),one=orders.length===1?orders[0].o:null;
 const use=cols.filter(c=>!['order','customer','po'].includes(c.k));carrierWeightMemo=new Map();
 const kgs=rows.map(carrierKg),kg=kgs.reduce((n,w)=>n+(w?w.kg:0),0),kgExact=kgs.every(w=>w&&w.exact);
 const where=[...new Set(m.items.map(i=>i.place&&i.place.waiting).filter(Boolean))].join(', ')||(m.out?salesCustomerDisplay(m.out.customerId):'');
 const prio=o=>o.priority==='critical'?'<span class="cs-prio bad">Critical</span>':o.priority==='rush'?'<span class="cs-prio warn">Rush</span>':'';
 const cells=[['Station',where||'—'],[loaded?'Since':'Shipped',carrierStamp(loaded?m.list.map(x=>x.scan.at).filter(Boolean).sort()[0]:m.out&&m.out.since)],['On it',carrierCountText(rows)+(orders.length>1?' · '+orders.length+' orders':'')],kg>0?['Weight',(kgExact?'':'~')+docNum(kg,1)+' kg']:null,['Printed by',me.name||'—']].filter(Boolean);
 let customer='';
 if(one){
  const c=salesFindCustomer(one.customerId)||{},a=typeof shippingDefaultAddress==='function'?shippingDefaultAddress(c):{};
  customer=`<div class="cs-cust"><div><b data-raw>${esc(salesCustomerDisplay(one.customerId))}</b>${docAddressText(a)?`<div data-raw>${esc(docAddressText(a))}</div>`:''}${a.contact||a.phone?`<div class="cs-mut" data-raw>${esc([a.contact,a.phone].filter(Boolean).join(' · '))}</div>`:''}</div><div class="cs-right"><b>Order ${esc(one.businessNumber||'')}</b>${one.customerPo?`<div data-raw>PO ${esc(one.customerPo)}</div>`:''}${prio(one)}</div></div>`;
 }
 const body=orders.map(g=>{
  const o=g.o,head=one?'':`<tr class="cs-group"><td colspan="${use.length}"><b data-raw>${esc([o.businessNumber,salesCustomerDisplay(o.customerId),o.customerPo?'PO '+o.customerPo:''].filter(Boolean).join(' · '))}</b> ${prio(o)}<span class="cs-count">${esc(carrierCountText(g.items))}</span></td></tr>`;
  /* Номер батча не рвётся на дефисе: «B-0058, B-0059» переносится только между номерами. */
  const cell=(it,c)=>{const t=carrierText(it,c.k,true);return c.k==='batch'?t.split(', ').map(x=>`<span class="cs-nw">${esc(x)}</span>`).join(', '):esc(t);};
  return head+g.items.slice().reverse().map(it=>`<tr>${use.map(c=>`<td class="${CARRIER_NOWRAP.includes(c.k)?'cs-nw':''}${c.k==='size'||c.k==='id'?' cs-b':''}${c.k==='weight'?' cs-n':''}" data-raw>${cell(it,c)}</td>`).join('')}</tr>`).join('');
 }).join('');
 const style=`--cs-ink:${C.ink};--cs-mut:${C.mut};--cs-line:${C.line};--cs-bar:${C.bar};--cs-box:${C.box};--cs-navy:${C.navy};--cs-due:${C.due};--cs-warn:${C.warn};--cs-paper:#ffffff`;
 return `<div class="cs-sheet" style="${style}" data-carrier-sheet="${esc(m.code||m.station)}">
  <div class="cs-head"><div class="cs-co"><b data-raw>${esc(co.name||'')}</b>${co.lines.slice(0,2).map(t=>`<div data-raw>${esc(t)}</div>`).join('')}</div><div class="cs-code"><small>${esc(carrierSheetKind(m).toUpperCase())}</small><b>${esc(m.code||m.station)}</b>${m.type?`<span>${esc(m.type.label)}</span>`:''}</div></div>
  <div class="cs-strip">${cells.map(([l,v])=>`<div><small>${esc(l)}</small><b data-raw>${esc(v)}</b></div>`).join('')}</div>
  ${customer}
  <table class="cs-table"><thead><tr>${use.map(c=>`<th${c.k==='weight'?' class="cs-n"':''}>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
  <div class="cs-total">Total: ${esc(carrierCountText(rows))} · ${stationPlural(orders.length,'order','orders')}${loaded&&rows.length>1?' · #1 went on first':''}</div>
 </div>`;
}
/* Подвал страницы — полями @page: кто и когда напечатал, номер страницы. */
function carrierPrintCleanup(){document.body.classList.remove('carrier-printing');}
/* Печать листа: m — что на таре, cols — колонки, who и where — кто и на
   какой станции печатает (в подвале). */
function carrierPrintSheet(m,cols,who,where){
 if(!m||!(m.items.length||m.gone.length))return false;
 let host=document.getElementById('carrierPrintHost');if(!host){host=document.createElement('div');host.id='carrierPrintHost';document.body.appendChild(host);}
 who=who||carrierMe();host.innerHTML=carrierSheetHTML(m,cols,who);
 const q=t=>'"'+String(t).replace(/["\\]/g,'')+'"',foot='font:8px Helvetica,Arial,sans-serif;color:'+DOC_COLOR.mut;
 let st=document.getElementById('carrierPageStyle');if(!st){st=document.createElement('style');st.id='carrierPageStyle';document.head.appendChild(st);}
 st.textContent='@page carriersheet{margin:10mm 10mm 12mm;@bottom-left{content:'+q('Printed '+carrierStamp(new Date().toISOString())+(who.name?' by '+who.name:'')+(where?' at '+where:''))+';'+foot+'}@bottom-right{content:'+q(carrierSheetKind(m)+' · '+(m.code||m.station)+' · ')+' counter(page) " / " counter(pages);'+foot+'}}@media print{html,body.carrier-printing{background:#ffffff!important}}';
 document.body.classList.add('carrier-printing');
 window.addEventListener('afterprint',carrierPrintCleanup,{once:true});setTimeout(carrierPrintCleanup,60000);
 try{window.print();}catch(e){carrierPrintCleanup();return false;}
 return true;
}
function carrierPrint(){return carrierPrintSheet(carrierWinModel(),carrierColsShown());}
/* Shipping → Skid sheet: тот же лист, что в окне (владелец: «лист скида
   один везде»); колонки — свои у человека или станции, что положила. */
function carrierPrintCode(code){const m=carrierModelOf(carrierCode(code));return carrierPrintSheet(m,carrierColsOn(carrierColsOf(carrierMe().id)||carrierStationCols(carrierLoaderOf(m))||[]));}
/* Экран станции: «Print what is on SA-11» — набор колонок этой станции,
   печатает вошедший на станции (на SHIPR: отсканировал скид, напечатал,
   сверил с тем, что на скиде, замотал). */
function carrierPrintButton(code){return code&&typeof stationCode==='string'&&stationCode?'<button type="button" class="b st-yes" data-station-print="'+esc(code)+'" onclick="carrierPrintAtStation(\''+esc(code)+'\')">Print what is on '+esc(code)+'</button>':'';}
function carrierPrintAtStation(code){
 const who=typeof stationWho==='function'?stationWho():null;
 return carrierPrintSheet(carrierModelOf(carrierCode(code)),carrierColsOn(carrierStationCols(stationCode)||[]),who||{id:'',name:''},stationCode);
}

/* ------------------- Production → Dollies & Skids ------------------- */
/* Карточка — тара на станции, где её стекло ждёт; стёкла на разные станции
   — карточка под каждой (владелец, 15.10.2026). Без тары — карточка
   «No dolly / No skid» на станции, где стекло ждёт. */
function carrierBoard(){
 const contents=carrierContents(),out=typeof skidsOut==='function'?skidsOut():new Map(),cards=[];
 const loaded={dolly:0,dollyItems:[],skid:0,skidItems:[]};
 contents.forEach((list,code)=>{
  const items=carrierItems(list),by=new Map();
  items.forEach(it=>{const s=it.place&&it.place.waiting||'';if(!by.has(s))by.set(s,[]);by.get(s).push(it);});
  const k=carrierWord(code);loaded[k]++;loaded[k+'Items']=loaded[k+'Items'].concat(items);
  by.forEach((here,station)=>cards.push({kind:'loaded',code,station,items,here,others:[...by].filter(([s])=>s!==station).map(([s,l])=>[s,l.length]),since:carrierSinceShort(list)}));
 });
 carrierLoose().forEach((list,station)=>{const items=carrierItems(list);cards.push({kind:'loose',code:'',station,items,here:items,others:[],word:carrierLooseWord(list),since:carrierSinceShort(list)});});
 out.forEach((x,code)=>{if(!contents.has(code))cards.push({kind:'out',code,station:'',items:[],here:[],others:[],out:x});});
 const busy=new Set([...contents.keys(),...out.keys()]);
 const empty=(DB.carrier||[]).filter(c=>c.active&&!busy.has(c.code)).sort((a,b)=>{const x=CARRIER_RE.exec(a.code),y=CARRIER_RE.exec(b.code);return (+x[2])-(+y[2]);});
 return {cards,empty,loaded,outN:[...out.keys()].filter(c=>!contents.has(c)).length,looseN:cards.filter(c=>c.kind==='loose').reduce((n,c)=>n+c.items.length,0),loadedN:contents.size};
}
function prodCarrierColumns(){return [{k:'order',label:'Order',type:'text',tokens:true,def:true},{k:'customer',label:'Customer',type:'text',tokens:true,def:true},{k:'station',label:'Station',type:'list',def:true}];}
let carrierBoardCache=null;
function prodCarrierInfos(){
 const b=carrierBoardCache||carrierBoard();
 return b.cards.map((c,i)=>{
  const its=c.kind==='out'?[]:c.here,nums=[...new Set(its.map(it=>it.o.businessNumber||''))],names=[...new Set((c.kind==='out'?[salesCustomerDisplay(c.out.customerId)]:its.map(it=>salesCustomerDisplay(it.o.customerId))))];
  const station=c.kind==='out'?'At customers':c.station;
  return {o:{id:'card'+i,createdAt:''},card:c,memo:{order:nums.join(', '),customer:names.join(', '),station},tokens:{order:nums,customer:names}};
 });
}
function carrierCardHTML(c){
 if(c.kind==='out'){const x=c.out,d=skidDays(x.since);return `<button type="button" class="cb-card" data-carrier-card="${esc(c.code)}" onclick="carrierWinOpen('${esc(c.code)}')"><span class="cb-top"><span class="cw-code sm">${esc(c.code)}</span></span><span class="cb-l" data-raw>${esc(salesCustomerDisplay(x.customerId))}</span><span class="cb-s">${d} day${d===1?'':'s'} · ${esc(x.ps)}</span></button>`;}
 const orders=carrierOrders(c.here),nums=orders.map(g=>g.o.businessNumber||''),one=orders.length===1?orders[0].o:null;
 const hot=orders.some(g=>g.o.priority==='critical')?'<span class="pill bad">Critical</span>':orders.some(g=>g.o.priority==='rush')?'<span class="pill warn">Rush</span>':'';
 const count=c.others.length?`${c.here.length} of ${c.items.length}`:carrierCountText(c.here);
 const line=one?`${esc(one.businessNumber||'')} · <span data-raw>${esc(salesCustomerDisplay(one.customerId))}</span>`:esc(nums.slice(0,3).join(' · ')+(nums.length>3?' +'+(nums.length-3):''));
 const open=c.code?`carrierWinOpen('${esc(c.code)}')`:`carrierWinOpen('','${esc(c.station)}')`;
 return `<button type="button" class="cb-card${c.kind==='loose'?' loose':''}" data-carrier-card="${esc(c.code||c.word+':'+c.station)}" onclick="${open}"><span class="cb-top"><span class="cw-code sm${c.code?'':' none'}">${esc(c.code||c.word)}</span><b>${esc(count)}</b></span><span class="cb-l">${line} ${hot}</span>${c.others.length?`<span class="cb-s">also ${esc(c.others.map(([s,n])=>s+' '+n).join(' · '))}</span>`:''}${c.kind==='loose'?`<span class="cb-s">scanned without a ${c.word==='No skid'?'skid':'dolly'} · ${stationPlural(orders.length,'order','orders')}</span>`:`<span class="cb-s">since ${esc(c.since)}</span>`}</button>`;
}
function carrierBoardSet(v){carrierBoardShow=v;render();}
function carrierBoardToggle(k){if(carrierBoardMore.has(k))carrierBoardMore.delete(k);else carrierBoardMore.add(k);render();}
function viewProdCarriers(){
 /* Пересчёт (view/carrier-count) — на месте доски. */
 if(carrierCountShow){const html=carrierCountScreen();if(html)return html;}
 const b=carrierBoard();carrierBoardCache=b;
 let infos,rows;try{infos=prodCarrierInfos();rows=salesListRows(infos);}finally{carrierBoardCache=null;}
 const p=salesListLoadPrefs(),show=carrierBoardShow,cards=rows.map(r=>r.card);
 const order=new Map((DB.station||[]).map((s,i)=>[s.code,[s.seq,i]]));
 const stations=[...new Set(cards.filter(c=>c.kind!=='out').map(c=>c.station))].sort((a,b)=>{const x=order.get(a)||[999,0],y=order.get(b)||[999,0];return x[0]-y[0]||x[1]-y[1];});
 const fbtn=(k,label)=>{const f=p.filters[k],on=!!f&&salesListFilterActive(f);return `<button type="button" class="cb-filter${on?' on':''}" data-filter-col="${k}" onclick="salesListOpenFilter(event,'${k}')">${label} ▾</button>`;};
 const total=b.loadedN+b.outN+b.empty.length,seg=[['loaded','Loaded',b.loadedN],['out','At customers',b.outN],['empty','Empty',b.empty.length],['all','All',total]];
 /* Плитки — учёт тары (вариант 1 этапа 8): зарегистрировано, в цеху, у
    клиентов, стекло без тары, итоги последнего пересчёта. */
 const tiles=carrierTilesHTML(b);
 const tools=`<div class="cb-tools">${fbtn('order','Order')}${fbtn('customer','Customer')}${fbtn('station','Station')}<span class="cb-seg">${seg.map(([k,l,n])=>`<button type="button" class="${show===k?'on':''}" data-carrier-show="${k}" onclick="carrierBoardSet('${k}')">${l} <b>${n}</b></button>`).join('')}</span><span class="cw-sp"></span><span class="mut small">Click a dolly or skid to see what is on it</span>${carrierCountButton()}</div>`;
 const group=(title,sub,body,key)=>`<section class="cb-group" data-carrier-group="${esc(key)}"><div class="cb-gh"><b>${esc(title)}</b><span>${esc(sub)}</span></div><div class="cb-cards">${body}</div></section>`;
 const many=(n,one,more)=>n===1?'1 '+one:n+' '+more;
 const groups=[];
 if(show==='loaded'||show==='all')stations.forEach(s=>{
  const list=cards.filter(c=>c.kind!=='out'&&c.station===s),d=list.filter(c=>c.code&&carrierWord(c.code)==='dolly').length,k=list.filter(c=>c.code&&carrierWord(c.code)==='skid').length,loose=list.find(c=>!c.code);
  const sub=[d?many(d,'dolly','dollies'):'',k?many(k,'skid','skids'):'',loose?(loose.word==='No skid'?'not on a skid ':'not on a dolly ')+loose.here.length:''].filter(Boolean).join(' · ');
  groups.push(group(s,sub,list.sort((a,b)=>(a.code?1:0)-(b.code?1:0)||String(a.code).localeCompare(String(b.code),'en',{numeric:true})).map(carrierCardHTML).join(''),s));
 });
 if(show==='out'||show==='all'){
  const list=cards.filter(c=>c.kind==='out').sort((a,b)=>a.out.since.localeCompare(b.out.since)),open=carrierBoardMore.has('out'),cut=open?list:list.slice(0,11);
  if(list.length)groups.push(group('At customers',many(list.length,'skid','skids'),cut.map(carrierCardHTML).join('')+(list.length>cut.length?`<button type="button" class="cb-card cb-more" onclick="carrierBoardToggle('out')">+${list.length-cut.length} more</button>`:open&&list.length>11?`<button type="button" class="cb-card cb-more" onclick="carrierBoardToggle('out')">Show less</button>`:''),'out'));
 }
 if(show==='empty'||show==='all'){
  const body=CARRIER_TYPES.map(t=>{
   const list=b.empty.filter(c=>c.code.startsWith(t.k+'-'));if(!list.length)return '';
   const open=carrierBoardMore.has(t.k),cut=open?list:list.slice(0,24);
   return `<div class="cb-free" data-carrier-free="${t.k}"><div class="cb-free-h">${esc(t.label)}s · ${list.length}</div><div class="cb-free-l">${cut.map(c=>`<button type="button" class="cw-code sm" onclick="carrierWinOpen('${esc(c.code)}')">${esc(c.code)}</button>`).join('')}${list.length>cut.length?`<button type="button" class="cb-more-l" onclick="carrierBoardToggle('${t.k}')">+${list.length-cut.length}</button>`:open&&list.length>24?`<button type="button" class="cb-more-l" onclick="carrierBoardToggle('${t.k}')">less</button>`:''}</div></div>`;
  }).join('');
  if(b.empty.length)groups.push(`<section class="cb-group" data-carrier-group="empty"><div class="cb-gh"><b>Empty — free</b><span>not at any station</span></div><div class="cb-free-all">${body}</div></section>`);
 }
 return `${tiles}${tools}${salesListFilterChips()}${groups.join('')||`<div class="empty">${infos.length?'Nothing matches the filters.':'No dollies or skids in use.'}</div>`}${salesListMenuHTML(infos)}`;
}

/* ------------- Data → Stations: колонки листа долли / скида ------------- */
/* У каждой станции свой набор (владелец, 15.10.2026: «на скиде будут стёкла
   и какие они, с тегами и прочим, поэтому чтобы была возможность настроить
   под каждую станцию»). Пусто — все колонки. Справа — образец листа на
   таре, которую эта станция загрузила последней. */
let sfSheetEdit='',sfSheetDrag='';
function carrierSheetCell(s,edit){
 const own=carrierStationCols(s.code),text=own?carrierColsOn(own).length+' columns':'All columns';
 if(!edit)return `<span class="mut" data-sf-sheet-cols="${esc(s.code)}">${text}</span>`;
 return `<span data-sf-sheet-cols="${esc(s.code)}">${text}</span> <button class="sm" data-sf-sheet="${esc(s.code)}" onclick="sfSheetEdit=sfSheetEdit==='${esc(s.code)}'?'':'${esc(s.code)}';render()">${sfSheetEdit===s.code?'Done':'Edit'}</button>`;
}
function sfSheetStore(code,cols){const out=carrierStationColsSave(code,cols);if(!out.ok)alert(out.error);render();}
function sfSheetSet(code,k,on){const cols=carrierColsFill(carrierStationCols(code)||[]),c=cols.find(x=>x.k===k);if(!c)return;c.on=!!on;if(!cols.some(x=>x.on))c.on=true;sfSheetStore(code,cols);}
function sfSheetMove(code,k,delta){const cols=carrierColsFill(carrierStationCols(code)||[]),at=cols.findIndex(c=>c.k===k),to=at+delta;if(at<0||to<0||to>=cols.length)return;const [c]=cols.splice(at,1);cols.splice(to,0,c);sfSheetStore(code,cols);}
function sfSheetDrop(code,k){const from=sfSheetDrag;sfSheetDrag='';if(!from||from===k)return;const cols=carrierColsFill(carrierStationCols(code)||[]),at=cols.findIndex(c=>c.k===from);if(at<0)return;const [c]=cols.splice(at,1);cols.splice(cols.findIndex(x=>x.k===k),0,c);sfSheetStore(code,cols);}
/* Образец: тара, которую эта станция загрузила последней; нет — любая загруженная. */
function sfSheetSample(code){
 let any=null;
 for(const c of carrierContents().keys()){const m=carrierModelOf(c);if(!m.items.length)continue;if(carrierLoaderOf(m)===code)return m;if(!any)any=m;}
 return any;
}
function carrierSheetEditorHTML(code){
 const cols=carrierColsFill(carrierStationCols(code)||[]),m=sfSheetSample(code);
 const list=cols.map((c,i)=>{const col=CARRIER_COLS.find(x=>x.k===c.k);return `<div class="sl-cols-row" draggable="true" data-sf-sheet-col="${c.k}" ondragstart="sfSheetDrag='${c.k}'" ondragover="event.preventDefault()" ondrop="event.preventDefault();sfSheetDrop('${esc(code)}','${c.k}')"><span class="h" aria-hidden="true">⋮⋮</span><label><input type="checkbox" data-sf-sheet-toggle="${c.k}" ${c.on?'checked':''} onchange="sfSheetSet('${esc(code)}','${c.k}',this.checked)"> ${esc(col.label)}</label><button type="button" class="sm" aria-label="Move ${esc(col.label)} up" ${i===0?'disabled':''} onclick="sfSheetMove('${esc(code)}','${c.k}',-1)">↑</button><button type="button" class="sm" aria-label="Move ${esc(col.label)} down" ${i===cols.length-1?'disabled':''} onclick="sfSheetMove('${esc(code)}','${c.k}',1)">↓</button></div>`;}).join('');
 return `<div class="sf-sheet" data-sf-sheet-editor="${esc(code)}"><div class="sf-sheet-cols"><h4>${esc(code)} — what is on a dolly or skid</h4><div class="mut small">Printed and shown — drag to reorder</div>${list}<div class="row" style="margin-top:8px"><button class="sm" data-sf-sheet-all onclick="sfSheetStore('${esc(code)}',[])">All columns</button></div></div>
  <div class="sf-sheet-preview"><div class="mut small">Preview${m?' · '+esc(m.code||m.station):''}</div>${m?`<div class="sf-sheet-paper">${carrierSheetHTML(m,carrierColsOn(cols),{id:'',name:''})}</div>`:'<div class="empty">No dolly or skid in use to preview</div>'}</div></div>`;
}
