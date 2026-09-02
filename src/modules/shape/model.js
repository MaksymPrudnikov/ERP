/* =====================================================================
   shape/model  ·  v4.5-port
   Ссылочно-стабильная нормализация модели, карта угловых рёбер, суммы по углам.
   IN : сырая модель Smart-Shape
   OUT: нормализованная модель + карта рёбер E/F/G…
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

/* Ссылочно-стабильная нормализация: если модель уже корректна, возвращаем ТОТ ЖЕ объект.
   Иначе любой вызов ssModel() подменял бы объект, и записи по удержанной ссылке терялись. */
function ssIsModel(m){
  if(!(m&&typeof m==='object'&&m.corners&&m.extraEdges&&m.notch
    &&m.cornerOffsets&&['tl','tr','br','bl'].every(function(k){return m.cornerOffsets[k];})
    &&m.A&&m.A.elbow&&m.B&&m.B.elbow&&m.C&&m.C.elbow&&m.D&&m.D.elbow))return false;
  /* Нормализованной считается только модель, которая держит инвариант
     «нет углового блока — нет координат углов». Без этой проверки ранний выход
     пропускал уже сохранённые данные мимо нормализации, и скрытый вынос угла
     продолжал править геометрию после загрузки из хранилища. */
  if(['tl','tr','br','bl'].some(function(k){return m.corners[k]!=='none';}))return true;
  return ['tl','tr','br','bl'].every(function(k){
    var o=m.cornerOffsets[k]||{},a=parseFloat(o.plumb),b=parseFloat(o.level);
    return (!a||isNaN(a))&&(!b||isNaN(b));
  });
}
function ssNormalize(m){
  if(ssIsModel(m))return m;
  m=(m&&typeof m==='object')?m:{};
  var out={elbowsOn:m.elbowsOn!==false};
  /* D хранится наравне с A/B/C, но входными у неё являются только форма излома:
     elbow.elbowLen, elbow.to и elbow.mode. Длина, полный уход и elbow.past
     ВЫВОДЯТСЯ из замыкания контура — концы D заданы верхом A и верхом C.
     Единая структура записи нужна, чтобы модель, валидация и матрица рёбер
     работали со всеми четырьмя сторонами одинаково, без ветвлений по имени. */
  ['A','B','C','D'].forEach(function(e){
    var s=(m[e]&&typeof m[e]==='object')?m[e]:{},el=(s.elbow&&typeof s.elbow==='object')?s.elbow:{};
    out[e]={len:s.len==null?'':String(s.len),out:s.out==null?'0':String(s.out),dir:s.dir||null,
      elbow:{to:el.to==null?'0':String(el.to),elbowLen:el.elbowLen==null?'0':String(el.elbowLen),
             past:el.past==null?'0':String(el.past),mode:el.mode||null}};
  });
  out.corners={};
  /* без модульных констант: normalizeShapeModel вызывается раньше, чем они инициализируются */
  ['tl','tr','br','bl'].forEach(function(k){var v=(m.corners||{})[k];out.corners[k]=['none','single','double','triple'].indexOf(v)>=0?v:'none';});
  /* Координата угла существует только вместе с угловым блоком: редактировать её
     можно лишь когда блок выбран, поэтому хранить её при снятых блоках означало
     бы невидимую геометрию — размер «залипал» бы, и найти его в интерфейсе было
     невозможно. Снят последний угловой блок — координаты обнуляются. */
  var anyCorner=['tl','tr','br','bl'].some(function(k){return out.corners[k]!=='none';});
  out.cornerOffsets={};
  ['tl','tr','br','bl'].forEach(function(k){
    var c=(anyCorner&&m.cornerOffsets&&typeof m.cornerOffsets[k]==='object')?m.cornerOffsets[k]:{};
    out.cornerOffsets[k]={plumb:c.plumb==null?'0':String(c.plumb),plumbDir:c.plumbDir||null,
      level:c.level==null?'0':String(c.level),levelDir:c.levelDir||null};
  });
  /* Способ изготовления нотча. Геометрию он не меняет: нотч выпиливают после
     реза, и на контур раскроя не влияет ни рука, ни станок. Это цена — цех
     считает ручной и станочный вырез по-разному, а переменных там столько,
     что решение принимает владелец, а не формула. */
  out.notch={};
  ['tl','tr','br','bl'].forEach(function(k){
    var v=(m.notch||{})[k];out.notch[k]=v==='cnc'?'cnc':'hand';
  });
  out.extraEdges={};
  var ee=m.extraEdges||{};
  /* У ребра нотча есть не только длина, но и собственный скос: out — величина
     ухода от отвеса/уровня, dir — куда. Старые данные без этих полей читаются
     как нулевой скос, поэтому обратная совместимость сохраняется. */
  Object.keys(ee).forEach(function(k){
    var x=(ee[k]&&typeof ee[k]==='object')?ee[k]:{};
    out.extraEdges[k]={len:x.len==null?'':String(x.len),out:x.out==null?'0':String(x.out),dir:x.dir||null};
  });
  return out;
}
/* Нотчи фигуры и выбранный способ изготовления. Геометрию способ не меняет —
   это работа цеха и её цена. Функция чистая: её зовут и экран Cutout, и расчёт
   начислений заказа, чтобы у одного факта остался один хозяин. */
function ssNotchList(def){
  var m=def&&def.smart;if(!m||!m.corners)return [];
  if(def.source&&def.source.kind==='dxf')return [];
  /* pieces — сколько нотчей на самом деле в этом углу. Владелец 2 сентября
     2026: «дабл это 2 получается, трипл 3, клиент платит за каждую нотчь».
     Столько же у угла и лишних рёбер: single 2, double 4, triple 6. */
  return ['tl','tr','br','bl'].filter(function(k){return m.corners[k]&&m.corners[k]!=='none';})
    .map(function(k){var mode=m.corners[k];
      return {corner:k,mode:mode,pieces:mode==='triple'?3:mode==='double'?2:1,
        method:((m.notch||{})[k]==='cnc')?'cnc':'hand'};});
}
function ssNotchLabel(method){return method==='cnc'?'CNC notch':'Hand notch';}
function ssModel(S){if(!ssIsModel(S.shape.smart))S.shape.smart=ssNormalize(S.shape.smart);return S.shape.smart;}
/* A = высота слева (Height), B = низ (Width), C = высота справа (своё поле), D = AUTO */
function ssEdgeLen(S,e){
  if(e==='A')return Math.max(0,inch(S.h));
  if(e==='B')return Math.max(0,inch(S.w));
  var m=ssModel(S),r=fabParseDimStrict(m.C.len);
  return r.ok?Math.max(0,r.v):Math.max(0,inch(S.h));
}

/* ---------- карта угловых рёбер ---------- */
function ssEdgeMap(S){
  var m=ssModel(S),idx=0,map={},all=[];
  SS_ORDER.forEach(function(c){
    var n=ssCornerCount(m.corners[c]),arr=[];
    for(var step=0;step<n;step++){
      var v=ssLetter(idx++),h=ssLetter(idx++);
      arr.push({v:v,h:h,step:step});
      all.push({id:v,corner:c,axis:'v',step:step},{id:h,corner:c,axis:'h',step:step});
    }
    map[c]=arr;
  });
  return {map:map,all:all};
}
function ssSyncExtra(S){
  var m=ssModel(S),all=ssEdgeMap(S).all,next={};
  all.forEach(function(e){next[e.id]=m.extraEdges[e.id]||{len:'',out:'0',dir:null};});
  m.extraEdges=next;
}
/* Локальная система угла. Дублируется из contour/SS_CG на случай, если
   ssCornerTotals вызовут раньше инициализации контурного модуля. */
function ssCornerFrame(corner){
  if(typeof SS_CG!=='undefined'&&SS_CG[corner])return SS_CG[corner];
  var F={tl:{h:[1,0],v:[0,-1]},tr:{h:[-1,0],v:[0,-1]},br:{h:[-1,0],v:[0,1]},bl:{h:[1,0],v:[0,1]}};
  return F[corner]||F.tl;
}
/* Перпендикулярный вынос ребра нотча, приведённый к ЛОКАЛЬНЫМ осям угла.
   Вертикальное ребро уводит контур по горизонтали (left/right), горизонтальное —
   по вертикали (up/down). Приведение к локальным осям делает смысл направлений
   одинаковым во всех четырёх углах. */
function ssExtraOut(m,id,axis,g){
  var e=m.extraEdges[id]||{},o=ssNN(e.out);
  if(!(o>0)||!e.dir)return 0;
  if(axis==='v')return (e.dir==='right'?o:e.dir==='left'?-o:0)*(g.h[0]||1);
  return (e.dir==='up'?o:e.dir==='down'?-o:0)*(g.v[1]||1);
}
/* Суммы угла. Перпендикулярный вынос ОБЯЗАН входить в суммы: он смещает конец
   лесенки, а суммы задают, сколько лесенка отрезает от основных сторон.
   Именно это сохраняет контур замкнутым при скошенных рёбрах нотча. */
function ssCornerTotals(S,corner){
  var m=ssModel(S),g=ssCornerFrame(corner),pairs=ssEdgeMap(S).map[corner]||[],vals=pairs.map(function(p){
    return {vId:p.v,hId:p.h,V:ssNN((m.extraEdges[p.v]||{}).len),H:ssNN((m.extraEdges[p.h]||{}).len),
      VP:ssExtraOut(m,p.v,'v',g),HP:ssExtraOut(m,p.h,'h',g)};
  });
  var v=0,h=0;vals.forEach(function(x){v+=x.V-x.HP;h+=x.H+x.VP;});
  return {vals:vals,v:v,h:h};
}
/* Отклонение вершины от номинального прямоугольника. Plumb двигает X, level — Y. */
function ssCornerDelta(S,corner){
  var c=ssModel(S).cornerOffsets[corner]||{},x=ssNN(c.plumb),y=ssNN(c.level);
  return [c.plumbDir==='left'?-x:c.plumbDir==='right'?x:0,c.levelDir==='down'?-y:c.levelDir==='up'?y:0];
}
