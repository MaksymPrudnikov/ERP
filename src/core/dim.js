/* =====================================================================
   core/dim  ·  v4.5-port
   Разбор и печать дюймовых размеров (общее для Shape и Muntin).
   IN : строка "48", "48 1/2", "48-1/2", число
   OUT: число дюймов / строка вида 48 1/2″
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

/* ИСПРАВЛЕНО (авг 2026). Раньше inch() имел СВОЙ разбор, более слабый, чем
   fabParseDimStrict: "48-1/2" превращалось в 48 (дробь молча терялась), а "12abc"
   в 12. При этом сторона C читалась строгим парсером — то есть Width/Height и C
   понимали разный синтаксис. Теперь один парсер на всё; непонятный ввод = 0,
   и его ловит валидация ("Enter valid width and height"), а не тихо считает. */
function inch(t){
  if(typeof t==='number')return isFinite(t)?t:0;
  var r=fabParseDimStrict(t);
  return r.ok?r.v:0;
}
function frac64(v){
  v=+v||0;var whole=Math.floor(v+1e-9),n=Math.round((v-whole)*64);if(n===64){whole++;n=0;}
  if(!n)return String(whole);var a=n,b=64;while(b){var t=a%b;a=b;b=t;}n/=a;var d=64/a;
  return (whole?whole+' ':'')+n+'/'+d;
}
function dimIn(v){return frac64(v)+'″';}
/* Рабочая сетка изделия — 1/16″. Показывать размер стекла точнее сетки нельзя:
   цех такого не отрежет, а на чертеже 43-1/32 или 49-53/64 читается как ложная
   точность — эти дроби рождаются из вычисленных длин, а не из ввода.
   Каталожные величины остаются на frac64: ширина спейсера 17/32″ — настоящий
   размер продукта, и округлять её до 1/2″ нельзя. */
function frac16(v){
  v=+v||0;var whole=Math.floor(v+1e-9),n=Math.round((v-whole)*16);if(n===16){whole++;n=0;}
  if(!n)return String(whole);var a=n,b=16;while(b){var t=a%b;a=b;b=t;}n/=a;var d=16/a;
  return (whole?whole+' ':'')+n+'/'+d;
}
function dimIn16(v){return frac16(v)+'″';}
/* Единицы печатного листа чертежа (Data → Forms → Drawing; владелец,
   06.11.2026: «вдруг компания перейдёт на мм, или все чертежи с мм и
   инчами»). DIM_PRINT задаёт лист только на время своей отрисовки:
   {units:'in16'|'in'|'mm', alt:''|'in16'|'in'|'mm'}; null — дюймы 1/16,
   как на экране. Дюймы дробью — по сетке 1/16, десятичные — до сотых,
   мм — до десятых (владелец: «844.6»). Вторые единицы идут за маркером
   DIM_ALT: лист делает из них серую подпись (dimPrintAltSvg). */
var DIM_PRINT=null,DIM_ALT='⁣';
function dimUnitText(v,units,sign){
  v=+v||0;
  if(units==='mm'){var mm=String(Math.round(v*254)/10);return sign?mm+' mm':mm;}
  if(units==='in'){var d=(Math.round(v*100)/100).toFixed(2);return sign?d+'″':d;}
  return sign?dimIn16(v):frac16(v);
}
/* Число размера на чертеже без знака единиц: inchText — как его пишет
   чертёж сейчас (дробь 1/16, у цепочек 3-1/4). */
function dimPrint(v,inchText){
  var p=DIM_PRINT;if(!p)return inchText;
  var main=p.units==='in16'||!p.units?inchText:dimUnitText(v,p.units,false);
  return p.alt&&p.alt!==p.units?main+DIM_ALT+'('+dimUnitText(v,p.alt,true)+')':main;
}
/* Размер в тексте листа (Finished, подписи фритты): со знаком единиц. */
function dimPrintText(v){
  var p=DIM_PRINT;if(!p)return dimIn16(v);
  var main=dimUnitText(v,p.units||'in16',true);
  return p.alt&&p.alt!==p.units?main+' ('+dimUnitText(v,p.alt,true)+')':main;
}
/* Вторые единицы в готовом SVG — серой подписью меньшим кеглем. Маркер в
   атрибуте (подсказка, data-) просто становится пробелом. */
function dimPrintAltSvg(svg){
  return String(svg).replace(/⁣([^<"⁣]*)(?=<)/g,'<tspan class="shape-alt-units" font-size="80%"> $1</tspan>').replace(/⁣/g,' ');
}
function fabParseDimStrict(v){
  if(typeof v==='number')return isFinite(v)?{ok:true,v:v}:{ok:false,v:0};
  var t=String(v==null?'':v).trim().replace(/[\u2033\u201D"]/g,'');
  if(!t)return {ok:false,v:0,empty:true};
  var sign=1;
  if(t.charAt(0)==='-'){sign=-1;t=t.slice(1).trim();}else if(t.charAt(0)==='+'){t=t.slice(1).trim();}
  var m=t.match(/^(\d+(?:\.\d+)?)[\s-]+(\d+)\s*\/\s*(\d+)$/);
  if(m){var mixed=(+m[3])?sign*(+m[1]+(+m[2])/(+m[3])):NaN;return isFinite(mixed)?{ok:true,v:mixed}:{ok:false,v:0};}
  m=t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if(m){var fraction=(+m[2])?sign*((+m[1])/(+m[2])):NaN;return isFinite(fraction)?{ok:true,v:fraction}:{ok:false,v:0};}
  if(/^\d+(?:\.\d+)?$/.test(t)){var decimal=sign*parseFloat(t);return isFinite(decimal)?{ok:true,v:decimal}:{ok:false,v:0};}
  return {ok:false,v:0};
}
