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
 }),{step:true,sizes:['15 1/8″ × 20″','25 1/8″ × 33 1/4″'],big:1,edges:['A 10'],sheets:[0,1],row:[1,'pc',0],hidden:false,shown:5,igu:[true,true]});
 eq('нет ступеньки: одинаковый отступ у обоих лайтов и обычный юнит — без Step Unit',await t.p.evaluate(()=>{
  const check=l=>[salesLineStepInfo(l,soDraft).step,salesLineChargeRows(l).some(r=>r.key==='SURCHARGE:step-unit')];
  return [check(suOrder({'0':{inset:{A:'1'},edgeOps:{},mirror:false},'1':{inset:{A:'1'},edgeOps:{},mirror:false}})),check(suOrder(null))];
 }),[[false,false],[false,false]]);
 eq('чертёж юнита: у меньшего лайта свои размеры по рёбрам — высота, ширина, диагональ; ребро, совпавшее с юнитом, без второго размера; прямоугольник с отступом слева — ширина и высота по разу, без дублей; свой лист у каждого стекла, у большего — без пунктира',await t.p.evaluate(()=>{
  const line=suOrder({'0':{inset:{A:'10'},edgeOps:{},mirror:false}}),d=suDoc(salesLineDrawing(line).html);
  const ls=salesLineDrawing(line,null,0),ld=suDoc(ls.html),bs=suDoc(salesLineDrawing(line,null,1).html);
  const dims=[...d.querySelectorAll('.shape-step-dim')].map(g=>g.querySelector('text').textContent).sort();
  const rd=suDoc(salesLineDrawing(suOrder({'0':{inset:{A:'2'},edgeOps:{},mirror:false}},'',true)).html);
  return {dims,lite:!!d.querySelector('.shape-step-lite'),rect:[...rd.querySelectorAll('.shape-step-dim')].length,
   sheet:[ls.lite,ld.querySelector('.sheet-lite').textContent,ld.querySelector('.sheet-size').textContent,!!ld.querySelector('.shape-step-lite')],
   big:[bs.querySelector('.sheet-lite').textContent,bs.querySelector('.sheet-size').textContent,!!bs.querySelector('.shape-step-lite,.shape-step-dim')]};
 }),{dims:['15 1/8','20','25 1/16'],lite:true,rect:2,sheet:[0,'Glass: Lite 1 of 2','Finished 15 1/8″ × 20″',false],big:['Glass: Lite 2 of 2','Finished 25 1/8″ × 33 1/4″',false]});
 eq('схема лайтов: меньший лайт и камера короче, у камеры «Step · Flat seal», отдельного разреза нет; Edge to edge — клин на ступеньке',await t.p.evaluate(()=>{
  const line=suOrder({'0':{inset:{A:'10'},edgeOps:{},mirror:false}}),d=suDoc(salesLineDrawing(line).html),sm=[...d.querySelectorAll('.mk-smaller')].map(x=>x.className.split(' ')[0]);
  const e=suDoc(salesLineDrawing(suOrder({'0':{inset:{A:'10'},edgeOps:{},mirror:false}},'edge')).html);
  return {sm,cav:d.querySelector('.mk-cav').parentElement.textContent.includes('Step · Flat seal'),section:!!d.querySelector('.sheet-step,.sheet-step-section'),
   flat:!!d.querySelector('.mk-step-seal'),edge:e.querySelector('.mk-step-seal').className,edgeText:e.textContent.includes('Step · Edge to edge seal')};
 }),{sm:['mk-pane','mk-cav'],cav:true,section:false,flat:false,edge:'mk-step-seal edge top',edgeText:true});
 eq('редактор формы: у юнита с оффсетом Print / PDF ▾ — Unit, Lite 1, Lite 2, All · 3; печать лайта — лист этого стекла, All — юнит и все стёкла; у обычного юнита — одна кнопка',await t.p.evaluate(()=>{
  const old=printSheet,got=[];printSheet=function(h){got.push([].concat(h));return true;};
  const box=()=>{const d=document.createElement('div');d.innerHTML=shapePrintButtonHTML();return d;};
  try{
   suOrder({'0':{inset:{A:'10'},edgeOps:{},mirror:false}});salesOrderConfigureShape(0);sView='production';
   const btn=box().querySelector('.shape-print-btn').textContent;sPrintMenu=true;const menu=[...box().querySelectorAll('[data-shape-print-menu] button')].map(b=>b.textContent);
   shapePrintDrawing(0);shapePrintDrawing('all');const one=suDoc(got[0][0]).querySelector('.sheet-lite').textContent,all=got[1].map(h=>{const x=suDoc(h).querySelector('.sheet-lite');return x?x.textContent:'unit';});
   suOrder(null);salesOrderConfigureShape(0);sView='production';const plain=box().querySelector('.shape-print-btn').textContent;
   return {btn,menu,closed:sPrintMenu,one,all,plain};
  }finally{printSheet=old;tab='sales';sEdit=null;sDraft=null;salesBridge=null;}
 }),{btn:'Print / PDF ▾',menu:['Unit','Lite 1','Lite 2','All · 3'],closed:false,one:'Glass: Lite 1 of 2',all:['unit','Glass: Lite 1 of 2','Glass: Lite 2 of 2'],plain:'Print / PDF'});
 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
