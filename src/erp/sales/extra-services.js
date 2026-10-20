/* =====================================================================
   sales/extra-services · extra-services-1.0
   Сервисы, добавленные к строке руками — кнопкой «+» в окне сервисов строки
   и в Services & prices заказа (владелец, 20.10.2026: «чтобы там был + … или
   даже прописные выдуманные»).
   Два вида:
   - из Master Data (rateId) — ставка из прайса, станция работы встаёт в
     маршрут;
   - свой, разовый (rateId пустой) — живёт только в этом заказе, станции нет,
     цену ставят в Line rate («станция нужна только тем, которые есть в
     мастер дате»).
   Количество — на юнит строки; пустое у ft² и in — площадь и периметр
   юнита, считаются по текущему размеру.
   IN : line.extraServices · DB.serviceRate
   OUT: строки счёта EXTRA:… · пункты маршрута · команды добавить / убрать
   ===================================================================== */
var SALES_EXTRA_UNITS=['pc','ft²','in'];
var soExtraForm=null;
/* Работы Master Data, которые можно добавить руками: активные и с именем. */
function salesExtraServiceCatalog(){
  return (DB.serviceRate||[]).filter(function(r){return r&&r.id&&r.id!=='*'&&r.name&&r.active!==false;})
    .slice().sort(function(a,b){return String(a.name).localeCompare(String(b.name));});
}
function salesExtraServiceRate(x){return x&&x.rateId?salesServiceRateRow(x.rateId):null;}
function salesExtraServiceName(x){var r=salesExtraServiceRate(x);return (r&&r.name)||x.name||'Service';}
function salesExtraServiceUnit(x){var r=salesExtraServiceRate(x);return (r&&r.unit)||x.unit||'pc';}
/* Ключ строки счёта: группа (работа прайса или своё имя с единицей) и id
   записи после «|». Одинаковые добавленные сервисы разных строк — одна группа
   в Services & prices, общую цену ставят разом. Символы — только те, что
   пропускает нормализация цен строки (normalizeSalesChargePricing). */
function salesExtraServiceGroup(x){
  if(x.rateId)return 'EXTRA:'+String(x.rateId).replace(/[^A-Za-z0-9:._+\-]/g,'_');
  /* Имя без латиницы («Шлифовка», «Покраска») или из одних значков давало
     пустую часть ключа: разные сервисы склеивались в один, и второй не
     добавлялся («Already on this line»). Такому имени — короткий отпечаток
     самого имени; латинские имена и их сохранённые цены не меняются. */
  var name=String(x.name||'').trim().toLowerCase().replace(/\s+/g,' '),slug=name.replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),h=0;
  if(!slug||/[^\x00-\x7f]/.test(name)){for(var i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))>>>0;slug=(slug?slug+'-':'')+'u'+h.toString(36);}
  return 'EXTRA:custom-'+slug+'-'+(SALES_EXTRA_UNITS.indexOf(x.unit)+1);
}
function salesExtraServiceKey(x){return salesExtraServiceGroup(x)+'|'+x.id;}
/* Количество на юнит: введённое или, если пусто, по размеру юнита. */
function salesExtraServiceBasis(line,x){
  if(x.qty!=null)return x.qty;
  var unit=salesExtraServiceUnit(x);
  if(unit==='ft²'){var a=salesLineAreas(line,soDraft);return a.valid?a.billable:0;}
  if(unit==='in'){
    var s=salesLineGeometryShape(line),r=s?ShapeModule.compute(s):null;
    if(r&&r.valid)return salesShapePerimeterIn(r);
    return 2*((+line.width16||0)+(+line.height16||0))/16;
  }
  return 1;
}
function salesExtraServiceRows(line){
  var ctx=null;
  return (line&&line.extraServices||[]).map(function(x){
    if(x.rateId&&!ctx)ctx=salesPricingThickness(line);
    return salesChargeRow(salesExtraServiceKey(x),salesExtraServiceName(x),+(+salesExtraServiceBasis(line,x)).toFixed(4),salesExtraServiceUnit(x),
      x.rateId?salesCatalogRate(x.rateId,ctx):null,x.rateId?'Added':'Custom');
  });
}
/* Работа Master Data со станцией — пункт в маршруте: после склейки — на
   станции склейки юнита, иначе — у каждого стекла на своей станции, в
   порядке станций цеха. Свой сервис станции не имеет и в маршрут не идёт. */
function salesExtraServiceRoute(lites,line,merge){
  var seq=salesRouteStations().map(function(s){return s.code;});
  (line&&line.extraServices||[]).forEach(function(x){
    var w=salesExtraServiceRate(x);if(!w||!w.station)return;
    var text=(x.qty>1&&salesExtraServiceUnit(x)==='pc'?x.qty+' × ':'')+salesExtraServiceName(x);
    lites.forEach(function(l){
      var list=l.stations,st=list.find(function(s){return s.code===(w.afterMerge&&merge?merge:w.station);});
      if(!st){
        st={code:w.station,name:salesRouteStationName(w.station),items:[],works:[]};
        var at=seq.indexOf(w.station),i=list.findIndex(function(s){var k=seq.indexOf(s.code);return at>=0&&k>at;});
        list.splice(i<0?list.length:i,0,st);
      }
      if(st.items.indexOf(text)<0)st.items.push(text);
      if(st.works&&st.works.indexOf(x.rateId)<0)st.works.push(x.rateId);
    });
  });
}
/* ---- Команды окна ---- */
/* Куда добавлять: 'line:<id>' — одна строка; 'order' — выбранные строки, а
   если не выбрано ничего — все строки заказа. */
function salesExtraTargetLines(target){
  var lines=soDraft&&soDraft.lines||[];
  if(String(target).indexOf('line:')===0){var id=String(target).slice(5);return lines.some(function(l){return l.id===id;})?[id]:[];}
  var picked=lines.filter(function(l){return soSelectedLines&&soSelectedLines.has(l.id);});
  return (picked.length?picked:lines).map(function(l){return l.id;});
}
function salesExtraFormOpen(target){soExtraForm={target:target,lines:salesExtraTargetLines(target),rateId:'',name:'',unit:'pc',qty:'',rate:'',error:''};render();}
function salesExtraFormClose(){soExtraForm=null;render();}
function salesExtraFormSet(k,v){if(!soExtraForm)return;soExtraForm[k]=v;if(k==='rateId'){var r=salesServiceRateRow(v);if(r)soExtraForm.unit=r.unit||'pc';render();}}
/* Добавляет сервис во все строки формы, кроме тех, где такой уже есть.
   Возвращает число строк, куда добавлен. */
function salesExtraAdd(){
  var f=soExtraForm;if(!f||!soDraft)return 0;
  var custom=!f.rateId,name=String(f.name||'').trim().slice(0,80),qtyText=String(f.qty==null?'':f.qty).trim(),qty=qtyText===''?null:+qtyText;
  var rateText=String(f.rate==null?'':f.rate).trim(),rate=rateText===''?null:+rateText;
  var err=custom&&!name?'Enter a name.':qty!=null&&!(Number.isFinite(qty)&&qty>0)?'Enter a quantity above 0.':rate!=null&&!(Number.isFinite(rate)&&rate>=0)?'Enter a valid rate.':'';
  if(err){f.error=err;render();return 0;}
  var lines=(soDraft.lines||[]).filter(function(l){return f.lines.indexOf(l.id)>=0;}),n=0;
  lines.forEach(function(line){
    var x=normalizeSalesExtraService({rateId:f.rateId,name:custom?name:'',unit:custom?f.unit:'',qty:qty});
    /* Уже есть такой же в строке — второй раз не добавляем. */
    if((line.extraServices||[]).some(function(e){return salesExtraServiceGroup(e)===salesExtraServiceGroup(x);}))return;
    (line.extraServices||(line.extraServices=[])).push(x);n++;
    if(rate!=null){var row=salesExtraServiceRows(line).find(function(r){return r.key===salesExtraServiceKey(x);});if(row)salesEnsureChargePricing(line,row).orderRate=Math.round(rate*10000)/10000;}
  });
  if(!n){f.error=lines.length>1?'Already on these lines.':'Already on this line.';render();return 0;}
  soExtraForm=null;render();return n;
}
function salesExtraRemove(lineId,id){
  var line=(soDraft&&soDraft.lines||[]).find(function(l){return l.id===lineId;});if(!line)return;
  var x=(line.extraServices||[]).find(function(e){return e.id===id;});if(!x)return;
  if(line.chargePricing)delete line.chargePricing[salesExtraServiceKey(x)];
  line.extraServices=line.extraServices.filter(function(e){return e.id!==id;});
  if(!line.extraServices.length)delete line.extraServices;
  render();
}
function salesExtraIdOfKey(key){var s=String(key||''),i=s.indexOf('|');return s.indexOf('EXTRA:')===0&&i>0?s.slice(i+1):'';}
/* Форма «+ Add service»: из прайса или своя. */
function salesExtraFormHTML(){
  var f=soExtraForm;if(!f)return '';
  var cat=salesExtraServiceCatalog(),r=f.rateId?salesServiceRateRow(f.rateId):null,unit=r?(r.unit||'pc'):f.unit;
  var many=f.lines.length>1;
  return `<div class="sales-extra-form" data-extra-form>`+
    `<label><span>Service</span><select data-extra-pick onchange="salesExtraFormSet('rateId',this.value)"><option value="" ${f.rateId?'':'selected'}>Custom (this order only)</option>${cat.map(function(c){return `<option value="${esc(c.id)}" ${f.rateId===c.id?'selected':''}>${esc(c.name)} · ${esc(c.unit||'pc')}${c.station?' · '+esc(c.station):''}</option>`;}).join('')}</select></label>`+
    (f.rateId?'':`<label><span>Name</span><input data-extra-name value="${esc(f.name)}" maxlength="80" oninput="soExtraForm.name=this.value"></label><span class="sales-extra-units"><span>Charged per</span><span>${SALES_EXTRA_UNITS.map(function(u){return `<button type="button" class="sm${f.unit===u?' on':''}" data-extra-unit="${u}" onclick="salesExtraFormSet('unit','${u}');render()">${u}</button>`;}).join('')}</span></span>`)+
    `<label><span>Qty / unit</span><input data-extra-qty type="number" min="0" step="any" value="${esc(f.qty)}" placeholder="${unit==='ft²'?'area':unit==='in'?'perimeter':'1'}" oninput="soExtraForm.qty=this.value"></label>`+
    `<label><span>Rate / ${esc(unit)}</span><input data-extra-rate type="number" min="0" step="0.01" value="${esc(f.rate)}" placeholder="${r?'catalog':'required'}" oninput="soExtraForm.rate=this.value"></label>`+
    `<button class="sm pri" data-extra-add onclick="salesExtraAdd()">Add${many?' to '+f.lines.length+' lines':''}</button><button class="sm" onclick="salesExtraFormClose()">Cancel</button>`+
    (f.error?`<b class="sales-extra-error">${esc(f.error)}</b>`:'')+`</div>`;
}
/* Кнопка «+ Add service» или открытая форма — внизу окна сервисов. */
function salesExtraBarHTML(target){
  if(soExtraForm&&soExtraForm.target===target)return salesExtraFormHTML();
  var n=salesExtraTargetLines(target).length;if(!n)return '';
  var picked=target==='order'&&soSelectedLines&&soSelectedLines.size;
  return `<div class="sales-extra-bar"><button class="sm" data-extra-open onclick="salesExtraFormOpen('${esc(target)}')">+ Add service${target==='order'?(picked?' to '+n+' selected':' to all '+n+' lines'):''}</button></div>`;
}
