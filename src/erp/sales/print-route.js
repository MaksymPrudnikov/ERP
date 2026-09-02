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
  'CNC Shape Polish':'cnc_shape_polish','Mitering':'miter','Beveling':'bevel'};
const SALES_ROUTE_EDGE_LETTER={left:'A',bottom:'B',right:'C',top:'D'};

function salesRoutePush(map,order,code,text){
  if(!code||!text)return;
  if(!map[code]){map[code]={code:code,name:salesRouteStationName(code),items:[]};order.push(code);}
  if(map[code].items.indexOf(text)<0)map[code].items.push(text);
}

/* Позиция метки записывается ровно так, как её ввёл оператор: буква кромки, имя
   стороны, величина и УГОЛ ОТСЧЁТА. Правило не выдумываем — от какого угла
   мерили, уже выбрано в карточке и лежит в оформлении фигуры. */
function salesRouteMarkText(shape,geo,item,edgeLen){
  var name,pos='';
  if(item.type==='hole'){
    var d=fabParseDimStrict(item.diameter),count=shapeHoleCount(item);
    name=(count>1?count+' × ':'')+'HOLE Ø '+(d.ok?shapeFrac16(d.v):String(item.diameter||''));
    var hp=geo?shapeManufacturingHolePosition(item,geo):null;
    if(hp)pos=shapeManufacturingEdgeLabel(hp.hRef)+' '+shapeFrac16(hp.hDistance)+
      ' · '+shapeManufacturingEdgeLabel(hp.vRef)+' '+shapeFrac16(hp.vDistance);
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
  pos=(letter?letter+' · ':'')+shapeManufacturingEdgeLabel(edge)+' · '+
    shapeFrac16(shown)+' from '+corner;
  return name+' — '+pos;
}

/* Один лайт: что с ним делают и на какой станции. */
function salesRouteLiteStations(shape,result,groups,heatTreatment){
  var map={},order=[],geo=null;
  try{geo=(typeof shapeManufacturingGeometry==='function'&&shape===sDraft)?shapeManufacturingGeometry():null;}catch(e){geo=null;}
  if(!geo&&result&&result.valid&&(result.points||[]).length)geo={P:result.points,b:fabEdgeBounds(result.points)};

  var cut=result&&result.cutting&&result.cutting.valid?result.cutting:null;
  if(cut)salesRoutePush(map,order,'CUT',dimIn16(cut.width)+' × '+dimIn16(cut.height));

  /* Кромка: группируем по операции — «A, B · Flat Polish», а не четыре строки. */
  var byOp={},opOrder=[],edgeLen={};
  (groups||[]).forEach(function(g){
    edgeLen[g.id]=+g.length||0;
    (g.ops||[]).forEach(function(op){
      var t=op&&op.type;if(!t)return;
      if(!byOp[t]){byOp[t]=[];opOrder.push(t);}
      if(byOp[t].indexOf(g.id)<0)byOp[t].push(g.id);
    });
  });
  opOrder.forEach(function(t){
    salesRoutePush(map,order,salesRouteStationOf(SALES_ROUTE_EDGE_OP[t],'EDGE'),
      byOp[t].join(', ')+' · '+t);
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
    if(f.type==='cutout')salesRoutePush(map,order,fab,'INTERNAL CUTOUT');
    if(f.type==='radius'&&inch(f.radius)>0)salesRoutePush(map,order,fab,'RADIUS CORNER');
  });

  /* Печь и то, что она ставит. */
  if(heatTreatment&&heatTreatment!=='AN')
    salesRoutePush(map,order,salesRouteStationOf('tempering','HEAT'),
      heatTreatment==='HS'?'HEAT STRENGTHENING':'TEMPERING');
  (shape&&shape.features||[]).forEach(function(f){
    /* Штамп ставит печь — на отожжённом лайте его быть не может. */
    if(f.type==='stamp'&&heatTreatment&&heatTreatment!=='AN')
      salesRoutePush(map,order,'HEAT',String(shapeStampText(f)).toUpperCase());
    if(f.type==='sandblast')salesRoutePush(map,order,salesRouteStationOf('sandblasting','SAND'),
      String(shapeSandblastServiceLabel(f)).toUpperCase());
  });

  /* Печатаем в порядке маршрута цеха, а не в порядке заполнения. */
  var seq=salesRouteStations().map(function(s){return s.code;});
  var out=seq.filter(function(c){return map[c];}).map(function(c){return map[c];});
  order.forEach(function(c){if(seq.indexOf(c)<0)out.push(map[c]);});
  return out;
}

function salesRouteHeatOf(pane){
  var ht=pane&&(typeof mdById==='function'?mdById('heatTreatment',pane.heatTreatmentId):null);
  var code=(ht&&(ht.code||ht.name))||String(pane&&pane.heatTreatmentId||'').replace(/^HT-/,'');
  return String(code||'AN').toUpperCase();
}

/* Точка слияния: там, где два стекла становятся одним изделием. */
function salesRouteMerge(unitType,panes){
  if((panes||[]).some(function(p){return p&&p.category==='laminated';}))return 'LAM';
  if(unitType&&unitType!=='single')return 'IGU';
  return '';
}

function salesRouteAppendMerge(lites,merge){
  if(!merge)return lites;
  var name=salesRouteStationName(merge);
  lites.forEach(function(l){
    if(!l.stations.some(function(s){return s.code===merge;}))
      l.stations.push({code:merge,name:name,items:[name]});
  });
  return lites;
}
function salesPrintRoute(line,order,shape,result){
  order=order||(typeof soDraft!=='undefined'?soDraft:null);
  var lites=[],merge='';
  var mk=(line&&order&&typeof salesMakeupById==='function')?salesMakeupById(order,line.makeupId):null;
  if(mk&&typeof salesEffectiveProductionSnapshot==='function'){
    var snap=salesEffectiveProductionSnapshot(line,shape,order),views=(snap&&snap.lites)||[];
    lites=views.map(function(v,i){
      var pane=(mk.panes||[])[i];
      return {label:v.label||('Lite '+(i+1)),
        glass:pane?salesGlassCodeForPane(pane)+' · '+salesRouteHeatOf(pane):'',
        stations:salesRouteLiteStations(shape,result,v.groups,pane?salesRouteHeatOf(pane):'')};
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
    lites=[{label:'',glass:'',stations:salesRouteLiteStations(shape,result,groups,'')}];
  }
  return {lites:lites,merge:merge,mergeName:merge?salesRouteStationName(merge):''};
}
