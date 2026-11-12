/* =====================================================================
   erp/sections  ·  sections-1.0
   Чьи таблицы: деньги пишет только Finance, склад — только склад, PS и
   рейсы — только Shipping (план «до 10», этап 5, 12.11.2026). Остальные
   разделы зовут их имена из списков FIN_API (erp/finance/api), STOCK_API
   (erp/inventory/api), SHIP_API (erp/shipping/api).
   IN : команды записи разделов (finPersist, stockPersist, shipPersist и
        отметки sectionMark там, где раздел пишет внутри чужой команды)
   OUT: SECTION_OWN, sectionMark, sectionPersist; проверка для тестов
        sectionGuardCheck — зовёт её touch() (erp/storage)
   Сторож — test/sections-api.js: по тексту кода никто чужой не пишет в эти
   таблицы и не зовёт имён вне списков; в тестах (GF_SCOPE_CHECK) запись
   команды, тронувшая таблицу раздела без его отметки, пишет в консоль
   «Outside section: <раздел> <таблица> <id>».
   ===================================================================== */
const SECTION_OWN={
 finance:['receipt','refund','financeTerms','financeEvent','financeExport','financeExportBatch','referrer','referrerPayout'],
 stock:['inventoryEvent','inventoryMin','stockItemEvent','consumableEvent','stockReason','stockOffcut','stockOffcutSeq'],
 shipping:['shipment','shipmentSeq','skidReturn','truck','tripKm']
};
const SECTION_OF=new Map(Object.entries(SECTION_OWN).flatMap(([s,ts])=>ts.map(t=>[t,s])));
const sectionMarked=new Set();
/* Раздел отмечает таблицы, которые пишет сейчас; без таблиц — все свои. */
function sectionMark(section,...tables){(tables.length?tables:SECTION_OWN[section]).forEach(t=>sectionMarked.add(t));}
/* Архив и загрузка базы переносят строки целиком, не меняя их. */
function sectionMarkAll(){SECTION_OF.forEach((s,t)=>sectionMarked.add(t));}
/* Команда записи раздела: storageCommand с отметкой его таблиц. */
function sectionPersist(section,fn,scope){return storageCommand(()=>{sectionMark(section);return fn();},scope);}
/* Начало команды записи (storageCommand): прошлые отметки не в счёт. */
function sectionGuardReset(){sectionMarked.clear();}
/* touch(): checked — запись команды (с областью). Записанные таблицы
   отметки теряют: следующая запись отмечается заново. */
function sectionGuardCheck(changes,checked){
 const hit=new Map();changes.forEach(c=>{if(SECTION_OF.has(c.tbl)&&!hit.has(c.tbl))hit.set(c.tbl,c.id);});
 hit.forEach((id,t)=>{if(checked&&!sectionMarked.has(t))console.error('Outside section: '+SECTION_OF.get(t)+' '+t+' '+id);sectionMarked.delete(t);});
}
