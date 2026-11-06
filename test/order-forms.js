/* Этап 7: бланки заказа на шаблоне конструктора форм (erp/documents/
   order-form). Шаблон по умолчанию печатает те же листы, что прежняя
   раскладка docLayout (сверка 06.11.2026 на выгрузке владельца и симуляции
   цеха — 0 расхождений); галочки ✎ Customize строятся из блоков шаблона. */
module.exports=async function({page,eq}){
 console.log('order-forms');const t=await page();
 await t.p.evaluate(()=>{
  window.ofTpl=parts=>({page:{w:612,h:792,margin:{top:30,right:36,bottom:67,left:36}},parts});
  window.ofCtx=(v,more)=>Object.assign({field:k=>v[k]},more||{});
  window.ofJpeg='data:image/jpeg;base64,'+btoa(String.fromCharCode(0xFF,0xD8,0xFF,0xC0,0,11,8,0,30,0,90,3,0,0,0,0));
  /* Заказ с ценами руками (как test/documents): 14 строк — два листа. */
  window.ofOrder=(n,kind)=>{
   tab='sales';salesOrderNew(kind);salesSetUnitType('double');
   const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');
   m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;p.priceOverride=5.55;p.heatTreatmentId='HT-FT';});
   m.cavities.forEach(c=>{c.priceOverride=3.1;});
   soDraft.lines=[];
   for(let i=0;i<n;i++){const l=normalizeSalesOrderLine({makeupId:m.id,width16:(30+i)*16,height16:(40+i)*16,qty:1+i%3,mark:'W-'+(i+1)});soDraft.lines.push(l);salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});}
   soDraft.businessNumber='T-200';soDraft.customerPo='PO-7';soDraft.dueDate='2026-11-20';soDraft.notes='Rear entrance. '.repeat(30);
   return soDraft;
  };
  window.ofSer=pages=>JSON.stringify(pages.map(P=>P.items.map(i=>{const x=Object.assign({},i);delete x.pageLabel;return x;})),(k,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v);
 });
 eq('Order forms: Pin keeps a block in place, Space after pushes the blocks below, a field after a picture starts after it and keeps its right edge, No. stands right before the number',await t.p.evaluate(()=>{
  const blocks=[{id:'logo',type:'image',field:'logo',y:0,w:130,h:40,fit:true},{id:'name',type:'field',field:'name',after:'logo',gap:10,y:10,w:330,h:10,lh:10,size:8,fit:true},
   {id:'lines',type:'field',field:'lines',y:20,w:200,h:10,lh:10,sa:8,size:8},{id:'num',type:'field',field:'num',place:'right',pin:true,y:20,w:200,h:10,lh:10,size:10,bold:true,align:'right'},
   {id:'no',type:'text',text:'No.',place:'right',pin:true,before:'num',gap:3,y:20,w:40,h:10,lh:10,size:8,align:'right'},{id:'below',type:'text',text:'Below',y:38,w:100,h:10,lh:10,size:8}];
  const run=(v)=>{const f=formFlow(ofTpl({every:{h:40,blocks}}),ofCtx(v));f.page();const it=s=>f.P.items.find(i=>i.s===s)||{};return {name:it('Glass').x,img:(f.P.items.find(i=>i.t==='img')||{}).w,num:it('7').y,no:Math.round(it('No.').x*100)/100,below:it('Below').y};};
  return {logo:run({logo:ofJpeg,name:'Glass',lines:['a','b','c'],num:'7'}),none:run({logo:'',name:'Glass',lines:['a'],num:'7'}),fit:docFit('W'.repeat(60),8,false,330-(40*3+10)).length<docFit('W'.repeat(60),8,false,330).length,noX:Math.round((576-docTextWidth('7',10,true)-3)*100)/100};
 }),{logo:{name:166,img:120,num:50,no:567.44,below:88},none:{name:36,num:50,no:567.44,below:68},fit:true,noX:567.44});
 eq('Order forms: in the flow a heading keeps with the first lines of the text under it, Lead puts the line under its top; a section is drawn by the form code and an empty one takes no place',await t.p.evaluate(()=>{
  const tpl=ofTpl({every:{h:10,blocks:[]},totals:{h:60,keep:0,blocks:[{id:'s',type:'section',k:'box',y:0,w:540,h:20},{id:'l',type:'text',text:'NOTES',y:33,w:540,h:16,lh:16,lead:13,keep:2,size:6},{id:'n',type:'field',field:'n',y:44,w:540,h:10,lh:10,lead:8,size:8}]}});
  const run=(y,lines,sec)=>{const f=formFlow(tpl,ofCtx({n:lines},{section:k=>sec?{h:20,draw:(P,yy)=>P.rect(36,yy,540,20,{})}:null}));f.page();f.y=y;f.flow('totals');return f.finish().map(P=>P.items.map(i=>i.t==='rect'?'R@'+i.y:i.s+'@'+Math.round(i.y*10)/10).join(' '));};
  return {fits:run(640,['a','b'],true),label:run(677,['a','b'],true),one:run(677,['a'],true),noSec:run(661,['a','b'],false)};
 }),{fits:['R@640 NOTES@673 a@684 b@694'],label:['R@677','NOTES@53 a@64 b@74'],one:['R@677 NOTES@710 a@721'],noSec:['NOTES@674 a@685 b@695']});
 eq('Order forms: Quote, Proforma, Order confirmation and Invoice print from their forms and the sheets are the same as before (one and two pages, every price mode, notes and terms)',await t.p.evaluate(()=>{
  const keep=JSON.parse(JSON.stringify(DB.company));DB.company.termsText='Terms. '.repeat(120);DB.company.logo=ofJpeg;
  const out={};
  DOC_FORM_KINDS.filter(k=>k!=='workOrder').forEach(kind=>[1,14].forEach(n=>{const o=ofOrder(n);['full','split','glass','unit','none'].forEach(mode=>{
   const all=Object.fromEntries(docFieldsFor(kind).map(f=>[f.k,true]));
   [docBaseOptions(kind),Object.assign(all,{priceMode:mode})].forEach((opts,i)=>{const m=docBuildModel(kind,o,Object.assign({},opts,{totalsTop:false})),a=ofSer(docLayout(m)),b=ofSer(docPages(m));out[kind+n+mode+i]=a===b?JSON.parse(a).length:'differs';});
  });}));
  const v=Object.values(out);DB.company=keep;
  return {cases:v.length,differ:v.filter(x=>x==='differs').length,many:Math.max(...v)>1,kinds:DOC_FORM_KINDS};
 }),{cases:80,differ:0,many:true,kinds:['quote','proforma','confirmation','invoice','workOrder']});
 eq('Work order: the route shows each glass status from station scans — done ✓, here now with how many and on which dolly or skid (— when on nothing), part done 3/4, not yet; Shipping ready and Ship at the end; broken and a Recut row under it',await t.p.evaluate(()=>{
  const o=ofOrder(1),l=o.lines[0],P=(id,unit,route,far,waiting,on,extra)=>Object.assign({id,g:{c:{index:0}},unit,place:{route,far,waiting,shipped:far===route.length-1},scans:[{at:'2026-11-01T10:00:00Z',on}]},extra||{});
  const R=['CUT','ARRIS','IGU','SHIPR','SHIP'],ps=[P('G1','1',R,1,'IGU','DL-57'),P('G2','2',R,2,'SHIPR',''),P('G3','3',R,3,'SHIP','SA-17'),P('G4','4',R,4,'','SA-17'),P('G5','5',R,0,'ARRIS','',{place:{route:R,far:0,waiting:'',broken:true}}),P('G6','R1.1',R,0,'ARRIS','DL-9')];
  const it={lites:[{label:'Lite 1',glass:'4CLEAR · AN',chips:[{code:'CUT',text:''},{code:'ARRIS',text:''},{code:'IGU',text:''}]}],info:'6.4 ft²'};
  docScanStatus(it,{lines:new Map([[l.id,ps]]),ps:new Map([['G3','PS-0021']])},o,l);
  const pick=x=>x.chips.map(c=>c.code+(c.done?'✓':'')+(c.tag?' '+c.tag:'')+(c.here?' '+c.here:''));
  return {main:pick(it.lites[0]),broken:it.lites[0].broken,recut:[it.lites[1].label,pick(it.lites[1])],info:it.info};
 }),{main:['CUT✓','ARRIS✓','IGU 1 · DL-57','SHIPR 1 · —','SHIP 1 · SA-17 · PS-0021'],broken:1,recut:['Recut 1',['CUT✓','ARRIS 1 · DL-9','IGU','SHIPR','SHIP']],info:'In work · 6.4 ft²'});
 eq('Work order: barcode of the number, Required with the weekday, Entered by; IGU units, single lites and panels apart, kg and lb; every page says what is done up to it and when it was printed',await t.p.evaluate(()=>{
  const o=ofOrder(14);o.dueDate='2026-11-20';const m=docBuildModel('workOrder',o),pages=docPages(m),texts=P=>P.items.filter(i=>i.t==='text').map(i=>i.s);
  return {cells:m.meta.map(c=>c.label),required:m.meta.find(c=>c.label==='Required').value,summary:m.summary.map(c=>c.label),lb:/kg · [\d,]+ lb$/.test(m.summary[4].value),
   bars:pages[0].items.filter(i=>i.t==='rect'&&i.fill==='#000000').length>10,upto:[...new Set(pages.map(P=>texts(P).filter(s=>/^Up to this page: \d+ units · \d+ panels/.test(s)).length))],many:pages.length>1,printed:pages.every(P=>texts(P).some(s=>/Printed .* · status from station scans at print time/.test(s))),
   last:texts(pages.at(-1)).find(s=>/^Up to this page/.test(s))===('Up to this page: '+m.lineTotals.reduce((n,x)=>n+x.units,0)+' units · '+m.lineTotals.reduce((n,x)=>n+x.panels,0)+' panels · '+docNum(m.lineTotals.reduce((n,x)=>n+x.area,0),1)+' ft² · '+docNum(m.lineTotals.reduce((n,x)=>n+x.kg,0),0)+' kg')};
 }),{cells:['Order date','Customer PO','Required','Priority','Delivery','Entered by'],required:'Fri, Nov 20, 2026',summary:['IGU units','Single lites','Panels (glass)','Total area','Total weight','Required'],lb:true,bars:true,upto:[1],many:true,printed:true,last:true});
 eq('Order forms: ✎ Customize ticks come from the form blocks — a removed section takes its ticks away, an added block is a tick of its own; unticked it does not print; Save as default keeps it',await t.p.evaluate(()=>{
  ofOrder(1,'quote');docOpen('quote');docState.panel=true;render();
  const ticks=()=>[...document.querySelectorAll('.doc-panel [data-doc-field]')].map(i=>i.dataset.docField+(i.checked?'':'-'));
  const base=ticks();
  const tpl=docFormDefault('quote');tpl.parts.head.blocks=tpl.parts.head.blocks.filter(b=>b.id!=='meta');
  tpl.parts.totals.blocks.push({id:'thanks',type:'text',text:'Thank you, {customer}!',place:'left',y:250,w:300,h:12,lh:12,size:9});
  DB.formTemplate={quote:tpl};render();
  const now=ticks(),texts=()=>docCurrentPages().flatMap(P=>P.items.filter(i=>i.t==='text').map(i=>i.s));
  const printed=texts().some(s=>/^Thank you, /.test(s)),cells=texts().includes('VALID UNTIL');
  docSetOption('b:thanks',false);const off=texts().some(s=>/^Thank you, /.test(s)),box=document.querySelector('[data-doc-field="b:thanks"]').checked;
  docSaveDefault();const saved=DB.documentSettings.quote['b:thanks'];docOpen('quote');const again=docState.opts['b:thanks'];
  DB.formTemplate={};DB.documentSettings={};docClose();
  return {base:['date','validUntil','customerPo','billTo'].every(k=>base.includes(k)),gone:['date','validUntil','customerPo','dueDate','terms','currency'].filter(k=>now.includes(k)),kept:['company','billTo','totals','signature'].every(k=>now.includes(k)),added:now.slice(-1)[0],printed,cells,off,box,saved,again};
 }),{base:true,gone:[],kept:true,added:'b:thanks',printed:true,cells:false,off:false,box:false,saved:false,again:false});
 eq('Order forms: Data → Company & print → Forms has Quote — parts of the sheet, the lines table set in ✎ Customize, a section shows only its place; Insert field has the quote values',await t.p.evaluate(()=>{
  soDraft=null;tab='masterdata';mdTab='forms';formsSetForm('quote');render();
  const parts=[...document.querySelectorAll('[data-forms-part]')].map(b=>b.querySelector('span').textContent);
  const forms=[...document.querySelectorAll('.fm-forms button')].map(b=>b.textContent),lines=!!document.querySelector('[data-forms-lines]');
  formsSelect('totals','end');const set=document.querySelector('[data-forms-settings]'),sec={note:/Drawn by the program/.test(set.textContent),place:!!set.querySelector('[data-forms-num="y"]')&&!set.querySelector('[data-forms-num="w"]')&&!/Center/.test(set.textContent)};
  formsAdd('field');const groups=[...document.querySelectorAll('.fm-groups button')].map(b=>b.textContent);formsModalSet('group','Totals');const total=(document.querySelector('[data-forms-field="total.grand"] em')||{}).textContent;formsModalClose();
  const sheet=document.querySelector('[data-forms-page="0"] svg').textContent;
  return {forms,parts,lines,sec,groups,total:/^\$[\d,]+\.\d\d$/.test(total||''),sheet:/QUOTE/.test(sheet)};
 }),{forms:['Packing slip','Quote','Proforma invoice','Order confirmation','Invoice','Work order','Receipt','Statement','Purchase order','Trip sheet','Drawing','Dolly / Skid sheet','Dolly / Skid label'],parts:['Page 1 header','Page header','Lines table','After lines','Page footer'],lines:true,sec:{note:true,place:true},groups:['Company','Document','Order','Customer','Totals','My fields','Page'],total:true,sheet:true});
 eq('Receipt and Statement print from their forms — the same sheets as before (a table over two pages, an empty table, notes and totals)',await t.p.evaluate(()=>{
  const keep=JSON.parse(JSON.stringify(DB.company));DB.company.logo=ofJpeg;
  const model=(kind,n)=>{const m=finDocBase(kind==='receipt'?'PAYMENT RECEIPT':'STATEMENT',kind==='receipt'?'Receipt':'Statement','R-7',null);m.kind=kind;if(kind==='statement'){m.numberLabel='Account';m.footerRight='October 2026';}
   m.meta=[{label:'Date',value:'Oct 9, 2026'},{label:'Currency',value:'CAD'}];m.boxes=[{label:'Received from',title:'Sample Customer',lines:['10 Glass St, Toronto']}];
   m.sections=[{title:'Orders',empty:'No orders.',cols:[{label:'Order',x:36,w:80,bold:true},{label:'Amount',x:576,w:90,align:'right'}],rows:Array.from({length:n},(x,i)=>({due:i%3===0,cells:['1000'+i,'$'+i+'.00']}))},{title:'Activity',empty:'',cols:[{label:'Date',x:36,w:58}],rows:[]}];
   m.end={left:[{label:'Note',text:'Thank you. '.repeat(20)}],rows:[{label:'Applied',value:'$1.00'}],grand:{label:'Amount received',value:'$1.00'}};return m;};
  const out=[];['receipt','statement'].forEach(k=>[0,3,70].forEach(n=>{const m=model(k,n);out.push(ofSer(finDocLayout(m))===ofSer(finDocPages(m))?JSON.parse(ofSer(finDocPages(m))).length:'differs');}));
  DB.company=keep;return out;
 }),[1,1,2,1,1,2]);
 eq('Purchase order, Delivery request and Trip sheet print from their forms: a block added in Forms prints on every page; a PO note too long for the page carries the table heading over, as before',await t.p.evaluate(()=>{
  const p=purOrderClean({number:'PO-0042',supplierName:'Cardinal',currency:'CAD',date:'2026-11-01',note:'Unload at door 3. '.repeat(400),lines:[{description:'Clear 6mm',qty:2,unit:'block'}]});
  const add=(form,part,def)=>{const t=def();t.parts[part].blocks.push({id:'stampX',type:'text',text:'CHECKED',place:'right',pin:true,y:2,w:100,h:8,lh:8,size:6,align:'right'});DB.formTemplate=Object.assign({},DB.formTemplate,{[form]:t});};
  add('purchaseOrder','every',purFormDefault);add('tripSheet','every',deliveryFormDefault);
  const marks=pages=>pages.map(P=>P.items.filter(i=>i.s==='CHECKED').length),po=purDocPages(p,{}),req=purRequestPages({number:'DR-1',poId:'',lines:[],note:''},{}),trip=deliveryPages('2026-11-06','');
  const heads=po.slice(1).map(P=>P.items.some(i=>i.s==='DESCRIPTION'));DB.formTemplate={};
  return {po:[...new Set(marks(po))],pages:po.length>1,heads:[...new Set(heads)],req:marks(req),reqTitle:req[0].items.some(i=>i.s==='DELIVERY REQUEST'),trip:marks(trip),stops:trip[0].items.some(i=>i.s==='No stops')};
 }),{po:[1],pages:true,heads:[true],req:[1],reqTitle:true,trip:[1],stops:true});
 eq('Order forms: New form — a copy prints the same as its form, a blank one only the lines; both are tabs in Documents next to their form; Delete removes the form',await t.p.evaluate(()=>{
  formsUi=null;DB.formTemplate={};DB.formCustom=[];DB.formVersion=[];navGo('masterdata');mdSection='print';mdSetTab('forms');formsSetForm('confirmation');
  formsNewOpen();const from=formsUi.newForm.from;formsNewSet('name','Confirmation · short');formsNewCreate();const copy=DB.formCustom[0].k;
  const pill=[...document.querySelectorAll('.fm-forms .sl-quick-pill')].map(b=>b.textContent).includes('Confirmation · short'),rename=!!document.querySelector('[data-forms-rename]');
  formsNewOpen();formsNewSet('name','Bare');formsNewSet('base','workOrder');formsNewCreate();const bare=DB.formCustom[1].k;
  const o=ofOrder(2);docOpen(copy);const st=[docState.kind,docState.form===copy],tabs=[...document.querySelectorAll('.doc-kinds button')].map(b=>b.textContent);
  const strip=P=>JSON.stringify(P.map(p=>p.items.filter(i=>i.t==='text').map(i=>i.s)));
  const same=strip(docCurrentPages())===strip(docPages(docBuildModel('confirmation',o,docState.opts)));
  docSetKind(bare);const texts=docCurrentPages().flatMap(P=>P.items.filter(i=>i.t==='text').map(i=>i.s));
  docClose();navGo('masterdata');mdSection='print';mdSetTab('forms');formsSetForm(copy);window.confirm=()=>true;formsRemoveForm();
  const left=DB.formCustom.map(f=>f.name),tpl=!!DB.formTemplate[copy];DB.formTemplate={};DB.formCustom=[];DB.formVersion=[];formsUi=null;
  return {from,pill,rename,st,tabs:tabs.filter(x=>/short|Bare/.test(x)),same,bare:{lines:texts.some(s=>/^W-1/.test(s)||s.includes('W-1')),title:texts.some(s=>/WORK ORDER/i.test(s))},left,tpl};
 }),{from:'confirmation',pill:true,rename:true,st:['confirmation',true],tabs:['Confirmation · short','Bare'],same:true,bare:{lines:true,title:false},left:['Bare'],tpl:false});
 eq('Order forms browser errors',t.errs,[]);await t.c.close();
};
