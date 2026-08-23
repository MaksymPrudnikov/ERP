/* =====================================================================
   view/users  ·  erp-1.0
   Пользователи, станции, навыки и покрытие навыков.
   IN : DB.user
   OUT: html
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

let uEdit=null, uDraft=null;
function viewUsers(){
 if(!subtab || !['list','report'].includes(subtab)) subtab='list';
 const covered=SKILLS.filter(skill=>DB.user.some(u=>(u.skills||[]).map(normSkill).some(x=>x&&x.skill===skill))).length;
 return `<div class="page-head"><div><h2>Команда и доступ к производству</h2><p>Кто работает в системе, к какой станции привязан и какие операции умеет выполнять. Права по модулям и полям будут отдельным слоем.</p></div><span class="pill info">${ico('lock','icon-inline')}права — следующий шаг</span></div>
  <div class="kpi-grid">
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('users')}</div></div><div class="kpi-num">${DB.user.length}</div><div class="kpi-label">пользователей</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('factory')}</div></div><div class="kpi-num">${DB.user.filter(u=>u.station).length}</div><div class="kpi-label">привязано к станции</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('check')}</div></div><div class="kpi-num">${covered}/${SKILLS.length}</div><div class="kpi-label">типов навыков покрыто</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('alert')}</div></div><div class="kpi-num">${SKILLS.length-covered}</div><div class="kpi-label">навыков без носителя</div></div>
  </div>
  <div class="card">
   <div class="tabs">
    <button class="${subtab==='list'?'on':''}" onclick="subtab='list';render()">Пользователи</button>
    <button class="${subtab==='report'?'on':''}" onclick="subtab='report';render()">Покрытие навыков</button>
   </div>
   ${subtab==='report'?skillReport():viewUsersList()}
  </div>`;
}
function viewUsersList(){
 const rows=DB.user.map((u,i)=>{
  const st=DB.station.find(s=>s.code===u.station);
  const skillPills=(u.skills||[]).map(skillBadgeHTML).join(' ');
  return `<tr><td><b>${raw(u.name)}</b></td><td>${esc(u.role)}</td>
   <td class="mono">${st?`<span data-raw>${esc(st.code)}</span> — ${raw(st.name)}`:'<span class="mut">не назначена</span>'}</td>
   <td>${skillPills||'<span class="mut">—</span>'}</td>
   <td style="white-space:nowrap"><button class="sm" onclick="uEdit=${i};uDraft=JSON.parse(JSON.stringify(DB.user[${i}]));uDraft.skills=(uDraft.skills||[]).map(normSkill);render()">Изменить</button>
   <button class="sm dl" onclick="delUser(${i})">×</button></td></tr>`;
 }).join('');
 return `${uEdit!==null?userForm():''}
  <table><thead><tr><th>Имя</th><th>Роль</th><th>Станция</th><th>Навыки</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="5" class="empty">пусто</td></tr>'}</tbody></table>
  ${uEdit!==null?'':'<div class="row"><button class="pri" onclick="uEdit=\'new\';uDraft={name:\'\',role:SAFE_DEFAULT_ROLE,station:\'\',skills:[]};render()">Добавить пользователя</button></div>'}`;
}
function userForm(){
 const r = uDraft;
 return `<div class="form"><h3>${uEdit==='new'?'Новый пользователь':'Изменение'}</h3>
  <div class="grid">
   <div><label>Имя *</label><input id="u_name" value="${esc(r.name||'')}" oninput="uDraft.name=this.value"></div>
   <div><label>Роль *</label><select id="u_role" onchange="uDraft.role=this.value">${ROLES.map(x=>`<option ${x===r.role?'selected':''}>${x}</option>`).join('')}</select></div>
   <div><label>Станция по умолчанию</label><select id="u_station" onchange="uDraft.station=this.value||null"><option value="">— нет —</option>
    ${DB.station.map(s=>`<option value="${esc(s.code)}" ${s.code===r.station?'selected':''}>${esc(s.code)} — ${SEED_TEXT.has(s.name)&&LANG==='en'?tx(s.name):esc(s.name)}</option>`).join('')}</select></div>
  </div>
  <div style="margin-top:12px"><label>Навыки</label>
   <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
   ${SKILLS.map(s=>`<label class="chk"><input type="checkbox" ${(r.skills||[]).includes(s)?'checked':''} onchange="toggleUserSkill('${esc(s)}',this.checked)"> ${esc(s)}</label>`).join('')}
   </div>
  </div>
  <div class="err" id="e_user"></div>
  <div class="row"><button class="pri" onclick="saveUser()">Сохранить</button><button onclick="uEdit=null;uDraft=null;render()">Отмена</button></div></div>`;
}
function toggleUserSkill(skill, checked){
 if(!uDraft.skills) uDraft.skills=[];
 if(checked){ if(!uDraft.skills.includes(skill)) uDraft.skills.push(skill); }
 else { uDraft.skills=uDraft.skills.filter(s=>s!==skill); }
 render();
}
function saveUser(){
 const e=document.getElementById('e_user'); e.style.display='none';
 uDraft.name=(uDraft.name||'').trim();
 if(!uDraft.name) return fail(e,'Укажи имя');
 if(uEdit==='new') DB.user.push(uDraft); else Object.assign(DB.user[uEdit],uDraft);
 uEdit=null; uDraft=null; touch(); render();
}
function delUser(i){ if(!confirm('Delete this user?'))return; DB.user.splice(i,1); touch(); render(); }

/* --- отчёт: свод по навыкам всех людей сразу, чекбоксы этого не умеют,
   поэтому это отдельный экран, а не ещё одна колонка в списке --- */
function skillReport(){
 /* Единственный вопрос отчёта — bus factor: на скольких людях держится навык.
    Уровни убраны (см. normSkill в erp/data.js), поэтому счёт, полоса и подпись
    считаются из ОДНОГО списка носителей. Раньше их было два: полоса шла от
    people, а подпись — от суммы по уровням, и на битом уровне они расходились. */
 const holders=skill=>DB.user.filter(u=>(u.skills||[]).map(normSkill).some(s=>s===skill)).map(u=>u.name);
 const coverage=n=>n===0?'нет носителя':n===1?'риск: 1 человек':n+' человека';
 const cards=SKILLS.map(skill=>{
  const people=holders(skill);
  const pct=DB.user.length?Math.min(100,Math.round(people.length/DB.user.length*100)):0;
  return `<div class="skill-card skill-coverage-card"><div class="skill-card-icon">${ico(skillIconName(skill))}</div><div class="skill-card-body"><b>${esc(skill)}</b><small>${coverage(people.length)}</small><div class="bar-bg" style="margin-top:9px"><div class="bar-fill" style="width:${pct}%"></div></div></div></div>`;
 }).join('');
 const rows=SKILLS.map(skill=>{
  const people=holders(skill), cls=people.length===0?'bad':people.length===1?'warn':'ok';
  return `<tr><td><b>${esc(skill)}</b></td><td>${people.length?people.map(raw).join(', '):'<span class="mut">—</span>'}</td><td><span class="pill ${cls}">${coverage(people.length)}</span></td></tr>`;
 }).join('');
 return `<div class="sub">Сначала визуальный слой — видно пробелы в компетенциях. Ниже поимённо: кто какой навык держит.</div>
  <div class="skill-card-grid" style="margin-bottom:14px">${cards}</div>
  <table><thead><tr><th>Навык</th><th>Кто умеет</th><th>Покрытие</th></tr></thead><tbody>${rows}</tbody></table>`;
}
