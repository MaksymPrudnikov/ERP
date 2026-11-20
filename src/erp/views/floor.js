/* =====================================================================
   view/floor  ·  floor-1.0
   Production → Floor: план цеха сверху (свой SVG, без библиотек) и
   редактор плана — для того, у кого галочка Master Data.
   IN : DB.floorItem, DB.station (erp/production/floor) · floorLive,
        floorCard (erp/production/floor-state) · accessCan
   OUT: html; запись — только floorPlanSave → floorWrite, одна команда
   Владелец, 19–20.11.2026 (docs/ЗАДАЧА_КАРТА_ЦЕХА.md, A1; макет v6):
   - карта слева, панель справа; управление внутри карты, своего заголовка
     нет («много одной и той же информации»);
   - Edit: перетаскивание с шагом 0.1 м и прилипанием к краям соседей
     (0.5 м, пунктирная направляющая), стрелки 0.1 / Shift 1 м, размеры на
     чертеже, выбор нескольких (Shift+клик, рамка), Undo / Redo черновика
     до Save, Esc — снять выбор, F — Fit;
   - наложение или выход станка за зал — жёлтая полоса, Save не блокируется
     («без кирпичей»); зона ожидания за залом — не наложение;
   - черновик живёт до Save / Cancel: фоновая перерисовка после
     синхронизации его не сбрасывает (STORAGE_UNSAVED).
   A2 (erp/production/floor-state): в просмотре — Working / Waiting / Idle
   по порогу станции, станки по отдельности, подпись станции над её верхним
   станком (не прыгает от выбора), тара значками в зоне станции, которую ждёт
   её стекло (номера — в подсказке и карточке), сводка-фильтр, карточка
   станции за период, Show on floor (Dollies & Skids, карточка).
   ===================================================================== */
let floorEdit=null;   // черновик: {items, colors, sel, hist, fut, fresh, error, adding}
let floorCam=null;    // видимая область в метрах {x,y,w,h}; null — весь план
let floorDrag=null;   // жест мыши: move · resize · box · pan · draw
let floorPick='';     // выбранная станция в просмотре
let floorGuides=[];   // направляющие прилипания на время перетаскивания
let floorFilter='';   // сводка: только working или waiting (A2)
let floorFind='';     // Show on floor: код тары, которую ищут
let floorPeriod=(()=>{try{const v=localStorage.getItem('glass_erp_floor_period_v1');return FLOOR_PERIODS.includes(v)?v:'today';}catch(e){return 'today';}})();
(window.STORAGE_UNSAVED=window.STORAGE_UNSAVED||[]).push(()=>!!floorEdit&&(floorEdit.fresh||floorEdit.hist.length>0));

const FLOOR_SNAP=0.5,FLOOR_ADD={machine:[2,6],wall:[10,0.2],object:[2,2]};
function floorCan(){return typeof accessCan!=='function'||accessCan('masterdata');}
function floorItems(){return floorEdit?floorEdit.items:(DB.floorItem||[]);}
function floorHall(items){return (items||floorItems()).find(r=>r.kind==='hall')||null;}
function floorM(n){return (Math.round(n*100)/100).toFixed(2);}
function floorStation(code){return (DB.station||[]).find(s=>s.code===code)||null;}
function floorColor(code){return floorStationColor(code,floorEdit&&floorEdit.colors);}
function floorSel(){return floorEdit?floorEdit.items.filter(r=>floorEdit.sel.includes(r.id)):[];}

/* Границы всего плана (и зон за залом) — для Fit. */
function floorBounds(items){
 const list=(items||floorItems());if(!list.length)return {x:0,y:0,w:40,h:30};
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 list.forEach(r=>{x0=Math.min(x0,r.x);y0=Math.min(y0,r.y);x1=Math.max(x1,r.x+r.w);y1=Math.max(y1,r.y+r.l);});
 const pad=Math.max(3,(x1-x0)*0.06);return {x:x0-pad,y:y0-pad,w:x1-x0+pad*2,h:y1-y0+pad*2};
}
function floorBox(){return floorCam||(floor3d&&!floorEdit?floor3dBounds():floorBounds());}

/* Что налезает: станки и объекты друг на друга и за зал. Зоны и стены — нет. */
function floorOverlaps(items){
 const solid=items.filter(r=>r.kind==='machine'||r.kind==='object'),hall=floorHall(items),out=new Set();
 const hit=(a,b)=>a.x<b.x+b.w-0.001&&b.x<a.x+a.w-0.001&&a.y<b.y+b.l-0.001&&b.y<a.y+a.l-0.001;
 solid.forEach((a,i)=>{
  solid.slice(i+1).forEach(b=>{if(hit(a,b)){out.add(floorName(a));out.add(floorName(b));}});
  if(hall&&(a.x<hall.x-0.001||a.y<hall.y-0.001||a.x+a.w>hall.x+hall.w+0.001||a.y+a.l>hall.y+hall.l+0.001))out.add(floorName(a));
 });
 return [...out];
}
function floorName(r){
 if(r.kind==='hall')return 'Hall';
 if(r.kind==='wall')return 'Wall';
 if(r.station)return r.station+(r.machine?' '+r.machine:'')+(r.kind==='zone'?' · waiting':'');
 return r.label?(r.kind==='object'?r.label:'Block '+r.label):r.kind==='zone'?'Zone':'Block';
}
/* Станции без станка на плане — «Not placed». */
function floorNotPlaced(items){
 const on=new Set(items.filter(r=>r.kind==='machine'&&r.station).map(r=>r.station));
 return (DB.station||[]).filter(s=>!on.has(s.code)).map(s=>s.code);
}

/* --- Рисунок ---------------------------------------------------------- */
function floorRect(r,cls,extra,title){return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.l}" class="${cls}"${extra||''}${title?`><title>${esc(title)}</title></rect>`:'/>'}`;}
function floorClock(iso){if(!iso)return '—';const d=new Date(iso);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
const FLOOR_STATUS={working:'Working',waiting:'Waiting',idle:'Idle'};
/* Состояние блока: станок — свой Working; станция — Working / Waiting / Idle. */
function floorBlockStatus(r,live){
 const s=live&&r.station&&live.st[r.station];if(!s)return '';
 if(r.kind==='machine'&&r.machine&&s.machines[r.machine])return s.machines[r.machine].working?'working':s.waiting?'waiting':'idle';
 return s.status;
}
function floorText(x,y,s,fs,cls,rot){return `<text x="${x}" y="${y}" font-size="${fs}" class="${cls}" text-anchor="middle" dominant-baseline="central"${rot?` transform="rotate(-90 ${x} ${y})"`:''}>${esc(s)}</text>`;}
function floorSvgBody(){
 if(floor3d&&!floorEdit)return floor3dBody();
 const items=floorItems(),b=floorBox(),fs=Math.max(0.35,b.w/48),edit=!!floorEdit,sel=new Set(edit?floorEdit.sel:[]);
 const hall=floorHall(items),parts=[];
 if(hall){
  parts.push(floorRect(hall,'fl-hall'+(sel.has(hall.id)?' sel':''),` data-floor-item="${hall.id}"`));
  for(let x=hall.x+5;x<hall.x+hall.w-0.01;x+=5)parts.push(`<line x1="${x}" y1="${hall.y}" x2="${x}" y2="${hall.y+hall.l}" class="fl-grid"/>`);
  for(let y=hall.y+5;y<hall.y+hall.l-0.01;y+=5)parts.push(`<line x1="${hall.x}" y1="${y}" x2="${hall.x+hall.w}" y2="${y}" class="fl-grid"/>`);
 }
 const order={zone:0,wall:1,object:2,machine:3},live=edit?null:floorLive();
 const rest=items.filter(r=>r.kind!=='hall').sort((a,c)=>order[a.kind]-order[c.kind]);
 const labels=[],findZone=live&&floorFind?((live.carriers.find(c=>c.code===floorFind)||{}).station||''):'';
 rest.forEach(r=>{
  const st=r.station&&r.kind!=='wall'?floorStation(r.station):null,col=r.station?floorColor(r.station):'';
  const status=r.kind==='machine'&&st?floorBlockStatus(r,live):'',s=live&&st?live.st[r.station]:null;
  const cls=['fl-'+r.kind,r.station&&!st?'fl-unknown':'',r.station&&st?'fl-st':'',!r.station&&r.kind==='machine'?'fl-free':'',status?'is-'+status:'',floorFilter&&live&&r.kind!=='zone'&&status!==floorFilter?'dim':'',sel.has(r.id)?'sel':'',!edit&&floorPick&&r.station===floorPick?'pick':'',r.kind==='zone'&&findZone&&r.station===findZone?'blink':''].filter(Boolean).join(' ');
  const title=s&&r.kind!=='zone'?`${r.station}${r.machine?' '+r.machine:''} · ${FLOOR_STATUS[status]||''} · ${s.waiting} waiting · last scan ${floorClock(r.machine&&s.machines[r.machine]?s.machines[r.machine].last:s.last)}`:'';
  parts.push(floorRect(r,cls,` data-floor-item="${r.id}"${col?` style="--fc:var(--${col})"`:''}`,title));
  if(r.kind==='wall')return;
  const name=r.kind==='zone'?(r.station?r.station+' · waiting':'Zone'):r.station&&!st?'Unknown station':r.station?(!edit&&r.machine?r.machine:r.station+(r.machine?' '+r.machine:'')):r.label?(r.kind==='object'?r.label:'#'+r.label):'';
  if(!name)return;
  const rot=r.l>r.w*1.6&&r.w<name.length*fs*0.62,cx=r.x+r.w/2,cy=r.kind==='zone'?r.y+fs*0.8:r.y+r.l/2;
  const room=rot?r.l:r.w,f=r.kind==='zone'?fs*0.85:Math.min(fs,Math.max(fs*0.55,room/(name.length*0.62)));
  labels.push(floorText(cx,cy,name,f,'fl-label'+(r.kind==='zone'?' fl-zl':''),r.kind!=='zone'&&rot));
 });
 parts.push(...labels);
 if(live){parts.push(floorTags(items,live,fs));parts.push(floorTare(items,live,fs));}
 if(edit)parts.push(floorDims(items,fs));
 floorGuides.forEach(g=>parts.push(`<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" class="fl-guide"/>`));
 if(floorDrag&&(floorDrag.mode==='box'||floorDrag.mode==='draw')&&floorDrag.now){const a=floorDrag.at,c=floorDrag.now;parts.push(`<rect x="${Math.min(a.x,c.x)}" y="${Math.min(a.y,c.y)}" width="${Math.abs(c.x-a.x)}" height="${Math.abs(c.y-a.y)}" class="fl-band"/>`);}
 return parts.join('');
}
/* Подпись станции над её станками — у Working, Waiting и выбранной: точка
   состояния и очередь, одна на станцию (у трёх POLISH — одна). Простой —
   без подписи над блоком. Место подписи не зависит от выбора — не прыгает. */
function floorTags(items,live,fs){
 const groups=new Map();
 /* Над верхним станком станции: у ARRIS два блока в разных концах цеха —
    подпись над одним, а не посередине между ними. */
 items.forEach(r=>{if(r.kind!=='machine'||!r.station||!live.st[r.station])return;const g=groups.get(r.station);if(!g||r.y<g.y0||r.y===g.y0&&r.x<g.x0)groups.set(r.station,{x0:r.x,x1:r.x+r.w,y0:r.y});});
 const out=[];
 groups.forEach((g,code)=>{
  const s=live.st[code];if(s.status==='idle'&&floorPick!==code)return;
  if(floorFilter&&s.status!==floorFilter)return;
  const text=code+' · '+(s.waiting?s.waiting+' waiting':FLOOR_STATUS[s.status].toLowerCase()),f=fs*0.9,cx=(g.x0+g.x1)/2,cy=g.y0-f*0.95,w=text.length*f*0.58+f*1.6;
  out.push(`<g class="fl-tag is-${s.status}" data-floor-tag="${esc(code)}"><rect x="${cx-w/2}" y="${cy-f*0.7}" width="${w}" height="${f*1.4}" rx="${f*0.7}"/><circle cx="${cx-w/2+f*0.75}" cy="${cy}" r="${f*0.28}"/>${floorText(cx+f*0.4,cy,text,f,'fl-tagt')}</g>`);
 });
 return out.join('');
}
/* Тара — только значки, без номеров («иначе картинка будет слишком шумной»):
   в зоне станции, которую ждёт её стекло, иначе под первым станком станции.
   Не влезает — последний значок «+N». Номер и что на ней — в подсказке и в
   карточке станции. */
function floorTareLayout(items,live,fs){
 const zones=new Map(),first=new Map(),by=new Map(),out=[],iw=1.3,il=0.9,gap=0.35,top=fs*1.5;
 items.forEach(r=>{if(r.kind==='zone'&&r.station)zones.set(r.station,r);if(r.kind==='machine'&&r.station&&!first.has(r.station))first.set(r.station,r);});
 live.carriers.forEach(c=>{if(!by.has(c.station))by.set(c.station,[]);by.get(c.station).push(c);});
 by.forEach((list,code)=>{
  const z=zones.get(code),b=first.get(code);if(!z&&!b)return;
  const a=z?{x:z.x+gap,y:z.y+top,w:z.w-gap*2,l:z.l-top-gap}:{x:b.x,y:b.y+b.l+gap,w:Math.max(b.w,(iw+gap)*4-gap),l:(il+gap)*2-gap};
  const cols=Math.max(1,Math.floor((a.w+gap)/(iw+gap))),rows=Math.max(1,Math.floor((a.l+gap)/(il+gap))),cap=cols*rows,more=list.length>cap;
  const show=more?list.slice(0,cap-1):list,at=i=>({x:a.x+(i%cols)*(iw+gap),y:a.y+Math.floor(i/cols)*(il+gap)});
  /* Ищем тару, которая не влезла, — её значок встаёт первым. */
  if(more&&floorFind&&list.slice(cap-1).some(c=>c.code===floorFind)){show.pop();show.unshift(list.find(c=>c.code===floorFind));}
  show.forEach((c,i)=>{const p=at(i),split=Object.entries(c.split).sort((x,y)=>y[1]-x[1]).map(([s,n])=>n+' → '+s).join(', ');
   out.push({c,x:p.x,y:p.y,w:iw,l:il,title:c.code+' · '+c.count+' glass · '+split});});
  if(more){const p=at(cap-1);out.push({more:list.length-cap+1,x:p.x,y:p.y,w:iw,l:il});}
 });
 return out;
}
function floorTare(items,live,fs){
 return floorTareLayout(items,live,fs).map(t=>t.more?floorText(t.x+t.w/2,t.y+t.l/2,'+'+t.more,t.l*0.8,'fl-more')
  :`<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.l}" rx="0.12" class="fl-tare${t.c.skid?' skid':''}${floorFind===t.c.code?' find':''}" data-floor-carrier="${esc(t.c.code)}"><title>${esc(t.title)}</title></rect>`).join('');
}
/* Размеры выбранного блока: ширина сверху, длина справа, до стены слева. */
function floorDims(items,fs){
 const s=floorSel();if(s.length!==1||s[0].kind==='hall')return '';
 const r=s[0],g=fs*0.9,out=[],f=fs*0.85;
 out.push(`<line x1="${r.x}" y1="${r.y-g}" x2="${r.x+r.w}" y2="${r.y-g}" class="fl-dim"/>`,floorText(r.x+r.w/2,r.y-g-f*0.8,floorM(r.w)+' m',f,'fl-dimt'));
 out.push(`<line x1="${r.x+r.w+g}" y1="${r.y}" x2="${r.x+r.w+g}" y2="${r.y+r.l}" class="fl-dim"/>`,floorText(r.x+r.w+g+f*0.8,r.y+r.l/2,floorM(r.l)+' m',f,'fl-dimt',true));
 /* Ближайшая стена слева: стена, чья правая грань левее блока и по высоте с ним, иначе край зала. */
 const hall=floorHall(items),cy=r.y+r.l/2;
 let edge=null;items.forEach(w=>{if(w.kind!=='wall'||w===r)return;const e=w.x+w.w;if(e<=r.x+0.001&&w.y<=cy&&w.y+w.l>=cy&&(edge===null||e>edge))edge=e;});
 if(edge===null&&hall&&hall.x<=r.x)edge=hall.x;
 if(edge!==null&&r.x-edge>0.05){out.push(`<line x1="${edge}" y1="${cy}" x2="${r.x}" y2="${cy}" class="fl-dim fl-dash"/>`,floorText((edge+r.x)/2,cy-f*0.8,floorM(r.x-edge)+' m to wall',f,'fl-dimt'));}
 out.push(`<rect x="${r.x+r.w-g*0.35}" y="${r.y+r.l-g*0.35}" width="${g*0.7}" height="${g*0.7}" class="fl-handle" data-floor-handle="${r.id}"/>`);
 return out.join('');
}
function floorSvg(){
 const b=floorBox();
 return `<svg class="fl-svg" data-floor-svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="xMidYMid meet" ${onAct('pointerdown',floorDown,EVENT)} ${onAct('pointermove',floorMove,EVENT)} ${onAct('pointerup',floorUp,EVENT)} ${onAct('pointercancel',floorUp,EVENT)} ${onAct('dblclick',floorDbl,EVENT)}>${floorSvgBody()}</svg>`;
}
/* Во время жеста перерисовывается только SVG: элемент тот же, захват мыши цел. */
function floorRedraw(){
 const svg=document.querySelector('[data-floor-svg]');if(!svg)return render();
 const b=floorBox();svg.setAttribute('viewBox',`${b.x} ${b.y} ${b.w} ${b.h}`);svg.innerHTML=floorSvgBody();
}

/* --- Экран ------------------------------------------------------------ */
function viewProdFloor(){
 const items=floorItems(),can=floorCan();
 if(!items.length&&!floorEdit)return sfScreenPills()+`<div class="fl-empty" data-floor-empty>${can
  ?`<h3>No floor plan yet</h3><p class="mut">Start from the shop sketch, then name each block and fix its size.</p><div class="fl-row"><button type="button" class="pri fl-big" data-floor-sketch ${onAct('click',floorStartSketch)}>Start from sketch</button><button type="button" data-floor-blank ${onAct('click',floorStartBlank)}>Empty hall</button></div>`
  :'<h3>Floor plan is not set up yet</h3>'}</div>`;
 const e=floorEdit,over=e?floorOverlaps(e.items):[];
 const zoom=`<button type="button" aria-label="Zoom out" ${onAct('click',floorZoom,1.25)}>−</button><button type="button" aria-label="Zoom in" ${onAct('click',floorZoom,0.8)}>+</button><button type="button" title="Fit (F)" ${onAct('click',floorFit)}>Fit</button>`;
 const bar=e
  ?`<div class="fl-bar" data-floor-editing><strong>Editing</strong><span class="mut">Meters</span><select data-floor-add aria-label="Add" ${onAct('change',floorAdd,EL_VALUE)}><option value="">Add…</option><option value="machine">Machine</option><option value="wall">Wall</option><option value="object">Object</option><option value="zone">Waiting zone</option></select><span class="fl-sp"></span>${zoom}<button type="button" data-floor-cancel ${onAct('click',floorCancel)}>Cancel</button><button type="button" class="pri" data-floor-save ${onAct('click',floorPlanSave)}>Save</button></div>`
  :`<div class="fl-bar"><div class="fl-seg" role="group" aria-label="View"><button type="button" class="${floor3d?'':'on'}" aria-pressed="${!floor3d}" data-floor-2d ${onAct('click',floor3dToggle,false)}>2D</button><button type="button" class="${floor3d?'on':''}" aria-pressed="${floor3d}" data-floor-3d ${onAct('click',floor3dToggle,true)}>3D</button></div>${can?`<button type="button" data-floor-edit ${onAct('click',floorStartEdit)}>Edit</button>`:''}${floorSummary()}<span class="fl-sp"></span>${floor3d?`<div class="fl-seg" role="group" aria-label="Camera"><button type="button" data-floor-view="top" ${onAct('click',floor3dView,'top')}>Top</button><button type="button" data-floor-view="iso" ${onAct('click',floor3dView,'iso')}>Iso</button></div>`:''}${zoom}</div>`;
 const strips=(e&&e.error?`<div class="fl-strip bad" data-floor-error>${esc(e.error)}</div>`:'')
  +(e&&e.adding==='zone'?'<div class="fl-strip" data-floor-drawing>Drag on the plan to draw the waiting zone</div>':'')
  +(over.length?`<div class="fl-strip warn" data-floor-overlaps>Overlaps ${esc(over.join(' · '))}</div>`:'');
 return sfScreenPills()+`<div class="fl" data-floor><div class="fl-map">${bar}${strips}<div class="fl-canvas" tabindex="0" data-floor-canvas ${onAct('keydown',floorKey,EVENT)}>${floorSvg()}</div><div class="fl-hint mut">${e?'Drag to move · Shift-drag to pan · Shift-click to add':floor3d?'Drag to turn · Shift-drag to pan · Double-click a station to zoom':'Drag to pan · Double-click a station to zoom'}</div></div><aside class="fl-side" data-floor-side>${e?floorInspector():floorFind?floorTareCard(floorFind):floorPick&&floorStation(floorPick)?floorCardHTML(floorPick):floorStationList()}</aside></div>`;
}
/* Сводка — она же фильтр: «● 6 working», «● 4 waiting»; Show all снимает. */
function floorSummary(){
 const live=floorLive(),n=k=>Object.values(live.st).filter(s=>s.status===k).length,d=new Date(live.at);
 const chip=(k,word)=>`<button type="button" class="fl-sumb is-${k}${floorFilter===k?' on':''}" data-floor-filter="${k}" aria-pressed="${floorFilter===k}" ${onAct('click',floorSetFilter,k)}><i></i>${n(k)} ${word}</button>`;
 return `<span class="mut fl-now" data-floor-now>${d.toLocaleDateString('en-US',{weekday:'short'})} ${floorClock(live.at)}</span>${chip('working','working')}${chip('waiting','waiting')}${floorFilter?`<button type="button" class="fl-show-all" ${onAct('click',floorSetFilter,'')}>Show all</button>`:''}`;
}
function floorStationList(){
 const items=floorItems(),missing=new Set(floorNotPlaced(items)),live=floorLive();
 const list=(DB.station||[]).slice().sort((a,b)=>a.code.localeCompare(b.code));
 return `<h3>Stations</h3><div class="fl-stations">${list.map(s=>{const l=live.st[s.code]||{status:'idle',waiting:0};return `<button type="button" class="fl-st-row${floorPick===s.code?' on':''}" data-floor-station="${esc(s.code)}" ${onAct('click',floorPickStation,s.code)}><i class="fl-sw" style="--fc:var(--${floorColor(s.code)})"></i><b>${esc(s.code)}</b><span class="fl-dot is-${l.status}" title="${FLOOR_STATUS[l.status]}"></span><span class="mut">${missing.has(s.code)?'Not placed':FLOOR_STATUS[l.status]+(l.waiting?' · '+l.waiting+' waiting':'')}</span></button>`;}).join('')}</div>`;
}
/* Карточка станции: период, работа в её единицах, брак, станки, тара. */
function floorCardHTML(code){
 const s=floorStation(code),live=floorLive(),l=live.st[code]||{status:'idle',waiting:0,last:'',machines:{}},today=repDay(live.at);
 const c=floorCard(code,floorPeriod,today),one=c.range.days.length===1,num=(v,d)=>chNum(v,d);
 const tile=(label,value,sub,attrs)=>`<div class="fl-tile"${attrs||''}><span>${label}</span><b>${value}</b>${sub?`<small>${sub}</small>`:''}</div>`;
 const tare=live.carriers.filter(x=>x.split[code]).map(x=>({code:x.code,n:x.split[code]}));
 const tiles=[tile('Done',num(c.done,0),'glass',' data-floor-done')].concat(c.measures.slice(1).map(m=>tile(m.label,num(m.value,m.digits))),[tile('People',num(c.people,0))],
  floorPeriod==='today'?[tile('Waiting now',num(l.waiting,0),tare.length?'on '+tare.length+' '+(tare.every(x=>/^S/.test(x.code))?(tare.length===1?'skid':'skids'):(tare.length===1?'dolly':'dollies')):''),tile('Last scan',floorClock(l.last))]:[],
  [tile('Broken here',num(c.broken,0),'',' data-floor-broken'),tile('NCR for this station',num(c.ncr,0),'glass',' data-floor-ncr')]);
 const ops=c.ops.length?`<div class="fl-ops" data-floor-ops>${c.ops.map(o=>`<div><b>${esc(o.name)}</b> <span>${num(o.qty,o.unit==='ft²'?1:0)} ${o.unit}</span>${o.sizes.size?`<small class="mut">${[...o.sizes.entries()].sort((a,b)=>parseFloat(a[0])-parseFloat(b[0])).map(([k,v])=>esc(k)+' '+num(v,0)).join(' · ')}</small>`:''}</div>`).join('')}</div>`:'';
 const ms=c.byMachine.length?`<div class="fl-machines" data-floor-machines><h4>Machines running: ${c.byMachine.filter(m=>m.done).length} of ${c.byMachine.length}</h4>${c.byMachine.map(m=>`<div class="fl-mrow"><span class="fl-dot is-${l.machines[m.code]&&l.machines[m.code].working?'working':'idle'}"></span><b>${esc(m.code)}</b><span class="fl-sp"></span>${m.done?num(m.main,c.main.digits)+' '+esc(c.main.label.replace(/^Works, /,'').toLowerCase()):'—'}</div>`).join('')}${one?'':`<p class="mut small" data-floor-machine-days>${c.machinesDays.map(x=>'Days with '+x.k+': '+x.days).join(' · ')}</p>`}</div>`:'';
 const series=one?c.byHour.map(x=>({k:String(x.hour),v:x.done})):c.byDay.map(x=>({k:x.day.slice(5),v:x.done}));
 const top=Math.max(1,...series.map(x=>x.v));
 const chart=series.length?`<h4>${one?'By hour':'By date'}</h4><div class="fl-bars">${series.map(x=>`<div><b style="height:${Math.round(x.v/top*100)}%" title="${x.v}"></b><span>${esc(x.k)}</span></div>`).join('')}</div>`:'<p class="mut">Nothing scanned here in this period.</p>';
 const table=one?'':`<table class="fl-days" data-floor-days><thead><tr><th>Date</th><th>Done</th><th>${esc(c.main.label)}</th><th>People</th><th>Broken</th><th>NCR</th></tr></thead><tbody>${c.byDay.slice().reverse().map(d=>`<tr><td>${esc(d.day)}</td><td>${num(d.done,0)}</td><td>${num(d.main,c.main.digits)}</td><td>${num(d.people,0)}</td><td>${num(d.broken,0)}</td><td>${num(d.ncr,0)}</td></tr>`).join('')}</tbody></table>`;
 const wait=c.archive==='loading'&&typeof archiveScope!=='undefined'&&archiveScope?`<p class="mut" data-rep-archive-wait>${esc(archiveFactsText(archiveScope))}</p>`:'';
 return `<div class="fl-card" data-floor-card="${esc(code)}"><div class="fl-card-head"><i class="fl-sw" style="--fc:var(--${floorColor(code)})"></i><div><h3>${esc(code)}</h3><span class="mut">${esc(s.nameEn||s.name||'')}</span></div><span class="fl-sp"></span><span class="fl-pill is-${l.status}" data-floor-status>${FLOOR_STATUS[l.status]}</span><button type="button" class="fl-x" aria-label="Close" ${onAct('click',floorPickStation,code)}>×</button></div>
  <div class="fl-periods" role="tablist">${[['today','Today'],['yesterday','Yesterday'],['7','7 days'],['30','30 days']].map(([k,t])=>`<button type="button" role="tab" class="${floorPeriod===k?'on':''}" aria-selected="${floorPeriod===k}" data-floor-period="${k}" ${onAct('click',floorSetPeriod,k)}>${t}</button>`).join('')}</div>
  ${wait}<div class="fl-tiles">${tiles.join('')}</div>${ops}${ms}${chart}${table}
  ${floorPeriod==='today'&&tare.length?`<h4>Dollies here</h4><div class="fl-tare-list" data-floor-tare-list>${tare.map(x=>`<button type="button" class="cw-code sm" ${onAct('click',floorShowCarrier,x.code)}>${esc(x.code)} · ${x.n} glass</button>`).join('')}</div>`:''}
  <div class="fl-row"><button type="button" data-floor-orders ${onAct('click',dashStation,code)}>Orders</button><button type="button" data-floor-screen ${onAct('click',stationOpen,code)}>Open screen ↗</button></div></div>`;
}
/* Найденная тара (Show on floor): где стоит, что ждёт её стекло. */
function floorTareCard(code){
 const c=floorLive().carriers.find(x=>x.code===code),close=`<button type="button" class="fl-x" aria-label="Close" ${onAct('click',floorShowCarrier,'')}>×</button>`;
 if(!c)return `<div class="fl-card" data-floor-find="${esc(code)}"><div class="fl-card-head"><h3>${esc(code)}</h3><span class="fl-sp"></span>${close}</div><p class="mut">Not on the plan — empty or not in the shop.</p></div>`;
 return `<div class="fl-card" data-floor-find="${esc(code)}"><div class="fl-card-head"><h3>${esc(code)}</h3><span class="fl-sp"></span>${close}</div><p class="mut">${c.skid?'Skid':'Dolly'} · ${c.count} glass</p>
  <table class="fl-days"><thead><tr><th>Waiting for</th><th>Glass</th></tr></thead><tbody>${Object.entries(c.split).sort((a,b)=>b[1]-a[1]).map(([s,n])=>`<tr><td>${esc(s)}</td><td>${n}</td></tr>`).join('')}</tbody></table>
  <div class="fl-row"><button type="button" data-floor-tare-open ${onAct('click',carrierWinOpen,code)}>What is on it</button></div></div>`;
}
function floorSetFilter(k){floorFilter=floorFilter===k?'':k;render();}
function floorSetPeriod(k){floorPeriod=FLOOR_PERIODS.includes(k)?k:'today';try{localStorage.setItem('glass_erp_floor_period_v1',floorPeriod);}catch(e){}render();}
/* Show on floor (Dollies & Skids, карточка станции): Floor с одной подсвеченной тарой. */
function floorShowCarrier(code){
 if(typeof carrierWin!=='undefined')carrierWin=null;
 if(tab!=='production'){navGo('production');}
 subtab='floor';floorEdit=null;floorFind=code||'';if(code)floorPick='';render();
}
/* Станция стоит на плане — из Overview клик ведёт сюда. */
function floorStationPlaced(code){return (DB.floorItem||[]).some(r=>r.kind==='machine'&&r.station===code);}
function floorOpenStation(code){if(tab!=='production')navGo('production');subtab='floor';floorEdit=null;floorFind='';floorPick=code;render();}
function floorInspector(){
 const e=floorEdit,s=floorSel(),items=e.items,np=floorNotPlaced(items),hall=floorHall(items);
 const foot=`<div class="fl-foot">${hall?`<button type="button" data-floor-hall ${onAct('click',floorSelectHall)}>Hall ${floorM(hall.w).replace(/\.00$/,'')} × ${floorM(hall.l).replace(/\.00$/,'')} m</button>`:''}<span class="fl-sp"></span><button type="button" data-floor-undo ${e.hist.length?'':'disabled'} ${onAct('click',floorUndo)}>Undo</button><button type="button" data-floor-redo ${e.fut.length?'':'disabled'} ${onAct('click',floorRedo)}>Redo</button></div>${np.length?`<p class="mut small" data-floor-notplaced>Not placed · ${esc(np.join(', '))}</p>`:''}`;
 if(!s.length)return `<h3>Inspector</h3><p class="mut">Click a block to edit it. Shift-click or drag a box to select several.</p>${foot}`;
 if(s.length>1)return `<h3>Inspector</h3><p data-floor-many>${s.length} selected</p><div class="fl-row"><button type="button" ${onAct('click',floorDuplicate)}>Duplicate</button><button type="button" class="dl" ${onAct('click',floorDelete)}>Delete</button></div>${foot}`;
 const r=s[0],kind={hall:'Hall',machine:'Machine',wall:'Wall',object:'Object',zone:'Waiting zone'}[r.kind];
 const num=(k,label,dis)=>`<label class="fl-f"><span>${label}</span><input id="fl_${k}" data-floor-field="${k}" value="${floorM(r[k])}" ${dis?'disabled':''} ${onAct('change',floorField,k,EL_VALUE)}></label>`;
 const zoneOf=new Set(items.filter(x=>x.kind==='zone'&&x.id!==r.id&&x.station).map(x=>x.station));
 const codes=(DB.station||[]).map(x=>x.code).filter(c=>r.kind!=='zone'||!zoneOf.has(c)||c===r.station);
 const station=r.kind==='machine'||r.kind==='zone'||r.kind==='object'?`<label class="fl-f wide"><span>Station</span><select id="fl_station" data-floor-field="station" ${onAct('change',floorField,'station',EL_VALUE)}><option value="">—</option>${codes.map(c=>`<option${c===r.station?' selected':''}>${esc(c)}</option>`).join('')}${r.station&&!codes.includes(r.station)?`<option selected>${esc(r.station)}</option>`:''}</select></label>`:'';
 const st=r.station&&floorStation(r.station),cur=st?floorColor(r.station):'';
 const ms=r.kind==='machine'&&st&&Array.isArray(st.machines)?st.machines:[];
 const machine=ms.length?`<label class="fl-f wide"><span>Machine</span><select id="fl_machine" data-floor-field="machine" ${onAct('change',floorField,'machine',EL_VALUE)}><option value="">—</option>${ms.map(m=>`<option${m===r.machine?' selected':''}>${esc(m)}</option>`).join('')}</select></label>`:'';
 const palette=st?`<div class="fl-pal-cap mut small">Station color · all blocks for ${esc(r.station)}</div><div class="fl-pal" role="group" aria-label="Station color">${FLOOR_COLORS.map(c=>`<button type="button" class="fl-pc${c===cur?' on':''}" style="--fc:var(--${c})" aria-label="${c}" aria-pressed="${c===cur}" data-floor-color="${c}" ${onAct('click',floorSetColor,r.station,c)}></button>`).join('')}</div>`:'';
 const acts=r.kind==='hall'?'':`<div class="fl-row">${r.kind==='zone'?'':`<button type="button" title="Rotate 90°" data-floor-rotate ${onAct('click',floorRotate)}>Rotate 90°</button><button type="button" data-floor-dup ${onAct('click',floorDuplicate)}>Duplicate</button>`}<button type="button" class="dl" data-floor-delete ${onAct('click',floorDelete)}>Delete</button></div>`;
 return `<h3>Inspector</h3><p class="mut" data-floor-kind>${kind}${r.station?' · '+esc(r.station):''}</p>${acts}<div class="fl-grid2">${station}${machine}${r.kind==='hall'||r.kind==='wall'?'':`<label class="fl-f wide"><span>Label</span><input id="fl_label" data-floor-field="label" value="${esc(r.label)}" maxlength="60" ${onAct('change',floorField,'label',EL_VALUE)}></label>`}
  ${r.kind==='hall'?'':num('x','X (m)')+num('y','Y (m)')}${num('w','Width (m)')}${num('l','Length (m)')}${r.kind==='zone'||r.kind==='hall'?'':num('h','Height (m)')}</div>${palette}${foot}`;
}

/* --- Черновик ---------------------------------------------------------- */
function floorDraft(items,fresh){floorEdit={items,colors:{},sel:[],hist:[],fut:[],fresh:!!fresh,error:'',adding:''};floorCam=null;floorPick='';render();}
function floorStartEdit(){if(floorCan())floorDraft(JSON.parse(JSON.stringify(DB.floorItem||[])),false);}
function floorStartSketch(){if(floorCan())floorDraft(floorSketchItems(),true);}
function floorStartBlank(){if(floorCan())floorDraft([floorClean({id:floorId(),kind:'hall',w:40,l:30})],true);}
function floorCancel(){
 if(floorEdit&&(floorEdit.fresh||floorEdit.hist.length)&&!confirm('Discard changes to the floor plan?'))return;
 floorEdit=null;floorDrag=null;floorGuides=[];render();
}
/* Имя на …Save: кнопку база запирает на время записи (storageLockButtons). */
function floorPlanSave(){
 if(!floorEdit)return;
 const out=floorWrite(floorEdit);
 if(!out.ok){floorEdit.error=out.error;render();return;}
 floorEdit=null;floorDrag=null;floorGuides=[];render();
}
function floorSnap(){return JSON.stringify({items:floorEdit.items,colors:floorEdit.colors});}
function floorPush(){floorEdit.hist.push(floorSnap());if(floorEdit.hist.length>100)floorEdit.hist.shift();floorEdit.fut=[];floorEdit.error='';}
function floorRestore(s){const v=JSON.parse(s);floorEdit.items=v.items;floorEdit.colors=v.colors;floorEdit.sel=floorEdit.sel.filter(id=>v.items.some(r=>r.id===id));}
function floorUndo(){if(!floorEdit||!floorEdit.hist.length)return;floorEdit.fut.push(floorSnap());floorRestore(floorEdit.hist.pop());render();}
function floorRedo(){if(!floorEdit||!floorEdit.fut.length)return;floorEdit.hist.push(floorSnap());floorRestore(floorEdit.fut.pop());render();}

function floorPickStation(code){floorPick=floorPick===code?'':code;floorFind='';render();}
function floorSelectHall(){const h=floorHall();if(h){floorEdit.sel=[h.id];render();}}
function floorAdd(kind){
 if(!floorEdit||!kind)return render();
 if(kind==='zone'){floorEdit.adding='zone';floorEdit.sel=[];return render();}
 const b=floorBox(),[w,l]=FLOOR_ADD[kind];floorPush();
 const r=floorClean({id:floorId(),kind,x:Math.round((b.x+b.w/2-w/2)*10)/10,y:Math.round((b.y+b.h/2-l/2)*10)/10,w,l});
 floorEdit.items.push(r);floorEdit.sel=[r.id];render();
}
function floorField(k,v){
 const s=floorSel();if(s.length!==1)return;const r=s[0];
 if(k==='station'||k==='label'||k==='machine'){
  floorPush();r[k]=k==='label'?String(v).trim().slice(0,60):v;
  /* Другая станция — станок прежней станции снимается. */
  if(k==='station'){const st=floorStation(v);if(!st||!(st.machines||[]).includes(r.machine))r.machine='';}
  Object.assign(r,floorClean(r));return render();
 }
 const n=floorParseLen(v);
 if(!isFinite(n)||(k!=='x'&&k!=='y'&&n<(k==='h'?0:0.1))){floorEdit.error='Size: a number in m, cm or mm — 6.5, 650 cm, 6500 mm';return render();}
 floorPush();r[k]=n;Object.assign(r,floorClean(r));render();
}
function floorSetColor(code,c){floorPush();floorEdit.colors[code]=c;render();}
function floorRotate(){const s=floorSel();if(s.length!==1)return;floorPush();const r=s[0],cx=r.x+r.w/2,cy=r.y+r.l/2;[r.w,r.l]=[r.l,r.w];r.x=floorRound(cx-r.w/2);r.y=floorRound(cy-r.l/2);render();}
function floorDuplicate(){
 const s=floorSel().filter(r=>r.kind!=='hall'&&r.kind!=='zone');if(!s.length)return;floorPush();
 const copies=s.map(r=>floorClean(Object.assign({},r,{id:floorId(),x:r.x+1,y:r.y+1})));
 floorEdit.items.push(...copies);floorEdit.sel=copies.map(r=>r.id);render();
}
function floorDelete(){
 const s=floorSel().filter(r=>r.kind!=='hall');if(!s.length)return;floorPush();
 const ids=new Set(s.map(r=>r.id));floorEdit.items=floorEdit.items.filter(r=>!ids.has(r.id));floorEdit.sel=[];render();
}
function floorZoom(f){const b=floorBox(),cx=b.x+b.w/2,cy=b.y+b.h/2;floorCam={x:cx-b.w*f/2,y:cy-b.h*f/2,w:b.w*f,h:b.h*f};render();}
function floorFit(){floorCam=null;render();}

/* --- Мышь и клавиши --------------------------------------------------- */
function floorPoint(ev){
 const svg=document.querySelector('[data-floor-svg]');if(!svg||!svg.getScreenCTM())return {x:0,y:0};
 const p=new DOMPoint(ev.clientX,ev.clientY).matrixTransform(svg.getScreenCTM().inverse());return {x:p.x,y:p.y};
}
function floorDown(ev){
 if(ev.button!==0)return;
 const svg=document.querySelector('[data-floor-svg]'),at=floorPoint(ev),el=ev.target&&ev.target.closest?ev.target:null;
 const handle=el&&el.closest('[data-floor-handle]'),hit=el&&el.closest('[data-floor-item]'),id=hit&&hit.getAttribute('data-floor-item'),tare=!floorEdit&&el&&el.closest('[data-floor-carrier]');
 const item=id?floorItems().find(r=>r.id===id):null;
 if(svg&&svg.setPointerCapture)try{svg.setPointerCapture(ev.pointerId);}catch(e){}
 const canvas=document.querySelector('[data-floor-canvas]');if(canvas)canvas.focus({preventScroll:true});
 if(!floorEdit&&floor3d&&!ev.shiftKey){floorDrag={mode:'orbit',client:{x:ev.clientX,y:ev.clientY},yaw:floorYaw,pitch:floorPitch,moved:false,pick:item&&item.station||'',tare:tare?tare.getAttribute('data-floor-carrier'):''};return;}
 if(!floorEdit||ev.shiftKey&&(!item||item.kind==='hall')){floorDrag={mode:'pan',client:{x:ev.clientX,y:ev.clientY},box:Object.assign({},floorBox()),moved:false,pick:!floorEdit&&item&&item.station||'',tare:tare?tare.getAttribute('data-floor-carrier'):''};return;}
 if(floorEdit.adding==='zone'){floorDrag={mode:'draw',at,now:null};return;}
 if(handle){const r=floorEdit.items.find(x=>x.id===handle.getAttribute('data-floor-handle'));if(r){floorDrag={mode:'resize',at,id:r.id,orig:{w:r.w,l:r.l},pushed:false};return;}}
 if(item&&item.kind!=='hall'){
  if(ev.shiftKey){floorEdit.sel=floorEdit.sel.includes(item.id)?floorEdit.sel.filter(x=>x!==item.id):floorEdit.sel.concat(item.id);floorDrag=null;return render();}
  if(!floorEdit.sel.includes(item.id))floorEdit.sel=[item.id];
  floorDrag={mode:'move',at,ids:floorEdit.sel.slice(),orig:floorEdit.sel.map(i=>{const r=floorEdit.items.find(x=>x.id===i);return r?{id:i,x:r.x,y:r.y}:null;}).filter(Boolean),pushed:false,moved:false};
  return floorRedraw();
 }
 floorDrag={mode:'box',at,now:null};
}
/* Прилипание: край группы к краю соседа ближе 0.5 м — сдвиг до него и направляющая. */
function floorSnapDelta(ids,dx,dy){
 const moving=floorEdit.items.filter(r=>ids.includes(r.id)),others=floorEdit.items.filter(r=>!ids.includes(r.id));
 const o=floorDrag.orig;let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 moving.forEach(r=>{const p=o.find(q=>q.id===r.id);x0=Math.min(x0,p.x+dx);y0=Math.min(y0,p.y+dy);x1=Math.max(x1,p.x+dx+r.w);y1=Math.max(y1,p.y+dy+r.l);});
 let bx=null,by=null;const guides=[];
 others.forEach(r=>{
  [r.x,r.x+r.w].forEach(e=>[x0,x1].forEach(m=>{const d=e-m;if(Math.abs(d)<=FLOOR_SNAP&&(bx===null||Math.abs(d)<Math.abs(bx.d)))bx={d,e,r};}));
  [r.y,r.y+r.l].forEach(e=>[y0,y1].forEach(m=>{const d=e-m;if(Math.abs(d)<=FLOOR_SNAP&&(by===null||Math.abs(d)<Math.abs(by.d)))by={d,e,r};}));
 });
 if(bx){dx+=bx.d;guides.push({x1:bx.e,y1:Math.min(y0,bx.r.y),x2:bx.e,y2:Math.max(y1,bx.r.y+bx.r.l)});}
 if(by){dy+=by.d;guides.push({x1:Math.min(x0,by.r.x),y1:by.e,x2:Math.max(x1,by.r.x+by.r.w),y2:by.e});}
 return {dx,dy,guides};
}
function floorMove(ev){
 if(!floorDrag)return;
 if(floorDrag.mode==='orbit')return floor3dOrbit(ev);
 if(floorDrag.mode==='pan'){
  const svg=document.querySelector('[data-floor-svg]');if(!svg)return;const k=floorDrag.box.w/Math.max(1,svg.clientWidth);
  const dx=(ev.clientX-floorDrag.client.x)*k,dy=(ev.clientY-floorDrag.client.y)*k;if(Math.abs(dx)+Math.abs(dy)>0)floorDrag.moved=true;
  floorCam={x:floorDrag.box.x-dx,y:floorDrag.box.y-dy,w:floorDrag.box.w,h:floorDrag.box.h};return floorRedraw();
 }
 const p=floorPoint(ev);
 if(floorDrag.mode==='box'||floorDrag.mode==='draw'){floorDrag.now=p;return floorRedraw();}
 if(floorDrag.mode==='resize'){
  const r=floorEdit.items.find(x=>x.id===floorDrag.id);if(!r)return;
  if(!floorDrag.pushed){floorPush();floorDrag.pushed=true;}
  r.w=Math.max(0.1,floorRound(Math.round((floorDrag.orig.w+p.x-floorDrag.at.x)*10)/10));r.l=Math.max(0.1,floorRound(Math.round((floorDrag.orig.l+p.y-floorDrag.at.y)*10)/10));
  return floorRedraw();
 }
 if(floorDrag.mode==='move'){
  let dx=Math.round((p.x-floorDrag.at.x)*10)/10,dy=Math.round((p.y-floorDrag.at.y)*10)/10;
  if(!dx&&!dy&&!floorDrag.moved)return;
  if(!floorDrag.pushed){floorPush();floorDrag.pushed=true;}floorDrag.moved=true;
  const s=floorSnapDelta(floorDrag.ids,dx,dy);floorGuides=s.guides;
  floorDrag.orig.forEach(o=>{const r=floorEdit.items.find(x=>x.id===o.id);if(r){r.x=floorRound(o.x+s.dx);r.y=floorRound(o.y+s.dy);}});
  floorRedraw();
 }
}
function floorUp(ev){
 const d=floorDrag;floorDrag=null;floorGuides=[];if(!d)return;
 if(d.mode==='orbit'){if(d.moved){render();return floorFocus();}if(d.tare)floorShowCarrier(d.tare);else if(d.pick)floorPickStation(d.pick);return;}
 if(d.mode==='pan'){if(d.moved)return;if(floorEdit){floorEdit.sel=[];render();floorFocus();}else if(d.tare)floorShowCarrier(d.tare);else if(d.pick)floorPickStation(d.pick);return;}
 if(d.mode==='box'){
  if(d.now&&floorEdit){const x0=Math.min(d.at.x,d.now.x),x1=Math.max(d.at.x,d.now.x),y0=Math.min(d.at.y,d.now.y),y1=Math.max(d.at.y,d.now.y);
   floorEdit.sel=Math.abs(x1-x0)+Math.abs(y1-y0)<0.2?[]:floorEdit.items.filter(r=>r.kind!=='hall'&&r.x>=x0&&r.y>=y0&&r.x+r.w<=x1&&r.y+r.l<=y1).map(r=>r.id);}
  else if(floorEdit)floorEdit.sel=[];
  render();return floorFocus();
 }
 if(d.mode==='draw'){
  floorEdit.adding='';
  if(d.now){const x0=Math.min(d.at.x,d.now.x),y0=Math.min(d.at.y,d.now.y),w=Math.abs(d.now.x-d.at.x),l=Math.abs(d.now.y-d.at.y);
   if(w>=0.5&&l>=0.5){floorPush();const r=floorClean({id:floorId(),kind:'zone',x:Math.round(x0*10)/10,y:Math.round(y0*10)/10,w:Math.round(w*10)/10,l:Math.round(l*10)/10});floorEdit.items.push(r);floorEdit.sel=[r.id];}}
  render();return floorFocus();
 }
 render();floorFocus();
}
/* Перерисовка заменяет холст — клавиши (Ctrl+Z, стрелки, Esc) остаются у него. */
function floorFocus(){const c=document.querySelector('[data-floor-canvas]');if(c)c.focus({preventScroll:true});}
function floorKey(ev){
 const k=ev.key,mod=ev.ctrlKey||ev.metaKey;
 if(k==='f'||k==='F'){if(!mod){floorFit();ev.preventDefault();}return;}
 if(!floorEdit){
  if((k==='2'||k==='3')&&!mod){floor3dToggle(k==='3');return floorFocus();}
  if(k==='Escape'&&(floorPick||floorFind||floorFilter)){floorPick='';floorFind='';floorFilter='';render();floorFocus();}return;
 }
 if(mod&&(k==='z'||k==='Z')){ev.preventDefault();ev.shiftKey?floorRedo():floorUndo();return floorFocus();}
 if(k==='Escape'){floorEdit.sel=[];floorEdit.adding='';render();return floorFocus();}
 if(k==='Delete'||k==='Backspace'){ev.preventDefault();floorDelete();return floorFocus();}
 const step=ev.shiftKey?1:0.1,dir={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[k];
 if(!dir)return;const s=floorSel().filter(r=>r.kind!=='hall');if(!s.length)return;
 ev.preventDefault();floorPush();s.forEach(r=>{r.x=floorRound(r.x+dir[0]);r.y=floorRound(r.y+dir[1]);});render();floorFocus();
}
