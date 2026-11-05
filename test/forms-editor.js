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
 }),{tab:['Company','Stickers','Forms'],forms:['Packing slip'],sheets:true,parts:['Page header','First page','Lines table','Totals','Skid sheet','Skid table','Page footer'],add:['+ Text','+ Field','+ Picture','+ Line','+ Frame','+ Barcode'],hits:true,save:true,ruler:true});
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
 eq('Forms: a broken saved form is cleaned — unknown blocks and keys dropped, numbers kept in range, missing parts and table columns from the default',await t.p.evaluate(()=>{
  const def=shippingFormDefault(),bad={parts:{every:{h:'90',blocks:[{type:'script',y:1},{type:'text',text:'Hi',y:5,size:999,onclick:'x',place:'nowhere'},{type:'image',src:'javascript:alert(1)',y:0,w:10,h:10}]},table:{columns:[]}}};
  const c=formClean(bad,def);
  return {every:c.parts.every.blocks.map(b=>[b.type,b.size,b.place,b.onclick,b.src]),h:c.parts.every.h,cols:c.parts.table.columns.length,totals:c.parts.totals.blocks.length===def.parts.totals.blocks.length,json:JSON.stringify(JSON.parse(JSON.stringify(c)))===JSON.stringify(c)};
 }),{every:[['text',96,'left',null,null],['image',null,'left',null,null]],h:90,cols:8,totals:true,json:true});
 eq('Forms browser errors',t.errs,[]);await t.c.close();
};
