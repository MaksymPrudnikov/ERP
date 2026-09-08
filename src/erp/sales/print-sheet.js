/* =====================================================================
   sales/print-sheet  ·  печатный лист чертежа
   IN : фигура + её результат + строка заказа (может не быть)
   OUT: разметка листа для printSheetPrepare

   Раскладка задана владельцем: сверху слева тип стекла и размеры, справа
   заказчик / заказ / PO, посередине большой чертёж, снизу путь стекла по
   станциям мелким шрифтом — он же служит сверкой с чертежом, отдельной легенды
   на листе нет. Лишних рамок нет: только две разделительные линии.
   Нет значения — остаётся пустота, а не прочерк.
   ===================================================================== */

function salesSheetLineOf(shape){
  if(typeof soDraft==='undefined'||!soDraft)return null;
  var id=(typeof salesBridge!=='undefined'&&salesBridge&&salesBridge.kind==='shape')?salesBridge.lineId:null;
  var lines=soDraft.lines||[];
  var line=id?lines.find(function(l){return l.id===id;}):null;
  if(!line&&shape&&shape.ownerLineId)line=lines.find(function(l){return l.id===shape.ownerLineId;});
  return line||null;
}
function salesSheetLineNumber(line){
  if(!line||typeof soDraft==='undefined'||!soDraft)return '';
  var i=(soDraft.lines||[]).indexOf(line);
  return i<0?'':String(i+1);
}
/* Заголовок листа: у одинарного стекла это само стекло, у пакета — его состав.
   Разбивка L1 / C1 / L2 показывает, что за чем стоит. */
function salesSheetTitleLines(makeup,line){
  if(makeup&&(makeup.panes||[]).length>1){
    var mm=salesMakeupThicknessMm(makeup),kind=makeup.unitType==='triple'?'Triple':'Double';
    return {name:'Makeup '+String(makeup.code||''),spec:kind+(mm?' '+(Math.round(mm*10)/10)+' mm':'')};
  }
  var pane=makeup&&(makeup.panes||[])[0];
  if(pane&&pane.category==='laminated'&&typeof salesPaneProductSummary==='function')
    return {name:'Laminated',spec:salesPaneProductSummary(pane,0)};
  if(pane)return {name:salesGlassNameForPane(pane),spec:''};
  return {name:(line&&line.mark)||'Production Shape',spec:''};
}
/* «10 mm Clear», а не «Clear 10mm»: толщина читается первой. Если она уже
   вписана в название продукта, оттуда её и убираем, чтобы не повторялась. */
function salesSheetThicknessFirst(name,mm){
  var out=String(name||'');
  if(isFinite(mm)&&mm>0){
    out=out.replace(new RegExp('\\s*\\b'+mm+'\\s*mm\\b','i'),'').replace(/\s{2,}/g,' ').trim();
    return (mm+' mm'+(out?' '+out:'')).trim();
  }
  return out;
}
function salesGlassNameForPane(pane){
  if(!pane)return '';
  if(pane.category==='laminated')return 'Laminated';
  var g=glassProductById(pane.glassProductId),name=g?(g.name||g.code):'',ht=salesRouteHeatOf(pane);
  return salesSheetThicknessFirst(name,salesPaneGlassThicknessMm(pane))+(ht&&ht!=='AN'?' · '+ht:'')+(pane.heatSoak&&ht==='FT'?' + HST':'');
}
/* Состав пакета — ГОРИЗОНТАЛЬНОЕ сечение, как его рисует стекольщик: слои лежат
   стопкой сверху вниз от наружной стороны к внутренней, подпись стоит слева от
   своего слоя. Полость показана распорками по краям, покрытие — жирной линией
   на той грани, где оно на самом деле лежит.
   Разметка не SVG: на бумаге это несколько прямоугольников и текст, а текст
   в HTML набирается тем же шрифтом, что и весь лист. */
/* В самом чертеже места мало, поэтому используем складской код, а не длинное
   маркетинговое имя. Термообработка остаётся отдельной явной пометкой: её
   нельзя угадывать из похожего кода продукта. */
function salesSheetGlassCode(glass){
  return String(glass&&(glass.code||glass.name)||'').trim();
}
function salesSheetPlyText(ply){
  if(!ply)return '';
  var g=glassProductById(ply.glassProductId),ht=String(ply.heatTreatmentId||'').replace(/^HT-/,'').toUpperCase();
  return salesSheetGlassCode(g)+(ht&&ht!=='AN'?' '+ht:'')+(ply.heatSoak&&ht==='FT'?' + HST':'');
}
/* Плёнка межслойная: сколько слоёв, какой толщины и чего именно. */
function salesSheetFilmText(film){
  if(!film)return '';
  var pr=(typeof mdById==='function')?mdById('interlayerProduct',film.productId):null;
  var layers=+film.layers||1,mm=+film.thicknessMm;
  return (layers>1?layers+' × ':'')+(isFinite(mm)&&mm>0?mm+' mm ':'')+((pr&&(pr.code||pr.name))||'');
}
/* Каждая пометка принадлежит своей физической грани; обе грани могут быть
   заняты. Текст и маршрут читают один и тот же контракт Makeup. */
function salesSheetTreatmentText(treatments){
  return (treatments||[]).map(function(t){return t.kind==='frit'?'Frit · '+t.where:t.summary;}).join(' · ');
}
/* Короткая подпись поверхности для верхней схемы. Полный рецепт остаётся в
   маршруте ниже листа; здесь нужны код материала и однозначная грань. */
function salesSheetTreatmentCode(treatments){
  return (treatments||[]).map(function(t){
    if(t.kind==='coating')return t.where;
    var table=t.kind==='frit'?'fritProduct':'spandrelProduct';
    var product=(typeof mdById==='function')?mdById(table,t.spec&&t.spec.productId):null;
    var kind=t.kind==='frit'?'FRIT':'SPDL',code=product&&(product.code||product.name);
    return [kind,code,t.spec&&t.spec.color,t.where].filter(Boolean).join(' ');
  }).join(' ');
}
function salesSheetTreatmentFaces(treatments){
  return ['out','in'].filter(function(face){
    return (treatments||[]).some(function(t){return t.face===face;});
  }).map(function(face){return ' coat-'+face;}).join('');
}
/* Слоёный ли юнит: пакет, ламинат или спандрел. От этого зависит вся верхняя
   раскладка листа. */
function salesSheetIsLayered(makeup){
  var panes=(makeup&&makeup.panes)||[];
  if(panes.length>1)return true;
  return panes.some(function(p,i){return p&&(p.category==='laminated'||salesRouteSurfaceTreatments(p,i).length>0);});
}
function salesSheetPaneText(pane,index){
  if(!pane)return '';
  var g=glassProductById(pane.glassProductId);
  var bits=[salesSheetGlassCode(g)],what=salesSheetTreatmentCode(salesRouteSurfaceTreatments(pane,index));
  if(what)bits.push(what);
  var ht=salesRouteHeatOf(pane);
  if(ht&&ht!=='AN')bits.push(ht+(pane.heatSoak&&ht==='FT'?' + HST':''));
  return bits.filter(Boolean).join(' ');
}
function salesSheetSpacerCode(sp){
  if(!sp)return '';
  var systems=typeof SPACER_SYSTEMS!=='undefined'?SPACER_SYSTEMS:[];
  var known=systems.find(function(s){return s.system===sp.system;});
  if(known)return known.code;
  var id=String(sp.id||''),match=id.match(/^SP-([^-]+)-/i);
  return match?match[1].toUpperCase():String(sp.system||sp.code||'').trim();
}
function salesSheetCavityText(makeup,i){
  var c=(makeup.cavities||[])[i-1];
  var sp=mdById('spacerVariant',c&&c.spacerVariantId),gas=mdById('gasProduct',c&&c.gasProductId);
  var spacer=sp?[sp.size,salesSheetSpacerCode(sp)].filter(Boolean).join(' '):'';
  return spacer+(gas&&gas.code&&gas.code!=='AIR'?('+'+gas.code):'')||('Cavity '+i);
}
/* Раскладка принадлежит форме строки, поэтому Makeup сам по себе о ней не
   знает. Схема сечения получает текущую форму, включая ещё не сохранённый
   черновик. Размеры профиля берём из каталога, стороны — с учётом разворота. */
function salesSheetMuntinInfo(shape){
  var m=shape&&shape.muntin;
  if(!m||!m.enabled||!(m.verticalBars||m.horizontalBars))return null;
  var p=muntinProduct(m.productId),flip=!!m.flipped;
  var outside=flip?p.interiorColor:p.exteriorColor,inside=flip?p.exteriorColor:p.interiorColor;
  /* Чёрный и белый на производственном листе печатаются чистыми цветами.
     Для других цветов принимаем только hex, а не произвольный CSS из JSON. */
  function ink(name,hex){
    if(/^white$/i.test(name))return '#ffffff';
    if(/^black$/i.test(name))return '#000000';
    return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex||'')?hex:'#000000';
  }
  var ext=ink(outside,flip?p.interiorHex:p.exteriorHex);
  var int=ink(inside,flip?p.exteriorHex:p.interiorHex);
  var text='Muntin bar: '+p.label;
  var size=dimIn(p.faceWidthIn)+' × '+dimIn(p.depthIn);
  /* Каталожная подпись может быть именем профиля без размеров. */
  if(p.label.indexOf(dimIn(p.faceWidthIn))<0||p.label.indexOf(dimIn(p.depthIn))<0)text+=' · '+size;
  if(outside!==inside)text+=' · '+outside+' ext / '+inside+' int';
  var width=Math.max(12,Math.min(60,8*p.faceWidthIn/Math.max(p.depthIn,0.01)));
  var svg='<svg class="mk-muntin" style="width:'+width+'px;height:8px" width="'+width+'" height="8" viewBox="0 0 '+width+' 8" aria-hidden="true">'+
    '<rect width="'+width+'" height="8" fill="'+ext+'"/>'+
    (ext!==int?'<rect y="4" width="'+width+'" height="4" fill="'+int+'"/>':'')+
    '<rect x="0.5" y="0.5" width="'+(width-1)+'" height="7" fill="none" stroke="#000000" stroke-width="1"/>'+
    '</svg>';
  return {text:text,svg:svg};
}
/* Верхняя грань подписана сверху, нижняя снизу — на своей высоте. Обе в одну
   строку читались как «1 2» без понимания, где какая. */
function salesSheetFaceNums(top,bottom){
  return '<em class="mk-faces"><i>'+(top?'#'+top:'')+'</i><i>'+(bottom?'#'+bottom:'')+'</i></em>';
}
function salesSheetMakeupHTML(makeup,shape){
  var panes=(makeup&&makeup.panes)||[];
  /* Схема нужна там, где слоёв больше одного: пакет, ламинат, спандрел с его
     поверхностью. У простого одинарного стекла всё сказано в заголовке слева. */
  if(!salesSheetIsLayered(makeup))return '';
  var rows='',muntin=salesSheetMuntinInfo(shape),m=shape&&shape.muntin;
  /* Double имеет единственную камеру. У Triple отсутствие выбора нельзя
     выдавать за наружную камеру или дублировать раскладку в обеих. */
  var cavityIndex=panes.length===2?0:(m&&(m.cavityIndex===0||m.cavityIndex===1)?m.cavityIndex:null);
  panes.forEach(function(p,i){
    if(i){
      var bar=i-1===cavityIndex?muntin:null;
      rows+='<div class="mk-row"><span>Cavity'+(panes.length>2?' '+i:'')+': '+esc(salesSheetCavityText(makeup,i))+
        (bar?'<small class="mk-muntin-text">'+esc(bar.text)+'</small>':'')+'</span>'+
        '<i class="mk-cav">'+(bar?bar.svg:'')+'</i><em></em></div>';
    }
    var surf=salesPaneSurfaces(i),face=salesSheetTreatmentFaces(salesRouteSurfaceTreatments(p,i));
    /* Ламинат — не один слой: внутри свои стёкла и плёнки между ними, и по
       хендофу 9м это ДВА отдельных стекла со своими L-номерами. Показываем их
       раздельно, иначе цех не увидит, что именно склеивают. */
    if(p.category==='laminated'){
      var lam=p.laminated||{},films=lam.interlayers||[];
      var outer=salesRouteSurfaceTreatments(p,i,'outer'),inner=salesRouteSurfaceTreatments(p,i,'inner');
      rows+='<div class="mk-row"><span>Lite '+(i+1)+'a: '+esc([salesSheetPlyText(lam.outer),salesSheetTreatmentCode(outer)].filter(Boolean).join(' '))+'</span>'+
        '<i class="mk-pane'+salesSheetTreatmentFaces(outer)+'"></i>'+salesSheetFaceNums(surf[0],'')+'</div>';
      films.forEach(function(f){
        rows+='<div class="mk-row"><span>film: '+esc(salesSheetFilmText(f))+'</span>'+
          '<i class="mk-film"></i><em></em></div>';
      });
      rows+='<div class="mk-row"><span>Lite '+(i+1)+'b: '+esc([salesSheetPlyText(lam.inner),salesSheetTreatmentCode(inner)].filter(Boolean).join(' '))+'</span>'+
        '<i class="mk-pane'+salesSheetTreatmentFaces(inner)+'"></i>'+salesSheetFaceNums('',surf[1])+'</div>';
      return;
    }
    rows+='<div class="mk-row"><span>Lite '+(i+1)+': '+esc(salesSheetPaneText(p,i))+'</span>'+
      '<i class="mk-pane'+face+'"></i>'+salesSheetFaceNums(surf[0],surf[1])+'</div>';
  });
  if(muntin&&panes.length>2&&cavityIndex==null)
    rows+='<div class="mk-muntin-unassigned">'+esc(muntin.text)+' · Cavity not selected</div>';
  return '<div class="sheet-mk-rows">'+rows+'</div>';
}
function salesSheetRouteHTML(route){
  if(!route||!route.lites.length)return '';
  /* Цепочкой, а не таблицей: колонки под две станции растягивались на всю
     ширину и оставляли пустоту. Здесь строка ровно такой длины, какой нужно. */
  var body=route.lites.map(function(l){
    var chain=l.stations.map(function(s){
      return '<b>'+esc(s.code)+'</b> '+s.items.map(function(t){return esc(t);}).join(' · ');
    }).join('<i>&rsaquo;</i>');
    /* Подписан и одинарный лайт: без подписи слева оставалась пустая колонка,
       и строка маршрута начиналась с провала. */
    var name=[l.label,l.glass].filter(Boolean).join(' · ');
    return '<div class="sheet-leg'+(name?'':' bare')+'">'+
      (name?'<span>'+esc(name)+'</span>':'')+
      '<em>'+chain+'</em></div>';
  }).join('');
  return '<div class="sheet-route"><div class="sheet-route-t">ROUTE</div>'+body+'</div>';
}
/* Собирает лист. svg — уже готовый чертёж без собственного заголовка. */
/* Вес одного слоя пакета. У ламината это ОБА стекла и плёнка между ними:
   лист показывал вес одной панели, и 6 + 6 весил как шестёрка — вдвое меньше
   настоящего. По этой цифре в цехе считают подъём. */
function salesSheetPaneWeightKg(pane,areaFt2){
  if(!pane)return null;
  if(pane.category!=='laminated')
    return glassWeightKg(glassProductById(pane.glassProductId),areaFt2);
  var lam=pane.laminated||{},total=0,exact=true,got=false;
  [lam.outer,lam.inner].forEach(function(ply){
    if(!ply)return;
    var w=glassWeightKg(glassProductById(ply.glassProductId),areaFt2);
    if(!w){
      var mm=+ply.thicknessMm;
      if(!(mm>0))return;
      w={kg:glassLayerWeightKg(mm,GLASS_DENSITY_KG_M3,areaFt2),exact:false};
    }
    total+=w.kg;if(!w.exact)exact=false;got=true;
  });
  (lam.interlayers||[]).forEach(function(f){
    total+=glassLayerWeightKg(f&&f.thicknessMm,GLASS_INTERLAYER_DENSITY_KG_M3,areaFt2);
  });
  return got&&total>0?{kg:total,exact:exact}:null;
}
function salesSheetWeightText(w){
  if(!w)return '';
  return (w.exact?'':'~')+(w.kg>=10?Math.round(w.kg):w.kg.toFixed(1))+' kg';
}
function salesShapeSheetHTML(shape,result,svg,kind){
  var line=salesSheetLineOf(shape);
  var order=(typeof soDraft!=='undefined')?soDraft:null;
  var makeup=(line&&order&&typeof salesMakeupById==='function')?salesMakeupById(order,line.makeupId):null;
  var areaFt2=result&&result.valid?result.area/144:0;
  var pane=makeup&&(makeup.panes||[])[0];
  var weight='';
  if(makeup&&(makeup.panes||[]).length){
    var total=0,exact=true,ok=true;
    (makeup.panes||[]).forEach(function(p){
      var w=salesSheetPaneWeightKg(p,areaFt2);
      if(!w){ok=false;return;}
      total+=w.kg;if(!w.exact)exact=false;
    });
    if(ok&&total>0)weight=salesSheetWeightText({kg:total,exact:exact});
  }else if(pane)weight=salesSheetWeightText(salesSheetPaneWeightKg(pane,areaFt2));

  var finished=result&&result.valid?dimIn16(result.width)+' × '+dimIn16(result.height):'';
  var size=finished?'Finished '+finished:'';
  var mass=[areaFt2?areaFt2.toFixed(2)+' sq ft':'',weight?weight:''].filter(Boolean).join(' · ');
  var lineText=salesSheetLineNumber(line);
  var route=salesPrintRoute(line,order,shape,result);

  var layered=salesSheetIsLayered(makeup),t=salesSheetTitleLines(makeup,line);
  /* Одинарное стекло считают штуками, пакет и ламинат — юнитами: это разные
     вещи на складе и в отгрузке. */
  var n=line?(line.qty||1):0;
  var assembled=makeup&&((makeup.panes||[]).length>1||(makeup.panes||[]).some(function(p){return p.category==='laminated';}));
  var qty=line?(n+' '+(assembled?(n===1?'unit':'units'):(n===1?'pc':'pcs'))):'';
  /* Метка строки — это примечание цеху, поэтому она стоит в NOTE, а не рядом с
     номером: владелец «Note это и есть d2». Свободный текст строки идёт следом. */
  var note=[line&&line.mark,line&&line.notes].filter(Boolean).join(' · ');
  return '<div class="print-shape-sheet">'+
    /* Три опоры, по которым лист опознают, — одной строкой поверх всего:
       заказчик слева, PO по центру, номер заказа справа. */
    '<div class="sheet-id">'+
      '<div class="sheet-id-c"><span>Customer:</span><b>'+
        esc(order?salesCustomerDisplay(order.customerId):'')+'</b></div>'+
      '<div class="sheet-id-p"><span>PO:</span><b>'+
        esc(order&&order.customerPo||'')+'</b></div>'+
      '<div class="sheet-id-o"><span>Order Number:</span><b>'+
        esc(order&&order.businessNumber||'')+'</b></div>'+
    '</div>'+
    /* Чертёж слева во всю высоту, состав и числа — колонкой справа. */
    '<div class="sheet-body">'+
      '<div class="sheet-field">'+svg+'</div>'+
      '<div class="sheet-side'+(layered?' layered':'')+'">'+
        '<div class="sheet-name">'+
          '<div class="sheet-title">'+esc(t.name)+'</div>'+
          (t.spec?'<div class="sheet-spec">'+esc(t.spec)+'</div>':'')+
          (qty?'<div class="sheet-qty">'+esc(qty)+'</div>':'')+
        '</div>'+
        (layered?'<div class="sheet-mk">'+salesSheetMakeupHTML(makeup,shape)+'</div>':'')+
        '<div class="sheet-nums">'+
          (size?'<div class="sheet-size">'+esc(size)+'</div>':'')+
          (mass?'<div class="sheet-mass">'+esc(mass)+'</div>':'')+
          '<div class="sheet-who">'+
            '<span>LINE</span><b>'+esc(lineText)+'</b>'+
            '<span>NOTE</span><b class="sheet-note">'+esc(note)+'</b>'+
          '</div>'+
        '</div>'+
      '</div>'+
    '</div>'+
    salesSheetRouteHTML(route)+
    '<div class="sheet-foot"><span></span>'+
      '<span>'+esc(new Date().toISOString().slice(0,10))+' · 1 / 1</span></div>'+
  '</div>';
}
/* Состав стоит СПРАВА от чертежа — так решил владелец, и это раскладка по
   умолчанию. Уступает она только там, где сама себе мешает: у лежачей фигуры
   узкая колонка режет чертёж по ширине, он не добирает и двух третей высоты, а
   низ листа уходит в пустоту. Тогда состав встаёт полосой наверх — и там он
   тоже справа — а чертёж забирает всю ширину.

   Сравнивать площади двух раскладок нельзя: полоса стоит листу около десятой
   части высоты, а колонка — трети ширины, и по площади полоса выигрывала
   всегда, даже у стоячей фигуры, которой колонка ничем не мешает. */
/* Чертёж внутри листа занимает всё отведённое место: пустые поля канвы
   обрезаются по фактическому содержимому, иначе фигура сидит в пустоте. */
function salesSheetFitDrawing(host){
  var svg=host&&host.querySelector('.sheet-field svg');if(!svg||!svg.getBBox)return;
  try{
    var b=svg.getBBox();if(!(b.width>0&&b.height>0))return;
    var m=Math.max(6,Math.min(b.width,b.height)*0.02);
    svg.setAttribute('viewBox',(b.x-m).toFixed(1)+' '+(b.y-m).toFixed(1)+' '+
      (b.width+m*2).toFixed(1)+' '+(b.height+m*2).toFixed(1));
  }catch(e){}
}
