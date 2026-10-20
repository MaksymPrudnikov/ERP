/* =====================================================================
   sales/step-unit · step-unit-1.0
   Ступенчатый юнит (step / offset): лайты одного юнита разного размера —
   отступ лайта по кромкам (Inset per edge) или своя форма лайта.
   Владелец, 20.10.2026: деньги — по площади юнита, как раньше; Step Unit —
   строка прайса с ценой 0 («в будущем цена возможна — заложим загодя»); вид
   шва — из офиса, не выбран — Flat seal, поле появляется только при
   ступеньке; на чертеже юнита меньший лайт пунктиром и ступенька, у каждого
   стекла свой лист, в шапке видно, какой лайт больше. Отличие step-юнита в
   цеху — только доп. силикон по ступеньке (PDF «TYPE SEAL»).
   IN : форма строки, makeup, лайты формы (inset / mirror), свои формы лайтов
   OUT: salesShapeStepInfo / salesLineStepInfo · подписи · разрез шва
   ===================================================================== */
var SALES_STEP_SEALS={flat:'Flat seal',edge:'Edge to edge seal',buttered:'Flat seal + buttered fill'};
function salesStepSealKey(shape){var k=shape&&shape.stepSeal;return Object.prototype.hasOwnProperty.call(SALES_STEP_SEALS,k)?k:'flat';}
function salesStepSealLabel(shape){return SALES_STEP_SEALS[salesStepSealKey(shape)];}
/* Готовый контур формы с id ребра у каждого отрезка — тот же, от которого
   отступ лайта считает рез (service-sets). */
function salesStepBaseContour(shape){
  if(!shape)return null;
  if(shapeIsDxfSource(shape)){
    var src=shapeNormalizeSource(shape.source),pts=(src.preview.points||[]).map(function(p){return p.slice();}),ids=ShapeModule.dxfPointEdgeIds(shape);
    return pts.length>=3&&ids.length===pts.length?{points:pts,ids:ids}:null;
  }
  var r=ShapeModule.compute(shape);
  if(!r||!r.valid||!r.cutting||!r.cutting.finishedPoints)return null;
  var edges=(r.geometry&&r.geometry.edges)||[],fin=r.cutting.finishedPoints;
  return edges.length===fin.length?{points:fin.map(function(p){return p.slice();}),ids:edges.map(function(e){return e.id;})}:null;
}
function salesStepMetrics(pts){
  var b=fabEdgeBounds(pts);
  return {w:b.maxX-b.minX,h:b.maxY-b.minY,area:Math.abs(fabSignedArea(pts)),perimeter:fabPolylineLength(pts,true)};
}
/* Лайт юнита: своя форма или общая с отступом. Зеркало размера не меняет и
   ступеньки не даёт — его здесь нет. */
function salesStepLite(shape,line,index,base){
  var own=typeof salesLineLiteShape==='function'?salesLineLiteShape(line,index):null,pts=base.points,insets={},per=null;
  if(own){var ob=salesStepBaseContour(own);if(!ob)return null;pts=ob.points;}
  else{
    per=base.ids.map(function(id){return shapeLiteInsetFor(shape,index,id);});
    if(per.some(function(v){return v>0;})){var inner=shapeInsetVariable(base.points,per);if(!inner.valid)return null;pts=inner.points;}
    base.ids.forEach(function(id,k){if(per[k]>0)insets[id]=Math.max(insets[id]||0,per[k]);});
  }
  return Object.assign({index:index,own:!!own,points:pts,insets:insets,perPoint:per},salesStepMetrics(pts));
}
function salesStepSameLite(a,b){
  if(a.own||b.own)return Math.abs(a.w-b.w)<1/64&&Math.abs(a.h-b.h)<1/64&&Math.abs(a.area-b.area)<1e-3;
  return a.points.length===b.points.length&&a.points.every(function(p,k){return Math.abs(p[0]-b.points[k][0])<1e-6&&Math.abs(p[1]-b.points[k][1])<1e-6;});
}
/* Ступенька = у СУЩЕСТВУЮЩИХ лайтов makeup строки разные контуры (между
   собой, не с формой): настройка Lite 3, оставшаяся после Triple → Double, и
   одинаковый отступ у всех лайтов ступеньки не дают. Только Double / Triple. */
function salesShapeStepInfo(shape,line,order){
  order=order||(typeof soDraft!=='undefined'?soDraft:null);
  var m=line&&order&&typeof salesMakeupById==='function'?salesMakeupById(order,line.makeupId):null;
  if(!shape||!m||(m.unitType!=='double'&&m.unitType!=='triple'))return null;
  var base=salesStepBaseContour(shape);if(!base)return null;
  var lites=(m.panes||[]).map(function(p,i){return salesStepLite(shape,line,i,base);});
  if(lites.length<2||lites.some(function(l){return !l;}))return null;
  var shapeLite=Object.assign({own:false,points:base.points},salesStepMetrics(base.points));
  lites.forEach(function(l){l.asShape=l.own?salesStepSameLite(l,Object.assign({},shapeLite,{own:true})):!Object.keys(l.insets).length;});
  var big=lites.reduce(function(a,b){return b.area>a.area+1e-6?b:a;});
  var info={step:lites.some(function(l){return !salesStepSameLite(l,lites[0]);}),lites:lites,big:big.index,seal:salesStepSealKey(shape),ids:base.ids,edges:[],stepLength:0};
  if(!info.step)return info;
  /* Ступенька на ребре — разница отступов лайтов на нём. У своей формы лайта
     рёбра с общей формой не сопоставить: тогда длина ступеньки — периметр
     большего лайта. */
  if(!lites.some(function(l){return l.own;})){
    var seen={};
    base.ids.forEach(function(id){
      if(seen[id])return;seen[id]=true;
      var vals=lites.map(function(l){return l.insets[id]||0;}),st=Math.max.apply(null,vals)-Math.min.apply(null,vals);
      if(!(st>1e-6))return;
      var len=0;base.ids.forEach(function(x,k){if(x!==id)return;var a=big.points[k],b=big.points[(k+1)%big.points.length];len+=Math.hypot(b[0]-a[0],b[1]-a[1]);});
      info.edges.push({id:id,step:st,length:len});
    });
  }
  info.stepLength=info.edges.length?info.edges.reduce(function(s,e){return s+e.length;},0):big.perimeter;
  return info;
}
function salesLineStepInfo(line,order){return salesShapeStepInfo(line&&salesLineGeometryShape(line),line,order);}
/* Лайты строки, которым нужен свой лист: отличные от контура формы. Лайт
   размером с форму и обычный юнит печатаются листом строки. */
function salesLineStepSheets(line,order){
  var info=salesLineStepInfo(line,order);
  return info&&info.step?info.lites.filter(function(l){return !l.asShape;}).map(function(l){return l.index;}):[];
}
/* Количество строки Step Unit — по единице строки прайса, чтобы владелец мог
   сменить её в Master Data без кода: pc — юнит, in — ступенька, ft² — площадь. */
function salesStepUnitQty(info,line,order,unit){
  if(unit==='ft²'){var a=salesLineAreas(line,order);return a.valid?a.billable:0;}
  if(unit==='in')return info.stepLength;
  return 1;
}
/* Подпись лайта в шапке листа: размер, больше / меньше, ступенька по рёбрам. */
function salesStepLiteText(info,index,names){
  var l=info&&info.step&&info.lites[index];if(!l)return '';
  var biggest=info.lites[info.big],parts=[dimIn16(l.w)+' × '+dimIn16(l.h),l.area>=biggest.area-1e-6?'larger':'smaller'];
  if(!l.own&&info.edges.length){
    var st=info.edges.map(function(e){var min=Math.min.apply(null,info.lites.map(function(x){return x.insets[e.id]||0;})),v=(l.insets[e.id]||0)-min;return v>1e-6?((names&&names[e.id])||e.id)+' '+shapeDrawingDim(v):'';}).filter(Boolean);
    if(st.length)parts.push('step '+st.join(', '));
  }
  return parts.join(' · ');
}
/* Данные пунктира для чертежа юнита (modules/shape ничего не знает про
   заказы — получает готовые отступы по точкам контура). */
function salesStepDrawingData(info,names){
  if(!info||!info.step)return null;
  return {seal:SALES_STEP_SEALS[info.seal],lites:info.lites.filter(function(l){return !l.own&&!l.asShape;}).map(function(l){return {index:l.index,label:'Lite '+(l.index+1),perPoint:l.perPoint,w:l.w,h:l.h};}),
    edges:info.edges.map(function(e){return {id:e.id,name:(names&&names[e.id])||e.id,step:e.step,min:Math.min.apply(null,info.lites.map(function(x){return x.insets[e.id]||0;}))};})};
}
/* Разрез шва по ступеньке — по составу строки (владелец прислал PDF «TYPE
   SEAL» и пример Triple «на вдохновение, не за истину»): стёкла сверху вниз
   как в шапке, в камерах спейсер и вторичный герметик, ступенька — на ребре с
   самой большой ступенькой, заливка по виду шва. Чёрно-белый. */
function salesStepSectionSvg(makeup,info,shape,names){
  if(!info||!info.step||!makeup)return '';
  var panes=makeup.panes||[],edge=info.edges.slice().sort(function(a,b){return b.step-a.step;})[0];
  var ins=info.lites.map(function(l){return edge?(l.insets[edge.id]||0):(l.index===info.big?0:1);}),min=Math.min.apply(null,ins),max=Math.max.apply(null,ins);
  var W=320,R=286,stepPx=max>min?78:0,k=max>min?stepPx/(max-min):0,glassH=14,cavH=20,x0=4,y=28,out='',seal=salesStepSealKey(shape);
  var end=function(i){return R-(ins[i]-min)*k;};
  out+='<text x="0" y="13" font-size="11" font-weight="700">STEP UNIT · '+esc(SALES_STEP_SEALS[seal].toUpperCase())+'</text>';
  var tops=[];
  panes.forEach(function(p,i){
    if(i){
      var c=(makeup.cavities||[])[i-1]||{},sealant=typeof mdById==='function'?mdById('sealantProduct',c.secondarySealantId):null,e1=end(i-1),e2=end(i),inner=Math.min(e1,e2),spW=14,seW=58;
      var sx=inner-seW-spW,yc=y;
      out+='<rect x="'+sx+'" y="'+yc+'" width="'+spW+'" height="'+cavH+'" fill="#fff" stroke="#000" stroke-width=".8"/>';
      out+='<rect x="'+(sx+spW)+'" y="'+yc+'" width="'+seW+'" height="'+cavH+'" fill="#222"/>';
      if(sealant&&sealant.name)out+='<text x="'+(sx+spW+seW/2)+'" y="'+(yc+cavH/2+3)+'" font-size="8" fill="#fff" text-anchor="middle">'+esc(String(sealant.name).slice(0,13))+'</text>';
      /* Шов по ступеньке: Flat — заподлицо с меньшим стеклом; Edge to edge —
         скос до кромки большего; Flat + buttered fill — слой по ступеньке. */
      if(Math.abs(e1-e2)>.5){
        var bigTop=e1>e2,ys=bigTop?yc:yc+cavH;
        if(seal==='edge')out+='<path d="M '+inner+' '+ys+' L '+Math.max(e1,e2)+' '+ys+' L '+inner+' '+(bigTop?yc+cavH+glassH:yc-glassH)+' Z" fill="#222"/>';
        if(seal==='buttered')out+='<rect x="'+inner+'" y="'+(bigTop?yc:yc+cavH-3)+'" width="'+(Math.max(e1,e2)-inner)+'" height="3" fill="#222"/>';
      }
      y+=cavH;
    }
    var e=end(i);tops.push(y);
    out+='<rect x="'+x0+'" y="'+y+'" width="'+(e-x0)+'" height="'+glassH+'" fill="#f2f4f2" stroke="#000" stroke-width=".8"/>';
    var spec=typeof salesSheetPaneText==='function'?String(salesSheetPaneText(p,i)||''):'';
    out+='<text x="'+(x0+4)+'" y="'+(y+10)+'" font-size="9" font-weight="700">Lite '+(i+1)+(spec?': '+esc(spec.slice(0,30)):'')+'</text>';
    y+=glassH;
  });
  if(stepPx){
    var yd=y+10,a=R-stepPx,b=R;
    out+='<line x1="'+a+'" y1="'+yd+'" x2="'+b+'" y2="'+yd+'" stroke="#000" stroke-width=".8"/><line x1="'+a+'" y1="'+(yd-3)+'" x2="'+a+'" y2="'+(yd+3)+'" stroke="#000" stroke-width=".8"/><line x1="'+b+'" y1="'+(yd-3)+'" x2="'+b+'" y2="'+(yd+3)+'" stroke="#000" stroke-width=".8"/>';
    out+='<text x="'+((a+b)/2)+'" y="'+(yd+12)+'" font-size="9.5" font-weight="700" text-anchor="middle">step '+esc(shapeDrawingDim(max-min))+(edge?' · '+esc((names&&names[edge.id])||edge.id):'')+'</text>';
    y=yd+14;
  }
  return '<svg class="sheet-step-section" viewBox="0 0 '+W+' '+(y+4)+'" width="'+W+'" height="'+(y+4)+'" font-family="Arial,sans-serif" aria-label="Step unit section">'+out+'</svg>';
}
