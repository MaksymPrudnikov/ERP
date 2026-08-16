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
  return !!(m&&typeof m==='object'&&m.corners&&m.extraEdges
    &&m.A&&m.A.elbow&&m.B&&m.B.elbow&&m.C&&m.C.elbow);
}
function ssNormalize(m){
  if(ssIsModel(m))return m;
  m=(m&&typeof m==='object')?m:{};
  var out={elbowsOn:m.elbowsOn!==false};
  ['A','B','C'].forEach(function(e){
    var s=(m[e]&&typeof m[e]==='object')?m[e]:{},el=(s.elbow&&typeof s.elbow==='object')?s.elbow:{};
    out[e]={len:s.len==null?'':String(s.len),out:s.out==null?'0':String(s.out),dir:s.dir||null,
      elbow:{to:el.to==null?'0':String(el.to),elbowLen:el.elbowLen==null?'0':String(el.elbowLen),
             past:el.past==null?'0':String(el.past),mode:el.mode||null}};
  });
  out.corners={};
  /* без модульных констант: normalizeShapeModel вызывается раньше, чем они инициализируются */
  ['tl','tr','br','bl'].forEach(function(k){var v=(m.corners||{})[k];out.corners[k]=['none','single','double','triple'].indexOf(v)>=0?v:'none';});
  out.extraEdges={};
  var ee=m.extraEdges||{};
  Object.keys(ee).forEach(function(k){out.extraEdges[k]={len:(ee[k]&&ee[k].len!=null)?String(ee[k].len):''};});
  return out;
}
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
  all.forEach(function(e){next[e.id]=m.extraEdges[e.id]||{len:''};});
  m.extraEdges=next;
}
function ssCornerTotals(S,corner){
  var m=ssModel(S),pairs=ssEdgeMap(S).map[corner]||[],vals=pairs.map(function(p){
    return {vId:p.v,hId:p.h,V:ssNN((m.extraEdges[p.v]||{}).len),H:ssNN((m.extraEdges[p.h]||{}).len)};
  });
  var v=0,h=0;vals.forEach(function(x){v+=x.V;h+=x.H;});
  return {vals:vals,v:v,h:h};
}
