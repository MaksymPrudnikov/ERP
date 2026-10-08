/* Пересборка скидов на станции готовности: готовый юнит, отсканированный при
   выбранном скиде, переезжает на него; Undo возвращает; скид обнуляется в два
   нажатия. Заказ фикстуры — 3 готовых юнита (2 + 1), по два лайта. */
module.exports=async function({page,eq,ok}){
 console.log('shipping-restack');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{};
  window.rsSeed=function(spec){
   oqReset();DB.carrier=[];carrierAdd('SL',4);DB.skidReturn=[];stationLast=null;stationNote='';stationQuestions=[];stationIncoming='';stationEmptyAsk='';const cs={};
   window.rsIds=spec.split(' ').map((k,n)=>{cs[k[0]]=cs[k[0]]||oqCustomer({legalName:'Customer '+k[0]});const id=oqOrder(cs[k[0]]);salesDraftDrop();oqThrough(id,'ready');
    shippingAvailable(salesRecord(id)).forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-'+(n+1);}));return id;});
   DB.user=DB.user.filter(u=>u.name!=='Loader');DB.user.push({name:'Loader',role:'Shop',station:'SHIPR',skills:[],pin:'0000'});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}
   stationCode=shippingStations().ready;tab='station';stationLogin(DB.user[DB.user.length-1].viewProfileId);render();return rsIds;
  };
  window.rsUnits=function(id){return shippingUnits(salesRecord(id)).map(u=>u.label+'@'+(u.skid||'-')+(u.ready?'':'!'));};
  window.rsOn=function(){const m={};[...carrierContents()].sort((x,y)=>x[0].localeCompare(y[0])).forEach(([code,list])=>{m[code]=list.length;});return m;};
  window.rsText=function(sel){const e=document.querySelector(sel);return e?e.textContent.replace(/\s+/g,' ').trim():null;};
  window.rsFail=function(fn){const proto=Storage.prototype,old=proto.setItem;proto.setItem=function(k,v){if(k===STORAGE_KEY)throw new Error('Disk full');return old.call(this,k,v);};let r;try{r=fn();}finally{proto.setItem=old;}return r;};
 });
 eq('A ready unit scanned again with a skid chosen moves to that skid with all its glass; it stays ready',await t.p.evaluate(()=>{
  const [a]=rsSeed('A'),o=salesRecord(a),u=shippingAvailable(o)[0],scans=DB.stationScan.length;
  const noSkid=stationSubmit(u.pieces[0]),put=stationSubmit('SL-2'),moved=stationSubmit(u.pieces[0]),head=rsText('[data-station-result="shipMoved"] .st-res-h');
  const after=shippingUnits(o).find(x=>x.label===u.label);
  return {noSkid,put,moved,head:head.startsWith('✓ Moved SL-1 → SL-2'),skid:after.skid,ready:after.ready,added:DB.stationScan.length-scans,on:rsOn(),status:o.status,again:stationSubmit(u.pieces[1])};
 }),{noSkid:'already',put:'carrier',moved:'shipMoved',head:true,skid:'SL-2',ready:true,added:2,on:{'SL-1':4,'SL-2':2},status:'ready',again:'shipOnSkid'});
 eq('Undo puts the unit back on its skid',await t.p.evaluate(()=>{
  const [a]=rsSeed('A'),o=salesRecord(a),u=shippingAvailable(o)[0];stationSubmit('SL-2');stationSubmit(u.pieces[0]);
  document.querySelector('[data-station-move-undo]').click();
  return {on:rsOn(),skid:shippingUnits(o).find(x=>x.label===u.label).skid,note:stationNote,card:stationLast};
 }),{on:{'SL-1':6},skid:'SL-1',note:'Scan undone',card:null});
 eq('Three skids become two: every unit of the third is rescanned onto the others',await t.p.evaluate(()=>{
  const [a,b,c]=rsSeed('A A A'),units=shippingAvailable(salesRecord(c));
  stationSubmit('SL-1');const first=stationSubmit(units[0].pieces[0]);stationSubmit('SL-2');const rest=units.slice(1).map(u=>stationSubmit(u.pieces[0]));
  return {first,rest,on:rsOn(),third:rsUnits(c).map(x=>x.split('@')[1])};
 }),{first:'shipMoved',rest:['shipMoved','shipMoved'],on:{'SL-1':8,'SL-2':10},third:['SL-1','SL-2','SL-2']});
 eq('A unit on a planned PS moves too and the printed PS asks for a reprint; a loaded unit does not move',await t.p.evaluate(()=>{
  const [a]=rsSeed('A'),o=salesRecord(a),s=shippingCreate({customerId:o.customerId,method:'delivery',shipTo:{address1:'1 Main St'},date:finToday(),items:shippingAvailable(o).map(shippingItem),extras:[]}).value;
  shippingPrint(s.id);const u=shippingUnits(o)[0];stationSubmit('SL-2');const moved=stationSubmit(u.pieces[0]),reprint=shippingNeedsReprint(s),skids=shippingDocument(s).skids.map(k=>k.code).sort();
  const other=shippingUnits(o)[1];shippingLoad(other.pieces[0],s.id,{id:'qa',name:'QA'});const loaded=stationSubmit(other.pieces[0]);
  return {moved,reprint,skids,loaded};
 }),{moved:'shipMoved',reprint:true,skids:['SL-1','SL-2'],loaded:'already'});
 eq('Moving a unit onto a skid of another customer warns once that the skid became a mix',await t.p.evaluate(()=>{
  const [a,b]=rsSeed('A B'),ua=shippingAvailable(salesRecord(a));let sound='';const beep=stationBeep;stationBeep=k=>{sound=k;};
  stationSubmit('SL-2');const first=stationSubmit(ua[0].pieces[0]),warn=rsText('[data-station-foreign]'),red=!!document.querySelector('.st-res.st-red[data-station-result="shipMoved"]'),s1=sound;
  const second=stationSubmit(ua[1].pieces[0]),quiet=rsText('[data-station-foreign]'),s2=sound;stationBeep=beep;
  return {first,warn,red,s1,second,quiet,s2};
 }),{first:'shipMoved',warn:'OTHER CUSTOMER ON SL-2· Customer B✓ Keep on SL-2',red:true,s1:'error',second:'shipMoved',quiet:null,s2:'ok'});
 eq('Empty a skid takes two taps; its glass is then without a skid and the skid is rebuilt by the same scans',await t.p.evaluate(()=>{
  const [a]=rsSeed('A'),o=salesRecord(a);stationSubmit('SL-1');const button=rsText('[data-skid-empty]');
  document.querySelector('[data-skid-empty]').click();const ask=rsText('[data-skid-empty]'),still=rsOn()['SL-1'];
  document.querySelector('[data-skid-empty]').click();const card=stationLast.check.kind,text=rsText('[data-station-result="carrierEmptied"] .st-big'),empty=rsOn(),loose=rsUnits(a);
  const u=shippingAvailable(o)[0];stationSubmit('SL-1');const back=stationSubmit(u.pieces[0]);
  return {button,ask,still,card,text,empty,loose:loose.map(x=>x.split('@')[1]),ready:shippingAvailable(o).length,back,on:rsOn()};
 }),{button:'Empty SL-1',ask:'Empty 3 units — tap again',still:6,card:'carrierEmptied',text:'EMPTYSL-13 units without a skid',empty:{},loose:['-','-','-'],ready:3,back:'shipMoved',on:{'SL-1':2}});
 eq('A move that cannot be saved changes nothing',await t.p.evaluate(()=>{
  const [a]=rsSeed('A'),u=shippingAvailable(salesRecord(a))[0];stationSubmit('SL-2');const before=JSON.stringify(DB),kind=rsFail(()=>stationSubmit(u.pieces[0]));
  return {kind,same:before===JSON.stringify(DB),on:rsOn()};
 }),{kind:'saveError',same:true,on:{'SL-1':6}});
 eq('Shipping restack browser errors',t.errs,[]);await t.c.close();
};
