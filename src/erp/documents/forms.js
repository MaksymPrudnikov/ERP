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
   Для бланков заказа (erp/documents/order-form): sa — интервал после
   текста, pin — место закреплено, after / before — за картинкой или перед
   текстом другого блока, lead и keep — строка от своего верха и «держать со
   следующим» в потоке, section — часть, которую рисует код бланка, opt —
   галочка окна ✎ Customize.
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
/* Поля компании — один набор во всех бланках, одни имена (владелец,
   06.11.2026: «везде должно быть одно название, не плодить разные наборы»).
   src — свои реквизиты (заказ из архива печатается реквизитами дня ухода). */
const FORM_COMPANY_BASE=['company.name','company.lines','company.logo'];
function formCompanyFields(src){
 const c=()=>src||DB.company||{},b=()=>docCompanyBlock(src);
 const addr=()=>{const x=c();return [[x.address1,x.address2].filter(Boolean).join(', '),[x.city,[x.province,x.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ');};
 const f=(k,label,v)=>({k,g:'Company',label,v});
 return [f('company.name','Company name',()=>b().name),f('company.lines','Address and contacts',()=>b().lines),f('company.logo','Logo',()=>b().logo||''),
  f('company.line','Company details, one line',()=>[c().legalName,addr(),c().phone,c().email,c().website].filter(Boolean).join(' · ')),
  f('company.address','Address, one line',addr),f('company.phone','Phone',()=>c().phone||''),f('company.email','Email',()=>c().email||''),
  f('company.website','Website',()=>c().website||''),f('company.hst','HST number',()=>c().hstNumber?'HST # '+c().hstNumber:'')];
}
/* Список полей бланка с общим набором компании: свои три поля (у Packing
   slip — из документа) остаются, остальные встают сразу за ними. */
function formWithCompany(list){
 const extra=formCompanyFields().filter(f=>!FORM_COMPANY_BASE.includes(f.k)),at=list.findIndex(f=>f.k==='company.logo');
 return at<0?formCompanyFields().filter(f=>!list.some(x=>x.k===f.k)).concat(list):list.slice(0,at+1).concat(extra,list.slice(at+1));
}
/* Прежние имена полей листа чертежа (до 06.11.2026) — общие имена. */
const FORM_FIELD_RENAMED={company:'company.name',companyLogo:'company.logo',companyLine:'company.line',companyAddress:'company.address',
 companyPhone:'company.phone',companyEmail:'company.email',companyWebsite:'company.website',companyHst:'company.hst',po:'customerPo'};
/* Свои поля из Data → Company (My fields) — одинаковы для всех бланков. */
function formMyFields(){return ((DB.company&&DB.company.myFields)||[]).map(f=>({k:'my.'+f.id,g:'My fields',label:f.name||'Untitled field',v:()=>f.value}));}
/* Show if: блок печатается, только если условие верно. show = {when:
   filled | is | not, field, value}; нет show — всегда. Сравнение без учёта
   регистра и пробелов по краям. */
function formShow(b,ctx){
 /* off — блок снят галочкой в окне Customize бланка заказа. */
 if(ctx.off&&ctx.off(b))return false;
 const s=b.show;if(!s||!s.when||!s.field)return true;
 let v=ctx.field(s.field);v=Array.isArray(v)?v.join(', '):String(v==null?'':v);
 const a=v.trim().toLowerCase(),want=String(s.value==null?'':s.value).trim().toLowerCase();
 return s.when==='filled'?!!a:s.when==='is'?a===want:s.when==='not'?a!==want:true;
}
function formLines(b,ctx,w){
 let v=b.type==='text'?formFill(b.text,ctx):ctx.field(b.field);
 if(b.type==='field'&&ctx.type)v=formFormat(v,ctx.type(b.field),b.format);
 let src=Array.isArray(v)?v.filter(x=>x!=null).map(String):v==null||v===''?[]:[String(v)];
 if(!src.length&&b.empty!=null)src=[b.empty];
 /* «Текст перед значением» (Date: …) — только у непустого поля. */
 else if(src.length&&b.prefix)src[0]=b.prefix+src[0];
 const size=b.size||9,out=[];
 const face=formFace(b);
 w=w!=null?w:b.w||0;
 src.forEach(t=>{if(b.wrap)out.push(...docWrap(t,size,!!b.bold,w,face));else out.push(b.fit?docFit(t,size,!!b.bold,w,face):t);});
 return b.max?out.slice(0,b.max):out;
}
/* Сдвиг блока, который стоит на высоте y части: он держится за ближайший
   блок над собой (тот, что кончается ниже всех) и уходит вместе с ним, но
   никогда не налезает на выросший блок выше. */
function formShift(done,y){
 const above=done.filter(a=>a.nb<=y+1e-9);if(!above.length)return 0;
 const nb=Math.max(...above.map(a=>a.nb));
 const anchor=Math.max(...above.filter(a=>a.nb===nb).map(a=>a.off+a.e-(a.nh!=null?a.nh:a.b.h||0)));
 return Math.max(anchor,Math.max(...above.map(a=>a.top+a.e))-y);
}
/* Картинка с fit — по своим пропорциям, не шире w (логотип бланка). */
function formImage(b,ctx){
 const src=b.field?ctx.field(b.field):b.src,info=src&&docJpegInfo(src);if(!info)return null;
 return {src,w:b.fit?Math.min(b.w||0,(b.h||0)*info.w/info.h):b.w||0};
}
/* Секция — часть бланка, которую рисует код бланка (ячейки шапки, адреса,
   итоги, подпись): ctx.section(k) → {h, draw(P, y)}; h 0 — нечего печатать. */
function formSection(b,ctx){const s=ctx.section?ctx.section(b.k):null;return s&&s.h>0?s:null;}
function formLayout(tpl,part,ctx){
 /* Скрытый (Show if) блок — как пустое поле: места не занимает, блоки ниже
    поднимаются. */
 /* Картинка без файла (нет логотипа) места не занимает. */
 const bs=(part.blocks||[]).map((b,i)=>{const sec=b.type==='section'?formSection(b,ctx):null,hide=!formShow(b,ctx)||b.type==='section'&&!sec||b.type==='image'&&!formImage(b,ctx),yt=b.y-(b.lead||0),nh=(b.h||0)+(b.sa||0);return {b,i,sec,hide,yt,nh,nb:yt+nh};});
 const text=x=>{x.lines=formIsText(x.b)?(x.hide?[]:formLines(x.b,ctx,x.aw)):null;};
 bs.forEach(x=>{if(!x.b.after&&!x.b.before)text(x);});
 /* after — блок стоит на той же строке сразу за первой строкой другого
    блока (вес рядом с кодом скида любой длины) или за картинкой (имя
    компании за логотипом), правый край остаётся на месте; before — перед
    текстом другого блока, вплотную справа («No.» перед номером); gap — зазор. */
 bs.forEach(x=>{
  const b=x.b,ref=(b.after||b.before)&&bs.find(r=>r.b.id===(b.after||b.before)),gap=b.gap!=null?b.gap:12,bx=formBlockX(tpl,b);
  if(ref&&!ref.hide){
   const rx=ref.ax!=null?ref.ax:formBlockX(tpl,ref.b),img=b.after&&ref.b.type==='image'?formImage(ref.b,ctx):null;
   const tw=ref.lines&&ref.lines.length?docTextWidth(ref.lines[0],ref.b.size||9,!!ref.b.bold,ref.b.ls,formFace(ref.b)):null;
   if(img){x.ax=rx+img.w+gap;x.aw=Math.max(0,(b.w||0)-(x.ax-bx));}
   else if(b.after&&tw!=null){x.ax=rx+tw+gap;x.aw=Math.max(0,(b.w||0)-(x.ax-bx));}
   else if(b.before&&tw!=null){const rw=ref.aw!=null?ref.aw:ref.b.w||0,al=ref.al||ref.b.align||'left';x.ax=(al==='right'?rx+rw-tw:al==='center'?rx+(rw-tw)/2:rx)-gap;x.al='right';}
  }
  if(b.after||b.before)text(x);
 });
 /* sa — интервал после блока (у текста — только у непустого). */
 bs.forEach(x=>{x.e=x.lines?(x.lines.length?x.lines.length*formLh(x.b)+(x.b.sa||0):0):x.hide?0:(x.sec?x.sec.h:x.b.h||0)+(x.b.sa||0);});
 /* pin — место закреплено: блок не ходит за блоками выше (шапка справа). */
 const done=[];
 bs.slice().sort((p,q)=>p.yt-q.yt||p.i-q.i).forEach(x=>{x.off=x.b.pin?0:formShift(done,x.yt);x.top=x.yt+x.off;done.push(x);});
 return {h:Math.max(0,(part.h||0)+formShift(done,part.h||0)),blocks:bs};
}
/* Текст с {page}/{pages} запоминается в late и дописывается в конце. */
function formText(P,x,y,s,o,late){
 P.text(x,y,s,o);
 if(late&&/\{pages?\}/.test(s))late.push({item:P.items[P.items.length-1],s});
}
/* ax — x блока, который стоит сразу за другим (after). */
function formDrawLine(P,tpl,b,line,k,top,late,ax,al){
 const x=ax!=null?ax:formBlockX(tpl,b),w=b.w||0,align=ax!=null?al||'left':b.align||'left';
 formText(P,ax!=null?x:align==='right'?x+w:align==='center'?x+w/2:x,top+k*formLh(b),line,{size:b.size||9,bold:!!b.bold,color:b.color||DOC_COLOR.ink,align,ls:b.ls||0,face:formFace(b)},late);
}
function formDrawBlock(P,tpl,x,ctx,top,late){
 const b=x.b,bx=formBlockX(tpl,b),w=b.w||0,h=b.h||0;if(x.hide)return;
 if(x.lines){x.lines.forEach((l,k)=>formDrawLine(P,tpl,b,l,k,top,late,x.ax,x.al));return;}
 if(x.sec){x.sec.draw(P,top);return;}
 /* Цвет '' у рамки — без контура (только заливка). */
 const stroke=b.color==null?DOC_COLOR.line:b.color;
 if(b.type==='line')P.line(bx,top,bx+w,top+h,{stroke:stroke||DOC_COLOR.line,lw:b.lw||.6});
 /* Рамка без контура и заливки — просто отступ (лист PO: пустая строка). */
 else if(b.type==='box'){if(stroke||b.fill)P.rect(bx,top,w,h,{stroke,fill:b.fill||'',lw:b.lw||.6,r:b.r||0});}
 else if(b.type==='image'){const im=formImage(b,ctx);if(im)P.img(bx,top,im.w,h,im.src);}
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
 const b=x.b,text=formIsText(b),w=x.aw!=null?x.aw:b.w||0,bx=x.ax!=null?(x.al==='right'?x.ax-w:x.ax):formBlockX(tpl,b);
 return {x:bx,y:text?top-(b.size||9):top,w,h:text?Math.max(lines==null?x.e:lines*formLh(b),formLh(b)):x.sec?x.sec.h:b.h||0};
}
/* Часть целиком на одном листе (верх и низ страницы); блоки рисуются в
   порядке шаблона. Возвращает высоту части. mark(x, rect) — для
   конструктора: где на листе оказался блок. */
function formDrawPart(P,tpl,part,ctx,top,late,mark){
 if(!part)return 0;
 const lay=formLayout(tpl,part,ctx);
 lay.blocks.forEach(x=>{const a=top+x.top+(x.b.lead||0);formDrawBlock(P,tpl,x,ctx,a,late);if(mark)mark(x,formRect(tpl,x,a));});
 return lay.h;
}
function formCtx(ctx,over){return over?Object.assign({},ctx,{field:k=>Object.prototype.hasOwnProperty.call(over,k)?over[k]:ctx.field(k)}):ctx;}

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
  f.y=m.top+formDrawPart(f.P,tpl,tpl.parts[f.topKey],f.ctx(),m.top,late,mark(f.topKey));
  /* onPage — код бланка дорисовывает свой верх листа (шапка таблицы PO). */
  if(f.onPage)f.onPage();f.top=f.y;return f;
 };
 f.ensure=h=>{if(f.y+h>f.bottom)f.page();};
 /* Часть в потоке (верх первой, итоги): начинается на этом листе, если на
    нём есть keep пунктов (по умолчанию — вся часть); дальше лист кончается
    только между строками и блоками. */
 f.flow=key=>{
  const part=tpl.parts[key];if(!part||!(part.blocks||[]).length)return f;
  const c=f.ctx(),lay=formLayout(tpl,part,c),keep=part.keep!=null?part.keep:lay.h;
  if(keep>0&&f.y+Math.min(keep,f.bottom-f.top)>f.bottom&&f.y>f.top+1)f.page();
  const units=[],mk=mark(key);
  /* Строка текста занимает lh от верха строки; lead — от верха строки до
     линии букв (0 — линия букв и есть верх, как у Packing slip). keep у
     блока — «держать со следующим»: блок начинается на этом листе, только
     если с ним помещаются keep первых строк следующего текста (подпись
     раздела с его первыми строками). */
  const order=lay.blocks.slice().sort((p,q)=>p.top-q.top||p.i-q.i);
  lay.blocks.forEach(x=>{
   const lead=x.b.lead||0,next=x.b.keep?order.slice(order.indexOf(x)+1).find(n=>n.lines&&n.lines.length):null;
   const need=next?x.e+Math.min(x.b.keep,next.lines.length)*formLh(next.b):0;
   if(x.lines)x.lines.forEach((l,k)=>units.push({y:x.top+k*formLh(x.b),e:formLh(x.b),need:k?0:need,i:x.i,draw:(P,a)=>{formDrawLine(P,tpl,x.b,l,0,a+lead,late,x.ax,x.al);if(mk)mk(x,formRect(tpl,x,a+lead,1));}}));
   else if(!x.hide)units.push({y:x.top,e:x.e,need,i:x.i,draw:(P,a)=>{formDrawBlock(P,tpl,x,c,a,late);if(mk)mk(x,formRect(tpl,x,a));}});
   /* Пустой или скрытый блок на листе не виден и листа не переносит, но в
      конструкторе его можно выбрать. */
   if(mk&&(x.lines?!x.lines.length:x.hide))units.push({y:x.top,e:0,skip:true,i:x.i,draw:(P,a)=>mk(x,formRect(tpl,x,a))});
  });
  /* Строка вплотную под предыдущей ставится прибавлением её высоты, как
     складывал прежний код бланка: строка ровно до края листа (738,6 + 9,4)
     иначе решалась бы другой погрешностью дробных. */
  let off=f.y,prev=null;
  units.sort((p,q)=>p.y-q.y||p.i-q.i).forEach(u=>{
   let a=u.y+off;
   if(prev&&!u.skip&&Math.abs(u.y-prev.y-prev.e)<1e-6)a=prev.a+prev.e;
   if(!u.skip&&a+Math.max(u.e,u.need||0)>f.bottom&&a>f.top+1){f.page();off=f.y-u.y;a=f.y;}
   u.draw(f.P,a);
   if(!u.skip)prev={y:u.y,e:u.e,a};
  });
  f.y=lay.h+off;return f;
 };
 f.finish=()=>{
  const N=f.pages.length,base=formCtx(ctx,null);
  /* pageFields(i) — значения полей своего листа (итоги «до этой страницы»). */
  f.pages.forEach((P,i)=>{
   const own=[],mk=mark('bottom');formDrawPart(P,tpl,tpl.parts.bottom,f.pageFields?formCtx(base,f.pageFields(i)):base,f.bottom,own,mk&&((x,r)=>map.push(Object.assign({page:i,part:'bottom',id:x.b.id},r))));
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
const FORM_BLOCK_TYPES=['text','field','image','line','box','barcode','section'];
const FORM_PLACES=['left','center','right','free'];
function formCleanBlock(b){
 if(!b||typeof b!=='object'||!FORM_BLOCK_TYPES.includes(b.type))return null;
 const num=(v,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?Math.min(hi,Math.max(lo,Math.round(n*100)/100)):undefined;};
 const str=(v,max)=>typeof v==='string'?v.slice(0,max||2000):undefined;
 const o={id:str(b.id,40)||'b'+Math.random().toString(36).slice(2,9),type:b.type,place:FORM_PLACES.includes(b.place)?b.place:'left'};
 [['x',-200,800],['y',-200,800],['w',0,800],['h',0,800],['size',4,96],['lh',0,200],['max',0,200],['lw',0,20],['r',0,50],['ls',0,10],['gap',0,200],['module',.5,5],['sa',0,200],['lead',0,200],['keep',0,800],['z',-50,50]].forEach(([k,lo,hi])=>{const v=num(b[k],lo,hi);if(v!==undefined)o[k]=v;});
 ['text','field','color','fill','empty','prefix','format','after','before','k','opt'].forEach(k=>{const v=str(b[k]);if(v!==undefined)o[k]=v;});
 if(o.field&&FORM_FIELD_RENAMED[o.field])o.field=FORM_FIELD_RENAMED[o.field];
 if(['left','center','right'].includes(b.align))o.align=b.align;
 ['bold','italic','wrap','fit','pin'].forEach(k=>{if(b[k])o[k]=true;});
 if(b.font==='times'||b.font==='courier')o.font=b.font;
 if(b.show&&typeof b.show==='object'&&['filled','is','not'].includes(b.show.when)&&typeof b.show.field==='string')o.show={when:b.show.when,field:FORM_FIELD_RENAMED[b.show.field]||b.show.field.slice(0,60),value:String(b.show.value==null?'':b.show.value).slice(0,200)};
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
 /* Вид листа (у чертежа — единицы, цвета, бумага): только ключи
    умолчания и их типы; что значит значение, проверяет сам лист. */
 if(def.style){const ss=src.style&&typeof src.style==='object'?src.style:{};out.style={};
  Object.keys(def.style).forEach(k=>{const d=def.style[k],v=ss[k];out.style[k]=typeof v!==typeof d||typeof v==='number'&&!Number.isFinite(v)?d:typeof v==='string'?v.slice(0,40):v;});}
 Object.keys(def.parts).forEach(k=>{
  const d=def.parts[k],s=src.parts[k];
  if(d.columns){const c=s&&Array.isArray(s.columns)?s.columns.map(formCleanColumn).filter(Boolean):null;out.parts[k]=c&&c.length?Object.assign({},d,{columns:c}):d;return;}
  if(!s||!Array.isArray(s.blocks)){out.parts[k]=d;return;}
  const h=Number(s.h);
  out.parts[k]=Object.assign({},d,{h:Number.isFinite(h)?Math.max(0,Math.min(800,h)):d.h,blocks:s.blocks.map(formCleanBlock).filter(Boolean)});
 });
 return out;
}
