/* =====================================================================
   shape/validate  ·  v4.5-port
   Валидация Smart-Shape: размеры, локти, угловые блоки, самопересечение.
   IN : линия Shape S
   OUT: {errors[], warns[]}
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function ssValidate(S){
  var m=ssModel(S),errors=[],warns=[];
  ['A','B','C'].forEach(function(e){
    var L=ssEdgeLen(S,e),nm=(e==='A'?'A (left / Height)':e==='B'?'B (bottom / Width)':'C (right)');
    if(!(L>0)){errors.push('Edge '+nm+': length must be greater than 0.');return;}
    if(e==='C'){var rc=fabParseDimStrict(m.C.len);if(m.C.len!==''&&!rc.ok)errors.push('Edge C: "'+m.C.len+'" is not a valid dimension.');}
    if(!m.elbowsOn){
      var ro=fabParseDimStrict(m[e].out);
      if(m[e].out!==''&&!ro.ok)errors.push('Edge '+e+': out of plumb / level "'+m[e].out+'" is not a valid dimension.');
      else if(ro.ok&&ro.v<0)errors.push('Edge '+e+': out of plumb / level cannot be negative.');
      else if(ro.ok&&ro.v>0&&!m[e].dir)errors.push('Edge '+e+': pick which way it is out of plumb / level.');
      return;
    }
    var E=m[e].elbow,bad=null;
    ['to','elbowLen','past'].forEach(function(k){var r=fabParseDimStrict(E[k]);if(E[k]!==''&&!r.ok)bad=k;else if(r.ok&&r.v<0)bad=k;});
    if(bad){errors.push('Edge '+e+': "'+E[bad]+'" is not a valid '+(bad==='elbowLen'?'elbow length':'outage')+'.');return;}
    var to=ssNN(E.to),past=ssNN(E.past),h=ssNN(E.elbowLen);
    if(to<=0&&past<=0)return;
    if(!E.mode){errors.push('Edge '+e+': pick the elbow form (direction of the skew).');return;}
    if(h>L+1e-9){errors.push('Edge '+e+': elbow length '+dimIn(h)+' is longer than the edge ('+dimIn(L)+').');return;}
    /* elbow length 0 (или равный ребру) — обычный способ задать простой уклон:
       ребро берётся прямым, предупреждать не о чем. */
  });
  if(errors.length)return {errors:errors,warns:warns};
  var all=ssEdgeMap(S).all;
  all.forEach(function(e){
    var raw=(m.extraEdges[e.id]||{}).len;if(raw==null)raw='';var r=fabParseDimStrict(raw);
    if(!r.ok||r.v<=0)errors.push('Corner edge '+e.id+' ('+e.corner.toUpperCase()+'): '+((!r.ok&&raw!=='')?'"'+raw+'" is not a valid dimension':'no value yet')+'.');
  });
  if(errors.length)return {errors:errors,warns:warns};
  var G=ssBase(S),T={tl:ssCornerTotals(S,'tl'),tr:ssCornerTotals(S,'tr'),br:ssCornerTotals(S,'br'),bl:ssCornerTotals(S,'bl')};
  function fit(used,avail,txt){if(used-avail>1e-9)errors.push(txt+': corner steps '+dimIn(used)+' do not fit in '+dimIn(avail)+'.');}
  fit(T.tl.v+T.bl.v,ssEdgeLen(S,'A'),'Left side (A)');
  fit(T.tr.v+T.br.v,ssEdgeLen(S,'C'),'Right side (C)');
  fit(T.bl.h+T.br.h,ssEdgeLen(S,'B'),'Bottom (B)');
  fit(T.tl.h+T.tr.h,G.Dlen,'Top (D)');
  if(G.Dlen<=1e-9)errors.push('Top D is degenerate: its horizontal projection is zero.');
  if(!errors.length){
    var Q=ssContour(S);
    if(Q.pts.length<3)errors.push('Smart-Shape outline could not be built.');
    else if(fabPolySelfIntersects(Q.pts))errors.push('Smart-Shape outline self-intersects. Check the outages and corner blocks.');
    else if(Math.abs(fabSignedArea(Q.pts))<1e-6)errors.push('Smart-Shape outline encloses no area.');
  }
  Object.keys(SS_BAD).forEach(function(k){warns.push('"'+SS_BAD[k]+'" is not a valid dimension ('+k.replace(/:/g,' · ')+') — the last valid value is still in use.');});
  return {errors:errors,warns:warns};
}
function ssWarnings(S){
  if(!S||!S.shape||S.shape.type!=='smart')return [];
  try{return ssValidate(S).warns;}catch(e){return [];}
}
