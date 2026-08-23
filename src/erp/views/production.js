/* =====================================================================
   view/production  ·  shopfloor-1.0
   Четыре справочника цеха и маршрут по станциям.
   IN : DB.station · DB.operation · DB.workPosition · DB.terminal
   OUT: html
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.

   Экран разложен по тем же четырём сущностям, что и модель: станция, рабочее
   место, операция, терминал. Это не оформление — прежний экран показывал
   станки и «уровни потока» как одно и то же, и пока они выглядят одним, их
   и заводят как одно. Ровно так у Spil в 33 подстанциях оказались вперемешку
   люди, станки, операции и смены.
   ===================================================================== */

const SF_TABS=[
 {k:'stations',  label:'Станции'},
 {k:'positions', label:'Рабочие места'},
 {k:'operations',label:'Операции'},
 {k:'terminals', label:'Терминалы'}
];
const SF_STAGE_LABEL={pre_temper:'до печи',heat:'печь',post_temper:'после печи',any:'не ограничено'};
const SF_UNIT_LABEL={in:'дюйм',ft2:'ft²',pcs:'шт',lb:'фунт'};

function viewProduction(){
 if(!SF_TABS.some(t=>t.k===subtab)) subtab='stations';
 const noSize=workPositionsAwaitingSize().length;
 const pipeline=DB.station.map((s,i)=>{
  const wp=stationWorkPositions(s.code);
  return `${i?`<div class="pipe-arrow">${ico('arrow')}</div>`:''}<div class="stage"><div class="stage-top"><div class="stage-index">${s.seq}</div><div><b>${sfLabel(s)}</b><small>${s.always?'всегда':'по необходимости'}</small></div></div><div class="stage-machines">${wp.length?wp.map(w=>`<span class="pill" data-raw>${esc(w.code)}</span>`).join(' '):'<span class="mut">рабочих мест нет</span>'}</div></div>`;
 }).join('');
 const empty=DB.station.filter(s=>!stationWorkPositions(s.code).length);
 return `${referenceReseeded?'<div class="note" style="margin-bottom:14px">Справочники обновлены: станция стала шагом маршрута, станки переехали в рабочие места, появились операции и терминалы.</div>':''}<div class="page-head"><div><h2>Цех</h2><p>Станция — это шаг маршрута, а не экран и не станок. Где делают — рабочее место, что именно делают — операция, чем сканируют — терминал. Четыре разные вещи, которые в Spil лежали одной таблицей.</p></div><span class="pill ${noSize?'warn':'ok'}">${ico('factory','icon-inline')}${noSize} мест без габарита</span></div>
  <div class="card">
   <div class="section-title"><h3>Маршрут по станциям</h3><span class="pill ${empty.length?'warn':'ok'}">${empty.length?empty.length+' станций без мест':'везде есть места'}</span></div>
   <div class="pipeline">${pipeline}</div>
   ${empty.length?`<div class="note" style="margin-top:10px">Без рабочих мест: ${empty.map(s=>`<b>${raw(s.code)}</b>`).join(', ')}<span>. Силкскрин переносится на этапе 5б, отгрузка ещё не спроектирована — рабочих мест там пока нет, и это не пробел в данных.</span></div>`:''}
  </div>
  <div class="card">
   <div class="tabs">${SF_TABS.map(t=>`<button class="${subtab===t.k?'on':''}" onclick="subtab='${t.k}';render()">${t.label}</button>`).join('')}</div>
   ${({stations:viewSfStations,positions:viewSfPositions,operations:viewSfOperations,terminals:viewSfTerminals})[subtab]()}
  </div>
  ${subtab==='stations'||subtab==='positions'?sfImportCard():''}`;
}

/* --- 1. Станции ------------------------------------------------------ */
let stEdit=null;
function viewSfStations(){
 const rows=DB.station.map((s,i)=>{
  const wp=stationWorkPositions(s.code),ops=stationOperations(s.code);
  return `<tr><td class="mono"><b>${s.seq}</b></td><td class="mono"><b>${raw(s.code)}</b></td><td>${sfLabel(s)}</td>
   <td><span class="pill ${s.always?'ok':'info'}">${s.always?'всегда':'по необходимости'}</span></td>
   <td>${ops.length?ops.map(o=>`<span class="pill info" data-raw>${esc(o.code)}</span>`).join(' '):'<span class="mut">—</span>'}</td>
   <td>${wp.length?wp.map(w=>`<span class="pill" data-raw>${esc(w.code)}</span>`).join(' '):'<span class="mut">нет</span>'}</td>
   <td class="mut" style="max-width:260px">${raw(s.note||'')}</td>
   <td style="white-space:nowrap"><button class="sm" onclick="stEdit=${i};render()">Изменить</button>
   <button class="sm dl" onclick="delSfStation(${i})">×</button></td></tr>`;
 }).join('');
 return `${stEdit!==null?sfStationForm():''}
  <div class="sub">Одиннадцать шагов маршрута. Порядок и признак «всегда / по необходимости» пользователь подтвердил; имена даны по ТИПУ работы, а конкретная услуга печатается на стикере.</div>
  <table><thead><tr><th>№</th><th>Код</th><th>Название</th><th>В маршруте</th><th>Операции</th><th>Рабочие места</th><th>Примечание</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="8" class="empty">пусто</td></tr>'}</tbody></table>
  ${stEdit!==null?'':'<div class="row"><button class="pri" onclick="stEdit=\'new\';render()">Добавить станцию</button></div>'}`;
}
function sfStationForm(){
 const r = stEdit==='new' ? {seq:(Math.max(0,...DB.station.map(s=>s.seq))+1),code:'',name:'',nameEn:'',always:false,note:''} : DB.station[stEdit];
 return `<div class="form"><h3>${stEdit==='new'?'Новая станция':'Изменение'}</h3>
  <div class="grid">
   <div><label>Порядок *</label><input id="sf_seq" type="number" min="1" step="1" value="${r.seq}"></div>
   <div><label>Код *</label><input id="sf_code" value="${esc(r.code)}"></div>
   <div><label>Название (RU) *</label><input id="sf_name" value="${esc(r.name)}"></div>
   <div><label>Название (EN)</label><input id="sf_nameEn" value="${esc(r.nameEn||'')}"></div>
   <div style="grid-column:1/-1"><label class="chk"><input type="checkbox" id="sf_always" ${r.always?'checked':''}> Проходится всегда</label>
    <div class="hint">«Всегда» — станция есть в маршруте любой детали: резка, готовность к отгрузке, отгрузка. Остальные включаются составом изделия.</div></div>
  </div>
  <div style="margin-top:12px"><label>Примечание</label><input id="sf_note" value="${esc(r.note||'')}"></div>
  <div class="err" id="e_sfStation"></div>
  <div class="row"><button class="pri" onclick="saveSfStation()">Сохранить</button><button onclick="stEdit=null;render()">Отмена</button></div></div>`;
}
function saveSfStation(){
 const e=document.getElementById('e_sfStation'); e.style.display='none';
 const seq=+document.getElementById('sf_seq').value;
 const code=document.getElementById('sf_code').value.trim().toUpperCase();
 const name=document.getElementById('sf_name').value.trim();
 if(!Number.isInteger(seq)||seq<=0) return fail(e,'Порядок: целое положительное число');
 if(!code||!name) return fail(e,'Код и название обязательны');
 if(!SF_CODE_RE.test(code)) return fail(e,'Код: только A–Z, 0–9, дефис и подчёркивание');
 if(DB.station.some((s,i)=>i!==stEdit && s.code===code)) return fail(e,'Такой код уже есть');
 const o={seq,code,name,nameEn:document.getElementById('sf_nameEn').value.trim(),
  always:document.getElementById('sf_always').checked,note:document.getElementById('sf_note').value.trim()};
 if(stEdit==='new') DB.station.push(o); else Object.assign(DB.station[stEdit],o);
 DB.station.sort((a,b)=>a.seq-b.seq);
 stEdit=null; touch(); render();
}
/* Станцию, на которую ссылаются операции, не удаляем: операция без станции —
   сирота, и увидит её только тот, кто откроет нужную вкладку. */
function delSfStation(i){
 const s=DB.station[i];
 if(DB.operation.some(o=>o.station===s.code)) return alert('Cannot delete — operations belong to this station');
 if(DB.workPosition.some(w=>w.station===s.code)) return alert('Cannot delete — work positions belong to this station');
 if(!confirm('Delete this station?'))return; DB.station.splice(i,1); touch(); render();
}

/* --- 2. Рабочие места ------------------------------------------------ */
let wpEdit=null;
function viewSfPositions(){
 const cards=DB.workPosition.map(w=>{
  const st=workPositionStations(w);
  const icon=w.code.indexOf('FURN')===0?'furnace':w.code.indexOf('CNC')===0?'cnc':w.station==='EDGE'?'edge':w.station==='CUT'?'cut':'factory';
  return `<div class="machine-card"><div class="machine-head"><div class="machine-ico">${ico(icon)}</div><div><b>${sfLabel(w)}</b><div class="code" data-raw>${esc(w.code)}</div></div></div>
   <div class="machine-meta">
    <div><span>Станции</span><strong>${st.length?st.map(esc).join(' · '):'—'}</strong></div>
    <div><span>Габарит</span><strong>${w.maxW?w.maxW+' × '+w.maxL+' in':'не замерен'}</strong></div>
    <div><span>Загрузка</span><strong>${w.batchMode==='batch'?'садка':'поштучно'}</strong></div>
    <div><span>Оператор</span><strong>${w.defaultOperator?raw(w.defaultOperator):'—'}${w.defaultHelper?' + '+raw(w.defaultHelper):''}</strong></div>
   </div></div>`;
 }).join('');
 const rows=DB.workPosition.map((w,i)=>{
  const st=workPositionStations(w);
  return `<tr><td class="mono"><b>${raw(w.code)}</b></td><td>${sfLabel(w)}</td>
   <td>${st.map(c=>`<span class="pill ${c===w.station?'info':''}" data-raw>${esc(c)}</span>`).join(' ')||'<span class="bad pill">нет станции</span>'}</td>
   <td>${(w.operations||[]).map(c=>`<span class="pill" data-raw>${esc(c)}</span>`).join(' ')||'<span class="mut">—</span>'}</td>
   <td class="mono">${w.maxW?w.maxW+' × '+w.maxL:'<span class="bad pill">не замерен</span>'}</td>
   <td>${w.batchMode==='batch'?'<span class="pill warn">садка</span>':'<span class="mut">поштучно</span>'}</td>
   <td class="mono">${w.defaultOperator?raw(w.defaultOperator):'<span class="mut">—</span>'}${w.defaultHelper?' <span class="mut">+</span> '+raw(w.defaultHelper):''}</td>
   <td class="mut" style="max-width:220px">${raw(w.note||'')}</td>
   <td style="white-space:nowrap"><button class="sm" onclick="wpEdit=${i};render()">Изменить</button>
   <button class="sm dl" onclick="delSfPosition(${i})">×</button></td></tr>`;
 }).join('');
 const noSize=workPositionsAwaitingSize();
 return `${wpEdit!==null?sfPositionForm():''}
  <div class="sub">Где делают. Габарит — рабочее ПОЛЕ, а не корпус станка: модель отвечает на вопрос «влезет ли деталь». Оператор и напарник — префилл экрана, а не закрепление человека за станком.</div>
  <div class="machine-grid">${cards}</div>
  ${noSize.length?`<div class="note" style="margin-top:12px"><span>Ждут замеров в цеху (${noSize.length}):</span> ${noSize.map(w=>`<b>${raw(w.code)}</b>`).join(', ')}<span>. Пока габарита нет, check_route_fits() этапа 7·2 работать не может. Замеры приезжают импортом WORK_POSITIONS.csv — правка кода для этого не нужна.</span></div>`:''}
  <div class="section-title" style="margin-top:18px"><h3>Точная таблица рабочих мест</h3><span class="mut" style="font-size:11px">CRUD сохранён</span></div>
  <table><thead><tr><th>Код</th><th>Название</th><th>Станции</th><th>Операции</th><th>Габарит, in</th><th>Загрузка</th><th>Оператор</th><th>Примечание</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="9" class="empty">пусто</td></tr>'}</tbody></table>
  ${wpEdit!==null?'':'<div class="row"><button class="pri" onclick="wpEdit=\'new\';render()">Добавить рабочее место</button></div>'}`;
}
function sfPositionForm(){
 const r = wpEdit==='new' ? {code:'',station:'',name:'',nameEn:'',kind:'machine',operations:[],defaultOperator:'',defaultHelper:'',maxW:'',maxL:'',batchMode:'single',note:''} : DB.workPosition[wpEdit];
 return `<div class="form"><h3>${wpEdit==='new'?'Новое рабочее место':'Изменение'}</h3>
  <div class="grid">
   <div><label>Код *</label><input id="wp_code" value="${esc(r.code)}"></div>
   <div><label>Домашняя станция *</label><select id="wp_station"><option value="">— выбери —</option>
    ${DB.station.map(s=>`<option value="${esc(s.code)}" ${s.code===r.station?'selected':''} data-raw>${esc(s.code)} — ${esc(sfName(s))}</option>`).join('')}</select></div>
   <div><label>Название (RU) *</label><input id="wp_name" value="${esc(r.name)}"></div>
   <div><label>Название (EN)</label><input id="wp_nameEn" value="${esc(r.nameEn||'')}"></div>
   <div><label>Тип места</label><select id="wp_kind"><option value="machine" ${r.kind==='machine'?'selected':''}>станок</option><option value="manual" ${r.kind==='manual'?'selected':''}>ручное место</option></select></div>
   <div><label>Загрузка</label><select id="wp_batch"><option value="single" ${r.batchMode==='single'?'selected':''}>поштучно</option><option value="batch" ${r.batchMode==='batch'?'selected':''}>садкой</option></select></div>
   <div style="grid-column:1/-1"><label>Операции</label>
    <div style="display:flex;flex-wrap:wrap;gap:8px 16px">${DB.operation.map(o=>`<label style="display:inline-flex;align-items:center;gap:6px;font-weight:400"><input type="checkbox" class="wp_op" value="${esc(o.code)}" ${(r.operations||[]).includes(o.code)?'checked':''}><span data-raw>${esc(o.code)} — ${esc(sfName(o))}</span></label>`).join('')}</div>
    <div class="hint">Список станций места выводится из его операций, отдельно его не задают. Поэтому ЧПУ с полировкой контура сам оказывается и на FAB, и на EDGE.</div></div>
   <div><label>Оператор по умолчанию</label><input id="wp_op1" value="${esc(r.defaultOperator||'')}"></div>
   <div><label>Напарник по умолчанию</label><input id="wp_op2" value="${esc(r.defaultHelper||'')}"></div>
   <div><label>Макс. ширина поля, in</label><input id="wp_maxW" type="number" min="0" step="any" value="${r.maxW??''}"></div>
   <div><label>Макс. длина поля, in</label><input id="wp_maxL" type="number" min="0" step="any" value="${r.maxL??''}"></div>
  </div>
  <div style="margin-top:12px"><label>Примечание</label><input id="wp_note" value="${esc(r.note||'')}"></div>
  <div class="err" id="e_sfPosition"></div>
  <div class="row"><button class="pri" onclick="saveSfPosition()">Сохранить</button><button onclick="wpEdit=null;render()">Отмена</button></div></div>`;
}
function saveSfPosition(){
 const e=document.getElementById('e_sfPosition'); e.style.display='none';
 const code=document.getElementById('wp_code').value.trim().toUpperCase();
 const station=document.getElementById('wp_station').value;
 const name=document.getElementById('wp_name').value.trim();
 if(!code||!name) return fail(e,'Код и название обязательны');
 if(!SF_CODE_RE.test(code)) return fail(e,'Код: только A–Z, 0–9, дефис и подчёркивание');
 if(!DB.station.some(s=>s.code===station)) return fail(e,'Выбери домашнюю станцию');
 if(DB.workPosition.some((w,i)=>i!==wpEdit && w.code===code)) return fail(e,'Такой код уже есть');
 const g=id=>{const v=document.getElementById(id).value; return v===''?null:+v;};
 const maxW=g('wp_maxW'),maxL=g('wp_maxL');
 if((maxW==null)!==(maxL==null))return fail(e,'Габарит заполняется парой: ширина и длина');
 if(maxW!=null&&(!(maxW>0)||!(maxL>0)))return fail(e,'Габариты рабочего места должны быть больше нуля');
 const o={code,station,name,nameEn:document.getElementById('wp_nameEn').value.trim(),
  kind:document.getElementById('wp_kind').value,batchMode:document.getElementById('wp_batch').value,
  operations:[...document.querySelectorAll('.wp_op:checked')].map(x=>x.value),
  defaultOperator:document.getElementById('wp_op1').value.trim(),
  defaultHelper:document.getElementById('wp_op2').value.trim(),
  maxW,maxL,note:document.getElementById('wp_note').value.trim()};
 if(wpEdit==='new') DB.workPosition.push(o); else Object.assign(DB.workPosition[wpEdit],o);
 wpEdit=null; touch(); render();
}
function delSfPosition(i){
 const w=DB.workPosition[i];
 if(DB.user.some(u=>u.workPosition===w.code)) return alert('Cannot delete — users are assigned to this work position');
 if(DB.terminal.some(t=>(t.workPositions||[]).includes(w.code))) return alert('Cannot delete — terminals are wired to this work position');
 if(!confirm('Delete this work position?'))return; DB.workPosition.splice(i,1); touch(); render();
}

/* --- 3. Операции ----------------------------------------------------- */
let opEdit=null;
function viewSfOperations(){
 const rows=DB.operation.map((o,i)=>{
  const wp=operationWorkPositions(o.code);
  return `<tr><td class="mono"><b>${raw(o.code)}</b></td><td>${sfLabel(o)}</td>
   <td>${o.station?`<span class="pill info" data-raw>${esc(o.station)}</span>`:'<span class="bad pill">нет станции</span>'}</td>
   <td><span class="pill ${o.stage==='any'?'':'info'}">${SF_STAGE_LABEL[o.stage]}</span></td>
   <td>${o.unit?`<span class="pill">${SF_UNIT_LABEL[o.unit]}</span>`:'<span class="warn pill">не задана</span>'}</td>
   <td>${wp.length?wp.map(w=>`<span class="pill" data-raw>${esc(w.code)}</span>`).join(' '):'<span class="warn pill">нет места</span>'}</td>
   <td class="mut" style="max-width:260px">${raw(o.note||'')}</td>
   <td style="white-space:nowrap"><button class="sm" onclick="opEdit=${i};render()">Изменить</button>
   <button class="sm dl" onclick="delSfOperation(${i})">×</button></td></tr>`;
 }).join('');
 const noUnit=DB.operation.filter(o=>!o.unit).length;
 return `${opEdit!==null?sfOperationForm():''}
  <div class="sub">Что именно делают. «До печи / после печи» — свойство ОПЕРАЦИИ, а не станции: на одном и том же ЧПУ отверстия обязаны быть до печи, а полировка ламината — после. Держи это на станке — и третий визит детали затрёт первый.</div>
  ${noUnit?`<div class="note" style="margin-bottom:12px"><b>Единица не задана у ${noUnit} операций.</b> <span>Её не подставляли по догадке: на единице стоит цена, а выдуманная единица тише и опаснее пустой — в неё верят. Заполняется вместе с прайсом на этапе 6.</span></div>`:''}
  <table><thead><tr><th>Код</th><th>Название</th><th>Станция</th><th>Момент</th><th>Единица</th><th>Рабочие места</th><th>Примечание</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="8" class="empty">пусто</td></tr>'}</tbody></table>
  ${opEdit!==null?'':'<div class="row"><button class="pri" onclick="opEdit=\'new\';render()">Добавить операцию</button></div>'}`;
}
function sfOperationForm(){
 const r = opEdit==='new' ? {code:'',station:'',name:'',nameEn:'',stage:'any',unit:null,note:''} : DB.operation[opEdit];
 return `<div class="form"><h3>${opEdit==='new'?'Новая операция':'Изменение'}</h3>
  <div class="grid">
   <div><label>Код *</label><input id="op_code" value="${esc(r.code)}" placeholder="cnc_shape_polish"></div>
   <div><label>Станция *</label><select id="op_station"><option value="">— выбери —</option>
    ${DB.station.map(s=>`<option value="${esc(s.code)}" ${s.code===r.station?'selected':''} data-raw>${esc(s.code)} — ${esc(sfName(s))}</option>`).join('')}</select></div>
   <div><label>Название (RU) *</label><input id="op_name" value="${esc(r.name)}"></div>
   <div><label>Название (EN)</label><input id="op_nameEn" value="${esc(r.nameEn||'')}"></div>
   <div><label>Момент маршрута</label><select id="op_stage">${SF_STAGES.map(x=>`<option value="${x}" ${x===r.stage?'selected':''}>${SF_STAGE_LABEL[x]}</option>`).join('')}</select></div>
   <div><label>Единица</label><select id="op_unit"><option value="">— не задана —</option>${SF_UNITS.map(x=>`<option value="${x}" ${x===r.unit?'selected':''}>${SF_UNIT_LABEL[x]}</option>`).join('')}</select></div>
  </div>
  <div style="margin-top:12px"><label>Примечание</label><input id="op_note" value="${esc(r.note||'')}"></div>
  <div class="err" id="e_sfOperation"></div>
  <div class="row"><button class="pri" onclick="saveSfOperation()">Сохранить</button><button onclick="opEdit=null;render()">Отмена</button></div></div>`;
}
function saveSfOperation(){
 const e=document.getElementById('e_sfOperation'); e.style.display='none';
 const code=document.getElementById('op_code').value.trim().toLowerCase();
 const station=document.getElementById('op_station').value;
 const name=document.getElementById('op_name').value.trim();
 if(!code||!name) return fail(e,'Код и название обязательны');
 if(!SF_OP_CODE_RE.test(code)) return fail(e,'Код операции: строчные латинские буквы, цифры и подчёркивание');
 if(!DB.station.some(s=>s.code===station)) return fail(e,'Выбери станцию');
 if(DB.operation.some((o,i)=>i!==opEdit && o.code===code)) return fail(e,'Такой код уже есть');
 const unit=document.getElementById('op_unit').value;
 const o={code,station,name,nameEn:document.getElementById('op_nameEn').value.trim(),
  stage:document.getElementById('op_stage').value,unit:unit||null,
  note:document.getElementById('op_note').value.trim()};
 if(opEdit==='new') DB.operation.push(o);
 else{
  /* Смена кода раньше молча осиротляла рабочие места: удалить операцию со
     ссылками нельзя, а переименовать было можно — и место ссылалось в пустоту.
     Тянем ссылки за операцией. */
  const was=DB.operation[opEdit].code;
  Object.assign(DB.operation[opEdit],o);
  if(was!==code) DB.workPosition.forEach(w=>{w.operations=(w.operations||[]).map(c=>c===was?code:c);});
 }
 opEdit=null; touch(); render();
}
function delSfOperation(i){
 const o=DB.operation[i];
 if(DB.workPosition.some(w=>(w.operations||[]).includes(o.code))) return alert('Cannot delete — work positions perform this operation');
 if(!confirm('Delete this operation?'))return; DB.operation.splice(i,1); touch(); render();
}

/* --- 4. Терминалы ---------------------------------------------------- */
let tmEdit=null;
function viewSfTerminals(){
 const rows=DB.terminal.map((t,i)=>{
  const st=terminalStations(t);
  return `<tr><td class="mono"><b>${raw(t.code)}</b></td><td>${sfLabel(t)}</td>
   <td>${(t.workPositions||[]).map(c=>`<span class="pill" data-raw>${esc(c)}</span>`).join(' ')||'<span class="warn pill">мест нет</span>'}</td>
   <td>${st.map(c=>`<span class="pill info" data-raw>${esc(c)}</span>`).join(' ')||'<span class="mut">—</span>'}</td>
   <td class="mut" style="max-width:260px">${raw(t.note||'')}</td>
   <td style="white-space:nowrap"><button class="sm" onclick="tmEdit=${i};render()">Изменить</button>
   <button class="sm dl" onclick="delSfTerminal(${i})">×</button></td></tr>`;
 }).join('');
 return `${tmEdit!==null?sfTerminalForm():''}
  <div class="sub">Экран сканирования. Терминал читает и пишет, но ничего не определяет: ключом шага маршрута он не бывает никогда. Оператор сканирует стикер — экран показывает открытые операции ЭТОЙ детали для ЭТОГО места, все отмечены заранее, он снимает галочку с того, чего не делал.</div>
  <div class="note" style="margin-bottom:12px">Именно здесь закрывается самый дорогой дефект Spil: закрыть операцию, которой нет в маршруте детали, физически невозможно — на экране её просто нет. Случай «CNC показал петли выполненными, хотя их не делали» не может возникнуть в принципе.</div>
  <table><thead><tr><th>Код</th><th>Название</th><th>Рабочие места</th><th>Станции, которые закрывает</th><th>Примечание</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="6" class="empty">Список пуст, и это честное состояние. Сколько экранов стоит в цеху и какие места висят на каждом — ещё не называли. Засеять «по одному на станцию» значило бы повторить болезнь подстанций Spil: справочник, распухший выдуманными строками.</td></tr>'}</tbody></table>
  ${tmEdit!==null?'':'<div class="row"><button class="pri" onclick="tmEdit=\'new\';render()">Добавить терминал</button></div>'}`;
}
function sfTerminalForm(){
 const r = tmEdit==='new' ? {code:'',name:'',nameEn:'',workPositions:[],note:''} : DB.terminal[tmEdit];
 return `<div class="form"><h3>${tmEdit==='new'?'Новый терминал':'Изменение'}</h3>
  <div class="grid">
   <div><label>Код *</label><input id="tm_code" value="${esc(r.code)}"></div>
   <div><label>Название (RU) *</label><input id="tm_name" value="${esc(r.name)}"></div>
   <div><label>Название (EN)</label><input id="tm_nameEn" value="${esc(r.nameEn||'')}"></div>
  </div>
  <div style="margin-top:12px"><label>Рабочие места на этом экране</label>
   <div style="display:flex;flex-wrap:wrap;gap:8px 16px">${DB.workPosition.map(w=>`<label style="display:inline-flex;align-items:center;gap:6px;font-weight:400"><input type="checkbox" class="tm_wp" value="${esc(w.code)}" ${(r.workPositions||[]).includes(w.code)?'checked':''}><span data-raw>${esc(w.code)} — ${esc(sfName(w))}</span></label>`).join('')}</div>
   <div class="hint">Один экран обслуживает несколько мест — переключать его оператор не будет, и это условие задачи, а не то, что надо чинить.</div></div>
  <div style="margin-top:12px"><label>Примечание</label><input id="tm_note" value="${esc(r.note||'')}"></div>
  <div class="err" id="e_sfTerminal"></div>
  <div class="row"><button class="pri" onclick="saveSfTerminal()">Сохранить</button><button onclick="tmEdit=null;render()">Отмена</button></div></div>`;
}
function saveSfTerminal(){
 const e=document.getElementById('e_sfTerminal'); e.style.display='none';
 const code=document.getElementById('tm_code').value.trim().toUpperCase();
 const name=document.getElementById('tm_name').value.trim();
 if(!code||!name) return fail(e,'Код и название обязательны');
 if(!SF_CODE_RE.test(code)) return fail(e,'Код: только A–Z, 0–9, дефис и подчёркивание');
 if(DB.terminal.some((t,i)=>i!==tmEdit && t.code===code)) return fail(e,'Такой код уже есть');
 const o={code,name,nameEn:document.getElementById('tm_nameEn').value.trim(),
  workPositions:[...document.querySelectorAll('.tm_wp:checked')].map(x=>x.value),
  note:document.getElementById('tm_note').value.trim()};
 if(tmEdit==='new') DB.terminal.push(o); else Object.assign(DB.terminal[tmEdit],o);
 tmEdit=null; touch(); render();
}
function delSfTerminal(i){
 if(!confirm('Delete this terminal?'))return; DB.terminal.splice(i,1); touch(); render();
}

/* --- 5. Импорт двух файлов под заполнение ---------------------------- */
let sfImportReport=null;
function sfImportCard(){
 const which=subtab==='stations'?'STATIONS.csv':'WORK_POSITIONS.csv';
 return `<div class="card">
  <div class="section-title"><h3>Загрузить ${which}</h3><span class="pill info">слияние по коду</span></div>
  <div class="sub">Файл обновляет строки с теми же кодами и добавляет новые. Строки, которых в файле нет, остаются на месте и перечисляются в отчёте — чужой файл не сносит то, что завели руками.</div>
  <div class="row"><button onclick="document.getElementById('sfCsv').click()">Выбрать файл</button>
   <input type="file" id="sfCsv" accept=".csv,.txt" style="display:none" onchange="sfImportCsv(this,'${subtab}')"></div>
  ${sfImportReport&&sfImportReport.which===subtab?sfReportHTML(sfImportReport.rep):''}</div>`;
}
function sfReportHTML(rep){
 const rejected=rep.rejected.map(r=>`<tr><td class="mono">${r.line?r.line:'—'}</td><td class="mono" data-raw>${esc(r.code)}</td><td>${esc(r.why)}</td></tr>`).join('');
 return `<div class="note" style="margin-top:12px">
   <b>Принято строк: ${rep.accepted}</b> — новых ${rep.added}, обновлено ${rep.updated}. Отклонено: ${rep.rejected.length}.
   ${rep.missing.length?`<div style="margin-top:6px">В файле не было, оставлены как есть: ${rep.missing.map(c=>`<b>${esc(c)}</b>`).join(', ')}.</div>`:''}
  </div>
  ${rejected?`<table style="margin-top:10px"><thead><tr><th>Строка</th><th>Код</th><th>Почему отклонена</th></tr></thead><tbody>${rejected}</tbody></table>`:''}`;
}
function sfImportCsv(inp,which){
 const f=inp.files[0]; inp.value='';
 if(!f) return;
 if(f.size>2*1024*1024){alert('File not readable: CSV exceeds 2 MB.');return;}
 const r=new FileReader();
 r.onload=()=>{
  try{
   /* отчёт принадлежит той таблице, в которую грузили: иначе он остаётся
      висеть на соседней вкладке и относится там уже не к тем строкам */
   sfImportReport = {which:which, rep: which==='stations' ? importStationsCsv(r.result) : importWorkPositionsCsv(r.result)};
   touch(); render();
  }catch(e){ alert('File not readable: '+e.message); }
 };
 r.readAsText(f);
}
