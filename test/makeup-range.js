/* Пункт 13 (вариант 1 владельца 30.10.2026): Makeup диапазону строк —
   «Makeup · Lines [2] to [16] → [B] · Apply» над Order Lines, Shift+клик по
   флажкам. Makeup меняется только по Apply, строки в батче не меняются,
   заказ сам не сохраняется. */
module.exports=async function({page,eq}){
 console.log('makeup range');
 const t=await page(undefined,{width:1600,height:900});await require('./optimization-fixture')(t.p);
 const run=(fn,arg)=>t.p.evaluate(fn,arg).catch(e=>({error:String(e.message).split('\n')[0]}));
 const setup=()=>run(()=>{
  /* Заказ из задания: 62 строки, Makeup A у всех, кроме 40-й (B). */
  window.mrOrder=(n,opts)=>{
   const id=oqOrder(oqCustomer());salesOrderEdit(id);
   const a=soDraft.makeups[0],b=JSON.parse(JSON.stringify(a));b.id=salesUid('MU');b.code='B';b.panes.forEach(p=>{p.id=salesUid('PN');p.glassProductId=glassProductByCode('6E272').id;});soDraft.makeups.push(b);
   const src=soDraft.lines[0];soDraft.lines=[];
   for(let i=0;i<n;i++){const l=normalizeSalesOrderLine({makeupId:i===39?b.id:a.id,width16:(20+i%9)*16,height16:(30+i%7)*16,qty:1+i%3,mark:'M'+(i+1)});soDraft.lines.push(l);salesEnsureLineShape(l);}
   if(!salesOrderSave())throw new Error('mrOrder not saved');salesDraftDrop();
   if(opts&&opts.lock){const o=salesRecord(id);opts.lock.forEach(n=>{o.lines[n-1].batchedAt='2026-10-28T10:00:00.000Z';o.lines[n-1].batchNo='B-0001';});touch();}
   tab='sales';salesOrderEdit(id);return id;
  };
  window.mrCode=()=>soDraft.lines.map(l=>(salesMakeupById(soDraft,l.makeupId)||{}).code).join('');
  window.mrSel=()=>soDraft.lines.map((l,i)=>soSelectedLines.has(l.id)?i+1:0).filter(Boolean);
  window.mrType=(k,v)=>{const e=document.querySelector(`[data-mk-field="${k}"]`);e.focus();e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));};
  window.mrBox=n=>document.querySelectorAll('.sales-lines-table tbody tr[data-metrics-line-id] td.line-check input')[n-1];
  window.mrClick=(n,shift)=>{const b=mrBox(n);b.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:!!shift}));};
  window.mrLive=()=>{const a=document.querySelector('[data-mk-apply]');const c=document.querySelector('[data-mk-count],[data-mk-error],[data-mk-note]');return {apply:a?!a.disabled:null,text:c?c.textContent:''};};
  window.mrPick=code=>{const s=document.querySelector('[data-mk-makeup]');s.value=soDraft.makeups.find(m=>m.code===code).id;s.dispatchEvent(new Event('change',{bubbles:true}));};
 });
 await setup();

 eq('62 строки, отмечены 1 и 40: From 2 / To 16 — выбрано ровно 2–16 (15), 1 и 40 сняты, поля фокус не теряют; выбор B ничего не меняет; Apply — B только у 2–16, остальное прежнее; «Applied B to 15 lines»; заказ не записан',await run(()=>{
  const id=mrOrder(62);const saved=JSON.stringify(salesRecord(id));
  const bar=!!document.querySelector('[data-mk-bar]');mrClick(1);mrClick(40);
  mrType('from','2');mrType('to','16');const focus=document.activeElement&&document.activeElement.dataset.mkField;
  const sel=mrSel().join(),picked=[...document.querySelectorAll('tr[data-picked]')].length;
  mrPick('B');const before=mrCode(),live=mrLive();document.querySelector('[data-mk-apply]').click();
  const r={bar,focus,sel,picked,unchanged:before==='A'.repeat(39)+'B'+'A'.repeat(22),live,after:mrCode(),note:mrLive().text,qty:soDraft.lines.map(l=>l.qty+'·'+l.width16+'·'+l.mark).join()===JSON.parse(saved).lines.map(l=>l.qty+'·'+l.width16+'·'+l.mark).join(),
   stored:JSON.stringify(salesRecord(id))===saved,state:document.querySelector('[data-order-state]').textContent};
  salesDraftDrop(true);return r;
 }),{bar:true,focus:'to',sel:'2,3,4,5,6,7,8,9,10,11,12,13,14,15,16',picked:15,unchanged:true,live:{apply:true,text:'15 selected'},after:'A'+'B'.repeat(15)+'A'.repeat(23)+'B'+'A'.repeat(22),note:'✓ Applied B to 15 lines',qty:true,stored:true,state:'Unsaved changes'});

 eq('Границы: 5–5 — одна строка; 9–3, 2.5, пусто с одной стороны, 0 и 63 — Apply недоступна с причиной, прежний выбор не применяется; без Makeup — «Choose Makeup»',await run(()=>{
  mrOrder(62);const out={};
  mrType('from','5');mrType('to','5');out.one=mrSel().join();out.noMu=mrLive();mrPick('B');
  [['9','3'],['2.5','6'],['','6'],['0','4'],['60','63']].forEach(([a,b])=>{mrType('from',a);mrType('to',b);out[a+'-'+b]=mrLive();});
  document.querySelector('[data-mk-apply]').click();out.code=mrCode()==='A'.repeat(39)+'B'+'A'.repeat(22);salesDraftDrop(true);return out;
 }),{one:'5',noMu:{apply:false,text:'1 selected'},'9-3':{apply:false,text:'Use lines 1–62'},'2.5-6':{apply:false,text:'Use lines 1–62'},'-6':{apply:false,text:'Use lines 1–62'},'0-4':{apply:false,text:'Use lines 1–62'},'60-63':{apply:false,text:'Use lines 1–62'},code:true});

 eq('Shift: флажок 2, Shift+клик 16 — 2–16 и поля 2 / 16; снять 2, Shift+16 — сняты; снизу вверх; смешанный набор — одно намерение, без поэлементной инверсии',await run(()=>{
  mrOrder(62);const out={};
  mrClick(2);mrClick(16,true);out.down=mrSel().length+':'+document.querySelector('[data-mk-field="from"]').value+'-'+document.querySelector('[data-mk-field="to"]').value;
  mrClick(2);mrClick(16,true);out.off=mrSel().join()||'none';
  mrClick(30);mrClick(20,true);out.up=mrSel().join();
  mrClick(25);mrClick(27);mrClick(33);mrClick(20,true);out.mixed=mrSel().join();
  salesDraftDrop(true);return out;
 }),{down:'15:2-16',off:'none',up:'20,21,22,23,24,25,26,27,28,29,30',mixed:'20,21,22,23,24,25,26,27,28,29,30,31,32,33'});

 eq('Фильтр показывает 2, 4, 7: Shift — только видимые 2, 4, 7; числа 2–7 — все шесть, «3 hidden by filter»; несмежные 2, 4, 16 не становятся диапазоном 2–16',await run(()=>{
  const id=mrOrder(62);[2,4,7].forEach(n=>{soDraft.lines[n-1].onHold=true;});salesSetServiceFilter('hold');const out={};
  mrClick(1);mrClick(3,true);out.shift=mrSel().join();
  mrType('from','2');mrType('to','7');out.range=mrSel().join();out.live=mrLive().text;
  salesSetServiceFilter('all');mrType('from','');mrType('to','');salesBulkClear();mrClick(2);mrClick(4);mrClick(16);
  out.gaps=[document.querySelector('[data-mk-field="from"]').value,document.querySelector('[data-mk-field="to"]').value,mrSel().join()];
  salesDraftDrop(true);return out;
 }),{shift:'2,4,7',range:'2,3,4,5,6,7',live:'6 selected · 3 hidden by filter',gaps:['','','2,4,16']});

 eq('Строка 9 в батче: до Apply «15 selected · 1 locked» и метка Locked; после — у 9 прежний A, «Applied B to 14 lines · 1 locked (line 9)»; повтор Apply ничего не ломает; во время записи в фоне Apply недоступна',await run(()=>{
  mrOrder(62,{lock:[9]});mrType('from','2');mrType('to','16');mrPick('B');
  const before=mrLive().text,pill=getComputedStyle(document.querySelectorAll('.sales-lines-table tbody tr[data-metrics-line-id]')[8].querySelector('.line-locked-pill')).display;
  document.querySelector('[data-mk-apply]').click();const note=mrLive().text,code=mrCode();document.querySelector('[data-mk-apply]').click();const again=[mrLive().text,mrCode()===code];
  mrType('from','30');mrType('to','31');salesSaveJob={};salesBulkSync();const busy=mrLive();salesBulkApply();salesSaveJob=null;const kept=mrCode()===code;
  salesDraftDrop(true);return {before,pill,note,nine:code[8],again,busy,kept};
 }),{before:'15 selected · 1 locked',pill:'inline-block',note:'✓ Applied B to 14 lines · 1 locked (line 9)',nine:'A',again:['✓ Applied B to 14 lines · 1 locked (line 9)',true],busy:{apply:false,text:'2 selected'},kept:true});

 eq('Удалили строку после диапазона — поля пусты, ввод заново; другой заказ и Copy — чисто; ширина колонки не меняет выбор',await run(()=>{
  const id=mrOrder(20);mrType('from','3');mrType('to','6');salesOrderRemoveLine(9);
  const stale=[document.querySelector('[data-mk-field="from"]').value,document.querySelector('[data-mk-field="to"]').value,mrSel().join()];
  const sel=new Set(soSelectedLines);const p=salesLoadViewPrefs();CW_TABLES.lines.save({mu:70,qty:60});render();const widths=mrSel().join();
  salesDraftDrop(true);const other=mrOrder(5);const clean=[document.querySelector('[data-mk-field="from"]').value,mrSel().length];
  mrType('from','1');mrType('to','2');salesDraftDrop(true);tab='sales';render();salesCopyOrder(other);const copy=[document.querySelector('[data-mk-field="from"]').value,mrSel().length];
  salesResetLineWidths();salesDraftDrop(true);return {stale,widths,clean,copy};
 }),{stale:['','','3,4,5,6'],widths:'3,4,5,6',clean:['',0],copy:['',0]});

 eq('Apply B → Save → F5: B на месте; Apply без Save и выход Don\'t update — не записано; Edgework (Bulk Set, Preview, + Service) — отдельно, у выбранных',await run(()=>{
  const id=mrOrder(10);mrType('from','1');mrType('to','3');mrPick('B');document.querySelector('[data-mk-apply]').click();
  const edge=[...document.querySelectorAll('[data-mk-bar] .ss-bulk button')].map(b=>b.textContent);salesOrderSave();salesDraftDrop();
  salesOrderEdit(id);mrType('from','4');mrType('to','5');mrPick('B');document.querySelector('[data-mk-apply]').click();salesDraftDrop(true);
  return {edge,code:salesRecord(id).lines.map(l=>(salesMakeupById(salesRecord(id),l.makeupId)||{}).code).join('')};
 }),{edge:['Preview','+ Service','Clear'],code:'BBBAAAAAAA'});
 await t.p.evaluate(()=>storageFlush());await t.p.reload();await t.p.evaluate(()=>window.storageReady);
 eq('после F5 — тот же состав',await run(()=>{const o=DB.salesOrder.find(x=>(x.lines||[]).length===10&&x.lines[0].mark==='M1');return o.lines.map(l=>(o.makeups.find(m=>m.id===l.makeupId)||{}).code).join('');}),'BBBAAAAAAA');

 /* Владелец, 30.10.2026: «шифт клик по полосе (линии)» — и по номеру #.
    Настоящая мышь с Shift: номер, пустое место строки, ячейка-кнопка, × и
    строка в батче (её ячейки inert); поле Qty остаётся полем. */
 await require('./optimization-fixture')(t.p);await setup();
 eq('Shift по строке: заказ на 12 строк',await run(()=>{mrOrder(12,{lock:[9]});return soDraft.lines.length;}),12);
 const row=n=>t.p.locator('.sales-lines-table tbody tr[data-metrics-line-id]').nth(n-1);
 await row(2).locator('td.line-check input').click();
 await row(6).locator('td.line-num').click({modifiers:['Shift']});
 const byNum=await run(()=>[mrSel().join(),document.querySelector('[data-mk-field="from"]').value+'-'+document.querySelector('[data-mk-field="to"]').value]);
 await row(10).locator('td.line-metric[data-metric="materials"]').click({modifiers:['Shift']});
 const byRow=await run(()=>mrSel().join());
 await row(11).locator('.line-delete').click({modifiers:['Shift']});
 const byDelete=await run(()=>[mrSel().join(),soDraft.lines.length,!!document.querySelector('.metric-modal')]);
 await row(4).locator('td.line-check input').click();
 await row(7).locator('td.line-num').click({modifiers:['Shift']});
 const off=await run(()=>mrSel().join());
 await run(()=>salesBulkClear());await row(8).locator('td.line-check input').click();
 await row(9).locator('td.line-num').click({modifiers:['Shift'],force:true});
 const locked=await run(()=>[mrSel().join(),mrLive().text]);
 await row(3).locator('.line-mark').click({modifiers:['Shift']});await t.p.keyboard.type('X');
 await row(4).locator('.line-qty').click();await t.p.keyboard.press('Backspace');await t.p.keyboard.type('7');
 const field=await run(()=>[mrSel().join(),soDraft.lines[2].mark.includes('X'),soDraft.lines[3].qty]);
 eq('Shift+клик по # и по самой строке: 2 флажком, Shift+# 6 — 2–6 и поля 2-6; Shift по ячейке Materials строки 10 — до 10, окно не открылось; Shift по × строки 11 — выделена, не удалена; снять 4 флажком, Shift+# 7 — снято 4–7; строка 9 в батче — Shift+# выделяет, «1 locked»; Shift+клик в Mark — поле редактируется, выбор не меняется; обычный клик в Qty — ввод',
  {byNum,byRow,byDelete,off,locked,field},
  {byNum:['2,3,4,5,6','2-6'],byRow:'2,3,4,5,6,7,8,9,10',byDelete:['2,3,4,5,6,7,8,9,10,11',12,false],off:'2,3,8,9,10,11',
   locked:['8,9','2 selected · 1 locked'],field:['8,9',true,7]});
 await run(()=>salesDraftDrop(true));

 /* Владелец, 30.10.2026: «какой смысл от окна Makeup, если сейчас только 1
    мейкап, она ещё и визуально большая». */
 eq('Один Makeup: полосы нет; выбрали строку — узкая полоса «1 selected» и Edgework, без полей Lines и Apply; второй Makeup — полоса с полями; высота полосы ≤ 40 px',await run(()=>{
  const id=oqOrder(oqCustomer());tab='sales';salesOrderEdit(id);render();const none=!document.querySelector('[data-mk-bar]');
  mrClick(1);const bar=document.querySelector('[data-mk-bar]'),one={count:bar.querySelector('[data-mk-live]').textContent,edge:!!bar.querySelector('.ss-bulk'),fields:!!bar.querySelector('[data-mk-field]'),apply:!!bar.querySelector('[data-mk-apply]')};
  salesBulkClear();const b=JSON.parse(JSON.stringify(soDraft.makeups[0]));b.id=salesUid('MU');b.code='B';soDraft.makeups.push(b);render();
  const two=document.querySelector('[data-mk-bar]'),h=Math.round(two.getBoundingClientRect().height),r={none,one,two:!!two.querySelector('[data-mk-field]'),low:h<=40};salesDraftDrop(true);return r;
 }),{none:true,one:{count:'1 selected',edge:true,fields:false,apply:false},two:true,low:true});

 eq('makeup range: без ошибок страницы',t.errs,[]);
 await t.c.close();
};
