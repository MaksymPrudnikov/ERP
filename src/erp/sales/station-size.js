/* =====================================================================
   sales/station-size  ·  влезает ли стекло в станции своего маршрута
   IN : строка заказа + заказ
   OUT: нарушения по стёклам — станция, размер реза, ограничение и чьё оно
   Правило: лимит не маршрутизирует. Станцию работе назначает справочник, а
   лимит только говорит «не влезет» — и говорит ДО резки (схема 4.3).

   Решения владельца 13 сентября 2026:
   - сравнивается размер РЕЗА с припусками: по станциям едет он, а не готовый;
   - стекло на станке можно повернуть на любой станции: меньшая сторона детали
     против меньшей стороны станции, большая против большей;
   - реакция — предупреждение с явным «сохранить всё равно?», а не запрет: пока
     габариты засеяны 144 × 100″, а не замерены, запрет останавливал бы
     законные заказы.

   Станции берутся из маршрута печатного листа (salesPrintRoute), а не
   выводятся здесь заново: второй расчёт «где едет стекло» разошёлся бы с
   листом при первой же правке маршрута.
   ===================================================================== */

/* Габарит парой «короткая, длинная». Пустая сторона — без ограничения. */
function salesSizePair(a,b){
  var x=+a>0?+a:Infinity,y=+b>0?+b:Infinity;
  return x<=y?[x,y]:[y,x];
}
/* Допуск в тысячную дюйма: рез лежит на сетке 1/16″, и совпавший до знака
   размер не должен читаться как «не влезает» из-за плавающей точки. */
function salesSizeFits(w,h,limit){
  var c=salesSizePair(w,h);
  return c[0]<=limit[0]+0.001&&c[1]<=limit[1]+0.001;
}
function salesSizeText(a,b){
  return (+a>0?dimIn16(+a):'—')+' × '+(+b>0?dimIn16(+b):'—');
}
/* Работа может ужесточить ограничение станции, но не ослабить. У работ одной
   семьи станок один (фацет по полосам толщины), а маршрут знает семью, но не
   всегда полосу, — поэтому берётся самое жёсткое ограничение семьи. */
function salesSizeWorkRows(id){
  var rows=DB.serviceRate||[],w=rows.find(function(r){return r&&r.id===id;});
  if(!w)return [];
  return w.family?rows.filter(function(r){return r&&r.active!==false&&r.family===w.family;}):[w];
}
function salesStationSizeProblems(line,order){
  order=order||(typeof soDraft!=='undefined'?soDraft:null);
  var shape=line&&order?salesLineGeometryShape(line):null;
  if(!shape)return [];
  var route=salesPrintRoute(line,order,shape,ShapeModule.compute(shape)),out=[];
  route.lites.forEach(function(row){
    if(!row.cut)return;
    row.stations.forEach(function(st){
      var s=(DB.station||[]).find(function(x){return x.code===st.code;});
      var limit=s?salesSizePair(s.maxW,s.maxL):[Infinity,Infinity],by=null;
      (st.works||[]).forEach(function(id){
        salesSizeWorkRows(id).forEach(function(w){
          var p=salesSizePair(w.maxW,w.maxL);
          if(p[0]<limit[0]||p[1]<limit[1]){limit=[Math.min(limit[0],p[0]),Math.min(limit[1],p[1])];by=w;}
        });
      });
      if(salesSizeFits(row.cut.width,row.cut.height,limit))return;
      out.push({lite:row.label,station:st.code,cutW:row.cut.width,cutH:row.cut.height,
        limitText:by?salesSizeText(by.maxW,by.maxL):salesSizeText(s&&s.maxW,s&&s.maxL),
        work:by?(by.name||by.id):'',
        /* Ограничение работы владелец вписал сам; у станции есть пометка замера. */
        measured:by?true:!!(s&&s.sizeMeasured)});
    });
  });
  return out;
}
/* Засев 144 × 100″ одинаков у всех станций, и одна деталь не влезает сразу в
   каждую станцию своего маршрута. Строка на станцию утопила бы вопрос —
   поэтому стёкла и станции с одним и тем же ограничением собираются в одну. */
function salesStationSizeTexts(problems){
  var groups=[],index={};
  problems.forEach(function(p){
    var key=[p.cutW,p.cutH,p.limitText,p.work,p.measured].join('|');
    if(!index[key]){index[key]={p:p,lites:[],codes:[]};groups.push(index[key]);}
    var g=index[key];
    if(p.lite&&g.lites.indexOf(p.lite)<0)g.lites.push(p.lite);
    if(g.codes.indexOf(p.station)<0)g.codes.push(p.station);
  });
  return groups.map(function(g){
    var p=g.p;
    return (g.lites.length?g.lites.join(', ')+': ':'')+'cut '+salesSizeText(p.cutW,p.cutH)+
      ' does not fit '+g.codes.join(', ')+' — '+(p.work?p.work+' ':'')+p.limitText+
      (p.measured?'':' (size not verified in the shop)');
  });
}
function salesStationSizeWarnings(order){
  var out=[];
  (order&&order.lines||[]).forEach(function(line,i){
    var problems=salesStationSizeProblems(line,order);if(!problems.length)return;
    var where='Line '+(i+1)+(line.mark?' ('+line.mark+')':'');
    salesStationSizeTexts(problems).forEach(function(t){out.push(where+' · '+t);});
  });
  return out;
}
/* Короткая подпись статуса строки: какие станции не пропускают. */
function salesStationSizeLabel(problems){
  var codes=[];
  problems.forEach(function(p){if(codes.indexOf(p.station)<0)codes.push(p.station);});
  return 'Too large · '+(codes.length>3?codes.slice(0,3).join(', ')+' +'+(codes.length-3):codes.join(', '));
}
