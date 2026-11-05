/* Этап 7: шаблон бланка из блоков (erp/documents/forms). Первая форма —
   Packing slip; его шаблон по умолчанию печатает то же, что прежний код
   (сверено на выгрузках владельца и симуляции цеха 05.11.2026). */
module.exports=async function({page,eq}){
 console.log('forms');const t=await page();
 await t.p.evaluate(()=>{
  window.fmTpl=parts=>({page:{w:612,h:792,margin:{top:30,right:36,bottom:67,left:36}},parts});
  window.fmCtx=v=>({field:k=>v[k]});
  window.fmTexts=pages=>pages.map(P=>P.items.filter(i=>i.t==='text').map(i=>i.s+'@'+i.x+','+i.y));
 });
 eq('Forms: a growing field pushes blocks under it, an empty one pulls them up; side by side the taller one wins',await t.p.evaluate(()=>{
  const blocks=[{type:'field',field:'a',y:10,w:200,h:10,size:8,lh:10},{type:'field',field:'b',place:'right',y:10,w:200,h:10,size:8,lh:10},{type:'text',text:'Below',y:30,w:200,h:10,size:8,lh:10}];
  const run=v=>{const f=formFlow(fmTpl({every:{h:40,blocks}}),fmCtx(v));f.page();return {texts:f.P.items.filter(i=>i.s==='Below').map(i=>i.y)[0],next:f.y};};
  return {one:run({a:'x',b:'y'}),three:run({a:['1','2','3'],b:'y'}),both:run({a:['1','2'],b:['1','2','3','4']}),none:run({a:'',b:''})};
 }),{one:{texts:60,next:70},three:{texts:80,next:90},both:{texts:90,next:100},none:{texts:50,next:60}});
 eq('Forms: Left, Center, Right follow the page margins; Free keeps its own X',await t.p.evaluate(()=>{
  const b=place=>({type:'text',text:place,place,x:100,y:10,w:100,h:10,size:8});
  const f=formFlow(fmTpl({every:{h:20,blocks:['left','center','right','free'].map(b)}}),fmCtx({}));f.page();
  return f.P.items.map(i=>i.s+' '+i.x);
 }),['left 36','center 256','right 476','free 100']);
 eq('Forms: fields inside a label, a fallback for an empty field, page numbers at the end',await t.p.evaluate(()=>{
  const f=formFlow(fmTpl({every:{h:20,blocks:[{type:'text',text:'{name} · Page {page} of {pages}',y:10,w:300,h:10,size:8}]},bottom:{h:67,blocks:[{type:'text',text:'{number|No number} · {page} / {pages} · {unknown}',place:'right',align:'right',y:41,w:300,h:13,size:8}]}}),fmCtx({name:'Glass',number:''}));
  f.page();f.page();f.page();return fmTexts(f.finish());
 }),[['Glass · Page 1 of 3@36,40','No number · 1 / 3 · {unknown}@576,766'],['Glass · Page 2 of 3@36,40','No number · 2 / 3 · {unknown}@576,766'],['Glass · Page 3 of 3@36,40','No number · 3 / 3 · {unknown}@576,766']]);
 eq('Forms: a part in the flow starts on a new page without room for keep, then breaks only between lines; the page top repeats',await t.p.evaluate(()=>{
  const tpl=fmTpl({every:{h:20,blocks:[{type:'text',text:'TOP',y:10,w:100,h:10,size:8,lh:10}]},totals:{h:28,keep:100,blocks:[{type:'field',field:'list',y:0,w:300,h:14,size:8,lh:14},{type:'text',text:'Sign',y:14,w:300,h:14,size:8,lh:14}]}});
  const run=(y,n)=>{const f=formFlow(tpl,fmCtx({list:Array.from({length:n},(x,i)=>'L'+(i+1))}));f.page();f.y=y;f.flow('totals');return fmTexts(f.finish()).map(p=>p.join(' '));};
  const long=run(50,50);
  return {fits:run(600,2),moves:run(640,2),long:[long.length,long[1].split(' ')[0],long.at(-1).split(' ').slice(-2)]};
 }),{fits:['TOP@36,40 L1@36,600 L2@36,614 Sign@36,628'],moves:['TOP@36,40','TOP@36,40 L1@36,50 L2@36,64 Sign@36,78'],long:[2,'TOP@36,40',['L50@36,64','Sign@36,78']]});
 eq('Forms: line, box, image and barcode blocks; an empty barcode draws nothing and keeps its place',await t.p.evaluate(()=>{
  const jpeg='data:image/jpeg;base64,'+btoa(String.fromCharCode(0xFF,0xD8,0xFF,0xC0,0,11,8,0,10,0,20,3,0,0,0,0));
  const blocks=[{type:'line',y:0,w:540,h:0,lw:1},{type:'box',place:'right',y:4,w:100,h:20,r:3},{type:'image',field:'logo',y:4,w:40,h:20},{type:'barcode',field:'code',place:'right',align:'right',y:30,w:200,h:30},{type:'text',text:'After',y:70,w:100,h:10,size:8}];
  const run=code=>{const f=formFlow(fmTpl({every:{h:80,blocks}}),fmCtx({logo:jpeg,code}));f.page();return f.P.items;};
  const a=run('PS-0001'),b=run(''),bars=a.filter(i=>i.t==='rect'&&i.fill==='#000000');
  return {kinds:[...new Set(a.map(i=>i.t))],bars:bars.length>10,right:Math.round(bars.at(-1).x+bars.at(-1).w),noBars:b.filter(i=>i.fill==='#000000').length,after:b.find(i=>i.s==='After').y};
 }),{kinds:['line','rect','img','text'],bars:true,right:576,noBars:0,after:100});
 eq('Forms: Times and Courier — widths from the Adobe font tables, lines wrap by the chosen font; SVG and PDF use that font, a Helvetica-only PDF stays as it was',await t.p.evaluate(()=>{
  const r=v=>Math.round(v*100)/100,t='Received by the customer in good order';
  const P=docPage();P.text(10,20,'A',{face:'times-i',bold:true});P.text(10,40,'B',{face:'courier'});P.text(10,60,'C',{});
  const svg=docPageSVG(P),pdf=String.fromCharCode(...docPdfBytes([P],{date:'20261105000000'})),plain=docPage();plain.text(10,20,'C',{});const pdf0=String.fromCharCode(...docPdfBytes([plain],{date:'20261105000000'}));
  return {w:[r(docTextWidth('Hello',10,false)),r(docTextWidth('Hello',10,false,0,'times')),r(docTextWidth('Hello',10,true,0,'times-i')),r(docTextWidth('Hello',10,false,0,'courier')),r(docTextWidth('Hello',10,false,0,'helvetica-i'))],
   wrap:['','times','courier'].map(f=>docWrap(t,9,false,150,f).length),item:P.items.map(i=>i.face||''),
   svg:[/font-family="Times[^"]*" font-style="italic" font-weight="700"/.test(svg),/font-family="Courier/.test(svg),(svg.match(/font-family=/g)||[]).length],
   pdf:['/Times-BoldItalic','/Courier ','/F3','/F4'].map(x=>pdf.includes(x)),plain:['Times','Courier','Oblique','/F3'].some(x=>pdf0.includes(x))};
 }),{w:[22.78,22.22,22.78,30,22.78],wrap:[2,1,2],item:['times-i','courier',''],svg:[true,true,3],pdf:[true,true,true,true],plain:false});
 eq('Packing slip: the default template is plain data (can be saved and loaded), its parts and every block type it uses',await t.p.evaluate(()=>{
  const tpl=shippingFormDefault();
  return {same:JSON.stringify(JSON.parse(JSON.stringify(tpl)))===JSON.stringify(tpl),parts:Object.keys(tpl.parts),types:[...new Set(Object.values(tpl.parts).flatMap(p=>(p.blocks||[]).map(b=>b.type)))],columns:tpl.parts.table.columns.map(c=>c.label),fields:SHIPPING_FORM_FIELDS.every(x=>x.label&&/^[\x20-\x7e]+$/.test(x.label))};
 }),{same:true,parts:['every','first','table','totals','skidTop','skidTable','bottom'],types:['field','barcode','text','box'],columns:['Line / Mark','Size','Makeup','Ordered','Before','Now','Back order','Skid'],fields:true});
 eq('Forms browser errors',t.errs,[]);await t.c.close();
};
