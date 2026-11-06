/* Лист чертежа на конструкторе форм (Data → Company & print → Forms →
   Drawing; вариант A владельца, 06.11.2026): шапка и низ — блоками, вид
   чертежа — бумага, единицы (дюймы 1/16, десятичные, мм с десятыми, вторые
   единицы серым), размер, кегли, цвет и толщина элементов. По умолчанию
   лист — прежняя разметка; одна настройка — везде, где печатается чертёж. */
module.exports=async function({page,eq}){
 console.log('drawing-form');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.dfOrder=()=>{oqReset();DB.formTemplate={};const c=oqCustomer({legalName:'Lakeside Glass'}),id=oqOrder(c);salesDraftDrop();return salesRecord(id);};
  window.dfSheet=(o,i)=>finWithOrder(o,()=>salesLineDrawing(o.lines[i||0])).html;
  window.dfDoc=h=>{const d=document.createElement('div');d.innerHTML=h;return d;};
  window.dfSave=(style,edit)=>{const t=drawFormDefault();Object.assign(t.style,style||{});if(edit)edit(t);DB.formTemplate=Object.assign({},DB.formTemplate,{drawing:formClean(t,drawFormDefault())});};
  window.dfOpen=()=>{formsUi=null;navGo('masterdata');mdSection='print';mdSetTab('forms');formsSetForm('drawing');};
 });
 eq('Drawing form: by default the header and footer are the old lines — Customer, PO, Order Number; empty tag, date · 1 / 1; no look classes',await t.p.evaluate(()=>{
  const o=dfOrder(),h=dfSheet(o),d=dfDoc(h),root=d.querySelector('.print-shape-sheet');
  return {head:d.querySelector('.sheet-id').outerHTML,foot:d.querySelector('.sheet-foot').innerHTML.replace(/\d{4}-\d{2}-\d{2}/,'DATE'),root:[root.className,root.getAttribute('style')],
   svg:d.querySelector('.sheet-field svg').innerHTML.includes('shape-alt-units'),finished:d.querySelector('.sheet-size').textContent};
 }),{head:'<div class="sheet-id"><div class="sheet-id-c"><span>Customer:</span><b>Lakeside Glass</b></div><div class="sheet-id-p"><span>PO:</span><b>PO-QA</b></div><div class="sheet-id-o"><span>Order Number:</span><b>'+await t.p.evaluate(()=>DB.salesOrder[0].businessNumber)+'</b></div></div>',
  foot:'<span><!--sheet-tag--></span><span>DATE · 1 / 1</span>',root:['print-shape-sheet',null],svg:false,finished:'Finished 37″ × 71″'});
 eq('Drawing form: the batch glass tag goes where the Glass tag block is; Free and Show if work in the header',await t.p.evaluate(()=>{
  const o=dfOrder(),tag=dfDoc(salesSheetFoot(dfSheet(o),'B7 · 1/2')).querySelector('.sheet-foot').innerHTML;
  dfSave({},t=>{t.parts.head.blocks.push({id:'n',type:'text',text:'Rush {order}',place:'free',x:225.51,y:20,size:9});t.parts.head.blocks.push({id:'s',type:'field',field:'note',prefix:'Note:',place:'right',show:{when:'filled',field:'note',value:''}});
   t.parts.foot.blocks=t.parts.foot.blocks.filter(b=>b.id!=='date');t.parts.foot.blocks[0].place='right';});
  const d=dfDoc(salesSheetFoot(dfSheet(o),'B7 · 1/2')),free=d.querySelector('.sheet-free');
  return {tag:tag.replace(/\d{4}-\d{2}-\d{2}/,'DATE'),free:[free.textContent,free.getAttribute('style'),free.querySelector('b').getAttribute('style')],note:d.querySelector('.sheet-id-o').children.length,foot:d.querySelector('.sheet-foot').innerHTML};
 }),{tag:'<span class="sheet-tag">B7 · 1/2</span><span>DATE · 1 / 1</span>',free:['Rush '+await t.p.evaluate(()=>DB.salesOrder[0].businessNumber),'position:absolute;left:200pt;top:20pt','font-size:9pt;font-weight:400'],note:2,foot:'<span></span><span class="sheet-tag">B7 · 1/2</span>'});
 eq('Drawing form: units — mm with tenths, decimal inches, mm + inches (inches small gray); Finished follows; the editor on screen stays 1/16',await t.p.evaluate(()=>{
  const o=dfOrder(),nums=h=>[...dfDoc(h).querySelectorAll('.sheet-field svg text')].map(e=>e.textContent).filter(s=>/\d/.test(s)).sort();
  dfSave({units:'mm'});const mm={nums:nums(dfSheet(o)),fin:dfDoc(dfSheet(o)).querySelector('.sheet-size').textContent};
  dfSave({units:'in'});const dec=nums(dfSheet(o));
  dfSave({units:'mm',alt:'in16'});const h=dfSheet(o),alt=dfDoc(h).querySelector('.shape-alt-units');
  return {mm,dec,both:[[...dfDoc(h).querySelectorAll('.shape-alt-units')].map(a=>a.parentNode.textContent).sort(),alt.getAttribute('font-size'),dfDoc(h).querySelector('.sheet-size').textContent],screen:[shapeDrawingDim(30.25),shapeAnnDim(3.25),DIM_PRINT]};
 }),{mm:{nums:['1803.4','1803.4','939.8','939.8'],fin:'Finished 939.8 mm × 1803.4 mm'},dec:['37.00','37.00','71.00','71.00'],
  both:[['1803.4 (71″)','1803.4 (71″)','939.8 (37″)','939.8 (37″)'],'80%','Finished 939.8 mm (37″) × 1803.4 mm (71″)'],screen:['30 1/4','3-1/4',null]});
 eq('Drawing form: look — colors, line widths and service label size only for what was changed; size, no white under numbers, landscape paper',await t.p.evaluate(()=>{
  const o=dfOrder();dfSave({edge:'#b42318',line:'#2563eb',edgeW:3,size:75,bg:false,paper:'landscape',text:'red;}x',serviceSize:20});
  printSheetPrepare([dfSheet(o)],'',salesSheetFitDrawing);const host=document.getElementById('printSheetHost'),root=host.querySelector('.print-shape-sheet');
  const cs=el=>getComputedStyle(el),edge=host.querySelector('.shape-edge'),dim=[...host.querySelectorAll('.sheet-field svg line')].find(l=>!l.classList.contains('shape-edge'));
  const out={cls:root.className,style:root.getAttribute('style'),edge:[cs(edge).stroke,cs(edge).strokeWidth],dim:cs(dim).stroke,page:host.querySelector('style').textContent,
   bg:[...host.querySelectorAll('.shape-ann-bg')].every(r=>cs(r).display==='none')};
  printSheetCleanup();DB.formTemplate={};printSheetPrepare([dfSheet(o)],'',salesSheetFitDrawing);out.portrait=document.querySelector('#printSheetHost style').textContent;printSheetCleanup();
  return out;
 }),{cls:'print-shape-sheet dw-land dw-nobg dw-w-edge dw-fs-ftext',style:'--dw-size:75%;--dw-edge:#b42318;--dw-edge-w:3px;--dw-line:#2563eb;--dw-ftext-fs:20px',edge:['rgb(180, 35, 24)','3px'],dim:'rgb(37, 99, 235)',
  page:'@media print{@page{size:landscape}}',bg:true,portrait:'@media print{@page{size:portrait}}'});
 eq('Drawing form: a saved template is cleaned — unknown units and bad colors fall back to now',await t.p.evaluate(()=>{
  const t=formClean({parts:{},style:{units:'feet',edge:'url(x)',size:'big',paper:'sideways',dimSize:999}},drawFormDefault()),s=drawStyle(t);
  return [s.units,s.edge,s.size,s.paper,s.dimSize];
 }),['in16','',100,'portrait',40]);
 eq('Drawing form: Data → Forms → Drawing — parts, the live drawing of an order line; Units changes the sheet; Save — stations print the same',await t.p.evaluate(()=>{
  const o=dfOrder();dfOpen();const s=formsState();
  const parts=[...document.querySelectorAll('[data-forms-part]')].map(b=>b.querySelector('span').textContent),add=[...document.querySelectorAll('[data-forms-add]')].map(b=>b.textContent);
  const live=!!document.querySelector('[data-forms-stage] .print-shape-sheet .sheet-field svg'),hits=[...document.querySelectorAll('[data-forms-stage] [data-forms-hit]')].map(e=>e.dataset.formsHit);
  document.querySelector('[data-forms-part-hit="drawing"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
  const panel=document.querySelector('[data-forms-settings]').textContent.includes('Part · Drawing');
  const u=document.querySelector('[data-draw-units]');u.value='mm';u.dispatchEvent(new Event('change'));
  const liveMm=[...document.querySelectorAll('[data-forms-stage] .sheet-field svg text')].some(e=>e.textContent==='939.8'),dirty=!!document.querySelector('[data-forms-dirty]');
  document.querySelector('[data-forms-save]').click();
  const printed=[...dfDoc(dfSheet(o)).querySelectorAll('.sheet-field svg text')].some(e=>e.textContent==='939.8');
  return {parts,add,live,hits,panel,liveMm,dirty,saved:DB.formTemplate.drawing.style.units,printed,sample:s.sample.startsWith(o.id+'|')};
 }),{parts:['Header','Info','Drawing','Route','Footer'],add:['+ Text','+ Field'],live:true,hits:['head|customer','head|po','head|order','foot|tag','foot|date'],panel:true,liveMm:true,dirty:true,saved:'mm',printed:true,sample:true});
 eq('Drawing form: Lines — Thinner / As now / Bolder for all lines, − and + per line; Colors — All black; the ruler and guides on the sheet',await t.p.evaluate(()=>{
  dfOrder();dfOpen();formsSelect('drawing','');const btn=(sel,txt)=>[...document.querySelectorAll(sel+' button')].find(b=>b.textContent===txt);
  btn('[data-draw-lines]','Bolder').click();const st=()=>drawStyle(formsDraft().tpl),bold=['edgeW','lineW','featureW'].map(k=>st()[k]);
  const on=btn('[data-draw-lines]','Bolder').classList.contains('on');
  document.querySelector('[data-draw-step="edgeW"] button[title="Less"]').click();const less=st().edgeW;
  document.querySelector('[data-draw-step="dimSize"] button[title="More"]').click();const dim=st().dimSize;
  btn('[data-draw-colors]','All black').click();const black=[st().edge,st().text,st().altColor];
  btn('[data-draw-lines]','As now').click();
  const sheet=document.querySelector('[data-forms-stage] .print-shape-sheet');
  return {bold,on,less,dim,black,now:['edgeW','lineW','featureW'].map(k=>st()[k]),cls:sheet.className,ruler:!!document.querySelector('.fm-dsheet .fm-ruler.x')&&!!document.querySelector('.fm-dsheet [data-forms-ruler="y"]'),
   margins:document.querySelectorAll('.fm-dsheet [data-forms-margin]').length,example:document.querySelector('[data-draw-example]').textContent};
 }),{bold:[2.8,1.5,2.3],on:true,less:2.6,dim:19,black:['#000000','#000000',''],now:[0,0,0],cls:'print-shape-sheet',ruler:true,margins:0,example:'Example: 33 1/4'});
 eq('Drawing form: blocks that overlap — marked on the sheet with a note, Save still works; Layer — To back puts the block under the drawing, To front over everything',await t.p.evaluate(async()=>{
  dfOrder();dfOpen();formsEdit(t=>{t.parts.head.blocks.push({id:'over',type:'text',text:'OVERLAPPING NOTE',place:'free',x:30,y:0,size:12,bold:true});});
  await new Promise(r=>setTimeout(r,50));
  const note=document.querySelector('[data-draw-overlap]'),marked=[...document.querySelectorAll('[data-forms-overlap]')].map(e=>e.dataset.formsHit).sort(),save=!document.querySelector('[data-forms-save]').disabled;
  formsSelect('head','over');document.querySelector('[data-draw-layer="toBack"]').click();const back=[formsDraft().tpl.parts.head.blocks.find(b=>b.id==='over').z,/isolation:isolate/.test(document.querySelector('[data-forms-stage] .print-shape-sheet').getAttribute('style')||''),/z-index:-1/.test(document.querySelector('[data-forms-hit="head|over"]').getAttribute('style'))];
  document.querySelector('[data-draw-layer="toFront"]').click();const front=formsDraft().tpl.parts.head.blocks.find(b=>b.id==='over').z;
  document.querySelector('[data-draw-layer="back"]').click();const none=formsDraft().tpl.parts.head.blocks.find(b=>b.id==='over').z;
  return {note:!!note&&note.textContent.includes('Save works'),marked,save,back,front,none:none==null};
 }),{note:true,marked:['head|customer','head|over'],save:true,back:[-1,true,true],front:1,none:true});
 eq('Drawing form: company details and prices as fields — top or bottom of the sheet; prices are the line cells (Unit Price, Line Total), as on the Invoice',await t.p.evaluate(()=>{
  const o=dfOrder();DB.company=Object.assign({},DB.company,{legalName:'Infinity Glass',address1:'200 Shop Rd',city:'Vaughan',province:'ON',postalCode:'L4K 2Z9',phone:'905-555-0100',email:'office@example.com',website:''});
  dfSave({},t=>{t.parts.foot.blocks.push({id:'co',type:'field',field:'companyLine',place:'center'});t.parts.head.blocks.push({id:'pr',type:'field',field:'linePrice',prefix:'Line total:',place:'right'});});
  const d=dfDoc(dfSheet(o)),p=finWithOrder(o,()=>salesLineCommercialPrice(o.lines[0],o)),inv=finWithOrder(o,()=>docBuildModel('invoice',o,docDefaultOptions('invoice'))).items[0].amount;
  return {foot:d.querySelector('.sheet-foot').children[1].textContent,price:[d.querySelector('.sheet-id-o').children[1].textContent===('Line total:'+docMoney(p.line)),docMoney(p.line)===inv],has:!!p.line,
   fields:drawFormFields().filter(f=>f.g==='Prices'||f.g==='Company').map(f=>f.k)};
 }),{foot:'Infinity Glass · 200 Shop Rd, Vaughan, ON L4K 2Z9 · 905-555-0100 · office@example.com',price:[true,true],has:true,
  fields:['unitPrice','linePrice','materialsPrice','company','companyLine','companyAddress','companyPhone','companyEmail','companyWebsite','companyHst']});
 eq('Drawing form browser errors',t.errs,[]);await t.c.close();
};
