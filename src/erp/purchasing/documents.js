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
 ['description','Lines','Description',true],['productCode','Lines','Glass code',false],
 ['quantity','Lines','Quantity and unit',true],['sheetSize','Lines','Sheet size and sheets per block',true],
 ['lineDate','Lines','Line expected date',true],['held','Lines','Held at supplier',true],
 ['source','Specification','Customer order and position',true],['makeup','Specification','Whole-unit makeup',true],
 ['glass','Specification','Glass / thickness / treatment / coating',true],['size','Specification','Finished size',true],
 ['cutSize','Specification','Size before edgework',true],['services','Specification','Edgework and fabrication',true],
 ['drawing','Specification','Shape, holes and cutouts',true],
 ['receiving','Receiving','Received and outstanding quantities',false],['damage','Receiving','Recorded damage',false],
 ['invoices','Invoices','Linked supplier invoices and balances',false],['payments','Invoices','Recorded supplier payments',false],
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
/* Match the Sales document row: description on the left, sizes and
   quantities to its right, then rate and amount. Columns that are hidden
   in Customize give their space back to the description. */
function purDocColumns(p,opt){
 const cols=[{k:'n',label:'#',w:22}];
 if(opt.description)cols.push({k:'description',label:'Description',w:0});
 if((opt.sheetSize&&p.lines.some(l=>l.widthIn||l.heightIn))||(opt.size&&p.lines.some(l=>l.spec)))cols.push({k:'size',label:'Size, in',w:80,right:true});
 if(opt.quantity)cols.push({k:'qty',label:'Quantity',w:62,right:true});
 if(opt.prices)cols.push({k:'price',label:'Price',w:78,right:true},{k:'amount',label:'Amount',w:82,right:true});
 const flex=cols.find(c=>c.k==='description')||cols[0];flex.w+=DOC_PAGE.right-DOC_PAGE.left-cols.reduce((n,c)=>n+c.w,0);
 let x=DOC_PAGE.left;cols.forEach(c=>{c.x=x;x+=c.w;});return cols;
}
function purDocRowValues(p,l,i,opt){
 let size=opt.sheetSize&&l.widthIn&&l.heightIn?l.widthIn+' × '+l.heightIn:'';
 if(!size&&opt.size&&l.spec){const sizes=[...new Set(l.spec.parts.filter(c=>c.finished).map(c=>c.finished.w+' × '+c.finished.h))];size=sizes.length===1?sizes[0]:sizes.length?'See below':'';}
 const amount=purLineTotal(l);
 return {n:String(i+1),description:l.description||'Item',size,
  qty:(l.qty==null?'Not set':l.qty)+(l.unit?' '+mdUnitName(l.unit):''),
  price:l.price==null?'Not set':docNum(l.price,2)+(l.priceUnit||l.unit?' / '+mdUnitName(l.priceUnit||l.unit):''),amount:amount==null?'Not complete':docNum(amount,2)};
}
/* Шаблон бланка PO (этап 7, конструктор форм): шапка каждой страницы,
   реквизиты и поля поставщика, итог и заметки — блоки; позиции рисует код,
   как раньше. Числа — места прежней раскладки; строка текста — size + 4,
   пустая строка — рамка без контура (10 pt). Delivery request — тот же бланк
   со своим заголовком. */
function purFormDefault(){
 let c=0;
 const T=(id,field,size,bold,opt,extra)=>{const b=Object.assign({id,type:'field',field,place:'left',y:c+size,w:540,h:size+4,lh:size+4,lead:size,size,wrap:true},bold?{bold:true}:{},opt?{opt}:{},extra||{});c+=size+4;return b;};
 const G=(id,opt,show)=>{const b=Object.assign({id,type:'box',place:'left',y:c,w:540,h:10,color:''},opt?{opt}:{},show?{show:{when:'filled',field:show}}:{});c+=10;return b;};
 const first=[{id:'logo',type:'image',field:'company.logo',place:'left',y:0,w:100,h:36,sa:6,opt:'company'}];c=42;
 first.push(T('company','company.name',11,true,'company',{empty:''}),T('companyLines','company.lines',8,false,'company'),G('gapCompany','company'),
  T('date','po.date',8,false,'date',{prefix:'Date: '}),T('expected','po.expected',8,false,'expected',{prefix:'Expected: '}),T('currency','po.currency',8,false,'currency',{prefix:'Currency: '}),T('createdBy','po.createdBy',8,false,'createdBy',{prefix:'Created by: '}),
  G('gapSupplier','supplier'),T('supplier','supplier.name',8,false,'supplier',{prefix:'Supplier: '}),T('supplierAddress','supplier.address',8,false,'supplier'),
  T('contact','supplier.contact',8,false,'contact',{prefix:'Contact: '}),T('phone','supplier.phone',8,false,'contact',{prefix:'Phone: '}),T('email','po.to',8,false,'contact',{prefix:'Email: '}),T('cc','po.cc',8,false,'contact',{prefix:'CC: '}),
  T('accountNo','supplier.account',8,false,'account',{prefix:'Our account: '}),T('taxNo','supplier.tax',8,false,'account',{prefix:'Tax number: '}),T('website','supplier.website',8,false,'account',{prefix:'Website: '}),
  T('payTerms','supplier.terms',8,false,'terms',{prefix:'Payment terms: '}),T('payMethod','supplier.method',8,false,'terms',{prefix:'Payment method: '}),G('gapTable'));
 const firstH=c;c=0;
 const totals=[T('total','po.total',11,true,'totals'),T('missing','po.missing',8,false,'totals'),G('gapTotals','totals'),
  T('notesTitle','po.notesTitle',9,true,'notes',{show:{when:'filled',field:'po.note'}}),T('note','po.note',8,false,'notes'),
  G('gapInvoices','invoices'),T('invoices','po.invoices',8,false,'invoices'),G('gapPayments','payments'),T('payments','po.payments',8,false,'payments'),
  G('gapTerms','companyTerms','company.terms'),T('companyTerms','company.terms',8,false,'companyTerms'),G('gapFooter','footer','company.footer'),T('footer','company.footer',8,false,'footer')];
 return {form:'purchaseOrder',page:{w:612,h:792,margin:{top:34,right:36,bottom:44,left:36}},parts:{
  every:{h:40,blocks:[
   {id:'title',type:'field',field:'title',place:'left',y:12,w:300,h:14,lh:14,size:14,bold:true,color:DOC_COLOR.navy},
   {id:'number',type:'field',field:'number.draft',place:'right',pin:true,y:12,w:200,h:12,lh:12,size:12,bold:true,align:'right'},
   {id:'rule',type:'line',place:'left',y:28,w:540,h:0}]},
  first:{h:firstH,keep:0,blocks:first},
  table:{lines:true},
  totals:{h:c,keep:0,blocks:totals},
  bottom:{h:44,blocks:[
   {id:'footLine',type:'line',place:'left',y:7,w:540,h:0},
   {id:'pageNo',type:'text',text:'{number} · Page {page} of {pages}',place:'right',pin:true,y:16,w:300,h:9,lh:9,size:7,color:DOC_COLOR.mut,align:'right'}]}}};
}
/* Поля бланка PO (окно Insert field); d = {p, opt, title}. */
const PUR_FORM_FIELDS=[
 {k:'company.name',g:'Company',label:'Company name',v:()=>docCompanyBlock().name},
 {k:'company.lines',g:'Company',label:'Address and contacts',v:()=>docCompanyBlock().lines},
 {k:'company.logo',g:'Company',label:'Logo',v:()=>docCompanyBlock().logo||''},
 {k:'company.terms',g:'Company',label:'Company terms',v:()=>(DB.company||{}).termsText||''},
 {k:'company.footer',g:'Company',label:'Company footer',v:()=>(DB.company||{}).footerText||''},
 {k:'title',g:'Purchase order',label:'Title',v:d=>d.title||'PURCHASE ORDER'},
 {k:'number',g:'Purchase order',label:'PO No.',v:d=>d.p.number},
 {k:'number.draft',g:'Purchase order',label:'PO No. or Draft',v:d=>d.p.number||'Draft'},
 {k:'po.date',g:'Purchase order',label:'Order date',v:d=>docDate(d.p.date)},
 {k:'po.expected',g:'Purchase order',label:'Expected date',v:d=>docDate(d.p.expectedDate)},
 {k:'po.currency',g:'Purchase order',label:'Currency',v:d=>d.p.currency},
 {k:'po.createdBy',g:'Purchase order',label:'Created by',v:d=>d.p.createdBy},
 {k:'po.to',g:'Purchase order',label:'Email to',v:d=>d.p.to},
 {k:'po.cc',g:'Purchase order',label:'CC',v:d=>d.p.cc},
 {k:'po.note',g:'Purchase order',label:'PO notes',v:d=>d.p.note},
 {k:'po.notesTitle',g:'Purchase order',label:'Notes heading',v:d=>d.title?'Notes':'PO notes'},
 {k:'po.total',g:'Totals',label:'Total line',v:d=>{const t=purOrderTotals(d.p);return (t.complete?'TOTAL':'KNOWN SUBTOTAL')+': '+docNum(t.known,2)+' '+d.p.currency;}},
 {k:'po.missing',g:'Totals',label:'Lines without price',v:d=>{const t=purOrderTotals(d.p);return t.missing?t.missing+' line(s) need price, quantity or conversion.':'';}},
 {k:'po.invoices',g:'Totals',label:'Supplier invoices',v:d=>d.p.id?purInvoicePrintLines(d.p.id):[]},
 {k:'po.payments',g:'Totals',label:'Supplier payments',v:d=>d.p.id?purPaymentPrintLines(d.p.id):[]},
 {k:'supplier.name',g:'Supplier',label:'Supplier',v:d=>d.p.supplierName},
 {k:'supplier.address',g:'Supplier',label:'Address',v:d=>(d.p.supplier||{}).address||''},
 {k:'supplier.contact',g:'Supplier',label:'Contact',v:d=>(d.p.supplier||{}).contact},
 {k:'supplier.phone',g:'Supplier',label:'Phone',v:d=>(d.p.supplier||{}).phone},
 {k:'supplier.account',g:'Supplier',label:'Our account',v:d=>(d.p.supplier||{}).accountNumber},
 {k:'supplier.tax',g:'Supplier',label:'Tax number',v:d=>(d.p.supplier||{}).taxNumber},
 {k:'supplier.website',g:'Supplier',label:'Website',v:d=>(d.p.supplier||{}).website},
 {k:'supplier.terms',g:'Supplier',label:'Payment terms',v:d=>{const s=d.p.supplier||{};return s.paymentDays!=null?'Net '+s.paymentDays+' days':'';}},
 {k:'supplier.method',g:'Supplier',label:'Payment method',v:d=>(d.p.supplier||{}).paymentMethod}];
function purFormFields(){return formWithCompany(PUR_FORM_FIELDS).concat(formMyFields());}
function purFormContext(d){const by=new Map(purFormFields().map(x=>[x.k,x]));return {field:k=>{const x=by.get(k);return x?x.v(d):undefined;},off:b=>!!b.opt&&!d.opt[b.opt]};}
function purFormTemplate(){return formClean(DB.formTemplate&&DB.formTemplate.purchaseOrder,purFormDefault());}
function purDocPages(p,raw,title,tpl,map){
 const opt=purDocOptions(raw),W=DOC_PAGE,C=DOC_COLOR,cols=purDocColumns(p,opt);let tableOn=false;
 tpl=tpl||purFormTemplate();const f=formFlow(tpl,purFormContext({p,opt,title}),map);
 const tableHead=()=>{cols.forEach(c=>docLabel(f.P,c.right?c.x+c.w-6:c.x+6,f.y+8,c.label,{align:c.right?'right':'left'}));f.P.line(W.left,f.y+14,W.right,f.y+14,{stroke:C.navy,lw:1.3});f.y+=20;};
 /* Шапка таблицы — и на листах после неё (итог, заметки), как раньше. */
 f.onPage=()=>{if(tableOn)tableHead();};const start=()=>f.page();
 const room=h=>{if(f.y+h>f.bottom)start();};
 const text=(s,size,bold,indent)=>{
  size=size||8;indent=indent||0;
  docWrap(s,size,!!bold,W.right-W.left-indent).forEach(line=>{room(size+4);f.P.text(W.left+indent,f.y+size,line,{size,bold:!!bold});f.y+=size+4;});
 };
 const field=(label,value)=>{if(value!=null&&value!=='')text(label+': '+value);};
 f.page();f.flow('first');
 room(50);tableOn=true;tableHead();
 p.lines.forEach((l,i)=>{
  const values=purDocRowValues(p,l,i,opt),cells=cols.map(c=>({c,lines:docWrap(values[c.k],8,c.k==='amount',c.w-12)})),count=Math.max(...cells.map(c=>c.lines.length));
  let pos=0;
  while(pos<count){
   room(24);const n=Math.min(count-pos,Math.max(1,Math.floor((f.bottom-f.y-10)/11))),height=n*11+10;
   f.P.rect(W.left,f.y,W.right-W.left,height,{fill:C.bar,r:3});
   cells.forEach(({c,lines})=>lines.slice(pos,pos+n).forEach((s,k)=>f.P.text(c.right?c.x+c.w-6:c.x+6,f.y+13+k*11,s,{size:8,bold:c.k==='amount'||c.k==='n',align:c.right?'right':'left'})));
   f.y+=height+5;pos+=n;
  }
  if(opt.productCode)field('Glass code',l.productCode);
  if(opt.sheetSize&&l.sheetsPerBlock!=null)field('Sheets per block',l.sheetsPerBlock);
  if(opt.lineDate)field('Expected',docDate(l.expectedDate));
  if(opt.held&&l.held)text('Held at supplier',8,true);
  purSpecTexts(l.spec,opt).forEach(t=>text(t));
  if(opt.drawing&&l.spec)(l.spec.parts||[]).filter(p=>p.shape).forEach(part=>{
   const shape=part.shape,pts=shape.points;if(!pts||pts.length<3)return;
   room(135);text(part.label+' · finished shape',8,true);
   const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
   const scale=Math.min(220/Math.max(maxX-minX,1),100/Math.max(maxY-minY,1)),y0=f.y,map=q=>[W.left+20+(q[0]-minX)*scale,y0+(maxY-q[1])*scale];
   f.P.poly(pts.map(map),{stroke:C.navy,lw:.8});
   (shape.polys||[]).forEach(ps=>f.P.poly(ps.map(map),{stroke:C.navy,lw:.6}));
   (shape.holes||[]).forEach(h=>f.P.poly(Array.from({length:48},(_,i)=>map([h.x+Math.cos(i*Math.PI/24)*h.d/2,h.y+Math.sin(i*Math.PI/24)*h.d/2])),{stroke:C.navy,lw:.6}));
   f.y+=110;
   (shape.holes||[]).forEach(h=>text('Hole diameter '+h.d+' in · X '+h.x+' · Y '+h.y));
  });
  if(opt.receiving||opt.damage){const b=purReceived(p,l);if(opt.receiving)field(l.held?'Held at supplier':'Delivery','Purchased '+(b.ordered??'Unknown')+' · received '+b.received+' · remaining '+(b.remaining??'Unknown')+' '+l.unit+(b.unknown?' · Review units / quantities':''));if(opt.damage)field('Recorded damage',b.damaged+' '+l.unit+' · '+b.damagedSheets+' sheets');}
  if(opt.notes&&l.note)field('Note',l.note);room(10);f.y+=10;
 });
 f.flow('totals');
 return f.finish();
}
