/* =====================================================================
   erp/documents/pdf  ·  documents-1.0
   PDF из листов erp/documents/layout — для письма клиенту.
   IN : листы (текст, прямоугольники, линии, контуры, JPEG-логотип)
   OUT: байты PDF 1.4
   Правило: без внешних библиотек — файл программы открывается с диска. Шрифты
   берутся стандартные Helvetica / Helvetica-Bold в кодировке WinAnsi: их не
   нужно вкладывать в файл, а ширины букв совпадают с раскладкой.
   ===================================================================== */

function docPdfN(v){return String(Math.round(v*100)/100);}
function docPdfColor(hex){
 let h=String(hex||'#000000').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');
 return [0,2,4].map(i=>docPdfN(parseInt(h.slice(i,i+2),16)/255)).join(' ');
}
function docPdfString(s){
 let out='';
 for(const ch of docText(s)){
  if(ch==='\n')continue;
  const c=String.fromCharCode(docWinCode(ch)||63);
  out+=c==='\\'||c==='('||c===')'?'\\'+c:c;
 }
 return '('+out+')';
}
function docPdfDate(d){
 d=d||new Date();const p=v=>String(v).padStart(2,'0');
 return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds());
}
/* Прямоугольник со скруглением — четыре дуги Безье; y у PDF растёт вверх. */
function docPdfRect(x,y,w,h,r){
 const n=docPdfN;
 if(!r)return n(x)+' '+n(y)+' '+n(w)+' '+n(h)+' re';
 r=Math.min(r,w/2,h/2);const k=r*.5523;
 return [n(x+r)+' '+n(y)+' m',n(x+w-r)+' '+n(y)+' l',n(x+w-r+k)+' '+n(y)+' '+n(x+w)+' '+n(y+r-k)+' '+n(x+w)+' '+n(y+r)+' c',
  n(x+w)+' '+n(y+h-r)+' l',n(x+w)+' '+n(y+h-r+k)+' '+n(x+w-r+k)+' '+n(y+h)+' '+n(x+w-r)+' '+n(y+h)+' c',
  n(x+r)+' '+n(y+h)+' l',n(x+r-k)+' '+n(y+h)+' '+n(x)+' '+n(y+h-r+k)+' '+n(x)+' '+n(y+h-r)+' c',
  n(x)+' '+n(y+r)+' l',n(x)+' '+n(y+r-k)+' '+n(x+r-k)+' '+n(y)+' '+n(x+r)+' '+n(y)+' c','h'].join(' ');
}
function docPdfContent(page,imageName){
 const H=DOC_PAGE.h,n=docPdfN,out=[];
 page.items.forEach(x=>{
  if(x.t==='text'){
   const w=docTextWidth(x.s,x.size,x.bold,x.ls);let tx=x.x;
   if(x.align==='right')tx-=w;else if(x.align==='center')tx-=w/2;
   out.push('q BT /'+(x.bold?'F2':'F1')+' '+n(x.size)+' Tf '+docPdfColor(x.color)+' rg '+(x.ls?n(x.ls)+' Tc ':'')+'1 0 0 1 '+n(tx)+' '+n(H-x.y)+' Tm '+docPdfString(x.s)+' Tj ET Q');
  }else if(x.t==='rect'){
   const op=x.fill&&x.stroke?'B':x.fill?'f':'S';
   out.push('q '+(x.fill?docPdfColor(x.fill)+' rg ':'')+(x.stroke?docPdfColor(x.stroke)+' RG '+n(x.lw)+' w ':'')+docPdfRect(x.x,H-x.y-x.h,x.w,x.h,x.r)+' '+op+' Q');
  }else if(x.t==='line'){
   out.push('q '+docPdfColor(x.stroke)+' RG '+n(x.lw)+' w '+n(x.x1)+' '+n(H-x.y1)+' m '+n(x.x2)+' '+n(H-x.y2)+' l S Q');
  }else if(x.t==='poly'&&x.pts.length>1){
   const path=x.pts.map((p,i)=>n(p[0])+' '+n(H-p[1])+(i?' l':' m')).join(' ');
   const op=x.fill&&x.stroke?(x.closed?'b':'B'):x.fill?'f':(x.closed?'s':'S');
   out.push('q 1 j '+(x.fill?docPdfColor(x.fill)+' rg ':'')+(x.stroke?docPdfColor(x.stroke)+' RG '+n(x.lw)+' w ':'')+path+' '+op+' Q');
  }else if(x.t==='img'){
   const name=imageName(x.src),info=docJpegInfo(x.src);if(!name||!info)return;
   const s=Math.min(x.w/info.w,x.h/info.h),w=info.w*s,h=info.h*s,iy=x.y+(x.h-h)/2;
   out.push('q '+n(w)+' 0 0 '+n(h)+' '+n(x.x)+' '+n(H-iy-h)+' cm /'+name+' Do Q');
  }
 });
 return out.join('\n');
}
function docPdfBytes(pages,info){
 info=info||{};
 const objs=[],add=body=>{objs.push(body);return objs.length;};
 const catalog=add(''),pagesId=add('');
 const f1=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
 const f2=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
 const images=new Map();
 pages.forEach(pg=>pg.items.forEach(x=>{
  if(x.t!=='img'||images.has(x.src))return;
  const j=docJpegInfo(x.src);if(!j)return;
  const cs=j.comps===1?'/DeviceGray':j.comps===4?'/DeviceCMYK':'/DeviceRGB',name='Im'+(images.size+1);
  const id=add('<< /Type /XObject /Subtype /Image /Width '+j.w+' /Height '+j.h+' /ColorSpace '+cs+' /BitsPerComponent 8 /Filter /DCTDecode /Length '+j.bin.length+' >>\nstream\n'+j.bin+'\nendstream');
  images.set(x.src,{id,name});
 }));
 const xobjects=images.size?' /XObject << '+Array.from(images.values()).map(v=>'/'+v.name+' '+v.id+' 0 R').join(' ')+' >>':'';
 const kids=pages.map(pg=>{
  const content=docPdfContent(pg,src=>{const v=images.get(src);return v?v.name:'';});
  const cid=add('<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream');
  return add('<< /Type /Page /Parent '+pagesId+' 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 '+f1+' 0 R /F2 '+f2+' 0 R >>'+xobjects+' >> /Contents '+cid+' 0 R >>');
 });
 objs[catalog-1]='<< /Type /Catalog /Pages '+pagesId+' 0 R >>';
 objs[pagesId-1]='<< /Type /Pages /Kids ['+kids.map(k=>k+' 0 R').join(' ')+'] /Count '+kids.length+' >>';
 const infoId=add('<< /Title '+docPdfString(info.title||'')+' /Producer (Glass ERP) /CreationDate (D:'+(info.date||docPdfDate())+') >>');
 let out='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';const offsets=[];
 objs.forEach((body,i)=>{offsets.push(out.length);out+=(i+1)+' 0 obj\n'+body+'\nendobj\n';});
 const xref=out.length;
 out+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n'+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');
 out+='trailer\n<< /Size '+(objs.length+1)+' /Root '+catalog+' 0 R /Info '+infoId+' 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 const bytes=new Uint8Array(out.length);
 for(let i=0;i<out.length;i++)bytes[i]=out.charCodeAt(i)&255;
 return bytes;
}
