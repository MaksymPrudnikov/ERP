/* Clean cut — стекло без обработки кромки (владелец, 26.11.2026, №7
   тестирования): × у кромки в Services — работы нет совсем; Clean cut — без
   строки в счёте и без станции кромки; Clear AR → AR · Clean cut; калёное с
   Clean cut — предупредить, но сохранить. */
module.exports=async function({page,eq}){
 console.log('clean cut');
 const t=await page(undefined,{width:1500,height:1000});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));
 await run(()=>{window.ccLine=heat=>{tab='sales';salesOrderNew('order');salesSetUnitType('single');soDraft.makeups[0].panes[0].heatTreatmentId=heat;
  const l=soDraft.lines[0];l.width16=30*16;l.height16=40*16;l.qty=1;salesEnsureLineShape(l);return l;};
  window.ccEdge=l=>salesLineChargeRows(l).filter(r=>/^EDGE/.test(r.key)).map(r=>r.key.split(':')[1]+' '+r.basis);
  window.ccRoute=l=>salesPrintRoute(l,soDraft).lites.map(x=>x.stations.map(s=>s.code).join('>')).join('|');});

 eq('× у Rough Arris в Services: строки ариса нет, станции ARRIS нет, кромки — Clean cut; новая форма — снова базовый арис',await run(()=>{
  const l=ccLine('HT-AN'),before=[ccEdge(l),ccRoute(l)];
  soServiceLineId=l.id;render();document.querySelector('[data-edge-remove]').click();soServiceLineId=null;
  const s=salesShapeByRef(l.shapeRef),snap=salesEffectiveProductionSnapshot(l,null,soDraft);
  const after=[ccEdge(l),ccRoute(l),s.edgeClean.length,[...new Set(snap.groups.map(g=>g.source))]];
  const fresh=ccLine('HT-AN');
  return {before,after,fresh:ccEdge(fresh)};
 }),{before:[['roughArris 140'],'CUT>ARRIS'],after:[[],'CUT',4,['Clean cut']],fresh:['roughArris 140']});

 eq('× у митры снимает только митру, арис остаётся; × у полировки толстого стекла — Clean cut',await run(()=>{
  const l=ccLine('HT-AN'),s=salesShapeByRef(l.shapeRef),g=salesShapePhysicalEdges(s)[0];
  s.edgeOps={[g.id]:[shapeNormalizeOp({type:'Rough Arris'}),shapeNormalizeOp({type:'Mitering',angle:45,side:'back'})]};
  const key=salesLineChargeRows(l).find(r=>/^EDGE:miter45/.test(r.key)).key;salesRemoveEdgeCharge(l.id,key);
  const mit=[ccEdge(l),(salesShapeByRef(l.shapeRef).edgeClean||[]).length];
  const p=soDraft.makeups[0].panes[0],g10=activeGlassProducts().find(x=>+x.thicknessMm===10&&x.coatingFamily==='uncoated');
  if(g10){p.glassProductId=g10.id;p.thicknessMm=10;}
  const l2=soDraft.lines[0];const k=salesLineChargeRows(l2).find(r=>/^EDGE:/.test(r.key)&&!/roughArris/.test(r.key));
  return {mit,polish:g10?(k&&k.key.split(':')[1])+'→'+(salesRemoveEdgeCharge(l2.id,k.key),ccEdge(l2).filter(x=>/flatPolish/.test(x)).length):'no 10mm'};
 }),{mit:[['roughArris 140'],0],polish:'flatPolish→0'});

 eq('Edgework: AR · Clean cut ставит метку на все кромки и подсвечен, подсказка кромки «clean cut»; AR · Arris метку снимает',await run(()=>{
  const l=ccLine('HT-AN');salesOrderConfigureShape(0);sView='production';sEdgeworkOpen=true;render();
  document.querySelector('[data-ar-clean]').click();
  const on=document.querySelector('[data-ar-clean]').classList.contains('on'),n=(sDraft.edgeClean||[]).length,hint=[...document.querySelectorAll('.shape-edge-base')].map(x=>x.textContent);
  shapeProdApplyConfiguredAR('Rough Arris');
  return {on,n,hint:[...new Set(hint)],off:(sDraft.edgeClean||[]).length,label:document.querySelector('[data-ar-clean]').textContent};
 }),{on:true,n:4,hint:['clean cut'],off:0,label:'AR · Clean cut'});

 eq('калёное с Clean cut: жёлтая строка в Edgework и вопрос при Save — сохранить можно; у AN вопроса нет',await run(()=>{
  const l=ccLine('HT-FT');salesOrderConfigureShape(0);sView='production';sEdgeworkOpen=true;render();
  shapeProdClearConfiguredAR();const note=(document.querySelector('[data-clean-cut-note]')||{}).textContent||'';
  saveShape();const ft=salesCleanCutWarnings(soDraft);
  soDraft.makeups[0].panes[0].heatTreatmentId='HT-AN';const an=salesCleanCutWarnings(soDraft);
  return {note,ft,an};
 }),{note:'Heat-treated · 4 edges without edgework',ft:['Line 1 · Lite 1: heat-treated glass, 4 edges without edgework (Clean cut).'],an:[]});

 eq('Clean cut без ошибок страницы',t.errs,[]);await t.c.close();
};
