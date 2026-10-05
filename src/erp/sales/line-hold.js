/* Необязательное удержание позиции. Это не производственный замок:
   строка редактируется, но не попадает в батч. Сохранённая позиция получает
   только поля Hold; прочие несохранённые правки карточки не записываются.
   То же меню задаёт очередь отгрузки строки (erp/shipping/loading) — и у
   строки в батче: очередь нужна, пока стекло ещё идёт по цеху. */
let salesLineHoldMenu=null,salesLineHoldPress=null;
function salesLineHoldAllowed(o,l){return !!o&&!!l&&!salesIsQuote(o)&&!salesOrderReadOnly(o)&&!salesLineLocked(l);}
function salesLineQueueAllowed(o,l){const saved=o&&salesRecord(o.id);return !!l&&!!saved&&shippingQueueAllowed(saved)&&(saved.lines||[]).some(x=>x.id===l.id);}
function salesLineMenuAllowed(o,l){return salesLineHoldAllowed(o,l)||salesLineQueueAllowed(o,l);}
function salesLineHoldRowAttrs(l){
 if(salesIsQuote(soDraft)||salesOrderReadOnly(soDraft))return '';
 const id=esc(l.id),reason=l.onHold?'On Hold: '+(l.holdReason||'Waiting for clarification'):'Right-click for line actions';
 return ` tabindex="0" title="${esc(reason)}" oncontextmenu="salesLineHoldContext(event,'${id}')" onkeydown="salesLineHoldKey(event,'${id}')" onpointerdown="salesLineHoldPointer(event,'${id}')" onpointermove="salesLineHoldMove(event)" onpointerup="salesLineHoldCancelPress()" onpointercancel="salesLineHoldCancelPress()"`;
}
function salesLineHoldKey(e,id){if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')salesLineHoldContext(e,id);}
function salesLineHoldCancelPress(){if(salesLineHoldPress)clearTimeout(salesLineHoldPress.timer);salesLineHoldPress=null;}
function salesLineHoldPointer(e,id){
 salesLineHoldCancelPress();if(e.pointerType!=='touch'||e.target.closest('input,select,textarea,button'))return;
 const x=e.clientX,y=e.clientY;salesLineHoldPress={x,y,timer:setTimeout(()=>{salesLineHoldContext({clientX:x,clientY:y},id);},600)};
}
function salesLineHoldMove(e){const p=salesLineHoldPress;if(p&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>8)salesLineHoldCancelPress();}
function salesLineHoldStamp(ids){
 const saved=soDraft&&salesRecord(soDraft.id);
 return JSON.stringify([saved,soDraft&&{id:soDraft.id,status:soDraft.status,lines:soDraft.lines.filter(l=>ids.includes(l.id))}]);
}
function salesLineHoldContext(e,id){
 if(e){if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation();}
 salesLineHoldCancelPress();const o=soDraft,l=o&&o.lines.find(l=>l.id===id);if(!salesLineMenuAllowed(o,l))return;
 const visible=new Set(salesServiceFilteredEntries().map(x=>x.line.id));
 const ids=soSelectedLines.has(id)?o.lines.filter(x=>visible.has(x.id)&&soSelectedLines.has(x.id)&&salesLineMenuAllowed(o,x)).map(x=>x.id):[id];
 if(!ids.length)return;
 const r=e&&e.currentTarget&&e.currentTarget.getBoundingClientRect?e.currentTarget.getBoundingClientRect():null;
 salesLineHoldMenu={kind:'context',orderId:o.id,ids,index:o.lines.indexOf(l)+1,x:e&&e.clientX||r&&r.left||40,y:e&&e.clientY||r&&r.bottom||40,stamp:salesLineHoldStamp(ids)};render();
}
function salesLineHoldClose(){salesLineHoldMenu=null;render();}
function salesLineHoldEdit(){
 const m=salesLineHoldMenu;if(!m||!soDraft||m.orderId!==soDraft.id)return;
 const l=soDraft.lines.find(l=>l.id===m.ids[0]);m.kind='reason';m.reason=l&&l.onHold?l.holdReason:'Waiting for sizes or shape';m.error='';render();
 requestAnimationFrame(()=>{const e=document.querySelector('[data-line-hold-reason]');if(e)e.focus();});
}
function salesLineHoldReason(value){if(salesLineHoldMenu)salesLineHoldMenu.reason=value;}
function salesLineHoldSet(orderId,ids,on,reason){
 const draft=soDraft&&soDraft.id===orderId?soDraft:null,saved=salesRecord(orderId),o=draft||saved;
 ids=[...new Set(ids||[])];if(!o||!ids.length||on&&!String(reason||'').trim())return false;
 const lines=ids.map(id=>o.lines.find(l=>l.id===id));
 if(lines.some(l=>!salesLineHoldAllowed(o,l))||saved&&(salesOrderReadOnly(saved)||ids.some(id=>{const l=saved.lines.find(l=>l.id===id);return l&&!salesLineHoldAllowed(saved,l);})))return false;
 const now=new Date().toISOString(),fields={onHold:!!on,holdReason:on?String(reason).trim().slice(0,200):'',holdAt:on?now:''};
 lines.forEach(l=>Object.assign(l,fields));
 if(saved&&saved!==draft)ids.forEach(id=>{const l=saved.lines.find(l=>l.id===id);if(l)Object.assign(l,fields);});
 o.updatedAt=now;if(saved){saved.updatedAt=now;touch();}return true;
}
function salesLineHoldApply(on){
 const m=salesLineHoldMenu;if(!m||!soDraft||m.orderId!==soDraft.id)return;
 if(m.stamp!==salesLineHoldStamp(m.ids)){salesLineHoldMenu=null;salesDialogOpen({title:'Order changed',note:'Review the lines and open the menu again.',buttons:[{label:'Back'}]});return;}
 if(on&&!String(m.reason||'').trim()){m.error='Enter a reason for the hold.';render();return;}
 if(!salesLineHoldSet(m.orderId,m.ids,on,m.reason)){m.error='These lines can no longer be changed.';render();return;}
 salesLineHoldMenu=null;render();
}
function salesLineQueueEdit(){
 const m=salesLineHoldMenu;if(!m||!soDraft||m.orderId!==soDraft.id)return;
 m.kind='queue';m.queue=String(shippingQueueOf(soDraft.lines.find(l=>l.id===m.ids[0]))||'');m.error='';render();
 requestAnimationFrame(()=>{const e=document.querySelector('[data-line-queue]');if(e)e.focus();});
}
function salesLineQueueApply(){
 const m=salesLineHoldMenu;if(!m||!soDraft||m.orderId!==soDraft.id)return;
 if(m.stamp!==salesLineHoldStamp(m.ids)){salesLineHoldMenu=null;salesDialogOpen({title:'Order changed',note:'Review the lines and open the menu again.',buttons:[{label:'Back'}]});return;}
 const out=shippingQueueSet(m.orderId,m.ids,m.queue);if(!out.ok){m.error=out.error;render();return;}
 salesLineHoldMenu=null;render();
}
function salesLineHoldMenuHTML(){
 const m=salesLineHoldMenu;if(!m||!soDraft||m.orderId!==soDraft.id)return '';
 const lines=m.ids.map(id=>soDraft.lines.find(l=>l.id===id)).filter(Boolean);if(!lines.length)return '';
 const held=lines.every(l=>l.onHold),label=lines.length===1?'Line '+m.index:lines.length+' lines',w=280;
 const style=`left:${Math.max(8,Math.min(m.x,innerWidth-w-8))}px;top:${Math.max(8,Math.min(m.y,innerHeight-300))}px;max-height:${Math.max(100,innerHeight-24)}px`;
 const back='<div class="sl-backdrop" onclick="salesLineHoldClose()" oncontextmenu="event.preventDefault();salesLineHoldClose()"></div>';
 if(m.kind==='reason')return back+`<div class="sl-menu sl-line-hold-menu" style="${style}" role="dialog" aria-label="Line hold reason"><h5>${esc(label)} · On Hold</h5><label>Reason<input type="text" maxlength="200" data-line-hold-reason value="${esc(m.reason)}" oninput="salesLineHoldReason(this.value)"></label><p class="mut">These lines stay editable but cannot go to batch.</p>${m.error?`<p class="sl-range-error" role="alert">${esc(m.error)}</p>`:''}<div class="sl-actions"><button type="button" onclick="salesLineHoldClose()">Back</button><button type="button" class="pri" data-line-hold-confirm onclick="salesLineHoldApply(true)">${held?'Save reason':'Put on hold'}</button></div></div>`;
 if(m.kind==='queue')return back+`<div class="sl-menu sl-line-hold-menu" style="${style}" role="dialog" aria-label="Shipping queue"><h5>${esc(label)} · Shipping queue</h5><label>Queue<input type="number" min="1" max="999" data-line-queue value="${esc(m.queue)}" oninput="salesLineHoldMenu.queue=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();salesLineQueueApply()}"></label><p class="mut">1 loads first · empty — no queue</p>${m.error?`<p class="sl-range-error" role="alert">${esc(m.error)}</p>`:''}<div class="sl-actions"><button type="button" onclick="salesLineHoldClose()">Back</button><button type="button" class="pri" data-line-queue-confirm onclick="salesLineQueueApply()">Save</button></div></div>`;
 const canHold=lines.every(l=>salesLineHoldAllowed(soDraft,l)),canQueue=lines.every(l=>salesLineQueueAllowed(soDraft,l)),queue=lines.length===1?shippingQueueOf(lines[0]):0;
 return back+`<div class="sl-menu sl-line-hold-menu sl-line-context" style="${style}" role="menu" aria-label="Line actions"><b>${esc(label)}${held?' · On Hold':''}${queue?' · Queue '+queue:''}</b>${held?`<p class="mut">${esc(lines.length===1?lines[0].holdReason:'Selected lines are on hold.')}</p>`:''}<hr>${canHold?`<button type="button" role="menuitem" data-line-hold-action="hold" onclick="salesLineHoldEdit()">${held?'Edit reason…':'On Hold…'}</button>${lines.some(l=>l.onHold)?'<button type="button" role="menuitem" data-line-hold-action="release" onclick="salesLineHoldApply(false)">Release hold</button>':''}`:''}${canQueue?'<button type="button" role="menuitem" data-line-queue-action onclick="salesLineQueueEdit()">Shipping queue…</button>':''}</div>`;
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&salesLineHoldMenu){e.preventDefault();salesLineHoldClose();}});
/* Ячейки строки в батче — inert: нажатие по ним получает таблица, а не
   строка. Строку под указателем находим по координате. */
function salesLineLockedRowAt(e){
 const t=e.target,table=soDraft&&t&&t.closest&&!t.closest('tr[data-metrics-line-id]')?t.closest('.sales-lines-table'):null;if(!table)return '';
 const row=[...table.querySelectorAll('tr.line-locked[data-metrics-line-id]')].find(r=>{const b=r.getBoundingClientRect();return e.clientY>=b.top&&e.clientY<=b.bottom&&e.clientX>=b.left&&e.clientX<=b.right;});
 return row?row.getAttribute('data-metrics-line-id'):'';
}
document.addEventListener('contextmenu',e=>{const id=salesLineLockedRowAt(e);if(id)salesLineHoldContext(e,id);});
document.addEventListener('pointerdown',e=>{const id=salesLineLockedRowAt(e);if(id)salesLineHoldPointer(e,id);});
document.addEventListener('pointermove',e=>{if(salesLineHoldPress)salesLineHoldMove(e);});
['pointerup','pointercancel'].forEach(k=>document.addEventListener(k,()=>{if(salesLineHoldPress)salesLineHoldCancelPress();}));
