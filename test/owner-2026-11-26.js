/* Правки владельца 26.11.2026 по небольшому тестированию: вставка из Excel в
   миллиметрах (до 1/16″ по его формуле =ROUND(mm/25.4*16,0)); подпись плёнки
   на чертеже — только общая толщина; ромбы frit «2 x 2 diamond» и
   «4 x 4 diamond» (бывший «2 x 4 diamond»); таблица замеров Stock item не
   съезжает после выбора вида и «+ Measurement». */
module.exports=async function({page,eq}){
 console.log('owner 2026-11-26');
 const t=await page(undefined,{width:1500,height:1000});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));

 eq('Paste в мм: 762 → 30″, 1830 → 72 1/16″, запятая — десятичная; дюймы в режиме mm — ошибка; Add кладёт дюймы; новый заказ — снова in',await run(()=>{
  tab='sales';salesOrderNew('order');salesExcelOpen();salesExcelSetUnit('mm');
  soExcelRows=[{mu:'',set:'',qty:'2',width:'762',height:'2045',mark:'A1'},{mu:'',set:'',qty:'1',width:'1219',height:'1830',mark:'A2'},
   {mu:'',set:'',qty:'1',width:'915,5',height:'2134',mark:'A3'},{mu:'',set:'',qty:'1',width:'30 1/2',height:'800',mark:'bad'}];render();
  const head=[...document.querySelectorAll('#salesExcelGrid th')].map(h=>h.textContent.trim()).filter(Boolean);
  const res=[...document.querySelectorAll('#salesExcelGrid td.res')].slice(0,4).map(td=>td.textContent.trim());
  const on=document.querySelector('.excel-unit button.on').textContent;
  salesExcelApply();const lines=soDraft.lines.map(l=>[l.width16/16,l.height16/16,l.mark]);
  salesOrderNew('order');const back=soExcelMm;
  return {head,res,on,lines,back};
 }),{head:['#','Qty','Width, mm','Height, mm','Mark','Result'],
  res:['2 × 30″ × 80 1/2″mm 762 → 30 · 2045 → 80 1/2','1 × 48″ × 72 1/16″mm 1219 → 48 · 1830 → 72 1/16','1 × 36 1/16″ × 84″mm 915,5 → 36 1/16 · 2134 → 84','Width is not mm'],
  on:'mm',lines:[[30,80.5,'A1'],[48,72.0625,'A2'],[36.0625,84,'A3']],back:false});

 eq('чертёж: плёнка — только общая толщина, без числа слоёв',await run(()=>
  salesSheetFilmText({productId:'',layers:4,thicknessMm:1.52})),'1.52 mm ');

 eq('frit: 2 x 2 diamond и 4 x 4 diamond; старое «2 x 4 diamond» читается как 4 x 4',await run(()=>{
  const p=salesDefaultPane(0);p.visionType='frit';
  const old=normalizeFritSpec({pattern:'2 x 4 diamond'},p.frit),lam=normalizeSalesLaminatedFrit({pattern:'2 x 4 diamond'});
  return {list:FRIT_PATTERNS,old:old.pattern,lam:lam.pattern,small:SALES_FRIT_PATTERNS['2 x 2 diamond'],big:SALES_FRIT_PATTERNS['4 x 4 diamond']};
 }),{list:['2 x 2 square','4 x 4 square','2 x 2 diamond','4 x 4 diamond','Custom — see silk screen sheet'],old:'4 x 4 diamond',lam:'4 x 4 diamond',
  small:{dx:2,dy:1,stag:true},big:{dx:4,dy:2,stag:true}});

 eq('Stock item → Measurements: после вида Door и «+ Measurement» ячеек в строке столько же, сколько в шапке; имя — под Measurement',await run(()=>{
  tab='masterdata';mdCatalogGo('stockItem');mdCatNew();
  document.querySelector('[data-md-kind="door"]').click();mdStockMeasureAdd();
  const tb=document.querySelector('[data-md-measures] table'),n=tb.querySelectorAll('thead th').length;
  const rows=[...tb.querySelectorAll('tbody tr[data-md-measure]')];
  const nameCol=[...tb.querySelectorAll('thead th')].findIndex(th=>th.textContent.trim()==='Measurement');
  const at=[...rows[0].children].findIndex(td=>td.querySelector('[data-k="name"]'));
  mdCatEdit=null;mdCatDraft=null;render();
  return {rows:rows.length,same:rows.every(r=>r.children.length===n),nameUnderHead:at===nameCol};
 }),{rows:4,same:true,nameUnderHead:true});

 /* Отклик чертежа: проверка самопересечения отсекает пары по габариту и помнит
    ответ для того же контура — ответ обязан совпасть с полным перебором. */
 eq('самопересечение: быстрая проверка = полный перебор на 300 случайных контурах; повтор из памяти — тот же ответ',await run(()=>{
  const naive=P=>{const n=P.length;if(n<4)return false;for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;if(fabSegCross(P[i],P[(i+1)%n],P[j],P[(j+1)%n]))return true;}return false;};
  let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;let bad=0,yes=0;
  for(let k=0;k<300;k++){const n=4+Math.floor(rnd()*60),P=[];
   if(k%3===0)for(let i=0;i<n;i++){const a=2*Math.PI*i/n,r=10+rnd()*2;P.push([r*Math.cos(a),r*Math.sin(a)]);}
   else for(let i=0;i<n;i++)P.push([Math.round(rnd()*40),Math.round(rnd()*40)]);
   const want=naive(P);if(want)yes++;if(fabPolySelfIntersects(P)!==want||fabPolySelfIntersects(P.map(q=>q.slice()))!==want)bad++;}
  return {bad,mixed:yes>50&&yes<250};
 }),{bad:0,mixed:true});

 eq('правки 26.11 без ошибок страницы',t.errs,[]);await t.c.close();
};
