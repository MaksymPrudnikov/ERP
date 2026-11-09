/* =====================================================================
   erp/documents/order-form  ·  forms-1.0
   Бланки заказа (Quote, Proforma, Order confirmation, Invoice, Work order)
   на шаблоне конструктора форм (этап 7). Шаблон по умолчанию печатает те же
   листы, что прежняя раскладка docLayout (сверка «до / после» на выгрузках
   владельца и симуляции цеха — 0 расхождений); бланки переходят по одному.
   IN : модель бланка erp/documents/model (docBuildModel), шаблон формы
   OUT: листы docPage
   Части: head — верх первой страницы, every — верх следующих, table —
   строки заказа (рисует код, как раньше; вид строк — в окне ✎ Customize),
   totals — после строк, bottom — низ каждой страницы. Ячейки шапки,
   адреса, итоги, сводка и подпись — секции: их рисует код бланка, в шаблоне
   они ставятся и убираются как блоки.
   ===================================================================== */

/* Бланки, которые печатаются из шаблона. Остальные — прежней раскладкой,
   пока их сверка «печатает то же» не сделана. */
const DOC_FORM_KINDS=['quote','proforma','confirmation','invoice','workOrder'];
/* Квитанция и выписка (erp/finance/print) — тот же шаблон бланка, их
   таблицы рисует finDocTable. */
const DOC_FORM_FIN=['receipt','statement'];
function docFormLabel(k){return {receipt:'Receipt',statement:'Statement'}[k]||docKindLabel(k);}
const DOC_SECTIONS={strip:'Totals strip',meta:'Header cells',boxes:'Addresses',end:'Totals and payment',summary:'Order summary',signature:'Customer approval'};

/* Шаблон по умолчанию. Числа — места прежней раскладки (layout.js): y —
   от верха части, у текста — линия букв; поля листа 34 / 36 / 44 / 36. */
function docFormDefault(kind){
 const wo=kind==='workOrder',strip=DOC_ORDER_SALE.includes(kind),C=DOC_COLOR,label=(id,text,y,keep,field)=>({id,type:'text',text,place:'left',y,w:540,h:16,lh:16,lead:13,keep,size:5.8,bold:true,color:C.mut,ls:.6,show:{when:'filled',field}});
 return {form:kind,page:{w:612,h:792,margin:{top:34,right:36,bottom:44,left:36}},parts:{
  head:{h:wo?152:strip?176:134,blocks:[
   {id:'logo',type:'image',field:'company.logo',place:'left',y:0,w:130,h:42,fit:true,opt:'company'},
   {id:'company',type:'field',field:'company.name',place:'left',after:'logo',gap:10,y:11,w:330,h:11,lh:11,size:11.5,bold:true,color:C.navy,fit:true,empty:'',opt:'company'},
   {id:'companyLines',type:'field',field:'company.lines',place:'left',after:'logo',gap:10,y:22,w:330,h:18.8,lh:9.4,sa:8,size:7.4,color:C.mut,fit:true,opt:'company'},
   {id:'title',type:'field',field:'title',place:'right',pin:true,y:15,w:300,h:15,lh:15,size:18,bold:true,color:C.navy,align:'right'},
   {id:'number',type:'field',field:'number',place:'right',pin:true,y:30,w:300,h:11,lh:11,size:10.5,bold:true,align:'right'},
   {id:'numberLabel',type:'field',field:'number.label',place:'right',pin:true,before:'number',gap:3,y:30,w:40,h:11,lh:11,size:8,align:'right'},
  ].concat(wo?[
   /* Work order (владелец 06.11.2026, вариант G): штрихкод номера под номером. */
   {id:'barcode',type:'barcode',field:'number',place:'right',pin:true,y:36,w:200,h:20,align:'right'},
   {id:'pageNo',type:'text',text:'Page {page} of {pages}',place:'right',pin:true,y:64,w:150,h:10,lh:10,size:7,color:C.faint,align:'right'}]:[
   {id:'pageNo',type:'text',text:'Page {page} of {pages}',place:'right',pin:true,y:41,w:150,h:10,lh:10,size:7,color:C.faint,align:'right'}]).concat([
   /* Оплаченный счёт — отметка PAID рамкой слева от заголовка. */
   {id:'stamp',type:'box',place:'free',pin:true,x:376,y:3,w:92,h:38,color:C.paid,lw:2,r:4,show:{when:'filled',field:'stamp'}},
   {id:'stampText',type:'field',field:'stamp',place:'free',pin:true,x:376,y:25,w:92,h:20,lh:20,size:20,bold:true,color:C.paid,align:'center',ls:2},
   {id:'stampDate',type:'field',field:'stamp.date',place:'free',pin:true,x:376,y:36,w:92,h:9,lh:9,size:7,bold:true,color:C.paid,align:'center'},
   {id:'meta',type:'section',k:'meta',place:'left',y:wo?74:56,w:540,h:38},
   {id:'boxes',type:'section',k:'boxes',place:'left',y:wo?112:94,w:540,h:40}]).concat(strip?[
   /* Строка итогов под адресами (владелец 06.11.2026): адреса выросли —
      она ниже. */
   {id:'strip',type:'section',k:'strip',place:'left',y:134,w:540,h:32,sa:10}]:[])},
  every:{h:36,blocks:[
   {id:'company',type:'field',field:'company.name',place:'left',y:10,w:300,h:11,lh:11,size:10.5,bold:true,color:C.navy,fit:true,opt:'company'},
   {id:'docLine',type:'field',field:'header.short',place:'left',y:21,w:330,h:11,lh:11,size:7.4,color:C.mut,fit:true,empty:''},
   {id:'title',type:'field',field:'title',place:'right',pin:true,y:11,w:300,h:11,lh:11,size:12,bold:true,color:C.navy,align:'right'},
   {id:'pageNo',type:'text',text:'Page {page} of {pages}',place:'right',pin:true,y:22,w:150,h:14,lh:14,size:7,color:C.faint,align:'right'}]},
  table:{lines:true},
  totals:{h:239.8,keep:0,blocks:[
   {id:'end',type:'section',k:'end',place:'left',y:0,w:540,h:60},
   {id:'summary',type:'section',k:'summary',place:'left',y:60,w:540,h:44},
   label('notesLabel','ORDER NOTES',117,1,'notes'),
   {id:'notes',type:'field',field:'notes',place:'left',y:127.8,w:540,h:10.4,lh:10.4,lead:7.8,size:7.8,wrap:true},
   label('termsLabel','TERMS AND CONDITIONS',143.4,2,'terms'),
   {id:'terms',type:'field',field:'terms',place:'left',y:153.2,w:540,h:9.4,lh:9.4,lead:6.8,size:6.8,color:C.mut,wrap:true},
   {id:'signature',type:'section',k:'signature',place:'left',y:155.8,w:540,h:84}]},
  bottom:{h:44,blocks:[
   {id:'footLine',type:'line',place:'left',y:7,w:540,h:0,color:C.line,lw:.5},
  ].concat(wo?[
   /* Work order: итоги «до этой страницы» (как у Spiel, но юниты и стёкла
      раздельно и в кг) и когда напечатан — статус по сканам на этот момент. */
   {id:'pageTotals',type:'field',field:'page.upto',place:'left',y:16,w:300,h:9,lh:9,size:6.8,bold:true,fit:true},
   {id:'printed',type:'text',text:'{footer.left} · Printed {printed} · status from station scans at print time',place:'left',y:26,w:340,h:9,lh:9,size:6.2,color:C.faint,fit:true}]:[
   {id:'footLeft',type:'field',field:'footer.left',place:'left',y:16,w:240,h:9,lh:9,size:6.8,color:C.faint,fit:true}]).concat([
   {id:'footRight',type:'text',text:(kind==='receipt'?'':'{footer.right} · ')+'Page {page} of {pages}',place:'right',pin:true,y:16,w:400,h:9,lh:9,size:6.8,color:C.faint,align:'right'}])}
 }};
}
/* Поля бланка заказа (окно Insert field); m — модель docBuildModel. */
const DOC_FORM_FIELDS=[
 {k:'company.name',g:'Company',label:'Company name',v:m=>docCompanyBlock().name},
 {k:'company.lines',g:'Company',label:'Address and contacts',v:m=>docCompanyBlock().lines},
 {k:'company.logo',g:'Company',label:'Logo',v:m=>docCompanyBlock().logo||''},
 {k:'title',g:'Document',label:'Title',v:m=>m.title},
 {k:'docName',g:'Document',label:'Document name',v:m=>m.docName},
 {k:'number',g:'Document',label:'Number',v:m=>m.number},
 {k:'number.label',g:'Document',label:'Number label',v:m=>m.numberLabel!=null?m.numberLabel:'No.'},
 {k:'header.short',g:'Document',label:'Document, customer and PO',v:m=>[m.docName+' '+m.number,m.customerName,m.po?'PO '+m.po:''].filter(Boolean).join(' · ')},
 {k:'date',g:'Document',label:'Date',t:'date',v:m=>m.data.date},
 {k:'dueDate',g:'Document',label:'Due date',t:'date',v:m=>m.data.dueDate},
 {k:'validUntil',g:'Document',label:'Valid until',t:'date',v:m=>m.data.validUntil},
 {k:'stamp',g:'Document',label:'Paid stamp',v:m=>m.stamp?m.stamp.text:''},
 {k:'stamp.date',g:'Document',label:'Paid on',v:m=>m.stamp?m.stamp.sub||'':''},
 {k:'notes',g:'Document',label:'Order notes',v:m=>m.notes},
 {k:'terms',g:'Document',label:'Terms and conditions',v:m=>m.terms},
 {k:'footer.left',g:'Document',label:'Footer text',v:m=>m.footerLeft},
 {k:'footer.right',g:'Document',label:'Company and number',v:m=>m.footerRight},
 {k:'printed',g:'Document',label:'Printed at',v:()=>{const d=new Date();return docDate(d.toISOString().slice(0,10))+' '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});}},
 {k:'customerPo',g:'Order',label:'Customer PO',v:m=>m.data.customerPo},
 {k:'paymentTerms',g:'Order',label:'Payment terms',v:m=>m.data.terms},
 {k:'currency',g:'Order',label:'Currency',v:m=>m.data.currency},
 {k:'priority',g:'Order',label:'Priority',v:m=>m.data.priority},
 {k:'delivery',g:'Order',label:'Pickup / Delivery',v:m=>m.data.delivery},
 {k:'customer',g:'Customer',label:'Customer',v:m=>m.customerName},
 {k:'customer.code',g:'Customer',label:'Account code',v:m=>m.data.account},
 {k:'billTo',g:'Customer',label:'Customer address',v:m=>m.data.billTo},
 {k:'contact',g:'Customer',label:'Contact',v:m=>m.data.contact},
 {k:'shipTo',g:'Customer',label:'Ship to',v:m=>m.data.shipTo},
 {k:'total.units',g:'Totals',label:'Glass units',v:m=>m.data.units},
 {k:'total.lines',g:'Totals',label:'Lines',v:m=>m.data.lines},
 {k:'total.area',g:'Totals',label:'Total area',v:m=>m.data.area},
 {k:'total.weight',g:'Totals',label:'Total weight',v:m=>m.data.weight},
 {k:'total.weight.lb',g:'Totals',label:'Total weight, lb',v:m=>m.data.weightLb},
 {k:'total.subtotal',g:'Totals',label:'Subtotal',v:m=>m.data.subtotal},
 {k:'total.hst',g:'Totals',label:'HST',v:m=>m.data.hst},
 {k:'total.grand',g:'Totals',label:'Total',v:m=>m.data.grand},
 {k:'total.paid',g:'Totals',label:'Paid to date',v:m=>m.data.paid},
 {k:'total.credits',g:'Totals',label:'Credits',v:m=>m.data.credits},
 {k:'credits',g:'Totals',label:'Payments, one per line',v:m=>m.data.creditLines},
 {k:'total.balance',g:'Totals',label:'Balance',v:m=>m.data.balance},
 /* Итоги «до этой страницы» — значение своё у каждого листа (pageFields). */
 {k:'page.upto',g:'Totals',label:'Up to this page',v:()=>''}];
/* Квитанция и выписка — без полей заказа (даты, условия, итоги заказа). */
const DOC_FORM_FIN_FIELDS=['company.name','company.lines','company.logo','title','docName','number','number.label','header.short','footer.left','footer.right','customer'];
function docFormFields(kind){return formWithCompany(DOC_FORM_FIN.includes(kind)?DOC_FORM_FIELDS.filter(f=>DOC_FORM_FIN_FIELDS.includes(f.k)):DOC_FORM_FIELDS).concat(formMyFields());}
/* Блоки, которых нет в шаблоне по умолчанию, — свои галочки в ✎ Customize
   (ключ b:<id>, по умолчанию стоит). */
function docFormAdded(kind,tpl){
 const def=docFormDefault(kind),ids=new Set(Object.keys(def.parts).flatMap(k=>(def.parts[k].blocks||[]).map(b=>k+'|'+b.id)));
 return Object.keys(tpl.parts).flatMap(k=>(tpl.parts[k].blocks||[]).filter(b=>!ids.has(k+'|'+b.id)).map(b=>({part:k,b})));
}
function docFormContext(m,tpl){
 if(!m.data)m=Object.assign({},m,{data:{}});
 const opts=m.opts||{company:true},by=new Map(docFormFields(m.kind).map(x=>[x.k,x])),added=new Set(docFormAdded(m.kind,tpl||docFormTemplate(m.kind,m.form)).map(x=>x.b.id)),cache=new Map();
 const sec={
  strip:()=>m.strip&&m.strip.length?{h:m.stripPaid?56:32,draw(P,y){docCells(P,m.strip,y,32,10.5);if(m.stripPaid)docPaidBar(P,m.stripPaid,y+38);}}:null,
  meta:()=>m.meta.length?{h:38,draw(P,y){docCells(P,m.meta,y,28,7.8);}}:null,
  boxes:()=>{if(!m.boxes.length)return null;const L=docBoxesLay(m.boxes);return {h:L.h+12,draw:L.draw};},
  end:()=>m.end?docEndBlock(m):null,
  /* summaryBar — полоса сроков выписки под ячейками, проценты под ней. */
  summary:()=>{if(!m.summary)return null;const bar=m.summaryBar?26:0;return {h:(m.summaryNote?58:44)+bar,draw(P,y){docCells(P,m.summary,y+12,32,10.5);if(bar){docBar(P,m.summaryBar.parts,y+50,6);P.text(DOC_PAGE.left,y+65,m.summaryBar.text,{size:6,color:DOC_COLOR.mut});}if(m.summaryNote)P.text(DOC_PAGE.left,y+55+bar,docFit(m.summaryNote,7.6,false,DOC_PAGE.right-DOC_PAGE.left),{size:7.6});}};},
  signature:()=>m.signature?docSignatureBlock(m):null};
 return {field:k=>{const x=by.get(k);return x?x.v(m):undefined;},type:k=>(by.get(k)||{}).t||'',
  section:k=>{if(!cache.has(k))cache.set(k,sec[k]?sec[k]():null);return cache.get(k);},
  /* Галочки ✎ Customize: opt — поле набора (Company logo and details),
     свой блок — b:<id>. */
  off:b=>b.opt?!opts[b.opt]:added.has(b.id)&&opts['b:'+b.id]===false};
}
function docFormTemplate(kind,form){const c=form&&docCustomForm(form);return formClean(DB.formTemplate&&DB.formTemplate[c&&c.base===kind?c.k:DOC_FORM_FIN.includes(kind)?formUseKey(kind):kind],docFormDefault(kind));}
/* Свои формы (06.11.2026): новая форма с нуля или копией бланка заказа.
   DB.formCustom — {k, name, base}; шаблон — DB.formTemplate[k]; данные и
   ✎ Customize — бланка base, печать — из окна бланков заказа рядом с ним. */
function docCustomForms(){return (Array.isArray(DB.formCustom)?DB.formCustom:[]).filter(f=>f&&DOC_FORM_KINDS.includes(f.base));}
function docCustomForm(k){return docCustomForms().find(f=>f.k===k)||null;}
/* С нуля: лист без блоков, строки заказа остаются (их рисует код). */
function docFormBlank(kind){
 const t=JSON.parse(JSON.stringify(docFormDefault(kind)));
 Object.keys(t.parts).forEach(k=>{const p=t.parts[k];if(p.blocks){p.blocks=[];if(k!=='bottom')p.h=0;}});
 return t;
}
/* Строки заказа рисуются как раньше (docItemParts): лист кончается только
   между частями строки, шапка таблицы повторяется на каждом листе. */
function docFormPages(m,tpl,map){
 tpl=tpl||docFormTemplate(m.kind,m.form);
 const f=formFlow(tpl,docFormContext(m,tpl),map);let inTable=false;
 const start=()=>{f.page();if(inTable){f.y=docTableHead(f.P,m,f.y);f.top=f.y;}};
 const fits=h=>f.y+h<=f.bottom,room=h=>{if(!fits(h)&&f.y>f.top+1)start();};
 const flow=(parts,onBreak)=>parts.forEach((part,i)=>{if(!fits(part.h)&&f.y>f.top+1){start();if(i&&onBreak)f.y=onBreak(f.P,f.y);}part.draw(f.P,f.y);f.y+=part.h;});
 f.page(null,'head');f.topKey='every';
 if(!m.items){finDocTable(f,m);f.flow('totals');return f.finish();}
 if(m.items.length||m.extra){
  inTable=true;f.y=docTableHead(f.P,m,f.y);f.top=f.y;
  /* Work order: на каком листе началась каждая строка — итоги «до этой
     страницы» внизу листа. */
  const first=new Map();
  m.items.forEach(it=>{
   const parts=docItemParts(m,it),d=parts[0].draw;parts[0].draw=(P,y)=>{if(!first.has(it.n))first.set(it.n,f.pages.length-1);d(P,y);};
   room(parts.slice(0,3).reduce((s,p)=>s+p.h,0));
   flow(parts,(pg,yy)=>{pg.text(DOC_COL.item,yy+9,'Line '+it.n+(it.mark?' · '+it.mark:'')+' (continued)',{size:7.4,color:DOC_COLOR.mut});return yy+13;});
  });
  if(m.extra){const parts=docExtraParts(m);room(parts.slice(0,2).reduce((s,p)=>s+p.h,0));flow(parts);}
  inTable=false;
  if(m.lineTotals)f.pageFields=i=>({'page.upto':docPageUpto(m,[...first].filter(([n,p])=>p<=i).map(([n])=>n))});
 }
 f.flow('totals');
 return f.finish();
}
function docPageUpto(m,lines){
 const t={units:0,panels:0,area:0,kg:0};lines.forEach(n=>{const x=m.lineTotals[n-1];if(x)Object.keys(t).forEach(k=>{t[k]+=x[k];});});
 return 'Up to this page: '+t.units+' units · '+t.panels+' panels · '+docNum(t.area,1)+' ft² · '+docNum(t.kg,0)+' kg';
}
/* Листы бланка: из шаблона — у бланков, которые уже перешли, иначе прежней
   раскладкой. */
function docPages(m){return DOC_FORM_KINDS.includes(m.kind)?docFormPages(m):docLayout(m);}
/* ✎ Customize: галочки строятся из блоков шаблона. Поле набора видно, если
   в шаблоне есть его блок или секция; строки (Lines, Prices on lines) —
   всегда. */
const DOC_FORM_OPT_BLOCK={company:'opt',totalsTop:'strip',date:'meta',enteredBy:'meta',validUntil:'meta',customerPo:'meta',dueDate:'meta',terms:'meta',currency:'meta',priority:'meta',delivery:'meta',accountCode:'meta',taxNumber:'meta',
 billTo:'boxes',contact:'boxes',shipTo:'boxes',groupTotals:'end',totals:'end',receipts:'end',payment:'end',paymentInstructions:'end',notes:'end notes',orderSummary:'summary',termsText:'terms',signature:'signature'};
function docFormHas(tpl,k){
 const want=DOC_FORM_OPT_BLOCK[k];if(!want)return true;
 const all=Object.keys(tpl.parts).flatMap(p=>tpl.parts[p].blocks||[]);
 if(want==='opt')return all.some(b=>b.opt===k);
 return want.split(' ').some(id=>all.some(b=>b.type==='section'?b.k===id:b.id===id));
}
function docFormBlockLabel(b){
 if(b.type==='text'){const t=String(b.text||'').replace(/\{[\w.]+(\|[^}]*)?\}/g,'…').replace(/\s+/g,' ').trim();return t.length>34?t.slice(0,33)+'…':t||'Text';}
 if(b.type==='field'){const f=formWithCompany(DOC_FORM_FIELDS).find(x=>x.k===b.field)||formMyFields().find(x=>x.k===b.field);return (b.prefix||'')+(f?f.label:b.field);}
 if(b.type==='section')return DOC_SECTIONS[b.k]||'Section';
 return {line:'Line',box:'Frame',image:'Picture',barcode:'Barcode'}[b.type]||'Block';
}
/* Конструктор: последние заказы (у Quote — квоты) для живого листа. */
function docFormSamples(kind){
 return (DB.salesOrder||[]).filter(o=>o&&o.businessNumber&&(kind==='quote')===!!salesIsQuote(o)).sort((a,b)=>String(b.businessNumber).localeCompare(String(a.businessNumber),undefined,{numeric:true})).slice(0,100)
  .map(o=>({id:o.id,label:o.businessNumber+' · '+salesCustomerDisplay(o.customerId)}));
}
function docFormSample(kind,id){
 const o=id&&(DB.salesOrder||[]).find(x=>x.id===id);
 if(o)try{return docBuildModel(kind,o,docDefaultOptions(kind));}catch(e){}
 const s={id:'sample',businessNumber:kind==='quote'?'Q-1001':'1001',customerId:'',customerPo:'PO-1',lines:[],extraItems:[],adjustments:[],cancellations:[],currency:'CAD',delivery:'pickup',priority:'normal',createdAt:finToday(),dueDate:finToday(),notes:''};
 return docBuildModel(kind,s,docDefaultOptions(kind));
}
/* Конструктор: квитанция и выписка — живой лист на последних квитанциях и
   клиентах (выписка — за этот месяц); без данных — пустой образец. */
function docFormFinSamples(kind){
 if(kind==='receipt')return (DB.receipt||[]).slice().sort((a,b)=>String(b.number).localeCompare(String(a.number),undefined,{numeric:true})).slice(0,100).map(r=>({id:r.id,label:r.number+' · '+salesCustomerDisplay(r.customerId)}));
 return (DB.customer||[]).filter(c=>c&&!c.deletedAt).slice(0,100).map(c=>({id:c.id,label:(c.code?c.code+' · ':'')+(c.legalName||c.displayName||'')}));
}
function docFormFinSample(kind,id){
 let m=null;
 try{if(kind==='receipt')m=id&&finReceiptModel(id);else if(id){const r=finMonthRange(0);m=finStatementModel(id,r.from,r.to);}}catch(e){m=null;}
 if(m)return m;
 m=finDocBase(kind==='receipt'?'PAYMENT RECEIPT':'STATEMENT',kind==='receipt'?'Receipt':'Statement',kind==='receipt'?'R-0001':'C-001',null);m.kind=kind;
 if(kind==='statement')m.numberLabel='Account';
 m.cols=[{label:'Order',x:36,w:80,bold:true},{label:'Amount',x:576,w:90,align:'right'}];m.rows=[];m.empty='No rows.';
 m.end={left:[],rows:[],grand:{label:kind==='receipt'?'Amount received':'Balance due',value:docMoney(0)}};
 return m;
}
