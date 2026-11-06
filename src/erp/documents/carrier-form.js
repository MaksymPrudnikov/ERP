/* =====================================================================
   erp/documents/carrier-form  ·  carrier-1.0
   Лист скида / долли на конструкторе форм (Data → Company & print → Forms
   → Dolly / Skid sheet; владелец 06.11.2026: «положим и шаблон скидов
   доллей»). Тот же лист печатают окно тары, Shipping → Skid sheet и
   станция (carrierSheetHTML, views/carriers-board).
   IN : шаблон формы carrierSheet — шапка (head) из блоков, низ страницы
        (foot) — блоки в полях @page, вид (style) — цвета и галочки частей,
        которые рисует программа (полоса, клиент, итог); данные листа
   OUT: разметка шапки, классы и переменные листа, строка @page
   По умолчанию — прежняя разметка: название компании с адресом слева,
   вид и номер тары справа, низ — «Printed … by …» и номер страницы.
   Колонки таблицы — по-прежнему у станции и человека (Data → Stations).
   ===================================================================== */

/* Поля страницы листа: @page carriersheet 10 / 10 / 12 мм. */
const CS_MARGIN=28.35;
/* Цвета листа: ключ, подпись, токен DOC_COLOR (как сейчас). */
const CS_LOOK=[['csInk','Text','ink'],['csMut','Labels, notes','mut'],['csNavy','Company name, order lines','navy'],
 ['csLine','Row lines','line'],['csBar','Table heading','bar'],['csBox','Strip, stripes','box']];
/* Что показывать из частей, которые рисует программа: ключ, подпись, часть,
   класс листа «спрятать». */
const CS_SHOW=[['showStation','Station','strip','cs-no-station'],['showSince','Since / Shipped','strip','cs-no-since'],['showOnIt','On it','strip','cs-no-onit'],
 ['showWeight','Weight','strip','cs-no-weight'],['showPrintedBy','Printed by','strip','cs-no-printedby'],['showCustomer','Customer and order','customer','cs-no-customer'],
 ['showTotal','Total','total','cs-no-total']];
/* Кегли прежнего листа: название компании 13 pt, номер тары 34 pt, текст
   листа 9 pt, низ страницы 8 px = 6 pt. */
const CS_CO_SIZE=13,CS_CODE_SIZE=34,CS_TEXT_SIZE=9,CS_FOOT_SIZE=6;
function carrierFormDefault(){
 const m=CS_MARGIN,style={};CS_LOOK.forEach(([k])=>{style[k]='';});CS_SHOW.forEach(([k])=>{style[k]=true;});
 return {form:'carrierSheet',page:{w:612,h:792,margin:{top:m,right:m,bottom:34.02,left:m}},style,parts:{
  head:{h:0,blocks:[{id:'company',type:'field',field:'companyBlock',place:'left',y:0,size:CS_CO_SIZE},{id:'code',type:'field',field:'codeBlock',place:'right',y:0,size:CS_CODE_SIZE}]},
  strip:{lines:true},customer:{lines:true},table:{lines:true},total:{lines:true},
  foot:{h:0,blocks:[{id:'printed',type:'field',field:'printedLine',place:'left',y:0,size:CS_FOOT_SIZE},{id:'page',type:'text',text:'{kind} · {code} · {page} / {pages}',place:'right',y:0,size:CS_FOOT_SIZE}]}}};
}
function carrierFormFields(){
 const f=(g,k,label)=>({g,k,label});
 return [f('Sheet','companyBlock','Company name and address'),f('Sheet','codeBlock','Kind and number of the dolly / skid'),
  f('Sheet','kind','Kind (Skid contents…)'),f('Sheet','code','Dolly / skid number'),f('Sheet','type','Dolly / skid type'),
  f('Sheet','station','Station'),f('Sheet','since','Since / Shipped'),f('Sheet','onIt','On it'),f('Sheet','weight','Weight'),
  f('Sheet','printedBy','Printed by'),f('Sheet','printedLine','Printed … by … at …'),{g:'Sheet',k:'date',label:'Date printed',t:'date'},
  f('Order','customer','Customer (one order)'),f('Order','order','Order Number (one order)'),f('Order','customerPo','PO (one order)')].concat(formCompanyFields(),formMyFields());
}
let carrierFormPreview=null;
function carrierFormTpl(){return carrierFormPreview?carrierFormPreview.tpl:formClean(DB.formTemplate&&DB.formTemplate.carrierSheet,carrierFormDefault());}
function carrierFormStyle(tpl){
 const s=Object.assign({},carrierFormDefault().style,(tpl||carrierFormTpl()).style||{}),o={};
 CS_LOOK.forEach(([k])=>{o[k]=/^#[0-9a-f]{6}$/i.test(s[k]||'')?String(s[k]).toLowerCase():'';});
 CS_SHOW.forEach(([k])=>{o[k]=s[k]!==false;});
 return o;
}
/* Цвета листа — переменные --cs-*; спрятанное — классами. */
function carrierFormColor(st,key,tok){return st[key]||DOC_COLOR[tok];}
function carrierFormClasses(st){return CS_SHOW.filter(([k])=>!st[k]).map(x=>' '+x[3]).join('');}
/* Шапка: колонки Left / Center / Right строки над полосой, Free — своё место. */
function carrierHeadHTML(tpl,ctx,edit){
 const {cols,free}=drawColumns(tpl,'head',ctx),pos=s=>/^(position|left|top|z-index)/.test(s);
 const one=b=>{
  const st=drawBlockStyle(b,b.field==='companyBlock'?CS_CO_SIZE:b.field==='codeBlock'?CS_CODE_SIZE:CS_TEXT_SIZE,'foot',CS_MARGIN),at=drawBlockAttrs('head',b,st.filter(pos),edit),look=st.filter(s=>!pos(s)),ls=look.length?' style="'+look.join(';')+'"':'';
  if(b.type==='image')return '<div'+at+'>'+drawImageHTML(b,ctx)+'</div>';
  if(b.field==='companyBlock'){const c=ctx.field('companyBlockData')||{};return '<div class="cs-co"'+at+'><b data-raw'+ls+'>'+esc(c.name||'')+'</b>'+(c.lines||[]).slice(0,2).map(t=>'<div data-raw>'+esc(t)+'</div>').join('')+'</div>';}
  if(b.field==='codeBlock')return '<div class="cs-code"'+at+'><small>'+esc(String(ctx.field('kind')).toUpperCase())+'</small><b'+ls+'>'+esc(ctx.field('code'))+'</b>'+(ctx.field('type')?'<span>'+esc(ctx.field('type'))+'</span>':'')+'</div>';
  return '<div class="cs-blk"'+at+'>'+(b.type==='field'&&b.prefix?'<span class="cs-mut">'+esc(b.prefix)+' </span>':'')+'<span'+ls+'>'+esc(drawBlockText(b,ctx))+'</span></div>';
 };
 const col=k=>{const l=cols[k];return !l.length?'':l.length===1?one(l[0]):'<div class="cs-col cs-col-'+k+'">'+l.map(one).join('')+'</div>';};
 return '<div class="cs-head"'+(free.length?' style="position:relative"':'')+'>'+col('left')+(cols.center.length?col('center'):'')+col('right')+free.map(one).join('')+'</div>';
}
/* Низ страницы — поля @page (повторяется на каждой странице): блоки Left /
   Center / Right, {page} и {pages} — номер страницы и их число. */
function carrierFootCss(tpl,ctx){
 const {cols}=drawColumns(tpl,'foot',ctx),q=t=>'"'+String(t).replace(/["\\]/g,'')+'"';
 const content=b=>{const t=b.type==='text'?formFill(b.text,ctx):drawBlockText(b,ctx);
  return t.split(/(\{pages?\})/).filter(x=>x!=='').map(x=>x==='{page}'?'counter(page)':x==='{pages}'?'counter(pages)':q(x)).join(' ');};
 return ['left','center','right'].map(k=>{const l=cols[k];if(!l.length)return '';const b=l[0],size=b.size||CS_FOOT_SIZE;
  const font='font:'+(b.bold?'700 ':'')+(b.italic?'italic ':'')+Math.round(size*4/3*100)/100+'px '+(b.font==='times'?'Times,serif':b.font==='courier'?'Courier,monospace':'Helvetica,Arial,sans-serif');
  return '@bottom-'+k+'{content:'+l.map(content).join(' "  " ')+';'+font+';color:'+(/^#[0-9a-f]{3,6}$/i.test(b.color||'')?b.color:DOC_COLOR.mut)+'}';}).join('');
}
/* В конструкторе низ страницы виден строкой у нижнего края листа. */
function carrierFootPreview(tpl,ctx,edit){
 const {cols}=drawColumns(tpl,'foot',ctx);
 return '<div class="cs-foot-preview">'+['left','center','right'].map(k=>'<div class="cs-fp-'+k+'">'+cols[k].map(b=>'<span'+drawBlockAttrs('foot',b,drawBlockStyle(b,CS_FOOT_SIZE,'foot',CS_MARGIN).filter(s=>!/^(position|left|top)/.test(s)),edit)+'>'+esc((b.type==='text'?formFill(b.text,ctx):drawBlockText(b,ctx)).replace(/\{page\}/g,'1').replace(/\{pages\}/g,'1'))+'</span>').join(' ')+'</div>').join('')+'</div>';
}
/* ------------------------ Конструктор: живой лист -------------------- */
function carrierFormSamples(){
 const out=[];try{for(const c of carrierContents().keys()){const m=carrierModelOf(c);if(m&&m.items.length)out.push({id:c,label:c+' · '+carrierSheetKind(m)});if(out.length>=60)break;}}catch(e){}
 return out;
}
let carrierSheetLastFields={};
function carrierFormContext(){return {field:k=>{let v=carrierSheetLastFields[k];if(typeof v==='function')v=v();return v==null?'':v;},defs:carrierFormFields};}
function carrierFormSheetHTML(tpl,code,view){
 const m=code&&code!=='sample'?carrierModelOf(code):null;
 if(!m||!(m.items.length||m.gone.length))return '<div class="fm-note fm-dnote">No dolly or skid with glass yet.</div>';
 const s=formsState(),keep=carrierFormPreview,edit=view?null:{sel:s.sel};carrierFormPreview={tpl,edit};
 let h;try{h=carrierSheetHTML(m,carrierColsOn(carrierStationCols(carrierLoaderOf(m))||[]),{id:'',name:'Office'});}finally{carrierFormPreview=keep;}
 if(!view)[['cs-strip','strip'],['cs-table','table'],['cs-total','total']].forEach(([c,p])=>{h=h.replace('class="'+c+'"','data-forms-part-hit="'+p+'"'+(!s.sel&&s.part===p?' data-forms-sel':'')+' onpointerdown="formsSelect(\''+p+'\',\'\')" class="'+c+'"');});
 return '<div class="print-sheet gf-light cs-stage">'+h+(view?'':carrierFootPreview(tpl,carrierFormContext(),edit))+'</div>';
}
/* Правая панель частей, которые рисует программа, и вида листа. */
function carrierFormPanelHTML(part,tpl){
 const st=carrierFormStyle(tpl),set=(k,v)=>`formsStyle('${k}',${v})`;
 if(part==='table')return `<div class="fm-h">Part · Table</div><p class="fm-note">Drawn by the program. Columns — per station in Production → Stations, or ⚙ Columns in the dolly window.</p>${carrierFormLookHTML(st,set)}`;
 const list=CS_SHOW.filter(x=>x[2]===part);if(!list.length)return '';
 const lab={strip:'Strip',customer:'Customer',total:'Total'}[part];
 return `<div class="fm-h">Part · ${lab}</div><p class="fm-note">Drawn by the program. Show on the sheet:</p>
  ${list.map(([k,l])=>`<label class="fm-check fm-dshow"><input type="checkbox" data-cs-show="${k}" ${st[k]?'checked':''} onchange="${set(k,'this.checked')}"><span>${l}</span></label>`).join('')}${carrierFormLookHTML(st,set)}`;
}
function carrierFormLookHTML(st,set){
 return `<div class="fm-dsec"><b>Colors</b><div class="fm-seg"><button type="button" class="${CS_LOOK.every(([k])=>!st[k])?'on':''}" onclick="formsCarrierColors('')">As now</button><button type="button" class="${['csInk','csMut','csNavy'].every(k=>st[k]==='#000000')?'on':''}" onclick="formsCarrierColors('black')">Black text</button></div>
  ${CS_LOOK.map(([k,l,tok])=>`<div class="fm-drow"><span>${l}</span><input type="color" class="fm-in fm-color" data-cs-color="${k}" value="${st[k]||DOC_COLOR[tok]}" title="Pick a color" onchange="${set(k,'this.value')}">${st[k]?`<button type="button" class="fm-dreset" title="As now" onclick="${set(k,"''")}">×</button>`:'<i></i>'}</div>`).join('')}</div>`;
}
function formsCarrierColors(c){formsEdit(t=>{t.style=Object.assign({},carrierFormDefault().style,t.style);CS_LOOK.forEach(([k])=>{t.style[k]=c==='black'&&['csInk','csMut','csNavy'].includes(k)?'#000000':'';});});}
