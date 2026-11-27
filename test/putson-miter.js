/* Правки владельца 27.11.2026 (PR 1 из трёх пунктов): тара станции Dolly + Skid;
   митра — одна работа Mitering с любым углом до десятой и пределами цеха в
   карточке работы; ровные таблицы Data → Setup и Stations (без «…» вместо % и
   CAD, без пустой полосы слева). */
module.exports=async function({page,eq}){
 console.log('puts on · miter · setup tables');
 const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));

 eq('Puts on: вариант Dolly + Skid — оба вида тары свои, станция говорит «dolly or skid», лист и доска — «No dolly or skid»',await run(()=>{
  const ok=sfSetPutsOn('ARRIS','both'),row=DB.station.find(s=>s.code==='ARRIS');
  navGo('masterdata');mdSetTab('stations');render();
  const opts=[...document.querySelectorAll('select[data-sf-puts-on="ARRIS"] option')].map(o=>o.textContent),picked=document.querySelector('select[data-sf-puts-on="ARRIS"]').value;
  const keep=stationCode;stationCode='ARRIS';const word=stationTareWord(),here=stationPutsOnHere();stationCode=keep;
  return {ok,puts:sfPutsOn(row),opts,picked,word,here,
   takes:[sfPutsTakes('both','Dolly'),sfPutsTakes('both','Skid'),sfPutsTakes('dolly','Skid'),sfPutsTakes('skid','Skid'),sfPutsTakes('none','Dolly')],
   loose:[carrierLooseWord([{puts:'both'}]),carrierLooseWord([{puts:'dolly'}]),carrierLooseWord([{puts:'skid'}])],on:carrierLooseOn('No dolly or skid')};
 }),{ok:true,puts:'both',opts:['Dolly','Skid','Dolly + Skid','—'],picked:'both',word:'dolly or skid',here:'both',
  takes:[true,true,false,true,false],loose:['No dolly or skid','No dolly','No skid'],on:'dolly or skid'});

 eq('Miter: угол — любое число больше 0° и меньше 90° до десятой; в счёте одна строка Mitering на все углы по одной цене',await run(()=>{
  const norm=[23.14,'30',0,95,'abc',89.95].map(a=>shapeNormalizeOp({type:'Mitering',angle:a,side:'back'}).angle);
  const sh=newShapeDef('rectangle');sh.id='qa-miter';sh.w='20';sh.h='40';
  sh.edgeOps.A=[shapeNormalizeOp({type:'Mitering',angle:23.1,side:'front'})];sh.edgeOps.B=[shapeNormalizeOp({type:'Mitering',angle:45,side:'back'})];
  DB.shapeDef=[normalizeShapeDef(sh)];
  soDraft=newSalesOrderDraft();const m=soDraft.makeups[0];m.unitType='single';m.panes=[salesDefaultPane(0)];m.panes[0].glassProductId='';m.panes[0].thicknessMm=10;
  const line=normalizeSalesOrderLine({makeupId:m.id,qty:1,width16:320,height16:640,shapeRef:salesShapeRefFrom(DB.shapeDef[0])});soDraft.lines=[line];
  const rows=salesLineChargeRows(line).filter(r=>/^EDGE:miter/.test(r.key));
  const route=salesRouteLiteStations(null,null,[{id:'A',ops:[{type:'Mitering',angle:23.1,side:'front'}]}],'AN').list.find(s=>s.code==='MITER').items;
  soDraft=null;
  return {norm,rows:rows.map(r=>[r.key.split(':').slice(0,2).join(':'),r.label,r.basis,r.catalogRate]),route,works:DB.serviceRate.filter(w=>/^miter/.test(w.id)).map(w=>[w.id,w.name,w.angleMin,w.angleMax])};
 }),{norm:[23.1,30,45,45,45,45],rows:[['EDGE:miter','Mitering',60,.38]],
  route:['Mitering 23.1° · Front'],works:[['miter','Mitering',10,45]]});

 eq('Miter: две прежние работы (22.5° и 45°) становятся одной Mitering — цены владельца от 45°, пределы 10°–45°; повторно ничего не меняет',await run(()=>{
  const keep=DB.serviceRate;
  const w45=Object.assign(JSON.parse(JSON.stringify(keep.find(w=>w.id==='miter'))),{id:'miter45',name:'Mitering 45°'});delete w45.angleMin;delete w45.angleMax;w45.tiers[1].price=.55;
  const w225=Object.assign(JSON.parse(JSON.stringify(w45)),{id:'miter225',name:'Mitering 22.5°'});w225.tiers[1].price=.99;
  DB.serviceRate=keep.filter(w=>w.id!=='miter').concat([w225,w45]);
  serviceRateMiterMerge();const once=JSON.stringify(DB.serviceRate);serviceRateMiterMerge();const again=JSON.stringify(DB.serviceRate)===once;
  const out=DB.serviceRate.filter(w=>/^miter/.test(w.id)).map(w=>[w.id,w.name,w.tiers[1].price,w.angleMin,w.angleMax,w.station]);
  DB.serviceRate=keep;return {out,again};
 }),{out:[['miter','Mitering',.55,10,45,'MITER']],again:true});

 eq('Miter: пределы угла — в карточке Data → Works → Mitering; угол за ними Save сохраняет, спросив (Miter angle warning)',await run(()=>{
  const sh=newShapeDef('rectangle');sh.id='qa-miter-50';sh.w='20';sh.h='40';sh.edgeOps.A=[shapeNormalizeOp({type:'Mitering',angle:50,side:'back'})];DB.shapeDef=[normalizeShapeDef(sh)];
  const order={lines:[{shapeRef:salesShapeRefFrom(DB.shapeDef[0])},{}]};
  const before=salesMiterWarnings(order);
  navGo('masterdata');mdSetTab('works');mdCatKind='serviceRate';mdCatEditRow('miter');render();
  const fields=[document.getElementById('md_catAngleMin').value,document.getElementById('md_catAngleMax').value];
  document.getElementById('md_catAngleMax').value='60';mdCatSave();
  const after=salesMiterWarnings(order),limits=salesMiterLimits();
  mdCatEditRow('roughArris');render();const other=!document.getElementById('md_catAngleMin');
  const w=DB.serviceRate.find(x=>x.id==='miter');w.angleMax=45;
  const al=window.alert;let said='';window.alert=m=>{said=m;};const typed=[salesMiterAngleIn('37.25'),salesMiterAngleIn('0')];window.alert=al;
  return {before,fields,after,limits,other,typed,said};
 }),{before:['Line 1: miter 50° is outside 10°–45° (Data → Works → Mitering).'],fields:['10','45'],after:[],limits:{min:10,max:60},other:true,
  typed:[37.3,null],said:'Enter a miter angle above 0° and below 90°.'});

 eq('Data → Setup и Stations: поле и его % / CAD в одной ячейке без «…», шестерёнка узкая, «parallel» и «not verified in the shop» целиком',await run(()=>{
  navGo('masterdata');mdSetTab('setup');render();
  const gear=document.querySelector('[data-md-setup] table.sl-table colgroup col').getBoundingClientRect().width||parseFloat(document.querySelector('[data-md-setup] table.sl-table colgroup col').style.width);
  const units=[...document.querySelectorAll('[data-md-setup] td .md-num')].map(n=>{const td=n.closest('td');return n.getBoundingClientRect().right<=td.getBoundingClientRect().right+1;});
  const name=[...document.querySelectorAll('[data-md-setup] tbody td b')].find(b=>/Energy/.test(b.textContent)),nameFits=name.closest('td').scrollWidth<=name.closest('td').clientWidth+1;
  mdSetTab('stations');render();
  const cell=(code,k)=>{const tr=document.querySelector('tr[data-sf-station="'+code+'"]'),i=[...tr.closest('table').querySelectorAll('thead th')].findIndex(th=>th.dataset.cwKey===k);return tr.children[i];};
  const fit=td=>td.scrollWidth<=td.clientWidth+1;
  return {gear:gear<60,units:units.length>0&&units.every(Boolean),nameFits,step:fit(cell('ARRIS','step')),size:fit(cell('ARRIS','size'))};
 }),{gear:true,units:true,nameFits:true,step:true,size:true});
};
