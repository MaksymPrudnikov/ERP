/* ============================================================================
   Чертежи заказа одним PDF — для письма клиенту (скрепка панели Gmail,
   erp/mail-bridge). Лист чертежа — HTML с SVG (sales/print-sheet): в PDF он
   попадает картинкой, нарисованной браузером так же, как в окне Drawings, —
   по листу на страницу, Letter, книжная или альбомная (Forms → Drawing).
   IN : заказ; salesLineDrawing, salesLineStepSheets (листы строк и стёкол
        ступенчатого юнита), salesSheetFitDrawing; стили страницы
   OUT: docDrawingSheetsOf(order) — листы заказа; docDrawingsPdf(order) →
        Promise {name, bytes, sheets}
   Владелец, 16.11.2026: «чертежи логично прикреплять все сразу к целому
   заказу одним PDF». Recut — переделки цеха, клиенту не нужны: только
   строки заказа. Лист с ошибкой геометрии в PDF не попадает.
   Стили листа берутся из правил страницы, которые к нему относятся;
   страница, открытая файлом с диска, свои файлы стилей читать не даёт —
   тогда лист без оформления, но с чертежом (сайт и собранный файл —
   с оформлением).
   ============================================================================ */
/* Как лист в окне Drawings (.doc-drawing): 850 × 1100 и поле 34 px — на бумаге 0,34″. */
const DOC_DRAW_PX={w:850,h:1100},DOC_DRAW_PAD=34,DOC_DRAW_SCALE=2,DOC_DRAW_JPEG=0.86;
/* Листы в порядке окна Drawings: строка, за ней листы её стёкол. */
/* Клиенту — базовый вид из Forms → Drawing: кнопка Metric detail редактора
   фигуры (своя у компьютера, мм-вид) на PDF не влияет (владелец, 16.11.2026:
   «почему открыло чертёж в мм, а не базово в инчах»). */
function docDrawingSheetsOf(o){
 const metric=typeof sMetricDetail!=='undefined'&&sMetricDetail;
 if(metric)sMetricDetail=false;
 try{return docDrawingSheetsBase(o);}finally{if(metric)sMetricDetail=true;}
}
function docDrawingSheetsBase(o){
 const lines=o&&o.lines||[],lites=l=>typeof salesLineStepSheets==='function'?salesLineStepSheets(l,o):[];
 return lines.flatMap((l,i)=>[{i,l,lite:null}].concat(lites(l).map(k=>({i,l,lite:k}))))
  .map(x=>{const d=salesLineDrawing(x.l,null,x.lite,o);return d&&d.html?{i:x.i,lite:x.lite,html:d.html,land:/class="print-shape-sheet[^"]*\bdw-land\b/.test(d.html)}:null;})
  .filter(Boolean);
}
/* Правила стилей, что касаются листа в host: обычные — если находят что-то
   внутри (::before и :hover — по самому элементу: штриховка распорки),
   :root/html/body — переменные и шрифт, @font-face — шрифты, @media — те,
   что верны на экране сейчас. Чужой файл стилей пропускается. */
const DOC_DRAW_PSEUDO=/::?(before|after|marker|placeholder|first-line|first-letter|hover|focus|focus-visible|focus-within|active|visited)\b/g;
function docDrawingCss(host){
 const one=s=>{try{return !!host.querySelector(s.replace(DOC_DRAW_PSEUDO,'')||'*');}catch(e){return false;}};
 const out=[],hit=sel=>/(^|,)\s*(:root|html|body)\b/.test(sel)||sel.split(',').some(one);
 const walk=rules=>{for(const r of rules){
  if(r.type===1){if(hit(r.selectorText))out.push(r.cssText);}
  else if(r.type===5)out.push(r.cssText);
  /* @media — как на этом экране сейчас (картинка листа своей ширины не знает). */
  else if(r.type===4){const mt=r.media.mediaText;if(!/\bprint\b/.test(mt)&&window.matchMedia(mt).matches)walk(r.cssRules);}
 }};
 for(const s of document.styleSheets){let rules;try{rules=s.cssRules;}catch(e){continue;}if(rules)walk(rules);}
 return out.join('\n');
}
function docDrawingImage(svg){
 return new Promise((res,rej)=>{const img=new Image();img.onload=()=>res(img);img.onerror=()=>rej(new Error('The drawing could not be drawn.'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});
}
/* Один лист → JPEG страницы. Альбомный лист кладётся на книжную страницу
   повёрнутым, страница помечается /Rotate 90 — читалка показывает его лёжа. */
async function docDrawingJpeg(sheet){
 const W=sheet.land?DOC_DRAW_PX.h:DOC_DRAW_PX.w,H=sheet.land?DOC_DRAW_PX.w:DOC_DRAW_PX.h;
 const host=document.createElement('div');host.className='doc-draw-pdf';host.style.cssText='position:fixed;left:-20000px;top:0;width:'+W+'px;height:'+H+'px;padding:'+DOC_DRAW_PAD+'px;box-sizing:border-box;overflow:hidden;background:#fff';
 host.innerHTML='<div class="print-sheet" style="height:100%">'+printSheetUniqueIds(sheet.html)+'</div>';
 document.body.appendChild(host);
 try{
  try{salesSheetFitDrawing(host.firstChild);}catch(e){/* как в окне Drawings: без подгонки лист тоже читается */}
  const css=docDrawingCss(host),font=getComputedStyle(document.body).fontFamily;
  const body=new XMLSerializer().serializeToString(host.firstChild);
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'"><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="doc-draw-pdf" style="width:'+W+'px;height:'+H+'px;padding:'+DOC_DRAW_PAD+'px;box-sizing:border-box;overflow:hidden;background:#fff;font-family:'+font.replace(/"/g,"'")+'"><style>'+css.replace(/<\//g,'<\\/')+'</style>'+body+'</div></foreignObject></svg>';
  const img=await docDrawingImage(svg),c=document.createElement('canvas'),k=DOC_DRAW_SCALE;
  c.width=(sheet.land?H:W)*k;c.height=(sheet.land?W:H)*k;
  const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
  if(sheet.land){g.translate(0,c.height);g.rotate(-Math.PI/2);}
  g.drawImage(img,0,0,W*k,H*k);
  return c.toDataURL('image/jpeg',DOC_DRAW_JPEG);
 }finally{host.remove();}
}
async function docDrawingsPdf(o){
 const sheets=docDrawingSheetsOf(o);if(!sheets.length)throw new Error('The order has no drawings.');
 const pages=[];
 for(const s of sheets){const src=await docDrawingJpeg(s);pages.push(Object.assign({items:[{t:'img',src,x:0,y:0,w:DOC_PAGE.w,h:DOC_PAGE.h}]},s.land?{rotate:90}:{}));}
 const title='Drawings '+(o.businessNumber||'draft');
 return {name:title.replace(/[^A-Za-z0-9]+/g,'_')+'.pdf',bytes:docPdfBytes(pages,{title}),sheets:sheets.length};
}
