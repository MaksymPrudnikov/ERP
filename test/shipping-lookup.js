/* Shipping: заказ по номеру у стойки — карточка заказа и PS самовывоза на
   один этот заказ одной кнопкой. Заказ фикстуры — 3 готовых юнита (2 + 1). */
module.exports=async function({page,eq,ok}){
 console.log('shipping-lookup');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{window.lkPrints=(window.lkPrints||0)+1;};
  window.lkSeed=function(spec,upTo){
   oqReset();DB.carrier=[];carrierAdd('SL',3);carrierAdd('DL',1);DB.orderEvent=[];window.lkPrints=0;shippingLookupReset();const cs={};
   const ids=spec.split(' ').map(k=>{cs[k[0]]=cs[k[0]]||oqCustomer(Object.assign({legalName:'Customer '+k[0]},k[1]==='$'?{paymentMode:'cash'}:{}));const id=oqOrder(cs[k[0]]);salesDraftDrop();oqThrough(id,'ready');return id;});
   tab='shipping';shippingTab='ready';render();return ids;
  };
  window.lkPut=function(id,code,lineNo){const o=salesRecord(id);shippingAvailable(o).filter(u=>!lineNo||o.lines.findIndex(l=>l.id===u.lineId)===lineNo-1).forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on=code;}));};
  window.lkText=function(sel){const e=document.querySelector(sel);return e?e.textContent.replace(/\s+/g,' ').trim():null;};
  window.lkType=function(v){const e=document.querySelector('[data-order-lookup]');e.value=v;e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));};
 });
 eq('Typed order number opens its card: ready count, where the glass lies, and a miss says so',await t.p.evaluate(()=>{
  const [a]=lkSeed('A'),o=salesRecord(a);lkPut(a,'SL-2',1);lkPut(a,'DL-1',2);render();lkType('  '+o.businessNumber.toLowerCase()+' ');
  const out={head:lkText('[data-lookup-card] h3')==='Order '+o.businessNumber+' · Customer A',ready:lkText('[data-lookup-ready]'),where:[...document.querySelectorAll('.shipping-lookup-where')].map(e=>e.textContent),button:lkText('[data-lookup-pickup]'),shop:lkText('[data-lookup-shop]'),due:lkText('[data-lookup-due]')};
  lkType('99999');out.miss=lkText('[data-lookup-miss]');out.card=!!document.querySelector('[data-lookup-card]');return out;
 }),{head:true,ready:'3 / 3 ready',where:['DL-11 unit','SL-22 units'],button:'Pickup packing slip · 3 units',shop:null,due:null,miss:'No order or PO 99999',card:false});
 eq('Pickup packing slip takes this order only, prints once and opens it in Shipments',await t.p.evaluate(()=>{
  const [a,b]=lkSeed('A A'),o=salesRecord(a);lkType(o.businessNumber);document.querySelector('[data-lookup-pickup]').click();const s=DB.shipment[0];
  return {count:DB.shipment.length,method:s.method,status:s.status,orders:shippingOrderIds(s).length===1&&shippingOrderIds(s)[0]===a,units:s.items.length,otherFree:shippingAvailable(salesRecord(b)).length,prints:lkPrints,printed:!!s.printedAt,tab:shippingTab,open:shippingOpenId===s.id,card:!!document.querySelector('[data-lookup-card]'),dialog:!!salesDialog};
 }),{count:1,method:'pickup',status:'planned',orders:true,units:3,otherFree:3,prints:1,printed:true,tab:'shipments',open:true,card:false,dialog:false});
 eq('Signed scan of that PS then closes the pickup; the card of the order shows Picked up and no button',await t.p.evaluate(()=>{
  const s=DB.shipment[0],o=salesRecord(shippingOrderIds(s)[0]),signed=shippingScanSigned(s.number,'Customer').ok;lkType(o.businessNumber);
  return {signed,status:o.status,pill:lkText('[data-lookup-ready]'),button:!!document.querySelector('[data-lookup-pickup]'),ps:lkText('[data-lookup-ps]')};
 }),{signed:true,status:'done',pill:'Picked up',button:false,ps:'PS-0001 · Picked up'});
 eq('Cash balance is asked once, before anything is written: Back writes nothing, Print anyway creates and prints',await t.p.evaluate(()=>{
  const [a]=lkSeed('A$'),o=salesRecord(a);lkType(o.businessNumber);const due=/^Balance due \$/.test(lkText('[data-lookup-due]'));
  document.querySelector('[data-lookup-pickup]').click();const asked=!!salesDialog,labels=salesDialog.buttons.map(b=>b.label);oqChoose('Back');const back={ps:DB.shipment.length,prints:lkPrints};
  document.querySelector('[data-lookup-pickup]').click();oqChoose('Print anyway');
  return {due,asked,labels,back,ps:DB.shipment.length,prints:lkPrints,again:!!salesDialog};
 }),{due:true,asked:true,labels:['Back','Print anyway','Take payment'],back:{ps:0,prints:0},ps:1,prints:1,again:false});
 eq('Partly ready order: the card says where the rest is and the PS takes only what is ready',await t.p.evaluate(()=>{
  const [a]=lkSeed('A'),o=salesRecord(a),u=shippingAvailable(o)[0],ready=shippingStations().ready;
  stationUndo(stationScansFor(u.pieces[0]).find(s=>s.station===ready).id,{name:'QA'});render();lkType(o.businessNumber);
  const out={ready:lkText('[data-lookup-ready]'),shop:lkText('[data-lookup-shop]'),button:lkText('[data-lookup-pickup]')};
  document.querySelector('[data-lookup-pickup]').click();const s=DB.shipment[0];lkType(o.businessNumber);
  return Object.assign(out,{units:s.items.length,after:lkText('[data-lookup-ready]'),ps:lkText('[data-lookup-ps]'),again:!!document.querySelector('[data-lookup-pickup]')});
 }),{ready:'2 / 3 ready',shop:'In the shop · SHIPR 2 glass',button:'Pickup packing slip · 2 units',units:2,after:'2 / 3 ready',ps:'PS-0001 · Planned',again:false});
 eq('PO finds the order; one PO on several orders gives a list, a pick opens the card and Close returns to the list; an exact order number wins',await t.p.evaluate(()=>{
  const [a,b,c]=lkSeed('A A B'),oa=salesRecord(a),ob=salesRecord(b),oc=salesRecord(c);oa.customerPo='JOB-4521 Tower';ob.customerPo='job-4521 lobby';oc.customerPo=oa.businessNumber;
  const head=()=>lkText('[data-lookup-card] h3'),close=sel=>document.querySelector(sel+' [aria-label="Close"]').click(),out={};
  lkType('tower');out.one=head()==='Order '+oa.businessNumber+' · Customer A';
  lkType(' 4521 ');out.title=lkText('[data-lookup-list] h3');out.rows=[...document.querySelectorAll('[data-lookup-list] tbody tr')].map(r=>r.textContent.replace(/\s+/g,' ').trim()).join('|')===[oa,ob].map(o=>o.businessNumber+'Customer A'+o.customerPo+'3 / 3 ready').join('|');out.card=!!document.querySelector('[data-lookup-card]');
  document.querySelectorAll('[data-lookup-open]')[1].click();out.picked=head()==='Order '+ob.businessNumber+' · Customer A';
  close('[data-lookup-card]');out.back=!!document.querySelector('[data-lookup-list]')&&!document.querySelector('[data-lookup-card]');
  close('[data-lookup-list]');out.closed=!document.querySelector('[data-lookup-list]')&&document.querySelector('[data-order-lookup]').value==='';
  lkType(oa.businessNumber);out.number=head()==='Order '+oa.businessNumber+' · Customer A'&&!document.querySelector('[data-lookup-list]');
  lkType('4521');document.querySelector('[data-lookup-open]').click();document.querySelector('[data-lookup-pickup]').click();out.ps=DB.shipment.length===1&&shippingOrderIds(DB.shipment[0]).join()===a&&!document.querySelector('[data-lookup-list]');
  lkType('no such po');out.miss=lkText('[data-lookup-miss]');return out;
 }),{one:true,title:'PO 4521 · 2 orders',rows:true,card:false,picked:true,back:true,closed:true,number:true,ps:true,miss:'No order or PO no such po'});
 eq('Shipping lookup browser errors',t.errs,[]);await t.c.close();
};
