/* =====================================================================
   view/users  ·  erp-1.0
   Пользователи, рабочие места, навыки и покрытие навыков.
   IN : DB.user
   OUT: html
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

let uEdit=null, uDraft=null;
function viewUsers(){
 if(!subtab || !['list','report'].includes(subtab)) subtab='list';
 const covered=SKILLS.filter(skill=>DB.user.some(u=>(u.skills||[]).map(normSkill).some(x=>x&&x.skill===skill))).length;
 return `<div class="page-head"><div><h2>Team and production access</h2><p>Who works in the system and which work position they stand at by default. This prefills the screen; it does not tie a person to a machine — the truth about who did the work arrives with the scan. Module and field permissions come as a separate layer.</p></div><span class="pill info">${ico('lock','icon-inline')}permissions — next step</span></div>
  <div class="kpi-grid">
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('users')}</div></div><div class="kpi-num">${DB.user.length}</div><div class="kpi-label">users</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('factory')}</div></div><div class="kpi-num">${DB.user.filter(u=>u.station).length}</div><div class="kpi-label">assigned to a work position</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('check')}</div></div><div class="kpi-num">${covered}/${SKILLS.length}</div><div class="kpi-label">skill types covered</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('alert')}</div></div><div class="kpi-num">${SKILLS.length-covered}</div><div class="kpi-label">skills with no holder</div></div>
  </div>
  <div class="card">
   <div class="tabs">
    <button class="${subtab==='list'?'on':''}" onclick="subtab='list';render()">Users</button>
    <button class="${subtab==='report'?'on':''}" onclick="subtab='report';render()">Skill coverage</button>
   </div>
   ${subtab==='report'?skillReport():viewUsersList()}
  </div>`;
}
function viewUsersList(){
 const rows=DB.user.map((u,i)=>{
  const st=DB.station.find(s=>s.code===u.station);
  const skillPills=(u.skills||[]).map(skillBadgeHTML).join(' ');
  return `<tr><td><b>${raw(u.name)}</b></td><td>${esc(u.role)}</td>
   <td class="mono">${st?`<span data-raw>${esc(st.code)}</span> — ${sfLabel(st)}`:'<span class="mut">not assigned</span>'}</td>
   <td>${skillPills||'<span class="mut">—</span>'}</td>
   <td style="white-space:nowrap"><button class="sm" onclick="uEdit=${i};uDraft=JSON.parse(JSON.stringify(DB.user[${i}]));uDraft.skills=(uDraft.skills||[]).map(normSkill);render()">Edit</button>
   <button class="sm dl" onclick="delUser(${i})">×</button></td></tr>`;
 }).join('');
 return `${uEdit!==null?userForm():''}
  <table><thead><tr><th>Name</th><th>Role</th><th>Work position</th><th>Skills</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="5" class="empty">empty</td></tr>'}</tbody></table>
  ${uEdit!==null?'':'<div class="row"><button class="pri" onclick="uEdit=\'new\';uDraft={name:\'\',role:SAFE_DEFAULT_ROLE,station:\'\',skills:[]};render()">Add user</button></div>'}`;
}
function userForm(){
 const r = uDraft;
 return `<div class="form"><h3>${uEdit==='new'?'New user':'Edit'}</h3>
  <div class="grid">
   <div><label>Name *</label><input id="u_name" value="${esc(r.name||'')}" oninput="uDraft.name=this.value"></div>
   <div><label>Role *</label><select id="u_role" onchange="uDraft.role=this.value">${ROLES.map(x=>`<option ${x===r.role?'selected':''}>${x}</option>`).join('')}</select></div>
   <div><label>Default station</label><select id="u_station" onchange="uDraft.station=this.value"><option value="">— none —</option>
    ${DB.station.map(w=>`<option value="${esc(w.code)}" ${w.code===r.station?'selected':''} data-raw>${esc(w.code)} — ${esc(sfName(w))}</option>`).join('')}</select></div>
  </div>
  <div style="margin-top:12px"><label>Skills and proficiency level</label>
   <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
   ${SKILLS.map(s=>{
     const entry=(r.skills||[]).find(x=>x.skill===s);
     return `<div style="display:flex;align-items:center;gap:8px">
      <label class="chk" style="min-width:230px"><input type="checkbox" ${entry?'checked':''} onchange="toggleUserSkill('${esc(s)}',this.checked)"> ${esc(s)}</label>
      ${entry?`<select onchange="setUserSkillLevel('${esc(s)}',this.value)">${SKILL_LEVELS.map(l=>`<option ${l===entry.level?'selected':''}>${l}</option>`).join('')}</select>`:'<span class="mut" style="font-size:12px">not selected</span>'}
     </div>`;
   }).join('')}
   </div>
  </div>
  <div class="err" id="e_user"></div>
  <div class="row"><button class="pri" onclick="saveUser()">Save</button><button onclick="uEdit=null;uDraft=null;render()">Cancel</button></div></div>`;
}
function toggleUserSkill(skill, checked){
 if(!uDraft.skills) uDraft.skills=[];
 if(checked){ if(!uDraft.skills.some(x=>x.skill===skill)) uDraft.skills.push({skill, level:'Beginner'}); }
 else { uDraft.skills=uDraft.skills.filter(x=>x.skill!==skill); }
 render();
}
function setUserSkillLevel(skill, level){
 const e=uDraft.skills.find(x=>x.skill===skill); if(e) e.level=level;
}
function saveUser(){
 const e=document.getElementById('e_user'); e.style.display='none';
 uDraft.name=(uDraft.name||'').trim();
 if(!uDraft.name) return fail(e,'Enter a name');
 if(uEdit==='new') DB.user.push(uDraft); else Object.assign(DB.user[uEdit],uDraft);
 normalizeUsers();uEdit=null; uDraft=null; touch(); render();
}
function delUser(i){ if(!confirm('Delete this user?'))return; DB.user.splice(i,1); touch(); render(); }

/* --- отчёт: свод по навыкам всех людей сразу, чекбоксы этого не умеют,
   поэтому это отдельный экран, а не ещё одна колонка в списке --- */
function skillReport(){
 const cards=SKILLS.map(skill=>{
  const people=DB.user.filter(u=>(u.skills||[]).map(normSkill).some(x=>x&&x.skill===skill));
  const pct=DB.user.length?Math.min(100,Math.round(people.length/DB.user.length*100)):0;
  const byLevel={}; SKILL_LEVELS.forEach(l=>byLevel[l]=[]);
  DB.user.forEach(u=>{const e=(u.skills||[]).map(normSkill).find(x=>x&&x.skill===skill);if(e&&byLevel[e.level]) byLevel[e.level].push(u.name);});
  const total=SKILL_LEVELS.reduce((s,l)=>s+byLevel[l].length,0), cls=total===0?'bad':total===1?'warn':'ok';
  return `<div class="skill-card skill-coverage-card"><div class="skill-card-icon">${ico(skillIconName(skill))}</div><div class="skill-card-body"><b>${esc(skill)}</b><small>${total===0?'no holder':total===1?'risk: 1 person':total+' people'}</small><div class="bar-bg" style="margin-top:9px"><div class="bar-fill" style="width:${pct}%"></div></div><div class="skill-card-meta">${SKILL_LEVELS.map(l=>`<span class="pill ${byLevel[l].length?'info':''}">${esc(l)} · ${byLevel[l].length}</span>`).join(' ')}</div></div></div>`;
 }).join('');
 const rows=SKILLS.map(skill=>{
  const byLevel={}; SKILL_LEVELS.forEach(l=>byLevel[l]=[]);
  DB.user.forEach(u=>{const e=(u.skills||[]).map(normSkill).find(x=>x&&x.skill===skill);if(e&&byLevel[e.level]) byLevel[e.level].push(u.name);});
  const total=SKILL_LEVELS.reduce((s,l)=>s+byLevel[l].length,0), cls=total===0?'bad':total===1?'warn':'ok';
  return `<tr><td><b>${esc(skill)}</b></td>${SKILL_LEVELS.map(l=>`<td>${byLevel[l].length?byLevel[l].map(raw).join(', '):'<span class="mut">—</span>'}</td>`).join('')}<td><span class="pill ${cls}">${total===0?'no holder':total===1?'risk: 1 person':total+' people'}</span></td></tr>`;
 }).join('');
 return `<div class="sub">The visual layer first shows competency gaps. The exact level matrix remains below.</div>
  <div class="skill-card-grid" style="margin-bottom:14px">${cards}</div>
  <table><thead><tr><th>Skill</th>${SKILL_LEVELS.map(l=>`<th>${l}</th>`).join('')}<th>Coverage</th></tr></thead><tbody>${rows}</tbody></table>`;
}
