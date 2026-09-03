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
  return salesSheetThicknessFirst(name,salesPaneGlassThicknessMm(pane))+(ht&&ht!=='AN'?' · '+ht:'');
}
/* Состав пакета — ГОРИЗОНТАЛЬНОЕ сечение, как его рисует стекольщик: слои лежат
   стопкой сверху вниз от наружной стороны к внутренней, подпись стоит слева от
   своего слоя. Полость показана распорками по краям, покрытие — жирной линией
   на той грани, где оно на самом деле лежит.
   Разметка не SVG: на бумаге это несколько прямоугольников и текст, а текст
   в HTML набирается тем же шрифтом, что и весь лист. */
/* Один слой стекла: толщина, название, термообработка, поверхность покрытия. */
function salesSheetPlyText(ply){
  if(!ply)return '';
  var g=glassProductById(ply.glassProductId),name=g?(g.name||g.code):'';
  var mm=+ply.thicknessMm,ht=String(ply.heatTreatmentId||'').replace(/^HT-/,'').toUpperCase();
  return salesSheetThicknessFirst(name,mm)+(ht&&ht!=='AN'?' · '+ht:'');
}
/* Плёнка межслойная: сколько слоёв, какой толщины и чего именно. */
function salesSheetFilmText(film){
  if(!film)return '';
  var pr=(typeof mdById==='function')?mdById('interlayerProduct',film.productId):null;
  var layers=+film.layers||1,mm=+film.thicknessMm;
  return (layers>1?layers+' × ':'')+(isFinite(mm)&&mm>0?mm+' mm ':'')+((pr&&(pr.code||pr.name))||'');
}
/* Какая поверхность помечена у этого слоя: покрытие, спандрел или фрит.
   Ноль означает «ничем не занята». */
function salesSheetMarkedSurface(pane){
  if(!pane)return 0;
  if(pane.category==='spandrel')return +(pane.spandrel&&pane.spandrel.surface)||0;
  if(pane.visionType==='frit')return +(pane.frit&&pane.frit.surface)||0;
  return +pane.coatingSurface||0;
}
/* Чем занята поверхность — словом, как в конфигураторе Makeup. */
function salesSheetSurfaceLabel(pane){
  if(!pane)return '';
  if(pane.category==='spandrel')return 'Spandrel'+(pane.spandrel&&pane.spandrel.color?' '+pane.spandrel.color:'');
  if(pane.visionType==='frit')return 'Frit'+(pane.frit&&pane.frit.color?' '+pane.frit.color:'');
  if(pane.visionType==='lowe'||pane.visionType==='reflective')
    return (typeof salesVisionTypeLabel==='function')?salesVisionTypeLabel(pane.visionType):'Coated';
  return '';
}
/* Слоёный ли юнит: пакет, ламинат или спандрел. От этого зависит вся верхняя
   раскладка листа. */
function salesSheetIsLayered(makeup){
  var panes=(makeup&&makeup.panes)||[];
  if(panes.length>1)return true;
  return panes.some(function(p){return p&&(p.category==='laminated'||p.category==='spandrel');});
}
function salesSheetPaneText(pane,index){
  if(!pane)return '';
  if(pane.category==='laminated')
    return (typeof salesPaneProductSummary==='function')?salesPaneProductSummary(pane,index):'Laminated';
  var g=glassProductById(pane.glassProductId);
  var mm=salesPaneGlassThicknessMm(pane),name=g?(g.name||g.code):'';
  var bits=salesSheetThicknessFirst(name,mm);
  var ht=salesRouteHeatOf(pane),what=salesSheetSurfaceLabel(pane),sf=salesSheetMarkedSurface(pane);
  if(what)bits+=' · '+what;
  if(sf)bits+=' · #'+sf;
  if(ht&&ht!=='AN')bits+=' · '+ht;
  return bits;
}
function salesSheetCavityText(makeup,i){
  var c=(makeup.cavities||[])[i-1];
  var sp=mdById('spacerVariant',c&&c.spacerVariantId),gas=mdById('gasProduct',c&&c.gasProductId);
  var bits=[sp?(sp.size+(sp.system?' '+sp.system:'')):'',gas?gas.code:''].filter(Boolean);
  return bits.join(' + ')||('Cavity '+i);
}
/* Верхняя грань подписана сверху, нижняя снизу — на своей высоте. Обе в одну
   строку читались как «1 2» без понимания, где какая. */
function salesSheetFaceNums(top,bottom){
  return '<em class="mk-faces"><i>'+(top?'#'+top:'')+'</i><i>'+(bottom?'#'+bottom:'')+'</i></em>';
}
function salesSheetMakeupHTML(makeup){
  var panes=(makeup&&makeup.panes)||[];
  /* Схема нужна там, где слоёв больше одного: пакет, ламинат, спандрел с его
     поверхностью. У простого одинарного стекла всё сказано в заголовке слева. */
  if(!salesSheetIsLayered(makeup))return '';
  var rows='';
  panes.forEach(function(p,i){
    if(i)rows+='<div class="mk-row"><span>Cavity: '+esc(salesSheetCavityText(makeup,i))+'</span>'+
      '<i class="mk-cav"></i><em></em></div>';
    var surf=salesPaneSurfaces(i),sf=salesSheetMarkedSurface(p);
    var face=sf===surf[0]?' coat-out':sf===surf[1]?' coat-in':'';
    /* Ламинат — не один слой: внутри свои стёкла и плёнки между ними, и по
       хендофу 9м это ДВА отдельных стекла со своими L-номерами. Показываем их
       раздельно, иначе цех не увидит, что именно склеивают. */
    if(p.category==='laminated'){
      var lam=p.laminated||{},films=lam.interlayers||[];
      rows+='<div class="mk-row"><span>Lite '+(i+1)+'a: '+esc(salesSheetPlyText(lam.outer))+'</span>'+
        '<i class="mk-pane'+(sf===surf[0]?' coat-out':'')+'"></i>'+salesSheetFaceNums(surf[0],'')+'</div>';
      films.forEach(function(f){
        rows+='<div class="mk-row"><span>film: '+esc(salesSheetFilmText(f))+'</span>'+
          '<i class="mk-film"></i><em></em></div>';
      });
      rows+='<div class="mk-row"><span>Lite '+(i+1)+'b: '+esc(salesSheetPlyText(lam.inner))+'</span>'+
        '<i class="mk-pane'+(sf===surf[1]?' coat-in':'')+'"></i>'+salesSheetFaceNums('',surf[1])+'</div>';
      return;
    }
    rows+='<div class="mk-row"><span>Lite '+(i+1)+': '+esc(salesSheetPaneText(p,i))+'</span>'+
      '<i class="mk-pane'+face+'"></i>'+salesSheetFaceNums(surf[0],surf[1])+'</div>';
  });
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
  var qty=line?(n+' '+(layered?(n===1?'unit':'units'):(n===1?'pc':'pcs'))):'';
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
        (layered?'<div class="sheet-mk">'+salesSheetMakeupHTML(makeup)+'</div>':'')+
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
