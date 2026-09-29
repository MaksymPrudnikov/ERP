/* Станция дважды в маршруте. Владелец, 29.09.2026: «фигура CNC Shape Polish,
   закалка, ламинирование и после CNC Lami Polish — это одна и та же
   машина». Маршрут плиты: CUT › CNC › HEAT › LAM › CNC › SHIPR › SHIP. Скан
   ведёт стекло к ближайшему впереди заходу: второй скан на CNC — не
   «уже сделано», а следующий шаг; после LAM плиты едут вместе; очередь CNC
   видит стекло, которое вернётся к ней после ламинации; табло не считает
   его дважды (2 плиты ждут на CNC — «2», а не «4»). */
module.exports=async function({page,eq,ok}){
 console.log('route-repeat');const t=await page();
 await require('./optimization-fixture')(t.p);

 eq('CNC до закалки и CNC после ламинации: оба скана пишутся, плиты после LAM едут одним сканом, повтор — «уже», очередь и табло',await t.p.evaluate(()=>{
  oqReset();DB.stationScan=[];DB.stationScanSeq=0;
  const keep=DB.serviceRate.filter(w=>['cncShapePolish','cncLamiPolish'].includes(w.id)).map(w=>[w,w.station]);
  keep.forEach(([w])=>{w.station='CNC';});stationRouteReset();
  const id=oqOrder(oqCustomer({legalName:'North Shore Windows'}));salesOrderEdit(id);
  const line=soDraft.lines[0],m=salesMakeupById(soDraft,line.makeupId),gp=mm=>(DB.glassProduct||[]).find(x=>+x.thicknessMm===mm);
  const pn=salesDefaultPane(0);pn.category='laminated';['outer','inner'].forEach(k=>{pn.laminated[k].glassProductId=gp(6).id;pn.laminated[k].thicknessMm=6;pn.laminated[k].heatTreatmentId='HT-FT';});
  m.unitType='single';m.panes=[normalizeSalesPane(pn,0)];m.cavities=[];soDraft.lines=[line];
  const s=salesLineGeometryShape(line);s.edgeOps.A=[shapeNormalizeOp({type:'CNC Shape Polish'})];s.edgeOps.C=[shapeNormalizeOp({type:'CNC Shape Polish'})];
  s.edgeOps.B=[shapeNormalizeOp({type:'CNC Lami Polish'})];s.edgeOps.D=[shapeNormalizeOp({type:'CNC Lami Polish'})];
  salesOrderSave();soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
  const o=salesRecord(id),l=o.lines[0],cs=glassBatchComponents(o,l),pm=glassPieceMap(id),a=pm.get(cs[0].key).ids[0],b=pm.get(cs[1].key).ids[0];
  const who={id:'x',name:'Ivan'},scan=(st,x)=>{const c=stationCheck(st,x);const r=stationRecord(st,c,who);return c.kind+(r?'':'-');};
  const route=stationRouteOf(stationGlass(a)).codes.join('>');
  const log=[];['CUT','CNC','HEAT'].forEach(st=>{log.push(st+':'+scan(st,a)+'/'+scan(st,b));});
  const early=stationCheck('CNC',a).kind,queue=stationFlowData('CNC').coming.map(x=>x.at).join();
  log.push('LAM:'+scan('LAM',a)+'/'+scan('LAM',b));
  const cncCell=()=>{tab='production';subtab='orders';prodOpen=new Set();const p=salesListLoadPrefs();p.filters={};render();
   const heads=[...document.querySelectorAll('.pb-table thead th')].map(th=>th.textContent.trim()),row=document.querySelector(`[data-prod-order="${id}"]`);return row.children[heads.indexOf('CNC')].textContent.trim();};
  const waitingCnc=cncCell();
  const second=stationCheck('CNC',a),mates=second.mates.length;const rec=stationRecord('CNC',second,who);stationRecordMates('CNC',second,who,{});
  const after={a:stationPlace(stationGlass(a)).waiting,b:stationPlace(stationGlass(b)).waiting,again:stationCheck('CNC',a).kind,cut:stationCheck('CUT',a).kind};
  const board=cncCell();
  keep.forEach(([w,st])=>{w.station=st;});stationRouteReset();tab='dashboard';render();
  return {route,log,early,queue,waitingCnc,second:second.kind,mates,rec:!!rec,after,board};
 }),{route:'CUT>CNC>HEAT>LAM>CNC>SHIPR>SHIP',log:['CUT:ok/ok','CNC:ok/ok','HEAT:ok/ok','LAM:ok/ok'],early:'skipped',queue:'LAM,LAM,CUT,CUT',waitingCnc:'2',second:'ok',mates:1,rec:true,
  after:{a:'SHIPR',b:'SHIPR',again:'already',cut:'already'},board:'·'});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
