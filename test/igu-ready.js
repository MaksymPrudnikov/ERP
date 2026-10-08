/* IGU → Shipping ready, 7 октября 2026. Владелец: спейсер (Андрей) и
   силикон со скидами (Олег) — в 50 метрах; Андрей сканирует только лайты,
   Олег — стикер каждого юнита и скид, он и есть Shipping ready для IGU.
   Олегу нужен лист, «который подсвечивает, что он не отсканировал»;
   заказ — на многих скидах, перевести на другой скид — по клиенту; Ready
   без скида — цветом; «опция на скид или на долли — стереть всё, что на
   ней». */
module.exports=async function({page,eq}){
 console.log('igu-ready');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{};stationBeep=()=>{};
  window.irReset=function(){oqReset();DB.stationScan=[];DB.stationScanSeq=0;DB.carrier=[];DB.shipment=[];stationLast=null;stationIncoming='';stationNote='';stationDrawer=null;stationTab='scan';stationIguSel.clear();stationIguOpen='';};
  window.irOrder=function(customer,qty,unit){
   const id=oqOrder(oqCustomer({legalName:customer}),{dueDate:'2026-10-09'});salesOrderEdit(id);const m=soDraft.makeups[0];
   if(unit==='single'){m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];}m.panes.forEach(p=>{p.heatTreatmentId='HT-AN';});
   const l=normalizeSalesOrderLine({makeupId:m.id,width16:36*16,height16:24*16,qty,mark:'M1'});soDraft.lines=[l];salesEnsureLineShape(l);
   salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});
   if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return id;
  };
  window.irLites=id=>[...glassPieceMap(id).values()].map(r=>r.ids);
  window.irLogin=function(station){const name='Op '+station;DB.user=DB.user.filter(u=>u.name!==name);DB.user.push({name,role:'Shop',station,skills:[],pin:'0000'});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode=station;tab='station';stationIncoming='';stationLast=null;stationNote='';stationLogin(DB.user[DB.user.length-1].viewProfileId);};
  window.irOut=function(){stationSwitch();tab='dashboard';render();};
  window.irPass=(station,ids)=>{irLogin(station);ids.forEach(x=>stationSubmit(x));irOut();};
  window.irText=sel=>{const e=document.querySelector(sel);return e?e.textContent.replace(/\s+/g,' ').trim():null;};
  window.irOn=id=>{const s=DB.stationScan.filter(r=>r.piece===id&&!r.undoneAt).pop();return s?s.station+':'+(s.on||'—'):'-';};
  window.irUnit=(id,n)=>unitIdAt(id,salesRecord(id).lines[0].id,n);
  /* Два заказа идут через IGU по очереди: Summit 1, 2, Lakeview 1, Summit 3,
     Lakeview 2. Время сборки — по порядку, как едут по линии. */
  window.irLine=function(){
   irReset();carrierAdd('SL',3);carrierAdd('DL',1);
   const A=irOrder('Summit Builders',3),B=irOrder('Lakeview Glass',2),a=irLites(A),b=irLites(B);
   irPass('CUT',a.flat().concat(b.flat()));irPass('ARRIS',a.flat().concat(b.flat()));
   irLogin('IGU');[[a,0],[a,1],[b,0],[a,2],[b,1]].forEach(([l,i])=>{stationSubmit(l[0][i]);stationSubmit(l[1][i]);});
   const asm=[...new Set(DB.stationScan.filter(s=>s.station==='IGU'&&s.unit).map(s=>s.asm))];
   DB.stationScan.filter(s=>s.station==='IGU').forEach(s=>{s.at='2026-10-07T10:'+String(30+asm.indexOf(s.asm)*2).padStart(2,'0')+':00.000Z';});
   irOut();window.ir={A,B,a,b,an:salesRecord(A).businessNumber,bn:salesRecord(B).businessNumber};return ir;
  };
 });

 eq('IGU без тары: Андрей сканирует лайты — юнит ни на каком скиде, «Which skid?» нет; лайт без пары тоже ни на чём; Master Data: IGU «—»',await t.p.evaluate(()=>{
  irReset();carrierAdd('DL',1);const A=irOrder('Summit Builders',2),a=irLites(A);
  irPass('CUT',['DL-1'].concat(a.flat()));irPass('ARRIS',a.flat());
  irLogin('IGU');stationSubmit(a[0][0]);stationSubmit(a[1][0]);stationSubmit(a[0][1]);
  const out={puts:stationPutsOnHere(),ask:!!document.querySelector('[data-station-ask-dolly]'),loose:stationLoose().length,unit:[irOn(a[0][0]),irOn(a[1][0])],single:irOn(a[0][1])};irOut();
  tab='masterdata';mdSetTab('stations');out.md=document.querySelector('[data-sf-puts-on="IGU"]').value;tab='dashboard';render();
  return out;
 }),{puts:'none',ask:false,loose:0,unit:['IGU:—','IGU:—'],single:'IGU:—',md:'none'});

 eq('лист From IGU у Олега: пропущенный — красным (собран раньше отсканированного), собранный позже — «in line», отсканированное — по скидам; «Waiting here» остаётся (стикер не читается — там)',await t.p.evaluate(()=>{
  irLine();irLogin(shippingStations().ready);
  const g=n=>'.st-igu-g:has([data-igu-order="'+n+'"]) ',name=x=>String(x).replace(/U-\d{7}/g,u=>{for(const [id,k] of [[ir.A,'A'],[ir.B,'B']])for(let n=1;n<=3;n++)if(irUnit(id,n)===u)return k+n;return u;});
  const before={card:!!document.querySelector('[data-station-igu]'),line:name(irText(g(ir.an)+'[data-igu-line]'))};
  stationSubmit('SL-1');[1,2,3].forEach(n=>stationSubmit(irUnit(ir.A,n)));
  const out={before,
   pills:[irText('[data-igu-missed-count]'),irText('[data-igu-noskid-count]')],
   a:[irText('[data-igu-order="'+ir.an+'"] .st-igu-n'),irText('[data-igu-order="'+ir.an+'"] [data-igu-pick="SL-1"]')],
   missed:[...document.querySelectorAll(g(ir.bn)+'[data-igu-missed]')].map(e=>name(e.dataset.iguMissed)),
   b:[irText('[data-igu-order="'+ir.bn+'"] .st-igu-n'),name(irText(g(ir.bn)+'[data-igu-line]'))],
   first:document.querySelector('[data-station-igu] .st-igu-o').dataset.iguOrder===ir.bn,
   waiting:document.querySelectorAll('[data-station-here],[data-station-nodolly]').length>0};
  irOut();return out;
 }),{before:{card:true,line:'In line3 A1, A2, A3coming'},pills:['1 not scanned',null],a:['3 / 3 ✓','SL-1 3'],missed:['B1'],b:['0 / 2','In line1 B2coming'],first:true,waiting:true});

 eq('Ready без скида — жёлтым у Олега и в Shipping; ✓ Mark ready у пропущенного; Broken — Recut всего юнита',await t.p.evaluate(()=>{
  irLine();irLogin(shippingStations().ready);stationSubmit('SL-1');[1,2,3].forEach(n=>stationSubmit(irUnit(ir.A,n)));
  stationClearPutOn();stationSubmit(irUnit(ir.B,2));
  const no=[irText('[data-igu-noskid-count]'),irText('.st-igu-g:has([data-igu-order="'+ir.bn+'"]) [data-igu-noskid]').replace(irUnit(ir.B,2),'B2')];
  document.querySelector('[data-igu-missed]').click();const acts=[...document.querySelectorAll('.st-igu-acts button')].map(b=>b.textContent);
  document.querySelector('[data-igu-broken]').click();const broken=[stationDrawer&&stationDrawer.kind,!!document.querySelector('[data-recut-whole]')];stationCloseDrawer();
  if(!document.querySelector('[data-igu-mark]'))document.querySelector('[data-igu-missed]').click();document.querySelector('[data-igu-mark]').click();
  const marked=[irText('[data-igu-missed-count]'),irText('[data-igu-noskid-count]'),irOn(irLites(ir.B)[0][0])];
  irOut();tab='shipping';shippingSetTab('ready');const ship=irText('[data-no-skid]');tab='dashboard';render();
  return {no,acts,broken,marked,ship};
 }),{no:['1 no skid','No skid1 B2NO SKID'],acts:['✓ Mark ready','Print sticker','Broken'],broken:['recut',true],marked:[null,'2 no skid','SHIPR:—'],ship:'Without a skid · 2 units'});

 eq('скид заказа в листе — окно скида с этим заказом: скан другого скида — его юниты переехали; Undo — назад; «No skid» — кнопкой скида; микс виден, не ошибка',await t.p.evaluate(()=>{
  irLine();irLogin(shippingStations().ready);stationSubmit('SL-1');[1,2,3].forEach(n=>stationSubmit(irUnit(ir.A,n)));stationClearPutOn();[1,2].forEach(n=>stationSubmit(irUnit(ir.B,n)));
  document.querySelector('[data-igu-order="'+ir.an+'"] [data-igu-pick="SL-1"]').click();
  const win=[stationDrawer.kind,irText('[data-station-skid-window] h2'),irText('[data-skid-order="'+ir.an+'"]').replace(ir.an,'A'),irText('[data-skid-sel]')];
  stationSubmit('SL-2');const moved=[stationLast.check.kind,irText('[data-station-result="carrierMoved"] .st-res-h').replace(/\d\d:\d\d.*$/,'').trim(),irOn(irLites(ir.A)[1][2]),stationDrawer];
  document.querySelector('[data-dolly-undo]').click();const back=irOn(irLites(ir.A)[0][0]);
  document.querySelector('[data-igu-noskid]').click();const foot=irText('[data-igu-foot]');document.querySelector('[data-igu-to="SL-1"]').click();
  const mix=[irText('[data-igu-order="'+ir.an+'"] [data-igu-pick="SL-1"]'),irText('[data-igu-order="'+ir.bn+'"] [data-igu-pick="SL-1"]'),irText('[data-igu-noskid-count]')];
  irOut();return {win,moved,back,foot,mix};
 }),{win:['skid','SL-13 units','✓A · Summit Builders3 units','3 selected →'],moved:['carrierMoved','✓ Moved 3 units · SL-1 → SL-2','SHIPR:SL-2',null],back:'SHIPR:SL-1',foot:'2 units →SL-1MoveClear',mix:['SL-1 3 mix','SL-1 2 mix',null]});

 eq('окно скида юнитами по клиентам (Skids at SHIPR): клиент — все его юниты, юнит — по одному; перенос кнопкой скида; ничего не выбрано — Empty',await t.p.evaluate(()=>{
  irLine();irLogin(shippingStations().ready);stationSubmit('SL-1');[1,2,3].forEach(n=>stationSubmit(irUnit(ir.A,n)));stationSubmit(irUnit(ir.B,1));document.querySelector('[data-station-warn-keep]').click();stationSubmit('SL-2');stationSubmit(irUnit(ir.B,2));
  document.querySelector('[data-station-loaded="SL-1"]').click();
  const rows=[...document.querySelectorAll('[data-station-skid-window] tr')].map(r=>r.dataset.skidOrder?'order '+(r.dataset.skidOrder===ir.an?'A':'B')+' '+r.querySelector('.n').textContent:'unit '+r.dataset.skidUnit.replace(/U-\d+/,'U'));
  const empty=irText('[data-station-skid-window] [data-skid-empty]');
  document.querySelector('[data-skid-order="'+ir.bn+'"]').click();document.querySelector('[data-station-skid-window] [data-skid-unit="'+irUnit(ir.A,3)+'"]').click();
  const sel=[irText('[data-skid-sel]'),[...document.querySelectorAll('[data-station-skid-window] tr.on')].length,[...document.querySelectorAll('[data-skid-to]')].map(b=>b.dataset.skidTo)];
  document.querySelector('[data-skid-to="SL-2"]').click();
  const after=[irText('[data-station-result="carrierMoved"] .st-res-h').replace(/\d\d:\d\d.*$/,'').trim(),(carrierContents().get('SL-1')||[]).length,(carrierContents().get('SL-2')||[]).length];
  irOut();return {rows,empty,sel,after};
 }),{rows:['order A 3 units','unit U','unit U','unit U','order B 1 unit','unit U'],empty:'Empty SL-1',sel:['2 selected →',3,['SL-2']],after:['✓ Moved 2 units · SL-1 → SL-2',4,6]});

 eq('Empty — у любой тары на любой станции: долли на CUT, два нажатия, стекло остаётся на станции без тары; Undo — обратно',await t.p.evaluate(()=>{
  irReset();carrierAdd('DL',1);const s=irLites(irOrder('North Shore Windows',2,'single')).flat();
  irLogin('CUT');stationSubmit('DL-1');s.forEach(x=>stationSubmit(x));stationSubmit('DL-1');
  const card=irText('[data-station-result="carrierPut"] .st-info .mut').replace(/\d\d:\d\d( [AP]M)?/,'HH:MM');
  document.querySelector('[data-skid-empty]').click();const ask=irText('[data-skid-empty]');document.querySelector('[data-skid-empty]').click();
  const done=[stationLast.check.kind,irText('[data-station-result="carrierEmptied"] .st-big'),(carrierContents().get('DL-1')||[]).length,s.map(irOn).join(),stationPlace(stationGlass(s[0])).waiting];
  document.querySelector('[data-empty-undo]').click();const undo=[(carrierContents().get('DL-1')||[]).length,stationNote];
  irOut();return {card,ask,done,undo};
 }),{card:'On it now: 2 glass · since HH:MM · another dolly — scan it',ask:'Empty 2 glass — tap again',done:['carrierEmptied','EMPTYDL-12 glass without a dolly',0,'CUT:—,CUT:—','ARRIS'],undo:[2,'Back on DL-1']});

 eq('Empty на SHIPR — в юнитах; в Master Data → Dollies & Skids: «since», Empty с вопросом и Undo',await t.p.evaluate(()=>{
  irLine();irLogin(shippingStations().ready);stationSubmit('SL-1');[1,2,3].forEach(n=>stationSubmit(irUnit(ir.A,n)));stationSubmit('SL-1');
  document.querySelector('[data-skid-empty]').click();const ask=irText('[data-skid-empty]');document.querySelector('[data-skid-empty]').click();
  const big=irText('[data-station-result="carrierEmptied"] .st-big'),noskid=irText('[data-igu-noskid-count]');
  document.querySelector('[data-empty-undo]').click();irOut();
  tab='masterdata';mdSetTab('carriers');const cell=irText('[data-carrier="SL-1"] td:nth-child(4)').replace(/since .*? Empty/,'since — Empty');
  document.querySelector('[data-carrier-empty="SL-1"]').click();const dialog=salesDialog&&salesDialog.title;salesDialogChoose(1);
  const after=[(carrierContents().get('SL-1')||[]).length,irText('[data-carrier-emptied]')];
  document.querySelector('[data-carrier-empty-undo]').click();const undo=(carrierContents().get('SL-1')||[]).length;
  tab='dashboard';render();return {ask,big,noskid,cell,dialog,after,undo};
 }),{ask:'Empty 3 units — tap again',big:'EMPTYSL-13 units without a skid',noskid:'3 no skid',cell:'6 glass · waiting at SHIP since — Empty',dialog:'Empty SL-1?',after:[0,'SL-1 emptied · 6 glass without a skid Undo'],undo:6});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
