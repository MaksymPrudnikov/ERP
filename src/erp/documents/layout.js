/* =====================================================================
   erp/documents/layout  ·  documents-1.0
   Раскладка бланка на листы Letter (612 × 792 pt) и SVG для экрана и печати.
   IN : модель из erp/documents/model
   OUT: листы — списки простых фигур (текст, прямоугольник, линия, контур,
        картинка) в пунктах; из них рисуются и SVG, и PDF.
   Правило: одна раскладка на всё. Preview, Print и PDF для письма рисуются из
   одних и тех же листов, поэтому переносы строк и страниц совпадают везде.
   ===================================================================== */

const DOC_PAGE={w:612,h:792,left:36,right:576,top:34,bottom:748,footer:764};
const DOC_COL={item:44,desc:62,chips:175,basis:452,rate:504,amount:568};
const DOC_COLOR={ink:'#1c2330',navy:'#16325c',mut:'#6b7588',faint:'#8a93a3',line:'#d9dfe8',chip:'#c9d1dd',bar:'#eef2f8',box:'#f4f6fa',adj:'#9a4b00',warn:'#b54708'};

/* Ширины знаков Helvetica и Helvetica-Bold в тысячных кегля, коды 32…255 в
   кодировке WinAnsi, по два знака base36 на символ. Это метрика самих шрифтов
   PDF: по ней любой просмотрщик ставит буквы, и по ней же здесь считаются
   переносы и выравнивание вправо. Измерено 14 сентября 2026 и сверено с
   эталоном (пробел 278, a 556, m 833, W 944, жирная A 722). */
const DOC_WIDTHS36={
 regular:'7q7q9vfgfgopij5b9999atg87q997q7qfgfgfgfgfgfgfgfgfgfg7q7qg8g8g8fgs7ijijk2k2ijgzlmk27qdwijfgn5k2lmijlmk2ijgzk2ijq8ijijgz7q7q7qd1fg99fgfgdwfgfg7qfgfg6666dw66n5fgfgfgfg99dw7qfgdwk2dwdwdw9a789ag800ko0066fg99rsfgfg99rsij99rs00gz0000666699999qfgrs99rsdw99q800dwij7q99fgfgfgfg78fg99khaafgg800kh99b4f9999999g0ex7q9999a5fgn6n6n6gzijijijijijijrsk2ijijijij7q7q7q7qk2k2lmlmlmlmlmg8lmk2k2k2k2ijijgzfgfgfgfgfgfgopdwfgfgfgfg7q7q7q7qfgfgfgfgfgfgfgf9gzfgfgfgfgdwfgdw',
 bold:'7q99d6fgfgopk26m9999atg87q997q7qfgfgfgfgfgfgfgfgfgfg9999g8g8g8gzr3k2k2k2k2ijgzlmk27qfgk2gzn5k2lmijlmk2ijgzk2ijq8ijijgz997q99g8fg99fggzfggzfg99gzgz7q7qfg7qopgzgzgzgzatfg99gzfglmfgfgdwat7satg800ko007qfgdwrsfgfg99rsij99rs00gz00007q7qdwdw9qfgrs99rsfg99q800dwij7q99fgfgfgfg7sfg99khaafgg800kh99b4f9999999g0fg7q9999a5fgn6n6n6gzk2k2k2k2k2k2rsk2ijijijij7q7q7q7qk2k2lmlmlmlmlmg8lmk2k2k2k2ijijgzfgfgfgfgfgfgopfgfgfgfgfg7q7q7q7qgzgzgzgzgzgzgzf9gzgzgzgzgzfggzfg'
};
/* Коды 128…159 WinAnsi — типографские знаки; остальное совпадает с Latin-1. */
const DOC_WIN_HIGH={128:0x20AC,130:0x201A,131:0x192,132:0x201E,133:0x2026,134:0x2020,135:0x2021,136:0x2C6,137:0x2030,138:0x160,139:0x2039,140:0x152,142:0x17D,145:0x2018,146:0x2019,147:0x201C,148:0x201D,149:0x2022,150:0x2013,151:0x2014,152:0x2DC,153:0x2122,154:0x161,155:0x203A,156:0x153,158:0x17E,159:0x178};
const DOC_UNICODE_TO_WIN=(()=>{const m={};Object.keys(DOC_WIN_HIGH).forEach(k=>{m[DOC_WIN_HIGH[k]]=+k;});return m;})();
/* Знаки, которых в шрифте PDF нет, заменяются близкими — дюйм программа пишет
   двойным штрихом ″, а на бланке он становится обычной кавычкой. */
const DOC_TEXT_SUBST={'″':'"','′':"'",'→':'->','←':'<-','≤':'<=','≥':'>=','−':'-',' ':' ',' ':' ',' ':' ','✓':'v','\t':' '};
let docWidthTable=null;
function docWidths(){
 if(!docWidthTable){const dec=s=>{const a=[];for(let i=0;i<s.length;i+=2)a.push(parseInt(s.slice(i,i+2),36));return a;};docWidthTable={r:dec(DOC_WIDTHS36.regular),b:dec(DOC_WIDTHS36.bold)};}
 return docWidthTable;
}
function docWinCode(ch){const u=ch.charCodeAt(0);if((u>=32&&u<127)||(u>=160&&u<=255))return u;return DOC_UNICODE_TO_WIN[u]||0;}
function docText(s){
 let out='';
 for(const ch of String(s==null?'':s).replace(/\r\n?/g,'\n')){
  if(ch==='\n'||docWinCode(ch)){out+=ch;continue;}
  out+=Object.prototype.hasOwnProperty.call(DOC_TEXT_SUBST,ch)?DOC_TEXT_SUBST[ch]:'?';
 }
 return out;
}
function docTextWidth(s,size,bold,ls){
 const t=docWidths()[bold?'b':'r'];let w=0,n=0;
 for(const ch of docText(s)){if(ch==='\n')continue;const c=docWinCode(ch);w+=(c>=32?t[c-32]:0)||556;n++;}
 return w*(size||8)/1000+(ls||0)*n;
}
function docWrap(s,size,bold,maxW){
 const out=[];
 docText(s).split('\n').forEach(par=>{
  let line='';
  par.split(/ +/).forEach(word=>{
   const cand=line?line+' '+word:word;
   if(docTextWidth(cand,size,bold)<=maxW){line=cand;return;}
   if(line)out.push(line);
   /* Слово длиннее строки режется по буквам, иначе вылезло бы за поле. */
   let chunk='';for(const ch of word){if(chunk&&docTextWidth(chunk+ch,size,bold)>maxW){out.push(chunk);chunk='';}chunk+=ch;}
   line=chunk;
  });
  out.push(line);
 });
 return out;
}
function docFit(s,size,bold,maxW){
 s=docText(s).replace(/\n/g,' ');if(docTextWidth(s,size,bold)<=maxW)return s;
 while(s&&docTextWidth(s+'…',size,bold)>maxW)s=s.slice(0,-1);
 return s+'…';
}

/* JPEG логотипа: размеры нужны раскладке (пропорции) и PDF (картинка
   вставляется байтами как есть). */
const docJpegCache=new Map();
function docJpegParse(bin){
 const b=i=>bin.charCodeAt(i)&255;
 if(b(0)!==0xFF||b(1)!==0xD8)return null;
 let i=2;
 while(i+9<bin.length){
  if(b(i)!==0xFF){i++;continue;}
  const mk=b(i+1);
  if(mk===0xFF){i++;continue;}
  if(mk===0xD8||mk===0x01||(mk>=0xD0&&mk<=0xD7)){i+=2;continue;}
  if(mk>=0xC0&&mk<=0xCF&&mk!==0xC4&&mk!==0xC8&&mk!==0xCC)return {h:b(i+5)<<8|b(i+6),w:b(i+7)<<8|b(i+8),comps:b(i+9)};
  i+=2+(b(i+2)<<8|b(i+3));
 }
 return null;
}
function docJpegInfo(dataUrl){
 if(docJpegCache.has(dataUrl))return docJpegCache.get(dataUrl);
 let info=null;
 try{const bin=atob(String(dataUrl).split(',')[1]||'');info=docJpegParse(bin);if(info&&info.w>0&&info.h>0)info.bin=bin;else info=null;}catch(e){info=null;}
 docJpegCache.set(dataUrl,info);return info;
}

/* ------------------------------ Лист -------------------------------- */
function docPage(){
 const items=[];
 return {items,
  text(x,y,s,o){o=o||{};items.push({t:'text',x,y,s:docText(s),size:o.size||8,bold:!!o.bold,color:o.color||DOC_COLOR.ink,align:o.align||'left',ls:o.ls||0,pageLabel:!!o.pageLabel});},
  rect(x,y,w,h,o){o=o||{};items.push({t:'rect',x,y,w,h,fill:o.fill||'',stroke:o.stroke||'',lw:o.lw||.6,r:o.r||0});},
  line(x1,y1,x2,y2,o){o=o||{};items.push({t:'line',x1,y1,x2,y2,stroke:o.stroke||DOC_COLOR.line,lw:o.lw||.6});},
  poly(pts,o){o=o||{};items.push({t:'poly',pts,stroke:o.stroke||DOC_COLOR.navy,lw:o.lw||.8,fill:o.fill||'',closed:o.closed!==false});},
  img(x,y,w,h,src){items.push({t:'img',x,y,w,h,src});}
 };
}
function docLabel(P,x,y,s,o){P.text(x,y,String(s).toUpperCase(),Object.assign({size:5.8,bold:true,color:DOC_COLOR.mut,ls:.6},o||{}));}

function docHeader(P,m){
 const W=DOC_PAGE,C=DOC_COLOR;let y=W.top,leftBottom=y+30;
 if(m.company){
  let x=W.left;
  const logo=m.company.logo?docJpegInfo(m.company.logo):null;
  if(logo){const h=42,w=Math.min(130,h*logo.w/logo.h);P.img(x,y,w,h,m.company.logo);x+=w+10;leftBottom=y+h;}
  const maxW=W.right-210-x;
  P.text(x,y+11,docFit(m.company.name,11.5,true,maxW),{size:11.5,bold:true,color:C.navy});
  let ly=y+22;
  m.company.lines.forEach(t=>{P.text(x,ly,docFit(t,7.4,false,maxW),{size:7.4,color:C.mut});ly+=9.4;});
  leftBottom=Math.max(leftBottom,ly-4);
 }
 P.text(W.right,y+15,m.title,{size:18,bold:true,color:C.navy,align:'right'});
 P.text(W.right,y+30,m.number,{size:10.5,bold:true,align:'right'});
 P.text(W.right-docTextWidth(m.number,10.5,true)-3,y+30,'No.',{size:8,align:'right'});
 P.text(W.right,y+41,'Page',{size:7,color:C.faint,align:'right',pageLabel:true});
 y=Math.max(leftBottom,y+44)+12;
 if(m.meta.length)y=docCells(P,m.meta,y,28,7.8)+10;
 if(m.boxes.length)y=docBoxes(P,m.boxes,y)+12;
 return y;
}
function docContHeader(P,m){
 const W=DOC_PAGE,C=DOC_COLOR,y=W.top,name=m.company?m.company.name:'';
 if(name)P.text(W.left,y+10,docFit(name,10.5,true,300),{size:10.5,bold:true,color:C.navy});
 P.text(W.left,y+(name?21:10),docFit([m.docName+' '+m.number,m.customerName,m.po?'PO '+m.po:''].filter(Boolean).join(' · '),7.4,false,330),{size:7.4,color:C.mut});
 P.text(W.right,y+11,m.title,{size:12,bold:true,color:C.navy,align:'right'});
 P.text(W.right,y+22,'Page',{size:7,color:C.faint,align:'right',pageLabel:true});
 return y+36;
}
/* Ряд ячеек «подпись над значением». Ширина ячейки — по её содержимому,
   остаток делится поровну: «Cash · 50% deposit» не режется ради «CAD». */
function docCells(P,cells,y,h,valueSize){
 const W=DOC_PAGE,C=DOC_COLOR,total=W.right-W.left;
 const nat=cells.map(c=>Math.max(docTextWidth(String(c.label).toUpperCase(),5.8,true,.6),docTextWidth(c.value,valueSize,true))+16);
 const sum=nat.reduce((a,b)=>a+b,0),widths=sum<=total?nat.map(w=>w+(total-sum)/cells.length):nat.map(w=>w*total/sum);
 P.rect(W.left,y,total,h,{stroke:C.line,lw:.7,r:4});
 let x=W.left;
 cells.forEach((c,i)=>{
  if(i)P.line(x,y,x,y+h,{stroke:C.line,lw:.5});
  docLabel(P,x+8,y+10.5,c.label);
  P.text(x+8,y+h-7.5,docFit(c.value,valueSize,true,widths[i]-14),{size:valueSize,bold:true});
  x+=widths[i];
 });
 return y+h;
}
function docBoxes(P,boxes,y){
 const W=DOC_PAGE,C=DOC_COLOR,gap=10,w=(W.right-W.left-gap*(boxes.length-1))/boxes.length;
 const laid=boxes.map(b=>{const lines=[];b.lines.forEach(t=>docWrap(t,7.6,false,w-18).forEach(l=>lines.push(l)));return {b,lines:lines.slice(0,4),title:docFit(b.title,9,true,w-18)};});
 const h=Math.max(...laid.map(x=>28+x.lines.length*9.6));
 laid.forEach((x,i)=>{
  const bx=W.left+i*(w+gap);
  P.rect(bx,y,w,h,{fill:C.box,r:4});
  docLabel(P,bx+9,y+10.5,x.b.label);
  P.text(bx+9,y+22,x.title,{size:9,bold:true});
  x.lines.forEach((l,k)=>P.text(bx+9,y+32+k*9.6,l,{size:7.6}));
 });
 return y+h;
}
function docTableHead(P,m,y){
 const W=DOC_PAGE,C=DOC_COLOR;
 if(m.table.amount){
  docLabel(P,DOC_COL.item,y+6,m.table.perUnit?'Description · per unit':'Description');
  if(m.table.basisRate){docLabel(P,DOC_COL.basis,y+6,'Basis',{align:'right'});docLabel(P,DOC_COL.rate,y+6,'Rate',{align:'right'});}
  docLabel(P,DOC_COL.amount,y+6,'Amount',{align:'right'});
 }else docLabel(P,DOC_COL.item,y+6,m.sale?'Lines':'Lines · route by station');
 P.line(W.left,y+11,W.right,y+11,{stroke:C.navy,lw:1.3});
 return y+16;
}

/* Строка заказа — набор частей, каждая со своей высотой. Страница может
   кончиться только МЕЖДУ частями; заголовок строки держится хотя бы с первыми
   двумя частями, а на новом листе строка получает пометку «continued». */
function docItemParts(m,it){
 const C=DOC_COLOR,parts=[];
 const segs=[];
 if(it.amount!=null)segs.push({t:it.amount,size:9,bold:true,min:56});
 segs.push({t:it.qty,size:8});
 if(it.size)segs.push({t:it.size,size:8.4,bold:true});
 if(it.info)segs.push({t:it.info,size:7.6});
 let rx=DOC_COL.amount;segs.forEach(s=>{s.x=rx;rx-=Math.max(docTextWidth(s.t,s.size,s.bold),s.min||0)+12;});
 const markW=it.mark?docTextWidth(it.mark,9,true)+10:0,xd=60+markW;
 const desc=[it.prefix,it.short].filter(Boolean).join(' ');
 const lines=desc?docWrap(desc,7.8,false,Math.max(60,rx-xd)).slice(0,3):[];
 const hb=18+Math.max(0,lines.length-1)*9.5;
 parts.push({h:hb+7,draw(P,y){
  const by=y+5,base=by+12.3;
  P.rect(DOC_PAGE.left,by,DOC_PAGE.right-DOC_PAGE.left,hb,{fill:C.bar,r:3});
  P.text(DOC_COL.item,base,String(it.n),{size:9,bold:true,color:C.navy});
  if(it.mark)P.text(60,base,it.mark,{size:9,bold:true});
  lines.forEach((l,k)=>{
   if(!k&&it.prefix&&l.indexOf(it.prefix)===0){P.text(xd,base,it.prefix,{size:7.8});const rest=l.slice(it.prefix.length).trim();if(rest)P.text(xd+docTextWidth(it.prefix+' ',7.8),base,rest,{size:7.8,color:C.mut});}
   else P.text(xd,base+k*9.5,l,{size:7.8,color:C.mut});
  });
  segs.forEach(s=>P.text(s.x,base,s.t,{size:s.size,bold:s.bold,align:'right'}));
 }});
 const textPart=(text,size,color,x,width)=>{const ls=docWrap(text,size,false,width);return {h:ls.length*(size+2)+2,draw(P,y){ls.forEach((l,k)=>P.text(x,y+size+1+k*(size+2),l,{size,color}));}};};
 it.sub.forEach(s=>parts.push(textPart(s.text,7.2,s.tone==='warn'?C.warn:C.mut,DOC_COL.desc,DOC_COL.amount-DOC_COL.desc)));
 it.full.forEach(t=>parts.push(textPart(t,7.2,C.ink,DOC_COL.desc,DOC_COL.amount-DOC_COL.desc)));
 if(it.drawing)parts.push(docDrawingPart(it.drawing));
 const descW=m.table.basisRate?DOC_COL.basis-70-DOC_COL.desc:DOC_COL.amount-80-DOC_COL.desc;
 it.groups.forEach(g=>{
  if(g.label)parts.push({h:11,draw(P,y){docLabel(P,DOC_COL.desc,y+9,g.label,{color:C.faint});}});
  g.rows.forEach(r=>{
   const ls=docWrap(r.desc,7.8,false,descW);
   parts.push({h:3+ls.length*10,draw(P,y){
    const base=y+8.5;
    ls.forEach((l,k)=>P.text(DOC_COL.desc,base+k*10,l,{size:7.8,color:r.tone==='adj'?C.adj:C.ink}));
    if(r.basis)P.text(DOC_COL.basis,base,r.basis,{size:7.8,color:C.mut,align:'right'});
    if(r.rate)P.text(DOC_COL.rate,base,r.rate,{size:7.8,align:'right'});
    if(r.amount)P.text(DOC_COL.amount,base,r.amount,{size:7.8,align:'right',color:r.amount==='Rate required'?C.warn:C.ink});
   }});
  });
 });
 if(it.note)parts.push(textPart(it.note,7.2,C.mut,DOC_COL.desc,DOC_COL.amount-DOC_COL.desc));
 it.lites.forEach(l=>parts.push(docRoutePart(l)));
 it.cavities.forEach(c=>parts.push({h:11,draw(P,y){P.text(DOC_COL.desc,y+8.5,c.label,{size:7.8,bold:true});P.text(DOC_COL.chips,y+8.5,docFit(c.text,7.6,false,DOC_COL.amount-DOC_COL.chips),{size:7.6});}}));
 if(it.unitRow)parts.push({h:14,draw(P,y){
  let x=DOC_COL.amount;const base=y+10;
  it.unitRow.slice().reverse().forEach(u=>{
   const bold=u.label!=='×';
   P.text(x,base,u.value,{size:8,bold,align:'right'});x-=docTextWidth(u.value,8,bold)+3;
   P.text(x,base,u.label,{size:7.8,align:'right'});x-=docTextWidth(u.label,7.8)+14;
  });
 }});
 parts.push({h:8,draw(P,y){P.line(DOC_PAGE.left,y+4,DOC_PAGE.right,y+4,{stroke:C.line,lw:.5});}});
 return parts;
}
function docDrawingPart(d){
 const bw=90,bh=58;
 return {h:bh+6,draw(P,y){
  const xs=d.pts.map(p=>p[0]),ys=d.pts.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const s=Math.min((bw-12)/Math.max(maxX-minX,1e-6),(bh-12)/Math.max(maxY-minY,1e-6)),ox=DOC_COL.desc+(bw-(maxX-minX)*s)/2,oy=y+3+(bh-(maxY-minY)*s)/2;
  P.rect(DOC_COL.desc,y+3,bw,bh,{fill:DOC_COLOR.box,r:3});
  /* У фигуры ось Y смотрит вверх, у листа — вниз. */
  P.poly(d.pts.map(p=>[ox+(p[0]-minX)*s,oy+(maxY-p[1])*s]),{stroke:DOC_COLOR.navy,lw:.9,fill:'#ffffff'});
 }};
}
function docRoutePart(l){
 const C=DOC_COLOR,chips=[];let cx=DOC_COL.chips,row=0;
 l.chips.forEach(ch=>{
  const w=5+docTextWidth(ch.code,6.8,true)+(ch.text?3+docTextWidth(ch.text,7.2):0)+5;
  if(cx+w>DOC_COL.amount&&cx>DOC_COL.chips){row++;cx=DOC_COL.chips;}
  chips.push({ch,x:cx,row,w});cx+=w+10;
 });
 const h=4+(row+1)*14;
 return {h,draw(P,y){
  P.text(DOC_COL.desc,y+11,l.label,{size:7.8,bold:true});
  const gx=DOC_COL.desc+docTextWidth(l.label,7.8,true)+5;
  if(l.glass)P.text(gx,y+11,docFit(l.glass,7,false,DOC_COL.chips-gx-4),{size:7,color:C.mut});
  chips.forEach((c,i)=>{
   const cy=y+3+c.row*14;
   P.rect(c.x,cy,c.w,11.5,{stroke:C.chip,lw:.6,r:2.5});
   P.text(c.x+5,cy+8.3,c.ch.code,{size:6.8,bold:true});
   if(c.ch.text)P.text(c.x+5+docTextWidth(c.ch.code,6.8,true)+3,cy+8.3,c.ch.text,{size:7.2});
   const next=chips[i+1];if(next&&next.row===c.row)P.text(c.x+c.w+5,cy+8.3,'›',{size:8,color:C.faint,align:'center'});
  });
 }};
}
function docExtraParts(m){
 const C=DOC_COLOR,x=m.extra,parts=[];
 parts.push({h:24,draw(P,y){P.rect(DOC_PAGE.left,y+5,DOC_PAGE.right-DOC_PAGE.left,17,{fill:C.bar,r:3});P.text(DOC_COL.item,y+16.5,x.title,{size:8.4,bold:true});}});
 x.rows.forEach(r=>{
  const priced=m.table.amount,ls=docWrap(r.name,7.8,false,(priced?DOC_COL.basis-70:DOC_COL.amount-70)-DOC_COL.item);
  parts.push({h:3+ls.length*10,draw(P,y){
   const base=y+8.5;
   ls.forEach((l,k)=>P.text(DOC_COL.item,base+k*10,l,{size:7.8}));
   P.text(priced?DOC_COL.basis:DOC_COL.amount,base,r.qty,{size:7.8,color:C.mut,align:'right'});
   if(priced&&r.rate)P.text(DOC_COL.rate,base,r.rate,{size:7.8,align:'right'});
   if(priced&&r.amount)P.text(DOC_COL.amount,base,r.amount,{size:7.8,align:'right',color:r.amount==='Rate required'?C.warn:C.ink});
  }});
 });
 parts.push({h:8,draw(P,y){P.line(DOC_PAGE.left,y+4,DOC_PAGE.right,y+4,{stroke:C.line,lw:.5});}});
 return parts;
}
function docEndBlock(m){
 const C=DOC_COLOR,e=m.end,leftW=300,bx=376,bw=200;
 const left=e.left.map(s=>({label:s.label,lines:docWrap(s.text,7.6,false,leftW)}));
 const leftH=left.reduce((h,s)=>h+13+s.lines.length*10+6,0);
 const rowsH=e.rows?e.rows.length*12+(e.rows.some(r=>r.sep)?4:0):0;
 const boxH=e.rows?10+rowsH+(e.grand?26:0)+(e.missing?10:0)+2:0;
 const depH=e.deposit?8+e.deposit.length*12+4:0;
 const rightH=(boxH?boxH+(depH?8:0):0)+depH;
 const h=12+Math.max(leftH,rightH)+6;
 return {h,draw(P,y){
  const y0=y+12;let ly=y0;
  left.forEach(s=>{docLabel(P,DOC_PAGE.left,ly+6,s.label);s.lines.forEach((l,k)=>P.text(DOC_PAGE.left,ly+17+k*10,l,{size:7.6}));ly+=13+s.lines.length*10+6;});
  let ry=y0;
  if(boxH){
   P.rect(bx,ry,bw,boxH,{fill:C.box,r:4});
   let ty=ry+10;
   e.rows.forEach(r=>{
    if(r.sep){P.line(bx+10,ty,bx+bw-10,ty,{stroke:C.chip,lw:.5});ty+=4;}
    P.text(bx+10,ty+8,r.label,{size:7.8,bold:!!r.strong});P.text(bx+bw-10,ty+8,r.value,{size:7.8,bold:!!r.strong,align:'right'});ty+=12;
   });
   if(e.grand){
    P.line(bx+10,ty+3,bx+bw-10,ty+3,{stroke:C.navy,lw:1.2});
    P.text(bx+10,ty+19,e.grand.label,{size:11,bold:true,color:C.navy});P.text(bx+bw-10,ty+19,e.grand.value,{size:11,bold:true,color:C.navy,align:'right'});ty+=26;
   }
   if(e.missing)P.text(bx+10,ty+7,e.missing,{size:6.8,color:C.warn});
   ry+=boxH+8;
  }
  if(depH){
   P.rect(bx,ry,bw,depH,{stroke:C.navy,lw:1,r:4});
   e.deposit.forEach((d,k)=>{const base=ry+14+k*12,size=d.strong?8.8:7.4;P.text(bx+10,base,docFit(d.label,size,!!d.strong,bw-(d.value?90:20)),{size,bold:!!d.strong});if(d.value)P.text(bx+bw-10,base,d.value,{size,bold:!!d.strong,align:'right'});});
  }
 }};
}
function docParagraphParts(label,text,size){
 const C=DOC_COLOR,parts=[{h:16,draw(P,y){docLabel(P,DOC_PAGE.left,y+13,label);}}];
 docWrap(text,size,false,DOC_PAGE.right-DOC_PAGE.left).forEach(l=>parts.push({h:size+2.6,draw(P,y){P.text(DOC_PAGE.left,y+size,l,{size,color:size<7.5?C.mut:C.ink});}}));
 return parts;
}
function docSignatureBlock(m){
 const C=DOC_COLOR,ls=docWrap(m.signature,7.6,false,515).slice(0,2);
 return {h:84,draw(P,y){
  const W=DOC_PAGE,top=y+12;
  P.rect(W.left,top,W.right-W.left,70,{stroke:C.line,lw:.7,r:4});
  docLabel(P,W.left+10,top+12,'Customer approval');
  ls.forEach((l,k)=>P.text(W.left+10,top+24+k*10,l,{size:7.6}));
  [[W.left+10,W.left+200,'Name'],[W.left+220,W.left+410,'Signature'],[W.left+430,W.right-10,'Date']].forEach(s=>{P.line(s[0],top+54,s[1],top+54,{stroke:C.ink,lw:.6});P.text(s[0],top+63,s[2],{size:6.5,color:C.mut});});
 }};
}

function docLayout(model){
 const W=DOC_PAGE,C=DOC_COLOR,pages=[];let P=null,y=0,top=0,inTable=false;
 const start=()=>{P=docPage();pages.push(P);y=pages.length===1?docHeader(P,model):docContHeader(P,model);if(inTable)y=docTableHead(P,model,y);top=y;};
 const fits=h=>y+h<=W.bottom;
 /* На свежем листе блок рисуется, даже если выше листа: иначе цикл плодил
    бы пустые страницы. */
 const room=h=>{if(!fits(h)&&y>top+1)start();};
 const flow=(parts,onBreak)=>parts.forEach((part,i)=>{if(!fits(part.h)&&y>top+1){start();if(i&&onBreak)y=onBreak(P,y);}part.draw(P,y);y+=part.h;});
 start();
 if(model.items.length||model.extra){inTable=true;y=docTableHead(P,model,y);top=y;}
 model.items.forEach(it=>{
  const parts=docItemParts(model,it);
  room(parts.slice(0,3).reduce((s,p)=>s+p.h,0));
  flow(parts,(pg,yy)=>{pg.text(DOC_COL.item,yy+9,'Line '+it.n+(it.mark?' · '+it.mark:'')+' (continued)',{size:7.4,color:C.mut});return yy+13;});
 });
 if(model.extra){const parts=docExtraParts(model);room(parts.slice(0,2).reduce((s,p)=>s+p.h,0));flow(parts);}
 inTable=false;
 if(model.end){const b=docEndBlock(model);room(b.h);b.draw(P,y);y+=b.h;}
 if(model.summary){const h=44;room(h);docCells(P,model.summary,y+12,32,10.5);y+=h;}
 if(model.notes){const parts=docParagraphParts('Order notes',model.notes,7.8);room(parts.slice(0,2).reduce((s,p)=>s+p.h,0));flow(parts);}
 if(model.terms){const parts=docParagraphParts('Terms and conditions',model.terms,6.8);room(parts.slice(0,3).reduce((s,p)=>s+p.h,0));flow(parts);}
 if(model.signature){const b=docSignatureBlock(model);room(b.h);b.draw(P,y);y+=b.h;}
 const N=pages.length;
 pages.forEach((pg,i)=>{
  const label='Page '+(i+1)+' of '+N;
  pg.items.forEach(x=>{if(x.pageLabel)x.s=label;});
  pg.line(W.left,W.footer-9,W.right,W.footer-9,{stroke:C.line,lw:.5});
  if(model.footerLeft)pg.text(W.left,W.footer,docFit(model.footerLeft,6.8,false,240),{size:6.8,color:C.faint});
  pg.text(W.right,W.footer,[model.footerRight,label].filter(Boolean).join(' · '),{size:6.8,color:C.faint,align:'right'});
 });
 return pages;
}

/* ------------------------------ SVG --------------------------------- */
function docXml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function docR(v){return Math.round(v*100)/100;}
function docPageSVG(page){
 const out=['<svg xmlns="http://www.w3.org/2000/svg" class="doc-page-svg" viewBox="0 0 612 792" width="612" height="792" font-family="Helvetica, Arial, sans-serif">','<rect width="612" height="792" fill="#ffffff"/>'];
 page.items.forEach(x=>{
  if(x.t==='text'){
   const anchor=x.align==='right'?' text-anchor="end"':x.align==='center'?' text-anchor="middle"':'';
   out.push('<text x="'+docR(x.x)+'" y="'+docR(x.y)+'" font-size="'+x.size+'"'+(x.bold?' font-weight="700"':'')+' fill="'+x.color+'"'+(x.ls?' letter-spacing="'+x.ls+'"':'')+anchor+' xml:space="preserve">'+docXml(x.s)+'</text>');
  }else if(x.t==='rect'){
   out.push('<rect x="'+docR(x.x)+'" y="'+docR(x.y)+'" width="'+docR(x.w)+'" height="'+docR(x.h)+'"'+(x.r?' rx="'+x.r+'"':'')+' fill="'+(x.fill||'none')+'"'+(x.stroke?' stroke="'+x.stroke+'" stroke-width="'+x.lw+'"':'')+'/>');
  }else if(x.t==='line'){
   out.push('<line x1="'+docR(x.x1)+'" y1="'+docR(x.y1)+'" x2="'+docR(x.x2)+'" y2="'+docR(x.y2)+'" stroke="'+x.stroke+'" stroke-width="'+x.lw+'"/>');
  }else if(x.t==='poly'){
   out.push('<'+(x.closed?'polygon':'polyline')+' points="'+x.pts.map(p=>docR(p[0])+','+docR(p[1])).join(' ')+'" fill="'+(x.fill||'none')+'" stroke="'+x.stroke+'" stroke-width="'+x.lw+'" stroke-linejoin="round"/>');
  }else if(x.t==='img'){
   out.push('<image href="'+docXml(x.src)+'" x="'+docR(x.x)+'" y="'+docR(x.y)+'" width="'+docR(x.w)+'" height="'+docR(x.h)+'" preserveAspectRatio="xMinYMid meet"/>');
  }
 });
 out.push('</svg>');
 return out.join('');
}
