/* =====================================================================
   erp/sales/makeup-ui · sales-0.3b-makeup
   Compact UX for order-scoped IGU Makeups. Visual reference: IGU Builder;
   data model remains ERP-native and uses Master Data IDs.
   ===================================================================== */

function salesOption(value,label,selected,rawText){return `<option ${rawText?'data-raw':''} value="${esc(value)}" ${selected===value?'selected':''}>${esc(label)}</option>`;}
function salesUnique(arr){return [...new Set(arr.filter(x=>x!==''&&x!=null))];}
function salesManufacturers(){return salesUnique(activeGlassProducts().map(x=>x.manufacturer)).sort();}
function salesThicknessesFor(p){return salesUnique(activeGlassProducts().filter(x=>!p.manufacturer||x.manufacturer===p.manufacturer).map(x=>x.thicknessMm)).sort((a,b)=>a-b);}
function salesBaseGlassCandidates(p){return salesSortGlass(activeGlassProducts().filter(g=>(!p.manufacturer||g.manufacturer===p.manufacturer)&&(!p.thicknessMm||g.thicknessMm===+p.thicknessMm)&&g.coatingFamily==='uncoated'),false);}
/* Позиция без галочки склада помечается прямо в списке выбора, но из него не
   выпадает: заказать можно и то, чего у нас нет. Строка помечена data-raw и
   собирается заново на каждом переключении языка, поэтому пометка приезжает
   уже на нужном языке, а имя товара переводчик не трогает. */
/* Короткого кода в списке НЕТ намеренно: он уже стоит в шапке Lite и в коде
   makeup, а в строке выбора только мешает читать имя. */
/* Толщина выбрана отдельным полем, поэтому из подписи убирается её хвост:
   «Clear 6mm» рядом с Thickness 6 mm — это два ответа на один вопрос, и
   владелец справедливо на них указал. Толщина в СЕРЕДИНЕ названия остаётся
   («LoE 272 on 6 mm Clear»): там она описывает подложку покрытия. */
function salesGlassLabel(g){
 const name=String((g&&g.name)||'');
 const parts=name.split(' ');
 const tail=parts[parts.length-1]||'';
 /* Хвост вида «6mm» или «6.5mm» убирается, «6 mm» в середине названия — нет. */
 return /^[0-9]+(\.[0-9]+)?mm$/i.test(tail)?parts.slice(0,-1).join(' '):name;
}
function salesGlassProductOptions(rows,selected){return `<option value="">— select —</option>`+salesSortGlass(rows,false).map(g=>salesOption(g.id,salesGlassLabel(g)+(glassIsPreorder(g)?' · '+glassLabel('stock','preorder'):''),selected,true)).join('');}
/* --- Два шага выбора покрытого стекла --------------------------------
   Раньше шаг был один, и Vitro 6 мм Low-E выкатывал 92 строки списком.
   Теперь как у самого поставщика: сначала покрытие, потом на каком стекле. */
function salesGlassCoatings(p){
 const seen=Object.create(null),out=[];
 salesGlassCandidates(p).forEach(g=>{const c=glassCoatingName(g);if(c&&!seen[c]){seen[c]=true;out.push(c);}});
 return out;
}
function salesGlassCoatingHasStock(p,coating){return salesGlassCandidates(p).some(g=>glassCoatingName(g)===coating&&g.stocked===true);}
function salesGlassVariants(p,coating){return salesSortGlass(salesGlassCandidates(p).filter(g=>glassCoatingName(g)===coating),true);}
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
 return `<option value="">— select —</option>`+salesSortGlass(rows,true).map(g=>salesOption(g.id,salesGlassVariantLabel(g),selected,true)).join('');
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
/* A laminated pane has two plies but still occupies one Lite position. The
   outer ply faces the first numbered surface of that Lite; the inner ply
   faces its second surface. */
function salesLaminatedFritOutsideSurface(index,side){const nums=salesPaneSurfaces(index);return side==='inner'?nums[1]:nums[0];}
/* Цена в свёрнутой строке: владелец сравнивает лайты, не раскрывая каждый.
   Прочерк значит «в прайсе цены нет», и это видно так же ясно, как число. */
function salesPriceBadge(v,edited){
 if(v==null)return '<span class="mu-price-badge none">—</span>';
 return '<span class="mu-price-badge'+(edited?' edited':'')+'">'+esc((+v).toFixed(2))+'</span>';
}
function salesPanePriceBadge(p){
 const cat=salesPaneCatalogPrice(p),v=p.priceOverride!=null?p.priceOverride:cat;
 return salesPriceBadge(v,p.priceOverride!=null);
}
function salesCavityPriceBadge(c){
 const cat=salesCavityCatalogPrice(c),v=c.priceOverride!=null?c.priceOverride:cat;
 return salesPriceBadge(v,c.priceOverride!=null);
}
function salesPaneProductSummary(p,index){
 if(p.category==='laminated'){
  const lam=p.laminated||{},outer=lam.outer||{},inner=lam.inner||{},a=glassProductById(outer.glassProductId),b=glassProductById(inner.glassProductId);
  const part=(g,ply,side)=>{const ht=mdById('heatTreatment',ply&&ply.heatTreatmentId),bits=[g&&(g.code||g.name)];if(ht&&ht.code!=='AN')bits.push(ht.code);if(ply&&ply.frit&&ply.frit.enabled)bits.push('FRIT '+(ply.frit.position==='in_film'?'into film':'#'+salesLaminatedFritOutsideSurface(index,side)));return bits.filter(Boolean).join(' · ');};
  const films=(lam.interlayers||[]).map(x=>{const il=mdById('interlayerProduct',x.productId),th=Number.isFinite(+x.thicknessMm)&&+x.thicknessMm>0?' '+(+x.thicknessMm)+' mm':'';return il?(il.code||il.name)+th:'';});
  return [part(a,outer,'outer')].concat(films,part(b,inner,'inner')).filter(Boolean).join(' + ')||'Laminated';
 }
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
 /* В режиме «раскрыть все» соседи остаются открытыми: он для того и включён. */
 if(soExpandAll)return;
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
function salesUnitTypeControl(m){return `<div class="mu-unit-row"><span>UNIT TYPE</span><div class="mu-segment">${[['single','Single Lite'],['double','Double'],['triple','Triple']].map(x=>`<button type="button" class="${m.unitType===x[0]?'on':''}" onclick="salesSetUnitType('${x[0]}')">${x[1]}</button>`).join('')}</div><div class="mu-totals">${(function(){const u=salesMakeupUnitPrice(m);return `<div class="mu-total mu-total-price"><span>Makeup</span><b>${u.known?u.total.toFixed(2):u.total.toFixed(2)+` +?`}</b></div>`;})()}<div class="mu-total"><span>Overall</span><b>${salesMakeupThicknessMm(m)==null?'—':salesMakeupThicknessMm(m).toFixed(1)+' mm'}</b></div></div></div>`;}
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
/* Порядок полей задан владельцем: производитель, толщина, стекло, тип,
   термообработка, цена — всё одной строкой. Спецификация выбранного типа
   (покрытие, поверхность, фрит) уезжает во второй ряд и у Uncoated не
   появляется вовсе: там уточнять нечего, и пустой ряд только съедал высоту. */
/* Цена стоит в той же строке, что и остальные поля: она такое же свойство
   позиции, как толщина, и отдельного блока под неё не нужно. Каталожная
   ставка показывается подсказкой ↺ и появляется только когда цену правили. */
function salesPriceCell(kind,index,cat,over){
 const has=over!=null,shown=has?over:cat;
 const val=shown==null?'':(+shown).toFixed(2);
 const ph=cat==null?'—':(+cat).toFixed(2);
 return `<div class="mu-price-cell${has?' edited':''}">`
  +`<input type="number" step="0.01" min="0" value="${esc(val)}" placeholder="${esc(ph)}" onchange="sales${kind}SetPrice(${index},this.value)" aria-label="Price per sq ft">`
  +(has?`<button type="button" class="mu-price-reset" title="Reset to catalog ${esc(ph)}" onclick="sales${kind}SetPrice(${index},'')">↺</button>`:'')
  +`</div>`;
}
/* Каталожной цены продажи у стекла пока нет — она появится вместе с прайсом.
   До тех пор поле пустое: показывать выдуманное число хуже, чем прочерк. */
function salesLitePriceField(p,index){
 return `<div><label>Price · sq ft</label>${salesPriceCell('Pane',index,salesPaneCatalogPrice(p),p.priceOverride)}</div>`;
}
function salesCavityPriceField(c,index){
 return `<div><label>Price · sq ft</label>${salesPriceCell('Cavity',index,salesCavityCatalogPrice(c),c.priceOverride)}</div>`;
}
/* Каталог говорит «только закалённым», а в позиции стоит Annealed — цены на
   такую пару в прайсе нет. Прочерк в цене это уже показывает, но глазу нужно
   место ошибки, а не только её следствие: поле закалки подсвечивается.
   Запрета нет — бывает, что так и надо, и человек продолжает осознанно. */
function salesHeatFieldChecked(p,index){
 const html=salesHeatField(p,index);
 if(!salesPaneTemperConflict(p))return html;
 const g=glassProductById(p.glassProductId);
 const note=glassNeedsFurnace(g)?`catalog: temper required`:`catalog: no tempering`;
 return html.replace(`<div>`,`<div class="mu-conflict">`)
  .replace(`</select>`,`</select><span class="mu-conflict-note">`+note+`</span>`);
}
function salesVisionFieldsSafe(p,index){
 const isFrit=p.visionType==='frit',coated=p.visionType==='lowe'||p.visionType==='reflective';
 const coatings=coated?salesGlassCoatings(p):[];
 const coating=coated?(salesCurrentCoating(p)||coatings[0]||''):'';
 const rows=coated?salesGlassVariants(p,coating):salesGlassCandidates(p);
 const glassSelect=`<select onchange="salesPaneSetProduct(${index},this.value)">${
  coated?salesGlassVariantOptions(rows,p.glassProductId):salesGlassProductOptions(rows,p.glassProductId)}</select>`;
 const typeSelect=`<select onchange="salesPaneSetVisionType(${index},this.value)">${
  [['uncoated','Uncoated'],['lowe','Low-E'],['reflective','Reflective'],['frit','Frit']]
   .map(x=>salesOption(x[0],x[1],p.visionType,true)).join('')}</select>`;
 return `<div class="mu-field-grid mu-field-grid-6">${salesManufacturerField(p,index)}${salesThicknessField(p,index)}<div><label>${coated?'On Glass':(isFrit?'Base Glass':'Glass')}</label>${glassSelect}${salesGlassMetaFor(p.glassProductId)}</div><div><label>Type</label>${typeSelect}</div>${salesHeatFieldChecked(p,index)}${salesLitePriceField(p,index)}</div>
  ${coated?`<div class="mu-coating-grid mu-second-row"><div><label>Selected Coating</label><select onchange="salesPaneSetCoating(${index},this.value)">${coatings.map(c=>salesOption(c,c+(salesGlassCoatingHasStock(p,c)?'':' · '+glassLabel('stock','preorder')),coating,true)).join('')}</select><div class="mu-glass-meta"><span class="mut" data-raw>${esc(coatings.length)} coatings · ${esc(rows.length)} variants</span></div></div>${salesCoatingSurfaceSelector(p,index)}</div>`:''}
  ${isFrit?salesFritFields(p,index):''}`;
}
/* Спандрел описывается тем же рядом, что и обычный лайт: производитель,
   толщина, стекло, тип, термообработка, цена. Раньше здесь была своя сетка из
   четырёх полей без цены, и глазу приходилось искать её в другом месте — а
   сравнивают лайты между собой, значит и выглядеть они должны одинаково.
   Место TYPE занимает продукт спандрела: он и есть тип этой позиции. */
function salesSpandrelFields(p,index){
 const rows=salesBaseGlassCandidates(p);
 return `<div class="mu-field-grid mu-field-grid-6">${salesManufacturerField(p,index)}${salesThicknessField(p,index)}<div><label>Base Glass</label><select onchange="salesPaneSetProduct(${index},this.value)">${salesGlassProductOptions(rows,p.glassProductId)}</select>${salesGlassMetaFor(p.glassProductId)}</div><div><label>Type</label><select onchange="salesPaneSetSpandrel(${index},'productId',this.value)">${salesSimpleOptions('spandrelProduct',p.spandrel.productId)}</select></div>${salesHeatFieldChecked(p,index)}${salesLitePriceField(p,index)}</div>
  <div class="mu-coating-grid mu-second-row"><div><label>Colour</label><select onchange="salesPaneSetSpandrel(${index},'color',this.value)">${SPANDREL_COLORS.map(x=>salesOption(x,x,p.spandrel.color,true)).join('')}</select></div>${(()=>{const nums=salesPaneSurfaces(index);return `<div class="mu-surface"><label>Spandrel Surface</label><div class="mu-surface-buttons">${nums.map(n=>`<button type="button" class="${+p.spandrel.surface===n?'on':''}" onclick="salesPaneSetSpandrel(${index},'surface',${n})">#${n}</button>`).join('')}</div></div>`;})()}</div>`;
}
/* Плита ламината описывается тем же рядом, что обычный лайт: производитель,
   толщина, стекло, тип, термообработка, цена. У ламината таких плит две, и цена
   у каждой своя — внутренний лист может быть дороже внешнего. Итог позиции
   складывается из обеих плит и плёнки. */
function salesLaminatedPlyFields(p,index,side,label){
 const ply=p.laminated[side],isFrit=!!(ply.frit&&ply.frit.enabled),coated=!isFrit&&(ply.visionType==='lowe'||ply.visionType==='reflective'),coatings=coated?salesGlassCoatings(ply):[];
 const coating=coated?(salesCurrentCoating(ply)||coatings[0]||''):'',rows=coated?salesGlassVariants(ply,coating):salesLaminatedPlyCandidates(ply);
 const glassSelect=coated?salesGlassVariantOptions(rows,ply.glassProductId):salesGlassProductOptions(rows,ply.glassProductId);
 const typeSelect=`<select onchange="salesPaneSetLamPlyType(${index},'${side}',this.value)">${
  [['uncoated','Uncoated'],['lowe','Low-E'],['reflective','Reflective'],['frit','Frit']]
   .map(x=>salesOption(x[0],x[1],isFrit?'frit':ply.visionType,true)).join('')}</select>`;
 return `<div class="mu-lam-ply" data-lam-ply="${side}"><div class="mu-lam-ply-title"><b>${label}</b><span>${esc(rows.length)} matches</span></div>
  <div class="mu-field-grid mu-field-grid-6">
   <div><label>Manufacturer</label><select onchange="salesPaneSetLamPly(${index},'${side}','manufacturer',this.value)">${salesManufacturers().map(x=>salesOption(x,x,ply.manufacturer,true)).join('')}</select></div>
   <div><label>Thickness</label><select onchange="salesPaneSetLamPly(${index},'${side}','thicknessMm',this.value)">${salesThicknessesFor(ply).map(x=>salesOption(String(x),x+' mm',String(ply.thicknessMm),true)).join('')}</select></div>
   <div class="mu-lam-glass"><label>${coated?'On Glass':'Glass'}</label><select onchange="salesPaneSetLamPlyProduct(${index},'${side}',this.value)">${glassSelect}</select>${salesGlassMetaFor(ply.glassProductId)}</div>
   <div><label>Type</label>${typeSelect}</div>
   <div><label>Heat Treatment</label><select onchange="salesPaneSetLamPlyHeat(${index},'${side}',this.value)">${salesSimpleOptions('heatTreatment',ply.heatTreatmentId)}</select></div>
   <div><label>Price · sq ft</label>${salesPriceCell('LamPly'+(side==='outer'?'Outer':'Inner'),index,salesPlyCatalogPrice(ply),ply.priceOverride)}</div>
  </div>
  ${coated?`<div class="mu-coating-grid mu-second-row"><div><label>Selected Coating</label><select onchange="salesPaneSetLamPlyCoating(${index},'${side}',this.value)">${coatings.map(c=>salesOption(c,c+(salesGlassCoatingHasStock(ply,c)?'':' · '+glassLabel('stock','preorder')),coating,true)).join('')}</select></div></div>`:''}
  ${salesLaminatedFritFields(p,index,side)}</div>`;
}
function salesLaminatedFritFields(p,index,side){
 const f=p.laminated[side].frit;if(!f||!f.enabled)return '';
 const outsideSurface=salesLaminatedFritOutsideSurface(index,side);
 return `<div class="mu-subgrid mu-lam-frit-grid"><div><label>Frit Position</label><select onchange="salesPaneSetLamFrit(${index},'${side}','position',this.value)">${[['outside','#'+outsideSurface+' · Outside film (default)'],['in_film','Into film']].map(x=>salesOption(x[0],x[1],f.position,true)).join('')}</select></div><div><label>Frit Product</label><select onchange="salesPaneSetLamFrit(${index},'${side}','productId',this.value)">${salesSimpleOptions('fritProduct',f.productId)}</select></div><div><label>Colour</label><select onchange="salesPaneSetLamFrit(${index},'${side}','color',this.value)">${FRIT_COLORS.map(x=>salesOption(x,x,f.color,true)).join('')}</select></div><div><label>Pattern</label><select onchange="salesPaneSetLamFrit(${index},'${side}','pattern',this.value)">${FRIT_PATTERNS.map(x=>salesOption(x,x,f.pattern,true)).join('')}</select></div><div><label>Dot diameter, mm</label><input value="${esc(f.dotMm)}" onchange="salesLamFritDotChange(${index},'${side}',this)"></div><div><label>Margin measured from</label><select onchange="salesPaneSetLamFrit(${index},'${side}','marginFrom',this.value)">${FRIT_MARGIN_CORNERS.map(x=>salesOption(x,x,f.marginFrom,true)).join('')}</select></div><div><label>Margin — width</label><input value="${esc(salesMarginFrom16(f.marginW16))}" placeholder="1" onchange="salesLamFritMarginChange(${index},'${side}','marginW16',this)"></div><div><label>Margin — height</label><input value="${esc(salesMarginFrom16(f.marginH16))}" placeholder="1" onchange="salesLamFritMarginChange(${index},'${side}','marginH16',this)"></div><div><label>Production marking</label><input value="${esc(f.marking)}" oninput="salesPaneSetLamFritText(${index},'${side}','marking',this.value)"></div></div>`;
}
function salesInterlayerFamilyOptions(current){
 return INTERLAYER_FAMILIES.map(f=>salesOption(f.id,f.label,current,true)).join('');
}
function salesInterlayerTypeOptions(family,current){
 return activeSimple('interlayerProduct')
  .filter(x=>interlayerFamilyOf(x.id)===family)
  .map(x=>salesOption(x.id,x.name,current,true)).join('');
}
function salesInterlayerPriceCell(index,slot,layer){
 const prod=mdById('interlayerProduct',layer.productId);
 const cat=prod&&prod.salePrice!=null?prod.salePrice:null;
 const has=layer.priceOverride!=null;
 const shown=has?layer.priceOverride:cat;
 return `<div class="mu-price-cell${has?' edited':''}">`
  +`<input type="number" step="0.01" min="0" value="${shown==null?'':(+shown).toFixed(2)}" placeholder="${cat==null?'—':(+cat).toFixed(2)}" onchange="salesPaneSetLamInterlayerPrice(${index},${slot},this.value)" aria-label="Price per layer">`
  +(has?`<button type="button" class="mu-price-reset" title="Reset to catalog ${cat==null?'—':(+cat).toFixed(2)}" onclick="salesPaneSetLamInterlayerPrice(${index},${slot},'')">↺</button>`:'')
  +`</div>`;
}
function salesLaminatedInterlayers(p,index){
 const rows=p.laminated.interlayers||[],canAdd=rows.length<SALES_MAX_INTERLAYERS;
 return `<div class="mu-lam-films"><div class="mu-lam-films-head"><div><b>INTERLAYER STACK</b><span>Mix film types · up to ${SALES_MAX_INTERLAYER_LAYERS} layers each</span></div><button type="button" ${canAdd?'':'disabled'} onclick="salesPaneAddLamInterlayer(${index})">+ Add Film</button></div>${rows.map((layer,slot)=>{
  const selected=String(salesInterlayerLayerCount(layer.layers));
  const layerOptions=Array.from({length:SALES_MAX_INTERLAYER_LAYERS},(_,i)=>{const n=i+1,mm=salesInterlayerThicknessForLayers(n);return salesOption(String(n),n+' '+(n===1?'layer':'layers')+' · '+mm.toFixed(2)+' mm',selected,true);}).join('');
  const family=interlayerFamilyOf(layer.productId);
  return `<div class="mu-lam-film"><span class="mu-lam-film-num">${slot+1}</span><div><label>Film</label><select onchange="salesPaneSetLamInterlayerFamily(${index},${slot},this.value)">${salesInterlayerFamilyOptions(family)}</select></div><div><label>Type</label><select onchange="salesPaneSetLamInterlayer(${index},${slot},this.value)">${salesInterlayerTypeOptions(family,layer.productId)}</select></div><div><label>Layers / actual thickness</label><select onchange="salesPaneSetLamInterlayerLayers(${index},${slot},this.value)">${layerOptions}</select></div><div><label>Price / layer</label>${salesInterlayerPriceCell(index,slot,layer)}</div><button type="button" class="mu-lam-film-del" ${rows.length>1?'':'disabled'} onclick="salesPaneRemoveLamInterlayer(${index},${slot})" title="Remove film">×</button></div>`;
 }).join('')}</div>`;
}
/* У ламината кромка ОДНА на всю склейку — плёнка её не делит, поэтому выбор
   стоит один на лайт, а не по плёнкам. */
function salesLaminatedFields(p,index){return `<div class="mu-lam-stack">${salesLaminatedPlyFields(p,index,'outer','OUTER PLY')}${salesLaminatedInterlayers(p,index)}${salesLaminatedPlyFields(p,index,'inner','INNER PLY')}</div>`;}
function salesLiteSection(p,index,total){const side=index===0?'OUTSIDE':index===total-1?'INSIDE':'MIDDLE',surfaces=salesPaneSurfaces(index),key='lite-'+index,isOpen=soExpandAll||soOpenSectionKey===key;return `<details class="mu-section mu-lite" data-mu-section="${key}" ${isOpen?'open':''} ontoggle="salesAccordionToggle(this,'${key}')"><summary><span class="mu-chevron">›</span><b>LITE ${index+1} · ${side}</b><span class="mu-surface-tags">#${surfaces[0]} &nbsp; #${surfaces[1]}</span><span class="mu-summary">${esc(salesPaneProductSummary(p,index))}</span>${salesPanePriceBadge(p)}</summary><div class="mu-section-body"><div class="mu-lite-top">${salesLiteCategoryTabs(p,index)}</div>${p.category==='vision'?salesVisionFieldsSafe(p,index):p.category==='spandrel'?salesSpandrelFields(p,index):salesLaminatedFields(p,index)}</div></details>`;}
function salesCavitySection(c,index){
 const key='cavity-'+index,isOpen=soExpandAll||soOpenSectionKey===key,sp=salesCavitySpacer(c),size=sp?sp.size:'',widths=salesSpacerWidths();
 const spacers=salesActiveSpacerVariants().filter(x=>!size||x.size===size);
 return `<details class="mu-section mu-cavity" data-mu-section="${key}" ${isOpen?'open':''} ontoggle="salesAccordionToggle(this,'${key}')"><summary><span class="mu-chevron">›</span><b>CAVITY ${index+1}</b><span class="mu-summary">${esc(salesCavitySummary(c))}</span>${salesCavityPriceBadge(c)}</summary><div class="mu-section-body"><div class="mu-cavity-grid"><div><label>Spacer</label><select onchange="salesCavitySet(${index},'spacerVariantId',this.value)">${spacers.map(x=>salesOption(x.id,salesSpacerSystemLabel(x),c.spacerVariantId,true)).join('')}</select></div><div><label>Width</label><select onchange="salesCavitySetWidth(${index},this.value)">${widths.map(x=>salesOption(x,x+'″',size,true)).join('')}</select></div><div><label>Gas</label><select onchange="salesCavitySet(${index},'gasProductId',this.value)">${salesSimpleOptions('gasProduct',c.gasProductId)}</select></div><div><label>Sealant</label><select onchange="salesCavitySet(${index},'secondarySealantId',this.value)">${salesSecondarySealantOptions(c.secondarySealantId)}</select></div>${salesCavityPriceField(c,index)}</div></div></details>`;
}
function salesMakeupBuilder(){const m=salesCurrentMakeup();if(!m)return '<div class="empty">No Makeup</div>';let sections='';m.panes.forEach((p,i)=>{sections+=salesLiteSection(p,i,m.panes.length);if(i<m.cavities.length)sections+=salesCavitySection(m.cavities[i],i);});const used=soDraft.lines.filter(l=>l.makeupId===m.id).length;return `<div class="mu-builder"><div class="mu-builder-head"><div><b>MAKEUP ${esc(m.code)}</b><span>${esc(salesMakeupSummary(m))}</span></div><div class="mu-builder-actions"><span class="pill">${used} lines</span><button class="sm" onclick="salesToggleExpandAll()" title="Держать все секции открытыми">${soExpandAll?`Collapse all`:`Expand all`}</button><button class="sm" onclick="salesDuplicateMakeup('${esc(m.id)}')">Duplicate</button><button class="sm dl" onclick="salesDeleteMakeup('${esc(m.id)}')">Delete</button></div></div>${salesUnitTypeControl(m)}<div class="mu-stack">${sections}</div></div>`;}
