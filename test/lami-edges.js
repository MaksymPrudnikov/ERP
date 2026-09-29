/* Кромка ламината: отделка до закалки и отделка после склейки. Владелец,
   29.09.2026: «CNC Shape Polish, закалка, ламинирование и после CNC Lami
   Polish»; вариант B — плиты режут с припуском 1/4″ (как одинарное стекло),
   первый проход сразу в чистовой размер, после склейки кромку только
   выравнивают. Внутри группы по-прежнему одна отделка. */
module.exports=async function({page,eq,ok}){
 console.log('lami-edges');const t=await page();
 await require('./optimization-fixture')(t.p);

 eq('ламинат 6+6: CNC Shape Polish + CNC Lami Polish на одной кромке — рез 1/4″ на кромку, маршрут CNC › HEAT › LAM › CNC «align only», обе работы в счёте; Arris + Lami — рез по лами, без «align only»; две отделки одной группы — ошибка',await t.p.evaluate(()=>{
  oqReset();
  const run=ops=>{
   const id=oqOrder(oqCustomer({legalName:'North Shore Windows'}));salesOrderEdit(id);
   const line=soDraft.lines[0],m=salesMakeupById(soDraft,line.makeupId),g=mm=>(DB.glassProduct||[]).find(x=>+x.thicknessMm===mm);
   const pn=salesDefaultPane(0);pn.category='laminated';['outer','inner'].forEach(k=>{pn.laminated[k].glassProductId=g(6).id;pn.laminated[k].thicknessMm=6;pn.laminated[k].heatTreatmentId='HT-FT';});
   m.unitType='single';m.panes=[normalizeSalesPane(pn,0)];m.cavities=[];soDraft.lines=[line];
   const s=salesLineGeometryShape(line);['A','B','C','D'].forEach(k=>{s.edgeOps[k]=ops.map(x=>shapeNormalizeOp({type:x}));});
   const plan=salesEffectiveCuttingPlan(line,salesLineGeometryShape(line),soDraft),r=salesPrintRoute(line,soDraft,salesLineGeometryShape(line),null);
   const charges=salesLineChargeRows(line).filter(x=>String(x.key).indexOf('EDGE:')===0).map(x=>x.key.split(':')[1]).join();
   soDraft=null;soEdit=null;
   return plan.valid?{cut:[plan.cutW-plan.finishedW,plan.cutH-plan.finishedH].join('x'),route:r.lites[0].stations.map(x=>x.code+(x.items&&x.items.length&&x.code!=='CUT'?'['+x.items.join('; ')+']':'')).join(' > '),charges}:{error:plan.reason};
  };
  return {cnc:run(['CNC Shape Polish','CNC Lami Polish']),flat:run(['Flat Polish','Lami Polish']),arris:run(['Rough Arris','Lami Polish']),
   plate:run(['Flat Polish','CNC Shape Polish']).error,lami:run(['Lami Polish','CNC Lami Polish']).error};
 }),{cnc:{cut:'0.5x0.5',route:'CUT > CNC[CNC Shape Polish] > HEAT[TEMPERING] > LAM[Lamination] > CNC[CNC Lami Polish · align only]',charges:'cncShapePolish,cncLamiPolish'},
  flat:{cut:'0.125x0.125',route:'CUT > POLISH[Flat Polish] > HEAT[TEMPERING] > LAM[Lamination] > POLISH[Lami Polish · align only]',charges:'flatPolish,lamiPolish'},
  arris:{cut:'0.125x0.125',route:'CUT > ARRIS[Rough Arris] > HEAT[TEMPERING] > LAM[Lamination] > POLISH[Lami Polish]',charges:'roughArris,lamiPolish'},
  plate:'Edge A: Rough Arris, Flat Polish and CNC Shape Polish are mutually exclusive finishes.',lami:'Edge A: Lami Polish and CNC Lami Polish are mutually exclusive finishes.'});

 eq('переключатель отделки: лами-полировка не снимает полировку плит, другая полировка плит заменяет прежнюю; «вся кромка» видит обе',await t.p.evaluate(()=>{
  const names=l=>l.map(o=>o.type).join('+');
  const a=shapeTogglePrimaryFinish([shapeNormalizeOp({type:'CNC Shape Polish'})],'CNC Lami Polish',true),b=shapeTogglePrimaryFinish(a,'Flat Polish',true),c=shapeTogglePrimaryFinish(b,'Lami Polish',true);
  return {a:names(a),b:names(b),c:names(c),has:[shapeEdgeHasFinish(c,'Flat Polish'),shapeEdgeHasFinish(c,'Lami Polish'),shapeEdgeHasFinish(c,'CNC Lami Polish')].join()};
 }),{a:'CNC Shape Polish+CNC Lami Polish',b:'CNC Lami Polish+Flat Polish',c:'Flat Polish+Lami Polish',has:'true,true,false'});

 eq('таблица припуска: CNC Shape Polish по плите ламината — 1/4″; сохранённое заводское 1/16 правится, своё значение цеха остаётся',await t.p.evaluate(()=>{
  const seed=DB.edgeAllowance.filter(r=>/^ALW-CNCSHAPEPOLISH-LAMI/.test(r.id)).map(r=>r.allowance).join();
  const old=JSON.parse(JSON.stringify(DB));old.dataFix=4;
  old.edgeAllowance.find(r=>r.id==='ALW-CNCSHAPEPOLISH-LAMI-3-6').allowance='1/16';old.edgeAllowance.find(r=>r.id==='ALW-CNCSHAPEPOLISH-LAMI-8-1000').allowance='3/32';
  const next=prepareImportedState(old);
  return {seed,fixed:next.edgeAllowance.find(r=>r.id==='ALW-CNCSHAPEPOLISH-LAMI-3-6').allowance,own:next.edgeAllowance.find(r=>r.id==='ALW-CNCSHAPEPOLISH-LAMI-8-1000').allowance,fix:next.dataFix};
 }),{seed:'1/4,1/4',fixed:'1/4',own:'3/32',fix:5});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
