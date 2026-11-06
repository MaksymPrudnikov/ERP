/* Лист скида / долли на конструкторе форм (Data → Forms → Dolly / Skid
   sheet; владелец 06.11.2026: «положим и шаблон скидов доллей»). По
   умолчанию — прежняя разметка и прежний низ страницы; шапка блоками, низ
   страницы — блоки в полях @page, галочки частей, цвета. И «Add to other
   forms» — тот же блок в другие бланки. */
module.exports=async function({page,eq}){
 console.log('carrier-form');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{};
  window.cfSkid=function(){oqReset();DB.formTemplate={};DB.stationScan=[];DB.stationScanSeq=0;DB.carrier=[];DB.carrierSeq={};DB.carrierCols=[];carrierAdd('SL',2);
   const c=oqCustomer({legalName:'Kingsway Renovations'}),id=oqOrder(c);salesDraftDrop();oqThrough(id,'ready');
   shippingAvailable(salesRecord(id)).forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-1';}));return carrierModelOf('SL-1');};
  window.cfPrint=m=>{carrierPrintSheet(m,carrierColsOn([]),{id:'',name:'Ivan'},'SHIPR');const h=document.getElementById('carrierPrintHost'),out={head:h.querySelector('.cs-head').outerHTML,cls:h.querySelector('.cs-sheet').className,
   style:h.querySelector('.cs-sheet').getAttribute('style'),page:document.getElementById('carrierPageStyle').textContent.replace(/Printed [^"]* by/,'Printed X by'),vis:s=>getComputedStyle(h.querySelector(s)).display!=='none'};
   out.shown=['.cs-c-station','.cs-c-weight','.cs-cust','.cs-total'].map(s=>h.querySelector(s)?out.vis(s):null);delete out.vis;carrierPrintCleanup();return out;};
  window.cfSave=edit=>{const t=carrierFormDefault();edit(t);DB.formTemplate=Object.assign({},DB.formTemplate,{carrierSheet:formClean(t,carrierFormDefault())});};
 });
 eq('Dolly / Skid sheet: by default the old sheet — company and address left, SKID CONTENTS and the number right; the footer «Printed … by … at …» and page numbers',await t.p.evaluate(()=>{
  const m=cfSkid(),co=docCompanyBlock(),r=cfPrint(m);
  return {head:r.head===`<div class="cs-head"><div class="cs-co"><b data-raw="">${esc(co.name)}</b>${co.lines.slice(0,2).map(x=>`<div data-raw="">${esc(x)}</div>`).join('')}</div><div class="cs-code"><small>SKID CONTENTS</small><b>SL-1</b>${m.type?`<span>${esc(m.type.label)}</span>`:''}</div></div>`,
   cls:r.cls,page:r.page,shown:r.shown};
 }),{head:true,cls:'cs-sheet',page:'@page carriersheet{margin:10mm 10mm 12mm;@bottom-left{content:"Printed X by Ivan at SHIPR";font:8px Helvetica,Arial,sans-serif;color:#6b7588}@bottom-right{content:"Skid contents · SL-1 · " counter(page) " / " counter(pages);font:8px Helvetica,Arial,sans-serif;color:#6b7588}}@media print{html,body.carrier-printing{background:#ffffff!important}}',shown:[true,true,true,true]});
 eq('Dolly / Skid sheet: a text block in the header, the footer moved to the center with bigger text, hidden weight and total, own colors',await t.p.evaluate(()=>{
  const m=cfSkid();cfSave(t=>{t.parts.head.blocks.push({id:'n',type:'text',text:'Handle with care',place:'center',size:14,bold:true});const f=t.parts.foot.blocks[0];f.place='center';f.size=9;
   Object.assign(t.style,{showWeight:false,showTotal:false,csNavy:'#b42318'});});
  const r=cfPrint(m);
  return {center:/<div class="cs-blk"><span style="font-size:14pt;font-weight:700">Handle with care<\/span><\/div>/.test(r.head),cls:r.cls,navy:/--cs-navy:#b42318/.test(r.style),
   foot:/@bottom-center\{content:"Printed X by Ivan at SHIPR";font:12px Helvetica/.test(r.page),left:/@bottom-left/.test(r.page),shown:r.shown};
 }),{center:true,cls:'cs-sheet cs-no-weight cs-no-total',navy:true,foot:true,left:false,shown:[true,false,true,false]});
 eq('Dolly / Skid sheet in Data → Forms: the live sheet of a skid, parts, the strip panel ticks; Add to other forms puts a block into Drawing and Invoice and saves them',await t.p.evaluate(()=>{
  cfSkid();DB.formTemplate={};DB.formVersion=[];formsUi=null;navGo('masterdata');mdSection='print';mdSetTab('forms');formsSetForm('carrierSheet');
  const live=!!document.querySelector('[data-forms-stage] .cs-sheet'),parts=[...document.querySelectorAll('[data-forms-part]')].map(b=>b.querySelector('span').textContent);
  document.querySelector('[data-forms-part-hit="strip"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));const ticks=[...document.querySelectorAll('[data-cs-show]')].map(e=>e.dataset.csShow);
  formsSelect('head','');formsAddBlock(()=>({type:'field',field:'company.phone',place:'left',size:9}));formsAddToOpen();
  const off=[...document.querySelectorAll('[data-forms-addto-form]')].filter(e=>e.disabled).map(e=>e.dataset.formsAddtoForm);
  formsAddToPick('drawing',true);formsAddToPick('invoice',true);document.querySelector('[data-forms-addto-apply]').click();
  const has=k=>formsSaved(k).parts[k==='drawing'?'head':'head'].blocks.some(b=>b.field==='company.phone');
  return {live,parts,ticks,off,drawing:has('drawing'),invoice:has('invoice'),versions:DB.formVersion.map(v=>v.form+':'+v.note).sort(),notice:formsUi.notice};
 }),{live:true,parts:['Header','Strip','Customer','Table','Total','Page footer'],ticks:['showStation','showSince','showOnIt','showWeight','showPrintedBy'],off:[],drawing:true,invoice:true,
  versions:['drawing:Block added from Dolly / Skid sheet','invoice:Block added from Dolly / Skid sheet'],notice:'Added to Invoice, Drawing'});
 eq('Dolly / Skid label: by default exactly the old label (the same SVG) for every type and a long number; 3 × 4 — its own layout and the 4 × 3 in page; a moved block prints where it stands',await t.p.evaluate(()=>{
  DB.formTemplate={};DB.carrier=[];DB.carrierSeq={};carrierAdd('DL',1);carrierAdd('DA',1);carrierAdd('SL',1);carrierAdd('SA',1);
  const codes=DB.carrier.map(c=>c.code),same=codes.concat(['SL-12345']).map(c=>carrierLabelSVG(c)===carrierLabelLegacySVG(c));
  carrierPrintLabels(['DL-1']);const page4=document.getElementById('stkPageStyle').textContent,dim4=document.querySelector('[data-carrier-label]').getAttribute('style');stkPrintCleanup();
  const t=carrierLabelDefault();t.style.size='3x4';t.parts.small.blocks.find(b=>b.id==='type').y=50;DB.formTemplate={carrierLabel:formClean(t,carrierLabelDefault())};
  carrierPrintLabels(['DL-1']);const page3=document.getElementById('stkPageStyle').textContent,svg=document.querySelector('[data-carrier-label] svg');
  const out={same,page4,dim4,page3,box:svg.getAttribute('viewBox'),size:[svg.getAttribute('width'),svg.getAttribute('height')],typeY:svg.querySelector('text').getAttribute('y')};stkPrintCleanup();DB.formTemplate={};
  return out;
 }),{same:[true,true,true,true,true],page4:'@page stk{size:4in 6in;margin:0}',dim4:'width:4in;height:6in',page3:'@page stk{size:4in 3in;margin:0}',box:'0 0 288 216',size:['4in','3in'],typeY:'50'});
 eq('Dolly / Skid label in Data → Forms: the label on screen, Label size 4 × 6 / 3 × 4 switches the layout; + Barcode is there',await t.p.evaluate(()=>{
  DB.formTemplate={};formsUi=null;navGo('masterdata');mdSection='print';mdSetTab('forms');formsSetForm('carrierLabel');formsSelect('label','');
  const four=[document.querySelector('[data-forms-page]').dataset.w,document.querySelector('[data-forms-page]').dataset.h],hits=document.querySelectorAll('[data-forms-stage] svg [data-forms-hit^="label|"]').length;
  [...document.querySelectorAll('[data-cl-size] button')].find(b=>b.textContent.startsWith('3 × 4')).click();
  const three=[document.querySelector('[data-forms-page]').dataset.w,document.querySelector('[data-forms-page]').dataset.h],small=document.querySelectorAll('[data-forms-stage] svg [data-forms-hit^="small|"]').length;
  return {four,hits,three,small,part:formsUi.part,add:[...document.querySelectorAll('[data-forms-add]')].map(b=>b.textContent)};
 }),{four:['288','432'],hits:4,three:['288','216'],small:4,part:'small',add:['+ Text','+ Field','+ Picture','+ Barcode']});
 eq('Dolly / Skid sheet browser errors',t.errs,[]);await t.c.close();
};
