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
let stationTab='scan';      // CUT: scan | queue
let stationIncoming='';    // долли, которая привезла стекло на эту станцию: её стопка справа
let stationDrawer=null;    // окно по нажатию рабочего: {kind:'recut',piece} | {kind:'sheet',batch,glass,no}
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
function stationExit(){stationCode='';tab='production';subtab='orders';history.replaceState(null,'',location.href.split('#')[0]);render();}
function stationRow(){return (DB.station||[]).find(s=>s.code===stationCode)||null;}
function stationName(code){const s=(DB.station||[]).find(x=>x.code===code);return s?sfName(s):code;}

/* --------------------------- Кто работает --------------------------- */
function stationSession(){try{const s=JSON.parse(localStorage.getItem(STATION_SESSION_KEY)||'null');return s&&typeof s==='object'?s:null;}catch(e){return null;}}
function stationWho(){
 const s=stationSession();if(!s||s.station!==stationCode)return null;
 const u=(DB.user||[]).find(x=>x.viewProfileId===s.userId);
 return u?{id:u.viewProfileId,name:u.name}:null;
}
/* На какую тару рабочий сейчас кладёт стекло — свойство рабочего места, как
   и вход: живёт в сессии этого браузера. */
function stationPutOn(){const s=stationSession();return s&&s.station===stationCode&&s.putOn&&typeof carrierFind==='function'&&carrierFind(s.putOn)?s.putOn:'';}
function stationSetPutOn(code){const s=stationSession();if(!s)return;s.putOn=code||'';try{localStorage.setItem(STATION_SESSION_KEY,JSON.stringify(s));}catch(e){}}
function stationClearPutOn(){stationSetPutOn('');stationNote='Not putting on a dolly';render();}
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
function stationSwitch(){try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationIncoming='';stationLast=null;stationNote='';stationMenu=null;stationDrawer=null;stationTab='scan';render();}
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
 /* Скан не ждёт окна: следующий стикер закрывает открытое окно. */
 stationDrawer=null;stationTab='scan';
 if(check.kind==='carrier'){stationCarrierScan(check.code);render();return 'carrier';}
 const rec=STATION_RECORDED.includes(check.kind)?stationRecord(stationCode,check,who,{manual:/^\d+$/.test(String(raw).trim()),on:stationPutOn()}):null;
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
function stationBrokenSet(){const s=new Set();(DB.stationScan||[]).forEach(x=>{if(x.broken&&!x.undoneAt)s.add(x.piece);});return s;}
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
 const broken=stationBrokenSet();
 const out=['<svg class="st-sheet-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" onclick="stationSheetClick(event)">',
  '<rect class="st-sheet-bg" x="0" y="0" width="'+W+'" height="'+H+'"/>'];
 (sheet.stock||[]).forEach(o=>{out.push('<rect class="st-stock" x="'+o.x+'" y="'+fy(o.y,o.h)+'" width="'+o.w+'" height="'+o.h+'"/>');
  if(o.w>f*6&&o.h>f*2)out.push('<text class="st-stock-t" x="'+(o.x+o.w/2)+'" y="'+(fy(o.y,o.h)+o.h/2+f*.35)+'" font-size="'+(f*.8)+'" text-anchor="middle">'+esc(o.id)+'</text>');});
 (sheet.pieces||[]).forEach(p=>{
  const st=broken.has(p.piece)?'broken':p.piece===nowId?'now':cut.has(p.piece)?'cut':'wait',y=fy(p.y,p.h),fs=Math.max(1.6,Math.min(f*1.2,p.w/6,p.h/3));
  out.push('<g class="st-pc '+st+'" data-station-piece="'+esc(p.piece)+'"><rect x="'+(p.x+.3)+'" y="'+(y+.3)+'" width="'+Math.max(0,p.w-.6)+'" height="'+Math.max(0,p.h-.6)+'" rx=".6"/>');
  out.push('<text x="'+(p.x+p.w/2)+'" y="'+(y+p.h/2)+'" font-size="'+fs+'" text-anchor="middle" class="st-pc-n">'+esc(stationPieceLabel(p.piece))+'</text>');
  if(p.h>fs*2.6)out.push('<text x="'+(p.x+p.w/2)+'" y="'+(y+p.h/2+fs*1.1)+'" font-size="'+(fs*.72)+'" text-anchor="middle" class="st-pc-s">'+esc(frac16(p.w)+' × '+frac16(p.h))+'</text>');
  if(st==='broken'&&p.w>fs*3&&p.h>fs*2)out.push('<text x="'+(p.x+p.w-fs*.5)+'" y="'+(y+fs*1.1)+'" font-size="'+fs+'" text-anchor="end" class="st-pc-x">✕</text>');
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
 const rec=STATION_RECORDED.includes(check.kind)?stationRecord(stationCode,check,who,{manual:true,on:stationPutOn()}):null;
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
 const breaks=(DB.sheetBreak||[]).filter(x=>x.batch===v.batch&&x.glass===group.glass&&x.sheet===sheet.no).length;
 return '<div class="card st-sheet-card"><div class="st-sec"><h3>Sheet '+sheet.no+' of '+group.sheets.length+'</h3><span class="pill" data-raw>'+esc(group.glass)+' · '+esc(frac16(size.w)+' × '+frac16(size.h))+'</span>'+(breaks?'<span class="pill bad" data-sheet-breaks>broke '+breaks+'×</span>':'')+'<span class="sp"></span><span class="pill '+(n===sheet.pieces.length?'ok':'')+'">'+n+' / '+sheet.pieces.length+' cut</span><button type="button" class="b sm st-sheetbrk" onclick="stationOpenSheetBreak()">Sheet broke</button></div>'+
  stationSheetSVG(sheet,cut,nowId)+'<div class="st-tiles">'+tiles+'</div>'+menu+'</div>';
}
function stationMenuHTML(){
 const m=stationMenu,cut=stationCutSet().has(m.piece),x=Math.max(8,m.x-90),y=m.y+12;
 return '<div class="st-menu" style="left:'+x+'px;top:'+y+'px"><div class="st-menu-h mono">'+esc(m.piece)+'</div>'+
  (cut?'':'<button type="button" onclick="stationMark(\''+esc(m.piece)+'\')">✓ Mark cut</button>')+
  (stationBrokenSet().has(m.piece)?'':'<button type="button" class="st-menu-red" onclick="stationOpenRecut(\''+esc(m.piece)+'\')">✕ Broken — recut</button>')+
  '<button type="button" onclick="stationPrintSticker(\''+esc(m.piece)+'\')">Reprint sticker</button>'+
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
 if(/^carrier/.test(L.check.kind))return stationCarrierCard(L);
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
  broken:{cls:'st-red',head:'✕ Broken · '+(place&&place.broken?'Recut '+esc(String(place.broken.recut).replace(/^R/,''))+' · '+esc(place.broken.reason||''):'')},
  recut:{cls:'st-red',head:'✕ Broken · Recut '+esc(String(c.ref||'').replace(/^R/,''))+' created'},
  peek:{cls:'st-info',head:'Details'}
 }[c.kind]||{cls:'st-red',head:c.kind};
 if(c.kind==='ok'&&urg===2)K.cls='st-red';
 /* Большой блок слева — главное действие рабочего. */
 let big;
 if(c.kind==='hold')big='<div class="st-big st-red"><small>ON HOLD</small><b>SET ASIDE</b><span>'+esc(c.reason||'Order on hold')+'</span></div>';
 else if(['passed','skipped','route'].includes(c.kind))big='<div class="st-big st-red"><small>WAITING AT</small><b>'+esc(place&&place.waiting||'—')+'</b><span>'+(place&&place.waiting?'Take it to '+esc(place.waiting):'Shipped')+'</span></div>';
 else if(c.kind==='cancelled')big='<div class="st-big st-red"><small>ORDER</small><b>STOP</b><span>Cancelled — set aside</span></div>';
 else if(c.kind==='unit')big='<div class="st-big st-red"><small>UNIT</small><b>'+esc(c.code)+'</b><span>Scan the glass sticker</span></div>';
 else if(c.kind==='recut')big='<div class="st-big st-red"><small>NEW GLASS</small><b class="st-big-code">'+esc((c.newIds||[]).join(', ')||'—')+'</b><span>Waits for the next batch</span></div>';
 else if(c.kind==='broken')big='<div class="st-big st-red"><small>BROKEN</small><b>RECUT</b><span>Glass left the route</span></div>';
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
  (L.rec&&L.rec.on?'<span class="k">On</span><span><b class="st-on">'+esc(L.rec.on)+'</b></span>':'')+
  '</div>'+stationRouteChips(place&&place.route,place)+
  (d&&d.route&&d.route.services&&d.route.services.length?'<div class="st-svc">'+d.route.services.map(s=>'<span>'+esc(s.text)+'</span>').join('')+'</div>':''):'<div class="st-gid mono">'+esc(c.code)+'</div>';
 /* Действия по нажатию рабочего: Undo своего скана, Recut разбитого,
    стикер (не читается или стекло режут из остатка). */
 const canRecut=g&&!['broken','recut','cancelled','unit','unknown'].includes(c.kind)&&typeof recutCanOpen==='function'&&recutCanOpen(g.o);
 const stickerFor=c.kind==='recut'?(c.newIds||[])[0]:g?c.code:'';
 const acts=(L.rec||canRecut||stickerFor)?'<div class="st-acts">'+(L.rec?'<button type="button" class="b" onclick="stationUndoClick(\''+esc(L.rec.id)+'\')">Undo</button>':'')+
  (L.rec&&L.rec.on?'<button type="button" class="b" data-station-off onclick="stationScanOffClick(\''+esc(L.rec.id)+'\')">Not on '+esc(L.rec.on)+'</button>':'')+
  (canRecut?'<button type="button" class="b st-red-b" data-station-recut onclick="stationOpenRecut(\''+esc(c.code)+'\')">Recut</button>':'')+
  (stickerFor?'<button type="button" class="b" data-station-sticker onclick="stationPrintSticker(\''+esc(stickerFor)+'\')">'+(c.kind==='recut'?'Print new sticker':'Sticker')+'</button>':'')+'</div>':'';
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
   '<td class="st-to">'+(s.broken?'<span class="st-brk">✕ Recut '+esc(String(s.recut).replace(/^R/,''))+'</span>':place&&place.waiting?'→ '+esc(place.waiting):place&&place.shipped?'✓':'')+'</td><td>'+(s.on?'<b class="st-on">'+esc(s.on)+'</b>':'<span class="mut">—</span>')+'</td><td class="mut" data-raw>'+esc(s.by)+'</td>'+
   '<td style="text-align:right">'+(!s.broken&&lastOf.get(s.piece)===s?'<button type="button" class="b sm" onclick="stationUndoClick(\''+esc(s.id)+'\')">Undo</button>':'')+'</td></tr>';
 }).join('');
 return '<div class="card st-journal"><div class="st-sec"><h3>Last scans</h3></div><table><thead><tr><th>Time</th><th>Glass</th><th>Order</th><th>Line</th><th>Next</th><th>On</th><th>By</th><th></th></tr></thead><tbody>'+body+'</tbody></table></div>';
}

/* ------------------------------ Экран -------------------------------- */
function stationBatchChip(){
 const b=stationCode===stationCutCode()&&stationSheetView?glassBatchFind(stationSheetView.batch):null;if(!b)return '';
 const live=b.items.filter(i=>!i.releasedAt),cut=live.filter(i=>i.cutStartedAt).length;
 return '<div class="st-chip">Batch <b class="mono">'+esc(b.number)+'</b> · <b>'+cut+'</b> / '+live.length+' cut</div>';
}
function stationTop(who){
 const s=stationRow();
 const tabs=who&&stationCode===stationCutCode()?'<div class="st-tabs"><button type="button" class="'+(stationTab==='scan'?'on':'')+'" onclick="stationTab=\'scan\';stationMenu=null;render()">Scan</button><button type="button" class="'+(stationTab==='queue'?'on':'')+'" data-station-tab="queue" onclick="stationTab=\'queue\';stationMenu=null;render()">Queue</button></div>'+
  (stationTab==='queue'?'<label class="st-topscan">'+ico('scan')+'<input data-station-scan autocomplete="off" spellcheck="false" placeholder="Scan barcode…" onkeydown="stationKey(event,this)"></label>':''):'';
 return '<div class="st-top"><div class="st-code">'+esc(stationCode)+'</div><div class="st-name">'+(s?sfLabel(s):'Unknown station')+'</div>'+tabs+'<span class="sp"></span>'+
  (who&&stationPutOn()?'<div class="st-chip st-puton" data-station-puton>Putting on <b>'+esc(stationPutOn())+'</b><button type="button" title="Stop putting on this dolly" onclick="stationClearPutOn()">✕</button></div>':'')+
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
 const drawer=stationDrawer?(stationDrawer.kind==='recut'?stationRecutHTML():stationSheetBreakHTML()):'';
 if(stationTab==='queue'&&stationCode===stationCutCode())return stationTop(who)+stationQueueView()+drawer;
 return stationTop(who)+'<div class="st-body"><div class="st-col">'+
  '<label class="st-scan"><span class="st-scan-ico">'+ico('scan')+'</span><span class="st-scan-lab"><b>SCAN BARCODE</b><input data-station-scan autocomplete="off" spellcheck="false" placeholder="Glass sticker or number" onkeydown="stationKey(event,this)"></span><span class="st-ready"><i></i>Ready</span></label>'+
  stationCard()+(stationNote?'<div class="st-note">'+esc(stationNote)+'</div>':'')+stationJournal()+
  '</div><div class="st-col">'+(stationCode===stationCutCode()?stationSheetCard()+stationCarriersCard():stationStackCard()+stationCarriersCard()+stationHereCard())+'</div></div>'+drawer;
}
/* На станциях после резки листа нет — справа то, что ждёт здесь: заказ →
   позиция → стекло и сколько штук. Номера стёкол человеку ничего не говорят
   (владелец, 29.09.2026) — их читает сканер. */
function stationHereCard(){
 const list=stationWaiting().get(stationCode)||[],groups=new Map();
 list.forEach(x=>{const g=x.g,k=g.o.id+'|'+g.l.id+'|'+(g.c?g.c.key:'');
  if(!groups.has(k))groups.set(k,{g,n:0,li:(g.o.lines||[]).indexOf(g.l)+1});groups.get(k).n++;});
 const rows=[...groups.values()].sort((a,b)=>stationUrgency(b.g.o)-stationUrgency(a.g.o)||String(a.g.o.dueDate||'9').localeCompare(String(b.g.o.dueDate||'9'))||String(a.g.o.businessNumber).localeCompare(String(b.g.o.businessNumber))||a.li-b.li).slice(0,40).map(x=>{
  const o=x.g.o,l=x.g.l,urg=stationUrgency(o);
  return '<tr'+(urg===2?' class="st-hot"':'')+'><td><b>'+esc(o.businessNumber||'')+'</b>'+(urg?' <span class="pill '+(urg===2?'bad':'warn')+'">'+(urg===2?'Critical':'Rush')+'</span>':'')+'</td><td>Line '+x.li+' · <b>'+esc(frac16(l.width16/16)+' × '+frac16(l.height16/16))+'</b></td><td data-raw>'+esc(x.g.c?x.g.c.glass:'')+'</td><td class="n"><b>'+x.n+'</b></td><td class="mut">'+esc(o.dueDate?salesListShortDay(o.dueDate):'')+'</td></tr>';}).join('');
 return '<div class="card"><div class="st-sec"><h3>Waiting here</h3><span class="pill info">'+list.length+' glass</span></div>'+
  (list.length?'<table><thead><tr><th>Order</th><th>Line</th><th>Glass</th><th class="n">Pcs</th><th>Due</th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class="empty">Nothing waiting</div>')+'</div>';
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

/* ------------------------- Recut со станции ------------------------- */
/* Окно открывает сам рабочий: разбилось стекло. Причины — справочник NCR:
   свои для станции и общие. Одно нажатие — Recut в заказе, новое стекло в
   очереди Optimization, разбитое выходит из маршрута (erp/shopfloor/scan). */
function stationOpenRecut(piece){stationMenu=null;stationDrawer={kind:'recut',piece};render();}
function stationCloseDrawer(){stationDrawer=null;render();}
function stationRecutCreate(reasonId){
 const who=stationWho(),d=stationDrawer;if(!who||!d||d.kind!=='recut')return false;
 const check=stationCheck(stationCode,d.piece);
 const r=stationBreak(stationCode,check,who,reasonId);
 if(r.error){d.error=r.error;stationBeep('error');render();return false;}
 stationDrawer=null;stationMenu=null;
 let data=null;try{data=stkGlassData('production',check.g.o,check.g.l,check.g.c,check.g.unit,{batch:check.g.entry?check.g.entry.batch.number:''});}catch(e){}
 stationLast={check:Object.assign({},check,{kind:'recut',ref:r.ref,newIds:r.newIds}),rec:null,data,place:stationPlace(check.g),at:new Date().toISOString()};
 stationNote='';stationBeep('error');render();return r;
}
function stationRecutHTML(){
 const d=stationDrawer,check=stationCheck(stationCode,d.piece),g=check&&check.g;
 const all=typeof ncrReasonsFor==='function'?ncrReasonsFor(stationCode,{activeOnly:true}):[];
 const own=all.filter(r=>r.where===stationCode),common=all.filter(r=>r.where!==stationCode);
 const btn=r=>'<button type="button" class="st-reason" data-recut-reason="'+esc(r.id)+'" onclick="stationRecutCreate(\''+esc(r.id)+'\')">'+raw(r.name)+'</button>';
 const line=g?(g.o.lines||[]).indexOf(g.l)+1:0;
 return '<div class="st-dim" onclick="stationCloseDrawer()"></div><div class="st-drawer" role="dialog" aria-label="Recut">'+
  '<h2><span class="st-flag">RECUT</span><span class="mono">'+esc(d.piece)+'</span></h2>'+
  (g?'<div class="st-dinfo"><span class="k">Order</span><span><b>'+esc(g.o.businessNumber||'')+'</b> · <span data-raw>'+esc(salesCustomerDisplay(g.o.customerId))+'</span></span><span class="k">Line</span><span>Line '+line+' · <b>'+esc(frac16(g.l.width16/16)+' × '+frac16(g.l.height16/16))+'</b></span><span class="k">Glass</span><span><b data-raw>'+esc(g.c?g.c.glass:'')+'</b></span></div>':'')+
  (own.length?'<div class="st-rgroup">'+esc(stationCode)+'</div><div class="st-reasons">'+own.map(btn).join('')+'</div>':'')+
  '<div class="st-rgroup">Any station</div><div class="st-reasons">'+common.map(btn).join('')+'</div>'+
  (d.error?'<div class="st-pin-err">'+esc(d.error)+'</div>':'')+
  '<div class="st-drawer-foot"><span class="mut">New glass → next batch</span><button type="button" class="b" onclick="stationCloseDrawer()">Cancel</button></div></div>';
}
/* Стикер одного стекла — тем же шаблоном Production, что из батча. */
function stationPrintSticker(id){
 stationMenu=null;
 const g=stationGlass(id);if(!g||!g.c||typeof stkPrint!=='function'){stationNote='No sticker for '+id;render();return false;}
 return stkPrint(stkPages([{type:'production',o:g.o,l:g.l,c:g.c,unit:g.unit}],stkPrefSize()));
}

/* ---------------------------- Sheet broke ---------------------------- */
function stationOpenSheetBreak(){const v=stationSheetView;if(!v)return;stationMenu=null;stationDrawer={kind:'sheet',batch:v.batch,glass:v.glass,no:v.no};render();}
function stationSheetBreakSave(){
 const d=stationDrawer,who=stationWho();if(!d||d.kind!=='sheet'||!who)return false;
 const r=stationSheetBreak(d.batch,d.glass,d.no,who);
 stationDrawer=null;stationNote=r.error||'Sheet '+d.no+' broke — cut it again on a new sheet';stationBeep(r.error?'error':'twice');render();return !r.error;
}
function stationSheetBreakHTML(){
 const d=stationDrawer;
 return '<div class="st-dim" onclick="stationCloseDrawer()"></div><div class="st-drawer st-drawer-sm" role="dialog" aria-label="Sheet broke">'+
  '<h2>Sheet '+d.no+' broke</h2><p class="st-dtext">Cut the same layout again on a new sheet. Stickers stay the same.</p>'+
  '<div class="st-drawer-foot"><button type="button" class="b st-red-b" data-sheet-break-save onclick="stationSheetBreakSave()">Record broken sheet</button><button type="button" class="b" onclick="stationCloseDrawer()">Cancel</button></div></div>';
}

/* ------------------------------- Queue ------------------------------- */
/* Что резать дальше и какие листы нести к столу. Порядок батчей — офис
   (Optimization → Batches ▲▼); лист закрыт — когда всё его стекло
   порезано. */
function stationQueueData(){
 const cut=stationCutSet(),bring=new Map(),cards=[];
 glassBatchCutQueue().forEach(b=>{
  const plan=typeof cutPlanFor==='function'?cutPlanFor(b.number):null,live=b.items.filter(i=>!i.releasedAt);
  const orders=[...new Set(live.map(i=>b.parts[i.part].orderId))].map(salesRecord).filter(Boolean);
  const groups=[];
  (plan&&plan.groups||[]).forEach(g=>{
   const bySize=new Map();
   g.sheets.forEach(sh=>{
    const size=sh.size||g.sheet||{},stock=/^S-/.test(String(size.key||'')),label=stock?String(size.key):frac16(size.w)+' × '+frac16(size.h);
    const r=bySize.get(label)||{glass:g.glass,label,stock,total:0,done:0};r.total++;if(stationSheetDone(sh,cut))r.done++;bySize.set(label,r);
   });
   bySize.forEach(r=>{groups.push(r);if(r.total>r.done){const k=r.glass+'|'+r.label,x=bring.get(k)||{glass:r.glass,label:r.label,stock:r.stock,n:0,batches:[]};x.n+=r.total-r.done;if(!x.batches.includes(b.number))x.batches.push(b.number);bring.set(k,x);}});
  });
  cards.push({b,live:live.length,left:live.filter(i=>!i.cutStartedAt).length,orders:orders.length,due:orders.map(o=>o.dueDate).filter(Boolean).sort()[0]||'',
   urg:Math.max(0,...orders.map(stationUrgency)),groups,plan:!!plan});
 });
 const recuts=[];
 (DB.recut||[]).forEach(r=>{
  const o=salesRecord(r.orderId);if(!o||['cancelled','closed'].includes(o.status))return;
  const active=glassBatchActive(r.orderId),l=(o.lines||[]).find(x=>x.id===r.lineId);
  const n=recutSlots(r).filter(x=>!active.has(x.key+'|'+x.unit)).length;
  if(n)recuts.push({o,r,l,n});
 });
 return {cards,bring:[...bring.values()],recuts};
}
function stationQueueView(){
 const q=stationQueueData();
 const strip=q.cards.flatMap(c=>c.groups.filter(g=>g.total>g.done).map(g=>({g,b:c.b}))),total=strip.reduce((n,x)=>n+x.g.total-x.g.done,0)||1;
 const colors=['#2f7da8','#7a58b0','#c07a16','#27815a','#4a92b8','#a84444'];
 const stripHTML=strip.length?'<div class="st-qstrip">'+strip.map((x,i)=>'<div style="flex:'+Math.max(1,x.g.total-x.g.done)+';background:'+colors[i%colors.length]+'"><b data-raw>'+esc(x.g.glass)+' '+esc(x.g.label)+'</b><small>'+(x.g.total-x.g.done)+' · '+esc(x.b.number)+'</small></div>').join('')+'</div><div class="mut st-qhint">← now · later →</div>':'<div class="empty">Nothing to cut</div>';
 const cards=q.cards.map((c,i)=>'<div class="st-qcard'+(i===0?' now':'')+'" data-queue-batch="'+esc(c.b.number)+'"><div class="st-qh"><span class="st-qn">'+(i+1)+'</span><b class="mono">'+esc(c.b.number)+'</b>'+
  (c.urg===2?'<span class="pill bad">Critical</span>':c.urg===1?'<span class="pill warn">Rush</span>':'')+'<span class="mut">'+c.left+' of '+c.live+' to cut · '+c.orders+' order'+(c.orders===1?'':'s')+'</span><span class="sp"></span>'+(c.due?'<span class="pill">Due '+esc(salesListShortDay(c.due))+'</span>':'')+'</div>'+
  (c.plan?c.groups.map(g=>'<div class="st-qg"><b data-raw>'+esc(g.glass)+'</b><span>'+(g.stock?'<span class="pill warn">Stock offcut '+esc(g.label)+'</span>':esc(g.label))+'</span><span class="st-qbar"><i style="width:'+Math.round(g.done/g.total*100)+'%"></i></span><span class="n"><b>'+(g.total-g.done)+'</b> of '+g.total+' sheet'+(g.total===1?'':'s')+' left</span></div>').join(''):'<div class="mut st-qg">No cutting plan yet</div>')+'</div>').join('');
 const bring=q.bring.length?'<table><thead><tr><th>Glass</th><th>Sheet</th><th>For</th><th class="n">Sheets</th></tr></thead><tbody>'+q.bring.map(x=>'<tr><td><b data-raw>'+esc(x.glass)+'</b></td><td>'+(x.stock?'<span class="pill warn">'+esc(x.label)+'</span>':esc(x.label))+'</td><td class="mono">'+esc(x.batches.join(', '))+'</td><td class="n st-qbig">'+x.n+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">Nothing to bring</div>';
 let after='';
 const v=stationSheetView,plan=v&&cutPlanFor(v.batch),group=plan&&plan.groups.find(g=>g.glass===v.glass),sheet=group&&group.sheets.find(s=>s.no===v.no);
 if(sheet){const next=stationSheetNext(v.batch,group,sheet);after=next?'Sheet '+next.sheet.no+' · <b data-raw>'+esc(next.group.glass)+'</b> · '+next.sheet.pieces.length+' glass'+(next.group.glass!==group.glass?'<div class="st-qchange">Glass change → <b data-raw>'+esc(next.group.glass)+'</b></div>':''):'Batch '+esc(v.batch)+' — last sheet';}
 const recuts=q.recuts.length?'<table><tbody>'+q.recuts.map(x=>'<tr><td><b>'+esc(x.o.businessNumber||'')+'</b></td><td>Line '+x.r.line+(x.l?' · '+esc(frac16(x.l.width16/16)+' × '+frac16(x.l.height16/16)):'')+'</td><td data-raw>'+esc(x.r.lite)+'</td><td class="mut">'+esc(x.r.where)+' · '+raw(x.r.reason)+'</td><td class="n"><b>'+x.n+'</b></td></tr>').join('')+'</tbody></table>':'';
 return '<div class="st-body st-queue"><div class="st-col"><div class="card"><div class="st-sec"><h3>Sheets in order</h3><span class="mut">what goes on the table next</span></div>'+stripHTML+'</div>'+cards+
  (recuts?'<div class="card"><div class="st-sec"><span class="st-flag">RECUT</span><h3>Waiting for a batch</h3></div>'+recuts+'</div>':'')+'</div>'+
  '<div class="st-col"><div class="card"><div class="st-sec"><h3>Bring to the table</h3></div>'+bring+'</div>'+(after?'<div class="card"><div class="st-sec"><h3>After this sheet</h3></div><div class="st-qafter">'+after+'</div></div>':'')+'</div></div>';
}
document.addEventListener('keydown',function(e){if(tab==='station'&&stationDrawer&&e.key==='Escape'){stationDrawer=null;render();}});

/* ---------------------------- Долли и скиды ---------------------------- */
/* Скан тары. Привезла стекло на эту станцию — это «приехала»: справа её
   стопка сверху вниз (последнее положенное — сверху). Пустая или со стеклом
   для других станций — на неё кладут: дальше каждое стекло ложится на неё,
   пока не отсканируют другую тару. Решает человек, система записывает. */
function stationCarrierScan(code){
 const c=typeof carrierFind==='function'?carrierFind(code):null,now=new Date().toISOString();stationMenu=null;stationNote='';
 if(!c||!c.active){stationLast={check:{kind:'carrierBad',code},rec:null,data:null,place:null,at:now};stationBeep('error');return 'bad';}
 const on=carrierContents().get(c.code)||[],here=on.filter(x=>x.place.waiting===stationCode);
 if(here.length){stationIncoming=c.code;stationLast={check:{kind:'carrierIn',code:c.code,count:here.length},rec:null,data:null,place:null,at:now};stationBeep('info');return 'in';}
 stationSetPutOn(c.code);stationLast={check:{kind:'carrierPut',code:c.code,count:on.length},rec:null,data:null,place:null,at:now};stationBeep('ok');return 'put';
}
function stationCarrierCard(L){
 const c=L.check,t=typeof carrierType==='function'?carrierType(c.code):null,time='<span>'+esc(stationTime(L.at))+'</span>';
 if(c.kind==='carrierBad')return '<div class="st-res st-red" data-station-result="carrierBad"><div class="st-res-h">✕ Unknown dolly or skid'+time+'</div><div class="st-res-b"><div class="st-big st-red"><small>NOT FOUND</small><b class="st-big-code">'+esc(c.code)+'</b><span>Add it in Master Data</span></div><div class="st-info"><div class="st-gid mono">'+esc(c.code)+'</div><div class="mut">Master Data → Dollies &amp; Skids</div></div></div></div>';
 if(c.kind==='carrierIn')return '<div class="st-res st-info" data-station-result="carrierIn"><div class="st-res-h">'+esc(c.code)+' arrived · '+c.count+' glass for '+esc(stationCode)+time+'</div><div class="st-res-b"><div class="st-big st-dark"><small>STACK</small><b>'+esc(c.code)+'</b><span>'+esc(t?t.label:'')+'</span></div><div class="st-info"><div class="st-gid">Scan the glass from the top</div><div class="mut">The stack is on the right, top first</div></div></div></div>';
 return '<div class="st-res st-ok" data-station-result="carrierPut"><div class="st-res-h">Putting on '+esc(c.code)+time+'</div><div class="st-res-b"><div class="st-big st-dark"><small>PUT ON</small><b>'+esc(c.code)+'</b><span>'+esc(t?t.label:'')+'</span></div><div class="st-info"><div class="st-gid">Next glass goes on '+esc(c.code)+'</div><div class="mut">'+(c.count?'On it now: '+c.count+' glass':'Empty')+' · another dolly — scan it</div></div></div></div>';
}
function stationScanOffClick(id){if(stationScanOff(id)){stationNote='By hand — not on a dolly';if(stationLast&&stationLast.rec&&stationLast.rec.id===id)delete stationLast.rec.on;}render();}
function stationNextLabel(x){
 const svc=(stationRouteOf(x.g).services||[]).find(s=>s.station===x.place.waiting);
 return x.place.waiting+(svc?' · '+svc.text:'');
}
/* Справа: тара, что привезла стекло сюда (срочная первой, потом кто раньше),
   и тара, которую загрузили здесь. */
function stationCarriersCard(){
 if(typeof carrierContents!=='function'||!(DB.carrier||[]).length)return '';
 const all=carrierContents(),put=stationPutOn(),incoming=[],loaded=[];
 all.forEach((list,code)=>{
  const here=list.filter(x=>x.place.waiting===stationCode),mine=list.filter(x=>x.scan.station===stationCode);
  if(here.length)incoming.push({code,list:here,urg:Math.max(0,...here.map(x=>stationUrgency(x.g.o))),since:here.map(x=>x.scan.at).sort()[0]});
  if(mine.length)loaded.push({code,list:mine,since:mine.map(x=>x.scan.at).sort()[0]});
 });
 incoming.sort((a,b)=>b.urg-a.urg||String(a.since).localeCompare(String(b.since)));
 loaded.sort((a,b)=>String(a.since).localeCompare(String(b.since)));
 const mix=list=>{const m=new Map();list.forEach(x=>{const k=stationNextLabel(x);m.set(k,(m.get(k)||0)+1);});return [...m].map(([k,n])=>esc(k)+' '+n).join(' · ');};
 const row=(x,click)=>'<div class="st-dl'+(x.code===put?' now':'')+(x.urg===2?' hot':'')+'"'+(click?' onclick="stationIncoming=\''+esc(x.code)+'\';render()" data-station-incoming="'+esc(x.code)+'"':' data-station-loaded="'+esc(x.code)+'"')+'><span class="st-dchip'+(/^S/.test(x.code)?' skid':'')+'">'+esc(x.code)+'</span><span><b>'+x.list.length+' glass</b>'+(x.urg===2?' <span class="pill bad">Critical</span>':'')+' <span class="mut">'+mix(x.list)+'</span></span><span class="mut">'+esc(stationTime(x.since))+'</span></div>';
 const inc=incoming.length?'<div class="st-sec"><h3>Dollies waiting</h3><span class="mut">urgent first, then oldest</span></div>'+incoming.map(x=>row(x,true)).join(''):'';
 const out=loaded.length?'<div class="st-sec"'+(inc?' style="margin-top:14px"':'')+'><h3>Dollies at '+esc(stationCode)+'</h3><span class="sp"></span><span class="mut">another dolly: scan it</span></div>'+loaded.map(x=>row(x,false)).join(''):'';
 return inc||out?'<div class="card">'+inc+out+'</div>':'';
}
function stationStackCard(){
 if(!stationIncoming||typeof carrierContents!=='function')return '';
 const list=(carrierContents().get(stationIncoming)||[]).filter(x=>x.place.waiting===stationCode);
 if(!list.length)return '<div class="card"><div class="st-sec"><h3>'+esc(stationIncoming)+'</h3><span class="pill ok">done</span></div><div class="mut">Nothing left for '+esc(stationCode)+' on it</div></div>';
 return '<div class="card" data-station-stack="'+esc(stationIncoming)+'"><div class="st-sec"><h3>'+esc(stationIncoming)+' · top of the stack first</h3><span class="sp"></span><span class="pill info">'+list.length+'</span></div><table><tbody>'+
  list.map((x,i)=>{const o=x.g.o,l=x.g.l,urg=stationUrgency(o);
   return '<tr class="'+(i===0?'st-top1':'')+(urg===2?' st-hot':'')+'"><td class="mut">'+(i+1)+'</td><td><b>'+esc(o.businessNumber||'')+'</b>'+(urg?' <span class="pill '+(urg===2?'bad':'warn')+'">'+(urg===2?'Critical':'Rush')+'</span>':'')+'</td><td>Line '+((o.lines||[]).indexOf(l)+1)+' · <b>'+esc(frac16(l.width16/16)+' × '+frac16(l.height16/16))+'</b></td><td data-raw>'+esc(x.g.c?x.g.c.glass:'')+'</td><td class="mut">'+(i===0?'on top':'')+'</td></tr>';}).join('')+'</tbody></table></div>';
}
