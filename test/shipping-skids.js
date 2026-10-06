/* Shipping PR 4: скиды у клиентов — где скид считается по отправленным PS и
   возвратам, возврат сканом на станции, обмен в офисе, вкладка Skids. */
module.exports=async function({page,eq,ok}){
 console.log('shipping-skids');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{window.skPrints=(window.skPrints||0)+1;};
  /* 'A A B' — заказ на букву клиента, готов и лежит на своём скиде SL-n. */
  window.skSeed=function(spec){
   oqReset();DB.carrier=[];carrierAdd('SL',6);DB.skidReturn=[];DB.truck=[];window.skPrints=0;skidsNotice=null;stationLast=null;stationNote='';stationQuestions=[];stationIncoming='';const cs={};
   window.skIds=spec.split(' ').map((k,n)=>{cs[k[0]]=cs[k[0]]||oqCustomer({legalName:'Customer '+k[0]});const id=oqOrder(cs[k[0]]);salesDraftDrop();oqThrough(id,'ready');
    shippingAvailable(salesRecord(id)).forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-'+(n+1);}));return id;});
   return skIds;
  };
  /* PS на заказ, отправлен; daysAgo — когда уехал. */
  window.skShip=function(id,daysAgo,extra){
   const s=shippingCreate(Object.assign({customerId:salesRecord(id).customerId,method:'delivery',shipTo:{address1:'1 Main St'},date:finToday(),items:shippingAvailable(salesRecord(id)).map(shippingItem),extras:[]},extra)).value;
   shippingMarkShipped(s.id);if(daysAgo)s.shippedAt=new Date(Date.now()-daysAgo*864e5).toISOString();return s;
  };
  window.skOut=function(){return skidsByCustomer().map(g=>salesCustomerDisplay(g.customerId)+': '+g.list.map(x=>x.code+' '+skidDays(x.since)+'d '+x.ps).join(', '));};
  window.skLogin=function(station){DB.user=DB.user.filter(u=>u.name!=='Loader');DB.user.push({name:'Loader',role:'Shop',station,skills:[],pin:'0000'});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode=station;tab='station';stationIncoming='';stationLast=null;stationLogin(DB.user[DB.user.length-1].viewProfileId);render();};
  window.skText=function(sel){const e=document.querySelector(sel);return e?e.textContent.replace(/\s+/g,' ').trim():null;};
  window.skFail=function(fn){const proto=Storage.prototype,old=proto.setItem;proto.setItem=function(k,v){if(k===STORAGE_KEY)throw new Error('Disk full');return old.call(this,k,v);};let r;try{r=fn();}finally{proto.setItem=old;}return r;};
 });
 eq('A skid is at the customer after a delivery PS leaves: by customer, oldest first, with days and the PS; pickup keeps the skid',await t.p.evaluate(()=>{
  const [a,a2,b,c]=skSeed('A A B C');const before=skidsOut().size;skShip(a,2);skShip(a2,5);skShip(b,1);skShip(c,3,{method:'pickup'});
  return {before,out:skOut(),count:skidsOut().size};
 }),{before:0,out:['Customer A: SL-2 5d PS-0002, SL-1 2d PS-0001','Customer B: SL-3 1d PS-0003'],count:3});
 eq('Pickup takes the skid only when the skid itself was scanned onto the customer truck',await t.p.evaluate(()=>{
  const [a,b]=skSeed('A B'),ps=id=>shippingCreate({customerId:salesRecord(id).customerId,method:'pickup',shipTo:{},date:finToday(),items:shippingAvailable(salesRecord(id)).map(shippingItem),extras:[]}).value;
  const truck=ps(a),desk=ps(b);shippingLoad('SL-1',truck.id,{id:'qa',name:'QA'});shippingMarkShipped(truck.id,'loaded');shippingScanSigned(desk.number,'Customer');
  return {truck:truck.skidsOut,desk:desk.skidsOut,out:skOut(),status:[truck.status,desk.status]};
 }),{truck:['SL-1'],desk:[],out:['Customer A: SL-1 0d PS-0001'],status:['shipped','delivered']});
 eq('A planned or rolled back PS does not take the skid; the next delivery moves it to the new customer',await t.p.evaluate(()=>{
  const [a,b]=skSeed('A B'),s=skShip(a,0),sent=skidsOut().has('SL-1');shippingRevert(s.id,'dispatch');const rolled=skidsOut().size;shippingMarkShipped(s.id);
  skidBack('SL-1',{name:'QA'});shippingAvailable(salesRecord(b)).forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-1';}));const s2=skShip(b,0);
  return {sent,rolled,again:skOut()};
 }),{sent:true,rolled:0,again:['Customer B: SL-1 0d PS-0002']});
 eq('Mixed skid stays in the shop while other glass is on it; whoever takes the last glass takes the skid',await t.p.evaluate(()=>{
  const [a,b]=skSeed('A B');shippingAvailable(salesRecord(b)).forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-1';}));
  const first=skShip(a,0),afterA=[skidsOut().size,first.skidsOut.length],second=skShip(b,0);
  return {afterA,afterB:skOut(),kept:second.skidsOut,rolled:(shippingRevert(second.id,'dispatch'),'skidsOut' in second)};
 }),{afterA:[0,0],afterB:['Customer B: SL-1 0d PS-0002'],kept:['SL-1'],rolled:false});
 eq('SHIP: a mixed skid is not loaded as one; its units go by their own stickers without the skid',await t.p.evaluate(()=>{
  const [a,b]=skSeed('A B'),o=salesRecord(a);shippingAvailable(salesRecord(b)).forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-1';}));
  const s=shippingCreate({customerId:o.customerId,method:'delivery',shipTo:{address1:'1 Main St'},date:finToday(),items:[],extras:[]}).value;skLogin(shippingStations().ship);
  const whole=stationSubmit('SL-1'),hint=skText('[data-station-result="shipMixed"] .st-info'),units=shippingAvailable(o).map(u=>stationSubmit(u.pieces[0]));shippingMarkShipped(s.id,'loaded');
  return {whole,hint:hint.includes('Scan the units one by one'),units,skids:[...new Set(s.items.map(i=>i.skid))],out:skidsOut().size,stillOn:(carrierContents().get('SL-1')||[]).length};
 }),{whole:'shipMixed',hint:true,units:['shipLoaded','shipLoaded','shipLoaded'],skids:[''],out:0,stillOn:6});
 eq('The customer paper shows a skid only when the skid leaves with it: not from a mix, not at the front desk',await t.p.evaluate(()=>{
  const [a,b,c]=skSeed('A B C');shippingAvailable(salesRecord(b)).forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-1';}));
  const mk=(id,method)=>shippingCreate({customerId:salesRecord(id).customerId,method,shipTo:{address1:'1 Main St'},date:finToday(),items:shippingAvailable(salesRecord(id)).map(shippingItem),extras:[]}).value;
  const text=s=>shippingPages(shippingDocument(s)).flatMap(p=>p.items.filter(i=>i.t==='text').map(i=>i.s)).join(' | '),has=s=>({skid:/SL-\d/.test(text(s)),sheet:text(s).includes('SKID CONTENTS'),left:text(s).includes('left on site')});
  const mix=mk(a,'delivery'),planned=has(mix);shippingMarkShipped(mix.id);const shipped=has(mix),list=shippingListInfos().find(i=>i.o.id===mix.id).memo.skids;
  const last=mk(b,'delivery'),whole=has(last),desk=has(mk(c,'pickup'));
  return {planned,shipped,list,whole,desk};
 }),{planned:{skid:false,sheet:false,left:false},shipped:{skid:false,sheet:false,left:false},list:'',whole:{skid:true,sheet:true,left:true},desk:{skid:false,sheet:false,left:false}});
 eq('SHIP: an empty skid that was at a customer comes back by one scan; a second scan is not a second return',await t.p.evaluate(()=>{
  const [a]=skSeed('A');skShip(a,4);skLogin(shippingStations().ship);
  const first=stationSubmit('SL-1'),head=skText('[data-station-result="shipBack"] .st-res-h'),big=skText('[data-station-result="shipBack"] .st-big'),rec=DB.skidReturn[0];
  return {first,head:head.startsWith('✓ SL-1 back from Customer A'),big,rec:[rec.code,rec.kind,rec.by,rec.customerId===salesRecord(a).customerId],out:skidsOut().size,second:stationSubmit('SL-1'),records:DB.skidReturn.length};
 }),{first:'shipBack',head:true,big:'BACK FROMCustomer A4 days · PS-0001',rec:['SL-1','back','Loader',true],out:0,second:'shipNothing',records:1});
 eq('Ready station: scanning that skid to put glass on it is the return too, and the scan goes on as usual',await t.p.evaluate(()=>{
  const [a]=skSeed('A');skShip(a,1);skLogin(shippingStations().ready);const kind=stationSubmit('SL-1');
  return {kind,card:stationLast.check.kind,back:skText('[data-station-back]'),putOn:stationPutOn(),out:skidsOut().size,records:DB.skidReturn.map(r=>r.kind)};
 }),{kind:'carrier',card:'carrierPut',back:'back from Customer A',putOn:'SL-1',out:0,records:['back']});
 eq('Ready station: a skid that arrives with glass keeps it; the mix warning fires once, when one customer turns into two',await t.p.evaluate(()=>{
  oqReset();DB.carrier=[];carrierAdd('SL',2);DB.skidReturn=[];stationLast=null;stationQuestions=[];const ready=shippingStations().ready,ids=['A','B','C'].map(k=>{const id=oqOrder(oqCustomer({legalName:'Customer '+k}));salesDraftDrop();oqThrough(id,'batched');return id;});
  const pieces=id=>[...stationPieceIndex()].filter(([p,h])=>h.orderId===id).map(([p])=>p);
  /* как в цеху: после IGU юниты кладут на скид, на станцию готовности он приезжает уже со стеклом */
  ids.forEach(id=>{for(let pass=0;pass<20;pass++){let moved=false;pieces(id).forEach(piece=>{const g=stationGlass(piece),p=g&&stationPlace(g);if(!p||p.assembling||!p.waiting||p.waiting===ready)return;const c=stationCheck(p.waiting,piece);if(c.kind==='ok')moved=stationMove(p.waiting,c,{name:'IGU'},id===ids[0]?{on:'SL-1'}:{}).ok||moved;});if(!moved)break;}});
  skLogin(ready);const arrived=stationSubmit('SL-1'),card=stationLast.check.kind,putOn=stationPutOn(),stays=skText('[data-station-result="carrierIn"] .st-info').includes('Glass stays on SL-1');
  stationSubmit(pieces(ids[0])[0]);const kept=shippingAvailable(salesRecord(ids[0])).map(u=>u.skid),own=!!stationLast.foreign;
  stationSubmit('SL-2');stationSubmit(pieces(ids[1])[0]);const first=!!stationLast.foreign;stationSubmit(pieces(ids[2])[0]);const becameMix=stationLast.foreign&&stationLast.foreign.customers;stationSubmit(pieces(ids[1])[2]);const again=!!stationLast.foreign;
  return {arrived,card,putOn,stays,kept,own,first,becameMix,again};
 }),{arrived:'carrier',card:'carrierIn',putOn:'SL-1',stays:true,kept:['SL-1'],own:false,first:false,becameMix:['Customer B'],again:false});
 eq('Swap: their skid gets a new code, our oldest skid at that customer is written off, the count goes down',await t.p.evaluate(()=>{
  const [a,a2]=skSeed('A A'),c=salesRecord(a).customerId;skShip(a,2);skShip(a2,6);
  const bad=skidSwap(c,'DL'),out=skidSwap(c,'SA'),old=carrierFind('SL-2'),made=carrierFind('SA-1'),rec=DB.skidReturn[0];
  const none=skidSwap(oqCustomer({legalName:'Customer Z'}).id,'SL');
  return {bad:bad.error,ok:out.ok,value:out.value,old:[old.active,old.note],made:[made.active,made.note],rec:[rec.kind,rec.code,rec.newCode],left:skOut(),none:none.error};
 }),{bad:'Choose the skid type.',ok:true,value:{old:'SL-2',code:'SA-1'},old:[false,'left at Customer A (swap)'],made:[true,''],rec:['swap','SL-2','SA-1'],left:['Customer A: SL-1 2d PS-0001'],none:'This customer has none of our skids.'});
 eq('Returns survive export and import; junk rows are dropped and a wrong type is refused',await t.p.evaluate(()=>{
  const [a]=skSeed('A');skShip(a,1);skidBack('SL-1',{name:'QA'});const src=JSON.parse(JSON.stringify(DB));src.skidReturn.push(null,{id:'x',code:'SL-1'},{id:src.skidReturn[0].id,at:src.skidReturn[0].at,code:'SL-1',kind:'back'});
  const next=prepareImportedState(src);let bad='';try{validateSkidReturnPayload({skidReturn:{}});}catch(e){bad=e.message;}
  return {rows:next.skidReturn.map(r=>[r.code,r.kind,r.by]),bad};
 }),{rows:[['SL-1','back','QA']],bad:'The "skidReturn" field must be an array.'});
 eq('A return that cannot be saved is not counted: the skid stays at the customer and the screen says so',await t.p.evaluate(()=>{
  const [a]=skSeed('A');skShip(a,1);skLogin(shippingStations().ship);const kind=skFail(()=>stationSubmit('SL-1'));
  return {kind,out:skidsOut().size,records:DB.skidReturn.length,note:!!stationNote};
 }),{kind:'saveError',out:1,records:0,note:true});
 // Настоящие элементы экрана: вкладка Skids, обмен, Master Data.
 await t.p.evaluate(()=>{const [a,a2,b]=skSeed('A A B');skShip(a,2);skShip(a2,6);skShip(b,1);tab='shipping';shippingSetTab('skids');});
 eq('Skids tab lists customers with their skids and counts them on the tab',await t.p.evaluate(()=>({tab:skText('[data-shipping-tab="skids"]'),cards:[...document.querySelectorAll('[data-skids-customer]')].map(c=>c.querySelector('h3').textContent+' · '+[...c.querySelectorAll('[data-skid-out]')].map(r=>r.dataset.skidOut+' '+r.cells[2].textContent+' '+r.cells[3].textContent).join(', '))})),{tab:'Skids 3',cards:['Customer A · SL-2 6 PS-0002, SL-1 2 PS-0001','Customer B · SL-3 1 PS-0003']});
 await t.p.getByRole('button',{name:'Skid from Customer A',exact:true}).click();await t.p.getByRole('button',{name:'A-shape skid',exact:true}).click();
 eq('Skid from a customer: one dialog, a new code with a label, the old skid written off',await t.p.evaluate(()=>({notice:skText('[data-skids-notice]'),prints:skPrints,label:!!document.querySelector('[data-carrier-label="SA-1"]'),left:skText('[data-shipping-tab="skids"]')})),{notice:'SA-1 added · SL-2 left at Customer A',prints:1,label:true,left:'Skids 2'});
 await t.p.evaluate(()=>{tab='masterdata';mdSetTab('carriers');render();});
 eq('Master Data shows where a skid is and why the swapped one is inactive',await t.p.evaluate(()=>({out:skText('[data-carrier="SL-1"] [data-carrier-out]').replace(/since .* · /,'since … · '),swapped:document.querySelector('[data-carrier="SL-2"] input[placeholder="Note"]').value})),{out:'at Customer A since … · PS-0001',swapped:'left at Customer A (swap)'});
 eq('Shipping skids browser errors',t.errs,[]);await t.c.close();
};
