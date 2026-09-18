/* =====================================================================
   views/stickers-ui  ·  stickers-1.0
   Печать стикеров и конструктор шаблонов (Master Data → Stickers).
   IN : DB.salesOrder, DB.glassBatch, DB.recut, DB.stickerTemplate
   OUT: страницы печати; сохранённые шаблоны

   Владелец, 17 сентября 2026:
   - сток: выбрать заказ в Sales → Stickers → стекло или весь юнит;
   - батч печатают по порядку (по листу — когда будет своя раскладка);
   - размер рулона выбирается при печати и запоминается на компьютере;
   - конструктор «как конструктор документов»: размер в pt, детали внутри
     блока, блоки двигаются мышкой — в списке и прямо на стикере.
   Glass ID в окнах Sales не показывается — только на бумаге.
   ===================================================================== */
let stkDialog=null,stkBuilder=null,stkPrintEdit=null,stkDrag='';
const STK_SIZE_PREF='glass_erp_sticker_size_v1',STK_PX=1.3;
function stkPrefSize(){try{const v=localStorage.getItem(STK_SIZE_PREF);return STK_SIZES.some(s=>s.k===v)?v:'4x6';}catch(e){return '4x6';}}
function stkSetPrefSize(v){try{localStorage.setItem(STK_SIZE_PREF,v);}catch(e){}}
/* «1-5, 8» → [1,2,3,4,5,8]; пусто — все; ошибка — null. */
function stkParseUnits(text,max){
 const s=String(text==null?'':text).trim();if(!s)return Array.from({length:max},(_,i)=>i+1);
 const out=new Set();
 for(const part of s.split(/[,;\s]+/).filter(Boolean)){
  const m=/^(\d+)(?:-(\d+))?$/.exec(part);if(!m)return null;let a=+m[1],b=m[2]?+m[2]:a;if(a>b)[a,b]=[b,a];
  if(a<1||b>max)return null;for(let u=a;u<=b;u++)out.add(u);
 }
 return [...out].sort((a,b)=>a-b);
}
function stkBatchOf(o,c,unit){const x=glassBatchActive(o.id).get(c.key+'|'+unit);return x?x.batch.number:'';}

/* ------------------------------ Печать ------------------------------ */
/* override — шаблон «только для этой печати» из ✎ Customize. */
function stkPages(jobs,size,override){
 const tpls={};
 return jobs.map(j=>{
  const tpl=tpls[j.type]||(tpls[j.type]=override||stkTemplate(j.type,size));
  const d=j.type==='unit'?stkUnitData(j.o,j.l,j.unit):stkGlassData(j.type,j.o,j.l,j.c,j.unit,{batch:stkBatchOf(j.o,j.c,j.unit)});
  return stkLayout(tpl,size,d);
 });
}
function stkPrintHost(){let h=document.getElementById('stkPrintHost');if(!h){h=document.createElement('div');h.id='stkPrintHost';document.body.appendChild(h);}return h;}
function stkPrintPrepare(pages){
 if(!pages.length)return 0;
 const win=pages[0].w/72,hin=pages[0].h/72;
 let st=document.getElementById('stkPageStyle');if(!st){st=document.createElement('style');st.id='stkPageStyle';document.head.appendChild(st);}
 st.textContent='@page stk{size:'+win+'in '+hin+'in;margin:0}';
 stkPrintHost().innerHTML=pages.map(pg=>`<div class="stk-print-page" style="width:${win}in;height:${hin}in">${stkPageSVG(pg,win+'in',hin+'in')}</div>`).join('');
 document.body.classList.add('stk-printing');
 return pages.length;
}
function stkPrintCleanup(){document.body.classList.remove('stk-printing');const h=document.getElementById('stkPrintHost');if(h)h.innerHTML='';}
function stkPrint(pages){
 if(!stkPrintPrepare(pages))return false;
 window.addEventListener('afterprint',stkPrintCleanup,{once:true});
 setTimeout(stkPrintCleanup,60000);
 try{window.print();}catch(e){stkPrintCleanup();return false;}
 return true;
}

/* ---------------------------- Окно печати ---------------------------- */
function stkOrderRows(o){
 const rows=(o.lines||[]).map((l,li)=>({key:'L:'+l.id,kind:'line',l,li,comps:glassBatchComponents(o,l).filter(c=>!c.missing)}));
 (DB.recut||[]).filter(r=>r.orderId===o.id).forEach(r=>{const l=o.lines.find(x=>x.id===r.lineId);if(l)rows.push({key:'R:'+r.id,kind:'recut',r,l,li:o.lines.indexOf(l),comps:glassBatchComponents(o,l).filter(c=>(r.keys||[]).includes(c.key))});});
 return rows;
}
function stkCanPrintOrder(o){return !!o&&!salesIsQuote(o)&&o.status!=='cancelled';}
function stkOpenForOrder(orderId){
 const o=salesRecord(orderId);if(!stkCanPrintOrder(o))return;
 salesListMenu=null;if(glassPieceEnsure(o))touch();
 const rows={};stkOrderRows(o).forEach(r=>{rows[r.key]={on:r.kind==='line',which:'all',units:''};});
 stkDialog={mode:'order',orderId,type:'production',size:stkPrefSize(),rows,warning:'',error:''};render();
}
function stkOpenForBatch(number){
 const b=glassBatchFind(number);if(!b)return;
 const picked=glassBatchInfos().filter(i=>i.item&&!i.item.releasedAt&&glassBatchSelection.has(glassBatchRowKey(i))).map(i=>i.item.piece);
 stkDialog={mode:'batch',batchNo:number,pieces:picked,type:'production',size:stkPrefSize(),order:typeof cutPlanFor==='function'&&cutPlanFor(number)?'sheet':'in',warning:'',error:''};render();
}
function stkDialogType(v){stkDialogSet('type',v);}
function stkDialogOrder(v){stkDialogSet('order',v);}
function stkDialogSize(v){stkDialogSet('size',v);}
function stkDialogClose(){stkDialog=null;stkPrintEdit=null;render();}
function stkDialogSet(k,v){if(!stkDialog)return;if(stkDialog[k]!==v&&(k==='type'||k==='size'))stkDialog.tpl=null;stkDialog[k]=v;stkDialog.warning='';stkDialog.error='';if(k==='size')stkSetPrefSize(v);render();}
function stkDialogRow(key,k,v,rerender){
 const d=stkDialog;if(!d||!d.rows[key])return;d.rows[key][k]=v;d.warning='';d.error='';
 if(rerender)render();else stkDialogRefresh();
}
function stkDialogRefresh(){
 const r=stkDialogJobs(),c=document.querySelector('[data-stk-count]'),p=document.querySelector('[data-stk-print]');
 if(c){c.textContent=r.error||r.jobs.length+' sticker'+(r.jobs.length===1?'':'s');c.classList.toggle('bad',!!r.error);}
 if(p)p.disabled=!!r.error||!r.jobs.length;
}
/* Порядок печати: «по порядку» — заказ, позиция, изделие, лайт; «по листу» —
   как стёкла лежат на листах раскроя: «будем печатать из нашей оптимизации». */
function stkBatchJobs(b,pieces,order){
 const pick=pieces&&pieces.length?new Set(pieces):null,jobs=[];
 const sheets=order==='sheet'&&typeof cutPlanIndex==='function'?cutPlanIndex(b.number):null;
 glassBatchActiveItems(b).forEach(item=>{
  if(pick&&!pick.has(item.piece))return;
  const part=b.parts[item.part],o=salesRecord(part.orderId),l=o&&(o.lines||[]).find(x=>x.id===part.lineId),cs=o&&l?glassBatchComponents(o,l):[],c=cs.find(x=>x.key===part.key);
  if(!c)return;
  const at=sheets&&sheets.get(item.piece);
  jobs.push({type:'production',o,l,c,unit:item.unit,
   sort:at?[0,at.sheet,at.pos,0]:[+String(o.businessNumber).replace(/\D/g,'')||0,o.lines.indexOf(l),typeof item.unit==='string'?1e6+(+item.unit.split('.')[1]||0):item.unit,cs.indexOf(c)]});
 });
 return jobs.sort((a,b)=>{for(let i=0;i<4;i++)if(a.sort[i]!==b.sort[i])return a.sort[i]-b.sort[i];return 0;});
}
function stkDialogJobs(){
 const d=stkDialog;if(!d)return {jobs:[],error:''};
 if(d.mode==='batch'){const b=glassBatchFind(d.batchNo);return {jobs:b?stkBatchJobs(b,d.pieces,d.order):[],error:''};}
 const o=salesRecord(d.orderId);if(!o)return {jobs:[],error:''};
 const jobs=[];
 for(const row of stkOrderRows(o)){
  const x=d.rows[row.key];if(!x||!x.on)continue;
  const label=row.kind==='recut'?'Recut '+row.r.no:'Line '+(row.li+1);
  if(d.type==='unit'){
   if(row.kind!=='line'||row.comps.length<2)continue;
   const units=stkParseUnits(x.units,row.l.qty);if(!units)return {jobs,error:label+': units 1 to '+row.l.qty};
   units.forEach(unit=>jobs.push({type:'unit',o,l:row.l,unit}));continue;
  }
  const comps=x.which==='all'?row.comps:row.comps.filter(c=>c.key===x.which);
  if(row.kind==='recut'){
   const ks=stkParseUnits(x.units,row.r.qty);if(!ks)return {jobs,error:label+': pieces 1 to '+row.r.qty};
   ks.forEach(k=>comps.forEach(c=>jobs.push({type:d.type,o,l:row.l,c,unit:'R'+row.r.no+'.'+k})));continue;
  }
  const units=stkParseUnits(x.units,row.l.qty);if(!units)return {jobs,error:label+': units 1 to '+row.l.qty};
  units.forEach(unit=>comps.forEach(c=>jobs.push({type:d.type,o,l:row.l,c,unit})));
 }
 return {jobs,error:''};
}
function stkDialogPrint(){
 const d=stkDialog;if(!d)return;
 const r=stkDialogJobs();if(r.error){d.error=r.error;render();return;}
 if(!r.jobs.length)return;
 let pages;try{pages=stkPages(r.jobs,d.size,d.tpl);}catch(e){d.error='Stickers could not be prepared: '+(e&&e.message||e);render();return;}
 const over=[...new Set(pages.flatMap(p=>p.overflow))];
 if(over.length&&!d.warning){d.warning="Doesn't fit: "+over.join(', ');render();return;}
 stkDialog=null;render();stkPrint(pages);
}
/* Трудный заказ правится на месте, а не шаблон для всех: «не проще дать
   отредактировать точечно заказ на момент сложного стикера» (владелец,
   17 сентября 2026). Тот же редактор, образцы — стикеры этой печати. */
function stkPrintCustomize(){
 const d=stkDialog;if(!d)return;const r=stkDialogJobs();if(r.error||!r.jobs.length){d.error=r.error||'Nothing to print.';render();return;}
 const key=stkKey(d.type,d.size);
 stkPrintEdit={type:d.type,size:d.size,drafts:{[key]:{tpl:JSON.parse(JSON.stringify(d.tpl||stkTemplate(d.type,d.size))),dirty:false}},sample:'0',sel:'',open:'',notice:'',print:true,jobs:r.jobs.slice(0,60),count:r.jobs.length};
 render();
}
function stkPrintEditDone(){const d=stkDialog,e=stkPrintEdit;if(d&&e){d.tpl=JSON.parse(JSON.stringify(e.drafts[stkKey(e.type,e.size)].tpl));d.warning='';}stkPrintEdit=null;render();}
function stkPrintEditCancel(){stkPrintEdit=null;render();}
function stkPrintEditSave(){
 const e=stkPrintEdit;if(!e)return;const k=stkKey(e.type,e.size),tpl=stkCleanTemplate(e.type,e.size,e.drafts[k].tpl);
 DB.stickerTemplate=Object.assign({},DB.stickerTemplate,{[k]:tpl});if(stkBuilder&&stkBuilder.drafts)delete stkBuilder.drafts[k];touch();stkPrintEditDone();
}
function stkDialogUndoLayout(){if(stkDialog){stkDialog.tpl=null;stkDialog.warning='';render();}}
function stkDialogHTML(){
 const d=stkDialog;if(!d)return '';
 if(stkPrintEdit)return `<div class="sales-service-modal-back sales-dialog-back"><div class="sales-service-modal sales-dialog stk-edit-modal" role="dialog" aria-modal="true" aria-label="Customize this print">
  <div class="sales-service-modal-head"><h3>Customize this print · ${esc(stkTypeLabel(stkPrintEdit.type))} · ${esc(stkSizeDef(stkPrintEdit.size).label)}</h3><button type="button" aria-label="Close" onclick="stkPrintEditCancel()">×</button></div>
  <div class="sales-dialog-body">${stkEditorHTML()}</div></div></div>`;
 const seg=(list,cur,fn,dis)=>`<div class="stk-seg">${list.map(x=>`<button type="button" class="${x.k===cur?'on':''}" ${dis&&dis(x)?'disabled':''} onclick="${fn}('${x.k}')">${esc(x.label)}</button>`).join('')}</div>`;
 const r=stkDialogJobs(),count=r.error||r.jobs.length+' sticker'+(r.jobs.length===1?'':'s');
 let title,sub,body='';
 if(d.mode==='batch'){
  const b=glassBatchFind(d.batchNo);title='Print stickers · Batch '+d.batchNo;
  sub=(d.pieces&&d.pieces.length?'Selected glass':'All glass')+' · in order';if(!b)sub='Batch not found';
 }else{
  const o=salesRecord(d.orderId);if(!o){stkDialog=null;return '';}
  title='Print stickers · Order '+(o.businessNumber||'');sub=[salesCustomerDisplay(o.customerId),o.customerPo,salesStatusLabel(o)].filter(Boolean).join(' · ');
  const rows=stkOrderRows(o).map(row=>{
   const x=d.rows[row.key]||{on:false,which:'all',units:''},unitType=d.type==='unit',usable=unitType?row.kind==='line'&&row.comps.length>1:row.comps.length>0,on=x.on&&usable;
   const opts=unitType?[{v:'all',t:'Whole unit'}]:[{v:'all',t:row.comps.length>1?'All glass':'Lite '+(row.comps[0]?row.comps[0].lite+' · '+row.comps[0].glass:'')}].concat(row.comps.length>1?row.comps.map(c=>({v:c.key,t:'Lite '+c.lite+' · '+c.glass})):[]);
   const max=row.kind==='recut'?row.r.qty:row.l.qty,name=row.kind==='recut'?`<b class="stk-recut">Recut ${row.r.no}</b> · Line ${row.li+1}`:'Line '+(row.li+1)+(row.l.mark?' · '+esc(row.l.mark):'');
   return `<tr data-stk-row="${esc(row.key)}" class="${on?'on':''}${usable?'':' off'}"><td><input type="checkbox" data-stk-row-on ${on?'checked':''} ${usable?'':'disabled'} aria-label="Print ${row.kind==='recut'?'recut '+row.r.no:'line '+(row.li+1)}" onchange="stkDialogRow('${esc(row.key)}','on',this.checked,true)"></td>
    <td>${name}</td><td class="nowrap">${esc(dimIn16(row.l.width16/16))} × ${esc(dimIn16(row.l.height16/16))}</td><td class="n">${max}</td>
    <td>${usable?`<select data-stk-which ${on&&opts.length>1?'':'disabled'} aria-label="Which glass" onchange="stkDialogRow('${esc(row.key)}','which',this.value,true)">${opts.map(v=>`<option value="${esc(v.v)}" ${x.which===v.v?'selected':''}>${esc(v.t)}</option>`).join('')}</select>`:`<span class="mut">${unitType?'Single glass':'No glass'}</span>`}</td>
    <td><input type="text" data-stk-units value="${esc(x.units)}" placeholder="1-${max}" ${on?'':'disabled'} aria-label="Units" oninput="stkDialogRow('${esc(row.key)}','units',this.value)"></td></tr>`;
  }).join('');
  body=`<div class="ncr-lines-wrap"><table class="ncr-lines stk-lines"><thead><tr><th></th><th>Line</th><th>Size</th><th class="n">Qty</th><th>Which glass</th><th>Units</th></tr></thead><tbody>${rows}</tbody></table></div>`;
 }
 const plan=d.mode==='batch'&&typeof cutPlanFor==='function'?cutPlanFor(d.batchNo):null;
 const types=d.mode==='batch'?`<div><div class="ncr-label">ORDER</div>${seg([{k:'in',label:'In order'},{k:'sheet',label:'By sheet'}],d.order||'in','stkDialogOrder',x=>x.k==='sheet'&&!plan)}</div>`:`<div><div class="ncr-label">STICKER</div>${seg(STK_TYPES,d.type,'stkDialogType')}</div>`;
 return `<div class="sales-service-modal-back sales-dialog-back" onclick="if(event.target===this)stkDialogClose()"><div class="sales-service-modal sales-dialog stk-modal" role="dialog" aria-modal="true" aria-label="Print stickers">
  <div class="sales-service-modal-head"><h3>${esc(title)}</h3><button type="button" aria-label="Close" onclick="stkDialogClose()">×</button></div>
  <div class="sales-dialog-body stk-dialog"><p class="mut">${esc(sub)}</p>
   <div class="stk-dialog-pick">${types}<div><div class="ncr-label">SIZE</div>${seg(STK_SIZES,d.size,'stkDialogSize')}</div></div>
   ${body}
   <div class="sales-quote-note stk-count${r.error?' bad':''}" data-stk-count>${esc(count)}</div>
   ${d.tpl?`<div class="stk-custom" data-stk-custom>Custom layout · this print <button type="button" class="gb-link" onclick="stkDialogUndoLayout()">Undo</button></div>`:''}
   ${d.warning?`<div class="ncr-warning" role="alert" data-stk-warning>⚠ ${esc(d.warning)}</div>`:''}
   ${d.error?`<div class="ncr-error" role="alert">${esc(d.error)}</div>`:''}
  </div>
  <div class="sales-dialog-actions"><button type="button" class="stk-customize" data-stk-customize ${r.error||!r.jobs.length?'disabled':''} onclick="stkPrintCustomize()">✎ Customize</button><span class="sp"></span><button type="button" onclick="stkDialogClose()">Cancel</button><button type="button" class="pri" data-stk-print ${r.error||!r.jobs.length?'disabled':''} onclick="stkDialogPrint()">${d.warning?'Print anyway':'Print'}</button></div></div></div>`;
}

/* ---------------------------- Конструктор ---------------------------- */
function stkBuilderState(){
 if(stkPrintEdit)return stkPrintEdit;
 if(!stkBuilder)stkBuilder={type:'production',size:'4x6',drafts:{},sample:'',sel:'',open:'',notice:''};
 const k=stkKey(stkBuilder.type,stkBuilder.size);
 if(!stkBuilder.drafts[k])stkBuilder.drafts[k]={tpl:stkTemplate(stkBuilder.type,stkBuilder.size),dirty:false};
 return stkBuilder;
}
function stkDraft(){const s=stkBuilderState();return s.drafts[stkKey(s.type,s.size)];}
function stkEditTpl(fn){const d=stkDraft();fn(d.tpl);d.dirty=true;stkBuilderState().notice='';render();}
function stkFindBlock(id){return stkDraft().tpl.blocks.find(b=>b.id===id);}
function stkBSet(k,v){const s=stkBuilderState();if(k==='type'&&s.type!==v){s.sample='';s.sel='';s.open='';}s[k]=v;s.notice='';stkBuilderState();render();}
function stkBType(v){stkBSet('type',v);}
function stkBSizeKey(v){stkBSet('size',v);}
function stkBOrient(v){stkEditTpl(t=>{t.orient=v==='landscape'?'landscape':'portrait';});}
function stkBToggle(id,on){stkEditTpl(t=>{const b=t.blocks.find(x=>x.id===id);if(b)b.on=!!on;});}
function stkBPlace(id,at){stkEditTpl(t=>{const b=t.blocks.find(x=>x.id===id);if(!b||!STK_PLACES.some(p=>p.k===at))return;b.at=at;t.blocks=t.blocks.filter(x=>x.at!=='bottom').concat(t.blocks.filter(x=>x.at==='bottom'));});}
function stkSizeStep(def){return def.k==='divider'?0.5:def.k==='shape'?5:def.k==='barcode'?2:1;}
function stkBSize(id,v,delta){
 stkEditTpl(t=>{const b=t.blocks.find(x=>x.id===id),def=b&&stkBlockDef(b.k);if(!def)return;
  let n=delta?(+b.size||def.size[0])+delta*stkSizeStep(def):Number(v);if(!Number.isFinite(n))n=def.size[0];
  b.size=Math.min(def.size[2],Math.max(def.size[1],Math.round(n*2)/2));});
}
function stkBBold(id){stkEditTpl(t=>{const b=t.blocks.find(x=>x.id===id);if(b)b.bold=!b.bold;});}
function stkBAlign(id,a){stkEditTpl(t=>{const b=t.blocks.find(x=>x.id===id);if(b&&STK_ALIGNS.some(x=>x.k===a))b.align=a;});}
function stkBField(id,label){if(!label)return;stkEditTpl(t=>{const b=t.blocks.find(x=>x.id===id);if(b)b.text=((b.text||'').trim()+' {'+label+'}').trim().slice(0,STK_TEXT_MAX);});}
function stkBAddField(label){if(!label)return;const s=stkBuilderState();stkEditTpl(t=>{const b=stkBlock('text','full',null,{text:'{'+label+'}',bold:false}),j=t.blocks.findIndex(x=>x.at==='bottom');t.blocks.splice(j<0?t.blocks.length:j,0,b);s.sel=s.open=b.id;});}
function stkBDetail(id,key,on){stkEditTpl(t=>{const b=t.blocks.find(x=>x.id===id);if(b&&b.details)b.details[key]=!!on;});}
function stkBText(id,v){stkEditTpl(t=>{const b=t.blocks.find(x=>x.id===id);if(b)b.text=String(v||'').slice(0,STK_TEXT_MAX);});}
function stkBAdd(k){
 const s=stkBuilderState();
 stkEditTpl(t=>{const b=stkBlock(k,'full',null,k==='text'?{text:'TEXT'}:{}),j=t.blocks.findIndex(x=>x.at==='bottom');t.blocks.splice(j<0?t.blocks.length:j,0,b);s.sel=s.open=b.id;});
}
function stkBRemove(id){stkEditTpl(t=>{const b=t.blocks.find(x=>x.id===id),def=b&&stkBlockDef(b.k);if(def&&def.multi)t.blocks=t.blocks.filter(x=>x.id!==id);});}
/* Клик по блоку в списке или на стикере выделяет его и открывает настройки. */
function stkBSelect(id){
 const s=stkBuilderState();s.sel=s.open=s.open===id?'':id;render();
 const r=s.sel&&document.querySelector('[data-stk-block="'+s.sel+'"]');if(r&&r.scrollIntoView)r.scrollIntoView({block:'nearest'});
}
function stkBOpen(id){stkBSelect(id);}
function stkBReset(){const s=stkBuilderState();stkEditTpl(t=>{const base=s.print?stkTemplate(s.type,s.size):stkBase(s.type,s.size);t.orient=base.orient;t.blocks=base.blocks;});s.sel='';s.open='';}
function stkBSave(){
 const s=stkBuilderState(),d=stkDraft(),k=stkKey(s.type,s.size);
 DB.stickerTemplate=Object.assign({},DB.stickerTemplate,{[k]:stkCleanTemplate(s.type,s.size,d.tpl)});
 d.tpl=stkTemplate(s.type,s.size);d.dirty=false;s.notice='Saved';touch();render();
}
/* Перемещение: в списке блок сохраняет свою колонку; на стикере — берёт
   колонку того блока, на который его бросили. Bottom всегда в конце. */
function stkMoveBlock(from,to,where,adopt){
 stkEditTpl(t=>{
  const i=t.blocks.findIndex(b=>b.id===from),target=t.blocks.find(b=>b.id===to);if(i<0||!target||from===to)return;
  const [b]=t.blocks.splice(i,1);
  if(target.at==='bottom')b.at='bottom';else if(adopt)b.at=target.at;else if(b.at==='bottom')b.at='full';
  const j=t.blocks.indexOf(target);t.blocks.splice(where==='after'?j+1:j,0,b);
  t.blocks=t.blocks.filter(x=>x.at!=='bottom').concat(t.blocks.filter(x=>x.at==='bottom'));
  const st=stkBuilderState();st.sel=st.open=b.id;
 });
}
function stkMoveToZone(from,zone){
 stkEditTpl(t=>{const i=t.blocks.findIndex(b=>b.id===from);if(i<0)return;const [b]=t.blocks.splice(i,1);
  if(zone==='bottom')b.at='bottom';else if(b.at==='bottom')b.at='full';
  const top=t.blocks.filter(x=>x.at!=='bottom'),bot=t.blocks.filter(x=>x.at==='bottom');
  t.blocks=zone==='bottom'?top.concat(bot,[b]):top.concat([b],bot);const st=stkBuilderState();st.sel=st.open=b.id;});
}
function stkDragStart(e,id){stkDrag=id;try{e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='move';}catch(x){}}
function stkDragOver(e){if(!stkDrag)return;e.preventDefault();e.stopPropagation();const r=e.currentTarget.getBoundingClientRect(),after=e.clientY>r.top+r.height/2;e.currentTarget.classList.toggle('drop-before',!after);e.currentTarget.classList.toggle('drop-after',after);}
function stkDragLeave(e){e.currentTarget.classList.remove('drop-before','drop-after');}
function stkDrop(e,id,adopt){
 e.preventDefault();e.stopPropagation();e.currentTarget.classList.remove('drop-before','drop-after');
 const r=e.currentTarget.getBoundingClientRect(),after=e.clientY>r.top+r.height/2,from=stkDrag;stkDrag='';
 if(from&&from!==id)stkMoveBlock(from,id,after?'after':'before',adopt);
}
function stkDropZone(e,zone){e.preventDefault();const from=stkDrag;stkDrag='';if(from)stkMoveToZone(from,zone);}
function stkSamples(type){
 const out=[];
 (DB.salesOrder||[]).filter(o=>!salesIsQuote(o)&&o.status!=='cancelled').slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,15).forEach(o=>(o.lines||[]).forEach((l,li)=>{
  const comps=glassBatchComponents(o,l).filter(c=>!c.missing),shape=salesShapeIsLineRect(salesLineGeometryShape(l))?'':' · shape';
  if(type==='unit'){if(comps.length>1)out.push({key:o.id+'|'+l.id,label:o.businessNumber+' · Line '+(li+1)+' · Unit 1'+shape,o,l});return;}
  comps.forEach(c=>out.push({key:c.key,label:o.businessNumber+' · Line '+(li+1)+' · Lite '+c.lite+' · '+c.glass+shape,o,l,c}));
 }));
 return out.slice(0,80);
}
function stkJobData(j){return j.type==='unit'?stkUnitData(j.o,j.l,j.unit):stkGlassData(j.type,j.o,j.l,j.c,j.unit,{batch:stkBatchOf(j.o,j.c,j.unit)});}
function stkSampleData(type){
 const st=stkBuilderState();
 if(st.print){
  const list=st.jobs.map((j,i)=>({key:String(i),label:(i+1)+' of '+st.count+' · Line '+(j.o.lines.indexOf(j.l)+1)+(j.type==='unit'?' · Unit '+j.unit:typeof j.unit==='string'?' · '+recutUnitText(j.unit,'?').replace(/ · \d+ of \?$/,''):' · Unit '+j.unit+' · Lite '+j.c.lite)}));
  const i=Math.max(0,list.findIndex(x=>x.key===st.sample));return {data:stkJobData(st.jobs[i]),list,key:String(i)};
 }
 const list=stkSamples(type),s=list.find(x=>x.key===st.sample)||list[0];let data=null;
 if(s)try{data=type==='unit'?stkUnitData(s.o,s.l,1):stkGlassData(type,s.o,s.l,s.c,1,{batch:stkBatchOf(s.o,s.c,1)});}catch(e){data=null;}
 if(!data)return {data:stkDemoData(type),list,key:''};
 if(!data.id)data.id=type==='unit'?'U-0000000':'G-0000000';
 return {data,list,key:s.key};
}
function viewMdStickers(){return stkEditorHTML();}
function stkEditorHTML(){
 const s=stkBuilderState(),dr=stkDraft(),tpl=dr.tpl,{data,list,key}=stkSampleData(s.type),pg=stkLayout(tpl,s.size,data);
 const seg=(items,cur,fn,mark)=>`<div class="stk-seg">${items.map(x=>`<button type="button" class="${x.k===cur?'on':''}" data-stk-seg="${x.k}" onclick="${fn}('${x.k}')">${esc(x.label)}${mark&&mark(x)?' •':''}</button>`).join('')}</div>`;
 const dirtyType=t=>STK_SIZES.some(z=>(s.drafts[stkKey(t.k,z.k)]||{}).dirty),dirtySize=z=>!!(s.drafts[stkKey(s.type,z.k)]||{}).dirty;
 const usable=tpl.blocks.filter(b=>(stkBlockDef(b.k)||{types:[]}).types.includes(s.type));
 const fields=Object.keys(data.vars||{}).filter(k=>data.vars[k]!=='');
 const fieldSelect=(attr,call)=>`<select ${attr} aria-label="Insert field" onchange="${call}"><option value="">+ Field…</option>${fields.map(k=>`<option value="${esc(k)}">${esc(k)} — ${esc(String(data.vars[k]).slice(0,28))}</option>`).join('')}</select>`;
 const row=b=>{
  const def=stkBlockDef(b.k),sel=s.sel===b.id,open=s.open===b.id,A=stkAlignOf(b,b.at==='right'?'right':'full');
  const panel=open?`<div class="stk-details" data-stk-details-panel="${b.id}">
    ${b.k==='divider'||b.k==='route'?'':`<span class="stk-seg stk-seg-sm">${STK_ALIGNS.map(a=>`<button type="button" class="${A===a.k?'on':''}" data-stk-align="${a.k}" onclick="stkBAlign('${b.id}','${a.k}')">${a.label}</button>`).join('')}</span>`}
    ${def.graphic?'':`<label><input type="checkbox" data-stk-bold ${b.bold?'checked':''} onchange="stkBBold('${b.id}')"> Bold</label>`}
    ${def.details.map(x=>`<label><input type="checkbox" data-stk-detail="${x[0]}" ${b.details[x[0]]?'checked':''} onchange="stkBDetail('${b.id}','${x[0]}',this.checked)"> ${esc(x[1])}</label>`).join('')}
    ${b.k==='text'?fieldSelect('data-stk-field',"stkBField('"+b.id+"',this.value)"):''}</div>`:'';
  return `<div class="stk-row${b.on?'':' off'}${sel?' sel':''}" data-stk-block="${b.id}" data-stk-kind="${b.k}" draggable="true" ondragstart="stkDragStart(event,'${b.id}')" ondragover="stkDragOver(event)" ondragleave="stkDragLeave(event)" ondrop="stkDrop(event,'${b.id}',false)" onclick="if(event.target===this||event.target.classList.contains('stk-name'))stkBSelect('${b.id}')">
   <span class="stk-grip" title="Drag">⋮⋮</span><input type="checkbox" data-stk-on ${b.on?'checked':''} aria-label="Print ${esc(def.label)}" onchange="stkBToggle('${b.id}',this.checked)">
   <span class="stk-name">${b.k==='text'?`<input type="text" class="stk-text" data-stk-text value="${esc(b.text)}" maxlength="${STK_TEXT_MAX}" aria-label="Text" placeholder="Text or {field}" onchange="stkBText('${b.id}',this.value)">`:esc(def.label)}</span>
   <select data-stk-place aria-label="Place" onchange="stkBPlace('${b.id}',this.value)">${STK_PLACES.map(p=>`<option value="${p.k}" ${b.at===p.k?'selected':''}>${p.label}</option>`).join('')}</select>
   <span class="stk-step"><button type="button" aria-label="Smaller" data-stk-minus onclick="stkBSize('${b.id}',0,-1)">−</button><input type="number" data-stk-size value="${b.size}" min="${def.size[1]}" max="${def.size[2]}" step="${stkSizeStep(def)}" aria-label="Size pt" onchange="stkBSize('${b.id}',this.value)"><button type="button" aria-label="Larger" data-stk-plus onclick="stkBSize('${b.id}',0,1)">+</button></span>
   <button type="button" class="stk-icon${open?' on':''}" data-stk-gear title="Settings" aria-expanded="${open}" onclick="stkBSelect('${b.id}')">⚙</button>
   ${def.multi?`<button type="button" class="stk-icon" data-stk-remove title="Remove" onclick="stkBRemove('${b.id}')">×</button>`:'<span class="stk-icon-sp"></span>'}
  </div>${panel}`;
 };
 const zone=(name,list,z)=>`<div class="stk-zone" data-stk-zone="${z}" ondragover="event.preventDefault()" ondrop="stkDropZone(event,'${z}')"><div class="stk-zone-head">${name}</div>${list.map(row).join('')||'<div class="stk-zone-empty">Drop here</div>'}</div>`;
 const W=pg.w*STK_PX,H=pg.h*STK_PX;
 const hits=pg.boxes.map(x=>{const b=tpl.blocks.find(y=>y.id===x.id);return `<div class="stk-hit${s.sel===x.id?' sel':''}" data-stk-hit="${x.id}" draggable="true" title="${esc(b?stkBlockLabel(b):'')}" style="left:${(x.x*STK_PX).toFixed(1)}px;top:${(x.y*STK_PX).toFixed(1)}px;width:${(x.w*STK_PX).toFixed(1)}px;height:${Math.max(6,x.h*STK_PX).toFixed(1)}px" ondragstart="stkDragStart(event,'${x.id}')" ondragover="stkDragOver(event)" ondragleave="stkDragLeave(event)" ondrop="stkDrop(event,'${x.id}',true)" onclick="stkBSelect('${x.id}')"></div>`;}).join('');
 const fit=pg.overflow.length?`<span class="pill warn" data-stk-fit="no">Doesn't fit: ${esc(pg.overflow.join(', '))}</span>`:'<span class="pill ok" data-stk-fit="yes">Fits</span>';
 const samples=list.length?`<select data-stk-sample aria-label="Sample" onchange="stkBuilderState().sample=this.value;render()">${list.map(x=>`<option value="${esc(x.key)}" ${x.key===key?'selected':''}>${esc(x.label)}</option>`).join('')}</select>`:'<span class="mut">Demo glass</span>';
 return `<div class="stk-builder" data-stk-builder>
  <div class="stk-head">
   ${s.print?'':`<div class="stk-ctl"><span class="ncr-label">STICKER</span>${seg(STK_TYPES,s.type,'stkBType',dirtyType)}</div>
   <div class="stk-ctl"><span class="ncr-label">SIZE</span>${seg(STK_SIZES,s.size,'stkBSizeKey',dirtySize)}</div>`}
   <div class="stk-ctl"><span class="ncr-label">ORIENTATION</span>${seg([{k:'portrait',label:'Portrait'},{k:'landscape',label:'Landscape'}],tpl.orient,'stkBOrient')}</div>
   <div class="stk-ctl stk-sample"><span class="ncr-label">SAMPLE</span>${samples}</div>
  </div>
  <div class="stk-grid">
   <div class="stk-side">${zone('TOP',usable.filter(b=>b.at!=='bottom'),'top')}${zone('BOTTOM',usable.filter(b=>b.at==='bottom'),'bottom')}
    <div class="stk-add"><button type="button" data-stk-add="text" onclick="stkBAdd('text')">+ Custom text</button>${fieldSelect('data-stk-add-field','stkBAddField(this.value)')}<button type="button" data-stk-add="divider" onclick="stkBAdd('divider')">+ Divider</button></div></div>
   <div class="stk-preview"><div class="stk-paper" data-stk-paper style="width:${W.toFixed(0)}px;height:${H.toFixed(0)}px">${stkPageSVG(pg,W.toFixed(0),H.toFixed(0))}${hits}</div><div class="stk-fit">${fit}</div></div>
  </div>
  ${s.print?`<div class="stk-foot"><button type="button" data-stk-reset onclick="stkBReset()">Reset to template</button><span class="sp"></span><button type="button" onclick="stkPrintEditCancel()">Cancel</button><button type="button" data-stk-save-template onclick="stkPrintEditSave()">Save as template</button><button type="button" class="pri" data-stk-done onclick="stkPrintEditDone()">Done</button></div>`
  :`<div class="stk-foot"><button type="button" data-stk-reset onclick="stkBReset()">Reset to base</button><span class="sp"></span>${dr.dirty?'<span class="stk-dirty" data-stk-dirty>Unsaved changes</span>':s.notice?`<span class="stk-saved">${esc(s.notice)}</span>`:''}<button type="button" class="pri" data-stk-save ${dr.dirty?'':'disabled'} onclick="stkBSave()">Save template</button></div>`}
 </div>`;
}
