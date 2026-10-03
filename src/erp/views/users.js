/* =====================================================================
   view/users  ·  erp-2.0
   Люди и доступ: имя, вход в офис (пароль + разделы), вход на станцию
   (номер + PIN). Модель — erp/data (USER_SECTIONS, normalizeUsers).
   IN : DB.user
   OUT: html
   Владелец, 3 октября 2026: «вряд ли нужны скилы и прочее — нужен
   пользователь, пароль и уровень доступа выбором галочек». Навыки, станция
   по умолчанию, роли и отчёт покрытия убраны.
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

/* uEdit — 'new' или viewProfileId, а не номер строки: × на другой строке,
   пока форма открыта, сдвигает список, и Save писал бы не в того человека. */
let uEdit=null, uDraft=null;
function userSectionNav(k){return NAV.find(n=>n.k===k)||{k,label:k,icon:'report'};}
function userAccessHTML(u){
 if(!userOffice(u))return '<span class="mut">—</span>';
 if(u.access.length===USER_SECTIONS.length)return '<span class="pill ok">All sections</span>';
 return u.access.map(k=>`<span class="pill">${esc(userSectionNav(k).label)}</span>`).join(' ');
}
/* Две вкладки, как на экране входа (владелец, 3 октября 2026: «разделить на
   офис и производство»). Office — у кого отмечены разделы, Production — у
   кого есть PIN станции или нет офиса (рабочий, которому PIN ещё не дали).
   Мастер цеха с обоими входами — в обеих. */
function usersSide(){return subtab==='production'?'production':subtab==='log'?'log':'office';}
function usersOn(u,side){return side==='production'?userHasPin(u)||!userOffice(u):userOffice(u);}
/* Зелёная точка — человек сейчас в системе на этом компьютере (офис или
   станция); серая — нет, рядом последний вход или выход из журнала
   (владелец, 3 октября 2026). Пока база в браузере, другие компьютеры
   здесь не видны — их покажет сервер. */
function userNowHTML(u){
 const on=authOnline(u),last=authLastSeen(u);
 if(on.length)return `<span class="user-now on" data-user-now="on"><i></i>${esc(on.join(', '))}</span>`;
 return `<span class="user-now" data-user-now="off"><i></i>${last?esc(salesListShortDay(salesListIsoDay(last))+' · '+new Date(last).toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit',hour12:false})):'—'}</span>`;
}
function viewUsers(){
 const side=usersSide(),prod=side==='production',log=side==='log';
 const list=log?[]:DB.user.map((u,i)=>({u,i})).filter(x=>usersOn(x.u,side));
 const count=k=>k==='log'?(DB.authEvent||[]).length:DB.user.filter(u=>usersOn(u,k)).length;
 const rows=list.map(({u,i})=>{
  const actions=`<td style="white-space:nowrap"><button class="sm" onclick="userEditOpen(${i})">Edit</button>
   <button class="sm dl" title="${prod?'Remove from production':'Remove from office'}" onclick="delUser(${i},'${side}')">×</button></td>`;
  return prod
   ?`<tr data-user-row="${esc(u.viewProfileId)}"><td class="mono">${esc(userNoText(u))}</td><td><b>${raw(u.name)}</b></td><td>${userNowHTML(u)}</td><td>${userHasPin(u)?'<span class="pill ok">set</span>':'<span class="mut">—</span>'}</td>${actions}</tr>`
   :`<tr data-user-row="${esc(u.viewProfileId)}"><td><b>${raw(u.name)}</b></td><td>${userNowHTML(u)}</td><td class="user-access-cell">${userAccessHTML(u)}</td>
   <td>${userHasPassword(u)?'<span class="pill ok">set</span>':'<span class="pill warn" title="Cannot sign in">not set</span>'}</td>${actions}</tr>`;
 }).join('');
 const head=prod
  ?'<th title="Station sign-in: number + PIN">No.</th><th>Name</th><th title="Signed in now on this computer">Now</th><th>PIN</th><th></th>'
  :'<th>Name</th><th title="Signed in now on this computer">Now</th><th>Sections</th><th>Password</th><th></th>';
 /* Вход ещё выключен (signinOn): пароля нет ни у кого с разделом Users. */
 const off=DB.user.some(userOffice)&&!signinOn()?'<span class="pill warn" data-signin-off>Sign-in is off — set a password for someone with Users</span>':'';
 const tabs=`<div class="tabs">${[['office','Office'],['production','Production'],['log','Sign-in log']].map(([k,l])=>`<button class="${side===k?'on':''}" data-users-side="${k}" onclick="subtab='${k}';uEdit=null;uDraft=null;render()">${l} <span class="mut">${count(k)}</span></button>`).join('')}</div>`;
 return `<div class="page-head"><div><h2>Users</h2><p>${log?'Sign-ins and sign-outs on this computer.':prod?'Number and PIN · any station.':'Password and sections.'}</p></div>${off}
  ${uEdit!==null||log?'':`<button class="pri" data-user-add onclick="userEditOpen('new')">Add user</button>`}</div>
  ${log?`<div class="card sales-list-card users-log-card"><div class="users-log-tabs">${tabs}</div>${authLogTable()}</div>`:`<div class="card">${tabs}
  ${uEdit!==null?userForm():''}
  <table><thead><tr>${head}</tr></thead>
  <tbody>${rows||`<tr><td colspan="5" class="empty">${prod?'No one signs in at stations yet':'No one signs in to the office yet'}</td></tr>`}</tbody></table>
  </div>`}`;
}
/* Журнал входов — таблица как в Sales: период When, воронки Who / What /
   Where. Своя область usersLog в общем движке (sales-list-ui). */
function usersListScope(){return tab==='users'&&usersSide()==='log'?'usersLog':'';}
function authLogColumns(){
 const col=(k,label,type,def)=>({k,label,type:type||'text',def:def!==false});
 return [col('when','When','date'),col('who','Who','list'),col('what','What','list'),col('where','Where','list'),col('note','Note')];
}
function authLogInfos(){
 return (DB.authEvent||[]).map(e=>({o:{createdAt:e.at},e,memo:{when:salesListIsoDay(e.at),who:e.name||'—',what:e.what,where:e.where,note:e.note}}));
}
function authLogTable(){
 const infos=authLogInfos(),rows=salesListRows(infos).sort((a,b)=>b.e.at.localeCompare(a.e.at)),cols=salesListColumns();
 const head=c=>{const active=salesListFilterActive(salesListLoadPrefs().filters[c.k]);return `<th><span class="sl-th">${esc(c.label)}<button type="button" class="sl-fbtn${active?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${esc(c.label)}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span></th>`;};
 const cell=(i,c)=>c.k==='when'?`<td>${esc(salesListShortDay(i.memo.when))} · ${esc(new Date(i.e.at).toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit',hour12:false}))}</td>`:c.k==='what'?`<td><span class="pill ${i.e.what==='Sign in'?'ok':''}">${esc(i.e.what)}</span></td>`:`<td>${i.memo[c.k]?raw(String(i.memo[c.k])):'<span class="mut">—</span>'}</td>`;
 return `<div class="sales-toolbar">${salesListDateButton('when')}</div>${salesListFilterChips()}
  <div class="sales-table-wrap"><table class="sl-table users-log"><thead><tr>${cols.map(head).join('')}</tr></thead>
  <tbody>${rows.map(i=>`<tr data-auth-row>${cols.map(c=>cell(i,c)).join('')}</tr>`).join('')||`<tr><td colspan="${cols.length}" class="empty">${infos.length?'Nothing matches the filters.':'No sign-ins yet'}</td></tr>`}</tbody></table></div>
  <div class="mut cust-foot">${rows.length} of ${infos.length} records · this computer only</div>${salesListMenuHTML(infos)}`;
}
/* Новый человек — с тем входом, на вкладке которого нажали Add user.
   Черновик формы — только правки: имя, номер, галочки, новые пароль и PIN.
   Отпечатков секретов в нём нет (только «задан / не задан»), версия записи
   (rev) — чтобы чужая правка из другой вкладки не перезаписалась старой. */
function userEditOpen(i){
 const u=i==='new'?null:DB.user[i];if(i!=='new'&&!u)return;
 uDraft={id:u?u.viewProfileId:'',rev:u?u.rev:0,name:u?u.name:'',no:u&&u.no?userNoText(u):'',access:u?u.access.slice():[],
  onOffice:u?userOffice(u):usersSide()==='office',onStation:u?userHasPin(u):usersSide()==='production',
  hasPassword:userHasPassword(u),hasPin:userHasPin(u),newPassword:'',newPin:''};
 uEdit=u?u.viewProfileId:'new';render();
 setTimeout(()=>{const el=document.getElementById('u_name');if(el&&!u)el.focus();},0);
}
function userForm(){
 const r=uDraft;
 const sections=USER_SECTIONS.map(k=>{const n=userSectionNav(k),on=r.access.includes(k);
  return `<label class="user-sec${on?' on':''}" data-user-sec="${k}"><input type="checkbox" ${on?'checked':''} onchange="userToggleSection('${k}',this.checked)">${ico(n.icon,'icon-inline')}${esc(n.label)}</label>`;}).join('');
 const office=r.onOffice?`<div class="user-block-body">
   <div class="grid"><div><label>Password</label>${pwInput(`id="u_password" autocomplete="new-password" placeholder="${r.hasPassword?'set · type to change':USER_PASSWORD_MIN+'+ characters'}" value="${esc(r.newPassword||'')}" oninput="uDraft.newPassword=this.value"`)}</div></div>
   <div class="user-sec-head"><label>Sections</label><button type="button" class="sm" onclick="userSetSections(true)">All</button><button type="button" class="sm" onclick="userSetSections(false)">None</button></div>
   <div class="user-secs">${sections}</div></div>`:'';
 const station=r.onStation?`<div class="user-block-body"><div class="grid">
   <div><label>No.</label><input id="u_no" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="auto" value="${esc(r.no||'')}" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,4);uDraft.no=this.value"></div>
   <div><label>PIN</label>${pwInput(`id="u_pin" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="${r.hasPin?'set · type to change':'4 digits'}" value="${esc(r.newPin||'')}" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,4);uDraft.newPin=this.value"`)}</div>
  </div><div class="hint">Any station. The office gives the PIN.</div></div>`:'';
 return `<div class="form user-form"><h3>${uEdit==='new'?'New user':'Edit'}</h3>
  <div class="grid"><div><label>Name *</label><input id="u_name" value="${esc(r.name||'')}" oninput="uDraft.name=this.value"></div></div>
  <div class="user-blocks">
   <div class="user-block${r.onOffice?' on':''}"><label class="user-block-head"><input type="checkbox" id="u_office" ${r.onOffice?'checked':''} onchange="uDraft.onOffice=this.checked;render()"><b>Office sign-in</b><span class="mut">password · sections</span></label>${office}</div>
   <div class="user-block${r.onStation?' on':''}"><label class="user-block-head"><input type="checkbox" id="u_station" ${r.onStation?'checked':''} onchange="uDraft.onStation=this.checked;render()"><b>Station sign-in</b><span class="mut">number · PIN</span></label>${station}</div>
  </div>
  <div class="err" id="e_user"></div>
  <div class="row"><button class="pri" data-user-save onclick="saveUser()">Save</button><button onclick="uEdit=null;uDraft=null;render()">Cancel</button></div></div>`;
}
function userToggleSection(k,on){
 const set=new Set(uDraft.access);if(on)set.add(k);else set.delete(k);
 uDraft.access=USER_SECTIONS.filter(x=>set.has(x));render();
}
function userSetSections(all){uDraft.access=all?USER_SECTIONS.slice():[];render();}
/* Сохранение и удаление — команды erp/users/commands: они проверяют право,
   правила и версию и пишут всё или ничего. Форма закрывается только после
   записи; не записалось — правки остаются, ошибка рядом с Save. */
/* Save ждёт ответа команды (Promise, как запрос к серверу): пока ждёт —
   «Saving…» и второй раз не нажимается; ошибка — форма с правками
   остаётся, текст рядом с Save; успех — форма закрывается. Возвращает
   обещание — им пользуются проверки. */
function saveUser(){
 const d=uDraft;if(!d||d.pending)return Promise.resolve(null);
 const e=document.getElementById('e_user');if(e)e.style.display='none';
 const input={id:d.id,rev:d.rev,name:d.name,no:d.no,office:d.onOffice,access:d.access,password:d.newPassword,station:d.onStation,pin:d.newPin};
 d.pending=true;userSaveButton(true);
 return usersSave(input,accessActor()).then(r=>{
  d.pending=false;if(uDraft!==d)return r;
  if(!r.ok){userSaveButton(false);const el=document.getElementById('e_user');if(el)fail(el,r.error);return r;}
  uEdit=null;uDraft=null;render();return r;
 });
}
function userSaveButton(busy){const b=document.querySelector('[data-user-save]');if(b){b.disabled=busy;b.textContent=busy?'Saving…':'Save';}}
function delUser(i,side){
 const u=DB.user[i];if(!u)return Promise.resolve(null);
 const rev=u.rev,err=usersDropError(u.viewProfileId,side,rev);if(err){alert(err);return Promise.resolve(usersFail(err));}
 const prod=side==='production',other=prod?userOffice(u):userHasPin(u),name=u.name||'this user';
 if(!confirm(other?(prod?'Remove station sign-in for ':'Remove office sign-in for ')+name+'?':'Delete '+name+'?'))return Promise.resolve(null);
 return usersDrop(u.viewProfileId,side,rev,accessActor()).then(r=>{if(!r.ok)alert(r.error);render();return r;});
}
