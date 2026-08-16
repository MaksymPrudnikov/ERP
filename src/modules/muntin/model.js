/* =====================================================================
   muntin/model  ·  v4.5-port
   Нормализация модели мунтина + цвета + разбор списка позиций.
   IN : сырая модель из БД/JSON
   OUT: модель с гарантированными полями
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function clampBars(v){v=parseInt(v,10);return isFinite(v)?Math.max(0,Math.min(12,v)):0;}
function normalizeMuntinModel(M){
  M=M||{};
  if(M.enabled==null)M.enabled=false; else M.enabled=!!M.enabled;
  if(!M.productId)M.productId="mb058_black";
  if(!M.layout||typeof M.layout!=="object")M.layout={};
  if(!M.layout.type)M.layout.type="grid";
  M.layout.verticalBars=clampBars(M.layout.verticalBars==null?1:M.layout.verticalBars);
  M.layout.horizontalBars=clampBars(M.layout.horizontalBars==null?1:M.layout.horizontalBars);
  if(!M.production||typeof M.production!=="object")M.production={};
  if(M.production.mode!=="custom")M.production.mode="equal";
  if(!isFinite(+M.production.edgeInsetX))M.production.edgeInsetX=0.4375; else M.production.edgeInsetX=Math.max(0,+M.production.edgeInsetX);
  if(!isFinite(+M.production.edgeInsetY))M.production.edgeInsetY=0.4375; else M.production.edgeInsetY=Math.max(0,+M.production.edgeInsetY);
  if(!isFinite(+M.production.endClearance))M.production.endClearance=0; else M.production.endClearance=Math.max(0,+M.production.endClearance);
  if(M.production.edgeMode!=='axis')M.production.edgeMode='offset';
  if(!Array.isArray(M.production.verticalPositions))M.production.verticalPositions=[];
  if(!Array.isArray(M.production.horizontalPositions))M.production.horizontalPositions=[];
  M.flipped=!!M.flipped;
  return M;
}
function muntinColors(M){
  M=normalizeMuntinModel(M);var P=muntinProduct(M.productId);
  var ext={name:P.exteriorColor,hex:P.exteriorHex},inn={name:P.interiorColor,hex:P.interiorHex};
  if(M.flipped){var t=ext;ext=inn;inn=t;}
  return {exterior:ext,interior:inn};
}
function parsePosList(t,max,count){
  var vals=String(t||'').split(/[,;]+/).map(function(x){return inch(x.trim());}).filter(function(x){return isFinite(x)&&x>0&&x<max;});
  vals.sort(function(a,b){return a-b;});if(count!=null)vals=vals.slice(0,count);return vals;
}
