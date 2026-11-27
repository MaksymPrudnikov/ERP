/* Пометки frit на чертеже — и только они. Шаг берётся из исходного бланка
   silkscreen (хендофф 9л); здесь ничего не меняет Shape и геометрию реза.
   IN : SVG чертежа строки, стекло с frit (erp/masterdata/glass)
   OUT: salesFritDecorateSvg — чертёж с пометками frit для печати (erp/sales/print-*) */
/* Ромб (stag): в ряду точки через dx, ряды через dy, каждый второй ряд сдвинут
   на dx/2 — ромб dx в ширину и 2·dy в высоту. */
const SALES_FRIT_PATTERNS={
 '2 x 2 square':{dx:2,dy:2,stag:false},
 '4 x 4 square':{dx:4,dy:4,stag:false},
 '2 x 2 diamond':{dx:2,dy:1,stag:true},
 '4 x 4 diamond':{dx:4,dy:2,stag:true}
};
function salesFritDrawingSpecs(shape){
 var line=salesSheetLineOf(shape),order=salesSheetOrder(),mk=line&&order?salesMakeupById(order,line.makeupId):null,out=[];
 var only=typeof salesBridge!=='undefined'&&salesBridge&&salesBridge.liteIndex!=null?salesBridge.liteIndex:null;
 (mk&&mk.panes||[]).forEach(function(p,i){
  if(only!=null&&only!==i)return;
  (p.category==='laminated'?salesLamSides(p):['']).forEach(function(side){
   salesRouteSurfaceTreatments(p,i,side).filter(function(t){return t.kind==='frit';}).forEach(function(t){
    out.push({id:'F'+(out.length+1),label:'Lite '+(i+1)+(side?salesLamLetter(p,side):''),paneIndex:i,treatment:t,spec:t.spec});
   });
  });
 });
 return out;
}
/* Где вертикаль x (или горизонталь y) пересекает контур: нижняя/верхняя,
   левая/правая точка кромки. null — линия стекла не задевает. */
function salesFritEdgeY(P,x,top){
 var best=null;
 for(var i=0;i<P.length;i++){
  var a=P[i],b=P[(i+1)%P.length],y;
  if((a[0]-x)*(b[0]-x)>0)continue;
  if(a[0]===b[0])y=top?Math.max(a[1],b[1]):Math.min(a[1],b[1]);else y=a[1]+(x-a[0])*(b[1]-a[1])/(b[0]-a[0]);
  if(best===null||(top?y>best:y<best))best=y;
 }
 return best;
}
function salesFritEdgeX(P,y,right){
 var best=null;
 for(var i=0;i<P.length;i++){
  var a=P[i],b=P[(i+1)%P.length],x;
  if((a[1]-y)*(b[1]-y)>0)continue;
  if(a[1]===b[1])x=right?Math.max(a[0],b[0]):Math.min(a[0],b[0]);else x=a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]);
  if(best===null||(right?x>best:x<best))best=x;
 }
 return best;
}
/* W/H are measured to the CENTRE of the first dot, from the glass edges
   (owner, 16.10.2026): H straight up/down from the edge under the dot, W
   straight across from the edge at the dot's height. On a rectangle that is
   the corner itself; on a raked side, an arc or a DXF contour the dot keeps
   the same distances to the real edges. The dot is found along the corner
   side: the first x where "edge + W" lands back on itself.
   A separate lite contour is still not the shared contour on this sheet. */
function salesFritSetoutPoint(P,right,top,w,h){
 var b=fabEdgeBounds(P),step=function(x){
  var ey=salesFritEdgeY(P,x,top);if(ey===null)return null;
  var y=ey+(top?-h:h),ex=salesFritEdgeX(P,y,right);if(ex===null)return null;
  return {x:ex+(right?-w:w),y:y,edgeX:ex,edgeY:ey};
 };
 var x=right?b.maxX-w:b.minX+w,s=step(x);
 if(s&&s.x===x)return s;
 var n=512,lo=right?b.maxX:b.minX,hi=right?b.minX:b.maxX,prev=null;
 for(var i=0;i<=n;i++){
  x=lo+(hi-lo)*i/n;s=step(x);if(!s){prev=null;continue;}
  var f=(s.x-x)*(right?-1:1),cur={x:x,f:f};
  if(Math.abs(f)<1e-9)return s;
  if(prev&&prev.f>0&&f<0){
   var a=prev.x,z=x;
   for(var k=0;k<60;k++){var m=(a+z)/2,sm=step(m);if(!sm)break;if((sm.x-m)*(right?-1:1)>0)a=m;else z=m;}
   s=step((a+z)/2);if(s&&Math.abs(s.x-(a+z)/2)<1e-6)return s;
  }
  prev=cur;
 }
 return null;
}
function salesFritOnGlass(p,P){
 if(fabPointInPoly(p,P))return true;
 for(var i=0;i<P.length;i++)if(fabPointSegDistance(p,P[i],P[(i+1)%P.length])<1e-6)return true;
 return false;
}
function salesFritFirstDot(record,shape,result){
 var f=record.spec,P=result&&result.points||[];
 if(P.length<3)return {valid:false,note:'Setout outside glass'};
 var line=salesSheetLineOf(shape),own=line&&salesLineLiteShape(line,record.paneIndex);
 if(shapeLiteMirrored(shape,record.paneIndex))return {valid:false,note:'Setout: review mirrored lite'};
 if(own&&own.id!==shape.id)return {valid:false,note:'Setout: see lite drawing'};
 var inset=shapeLiteSpec(shape,record.paneIndex);
 if(inset&&inset.inset&&Object.keys(inset.inset).some(function(k){return inch(inset.inset[k])>0;}))return {valid:false,note:'Setout: see lite drawing'};
 var right=String(f.marginFrom).indexOf('right')>=0,top=String(f.marginFrom).indexOf('Top')>=0;
 var w=+f.marginW16/16,h=+f.marginH16/16;
 if(!isFinite(w)||!isFinite(h)||w<0||h<0)return {valid:false,note:'Setout outside glass'};
 var s=salesFritSetoutPoint(P,right,top,w,h);
 if(!s||!salesFritOnGlass([s.x,s.y],P))return {valid:false,note:'Setout outside glass'};
 return {valid:true,x:s.x,y:s.y,edgeX:s.edgeX,edgeY:s.edgeY,right:right,top:top,w:w,h:h};
}
function salesFritSvgText(x,y,text,size,anchor){
 return '<text x="'+x+'" y="'+y+'" font-family="Arial, sans-serif" font-size="'+(size||10)+'" text-anchor="'+(anchor||'start')+'" fill="#24313b">'+esc(text)+'</text>';
}
/* k — масштаб образца: в середине стекла он крупнее (владелец 27.11.2026:
   «чтобы легко читалось»); ширина образца — 160 × k. */
function salesFritSampleSvg(record,x,y,note,k){
 var f=record.spec,p=SALES_FRIT_PATTERNS[f.pattern],body='',lines=[];
 var sx=22,sy=33,box=116,pad=10,scale=(box-pad*2)/8;
 body+='<rect x="'+sx+'" y="'+sy+'" width="'+box+'" height="'+box+'" fill="#fff" stroke="#a8b0b5" stroke-width="0.6"/>';
 if(p){
  for(var row=0;row*p.dy<=8;row++)for(var col=0;col*p.dx<=8;col++){
   var px=col*p.dx+(p.stag&&row%2?p.dx/2:0);if(px>8)continue;
   /* Точки образца — чётко на бумаге (владелец 27.11.2026: «точка — более чётко»). */
   body+='<circle class="frit-sample-dot" cx="'+(sx+pad+px*scale)+'" cy="'+(sy+pad+row*p.dy*scale)+'" r="'+Math.max(2.3,+f.dotMm/25.4*scale/2)+'" fill="'+(f.color==='White'?'#9aa3aa':'#3d464d')+'" stroke="#111" stroke-width="1.1"/>';
  }
 }else{
  body+=salesFritSvgText(80,86,'CUSTOM',11,'middle')+salesFritSvgText(80,103,'See silk screen sheet',9,'middle');
 }
 lines.push((mdById('fritProduct',f.productId)||{}).name||'Frit',f.pattern, f.color+' · Ø '+f.dotMm+' mm');
 if(p)lines.push('Pitch '+dimPrintText(p.dx)+' × '+dimPrintText(p.dy)+(p.stag?' · staggered':''));
 lines.push('W '+dimPrintText(f.marginW16/16)+' / H '+dimPrintText(f.marginH16/16),f.marginFrom+' → dot centre');
 if(f.marking)lines.push('Mark: '+f.marking);
 if(note)lines.push(note);
 var yy=165;
 lines.forEach(function(line){
  /* Production markings are free text: wrap, never truncate. */
  var words=String(line||'').match(/.{1,27}(?:\s|$)|.{1,27}/g)||[''];
  words.forEach(function(part){body+=salesFritSvgText(8,yy,part.trim(),9);yy+=12;});
 });
 var height=yy+3;k=k||1;
 return {height:height*k,width:160*k,svg:'<g class="frit-pattern-sample" data-frit="'+record.id+'" transform="translate('+x+' '+y+')'+(k!==1?' scale('+k+')':'')+'">'+
  '<rect width="160" height="'+height+'" rx="4" fill="#fff" stroke="#d2d7db" stroke-width="0.7"/>'+
  salesFritSvgText(8,14,record.id+' · '+record.label+' · '+record.treatment.where,10)+
  salesFritSvgText(8,27,'PATTERN SAMPLE',8)+body+'</g>'};
}
/* Размеры W / H от кромки до первой точки — крупно и жирно (владелец
   27.11.2026: «там, где 1″ от края, — увеличить, чтобы чётко и ясно»). */
function salesFritSetoutSvg(dot,T,ids){
 var x=T.X(dot.x),y=T.Y(dot.y),ex=T.X(dot.edgeX),ey=T.Y(dot.edgeY);
 var dx=dot.right?-1:1,dy=dot.top?1:-1,hY=y+dy*62,vX=x+dx*86;
 var line=function(a,b,c,d,dashed){return '<line x1="'+a+'" y1="'+b+'" x2="'+c+'" y2="'+d+'" stroke="#24313b" stroke-width="'+(dashed?1:1.3)+'"'+(dashed?' stroke-dasharray="4 3"':'')+'/>';};
 var arrow=function(a,b,c,d){
  var angle=Math.atan2(d-b,c-a),s=6,ux=Math.cos(angle),uy=Math.sin(angle),px=-uy,py=ux;
  return line(a,b,c,d,false)+'<path d="M '+(a+ux*s+px*3)+' '+(b+uy*s+py*3)+' L '+a+' '+b+' L '+(a+ux*s-px*3)+' '+(b+uy*s-py*3)+
   ' M '+(c-ux*s+px*3)+' '+(d-uy*s+py*3)+' L '+c+' '+d+' L '+(c-ux*s-px*3)+' '+(d-uy*s-py*3)+'" fill="none" stroke="#24313b" stroke-width="1.3"/>';
 };
 var big=function(tx,ty,text,anchor){return '<text x="'+tx+'" y="'+ty+'" font-family="Arial, sans-serif" font-size="22" font-weight="700" text-anchor="'+anchor+'" fill="#111">'+esc(text)+'</text>';};
 var out=line(ex,y,ex,hY+dy*6,true)+line(x,y,x,hY+dy*6,true)+arrow(ex,hY,x,hY)+
  line(x,ey,vX+dx*6,ey,true)+line(x,y,vX+dx*6,y,true)+arrow(vX,ey,vX,y);
 // Labels sit beyond the short 1-inch segments, so text cannot collide with arrows.
 out+=big(x+dx*10,hY+dy*26,'W '+dimPrintText(dot.w),dx<0?'end':'start');
 out+=big(vX+dx*10,y+dy*26,'H '+dimPrintText(dot.h),dx<0?'end':'start');
 /* Первая точка — крупно и жирно: место начала видно сразу. */
 out+='<circle class="frit-first-dot" data-x="'+dot.x+'" data-y="'+dot.y+'" cx="'+x+'" cy="'+y+'" r="5" fill="#9aa3aa" stroke="#111" stroke-width="1.5"/>';
 out+=line(x-9,y,x+9,y,false)+line(x,y-9,x,y+9,false);
 out+=salesFritSvgText(x+dx*9,y-dy*11,ids,14,dx<0?'end':'start');
 return '<g class="frit-setout" pointer-events="none">'+out+'</g>';
}
/* Образец паттерна — в середине стекла (владелец 27.11.2026: «квадрат
   разместить на центр стекла, чтобы он не съедал борта»): справа место не
   занято, чертёж на листе крупнее. Не помещается внутри контура (маленькое
   стекло, узкая фигура, рядом точка начала) — стоит справа, как раньше. */
function salesFritSampleFit(T,P,w,h,avoid){
 if(!P||P.length<3)return null;
 var Q=P.map(function(q){return [T.X(q[0]),T.Y(q[1])];}),b=fabEdgeBounds(Q),pad=12;
 var x=(b.minX+b.maxX)/2-w/2,y=(b.minY+b.maxY)/2-h/2,x0=x-pad,y0=y-pad,x1=x+w+pad,y1=y+h+pad,pts=[];
 for(var i=0;i<=4;i++){pts.push([x0+(x1-x0)*i/4,y0],[x0+(x1-x0)*i/4,y1],[x0,y0+(y1-y0)*i/4],[x1,y0+(y1-y0)*i/4]);}
 if(!pts.every(function(q){return fabPointInPoly(q,Q);}))return null;
 if(Q.some(function(q){return q[0]>x0&&q[0]<x1&&q[1]>y0&&q[1]<y1;}))return null;
 if((avoid||[]).some(function(d){var px=T.X(d.x),py=T.Y(d.y);return px>x0-150&&px<x1+150&&py>y0-110&&py<y1+110;}))return null;
 return {x:x,y:y};
}
function salesFritDecorateSvg(svg,shape,result,T){
 if(!T||!svg||svg.indexOf('data-frit-decorated')>=0)return svg;
 var records=salesFritDrawingSpecs(shape);if(!records.length)return svg;
 var extra='',dots={},rows=records.map(function(r){return {r:r,dot:salesFritFirstDot(r,shape,result)};});
 rows.forEach(function(x){var dot=x.dot;if(dot.valid){var key=[dot.x,dot.y,dot.edgeX,dot.edgeY].join('|');if(!dots[key])dots[key]={dot:dot,ids:[]};dots[key].ids.push(x.r.id);}});
 var avoid=Object.keys(dots).map(function(k){return dots[k].dot;}),gap=10;
 var stack=function(k){return rows.reduce(function(s,x){return s+salesFritSampleSvg(x.r,0,0,x.dot.valid?'':x.dot.note,k).height;},0)+gap*(rows.length-1);};
 /* Крупнее, пока помещается: ×1.6 … ×0.8. */
 var at=null,k=1.6;
 while(k>=.8){at=salesFritSampleFit(T,result&&result.points,160*k,stack(k),avoid);if(at)break;k=Math.round((k-.1)*10)/10;}
 if(!at)k=1;
 var x=at?at.x:T.vw+12,y=at?at.y:Math.max(36,T.Y(T.b.maxY));
 rows.forEach(function(row){
  var sample=salesFritSampleSvg(row.r,x,y,row.dot.valid?'':row.dot.note,k);
  extra+=sample.svg;y+=sample.height+gap;
 });
 Object.keys(dots).forEach(function(key){extra+=salesFritSetoutSvg(dots[key].dot,T,dots[key].ids.join(', '));});
 if(!at){var height=Math.max(T.vh,y+12),width=x+172;
  svg=svg.replace(/viewBox=("[^"]+"|'[^']+')/,'viewBox="0 0 '+width+' '+height+'"');}
 svg=svg.replace('<svg ','<svg data-frit-decorated="true"'+(at?' data-frit-inside="true"':'')+' ');
 return svg.replace('</svg>',extra+'</svg>');
}
