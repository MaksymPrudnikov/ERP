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
 edge:'',line:'',arrow:'',feature:'',text:'',label:'',ftext:'',altColor:'',edgeW:0,lineW:0,featureW:0,labelSize:0,serviceSize:0};
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
function drawFormDefault(){
 return {form:'drawing',page:{w:612,h:792,margin:{top:0,right:0,bottom:0,left:0}},style:Object.assign({},DRAW_STYLE_DEFAULT),parts:{
  head:{h:0,blocks:[
   {id:'customer',type:'field',field:'customer',prefix:'Customer:',place:'left',y:0,size:DRAW_HEAD_SIZE,bold:true},
   {id:'po',type:'field',field:'po',prefix:'PO:',place:'center',y:0,size:DRAW_HEAD_SIZE,bold:true},
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
 return [f('Order','customer','Customer'),f('Order','po','PO'),f('Order','order','Order Number'),f('Order','date','Date printed'),
  f('Line','line','Line'),f('Line','glass','Glass / Makeup'),f('Line','spec','Makeup spec'),f('Line','qty','Qty'),
  f('Line','finished','Finished size'),f('Line','mass','sq ft · kg'),f('Line','note','Note'),f('Line','tag','Glass tag (batch)'),
  f('Company','company','Company name')].concat(formMyFields());
}
/* Черновик конструктора — на время живого листа; иначе сохранённый. */
let drawFormPreview=null,drawSheetLastFields={};
function drawFormTpl(){
 if(drawFormPreview)return drawFormPreview.tpl;
 return formClean(DB.formTemplate&&DB.formTemplate.drawing,drawFormDefault());
}
/* Вид — чистый: перечисления, цвета #rrggbb, числа в пределах. */
function drawStyle(tpl){
 const s=Object.assign({},DRAW_STYLE_DEFAULT,(tpl||drawFormTpl()).style||{}),d=DRAW_STYLE_DEFAULT,o={};
 const units=v=>DRAW_UNITS.some(u=>u[0]===v)?v:'';
 const num=(v,lo,hi,def)=>{const n=Number(v);return Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):def;};
 o.paper=s.paper==='landscape'?'landscape':'portrait';
 o.size=num(s.size,40,100,100);o.units=units(s.units)||'in16';o.alt=units(s.alt);if(o.alt===o.units)o.alt='';
 o.dimSize=num(s.dimSize,8,40,d.dimSize);o.noteSize=num(s.noteSize,8,40,d.noteSize);o.bg=s.bg!==false;
 DRAW_LOOK.forEach(([k,,,w,z])=>{o[k]=/^#[0-9a-f]{6}$/i.test(s[k]||'')?String(s[k]).toLowerCase():'';if(w)o[w]=num(s[w],0,12,0);if(z)o[z]=num(s[z],0,40,0);});
 return o;
}
/* Корень листа: классы и переменные только для изменённого — лист по
   умолчанию остаётся прежней разметкой. */
function drawSheetRootAttrs(st){
 const cls=[],vars=[];
 if(st.paper==='landscape')cls.push('dw-land');
 if(!st.bg)cls.push('dw-nobg');
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
function drawBlockStyle(b,base,kind){
 const st=[];
 if(b.size!=null&&Math.abs(b.size-base)>.01)st.push('font-size:'+b.size+'pt');
 if(kind==='head'&&!b.bold)st.push('font-weight:400');
 if(kind!=='head'&&b.bold&&b.field!=='tag')st.push('font-weight:700');
 if(b.italic)st.push('font-style:italic');
 if(b.font)st.push('font-family:'+(b.font==='times'?'Times,serif':'Courier,monospace'));
 if(/^#[0-9a-f]{3,6}$/i.test(b.color||''))st.push('color:'+b.color);
 if(b.place==='free')st.push('position:absolute','left:'+(b.x||0)+'pt','top:'+(b.y||0)+'pt');
 else if(b.y)st.push('position:relative','top:'+b.y+'pt');
 return st;
}
/* Атрибуты блока; в конструкторе ещё и «взять мышью». */
function drawBlockAttrs(part,b,st,edit){
 let a=st.length?' style="'+st.join(';')+'"':'';
 if(edit)a+=' data-forms-hit="'+esc(part)+'|'+esc(b.id)+'" onpointerdown="formsPointerStart(event,\''+esc(part)+'\',\''+esc(b.id)+'\')"'+(edit.sel&&edit.sel.part===part&&edit.sel.id===b.id?' data-forms-sel':'');
 return a;
}
function drawBlockText(b,ctx){
 const v=b.type==='text'?formFill(b.text,ctx).replace(/\{page\}/g,'1').replace(/\{pages\}/g,'1'):ctx.field(b.field);
 return Array.isArray(v)?v.join(', '):String(v==null?'':v);
}
function drawColumns(tpl,part,ctx){
 const p=tpl.parts[part]||{},cols={left:[],center:[],right:[]},free=[];
 (p.blocks||[]).filter(b=>formIsText(b)&&formShow(b,ctx)).forEach(b=>(b.place==='free'?free:cols[b.place]||cols.left).push(b));
 Object.keys(cols).forEach(k=>cols[k].sort((a,b)=>(a.y||0)-(b.y||0)));
 return {cols,free};
}
/* Строка над чертежом: три опоры листа — заказчик, PO, номер заказа. */
function drawHeadHTML(tpl,ctx,edit){
 const {cols,free}=drawColumns(tpl,'head',ctx),cls={left:'sheet-id-c',center:'sheet-id-p',right:'sheet-id-o'};
 const inner=b=>{const st=drawBlockStyle(b,DRAW_HEAD_SIZE,'head'),pre=b.type==='field'&&b.prefix?'<span'+(st.some(x=>/^font-size/.test(x))?' style="font-size:'+(b.size*13.5/16).toFixed(2)+'pt"':'')+'>'+esc(b.prefix)+'</span>':'';
  return {st,html:pre+'<b'+(st.length?' style="'+st.filter(x=>!/^(position|left|top)/.test(x)).join(';')+'"':'')+'>'+esc(drawBlockText(b,ctx))+'</b>'};};
 const col=k=>{const list=cols[k];
  if(list.length===1){const b=list[0],x=inner(b),pos=x.st.filter(s=>/^(position|top)/.test(s));return '<div class="'+cls[k]+'"'+drawBlockAttrs('head',b,pos,edit)+'>'+x.html+'</div>';}
  return '<div class="'+cls[k]+'">'+list.map(b=>{const x=inner(b);return '<div'+drawBlockAttrs('head',b,x.st.filter(s=>/^(position|top)/.test(s)),edit)+'>'+x.html+'</div>';}).join('')+'</div>';};
 return '<div class="sheet-id"'+(free.length?' style="position:relative"':'')+'>'+col('left')+col('center')+col('right')+
  free.map(b=>{const x=inner(b);return '<div class="sheet-free"'+drawBlockAttrs('head',b,x.st.filter(s=>/^(position|left|top)/.test(s)),edit)+'>'+x.html+'</div>';}).join('')+'</div>';
}
/* Низ листа: подпись стекла (её дописывает печать батча, salesSheetFoot)
   и дата. */
function drawFootHTML(tpl,ctx,edit){
 const {cols,free}=drawColumns(tpl,'foot',ctx);
 const one=b=>{const st=drawBlockStyle(b,b.field==='tag'?DRAW_TAG_SIZE:DRAW_FOOT_SIZE,'foot');
  return '<span'+drawBlockAttrs('foot',b,st,edit)+'>'+(b.field==='tag'?'<!--sheet-tag-->':esc(drawBlockText(b,ctx)))+'</span>';};
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
function drawFormContext(){return {field:k=>{const v=drawSheetLastFields[k];return v==null?'':v;}};}
/* Части листа, которые рисует код, выбираются кликом по листу. */
function drawFormSheetHTML(tpl,id){
 const [oid,lid]=String(id||'').split('|'),o=(DB.salesOrder||[]).find(x=>x.id===oid),l=o&&(o.lines||[]).find(x=>x.id===lid);
 if(!l)return '<div class="fm-note fm-dnote">No drawings yet: add a shape to an order line.</div>';
 const s=formsState(),keep=drawFormPreview;drawFormPreview={tpl,edit:{sel:s.sel}};
 let d;try{d=finWithOrder(o,()=>salesLineDrawing(l));}finally{drawFormPreview=keep;}
 if(!d||!d.html)return '<div class="fm-note fm-dnote">'+esc(d&&d.error||'No drawing')+'</div>';
 const pick=(cls,part)=>h=>h.replace('class="'+cls,'data-forms-part-hit="'+part+'"'+(!s.sel&&s.part===part?' data-forms-sel':'')+' onpointerdown="formsSelect(\''+part+'\',\'\')" class="'+cls);
 let h=printSheetUniqueIds(d.html);
 [['sheet-field','drawing'],['sheet-side','info'],['sheet-route"','route']].forEach(([c,p])=>{h=pick(c,p)(h);});
 return '<div class="print-sheet gf-light">'+h+'</div>';
}
/* Правая панель части Drawing: бумага, единицы, размер, кегли, цвета. */
function drawFormStyleHTML(tpl){
 const st=drawStyle(tpl),set=(k,v)=>`formsStyle('${k}',${v})`;
 const seg=(k,cur,list,raw)=>`<div class="fm-seg">${list.map(([v,l])=>`<button type="button" class="${String(cur)===String(v)?'on':''}" onclick="${set(k,raw?v:`'${v}'`)}">${l}</button>`).join('')}</div>`;
 const sel=(k,cur,list)=>`<select class="fm-in" data-draw-${k} onchange="${set(k,'this.value')}">${list.map(([v,l])=>`<option value="${v}" ${cur===v?'selected':''}>${l}</option>`).join('')}</select>`;
 const n=(key,title,attr)=>`<input class="fm-in fm-dnum" ${attr} inputmode="decimal" placeholder="auto" title="${title}" value="${st[key]||''}" onchange="${set(key,'Number(this.value)||0')}">`;
 const look=DRAW_LOOK.map(([k,label,now,w,z])=>`<div class="fm-drow"><span>${label}</span><input type="color" class="fm-in fm-color" data-draw-color="${k}" value="${st[k]||now}" onchange="${set(k,'this.value')}" title="Color">${st[k]?`<button type="button" class="fm-dreset" title="As now" onclick="${set(k,"''")}">×</button>`:'<i></i>'}${w?n(w,'Line width, px',`data-draw-width="${k}"`):z?n(z,'Text size, px',`data-draw-size="${k}"`):'<i></i>'}</div>`).join('');
 return `<div class="fm-h">Part · Drawing</div>
  <label><span>Paper</span>${seg('paper',st.paper,[['portrait','Portrait'],['landscape','Landscape']])}</label>
  <label><span>Units</span>${sel('units',st.units,DRAW_UNITS)}</label>
  <label><span>Second units</span>${sel('alt',st.alt,[['','None']].concat(DRAW_UNITS.filter(u=>u[0]!==st.units)))}</label>
  <label><span>Drawing size</span>${seg('size',st.size,[[75,'75%'],[90,'90%'],[100,'Fill']],true)}</label>
  <div class="fm-row"><label><span>Numbers, px</span><input class="fm-in" data-draw-dim inputmode="decimal" value="${st.dimSize}" onchange="${set('dimSize','Number(this.value)')}"></label><label><span>Slope notes, px</span><input class="fm-in" inputmode="decimal" value="${st.noteSize}" onchange="${set('noteSize','Number(this.value)')}"></label></div>
  <label class="fm-check"><input type="checkbox" data-draw-bg ${st.bg?'checked':''} onchange="${set('bg','this.checked')}"><span>White under numbers</span></label>
  <div class="fm-h">Look</div><div class="fm-dlook"><div class="fm-drow fm-dhead"><span>Element</span><span>Color</span><i></i><span>Width · size</span></div>${look}</div>
  <p class="fm-note">Empty — as now. × — color as now.</p>`;
}
function formsStyle(k,v){formsEdit(t=>{t.style=Object.assign({},DRAW_STYLE_DEFAULT,t.style,{[k]:v});});}
