/* =====================================================================
   erp/production/stickers  ·  stickers-1.0
   Данные стикера стекла и шаблоны конструктора.
   IN : заказ, позиция, стекло (glassBatchComponents), место (изделие или Recut)
   OUT: модель стикера для erp/production/sticker-layout; DB.stickerTemplate

   Владелец, 17 сентября 2026: принтер TSC, этикетки 4×6 и 3×4, стоя и лёжа.
   Стикеры: Production — на каждое стекло; Final · each glass — финальный на
   каждое стекло юнита; Final · whole unit — один на весь DGU/TGU, «когда
   клиенту нужен один стикер на все». Шаблоны — в конструкторе Master Data →
   Stickers «как конструктор документов», чтобы добавлять и настраивать без
   программиста. Вес в kg, предупреждения «поднимать вдвоём» не нужно.
   Модель несёт все данные сразу; какие из них печатать, решают блоки шаблона
   и их Details. Glass ID и номер юнита есть только на самом стикере.
   ===================================================================== */
DEFAULT.stickerTemplate={};
const STK_TYPES=[{k:'production',label:'Production'},{k:'final',label:'Final · each glass'},{k:'unit',label:'Final · whole unit'}];
const STK_SIZES=[{k:'4x6',label:'4 × 6',short:288,long:432},{k:'3x4',label:'3 × 4',short:216,long:288}];
const STK_ALIGNS=[{k:'left',label:'Left'},{k:'center',label:'Center'},{k:'right',label:'Right'}];
const STK_PLACES=[{k:'full',label:'Full'},{k:'left',label:'Left'},{k:'right',label:'Right'},{k:'bottom',label:'Bottom'}];
const STK_TEXT_MAX=160;
const STK_ALL=['production','final','unit'],STK_GLASS=['production','final'];
/* Каталог блоков. size — кегль в pt у текста; у графики — высота (штрихкод,
   маршрут), сторона контура, толщина линии. details — мелочи внутри блока:
   [ключ, подпись, включено в базе]. Новый блок в каталоге появится и в старых
   сохранённых шаблонах — выключенным, в конце списка. */
const STK_BLOCKS=[
 {k:'company',label:'Company',group:'Header',types:STK_ALL,size:[9,6,48],bold:true,details:[['logo','Logo',true],['name','Name',true]]},
 {k:'batch',label:'Batch number',group:'Header',types:STK_GLASS,size:[12,6,48],bold:true,details:[]},
 {k:'barcode',label:'Barcode',group:'Header',types:STK_ALL,size:[48,20,150],graphic:true,details:[['number','Number under bars',true]]},
 {k:'order',label:'Order / line',group:'Header',types:STK_ALL,size:[38,8,90],bold:true,details:[['line','Line number',true],['recut','RECUT tag',true]]},
 {k:'unit',label:'Unit · lite',group:'Header',types:STK_ALL,size:[14,6,48],details:[['unit','Unit n of N',true],['lite','Lite n of N',true],['ply','Laminated ply',true]]},
 {k:'orderInfo',label:'Order details',group:'Customer',types:STK_ALL,size:[10,6,48],details:[['priority','Priority',true],['delivery','Pickup / Delivery',true],['created','Order date',false]]},
 {k:'customer',label:'Customer',group:'Customer',types:STK_ALL,size:[20,6,60],bold:true,details:[['upper','UPPERCASE',true]]},
 {k:'po',label:'PO',group:'Customer',types:STK_ALL,size:[13,6,48],details:[['label','"PO" label',true]]},
 {k:'mark',label:'Mark',group:'Customer',types:STK_ALL,size:[13,6,60],bold:true,details:[['label','"Mark" label',true]]},
 {k:'due',label:'Due date',group:'Customer',types:STK_ALL,size:[13,6,48],bold:true,details:[['weekday','Weekday',true],['rush','Black when Rush',true]]},
 {k:'glass',label:'Glass',group:'Glass',types:STK_GLASS,size:[16,6,48],bold:true,details:[['code','Code instead of name',false],['thickness','Thickness mm',false],['heat','Treatment',true],['heatSoak','Heat soak',true],['surface','Coating surface',true],['paint','Frit / spandrel',true],['ply','Laminated ply',false]]},
 {k:'makeup',label:'Unit makeup',group:'Glass',types:['unit'],size:[10,6,36],details:[['heading','Unit type',true],['thickness','Overall thickness',true],['code','Makeup code',false],['glass','Glass of each lite',true],['heat','Treatment',true],['surface','Surfaces',true],['film','Interlayer and mm',true],['spacer','Spacer',true],['gas','Gas',true],['sealant','Sealants',false],['muntin','Muntins',true]]},
 {k:'summary',label:'Unit makeup code',group:'Glass',types:['final'],size:[9,6,36],details:[['label','"Unit" label',true]]},
 {k:'size',label:'Size',group:'Glass',types:STK_ALL,size:[36,8,90],bold:true,details:[['cut','Size before edgework',true]]},
 {k:'area',label:'Area ft²',group:'Glass',types:STK_ALL,size:[13,6,48],details:[]},
 {k:'weight',label:'Weight kg',group:'Glass',types:STK_ALL,size:[13,6,48],details:[]},
 {k:'shape',label:'Shape outline',group:'Glass',types:STK_ALL,size:[90,30,250],graphic:true,details:[['letters','Side letters A B C D',true],['label','SHAPE label',true]]},
 {k:'route',label:'Route by station',group:'Production',types:['production'],size:[30,12,60],graphic:true,details:[['shipping','SHIPR and SHIP',true]]},
 {k:'services',label:'Services',group:'Production',types:['production'],size:[12,6,36],bold:true,details:[['boxes','Check boxes',true],['station','Station before service',false]]},
 {k:'divider',label:'Divider line',group:'Other',types:STK_ALL,size:[1,0.5,6],graphic:true,multi:true,details:[]},
 {k:'text',label:'Custom text',group:'Other',types:STK_ALL,size:[14,6,72],bold:true,multi:true,details:[]}
];
function stkBlockDef(k){return STK_BLOCKS.find(b=>b.k===k)||null;}
function stkTypeLabel(k){const t=STK_TYPES.find(x=>x.k===k);return t?t.label:'Sticker';}
function stkSizeDef(k){return STK_SIZES.find(s=>s.k===k)||STK_SIZES[0];}
function stkKey(type,size){return type+'|'+size;}
function stkDetailsBase(def){const d={};(def.details||[]).forEach(x=>{d[x[0]]=x[2];});return d;}
let stkBlockSeq=0;
function stkBlock(k,at,size,extra){
 const def=stkBlockDef(k);
 return Object.assign({id:'b'+(++stkBlockSeq).toString(36)+Date.now().toString(36).slice(-3),k,on:true,at,size:size==null?def.size[0]:size,bold:!!def.bold,align:'auto',details:stkDetailsBase(def),text:''},extra||{});
}
/* Базовые шаблоны под каждый стикер и формат. 4×6 стоя, 3×4 лёжа — как
   этикетка Spil сейчас; ориентацию владелец меняет в конструкторе.
   Владелец, 17 сентября 2026, после первой печати: «стикер как будто
   пустует» — кегли крупнее, свободное место раскладка делит между строками,
   форма включена во всех форматах. */
function stkBase(type,size,orient){
 const small=size==='3x4',land=orient?orient==='landscape':small,B=stkBlock,unit=type==='unit',fin=type==='final',prod=type==='production';
 /* Кегль по формату: [4×6 стоя, 4×6 лёжа, 3×4 стоя, 3×4 лёжа]. */
 const k=small?(land?3:2):(land?1:0),z=a=>a[k];
 const tpl=blocks=>({orient:land?'landscape':'portrait',blocks});
 const extra=B('text','full',z([14,12,10,9]),{on:false,text:'HANDLE WITH CARE'}),info=B('orderInfo','left',z([11,10,8,8]),{on:false});
 const tail=prod?[extra,B('route','bottom',z([28,22,18,16])),B('services','bottom',z([12,10,9,8]))]:fin?[B('summary','full',z([10,9,8,7])),extra]:[extra];
 if(land){
  /* Лёжа — две колонки: текст слева; штрихкод, дата, площадь, вес и форма справа. */
  const left=[B('company','left',9,{on:!small}),B('order','left',z([0,28,0,20])),B('unit','left',z([0,12,0,8])),B('customer','left',z([0,14,0,10])),B('po','left',z([0,11,0,8])),B('mark','left',z([0,12,0,8])),info]
   .concat(unit?[]:[B('glass','left',z([0,12,0,9]))],[B('size','left',z([0,24,0,17]))]);
  const right=[B('barcode','right',z([0,42,0,28]))].concat(unit?[]:[B('batch','right',z([0,11,0,8]))],[B('due','right',z([0,11,0,8])),B('area','right',z([0,11,0,8])),B('weight','right',z([0,11,0,8])),B('shape','right',z([0,50,0,36]))]);
  return tpl(left.concat(right,unit?[B('makeup','full',z([0,8.5,0,7]))]:[],tail));
 }
 /* Стоя — строки сверху вниз. */
 const head=[B('company','left',z([9,0,8,0]),{on:!small})].concat(unit?[]:[B('batch','right',z([12,0,9,0]))],[B('barcode','full',z([44,0,30,0])),B('divider','full',1,{on:!small}),B('order','full',z([34,0,22,0])),B('unit','full',z([14,0,9,0]))]);
 const who=[B('customer','full',z([18,0,11,0])),B('po','left',z([13,0,9,0])),B('due','right',z([13,0,9,0])),B('mark','full',z([14,0,9,0])),info];
 const dims=[B('size','left',z([32,0,20,0])),B('area','left',z([13,0,8,0])),B('weight','left',z([13,0,8,0])),B('shape','right',z([64,0,36,0]))];
 return tpl(head.concat(who,unit?[B('makeup','full',z([10,0,7,0]))]:[B('glass','full',z([15,0,10,0]))],dims,tail));
}
/* Шаблон из хранилища приводится к каталогу: неизвестный блок отбрасывается,
   размер держится в пределах блока, новые блоки каталога дописываются
   выключенными. */
function stkCleanTemplate(type,size,raw){
 const base=stkBase(type,size),src=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:null;
 if(!src||!Array.isArray(src.blocks))return base;
 const ids=new Set(),seen=new Set(),blocks=[];
 src.blocks.forEach(b=>{
  const def=b&&typeof b==='object'&&stkBlockDef(b.k);
  if(!def||!def.types.includes(type)||!def.multi&&seen.has(def.k))return;seen.add(def.k);
  let id=typeof b.id==='string'&&/^[\w-]{1,40}$/.test(b.id)&&!ids.has(b.id)?b.id:stkBlock(def.k,'full').id;ids.add(id);
  const n=Number(b.size),details=stkDetailsBase(def);
  (def.details||[]).forEach(x=>{if(b.details&&typeof b.details[x[0]]==='boolean')details[x[0]]=b.details[x[0]];});
  blocks.push({id,k:def.k,on:b.on!==false,at:STK_PLACES.some(p=>p.k===b.at)?b.at:'full',align:STK_ALIGNS.some(a=>a.k===b.align)?b.align:'auto',size:Number.isFinite(n)?Math.min(def.size[2],Math.max(def.size[1],Math.round(n*2)/2)):def.size[0],bold:typeof b.bold==='boolean'?b.bold:!!def.bold,details,text:typeof b.text==='string'?b.text.slice(0,STK_TEXT_MAX):''});
 });
 base.blocks.forEach(b=>{if(!blocks.some(x=>x.k===b.k))blocks.push(Object.assign(b,{on:false}));});
 return {orient:src.orient==='landscape'?'landscape':'portrait',blocks};
}
function stkTemplate(type,size){return stkCleanTemplate(type,size,DB.stickerTemplate&&DB.stickerTemplate[stkKey(type,size)]);}
function normalizeStickerTemplates(){
 const src=DB.stickerTemplate&&typeof DB.stickerTemplate==='object'&&!Array.isArray(DB.stickerTemplate)?DB.stickerTemplate:{},out={};
 STK_TYPES.forEach(t=>STK_SIZES.forEach(s=>{const k=stkKey(t.k,s.k);if(src[k])out[k]=stkCleanTemplate(t.k,s.k,src[k]);}));
 DB.stickerTemplate=out;
}
function validateStickerPayload(src){
 if(src.stickerTemplate!=null&&(typeof src.stickerTemplate!=='object'||Array.isArray(src.stickerTemplate)))throw new Error('Sticker templates must be an object.');
}

/* ------------------------------ Данные ------------------------------ */
function stkDue(v){
 const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return {day:'',weekday:''};
 const d=new Date(+m[1],+m[2]-1,+m[3]);
 return {day:DOC_MONTHS[d.getMonth()]+' '+d.getDate(),weekday:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]};
}
/* Поля для Custom text: «{Customer: Phone}». Владелец, 17 сентября 2026:
   «нет возможности добавить свои переменные — придётся просить тебя
   подтянуть данные». Список собирается сам из заказа, клиента и позиции:
   новое поле в программе сразу появляется в списке, без правки стикеров. */
function stkHuman(k){return String(k).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().toLowerCase().replace(/^./,c=>c.toUpperCase());}
function stkVarValue(v){
 if(v==null||v==='')return '';if(typeof v==='boolean')return v?'Yes':'No';if(typeof v==='number')return String(Math.round(v*100)/100);
 const t=String(v);if(/^\d{4}-\d{2}-\d{2}(T|$)/.test(t)){const d=stkDue(t.slice(0,10));return d.day?d.weekday+' '+d.day:t;}
 return t.replace(/\s*\n\s*/g,' ');
}
function stkVars(o,l,li){
 const vars={},skip=/(^id$|Id$|Ids$|Ref$|16$|^price|Price|Override$|^rev$|Rev$|fingerprint)/i;
 const add=(group,obj,depth)=>Object.keys(obj||{}).forEach(k=>{
  const v=obj[k];if(skip.test(k)||Array.isArray(v))return;
  if(v&&typeof v==='object'){if(depth<1)add(group+': '+stkHuman(k),v,depth+1);return;}
  const label=group.includes(':')?group+' '+stkHuman(k).toLowerCase():group+': '+stkHuman(k);vars[label]=stkVarValue(v);
 });
 add('Order',o,0);add('Customer',typeof salesFindCustomer==='function'?salesFindCustomer(o.customerId):null,0);add('Line',l,0);
 Object.assign(vars,{'Line: Number':String(li+1),'Line: Width':frac16(l.width16/16)+'″','Line: Height':frac16(l.height16/16)+'″','Order: Status':typeof salesStatusLabel==='function'?salesStatusLabel(o):o.status,'Customer: Name':salesCustomerDisplay(o.customerId)});
 return vars;
}
function stkFill(text,d){return String(text||'').replace(/\{([^{}]{1,80})\}/g,(m,k)=>d&&d.vars&&Object.prototype.hasOwnProperty.call(d.vars,k.trim())?d.vars[k.trim()]:'');}
function stkOrderData(o,l,li){
 const due=stkDue(o.dueDate);
 return {order:o.businessNumber||'',line:li+1,customer:salesCustomerDisplay(o.customerId),po:o.customerPo||'',mark:l.mark||'',due:due.day,dueWeekday:due.weekday,
  rush:['rush','critical'].includes(o.priority),priority:o.priority&&o.priority!=='normal'?(SALES_LIST_PRIORITY[o.priority]||''):'',delivery:salesDeliveryLabel(o.delivery),created:stkDue(String(o.createdAt||'').slice(0,10)).day,vars:stkVars(o,l,li)};
}
/* Одно стекло: название и код, толщина, закалка, HST, сторона покрытия,
   фрит и спандрел со своей стороной. Сторона берётся тем же контрактом, что
   у маршрута и схемы Makeup — второго источника нет. */
function stkGlassInfo(pane,index,ply){
 const spec=ply?(pane&&pane.laminated||{})[ply]:pane,g=glassProductById(spec&&spec.glassProductId),ht=spec&&mdById('heatTreatment',spec.heatTreatmentId);
 const treatments=pane?salesRouteSurfaceTreatments(pane,index,ply||''):[],coat=treatments.find(t=>t.kind==='coating'&&t.surface);
 return {name:g?g.name:'Unknown glass',code:g?g.code:'',mm:g&&+g.thicknessMm||+(spec&&spec.thicknessMm)||null,heat:ht&&ht.code&&ht.code!=='AN'?ht.name:'',
  heatSoak:!!(spec&&spec.heatSoak&&ht&&ht.code==='FT'),surface:coat?coat.where:'',paint:treatments.filter(t=>t.kind!=='coating').map(t=>t.summary),ply:ply||''};
}
function stkPieceArea(l,o){const a=salesLineAreas(l,o);return a&&a.valid?a.actual:null;}
function stkPlan(o,l){try{return salesEffectiveCuttingPlan(l,salesLineGeometryShape(l),o);}catch(e){return {valid:false};}}
function stkIsRect(pts){
 if(!pts||pts.length!==4)return false;
 const xs=new Set(pts.map(p=>Math.round(p[0]*1000))),ys=new Set(pts.map(p=>Math.round(p[1]*1000)));
 return xs.size===2&&ys.size===2;
}
/* Контур — из плана резки лайта (тот же, что режут: DXF, своя форма лайта,
   зеркало). Прямоугольник без отверстий и вырезов контур не печатает.
   Владелец, 17 сентября 2026: форма подтягивалась не всегда — брали фигуру
   позиции, а не лайта, и в шаблонах лёжа и 3×4 блок был выключен. */
function stkShapeOf(lite){
 if(!lite)return null;
 const pts=(lite.finishedPoints||[]).map(p=>[+p[0],+p[1]]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));if(pts.length<3)return null;
 const fg=lite.result&&lite.result.featureGeometry||{},src=(lite.result&&lite.result.points||pts).map(p=>+p[0]),minX=Math.min(...src),maxX=Math.max(...src),mx=x=>lite.mirrored?minX+maxX-x:x;
 const holes=(fg.holes||[]).map(h=>({x:mx(+h.center[0]),y:+h.center[1],d:+h.diameter})).filter(h=>h.d>0&&Number.isFinite(h.x)&&Number.isFinite(h.y));
 const polys=[].concat(fg.cutouts||[],fg.hardware||[]).map(c=>(c.points||[]).map(p=>[mx(+p[0]),+p[1]])).filter(p=>p.length>2);
 if(stkIsRect(pts)&&!holes.length&&!polys.length)return null;
 return {points:pts,holes,polys};
}
function stkFinished(lite,l){return lite&&+lite.finishedW>0&&+lite.finishedH>0?{w:+lite.finishedW,h:+lite.finishedH}:{w:l.width16/16,h:l.height16/16};}
/* Размер до обработки кромки — размер реза: готовый плюс припуск кромки и
   запас по косой стороне. Владелец, 17 сентября 2026: «бордер не нужно,
   можно размер до обработки кромки». Печатается, только если отличается. */
function stkCut(lite,fin){
 if(!lite||!(+lite.cutW>0)||!(+lite.cutH>0))return null;
 const w=+lite.cutW,h=+lite.cutH;return Math.abs(w-fin.w)<1/32&&Math.abs(h-fin.h)<1/32?null:{w,h};
}
/* Маршрут стекла — та же полоса, что на печатном листе чертежа. К ней
   дописываются станции «always», которых нет в полосе (SHIPR, SHIP). */
function stkRoute(o,l,c){
 const r=salesPrintRoute(l,o,salesLineGeometryShape(l),null),row=r.lites.find(x=>x.label==='Lite '+c.lite)||r.lites[c.index]||r.lites[0]||{stations:[]};
 const codes=row.stations.map(s=>s.code),tail=[];
 (DB.station||[]).filter(s=>s.always).sort((a,b)=>(+a.seq||0)-(+b.seq||0)).forEach(s=>{if(!codes.includes(s.code)){codes.push(s.code);tail.push(s.code);}});
 const services=[];
 row.stations.forEach(s=>{if(s.code===salesRouteStationOf('cutting','CUT'))return;s.items.forEach(t=>{if(t===s.name)return;const text=String(t).toUpperCase();if(!services.some(x=>x.text===text))services.push({station:s.code,text});});});
 return {codes,shipping:tail,services};
}
function stkWeight(l,o,lite){
 const w=salesLineWeight(l,o);
 if(lite==null)return w.kg!=null?{kg:w.kg,exact:true}:w.knownKg?{kg:w.knownKg,exact:false}:null;
 const rows=w.rows.filter(r=>r.label.startsWith('Lite '+lite+' ·')&&r.kg!=null);
 return rows.length?{kg:rows.reduce((s,r)=>s+r.kg,0),exact:true}:null;
}
/* kind: production | final. unit — номер изделия или место Recut «R1.2». */
function stkGlassData(kind,o,l,c,unit,opts){
 opts=opts||{};
 return finWithOrder(o,()=>{
  const li=o.lines.indexOf(l),m=salesMakeupById(o,l.makeupId),panes=m&&m.panes||[],recut=typeof unit==='string',nr=recut?unit.split('.')[0]:'';
  const plan=stkPlan(o,l),cut=plan.valid&&(plan.lites||[]).find(x=>x.index===c.index);
  const rec=glassPieceMap(o.id).get(c.key),comps=glassBatchComponents(o,l);
  return Object.assign(stkOrderData(o,l,li),{kind,id:glassPieceAt(rec,unit)||'',unit:recut?0:unit,of:l.qty,lite:c.lite,lites:panes.length,recut:recut?'RECUT '+nr.replace(/^R/,''):'',batch:opts.batch||'',
   glass:c.missing?{name:'Glass missing',code:'',mm:null,heat:'',heatSoak:false,surface:'',paint:[],ply:''}:stkGlassInfo(c.pane,c.index,c.ply),
   cut:stkCut(cut,stkFinished(cut,l)),finished:stkFinished(cut,l),area:stkPieceArea(l,o),weight:stkWeight(l,o,c.lite),
   shape:stkShapeOf(cut),route:kind==='production'?stkRoute(o,l,c):null,summary:comps.length>1&&m?salesMakeupSummary(m):''});
 });
}
function stkUnitData(o,l,unit){
 return finWithOrder(o,()=>{
  const li=o.lines.indexOf(l),m=salesMakeupById(o,l.makeupId),panes=m&&m.panes||[],lam=panes.some(p=>p.category==='laminated');
  const rows=[];
  panes.forEach((p,i)=>{
   if(i){const cav=m.cavities[i-1]||{},sp=mdById('spacerVariant',cav.spacerVariantId),gas=mdById('gasProduct',cav.gasProductId),seal=[cav.primarySealantId,cav.secondarySealantId].map(id=>mdById('sealantProduct',id)).filter(Boolean);
    rows.push({kind:'space',label:'Space',spacer:sp?sp.name:'',gas:gas&&gas.code!=='AIR'?gas.name:'',sealant:seal.map(x=>x.code||x.name).join(' / ')});}
   if(p.category==='laminated'){const L=p.laminated||{};
    rows.push({kind:'lam',label:'Lite '+(i+1),outer:stkGlassInfo(p,i,'outer'),inner:stkGlassInfo(p,i,'inner'),films:(L.interlayers||[]).map(f=>{const prod=mdById('interlayerProduct',f.productId);return {name:prod?prod.name:'Interlayer',mm:+f.thicknessMm||null,layers:+f.layers||1};})});}
   else rows.push({kind:'glass',label:'Lite '+(i+1),glass:stkGlassInfo(p,i,'')});
  });
  const plan=stkPlan(o,l),lite=plan.valid&&(plan.lites||[])[0],mm=m?salesMakeupThicknessMm(m):null,type=m&&m.unitType==='triple'?'Triple IGU':m&&m.unitType==='double'?'IGU':lam?'Laminated glass':'Single lite',muntin=salesLineMuntin(l);
  return Object.assign(stkOrderData(o,l,li),{kind:'unit',id:unitIdAt(o.id,l.id,unit),unit,of:l.qty,lite:'',lites:panes.length,recut:'',batch:'',
   heading:type+(lam&&m.unitType!=='single'?' · laminated':''),thicknessMm:mm,code:m?salesMakeupSummary(m):'',rows,muntin:muntin?'Muntins · '+salesMuntinSections(l)+' sections':'',
   finished:stkFinished(lite,l),cut:null,area:stkPieceArea(l,o),weight:stkWeight(l,o,null),shape:stkShapeOf(lite)});
 });
}
/* Образец для конструктора, когда в программе ещё нет заказов. */
function stkDemoData(type){
 const base={order:'76622',line:1,customer:'Northside Windows',po:'123',mark:'Kitchen W2',due:'Sep 25',dueWeekday:'Fri',rush:false,priority:'',delivery:'Delivery',created:'Sep 17',
  unit:2,of:5,lites:2,recut:'',batch:'B-0001',finished:{w:37,h:71},cut:{w:37.125,h:71.125},area:18.24,shape:null,
  vars:{'Customer: Name':'Northside Windows','Customer: Phone':'416 555 0199','Line: Mark':'Kitchen W2','Order: Notes':'Call before delivery'}};
 const glass={name:'Solarban 60 on Clear 6mm',code:'6SBN60',mm:6,heat:'Tempered',heatSoak:false,surface:'#2',paint:[],ply:''};
 if(type==='unit')return Object.assign(base,{kind:'unit',id:'U-0000001',lite:'',heading:'IGU',thicknessMm:25.6,code:'6CLEAR / 17/32 Black Warm Edge ARG / 6SBN60',muntin:'',weight:{kg:48.6,exact:true},
  rows:[{kind:'glass',label:'Lite 1',glass:Object.assign({},glass,{name:'Clear 6mm',code:'6CLEAR',surface:''})},{kind:'space',label:'Space',spacer:'Black Warm Edge 17/32″',gas:'Argon',sealant:'PIB / PS'},{kind:'glass',label:'Lite 2',glass}]});
 return Object.assign(base,{kind:type,id:'G-0000002',lite:'2',glass,weight:{kg:24.3,exact:true},summary:'6CLEAR / 17/32 Black Warm Edge ARG / 6SBN60',
  route:type==='production'?{codes:['CUT','EDGE','HEAT','IGU','SHIPR','SHIP'],shipping:['SHIPR','SHIP'],services:[{station:'EDGE',text:'ROUGH ARRIS'},{station:'HEAT',text:'TEMPERING'}]}:null});
}
