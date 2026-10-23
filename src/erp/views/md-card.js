/* =====================================================================
   view/md-card  ·  md-card-1.0
   Карточка Data в виде из плана Master Data («Как будет выглядеть
   карточка»; владелец, 23.10.2026: «доделай до конца»): шапка — путь, имя,
   статус, код; вкладки слева; точка на вкладке, где чего-то не хватает.
   IN : описание карточки {form, crumb, title, status, code, tabs, foot}
   OUT: html

   Все вкладки лежат в странице, видна одна: Save читает поля со всех, а
   переключение вкладки не перерисовывает экран и не теряет набранное.
   Маленькие карточки (газ, герметик) остаются одной формой — вкладки там
   только прятали бы поля.
   ===================================================================== */
const mdCardOpen={};
function mdCardHTML(o){
 const tabs=(o.tabs||[]).filter(Boolean);
 let on=mdCardOpen[o.form];if(!tabs.some(t=>t.k===on))on=tabs.length?tabs[0].k:'';
 const head=`<div class="md-card-head"><div class="md-card-title"><span class="md-crumb">${(o.crumb||[]).map(esc).join(' › ')}</span><h3>${o.title}</h3></div>
  ${o.status?`<span class="pill ${o.status[1]||''}">${esc(o.status[0])}</span>`:''}${o.code?`<span class="mono md-card-code">${raw(o.code)}</span>`:''}</div>`;
 /* Одна вкладка — маленькая карточка: без колонки вкладок. */
 if(tabs.length<2)return `<div class="md-card md-card-one" data-md-card="${o.form}">${head}<div class="md-card-panes">${tabs.length?tabs[0].html:''}</div><div class="md-card-foot">${o.foot||''}</div></div>`;
 const nav=tabs.map(t=>`<button type="button" role="tab" data-md-tab="${t.k}" class="${t.k===on?'on':''}" onclick="mdCardTab(this)">${esc(t.label)}${t.missing?'<span class="md-dot" title="Something missing"></span>':''}</button>`).join('');
 const panes=tabs.map(t=>`<div class="md-card-pane${t.k===on?' on':''}" role="tabpanel" data-md-pane="${t.k}">${t.html}</div>`).join('');
 return `<div class="md-card" data-md-card="${o.form}">${head}<div class="md-card-body"><div class="md-card-tabs" role="tablist">${nav}</div><div class="md-card-panes">${panes}</div></div><div class="md-card-foot">${o.foot||''}</div></div>`;
}
function mdCardTab(btn){
 const card=btn.closest('[data-md-card]');if(!card)return;
 const k=btn.getAttribute('data-md-tab');mdCardOpen[card.getAttribute('data-md-card')]=k;
 card.querySelectorAll('[data-md-tab]').forEach(b=>b.classList.toggle('on',b===btn));
 card.querySelectorAll('[data-md-pane]').forEach(p=>p.classList.toggle('on',p.getAttribute('data-md-pane')===k));
}
/* Поле карточки: подпись, ввод, короткая подсказка. */
function mdField(label,input,hint){return `<div><label>${label}</label>${input}${hint?`<div class="hint">${hint}</div>`:''}</div>`;}
/* Где айтем есть в прайсах клиентов: своя строка или строка его группы. */
function mdPriceListsHTML(target){
 const groups=(DB.itemGroup||[]).filter(g=>g.members.includes(target)),gIds=new Set(groups.map(g=>'group:'+g.id));
 const rows=[];
 (DB.priceList||[]).forEach(l=>l.rows.forEach(r=>{if(r.target!==target&&!gIds.has(r.target))return;
  const c=l.kind==='customer'?(DB.customer||[]).find(x=>x.id===l.customerId):null;
  rows.push(`<tr><td>${l.kind==='customer'?'Personal · '+raw(c?(c.displayName||c.legalName||c.code||c.id):l.customerId):'Group · '+raw(l.name||'Unnamed')}</td><td>${r.target===target?'This item':'Item group · '+raw((itemGroupById(r.target.slice(6))||{}).name||'')}</td><td class="n mono">${esc(priceListRowText(r,v=>Number(v).toFixed(2)))||'<span class="mut">empty</span>'}</td></tr>`);}));
 return `<h4>Customer price lists</h4>${rows.length?`<div class="sales-table-wrap"><table class="ncr-table" data-md-card-lists><thead><tr><th>List</th><th>Row</th><th class="n">Price</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`:'<p class="mut" data-md-card-lists>In no customer list. Edited in Prices.</p>'}`;
}
