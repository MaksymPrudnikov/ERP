/* =====================================================================
   shape/dxf-import · DXF-файл → готовый контур Production Shape
   Владелец, 16.10.2026: загрузка должна принимать то, что даёт нормальный
   CAD, а не один LWPOLYLINE из прямых. Файл «U2 OF 2.dxf» из Fusion — дуги
   bulge в LWPOLYLINE — раньше отклонялся целиком.

   Что читается: LWPOLYLINE (с дугами bulge), старый POLYLINE с VERTEX, LINE,
   ARC, CIRCLE, ELLIPSE, SPLINE, INSERT (блоки, вложенные до 4 уровней).
   Надписи, размеры, точки и штриховка — не стекло, их пропускаем молча.
   Paper space и слои, выключенные или замороженные в CAD, тоже пропускаем:
   в CAD их не видно.

   Главное правило (владелец, 16.10.2026): «загрузка DXF должна быть
   идентична тому, что есть на фигуре, ни при каких раскладах не влиять».
   Что нельзя прочитать точно, не читается вовсе — с ответом, почему.

   Как собирается стекло. Отдельные линии и дуги сшиваются концами; зазор
   до 0.001″ — неточность записи чисел, он закрывается, больше — ошибка с
   местом разрыва. Самый большой замкнутый контур — стекло. Круг внутри —
   отверстие с центром и диаметром точно из файла (владелец: «если мы
   целенаправленно загрузим фигуру с отверстиями, то отверстия нужно
   принять»). Другую фигуру внутри DXF-стекло не умеет — такой файл не
   принимается: стекло без выреза было бы уже не тем, что в файле. Второй
   контур снаружи — второе стекло: файл на одно стекло. Сплайн только по
   точкам прохода не принимается: CAD строит его по своему правилу, и наша
   кривая через те же точки была бы другой.

   Единицы: цех готовит файлы в дюймах; файл без единиц читается в дюймах.
   Явные мм/см/м/футы пересчитываются, и об этом сказано.

   Кривые раскладываются на точки с прогибом хорды не больше 1/2048″ — та же
   точность, что у круга и эллипса в пресетах; станочный экспорт сам
   сворачивает такие точки обратно в дуги. Физическая кромка — объект файла
   (линия, дуга, сплайн), а не каждый маленький отрезок: preview.segments
   хранит, с какой точки начинается кромка.
   ===================================================================== */
const SHAPE_DXF_UNIT_INCHES={0:1,1:1,2:12,4:1/25.4,5:1/2.54,6:1000/25.4};
const SHAPE_DXF_UNIT_NAMES={2:'feet',4:'mm',5:'cm',6:'m'};
const SHAPE_DXF_SAG=1/2048,SHAPE_DXF_GAP=0.001;
const SHAPE_DXF_SOLIDS=['3DSOLID','REGION','BODY','SURFACE','MESH'];

function shapeDxfFail(message){return {ok:false,error:message};}
function shapeDxfNum(v,d){var n=parseFloat(v);return isFinite(n)?n:(d==null?0:d);}
function shapeDxfGet(e,code,d){for(var i=0;i<e.groups.length;i++)if(e.groups[i].code===code)return e.groups[i].value;return d;}
function shapeDxfNumOf(e,code,d){return shapeDxfNum(shapeDxfGet(e,code,null),d);}

/* Пары «код — значение» и разбивка на секции и объекты. */
function shapeDxfReadPairs(text){
  var lines=text.replace(/\r\n?/g,'\n').split('\n'),pairs=[];
  for(var i=0;i+1<lines.length;i+=2){
    var c=lines[i].trim();if(c==='')break;
    var code=parseInt(c,10);if(!isFinite(code)||!/^-?\d+$/.test(c))return null;
    pairs.push({code:code,value:lines[i+1].trim()});
  }
  return pairs;
}
function shapeDxfSections(pairs){
  var out={},name=null,list=null;
  for(var i=0;i<pairs.length;i++){
    var q=pairs[i];
    if(q.code===0&&q.value==='SECTION'){name=pairs[i+1]&&pairs[i+1].code===2?pairs[i+1].value:'';list=[];i++;continue;}
    if(q.code===0&&q.value==='ENDSEC'){if(name!==null)out[name]=list;name=null;list=null;continue;}
    if(list)list.push(q);
  }
  return out;
}
/* Объект = код 0 и всё до следующего кода 0. VERTEX/SEQEND старого POLYLINE
   уходят внутрь своего POLYLINE, атрибуты INSERT — пропускаются. */
function shapeDxfEntities(pairs){
  var out=[],cur=null,poly=null,insert=false;
  pairs.forEach(function(q){
    if(q.code===0){
      if(q.value==='VERTEX'&&poly){cur={type:'VERTEX',groups:[]};poly.vertices.push(cur);return;}
      if(q.value==='ATTRIB'&&insert){cur={type:'ATTRIB',groups:[]};return;}
      if(q.value==='SEQEND'){poly=null;insert=false;cur={type:'SEQEND',groups:[]};return;}
      cur={type:q.value,groups:[]};out.push(cur);
      poly=q.value==='POLYLINE'?cur:null;if(poly)poly.vertices=[];
      insert=q.value==='INSERT';
      return;
    }
    if(cur)cur.groups.push(q);
  });
  return out;
}
function shapeDxfHiddenLayers(sections){
  var hidden=Object.create(null),t=sections.TABLES||[],layer=null;
  shapeDxfEntities(t).forEach(function(e){
    if(e.type!=='LAYER')return;
    var name=String(shapeDxfGet(e,2,'')),flags=shapeDxfNumOf(e,70,0),color=shapeDxfNumOf(e,62,7);
    if((flags&1)||color<0)hidden[name.toUpperCase()]=true;
  });
  return hidden;
}
function shapeDxfBlocks(sections){
  var blocks=Object.create(null),cur=null;
  shapeDxfEntities(sections.BLOCKS||[]).forEach(function(e){
    if(e.type==='BLOCK'){cur={name:String(shapeDxfGet(e,2,'')).toUpperCase(),base:[shapeDxfNumOf(e,10,0),shapeDxfNumOf(e,20,0)],entities:[]};blocks[cur.name]=cur;return;}
    if(e.type==='ENDBLK'){cur=null;return;}
    if(cur)cur.entities.push(e);
  });
  return blocks;
}

/* ---------- кривые → точки ---------- */
function shapeDxfArcSteps(r,sweep){
  var step=r>SHAPE_DXF_SAG?2*Math.acos(Math.max(-1,1-SHAPE_DXF_SAG/r)):Math.PI/36;
  step=Math.min(step,Math.PI/36);
  return Math.max(1,Math.ceil(Math.abs(sweep)/step));
}
/* Крайние точки дуги (0°, 90°, 180°, 270°) всегда в раскладке: иначе вершина
   арки ложится на хорду на 1/2048″ ниже, и габарит на границе 1/16″
   округляется вниз (случайный прогон 16.10.2026: 825/16 вместо 826/16).
   Обычная точка ближе четверти шага к крайней уступает ей место. */
function shapeDxfArcPoints(cx,cy,r,a0,sweep){
  var n=shapeDxfArcSteps(r,sweep),step=Math.abs(sweep)/n,ts=[],lo=Math.min(a0,a0+sweep),hi=Math.max(a0,a0+sweep),q=Math.PI/2,k,i;
  var extremes=[];for(k=Math.ceil(lo/q-1e-12);k*q<=hi+1e-12;k++){var d=Math.abs(k*q-a0);if(d>1e-9&&Math.abs(d-Math.abs(sweep))>1e-9)extremes.push(d);}
  for(i=0;i<=n;i++){var u=step*i;if(i>0&&i<n&&extremes.some(function(e){return Math.abs(e-u)<step/4;}))continue;ts.push(u);}
  ts=ts.concat(extremes).sort(function(a,b){return a-b;});
  return ts.map(function(u){var a=a0+(sweep<0?-u:u);return [cx+r*Math.cos(a),cy+r*Math.sin(a)];});
}
/* Дуга bulge между двумя вершинами полилинии: bulge = tg(угол/4), знак —
   направление (плюс — против часовой). */
function shapeDxfBulgeSeg(a,b,bulge){
  var dx=b[0]-a[0],dy=b[1]-a[1],ch=Math.hypot(dx,dy);
  if(!(Math.abs(bulge)>1e-12)||ch<1e-12)return {kind:'line',pts:[a,b]};
  var sweep=4*Math.atan(bulge),r=ch/(2*Math.abs(Math.sin(sweep/2))),mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;
  var d=Math.sqrt(Math.max(0,r*r-ch*ch/4)),ux=dx/ch,uy=dy/ch,s=(bulge>0?1:-1)*(Math.abs(sweep)<Math.PI?1:-1);
  var cx=mx-uy*d*s,cy=my+ux*d*s,a0=Math.atan2(a[1]-cy,a[0]-cx),pts=shapeDxfArcPoints(cx,cy,r,a0,sweep);
  pts[0]=a.slice();pts[pts.length-1]=b.slice();
  return {kind:'arc',pts:pts,circle:{cx:cx,cy:cy,r:r}};
}
function shapeDxfPolylineSegs(V,closed){
  var segs=[],n=V.length;
  for(var i=0;i<(closed?n:n-1);i++){
    var a=V[i],b=V[(i+1)%n];
    if(Math.hypot(b.x-a.x,b.y-a.y)<1e-12)continue;
    segs.push(shapeDxfBulgeSeg([a.x,a.y],[b.x,b.y],a.b));
  }
  return segs;
}
function shapeDxfEllipsePoints(cx,cy,mx,my,ratio,t0,t1,flip){
  var a=Math.hypot(mx,my),b=a*ratio,vx=flip?my*ratio:-my*ratio,vy=flip?-mx*ratio:mx*ratio;
  var sweep=t1-t0;while(sweep<=0)sweep+=Math.PI*2;if(sweep>Math.PI*2+1e-9)sweep=Math.PI*2;
  var rho=Math.max(1e-6,Math.min(a,b)*Math.min(a,b)/Math.max(a,b,1e-9)),chord=Math.sqrt(8*rho*SHAPE_DXF_SAG);
  var n=Math.max(32,Math.min(2048,Math.ceil(sweep*Math.max(a,b)/chord))),out=[];
  for(var i=0;i<=n;i++){var t=t0+sweep*i/n;out.push([cx+mx*Math.cos(t)+vx*Math.sin(t),cy+my*Math.cos(t)+vy*Math.sin(t)]);}
  return {pts:out,full:Math.abs(sweep-Math.PI*2)<1e-9};
}
/* NURBS по узлам, весам и контрольным точкам (алгоритм де Бора). */
function shapeDxfNurbsPoint(p,U,P,W,u){
  var n=P.length-1,k=p;
  if(u>=U[n+1])k=n;else while(k<n&&!(u>=U[k]&&u<U[k+1]))k++;
  var d=[];
  for(var j=0;j<=p;j++){var i=k-p+j,w=W[i];d.push([P[i][0]*w,P[i][1]*w,w]);}
  for(var r=1;r<=p;r++)for(j=p;j>=r;j--){
    var ii=k-p+j,den=U[ii+p-r+1]-U[ii],al=den>0?(u-U[ii])/den:0;
    d[j]=[(1-al)*d[j-1][0]+al*d[j][0],(1-al)*d[j-1][1]+al*d[j][1],(1-al)*d[j-1][2]+al*d[j][2]];
  }
  return [d[p][0]/d[p][2],d[p][1]/d[p][2]];
}
function shapeDxfSplinePoints(e){
  var p=Math.max(1,Math.floor(shapeDxfNumOf(e,71,3))),U=[],P=[],W=[],F=[],x=null,fx=null;
  e.groups.forEach(function(g){
    if(g.code===40)U.push(shapeDxfNum(g.value));
    else if(g.code===41)W.push(shapeDxfNum(g.value,1));
    else if(g.code===10)x=shapeDxfNum(g.value);
    else if(g.code===20&&x!==null){P.push([x,shapeDxfNum(g.value)]);x=null;}
    else if(g.code===11)fx=shapeDxfNum(g.value);
    else if(g.code===21&&fx!==null){F.push([fx,shapeDxfNum(g.value)]);fx=null;}
  });
  if(P.length>p&&U.length===P.length+p+1){
    while(W.length<P.length)W.push(1);
    /* Точки — по кривизне: пролёт делится пополам, пока середина отходит от
       хорды больше допуска. Равный шаг давал волне из 12 точек 2000 точек, и
       два-три сплайна упирались в предел контура. */
    var u0=U[p],u1=U[P.length],out=[shapeDxfNurbsPoint(p,U,P,W,u0)];
    var split=function(a,b,pa,pb,depth){
      var m=(a+b)/2,pm=shapeDxfNurbsPoint(p,U,P,W,m),dx=pb[0]-pa[0],dy=pb[1]-pa[1],L=Math.hypot(dx,dy);
      var dev=L>1e-12?Math.abs((pm[0]-pa[0])*dy-(pm[1]-pa[1])*dx)/L:Math.hypot(pm[0]-pa[0],pm[1]-pa[1]);
      if(depth<3||dev>SHAPE_DXF_SAG&&depth<16){split(a,m,pa,pm,depth+1);split(m,b,pm,pb,depth+1);}else out.push(pb);
    };
    for(var i=p;i<P.length;i++){
      var a=Math.max(U[i],u0),b=Math.min(U[i+1],u1);
      if(b>a)split(a,b,shapeDxfNurbsPoint(p,U,P,W,a),shapeDxfNurbsPoint(p,U,P,W,b),0);
    }
    return out;
  }
  /* Только точки прохода, без контрольных: точно повторить кривую CAD нельзя. */
  return F.length>=2?'fit-only':null;
}

/* Один объект → кромки в мировых координатах. M — матрица блока
   [a,b,c,d,e,f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
function shapeDxfApply(M,p){return [M[0]*p[0]+M[2]*p[1]+M[4],M[1]*p[0]+M[3]*p[1]+M[5]];}
function shapeDxfMul(A,B){return [A[0]*B[0]+A[2]*B[1],A[1]*B[0]+A[3]*B[1],A[0]*B[2]+A[2]*B[3],A[1]*B[2]+A[3]*B[3],A[0]*B[4]+A[2]*B[5]+A[4],A[1]*B[4]+A[3]*B[5]+A[5]];}
/* Объект, нарисованный «снизу» (ось выдавливания −Z), в мире зеркален по X. */
function shapeDxfOcs(e){return shapeDxfNumOf(e,230,1)<0?[-1,0,0,1,0,0]:[1,0,0,1,0,0];}
function shapeDxfCollect(entities,M,ctx,depth){
  entities.forEach(function(e){
    if(shapeDxfNumOf(e,67,0)===1)return;
    if(ctx.hidden[String(shapeDxfGet(e,8,'0')).toUpperCase()])return;
    var id=ctx.nextId++,segs=[],O=shapeDxfMul(M,shapeDxfOcs(e)),t=e.type;
    if(t==='LINE'){
      segs.push({kind:'line',pts:[[shapeDxfNumOf(e,10),shapeDxfNumOf(e,20)],[shapeDxfNumOf(e,11),shapeDxfNumOf(e,21)]]});
      O=M;
    }else if(t==='ARC'||t==='CIRCLE'){
      var cx=shapeDxfNumOf(e,10),cy=shapeDxfNumOf(e,20),r=shapeDxfNumOf(e,40);if(!(r>0))return;
      var a0=t==='ARC'?shapeDxfNumOf(e,50)*Math.PI/180:0,a1=t==='ARC'?shapeDxfNumOf(e,51)*Math.PI/180:Math.PI*2,sw=a1-a0;
      while(sw<=0)sw+=Math.PI*2;if(t==='CIRCLE')sw=Math.PI*2;
      segs.push({kind:'arc',pts:shapeDxfArcPoints(cx,cy,r,a0,sw),circle:{cx:cx,cy:cy,r:r},closedSelf:t==='CIRCLE'});
    }else if(t==='LWPOLYLINE'){
      var V=[],v=null;
      e.groups.forEach(function(g){if(g.code===10){v={x:shapeDxfNum(g.value),y:0,b:0};V.push(v);}else if(v&&g.code===20)v.y=shapeDxfNum(g.value);else if(v&&g.code===42)v.b=shapeDxfNum(g.value);});
      segs=shapeDxfPolylineSegs(V,(shapeDxfNumOf(e,70,0)&1)===1);
    }else if(t==='POLYLINE'){
      var pf=shapeDxfNumOf(e,70,0);if(pf&(16|64))return;
      var PV=(e.vertices||[]).filter(function(x){return !(shapeDxfNumOf(x,70,0)&(16|128));}).map(function(x){return {x:shapeDxfNumOf(x,10),y:shapeDxfNumOf(x,20),b:shapeDxfNumOf(x,42,0)};});
      segs=shapeDxfPolylineSegs(PV,(pf&1)===1);
      if(pf&8)O=M;
    }else if(t==='ELLIPSE'){
      var el=shapeDxfEllipsePoints(shapeDxfNumOf(e,10),shapeDxfNumOf(e,20),shapeDxfNumOf(e,11),shapeDxfNumOf(e,21),shapeDxfNumOf(e,40,1),shapeDxfNumOf(e,41,0),shapeDxfNumOf(e,42,Math.PI*2),shapeDxfNumOf(e,230,1)<0);
      segs.push({kind:'arc',pts:el.pts,closedSelf:el.full});O=M;
    }else if(t==='SPLINE'){
      var sp=shapeDxfSplinePoints(e);if(sp==='fit-only'){ctx.fitOnly++;return;}if(!sp||sp.length<2)return;
      segs.push({kind:'arc',pts:sp});O=M;
    }else if(t==='INSERT'){
      var blk=ctx.blocks[String(shapeDxfGet(e,2,'')).toUpperCase()];if(!blk||depth>=4)return;
      var sx=shapeDxfNumOf(e,41,1),sy=shapeDxfNumOf(e,42,1),rot=shapeDxfNumOf(e,50,0)*Math.PI/180,c=Math.cos(rot),s=Math.sin(rot);
      var I=[c*sx,s*sx,-s*sy,c*sy,shapeDxfNumOf(e,10),shapeDxfNumOf(e,20)];
      I=shapeDxfMul(I,[1,0,0,1,-blk.base[0],-blk.base[1]]);
      shapeDxfCollect(blk.entities,shapeDxfMul(O,I),ctx,depth+1);
      return;
    }else{
      if(SHAPE_DXF_SOLIDS.indexOf(t)>=0)ctx.solids++;
      return;
    }
    /* Круг остаётся кругом только при равном масштабе по осям. */
    var uniform=Math.abs(Math.abs(O[0]*O[3]-O[1]*O[2])-(O[0]*O[0]+O[1]*O[1]))<1e-9;
    segs.forEach(function(sg,k){
      var pts=sg.pts.map(function(p){return shapeDxfApply(O,p);});
      var circle=sg.circle&&uniform?(function(){var c0=shapeDxfApply(O,[sg.circle.cx,sg.circle.cy]);return {cx:c0[0],cy:c0[1],r:sg.circle.r*Math.sqrt(Math.abs(O[0]*O[3]-O[1]*O[2]))};})():null;
      ctx.segs.push({kind:sg.kind,pts:pts,circle:circle,closedSelf:!!sg.closedSelf,ent:id,idx:k});
    });
  });
}

/* ---------- сшивка концов в контуры ---------- */
function shapeDxfDist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
function shapeDxfStart(c){return c.rev?c.s.pts[c.s.pts.length-1]:c.s.pts[0];}
function shapeDxfEnd(c){return c.rev?c.s.pts[0]:c.s.pts[c.s.pts.length-1];}
function shapeDxfChains(segs){
  var used=segs.map(function(){return false;}),loops=[],open=[];
  function nearest(p,prefer){
    var best=null;
    for(var j=0;j<segs.length;j++){
      if(used[j]||segs[j].closedSelf)continue;
      var s=segs[j],d0=shapeDxfDist(p,s.pts[0]),d1=shapeDxfDist(p,s.pts[s.pts.length-1]),d=Math.min(d0,d1);
      if(d>SHAPE_DXF_GAP)continue;
      var same=prefer&&s.ent===prefer.ent?0:1;
      if(!best||same<best.same||(same===best.same&&d<best.d))best={j:j,d:d,same:same,atStart:d0<=d1};
    }
    return best;
  }
  for(var i=0;i<segs.length;i++){
    if(used[i])continue;used[i]=true;
    var c=[{s:segs[i],rev:false}];
    /* Сама на себя замыкается только кривая с ТОЧНО совпавшими концами (круг,
       замкнутый сплайн). Допуск на зазор здесь не годится: скругление R 1/16
       с малым поворотом короче 1/64″ и выходило отдельным «контуром». */
    if(segs[i].closedSelf||shapeDxfDist(segs[i].pts[0],segs[i].pts[segs[i].pts.length-1])<=1e-9&&segs[i].pts.length>3){loops.push(c);continue;}
    for(;;){
      var head=shapeDxfStart(c[0]),tail=shapeDxfEnd(c[c.length-1]);
      if(c.length>1&&shapeDxfDist(head,tail)<=SHAPE_DXF_GAP){loops.push(c);break;}
      var f=nearest(tail,c[c.length-1].s);
      if(f){used[f.j]=true;c.push({s:segs[f.j],rev:!f.atStart});continue;}
      var b=nearest(head,c[0].s);
      if(b){used[b.j]=true;c.unshift({s:segs[b.j],rev:b.atStart});continue;}
      open.push(c);break;
    }
  }
  return {loops:loops,open:open};
}
/* Кромки контура по порядку обхода: точки каждой — от начала до конца. */
function shapeDxfLoopEdges(loop){
  return loop.map(function(c){var p=c.s.pts.map(function(q){return q.slice();});if(c.rev)p.reverse();return {kind:c.s.kind,pts:p,circle:c.s.circle};});
}
function shapeDxfEdgesPoints(edges){var out=[];edges.forEach(function(e){for(var i=0;i<e.pts.length-1;i++)out.push(e.pts[i]);});return out;}
/* Подряд идущие прямые на одной линии — одна физическая кромка; дуга,
   разрезанная на куски с тем же центром и радиусом, — тоже одна. */
function shapeDxfMergeEdges(edges){
  function dir(e,end){var p=e.pts,a=end?p[p.length-2]:p[0],b=end?p[p.length-1]:p[1],L=shapeDxfDist(a,b)||1;return [(b[0]-a[0])/L,(b[1]-a[1])/L];}
  function turn(e){var p=e.pts,a=p[0],b=p[1],c=p[2]||p[1];return Math.sign((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]));}
  function same(a,b){
    if(a.kind!==b.kind)return false;
    if(a.kind==='line'){var u=dir(a,true),v=dir(b,false);return u[0]*v[0]+u[1]*v[1]>0&&Math.abs(u[0]*v[1]-u[1]*v[0])<1e-9;}
    return !!(a.circle&&b.circle&&Math.hypot(a.circle.cx-b.circle.cx,a.circle.cy-b.circle.cy)<1e-6&&Math.abs(a.circle.r-b.circle.r)<1e-6&&turn(a)===turn(b));
  }
  function join(a,b){return {kind:a.kind,circle:a.circle,pts:a.kind==='line'?[a.pts[0],b.pts[b.pts.length-1]]:a.pts.concat(b.pts.slice(1))};}
  var out=[];
  edges.forEach(function(e){if(out.length&&same(out[out.length-1],e))out[out.length-1]=join(out[out.length-1],e);else out.push(e);});
  while(out.length>1&&same(out[out.length-1],out[0]))out[0]=join(out.pop(),out[0]);
  return out;
}
function shapeDxfLoopCircle(edges){
  if(!edges.length||!edges.every(function(e){return e.kind==='arc'&&e.circle;}))return null;
  var c=edges[0].circle;
  return edges.every(function(e){return Math.hypot(e.circle.cx-c.cx,e.circle.cy-c.cy)<1e-4&&Math.abs(e.circle.r-c.r)<1e-4;})?c:null;
}
function shapeDxfLen(v){return (Math.round(v*1000)/1000)+'″';}

function shapeParseFusionDxf(text){
  text=String(text==null?'':text);if(!text.trim())return shapeDxfFail('DXF file is empty.');
  if(/^AutoCAD Binary DXF/.test(text))return shapeDxfFail('Binary DXF is not supported. Save the file as ASCII DXF.');
  var pairs=shapeDxfReadPairs(text);if(!pairs||!pairs.length)return shapeDxfFail('DXF file has no readable group codes.');
  var sections=shapeDxfSections(pairs),units=0,header=sections.HEADER||[];
  for(var i=0;i<header.length;i++)if(header[i].code===9&&header[i].value==='$INSUNITS'){var u=header[i+1];if(u&&u.code===70)units=Math.floor(shapeDxfNum(u.value));break;}
  var k=SHAPE_DXF_UNIT_INCHES[units];
  if(!k)return shapeDxfFail('DXF units are not supported (INSUNITS = '+units+'). Export the file in inches.');
  var ctx={segs:[],blocks:shapeDxfBlocks(sections),hidden:shapeDxfHiddenLayers(sections),nextId:0,solids:0,fitOnly:0};
  shapeDxfCollect(shapeDxfEntities(sections.ENTITIES||[]),[k,0,0,k,0,0],ctx,0);
  var segs=ctx.segs.filter(function(s){return s.pts.length>=2&&s.pts.some(function(p){return shapeDxfDist(p,s.pts[0])>1e-9;});});
  if(ctx.fitOnly)return shapeDxfFail('DXF has a spline saved by fit points only. Save it with control points so the curve stays exact.');
  if(!segs.length)return shapeDxfFail('DXF has no lines, arcs or polylines to read.'+(ctx.solids?' It stores the shape as a solid or region; export the outline as lines and arcs.':''));
  if(segs.some(function(s){return s.pts.some(function(p){return !isFinite(p[0])||!isFinite(p[1]);});}))return shapeDxfFail('DXF contour contains an invalid coordinate.');
  var ch=shapeDxfChains(segs),loops=ch.loops.map(function(l){var edges=shapeDxfLoopEdges(l),pts=shapeDxfEdgesPoints(edges);return {edges:edges,pts:pts,area:pts.length>=3?Math.abs(fabSignedArea(pts)):0};});
  var size=function(P){var b=fabEdgeBounds(P);return Math.max(b.maxX-b.minX,b.maxY-b.minY);};
  var openBig=ch.open.map(function(c){var e=shapeDxfLoopEdges(c),P=[];e.forEach(function(x){P=P.concat(x.pts);});return {pts:P,head:shapeDxfStart(c[0]),tail:shapeDxfEnd(c[c.length-1])};}).sort(function(a,b){return size(b.pts)-size(a.pts);})[0];
  loops.sort(function(a,b){return b.area-a.area;});
  var outer=loops[0];
  if(!outer||openBig&&size(openBig.pts)>size(outer.pts)){
    if(!openBig)return shapeDxfFail('DXF contour encloses no area.');
    var g=openBig.tail;
    return shapeDxfFail('DXF outline is not closed: gap of '+shapeDxfLen(shapeDxfDist(openBig.head,openBig.tail))+' near X '+shapeDxfLen(g[0])+', Y '+shapeDxfLen(g[1])+'.');
  }
  /* «Бабочка»: замкнута, но площади нет — она пересекает сама себя. */
  if(!(outer.area>1e-8))return shapeDxfFail(outer.pts.length>=4&&fabPolySelfIntersects(outer.pts)?'DXF contour self-intersects.':'DXF contour encloses no area.');
  var holes=[],cutouts=0,separate=0;
  loops.slice(1).filter(function(l){return l.area>1e-8;}).forEach(function(l){
    if(!l.pts.every(function(p){return fabPointInPoly(p,outer.pts);})){separate++;return;}
    var c=shapeDxfLoopCircle(l.edges);
    if(c)holes.push(c);else cutouts++;
  });
  if(separate)return shapeDxfFail('DXF contains '+(separate+1)+' separate outlines. Keep one glass per file.');
  if(cutouts)return shapeDxfFail('DXF has '+(cutouts>1?cutouts+' inner cutouts':'an inner cutout')+'. Inner cutouts are not supported for DXF yet, so the file was not loaded.');
  var edges=shapeDxfMergeEdges(outer.edges),points=[],segments=[];
  edges.forEach(function(e){segments.push({at:points.length,kind:e.kind});for(var j=0;j<e.pts.length-1;j++)points.push(e.pts[j]);});
  if(points.length>SHAPE_DXF_PREVIEW_MAX_POINTS)return shapeDxfFail('DXF contour has too many points ('+points.length+'). Simplify the curves.');
  var b=fabEdgeBounds(points),w=b.maxX-b.minX,h=b.maxY-b.minY,width16=Math.round(w*16),height16=Math.round(h*16);
  if(!(width16>0&&height16>0))return shapeDxfFail('DXF bounding Width and Height must be greater than zero.');
  var normalized=points.map(function(p){return [shapeDxfCoord(p[0]-b.minX),shapeDxfCoord(p[1]-b.minY)];});
  /* Совпавшие после округления соседние точки убираем, сдвигая начала кромок. */
  var keep=[],map=[];
  normalized.forEach(function(p,j){var prev=keep.length?keep[keep.length-1]:null;map.push(keep.length);if(!prev||Math.hypot(p[0]-prev[0],p[1]-prev[1])>=1e-8)keep.push(p);else map[j]=keep.length-1;});
  while(keep.length>1&&Math.hypot(keep[0][0]-keep[keep.length-1][0],keep[0][1]-keep[keep.length-1][1])<1e-8)keep.pop();
  segments=segments.map(function(s){return {at:Math.min(map[s.at],keep.length-1),kind:s.kind};}).filter(function(s,j,a){return !j||s.at>a[j-1].at;});
  if(keep.length<3)return shapeDxfFail('DXF contour must contain at least three vertices.');
  if(fabPolySelfIntersects(keep))return shapeDxfFail('DXF contour self-intersects.');
  if(Math.abs(fabSignedArea(keep))<1e-8)return shapeDxfFail('DXF contour encloses no area.');
  var notes=[];
  if(units>1)notes.push('Converted from '+SHAPE_DXF_UNIT_NAMES[units]+' to inches.');
  if(ch.open.length)notes.push(ch.open.length+' open line'+(ch.open.length>1?'s were':' was')+' ignored.');
  return {ok:true,preview:{units:'in',points:keep,width16:width16,height16:height16,segments:segments},exactWidth:w,exactHeight:h,
    holes:holes.map(function(c){return {x:shapeDxfCoord(c.cx-b.minX),y:shapeDxfCoord(c.cy-b.minY),diameter:2*c.r};}),notes:notes};
}
