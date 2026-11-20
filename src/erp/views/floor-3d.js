/* =====================================================================
   view/floor-3d  ·  floor-3.0
   Production → Floor в 3D (A3): тот же план, что в 2D, — проекция с
   поворотом и наклоном, свой SVG без библиотек. Только просмотр: Edit
   рисует 2D.
   IN : floorItems, floorLive, floorTareLayout, floorBlockStatus (views/floor)
   OUT: floor3d, floorYaw, floorPitch · floor3dProject, floor3dBoxes,
        floor3dBody, floor3dBounds, floor3dView(name), floor3dZoomTo(code)
   Владелец, 19–20.11.2026 (docs/ЗАДАЧА_КАРТА_ЦЕХА.md, A3):
   - «по умолчанию 2D, 3D — по необходимости, с поворотом мышью, чтобы можно
     было покрутить»; вид «живой макет архитектора», без декора;
   - видимые грани — по углу камеры, порядок — по глубине; длинные блоки
     (печь, линия IGU) — модулями до 6 м, иначе порядок ошибается;
   - стены в 3D всегда низкие — срез 1.3 м, как в архитектурном макете;
   - на время поворота подписи скрыты; Top · Iso, Fit, двойной клик —
     приблизить станцию.
   ===================================================================== */
let floor3d=false;    // вид 3D (только просмотр)
let floorYaw=-35;     // поворот вокруг вертикали, градусы
let floorPitch=55;    // наклон: 0 — сверху, до 75
let floor3dRaf=0;
const FLOOR_MODULE=6,FLOOR_WALL_CUT=1.3,FLOOR_VIEWS={top:[0,0],iso:[-35,55]};

/* Мир (x, y — план, z — высота) → экран. Центр поворота — середина плана. */
function floor3dProject(X,Y,Z,c){
 const a=floorYaw*Math.PI/180,p=floorPitch*Math.PI/180,dx=X-c.x,dy=Y-c.y;
 const rx=dx*Math.cos(a)-dy*Math.sin(a),ry=dx*Math.sin(a)+dy*Math.cos(a);
 return {x:rx+c.x,y:ry*Math.cos(p)-Z*Math.sin(p)+c.y,d:ry};
}
function floor3dCenter(){const b=floorBounds();return {x:b.x+b.w/2,y:b.y+b.h/2};}
/* Коробки: стены низкие, длинные блоки — модулями до 6 м по длинной стороне. */
function floor3dBoxes(items){
 const out=[];
 items.forEach(r=>{
  if(r.kind==='hall'||r.kind==='zone')return;
  const h=r.kind==='wall'?Math.min(r.h||FLOOR_WALL_CUT,FLOOR_WALL_CUT):Math.max(0.05,r.h||0);
  const long=Math.max(r.w,r.l),n=Math.max(1,Math.ceil(long/FLOOR_MODULE-1e-9)),alongW=r.w>=r.l;
  for(let i=0;i<n;i++){
   const part=alongW?{x:r.x+r.w*i/n,y:r.y,w:r.w/n,l:r.l}:{x:r.x,y:r.y+r.l*i/n,w:r.w,l:r.l/n};
   out.push(Object.assign(part,{h,item:r}));
  }
 });
 return out;
}
function floor3dPoly(pts,cls,extra,title){return `<polygon points="${pts.map(p=>p.x.toFixed(3)+','+p.y.toFixed(3)).join(' ')}" class="${cls}"${extra||''}${title?`><title>${esc(title)}</title></polygon>`:'/>'}`;}
/* Рисунок 3D: пол, сетка, зоны, коробки по глубине, затем подписи и тара. */
function floor3dBody(){
 const items=floorItems(),c=floor3dCenter(),b=floorBox(),fs=Math.max(0.35,b.w/48),live=floorLive(),P=(x,y,z)=>floor3dProject(x,y,z||0,c);
 const orbit=floorDrag&&floorDrag.mode==='orbit',parts=[],hall=floorHall(items);
 const rect=(r,z)=>[P(r.x,r.y,z),P(r.x+r.w,r.y,z),P(r.x+r.w,r.y+r.l,z),P(r.x,r.y+r.l,z)];
 if(hall){
  parts.push(floor3dPoly(rect(hall,0),'fl-hall',` data-floor-item="${hall.id}"`));
  for(let x=hall.x+5;x<hall.x+hall.w-0.01;x+=5){const a=P(x,hall.y),z=P(x,hall.y+hall.l);parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}" class="fl-grid"/>`);}
  for(let y=hall.y+5;y<hall.y+hall.l-0.01;y+=5){const a=P(hall.x,y),z=P(hall.x+hall.w,y);parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}" class="fl-grid"/>`);}
 }
 const findZone=floorFind?((live.carriers.find(x=>x.code===floorFind)||{}).station||''):'';
 items.filter(r=>r.kind==='zone').forEach(r=>{const col=r.station?floorColor(r.station):'';parts.push(floor3dPoly(rect(r,0),'fl-zone'+(findZone&&r.station===findZone?' blink':''),` data-floor-item="${r.id}"${col?` style="--fc:var(--${col})"`:''}`));});
 /* Глубина: дальний (меньший ry) рисуется первым. */
 const boxes=floor3dBoxes(items).map(x=>Object.assign(x,{d:P(x.x+x.w/2,x.y+x.l/2).d})).sort((p,q)=>p.d-q.d);
 const a=floorYaw*Math.PI/180,sin=Math.sin(a),cos=Math.cos(a);
 boxes.forEach(x=>{
  const r=x.item,st=r.station&&r.kind!=='wall'?floorStation(r.station):null,col=r.station&&st?floorColor(r.station):'';
  const status=r.kind==='machine'&&st?floorBlockStatus(r,live):'';
  const base=['fl-'+r.kind,r.station&&!st&&r.kind!=='wall'?'fl-unknown':'',st?'fl-st':'',!r.station&&r.kind==='machine'?'fl-free':'',status?'is-'+status:'',floorFilter&&status!==floorFilter&&r.kind!=='wall'?'dim':'',floorPick&&r.station===floorPick?'pick':''].filter(Boolean).join(' ');
  const attrs=` data-floor-item="${r.id}"${col?` style="--fc:var(--${col})"`:''}`,s=st&&live.st[r.station];
  const title=s?`${r.station}${r.machine?' '+r.machine:''} · ${FLOOR_STATUS[status]||''} · ${s.waiting} waiting · last scan ${floorClock(r.machine&&s.machines[r.machine]?s.machines[r.machine].last:s.last)}`:'';
  if(floorPitch>0.5){
   /* Видимые бока: нормаль к зрителю (составляющая вдоль ry > 0). */
   [[0,-1,[x.x,x.y],[x.x+x.w,x.y]],[0,1,[x.x+x.w,x.y+x.l],[x.x,x.y+x.l]],[-1,0,[x.x,x.y+x.l],[x.x,x.y]],[1,0,[x.x+x.w,x.y],[x.x+x.w,x.y+x.l]]].forEach(([nx,ny,p0,p1])=>{
    if(nx*sin+ny*cos<=1e-6)return;
    parts.push(floor3dPoly([P(p0[0],p0[1],0),P(p1[0],p1[1],0),P(p1[0],p1[1],x.h),P(p0[0],p0[1],x.h)],base+' fl-face3 '+(nx?'sx':'sy'),attrs));
   });
  }
  parts.push(floor3dPoly(rect(x,x.h),base+' fl-top',attrs,title));
 });
 if(!orbit){
  /* Подпись — над серединой верхней грани всего блока (не модуля). */
  items.forEach(r=>{
   if(r.kind!=='machine'&&r.kind!=='object')return;
   const st=r.station?floorStation(r.station):null,name=r.station&&!st?'Unknown station':r.station?(r.machine||r.station):r.label?(r.kind==='object'?r.label:'#'+r.label):'';
   if(!name)return;const p=P(r.x+r.w/2,r.y+r.l/2,r.h||0);parts.push(floorText(p.x,p.y,name,fs*0.85,'fl-label'));
  });
  items.filter(r=>r.kind==='zone'&&r.station).forEach(r=>{const p=P(r.x+r.w/2,r.y,0);parts.push(floorText(p.x,p.y-fs*0.5,r.station+' · waiting',fs*0.75,'fl-label fl-zl'));});
  /* Тара — те же места, что в 2D, кружком на полу. */
  floorTareLayout(items,live,fs).forEach(t=>{const p=P(t.x+t.w/2,t.y+t.l/2,0);
   if(t.more)parts.push(floorText(p.x,p.y,'+'+t.more,fs*0.7,'fl-more'));
   else parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${Math.max(0.35,fs*0.32)}" class="fl-tare${t.c.skid?' skid':''}${floorFind===t.c.code?' find':''}" data-floor-carrier="${esc(t.c.code)}"><title>${esc(t.title)}</title></circle>`);});
  floorTags3d(items,live,fs,P).forEach(x=>parts.push(x));
 }
 return parts.join('');
}
/* Подпись станции над её верхним станком — как в 2D, выше крыши блока. */
function floorTags3d(items,live,fs,P){
 const groups=new Map(),out=[];
 items.forEach(r=>{if(r.kind!=='machine'||!r.station||!live.st[r.station])return;const g=groups.get(r.station);if(!g||r.y<g.y||r.y===g.y&&r.x<g.x)groups.set(r.station,r);});
 groups.forEach((r,code)=>{
  const s=live.st[code];if(s.status==='idle'&&floorPick!==code)return;if(floorFilter&&s.status!==floorFilter)return;
  const text=code+' · '+(s.waiting?s.waiting+' waiting':FLOOR_STATUS[s.status].toLowerCase()),f=fs*0.9,p=P(r.x+r.w/2,r.y+r.l/2,(r.h||0)),cx=p.x,cy=p.y-f*1.6,w=text.length*f*0.58+f*1.6;
  out.push(`<g class="fl-tag is-${s.status}" data-floor-tag="${esc(code)}"><rect x="${cx-w/2}" y="${cy-f*0.7}" width="${w}" height="${f*1.4}" rx="${f*0.7}"/><circle cx="${cx-w/2+f*0.75}" cy="${cy}" r="${f*0.28}"/>${floorText(cx+f*0.4,cy,text,f,'fl-tagt')}</g>`);
 });
 return out;
}
/* Fit в 3D: границы проекции всего плана с высотами. */
function floor3dBounds(){
 const items=floorItems(),c=floor3dCenter();if(!items.length)return floorBounds();
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 items.forEach(r=>{const h=r.kind==='wall'?FLOOR_WALL_CUT:r.kind==='zone'||r.kind==='hall'?0:r.h||0;
  [[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.l],[r.x,r.y+r.l]].forEach(([X,Y])=>[0,h].forEach(Z=>{const p=floor3dProject(X,Y,Z,c);x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}));});
 const pad=Math.max(3,(x1-x0)*0.06);return {x:x0-pad,y:y0-pad,w:x1-x0+pad*2,h:y1-y0+pad*2};
}
function floor3dToggle(on){floor3d=!!on;floorCam=null;render();}
function floor3dView(name){const v=FLOOR_VIEWS[name];if(!v)return;[floorYaw,floorPitch]=v;floorCam=null;render();}
/* Двойной клик — приблизить станцию: её блоки во весь холст с запасом. */
function floor3dZoomTo(code){
 const list=floorItems().filter(r=>r.station===code&&r.kind!=='zone');if(!list.length)return;
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 const c=floor3d?floor3dCenter():null;
 list.forEach(r=>[[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.l],[r.x,r.y+r.l]].forEach(([X,Y])=>[0,r.h||0].forEach(Z=>{const p=floor3d?floor3dProject(X,Y,Z,c):{x:X,y:Y};x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);})));
 const pad=Math.max(4,(x1-x0)*0.6,(y1-y0)*0.6);floorCam={x:x0-pad,y:y0-pad,w:x1-x0+pad*2,h:y1-y0+pad*2};floorPick=code;floorFind='';render();
}
function floorDbl(ev){
 if(floorEdit)return;const el=ev.target&&ev.target.closest?ev.target.closest('[data-floor-item]'):null;
 const r=el&&floorItems().find(x=>x.id===el.getAttribute('data-floor-item'));if(r&&r.station)floor3dZoomTo(r.station);
}
/* Поворот мышью: влево-вправо — вокруг вертикали, вверх-вниз — наклон. */
function floor3dOrbit(ev){
 const d=floorDrag;floorYaw=d.yaw+(ev.clientX-d.client.x)*0.4;floorPitch=Math.max(0,Math.min(75,d.pitch+(ev.clientY-d.client.y)*0.3));
 if(Math.abs(ev.clientX-d.client.x)+Math.abs(ev.clientY-d.client.y)>2)d.moved=true;
 if(!floor3dRaf)floor3dRaf=(window.requestAnimationFrame||(f=>setTimeout(f,16)))(()=>{floor3dRaf=0;floorRedraw();});
}
