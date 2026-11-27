/* Правки владельца 27.11.2026: Data → Prices видом Catalog (вариант A) и таблицы
   Data в экран; Bird friendly — образец паттерна в середине стекла, крупные W/H,
   «FRIT» один раз; блок QR code в формах; ручки ширины конструктора идут за мышью. */
module.exports=async function({page,eq}){
 console.log('owner 2026-11-27');
 const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));

 eq('Prices: дерево слева (группы клиентов, группы айтемов, инструменты), открытая группа — на всю ширину, строки по середине',await run(()=>{
  const k=salesPriceTargets()[0].key;DB.priceList.push({id:'PLG1',kind:'group',name:'Dealers',customerId:'',rows:[{id:'PLR1',target:k,price:9}]},{id:'PLG2',kind:'group',name:'Builders',customerId:'',rows:[]});
  DB.itemGroup.push({id:'IG1',name:'Edge work',members:[k]});const c=oqCustomer({legalName:'Tree Co'});c.priceGroupId='PLG1';touch();
  navGo('masterdata');mdSetTab('prices');plView='groups';plGroupId='';render();
  const tree=[...document.querySelectorAll('[data-pl-tree] button')].map(b=>b.textContent.trim()),on=document.querySelector('[data-pl-tree] button.on').textContent.trim();
  const title=document.querySelector('[data-pl-title]').textContent,td=document.querySelector('[data-pl-row] td:nth-child(2)'),mid=getComputedStyle(td).verticalAlign;
  document.querySelector('[data-pl-item-group="IG1"]').click();const items=[plView,document.querySelectorAll('[data-pl-member]').length,document.querySelector('[data-pl-title]').textContent];
  document.querySelector('[data-pl-tool="bulk"]').click();const bulk=document.querySelectorAll('[data-pl-bulk-row]').length>0;
  const group=document.querySelector('[data-sl-scope="plBulk"] col[data-cw-col="group"]');
  return {tree,on,title,mid,items,bulk,groupW:group&&parseFloat(group.style.width)>=200,shell:!!document.querySelector('[data-md-prices].md-shell')};
 }),{tree:['Dealers 1','Builders 0','+ Customer group','Edge work 1','+ Item group','Set for customers','Excel'],on:'Dealers 1',title:'Dealers · 1 customers · 1 prices',mid:'middle',
  items:['items',1,'Edge work · 1 items'],bulk:true,groupW:true,shell:true});

 eq('таблица Data шире окна: колонки, что руками не тянули, ужимаются и таблица влезает; не влезет целиком — как была, с прокруткой; выбранная строка подсвечена',await run(()=>{
  const host=document.getElementById('app'),mk=(scope,n)=>{host.innerHTML=`<div style="width:700px"><div class="sales-table-wrap" style="overflow:auto">${slTable(scope,{list:[{id:'a'},{id:'b'}],id:x=>x.id,noun:l=>l.length+' rows',
   columns:()=>[...Array(n)].map((_,i)=>({k:'c'+i,label:'C'+i,type:'text',v:x=>x.id+i})),row:i=>({attrs:i.x.id==='a'?' class="sel"':''})})}</div></div>`;
   const tb=host.querySelector('table.sl-table');salesListFit();const w=tb.closest('.sales-table-wrap');return {fits:tb.offsetWidth<=w.clientWidth+1,wide:tb.offsetWidth>w.clientWidth+1};};
  const five=mk('t27Five',5),many=mk('t27Many',20);
  mk('t27Sel',2);const sel=getComputedStyle(host.querySelector('tr.sel>td')).backgroundColor!==getComputedStyle(host.querySelector('tr:not(.sel)>td')).backgroundColor;
  render();return {five:five.fits,many:many.wide,sel};
 }),{five:true,many:true,sel:true});

 eq('Bird friendly: образец в середине стекла (лист не расширен), W/H 22 pt жирно, первая точка крупная; узкое стекло — образец справа; «FRIT-CER» без второго FRIT',await run(()=>{
  const setup=(w16,h16)=>{tab='sales';salesOrderNew('order');salesSetUnitType('single');const m=soDraft.makeups[0],p=m.panes[0];p.visionType='frit';
   Object.assign(p.frit,{surface:1,pattern:'2 x 2 diamond',color:'White',marginFrom:'Top right',marginW16:16,marginH16:16});
   const l=soDraft.lines[0];l.makeupId=m.id;l.width16=w16;l.height16=h16;salesOrderConfigureShape(0);sView='production';render();
   const doc=new DOMParser().parseFromString(shapeSheetSvg(shapeDraftResult(),false),'image/svg+xml'),sv=doc.documentElement;
   const out={inside:sv.getAttribute('data-frit-inside')==='true',wh:[...doc.querySelectorAll('.frit-setout text[font-size="22"][font-weight="700"]')].map(x=>x.textContent),dot:+doc.querySelector('.frit-first-dot').getAttribute('r')};
   sEdit=null;sDraft=null;salesBridge=null;return out;};
  const sq=setup(480,480),narrow=setup(96,1440);
  const code=salesSheetTreatmentCode([{kind:'frit',spec:{productId:'FRIT-CERAMIC',color:'White'},where:'#1'}]);
  render();return {sq,narrow:narrow.inside,code};
 }),{sq:{inside:true,wh:['W 1″','H 1″'],dot:5},narrow:false,code:'FRIT-CER White #1'});

 eq('QR: квадрат модулей по ISO 18004 (отпечатки проверены сканером macOS), длиннее 213 байт — нет',await run(()=>{
  const fp=m=>{let h=5381;const s=m.map(r=>r.map(c=>c?1:0).join('')).join('|');for(const ch of s)h=((h*33)^ch.charCodeAt(0))>>>0;return m.length+':'+h.toString(36);};
  const finder=m=>[[0,0],[m.length-7,0],[0,m.length-7]].every(([x,y])=>m[y][x]&&m[y+6][x+6]&&!m[y+1][x+1]&&m[y+3][x+3]);
  const list=['1001','SO-76002','SA-10','https://example.com/o/76002','Ünïcode · ½″ стекло','Z'.repeat(213)].map(qrMatrix);
  return {fp:list.map(fp),finder:list.every(finder),long:qrMatrix('Z'.repeat(214)),runs:qrRuns([[true,true,false,true]])};
 }),{fp:['21:wzuwd1','21:pvbzat','21:ld6m5x','29:fgimk4','29:6u0644','57:1klytjo'],finder:true,long:null,runs:[{x:0,y:0,w:2},{x:3,y:0,w:1}]});

 eq('блок QR code: в Add рядом с Barcode, поле — как у штрихкода формы, квадрат Size; рисуется на бланке и на наклейке долли',await run(()=>{
  navGo('masterdata');mdTab='forms';formsUi=null;formsState();formsSetForm('workOrder');render();
  const add=[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='+ QR code');formsAdd('qr');
  const s=formsState(),b=formsFind(formsDraft().tpl,s.sel),hit=document.querySelector('.fm-hit.sel').getBoundingClientRect();
  const labels=[...document.querySelectorAll('[data-forms-num]')].map(x=>x.closest('label').querySelector('span').textContent);
  formsSetForm('carrierLabel');render();formsEdit(t=>{const bar=t.parts.label.blocks.find(x=>x.id==='bar');bar.type='qr';bar.w=120;});
  const svg=carrierLabelSVGOf(formsDraft().tpl,'SA-10',null);
  return {add,type:b.type,field:b.field,square:Math.abs(hit.width-hit.height)<1.5,labels:labels.includes('Size, mm')&&!labels.includes('Height, mm'),label:/<path d="M/.test(svg)&&!/<rect x="[\d.]+" y="0" width="[\d.]+" height="110"/.test(svg)};
 }),{add:true,type:'qr',field:'number',square:true,labels:true,label:true});

 eq('конструктор: у Right ручка слева и идёт за мышью, у Center растёт в обе стороны, у штрихкода растягиваются полосы; выбранный блок поверх соседей',await run(()=>{
  navGo('masterdata');mdTab='forms';formsUi=null;formsState();formsSetForm('workOrder');render();
  const drag=(id,px)=>{const s=formsState();s.sel={part:'head',id};render();const hit=document.querySelector(`[data-forms-hit="head|${id}"]`),h=hit.querySelector('.fm-rs.e,.fm-rs.w'),r=h.getBoundingClientRect(),x=r.x+4,y=r.y+4;
   const ev=(type,cx)=>new PointerEvent(type,{bubbles:true,cancelable:true,clientX:cx,clientY:y,pointerId:7,button:0});
   h.dispatchEvent(ev('pointerdown',x));const st=document.querySelector('[data-forms-stage]');for(let i=1;i<=4;i++)st.dispatchEvent(ev('pointermove',x+px*i/4));st.dispatchEvent(ev('pointerup',x+px));
   const r2=document.querySelector(`[data-forms-hit="head|${id}"] .fm-rs`).getBoundingClientRect();return {side:h.classList.contains('w')?'w':'e',moved:Math.round(r2.x+4-x)};};
  const b0=formsFind(formsDraft().tpl,{part:'head',id:'barcode'}),m0=b0.module||1.44;
  const title=drag('title',-40),bar=drag('barcode',-40),b1=formsFind(formsDraft().tpl,{part:'head',id:'barcode'});
  formsEdit(t=>{t.parts.head.blocks.find(x=>x.id==='pageNo').place='center';});const cw0=formsFind(formsDraft().tpl,{part:'head',id:'pageNo'}).w;drag('pageNo',20);
  const sh=document.querySelector('[data-forms-page="0"]'),k=+sh.dataset.w/sh.getBoundingClientRect().width,cw1=formsFind(formsDraft().tpl,{part:'head',id:'pageNo'}).w;
  const z=getComputedStyle(document.querySelector('.fm-hit.sel')).zIndex;
  return {title,bar,wider:b1.module>m0,center:Math.round((cw1-cw0)/(20*k)),z};
 }),{title:{side:'w',moved:-40},bar:{side:'w',moved:-40},wider:true,center:2,z:'3'});

 eq('правки 27.11 без ошибок страницы',t.errs,[]);await t.c.close();
};
