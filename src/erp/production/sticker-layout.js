/* =====================================================================
   erp/production/sticker-layout  ·  stickers-1.0
   Раскладка стикера по шаблону и SVG для предпросмотра и печати.
   IN : шаблон {orient, blocks}, размер 4x6 | 3x4, модель стикера
   OUT: {w, h, items, boxes, overflow} в pt; stkPageSVG

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
function stkAlignOf(b,col){if(b.align&&b.align!=='auto')return b.align;if(col==='right')return 'right';return b.k==='barcode'?'center':'left';}
/* Один блок в прямоугольнике x, y, w. Возвращает высоту в pt (0 — печатать нечего). */
function stkRenderBlock(b,d,x,y,w,col,out){
 const det=b.details||{},sz=Math.max(6,+b.size||10),bold=!!b.bold,R=x+w,A=stkAlignOf(b,col),K='#000000',Wt='#ffffff';
 const ax=tw=>A==='right'?R-tw:A==='center'?x+(w-tw)/2:x;
 const put=(s,xx,yy,size,bld,color)=>out.push({t:'text',s,x:xx,y:yy,size,bold:bld,color:color||K,align:''});
 const line=(s,yy,size,bld)=>{const t=stkFit(s,size,bld,w);put(t,ax(docTextWidth(t,size,bld)),yy,size,bld);};
 const para=(s,size,bld,n)=>{const ls=stkWrap(String(s||''),size,bld,w).filter(Boolean).slice(0,n||2);ls.forEach((t,i)=>line(t,y+size*.9+i*size*1.18,size,bld));return ls.length?ls.length*size*1.18+size*.15:0;};
 const rect=(xx,yy,ww,hh,o)=>out.push(Object.assign({t:'rect',x:xx,y:yy,w:ww,h:hh,fill:K},o||{}));
 /* Номер заказа и размер не обрезаются многоточием — кегль уменьшается. */
 const shrink=(s,size,bld,max)=>{let f=size;while(f>6&&docTextWidth(s,f,bld)>max)f-=.5;return f;};
 switch(b.k){
  case 'company':{
   const c=DB.company||{},name=det.name?String(c.legalName||'').toUpperCase():'',logo=det.logo&&c.logo?c.logo:'';if(!name&&!logo)return 0;
   const info=logo&&typeof docJpegInfo==='function'?docJpegInfo(logo):null,lh=sz*1.9,lw=logo?Math.min(w*.5,info&&info.h?lh*info.w/info.h:lh*2):0;
   const nm=name?stkFit(name,sz,bold,w-(logo?lw+6:0)):'',tw=lw+(logo&&nm?6:0)+(nm?docTextWidth(nm,sz,bold):0),sx=ax(tw);
   if(logo)out.push({t:'image',href:logo,x:sx,y,w:lw,h:lh});
   if(nm)put(nm,sx+(logo?lw+6:0),y+(logo?lh/2+sz*.35:sz*.9),sz,bold);
   return logo?lh+2:sz*1.15;}
  case 'batch':{if(!d.batch)return 0;line(d.batch,y+sz*.9,sz,bold);return sz*1.15;}
  case 'barcode':{
   if(!d.id)return 0;const m=stkBarModule(d.id,w);if(!m)return 0;
   const bw=barcode128Width(d.id)*m,bx=ax(bw),ns=Math.max(7,Math.min(16,sz*.26));
   barcode128Items(d.id,bx,y,sz,m).forEach(r=>out.push(Object.assign(r,{fill:K})));
   if(det.number){out.push({t:'text',s:d.id,x:bx+bw/2,y:y+sz+ns+1,size:ns,bold:true,color:K,align:'center'});return sz+ns+4;}
   return sz+2;}
  case 'order':{
   const t=d.order+(det.line?' / '+d.line:''),rs=Math.max(7,Math.round(sz*.4)),tag=det.recut&&d.recut?docTextWidth(d.recut,rs,true)+rs:0,f=shrink(t,sz,bold,w-(tag?tag+8:0)),tw=docTextWidth(t,f,bold),sx=ax(tw+(tag?tag+8:0));
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
   if(!d.rows)return 0;let yy=y;const hs=sz*1.2;
   const head=[det.heading&&d.heading,det.thickness&&d.thicknessMm?d.thicknessMm.toFixed(1)+' mm':''].filter(Boolean).join(' · ');
   if(head){const t=stkFit(head,hs,true,w);put(t,ax(docTextWidth(t,hs,true)),yy+hs*.9,hs,true);yy+=hs*1.25;}
   if(det.code&&d.code){stkWrap(d.code,sz,false,w).filter(Boolean).slice(0,2).forEach(t=>{put(t,x,yy+sz*.9,sz,false);yy+=sz*1.2;});}
   const lab=docTextWidth('Space',sz,true)+sz*.8;
   d.rows.concat(det.muntin&&d.muntin?[{kind:'muntin',label:'Grid',text:d.muntin}]:[]).forEach(r=>{
    const t=r.kind==='muntin'?r.text:stkMakeupRowText(r,det);if(!t)return;
    put(r.label,x,yy+sz*.9,sz,true);
    stkWrap(t,sz,bold,w-lab).filter(Boolean).slice(0,2).forEach(s=>{put(s,x+lab,yy+sz*.9,sz,bold);yy+=sz*1.2;});
   });
   return yy-y;}
  case 'size':{
   /* Крупно — готовый размер; мелко под ним — размер до обработки кромки,
      если он другой. */
   const dim=d.finished;if(!dim)return 0;const t=frac16(dim.w)+' × '+frac16(dim.h)+'″',f=shrink(t,sz,bold,w);
   put(t,ax(docTextWidth(t,f,bold)),y+sz*.82,f,bold);
   if(!det.cut||!d.cut)return sz*.98;
   const cs=Math.max(7,Math.round(sz*.34)),ct='CUT '+frac16(d.cut.w)+' × '+frac16(d.cut.h)+'″',cf=shrink(ct,cs,true,w);
   put(ct,ax(docTextWidth(ct,cf,true)),y+sz*.82+cs*1.15,cf,true);return sz*.98+cs*1.25;}
  case 'area':{if(d.area==null)return 0;line(d.area.toFixed(2)+' ft²',y+sz*.9,sz,bold);return sz*1.2;}
  case 'weight':{if(!d.weight)return 0;line(stkFmtKg(d.weight),y+sz*.9,sz,bold);return sz*1.2;}
  case 'shape':{
   if(!d.shape)return 0;const side=Math.min(w,sz),bx=ax(side),pts=d.shape.points,xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
   const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),pad=det.letters?9:2,inner=side-2*pad,k=Math.min(inner/((maxX-minX)||1),inner/((maxY-minY)||1));
   const ox=bx+pad+(inner-(maxX-minX)*k)/2,oy=y+pad+(inner-(maxY-minY)*k)/2,px=v=>ox+(v-minX)*k,py=v=>oy+(maxY-v)*k,path=list=>'M'+list.map(p=>px(p[0]).toFixed(2)+' '+py(p[1]).toFixed(2)).join('L')+'Z';
   out.push({t:'path',d:path(pts)});
   (d.shape.polys||[]).forEach(pg=>out.push({t:'path',d:path(pg)}));
   (d.shape.holes||[]).forEach(h=>out.push({t:'circle',cx:px(h.x),cy:py(h.y),r:Math.max(1.2,h.d*k/2)}));
   if(det.letters){const ls=7,cx=bx+side/2,cy=y+side/2;[['A',bx+1,cy+2.5,''],['B',cx,y+side-1,'center'],['C',bx+side-1,cy+2.5,'right'],['D',cx,y+ls,'center']].forEach(a=>out.push({t:'text',s:a[0],x:a[1],y:a[2],size:ls,bold:true,color:K,align:a[3]}));}
   if(det.label){out.push({t:'text',s:'SHAPE',x:bx+side/2,y:y+side+8,size:7,bold:true,color:K,align:'center'});return side+10;}
   return side+2;}
  case 'route':{
   if(!d.route)return 0;const codes=det.shipping?d.route.codes:d.route.codes.filter(c=>!(d.route.shipping||[]).includes(c)),t=codes.join(' > ');let fs=Math.max(6,sz*.56);
   while(fs>6&&docTextWidth(t,fs,true)>w-10)fs-=.5;rect(x,y,w,sz);out.push({t:'text',s:t,x:x+w/2,y:y+sz/2+fs*.36,size:fs,bold:true,color:Wt,align:'center'});return sz+1;}
  case 'services':{
   const list=d.route?d.route.services:[];if(!list.length)return 0;
   const box=det.boxes?sz*.85:0,gap=box?sz*.45:0,rows=[[]];let used=0;
   list.forEach(s=>{const t=stkFit((det.station?s.station+' · ':'')+s.text,sz,bold,w-box-gap),ww=box+gap+docTextWidth(t,sz,bold);
    if(rows[rows.length-1].length&&used+sz+ww>w){rows.push([]);used=0;}const row=rows[rows.length-1];used+=(row.length?sz:0)+ww;row.push({t,ww});});
   rows.forEach((row,i)=>{const cy=y+sz*.9+i*sz*1.35;let cx=ax(row.reduce((a,r,j)=>a+r.ww+(j?sz:0),0));
    row.forEach(r=>{if(box)rect(cx,cy-box*.95,box,box,{fill:'none',stroke:K,sw:1});put(r.t,cx+box+gap,cy,sz,bold);cx+=r.ww+sz;});});
   return rows.length*sz*1.35-sz*.05;}
  case 'divider':{const t=Math.max(.5,+b.size||1);rect(x,y+2,w,t);return t+4;}
  case 'text':{const t=stkFill(b.text,d).trim();if(!t)return 0;return para(t,sz,bold,2);}
 }
 return 0;
}
function stkBlockLabel(b){const def=stkBlockDef(b.k);return def?def.label+(b.k==='text'&&b.text?' "'+b.text+'"':''):b.k;}
/* Два прохода: сначала строки и что не влезло, потом отрисовка. Свободное
   место делится между строками (не больше 10 pt на промежуток), чтобы стикер
   не пустовал посередине: «стикер как будто пустует» (владелец). */
function stkLayout(tpl,size,d){
 const {w:W,h:H}=stkDims(size,tpl.orient),small=size==='3x4',M=stkMargin(size),gap=small?2.5:3.5,inner=W-2*M,items=[],boxes=[],overflow=[];
 const blocks=(tpl.blocks||[]).filter(b=>b.on&&(stkBlockDef(b.k)||{types:[]}).types.includes(d.kind));
 const measure=(b,w,col)=>stkRenderBlock(b,d,0,0,w,col,[]);
 const draw=(b,x,y,w,col)=>{const out=[],h=stkRenderBlock(b,d,x,y,w,col,out);if(h){items.push(...out);boxes.push({id:b.id,x,y,w,h});}return h;};
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
  if(wantR>rw){rw=wantR;lw=inner-10-rw;}else if(wantL>lw){lw=wantL;rw=inner-10-lw;}
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
 return {w:W,h:H,items,boxes,free:Math.round(free),overflow:overflow.map(stkBlockLabel)};
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
