/* Экранные ошибки, найденные обходом всех вкладок на 390, 768–1280 и 1440 px
   (7 октября 2026), и очередь Optimization без денег — со стёклами и ft². */
module.exports=async function({page,eq,ok}){
 console.log('screen fixes');const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.sfShip=function(id,units){const o=salesRecord(id),m=shippingCreate({customerId:o.customerId,method:'delivery',shipTo:{addressee:'Site',address1:'1 King St W',city:'Toronto',province:'ON',postalCode:'M5H 1A1'},date:finToday(),items:units.map(shippingItem),extras:[]});if(!m.ok)throw new Error(m.error);shippingMarkShipped(m.value.id);shippingMarkDelivered(m.value.id,'Foreman',finToday());};
  oqReset();const id=oqOrder(oqCustomer({legalName:'Lakeview Windows Inc'}),{delivery:'delivery'});salesDraftDrop();oqThrough(id,'ready');sfShip(id,shippingAvailable(salesRecord(id)).slice(0,1));
 });

 eq('статус Ready в Sales — плашка как у других статусов: класс st-ready экрана станции её не растягивает; на станции метка Ready в поле скана прежняя',await t.p.evaluate(()=>{
  const id=oqOrder(oqCustomer({}),{});salesDraftDrop();oqThrough(id,'ready');tab='sales';render();
  const pill=document.querySelector('.pill.st-ready'),s=pill&&(({display,fontSize})=>({display,fontSize}))(getComputedStyle(pill));
  const box=document.createElement('label');box.className='st-scan';box.innerHTML='<span class="st-ready"><i></i>Ready</span>';document.body.appendChild(box);
  const mark=getComputedStyle(box.firstChild).display;box.remove();tab='dashboard';render();
  return {display:s&&s.display,size:s&&s.fontSize,mark};
 }),{display:'inline-flex',size:'11px',mark:'flex'});

 eq('очередь Optimization: без Total, Receipts, Balance; Glass pcs (стекло к резке) и Area ft² видны сразу и считаются внизу; в Shipping Glass pcs нет',await t.p.evaluate(()=>{
  oqQueue('all');const ths=[...document.querySelectorAll('.sl-table thead th')].map(th=>th.textContent.trim()),at=k=>ths.findIndex(h=>h.startsWith(k));
  const o=DB.salesOrder.find(o=>o.status==='ready'),row=[...document.querySelectorAll('.sl-table tbody tr')].find(r=>r.textContent.includes(o.businessNumber));
  const units=+row.children[at('Units')].textContent,pcs=row.children[at('Glass pcs')],col=k=>salesListCatalog().findIndex(c=>c.k===k),next=col('pcs')===col('units')+1;
  oqQueue('awaiting');const ship=salesListCatalog().some(c=>c.k==='pcs');tab='dashboard';render();
  return {money:ths.filter(h=>/^(Total|Receipts|Balance)/.test(h)),area:at('Area ft²')>0,next,pcs:!!pcs&&+pcs.textContent===units*2,right:!!pcs&&pcs.classList.contains('n'),ship};
 }),{money:[],area:true,next:true,pcs:true,right:true,ship:false});

 /* 13 вкладок Master Data и таблицы шире экрана сдвигали всю страницу вбок
    на планшете и ноутбуке: прокрутка вкладок и таблиц включалась только
    с 760 px, а меню уходит вниз уже с 900 px. */
 const wide=[];
 for(const width of [1280,1024,820,768]){
  await t.p.setViewportSize({width,height:900});
  wide.push(await t.p.evaluate(()=>{
   const bad=[];
   [['masterdata',['materials','stations','hardware','weight','trucks','ncr','overview']],['production',['orders','stations']]].forEach(([k,list])=>list.forEach(s=>{tab=k;if(k==='masterdata')mdTab=s;else subtab=s;render();if(document.documentElement.scrollWidth>innerWidth+1)bad.push(k+'/'+s);}));
   tab='dashboard';render();return bad;
  }));
 }
 eq('Master Data и Production → Stations не шире экрана на 1280, 1024, 820 и 768 px: вкладки и таблицы прокручиваются в карточке',wide,[[],[],[],[]]);

 await t.p.setViewportSize({width:390,height:844});
 eq('телефон: плитки Finance по две в ряд, суммы целиком, кнопка New receipt под ними; дата в Delivery внутри карточки; «Order N» в Backorders одной строкой',await t.p.evaluate(()=>{
  tab='finance';finTab='accounts';render();
  const tiles=[...document.querySelectorAll('.fin-stat')].map(e=>e.getBoundingClientRect()),btn=document.querySelector('[data-fin-new]').getBoundingClientRect();
  const sums=[...document.querySelectorAll('.fin-stat strong')].every(s=>s.scrollWidth<=s.clientWidth+1&&s.getBoundingClientRect().right<=s.parentElement.getBoundingClientRect().right+1);
  const rows=new Set(tiles.map(r=>Math.round(r.top))).size,below=tiles.every(r=>r.bottom<=btn.top+1);
  tab='shipping';shippingTab='delivery';render();
  const lines=e=>{const r=document.createRange();r.selectNodeContents(e);return r.getClientRects().length;};
  const day=document.querySelector('.delivery-day'),b=day.querySelector('b'),inside=b.getBoundingClientRect().right<=day.getBoundingClientRect().right+1&&lines(b)===1;
  shippingTab='backorders';render();const oneLine=lines(document.querySelector('.shipping-customer>h3>button'))===1;
  tab='dashboard';render();return {rows,below,sums,inside,oneLine};
 }),{rows:2,below:true,sums:true,inside:true,oneLine:true});

 eq('экранные правки: без ошибок страницы',t.errs,[]);await t.c.close();
};
