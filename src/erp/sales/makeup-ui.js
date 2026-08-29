/* =====================================================================
   erp/sales/makeup-ui · sales-0.3b-makeup
   Compact UX for order-scoped IGU Makeups. Visual reference: IGU Builder;
   data model remains ERP-native and uses Master Data IDs.
   ===================================================================== */

function salesOption(value,label,selected,rawText){return `<option ${rawText?'data-raw':''} value="${esc(value)}" ${selected===value?'selected':''}>${esc(label)}</option>`;}
function salesUnique(arr){return [...new Set(arr.filter(x=>x!==''&&x!=null))];}
function salesManufacturers(){return salesUnique(activeGlassProducts().map(x=>x.manufacturer)).sort();}
function salesThicknessesFor(p){return salesUnique(activeGlassProducts().filter(x=>!p.manufacturer||x.manufacturer===p.manufacturer).map(x=>x.thicknessMm)).sort((a,b)=>a-b);}
function salesBaseGlassCandidates(p){return activeGlassProducts().filter(g=>(!p.manufacturer||g.manufacturer===p.manufacturer)&&(!p.thicknessMm||g.thicknessMm===+p.thicknessMm)&&g.coatingFamily==='uncoated');}
/* Позиция без галочки склада помечается прямо в списке выбора, но из него не
   выпадает: заказать можно и то, чего у нас нет. Строка помечена data-raw и
   собирается заново на каждом переключении языка, поэтому пометка приезжает
   уже на нужном языке, а имя товара переводчик не трогает. */
/* Короткого кода в списке НЕТ намеренно: он уже стоит в шапке Lite и в коде
   makeup, а в строке выбора только мешает читать имя. */
function salesGlassProductOptions(rows,selected){return `<option value="">— select —</option>`+rows.map(g=>salesOption(g.id,g.name+(glassIsPreorder(g)?' · '+glassLabel('stock','preorder'):''),selected,true)).join('');}
/* --- Два шага выбора покрытого стекла --------------------------------
   Раньше шаг был один, и Vitro 6 мм Low-E выкатывал 92 строки списком.
   Теперь как у самого поставщика: сначала покрытие, потом на каком стекле. */
function salesGlassCoatings(p){
 const seen=Object.create(null),out=[];
 salesGlassCandidates(p).forEach(g=>{const c=glassCoatingName(g);if(c&&!seen[c]){seen[c]=true;out.push(c);}});
 return out.sort((a,b)=>a.localeCompare(b));
}
function salesGlassVariants(p,coating){return salesGlassCandidates(p).filter(g=>glassCoatingName(g)===coating);}
function salesCurrentCoating(p){return glassCoatingName(glassProductById(p.glassProductId));}
/* Подпись варианта — базовое стекло. Пара по закалке («Solarban 60 on Clear»
   заведена и закаливаемой, и незакаливаемой) иначе выглядела бы двумя
   одинаковыми строками, поэтому гейт печи стоит прямо в подписи. */
function salesGlassVariantLabel(g){
 const bits=[glassBaseName(g)];
 if(glassNeedsFurnace(g))bits.push(glassLabel('temperMode','temper_required'));
 else if(glassBannedFromFurnace(g))bits.push(glassLabel('temperMode','annealed_only'));
 if(glassIsPreorder(g))bits.push(glassLabel('stock','preorder'));
 return bits.join(' · ');
}
function salesGlassVariantOptions(rows,selected){
 return `<option value="">— select —</option>`+rows.map(g=>salesOption(g.id,salesGlassVariantLabel(g),selected,true)).join('');
}
/* Что именно выбрано: подложка, покрытие, закалка и наличие. До этого в
   конфигураторе было видно одно имя, и разница между двумя соседними строками
   каталога — например закаливаемой и незакаливаемой версией одного покрытия —
   на экране не существовала. */
function salesGlassMeta(g){
 if(!g)return '';
 const facts=[glassLabel('substrate',g.substrate),glassLabel('coatingFamily',g.coatingFamily)];
 if(g.deposition)facts.push(glassLabel('deposition',g.deposition));
 if(g.thicknessMm!=null)facts.push(g.thicknessMm+' mm');
 const pills=[];
 if(glassNeedsFurnace(g))pills.push(`<span class="pill bad">${esc(glassLabel('temperMode','temper_required'))}</span>`);
 else if(glassBannedFromFurnace(g))pills.push(`<span class="pill warn">${esc(glassLabel('temperMode','annealed_only'))}</span>`);
 pills.push(g.stocked?`<span class="pill ok">${esc(glassLabel('stock','stocked'))}</span>`
  :`<span class="pill info">${esc(glassLabel('stock','preorder'))}</span>`);
 const lead=glassLeadTimeDays(g.code);
 if(!g.stocked&&lead!=null)pills.push(`<span class="pill" data-raw>${esc(lead)} d</span>`);
 if(g.exposureRule!=='any')pills.push(`<span class="pill info">${esc(glassLabel('exposureRule',g.exposureRule))}</span>`);
 return `<div class="mu-glass-meta"><span class="mut" data-raw>${esc(facts.join(' · '))}</span>${pills.join('')}</div>`;
}
/* Контейнер меты рендерится ВСЕГДА, даже пустой: иначе выбор стекла менял
   высоту ряда, и соседний Lite подпрыгивал. */
function salesGlassMetaFor(id){return salesGlassMeta(glassProductById(id))||'<div class="mu-glass-meta"></div>';}
function salesSimpleOptions(key,selected){return activeSimple(key).map(x=>salesOption(x.id,(x.code?x.code+' · ':'')+x.name,selected,true)).join('');}
function salesSecondarySealantOptions(selected){return activeSimple('sealantProduct').filter(x=>x.id!==SALES_PRIMARY_SEALANT_ID).map(x=>salesOption(x.id,(x.code?x.code+' · ':'')+x.name,selected,true)).join('');}
function salesSpacerSystemLabel(sp){
 const match=String(sp&&sp.id||'').match(/^SP-([A-Za-z0-9]+)-/),code=match&&match[1];
 return code?code+' — '+sp.system:sp.system;
}
function salesSurfaceSelector(label,index,value,handler){const nums=salesPaneSurfaces(index);return `<div class="mu-surface"><label>${label}</label><div class="mu-surface-buttons">${nums.map(n=>`<button type="button" class="${+value===n?'on':''}" onclick="${handler}(${n})">#${n}</button>`).join('')}</div></div>`;}
function salesPaneProductSummary(p,index){
 if(p.category==='laminated'){const a=glassProductById(p.laminated.outerGlassProductId),b=glassProductById(p.laminated.innerGlassProductId),il=mdById('interlayerProduct',p.laminated.interlayerProductId);return [a&&(a.code||a.name),il&&(il.code||il.name),b&&(b.code||b.name)].filter(Boolean).join(' + ')||'Laminated';}
 const g=glassProductById(p.glassProductId),ht=mdById('heatTreatment',p.heatTreatmentId),bits=[g?(g.code||g.name):'Glass'];
 if(p.category==='spandrel'){bits.push('Spandrel'+(p.spandrel.color?' '+p.spandrel.color:''));if(p.spandrel.surface)bits.push('#'+p.spandrel.surface);}
 else if(p.visionType==='frit'){bits.push('Frit'+(p.frit.color?' '+p.frit.color:''));if(p.frit.surface)bits.push('#'+p.frit.surface);}
 else if(p.visionType==='lowe'||p.visionType==='reflective'){bits.push(salesVisionTypeLabel(p.visionType));if(p.coatingSurface)bits.push('#'+p.coatingSurface);}
 if(ht&&ht.code!=='AN')bits.push(ht.code);return bits.join(' · ');
}

function salesAccordionToggle(el,key){
 if(!el)return;
 if(!el.open){if(soOpenSectionKey===key)soOpenSectionKey=null;return;}
 soOpenSectionKey=key;
 const stack=el.closest('.mu-stack');if(!stack)return;
 stack.querySelectorAll('details.mu-section[open]').forEach(x=>{if(x!==el)x.open=false;});
}
function salesCavitySummary(c){
 const sp=mdById('spacerVariant',c.spacerVariantId),gas=mdById('gasProduct',c.gasProductId),sec=mdById('sealantProduct',c.secondarySealantId);
 const bits=[sp?sp.name:'Spacer',gas?gas.name:'Gas'];if(sec)bits.push(sec.code||sec.name);return bits.join(' · ');
}
function salesMakeupTabs(){
 const selected=salesCurrentMakeup();return `<div class="mu-strip"><div class="mu-strip-scroll">${soDraft.makeups.map(m=>`<button type="button" class="mu-tab ${selected&&selected.id===m.id?'on':''}" onclick="salesSelectMakeup('${esc(m.id)}')"><b>${esc(m.code)}</b><span>${esc(salesMakeupSummary(m))}</span></button>`).join('')}</div><button type="button" class="mu-add" onclick="salesAddMakeup()">+ Makeup</button></div>`;
}
function salesUnitTypeControl(m){return `<div class="mu-unit-row"><span>UNIT TYPE</span><div class="mu-segment">${[['single','Single Lite'],['double','Double'],['triple','Triple']].map(x=>`<button type="button" class="${m.unitType===x[0]?'on':''}" onclick="salesSetUnitType('${x[0]}')">${x[1]}</button>`).join('')}</div><div class="mu-total"><span>Overall</span><b>${salesMakeupThicknessMm(m)==null?'—':salesMakeupThicknessMm(m).toFixed(1)+' mm'}</b></div></div>`;}
function salesLiteCategoryTabs(p,index){return `<div class="mu-lite-tabs">${[['vision','Vision'],['spandrel','Spandrel'],['laminated','Laminated']].map(x=>`<button type="button" class="${p.category===x[0]?'on':''}" onclick="salesSetPaneCategory(${index},'${x[0]}')">${x[1]}</button>`).join('')}</div>`;}
function salesManufacturerField(p,index){return `<div><label>Manufacturer</label><select onchange="salesPaneSetManufacturer(${index},this.value)">${salesManufacturers().map(x=>salesOption(x,x,p.manufacturer,true)).join('')}</select></div>`;}
function salesThicknessField(p,index){return `<div><label>Thickness</label><select onchange="salesPaneSetThickness(${index},this.value)">${salesThicknessesFor(p).map(x=>salesOption(String(x),x+' mm',String(p.thicknessMm),true)).join('')}</select></div>`;}
function salesHeatField(p,index){return `<div><label>Heat Treatment</label><select onchange="salesPaneSetHeat(${index},this.value)">${salesSimpleOptions('heatTreatment',p.heatTreatmentId)}</select></div>`;}
/* Surface buttons need literal calls; keeping this helper separate avoids
   generating unsafe/eval-style handlers. */
function salesFritSurfaceSelector(p,index){const nums=salesPaneSurfaces(index);return `<div class="mu-surface"><label>Frit Surface</label><div class="mu-surface-buttons">${nums.map(n=>`<button type="button" class="${+p.frit.surface===n?'on':''}" onclick="salesPaneSetFrit(${index},'surface',${n})">#${n}</button>`).join('')}</div></div>`;}
/* Спецификация силкскрина: узор, цвет, диаметр точки, опорный угол и отступы
   от него, строка маркировки для цеха. Поля перенесены с рабочего листа
   спецификации (хендофф, раздел 9л), а не придуманы. Coverage % убрано — в
   реальной спецификации такого поля нет. */
function salesFritFields(p,index){
 return `<div class="mu-subgrid"><div><label>Frit Product</label><select onchange="salesPaneSetFrit(${index},'productId',this.value)">${salesSimpleOptions('fritProduct',p.frit.productId)}</select></div><div><label>Colour</label><select onchange="salesPaneSetFrit(${index},'color',this.value)">${FRIT_COLORS.map(x=>salesOption(x,x,p.frit.color,true)).join('')}</select></div><div><label>Pattern</label><select onchange="salesPaneSetFrit(${index},'pattern',this.value)">${FRIT_PATTERNS.map(x=>salesOption(x,x,p.frit.pattern,true)).join('')}</select></div><div><label>Dot diameter, mm</label><input value="${esc(p.frit.dotMm)}" onchange="salesFritDotChange(${index},this)"></div><div><label>Margin measured from</label><select onchange="salesPaneSetFrit(${index},'marginFrom',this.value)">${FRIT_MARGIN_CORNERS.map(x=>salesOption(x,x,p.frit.marginFrom,true)).join('')}</select></div><div><label>Margin — width</label><input value="${esc(salesMarginFrom16(p.frit.marginW16))}" placeholder="1" onchange="salesFritMarginChange(${index},'marginW16',this)"></div><div><label>Margin — height</label><input value="${esc(salesMarginFrom16(p.frit.marginH16))}" placeholder="1" onchange="salesFritMarginChange(${index},'marginH16',this)"></div><div><label>Production marking</label><input value="${esc(p.frit.marking)}" oninput="salesCurrentMakeup().panes[${index}].frit.marking=this.value"></div>${salesFritSurfaceSelector(p,index)}</div>`;
}
/* Кнопка вне `allowed_surfaces` каталога помечается, но остаётся нажимаемой:
   каталог отвечает, где покрытие живёт штатно, а не запрещает работу. */
function salesCoatingSurfaceSelector(p,index){
 const nums=salesPaneSurfaces(index),ok=salesAllowedCoatingSurfaces(p,index);
 /* Подпись одна на оба типа покрытия: разная длина подписи двигала колонку,
    и в Triple соседние лайты стояли с разной шириной поля. */
 const label='On Surface';
 const hint=ok.length&&ok.length<nums.length?`<div class="mu-surface-hint">default #${ok[0]}</div>`:'';
 return `<div class="mu-surface"><label>${label}</label><div class="mu-surface-buttons">${nums.map(n=>`<button type="button" class="${+p.coatingSurface===n?'on':''} ${ok.indexOf(n)<0?'off-catalog':''}" onclick="salesPaneSetCoatingSurface(${index},${n})">#${n}</button>`).join('')}</div>${hint}</div>`;
}
/* Цепочка выбора повторяет ту, которой пользуется сам поставщик:
   производитель → толщина → тип → ПОКРЫТИЕ → на каком стекле оно лежит.
   Пока шага «покрытие» не было, Vitro 6 мм Low-E выкатывал 92 строки одним
   списком, и Solarban 60 на двенадцати подложках приходилось искать глазами.
   У непокрытого стекла и фрита промежуточного шага нет — там выбирают само
   стекло, и второй список был бы пустой формальностью. */
function salesVisionFieldsSafe(p,index){
 const isFrit=p.visionType==='frit',coated=p.visionType==='lowe'||p.visionType==='reflective';
 const coatings=coated?salesGlassCoatings(p):[];
 const coating=coated?(salesCurrentCoating(p)||coatings[0]||''):'';
 const rows=coated?salesGlassVariants(p,coating):salesGlassCandidates(p);
 const glassSelect=`<select onchange="salesPaneSetProduct(${index},this.value)">${
  coated?salesGlassVariantOptions(rows,p.glassProductId):salesGlassProductOptions(rows,p.glassProductId)}</select>`;
 return `<div class="mu-field-grid mu-field-grid-4">${salesManufacturerField(p,index)}${salesThicknessField(p,index)}<div class="mu-type-field"><label>TYPE</label><div class="mu-type-buttons">${[['lowe','Low-E'],['reflective','Reflective'],['frit','Frit'],['uncoated','Uncoated']].map(x=>`<button type="button" class="${p.visionType===x[0]?'on':''}" onclick="salesPaneSetVisionType(${index},'${x[0]}')">${x[1]}</button>`).join('')}</div></div>${salesHeatField(p,index)}</div>
  <div class="mu-coating-grid">
   ${coated
    ?`<div><label>Select Coating</label><select onchange="salesPaneSetCoating(${index},this.value)">${coatings.map(c=>salesOption(c,c,coating,true)).join('')}</select><div class="mu-glass-meta"><span class="mut" data-raw>${esc(coatings.length)} coatings · ${esc(rows.length)} variants</span></div></div>`
    /* ПУСТАЯ ячейка, а не пропущенная: в Double и Triple лайты стоят один под
       другим, и поле, съехавшее на колонку влево у непокрытого стекла,
       заставляло глаз прыгать по всей сетке. Колонки держим на месте. */
    :'<div class="mu-cell-empty"></div>'}
   <div><label>${coated?'On Glass':(isFrit?'Base Glass':'Glass')}</label>${glassSelect}${salesGlassMetaFor(p.glassProductId)}</div>
   ${coated?salesCoatingSurfaceSelector(p,index):'<div class="mu-cell-empty"></div>'}
  </div>
  ${isFrit?salesFritFields(p,index):''}`;
}
function salesSpandrelFields(p,index){const rows=salesBaseGlassCandidates(p);return `<div class="mu-field-grid mu-field-grid-4">${salesManufacturerField(p,index)}${salesThicknessField(p,index)}<div><label>Base Glass</label><select onchange="salesPaneSetProduct(${index},this.value)">${salesGlassProductOptions(rows,p.glassProductId)}</select>${salesGlassMetaFor(p.glassProductId)}</div>${salesHeatField(p,index)}</div><div class="mu-subgrid"><div><label>Spandrel Product</label><select onchange="salesPaneSetSpandrel(${index},'productId',this.value)">${salesSimpleOptions('spandrelProduct',p.spandrel.productId)}</select></div><div><label>Color</label><select onchange="salesPaneSetSpandrel(${index},'color',this.value)">${SPANDREL_COLORS.map(x=>salesOption(x,x,p.spandrel.color,true)).join('')}</select></div>${(()=>{const nums=salesPaneSurfaces(index);return `<div class="mu-surface"><label>Spandrel Surface</label><div class="mu-surface-buttons">${nums.map(n=>`<button type="button" class="${+p.spandrel.surface===n?'on':''}" onclick="salesPaneSetSpandrel(${index},'surface',${n})">#${n}</button>`).join('')}</div></div>`;})()}</div>`;}
function salesLaminatedFields(p,index){const all=activeGlassProducts();return `<div class="mu-lam-grid"><div><label>Outer Ply</label><select onchange="salesPaneSetLam(${index},'outerGlassProductId',this.value)">${salesGlassProductOptions(all,p.laminated.outerGlassProductId)}</select>${salesGlassMetaFor(p.laminated.outerGlassProductId)}</div><div><label>Interlayer</label><select onchange="salesPaneSetLam(${index},'interlayerProductId',this.value)">${salesSimpleOptions('interlayerProduct',p.laminated.interlayerProductId)}</select></div><div><label>Inner Ply</label><select onchange="salesPaneSetLam(${index},'innerGlassProductId',this.value)">${salesGlassProductOptions(all,p.laminated.innerGlassProductId)}</select>${salesGlassMetaFor(p.laminated.innerGlassProductId)}</div></div>`;}
function salesLiteSection(p,index,total){const side=index===0?'OUTSIDE':index===total-1?'INSIDE':'MIDDLE',surfaces=salesPaneSurfaces(index),key='lite-'+index,isOpen=soOpenSectionKey===key;return `<details class="mu-section mu-lite" data-mu-section="${key}" ${isOpen?'open':''} ontoggle="salesAccordionToggle(this,'${key}')"><summary><span class="mu-chevron">›</span><b>LITE ${index+1} · ${side}</b><span class="mu-surface-tags">#${surfaces[0]} &nbsp; #${surfaces[1]}</span><span class="mu-summary">${esc(salesPaneProductSummary(p,index))}</span></summary><div class="mu-section-body"><div class="mu-lite-top">${salesLiteCategoryTabs(p,index)}</div>${p.category==='vision'?salesVisionFieldsSafe(p,index):p.category==='spandrel'?salesSpandrelFields(p,index):salesLaminatedFields(p,index)}</div></details>`;}
function salesCavitySection(c,index){
 const key='cavity-'+index,isOpen=soOpenSectionKey===key,sp=salesCavitySpacer(c),size=sp?sp.size:'',widths=salesSpacerWidths();
 const spacers=salesActiveSpacerVariants().filter(x=>!size||x.size===size);
 return `<details class="mu-section mu-cavity" data-mu-section="${key}" ${isOpen?'open':''} ontoggle="salesAccordionToggle(this,'${key}')"><summary><span class="mu-chevron">›</span><b>CAVITY ${index+1}</b><span class="mu-summary">${esc(salesCavitySummary(c))}</span></summary><div class="mu-section-body"><div class="mu-cavity-grid"><div><label>Width</label><select onchange="salesCavitySetWidth(${index},this.value)">${widths.map(x=>salesOption(x,x+'″',size,true)).join('')}</select></div><div><label>Spacer</label><select onchange="salesCavitySet(${index},'spacerVariantId',this.value)">${spacers.map(x=>salesOption(x.id,salesSpacerSystemLabel(x),c.spacerVariantId,true)).join('')}</select></div><div><label>Gas</label><select onchange="salesCavitySet(${index},'gasProductId',this.value)">${salesSimpleOptions('gasProduct',c.gasProductId)}</select></div><div><label>Sealant</label><select onchange="salesCavitySet(${index},'secondarySealantId',this.value)">${salesSecondarySealantOptions(c.secondarySealantId)}</select></div></div></div></details>`;
}
function salesMakeupBuilder(){const m=salesCurrentMakeup();if(!m)return '<div class="empty">No Makeup</div>';let sections='';m.panes.forEach((p,i)=>{sections+=salesLiteSection(p,i,m.panes.length);if(i<m.cavities.length)sections+=salesCavitySection(m.cavities[i],i);});const used=soDraft.lines.filter(l=>l.makeupId===m.id).length;return `<div class="mu-builder"><div class="mu-builder-head"><div><b>MAKEUP ${esc(m.code)}</b><span>${esc(salesMakeupSummary(m))}</span></div><div class="mu-builder-actions"><span class="pill">${used} lines</span><button class="sm" onclick="salesDuplicateMakeup('${esc(m.id)}')">Duplicate</button><button class="sm dl" onclick="salesDeleteMakeup('${esc(m.id)}')">Delete</button></div></div>${salesUnitTypeControl(m)}<div class="mu-stack">${sections}</div></div>`;}
