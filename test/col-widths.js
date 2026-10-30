/* Пункт 11 (вариант 1 владельца 30.10.2026): ширина колонок за границу
   заголовка и перенос колонки за заголовок — одинаково в Sales и Order Lines,
   ширины у каждой таблицы свои; Order Items — отдельные стёкла по материалам. */
module.exports=async function({page,eq}){
 console.log('col widths · order items');
 const t=await page(undefined,{width:1600,height:900});await require('./optimization-fixture')(t.p);
 const run=(fn,arg)=>t.p.evaluate(fn,arg).catch(e=>({error:String(e.message).split('\n')[0]}));
 const box=sel=>t.p.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};},sel);
 /* Настоящая мышь: граница — нажать, протянуть, отпустить (где угодно). */
 /* Заголовок за подпись — на место другой колонки (правый край цели). */
 const carry=async(fromSel,toSel)=>{const a=await box(fromSel),b=await box(toSel);if(!a||!b)return false;await t.p.mouse.move(a.x+4,a.y+4);await t.p.mouse.down();await t.p.mouse.move(a.x+40,a.y+4,{steps:3});await t.p.mouse.move(b.x+(b.x<a.x?3:b.w-4),a.y+4,{steps:8});await t.p.mouse.up();return true;};
 const drag=async(sel,dx,dy,opts)=>{const b=await box(sel);if(!b)return false;const x=b.x+Math.min(b.w-2,4),y=b.y+b.h/2;await t.p.mouse.move(x,y);await t.p.mouse.down();await t.p.mouse.move(x+dx/2,y+(dy||0)/2,{steps:3});await t.p.mouse.move(x+dx,y+(dy||0),{steps:3});if(opts&&opts.escape)await t.p.keyboard.press('Escape');await t.p.mouse.up();return true;};
 const setup=()=>run(()=>{
  const g=c=>glassProductByCode(c);g('4CLEAR').shortName='4CL';touch();
  /* Заказ из задания: 4 изделия 4CL + 4E272 и 4 изделия 4CL + 4Q272. */
  window.cwOrder=(rows,extra)=>{
   tab='sales';salesOrderNew(extra&&extra.kind||'order');salesSetUnitType('double');
   const base=soDraft.makeups[0],made={};soDraft.makeups=[];soDraft.lines=[];
   rows.forEach(r=>{const key=r.mu.join('+')+(r.lam?'L':'');let m=made[key];
    if(!m){m=JSON.parse(JSON.stringify(base));m.id=salesUid('MU');m.code=String.fromCharCode(65+soDraft.makeups.length);
     m.panes=r.mu.map((c,i)=>Object.assign(JSON.parse(JSON.stringify(base.panes[0])),{id:salesUid('PN')},r.lam?{category:'laminated',laminated:{outer:{glassProductId:c==='?'?'':g(c).id},inner:{glassProductId:g(r.lam).id}}}:{glassProductId:c==='?'?'':g(c).id,thicknessMm:4}));
     if(r.mu.length<2)m.cavities=[];made[key]=m;soDraft.makeups.push(m);}
    const l=normalizeSalesOrderLine({makeupId:r.none?'':m.id,width16:30*16,height16:40*16,qty:r.qty});soDraft.lines.push(l);salesEnsureLineShape(l);
   });
   if(extra&&extra.unused){const m=JSON.parse(JSON.stringify(soDraft.makeups[0]));m.id=salesUid('MU');m.code='Z';m.panes.forEach(p=>{p.id=salesUid('PN');p.glassProductId=g('6Q366').id;});soDraft.makeups.push(m);}
   salesApplyCustomerDefaults(oqCustomer().id);soDraft.customerPo='PO-CW';
   const o=JSON.parse(JSON.stringify(soDraft));salesDraftDrop(true);DB.salesOrder.push(o);touch();return o.id;
  };
  window.cwInfo=id=>salesListInfo(salesRecord(id));
  window.cwHeads=()=>[...document.querySelectorAll('.sales-list-card thead th[data-col]')].map(th=>th.dataset.col);
 });
 await run(()=>oqReset());await setup();

 eq('Order Items: 4 × 4CL+4E272 и 4 × 4CL+4Q272 → «4CL: 8 | 4E272: 4 | 4Q272: 4», Units 8 (не 16); колонка видна сразу после Glass, Glass прежняя; фильтр находит и по коду',await run(()=>{
  const id=cwOrder([{mu:['4CLEAR','4E272'],qty:4},{mu:['4CLEAR','4Q272'],qty:4}]);
  tab='sales';soEdit=null;soDraft=null;salesListLoadPrefs().filters={};render();
  const row=document.querySelector(`[data-order-row="${id}"]`),heads=cwHeads(),i=heads.indexOf('orderItems');
  const cell=row.children[i+1].textContent,info=cwInfo(id);
  const f=salesListFilterTest(salesListColumn('orderItems'),{mode:'include',conds:[{op:'contains',v:'4CLEAR: 8',v2:'',join:'and'}],values:null,preset:''},cwInfo(id));
  return {cell,units:salesListValue(info,'units'),after:heads[i-1],glass:salesListValue(cwInfo(id),'glass'),code:f};
 }),{cell:'4CL: 8 | 4E272: 4 | 4Q272: 4',units:8,after:'glass',glass:'4CL / 4E272 · 4CL / 4Q272',code:true});

 eq('Order Items: 3 single = 3; 3 ламината 4CL+4CL = 6; Qty 2 + 3 одного состава = 5 каждого; лишний Makeup не считается; нет стекла — Unknown glass; строка без Makeup — «not counted»; NCR — «—»; архив без количеств — Quantities unavailable',await run(()=>{
  const v=id=>salesListValue(cwInfo(id),'orderItems');
  const single=cwOrder([{mu:['6CLEAR'],qty:3}]),lam=cwOrder([{mu:['4CLEAR'],lam:'4CLEAR',qty:3}]),two=cwOrder([{mu:['4CLEAR','4E272'],qty:2},{mu:['4CLEAR','4E272'],qty:3}],{unused:true});
  const unknown=cwOrder([{mu:['4CLEAR','?'],qty:2}]),none=cwOrder([{mu:['4CLEAR','4E272'],qty:1},{mu:['4CLEAR','4E272'],qty:1,none:true}]);
  const arch=archiveListValue({a:{row:{glass:'4CL / 4E272'}},memo:{}},'orderItems'),kept=archiveListValue({a:{row:{orderItems:'4CL: 2'}},memo:{}},'orderItems');
  return {single:v(single),lam:v(lam),two:v(two),unknown:v(unknown),none:v(none),ncr:salesListValue({o:{id:'N',kind:'ncr'},n:{},memo:{}},'orderItems'),arch,kept};
 }),{single:'6CLEAR: 3',lam:'4CL: 6',two:'4CL: 5 | 4E272: 5',unknown:'4CL: 2 | Unknown glass: 2',none:'4CL: 1 | 4E272: 1 | 1 line not counted',ncr:null,arch:'Quantities unavailable',kept:'4CL: 2'});

 /* ---------------- Sales: граница заголовка ---------------- */
 await run(()=>{tab='sales';soEdit=null;soDraft=null;salesShow={orders:true,quotes:true};const p=salesListLoadPrefs();p.filters={};delete p.widths;salesListSavePrefs();render();});
 const before=await box('th[data-col="glass"]');
 await drag('th[data-col="glass"] [data-cw-grip]',-90,250);
 eq('Sales: граница Glass тянется мышью влево — колонка уже на 90 px у заголовка, ячеек и итогов; текст многоточием; отпустили ниже таблицы — жест закончен, ничего не открылось',await run(w=>{
  const th=document.querySelector('th[data-col="glass"]'),i=[...th.parentNode.children].indexOf(th),row=document.querySelector('[data-order-row]'),td=row.children[i],sp=td.querySelector('.sl-glass');
  return {th:Math.round(w-th.getBoundingClientRect().width),td:Math.round(th.getBoundingClientRect().width-td.getBoundingClientRect().width),saved:salesListLoadPrefs().widths.glass===Math.round(th.getBoundingClientRect().width),
   ellipsis:getComputedStyle(sp).textOverflow,menu:!!salesListMenu,body:document.body.className,opened:!!soDraft,lines:!!(salesLineWidths().glass||Object.keys(salesLineWidths()).length)};
 },(before||{}).w),{th:90,td:0,saved:true,ellipsis:'ellipsis',menu:false,body:'',opened:false,lines:false});

 eq('Sales: обрезанная ячейка показывает полный текст подсказкой; Status с On Hold — все признаки',await run(()=>{
  const id=cwOrder([{mu:['4CLEAR','4E272'],qty:4},{mu:['4CLEAR','4Q272'],qty:4},{mu:['6CLEAR','6E272'],qty:2}]);const o=salesRecord(id);o.onHold=true;o.holdReason='Waiting';
  const p=salesListLoadPrefs();p.widths=Object.assign({},p.widths,{orderItems:60,status:60});render();
  const row=document.querySelector(`[data-order-row="${id}"]`),heads=cwHeads(),cell=k=>row.children[heads.indexOf(k)+1];
  ['orderItems','status'].forEach(k=>cell(k).dispatchEvent(new MouseEvent('mouseover',{bubbles:true})));
  return {items:cell('orderItems').title,status:cell('status').title};
 }),{items:'4CL: 8 | 4E272: 4 | 4Q272: 4 | 6CLEAR: 2 | 6E272: 2',status:'New · On Hold'});

 await t.p.reload();await t.p.evaluate(()=>window.storageReady);
 await require('./optimization-fixture')(t.p);await setup();
 eq('Sales: ширины переживают F5, скрытие и возврат колонки; Reset widths в меню Columns рядом со Standard view — только ширины (порядок и фильтр на месте); Standard view — тоже ширины',await run(()=>{
  tab='sales';soEdit=null;soDraft=null;render();const w0=salesListLoadPrefs().widths.glass;
  salesListSetColumn('glass',false);salesListSetColumn('glass',true);const w1=Math.round(document.querySelector('th[data-col="glass"]').getBoundingClientRect().width);
  salesListSetFilter('customer',{mode:'include',conds:[{op:'contains',v:'North',v2:'',join:'and'}],values:null,preset:''});salesListMoveColumn('total',-1);const order=cwHeads().join();
  salesListOpenColumns(null);const btns=[...document.querySelectorAll('.sl-cols .sl-actions button')].map(b=>b.textContent);
  document.querySelector('[data-reset-widths]').click();const p=salesListLoadPrefs();
  const after={widths:p.widths||null,fixed:document.querySelector('.sl-table').classList.contains('cw-fixed'),order:cwHeads().join()===order,filter:!!p.filters.customer,menu:!!salesListMenu};
  p.widths={glass:120};salesListStandardView();
  return {kept:w0===w1,btns,after,standard:salesListLoadPrefs().widths||null};
 }),{kept:true,btns:['Standard view','Reset widths'],after:{widths:null,fixed:false,order:true,filter:true,menu:true},standard:null});

 eq('Sales: старые и испорченные ширины — без ошибок: чужое и отрицательное убрано, узкое и огромное — к границам',await run(()=>{
  localStorage.setItem(SALES_LIST_PREFS_KEY,JSON.stringify({cols:[{k:'number',on:true}],widths:{glass:-5,status:'abc',number:10,customer:99999,'x y':50,po:120.4}}));
  salesListPrefs=null;const p=salesListLoadPrefs();
  localStorage.setItem(SALES_LIST_PREFS_KEY,JSON.stringify({cols:[{k:'glass',on:true},{k:'units',on:true}]}));salesListPrefs=null;const old=salesListLoadPrefs();
  const k=old.cols.map(c=>c.k);return {w:p.widths,old:old.widths||null,items:k.slice(k.indexOf('glass'),k.indexOf('glass')+3).map(x=>x+(old.cols.find(c=>c.k===x).on?'+':'-'))};
 }),{w:{number:40,customer:1200,po:120},old:null,items:['glass+','orderItems+','units+']});

 /* ---------------- Sales: перенос колонки за заголовок ---------------- */
 await run(()=>{salesListMenu=null;localStorage.removeItem(SALES_LIST_PREFS_KEY);salesListPrefs=null;salesListLoadPrefs().filters={};tab='sales';render();});
 await carry('th[data-col="status"] [data-cw-label]','th[data-col="glass"]');
 const fl=await box('th[data-col="po"] [data-cw-label]');if(fl)await t.p.mouse.click(fl.x+3,fl.y+3);
 eq('Sales: заголовок Status перетащили за Glass — порядок записан, как из меню Columns; простой клик по заголовку ничего не делает',await run(()=>({heads:cwHeads().slice(4,9),saved:salesListLoadPrefs().cols.filter(c=>c.on&&c.k!=='type').map(c=>c.k).slice(4,9),menu:!!salesListMenu,widths:salesListLoadPrefs().widths||null})),
  {heads:['due','priority','glass','status','orderItems'],saved:['due','priority','glass','status','orderItems'],menu:false,widths:null});

 /* ---------------- Order Lines: тот же механизм, свои ширины ---------------- */
 await run(()=>{const id=cwOrder([{mu:['4CLEAR','4E272'],qty:4},{mu:['4CLEAR','4Q272'],qty:4},{mu:['4CLEAR','4E272'],qty:2}]);window.cwLines=id;salesListLoadPrefs().widths={glass:150};salesListSavePrefs();
  salesOrderEdit(id);soSelectedLines=new Set([soDraft.lines[1].id]);render();window.cwBefore=JSON.stringify(soDraft);document.querySelector('.sales-lines-block').scrollIntoView();});
 const sv=await box('th[data-column="services"]');
 await drag('th[data-column="services"] [data-cw-grip]',-70,120);
 eq('Order Lines: граница Services — уже на 70 px; ширины в профиле Order Lines, Sales не тронут; размеры, Qty и выделение строк на месте; заказ не изменён',await run(w=>{
  const th=document.querySelector('th[data-column="services"]');
  return {d:Math.abs(Math.round(w-th.getBoundingClientRect().width)-70)<=1,saved:salesLineWidths().services===Math.round(th.getBoundingClientRect().width),sales:salesListLoadPrefs().widths,
   sel:[...soSelectedLines].join()===soDraft.lines[1].id,dims:soDraft.lines.map(l=>[l.width16,l.qty].join('x')).join(),same:JSON.stringify(soDraft)===cwBefore,fixed:th.closest('table').classList.contains('cw-fixed')};
 },(sv||{}).w),{d:true,saved:true,sales:{glass:150},sel:true,dims:'480x4,480x4,480x2',same:true,fixed:true});

 const wd=await box('th[data-column="width"]');
 await drag('th[data-column="width"] [data-cw-grip]',200,0,{escape:true});
 await carry('th[data-column="notes"] [data-cw-label]','th[data-column="mu"]');
 eq('Order Lines: Escape отменяет — ширина прежняя, страница не в режиме ширины; Notes за заголовок — перед MU; другой заказ — те же ширины; Reset widths в Order columns там же, где в Sales, — только ширины этой таблицы',await run(w=>{
  const width=Math.round(document.querySelector('th[data-column="width"]').getBoundingClientRect().width),order=salesOrderScreenColumns().slice(0,3);
  const other=cwOrder([{mu:['6CLEAR'],qty:1}]);salesDraftDrop(true);salesOrderEdit(other);const services=Math.round(document.querySelector('th[data-column="services"]').getBoundingClientRect().width)===salesLineWidths().services;
  salesOpenMetrics('columns');const btns=[...document.querySelectorAll('.metric-modal .sl-actions button')].map(b=>b.textContent);document.querySelector('.metric-modal [data-reset-widths]').click();
  const r={width:Math.abs(width-w)<=1,body:document.body.className,guide:!!document.querySelector('.cw-guide'),order,services,btns,lines:Object.keys(salesLineWidths()).length,sales:salesListLoadPrefs().widths,stillOrder:salesOrderScreenColumns()[0]};
  salesCloseMetrics();salesDraftDrop(true);return r;
 },(wd||{}).w),{width:true,body:'',guide:false,order:['notes','mu','set'],services:true,btns:['Standard view','Reset widths'],lines:0,sales:{glass:150},stillOrder:'notes'});

 eq('col widths: без ошибок страницы',t.errs,[]);
 await t.c.close();
};
