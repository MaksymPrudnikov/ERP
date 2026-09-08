/* Frit drawing annotations only. Pitch comes from the original silkscreen
   form (handoff 9л); nothing here changes Shape or cutting geometry. */
const SALES_FRIT_PATTERNS={
 '2 x 2 square':{dx:2,dy:2,stag:false},
 '4 x 4 square':{dx:4,dy:4,stag:false},
 '2 x 4 diamond':{dx:4,dy:2,stag:true}
};
function salesFritDrawingSpecs(shape){
 var line=salesSheetLineOf(shape),mk=line&&soDraft?salesMakeupById(soDraft,line.makeupId):null,out=[];
 var only=typeof salesBridge!=='undefined'&&salesBridge&&salesBridge.liteIndex!=null?salesBridge.liteIndex:null;
 (mk&&mk.panes||[]).forEach(function(p,i){
  if(only!=null&&only!==i)return;
  (p.category==='laminated'?['outer','inner']:['']).forEach(function(side){
   salesRouteSurfaceTreatments(p,i,side).filter(function(t){return t.kind==='frit';}).forEach(function(t){
    out.push({id:'F'+(out.length+1),label:'Lite '+(i+1)+(side?(side==='outer'?'a':'b'):''),paneIndex:i,treatment:t,spec:t.spec});
   });
  });
 });
 return out;
}
/* W/H are measured to the CENTRE of the first dot. For a shaped edge the
   owner has not defined the reference rule, so do not substitute a bbox edge.
   A separate lite contour is likewise not the shared contour on this sheet. */
function salesFritFirstDot(record,shape,result){
 var f=record.spec,P=result&&result.points||[],b=P.length?fabEdgeBounds(P):null;
 if(!b||P.length!==4||P.some(function(p,i){var q=P[(i+1)%P.length];return Math.abs(p[0]-q[0])>1e-6&&Math.abs(p[1]-q[1])>1e-6;}))
  return {valid:false,note:'Setout: review shaped edges'};
 var line=salesSheetLineOf(shape),own=line&&salesLineLiteShape(line,record.paneIndex);
 if(shapeLiteMirrored(shape,record.paneIndex))return {valid:false,note:'Setout: review mirrored lite'};
 if(own&&own.id!==shape.id)return {valid:false,note:'Setout: see lite drawing'};
 var inset=shapeLiteSpec(shape,record.paneIndex);
 if(inset&&inset.inset&&Object.keys(inset.inset).some(function(k){return inch(inset.inset[k])>0;}))return {valid:false,note:'Setout: see lite drawing'};
 var right=String(f.marginFrom).indexOf('right')>=0,top=String(f.marginFrom).indexOf('Top')>=0;
 var w=+f.marginW16/16,h=+f.marginH16/16,edgeX=right?b.maxX:b.minX,edgeY=top?b.maxY:b.minY;
 var x=edgeX+(right?-w:w),y=edgeY+(top?-h:h);
 if(!isFinite(w)||!isFinite(h)||w<0||h<0||x<b.minX||x>b.maxX||y<b.minY||y>b.maxY)return {valid:false,note:'Setout outside glass'};
 return {valid:true,x:x,y:y,edgeX:edgeX,edgeY:edgeY,right:right,top:top,w:w,h:h};
}
function salesFritSvgText(x,y,text,size,anchor){
 return '<text x="'+x+'" y="'+y+'" font-family="Arial, sans-serif" font-size="'+(size||10)+'" text-anchor="'+(anchor||'start')+'" fill="#24313b">'+esc(text)+'</text>';
}
function salesFritSampleSvg(record,x,y,note){
 var f=record.spec,p=SALES_FRIT_PATTERNS[f.pattern],body='',lines=[];
 var sx=22,sy=33,box=116,pad=10,scale=(box-pad*2)/8;
 body+='<rect x="'+sx+'" y="'+sy+'" width="'+box+'" height="'+box+'" fill="#fff" stroke="#a8b0b5" stroke-width="0.6"/>';
 if(p){
  for(var row=0;row*p.dy<=8;row++)for(var col=0;col*p.dx<=8;col++){
   var px=col*p.dx+(p.stag&&row%2?p.dx/2:0);if(px>8)continue;
   body+='<circle class="frit-sample-dot" cx="'+(sx+pad+px*scale)+'" cy="'+(sy+pad+row*p.dy*scale)+'" r="'+Math.max(.6,+f.dotMm/25.4*scale/2)+'" fill="'+(f.color==='White'?'#fff':'#edf0f2')+'" stroke="#111" stroke-width="0.55"/>';
  }
 }else{
  body+=salesFritSvgText(80,86,'CUSTOM',11,'middle')+salesFritSvgText(80,103,'See silk screen sheet',9,'middle');
 }
 lines.push((mdById('fritProduct',f.productId)||{}).name||'Frit',f.pattern, f.color+' · Ø '+f.dotMm+' mm');
 if(p)lines.push('Pitch '+dimIn16(p.dx)+' × '+dimIn16(p.dy)+(p.stag?' · staggered':''));
 lines.push('W '+dimIn16(f.marginW16/16)+' / H '+dimIn16(f.marginH16/16),f.marginFrom+' → dot centre');
 if(f.marking)lines.push('Mark: '+f.marking);
 if(note)lines.push(note);
 var yy=165;
 lines.forEach(function(line){
  /* Production markings are free text: wrap, never truncate. */
  var words=String(line||'').match(/.{1,27}(?:\s|$)|.{1,27}/g)||[''];
  words.forEach(function(part){body+=salesFritSvgText(8,yy,part.trim(),9);yy+=12;});
 });
 var height=yy+3;
 return {height:height,svg:'<g class="frit-pattern-sample" data-frit="'+record.id+'" transform="translate('+x+' '+y+')">'+
  '<rect width="160" height="'+height+'" rx="4" fill="#fff" stroke="#d2d7db" stroke-width="0.7"/>'+
  salesFritSvgText(8,14,record.id+' · '+record.label+' · '+record.treatment.where,10)+
  salesFritSvgText(8,27,'PATTERN SAMPLE',8)+body+'</g>'};
}
function salesFritSetoutSvg(dot,T,ids){
 var x=T.X(dot.x),y=T.Y(dot.y),ex=T.X(dot.edgeX),ey=T.Y(dot.edgeY);
 var dx=dot.right?-1:1,dy=dot.top?1:-1,hY=y+dy*34,vX=x+dx*46;
 var line=function(a,b,c,d,dashed){return '<line x1="'+a+'" y1="'+b+'" x2="'+c+'" y2="'+d+'" stroke="#44515a" stroke-width="0.7"'+(dashed?' stroke-dasharray="3 3"':'')+'/>';};
 var arrow=function(a,b,c,d){
  var angle=Math.atan2(d-b,c-a),s=4,ux=Math.cos(angle),uy=Math.sin(angle),px=-uy,py=ux;
  return line(a,b,c,d,false)+'<path d="M '+(a+ux*s+px*2)+' '+(b+uy*s+py*2)+' L '+a+' '+b+' L '+(a+ux*s-px*2)+' '+(b+uy*s-py*2)+
   ' M '+(c-ux*s+px*2)+' '+(d-uy*s+py*2)+' L '+c+' '+d+' L '+(c-ux*s-px*2)+' '+(d-uy*s-py*2)+'" fill="none" stroke="#44515a" stroke-width="0.8"/>';
 };
 var out=line(ex,y,ex,hY+dy*5,true)+line(x,y,x,hY+dy*5,true)+arrow(ex,hY,x,hY)+
  line(x,ey,vX+dx*5,ey,true)+line(x,y,vX+dx*5,y,true)+arrow(vX,ey,vX,y);
 // Labels sit beyond the short 1-inch segments, so text cannot collide with arrows.
 out+=salesFritSvgText(x+dx*8,hY+dy*13,'W '+dimIn16(dot.w),10,dx<0?'end':'start');
 out+=salesFritSvgText(vX+dx*8,y+dy*13,'H '+dimIn16(dot.h),10,dx<0?'end':'start');
 out+='<circle class="frit-first-dot" data-x="'+dot.x+'" data-y="'+dot.y+'" cx="'+x+'" cy="'+y+'" r="2.5" fill="#fff" stroke="#111" stroke-width="0.8"/>';
 out+=line(x-5,y,x+5,y,false)+line(x,y-5,x,y+5,false);
 out+=salesFritSvgText(x+dx*8,y-dy*9,ids,10,dx<0?'end':'start');
 return '<g class="frit-setout" pointer-events="none">'+out+'</g>';
}
function salesFritDecorateSvg(svg,shape,result,T){
 if(!T||!svg||svg.indexOf('data-frit-decorated')>=0)return svg;
 var records=salesFritDrawingSpecs(shape);if(!records.length)return svg;
 var x=T.vw+12,y=Math.max(36,T.Y(T.b.maxY)),extra='',dots={};
 records.forEach(function(r){
  var dot=salesFritFirstDot(r,shape,result),sample=salesFritSampleSvg(r,x,y,dot.valid?'':dot.note);
  extra+=sample.svg;y+=sample.height+10;
  if(dot.valid){var key=[dot.x,dot.y,dot.edgeX,dot.edgeY].join('|');if(!dots[key])dots[key]={dot:dot,ids:[]};dots[key].ids.push(r.id);}
 });
 Object.keys(dots).forEach(function(k){extra+=salesFritSetoutSvg(dots[k].dot,T,dots[k].ids.join(', '));});
 var height=Math.max(T.vh,y+12),width=x+172;
 svg=svg.replace('<svg ','<svg data-frit-decorated="true" ').replace(/viewBox="[^"]+"/,'viewBox="0 0 '+width+' '+height+'"');
 return svg.replace('</svg>',extra+'</svg>');
}
