/* =====================================================================
   erp/documents/forms  ·  forms-1.0
   Шаблон бланка из блоков (этап 7, конструктор форм; первая форма —
   Packing slip). Рисует на тех же листах docPage, что и остальные бланки,
   поэтому Preview, Print и PDF (docPdfBytes) совпадают.
   IN : шаблон — простые данные {page, parts}; контекст — field(k), значение
        поля бланка (строка или список строк)
   OUT: листы docPage
   Части листа: every — верх каждой страницы, first — верх первой, table —
   таблица (её рисует код бланка через formFlow), totals — итоги, bottom —
   низ каждой страницы.
   Блок: type text | field | image | line | box | barcode; place left |
   center | right | free (free — свой x); y — от верха части; w, h — размер.
   У текста y — линия букв первой строки, строки идут через lh, блок
   занимает строки × lh. Текст и поле растут и сжимаются по числу строк, и
   блоки ниже сдвигаются сами; остальные блоки всегда занимают свою h.
   ===================================================================== */

function formIsText(b){return b.type==='text'||b.type==='field';}
function formLh(b){return b.lh||(b.size||9)+5;}
function formBlockX(tpl,b){
 const m=tpl.page.margin,right=tpl.page.w-m.right,w=b.w||0;
 return b.place==='free'?b.x||0:b.place==='right'?right-w:b.place==='center'?(m.left+right-w)/2:m.left;
}
/* Надпись с полями: «{number} · {page} / {pages}»; {number|Skid contents}
   — запасной текст, когда поле пустое. Номер страницы известен только в
   конце, поэтому {page} и {pages} остаются до formFlow.finish. */
function formFill(s,ctx){
 return String(s==null?'':s).replace(/\{([\w.]+)(?:\|([^}]*))?\}/g,(all,k,alt)=>{
  if(k==='page'||k==='pages')return all;
  let v=ctx.field(k);if(v==null)return all;
  v=Array.isArray(v)?v.join(', '):String(v);return v===''&&alt!=null?alt:v;
 });
}
function formLines(b,ctx){
 const v=b.type==='text'?formFill(b.text,ctx):ctx.field(b.field);
 let src=Array.isArray(v)?v.filter(x=>x!=null).map(String):v==null||v===''?[]:[String(v)];
 if(!src.length&&b.empty)src=[b.empty];
 const size=b.size||9,out=[];
 src.forEach(t=>{if(b.wrap)out.push(...docWrap(t,size,!!b.bold,b.w||0));else out.push(b.fit?docFit(t,size,!!b.bold,b.w||0):t);});
 return b.max?out.slice(0,b.max):out;
}
/* Сдвиг блока, который стоит на высоте y части: он держится за ближайший
   блок над собой (тот, что кончается ниже всех) и уходит вместе с ним, но
   никогда не налезает на выросший блок выше. */
function formShift(done,y){
 const above=done.filter(a=>a.nb<=y+1e-9);if(!above.length)return 0;
 const nb=Math.max(...above.map(a=>a.nb));
 const anchor=Math.max(...above.filter(a=>a.nb===nb).map(a=>a.off+a.e-(a.b.h||0)));
 return Math.max(anchor,Math.max(...above.map(a=>a.top+a.e))-y);
}
function formLayout(tpl,part,ctx){
 const bs=(part.blocks||[]).map((b,i)=>{const lines=formIsText(b)?formLines(b,ctx):null;return {b,i,lines,e:lines?lines.length*formLh(b):b.h||0,nb:b.y+(b.h||0)};});
 const done=[];
 bs.slice().sort((p,q)=>p.b.y-q.b.y||p.i-q.i).forEach(x=>{x.off=formShift(done,x.b.y);x.top=x.b.y+x.off;done.push(x);});
 return {h:Math.max(0,(part.h||0)+formShift(done,part.h||0)),blocks:bs};
}
/* Текст с {page}/{pages} запоминается в late и дописывается в конце. */
function formText(P,x,y,s,o,late){
 P.text(x,y,s,o);
 if(late&&/\{pages?\}/.test(s))late.push({item:P.items[P.items.length-1],s});
}
function formDrawLine(P,tpl,b,line,k,top,late){
 const x=formBlockX(tpl,b),w=b.w||0,align=b.align||'left';
 formText(P,align==='right'?x+w:align==='center'?x+w/2:x,top+k*formLh(b),line,{size:b.size||9,bold:!!b.bold,color:b.color||DOC_COLOR.ink,align},late);
}
function formDrawBlock(P,tpl,x,ctx,top,late){
 const b=x.b,bx=formBlockX(tpl,b),w=b.w||0,h=b.h||0;
 if(x.lines){x.lines.forEach((l,k)=>formDrawLine(P,tpl,b,l,k,top,late));return;}
 if(b.type==='line')P.line(bx,top,bx+w,top+h,{stroke:b.color||DOC_COLOR.line,lw:b.lw||.6});
 else if(b.type==='box')P.rect(bx,top,w,h,{stroke:b.color||DOC_COLOR.line,fill:b.fill||'',lw:b.lw||.6,r:b.r||0});
 else if(b.type==='image'){const src=b.field?ctx.field(b.field):b.src;if(src&&docJpegInfo(src))P.img(bx,top,w,h,src);}
 else if(b.type==='barcode'){
  const v=String(ctx.field(b.field)||'');if(!v)return;
  /* Полосы — по align внутри блока; тихая зона штрихкода — за краем блока. */
  const m=b.module||1.44,bw=(barcode128Width(v)-2*BARCODE128_QUIET)*m,align=b.align||'left';
  const sx=align==='right'?bx+w-bw:align==='center'?bx+(w-bw)/2:bx;
  P.items.push(...barcode128Items(v,sx-BARCODE128_QUIET*m,top,h,m));
 }
}
/* Часть целиком на одном листе (верх и низ страницы); блоки рисуются в
   порядке шаблона. Возвращает высоту части. */
function formDrawPart(P,tpl,part,ctx,top,late){
 if(!part)return 0;
 const lay=formLayout(tpl,part,ctx);
 lay.blocks.forEach(x=>formDrawBlock(P,tpl,x,ctx,top+x.top,late));
 return lay.h;
}
function formCtx(ctx,over){return over?{field:k=>Object.prototype.hasOwnProperty.call(over,k)?over[k]:ctx.field(k)}:ctx;}

/* Ход по листам. Код бланка рисует таблицу сам (f.P, f.y, f.ensure,
   f.page), остальное — из шаблона. over — другие значения полей на
   следующих листах (лист скида: свой заголовок, без штрихкода PS). */
function formFlow(tpl,ctx){
 const pg=tpl.page,m=pg.margin,late=[];
 const f={tpl,pages:[],P:null,y:0,top:0,left:m.left,right:pg.w-m.right,bottom:pg.h-m.bottom,over:null};
 f.ctx=()=>formCtx(ctx,f.over);
 f.page=function(over){
  if(arguments.length)f.over=over||null;
  f.P=docPage();f.pages.push(f.P);
  f.y=m.top+formDrawPart(f.P,tpl,tpl.parts.every,f.ctx(),m.top,late);f.top=f.y;return f;
 };
 f.ensure=h=>{if(f.y+h>f.bottom)f.page();};
 /* Часть в потоке (верх первой, итоги): начинается на этом листе, если на
    нём есть keep пунктов (по умолчанию — вся часть); дальше лист кончается
    только между строками и блоками. */
 f.flow=key=>{
  const part=tpl.parts[key];if(!part||!(part.blocks||[]).length)return f;
  const c=f.ctx(),lay=formLayout(tpl,part,c),keep=part.keep!=null?part.keep:lay.h;
  if(f.y+Math.min(keep,f.bottom-f.top)>f.bottom&&f.y>f.top+1)f.page();
  const units=[];
  lay.blocks.forEach(x=>{
   if(x.lines)x.lines.forEach((l,k)=>units.push({y:x.top+k*formLh(x.b),e:formLh(x.b),i:x.i,draw:(P,a)=>formDrawLine(P,tpl,x.b,l,0,a,late)}));
   else units.push({y:x.top,e:x.e,i:x.i,draw:(P,a)=>formDrawBlock(P,tpl,x,c,a,late)});
  });
  let off=f.y;
  units.sort((p,q)=>p.y-q.y||p.i-q.i).forEach(u=>{
   let a=u.y+off;
   if(a+u.e>f.bottom&&a>f.top+1){f.page();off=f.y-u.y;a=f.y;}
   u.draw(f.P,a);
  });
  f.y=lay.h+off;return f;
 };
 f.finish=()=>{
  const N=f.pages.length,base=formCtx(ctx,null);
  f.pages.forEach((P,i)=>{
   const own=[];formDrawPart(P,tpl,tpl.parts.bottom,base,f.bottom,own);
   own.forEach(x=>{x.page=i+1;});late.push(...own);
  });
  late.forEach(x=>{
   const n=x.page||f.pages.findIndex(P=>P.items.includes(x.item))+1;
   x.item.s=docText(x.s.replace(/\{page\}/g,n).replace(/\{pages\}/g,N));
  });
  return f.pages;
 };
 return f;
}
