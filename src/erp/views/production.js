/* =====================================================================
   view/production  ·  erp-1.0
   Поток по уровням, станции/машины, CRUD.
   IN : DB.station / DB.level
   OUT: html
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function viewProduction(){
 if(!['stations','levels'].includes(subtab)) subtab='stations';
 const levels=[...DB.level].sort((a,b)=>a.n-b.n);
 const pipeline=levels.map((l,i)=>{
   const machines=DB.station.filter(s=>s.levels.includes(l.n));
   return `${i?`<div class="pipe-arrow">${ico('arrow')}</div>`:''}<div class="stage"><div class="stage-top"><div class="stage-index">${l.n}</div><div><b>${raw(l.label)}</b><small>${machines.length} станц.</small></div></div><div class="stage-machines">${machines.length?machines.map(s=>`<span class="pill" data-raw>${esc(s.code)}</span>`).join(' '):'<span class="mut">машины не назначены</span>'}</div></div>`;
 }).join('');
 const orphan=DB.station.filter(s=>!s.levels.length);
 return `${referenceReseeded?'<div class="note" style="margin-bottom:14px">Справочники обновлены до новой версии — этапы маршрута и станки приведены к реальному цеху.</div>':''}<div class="page-head"><div><h2>Производственный поток</h2><p>Уровень — не просто цифра в таблице. Это место станции в маршруте детали через цех. Ниже поток виден как процесс, а таблица остаётся для точного редактирования.</p></div><span class="pill info">${ico('factory','icon-inline')}${DB.station.length} станций</span></div>
  <div class="card">
   <div class="section-title"><h3>Маршрут по уровням</h3><span class="pill ${orphan.length?'warn':'ok'}">${orphan.length?orphan.length+' без уровня':'все назначены'}</span></div>
   <div class="pipeline">${pipeline}</div>
   ${orphan.length?`<div class="note" style="margin-top:10px">Без уровня: ${orphan.map(s=>`<b>${raw(s.code)}</b> — ${raw(s.name)}`).join('; ')}. Их позицию в маршруте не угадываем.</div>`:''}
  </div>
  <div class="card">
   <div class="tabs"><button class="${subtab==='stations'?'on':''}" onclick="subtab='stations';render()">Станции / машины</button><button class="${subtab==='levels'?'on':''}" onclick="subtab='levels';render()">Уровни потока</button></div>
   ${subtab==='stations'?viewStations():viewLevels()}
  </div>`;
}
let stEdit=null;
function viewStations(){
 const machineCards=DB.station.map(s=>{
  const lvs=s.levels.map(n=>DB.level.find(l=>l.n===n)).filter(Boolean);
  const icon=s.code.includes('FURN')?'furnace':s.code.includes('CNC')?'cnc':s.code.includes('EDGE')||s.code.includes('BEVEL')?'edge':'cut';
  return `<div class="machine-card"><div class="machine-head"><div class="machine-ico">${ico(icon)}</div><div><b>${raw(s.name)}</b><div class="code" data-raw>${esc(s.code)}</div></div></div><div class="machine-meta"><div><span>Поток</span><strong>${lvs.length?lvs.map(l=>l.n+' · '+raw(l.label)).join('<br>'):'не назначен'}</strong></div><div><span>Габарит</span><strong>${s.maxW?s.maxW+' × '+s.maxL+' in':'—'}</strong></div><div><span>Толщина</span><strong>${s.minTh??'—'}–${s.maxTh??'—'} mm</strong></div><div><span>Статус</span><strong>${lvs.length?'в маршруте':'требует решения'}</strong></div></div></div>`;
 }).join('');
 const rows=DB.station.map((s,i)=>{
  const lvs=s.levels.map(n=>DB.level.find(l=>l.n===n)).filter(Boolean);
  return `<tr><td class="mono"><b>${raw(s.code)}</b></td><td>${raw(s.name)}</td>
   <td>${lvs.length?lvs.map(l=>`<span class="pill info">${l.n} · ${raw(l.label)}</span>`).join(' '):'<span class="bad pill">не назначен</span>'}</td>
   <td class="mono">${s.maxW?s.maxW+' × '+s.maxL:'<span class="mut">—</span>'}</td>
   <td class="mono">${s.minTh==null||s.maxTh==null?'<span class="mut">—</span>':s.minTh+'–'+s.maxTh+' мм'}</td>
   <td class="mut" style="max-width:220px">${raw(s.note||'')}</td>
   <td style="white-space:nowrap"><button class="sm" onclick="stEdit=${i};render()">Изменить</button>
   <button class="sm dl" onclick="delStation(${i})">×</button></td></tr>`;
 }).join('');
 return `${stEdit!==null?stationForm():''}
  <div class="machine-grid">${machineCards}</div>
  <div class="section-title" style="margin-top:18px"><h3>Точная таблица станций</h3><span class="mut" style="font-size:11px">CRUD сохранён</span></div>
  <table><thead><tr><th>Код</th><th>Название</th><th>Уровень</th><th>Габарит, in</th><th>Толщина</th><th>Примечание</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="7" class="empty">пусто</td></tr>'}</tbody></table>
  ${stEdit!==null?'':'<div class="row"><button class="pri" onclick="stEdit=\'new\';render()">Добавить станцию</button></div>'}`;
}
function stationForm(){
 const r = stEdit==='new' ? {code:'',name:'',levels:[],maxW:'',maxL:'',minTh:'',maxTh:'',note:''} : DB.station[stEdit];
 return `<div class="form"><h3>${stEdit==='new'?'Новая станция':'Изменение'}</h3>
  <div class="grid">
   <div><label>Код *</label><input id="st_code" value="${esc(r.code)}"></div>
   <div><label>Название *</label><input id="st_name" value="${esc(r.name)}"></div>
   <div style="grid-column:1/-1"><label>Этапы маршрута</label>
    <div style="display:flex;flex-wrap:wrap;gap:8px 16px">${DB.level.map(l=>`<label style="display:inline-flex;align-items:center;gap:6px;font-weight:400"><input type="checkbox" class="st_lv" value="${l.n}" ${(r.levels||[]).includes(l.n)?'checked':''}><span>${l.n} · ${SEED_TEXT.has(l.label)&&LANG==='en'?tx(l.label):esc(l.label)}</span></label>`).join('')}</div>
    <div class="hint">Один станок может стоять на нескольких этапах — ЧПУ полирует контур и обрабатывает тело стекла.</div></div>
   <div><label>Макс. ширина, in</label><input id="st_maxW" type="number" min="0" step="any" value="${r.maxW??''}"></div>
   <div><label>Макс. длина, in</label><input id="st_maxL" type="number" min="0" step="any" value="${r.maxL??''}"></div>
   <div><label>Мин. толщина, мм</label><input id="st_minTh" type="number" min="0" step="any" value="${r.minTh??''}"></div>
   <div><label>Макс. толщина, мм</label><input id="st_maxTh" type="number" min="0" step="any" value="${r.maxTh??''}"></div>
  </div>
  <div style="margin-top:12px"><label>Примечание</label><input id="st_note" value="${esc(r.note||'')}"></div>
  <div class="err" id="e_station"></div>
  <div class="row"><button class="pri" onclick="saveStation()">Сохранить</button><button onclick="stEdit=null;render()">Отмена</button></div></div>`;
}
function saveStation(){
 const e=document.getElementById('e_station'); e.style.display='none';
 const code=document.getElementById('st_code').value.trim().toUpperCase();
 const name=document.getElementById('st_name').value.trim();
 if(!code||!name) return fail(e,'Код и название обязательны');
 if(!/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(code)) return fail(e,'Код: только A–Z, 0–9, дефис и подчёркивание');
 if(DB.station.some((s,i)=>i!==stEdit && s.code===code)) return fail(e,'Такой код уже есть');
 const g=id=>{const v=document.getElementById(id).value; return v===''?null:+v;};
 const maxW=g('st_maxW'),maxL=g('st_maxL'),minTh=g('st_minTh'),maxTh=g('st_maxTh');
 if((maxW==null)!==(maxL==null))return fail(e,'Максимальные ширина и длина заполняются вместе');
 if(maxW!=null&&(!(maxW>0)||!(maxL>0)))return fail(e,'Габариты станции должны быть больше нуля');
 if((minTh==null)!==(maxTh==null))return fail(e,'Минимальная и максимальная толщина заполняются вместе');
 if(minTh!=null&&(!(minTh>0)||!(maxTh>0)||minTh>maxTh))return fail(e,'Проверь диапазон толщины');
 const levels=[...document.querySelectorAll('.st_lv:checked')].map(x=>+x.value).sort((a,b)=>a-b);
 const o={code,name, levels, maxW,maxL,minTh,maxTh,note:document.getElementById('st_note').value.trim()};
 if(stEdit==='new') DB.station.push(o); else {Object.assign(DB.station[stEdit],o); delete DB.station[stEdit].level;}
 stEdit=null; touch(); render();
}
function delStation(i){
 const s=DB.station[i];
 if(DB.user.some(u=>u.station===s.code)) return alert('Cannot delete — users are assigned to this station');
 if(!confirm('Delete this station?'))return; DB.station.splice(i,1); touch(); render();
}

let lvEdit=null;
function viewLevels(){
 const rows=DB.level.map((l,i)=>{   /* DB.level держим отсортированным при записи, не в рендере */
  const cnt=DB.station.filter(s=>s.levels.includes(l.n)).length;
  return `<tr><td class="mono"><b>${l.n}</b></td><td>${raw(l.label)}</td>
   <td class="mut">${cnt} станци${cnt===1?'я':cnt>=2&&cnt<=4?'и':'й'}</td>
   <td style="white-space:nowrap"><button class="sm" onclick="lvEdit=${i};render()">Изменить</button>
   <button class="sm dl" onclick="delLevel(${i})">×</button></td></tr>`;
 }).join('');
 return `${lvEdit!==null?levelForm():''}
  <table><thead><tr><th>№</th><th>Название этапа</th><th>Станций</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="4" class="empty">пусто</td></tr>'}</tbody></table>
  ${lvEdit!==null?'':'<div class="row"><button class="pri" onclick="lvEdit=\'new\';render()">Добавить уровень</button></div>'}
  <div class="hint">Список открытый — добавляй уровни по мере того, как появляются новые этапы (закалка, мойка, сборка стеклопакета и т.д.).</div>`;
}
function levelForm(){
 const r = lvEdit==='new' ? {n:(Math.max(0,...DB.level.map(l=>l.n))+1), label:''} : DB.level[lvEdit];
 return `<div class="form"><h3>${lvEdit==='new'?'Новый уровень':'Изменение'}</h3>
  <div class="grid"><div><label>Номер *</label><input id="lv_n" type="number" min="1" step="1" value="${r.n}"></div>
  <div><label>Название этапа *</label><input id="lv_label" value="${esc(r.label)}"></div></div>
  <div class="err" id="e_level"></div>
  <div class="row"><button class="pri" onclick="saveLevel()">Сохранить</button><button onclick="lvEdit=null;render()">Отмена</button></div></div>`;
}
function saveLevel(){
 const e=document.getElementById('e_level'); e.style.display='none';
 const n=+document.getElementById('lv_n').value, label=document.getElementById('lv_label').value.trim();
 if(!Number.isInteger(n)||n<=0||!label) return fail(e,'Заполни положительный целый номер и название');
 if(DB.level.some((l,i)=>i!==lvEdit && l.n===n)) return fail(e,'Такой номер уже есть');
 if(lvEdit==='new') DB.level.push({n,label});
 else{
  /* ИСПРАВЛЕНО (авг 2026): смена номера уровня раньше молча осиротляла станции —
     удалять уровень со станциями запрещено, а переименовать его в другой номер
     было можно, и station.level указывал в пустоту. Тянем станции за уровнем. */
  const was=DB.level[lvEdit].n;
  Object.assign(DB.level[lvEdit],{n,label});
  if(was!==n) DB.station.forEach(s=>{ s.levels=s.levels.map(v=>v===was?n:v).sort((a,b)=>a-b); });
 }
 DB.level.sort((a,b)=>a.n-b.n);
 lvEdit=null; touch(); render();
}
function delLevel(i){
 const l=DB.level[i];
 if(DB.station.some(s=>s.levels.includes(l.n))) return alert('Cannot delete — stations are assigned to this level');
 if(!confirm('Delete this level?'))return; DB.level.splice(i,1); touch(); render();
}
