/* Ламинат из 2–4 стёкол (владелец, 26.11.2026: triple и quad, вариант A —
   «+ Add ply»). Средние стёкла m1/m2 со своими плёнками за ними; у склейки из
   двух стёкол данные прежние (ключей m1/m2 нет). Проверяем окно, цену и
   подпись LAM, раскрой (1a–1d), маршрут, шапку чертежа, стикер и Heat Soak. */
module.exports=async function({page,eq}){
 console.log('lami plies');
 const t=await page(undefined,{width:1500,height:1000});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));
 await run(()=>{window.lpNew=()=>{tab='sales';salesOrderNew('order');salesSetUnitType('single');salesSetPaneCategory(0,'laminated');soOpenSectionKey='lite-0';render();return salesCurrentMakeup().panes[0];};});

 eq('+ Add ply: 1a–1d, промежутки 1a/1b…1c/1d, на четырёх кнопка серая; LAM, цена и толщина — по всем стёклам и плёнкам',await run(()=>{
  const p=lpNew(),two={json:JSON.stringify(Object.keys(p.laminated).sort()),text:salesGlassCodeForPane(p,'code'),price:salesLaminatedPrice(p)};
  document.querySelector('[data-lam-ply-add]').click();document.querySelector('[data-lam-ply-add]').click();
  const q=salesCurrentMakeup().panes[0];
  return {two,sides:salesLamSides(q),off:document.querySelector('[data-lam-ply-add]').disabled,
   titles:[...document.querySelectorAll('.mu-lam-ply-title b')].map(b=>b.textContent),heads:[...document.querySelectorAll('.mu-lam-films-head b')].map(b=>b.textContent),
   text:salesGlassCodeForPane(q,'code'),price:salesLaminatedPrice(q),mm:+salesPaneGlassThicknessMm(q).toFixed(2),plies:salesPanePlies(q).map(x=>x.role)};
 }),{two:{json:'["inner","interlayers","outer"]',text:'LAM 12.38 (6CLEAR + 0.38 EVA-CL + 6CLEAR)',price:12.7},
  sides:['outer','m1','m2','inner'],off:true,titles:['OUTER PLY · 1a','MIDDLE PLY · 1b','MIDDLE PLY · 1c','INNER PLY · 1d'],
  heads:['INTERLAYER 1 · 1a / 1b','INTERLAYER 2 · 1b / 1c','INTERLAYER 3 · 1c / 1d'],
  text:'LAM 25.14 (6CLEAR + 0.38 EVA-CL + 6CLEAR + 0.38 EVA-CL + 6CLEAR + 0.38 EVA-CL + 6CLEAR)',price:28.4,mm:25.14,plies:['outer','m1','m2','inner']});

 eq('плёнки своего промежутка: + Add Film и толщина во втором промежутке не трогают первый; × среднего — следующее встаёт на его место; Save и чтение сохраняют m1/m2',await run(()=>{
  const p=lpNew();salesPaneAddLamPly(0);salesPaneAddLamPly(0);
  salesPaneAddLamInterlayer(0,1);salesPaneSetLamInterlayerLayers(0,'1.1',2);
  const gaps=salesLamGaps(salesCurrentMakeup().panes[0]).map(g=>g.map(f=>f.thicknessMm));
  const L=salesCurrentMakeup().panes[0].laminated,m2=L.m2.glassProductId;salesPaneRemoveLamPly(0,'m1');
  const after={sides:salesLamSides(salesCurrentMakeup().panes[0]),films:salesLamGaps(salesCurrentMakeup().panes[0]).map(g=>g.length),same:L.m1.glassProductId===m2};
  const back=normalizeSalesOrder(JSON.parse(JSON.stringify(soDraft))).makeups[0].panes[0];
  return {gaps,after,back:salesLamSides(back),coat:back.laminated.m1.coatingPosition};
 }),{gaps:[[0.38],[0.38,0.76],[0.38]],after:{sides:['outer','m1','inner'],films:[1,1],same:true},back:['outer','m1','inner'],coat:'in_film'});

 eq('цех: раскрой 1a/1b/1c, маршрут по каждому стеклу, шапка чертежа и стикер — все стёкла и плёнки; Heat Soak среднего — своя строка',await run(()=>{
  const p=lpNew();salesPaneAddLamPly(0);
  const L=p.laminated;L.m1.heatTreatmentId='HT-FT';L.m1.heatSoak=true;
  const l=soDraft.lines[0];l.width16=30*16;l.height16=40*16;l.qty=1;salesEnsureLineShape(l);
  const comps=glassBatchComponents(soDraft,l).map(x=>x.lite);
  const route=salesPrintRoute(l,soDraft).lites.map(x=>x.label);
  const el=document.createElement('div');el.innerHTML=salesSheetMakeupHTML(salesCurrentMakeup(),null);
  const sheet=[...el.querySelectorAll('.mk-row span')].map(s=>s.textContent.split(':')[0]);
  const st=stkUnitData(soDraft,l,1).rows.find(r=>r.kind==='lam'),sticker=stkMakeupRowText(st,{glass:true,film:true});
  const hst=salesGlazingChargeRows(l,10,soDraft).filter(r=>/^HEATSOAK/.test(r.key)).map(r=>[r.key.split(':')[2],r.label]);
  return {comps,route,sheet,sticker,hst};
 }),{comps:['1a','1b','1c'],route:['Lite 1a','Lite 1b','Lite 1c'],sheet:['Lite 1a','film','Lite 1b','film','Lite 1c'],
  sticker:'Clear 6mm + EVA Clear 0.38 mm + Clear 6mm + EVA Clear 0.38 mm + Clear 6mm',hst:[['2','Heat Soak · Lite 1b · 6 mm']]});

 eq('ламинат 2–4 стекла без ошибок страницы',t.errs,[]);await t.c.close();
};
