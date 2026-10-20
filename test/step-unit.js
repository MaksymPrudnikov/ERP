/* Ступенчатый юнит (владелец, 20.10.2026): лайты одного юнита разного
   размера. Строка прайса Step Unit с ценой 0 (клиент её не видит, пока цена
   0), пункт «Step unit · Flat seal» в сборке, на чертеже юнита меньший лайт
   пунктиром со своими размерами по рёбрам, в схеме лайтов — короче полоса и
   шов у камеры, без отдельного разреза. Фигура — прямоугольный треугольник
   владельца 25 1/8 × 33 1/4, Lite 1 отступает от вертикального ребра на 10. */
module.exports=async function({page,eq}){
 console.log('step-unit');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.suOrder=function(inset,seal,rect){
   const id=oqOrder(oqCustomer());salesOrderEdit(id);const sh=salesLineGeometryShape(soDraft.lines[0]);
   if(!rect){sh.type='triangle';sh.w='25 1/8';sh.h='33 1/4';sh.params=Object.assign({},sh.params,{topOffset:'0'});Object.assign(sh,normalizeShapeDef(sh));}
   if(inset)sh.lites=inset;if(seal)sh.stepSeal=seal;salesOrderSave();return soDraft.lines[0];
  };
  window.suText=function(el){return [...el.querySelectorAll('text')].map(x=>x.textContent).join(' ');};
  window.suDoc=function(html){const d=document.createElement('div');d.innerHTML=html;return d;};
 });
 eq('ступенька: размеры лайтов, больший — Lite 2, Step Unit по прайсу 0 за юнит, клиент её не видит; с ценой — видит; IGU — «Step unit · Flat seal»',await t.p.evaluate(()=>{
  const line=suOrder({'0':{inset:{A:'10'},edgeOps:{},mirror:false}}),info=salesLineStepInfo(line,soDraft);
  const row=salesLineChargeRows(line).find(r=>r.key==='SURCHARGE:step-unit');
  const route=salesPrintRoute(line,soDraft,salesLineGeometryShape(line),ShapeModule.compute(salesLineGeometryShape(line)));
  const sheets=salesLineStepSheets(line,soDraft),hidden=docServiceRows(line).some(r=>r.key==='SURCHARGE:step-unit');
  salesServiceRateRow('stepUnit').flat=5;const priced=suOrder({'0':{inset:{A:'10'},edgeOps:{},mirror:false}}),shown=docServiceRows(priced).find(r=>r.key==='SURCHARGE:step-unit');salesServiceRateRow('stepUnit').flat=0;
  return {step:info.step,sizes:info.lites.map(l=>dimIn16(l.w)+' × '+dimIn16(l.h)),big:info.big,edges:info.edges.map(e=>e.id+' '+e.step),sheets,
   row:[row.basis,row.unit,row.catalogRate],hidden,shown:shown&&shown.value,igu:route.lites.map(l=>l.stations.find(s=>s.code==='IGU').items.includes('Step unit · Flat seal'))};
 }),{step:true,sizes:['15 1/8″ × 20″','25 1/8″ × 33 1/4″'],big:1,edges:['A 10'],sheets:[0],row:[1,'pc',0],hidden:false,shown:5,igu:[true,true]});
 eq('нет ступеньки: одинаковый отступ у обоих лайтов и обычный юнит — без Step Unit',await t.p.evaluate(()=>{
  const check=l=>[salesLineStepInfo(l,soDraft).step,salesLineChargeRows(l).some(r=>r.key==='SURCHARGE:step-unit')];
  return [check(suOrder({'0':{inset:{A:'1'},edgeOps:{},mirror:false},'1':{inset:{A:'1'},edgeOps:{},mirror:false}})),check(suOrder(null))];
 }),[[false,false],[false,false]]);
 eq('чертёж юнита: у меньшего лайта свои размеры по рёбрам — высота, ширина, диагональ; ребро, совпавшее с юнитом, без второго размера; прямоугольник с отступом слева — три размера; у меньшего стекла свой лист',await t.p.evaluate(()=>{
  const line=suOrder({'0':{inset:{A:'10'},edgeOps:{},mirror:false}}),d=suDoc(salesLineDrawing(line).html);
  const ls=salesLineDrawing(line,null,0),ld=suDoc(ls.html);
  const dims=[...d.querySelectorAll('.shape-step-dim')].map(g=>g.querySelector('text').textContent).sort();
  const rd=suDoc(salesLineDrawing(suOrder({'0':{inset:{A:'2'},edgeOps:{},mirror:false}},'',true)).html);
  return {dims,lite:!!d.querySelector('.shape-step-lite'),rect:[...rd.querySelectorAll('.shape-step-dim')].length,
   sheet:[ls.lite,ld.querySelector('.sheet-lite').textContent,ld.querySelector('.sheet-size').textContent,!!ld.querySelector('.shape-step-lite')]};
 }),{dims:['15 1/8','20','25 1/16'],lite:true,rect:3,sheet:[0,'Glass: Lite 1 of 2','Finished 15 1/8″ × 20″',false]});
 eq('схема лайтов: меньший лайт и камера короче, у камеры «Step · Flat seal», отдельного разреза нет; Edge to edge — клин на ступеньке',await t.p.evaluate(()=>{
  const line=suOrder({'0':{inset:{A:'10'},edgeOps:{},mirror:false}}),d=suDoc(salesLineDrawing(line).html),sm=[...d.querySelectorAll('.mk-smaller')].map(x=>x.className.split(' ')[0]);
  const e=suDoc(salesLineDrawing(suOrder({'0':{inset:{A:'10'},edgeOps:{},mirror:false}},'edge')).html);
  return {sm,cav:d.querySelector('.mk-cav').parentElement.textContent.includes('Step · Flat seal'),section:!!d.querySelector('.sheet-step,.sheet-step-section'),
   flat:!!d.querySelector('.mk-step-seal'),edge:e.querySelector('.mk-step-seal').className,edgeText:e.textContent.includes('Step · Edge to edge seal')};
 }),{sm:['mk-pane','mk-cav'],cav:true,section:false,flat:false,edge:'mk-step-seal edge top',edgeText:true});
 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
