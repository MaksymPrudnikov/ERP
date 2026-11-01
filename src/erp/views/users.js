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
/* Начатая форма: новая версия ERP не перезагружает вкладку сама (erp/storage). */
(window.STORAGE_UNSAVED=window.STORAGE_UNSAVED||[]).push(()=>!!uDraft);
function userSectionNav(k){return NAV.find(n=>n.k===k)||{k,label:USER_ACCESS_LABELS[k]||k,icon:'report'};}
function userAccessHTML(u){
 if(!userOffice(u))return '<span class="mut">—</span>';
 if(u.access.length===USER_SECTIONS.length)return '<span class="pill ok">All sections</span>';
 return u.access.map(k=>`<span class="pill">${esc(userSectionNav(k).label)}</span>`).join(' ');
}
/* Две вкладки, как на экране входа (владелец, 3 октября 2026: «разделить на
   офис и производство»). Office — у кого отмечены разделы, Production — у
   кого есть PIN станции или нет офиса (рабочий, которому PIN ещё не дали).
   Мастер цеха с обоими входами — в обеих. */
function usersSide(){return subtab==='production'?'production':subtab==='log'?'log':subtab==='cloud'?'cloud':'office';}
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
 const side=usersSide(),prod=side==='production',log=side==='log',cloud=side==='cloud';
 if(cloudAccessOn()&&!cloudAccess.asked)setTimeout(cloudAccessLoad,0);
 const srv=!prod&&Array.isArray(cloudAccess.members);
 const list=log||cloud?[]:DB.user.map((u,i)=>({u,i})).filter(x=>usersOn(x.u,side));
 const count=k=>k==='cloud'?'':k==='log'?(DB.authEvent||[]).length:DB.user.filter(u=>usersOn(u,k)).length;
 const rows=list.map(({u,i})=>{
  const actions=`<td style="white-space:nowrap"><button class="sm" onclick="userEditOpen(${i})">Edit</button>
   <button class="sm dl" title="${prod?'Remove from production':'Remove from office'}" onclick="delUser(${i},'${side}')">×</button></td>`;
  return prod
   ?`<tr data-user-row="${esc(u.viewProfileId)}"><td class="mono">${esc(userNoText(u))}</td><td><b>${raw(u.name)}</b></td><td>${userNowHTML(u)}</td><td>${userHasPin(u)?'<span class="pill ok">set</span>':'<span class="mut">—</span>'}</td>${actions}</tr>`
   :`<tr data-user-row="${esc(u.viewProfileId)}"><td><b>${raw(u.name)}</b></td><td>${userNowHTML(u)}</td><td class="user-access-cell">${userAccessHTML(u)}</td>
   <td>${userHasPassword(u)?'<span class="pill ok">set</span>':u.email&&signinServer()?'<span class="pill ok" title="Server login">server</span>':'<span class="pill warn" title="Cannot sign in">not set</span>'}</td>${srv?userServerHTML(u):''}${actions}</tr>`;
 }).join('');
 const head=prod
  ?'<th title="Station sign-in: number + PIN">No.</th><th>Name</th><th title="Signed in now on this computer">Now</th><th>PIN</th><th></th>'
  :'<th>Name</th><th title="Signed in now on this computer">Now</th><th>Sections</th><th>Password</th>'+(srv?'<th title="Login on server">Server</th>':'')+'<th></th>';
 /* Вход ещё выключен (signinOn): пароля нет ни у кого с разделом Users. */
 const off=DB.user.some(userOffice)&&!signinOn()?'<span class="pill warn" data-signin-off>Sign-in is off — set a password for someone with Users</span>':'';
 const tabs=`<div class="tabs">${[['office','Office'],['production','Production'],['log','Sign-in log'],['cloud','Cloud']].map(([k,l])=>`<button class="${side===k?'on':''}" data-users-side="${k}" onclick="subtab='${k}';uEdit=null;uDraft=null;render()">${l} <span class="mut">${count(k)}</span></button>`).join('')}</div>`;
 return `<div class="page-head"><div><h2>Users</h2><p>${cloud?'Server for all computers.':log?'Sign-ins and sign-outs on this computer.':prod?'Number and PIN · any station.':'Password and sections.'}</p></div>${off}
  ${uEdit!==null||log||cloud?'':`<button class="pri" data-user-add onclick="userEditOpen('new')">Add user</button>`}</div>
  ${cloud?`<div class="card">${tabs}${usersCloudHTML()}</div>`:log?`<div class="card sales-list-card users-log-card"><div class="users-log-tabs">${tabs}</div>${authLogTable()}</div>`:`<div class="card">${tabs}
  ${uEdit!==null?userForm():''}
  <table><thead><tr>${head}</tr></thead>
  <tbody>${rows||`<tr><td colspan="${srv?6:5}" class="empty">${prod?'No one signs in at stations yet':'No one signs in to the office yet'}</td></tr>`}</tbody></table>
  </div>`}`;
}
/* Вход человека на сервер и совпадает ли он с галочками здесь
   (erp/cloud-access). */
function userServerHTML(u){
 const st=cloudMemberState(u);
 const pill=st==='ok'?'<span class="pill ok">same</span>':st==='missing'?'<span class="pill warn" title="Save again">not on server</span>':st==='differs'?'<span class="pill warn" title="Save again">differs</span>':'';
 return `<td data-user-server="${st||'none'}">${u.email?`<span class="mono small">${esc(u.email)}</span> ${pill}`:'<span class="mut">—</span>'}</td>`;
}
/* Cloud — сервер (erp/cloud.js). Адрес и ключ — этого устройства; пароль
   не сохраняется. Ниже — синхронизация (erp/cloud-sync.js). */
function usersCloudHTML(){
 const c=cloudConfig(),st=cloudState,s=c.session;
 const status=st.busy?'<span class="pill" data-cloud-status="busy">Connecting…</span>'
  :st.error?`<span class="pill warn" data-cloud-status="error">${esc(st.error)}</span>`
  :st.me?`<span class="pill ok" data-cloud-status="ok">Connected · ${esc(st.me.name||s&&s.email||'')}${st.me.admin?' · admin':''}</span>`
  :s?`<span class="pill" data-cloud-status="signed">Signed in · ${esc(s.email||'')}</span>`:'<span class="mut" data-cloud-status="off">Not connected</span>';
 return `<div class="form user-form" data-cloud>
  <div class="grid">
   <div><label>Server</label><input id="cl_url" autocomplete="off" placeholder="https://xxxx.supabase.co" value="${esc(c.url||'')}"></div>
   <div><label>Publishable key</label><input id="cl_key" autocomplete="off" placeholder="sb_publishable_…" value="${esc(c.key||'')}"></div>
  </div>
  <div class="grid">
   <div><label>Email</label><input id="cl_email" autocomplete="username" value="${esc(s&&s.email||'')}"></div>
   <div><label>Password</label>${pwInput('id="cl_pass" autocomplete="current-password"')}</div>
  </div>
  <div class="row">${status}
   <button class="pri" data-cloud-connect ${st.busy?'disabled':''} onclick="usersCloudConnect()">Connect</button>
   ${s?`<button data-cloud-check onclick="cloudCheck()">Check</button><button data-cloud-out onclick="cloudSignOut()">Sign out</button>`:''}</div>
  ${s?usersCloudSyncHTML():''}${s&&Array.isArray(cloudAccess.members)?usersCloudAccessHTML():''}${usersDataHTML()}</div>`;
}
/* Вся база файлом — только здесь, не на каждом экране (владелец, 02.11.2026).
   С сервером замена базы ушла бы всем: Import, Restore и Clear не показаны. */
function usersDataHTML(){
 const on=typeof cloudSync!=='undefined'&&cloudSync.on;
 return `<h3>Data</h3><div class="row" data-users-data><button onclick="doExport()">Export JSON</button>${on?'':`<button onclick="document.getElementById('imp').click()">Import JSON</button>${storageBackupPresent?'<button onclick="storageRestoreBackup()">Restore pre-import backup</button>':''}<button onclick="storageClear()">Clear database</button>`}</div>`;
}
function usersCloudSyncHTML(){
 const y=cloudSync,text=cloudSyncText(),busy=!!y.busy;
 const pill=text?`<span class="pill${y.error||y.offline?' warn':text==='Synced'?' ok':''}" data-cloud-sync="${y.on?'on':'busy'}">${esc(text)}</span>`:'<span class="mut" data-cloud-sync="off">Not synced</span>';
 const warn=y.warn?`<div class="hint warn" data-cloud-warn>${esc(y.warn)}</div>`:'';
 const err=!y.on&&y.error?`<div class="hint warn" data-cloud-sync-error>${esc(y.error)}</div>`:'';
 return `<h3>Sync</h3>${warn}${err}<div class="row">${pill}
  ${y.on?`<button data-cloud-stop ${busy?'disabled':''} onclick="cloudSyncStop()">Stop sync</button>`
   :`<button class="pri" data-cloud-upload ${busy?'disabled':''} onclick="cloudUpload()">Upload this database</button><button data-cloud-download ${busy?'disabled':''} onclick="cloudDownload()">Download from server</button>`}</div>`;
}
/* Access — правила таблиц на сервере (erp_table_rule): кто читает и кто
   пишет. Нет раздела — все. Видит и меняет администратор сервера. */
function usersRuleText(v){
 const a=String(v||'').split(',').filter(Boolean);
 return a.length?a.map(k=>`<span class="pill">${esc(userSectionNav(k).label)}</span>`).join(' '):'<span class="mut">Everyone</span>';
}
function usersCloudAccessHTML(){
 const a=cloudAccess,d=a.draft,list=d||a.rules||[],busy=a.busy;
 const ticks=(r,side)=>{const on=String(r[side]||'').split(',');
  return `<div class="user-secs" data-rule-side="${side}">${USER_SECTIONS.map(k=>`<label class="user-sec${on.includes(k)?' on':''}" data-rule-sec="${k}"><input type="checkbox" ${on.includes(k)?'checked':''} onchange="usersRuleTick('${esc(r.tbl)}','${side}','${k}',this.checked)">${esc(userSectionNav(k).label)}</label>`).join('')}</div>`;};
 const rows=list.map(r=>{
  const open=d&&a.open===r.tbl;
  return `<tr data-rule-row="${esc(r.tbl)}"><td class="mono">${esc(r.tbl)}</td><td>${usersRuleText(r.read)}</td><td>${usersRuleText(r.write)}</td>
   <td style="white-space:nowrap"><button class="sm" data-rule-open ${busy?'disabled':''} onclick="usersRuleOpen('${esc(r.tbl)}')">${open?'Done':'Edit'}</button><button class="sm dl" data-rule-drop title="Remove rule" ${busy?'disabled':''} onclick="usersRuleDrop('${esc(r.tbl)}')">×</button></td></tr>`
   +(open?`<tr data-rule-edit><td></td><td>${ticks(r,'read')}</td><td>${ticks(r,'write')}</td><td></td></tr>`:'');
 }).join('');
 const used=new Set(list.map(r=>r.tbl)),free=Object.keys(DB).filter(t=>Array.isArray(DB[t])&&/^[A-Za-z]/.test(t)&&!used.has(t)).sort();
 const add=`<select id="cl_rule_tbl" ${busy?'disabled':''}>${free.map(t=>`<option>${esc(t)}</option>`).join('')}</select><button class="sm" data-rule-add ${busy?'disabled':''} onclick="usersRuleAdd()">Add rule</button>`;
 return `<h3>Access</h3><div class="hint">No rule — everyone.</div>
  ${a.error?`<div class="hint warn" data-cloud-access-error>${esc(a.error)}</div>`:''}
  <table data-cloud-rules><thead><tr><th>Table</th><th>Read</th><th>Write</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="empty">No rules</td></tr>'}</tbody></table>
  <div class="row">${add}${d?`<button class="pri" data-rule-save ${busy?'disabled':''} onclick="cloudRulesSave(cloudAccess.draft)">Save access</button><button ${busy?'disabled':''} onclick="cloudAccess.draft=null;cloudAccess.open='';render()">Cancel</button>`:`<button class="sm" ${busy?'disabled':''} onclick="cloudAccessLoad()">Refresh</button>`}</div>`;
}
function usersRuleDraft(){if(!cloudAccess.draft)cloudAccess.draft=(cloudAccess.rules||[]).map(r=>({tbl:r.tbl,read:r.read||'',write:r.write||''}));return cloudAccess.draft;}
function usersRuleOpen(t){usersRuleDraft();cloudAccess.open=cloudAccess.open===t?'':t;render();}
function usersRuleDrop(t){const d=usersRuleDraft(),i=d.findIndex(r=>r.tbl===t);if(i>=0)d.splice(i,1);render();}
function usersRuleAdd(){
 const t=(document.getElementById('cl_rule_tbl')||{}).value;if(!t)return;
 usersRuleDraft().push({tbl:t,read:'',write:''});cloudAccess.open=t;render();
}
function usersRuleTick(t,side,k,on){
 const r=usersRuleDraft().find(x=>x.tbl===t);if(!r)return;
 const set=new Set(String(r[side]||'').split(',').filter(Boolean));if(on)set.add(k);else set.delete(k);
 r[side]=USER_SECTIONS.filter(x=>set.has(x)).join(',');render();
}
/* Подключение ПК к серверу маленьким окном — с экрана входа и снизу
   экрана, без раздела Users (владелец, 24.10.2026: «маленьким окном,
   туда ввести данные, чтобы подключиться, и тогда всё подтянется»).
   Адрес и ключ — этого ПК; вход — свой. ПК ещё не связан — сразу Download
   (вопрос «Replace this browser database?» остаётся). Человек с этой почтой
   есть — он и вошёл в ERP. */
let cloudJoin=null;
function cloudJoinButton(){
 const c=cloudConfig();let host='';try{host=c.url?new URL(c.url).host.split('.')[0]:'';}catch(e){}
 return `<button type="button" class="signin-server" data-cloud-join onclick="cloudJoinOpen()">${host?'Server · '+esc(host):'Connect to server'}</button>`;
}
/* render синхронный; фокус позже уводил набранное в Server (как в Purchasing, v5.261). */
function cloudJoinOpen(){cloudJoin={busy:false,error:''};render();const el=document.getElementById(cloudConfig().url?'cj_email':'cj_url');if(el)el.focus();}
function cloudJoinClose(){if(cloudJoin&&cloudJoin.busy)return;cloudJoin=null;render();}
function cloudJoinHTML(){
 if(!cloudJoin)return '';
 const c=cloudConfig(),b=cloudJoin.busy?'disabled':'';
 return `<div class="sales-service-modal-back sales-dialog-back" onclick="if(event.target===this)cloudJoinClose()"><div class="sales-service-modal sales-dialog" role="dialog" aria-modal="true" aria-label="Server" data-cloud-join-dialog>
  <div class="sales-service-modal-head"><div><span>This computer</span><h3>Server</h3></div><button type="button" aria-label="Close" onclick="cloudJoinClose()">×</button></div>
  <form class="sales-dialog-body form" onsubmit="event.preventDefault();cloudJoinGo()">
   <label>Server</label><input id="cj_url" autocomplete="off" placeholder="https://xxxx.supabase.co" value="${esc(c.url||'')}" ${b}>
   <label>Publishable key</label><input id="cj_key" autocomplete="off" placeholder="sb_publishable_…" value="${esc(c.key||'')}" ${b}>
   <label>Email</label><input id="cj_email" autocomplete="username" value="${esc(c.session&&c.session.email||'')}" ${b}>
   <label>Password</label>${pwInput('id="cj_pass" autocomplete="current-password" '+b)}
   <div class="signin-err" role="alert" data-cloud-join-error>${esc(cloudJoin.error||'')}</div>
   <div class="row"><button type="submit" class="pri" data-cloud-join-go ${b}>${cloudJoin.busy?esc(cloudJoin.busy):'Connect'}</button><button type="button" onclick="cloudJoinClose()" ${b}>Cancel</button></div>
  </form></div></div>`;
}
(window.APP_OVERLAYS=window.APP_OVERLAYS||[]).push(()=>tab==='station'?'':cloudJoinHTML());
async function cloudJoinGo(){
 const v=id=>String((document.getElementById(id)||{}).value||'').trim(),j=cloudJoin;if(!j||j.busy)return false;
 const url=cloudUrl(v('cj_url')),key=v('cj_key'),email=v('cj_email').toLowerCase(),pass=(document.getElementById('cj_pass')||{}).value||'';
 const step=t=>{j.busy=t;j.error='';render();};
 try{
  if(!url||!key||!email||!pass)throw new Error('Fill in all fields.');
  step('Connecting…');
  const c=cloudConfig();if(c.url!==url||c.key!==key){c.url=url;c.key=key;delete c.session;cloudConfigSave(c);}
  await cloudLogin(email,pass);
  if(!cloudSync.on){
   step('Downloading…');
   const ok=await cloudDownload();
   if(!ok&&cloudSync.error)throw new Error(cloudSync.error);
  }
  const u=(DB.user||[]).find(x=>x.email===email&&userOffice(x));
  cloudJoin=null;
  if(u&&signinOn())signinAs(u.viewProfileId);else render();
  return true;
 }catch(e){j.busy=false;j.error=/invalid login/i.test(e.message)?'Wrong email or password':e.message;render();return false;}
}
function usersCloudConnect(){const v=id=>(document.getElementById(id)||{}).value||'';return cloudConnect(v('cl_url'),v('cl_key'),v('cl_email'),v('cl_pass'));}
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
  hasPassword:userHasPassword(u),hasPin:userHasPin(u),newPassword:'',newPin:'',email:u&&u.email||''};
 uEdit=u?u.viewProfileId:'new';render();
 setTimeout(()=>{const el=document.getElementById('u_name');if(el&&!u)el.focus();},0);
}
function userForm(){
 const r=uDraft;
 const sections=USER_SECTIONS.map(k=>{const n=userSectionNav(k),on=r.access.includes(k);
  return `<label class="user-sec${on?' on':''}" data-user-sec="${k}"><input type="checkbox" ${on?'checked':''} onchange="userToggleSection('${k}',this.checked)">${ico(n.icon,'icon-inline')}${esc(n.label)}</label>`;}).join('');
 const office=r.onOffice?`<div class="user-block-body">
   <div class="grid"><div><label>Password</label>${pwInput(`id="u_password" autocomplete="new-password" placeholder="${r.hasPassword?'set · type to change':USER_PASSWORD_MIN+'+ characters'}" value="${esc(r.newPassword||'')}" oninput="uDraft.newPassword=this.value"`)}</div>
    <div><label>Server login</label><input id="u_email" autocomplete="off" placeholder="email" value="${esc(r.email||'')}" oninput="uDraft.email=this.value"></div></div>
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
 const input={id:d.id,rev:d.rev,name:d.name,no:d.no,office:d.onOffice,access:d.access,password:d.newPassword,station:d.onStation,pin:d.newPin,email:d.email};
 const before=d.id?usersFind(d.id):null,old=before&&before.email||'';
 d.pending=true;userSaveButton(true);
 return usersSave(input,accessActor()).then(r=>{
  d.pending=false;if(uDraft!==d)return r;
  if(!r.ok){userSaveButton(false);const el=document.getElementById('e_user');if(el)fail(el,r.error);return r;}
  uEdit=null;uDraft=null;render();
  /* Галочки и вход — на сервер (erp/cloud-access); ответ сервера не ждём.
     Новый пароль у человека с почтой — новый вход на сервере. */
  const u=usersFind(r.id),pw=input.office&&input.password;
  (u&&u.email&&pw&&cloudAccessOn()?cloudSignup(u.email,pw).then(err=>{if(err)cloudSync.warn='Server: '+u.email+' — '+err;}):Promise.resolve()).then(()=>cloudMemberPush(u,old));
  return r;
 });
}
function userSaveButton(busy){const b=document.querySelector('[data-user-save]');if(b){b.disabled=busy;b.textContent=busy?'Saving…':'Save';}}
function delUser(i,side){
 const u=DB.user[i];if(!u)return Promise.resolve(null);
 const rev=u.rev,err=usersDropError(u.viewProfileId,side,rev);if(err){alert(err);return Promise.resolve(usersFail(err));}
 const prod=side==='production',other=prod?userOffice(u):userHasPin(u),name=u.name||'this user';
 if(!confirm(other?(prod?'Remove station sign-in for ':'Remove office sign-in for ')+name+'?':'Delete '+name+'?'))return Promise.resolve(null);
 const email=u.email;
 return usersDrop(u.viewProfileId,side,rev,accessActor()).then(r=>{if(!r.ok)alert(r.error);render();
  if(r.ok&&!prod&&email)cloudMemberPush({email,name,access:[]});return r;});
}
