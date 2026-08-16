/* =====================================================================
   muntin/bom  ·  v4.5-port
   Имена деталей, список раскроя, пояснение режима привязки к кромке.
   IN : geo из adaptive
   OUT: строки для BOM/UI
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function muntinSegId(prefix,s){return prefix+(s.bar+1)+(((s.segments||1)>1)?'-'+String.fromCharCode(65+(s.segment||0)):'');}
function muntinCutList(segments,prefix){if(!segments||!segments.length)return '—';return segments.map(function(s){return muntinSegId(prefix,s)+' '+dimIn(s.cut);}).join(' · ');}
function muntinEdgeModeNote(geo){
  if(!geo)return '';
  if(geo.edgeMode==='offset')return 'Bar ends hold a constant perpendicular distance of '+dimIn(geo.offsetInset)+' from the real glass edge; the bar end clearance is then applied along the bar axis.';
  if(geo.edgeModeForced)return 'Edge inset X and Y differ, so a single perpendicular distance has no meaning here. Falling back to axis-direction trimming — set both insets equal to use the offset reference.';
  return 'Legacy mode: bar ends are trimmed along the bar axis by the edge inset. On a raked, arched or curved edge that is not a constant distance from the glass.';
}
