/* Этап 7: конструктор форм (Data → Company & print → Forms). Вид «ТОП»
   02.11.2026, окно Insert field — вариант В 05.11.2026. Печать Packing slip
   берёт сохранённый шаблон. */
module.exports=async function({page,eq}){
 console.log('forms-editor');const t=await page();await require('./optimization-fixture')(t.p);
 const helpers=()=>{
  window.feOpen=()=>{formsUi=null;navGo('masterdata');mdSection='print';mdSetTab('forms');render();};
  window.feText=pages=>pages.flatMap(p=>p.items.filter(i=>i.t==='text').map(i=>i.s));
  window.fePs=()=>{oqReset();DB.carrier=[];DB.carrierSeq={};const c=oqCustomer(),id=oqOrder(c);salesDraftDrop();oqThrough(id,'ready');const o=salesRecord(id);
   return shippingCreate({customerId:o.customerId,method:'delivery',shipTo:{address1:'1 Main St'},date:'2026-10-08',items:shippingAvailable(o).map(shippingItem),extras:[]}).value;};
  /* Мышь на листе: нажать на блоке, потянуть по листу, отпустить. */
  window.feDrag=(sel,dx,dy,handle)=>{
   let el=document.querySelector('[data-forms-hit="'+sel+'"]');if(handle)el=el.querySelector('[data-forms-resize="'+handle+'"]')||el;
   const r=el.getBoundingClientRect(),x=r.left+3,y=r.top+3,stage=document.querySelector('[data-forms-stage]'),o={bubbles:true,pointerId:7,button:0,clientX:x,clientY:y};
   el.dispatchEvent(new PointerEvent('pointerdown',o));
   const st=document.querySelector('[data-forms-stage]');st.dispatchEvent(new PointerEvent('pointermove',Object.assign({},o,{clientX:x+dx/2,clientY:y+dy/2})));
   st.dispatchEvent(new PointerEvent('pointermove',Object.assign({},o,{clientX:x+dx,clientY:y+dy})));st.dispatchEvent(new PointerEvent('pointerup',Object.assign({},o,{clientX:x+dx,clientY:y+dy})));
  };
  window.feClick=sel=>{const el=document.querySelector(sel);el.click();};
 };
 await t.p.evaluate(helpers);
 eq('Forms: Data → Company & print has Forms; the live sheet, parts of the sheet, Add; nothing saved, Save is off',await t.p.evaluate(()=>{
  feOpen();
  return {tab:[...document.querySelectorAll('[data-md-subtabs] .sl-quick-pill')].map(b=>b.textContent),forms:[...document.querySelectorAll('.fm-forms .sl-quick-pill')].map(b=>b.textContent),
   sheets:document.querySelectorAll('[data-forms-page]').length>0,parts:[...document.querySelectorAll('[data-forms-part]')].map(b=>b.querySelector('span').textContent),
   add:[...document.querySelectorAll('[data-forms-add]')].map(b=>b.textContent),hits:document.querySelectorAll('[data-forms-hit]').length>10,save:document.querySelector('[data-forms-save]').disabled,ruler:!!document.querySelector('.fm-ruler.x')};
 }),{tab:['Company','Stickers','Forms'],forms:['Packing slip','Quote','Proforma invoice'],sheets:true,parts:['Page header','First page','Lines table','Totals','Skid sheet','Skid table','Page footer'],add:['+ Text','+ Field','+ Picture','+ Line','+ Frame','+ Barcode'],hits:true,save:true,ruler:true});
 eq('Forms: click a block on the sheet — its settings; size changes the live sheet, Unsaved changes; Undo brings it back',await t.p.evaluate(()=>{
  feOpen();feDrag('every|title',0,0);const panel=document.querySelector('[data-forms-settings]').textContent.includes('Selected · Field');
  const inp=document.querySelector('[data-forms-num="size"]');inp.value='20';inp.dispatchEvent(new Event('change'));
  const size=()=>{const x=formsUi&&formsDraft().tpl.parts.every.blocks.find(b=>b.id==='title');return x.size;},svg=()=>[...document.querySelectorAll('[data-forms-page="0"] text')].find(e=>e.textContent==='PACKING SLIP').getAttribute('font-size');
  const after={size:size(),svg:svg(),dirty:!!document.querySelector('[data-forms-dirty]')};feClick('[data-forms-undo]');
  return {panel,after,undo:{size:size(),svg:svg(),dirty:!!document.querySelector('[data-forms-dirty]')}};
 }),{panel:true,after:{size:20,svg:'20',dirty:true},undo:{size:17,svg:'17',dirty:false}});
 eq('Forms: Font Times or Courier and I (italic) — the block, the live sheet and the PDF follow',await t.p.evaluate(()=>{
  feOpen();feDrag('every|title',0,0);const sel=document.querySelector('[data-forms-font]');sel.value='times';sel.dispatchEvent(new Event('change'));feClick('[data-forms-italic]');
  const b=formsFind(formsDraft().tpl,{part:'every',id:'title'}),el=[...document.querySelectorAll('[data-forms-page="0"] text')].find(e=>e.textContent==='PACKING SLIP');
  const pages=shippingPages(shippingFormSample(),null,formsDraft().tpl),pdf=String.fromCharCode(...docPdfBytes(pages));
  return {block:[b.font,b.italic],svg:[el.getAttribute('font-family').split(',')[0],el.getAttribute('font-style')],pdf:pdf.includes('/Times-BoldItalic'),on:document.querySelector('[data-forms-italic]').classList.contains('on')};
 }),{block:['times',true],svg:['Times','italic'],pdf:true,on:true});
 eq('Forms: + Text goes to the chosen part under its blocks; drag moves it down, Free moves it anywhere, the right corner sets the width',await t.p.evaluate(()=>{
  feOpen();feClick('[data-forms-part="totals"]');const h0=formsDraft().tpl.parts.totals.h;feClick('[data-forms-add="text"]');
  const sel=formsUi.sel,b=()=>formsFind(formsDraft().tpl,sel),ta=document.querySelector('[data-forms-text]');ta.value='Thank you for your business';ta.dispatchEvent(new Event('change'));
  const placed={part:sel.part,y:b().y===h0,grown:formsDraft().tpl.parts.totals.h>h0};
  const k=612/document.querySelector('[data-forms-page="0"]').getBoundingClientRect().width,y0=b().y;feDrag('totals|'+sel.id,40,30);const down=Math.round((b().y-y0)/k),xKept=b().place==='left'&&b().x==null;
  feClick('.fm-seg button:nth-child(4)');const x0=b().x;feDrag('totals|'+sel.id,50,0);const free={place:b().place,moved:Math.round((b().x-x0)/k)};
  const w0=b().w;feDrag('totals|'+sel.id,40,0,'e');
  return {placed,down,xKept,free,wider:Math.round((b().w-w0)/k),text:[...document.querySelectorAll('[data-forms-page] text')].some(e=>e.textContent==='Thank you for your business'),undo:formsDraft().undo.length>=4};
 }),{placed:{part:'totals',y:true,grown:true},down:30,xKept:true,free:{place:'free',moved:50},wider:40,text:true,undo:true});
 eq('Forms: Insert field — group, field with its value from this packing slip, date format and text before the value',await t.p.evaluate(()=>{
  const s=fePs();feOpen();formsSetSample(s.id);feClick('[data-forms-part="first"]');feClick('[data-forms-add="field"]');
  const modal=!!document.querySelector('[data-forms-modal]');[...document.querySelectorAll('.fm-groups .fm-pick')].find(b=>b.textContent==='Packing slip').click();
  const shown=document.querySelector('[data-forms-field="date"] em').textContent;feClick('[data-forms-field="date"]');
  [...document.querySelectorAll('.fm-fmt')].find(b=>b.textContent.includes('yyyy-mm-dd')).click();
  const p=document.querySelector('[data-forms-prefix]');p.value='Date: ';p.dispatchEvent(new Event('change'));feClick('[data-forms-insert]');
  const b=formsFind(formsDraft().tpl,formsUi.sel);
  return {modal,shown,block:{type:b.type,field:b.field,format:b.format,prefix:b.prefix},closed:!document.querySelector('[data-forms-modal]'),sheet:[...document.querySelectorAll('[data-forms-page="0"] text')].some(e=>e.textContent==='Date: 2026-10-08')};
 }),{modal:true,shown:'Oct 8, 2026',block:{type:'field',field:'date',format:'iso',prefix:'Date: '},closed:true,sheet:true});
 eq('Forms: Save — the packing slip prints from the saved form and it stays after F5; the barcode block deleted — no barcode on paper',await t.p.evaluate(()=>{
  feDrag('every|barcode',0,0);feClick('[data-forms-delete]');feClick('[data-forms-save]');
  const s=DB.shipment.at(-1),pages=shippingPages(shippingDocument(s));
  return {saved:!!DB.formTemplate.packingSlip,date:feText(pages).includes('Date: 2026-10-08'),barcode:pages[0].items.some(i=>i.t==='rect'&&i.fill==='#000000'),save:document.querySelector('[data-forms-save]').disabled,notice:document.querySelector('.fm-saved').textContent};
 }),{saved:true,date:true,barcode:false,save:true,notice:'Saved'});
 await t.p.evaluate(()=>storageFlush&&storageFlush());await t.p.reload();await t.p.evaluate(()=>window.storageReady);await t.p.evaluate(helpers);
 eq('Forms: after F5 the saved form prints; Reset to default and Save — the default packing slip again',await t.p.evaluate(()=>{
  const s=DB.shipment.at(-1),before=feText(shippingPages(shippingDocument(s))).includes('Date: 2026-10-08');
  feOpen();feClick('[data-forms-reset]');feClick('[data-forms-save]');const pages=shippingPages(shippingDocument(s));
  return {before,after:feText(pages).includes('Date: 2026-10-08'),barcode:pages[0].items.some(i=>i.t==='rect'&&i.fill==='#000000'),same:JSON.stringify(pages)===JSON.stringify(shippingPages(shippingDocument(s),null,shippingFormDefault()))};
 }),{before:true,after:false,barcode:true,same:true});
 eq('Forms: History — each Save is a version with what changed; Versions shows the chosen version on the sheet; Restore puts it in the editor, Save keeps it',await t.p.evaluate(()=>{
  DB.formVersion=[];DB.formTemplate={};feOpen();
  feClick('[data-forms-part="totals"]');feClick('[data-forms-add="text"]');feClick('[data-forms-save]');
  feDrag('every|title',0,0);const inp=document.querySelector('[data-forms-num="size"]');inp.value='22';inp.dispatchEvent(new Event('change'));feClick('[data-forms-save]');
  feClick('[data-forms-history]');const list=[...document.querySelectorAll('[data-forms-version]')].map(b=>b.querySelector('small').textContent);
  const restore0=document.querySelector('[data-forms-restore]').disabled;feClick('[data-forms-version="1"]');const sheets=document.querySelectorAll('.fm-vsheet').length;
  const old=[...document.querySelectorAll('.fm-vsheet text')].find(e=>e.textContent==='PACKING SLIP').getAttribute('font-size');
  feClick('[data-forms-restore]');const after={size:formsFind(formsDraft().tpl,{part:'every',id:'title'}).size,dirty:!!document.querySelector('[data-forms-dirty]'),closed:!document.querySelector('[data-forms-versions]')};
  feClick('[data-forms-history]');feClick('[data-forms-version="2"]');feClick('[data-forms-restore]');
  return {list,restore0,sheets:sheets>0,old,after,def:JSON.stringify(shippingPages(shippingFormSample(),null,formsDraft().tpl))===JSON.stringify(shippingPages(shippingFormSample(),null,shippingFormDefault())),versions:DB.formVersion.length};
 }),{list:['1 block changed','1 block added','The program’s form'],restore0:true,sheets:true,old:'17',after:{size:17,dirty:true,closed:true},def:true,versions:2});
 eq('Forms: Download this version and Load form file bring the same form back; a wrong file is refused with a reason; 20 versions kept per form',await t.p.evaluate(()=>{
  let got=null;const keep=storageDownload;storageDownload=(name,text)=>{got={name,text};};
  try{feOpen();feClick('[data-forms-history]');feClick('[data-forms-version="0"]');feClick('[data-forms-download]');}finally{storageDownload=keep;}
  const file=JSON.parse(got.text);feClick('[data-forms-history]');
  const bad=[formsLoadText('{oops'),document.querySelector('[data-forms-file-error]').textContent,formsLoadText(JSON.stringify(Object.assign({},file,{form:'invoice',label:'Invoice'}))),document.querySelector('[data-forms-file-error]').textContent];
  const ok=formsLoadText(got.text),size=formsFind(formsDraft().tpl,{part:'every',id:'title'}).size;
  for(let i=0;i<25;i++){formsEdit(t=>{t.parts.every.blocks.find(b=>b.id==='title').size=10+i;});formsSave();}
  return {name:/^form-packing-slip-\d{4}-\d{2}-\d{2}\.json$/.test(got.name),format:[file.format,file.form],bad,ok,size,kept:DB.formVersion.filter(v=>v.form==='packingSlip').length};
 }),{name:true,format:['glass-erp-form','packingSlip'],bad:[false,'Not a form file.',false,'This file is for Invoice.'],ok:true,size:22,kept:20});
 eq('Forms: table columns — a list on the right; width, hide, add, order; a click on the list or on the sheet opens the column; the packing slip prints that way',await t.p.evaluate(()=>{
  DB.formTemplate={};feOpen();feClick('[data-forms-columns="table"]');
  const list=[...document.querySelectorAll('[data-forms-col]')].map(r=>r.dataset.formsCol);
  const heads=()=>{const pg=shippingPages(shippingFormSample(),null,formsDraft().tpl)[0];const y=pg.items.find(i=>i.s==='Line / Mark').y;return pg.items.filter(i=>i.t==='text'&&i.y===y).map(i=>i.s+'@'+Math.round(i.x));};
  feClick('[data-forms-col="makeup"]');const open=document.querySelector('[data-forms-col-label]').value;
  const w=document.querySelector('[data-forms-col-width]');w.value='50';w.dispatchEvent(new Event('change'));const mk=formsDraft().tpl.parts.table.columns.find(c=>c.k==='makeup');
  feClick('[data-forms-col-hide]');const hid=heads();
  feClick('.fm-back');const add=document.querySelector('[data-forms-col-add]');add.value='weight';add.dispatchEvent(new Event('change'));
  formsColMove('table','skid','line');const after=heads();
  feDrag('table|col:size',0,0);
  return {list,open,mk:[Math.round(mk.cw*25.4/72),mk.w],hid:hid.some(x=>x.startsWith('Makeup')),after,clicked:document.querySelector('[data-forms-col-label]').value};
 }),{list:['line','size','makeup','ordered','before','now','back','skid'],open:'Makeup',mk:[50,135.73],hid:false,
  after:['Skid@62','Line / Mark@123','Size@204','Ordered@340','Before@378','Now@412','Back order@466','Weight kg@511'],clicked:'Size'});
 eq('Forms: page margins — the triangles on the ruler move Left blocks and the table; a guide from the ruler; a Free block sticks to it; a guide dragged off the sheet goes; guides do not print',await t.p.evaluate(()=>{
  feOpen();const sheet=()=>document.querySelector('[data-forms-page="0"]'),k=()=>612/sheet().getBoundingClientRect().width;
  const drag=(sel,dx,dy)=>{const el=document.querySelector(sel),r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,o={bubbles:true,pointerId:9,button:0,clientX:x,clientY:y},st=document.querySelector('[data-forms-stage]');
   el.dispatchEvent(new PointerEvent('pointerdown',o));st.dispatchEvent(new PointerEvent('pointermove',Object.assign({},o,{clientX:x+dx,clientY:y+dy})));st.dispatchEvent(new PointerEvent('pointerup',Object.assign({},o,{clientX:x+dx,clientY:y+dy})));};
  drag('[data-forms-margin="left"]',18/k(),0);const left=formsDraft().tpl.page.margin.left;
  const pg=shippingPages(shippingFormSample(),null,formsDraft().tpl)[0],co=pg.items.find(i=>i.s==='Line / Mark');
  const r=sheet().getBoundingClientRect(),ruler=document.querySelector('[data-forms-ruler="x"]'),gx=r.left+300/k(),o={bubbles:true,pointerId:11,button:0,clientX:gx,clientY:r.top-6},st=document.querySelector('[data-forms-stage]');
  ruler.dispatchEvent(new PointerEvent('pointerdown',o));st.dispatchEvent(new PointerEvent('pointermove',Object.assign({},o,{clientY:r.top+200})));st.dispatchEvent(new PointerEvent('pointerup',Object.assign({},o,{clientY:r.top+200})));
  const guide=formsDraft().tpl.guides.x[0];
  feDrag('every|title',0,0);formsPlace('free');const b=formsFind(formsDraft().tpl,{part:'every',id:'title'});b.x=200;formsStageRefresh();
  feDrag('every|title',(298-200)/k(),0);const snapped=formsFind(formsDraft().tpl,{part:'every',id:'title'}).x;
  const withG=JSON.stringify(shippingPages(shippingFormSample(),null,formsDraft().tpl)),noG=formsClone(formsDraft().tpl);delete noG.guides;const same=withG===JSON.stringify(shippingPages(shippingFormSample(),null,noG));
  drag('[data-forms-guide="x0"]',0,-r.height);const gone=!formsDraft().tpl.guides;
  return {left:Math.round(left),table:Math.round(co.x),guide:Math.round(guide),snapped,same,gone,clean:formClean({page:{margin:{left:'54',top:-5}},guides:{x:[300,'oops',9999]},parts:{}},shippingFormDefault()).page.margin.left};
 }),{left:54,table:59,guide:300,snapped:300,same:true,gone:true,clean:54});
 eq('Forms: My fields — added in Data → Company, inserted from the My fields group, printed with the company value; Totals sums the lines',await t.p.evaluate(()=>{
  DB.formTemplate={};DB.company.myFields=[];navGo('masterdata');mdSection='print';mdSetTab('company');render();
  feClick('[data-company-myfield-add]');const row=document.querySelector('.doc-myfield'),[n,v]=row.querySelectorAll('input');n.value='WSIB No.';n.dispatchEvent(new Event('change'));
  document.querySelector('.doc-myfield').querySelectorAll('input')[1].value='1234567';document.querySelector('.doc-myfield').querySelectorAll('input')[1].dispatchEvent(new Event('change'));
  const stored=DB.company.myFields.map(f=>[f.name,f.value]);
  feOpen();feClick('[data-forms-part="totals"]');feClick('[data-forms-add="field"]');[...document.querySelectorAll('.fm-groups .fm-pick')].find(b=>b.textContent==='My fields').click();
  const shown=[...document.querySelectorAll('.fm-fields .fm-pick')].map(b=>b.textContent);document.querySelector('.fm-fields .fm-pick').click();feClick('[data-forms-insert]');
  feClick('[data-forms-add="field"]');[...document.querySelectorAll('.fm-groups .fm-pick')].find(b=>b.textContent==='Totals').click();const totals=[...document.querySelectorAll('.fm-fields .fm-pick span')].map(b=>b.textContent);
  feClick('[data-forms-field="total.weight"]');feClick('[data-forms-insert]');
  const txt=()=>feText(shippingPages(shippingFormSample(),null,formsDraft().tpl));const before=txt();DB.company.myFields[0].value='7654321';
  return {stored,shown,totals,printed:[before.includes('1234567'),before.includes('60.0'),txt().includes('7654321')]};
 }),{stored:[['WSIB No.','1234567']],shown:['WSIB No.1234567'],totals:['Units on this slip','Ordered','Back order','Weight kg','Lines','Skids'],printed:[true,true,true]});
 eq('Forms: Show if — a block prints only when its condition holds (Method is Delivery, a field is filled)',await t.p.evaluate(()=>{
  DB.formTemplate={};feOpen();feClick('[data-forms-part="totals"]');feClick('[data-forms-add="text"]');const sel=formsUi.sel;
  const ta=document.querySelector('[data-forms-text]');ta.value='Call the site before delivery';ta.dispatchEvent(new Event('change'));
  const w=document.querySelector('[data-forms-show]');w.value='is';w.dispatchEvent(new Event('change'));
  const f=document.querySelector('[data-forms-show-field]');f.value='method';f.dispatchEvent(new Event('change'));
  const v=document.querySelector('[data-forms-show-value]');v.value='delivery';v.dispatchEvent(new Event('change'));
  const doc=m=>Object.assign(shippingFormSample(),{method:m}),pages=m=>shippingPages(doc(m),null,formsDraft().tpl),has=m=>feText(pages(m)).includes('Call the site before delivery');
  const b=formsClone(formsFind(formsDraft().tpl,sel)),cond={delivery:has('delivery'),pickup:has('pickup')};
  formsShow('when','filled');formsShow('field','note');const filled=[feText(shippingPages(Object.assign(shippingFormSample(),{note:''}),null,formsDraft().tpl)).includes('Call the site before delivery'),feText(shippingPages(Object.assign(shippingFormSample(),{note:'Gate code 12'}),null,formsDraft().tpl)).includes('Call the site before delivery')];
  formsShow('when','');
  return {show:b.show,delivery:cond.delivery,pickup:cond.pickup,filled,always:!formsFind(formsDraft().tpl,sel).show,clean:formCleanBlock({type:'text',y:0,show:{when:'is',field:'method',value:'Delivery'}}).show};
 }),{show:{when:'is',field:'method',value:'delivery'},delivery:true,pickup:false,filled:[false,true],always:true,clean:{when:'is',field:'method',value:'Delivery'}});
 eq('Forms: a broken saved form is cleaned — unknown blocks and keys dropped, numbers kept in range, missing parts and table columns from the default',await t.p.evaluate(()=>{
  const def=shippingFormDefault(),bad={parts:{every:{h:'90',blocks:[{type:'script',y:1},{type:'text',text:'Hi',y:5,size:999,onclick:'x',place:'nowhere'},{type:'image',src:'javascript:alert(1)',y:0,w:10,h:10}]},table:{columns:[]}}};
  const c=formClean(bad,def);
  return {every:c.parts.every.blocks.map(b=>[b.type,b.size,b.place,b.onclick,b.src]),h:c.parts.every.h,cols:c.parts.table.columns.length,totals:c.parts.totals.blocks.length===def.parts.totals.blocks.length,json:JSON.stringify(JSON.parse(JSON.stringify(c)))===JSON.stringify(c)};
 }),{every:[['text',96,'left',null,null],['image',null,'left',null,null]],h:90,cols:8,totals:true,json:true});
 eq('Forms browser errors',t.errs,[]);await t.c.close();
};
