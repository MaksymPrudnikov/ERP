/* Аудит Codex 09.11.2026 (F01–F16), проверка и исправления — Claude.
   Сценарии двух компьютеров (F06, F09) — в test/audit-2026-11-08.js рядом с
   C4/C12/C13: там модель сервера. */
module.exports=async function({page,eq}){
 console.log('audit 2026-11-09');
 const t=await page();await require('./optimization-fixture')(t.p);

 /* F01: текст с апострофом в Mark / Notes — целиком, и не становится
    атрибутом поля, в том числе после Save и F5. */
 const id=await t.p.evaluate(()=>{oqReset();const id=oqOrder(oqCustomer());salesDraftDrop();tab='sales';salesOrderEdit(id);render();return id;});
 const bad="x' onfocus='window.__auditInjected=1' data-extra='";
 await t.p.locator('input.line-mark').first().fill("O'Brien");
 await t.p.locator('input.line-notes').first().fill(bad);
 await t.p.evaluate(async()=>{salesOrderSave();await storageFlush();});
 await t.p.reload();await t.p.evaluate(()=>storageReady);
 await t.p.evaluate(id=>{tab='sales';salesOrderEdit(id);render();},id);
 await t.p.locator('input.line-notes').first().focus();
 eq('F01: Mark O\'Brien и Notes с апострофами — целиком после Save и F5; лишних атрибутов и кода нет',await t.p.evaluate(id=>{
  const l=salesRecord(id).lines[0],n=document.querySelector('input.line-notes');
  return {mark:l.mark,notes:l.notes,field:document.querySelector('input.line-mark').value,notesField:n.value,attrs:n.hasAttribute('onfocus')||n.hasAttribute('data-extra'),ran:!!window.__auditInjected};
 },id),{mark:"O'Brien",notes:bad,field:"O'Brien",notesField:bad,attrs:false,ran:false});
 await t.c.close();
};
