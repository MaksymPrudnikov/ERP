/* =====================================================================
   erp/views/surround-ui  ·  surround-ui-1.0
   Data → Materials → IGU assembly: рецепты обвязки и справочник систем
   рамок (этап 3 плана Master Data). Правка сразу в таблице, как Weight
   norms: каждое поле пишется на change и попадает в журнал Master Data.
   IN : DB.surroundRecipe, spacerSystem, spacerVariant, iguPart,
        sealantProduct (erp/masterdata/surround)
   OUT: viewMdRecipes, mdSpacerSystemsTable и их обработчики
   ===================================================================== */
function mdRecipeUsers(id){return (DB.spacerVariant||[]).filter(sp=>sp&&sp.recipeId===id);}
function mdRecipePartOptions(value){
 const opt=(v,l)=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(l)}</option>`;
 let html=Object.keys(SURROUND_SLOTS).map(k=>opt(k,SURROUND_SLOTS[k]+' of the cavity')).join('');
 SURROUND_PART_TABLES.forEach(t=>(DB[t]||[]).forEach(x=>{if(x&&x.id)html+=opt(t+':'+x.id,x.name||x.id);}));
 if(value&&!surroundPartValid(value)||value&&value.indexOf(':')>0&&!mdById(value.slice(0,value.indexOf(':')),value.slice(value.indexOf(':')+1)))html+=opt(value,'Removed · '+value);
 return html;
}
function viewMdRecipes(){
 const recipes=DB.surroundRecipe||[];
 return `<div class="sub">A surround recipe lists the parts of one cavity and how much of each goes in: grams per ft² of the unit, per metre or foot of perimeter, or per cavity. Spacer weight comes from the spacer card, gas weight from its density. Waste raises consumption, not the shipping weight. Empty norm — unknown.</div>
  ${recipes.map(mdRecipeCard).join('')||'<div class="empty">No recipes yet</div>'}
  <div class="row"><button class="pri" onclick="mdRecipeNew()">+ New recipe</button></div>`;
}
function mdRecipeCard(r){
 const users=mdRecipeUsers(r.id),fixed=p=>p==='spacer'||p==='gas';
 const missing=r.rows.filter(x=>!fixed(x.part)&&x.amount==null).length;
 const cell=(x,i)=>fixed(x.part)
  ?`<td colspan="2" class="mut">${x.part==='spacer'?'Weight from the spacer card':'Density from the gas card × cavity volume'}</td>`
  :`<td><input type="number" min="0" step="any" style="width:90px" value="${x.amount==null?'':x.amount}" placeholder="unknown" onchange="mdRecipeRowSet('${esc(r.id)}',${i},'amount',this.value)"></td>
    <td><select onchange="mdRecipeRowSet('${esc(r.id)}',${i},'per',this.value)">${Object.keys(SURROUND_PER).map(k=>`<option value="${k}" ${k===x.per?'selected':''}>${esc(SURROUND_PER[k])}</option>`).join('')}</select></td>`;
 return `<div class="card" data-recipe="${esc(r.id)}" style="margin:12px 0">
  <div class="grid">
   <div><label>Recipe name</label><input value="${esc(r.name)}" onchange="mdRecipeSet('${esc(r.id)}','name',this.value)"></div>
   <div><label>PIB per side, mm</label><input type="number" min="0" step="any" value="${r.pibPerSideMm==null?'':r.pibPerSideMm}" placeholder="unknown" onchange="mdRecipeSet('${esc(r.id)}','pibPerSideMm',this.value)"><div class="hint">Adds to unit thickness on both sides of the spacer.</div></div>
   <div><label>Used by</label><div>${users.length} spacer${users.length===1?'':'s'}${missing?` <span class="pill warn">${missing} without norm</span>`:''}</div></div>
  </div>
  <div class="customer-table-wrap"><table><thead><tr><th>Part</th><th>Norm, g</th><th>Per</th><th>Waste, %</th><th></th></tr></thead><tbody>
  ${r.rows.map((x,i)=>`<tr><td><select onchange="mdRecipeRowSet('${esc(r.id)}',${i},'part',this.value)">${mdRecipePartOptions(x.part)}</select></td>${cell(x,i)}
   <td><input type="number" min="0" step="any" style="width:70px" value="${x.wastePct==null?'':x.wastePct}" placeholder="0" onchange="mdRecipeRowSet('${esc(r.id)}',${i},'wastePct',this.value)"></td>
   <td><button class="sm dl" onclick="mdRecipeRowDelete('${esc(r.id)}',${i})">×</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">no parts</td></tr>'}
  </tbody></table></div>
  <div class="row"><button class="sm" onclick="mdRecipeRowAdd('${esc(r.id)}')">+ Part</button><button class="sm dl" onclick="mdRecipeDelete('${esc(r.id)}')">Delete recipe</button></div>
 </div>`;
}
function mdRecipeNew(){
 const id=mdCatIdFrom('REC','','Recipe',DB.surroundRecipe||[]);
 DB.surroundRecipe.push(normalizeSurroundRecipe({id:id,name:'New recipe',pibPerSideMm:null,rows:[{id:'R1',part:'spacer'},{id:'R2',part:'primary',per:'m'},{id:'R3',part:'secondary',per:'ft2'},{id:'R4',part:'gas'}]}));
 touch();render();
}
/* Число: пусто — «неизвестно», мусор и минус не принимаются (поле вернётся). */
function mdRecipeNum(v){const t=String(v==null?'':v).trim();if(t==='')return null;const n=+t;return isFinite(n)&&n>=0?n:undefined;}
function mdRecipeSet(id,k,v){
 const r=surroundRecipeById(id);if(!r)return;
 if(k==='name')r.name=String(v||'').trim();
 else{const n=mdRecipeNum(v);if(n===undefined)return render();r[k]=n;}
 touch();render();
}
function mdRecipeRowSet(id,i,k,v){
 const r=surroundRecipeById(id),x=r&&r.rows[i];if(!x)return;
 if(k==='part'){if(!surroundPartValid(v))return render();x.part=v;}
 else if(k==='per'){if(!SURROUND_PER[v])return render();x.per=v;}
 else{const n=mdRecipeNum(v);if(n===undefined)return render();x[k]=n;}
 touch();render();
}
function mdRecipeRowAdd(id){
 const r=surroundRecipeById(id);if(!r)return;
 let n=r.rows.length+1;while(r.rows.some(x=>x.id==='R'+n))n++;
 r.rows.push({id:'R'+n,part:'primary',amount:null,per:'ft2',wastePct:null});touch();render();
}
function mdRecipeRowDelete(id,i){const r=surroundRecipeById(id);if(!r||!r.rows[i])return;r.rows.splice(i,1);touch();render();}
/* Удаление рецепта, на который ссылаются рамки, не запрещено: рамки остаются
   без рецепта, и Spacers покажет это счётчиком No recipe. */
function mdRecipeDelete(id){
 const n=mdRecipeUsers(id).length;
 if(!confirm(n?n+' spacer'+(n===1?' uses':'s use')+' this recipe. Delete anyway? They will have no recipe.':'Delete this recipe?'))return;
 DB.surroundRecipe=DB.surroundRecipe.filter(r=>r.id!==id);touch();render();
}

/* Справочник систем рамок: Swiss Spacer, Thermix и любые новые. Новая
   система пишется в карточку рамки по имени; переименование ведёт за собой
   рамки этой системы. */
function mdSpacerSystemsTable(){
 const rows=DB.spacerSystem||[],used=name=>(DB.spacerVariant||[]).filter(sp=>sp&&sp.system===name).length;
 return `<h4 style="margin-top:22px">Spacer systems</h4>
  <div class="customer-table-wrap"><table data-spacer-systems><thead><tr><th>Name</th><th>Code</th><th>Family</th><th>Spacers</th><th></th></tr></thead><tbody>
  ${rows.map(x=>`<tr><td><input value="${esc(x.name)}" onchange="mdSpacerSystemSet('${esc(x.id)}','name',this.value)"></td>
   <td><input style="width:80px" value="${esc(x.code)}" onchange="mdSpacerSystemSet('${esc(x.id)}','code',this.value)"></td>
   <td><input value="${esc(x.family)}" onchange="mdSpacerSystemSet('${esc(x.id)}','family',this.value)"></td>
   <td class="mono">${used(x.name)}</td><td><button class="sm dl" onclick="mdSpacerSystemDelete('${esc(x.id)}')">×</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">no systems</td></tr>'}
  </tbody></table></div>
  <div class="row"><button class="sm" onclick="mdSpacerSystemNew()">+ New system</button></div>`;
}
function mdSpacerSystemNew(){
 const id=mdCatIdFrom('SYS','','System',DB.spacerSystem||[]);
 DB.spacerSystem.push({id:id,code:'',name:'New system',family:''});touch();render();
}
function mdSpacerSystemSet(id,k,v){
 const x=(DB.spacerSystem||[]).find(s=>s.id===id);if(!x)return;
 const t=String(v||'').trim();
 if(k==='name'){
  if(!t)return render();
  if((DB.spacerSystem||[]).some(s=>s.id!==id&&s.name===t)){alert('A system with this name already exists.');return render();}
  (DB.spacerVariant||[]).forEach(sp=>{if(sp.system===x.name){if(sp.name===x.name+' '+sp.size+'″')sp.name=t+' '+sp.size+'″';sp.system=t;}});
  x.name=t;
 }else x[k]=k==='code'?t.toUpperCase():t;
 touch();render();
}
function mdSpacerSystemDelete(id){
 const x=(DB.spacerSystem||[]).find(s=>s.id===id);if(!x)return;
 const n=(DB.spacerVariant||[]).filter(sp=>sp.system===x.name).length;
 if(!confirm(n?n+' spacer'+(n===1?' is':'s are')+' in this system. Delete it anyway? They keep the name but leave the list.':'Delete this system?'))return;
 DB.spacerSystem=DB.spacerSystem.filter(s=>s.id!==id);touch();render();
}
