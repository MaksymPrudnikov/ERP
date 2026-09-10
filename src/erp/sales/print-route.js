/* =====================================================================
   sales/print-route  ·  путь стекла по станциям для печатного листа
   IN : строка заказа + заказ, либо одна фигура из библиотеки
   OUT: {lites:[{label,glass,stations:[{code,name,items:[…]}]}], merge}
   Правило: файл не считает цены и ничего не рисует. Только «что и где делают».

   Маршрут принадлежит СТЕКЛУ, а не юниту. Хендоф 9м: каждое стекло — отдельный
   объект со своим L-номером, ламинация и сборка пакета — точки слияния, где два
   номера сходятся. Поэтому у пакета столько полос маршрута, сколько лайтов, а
   станция слияния одна на лист. Когда L-номера появятся, каждая полоса просто
   получит свой номер — переделывать лист не придётся.
   ===================================================================== */

/* Порядок станций и связь операции со станцией берутся из справочника цеха, а
   не из списка в коде: станции переименуют, и это не должно требовать обхода
   файлов. */
function salesRouteStations(){
  return (DB.station||[]).slice().sort(function(a,b){return (+a.seq||0)-(+b.seq||0);});
}
function salesRouteStationName(code){
  var s=(DB.station||[]).find(function(x){return x.code===code;});
  if(!s)return code;
  return (typeof LANG!=='undefined'&&LANG==='en')?(s.nameEn||s.name):(s.name||s.nameEn);
}
function salesRouteStationOf(opCode,fallback){
  var o=(DB.operation||[]).find(function(x){return x.code===opCode;});
  return (o&&o.station)||fallback;
}
const SALES_ROUTE_EDGE_OP={'Rough Arris':'arris_machine','Flat Polish':'polish',
  'CNC Shape Polish':'cnc_shape_polish','Mitering':'miter','Beveling':'bevel',
  'Lami Polish':'lami_polish','CNC Lami Polish':'cnc_lami_polish'};
/* Признак берётся из справочника операций, а не из списка кодов здесь: заведёт
   владелец ещё одну операцию по склеенной кромке — маршрут узнает сам. */
function salesRouteAfterMerge(opCode){
  var o=(DB.operation||[]).find(function(x){return x.code===opCode;});
  return !!(o&&o.afterMerge);
}
const SALES_ROUTE_EDGE_LETTER={left:'A',bottom:'B',right:'C',top:'D'};

function salesRoutePush(map,order,code,text){
  if(!code||!text)return;
  if(!map[code]){map[code]={code:code,name:salesRouteStationName(code),items:[]};order.push(code);}
  if(map[code].items.indexOf(text)<0)map[code].items.push(text);
}

/* Позиция метки записывается ровно так, как её ввёл оператор: буква кромки, имя
   стороны, величина и УГОЛ ОТСЧЁТА. Правило не выдумываем — от какого угла
   мерили, уже выбрано в карточке и лежит в оформлении фигуры. */
/* Сторона называется буквой — той же, что стоит на чертеже. Слово Left рядом
   с буквой A ничего не добавляло, только удлиняло строку. */
function salesRouteEdgeLetter(edge){return SALES_ROUTE_EDGE_LETTER[edge]||String(edge||'');}
function salesRouteMarkText(shape,geo,item,edgeLen){
  var name,pos='';
  if(item.type==='hole'){
    var d=fabParseDimStrict(item.diameter),count=shapeHoleCount(item);
    name=(count>1?count+' × ':'')+'HOLE Ø '+(d.ok?shapeFrac16(d.v):String(item.diameter||''));
    var hp=geo?shapeManufacturingHolePosition(item,geo):null;
    if(hp)pos=salesRouteEdgeLetter(hp.hRef)+' '+shapeFrac16(hp.hDistance)+
      ' · '+salesRouteEdgeLetter(hp.vRef)+' '+shapeFrac16(hp.vDistance);
    return name+(pos?' — '+pos:'');
  }
  name=String(shapeManufacturingItemTitle(item.type)||item.type).toUpperCase()+
    (item.model?' '+item.model:'');
  var edge=item.edge||'left',letter=SALES_ROUTE_EDGE_LETTER[edge]||'',shown=+item.distance||0;
  var rec=shape&&shape.dims&&shape.dims[item.id]&&shape.dims[item.id].e;
  var fromEnd=!!(rec&&rec.ref==='end');
  if(fromEnd&&isFinite(+edgeLen)&&+edgeLen>0)shown=Math.max(0,+edgeLen-shown);
  var vert=(edge==='left'||edge==='right');
  var corner=vert?(fromEnd?'top':'bottom'):(fromEnd?'right':'left');
  pos=(letter?letter+' ':'')+shapeFrac16(shown)+' from '+salesRouteEdgeLetter(corner);
  return name+' — '+pos;
}

/* Один лайт: что с ним делают и на какой станции. */
function salesRouteLiteStations(shape,result,groups,heatTreatment,treatments,heatSoak){
  var map={},order=[],heatMap={},heatOrder=[],postMap={},postOrder=[],afterMap={},afterOrder=[],geo=null;
  try{geo=(typeof shapeManufacturingGeometry==='function'&&shape===sDraft)?shapeManufacturingGeometry():null;}catch(e){geo=null;}
  if(!geo&&result&&result.valid&&(result.points||[]).length)geo={P:result.points,b:fabEdgeBounds(result.points)};

  var cut=result&&result.cutting&&result.cutting.valid?result.cutting:null;
  if(cut)salesRoutePush(map,order,salesRouteStationOf('cutting','CUT'),dimIn16(cut.width)+' × '+dimIn16(cut.height));

  /* Кромка: группируем по операции — «A, B · Flat Polish», а не четыре строки. */
  var byOp={},opOrder=[],edgeLen={},contourEdges=[];
  (groups||[]).forEach(function(g){
    if(contourEdges.indexOf(g.id)<0)contourEdges.push(g.id);
    edgeLen[g.id]=+g.length||0;
    (g.ops||[]).forEach(function(op){
      var t=op&&op.type;if(!t)return;
      var key=salesServiceOpSignature(op);
      if(!byOp[key]){byOp[key]={op:op,edges:[]};opOrder.push(key);}
      if(byOp[key].edges.indexOf(g.id)<0)byOp[key].edges.push(g.id);
    });
  });
  opOrder.forEach(function(key){
    var group=byOp[key],op=group.op,t=op.type;
    /* Одинаковая операция по всему контуру не нуждается в перечне каждой
       стороны: станция получает короткое `EDGE - Rough Arris`. Если хотя бы
       одна сторона отличается, список остаётся и прямо показывает разницу. */
    var allEdges=contourEdges.length>0&&group.edges.length===contourEdges.length&&
      contourEdges.every(function(id){return group.edges.indexOf(id)>=0;});
    var code=SALES_ROUTE_EDGE_OP[t],station=salesRouteStationOf(code,'EDGE'),text=(allEdges?'':group.edges.join(', ')+' · ')+t;
    if(op.angle)text+=' '+op.angle+'°';
    if(op.width)text+=' · Width '+dimIn16(inch(op.width));
    if(op.side)text+=' · '+(op.side==='back'?'Back':'Front');
    /* Полировка склеенной кромки — второй заход на ту же станцию, уже ПОСЛЕ
       ламинации. Складываем её отдельно: в общей полосе она встала бы по seq
       станции, то есть до склейки, и лист печатал бы неправду. */
    if(salesRouteAfterMerge(code))salesRoutePush(afterMap,afterOrder,station,text);
    else salesRoutePush(map,order,station,text);
  });

  /* Тело стекла: отверстия, фурнитура, нотчи, вырезы. */
  var fab=salesRouteStationOf('fabrication','FAB');
  (shape&&shape.manufacturingItems||[]).forEach(function(item){
    var letter=SALES_ROUTE_EDGE_LETTER[item.edge||'left'];
    salesRoutePush(map,order,fab,salesRouteMarkText(shape,geo,item,edgeLen[letter]));
  });
  if(typeof ssNotchList==='function')ssNotchList(shape).forEach(function(n){
    salesRoutePush(map,order,fab,ssNotchLabel(n.method).toUpperCase()+' · '+n.corner.toUpperCase());
  });
  (shape&&shape.features||[]).forEach(function(f){
    if(f.type==='hole')salesRoutePush(map,order,fab,'HOLE Ø '+dimIn16(inch(f.diameter))+
      ' · X '+dimIn16(inch(f.x))+' / Y '+dimIn16(inch(f.y)));
    if(f.type==='hardware')salesRoutePush(map,order,fab,'HARDWARE '+String(f.name||'')+
      (f.edgeId?' · '+f.edgeId:'')+(f.distance?' · '+dimIn16(inch(f.distance)):''));
    if(f.type==='cutout')salesRoutePush(map,order,fab,'INTERNAL CUTOUT');
    if(f.type==='radius'&&inch(f.radius)>0)salesRoutePush(map,order,fab,'RADIUS CORNER');
  });

  /* Makeup несёт работы по поверхности независимо от геометрии и цены.
     Фрит наносится до печи, спандрел — после (контракт владельца). */
  (treatments||[]).forEach(function(t){
    if(t.kind==='frit')salesRoutePush(map,order,
      salesRouteStationOf(t.spec.productId==='FRIT-DIGITAL'?'digital_print':'ceramic_frit','CERP'),'Frit · '+t.where);
    if(t.kind==='spandrel')salesRoutePush(postMap,postOrder,salesRouteStationOf('painting','PAINT'),t.text);
  });
  /* Печь и то, что она ставит. */
  var heatStation=salesRouteStationOf(heatTreatment==='HS'?'heat_strengthening':'tempering','HEAT');
  if(heatTreatment&&heatTreatment!=='AN')
    salesRoutePush(heatMap,heatOrder,heatStation,
      heatTreatment==='HS'?'HEAT STRENGTHENING':'TEMPERING');
  (shape&&shape.features||[]).forEach(function(f){
    /* Штамп ставит печь — на отожжённом лайте его быть не может. */
    if(f.type==='stamp'&&heatTreatment&&heatTreatment!=='AN')
      salesRoutePush(heatMap,heatOrder,heatStation,String(shapeStampText(f)).toUpperCase());
    if(f.type==='sandblast')salesRoutePush(postMap,postOrder,salesRouteStationOf('sandblasting','SAND'),
      String(shapeSandblastServiceLabel(f)).toUpperCase());
  });

  /* Печатаем в порядке маршрута цеха, а не в порядке заполнения. */
  var seq=salesRouteStations().map(function(s){return s.code;});
  function sorted(m,keys){
    return seq.filter(function(c){return m[c];}).concat(keys.filter(function(c){return seq.indexOf(c)<0;}))
      .map(function(c){return m[c];});
  }
  var out=sorted(map,order).concat(sorted(heatMap,heatOrder),heatSoak&&heatTreatment==='FT'?[{code:salesRouteStationOf('heat_soak','HEAT'),name:salesRouteStationName(salesRouteStationOf('heat_soak','HEAT')),operation:'heat_soak',items:['HEAT SOAK']}]:[],sorted(postMap,postOrder));
  return {list:out,after:afterOrder.map(function(c){return afterMap[c];})};
}

function salesRouteHeatOf(pane){
  var ht=pane&&(typeof mdById==='function'?mdById('heatTreatment',pane.heatTreatmentId):null);
  var code=(ht&&(ht.code||ht.name))||String(pane&&pane.heatTreatmentId||'').replace(/^HT-/,'');
  return String(code||'AN').toUpperCase();
}

/* Общий контракт поверхности для маршрута и схемы. Внутренние грани ламината
   не получают выдуманных номеров: у них позиция Into film и конкретная ply.
   Неактивные поля прежнего Type не являются работами текущего стекла. */
function salesRouteSurfaceTreatments(pane,index,side){
  if(!pane)return [];
  var lam=pane.category==='laminated',ply=lam?(pane.laminated||{})[side]:pane;
  if(!ply)return [];
  var surfaces=salesPaneSurfaces(index),out=[];
  function add(kind,spec,surface,face,position){
    spec=spec||{};
    var product=kind==='coating'?null:mdById(kind==='frit'?'fritProduct':'spandrelProduct',spec.productId);
    /* Спандрел на маршрутном листе не называет ни себя, ни свой тип. Строка
       выглядела как `PAINT Spandrel · Silicone Spandrel · Black #3-818 · #2`,
       и владелец её сократил: «spandrel это и есть силикон спандрел, просто
       paint, цвет и сторону, всё». Станция уже зовётся PAINT — слово «Spandrel»
       рядом было чистым повтором, а тип у цеха один.

       ЦЕНА РЕШЕНИЯ, зафиксировать честно: пока в справочнике активна ещё и
       керамика, на листе она неотличима от силикона. Правильный ответ —
       выключить неиспользуемый тип в Master Data → Catalogues, а не возвращать
       слово в строку. */
    var parts=[];
    if(kind==='coating')parts.push(salesVisionTypeLabel(ply.visionType));
    else if(kind==='frit'){parts.push('Frit');if(product)parts.push(product.name||product.code);}
    /* У фрита цвет — это слово из своего короткого списка, у спандрела —
       строка палитры с кодом. Один и тот же ключ, два разных справочника. */
    if(spec.color)parts.push(kind==='spandrel'?spandrelColourText(spec.color):spec.color);
    if(kind==='frit'&&spec.pattern)parts.push(spec.pattern);
    var label=parts.join(' · ');
    var where=position==='in_film'?'Into film':surface?'#'+surface:'Surface not selected';
    var summary=(label?label+' · ':'')+where,text=summary;
    if(kind==='frit'){
      if(spec.dotMm!=null)text+=' · Dot Ø '+spec.dotMm+' mm';
      var margins=[];
      if(spec.marginW16!=null)margins.push('W '+dimIn16(spec.marginW16/16));
      if(spec.marginH16!=null)margins.push('H '+dimIn16(spec.marginH16/16));
      if(margins.length)text+=' · Margins '+margins.join(' / ')+(spec.marginFrom?' from '+spec.marginFrom:'');
      if(spec.marking)text+=' · Marking: '+spec.marking;
    }
    out.push({kind:kind,spec:spec,surface:surface||0,face:face||'',position:position||'',where:where,summary:summary,text:text});
  }
  if(!lam&&pane.category==='spandrel'){
    var sp=pane.spandrel||{},sf=normalizeSurface(sp.surface,surfaces);
    add('spandrel',sp,sf,sf===surfaces[0]?'out':sf===surfaces[1]?'in':'');
    return out;
  }
  var f=ply.frit||{};
  if(lam?f.enabled:pane.visionType==='frit'){
    var fs=lam?(f.position==='in_film'?0:salesLaminatedFritOutsideSurface(index,side)):normalizeSurface(f.surface,surfaces);
    var face=lam?((side==='outer')===(f.position!=='in_film')?'out':'in'):
      fs===surfaces[0]?'out':fs===surfaces[1]?'in':'';
    add('frit',f,fs,face,lam?f.position:'');
  }
  if(ply.visionType==='lowe'||ply.visionType==='reflective'){
    /* Пока Makeup не хранит выбор грани покрытия на ply, не подменяем его
       наружной гранью. Legacy-номер панели применим только к своей ply. */
    var cs=normalizeSurface(lam?pane.coatingSurface:ply.coatingSurface,surfaces);
    if(lam&&cs!==salesLaminatedFritOutsideSurface(index,side))cs=null;
    add('coating',{},cs,cs===surfaces[0]?'out':cs===surfaces[1]?'in':'');
  }
  return out;
}

/* Точка слияния: там, где два стекла становятся одним изделием. */
function salesRouteMerge(unitType,panes){
  if(unitType&&unitType!=='single')return salesRouteStationOf('igu_assembly','IGU');
  if((panes||[]).some(function(p){return p&&p.category==='laminated';}))return salesRouteStationOf('lamination','LAM');
  return '';
}

/* Точка слияния и всё, что идёт ПОСЛЕ неё, дописываются в конец полосы —
   вне сортировки по seq, ровно как сама станция слияния. Место работы при этом
   не меняется: полировка склейки остаётся на EDGE, меняется только момент. */
function salesRouteAppendMerge(lites,merge){
  var name=merge?salesRouteStationName(merge):'';
  lites.forEach(function(l){
    if(merge&&!l.stations.some(function(s){return s.code===merge;}))
      l.stations.push({code:merge,name:name,items:[name]});
    (l.afterMerge||[]).forEach(function(s){l.stations.push(s);});
    delete l.afterMerge;
  });
  return lites;
}
function salesPrintRoute(line,order,shape,result){
  order=order||(typeof soDraft!=='undefined'?soDraft:null);
  var lites=[],merge='';
  var mk=(line&&order&&typeof salesMakeupById==='function')?salesMakeupById(order,line.makeupId):null;
  if(mk&&typeof salesEffectiveProductionSnapshot==='function'){
    var plan=salesEffectiveCuttingPlan(line,shape,order),snap=plan.snapshot||salesEffectiveProductionSnapshot(line,shape,order);
    var views=(snap&&snap.lites)||[];
    views.forEach(function(v,i){
      var pane=(mk.panes||[])[i],lam=pane&&pane.category==='laminated';
      var liteShape=v.shape||shape,liteResult=liteShape===shape?result:ShapeModule.compute(liteShape);
      var cut=(plan.lites||[]).find(function(c){return c.index===v.index;});
      liteResult=Object.assign({},liteResult,{cutting:cut?{valid:true,width:cut.cutW,height:cut.cutH}:null});
      (lam?['outer','inner']:['']).forEach(function(side){
        var glass=lam?(pane.laminated||{})[side]:pane,ht=salesRouteHeatOf(glass);
        var treatments=salesRouteSurfaceTreatments(pane,i,side);
        var st=salesRouteLiteStations(liteShape,liteResult,v.groups,ht,treatments,glass&&glass.heatSoak);
        var g=glass&&glassProductById(glass.glassProductId);
        var row={label:(v.label||('Lite '+(i+1)))+(side?(side==='outer'?'a':'b'):''),
          glass:(g?(g.code||g.name):'')+' · '+ht+(glass&&glass.heatSoak&&ht==='FT'?' + HST':''),stations:st.list,afterMerge:st.after};
        if(lam)salesRouteAppendMerge([row],salesRouteStationOf('lamination','LAM'));
        lites.push(row);
      });
    });
    merge=salesRouteMerge(mk.unitType,mk.panes);
    salesRouteAppendMerge(lites,merge);
  }
  /* Фигура из библиотеки заказа не имеет: маршрут строится по ней самой. */
  if(!lites.length){
    var groups=((result&&result.edges)||[]).map(function(g){
      return {id:g.id,length:g.length,
        ops:(typeof shapeEdgeOps==='function'?shapeEdgeOps(shape,g.id):[])};
    });
    var st0=salesRouteLiteStations(shape,result,groups,'');
    lites=[{label:'',glass:'',stations:st0.list,afterMerge:st0.after}];
    /* Даже без слияния хвост обязан доехать: иначе строка молча потеряется. */
    salesRouteAppendMerge(lites,'');
  }
  return {lites:lites,merge:merge,mergeName:merge?salesRouteStationName(merge):''};
}
