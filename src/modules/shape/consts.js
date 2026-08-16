/* =====================================================================
   shape/consts  ·  v4.5-port
   Константы Smart-Shape: режимы уклона, углы, порядок, цвета рёбер.
   IN : —
   OUT: константы + буквенные имена рёбер
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

var SS_MODES=[{id:'m1',s1:1,s2:1},{id:'m2',s1:1,s2:-1},{id:'m3',s1:-1,s2:1},{id:'m4',s1:-1,s2:-1}];
var SS_CORNERS=[['none','None'],['single','Single'],['double','Double'],['triple','Triple']];
var SS_ORDER=['tl','tr','br','bl'];
var SS_COLORS={A:'#1a52c4',B:'#1c7a34',C:'#a84b00',D:'#9c1f88'};
var SS_EXTRA_COLORS=['#00838f','#c1362b','#6a4bbf','#8a5a1f','#0071a8','#a8447a','#5c7a1f','#7a3f8f','#a86a00','#3f6f8a','#a04040','#3f7a5f','#1f6f7a','#8f3f5f','#4f5fa8','#7a6a1f','#8a2f2f','#2f6a4f','#5f3f8a','#a05a2f','#2f5f8a','#6f8a2f','#8a4f7a','#3f8a7a'];
var SS_BAD={};

function ssMode(id){for(var i=0;i<SS_MODES.length;i++)if(SS_MODES[i].id===id)return SS_MODES[i];return null;}
function ssCornerCount(t){return t==='single'?1:t==='double'?2:t==='triple'?3:0;}
function ssCornerLabel(t){for(var i=0;i<SS_CORNERS.length;i++)if(SS_CORNERS[i][0]===t)return SS_CORNERS[i][1];return 'None';}
function ssAlpha(z){var n=z+1,s='';while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}return s;}
function ssLetter(i){return ssAlpha(i+4);}
function ssExtraColor(id){var n=0;for(var i=0;i<id.length;i++)n=n*26+(id.charCodeAt(i)-64);return SS_EXTRA_COLORS[Math.max(0,n-5)%SS_EXTRA_COLORS.length];}
function ssNum(v){var r=fabParseDimStrict(v);return r.ok?r.v:0;}
function ssNN(v){return Math.max(0,ssNum(v));}
