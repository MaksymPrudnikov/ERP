/* PO preview, print and PDF share docPage / docPdfBytes.
   Customize matches Sales: predefined fields, preview-only choices and
   explicit Save as default. No user-defined PO fields or Gmail API (owner,
   13 October 2026). Gmail compose is preparation, not evidence of sending. */
DEFAULT.purchaseDocumentOptions={};
const PUR_PO_FIELDS=[
 ['company','Header','Company logo and details',true],
 ['date','Header','Order date',true],['expected','Header','Expected date',true],
 ['currency','Header','Currency',true],['createdBy','Header','Created by',false],
 ['supplier','Supplier','Supplier name and address',true],['contact','Supplier','Contact details',true],
 ['account','Supplier','Account / tax / website',false],['terms','Supplier','Payment terms and method',true],
 ['description','Lines','Description',true],['productCode','Lines','Glass code',true],
 ['quantity','Lines','Quantity and unit',true],['sheetSize','Lines','Sheet size and sheets per block',true],
 ['lineDate','Lines','Line expected date',true],['held','Lines','Held at supplier',true],
 ['source','Specification','Customer order and position',true],['makeup','Specification','Whole-unit makeup',true],
 ['glass','Specification','Glass / thickness / treatment / coating',true],['size','Specification','Finished size',true],
 ['cutSize','Specification','Size before edgework',true],['services','Specification','Edgework and fabrication',true],
 ['drawing','Specification','Shape, holes and cutouts',true],
 ['prices','Bottom','Line prices and totals',true],['totals','Bottom','PO total',true],
 ['notes','Bottom','PO / line / source notes',true],['companyTerms','Bottom','Company terms',false],['footer','Bottom','Company footer',false]
].map(([k,g,label,on])=>({k,g,label,on}));
function purDocOptions(src){const out={};PUR_PO_FIELDS.forEach(f=>out[f.k]=src&&typeof src[f.k]==='boolean'?src[f.k]:f.on);return out;}
function purDocFile(p){return (p.number||'PO-draft')+'.pdf';}
function purDocGmailURL(p){
 const subject=(p.number||'Purchase order')+' · '+((DB.company||{}).legalName||'');
 const body=['Hello,','','Please find the purchase order attached.',p.expectedDate?'Requested delivery: '+docDate(p.expectedDate)+'.':'',p.note,'','Thank you,',(DB.company||{}).legalName||''].filter(x=>x!==null&&x!==undefined).join('\n');
 return docGmailUrl(p.to,subject,body)+(p.cc?'&cc='+encodeURIComponent(p.cc):'');
}
function purDocPages(p,raw){
 const opt=purDocOptions(raw),pages=[],W=DOC_PAGE,C=DOC_COLOR;let P,y;
 const start=()=>{
  P=docPage();pages.push(P);y=W.top;
  P.text(W.left,y+12,'PURCHASE ORDER',{size:14,bold:true,color:C.navy});
  P.text(W.right,y+12,p.number||'Draft',{size:12,bold:true,align:'right'});y+=28;
  P.line(W.left,y,W.right,y);y+=12;
 };
 const room=h=>{if(y+h>W.bottom)start();};
 const text=(s,size,bold,indent)=>{
  size=size||8;indent=indent||0;
  docWrap(s,size,!!bold,W.right-W.left-indent).forEach(line=>{room(size+4);P.text(W.left+indent,y+size,line,{size,bold:!!bold});y+=size+4;});
 };
 const field=(label,value)=>{if(value!=null&&value!=='')text(label+': '+value);};
 const gap=()=>{room(10);y+=10;};
 start();
 if(opt.company){
  const c=docCompanyBlock(),logo=c.logo&&docJpegInfo(c.logo);
  if(logo){P.img(W.left,y,100,36,c.logo);y+=42;}
  text(c.name,11,true);c.lines.forEach(s=>text(s));gap();
 }
 if(opt.date)field('Date',docDate(p.date));
 if(opt.expected)field('Expected',docDate(p.expectedDate));
 if(opt.currency)field('Currency',p.currency);
 if(opt.createdBy)field('Created by',p.createdBy);
 const s=p.supplier||{};
 if(opt.supplier){gap();field('Supplier',p.supplierName);if(s.address)text(s.address);}
 if(opt.contact)[['Contact',s.contact],['Phone',s.phone],['Email',p.to],['CC',p.cc]].forEach(([k,v])=>field(k,v));
 if(opt.account)[['Our account',s.accountNumber],['Tax number',s.taxNumber],['Website',s.website]].forEach(([k,v])=>field(k,v));
 if(opt.terms){if(s.paymentDays!=null)field('Payment terms','Net '+s.paymentDays+' days');field('Payment method',s.paymentMethod);}
 gap();
 p.lines.forEach((l,i)=>{
  room(48);P.rect(W.left,y,W.right-W.left,20,{fill:C.bar,r:3});P.text(W.left+8,y+13,'LINE '+(i+1),{size:8,bold:true});y+=27;
  if(opt.description)text(l.description||'Item',9,true);
  if(opt.productCode)field('Glass code',l.productCode);
  if(opt.quantity)field('Quantity',(l.qty==null?'Not set':l.qty)+(l.unit?' '+mdUnitName(l.unit):''));
  if(opt.sheetSize){if(l.widthIn&&l.heightIn)field('Sheet',l.widthIn+' × '+l.heightIn+' in');if(l.sheetsPerBlock!=null)field('Sheets per block',l.sheetsPerBlock);}
  if(opt.lineDate)field('Expected',docDate(l.expectedDate));
  if(opt.held&&l.held)text('Held at supplier',8,true);
  purSpecTexts(l.spec,opt).forEach(t=>text(t));
  if(opt.drawing&&l.spec)(l.spec.parts||[]).filter(p=>p.shape).forEach(part=>{
   const shape=part.shape,pts=shape.points;if(!pts||pts.length<3)return;
   room(135);text(part.label+' · finished shape',8,true);
   const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
   const scale=Math.min(220/Math.max(maxX-minX,1),100/Math.max(maxY-minY,1)),map=q=>[W.left+20+(q[0]-minX)*scale,y+(maxY-q[1])*scale];
   P.poly(pts.map(map),{stroke:C.navy,lw:.8});
   (shape.polys||[]).forEach(ps=>P.poly(ps.map(map),{stroke:C.navy,lw:.6}));
   (shape.holes||[]).forEach(h=>P.poly(Array.from({length:48},(_,i)=>map([h.x+Math.cos(i*Math.PI/24)*h.d/2,h.y+Math.sin(i*Math.PI/24)*h.d/2])),{stroke:C.navy,lw:.6}));
   y+=110;
   (shape.holes||[]).forEach(h=>text('Hole diameter '+h.d+' in · X '+h.x+' · Y '+h.y));
  });
  if(opt.prices){field('Price',l.price==null?'Not set':docNum(l.price,2)+' '+p.currency+(l.priceUnit||l.unit?' / '+mdUnitName(l.priceUnit||l.unit):''));const total=purLineTotal(l);field('Line total',total==null?'Not complete':docNum(total,2)+' '+p.currency);}
  if(opt.notes&&l.note)field('Note',l.note);gap();
 });
 if(opt.totals){const t=purOrderTotals(p);text((t.complete?'TOTAL':'KNOWN SUBTOTAL')+': '+docNum(t.known,2)+' '+p.currency,11,true);if(t.missing)text(t.missing+' line(s) need price, quantity or conversion.');gap();}
 if(opt.notes&&p.note){text('PO notes',9,true);text(p.note);}
 if(opt.companyTerms&&(DB.company||{}).termsText){gap();text(DB.company.termsText);}
 if(opt.footer&&(DB.company||{}).footerText){gap();text(DB.company.footerText);}
 pages.forEach((page,i)=>{page.line(W.left,W.footer-9,W.right,W.footer-9);page.text(W.right,W.footer,p.number+' · Page '+(i+1)+' of '+pages.length,{size:7,align:'right',color:C.mut});});
 return pages;
}
