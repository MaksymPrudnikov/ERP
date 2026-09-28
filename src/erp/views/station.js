/* =====================================================================
   view/station  ·  station-1.0
   Экран станции цеха: вход рабочего, скан за сканом, карточка стекла,
   лист раскроя, журнал с Undo. Плюс экран офиса «где стёкла ждут».
   IN : #station=CUT в адресе · DB.stationScan (erp/shopfloor/scan)
   OUT: html
   Правило: скан не останавливает работу. Поле всегда в фокусе, карточка
   меняется без кнопок, ошибки — цветом и звуком, окон нет. Владелец,
   29 сентября 2026: «нужно, чтобы нон-стоп не прерывалось, только в редких
   случаях выскакивало окно».

   Экран открывается своей ссылкой (…/GLASS_ERP.html#station=CUT) и рисует
   только себя, без меню и шапки ERP: на станциях слабые ПК, может быть,
   планшеты. Кто работает — хранится в этом браузере (компьютер стоит у
   станции), а не в базе: это свойство рабочего места, а не данных.
   ===================================================================== */
let stationCode='';
let stationLast=null;      // последний скан: {check, rec, data, place, at}
let stationNote='';        // короткая строка под карточкой: «Sheet 3 done»
let stationSheetView=null; // какой лист показан: {batch, glass, no}
let stationMenu=null;      // меню стекла на листе: {piece, x, y}
let stationLoginPick='';   // выбранный на входе рабочий (viewProfileId)
let stationPin='',stationPinError=false;
const STATION_SESSION_KEY='glass_erp_station_session_v1';
/* Навык, по которому станция узнаёт своих рабочих. Станция по умолчанию
   у пользователя (поле station) тоже годится. */
const STATION_SKILL={CUT:'Cutting',EDGE:'Edgework (arris/polish)',CNC:'CNC polishing',DRILL:'Drilling / notches',HEAT:'Tempering',SHIPR:'Shipping / loading',SHIP:'Shipping / loading'};

function stationFromHash(){const m=/^#station=([A-Za-z0-9_-]{1,40})$/.exec(location.hash||'');return m?m[1].toUpperCase():'';}
(function(){const c=stationFromHash();if(c){stationCode=c;tab='station';}})();
window.addEventListener('hashchange',function(){
 const c=stationFromHash();
 if(c){stationCode=c;tab='station';stationLast=null;stationSheetView=null;render();}
 else if(tab==='station'){tab='production';render();}
});
function stationOpen(code){
 const url=location.href.split('#')[0]+'#station='+encodeURIComponent(code);
 const w=window.open(url,'_blank');if(!w)location.hash='station='+code;
}
function stationExit(){stationCode='';tab='production';subtab='where';history.replaceState(null,'',location.href.split('#')[0]);render();}
function stationRow(){return (DB.station||[]).find(s=>s.code===stationCode)||null;}
function stationName(code){const s=(DB.station||[]).find(x=>x.code===code);return s?sfName(s):code;}

/* --------------------------- Кто работает --------------------------- */
function stationSession(){try{const s=JSON.parse(localStorage.getItem(STATION_SESSION_KEY)||'null');return s&&typeof s==='object'?s:null;}catch(e){return null;}}
function stationWho(){
 const s=stationSession();if(!s||s.station!==stationCode)return null;
 const u=(DB.user||[]).find(x=>x.viewProfileId===s.userId);
 return u?{id:u.viewProfileId,name:u.name}:null;
}
function stationUsers(){
 const skill=STATION_SKILL[stationCode],own=(DB.user||[]).filter(u=>u.station===stationCode||(u.skills||[]).some(x=>x&&x.skill===skill));
 return (own.length?own:(DB.user||[])).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
function stationLogin(id){
 const u=(DB.user||[]).find(x=>x.viewProfileId===id);if(!u)return false;
 try{localStorage.setItem(STATION_SESSION_KEY,JSON.stringify({station:stationCode,userId:id,at:new Date().toISOString()}));}catch(e){return false;}
 stationLoginPick='';stationPin='';stationPinError=false;render();return true;
}
function stationPickUser(id){
 const u=(DB.user||[]).find(x=>x.viewProfileId===id);if(!u)return;
 if(!u.pin)return stationLogin(id);
 stationLoginPick=id;stationPin='';stationPinError=false;render();
}
function stationPinKey(k){
 const u=(DB.user||[]).find(x=>x.viewProfileId===stationLoginPick);if(!u)return;
 if(k==='back')stationPin=stationPin.slice(0,-1);
 else if(/^\d$/.test(k)&&stationPin.length<4)stationPin+=k;
 stationPinError=false;
 if(stationPin.length===4){if(stationPin===u.pin)return stationLogin(u.viewProfileId);stationPin='';stationPinError=true;stationBeep('error');}
 render();
}
function stationSwitch(){try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationLast=null;stationNote='';stationMenu=null;render();}
function stationInitials(name){return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();}

/* ------------------------------ Звук ------------------------------- */
/* Разный звук на разный исход: рабочий понимает, не глядя на экран. */
let stationAudio=null;
function stationBeep(kind){
 try{
  stationAudio=stationAudio||new (window.AudioContext||window.webkitAudioContext)();
  const tones={ok:[[880,.07]],info:[[880,.07]],twice:[[660,.06],[660,.06]],error:[[220,.35]],sheet:[[660,.08],[990,.14]],urgent:[[880,.07],[1320,.12]]}[kind]||[[880,.07]];
  let t=stationAudio.currentTime+.01;
  tones.forEach(([f,d])=>{const o=stationAudio.createOscillator(),g=stationAudio.createGain();o.type=kind==='error'?'square':'sine';o.frequency.value=f;g.gain.value=.12;o.connect(g);g.connect(stationAudio.destination);o.start(t);o.stop(t+d);t+=d+.05;});
 }catch(e){}
}

/* ------------------------------- Скан ------------------------------- */
function stationSubmit(raw){
 const who=stationWho();if(!who)return false;
 const check=stationCheck(stationCode,raw);if(!check)return false;
 const rec=STATION_RECORDED.includes(check.kind)?stationRecord(stationCode,check,who,{manual:/^\d+$/.test(String(raw).trim())}):null;
 stationShow(check,rec);
 render();
 return check.kind;
}
function stationShow(check,rec){
 stationMenu=null;stationNote='';
 const g=check.g||null;let data=null;
 if(g&&g.c&&!g.c.missing){try{data=stkGlassData('production',g.o,g.l,g.c,g.unit,{batch:g.entry?g.entry.batch.number:''});}catch(e){data=null;}}
 const place=g?stationPlace(g):null;
 stationLast={check,rec,data,place,at:rec?rec.at:new Date().toISOString()};
 /* Лист: показываем лист отсканированного стекла; закрылся — следующий. */
 const kind=check.kind;let sound=kind==='ok'||kind==='hold'?(check.stock?'info':stationUrgency(g&&g.o)===2?'urgent':'ok'):kind==='already'?'twice':'error';
 if(kind==='hold')sound='error';
 if(g&&g.entry&&rec){
  const at=stationSheetFind(g.entry.batch.number,g.id);
  if(at){
   stationSheetView={batch:g.entry.batch.number,glass:at.group.glass,no:at.sheet.no};
   if(stationSheetDone(at.sheet)){
    const next=stationSheetNext(g.entry.batch.number,at.group,at.sheet);
    stationNote='Sheet '+at.sheet.no+' done'+(next?' → sheet '+next.sheet.no+(next.group.glass!==at.group.glass?' · glass change → '+next.group.glass:''):' · batch '+g.entry.batch.number+' cut');
    if(next)stationSheetView={batch:g.entry.batch.number,glass:next.group.glass,no:next.sheet.no};
    sound='sheet';
   }
  }
 }else if(g&&g.entry&&!stationSheetView){const at=stationSheetFind(g.entry.batch.number,g.id);if(at)stationSheetView={batch:g.entry.batch.number,glass:at.group.glass,no:at.sheet.no};}
 stationBeep(sound);
}
function stationUndoClick(id){
 const who=stationWho();if(!who)return;
 const r=stationUndo(id,who);
 stationNote=r.error||'Scan undone';
 if(!r.error&&stationLast&&stationLast.rec&&stationLast.rec.id===id)stationLast=null;
 stationBeep(r.error?'error':'twice');render();
}

/* ------------------------------- Лист -------------------------------- */
function stationSheetFind(batch,piece){
 const plan=typeof cutPlanFor==='function'?cutPlanFor(batch):null;
 if(!plan||!Array.isArray(plan.groups))return null;
 const f=cutFind(plan,piece);return f?{plan,group:f.group,sheet:f.sheet}:null;
}
function stationCutSet(){const s=new Set();(DB.glassBatch||[]).forEach(b=>b.items.forEach(i=>{if(!i.releasedAt&&i.cutStartedAt)s.add(i.piece);}));return s;}
function stationSheetDone(sheet,cut){cut=cut||stationCutSet();return (sheet.pieces||[]).length>0&&sheet.pieces.every(p=>cut.has(p.piece));}
/* Следующий по порядку раскроя лист, где есть что резать: сначала листы
   этого стекла после текущего, потом остальные стёкла батча, потом
   пропущенные раньше. */
function stationSheetNext(batch,group,sheet){
 const plan=cutPlanFor(batch);if(!plan)return null;const cut=stationCutSet(),all=[];
 plan.groups.forEach(g=>g.sheets.forEach(s=>all.push({group:g,sheet:s})));
 const at=all.findIndex(x=>x.group===group&&x.sheet===sheet),order=all.slice(at+1).concat(all.slice(0,Math.max(0,at)));
 return order.find(x=>!stationSheetDone(x.sheet,cut))||null;
}
function stationSheetPick(batch,glass,no){stationSheetView={batch,glass,no};stationMenu=null;render();}
function stationPieceLabel(id){return String(+String(id).slice(2)||id);}
function stationSheetSVG(sheet,cut,nowId){
 const size=sheet.size||{w:144,h:102},W=+size.w||144,H=+size.h||102,fy=(y,h)=>H-y-h,f=Math.max(2,W/42);
 const out=['<svg class="st-sheet-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" onclick="stationSheetClick(event)">',
  '<rect class="st-sheet-bg" x="0" y="0" width="'+W+'" height="'+H+'"/>'];
 (sheet.stock||[]).forEach(o=>{out.push('<rect class="st-stock" x="'+o.x+'" y="'+fy(o.y,o.h)+'" width="'+o.w+'" height="'+o.h+'"/>');
  if(o.w>f*6&&o.h>f*2)out.push('<text class="st-stock-t" x="'+(o.x+o.w/2)+'" y="'+(fy(o.y,o.h)+o.h/2+f*.35)+'" font-size="'+(f*.8)+'" text-anchor="middle">'+esc(o.id)+'</text>');});
 (sheet.pieces||[]).forEach(p=>{
  const st=p.piece===nowId?'now':cut.has(p.piece)?'cut':'wait',y=fy(p.y,p.h),fs=Math.max(1.6,Math.min(f*1.2,p.w/6,p.h/3));
  out.push('<g class="st-pc '+st+'" data-station-piece="'+esc(p.piece)+'"><rect x="'+(p.x+.3)+'" y="'+(y+.3)+'" width="'+Math.max(0,p.w-.6)+'" height="'+Math.max(0,p.h-.6)+'" rx=".6"/>');
  out.push('<text x="'+(p.x+p.w/2)+'" y="'+(y+p.h/2)+'" font-size="'+fs+'" text-anchor="middle" class="st-pc-n">'+esc(stationPieceLabel(p.piece))+'</text>');
  if(p.h>fs*2.6)out.push('<text x="'+(p.x+p.w/2)+'" y="'+(y+p.h/2+fs*1.1)+'" font-size="'+(fs*.72)+'" text-anchor="middle" class="st-pc-s">'+esc(frac16(p.w)+' × '+frac16(p.h))+'</text>');
  if(st==='cut'&&p.w>fs*3&&p.h>fs*2)out.push('<text x="'+(p.x+p.w-fs*.5)+'" y="'+(y+fs*1.1)+'" font-size="'+fs+'" text-anchor="end" class="st-pc-c">✓</text>');
  out.push('</g>');
 });
 return out.join('')+'</svg>';
}
function stationSheetClick(ev){
 const g=ev.target.closest&&ev.target.closest('[data-station-piece]');
 if(!g){stationMenu=null;render();return;}
 const host=document.querySelector('.st-sheet-card'),box=host?host.getBoundingClientRect():{left:0,top:0};
 stationMenu={piece:g.getAttribute('data-station-piece'),x:ev.clientX-box.left,y:ev.clientY-box.top};render();
}
/* Стикер не читается — стекло отмечают на листе. Запись та же, с пометкой
   manual: потом видно, как часто стикеры не читаются. */
function stationMark(piece){
 const who=stationWho();if(!who)return;
 const check=stationCheck(stationCode,piece);if(!check)return;
 const rec=STATION_RECORDED.includes(check.kind)?stationRecord(stationCode,check,who,{manual:true}):null;
 stationShow(check,rec);render();
}
function stationPeek(piece){
 const check=stationCheck(stationCode,piece);if(!check)return;
 stationMenu=null;const g=check.g;let data=null;
 if(g&&g.c&&!g.c.missing){try{data=stkGlassData('production',g.o,g.l,g.c,g.unit,{batch:g.entry?g.entry.batch.number:''});}catch(e){}}
 stationLast={check:Object.assign({},check,{kind:'peek'}),rec:null,data,place:g?stationPlace(g):null,at:new Date().toISOString()};render();
}
function stationSheetCard(){
 const v=stationSheetView;
 if(!v)return '<div class="card st-sheet-card st-empty"><div class="mut">Scan a glass — its sheet appears here</div></div>';
 const plan=cutPlanFor(v.batch),group=plan&&plan.groups.find(g=>g.glass===v.glass),sheet=group&&group.sheets.find(s=>s.no===v.no);
 if(!sheet)return '<div class="card st-sheet-card st-empty"><div class="mut">No cutting plan for '+esc(v.batch)+'</div></div>';
 const cut=stationCutSet(),nowId=stationLast&&stationLast.check&&stationLast.check.code,size=sheet.size||{};
 const n=sheet.pieces.filter(p=>cut.has(p.piece)).length;
 const tiles=group.sheets.map(s=>{const done=stationSheetDone(s,cut),k=s.pieces.filter(p=>cut.has(p.piece)).length;
  return '<button type="button" class="st-tile'+(done?' done':'')+(s===sheet?' now':'')+'" onclick="stationSheetPick(\''+esc(v.batch)+'\',\''+esc(group.glass)+'\','+s.no+')"><b>'+s.no+'</b><span>'+(done?'✓':k?k+'/'+s.pieces.length:s.pieces.length)+'</span></button>';}).join('');
 const menu=stationMenu&&sheet.pieces.some(p=>p.piece===stationMenu.piece)?stationMenuHTML():'';
 return '<div class="card st-sheet-card"><div class="st-sec"><h3>Sheet '+sheet.no+' of '+group.sheets.length+'</h3><span class="pill" data-raw>'+esc(group.glass)+' · '+esc(frac16(size.w)+' × '+frac16(size.h))+'</span><span class="sp"></span><span class="pill '+(n===sheet.pieces.length?'ok':'')+'">'+n+' / '+sheet.pieces.length+' cut</span></div>'+
  stationSheetSVG(sheet,cut,nowId)+'<div class="st-tiles">'+tiles+'</div>'+menu+'</div>';
}
function stationMenuHTML(){
 const m=stationMenu,cut=stationCutSet().has(m.piece),x=Math.max(8,m.x-90),y=m.y+12;
 return '<div class="st-menu" style="left:'+x+'px;top:'+y+'px"><div class="st-menu-h mono">'+esc(m.piece)+'</div>'+
  (cut?'':'<button type="button" onclick="stationMark(\''+esc(m.piece)+'\')">✓ Mark cut</button>')+
  '<button type="button" onclick="stationPeek(\''+esc(m.piece)+'\')">Details</button></div>';
}

/* ------------------------------ Карточка ----------------------------- */
function stationRouteChips(route,place){
 if(!route||!route.length)return '';
 return '<div class="st-route">'+route.map((c,i)=>{const done=place&&i<=place.far,next=place&&c===place.waiting;
  return '<span class="st-rc'+(done?' done':next?' next':'')+'">'+(done?'✓ ':'')+esc(c)+'</span>';}).join('<span class="st-ra">›</span>')+'</div>';
}
function stationTime(iso){const d=new Date(iso);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
function stationCard(){
 const L=stationLast;
 if(!L)return '<div class="st-res st-idle"><div class="mut">Ready for the first scan</div></div>';
 const c=L.check,d=L.data,g=c.g,o=g&&g.o,urg=stationUrgency(o),place=L.place;
 const verb=stationCode===stationCutCode()?'Cut':'Done';
 const who=c.here?stationTime(c.here.at)+' · '+(c.here.by||'—'):'';
 const waitName=place&&place.waiting?stationName(place.waiting):'';
 const K={
  ok:{cls:c.stock?'st-info':'st-ok',head:'✓ '+verb+(c.stock?' · no batch — stock cut':'')},
  hold:{cls:'st-red',head:'✓ '+verb+' · order on hold'},
  already:{cls:'st-amber',head:'Already '+(verb==='Cut'?'cut':'done')+' · '+who},
  passed:{cls:'st-red',head:'✕ Not for '+stationCode},
  skipped:{cls:'st-red',head:'✕ '+(c.missed||[]).join(', ')+' not scanned'},
  route:{cls:'st-red',head:'✕ '+stationCode+' is not in its route'},
  cancelled:{cls:'st-red',head:'✕ Order cancelled'},
  unit:{cls:'st-red',head:'✕ Unit number'},
  unknown:{cls:'st-red',head:'✕ Unknown code'},
  peek:{cls:'st-info',head:'Details'}
 }[c.kind]||{cls:'st-red',head:c.kind};
 if(c.kind==='ok'&&urg===2)K.cls='st-red';
 /* Большой блок слева — главное действие рабочего. */
 let big;
 if(c.kind==='hold')big='<div class="st-big st-red"><small>ON HOLD</small><b>SET ASIDE</b><span>'+esc(c.reason||'Order on hold')+'</span></div>';
 else if(['passed','skipped','route'].includes(c.kind))big='<div class="st-big st-red"><small>WAITING AT</small><b>'+esc(place&&place.waiting||'—')+'</b><span>'+(place&&place.waiting?'Take it to '+esc(place.waiting):'Shipped')+'</span></div>';
 else if(c.kind==='cancelled')big='<div class="st-big st-red"><small>ORDER</small><b>STOP</b><span>Cancelled — set aside</span></div>';
 else if(c.kind==='unit')big='<div class="st-big st-red"><small>UNIT</small><b>'+esc(c.code)+'</b><span>Scan the glass sticker</span></div>';
 else if(c.kind==='unknown')big='<div class="st-big st-red"><small>NOT FOUND</small><b class="st-big-code">'+esc(c.code)+'</b><span>Check the sticker</span></div>';
 else if(place&&place.shipped)big='<div class="st-big"><small>ROUTE</small><b>DONE</b><span>Shipped</span></div>';
 else big='<div class="st-big'+(urg===2&&c.kind==='ok'?' st-red':'')+'"><small>NEXT</small><b>'+esc(place&&place.waiting||'—')+'</b><span>'+(urg===2&&c.kind==='ok'?'Set aside or take it now':esc(waitName))+'</span></div>';
 const bar=o&&urg&&!['unknown','unit'].includes(c.kind)?'<div class="st-urg'+(urg===2?'':' st-rush')+'">'+(urg===2?'CRITICAL':'RUSH')+'<span>· order '+esc(o.businessNumber||'')+(d&&d.due?' · due '+esc(d.due):'')+'</span></div>':'';
 const size=d?(d.cut||d.finished):null;
 const lineTxt=d?'Line '+d.line+' · '+(d.recut?esc(d.recut):d.unit+' of '+d.of)+(d.lites>1?' · Lite '+esc(d.lite):''):'';
 const info=g?'<div class="st-gid mono">'+esc(c.code)+'</div><div class="st-kv">'+
  '<span class="k">Order</span><span><b>'+esc(o.businessNumber||'')+'</b> · <span data-raw>'+esc(salesCustomerDisplay(o.customerId))+'</span></span>'+
  (d?'<span class="k">Line</span><span>'+lineTxt+'</span>':'')+
  (d?'<span class="k">Glass</span><span><b data-raw>'+esc(d.glass.code||d.glass.name)+'</b>'+(d.glass.heat?' · '+esc(d.glass.heat):'')+'</span>':'')+
  (size?'<span class="k">Size</span><span><b>'+esc(frac16(size.w)+' × '+frac16(size.h))+'</b>'+(d.shape?' · Shape':'')+'</span>':'')+
  (d&&d.due?'<span class="k">Due</span><span>'+esc(d.due)+'</span>':'')+
  '</div>'+stationRouteChips(place&&place.route,place)+
  (d&&d.route&&d.route.services&&d.route.services.length?'<div class="st-svc">'+d.route.services.map(s=>'<span>'+esc(s.text)+'</span>').join('')+'</div>':''):'<div class="st-gid mono">'+esc(c.code)+'</div>';
 const acts=L.rec?'<div class="st-acts"><button type="button" class="b" onclick="stationUndoClick(\''+esc(L.rec.id)+'\')">Undo</button></div>':'';
 return '<div class="st-res '+K.cls+'" data-station-result="'+esc(c.kind)+'">'+(bar||'<div class="st-res-h">'+esc(K.head)+'<span>'+esc(stationTime(L.at))+'</span></div>')+
  (bar&&c.kind!=='ok'?'<div class="st-res-h">'+esc(K.head)+'<span>'+esc(stationTime(L.at))+'</span></div>':'')+
  '<div class="st-res-b">'+big+'<div class="st-info">'+info+'</div></div>'+acts+'</div>';
}

/* ------------------------------ Журнал ------------------------------ */
function stationJournal(){
 const rows=(DB.stationScan||[]).filter(s=>s.station===stationCode&&!s.undoneAt).slice(-8).reverse();
 if(!rows.length)return '';
 const index=stationPieceIndex(),batches=stationBatchIndex();
 const lastOf=new Map();(DB.stationScan||[]).forEach(s=>{if(!s.undoneAt)lastOf.set(s.piece,s);});
 const body=rows.map(s=>{
  const g=stationGlass(s.piece,index,batches),snap=g&&g.entry&&g.entry.part?g.entry.part.snapshot:null,place=g?stationPlace(g):null;
  return '<tr'+(g&&stationUrgency(g.o)===2?' class="st-hot"':'')+'><td class="mut">'+esc(stationTime(s.at))+'</td><td class="mono"><b>'+esc(s.piece)+'</b>'+(s.manual?' <span class="st-man" title="Marked by hand">hand</span>':'')+'</td>'+
   '<td>'+esc(g?g.o.businessNumber||'':'')+'</td><td>'+esc(g&&snap?'Line '+snap.line:'')+'</td>'+
   '<td class="st-to">'+(place&&place.waiting?'→ '+esc(place.waiting):place&&place.shipped?'✓':'')+'</td><td class="mut" data-raw>'+esc(s.by)+'</td>'+
   '<td style="text-align:right">'+(lastOf.get(s.piece)===s?'<button type="button" class="b sm" onclick="stationUndoClick(\''+esc(s.id)+'\')">Undo</button>':'')+'</td></tr>';
 }).join('');
 return '<div class="card st-journal"><div class="st-sec"><h3>Last scans</h3></div><table><thead><tr><th>Time</th><th>Glass</th><th>Order</th><th>Line</th><th>Next</th><th>By</th><th></th></tr></thead><tbody>'+body+'</tbody></table></div>';
}

/* ------------------------------ Экран -------------------------------- */
function stationBatchChip(){
 const b=stationSheetView?glassBatchFind(stationSheetView.batch):null;if(!b)return '';
 const live=b.items.filter(i=>!i.releasedAt),cut=live.filter(i=>i.cutStartedAt).length;
 return '<div class="st-chip">Batch <b class="mono">'+esc(b.number)+'</b> · <b>'+cut+'</b> / '+live.length+' cut</div>';
}
function stationTop(who){
 const s=stationRow();
 return '<div class="st-top"><div class="st-code">'+esc(stationCode)+'</div><div class="st-name">'+(s?sfLabel(s):'Unknown station')+'</div><span class="sp"></span>'+
  (who?stationBatchChip()+'<div class="st-chip"><span class="st-av">'+esc(stationInitials(who.name))+'</span><b data-raw>'+esc(who.name)+'</b></div><button type="button" class="st-btn" onclick="stationSwitch()">Switch</button>':'')+
  '<button type="button" class="st-btn st-exit" onclick="stationExit()" title="Back to ERP">ERP</button></div>';
}
function stationLoginView(){
 const users=stationUsers(),pick=(DB.user||[]).find(u=>u.viewProfileId===stationLoginPick);
 const names=users.map(u=>'<button type="button" class="st-name-btn'+(pick===u?' on':'')+'" onclick="stationPickUser(\''+esc(u.viewProfileId)+'\')"><span class="st-av">'+esc(stationInitials(u.name))+'</span><span data-raw>'+esc(u.name)+'</span></button>').join('');
 const pad=pick?'<div class="st-pin"><div class="st-pin-t">PIN · <span data-raw>'+esc(pick.name)+'</span></div><div class="st-dots'+(stationPinError?' bad':'')+'">'+[0,1,2,3].map(i=>'<i class="'+(i<stationPin.length?'f':'')+'"></i>').join('')+'</div>'+
  (stationPinError?'<div class="st-pin-err">Wrong PIN</div>':'')+
  '<div class="st-keys">'+['1','2','3','4','5','6','7','8','9','','0','back'].map(k=>k?'<button type="button" onclick="stationPinKey(\''+k+'\')">'+(k==='back'?'⌫':k)+'</button>':'<span></span>').join('')+'</div></div>':'';
 return '<div class="st-login card"><h2>Who is working?</h2>'+(users.length?'<div class="st-names">'+names+'</div>':'<div class="mut">No users yet — add them in Users.</div>')+pad+'</div>';
}
function viewStation(){
 const s=stationRow();
 if(!s){
  return stationTop(null)+'<div class="st-body st-one"><div class="card"><h2>Choose a station</h2><div class="st-names">'+(DB.station||[]).map(x=>'<button type="button" class="st-name-btn" onclick="location.hash=\'station='+esc(x.code)+'\'"><b>'+esc(x.code)+'</b> '+sfLabel(x)+'</button>').join('')+'</div></div></div>';
 }
 const who=stationWho();
 if(!who)return stationTop(null)+'<div class="st-body st-one">'+stationLoginView()+'</div>';
 setTimeout(stationFocus,0);
 return stationTop(who)+'<div class="st-body"><div class="st-col">'+
  '<label class="st-scan"><span class="st-scan-ico">'+ico('scan')+'</span><span class="st-scan-lab"><b>SCAN BARCODE</b><input data-station-scan autocomplete="off" spellcheck="false" placeholder="Glass sticker or number" onkeydown="stationKey(event,this)"></span><span class="st-ready"><i></i>Ready</span></label>'+
  stationCard()+(stationNote?'<div class="st-note">'+esc(stationNote)+'</div>':'')+stationJournal()+
  '</div><div class="st-col">'+(stationCode===stationCutCode()?stationSheetCard():stationHereCard())+'</div></div>';
}
/* На станциях после резки листа нет — справа стёкла, которые ждут здесь. */
function stationHereCard(){
 const list=stationWaiting().get(stationCode)||[];
 const rows=list.slice(0,30).map(x=>{const snap=x.g.entry&&x.g.entry.part?x.g.entry.part.snapshot:null,urg=stationUrgency(x.g.o);
  return '<tr'+(urg===2?' class="st-hot"':'')+'><td class="mono"><b>'+esc(x.id)+'</b>'+(urg?' <span class="pill '+(urg===2?'bad':'warn')+'">'+(urg===2?'Critical':'Rush')+'</span>':'')+'</td><td>'+esc(x.g.o.businessNumber||'')+'</td><td data-raw>'+esc(snap?snap.glass:x.g.c?x.g.c.glass:'')+'</td><td class="mut">'+esc(x.from||'')+' '+esc(stationTime(x.since))+'</td></tr>';}).join('');
 return '<div class="card"><div class="st-sec"><h3>Waiting here</h3><span class="pill info">'+list.length+'</span></div>'+
  (list.length?'<table><thead><tr><th>Glass</th><th>Order</th><th>Glass type</th><th>From</th></tr></thead><tbody>'+rows+(list.length>30?'<tr><td colspan="4" class="mut">+ '+(list.length-30)+' more</td></tr>':'')+'</tbody></table>':'<div class="empty">Nothing waiting</div>')+'</div>';
}
function stationKey(ev,el){
 if(ev.key!=='Enter'&&!(ev.key==='Tab'&&el.value.trim()))return;
 ev.preventDefault();const v=el.value;el.value='';if(v.trim())stationSubmit(v);
}
function stationFocus(){
 if(tab!=='station'||stationMenu)return;
 const el=document.querySelector('[data-station-scan]');
 if(el&&document.activeElement!==el)el.focus();
}
/* Сканер печатает, даже если фокус ушёл: нажатие вне полей ввода
   отправляется в поле скана. */
document.addEventListener('keydown',function(e){
 if(tab!=='station')return;
 const t=e.target;if(t&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))return;
 if(!stationWho()&&stationLoginPick&&(/^\d$/.test(e.key)||e.key==='Backspace')){stationPinKey(e.key==='Backspace'?'back':e.key);e.preventDefault();return;}
 const el=document.querySelector('[data-station-scan]');if(!el||document.activeElement===el)return;
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 if(e.key.length===1){stationMenu=null;el.focus();el.value+=e.key;e.preventDefault();}
 else if(e.key==='Enter'&&el.value.trim()){e.preventDefault();const v=el.value;el.value='';stationSubmit(v);}
});
document.addEventListener('focusout',function(){if(tab==='station')setTimeout(stationFocus,150);});

/* ---------------------- Офис: где стёкла ждут ----------------------- */
let sfWhereSel='';
function viewSfWhere(){
 const map=stationWaiting(),codes=(DB.station||[]).map(s=>s.code);
 if(!sfWhereSel||!codes.includes(sfWhereSel))sfWhereSel=codes.find(c=>(map.get(c)||[]).length)||codes[0]||'';
 const pipe=(DB.station||[]).map(s=>{const n=(map.get(s.code)||[]).length,hot=(map.get(s.code)||[]).some(x=>stationUrgency(x.g.o)===2);
  return '<button type="button" class="sf-where-st'+(n?'':' zero')+(s.code===sfWhereSel?' sel':'')+'" onclick="sfWhereSel=\''+esc(s.code)+'\';render()" data-where-station="'+esc(s.code)+'"><b>'+esc(s.code)+'</b><span class="n">'+n+'</span><small>'+(s.code===stationCutCode()?'in batches':'waiting')+(hot?' · <em>critical</em>':'')+'</small></button>';}).join('');
 const list=map.get(sfWhereSel)||[],max=200;
 const rows=list.slice(0,max).map(x=>{
  const g=x.g,snap=g.entry&&g.entry.part?g.entry.part.snapshot:null,urg=stationUrgency(g.o);
  const size=snap&&snap.width&&snap.height?frac16(snap.width)+' × '+frac16(snap.height):'';
  return '<tr'+(urg===2?' class="st-hot"':'')+' data-where-row="'+esc(x.id)+'"><td class="mono"><b>'+esc(x.id)+'</b>'+(urg?' <span class="pill '+(urg===2?'bad':'warn')+'">'+(urg===2?'Critical':'Rush')+'</span>':'')+'</td>'+
   '<td>'+esc(g.o.businessNumber||'')+'</td><td data-raw>'+esc(salesCustomerDisplay(g.o.customerId))+'</td>'+
   '<td>'+(snap?esc(snap.line+' · '+x.g.unit+'/'+snap.of):'')+'</td><td>'+esc(snap?snap.lite:g.c?g.c.lite:'')+'</td><td data-raw>'+esc(snap?snap.glass:g.c?g.c.glass:'')+'</td><td>'+esc(size)+'</td>'+
   '<td>'+esc(x.from||'—')+'</td><td class="mut">'+esc(x.since?salesShortDate(x.since)+' '+stationTime(x.since):'')+'</td><td class="mono">'+esc(g.entry?g.entry.batch.number:'stock')+'</td></tr>';
 }).join('');
 return '<div class="sub">Each scan moves the glass to the next station of its route.</div>'+
  '<div class="sf-where">'+pipe+'</div>'+
  '<div class="section-title" style="margin-top:14px"><h3>Waiting at '+esc(sfWhereSel)+'</h3><span class="pill info">'+list.length+'</span><span class="sp"></span><button class="sm" onclick="stationOpen(\''+esc(sfWhereSel)+'\')">Open '+esc(sfWhereSel)+' screen</button></div>'+
  (list.length?'<table><thead><tr><th>Glass</th><th>Order</th><th>Customer</th><th>Line</th><th>Lite</th><th>Glass type</th><th>Size</th><th>From</th><th>Since</th><th>Batch</th></tr></thead><tbody>'+rows+
   (list.length>max?'<tr><td colspan="10" class="mut">+ '+(list.length-max)+' more</td></tr>':'')+'</tbody></table>':'<div class="empty">No glass here</div>');
}
