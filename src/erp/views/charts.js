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
/* Столбики по времени. points: [{label, value, title, on, tick, attrs,
   parts}] — tick ставит подпись под столбиком (каждый третий час, а не все
   24); parts — разбивка столбика цветом [{value, cls}] снизу вверх, cls —
   ch-s1…ch-s8 (серии по порядку) или ch-so («Other»); attrs — нажатие. */
function chartColumns(points,opts){
 opts=opts||{};
 const max=Math.max(0,...points.map(p=>+p.value||0)),top=points.reduce((b,p,i)=>(+p.value||0)>(+points[b].value||0)?i:b,0);
 const cols=points.map((p,i)=>{
  const v=+p.value||0,h=max?Math.max(v?3:0,Math.round(v/max*100)):0,show=v>0&&(i===top||p.on);
  const bar=p.parts?`<span class="ch-stack" style="height:${h}%">${p.parts.filter(x=>x.value>0).map(x=>`<i class="${x.cls}" style="flex:${x.value} 1 0"></i>`).join('')}</span>`:`<i style="height:${h}%"></i>`;
  return `<span class="ch-col${p.on?' on':''}" title="${esc(p.title||p.label+': '+chNum(v))}"${p.attrs||''}><span class="ch-col-bar">${show?`<b>${esc(opts.fmt?opts.fmt(v):chNum(v))}</b>`:''}${bar}</span><em>${p.tick===false?'':esc(p.label)}</em></span>`;
 }).join('');
 return `<div class="ch-cols" role="img" aria-label="${esc(opts.label||'')}">${cols}</div>`;
}
/* Легенда разбивки: цветной квадрат и подпись цветом текста. */
function chartLegend(items){
 return `<div class="ch-legend">${items.map(x=>`<span><i class="${x.cls}"></i><span data-raw>${esc(x.label)}</span></span>`).join('')}</div>`;
}
/* Круглая верхняя граница шкалы: 37 → 40, 1 840 → 2 000. */
function chNice(v){if(!(v>0))return 1;const p=Math.pow(10,Math.floor(Math.log10(v))),f=v/p;return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p;}
/* Полосы по категориям, с разбивкой цветом или без. rows: [{label, value,
   parts:[{value, cls}], attrs, title}] — attrs — нажатие. */
function chartHBars(rows,opts){
 opts=opts||{};const max=Math.max(0,...rows.map(r=>+r.value||0)),fmt=opts.fmt||(v=>chNum(v));
 return `<div class="ch-hbars" role="img" aria-label="${esc(opts.label||'')}">${rows.map(r=>{
  const v=+r.value||0,w=max?Math.max(v?2:0,v/max*100):0;
  const bar=r.parts?`<span class="ch-hstack" style="width:${w}%">${r.parts.filter(x=>x.value>0).map(x=>`<i class="${x.cls}" style="flex:${x.value} 1 0"></i>`).join('')}</span>`:`<i style="width:${w}%"></i>`;
  return `<div class="ch-hbar" title="${esc(r.title||r.label+': '+fmt(v))}"${r.attrs||''}><span class="ch-hbar-label" data-raw>${esc(r.label)}</span><span class="ch-track">${bar}</span><b>${esc(fmt(v))}</b></div>`;
 }).join('')}</div>`;
}
/* Линия по времени. series: [{label, cls, values, dashed}] — пунктир для
   периода сравнения. Шкала одна, от нуля; подписи осей — цветом текста. */
function chartLine(labels,series,opts){
 opts=opts||{};const W=720,H=220,L=52,R=14,T=14,B=28,n=labels.length,fmt=opts.fmt||(v=>chNum(v));
 const max=chNice(Math.max(0,...series.flatMap(s=>s.values.filter(v=>v!=null).map(Number))));
 const x=i=>L+(n<=1?(W-L-R)/2:i*(W-L-R)/(n-1)),y=v=>T+(1-(+v||0)/max)*(H-T-B),every=Math.max(1,Math.ceil(n/12));
 const grid=[0,.5,1].map(f=>`<line class="ch-gl" x1="${L}" x2="${W-R}" y1="${y(max*f)}" y2="${y(max*f)}"/><text class="ch-yt" x="${L-8}" y="${y(max*f)+4}" text-anchor="end">${esc(fmt(max*f))}</text>`).join('');
 const xs=labels.map((l,i)=>i%every===0?`<text class="ch-xt" x="${x(i)}" y="${H-8}" text-anchor="middle">${esc(l)}</text>`:'').join('');
 const lines=series.map(s=>`<polyline class="ch-l ${s.cls}${s.dashed?' ch-dash':''}" points="${s.values.map((v,i)=>x(i).toFixed(1)+','+y(v).toFixed(1)).join(' ')}"/>`+(s.dashed?'':s.values.map((v,i)=>`<circle class="ch-pt ${s.cls}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4"><title>${esc(s.label+' · '+labels[i]+': '+fmt(+v||0))}</title></circle>`).join(''))).join('');
 return `<svg class="ch-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label||'')}">${grid}${xs}${lines}</svg>`;
}
/* Круг (кольцо): доля частей; посередине — итог. Частей до восьми. */
function chartPie(parts,opts){
 opts=opts||{};const fmt=opts.fmt||(v=>chNum(v)),shown=parts.filter(p=>+p.value>0),total=shown.reduce((n,p)=>n+(+p.value),0);
 if(!total)return '';
 let off=25;
 const segs=shown.map(p=>{const pct=p.value/total*100,len=shown.length>1?Math.max(0,pct-0.8):pct,s=`<circle class="ch-seg ${p.cls}" cx="21" cy="21" r="15.9155" stroke-dasharray="${len.toFixed(2)} ${(100-len).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"${p.attrs||''}><title>${esc(p.label+': '+fmt(p.value)+' · '+Math.round(pct)+'%')}</title></circle>`;off=(off-pct+100)%100;return s;}).join('');
 const legend=shown.map(p=>`<span${p.attrs||''}><i class="${p.cls}"></i><span data-raw>${esc(p.label)}</span><b>${esc(fmt(p.value))}</b><small>${Math.round(p.value/total*100)}%</small></span>`).join('');
 return `<div class="ch-pie"><svg viewBox="0 0 42 42" role="img" aria-label="${esc(opts.label||'')}">${segs}<text x="21" y="22.6" text-anchor="middle" class="ch-pie-total">${esc(fmt(total))}</text></svg><div class="ch-legend ch-pie-legend">${legend}</div></div>`;
}
