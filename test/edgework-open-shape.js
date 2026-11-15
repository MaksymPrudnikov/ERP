/* Окно кромок строки (Effective Production) → Open Shape в синей подсказке.
   До 15.11.2026 кнопка уносила в onAct буквальный текст '${esc(line.id)}':
   окно закрывалось, редактор фигуры не открывался. Проверяется настоящим
   кликом мышью по кнопке, как это делает человек. */
module.exports=async function({page,eq}){
 console.log('edgework-open-shape');const t=await page();
 await t.p.evaluate(()=>{
  DB.salesOrder=[];DB.customer=[{id:'CUS-EOS',code:'EO',legalName:'Edgework test',displayName:'Edgework test',status:'active',contacts:[],addresses:[]}];touch();
  tab='sales';render();salesOrderNew();soDraft.customerId='CUS-EOS';soDraft.customerPo='PO-EOS';soDraft.lines=[];
  salesExcelPasteText('1\t40\t30\tA',0);salesExcelApply();render();
 });
 await t.p.click('.sales-lines-table .ss-badge');
 const before=await t.p.evaluate(()=>({modal:!!document.querySelector('.sales-service-modal.line-modal'),
  info:!!document.querySelector('.ss-line-warning.info button'),line:soDraft.lines[0].id}));
 await t.p.click('.ss-line-warning.info button');
 eq('Effective Production: Open Shape in the hint opens the Shape editor of this line',
  await t.p.evaluate(line=>({modal:!!document.querySelector('.sales-service-modal.line-modal'),tab,subtab,
   bridge:!!salesBridge&&salesBridge.kind==='shape'&&salesBridge.lineId===line,editor:!!document.querySelector('#shapeEditorRoot')}),before.line),
  {modal:false,tab:'configurators',subtab:'shape',bridge:true,editor:true});
 eq('Effective Production: the hint with Open Shape was on screen',{modal:before.modal,info:before.info},{modal:true,info:true});
 eq('edgework-open-shape: no page errors',t.errs,[]);
 await t.c.close();
};
