/* =====================================================================
   muntin/catalog  ·  v4.5-port
   Каталог профилей мунтина (ширина лица, глубина, цвета сторон).
   IN : id профиля
   OUT: нормализованный профиль
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

var MUNTIN_DEFAULTS=[
 {id:"mb058_white",label:'White 5/8″ × 1/4″',faceWidthIn:0.625,depthIn:0.25,exteriorColor:"White",interiorColor:"White",exteriorHex:"#f4f2eb",interiorHex:"#f4f2eb",enabled:true},
 {id:"mb058_black",label:'Black 5/8″ × 1/4″',faceWidthIn:0.625,depthIn:0.25,exteriorColor:"Black",interiorColor:"Black",exteriorHex:"#202020",interiorHex:"#202020",enabled:true},
 {id:"mb058_black_white",label:'Black / White 5/8″ × 1/4″',faceWidthIn:0.625,depthIn:0.25,exteriorColor:"Black",interiorColor:"White",exteriorHex:"#202020",interiorHex:"#f4f2eb",enabled:true},
 {id:"mb100_black",label:'Black 1″ × 1/4″',faceWidthIn:1,depthIn:0.25,exteriorColor:"Black",interiorColor:"Black",exteriorHex:"#202020",interiorHex:"#202020",enabled:true}
];
function normalizeMuntinProduct(P){
 P=P||{};
 return {id:String(P.id||P.code||""),label:String(P.label||P.name||P.id||"Muntin bar"),
  faceWidthIn:isFinite(+P.faceWidthIn)?+P.faceWidthIn:(isFinite(+P.faceWidth)?+P.faceWidth:0.625),
  depthIn:isFinite(+P.depthIn)?+P.depthIn:(isFinite(+P.depth)?+P.depth:0.25),
  exteriorColor:String(P.exteriorColor||"Black"),interiorColor:String(P.interiorColor||P.exteriorColor||"Black"),
  exteriorHex:String(P.exteriorHex||(/^white$/i.test(P.exteriorColor||"")?"#f4f2eb":"#202020")),
  interiorHex:String(P.interiorHex||(/^white$/i.test(P.interiorColor||P.exteriorColor||"")?"#f4f2eb":"#202020")),
  enabled:P.enabled!==false};
}
var MUNTIN_BARS=MUNTIN_DEFAULTS.map(normalizeMuntinProduct);
function muntinProduct(id){
  for(var i=0;i<MUNTIN_BARS.length;i++)if(MUNTIN_BARS[i].id===id&&MUNTIN_BARS[i].enabled!==false)return MUNTIN_BARS[i];
  for(i=0;i<MUNTIN_BARS.length;i++)if(MUNTIN_BARS[i].enabled!==false)return MUNTIN_BARS[i];
  return normalizeMuntinProduct(MUNTIN_DEFAULTS[1]);
}
