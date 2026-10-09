/* =====================================================================
   view/charts  ·  charts-1.0
   Графики Glass Farm без библиотек: файл офлайновый, один HTML. Полосы по
   категориям, столбики по времени, плитка с числом. Разметка — HTML, вид и
   цвета — styles/reports.css, только токены темы: светлая и тёмная тема
   работают сами.
   Правила (как в dataviz): полоса не толще 24 px, скругление 4 px только
   на конце значения; число стоит у конца полосы, у столбиков — только у
   самого большого и у выделенного, остальное — в подсказке наведения;
   текст — цветом текста, не цветом данных.
   IN : [{label, value, …}]
   OUT: html
   Правило: файл не знает про заказы и станции. Только вход→выход.
   ===================================================================== */

function chNum(v,digits){
 const n=+v||0;
 return n.toLocaleString('en-US',{maximumFractionDigits:digits==null?(Math.abs(n)<10&&n%1?1:0):digits});
}
/* Плитка: подпись, число, строка под ним. */
function chartStat(label,value,sub,attrs){
 return `<div class="ch-stat"${attrs||''}><span>${esc(label)}</span><b>${value}</b>${sub?`<small>${sub}</small>`:''}</div>`;
}
/* Полосы рядом в одной таблице: строка — категория, колонки — разные меры
   со своим масштабом (ждёт · сделано сегодня). Одна ось на колонку, двух
   шкал в одной полосе нет.
   rows: [{label|labelHTML, on, cells:{k:число}, notes:{k:html}, attrs}]
   cols: [{k, label, fmt}] */
function chartBarGrid(rows,cols){
 const max={};cols.forEach(c=>{max[c.k]=Math.max(0,...rows.map(r=>+(r.cells[c.k])||0));});
 const head=`<div class="ch-grid-row ch-grid-head"><span></span>${cols.map(c=>`<span>${esc(c.label)}</span>`).join('')}</div>`;
 const body=rows.map(r=>`<div class="ch-grid-row${r.on?' on':''}${cols.every(c=>!(+r.cells[c.k]))?' zero':''}"${r.attrs||''}><span class="ch-grid-label">${r.labelHTML||esc(r.label)}</span>${cols.map(c=>{
  const raw=r.cells[c.k],v=+raw||0,w=max[c.k]?Math.max(v?2:0,Math.round(v/max[c.k]*100)):0,txt=raw==null?'':(c.fmt?c.fmt(v):chNum(v)),note=r.notes&&r.notes[c.k]||'';
  return `<span class="ch-grid-cell" title="${esc((r.label||'')+' · '+c.label+': '+txt)}">${raw==null?'<em class="ch-none">—</em>':`<span class="ch-track"><i style="width:${w}%"></i></span><b>${esc(txt)}</b>`}${note?`<small>${note}</small>`:''}</span>`;
 }).join('')}</div>`).join('');
 return `<div class="ch-grid" style="--ch-cols:${cols.length}">${head}${body}</div>`;
}
/* Столбики по времени. points: [{label, value, title, on, tick}] — tick
   ставит подпись под столбиком (каждый третий час, а не все 24). */
function chartColumns(points,opts){
 opts=opts||{};
 const max=Math.max(0,...points.map(p=>+p.value||0)),top=points.reduce((b,p,i)=>(+p.value||0)>(+points[b].value||0)?i:b,0);
 const cols=points.map((p,i)=>{
  const v=+p.value||0,h=max?Math.max(v?3:0,Math.round(v/max*100)):0,show=v>0&&(i===top||p.on);
  return `<span class="ch-col${p.on?' on':''}" title="${esc(p.title||p.label+': '+chNum(v))}"><span class="ch-col-bar">${show?`<b>${esc(opts.fmt?opts.fmt(v):chNum(v))}</b>`:''}<i style="height:${h}%"></i></span><em>${p.tick===false?'':esc(p.label)}</em></span>`;
 }).join('');
 return `<div class="ch-cols" role="img" aria-label="${esc(opts.label||'')}">${cols}</div>`;
}
