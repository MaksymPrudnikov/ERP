/* =====================================================================
   erp/documents/drawing-form  ·  drawing-1.0
   Лист чертежа стекла на конструкторе форм (Data → Company & print →
   Forms → Drawing; вариант A владельца, 06.11.2026). Настраивает офис или
   владелец, цех доступа к Data не имеет.
   IN : шаблон формы drawing — шапка (head) и низ (foot) из блоков, вид
        чертежа (style); поля листа (salesShapeSheetHTML)
   OUT: разметка шапки и низа листа, переменные вида, единицы и кегли на
        время отрисовки чертежа
   Лист — HTML (sales/print-sheet), а не docPage: состав, маршрут и SVG
   чертежа так и рисует код. Поэтому шапка и низ набираются той же
   разметкой, что и раньше: шаблон по умолчанию даёт ровно прежний лист.
   Блоки text / field; place left | center | right — колонка строки (в
   колонке блоки идут сверху вниз), free — своё место x, y от угла
   строки; y у колонки — сдвиг вниз. Размеры в pt, как в конструкторе.
   ===================================================================== */

/* Вид чертежа по умолчанию — правила 28.09.2026: размеры кеглем 18,
   подписи уклона 16, белая подложка под подписью. Пустой цвет и толщина —
   как сейчас: линии серые, текст чёрный (CSS листа). Лист книжный
   (владелец, 06.11.2026: «по умолчанию портрет, но настройка того и того
   вида нужна»). */
const DRAW_STYLE_DEFAULT={paper:'portrait',size:100,units:'in16',alt:'',dimSize:18,noteSize:16,bg:true,
 edge:'',line:'',arrow:'',feature:'',text:'',label:'',ftext:'',altColor:'',edgeW:0,lineW:0,featureW:0,labelSize:0,serviceSize:0,
 showQty:true,showFinished:true,showMass:true,showLine:true,showNote:true,showScheme:true,showRoute:true,
 infoPlace:'top',routePlace:'bottom'};
/* Что показывать в частях, которые рисует программа (галочки Info / Route):
   ключ, подпись, класс листа «спрятать». */
const DRAW_SHOW=[['showQty','Qty','dw-no-qty','info'],['showFinished','Finished size','dw-no-finished','info'],['showMass','sq ft · kg','dw-no-mass','info'],
 ['showLine','LINE','dw-no-line','info'],['showNote','NOTE','dw-no-note','info'],['showScheme','Makeup scheme','dw-no-scheme','info'],['showRoute','Route','dw-no-route','route']];
/* + Picture у листа чертежа — логотип из Data → Company, если он есть;
   иначе выбор файла, как в других бланках. */
function drawFormAddPicture(){
 if(!(DB.company&&DB.company.logo))return false;
 formsAddBlock(()=>({type:'image',field:'company.logo',place:'left',w:120,h:28}));return true;
}
const DRAW_UNITS=[['in16','Inches · 1/16'],['in','Decimal inches'],['mm','mm']];
/* Что на чертеже красится отдельно: ключ стиля, подпись, цвет как сейчас
   (переменная CSS листа), ключ толщины линии, ключ кегля подписи. Сервисы —
   отверстия, фурнитура, вырезы: их значки, подписи и размеры (владелец,
   06.11.2026: «управление размеров сервисов тоже на чертеже»). */
const DRAW_LOOK=[
 ['edge','Glass edge','#7b858f','edgeW',''],
 ['line','Dimension lines','#7b858f','lineW',''],
 ['arrow','Arrows','#1d2328','',''],
 ['feature','Services · marks','#7b858f','featureW',''],
 ['text','Numbers','#14181c','',''],
 ['label','Edge work, radius','#14181c','','labelSize'],
 ['ftext','Services · labels, sizes','#14181c','','serviceSize'],
 ['altColor','Second units','#7b858f','','']];
/* Шапка: заказчик слева, PO по центру, номер заказа справа (владелец);
   кегль 12 pt = прежние 16px. Низ: подпись стекла из батча слева, дата
   справа (7.5px и 10px прежнего листа). */
const DRAW_HEAD_SIZE=12,DRAW_FOOT_SIZE=5.63,DRAW_TAG_SIZE=7.5;
/* Поля листа — поля печати 9 мм (@page в modules.css): x блока Free — от
   края бумаги, как на линейке конструктора. */
const DRAW_MARGIN=25.51;
function drawFormDefault(){
 const m=DRAW_MARGIN;
 return {form:'drawing',page:{w:612,h:792,margin:{top:m,right:m,bottom:m,left:m}},style:Object.assign({},DRAW_STYLE_DEFAULT),parts:{
  head:{h:0,blocks:[
   {id:'customer',type:'field',field:'customer',prefix:'Customer:',place:'left',y:0,size:DRAW_HEAD_SIZE,bold:true},
   {id:'po',type:'field',field:'customerPo',prefix:'PO:',place:'center',y:0,size:DRAW_HEAD_SIZE,bold:true},
   {id:'order',type:'field',field:'order',prefix:'Order Number:',place:'right',y:0,size:DRAW_HEAD_SIZE,bold:true}]},
  info:{lines:true},
  drawing:{},
  route:{lines:true},
  foot:{h:0,blocks:[
   {id:'tag',type:'field',field:'tag',place:'left',y:0,size:DRAW_TAG_SIZE,bold:true},
   {id:'date',type:'text',text:'{date} · 1 / 1',place:'right',y:0,size:DRAW_FOOT_SIZE}]}}};
}
function drawFormFields(){
 const f=(g,k,label)=>({g,k,label});
 const d=(g,k,label)=>({g,k,label,t:'date'});
 return [f('Order','customer','Customer'),f('Order','customerPo','PO'),f('Order','order','Order Number'),d('Order','dueDate','Due date'),d('Order','date','Date printed'),
  f('Line','line','Line'),f('Line','glass','Glass / Makeup'),f('Line','spec','Makeup spec'),f('Line','qty','Qty'),
  f('Line','finished','Finished size'),f('Line','mass','sq ft · kg'),f('Line','note','Note'),f('Line','tag','Glass tag (batch)'),
  f('Prices','unitPrice','Unit price'),f('Prices','linePrice','Line total'),f('Prices','materialsPrice','Materials')].concat(formCompanyFields(),formMyFields());
}
/* Черновик конструктора — на время живого листа; у заказа из архива — вид
   на день его ухода (drawFrozenOf); иначе сохранённый. Заказ — по умолчанию
   заказ чертежа (salesSheetOrder): строка чужого заказа рисуется с ним. */
let drawFormPreview=null,drawSheetLastFields={};
function drawFormTpl(o){
 if(drawFormPreview)return drawFormPreview.tpl;
 const f=drawFrozenOf(o===undefined?salesSheetOrder():o);if(f)return f.tpl;
 return formClean(DB.formTemplate&&DB.formTemplate[formUseKey('drawing')],drawFormDefault());
}
/* ----------------------- Вид на день архивации ----------------------- */
/* Владелец, 06.11.2026: «в заказе, который заархивирован, чертёж не
   меняется, чтобы случайно ничего не изменить». При уходе в архив
   (archiveRun) запоминаются шаблон Drawing и данные компании — одна запись
   на каждый вид (ключ — хеш), строка указателя архива хранит ключ. Заказ,
   ушедший раньше, печатается видом по умолчанию: другого у него не было.
   Вернули в работу (archiveReturn) — снова нынешний вид. */
DEFAULT.drawingFrozen={};
function drawFrozenKeep(){
 const v={tpl:formClean(DB.formTemplate&&DB.formTemplate[formUseKey('drawing')],drawFormDefault()),company:JSON.parse(JSON.stringify(DB.company||{}))};
 const key='D'+sha256Hex(JSON.stringify(v)).slice(0,16),all=DB.drawingFrozen&&typeof DB.drawingFrozen==='object'?DB.drawingFrozen:{};
 if(!all[key])DB.drawingFrozen=Object.assign({},all,{[key]:v});
 return key;
}
function drawFrozenOf(o){
 if(!o||typeof archiveViewing!=='function'||!archiveViewing(o))return null;
 const a=typeof archiveIndex!=='undefined'&&archiveIndex.get(o.id);if(!a)return null;
 const f=a.drawing&&DB.drawingFrozen&&DB.drawingFrozen[a.drawing];
 return f?{tpl:formClean(f.tpl,drawFormDefault()),company:f.company&&typeof f.company==='object'?f.company:{}}:{tpl:drawFormDefault(),company:null};
}
/* Записи вида — чистые: ключ D + 16 знаков, шаблон через formClean. */
function normalizeDrawingFrozen(){
 const src=DB.drawingFrozen&&typeof DB.drawingFrozen==='object'&&!Array.isArray(DB.drawingFrozen)?DB.drawingFrozen:{},out={};
 Object.keys(src).forEach(k=>{const v=src[k];if(/^D[0-9a-f]{16}$/.test(k)&&v&&typeof v==='object')out[k]={tpl:formClean(v.tpl,drawFormDefault()),company:v.company&&typeof v.company==='object'&&!Array.isArray(v.company)?v.company:{}};});
 DB.drawingFrozen=out;
}
/* Вид — чистый: перечисления, цвета #rrggbb, числа в пределах. */
function drawStyle(tpl){
 const s=Object.assign({},DRAW_STYLE_DEFAULT,(tpl||drawFormTpl()).style||{}),d=DRAW_STYLE_DEFAULT,o={};
 const units=v=>DRAW_UNITS.some(u=>u[0]===v)?v:'';
 const num=(v,lo,hi,def)=>{const n=Number(v);return Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):def;};
 o.paper=s.paper==='landscape'?'landscape':'portrait';
 o.size=num(s.size,40,100,100);o.units=units(s.units)||'in16';o.alt=units(s.alt);if(o.alt===o.units)o.alt='';
 DRAW_SHOW.forEach(([k])=>{o[k]=s[k]!==false;});
 o.infoPlace=s.infoPlace==='bottom'?'bottom':'top';o.routePlace=s.routePlace==='top'?'top':'bottom';
 o.dimSize=num(s.dimSize,8,40,d.dimSize);o.noteSize=num(s.noteSize,8,40,d.noteSize);o.bg=s.bg!==false;
 DRAW_LOOK.forEach(([k,,,w,z])=>{o[k]=/^#[0-9a-f]{6}$/i.test(s[k]||'')?String(s[k]).toLowerCase():'';if(w)o[w]=num(s[w],0,12,0);if(z)o[z]=num(s[z],0,40,0);});
 return o;
}
/* Корень листа: классы и переменные только для изменённого — лист по
   умолчанию остаётся прежней разметкой. */
function drawSheetRootAttrs(st,tpl){
 const cls=[],vars=[];
 /* Блок под чертежом (слой ниже нуля) не уходит под бумагу. */
 if(tpl&&['head','foot'].some(k=>((tpl.parts[k]||{}).blocks||[]).some(b=>b.z<0)))vars.push('isolation:isolate');
 if(st.paper==='landscape')cls.push('dw-land');
 if(!st.bg)cls.push('dw-nobg');
 DRAW_SHOW.forEach(([k,,c])=>{if(!st[k])cls.push(c);});
 if(st.infoPlace==='bottom')cls.push('dw-info-bottom');if(st.routePlace==='top')cls.push('dw-route-top');
 if(st.size<100)vars.push('--dw-size:'+st.size+'%');
 DRAW_LOOK.forEach(([k,,,w,z])=>{
  if(st[k])vars.push('--dw-'+(k==='altColor'?'alt':k)+':'+st[k]);
  if(w&&st[w]>0){cls.push('dw-w-'+k);vars.push('--dw-'+k+'-w:'+st[w]+'px');}
  if(z&&st[z]>0){cls.push('dw-fs-'+k);vars.push('--dw-'+k+'-fs:'+st[z]+'px');}
 });
 return {cls:cls.length?' '+cls.join(' '):'',style:vars.length?' style="'+vars.join(';')+'"':''};
}
/* Единицы и кегли чертежа — только на время отрисовки листа: экран
   редактора остаётся в дюймах 1/16 и при своих кеглях. */
function drawWithStyle(fn){
 const st=drawStyle(),keep={p:DIM_PRINT,d:SHAPE_DIM_FONT,n:SHAPE_NOTE_FONT};
 DIM_PRINT=st.units==='in16'&&!st.alt?null:{units:st.units,alt:st.alt};
 SHAPE_DIM_FONT=st.dimSize;SHAPE_NOTE_FONT=st.noteSize;
 try{return fn(st);}finally{DIM_PRINT=keep.p;SHAPE_DIM_FONT=keep.d;SHAPE_NOTE_FONT=keep.n;}
}
/* ------------------------- Шапка и низ листа ------------------------- */
/* ml — поле листа слева (x блока Free — от края бумаги): у чертежа 9 мм,
   у листа скида свои (erp/documents/carrier-form). */
function drawBlockStyle(b,base,kind,ml){
 const st=[];
 if(b.size!=null&&Math.abs(b.size-base)>.01)st.push('font-size:'+b.size+'pt');
 if(kind==='head'&&!b.bold)st.push('font-weight:400');
 if(kind!=='head'&&b.bold&&b.field!=='tag')st.push('font-weight:700');
 if(b.italic)st.push('font-style:italic');
 if(b.font)st.push('font-family:'+(b.font==='times'?'Times,serif':'Courier,monospace'));
 if(/^#[0-9a-f]{3,6}$/i.test(b.color||''))st.push('color:'+b.color);
 if(b.place==='free')st.push('position:absolute','left:'+Math.round(((b.x||0)-(ml==null?DRAW_MARGIN:ml))*100)/100+'pt','top:'+(b.y||0)+'pt');
 else if(b.y)st.push('position:relative','top:'+b.y+'pt');
 /* Слой (как в Figma: To front / To back): выше нуля — поверх чертежа,
    ниже — под ним. */
 if(b.z){if(!st.some(x=>/^position/.test(x)))st.push('position:relative');st.push('z-index:'+b.z);}
 return st;
}
/* Атрибуты блока; в конструкторе ещё и «взять мышью». */
function drawBlockAttrs(part,b,st,edit){
 let a=st.length?' style="'+st.join(';')+'"':'';
 if(edit)a+=' data-forms-hit="'+esc(part)+'|'+esc(b.id)+'" '+onAct('pointerdown',formsPointerStart,EVENT,String(part??''),String(b.id??''))+''+(edit.sel&&edit.sel.part===part&&edit.sel.id===b.id?' data-forms-sel':'');
 return a;
}
function drawBlockText(b,ctx){
 let v=b.type==='text'?formFill(b.text,ctx).replace(/\{page\}/g,'1').replace(/\{pages\}/g,'1'):ctx.field(b.field);
 /* Дата — в виде, выбранном в окне Insert field (Mon d, yyyy …). */
 const f=b.type==='field'&&(ctx.defs||drawFormFields)().find(x=>x.k===b.field);if(f&&f.t)v=formFormat(v,f.t,b.format);
 return Array.isArray(v)?v.join(', '):String(v==null?'':v);
}
/* Картинка (логотип компании или своя): высота блока, ширина по картинке. */
function drawImageHTML(b,ctx){
 const src=b.src||(b.field?ctx.field(b.field):'');
 return /^data:image\/jpeg;base64,/.test(src||'')?'<img src="'+esc(src)+'" alt="" style="display:inline-block;vertical-align:middle;height:'+(b.h||28)+'pt;width:auto">':'';
}
function drawColumns(tpl,part,ctx){
 const p=tpl.parts[part]||{},cols={left:[],center:[],right:[]},free=[];
 (p.blocks||[]).filter(b=>(formIsText(b)||b.type==='image')&&formShow(b,ctx)).forEach(b=>(b.place==='free'?free:cols[b.place]||cols.left).push(b));
 Object.keys(cols).forEach(k=>cols[k].sort((a,b)=>(a.y||0)-(b.y||0)));
 return {cols,free};
}
/* Строка над чертежом: три опоры листа — заказчик, PO, номер заказа. */
function drawHeadHTML(tpl,ctx,edit){
 const {cols,free}=drawColumns(tpl,'head',ctx),cls={left:'sheet-id-c',center:'sheet-id-p',right:'sheet-id-o'};
 const inner=b=>{if(b.type==='image'){const st=drawBlockStyle(b,DRAW_HEAD_SIZE,'head').filter(x=>/^(position|left|top|z-index)/.test(x));return {st,html:drawImageHTML(b,ctx)};}
  const st=drawBlockStyle(b,DRAW_HEAD_SIZE,'head'),pre=b.type==='field'&&b.prefix?'<span'+(st.some(x=>/^font-size/.test(x))?' style="font-size:'+(b.size*13.5/16).toFixed(2)+'pt"':'')+'>'+esc(b.prefix)+'</span>':'';
  return {st,html:pre+'<b'+(st.length?' style="'+st.filter(x=>!/^(position|left|top|z-index)/.test(x)).join(';')+'"':'')+'>'+esc(drawBlockText(b,ctx))+'</b>'};};
 const col=k=>{const list=cols[k];
  if(list.length===1){const b=list[0],x=inner(b),pos=x.st.filter(s=>/^(position|top|z-index)/.test(s));return '<div class="'+cls[k]+'"'+drawBlockAttrs('head',b,pos,edit)+'>'+x.html+'</div>';}
  return '<div class="'+cls[k]+'">'+list.map(b=>{const x=inner(b);return '<div'+drawBlockAttrs('head',b,x.st.filter(s=>/^(position|top|z-index)/.test(s)),edit)+'>'+x.html+'</div>';}).join('')+'</div>';};
 return '<div class="sheet-id"'+(free.length?' style="position:relative"':'')+'>'+col('left')+col('center')+col('right')+
  free.map(b=>{const x=inner(b);return '<div class="sheet-free"'+drawBlockAttrs('head',b,x.st.filter(s=>/^(position|left|top|z-index)/.test(s)),edit)+'>'+x.html+'</div>';}).join('')+'</div>';
}
/* Низ листа: подпись стекла (её дописывает печать батча, salesSheetFoot)
   и дата. */
function drawFootHTML(tpl,ctx,edit){
 const {cols,free}=drawColumns(tpl,'foot',ctx);
 const one=b=>{const st=drawBlockStyle(b,b.field==='tag'?DRAW_TAG_SIZE:DRAW_FOOT_SIZE,'foot');
  return '<span'+drawBlockAttrs('foot',b,st,edit)+'>'+(b.type==='image'?drawImageHTML(b,ctx):b.field==='tag'?'<!--sheet-tag-->':esc(drawBlockText(b,ctx)))+'</span>';};
 const col=k=>{const list=cols[k];return !list.length?'<span></span>':list.length===1?one(list[0]):'<span class="sheet-foot-g">'+list.map(one).join('')+'</span>';};
 return '<div class="sheet-foot"'+(free.length?' style="position:relative"':'')+'>'+col('left')+(cols.center.length?col('center'):'')+col('right')+free.map(one).join('')+'</div>';
}
/* ------------------------ Конструктор: живой лист -------------------- */
/* Образцы — свежие строки заказов с формой: какой чертёж смотреть. */
function drawFormSamples(){
 const out=[];
 (DB.salesOrder||[]).filter(o=>o&&o.businessNumber&&!o.deletedAt).sort((a,b)=>String(b.businessNumber).localeCompare(String(a.businessNumber),undefined,{numeric:true})).some(o=>{
  (o.lines||[]).forEach((l,i)=>{if(out.length<100&&l&&l.shapeRef){const sh=salesShapeByRef(l.shapeRef);if(sh)out.push({id:o.id+'|'+l.id,label:o.businessNumber+' · Line '+(i+1)+' · '+String(sh.type||'shape').replace(/^\w/,c=>c.toUpperCase())});}});
  return out.length>=100;});
 return out;
}
function drawFormContext(){return {field:k=>{let v=drawSheetLastFields[k];if(typeof v==='function')v=v();return v==null?'':v;}};}
/* Части листа, которые рисует код, выбираются кликом по листу. */
/* view — только посмотреть (окно History): без выбора и перетаскивания. */
function drawFormSheetHTML(tpl,id,view){
 const [oid,lid]=String(id||'').split('|'),o=(DB.salesOrder||[]).find(x=>x.id===oid),l=o&&(o.lines||[]).find(x=>x.id===lid);
 if(!l)return '<div class="fm-note fm-dnote">No drawings yet: add a shape to an order line.</div>';
 const s=formsState(),keep=drawFormPreview;drawFormPreview={tpl,edit:view?null:{sel:s.sel}};
 let d;try{d=salesLineDrawing(l,null,null,o);}finally{drawFormPreview=keep;}
 if(!d||!d.html)return '<div class="fm-note fm-dnote">'+esc(d&&d.error||'No drawing')+'</div>';
 const pick=(cls,part)=>h=>h.replace('class="'+cls,'data-forms-part-hit="'+part+'"'+(!s.sel&&s.part===part?' data-forms-sel':'')+' '+onAct('pointerdown',formsSelect,String(part),'')+' class="'+cls);
 let h=printSheetUniqueIds(d.html);
 if(!view)[['sheet-field','drawing'],['sheet-side','info'],['sheet-route"','route']].forEach(([c,p])=>{h=pick(c,p)(h);});
 return '<div class="print-sheet gf-light">'+h+'</div>';
}
/* Правая панель части Drawing (владелец, 06.11.2026: «интерфейс максимально
   дружелюбным»): группы Paper / Units / Text / Lines / Colors, у чисел − и +,
   быстрые наборы для всех линий и цветов, пример единиц. Сейчас (пусто) —
   прежний вид. */
const DRAW_TEXT=[['dimSize','Numbers',18],['noteSize','Slope notes',16],['labelSize','Edge work, radius',12],['serviceSize','Service labels, sizes',14]];
const DRAW_LINES=[['edgeW','Glass edge',1.9],['lineW','Dimension lines',1],['featureW','Service marks',1.5]];
const DRAW_LINE_STEPS=[[.7,'Thinner'],[0,'As now'],[1.5,'Bolder']];
function drawFormStyleHTML(tpl){
 const st=drawStyle(tpl),set=(type,k,v)=>onAct(type,formsStyle,String(k),v);
 const seg=(k,cur,list,raw)=>`<div class="fm-seg">${list.map(([v,l])=>`<button type="button" class="${String(cur)===String(v)?'on':''}" ${set('click',k,raw?v:String(v))}>${l}</button>`).join('')}</div>`;
 const sel=(k,cur,list)=>`<select class="fm-in" data-draw-${k} ${set('change',k,EL_VALUE)}>${list.map(([v,l])=>`<option value="${v}" ${cur===v?'selected':''}>${l}</option>`).join('')}</select>`;
 /* Число с − и +: пусто — как сейчас, первое нажатие идёт от прежнего значения. */
 const step=(k,now,d,unit)=>{const v=st[k];return `<span class="fm-step" data-draw-step="${k}"><button type="button" title="Less" ${onAct('click',formsStyleStep,String(k),-d,now)}>−</button><input class="fm-in" inputmode="decimal" placeholder="${now}" title="Empty — as now" value="${v||''}" ${onAct('change',formsStyleNum,String(k),EL_VALUE)}><button type="button" title="More" ${onAct('click',formsStyleStep,String(k),d,now)}>+</button><i>${unit}</i></span>`;};
 const row=(label,ctl,reset)=>`<div class="fm-drow"><span>${label}</span>${ctl}${reset||'<i></i>'}</div>`;
 const back=k=>`<button type="button" class="fm-dreset" title="As now" ${set('click',k,k==='dimSize'?18:k==='noteSize'?16:0)}>×</button>`;
 const changed=k=>k==='dimSize'?st[k]!==18:k==='noteSize'?st[k]!==16:st[k]>0;
 const lines=DRAW_LINES.every(([k])=>!st[k])?0:(DRAW_LINE_STEPS.find(([f])=>f&&DRAW_LINES.every(([k,,now])=>st[k]===Math.round(now*f*10)/10))||[-1])[0];
 const black=DRAW_LOOK.every(([k])=>k==='altColor'||st[k]==='#000000'),now=DRAW_LOOK.every(([k])=>!st[k]);
 const ex=dimUnitText(33.25,st.units,false),ex2=st.alt?' ('+dimUnitText(33.25,st.alt,true)+')':'';
 return `<div class="fm-h">Part · Drawing</div>
  <div class="fm-dsec"><b>Paper</b>${seg('paper',st.paper,[['portrait','▯ Portrait'],['landscape','▭ Landscape']])}</div>
  <div class="fm-dsec"><b>Drawing size</b>${seg('size',st.size,[[75,'75%'],[90,'90%'],[100,'Fill']],true)}</div>
  <div class="fm-dsec"><b>Units</b>${sel('units',st.units,DRAW_UNITS)}
   <label class="fm-dsub"><span>Second units, small gray</span>${sel('alt',st.alt,[['','None']].concat(DRAW_UNITS.filter(u=>u[0]!==st.units)))}</label>
   <div class="fm-dex" data-draw-example>Example: <b>${esc(ex)}</b>${ex2?`<span>${esc(ex2)}</span>`:''}</div></div>
  <div class="fm-dsec"><b>Text size</b>${DRAW_TEXT.map(([k,l,n])=>row(l,step(k,n,1,'px'),changed(k)?back(k):'')).join('')}
   <label class="fm-check"><input type="checkbox" data-draw-bg ${st.bg?'checked':''} ${set('change','bg',EL_CHECKED)}><span>White under numbers</span></label></div>
  <div class="fm-dsec"><b>Lines</b><div class="fm-seg" data-draw-lines>${DRAW_LINE_STEPS.map(([f,l])=>`<button type="button" class="${lines===f?'on':''}" ${onAct('click',formsStyleLines,f)}>${l}</button>`).join('')}</div>
   ${DRAW_LINES.map(([k,l,n])=>row(l,step(k,n,.2,'px'),changed(k)?back(k):'')).join('')}</div>
  <div class="fm-dsec"><b>Colors</b><div class="fm-seg" data-draw-colors><button type="button" class="${now?'on':''}" ${onAct('click',formsStyleColors,'')}>As now</button><button type="button" class="${black?'on':''}" ${onAct('click',formsStyleColors,'#000000')}>All black</button></div>
   ${DRAW_LOOK.map(([k,label,was])=>row(label,`<input type="color" class="fm-in fm-color" data-draw-color="${k}" value="${st[k]||was}" title="Pick a color" ${set('change',k,EL_VALUE)}>`,st[k]?`<button type="button" class="fm-dreset" title="As now" ${set('click',k,'')}>×</button>`:'')).join('')}</div>
  <p class="fm-note">The sheet shows every change at once. Save — all prints.</p>`;
}
function formsStyleNum(k,v){formsStyle(k,Number(v)||0);}
function formsStyle(k,v){const def=formsDef(formsState().form).def().style||{};formsEdit(t=>{t.style=Object.assign({},def,t.style,{[k]:v});});}
/* − / +: от сохранённого или прежнего значения, шаг 1 px у текста, 0.2 px у линий. */
function formsStyleStep(k,d,now){
 const st=drawStyle(formsDraft().tpl),line=DRAW_LINES.some(x=>x[0]===k),lo=line?.2:6,hi=line?12:40;
 formsStyle(k,Math.min(hi,Math.max(lo,Math.round(((st[k]||now)+d)*10)/10)));
}
/* Все линии сразу: тоньше, как сейчас, толще — от прежних толщин. */
function formsStyleLines(f){formsEdit(t=>{t.style=Object.assign({},DRAW_STYLE_DEFAULT,t.style);DRAW_LINES.forEach(([k,,now])=>{t.style[k]=f?Math.round(now*f*10)/10:0;});});}
function formsStyleColors(c){formsEdit(t=>{t.style=Object.assign({},DRAW_STYLE_DEFAULT,t.style);DRAW_LOOK.forEach(([k])=>{t.style[k]=c&&k!=='altColor'?c:'';});});}
/* ------------------------ Слои и наложения ------------------------- */
/* Слой блока шапки и низа: To back / Back / Forward / To front — среди
   всех блоков листа (владелец, 06.11.2026: «как обычно в Figma или в
   Adobe»). Чертёж — слой 0: To back кладёт блок под него. */
function drawLayerHTML(b){
 const z=b.z||0,btn=(k,l,t)=>`<button type="button" data-draw-layer="${k}" title="${t}" ${onAct('click',formsLayer,String(k))}>${l}</button>`;
 return `<div class="fm-h">Layer</div><div class="fm-seg">${btn('toBack','To back','Under everything')}${btn('back','Back','One layer down')}${btn('forward','Forward','One layer up')}${btn('toFront','To front','Over everything')}</div><p class="fm-note">Layer ${z>0?'+'+z:z}${z<0?' · under the drawing':''}</p>`;
}
function formsLayer(k){
 const s=formsState();if(!s.sel)return;
 formsEdit(t=>{const b=formsFind(t,s.sel);if(!b)return;
  const zs=['head','foot'].flatMap(p=>((t.parts[p]||{}).blocks||[]).filter(x=>x!==b).map(x=>x.z||0)).concat([0]);
  const z=k==='toFront'?Math.max(...zs)+1:k==='toBack'?Math.min(...zs)-1:(b.z||0)+(k==='forward'?1:-1);
  if(z)b.z=Math.max(-50,Math.min(50,z));else delete b.z;});
}
/* Наложения на живом листе: блоки, чьи тексты пересеклись, — оранжевой
   рамкой и строкой над листом. Сохранить можно: что сверху, решает Layer. */
function drawFormOverlaps(){
 const stage=document.querySelector('[data-forms-stage]');if(!stage)return;
 const old=stage.querySelector('[data-draw-overlap]');if(old)old.remove();
 const box=el=>{const r=document.createRange();r.selectNodeContents(el);return r.getBoundingClientRect();};
 const els=[...stage.querySelectorAll('.fm-dsheet [data-forms-hit]')].filter(el=>el.textContent.trim()),hit=new Set(),names=[];
 els.forEach((a,i)=>els.slice(i+1).forEach(b=>{const p=box(a),q=box(b);
  if(p.width&&q.width&&p.left<q.right-1&&q.left<p.right-1&&p.top<q.bottom-1&&q.top<p.bottom-1){[a,b].forEach(e=>{if(!hit.has(e)){hit.add(e);names.push([...e.childNodes].map(n=>n.textContent.trim()).filter(Boolean).join(' ').slice(0,28));}});}}));
 els.forEach(e=>e.toggleAttribute('data-forms-overlap',hit.has(e)));
 if(hit.size)stage.insertAdjacentHTML('afterbegin',`<div class="fm-doverlap" data-draw-overlap>Overlap: ${names.map(esc).join(' · ')} — Save works, Layer sets what is on top</div>`);
}
/* Панели Info и Route: галочки «показывать» (пусто на листе — место
   уходит соседям). */
function drawFormShowHTML(part,tpl){
 const st=drawStyle(tpl),list=DRAW_SHOW.filter(x=>x[3]===part),lab=part==='info'?'Info':'Route';
 /* Блок целиком — над чертежом или под ним (владелец: «переместить можно
    сам блок?»); чертёж берёт всё остальное место. */
 const pk=part==='info'?'infoPlace':'routePlace',place=`<div class="fm-h">Place</div><div class="fm-seg" data-draw-place="${part}">${[['top',part==='info'?'Top (above drawing)':'Top (under header)'],['bottom',part==='info'?'Bottom (under drawing)':'Bottom']].map(([v,l])=>`<button type="button" class="${st[pk]===v?'on':''}" ${onAct('click',formsStyle,String(pk),String(v))}>${l}</button>`).join('')}</div>`;
 return `<div class="fm-h">Part · ${lab}</div><p class="fm-note">Drawn by the program — you choose where and what.</p>${place}<div class="fm-h">Show</div>
  ${list.map(([k,l])=>`<label class="fm-check fm-dshow"><input type="checkbox" data-draw-show="${k}" ${st[k]?'checked':''} ${onAct('change',formsStyle,String(k),EL_CHECKED)}><span>${l}</span></label>`).join('')}`;
}
