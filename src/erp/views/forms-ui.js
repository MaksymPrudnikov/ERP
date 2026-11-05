/* =====================================================================
   erp/views/forms-ui  ·  forms-1.0
   Конструктор форм (этап 7): Data → Company & print → Forms. Вид «ТОП»
   (владелец 02.11.2026): строка форм, слева Add и дерево частей листа, в
   середине живой лист на настоящем PS с тонкой линейкой, справа настройки
   блока. Поле — окно Insert field (вариант В, 05.11.2026): группа → поле со
   значением с этого заказа → формат и «текст перед значением».
   IN : шаблоны erp/documents/forms, бланки (пока Packing slip)
   OUT: DB.formTemplate[form] — сохранённый шаблон; печать берёт его.
   Черновик живёт здесь, в базу пишет только Save.
   ===================================================================== */

/* Сохранённые шаблоны: форма → шаблон. Ключ в DEFAULT — иначе база при
   старте его не берёт (mergeState). */
DEFAULT.formTemplate={};
/* Версии (окно Versions, вариант В 05.11.2026): каждое Save — строка
   {id, form, at, by, note, tpl}; на форму хранятся последние FORMS_VERSIONS. */
DEFAULT.formVersion=[];
const FORMS_VERSIONS=20;
/* Формы на шаблоне. Остальные бланки переходят сюда по одному, после
   сверки «печатает то же». */
function formsDefs(){
 return [{k:'packingSlip',label:'Packing slip',def:shippingFormDefault,fields:()=>SHIPPING_FORM_FIELDS,
  samples:()=>(DB.shipment||[]).slice().sort((a,b)=>String(b.number).localeCompare(String(a.number),undefined,{numeric:true})).slice(0,100).map(s=>({id:s.id,label:s.number+' · '+salesCustomerDisplay(s.customerId)})),
  doc:id=>{const s=id&&shippingFind(id);if(s)try{return shippingDocument(s);}catch(e){}return shippingFormSample();},
  context:d=>shippingFormContext(d),
  pages:(tpl,d,map)=>shippingPages(d,null,tpl,map)}];
}
function formsDef(k){return formsDefs().find(x=>x.k===k)||formsDefs()[0];}
function formsSaved(k){const def=formsDef(k);return formClean(DB.formTemplate&&DB.formTemplate[k],def.def());}
function normalizeFormTemplates(){
 const src=DB.formTemplate&&typeof DB.formTemplate==='object'&&!Array.isArray(DB.formTemplate)?DB.formTemplate:{},out={},defs=formsDefs();
 defs.forEach(d=>{if(src[d.k])out[d.k]=formClean(src[d.k],d.def());});
 DB.formTemplate=out;
 const str=v=>typeof v==='string'?v.slice(0,200):'';
 const rows=(Array.isArray(DB.formVersion)?DB.formVersion:[]).filter(v=>v&&typeof v==='object'&&typeof v.id==='string'&&v.id&&typeof v.at==='string'&&defs.some(d=>d.k===v.form)&&v.tpl&&typeof v.tpl==='object');
 DB.formVersion=defs.flatMap(d=>rows.filter(v=>v.form===d.k).slice(-FORMS_VERSIONS).map(v=>({id:v.id,form:v.form,at:v.at,by:str(v.by),note:str(v.note),tpl:formClean(v.tpl,d.def())})));
}
function validateFormTemplatePayload(src){
 if(src.formTemplate!=null&&(typeof src.formTemplate!=='object'||Array.isArray(src.formTemplate)))throw new Error('Form templates must be an object.');
 if(src.formVersion!=null&&!Array.isArray(src.formVersion))throw new Error('Form versions must be a list.');
}

const FORMS_PARTS={every:['Page header','every page'],first:['First page','page 1'],table:['Lines table','grows'],totals:['Totals','after table'],skidTop:['Skid sheet','per skid'],skidTable:['Skid table','per skid'],bottom:['Page footer','bottom']};
const FORMS_PT_MM=25.4/72;
let formsUi=null,formsPointer=null,formsClickUntil=0;
function formsState(){
 if(!formsUi)formsUi={form:'packingSlip',sample:'',drafts:{},sel:null,part:'every',modal:null,notice:''};
 const k=formsUi.form;
 if(!formsUi.drafts[k]){const tpl=formsSaved(k);formsUi.drafts[k]={tpl,undo:[],redo:[],saved:JSON.stringify(tpl)};}
 if(!formsUi.sample){const s=formsDef(k).samples()[0];formsUi.sample=s?s.id:'sample';}
 return formsUi;
}
function formsDraft(){const s=formsState();return s.drafts[s.form];}
function formsClone(v){return JSON.parse(JSON.stringify(v));}
function formsDirty(){const d=formsDraft();return JSON.stringify(d.tpl)!==d.saved;}
function formsFind(tpl,sel){const p=sel&&tpl.parts[sel.part];return p&&(p.blocks||[]).find(b=>b.id===sel.id)||null;}
function formsEdit(fn,keepRender){
 const d=formsDraft(),before=formsClone(d.tpl);fn(d.tpl);
 if(JSON.stringify(before)!==JSON.stringify(d.tpl)){d.undo.push(before);if(d.undo.length>80)d.undo.shift();d.redo=[];formsUi.notice='';}
 if(!keepRender)render();
}
function formsUndo(){const d=formsDraft();if(!d.undo.length)return;d.redo.push(formsClone(d.tpl));d.tpl=d.undo.pop();formsFixSel();render();}
function formsRedo(){const d=formsDraft();if(!d.redo.length)return;d.undo.push(formsClone(d.tpl));d.tpl=d.redo.pop();formsFixSel();render();}
function formsFixSel(){const s=formsUi;if(s.sel&&!formsFind(formsDraft().tpl,s.sel))s.sel=null;}
/* Пометка версии — что поменялось против прошлого Save. */
function formsDiffNote(was,now,def){
 if(JSON.stringify(now)===JSON.stringify(formClean(formsClone(def),def)))return 'Default form';
 was=formClean(formsClone(was),def);
 const map=t=>{const m=new Map();Object.keys(t.parts).forEach(k=>(t.parts[k].blocks||[]).forEach(b=>m.set(k+'|'+b.id,JSON.stringify(b))));return m;},a=map(was),b=map(now);
 let add=0,del=0,chg=0;b.forEach((v,k)=>{if(!a.has(k))add++;else if(a.get(k)!==v)chg++;});a.forEach((v,k)=>{if(!b.has(k))del++;});
 const n=(x,w)=>x?x+' '+(x===1?'block':'blocks')+' '+w:'';
 return [n(add,'added'),n(chg,'changed'),n(del,'removed')].filter(Boolean).join(' · ')||'Spacing changed';
}
function formsSave(){
 const s=formsState(),d=formsDraft(),def=formsDef(s.form).def(),tpl=formClean(d.tpl,def),was=formsSaved(s.form);
 const me=typeof signinUser==='function'?signinUser():null;
 DB.formVersion=(DB.formVersion||[]).concat([{id:salesUid('FV'),form:s.form,at:new Date().toISOString(),by:me?me.name:'',note:formsDiffNote(was,tpl,def),tpl:formsClone(tpl)}]);
 const mine=DB.formVersion.filter(v=>v.form===s.form);if(mine.length>FORMS_VERSIONS){const drop=new Set(mine.slice(0,mine.length-FORMS_VERSIONS).map(v=>v.id));DB.formVersion=DB.formVersion.filter(v=>!drop.has(v.id));}
 DB.formTemplate=Object.assign({},DB.formTemplate,{[s.form]:tpl});
 d.tpl=formsClone(tpl);d.saved=JSON.stringify(d.tpl);s.notice='Saved';touch();render();
}
function formsReset(){
 if(!confirm('Back to the default form? Nothing changes until Save.'))return;
 const def=formsDef(formsState().form).def();formsUi.sel=null;formsEdit(t=>{Object.keys(t).forEach(k=>delete t[k]);Object.assign(t,formsClone(def));});
}
function formsSetForm(k){const s=formsState();if(s.form===k)return;s.form=k;s.sample='';s.sel=null;s.part='every';s.modal=null;formsState();render();}
function formsSetSample(id){formsState().sample=id;render();}
function formsSelect(part,id){const s=formsState();s.sel=id?{part,id}:null;s.part=part;render();}

/* ------------------------------ Блоки -------------------------------- */
function formsFieldDef(k){return formsDef(formsState().form).fields().find(x=>x.k===k);}
function formsBlockLabel(b){
 if(b.type==='text'){const t=String(b.text||'').replace(/\s+/g,' ').trim();return t.length>34?t.slice(0,33)+'…':t||'Text';}
 if(b.type==='field'){const f=formsFieldDef(b.field);return (b.prefix||'')+(f?f.label:b.field);}
 if(b.type==='barcode'){const f=formsFieldDef(b.field);return b.field==='barcode'?'Barcode':'Barcode · '+(f?f.label:b.field);}
 return {line:'Line',box:'Frame',image:'Picture'}[b.type]||b.type;
}
function formsTypeLabel(b){return {text:'Text',field:'Field',line:'Line',box:'Frame',image:'Picture',barcode:'Barcode'}[b.type]||'Block';}
/* Новый блок встаёт под части и раздвигает её — ничего не налезает. */
function formsAddBlock(make){
 const s=formsState();let part=s.sel?s.sel.part:s.part||'every';
 if(!formsDraft().tpl.parts[part]||formsDraft().tpl.parts[part].columns)part='totals';
 formsEdit(t=>{
  const p=t.parts[part],b=make(),id='b'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  b.id=id;b.y=p.h||0;p.blocks=(p.blocks||[]).concat([b]);p.h=(p.h||0)+(b.type==='line'?6:(b.h||14)+4);
  s.sel={part,id};s.part=part;
 });
}
function formsAdd(type){
 if(type==='field'){formsOpenField('add');return;}
 if(type==='image'){const el=document.querySelector('[data-forms-picture]');if(el)el.click();return;}
 const C=DOC_COLOR,make={
  text:()=>({type:'text',text:'Text',place:'left',w:240,h:14,size:9,lh:14,wrap:true}),
  line:()=>({type:'line',place:'left',w:540,h:0,lw:.6,color:C.line}),
  box:()=>({type:'box',place:'left',w:200,h:40,lw:.6,color:C.line,r:3}),
  barcode:()=>({type:'barcode',field:'barcode',place:'left',w:200,h:30})}[type];
 if(make)formsAddBlock(make);
}
/* Картинка — в JPEG (PDF вставляет JPEG как есть), не шире 800 точек. */
function formsPicture(input){
 const file=input.files&&input.files[0];input.value='';if(!file)return;
 const reader=new FileReader();
 reader.onload=()=>{const img=new Image();img.onload=()=>{
  const k=Math.min(1,800/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*k));c.height=Math.max(1,Math.round(img.height*k));
  const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);
  const src=c.toDataURL('image/jpeg',.9),s=formsState();
  if(s.sel&&formsFind(formsDraft().tpl,s.sel)?.type==='image')formsSet('src',src);
  else formsAddBlock(()=>({type:'image',src,place:'left',w:Math.round(40*c.width/c.height),h:40}));
 };img.src=reader.result;};
 reader.readAsDataURL(file);
}
function formsDelete(){const s=formsState(),sel=s.sel;if(!sel)return;s.sel=null;formsEdit(t=>{const p=t.parts[sel.part];p.blocks=p.blocks.filter(b=>b.id!==sel.id);});}
function formsSet(k,v){
 const s=formsState();if(!s.sel)return;
 formsEdit(t=>{const b=formsFind(t,s.sel);if(!b)return;
  if(v===''||v==null)delete b[k];else b[k]=v;
  if(k==='place'&&v==='free'&&b.x==null)b.x=formBlockX(t,Object.assign({},b,{place:formsUi.lastPlace||'left'}));
 });
}
function formsPlace(v){const b=formsFind(formsDraft().tpl,formsState().sel);if(b)formsUi.lastPlace=b.place;formsSet('place',v);}
function formsNum(k,v,mm){
 const n=Number(String(v).replace(',','.'));if(!Number.isFinite(n))return render();
 formsSet(k,Math.round((mm?n/FORMS_PT_MM:n)*100)/100);
}
function formsToggle(k){const b=formsFind(formsDraft().tpl,formsState().sel);if(b)formsSet(k,b[k]?'':true);}

/* ---------------------------- Окно поля ------------------------------ */
function formsOpenField(mode){
 const s=formsState(),b=mode==='change'?formsFind(formsDraft().tpl,s.sel):null,f=b&&formsFieldDef(b.field);
 s.modal={mode,group:f?f.g:formsDef(s.form).fields()[0].g,field:b?b.field:'',format:b&&b.format||'',prefix:b&&b.prefix||'',q:''};render();
}
function formsModalSet(k,v){const m=formsUi&&formsUi.modal;if(!m)return;m[k]=v;if(k==='group')m.q='';render();if(k==='q'){const el=document.querySelector('[data-forms-search]');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}}}
function formsModalClose(){formsUi.modal=null;render();}
function formsModalApply(){
 const s=formsState(),m=s.modal;if(!m)return;
 if(m.field==='@page'){s.modal=null;formsAddBlock(()=>({type:'text',text:(m.prefix||'Page ')+'{page} of {pages}',place:'left',w:200,h:14,size:8,lh:14}));return;}
 if(!m.field)return;
 const f=formsFieldDef(m.field),fmt=f&&f.t?m.format||'':'';s.modal=null;
 if(m.mode==='change'){formsEdit(t=>{const b=formsFind(t,s.sel);if(!b)return;b.field=m.field;if(fmt)b.format=fmt;else delete b.format;if(m.prefix)b.prefix=m.prefix;else delete b.prefix;});return;}
 formsAddBlock(()=>Object.assign({type:'field',field:m.field,place:'left',w:260,h:14,size:9,lh:14,wrap:true},fmt?{format:fmt}:{},m.prefix?{prefix:m.prefix}:{}));
}
function formsModalHTML(ctx){
 const s=formsState(),m=s.modal;if(!m)return '';
 const fields=formsDef(s.form).fields(),groups=[...new Set(fields.map(f=>f.g))].concat(['Page']);
 const val=f=>{let v=ctx.field(f.k);if(f.t)v=formFormat(v,f.t,m.format);v=Array.isArray(v)?v.join(' · '):String(v==null?'':v);return v||'—';};
 const q=m.q.trim().toLowerCase(),list=q?fields.filter(f=>(f.label+' '+f.g).toLowerCase().includes(q)):m.group==='Page'?[]:fields.filter(f=>f.g===m.group);
 const rows=list.map(f=>`<button type="button" class="fm-pick${m.field===f.k?' on':''}" data-forms-field="${esc(f.k)}" onclick="formsModalSet('field','${esc(f.k)}')"><span>${esc(f.label)}</span><em>${esc(val(f))}</em></button>`).join('')+(!q&&m.group==='Page'?`<button type="button" class="fm-pick${m.field==='@page'?' on':''}" onclick="formsModalSet('field','@page')"><span>Page number</span><em>1 of 2</em></button>`:'');
 const f=fields.find(x=>x.k===m.field),formats=f&&f.t?FORM_FORMATS[f.t]:null,sample=f?ctx.field(f.k):'';
 const fmt=formats?formats.map((x,i)=>`<button type="button" class="fm-fmt${(m.format||formats[0].k)===x.k?' on':''}" onclick="formsModalSet('format','${x.k}')"><span>${esc(String(formFormat(sample||finToday(),f.t,x.k)))}</span><small>${esc(x.label)}</small></button>`).join(''):`<p class="fm-note">${f?'As is':'Choose a field'}</p>`;
 return `<div class="fm-modal-back" onclick="formsModalClose()"></div><div class="fm-modal" role="dialog" aria-modal="true" aria-label="Insert field" data-forms-modal>
  <div class="fm-modal-head"><b>${m.mode==='change'?'Change field':'Insert field'}</b><button type="button" class="fm-x" aria-label="Close" onclick="formsModalClose()">×</button></div>
  <input class="fm-search" data-forms-search placeholder="Search fields…" value="${esc(m.q)}" oninput="formsModalSet('q',this.value)">
  <div class="fm-cols3"><div class="fm-groups">${groups.map(g=>`<button type="button" class="fm-pick${!q&&m.group===g?' on':''}" onclick="formsModalSet('group','${esc(g)}')">${esc(g)}</button>`).join('')}</div>
   <div class="fm-fields">${rows||'<p class="fm-note">No fields</p>'}</div>
   <div><div class="fm-h">Format</div>${fmt}<div class="fm-h">Before the value</div><input class="fm-in" data-forms-prefix value="${esc(m.prefix)}" placeholder="Date: " onchange="formsUi.modal.prefix=this.value"></div></div>
  <div class="fm-modal-foot"><button type="button" onclick="formsModalClose()">Cancel</button><button type="button" class="pri" data-forms-insert ${m.field?'':'disabled'} onclick="formsModalApply()">${m.mode==='change'?'Apply':'Insert'}</button></div></div>`;
}

/* ---------------------------- Версии --------------------------------- */
/* Список окна Versions: сохранённые версии (новые сверху), «сохранено до
   истории», если бланк сохраняли раньше, и бланк программы. */
function formsVersionList(){
 const s=formsState(),def=formsDef(s.form).def(),list=(DB.formVersion||[]).filter(v=>v.form===s.form).slice().reverse();
 if(!list.length&&DB.formTemplate&&DB.formTemplate[s.form])list.push({id:'@saved',at:'',by:'',note:'Saved before history',tpl:formsSaved(s.form)});
 return list.concat([{id:'@default',at:'',by:'Glass ERP',note:'The program’s form',tpl:def}]);
}
function formsWhen(at){
 if(!at)return 'Default';const d=new Date(at);if(isNaN(d))return at;const t=d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
 return d.toDateString()===new Date().toDateString()?'Today '+t:DOC_MONTHS[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear()+' '+t;
}
function formsVersionsOpen(){formsState().versions={sel:0,error:''};render();}
function formsVersionsClose(){formsUi.versions=null;render();}
function formsVersionPick(i){formsUi.versions.sel=i;formsUi.versions.error='';render();}
function formsVersionRestore(){
 const s=formsState(),v=formsVersionList()[s.versions.sel];if(!v)return;s.versions=null;s.sel=null;
 formsEdit(t=>{Object.keys(t).forEach(k=>delete t[k]);Object.assign(t,formsClone(v.tpl));});
}
function formsVersionDownload(){
 const s=formsState(),v=formsVersionList()[s.versions.sel];if(!v)return;
 const day=(v.at||new Date().toISOString()).slice(0,10),def=formsDef(s.form);
 storageDownload('form-'+def.label.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+day+'.json',JSON.stringify({format:'glass-erp-form',form:s.form,label:def.label,at:v.at,by:v.by,note:v.note,tpl:v.tpl},null,1));
}
/* Файл бланка → черновик (Save — чтобы оставить). */
function formsLoadText(text){
 const s=formsState();let o;try{o=JSON.parse(text);}catch(e){o=null;}
 if(!o||o.format!=='glass-erp-form'||!o.tpl||typeof o.tpl!=='object'){if(s.versions)s.versions.error='Not a form file.';render();return false;}
 if(o.form!==s.form){if(s.versions)s.versions.error='This file is for '+(o.label||o.form)+'.';render();return false;}
 s.versions=null;s.sel=null;formsEdit(t=>{Object.keys(t).forEach(k=>delete t[k]);Object.assign(t,formClean(o.tpl,formsDef(s.form).def()));});return true;
}
function formsLoadFile(input){const f=input.files&&input.files[0];input.value='';if(!f)return;const r=new FileReader();r.onload=()=>formsLoadText(String(r.result||''));r.readAsText(f);}
function formsVersionsHTML(){
 const s=formsState(),m=s.versions;if(!m)return '';
 const list=formsVersionList(),v=list[m.sel]||list[0],def=formsDef(s.form);
 let pages=[];try{pages=def.pages(v.tpl,def.doc(s.sample));}catch(e){}
 return `<div class="fm-modal-back" onclick="formsVersionsClose()"></div><div class="fm-modal fm-versions" role="dialog" aria-modal="true" aria-label="Versions" data-forms-versions>
  <div class="fm-vlist"><div class="fm-modal-head"><b>Versions · ${esc(def.label)}</b></div>
   ${list.map((x,i)=>`<button type="button" class="fm-pick fm-ver${i===m.sel?' on':''}" data-forms-version="${i}" onclick="formsVersionPick(${i})"><b>${esc(formsWhen(x.at))}${x.by?' · '+esc(x.by):''}</b><small>${esc(x.note||'')}</small></button>`).join('')}
   <div class="fm-vfile"><button type="button" data-forms-download onclick="formsVersionDownload()">Download this version</button><button type="button" onclick="document.querySelector('[data-forms-file]').click()">Load form file…</button></div>
   ${m.error?`<p class="fm-error" data-forms-file-error>${esc(m.error)}</p>`:''}<input type="file" accept=".json,application/json" hidden data-forms-file onchange="formsLoadFile(this)"></div>
  <div class="fm-vview"><div class="fm-vpages">${pages.map(pg=>`<div class="fm-vsheet">${docPageSVG(pg).replace('width="612" height="792"','width="100%" height="100%"')}</div>`).join('')}</div>
   <div class="fm-modal-foot"><button type="button" onclick="formsVersionsClose()">Close</button><button type="button" class="pri" data-forms-restore ${m.sel===0&&list[0].id!=='@default'&&!formsDirty()?'disabled':''} onclick="formsVersionRestore()">Restore this version</button></div></div></div>`;
}

/* ------------------------------ Лист --------------------------------- */
function formsRuler(vert,len){
 let t='';for(let q=0;q*18<=len;q++){const pos=(q*18/len*100).toFixed(3)+'%',big=q%4===0;
  t+=`<i class="${big?'big':''}" style="${vert?'top':'left'}:${pos}"></i>`+(big&&q?`<b style="${vert?'top':'left'}:${pos}">${q/4}</b>`:'');}
 return `<div class="fm-ruler ${vert?'y':'x'}" aria-hidden="true">${t}</div>`;
}
function formsSheetsHTML(){
 const s=formsState(),def=formsDef(s.form),tpl=formsDraft().tpl,d=def.doc(s.sample),map=[];
 let pages;try{pages=def.pages(tpl,d,map);}catch(e){return `<p class="fm-note">Preview failed: ${esc(e.message)}</p>`;}
 const W=tpl.page.w,H=tpl.page.h,pc=(v,of)=>(v/of*100).toFixed(4)+'%',m=tpl.page.margin;
 return pages.map((pg,i)=>{
  const boxes=new Map();
  map.filter(r=>r.page===i).forEach(r=>{const k=r.part+'|'+r.id,b=boxes.get(k);if(!b)boxes.set(k,Object.assign({},r));else{const x2=Math.max(b.x+b.w,r.x+r.w),y2=Math.max(b.y+b.h,r.y+r.h);b.x=Math.min(b.x,r.x);b.y=Math.min(b.y,r.y);b.w=x2-b.x;b.h=y2-b.y;}});
  const hits=[...boxes.values()].map(r=>{const sel=s.sel&&s.sel.part===r.part&&s.sel.id===r.id,b=formsFind(tpl,r);if(!b)return '';
   const handles=sel?'<span class="fm-rs e" data-forms-resize="e"></span>'+(formIsText(b)?'':'<span class="fm-rs s" data-forms-resize="s"></span>'):'';
   return `<div class="fm-hit${sel?' sel':''}" data-forms-hit="${esc(r.part)}|${esc(r.id)}" title="${esc(formsBlockLabel(b))}" style="left:${pc(r.x,W)};top:${pc(r.y,H)};width:${pc(Math.max(r.w,4),W)};height:${pc(Math.max(r.h,4),H)}" onpointerdown="formsPointerStart(event,'${esc(r.part)}','${esc(r.id)}')">${handles}</div>`;}).join('');
  return `<div class="fm-sheet" data-forms-page="${i}" data-w="${W}" data-h="${H}">${docPageSVG(pg).replace('width="612" height="792"','width="100%" height="100%"')}${i?'':formsRuler(false,W)+formsRuler(true,H)}<div class="fm-margin" style="left:${pc(m.left,W)};right:${pc(m.right,W)}"></div>${hits}</div>`;
 }).join('');
}
function formsStageRefresh(){const st=document.querySelector('[data-forms-stage]');if(st)st.innerHTML=formsSheetsHTML();}
/* Тянуть блок мышью: Left / Center / Right ходят только вверх-вниз, Free —
   куда угодно; уголок справа — ширина, снизу — высота рамки и линии. */
function formsPointerStart(e,part,id){
 if(e.button!==0||formsPointer)return;
 const sheet=e.currentTarget.closest('[data-forms-page]'),stage=e.currentTarget.closest('[data-forms-stage]'),d=formsDraft(),b=formsFind(d.tpl,{part,id});if(!sheet||!b)return;
 e.preventDefault();e.stopPropagation();const s=formsState();s.sel={part,id};s.part=part;
 const handle=e.target.closest('[data-forms-resize]'),r=sheet.getBoundingClientRect();
 formsPointer={part,id,pid:e.pointerId,stage,before:formsClone(d.tpl),b0:formsClone(b),x0:formBlockX(d.tpl,b),handle:handle?handle.dataset.formsResize:'move',x:e.clientX,y:e.clientY,k:d.tpl.page.w/r.width,moved:false};
 try{stage.setPointerCapture(e.pointerId);}catch(x){}
 stage.onpointermove=formsPointerMove;stage.onpointerup=ev=>formsPointerEnd(ev,false);stage.onpointercancel=ev=>formsPointerEnd(ev,true);
 formsStageRefresh();
}
function formsPointerMove(e){
 const p=formsPointer;if(!p||e.pointerId!==p.pid)return;e.preventDefault();
 const b=formsFind(formsDraft().tpl,p),dx=(e.clientX-p.x)*p.k,dy=(e.clientY-p.y)*p.k,r=v=>Math.round(v*2)/2;if(!b)return;
 if(Math.abs(e.clientX-p.x)+Math.abs(e.clientY-p.y)>2)p.moved=true;if(!p.moved)return;
 if(p.handle==='e')b.w=Math.max(8,r((p.b0.w||0)+dx));
 else if(p.handle==='s')b.h=Math.max(0,r((p.b0.h||0)+dy));
 else{b.y=r(p.b0.y+dy);if(b.place==='free')b.x=r(p.x0+dx);}
 formsStageRefresh();
}
function formsPointerEnd(e,cancel){
 const p=formsPointer;if(!p||e.pointerId!==p.pid)return;formsPointer=null;formsClickUntil=Date.now()+300;
 try{p.stage.releasePointerCapture(p.pid);}catch(x){}p.stage.onpointermove=p.stage.onpointerup=p.stage.onpointercancel=null;
 const d=formsDraft();
 if(cancel)d.tpl=p.before;else if(JSON.stringify(p.before)!==JSON.stringify(d.tpl)){d.undo.push(p.before);if(d.undo.length>80)d.undo.shift();d.redo=[];formsUi.notice='';}
 render();
}

/* ---------------------------- Панели --------------------------------- */
function formsTreeHTML(tpl){
 const s=formsState();
 return Object.keys(tpl.parts).map(k=>{const p=tpl.parts[k],lab=FORMS_PARTS[k]||[k,''];
  const kids=p.columns?`<button type="button" class="fm-node c" disabled>Columns (${p.columns.length})</button>`:(p.blocks||[]).map(b=>`<button type="button" class="fm-node c${s.sel&&s.sel.part===k&&s.sel.id===b.id?' sel':''}" data-forms-node="${esc(k)}|${esc(b.id)}" onclick="formsSelect('${esc(k)}','${esc(b.id)}')">${esc(formsBlockLabel(b))}</button>`).join('');
  return `<button type="button" class="fm-node p${!s.sel&&s.part===k?' sel':''}" data-forms-part="${esc(k)}" onclick="formsSelect('${esc(k)}','')"><span>${esc(lab[0])}</span><small>${esc(lab[1])}</small></button>${kids}`;}).join('');
}
function formsSettingsHTML(tpl){
 const s=formsState(),b=formsFind(tpl,s.sel);
 if(!b){const lab=FORMS_PARTS[s.part]||[s.part,''];return `<div class="fm-h">Part · ${esc(lab[0])}</div><p class="fm-note">Click a block on the sheet or in the list. Add puts a new block here.</p>`;}
 const mm=v=>v==null?'':Math.round(v*FORMS_PT_MM*10)/10,f=b.type==='field'||b.type==='barcode'?formsFieldDef(b.field):null,text=formIsText(b);
 const seg=(cur,list,fn)=>`<div class="fm-seg">${list.map(([k,l])=>`<button type="button" class="${cur===k?'on':''}" onclick="${fn}('${k}')">${l}</button>`).join('')}</div>`;
 const num=(k,label,v,isMm)=>`<label><span>${label}</span><input class="fm-in" data-forms-num="${k}" inputmode="decimal" value="${esc(String(v))}" onchange="formsNum('${k}',this.value,${isMm?'true':'false'})"></label>`;
 let what='';
 if(b.type==='text')what=`<label class="wide"><span>Text</span><textarea class="fm-in" data-forms-text rows="3" onchange="formsSet('text',this.value)">${esc(b.text||'')}</textarea></label><p class="fm-note">Fields in text: {number}, {page} of {pages}</p>`;
 else if(f||b.type==='field'||b.type==='barcode')what=`<label class="wide"><span>Field</span><button type="button" class="fm-in fm-field-btn" data-forms-change onclick="formsOpenField('change')">${esc(f?f.label:b.field)} ▾</button></label>${b.prefix?`<p class="fm-note">Before: “${esc(b.prefix)}”</p>`:''}`;
 else if(b.type==='image')what=`<button type="button" class="fm-wide-btn" onclick="document.querySelector('[data-forms-picture]').click()">Replace picture</button>`;
 const look=text?`<div class="fm-h">Text</div><div class="fm-row">${num('size','Size, pt',b.size||9)}${num('lh','Line spacing, pt',formLh(b))}</div>
   <label><span>Font</span><select class="fm-in" data-forms-font onchange="formsSet('font',this.value)">${[['','Helvetica'],['times','Times'],['courier','Courier']].map(([k,l])=>`<option value="${k}" ${(b.font||'')===k?'selected':''}>${l}</option>`).join('')}</select></label>
   <div class="fm-seg"><button type="button" class="${b.bold?'on':''}" onclick="formsToggle('bold')"><b>B</b></button><button type="button" class="${b.italic?'on':''}" data-forms-italic onclick="formsToggle('italic')"><i>I</i></button>${['left','center','right'].map(a=>`<button type="button" class="${(b.align||'left')===a?'on':''}" onclick="formsSet('align','${a}')">${a[0].toUpperCase()+a.slice(1)}</button>`).join('')}</div>
   <div class="fm-row"><label><span>Color</span><input type="color" class="fm-in fm-color" value="${esc(b.color||DOC_COLOR.ink)}" onchange="formsSet('color',this.value)"></label><label class="fm-check"><input type="checkbox" ${b.wrap?'checked':''} onchange="formsToggle('wrap')"><span>Wrap lines</span></label></div>`
  :b.type==='line'||b.type==='box'?`<div class="fm-h">Line</div><div class="fm-row"><label><span>Color</span><input type="color" class="fm-in fm-color" value="${esc(b.color||DOC_COLOR.line)}" onchange="formsSet('color',this.value)"></label>${num('lw','Width, pt',b.lw||.6)}</div>${b.type==='box'?`<div class="fm-row"><label><span>Fill</span><input type="color" class="fm-in fm-color" value="${esc(b.fill||'#ffffff')}" onchange="formsSet('fill',this.value==='#ffffff'?'':this.value)"></label>${num('r','Corner, pt',b.r||0)}</div>`:''}`:'';
 return `<div class="fm-h fm-sel-h"><span>Selected · ${esc(formsTypeLabel(b))}</span><button type="button" class="fm-del" data-forms-delete onclick="formsDelete()">Delete</button></div>${what}
  <div class="fm-h">Place on sheet</div>${seg(b.place||'left',[['left','Left'],['center','Center'],['right','Right'],['free','Free']],'formsPlace')}
  <div class="fm-row">${b.place==='free'?num('x','X, mm',mm(b.x),true):''}${num('y','Y, mm',mm(b.y),true)}${num('w','Width, mm',mm(b.w),true)}${text?'':num('h','Height, mm',mm(b.h),true)}</div>${look}`;
}
function viewMdForms(){
 const s=formsState(),def=formsDef(s.form),d=formsDraft(),tpl=d.tpl,dirty=formsDirty(),samples=def.samples();
 const ctx=def.context(def.doc(s.sample));
 const add=[['text','Text'],['field','Field'],['image','Picture'],['line','Line'],['box','Frame'],['barcode','Barcode']];
 return `<div class="fm" data-forms>
  <div class="fm-bar"><div class="fm-forms">${formsDefs().map(x=>`<button type="button" class="sl-quick-pill${x.k===s.form?' on':''}" onclick="formsSetForm('${x.k}')">${esc(x.label)}</button>`).join('')}</div><span class="fm-sp"></span>
   <label class="fm-preview"><span>Preview</span><select data-forms-sample onchange="formsSetSample(this.value)">${samples.length?samples.map(x=>`<option value="${esc(x.id)}" ${x.id===s.sample?'selected':''}>${esc(x.label)}</option>`).join(''):'<option value="sample">Sample</option>'}</select></label>
   <button type="button" data-forms-undo ${d.undo.length?'':'disabled'} onclick="formsUndo()">Undo</button><button type="button" data-forms-redo ${d.redo.length?'':'disabled'} onclick="formsRedo()">Redo</button><button type="button" data-forms-history onclick="formsVersionsOpen()">History</button><button type="button" data-forms-reset onclick="formsReset()">Reset to default</button>
   ${dirty?'<span class="fm-dirty" data-forms-dirty>Unsaved changes</span>':s.notice?`<span class="fm-saved">${esc(s.notice)}</span>`:''}<button type="button" class="pri" data-forms-save ${dirty?'':'disabled'} onclick="formsSave()">Save</button></div>
  <div class="fm-grid">
   <aside class="fm-card fm-left"><div class="fm-h">Add</div><div class="fm-add">${add.map(([k,l])=>`<button type="button" data-forms-add="${k}" onclick="formsAdd('${k}')">+ ${l}</button>`).join('')}</div><input type="file" accept="image/*" hidden data-forms-picture onchange="formsPicture(this)">
    <div class="fm-h">Parts of the sheet</div><div class="fm-tree">${formsTreeHTML(tpl)}</div></aside>
   <div class="fm-stage" data-forms-stage>${formsSheetsHTML()}</div>
   <aside class="fm-card fm-right" data-forms-settings>${formsSettingsHTML(tpl)}</aside>
  </div>${formsModalHTML(ctx)}${formsVersionsHTML()}</div>`;
}
