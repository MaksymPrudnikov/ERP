/* ============================================================================
   Экран Master Data → Company & print → Email templates: шаблоны ответов
   клиенту для панели Gmail (erp/sales/mail-templates). Слева список, в
   середине имя и текст, справа поля по группам и письмо на настоящем заказе.
   IN : mailTemplates, MAIL_TPL_FIELDS, mailTplRender, mailTplSave,
        mailTplDelete (erp/sales/mail-templates); DB.salesOrder — заказ для
        просмотра
   OUT: viewMdMailTemplates(); mtChanged() — несохранённая правка (mdLeave)
   Владелец, 16.11.2026: вариант E1 — всё на одном экране; поля — кликом в
   место курсора; свои шаблоны добавляет сам. Править может тот, у кого
   галочка Master Data.
   ============================================================================ */
let mtSel='',mtDraft=null,mtSeen='',mtOrder='',mtError='',mtCaret=-1;
function mtChanged(){return !!mtDraft&&(mtSel==='new'||JSON.stringify(mtDraft)!==mtSeen);}
function mtPick(id){
 if(id===mtSel)return;
 if(mtChanged()&&!confirm('Discard unsaved changes?'))return;
 const t=id==='new'?{name:'',text:''}:mailTplFind(id);if(!t)return;
 mtSel=id;mtDraft={name:t.name,text:t.text};mtSeen=JSON.stringify(mtDraft);mtError='';render();
}
function mtNew(){mtPick('new');setTimeout(()=>{const i=document.querySelector('[data-mt-name]');if(i)i.focus();},0);}
/* Заказы для просмотра: последние, кроме черновиков; открытые — выше. */
function mtOrders(){
 return (DB.salesOrder||[]).filter(o=>!salesIsDraft(o)&&o.businessNumber).sort((a,b)=>Number(mailIsOpen(b))-Number(mailIsOpen(a))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,60);
}
function mtPreviewText(){
 const o=(DB.salesOrder||[]).find(x=>x.id===mtOrder);
 return o&&mtDraft?mailTplRender(mtDraft.text,o):'';
}
function mtPreviewPaint(){const el=document.querySelector('[data-mt-preview]');if(el)el.textContent=mtPreviewText();}
function mtSetName(v){if(mtDraft)mtDraft.name=v;}
function mtSetText(v){if(!mtDraft)return;mtDraft.text=v;mtPreviewPaint();}
function mtSetOrder(v){mtOrder=v;render();}
function mtRemember(el){mtCaret=el?el.selectionStart:-1;}
/* Поле — в место курсора; курсора не было — в конец текста. */
function mtInsert(key){
 if(!mtDraft)return;
 const ta=document.querySelector('[data-mt-text]'),tag='{'+key+'}',v=mtDraft.text;
 const at=ta&&document.activeElement===ta?ta.selectionStart:mtCaret>=0?Math.min(mtCaret,v.length):v.length;
 mtDraft.text=v.slice(0,at)+tag+v.slice(at);mtCaret=at+tag.length;render();
 setTimeout(()=>{const t=document.querySelector('[data-mt-text]');if(t){t.focus();t.setSelectionRange(mtCaret,mtCaret);}},0);
}
function mtSave(){
 if(!mtDraft)return;
 const r=mailTplSave(mtSel==='new'?'':mtSel,mtDraft);
 if(!r.ok){mtError=r.error;render();return;}
 const t=mailTplFind(r.id);mtSel=r.id;mtDraft={name:t.name,text:t.text};mtSeen=JSON.stringify(mtDraft);mtError='';render();
}
function mtCancel(){
 if(mtSel==='new'){mtSel='';mtDraft=null;mtError='';render();return;}
 const t=mailTplFind(mtSel);mtDraft=t?{name:t.name,text:t.text}:null;mtSeen=JSON.stringify(mtDraft);mtError='';render();
}
function mtDelete(){
 const t=mailTplFind(mtSel);if(!t||!confirm('Delete the template “'+t.name+'”?'))return;
 const r=mailTplDelete(mtSel);if(!r.ok){mtError=r.error;render();return;}
 mtSel='';mtDraft=null;mtError='';render();
}
function viewMdMailTemplates(){
 const list=mailTemplates(),edit=mailTplCanEdit();
 if(mtSel&&mtSel!=='new'&&!list.some(t=>t.id===mtSel)){mtSel='';mtDraft=null;}
 if(!mtSel&&list.length){const t=list[0];mtSel=t.id;mtDraft={name:t.name,text:t.text};mtSeen=JSON.stringify(mtDraft);}
 const orders=mtOrders();if(!orders.some(o=>o.id===mtOrder))mtOrder=orders.length?orders[0].id:'';
 const side=list.map(t=>`<button type="button" class="mt-item${t.id===mtSel?' on':''}" data-mt-item="${esc(t.id)}" ${onAct('click',mtPick,String(t.id))}><span>${esc(t.name)}</span><small>${t.builtin&&!t.updatedAt?'built-in':esc(t.updatedBy||'edited')}</small></button>`).join('')
  +(edit?`<button type="button" class="mt-new" data-mt-new ${onAct('click',mtNew)}>+ New template</button>`:'');
 const fields=MAIL_TPL_FIELDS.map(g=>`<div class="mt-group"><b>${esc(g.group)}</b>${g.fields.map(f=>`<button type="button" class="mt-field" data-mt-field="${esc(f[0])}" title="${esc(f[1])}" ${edit?'':'disabled'} ${onAct('mousedown',actPrevent,EVENT)} ${onAct('click',mtInsert,String(f[0]))}>{${esc(f[0])}}</button>`).join('')}</div>`).join('');
 const d=mtDraft;
 const editor=d?`<label for="mt_name">Name <span class="mut">· shown in the Gmail panel</span></label>
   <input id="mt_name" data-mt-name maxlength="60" value="${esc(d.name)}" ${edit?'':'readonly'} ${onAct('input',mtSetName,EL_VALUE)}>
   <label for="mt_text">Text</label>
   <textarea id="mt_text" data-mt-text spellcheck="true" ${edit?'':'readonly'} ${onAct('input',mtSetText,EL_VALUE)} ${onAct('blur',mtRemember,EL)}>${esc(d.text)}</textarea>`:'<p class="mut">No templates.</p>';
 const preview=`<label for="mt_order">Preview on order</label>
   <select id="mt_order" data-mt-order ${onAct('change',mtSetOrder,EL_VALUE)}>${orders.map(o=>`<option value="${esc(o.id)}" ${o.id===mtOrder?'selected':''}>${esc([o.businessNumber,o.customerPo?'PO '+o.customerPo:'',salesCustomerDisplay(o.customerId)].filter(Boolean).join(' · '))}</option>`).join('')||'<option>No orders yet</option>'}</select>
   <div class="mt-preview" data-mt-preview>${esc(mtPreviewText())}</div>
   <p class="mut">Empty fields stay empty. Money is not in the fields.</p>`;
 const bar=d&&edit?`<div class="mt-bar">${mtError?`<span class="mt-err" role="alert" data-mt-error>${esc(mtError)}</span>`:''}<span class="sp"></span>${mtSel!=='new'?`<button type="button" data-mt-delete ${onAct('click',mtDelete)}>Delete</button>`:''}<button type="button" ${onAct('click',mtCancel)}>Cancel</button><button type="button" class="pri" data-mt-save ${onAct('click',mtSave)}>Save</button></div>`:'';
 return `${bar}<div class="mt-layout" data-mail-templates>
  <div class="mt-side">${side}</div>
  <div class="mt-edit">${editor}</div>
  <div class="mt-fields"><label>Fields <span class="mut">· click to insert</span></label>${fields}</div>
  <div class="mt-view">${preview}</div>
 </div>`;
}
