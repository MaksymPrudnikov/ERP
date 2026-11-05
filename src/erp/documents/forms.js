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
/* Шрифт блока: font times | courier (иначе Helvetica), italic — курсив. */
function formFace(b){return b.font||b.italic?(b.font||'helvetica')+(b.italic?'-i':''):'';}
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
/* Форматы полей (конструктор, окно Insert field): поле с типом date отдаёт
   день YYYY-MM-DD, блок выбирает вид. */
const FORM_FORMATS={date:[
 {k:'mdy',label:'Mon d, yyyy',f:v=>docDate(v)},
 {k:'iso',label:'yyyy-mm-dd',f:v=>v},
 {k:'dmy',label:'dd/mm/yyyy',f:v=>v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4)},
 {k:'long',label:'long',f:v=>{const d=new Date(+v.slice(0,4),+v.slice(5,7)-1,+v.slice(8,10));return d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});}}]};
function formFormat(v,type,fmt){
 const list=FORM_FORMATS[type];if(!list)return v;
 const f=(list.find(x=>x.k===fmt)||list[0]).f,one=x=>/^\d{4}-\d{2}-\d{2}/.test(String(x))?f(String(x).slice(0,10)):x;
 return Array.isArray(v)?v.map(one):v==null||v===''?v:one(v);
}
function formLines(b,ctx){
 let v=b.type==='text'?formFill(b.text,ctx):ctx.field(b.field);
 if(b.type==='field'&&ctx.type)v=formFormat(v,ctx.type(b.field),b.format);
 let src=Array.isArray(v)?v.filter(x=>x!=null).map(String):v==null||v===''?[]:[String(v)];
 if(!src.length&&b.empty)src=[b.empty];
 /* «Текст перед значением» (Date: …) — только у непустого поля. */
 else if(src.length&&b.prefix)src[0]=b.prefix+src[0];
 const size=b.size||9,out=[];
 const face=formFace(b);
 src.forEach(t=>{if(b.wrap)out.push(...docWrap(t,size,!!b.bold,b.w||0,face));else out.push(b.fit?docFit(t,size,!!b.bold,b.w||0,face):t);});
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
 /* after — блок стоит на той же строке сразу за первой строкой другого
    блока (вес рядом с кодом скида любой длины); gap — зазор. */
 bs.forEach(x=>{
  const ref=x.b.after&&bs.find(r=>r.b.id===x.b.after);
  if(ref&&ref.lines&&ref.lines.length)x.ax=formBlockX(tpl,ref.b)+docTextWidth(ref.lines[0],ref.b.size||9,!!ref.b.bold,ref.b.ls,formFace(ref.b))+(x.b.gap!=null?x.b.gap:12);
 });
 const done=[];
 bs.slice().sort((p,q)=>p.b.y-q.b.y||p.i-q.i).forEach(x=>{x.off=formShift(done,x.b.y);x.top=x.b.y+x.off;done.push(x);});
 return {h:Math.max(0,(part.h||0)+formShift(done,part.h||0)),blocks:bs};
}
/* Текст с {page}/{pages} запоминается в late и дописывается в конце. */
function formText(P,x,y,s,o,late){
 P.text(x,y,s,o);
 if(late&&/\{pages?\}/.test(s))late.push({item:P.items[P.items.length-1],s});
}
/* ax — x блока, который стоит сразу за другим (after). */
function formDrawLine(P,tpl,b,line,k,top,late,ax){
 const x=ax!=null?ax:formBlockX(tpl,b),w=b.w||0,align=ax!=null?'left':b.align||'left';
 formText(P,align==='right'?x+w:align==='center'?x+w/2:x,top+k*formLh(b),line,{size:b.size||9,bold:!!b.bold,color:b.color||DOC_COLOR.ink,align,ls:b.ls||0,face:formFace(b)},late);
}
function formDrawBlock(P,tpl,x,ctx,top,late){
 const b=x.b,bx=formBlockX(tpl,b),w=b.w||0,h=b.h||0;
 if(x.lines){x.lines.forEach((l,k)=>formDrawLine(P,tpl,b,l,k,top,late,x.ax));return;}
 /* Цвет '' у рамки — без контура (только заливка). */
 const stroke=b.color==null?DOC_COLOR.line:b.color;
 if(b.type==='line')P.line(bx,top,bx+w,top+h,{stroke:stroke||DOC_COLOR.line,lw:b.lw||.6});
 else if(b.type==='box')P.rect(bx,top,w,h,{stroke,fill:b.fill||'',lw:b.lw||.6,r:b.r||0});
 else if(b.type==='image'){const src=b.field?ctx.field(b.field):b.src;if(src&&docJpegInfo(src))P.img(bx,top,w,h,src);}
 else if(b.type==='barcode'){
  const v=String(ctx.field(b.field)||'');if(!v)return;
  /* Полосы — по align внутри блока; тихая зона штрихкода — за краем блока. */
  const m=b.module||1.44,bw=(barcode128Width(v)-2*BARCODE128_QUIET)*m,align=b.align||'left';
  const sx=align==='right'?bx+w-bw:align==='center'?bx+(w-bw)/2:bx;
  P.items.push(...barcode128Items(v,sx-BARCODE128_QUIET*m,top,h,m));
 }
}
/* Место блока на листе для конструктора: у текста y — линия букв, рамка
   — от верха букв; пустой текст всё равно занимает строку, чтобы его можно
   было выбрать мышью. */
function formRect(tpl,x,top,lines){
 const b=x.b,text=formIsText(b),bx=x.ax!=null?x.ax:formBlockX(tpl,b);
 return {x:bx,y:text?top-(b.size||9):top,w:b.w||0,h:text?Math.max(lines==null?x.e:lines*formLh(b),formLh(b)):b.h||0};
}
/* Часть целиком на одном листе (верх и низ страницы); блоки рисуются в
   порядке шаблона. Возвращает высоту части. mark(x, rect) — для
   конструктора: где на листе оказался блок. */
function formDrawPart(P,tpl,part,ctx,top,late,mark){
 if(!part)return 0;
 const lay=formLayout(tpl,part,ctx);
 lay.blocks.forEach(x=>{formDrawBlock(P,tpl,x,ctx,top+x.top,late);if(mark)mark(x,formRect(tpl,x,top+x.top));});
 return lay.h;
}
function formCtx(ctx,over){return over?{field:k=>Object.prototype.hasOwnProperty.call(over,k)?over[k]:ctx.field(k),type:ctx.type}:ctx;}

/* Ход по листам. Код бланка рисует таблицу сам (f.P, f.y, f.ensure,
   f.page), остальное — из шаблона. f.page(over, top): over — другие
   значения полей на следующих листах, top — другая часть вместо every
   (лист скида: skidTop); оба держатся до следующего f.page с ними.
   map — для конструктора: сюда пишутся места блоков {page, part, id, x, y,
   w, h} (блок, разорванный листом, — по куску на лист). */
function formFlow(tpl,ctx,map){
 const pg=tpl.page,m=pg.margin,late=[];
 const mark=key=>map?(x,r)=>map.push(Object.assign({page:f.pages.length-1,part:key,id:x.b.id},r)):null;
 const f={tpl,pages:[],P:null,y:0,top:0,topKey:'every',left:m.left,right:pg.w-m.right,bottom:pg.h-m.bottom,over:null};
 f.ctx=()=>formCtx(ctx,f.over);
 f.page=function(over,top){
  if(arguments.length){f.over=over||null;f.topKey=top||'every';}
  f.P=docPage();f.pages.push(f.P);
  f.y=m.top+formDrawPart(f.P,tpl,tpl.parts[f.topKey],f.ctx(),m.top,late,mark(f.topKey));f.top=f.y;return f;
 };
 f.ensure=h=>{if(f.y+h>f.bottom)f.page();};
 /* Часть в потоке (верх первой, итоги): начинается на этом листе, если на
    нём есть keep пунктов (по умолчанию — вся часть); дальше лист кончается
    только между строками и блоками. */
 f.flow=key=>{
  const part=tpl.parts[key];if(!part||!(part.blocks||[]).length)return f;
  const c=f.ctx(),lay=formLayout(tpl,part,c),keep=part.keep!=null?part.keep:lay.h;
  if(f.y+Math.min(keep,f.bottom-f.top)>f.bottom&&f.y>f.top+1)f.page();
  const units=[],mk=mark(key);
  lay.blocks.forEach(x=>{
   if(x.lines)x.lines.forEach((l,k)=>units.push({y:x.top+k*formLh(x.b),e:formLh(x.b),i:x.i,draw:(P,a)=>{formDrawLine(P,tpl,x.b,l,0,a,late,x.ax);if(mk)mk(x,formRect(tpl,x,a,1));}}));
   else units.push({y:x.top,e:x.e,i:x.i,draw:(P,a)=>{formDrawBlock(P,tpl,x,c,a,late);if(mk)mk(x,formRect(tpl,x,a));}});
   /* Пустое поле на листе не видно, но в конструкторе его можно выбрать. */
   if(mk&&x.lines&&!x.lines.length)units.push({y:x.top,e:0,i:x.i,draw:(P,a)=>mk(x,formRect(tpl,x,a))});
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
   const own=[],mk=mark('bottom');formDrawPart(P,tpl,tpl.parts.bottom,base,f.bottom,own,mk&&((x,r)=>map.push(Object.assign({page:i,part:'bottom',id:x.b.id},r))));
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

/* Колонки таблицы: ячейки по порядку от левого поля, скрытые (hide)
   пропускаются. cw — ширина ячейки, pad — отступ надписи от края ячейки,
   w — ширина переноса текста; число (type num) — у правого края. */
function formColumns(cols,left){
 let x0=left;
 return (cols||[]).filter(c=>!c.hide).map(c=>{
  const cw=c.cw||0,pad=c.pad!=null?c.pad:5,align=c.align||(c.type==='num'?'right':'left');
  const o=Object.assign({},c,{align,start:x0,x:align==='right'?x0+cw-pad:align==='center'?x0+cw/2:x0+pad,w:c.w!=null?c.w:Math.max(0,cw-2*pad)});
  x0+=cw;return o;
 });
}
function formCleanColumn(c){
 if(!c||typeof c!=='object'||typeof c.k!=='string'||!c.k)return null;
 const num=(v,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?Math.min(hi,Math.max(lo,Math.round(n*100)/100)):undefined;};
 const o={k:c.k.slice(0,40),label:typeof c.label==='string'?c.label.slice(0,60):'',type:c.type==='num'?'num':'text'};
 [['cw',0,600],['pad',0,100],['w',0,600],['size',4,40]].forEach(([k,lo,hi])=>{const v=num(c[k],lo,hi);if(v!==undefined)o[k]=v;});
 if(['left','center','right'].includes(c.align))o.align=c.align;
 ['bold','alert','hide'].forEach(k=>{if(c[k])o[k]=true;});
 return o;
}
/* Сохранённый шаблон (конструктор) → чистый: только известные ключи и
   типы, числа в разумных пределах. Части, которых в сохранённом нет (код
   добавил новую), берутся по умолчанию; колонки таблицы — сохранённые,
   если они есть. Поля страницы и направляющие (guides — только для
   конструктора, не печатаются) — из сохранённого, в разумных пределах. */
const FORM_BLOCK_TYPES=['text','field','image','line','box','barcode'];
const FORM_PLACES=['left','center','right','free'];
function formCleanBlock(b){
 if(!b||typeof b!=='object'||!FORM_BLOCK_TYPES.includes(b.type))return null;
 const num=(v,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?Math.min(hi,Math.max(lo,Math.round(n*100)/100)):undefined;};
 const str=(v,max)=>typeof v==='string'?v.slice(0,max||2000):undefined;
 const o={id:str(b.id,40)||'b'+Math.random().toString(36).slice(2,9),type:b.type,place:FORM_PLACES.includes(b.place)?b.place:'left'};
 [['x',-200,800],['y',-200,800],['w',0,800],['h',0,800],['size',4,96],['lh',0,200],['max',0,200],['lw',0,20],['r',0,50],['ls',0,10],['gap',0,200],['module',.5,5]].forEach(([k,lo,hi])=>{const v=num(b[k],lo,hi);if(v!==undefined)o[k]=v;});
 ['text','field','color','fill','empty','prefix','format','after'].forEach(k=>{const v=str(b[k]);if(v!==undefined)o[k]=v;});
 if(['left','center','right'].includes(b.align))o.align=b.align;
 ['bold','italic','wrap','fit'].forEach(k=>{if(b[k])o[k]=true;});
 if(b.font==='times'||b.font==='courier')o.font=b.font;
 if(b.type==='image'&&typeof b.src==='string'&&/^data:image\/jpeg;base64,/.test(b.src)&&b.src.length<3e6)o.src=b.src;
 if(o.y===undefined)o.y=0;
 return o;
}
function formClean(src,def){
 if(!src||typeof src!=='object'||!src.parts||typeof src.parts!=='object')return def;
 const m=Object.assign({},def.page.margin),sm=src.page&&src.page.margin||{};
 ['top','right','bottom','left'].forEach(k=>{const v=Number(sm[k]);if(Number.isFinite(v))m[k]=Math.max(0,Math.min(250,Math.round(v*100)/100));});
 const out={form:def.form,page:{w:def.page.w,h:def.page.h,margin:m},parts:{}};
 const g=src.guides||{},gl=a=>(Array.isArray(a)?a:[]).map(Number).filter(v=>Number.isFinite(v)&&v>=0&&v<=800).slice(0,40).map(v=>Math.round(v*100)/100);
 if(gl(g.x).length||gl(g.y).length)out.guides={x:gl(g.x),y:gl(g.y)};
 Object.keys(def.parts).forEach(k=>{
  const d=def.parts[k],s=src.parts[k];
  if(d.columns){const c=s&&Array.isArray(s.columns)?s.columns.map(formCleanColumn).filter(Boolean):null;out.parts[k]=c&&c.length?Object.assign({},d,{columns:c}):d;return;}
  if(!s||!Array.isArray(s.blocks)){out.parts[k]=d;return;}
  const h=Number(s.h);
  out.parts[k]=Object.assign({},d,{h:Number.isFinite(h)?Math.max(0,Math.min(800,h)):d.h,blocks:s.blocks.map(formCleanBlock).filter(Boolean)});
 });
 return out;
}
