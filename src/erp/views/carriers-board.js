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
function carrierColPrefs(){
 const seen=new Set(),out=[];
 (carrierColsOf(carrierMe().id)||[]).forEach(c=>{if(CARRIER_COLS.some(x=>x.k===c.k)&&!seen.has(c.k)){seen.add(c.k);out.push(c);}});
 CARRIER_COLS.forEach(c=>{if(!seen.has(c.k))out.push({k:c.k,on:true});});
 return out;
}
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
   if(it.unit)return [...new Set(it.glass.map(g=>g.c&&g.c.glass).filter(Boolean))].join(' / ');
   const c=it.g.c;return c?(carrierLites(it)>1?'Lite '+c.lite+' · ':'')+c.glass:'';
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
function carrierWinModel(){
 const w=carrierWin;if(!w)return null;
 if(w.code){
  const list=carrierContents().get(w.code)||[],out=typeof skidsOut==='function'?skidsOut().get(w.code)||null:null;
  return {code:w.code,type:carrierType(w.code),list,items:carrierItems(list),out,gone:out&&!list.length?carrierShippedItems(out):[]};
 }
 const list=carrierLoose().get(w.station)||[];
 return {code:'',station:w.station,word:carrierLooseWord(list),list,items:carrierItems(list),out:null,gone:[]};
}
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
/* Лист Letter в стиле packing slip: шапка компании, крупный код, серая
   полоса (где, с какого времени, сколько, кто печатает), у одного клиента —
   клиент с адресом и заказ с PO, у нескольких — группы по заказам;
   колонки — те же, что в окне (заказ, клиент и PO уходят в шапку группы). */
function carrierSheetPages(m,cols){
 const W=DOC_PAGE,C=DOC_COLOR,co=docCompanyBlock(),me=carrierMe(),now=new Date().toISOString();
 const loaded=m.items.length>0,rows=loaded?m.items:m.gone,orders=carrierOrders(rows),one=orders.length===1?orders[0].o:null;
 const kind=m.code?(carrierWord(m.code)==='skid'?'SKID CONTENTS':'DOLLY CONTENTS'):'NOT ON A '+(m.word==='No skid'?'SKID':'DOLLY');
 const code=m.code||(m.station?m.station:''),use=cols.filter(c=>!['order','customer','po'].includes(c.k));
 carrierWeightMemo=new Map();
 /* Ширина колонок: короткие (#, Line, Size, ID, Batch, Due, вес…) — по
    самому длинному значению целиком; длинный текст (клиент, состав, кто
    положил) делит остаток и переносится на вторую-третью строку. */
 const WRAP=['customer','po','mark','glass','makeup','puton'],bold=c=>c.k==='size'||c.k==='id';
 const texts=rows.map(it=>use.map(c=>carrierText(it,c.k,true)));
 const headW=use.map(c=>docTextWidth(c.label.toUpperCase(),6.5,true,.5)+10);
 const nat=use.map((c,i)=>Math.max(headW[i],...texts.map(t=>docTextWidth(t[i],8.4,bold(c))+10)));
 const span=W.right-W.left,wrap=use.map(c=>WRAP.includes(c.k));
 /* Длинный текст не уже самого длинного своего слова: «6SBN60» не рвётся. */
 const word=use.map((c,i)=>wrap[i]?Math.max(headW[i],...texts.map(t=>Math.max(0,...String(t[i]).split(/\s+/).map(x=>docTextWidth(x,8.4,bold(c))))+10)):nat[i]);
 const need=use.map((c,i)=>wrap[i]?Math.max(0,Math.min(nat[i],220)-word[i]):0),base=word.reduce((a,b)=>a+b,0),needSum=need.reduce((a,b)=>a+b,0);
 let widths;
 if(base>=span)widths=word.map(w=>w*span/base);
 else{const extra=span-base,give=Math.min(extra,needSum),rest=extra-give;widths=word.map((w,i)=>w+(needSum?need[i]*give/needSum:0)+rest/use.length);}
 const cell=(t,c,i)=>{const l=docWrap(t,8.4,bold(c),widths[i]-9);return l.length>3?l.slice(0,2).concat(docFit(l.slice(2).join(' '),8.4,bold(c),widths[i]-9)):l;};
 const xs=[];widths.reduce((x,w)=>{xs.push(x);return x+w;},W.left);
 const kgs=rows.map(carrierKg),kg=kgs.reduce((n,w)=>n+(w?w.kg:0),0),kgExact=kgs.every(w=>w&&w.exact);
 const where=[...new Set(m.items.map(i=>i.place&&i.place.waiting).filter(Boolean))].join(', ')||(m.out?salesCustomerDisplay(m.out.customerId):'');
 const pages=[];let P,y;
 const page=first=>{
  P=docPage();pages.push(P);y=W.top;
  P.text(W.left,y+11,docFit(co.name||'',13,true,330),{size:13,bold:true,color:C.navy});
  co.lines.slice(0,2).forEach((t,i)=>P.text(W.left,y+24+i*10,docFit(t,7.6,false,330),{size:7.6,color:C.mut}));
  P.text(W.right,y+8,kind,{size:9,bold:true,color:C.mut,align:'right',ls:.4});
  if(!first){P.text(W.right,y+26,code+' · continued',{size:13,bold:true,align:'right'});y+=44;return;}
  P.text(W.right,y+44,code,{size:code.length>6?30:38,bold:true,align:'right'});
  if(m.type)P.text(W.right,y+56,m.type.label,{size:8,color:C.mut,align:'right'});
  y+=70;
  const cells=[{label:'Station',value:where||'—'},{label:loaded?'Since':'Shipped',value:carrierStamp(loaded?m.list.map(x=>x.scan.at).filter(Boolean).sort()[0]:m.out&&m.out.since)},{label:'On it',value:carrierCountText(rows)+(orders.length>1?' · '+orders.length+' orders':'')},kg>0?{label:'Weight',value:(kgExact?'':'~')+docNum(kg,1)+' kg'}:null,{label:'Printed by',value:me.name||'—'}].filter(Boolean);
  P.rect(W.left,y,span,30,{fill:C.box,r:4});
  let x=W.left+10;cells.forEach(c=>{docLabel(P,x,y+11,c.label);P.text(x,y+23,docFit(c.value,9,true,160),{size:9,bold:true});x+=Math.max(70,docTextWidth(c.value,9,true)+26);});
  y+=46;
  if(one){
   const c=salesFindCustomer(one.customerId)||{},a=typeof shippingDefaultAddress==='function'?shippingDefaultAddress(c):{};
   P.text(W.left,y+10,docFit(salesCustomerDisplay(one.customerId),12,true,330),{size:12,bold:true});
   [docAddressText(a),[a.contact,a.phone].filter(Boolean).join(' · ')].filter(Boolean).forEach((t,i)=>P.text(W.left,y+24+i*11,docFit(t,8.4,false,330),{size:8.4,color:i?C.mut:C.ink}));
   P.text(W.right,y+10,'Order '+(one.businessNumber||''),{size:11,bold:true,align:'right'});
   if(one.customerPo)P.text(W.right,y+24,'PO '+one.customerPo,{size:8.6,align:'right'});
   if(one.priority==='critical'||one.priority==='rush')P.text(W.right,y+36,one.priority==='critical'?'Critical':'Rush',{size:8.6,bold:true,color:one.priority==='critical'?C.due:C.warn,align:'right'});
   y+=50;
  }
 };
 const head=()=>{P.rect(W.left,y,span,16,{fill:C.bar});use.forEach((c,i)=>docLabel(P,xs[i]+5,y+10.5,c.label,{size:6.5,ls:.5,align:'left'}));y+=21;};
 const ensure=h=>{if(y+h>W.bottom-24){page(false);head();}};
 page(true);head();
 orders.forEach(g=>{
  if(!one){
   ensure(34);const o=g.o,label=[o.businessNumber,salesCustomerDisplay(o.customerId),o.customerPo?'PO '+o.customerPo:''].filter(Boolean).join(' · ');
   y+=4;P.text(W.left+5,y+8,docFit(label,9.6,true,360),{size:9.6,bold:true});
   if(o.priority==='critical'||o.priority==='rush'){const t=o.priority==='critical'?'Critical':'Rush',x=W.left+5+Math.min(360,docTextWidth(label,9.6,true))+10;P.text(x,y+8,t,{size:7.6,bold:true,color:o.priority==='critical'?C.due:C.warn});}
   P.text(W.right-5,y+8,carrierCountText(g.items),{size:8.4,color:C.mut,align:'right'});
   y+=13;P.line(W.left,y,W.right,y,{stroke:C.navy,lw:1});y+=4;
  }
  g.items.slice().reverse().forEach((it,n)=>{
   const cells=use.map((c,i)=>cell(carrierText(it,c.k,true),c,i)),h=Math.max(...cells.map(l=>l.length))*10+5;
   ensure(h+1);if(n%2)P.rect(W.left,y-1,span,h,{fill:C.box});
   cells.forEach((l,i)=>l.forEach((t,k)=>P.text(xs[i]+5,y+9.6+k*10,t,{size:8.4,bold:bold(use[i])})));
   y+=h;P.line(W.left,y-1,W.right,y-1,{stroke:C.line,lw:.4});
  });
 });
 ensure(20);y+=8;P.text(W.left,y+6,'Total: '+carrierCountText(rows)+' · '+stationPlural(orders.length,'order','orders')+(loaded&&rows.length>1?'  ·  #1 went on first':''),{size:9.4,bold:true});
 const stamp='Printed '+carrierStamp(now)+(me.name?' by '+me.name:'');
 pages.forEach((p,i)=>{p.line(W.left,W.bottom,W.right,W.bottom,{stroke:C.line,lw:.6});p.text(W.left,W.footer,stamp,{size:7.4,color:C.mut});p.text(W.right,W.footer,(kind.charAt(0)+kind.slice(1).toLowerCase())+' · '+code+' · '+(i+1)+' / '+pages.length,{size:7.4,color:C.mut,align:'right'});});
 return pages;
}
function carrierStamp(iso){return iso?docDate(finLocalDate(iso))+' · '+stationTime(iso):'—';}
function carrierPrint(){
 const m=carrierWinModel();if(!m||!(m.items.length||m.gone.length))return false;
 const pages=carrierSheetPages(m,carrierColsShown());shippingShowPrint(pages);return pages.length;
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
 const b=carrierBoard();carrierBoardCache=b;
 let infos,rows;try{infos=prodCarrierInfos();rows=salesListRows(infos);}finally{carrierBoardCache=null;}
 const p=salesListLoadPrefs(),show=carrierBoardShow,cards=rows.map(r=>r.card);
 const order=new Map((DB.station||[]).map((s,i)=>[s.code,[s.seq,i]]));
 const stations=[...new Set(cards.filter(c=>c.kind!=='out').map(c=>c.station))].sort((a,b)=>{const x=order.get(a)||[999,0],y=order.get(b)||[999,0];return x[0]-y[0]||x[1]-y[1];});
 const fbtn=(k,label)=>{const f=p.filters[k],on=!!f&&salesListFilterActive(f);return `<button type="button" class="cb-filter${on?' on':''}" data-filter-col="${k}" onclick="salesListOpenFilter(event,'${k}')">${label} ▾</button>`;};
 const total=b.loadedN+b.outN+b.empty.length,seg=[['loaded','Loaded',b.loadedN],['out','At customers',b.outN],['empty','Empty',b.empty.length],['all','All',total]];
 const tiles=`<div class="cb-tiles">
  <div class="cb-tile"><b>${b.loaded.dolly}</b><span>${b.loaded.dolly===1?'dolly':'dollies'} loaded · ${esc(carrierCountText(b.loaded.dollyItems))}</span></div>
  <div class="cb-tile"><b>${b.loaded.skid}</b><span>${b.loaded.skid===1?'skid':'skids'} in the shop · ${esc(carrierCountText(b.loaded.skidItems))}</span></div>
  <div class="cb-tile"><b>${b.outN}</b><span>${b.outN===1?'skid':'skids'} at customers</span></div>
  <div class="cb-tile${b.looseN?' warn':''}" data-carrier-loose-tile><b>${b.looseN}</b><span>glass with no dolly or skid</span></div>
  <div class="cb-tile"><b>${b.empty.length}</b><span>empty</span></div></div>`;
 const tools=`<div class="cb-tools">${fbtn('order','Order')}${fbtn('customer','Customer')}${fbtn('station','Station')}<span class="cb-seg">${seg.map(([k,l,n])=>`<button type="button" class="${show===k?'on':''}" data-carrier-show="${k}" onclick="carrierBoardSet('${k}')">${l} <b>${n}</b></button>`).join('')}</span><span class="cw-sp"></span><span class="mut small">Click a dolly or skid to see what is on it</span></div>`;
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
