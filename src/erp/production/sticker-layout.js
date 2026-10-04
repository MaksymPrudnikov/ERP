/* =====================================================================
   erp/production/sticker-layout  ·  stickers-1.0
   Раскладка стикера по шаблону и SVG для предпросмотра и печати.
   IN : шаблон {orient, layout, blocks}, размер 4x6 | 3x4, модель стикера
   OUT: {w, h, items, boxes, issues, overflow} в pt; stkPageSVG

   Правила раскладки:
   - Full — блок на всю ширину; подряд идущие Left / Right — две колонки
     одной группы; Bottom — прижаты к низу в своём порядке, чтобы маршрут
     стоял на одном месте на любом стикере.
   - Термопринтер печатает точку или пустоту: только чёрное и белое, серого
     нет, текст не мельче 6 pt (конструктор не даст меньше).
   - Штрихкод не сжимается ниже узкой полосы 0.01″ — иначе сканер не прочтёт;
     что не влезло, не печатается молча, а называется в overflow.
   ===================================================================== */
const STK_BAR_MODULES=[1.44,1.08,0.72];
function stkDims(size,orient){const s=stkSizeDef(size);return orient==='landscape'?{w:s.long,h:s.short}:{w:s.short,h:s.long};}
function stkMargin(size){return size==='3x4'?9:12;}
function stkFmtKg(w){return w?(w.exact?'':'≈ ')+w.kg.toFixed(1)+' kg':'';}
function stkGlassText(g,det){
 const parts=[det.code&&g.code?g.code:g.name];
 if(det.thickness&&g.mm)parts.push(g.mm+' mm');
 if(det.ply&&g.ply)parts.push(g.ply==='outer'?'outer ply':'inner ply');
 if(det.heat&&g.heat)parts.push(g.heat);
 if(det.heatSoak&&g.heatSoak)parts.push('HST');
 if(det.surface&&g.surface)parts.push(g.surface);
 if(det.paint)(g.paint||[]).forEach(t=>parts.push(t));
 return parts.join(' · ');
}
function stkMakeupRowText(r,det){
 const glass=g=>stkGlassText(g,{code:false,heat:det.heat,heatSoak:det.heat,surface:det.surface,paint:det.surface});
 if(r.kind==='space')return [det.spacer&&r.spacer,det.gas&&r.gas,det.sealant&&r.sealant].filter(Boolean).join(' · ');
 if(!det.glass)return '';
 if(r.kind==='glass')return glass(r.glass);
 const films=r.films.map(f=>f.name+(det.film&&f.mm?' '+(+f.mm.toFixed(2))+' mm':'')+(det.film&&f.layers>1?' ('+f.layers+' layers)':''));
 return [glass(r.outer)].concat(films,[glass(r.inner)]).join(' + ');
}
/* Подгонка текста меряет ширину шрифтом бланков, но сам текст не меняет:
   SVG печатает любой символ (≈, ″, ×), а бланк PDF заменил бы его «?». */
function stkFit(s,size,bold,maxW){
 s=String(s==null?'':s).replace(/\s*\n\s*/g,' ');if(docTextWidth(s,size,bold)<=maxW)return s;
 while(s&&docTextWidth(s+'…',size,bold)>maxW)s=s.slice(0,-1);
 return s+'…';
}
function stkWrap(s,size,bold,maxW){
 const out=[];
 String(s==null?'':s).split(/\r?\n/).forEach(par=>{
  let line='';
  par.split(/ +/).forEach(word=>{
   const cand=line?line+' '+word:word;
   if(docTextWidth(cand,size,bold)<=maxW){line=cand;return;}
   if(line)out.push(line);
   let chunk='';for(const ch of word){if(chunk&&docTextWidth(chunk+ch,size,bold)>maxW){out.push(chunk);chunk='';}chunk+=ch;}
   line=chunk;
  });
  out.push(line);
 });
 return out;
}
function stkBarModule(id,w){const n=barcode128Width(id);return STK_BAR_MODULES.find(m=>n*m<=w)||0;}
function stkNeedWidth(b,d){return b.k==='barcode'&&d.id?barcode128Width(d.id)*STK_BAR_MODULES[STK_BAR_MODULES.length-1]:0;}
function stkWantWidth(b,d,max){if(b.k!=='barcode'||!d.id)return 0;const n=barcode128Width(d.id),m=STK_BAR_MODULES.find(v=>n*v<=max);return m?n*m:n*STK_BAR_MODULES[STK_BAR_MODULES.length-1];}
/* Выравнивание блока: своё (Left / Center / Right) или по месту — правая
   колонка вправо, штрихкод и маршрут по центру, остальное влево.
   Владелец, 17 сентября 2026: «баркод хоть и Full, но тянет правее, и в
   конструкторе нельзя отцентровать». */
function stkAlignOf(b,col){if(b.align&&b.align!=='auto')return b.align;if(col==='right')return 'right';return b.k==='barcode'||b.k==='route'?'center':'left';}
/* Один блок в прямоугольнике x, y, w. Возвращает высоту в pt (0 — печатать нечего). */
function stkRenderBlock(b,d,x,y,w,col,out,opt){
 opt=opt||{};const fixed=!!opt.free,fonts=b.fonts||{},explicit=k=>Number.isFinite(+fonts[k])&&+fonts[k]>0,font=(k,f)=>explicit(k)?+fonts[k]:f;
 const det=b.details||{},sz=Math.max(6,+b.size||10),bold=!!b.bold,R=x+w,A=stkAlignOf(b,col),K='#000000',Wt='#ffffff';
 const ax=tw=>A==='right'?R-tw:A==='center'?x+(w-tw)/2:x;
 const put=(s,xx,yy,size,bld,color)=>out.push({t:'text',s,x:xx,y:yy,size,bold:bld,color:color||K,align:''});
 const line=(s,yy,size,bld)=>{const ls=fixed?stkWrap(s,size,bld,w):[stkFit(s,size,bld,w)];ls.forEach((t,i)=>put(t,ax(docTextWidth(t,size,bld)),yy+i*size*1.18,size,bld));return ls.length;};
 const para=(s,size,bld,n)=>{const ls=stkWrap(String(s||''),size,bld,w).filter(Boolean);if(!fixed)ls.splice(n||2);ls.forEach((t,i)=>line(t,y+size*.9+i*size*1.18,size,bld));return ls.length?ls.length*size*1.18+size*.15:0;};
 const rect=(xx,yy,ww,hh,o)=>out.push(Object.assign({t:'rect',x:xx,y:yy,w:ww,h:hh,fill:K},o||{}));
 /* Номер заказа и размер не обрезаются многоточием — кегль уменьшается. */
 const shrink=(s,size,bld,max)=>{if(fixed)return size;let f=size;while(f>6&&docTextWidth(s,f,bld)>max)f-=.5;return f;};
 switch(b.k){
  case 'company':{
   const c=DB.company||{},name=det.name?String(c.legalName||'').toUpperCase():'',logo=det.logo&&c.logo?c.logo:'';if(!name&&!logo)return 0;
   const info=logo&&typeof docJpegInfo==='function'?docJpegInfo(logo):null,lh=sz*1.9,lw=logo?Math.min(w*.5,info&&info.h?lh*info.w/info.h:lh*2):0;
   if(fixed){const ls=name?stkWrap(name,sz,bold,Math.max(1,w-(logo?lw+6:0))).filter(Boolean):[],tw=lw+(logo&&ls.length?6:0)+Math.max(0,...ls.map(t=>docTextWidth(t,sz,bold))),sx=ax(tw),nh=ls.length?sz*1.15+(ls.length-1)*sz*1.18:0;
    if(logo)out.push({t:'image',href:logo,x:sx,y,w:lw,h:lh});ls.forEach((t,i)=>put(t,sx+(logo?lw+6:0),y+(logo?Math.max(sz*.9,lh/2+sz*.35):sz*.9)+i*sz*1.18,sz,bold));return logo?Math.max(lh,nh)+2:nh;}
   const nm=name?(fixed?name:stkFit(name,sz,bold,w-(logo?lw+6:0))):'',tw=lw+(logo&&nm?6:0)+(nm?docTextWidth(nm,sz,bold):0),sx=ax(tw);
   if(logo)out.push({t:'image',href:logo,x:sx,y,w:lw,h:lh});
   if(nm)put(nm,sx+(logo?lw+6:0),y+(logo?lh/2+sz*.35:sz*.9),sz,bold);
   return logo?lh+2:sz*1.15;}
  case 'batch':{if(!d.batch)return 0;line(d.batch,y+sz*.9,sz,bold);return sz*1.15;}
  case 'stockNo':{if(!d.id)return 0;const t=(det.label?'STOCK  ':'')+d.id,f=shrink(t,sz,bold,w);put(t,ax(docTextWidth(t,f,bold)),y+sz*.85,f,bold);return sz*1.1;}
  case 'stockFrom':{const fr=d.from;if(!fr)return 0;const t=[fr.batch?'From '+fr.batch:'',fr.sheet?'Sheet '+fr.sheet:'',det.date?fr.date:''].filter(Boolean).join(' · ');if(!t)return 0;line(t,y+sz*.9,sz,bold);return sz*1.2;}
  case 'sheet':{if(!d.sheet)return 0;line('Sheet '+d.sheet.sheet+(det.pos?' · #'+d.sheet.pos:''),y+sz*.9,sz,bold);return sz*1.2;}
  case 'barcode':{
   if(!d.id)return 0;const m=stkBarModule(d.id,w)||(fixed?STK_BAR_MODULES[STK_BAR_MODULES.length-1]:0);if(!m)return 0;
   const bw=barcode128Width(d.id)*m,bx=ax(bw),ns=font('number',Math.max(7,Math.min(16,sz*.26))),barH=fixed?Math.max(1,opt.h-(det.number?ns+4:2)):sz;
   barcode128Items(d.id,bx,y,barH,m).forEach(r=>out.push(Object.assign(r,{fill:K})));
   if(det.number){out.push({t:'text',s:d.id,x:bx+bw/2,y:y+barH+ns+1,size:ns,bold:true,color:K,align:'center'});return barH+ns+4;}
   return barH+2;}
  case 'order':{
   if(fixed&&!d.order)return 0;const t=d.order+(det.line?' / '+d.line:''),rs=font('recut',Math.max(7,Math.round(sz*.4))),tag=det.recut&&d.recut?docTextWidth(d.recut,rs,true)+rs:0,f=shrink(t,sz,bold,w-(tag?tag+8:0)),tw=docTextWidth(t,f,bold),sx=ax(tw+(tag?tag+8:0));
   put(t,sx,y+sz*.82,f,bold);
   if(tag){const rx=sx+tw+8;rect(rx,y+sz*.82-rs-5,tag,rs+8);out.push({t:'text',s:d.recut,x:rx+tag/2,y:y+sz*.82-2,size:rs,bold:true,color:Wt,align:'center'});}
   return sz*.95;}
  case 'unit':{
   const bits=[];if(det.unit&&!d.recut&&d.unit)bits.push('Unit '+d.unit+' of '+d.of);
   if(det.lite&&d.lite&&d.lites>1)bits.push('Lite '+d.lite+' of '+d.lites);else if(det.lite&&d.lite&&d.recut)bits.push('Lite '+d.lite);
   if(!bits.length)return 0;line(bits.join(' · '),y+sz*.9,sz,bold);return sz*1.2;}
  case 'orderInfo':{const bits=[det.priority&&d.priority,det.delivery&&d.delivery,det.created&&d.created?'Ordered '+d.created:''].filter(Boolean);if(!bits.length)return 0;line(bits.join(' · '),y+sz*.9,sz,bold);return sz*1.2;}
  case 'customer':{if(!d.customer)return 0;return para(det.upper?String(d.customer).toUpperCase():d.customer,sz,bold,2);}
  case 'po':{if(!d.po)return 0;line((det.label?'PO  ':'')+d.po,y+sz*.9,sz,bold);return sz*1.2;}
  case 'mark':{if(!d.mark)return 0;return para((det.label?'Mark  ':'')+d.mark,sz,bold,2);}
  case 'due':{
   if(!d.due)return 0;const t='Due '+(det.weekday&&d.dueWeekday?d.dueWeekday+' ':'')+d.due,tw=Math.min(w,docTextWidth(t,sz,bold)+sz*1.2),h=sz*1.55,bx=ax(tw),black=det.rush&&d.rush;
   rect(bx,y,tw,h,black?{}:{fill:'none',stroke:K,sw:1.2});out.push({t:'text',s:t,x:bx+tw/2,y:y+h/2+sz*.35,size:sz,bold,color:black?Wt:K,align:'center'});return h+1;}
  case 'glass':{if(!d.glass)return 0;return para(stkGlassText(d.glass,det),sz,bold,2);}
  case 'summary':{if(!d.summary)return 0;return para((det.label?'Unit  ':'')+d.summary,sz,bold,2);}
  case 'makeup':{
   /* Состав — таблица: подписи строк слева, текст с отступом. */
   if(!d.rows)return 0;let yy=y;const hs=font('heading',sz*1.2);
   const head=[det.heading&&d.heading,det.thickness&&d.thicknessMm?d.thicknessMm.toFixed(1)+' mm':''].filter(Boolean).join(' · ');
   if(head){const ls=fixed||explicit('heading')?stkWrap(head,hs,true,w):[stkFit(head,hs,true,w)];ls.forEach(t=>{put(t,ax(docTextWidth(t,hs,true)),yy+hs*.9,hs,true);yy+=hs*1.25;});}
   const tableStart=out.length;
   if(det.code&&d.code){stkWrap(d.code,sz,false,w).filter(Boolean).slice(0,fixed?undefined:2).forEach(t=>{put(t,x,yy+sz*.9,sz,false);yy+=sz*1.2;});}
   const lab=docTextWidth('Space',sz,true)+sz*.8;
   d.rows.concat(det.muntin&&d.muntin?[{kind:'muntin',label:'Grid',text:d.muntin}]:[]).forEach(r=>{
    const t=r.kind==='muntin'?r.text:stkMakeupRowText(r,det);if(!t)return;
    put(r.label,x,yy+sz*.9,sz,true);
    stkWrap(t,sz,bold,w-lab).filter(Boolean).slice(0,fixed?undefined:2).forEach(s=>{put(s,x+lab,yy+sz*.9,sz,bold);yy+=sz*1.2;});
   });
   if(fixed&&A!=='left'){const body=out.slice(tableStart),bounds=stkContentBounds(body);if(bounds){const dx=(A==='right'?R-bounds.w:x+(w-bounds.w)/2)-bounds.x;body.forEach(a=>{if(a.x!=null)a.x+=dx;});}}
   return yy-y;}
  case 'size':{
   /* Крупно — готовый размер; мелко под ним — размер до обработки кромки,
      если он другой. */
   const dim=d.finished;if(!dim)return 0;const t=frac16(dim.w)+' × '+frac16(dim.h)+'″',f=shrink(t,sz,bold,w);
   put(t,ax(docTextWidth(t,f,bold)),y+sz*.82,f,bold);
   if(!det.cut||!d.cut)return sz*.98;
   const cs=font('cut',Math.max(7,Math.round(sz*.34))),ct='CUT '+frac16(d.cut.w)+' × '+frac16(d.cut.h)+'″',cf=explicit('cut')?cs:shrink(ct,cs,true,w);
   put(ct,ax(docTextWidth(ct,cf,true)),y+sz*.82+cs*1.15,cf,true);return sz*.98+cs*1.25;}
  case 'area':{if(d.area==null)return 0;line(d.area.toFixed(2)+' ft²',y+sz*.9,sz,bold);return sz*1.2;}
  case 'weight':{if(!d.weight)return 0;line(stkFmtKg(d.weight),y+sz*.9,sz,bold);return sz*1.2;}
  case 'shape':{
   if(fixed||explicit('dims')||explicit('label'))return stkRenderShape(b,d,x,y,fixed?w:Math.min(w,sz),fixed?opt.h:sz+(det.label?10:2),col,out,opt.issue);
   /* Контур с длинами сторон снаружи (владелец, 4 октября 2026: букв A–D
      на чертеже нет, «заменить размерами»). Подпись отодвигается от своей
      стороны ровно настолько, чтобы её не касаться; контур — самый крупный,
      при котором всё влезает в квадрат size × size и в колонку. Подпись,
      что налезла бы на другую или на контур (вырез, короткие стороны), не
      печатается — короткие стороны уступают длинным; если из-за подписей
      контур мельче половины блока, короткие подписи снимаются. */
   if(!d.shape)return 0;const pts=d.shape.points,xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
   const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),spanX=(maxX-minX)||1,spanY=(maxY-minY)||1;
   const availW=Math.min(w,sz),availH=sz,kMax=Math.min(availW/spanX,availH/spanY),ls=Math.max(6,Math.min(9,Math.round(sz*.11*2)/2)),lh=ls*.9,gap=1.5;
   const turn=pts.reduce((a,p,i)=>{const q=pts[(i+1)%pts.length];return a+p[0]*q[1]-q[0]*p[1];},0)>=0?1:-1;
   let cand=(det.dims?d.shape.sides||[]:[]).map(sd=>{
    const dx=sd.b[0]-sd.a[0],dy=sd.b[1]-sd.a[1],n=Math.hypot(dx,dy)||1,t=frac16(sd.len);
    return {t,tw:docTextWidth(t,ls,true),mx:(sd.a[0]+sd.b[0])/2,my:(sd.a[1]+sd.b[1])/2,sx:turn*dy/n,sy:turn*dx/n,len:sd.len};
   }).sort((a,b)=>b.len-a.len);
   /* Рамка подписи в осях блока (y вниз) при масштабе k, начало — угол minX, maxY. */
   const boxOf=(q,k)=>{
    const ax0=(q.mx-minX)*k,ay0=(maxY-q.my)*k;
    let x0=q.sx>.35?ax0:q.sx<-.35?ax0-q.tw:ax0-q.tw/2,y0=q.sy<-.35?ay0-lh:q.sy>.35?ay0:ay0-lh/2;
    const near=Math.min(...[[x0,y0],[x0+q.tw,y0],[x0,y0+lh],[x0+q.tw,y0+lh]].map(c=>(c[0]-ax0)*q.sx+(c[1]-ay0)*q.sy)),sh=gap-near;
    x0+=sh*q.sx;y0+=sh*q.sy;return {x0,y0,x1:x0+q.tw,y1:y0+lh,q};
   };
   const cross=(ax,ay,bx,by,cx,cy,dx,dy)=>{const o=(px,py,qx,qy,rx,ry)=>Math.sign((qx-px)*(ry-py)-(qy-py)*(rx-px));return o(ax,ay,bx,by,cx,cy)!==o(ax,ay,bx,by,dx,dy)&&o(cx,cy,dx,dy,ax,ay)!==o(cx,cy,dx,dy,bx,by);};
   const onOutline=(r,k)=>pts.some((p,i)=>{const q=pts[(i+1)%pts.length],ax1=(p[0]-minX)*k,ay1=(maxY-p[1])*k,bx1=(q[0]-minX)*k,by1=(maxY-q[1])*k;
    if(ax1>r.x0&&ax1<r.x1&&ay1>r.y0&&ay1<r.y1)return true;
    return cross(ax1,ay1,bx1,by1,r.x0,r.y0,r.x1,r.y0)||cross(ax1,ay1,bx1,by1,r.x1,r.y0,r.x1,r.y1)||cross(ax1,ay1,bx1,by1,r.x1,r.y1,r.x0,r.y1)||cross(ax1,ay1,bx1,by1,r.x0,r.y1,r.x0,r.y0);});
   const place=(list,k)=>{const out2=[];list.forEach(q=>{const r=boxOf(q,k);if(out2.some(o=>r.x0<o.x1+1&&o.x0<r.x1+1&&r.y0<o.y1+.5&&o.y0<r.y1+.5)||onOutline(r,k))return;out2.push(r);});return out2;};
   const bbox=(list,k)=>list.reduce((b,r)=>({x0:Math.min(b.x0,r.x0),y0:Math.min(b.y0,r.y0),x1:Math.max(b.x1,r.x1),y1:Math.max(b.y1,r.y1)}),{x0:0,y0:0,x1:spanX*k,y1:spanY*k});
   const fits=(list,k)=>{const b=bbox(place(list,k),k);return b.x1-b.x0<=availW+1e-6&&b.y1-b.y0<=availH+1e-6;};
   const best=list=>{if(fits(list,kMax))return kMax;let lo=kMax*.05,hi=kMax;for(let i=0;i<24;i++){const m=(lo+hi)/2;if(fits(list,m))lo=m;else hi=m;}return lo;};
   let k=best(cand);while(cand.length&&k<kMax*.55){cand=cand.slice(0,-1);k=best(cand);}
   const labels=place(cand,k),bb=bbox(labels,k),bw=bb.x1-bb.x0,bh=bb.y1-bb.y0,bx=ax(bw),ox=bx-bb.x0,oy=y-bb.y0;
   const px=v=>ox+(v-minX)*k,py=v=>oy+(maxY-v)*k,path=list=>'M'+list.map(p=>px(p[0]).toFixed(2)+' '+py(p[1]).toFixed(2)).join('L')+'Z';
   out.push({t:'path',d:path(pts)});
   (d.shape.polys||[]).forEach(pg=>out.push({t:'path',d:path(pg)}));
   (d.shape.holes||[]).forEach(h=>out.push({t:'circle',cx:px(h.x),cy:py(h.y),r:Math.max(1.2,h.d*k/2)}));
   labels.forEach(r=>out.push({t:'text',s:r.q.t,x:ox+r.x0,y:oy+r.y0+ls*.78,size:ls,bold:true,color:K,align:''}));
   if(det.label){out.push({t:'text',s:'SHAPE',x:bx+bw/2,y:y+bh+8,size:7,bold:true,color:K,align:'center'});return bh+10;}
   return bh+2;}
  case 'route':{
   if(!d.route)return 0;const codes=det.shipping?d.route.codes:d.route.codes.filter(c=>!(d.route.shipping||[]).includes(c)),t=codes.join(' > ');if(fixed&&!t)return 0;let fs=font('route',Math.max(6,sz*.56));
   if(!fixed&&!explicit('route'))while(fs>6&&docTextWidth(t,fs,true)>w-10)fs-=.5;const rh=fixed?opt.h:sz,routeA=b.align&&b.align!=='auto'?A:'center',tx=fixed&&routeA==='left'?x+5:fixed&&routeA==='right'?R-5:x+w/2,ta=fixed&&routeA==='left'?'':fixed&&routeA==='right'?'right':'center',ty=fixed&&b.valign==='top'?y+3+fs*.8:fixed&&b.valign==='bottom'?y+rh-3-fs*.15:y+rh/2+fs*.36;rect(x,y,w,rh);out.push({t:'text',s:t,x:tx,y:ty,size:fs,bold:true,color:Wt,align:ta});return rh+(fixed?0:1);}
  case 'services':{
   const list=d.route?d.route.services:[];if(!list.length)return 0;
   const box=det.boxes?sz*.85:0,gap=box?sz*.45:0,rows=[[]];let used=0;
   if(fixed&&list.some(s=>docTextWidth((det.station?s.station+' · ':'')+s.text,sz,bold)>w-box-gap)){let yy=y;list.forEach(s=>{const ls=stkWrap((det.station?s.station+' · ':'')+s.text,sz,bold,Math.max(1,w-box-gap)),tw=box+gap+Math.max(0,...ls.map(t=>docTextWidth(t,sz,bold))),sx=ax(tw);if(box)rect(sx,yy+sz*.9-box*.95,box,box,{fill:'none',stroke:K,sw:1});ls.forEach((t,i)=>put(t,sx+box+gap,yy+sz*.9+i*sz*1.35,sz,bold));yy+=ls.length*sz*1.35;});return yy-y-sz*.05;}
   list.forEach(s=>{const raw=(det.station?s.station+' · ':'')+s.text,t=fixed?raw:stkFit(raw,sz,bold,w-box-gap),ww=box+gap+docTextWidth(t,sz,bold);
    if(rows[rows.length-1].length&&used+sz+ww>w){rows.push([]);used=0;}const row=rows[rows.length-1];used+=(row.length?sz:0)+ww;row.push({t,ww});});
   rows.forEach((row,i)=>{const cy=y+sz*.9+i*sz*1.35;let cx=ax(row.reduce((a,r,j)=>a+r.ww+(j?sz:0),0));
    row.forEach(r=>{if(box)rect(cx,cy-box*.95,box,box,{fill:'none',stroke:K,sw:1});put(r.t,cx+box+gap,cy,sz,bold);cx+=r.ww+sz;});});
   return rows.length*sz*1.35-sz*.05;}
  case 'divider':{const t=Math.max(.5,+b.size||1);rect(x,y+2,w,t);return t+4;}
  case 'text':{const t=stkFill(b.text,d).trim();if(!t)return 0;return para(t,sz,bold,2);}
 }
 return 0;
}
/* A fixed frame fits the outline and all annotations together. Text keeps its
   chosen point size; an impossible frame is reported rather than dropping labels. */
function stkRenderShape(b,d,x,y,w,h,col,out,issue){
 if(!d.shape||!Array.isArray(d.shape.points)||!d.shape.points.length)return 0;
 const pts=d.shape.points,det=b.details||{},sz=Math.max(6,+b.size||90),fonts=b.fonts||{};
 const font=(k,f)=>Number.isFinite(+fonts[k])&&+fonts[k]>0?+fonts[k]:f;
 const ls=font('dims',Math.max(6,Math.min(9,Math.round(sz*.11*2)/2))),labelSize=font('label',7),lh=ls*.94,gap=1.5;
 const minX=Math.min(...pts.map(p=>p[0])),maxX=Math.max(...pts.map(p=>p[0])),minY=Math.min(...pts.map(p=>p[1])),maxY=Math.max(...pts.map(p=>p[1]));
 const spanX=maxX-minX||1,spanY=maxY-minY||1,turn=pts.reduce((a,p,i)=>{const q=pts[(i+1)%pts.length];return a+p[0]*q[1]-q[0]*p[1];},0)>=0?1:-1;
 const cand=(det.dims?d.shape.sides||[]:[]).map(sd=>{const dx=sd.b[0]-sd.a[0],dy=sd.b[1]-sd.a[1],n=Math.hypot(dx,dy)||1,t=frac16(sd.len);return {t,tw:docTextWidth(t,ls,true),mx:(sd.a[0]+sd.b[0])/2,my:(sd.a[1]+sd.b[1])/2,sx:turn*dy/n,sy:turn*dx/n};});
 const labelsAt=k=>cand.map(q=>{
  const ax=(q.mx-minX)*k,ay=(maxY-q.my)*k;
  let x0=q.sx>.35?ax:q.sx<-.35?ax-q.tw:ax-q.tw/2,y0=q.sy<-.35?ay-lh:q.sy>.35?ay:ay-lh/2;
  const near=Math.min(...[[x0,y0],[x0+q.tw,y0],[x0,y0+lh],[x0+q.tw,y0+lh]].map(c=>(c[0]-ax)*q.sx+(c[1]-ay)*q.sy)),shift=gap-near;
  x0+=shift*q.sx;y0+=shift*q.sy;return {x0,y0,x1:x0+q.tw,y1:y0+lh,q};
 });
 const boundsAt=k=>{
  const labels=labelsAt(k),bb=labels.reduce((r,a)=>({x0:Math.min(r.x0,a.x0),y0:Math.min(r.y0,a.y0),x1:Math.max(r.x1,a.x1),y1:Math.max(r.y1,a.y1)}),{x0:0,y0:0,x1:spanX*k,y1:spanY*k});
  let title=null;if(det.label){const tw=docTextWidth('SHAPE',labelSize,true),mid=(bb.x0+bb.x1)/2;title={x0:mid-tw/2,y0:bb.y1+gap,x1:mid+tw/2,y1:bb.y1+gap+labelSize*1.15};bb.x0=Math.min(bb.x0,title.x0);bb.x1=Math.max(bb.x1,title.x1);bb.y1=title.y1;}
  return {labels,bb,title};
 };
 const maxK=Math.min(w/spanX,h/spanY),fits=k=>{const z=boundsAt(k).bb;return z.x1-z.x0<=w+.001&&z.y1-z.y0<=h+.001;};
 let lo=0,hi=Math.max(0,maxK);if(fits(hi))lo=hi;else for(let i=0;i<36;i++){const mid=(lo+hi)/2;if(fits(mid))lo=mid;else hi=mid;}
 const k=Math.max(.0001,lo),z=boundsAt(k),bw=z.bb.x1-z.bb.x0,bh=z.bb.y1-z.bb.y0,A=stkAlignOf(b,col);
 const bx=A==='right'?x+w-bw:A==='center'?x+(w-bw)/2:x,by=b.valign==='bottom'?y+h-bh:b.valign==='middle'?y+(h-bh)/2:y,ox=bx-z.bb.x0,oy=by-z.bb.y0;
 const px=v=>ox+(v-minX)*k,py=v=>oy+(maxY-v)*k,path=list=>'M'+list.map(p=>px(p[0]).toFixed(2)+' '+py(p[1]).toFixed(2)).join('L')+'Z';
 const emitPath=list=>{if(!list.length)return;const xs=list.map(p=>px(p[0])),ys=list.map(p=>py(p[1]));out.push({t:'path',d:path(list),bounds:{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}});};
 emitPath(pts);(d.shape.polys||[]).forEach(emitPath);(d.shape.holes||[]).forEach(a=>out.push({t:'circle',cx:px(a.x),cy:py(a.y),r:Math.max(1.2,a.d*k/2)}));
 z.labels.forEach(a=>out.push({t:'text',s:a.q.t,x:ox+a.x0,y:oy+a.y0+ls*.8,size:ls,bold:true,color:'#000000',align:''}));
 if(z.title)out.push({t:'text',s:'SHAPE',x:ox+(z.title.x0+z.title.x1)/2,y:oy+z.title.y0+labelSize*.9,size:labelSize,bold:true,color:'#000000',align:'center'});
 if(issue){
  if(!fits(k))issue('Annotations do not fit the frame.');
  const overlaps=(a,r)=>a.x0<r.x1+.5&&r.x0<a.x1+.5&&a.y0<r.y1+.5&&r.y0<a.y1+.5;
  const segmentHits=(a,p,q)=>{
   const ax=(p[0]-minX)*k,ay=(maxY-p[1])*k,bx=(q[0]-minX)*k,by=(maxY-q[1])*k,dx=bx-ax,dy=by-ay;
   let t0=0,t1=1;for(const [v,n] of [[-dx,ax-a.x0],[dx,a.x1-ax],[-dy,ay-a.y0],[dy,a.y1-ay]]){if(Math.abs(v)<1e-9){if(n<0)return false;continue;}const t=n/v;if(v<0)t0=Math.max(t0,t);else t1=Math.min(t1,t);if(t0>t1)return false;}return true;
  };
  if(z.labels.some((a,i)=>z.labels.slice(i+1).some(r=>overlaps(a,r))||pts.some((p,j)=>segmentHits(a,p,pts[(j+1)%pts.length]))))issue('Side labels overlap each other or the outline.');
 }
 return bh;
}
/* Item bounds drive the same overflow diagnostics for preview and print. */
function stkItemBounds(a){
 if(a.bounds)return a.bounds;
 if(a.t==='text'){const w=docTextWidth(a.s,a.size,a.bold),x=a.x-(a.align==='center'?w/2:a.align==='right'?w:0);return {x,y:a.y-a.size*.8,w,h:a.size*.95};}
 if(a.t==='rect'||a.t==='image')return {x:a.x,y:a.y,w:a.w,h:a.h};
 if(a.t==='circle')return {x:a.cx-a.r,y:a.cy-a.r,w:a.r*2,h:a.r*2};
 if(a.t==='path'){const vals=(a.d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)||[]).map(Number),xs=[],ys=[];for(let i=0;i+1<vals.length;i+=2){xs.push(vals[i]);ys.push(vals[i+1]);}if(xs.length)return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
 return null;
}
function stkContentBounds(items){
 const boxes=items.map(stkItemBounds).filter(Boolean);if(!boxes.length)return null;
 const x=Math.min(...boxes.map(a=>a.x)),y=Math.min(...boxes.map(a=>a.y));return {x,y,w:Math.max(...boxes.map(a=>a.x+a.w))-x,h:Math.max(...boxes.map(a=>a.y+a.h))-y};
}
function stkValidFrame(f){return f&&['x','y','w','h'].every(k=>Number.isFinite(+f[k]))&&+f.w>0&&+f.h>0;}
/* Freeze effective automatic typography once, when a block first gets a frame.
   This includes fonts that the automatic renderer reduced to make a line fit. */
function stkSeedBlockFonts(b,d,frame,col){
 const out=[];stkRenderBlock(b,d,frame.x,frame.y,frame.w,col,out);const text=out.filter(a=>a.t==='text'),sz=Math.max(6,+b.size||10),fonts=Object.assign({},b.fonts||{}),set=(k,actual,fallback)=>{if(!(Number.isFinite(+fonts[k])&&+fonts[k]>0))fonts[k]=actual?actual.size:fallback;};
 if(['order','size','stockNo'].includes(b.k)&&text.length)b.size=text[0].size;
 if(b.k==='barcode')set('number',text.find(a=>a.s===d.id),Math.max(7,Math.min(16,sz*.26)));
 if(b.k==='order')set('recut',text.find(a=>d.recut&&a.s===d.recut),Math.max(7,Math.round(sz*.4)));
 if(b.k==='size')set('cut',text.find(a=>/^CUT /.test(a.s)),Math.max(7,Math.round(sz*.34)));
 if(b.k==='makeup')set('heading',d.heading?text.find(a=>a.bold&&a.size!==sz):null,sz*1.2);
 if(b.k==='shape'){set('dims',text.find(a=>a.s!=='SHAPE'),Math.max(6,Math.min(9,Math.round(sz*.11*2)/2)));set('label',text.find(a=>a.s==='SHAPE'),7);}
 if(b.k==='route'){set('route',text[0],Math.max(6,sz*.56));if(!b.valign)b.valign='middle';}
 if(Object.keys(fonts).length)b.fonts=fonts;
}
/* Seed printed blocks from their exact auto-layout boxes. Missing/off blocks get
   a usable frame without moving already printed or previously edited blocks. */
function stkSeedFrames(tpl,size,d){
 const auto=Object.assign({},tpl,{layout:'auto'}),pg=stkLayout(auto,size,d),M=stkMargin(size),inner=pg.w-2*M,byId=new Map(pg.boxes.map(a=>[a.id,a]));
 const demo=typeof stkDemoData==='function'?stkDemoData(d.kind):d,fallback=Object.assign({},demo,d);
 (tpl.blocks||[]).forEach((b,i)=>{
  if(stkValidFrame(b.frame))return;const actual=byId.get(b.id);
  if(actual){b.frame={x:actual.x,y:actual.y,w:actual.w,h:Math.max(1,actual.h)};stkSeedBlockFonts(b,d,b.frame,b.at==='right'?'right':b.at==='left'?'left':'full');return;}
  const col=b.at==='right'?'right':b.at==='left'?'left':'full',w=col==='full'?inner:(inner-10)/2,out=[],h=stkRenderBlock(b,fallback,0,0,w,col,out)||(+b.size||10)*1.25;
  const before=(tpl.blocks||[]).slice(0,i).reverse().find(a=>byId.has(a.id)),after=(tpl.blocks||[]).slice(i+1).find(a=>byId.has(a.id));
  const prev=before&&byId.get(before.id),next=after&&byId.get(after.id),y=b.at==='bottom'?pg.h-M-h:next?next.y:prev?Math.min(pg.h-M-h,prev.y+prev.h+3):M;
  const fh=Math.min(pg.h-2*M,Math.max(4,h));b.frame={x:col==='right'?pg.w-M-w:M,y:Math.max(M,Math.min(pg.h-M-fh,y)),w,h:fh};stkSeedBlockFonts(b,fallback,b.frame,col);
 });return tpl;
}
function stkFixedLayout(tpl,size,d){
 const dims=stkDims(size,tpl.orient),M=stkMargin(size),items=[],boxes=[],issues=[],issue=(b,message)=>{if(!issues.some(a=>a.id===b.id&&a.message===stkBlockLabel(b)+': '+message))issues.push({id:b.id,message:stkBlockLabel(b)+': '+message});};
 const supported=b=>b.on&&(stkBlockDef(b.k)||{types:[]}).types.includes(d.kind);
 const source=(tpl.blocks||[]).some(b=>supported(b)&&!stkValidFrame(b.frame))?stkSeedFrames(Object.assign({},tpl,{blocks:(tpl.blocks||[]).map(b=>Object.assign({},b))}),size,d):tpl;
 const outside=(r,limit)=>r.x<limit.x-.75||r.y<limit.y-.75||r.x+r.w>limit.x+limit.w+.75||r.y+r.h>limit.y+limit.h+.75;
 source.blocks.filter(supported).forEach(b=>{
  const f={x:+b.frame.x,y:+b.frame.y,w:+b.frame.w,h:+b.frame.h},out=[],col=b.at==='right'?'right':b.at==='left'?'left':'full';
  const h=stkRenderBlock(b,d,f.x,f.y,f.w,col,out,{free:true,h:f.h,issue:m=>issue(b,m)});
  let content=stkContentBounds(out);
  if(b.k!=='shape'&&b.k!=='route'&&out.length){const used=Math.max(h,content?content.y+content.h-f.y:0),dy=b.valign==='bottom'?f.h-used:b.valign==='middle'?(f.h-used)/2:0;
   if(dy)out.forEach(a=>{if(a.y!=null)a.y+=dy;if(a.cy!=null)a.cy+=dy;if(a.bounds)a.bounds.y+=dy;});content=stkContentBounds(out);
  }
  if(outside(f,{x:M,y:M,w:dims.w-2*M,h:dims.h-2*M}))issue(b,'Frame is outside the printable area.');
  if(content&&outside(content,f))issue(b,'Content does not fit the frame.');
  if(content&&outside(content,{x:M,y:M,w:dims.w-2*M,h:dims.h-2*M}))issue(b,'Content is outside the printable area.');
  if(stkNeedWidth(b,d)>f.w+.001)issue(b,'Barcode width is below the minimum readable size.');
  items.push(...out);boxes.push(Object.assign({id:b.id,empty:!out.length},f));
 });
 boxes.forEach((a,i)=>boxes.slice(i+1).forEach(b=>{if(!a.empty&&!b.empty&&a.x<b.x+b.w-.5&&b.x<a.x+a.w-.5&&a.y<b.y+b.h-.5&&b.y<a.y+a.h-.5){const first=source.blocks.find(z=>z.id===a.id),second=source.blocks.find(z=>z.id===b.id);issue(first,'Frame overlaps '+stkBlockLabel(second)+'.');issue(second,'Frame overlaps '+stkBlockLabel(first)+'.');}}));
 boxes.forEach(a=>{a.bad=issues.some(v=>v.id===a.id);});return {w:dims.w,h:dims.h,items,boxes,free:0,issues,overflow:issues.map(a=>a.message)};
}
function stkBlockLabel(b){const def=stkBlockDef(b.k);return def?def.label+(b.k==='text'&&b.text?' "'+b.text+'"':''):b.k;}
/* Два прохода: сначала строки и что не влезло, потом отрисовка. Свободное
   место делится между строками (не больше 10 pt на промежуток), чтобы стикер
   не пустовал посередине: «стикер как будто пустует» (владелец). */
function stkLayout(tpl,size,d){
 if(tpl.layout==='free')return stkFixedLayout(tpl,size,d);
 const {w:W,h:H}=stkDims(size,tpl.orient),small=size==='3x4',M=stkMargin(size),gap=small?2.5:3.5,inner=W-2*M,items=[],boxes=[],overflow=[],issues=[];
 const issue=(b,message)=>{if(!issues.some(a=>a.id===b.id&&a.message===stkBlockLabel(b)+': '+message))issues.push({id:b.id,message:stkBlockLabel(b)+': '+message});};
 const blocks=(tpl.blocks||[]).filter(b=>b.on&&(stkBlockDef(b.k)||{types:[]}).types.includes(d.kind));
 const measure=(b,w,col)=>stkRenderBlock(b,d,0,0,w,col,[]);
 const draw=(b,x,y,w,col)=>{const out=[],h=stkRenderBlock(b,d,x,y,w,col,out,{issue:m=>issue(b,m)});if(h){items.push(...out);const frame={id:b.id,x,y,w,h};if(b.fonts&&Object.keys(b.fonts).some(k=>+b.fonts[k]>0)){const c=stkContentBounds(out);if(c&&(c.x<x-.75||c.y<y-.75||c.x+c.w>x+w+.75||c.y+c.h>y+h+.75))issue(b,'Content does not fit the block.');}boxes.push(frame);}return h;};
 /* Низ: блоки Bottom в своём порядке, последний — у самого края. */
 const bottom=blocks.filter(b=>b.at==='bottom'),bh=bottom.map(b=>measure(b,inner,'full')),btotal=bh.reduce((s,h)=>s+(h?h+gap:0),0);
 let by=H-M-Math.max(0,btotal-gap);const floor=btotal?by-gap:H-M;
 bottom.forEach((b,i)=>{if(!bh[i])return;if(by<M)overflow.push(b);else draw(b,M,by,inner,'full');by+=bh[i]+gap;});
 /* Верх: строки Full и группы Left / Right. */
 const top=blocks.filter(b=>b.at!=='bottom'),rows=[];let y=M,i=0;
 while(i<top.length){
  const b=top[i];
  if(b.at==='full'){
   i++;if(stkNeedWidth(b,d)>inner){overflow.push(b);continue;}
   const h=measure(b,inner,'full');if(!h)continue;
   if(y+h>floor+.5){overflow.push(b);continue;}rows.push({b,h});y+=h+gap;continue;
  }
  const left=[],right=[];while(i<top.length&&top[i].at!=='full'&&top[i].at!=='bottom'){(top[i].at==='right'?right:left).push(top[i]);i++;}
  let lw=(inner-10)/2,rw=lw;const room=inner-10-inner*.4;
  const wantR=Math.max(0,...right.map(x=>stkWantWidth(x,d,room))),wantL=Math.max(0,...left.map(x=>stkWantWidth(x,d,room)));
  if(wantR>rw){rw=Math.min(wantR,room);lw=inner-10-rw;}else if(wantL>lw){lw=Math.min(wantL,room);rw=inner-10-lw;}
  /* Длинный номер занимает строку целиком, если колонка потребовала бы
     полосы тоньше минимума. Явные Free frames остаются под контролем автора. */
  if(left.length&&right.length){
   const wide=[...left.filter(x=>x.k==='barcode'&&stkNeedWidth(x,d)>lw),...right.filter(x=>x.k==='barcode'&&stkNeedWidth(x,d)>rw)].filter(x=>stkNeedWidth(x,d)<=inner);
   wide.forEach(b=>{const h=measure(b,inner,'full');if(y+h>floor+.5)overflow.push(b);else{rows.push({b,h});y+=h+gap;}
    for(const list of [left,right]){const at=list.indexOf(b);if(at>=0)list.splice(at,1);}});
   if(wide.length){
    lw=rw=(inner-10)/2;
    /* После отдельной строки штрихкода две колонки делят оставшуюся
       высоту: переносим хвост более высокой колонки, сохраняя кегли. */
    const height=(list,col)=>list.reduce((sum,b)=>{const h=measure(b,lw,col);return sum+(h?h+gap:0);},0);
    while(left.length&&right.length){
     const lh=height(left,'left'),rh=height(right,'right'),from=lh>rh?left:right,to=lh>rh?right:left,b=from[from.length-1],
      fromCol=from===left?'left':'right',toCol=to===left?'left':'right',h=measure(b,lw,fromCol),next=measure(b,lw,toCol),
      tall=Math.max(lh,rh),short=Math.min(lh,rh);
     if(!h||Math.max(tall-h-gap,short+(next?next+gap:0))>=tall-.5)break;
     from.pop();to.unshift(b);
    }
   }
  }
  const solo=!left.length||!right.length,L=left.filter(x=>stkNeedWidth(x,d)>(solo?inner:lw)?(overflow.push(x),false):true),Rr=right.filter(x=>stkNeedWidth(x,d)>(solo?inner:rw)?(overflow.push(x),false):true);
  const lwid=L.length&&!Rr.length?inner:lw,rwid=Rr.length&&!L.length?inner:rw;
  const lh=L.map(x=>measure(x,lwid,'left')),rh=Rr.map(x=>measure(x,rwid,'right')),sum=a=>a.reduce((s,v)=>s+(v?v+gap:0),0),gh=Math.max(sum(lh),sum(rh));
  if(!gh)continue;
  if(y+gh-gap>floor+.5){overflow.push(...L.filter((x,j)=>lh[j]),...Rr.filter((x,j)=>rh[j]));continue;}
  rows.push({L,Rr,lh,rh,lwid,rwid,h:gh-gap});y+=gh;
 }
 const free=floor-(y-gap),spread=rows.length>1&&free>0?Math.min(free/(rows.length-(btotal?0:1)),small?6:10):0;
 let yy=M;
 rows.forEach(r=>{
  if(r.b)draw(r.b,M,yy,inner,'full');
  else{let ly=yy,ry=yy;r.L.forEach((x,j)=>{if(r.lh[j]){draw(x,M,ly,r.lwid,'left');ly+=r.lh[j]+gap;}});r.Rr.forEach((x,j)=>{if(r.rh[j]){draw(x,W-M-r.rwid,ry,r.rwid,'right');ry+=r.rh[j]+gap;}});}
  yy+=r.h+gap+spread;
 });
 boxes.forEach(b=>{b.bad=issues.some(a=>a.id===b.id);});return {w:W,h:H,items,boxes,free:Math.round(free),issues,overflow:overflow.map(stkBlockLabel).concat(issues.map(a=>a.message))};
}
function stkXml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function stkPageSVG(pg,widthCss,heightCss){
 const n=v=>(Math.round(v*100)/100).toString();
 const out=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+pg.w+' '+pg.h+'" width="'+widthCss+'" height="'+heightCss+'" font-family="Helvetica, Arial, sans-serif"><rect width="'+pg.w+'" height="'+pg.h+'" fill="#ffffff"/>'];
 pg.items.forEach(x=>{
  if(x.t==='text')out.push('<text x="'+n(x.x)+'" y="'+n(x.y)+'" font-size="'+n(x.size)+'"'+(x.bold?' font-weight="700"':'')+' fill="'+x.color+'"'+(x.align==='right'?' text-anchor="end"':x.align==='center'?' text-anchor="middle"':'')+' xml:space="preserve">'+stkXml(x.s)+'</text>');
  else if(x.t==='rect')out.push('<rect x="'+n(x.x)+'" y="'+n(x.y)+'" width="'+n(x.w)+'" height="'+n(x.h)+'"'+(x.fill==='none'?' fill="none" stroke="'+x.stroke+'" stroke-width="'+(x.sw||1)+'"':' fill="'+x.fill+'" shape-rendering="crispEdges"')+'/>');
  else if(x.t==='path')out.push('<path d="'+x.d+'" fill="none" stroke="#000000" stroke-width="1.4" stroke-linejoin="round"/>');
  else if(x.t==='circle')out.push('<circle cx="'+n(x.cx)+'" cy="'+n(x.cy)+'" r="'+n(x.r)+'" fill="none" stroke="#000000" stroke-width="1"/>');
  else if(x.t==='image')out.push('<image href="'+stkXml(x.href)+'" x="'+n(x.x)+'" y="'+n(x.y)+'" width="'+n(x.w)+'" height="'+n(x.h)+'" preserveAspectRatio="xMinYMid meet"/>');
 });
 return out.join('')+'</svg>';
}
