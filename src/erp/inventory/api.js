/* =====================================================================
   erp/inventory/api  ·  stock-api-1.0
   Что склад даёт другим разделам: набор имён, у каждого комментарий
   «что делает». Таблицы склада (SECTION_OWN.stock, erp/sections) пишет
   только склад — erp/inventory/* и куски стока S- (erp/production/
   stock-offcuts: кусок рождается при раскрое, но это склад). Раскрой,
   приёмка, станции, Master Data, отчёты, архив и база зовут эти имена
   (план «до 10», этап 5, 12.11.2026).
   IN : функции erp/inventory/*, erp/production/stock-offcuts и экранов
        склада (erp/views/inventory, erp/views/stock-list)
   OUT: STOCK_API — набор имён; сверяет test/sections-api.js
   ===================================================================== */
const STOCK_API=new Set([
 /* Команды, которые зовут другие разделы. */
 'stockOffcutAdd', // Положить кусок в сток (S-): раскрой, отменённое стекло.
 'stockOffcutCancel', // Снять кусок со стока (раскрой перестроен).
 'invScanSheet', // Скан листа на станции: лист со склада в раскрой.
 'invScanSheetClean', // Очистить скан листа.
 'stockReasonAdd', // Новая причина списания (общий экран причин).
 'stockReasonRename', // Переименовать причину.
 'stockReasonSetActive', // Включить или выключить причину.
 /* Чтения: листы. */
 'invSize', // Размер листа: ширина и высота по порядку.
 'invSizeText', // Размер листа для экрана.
 'invSheetRows', // Листы на складе: строки.
 'invCutSheets', // Листы, ушедшие в раскрой.
 'invBreaks', // Треснувшие листы.
 'invMoves', // Движения листов.
 'invBatchSheetHints', // Подсказки листов для батча.
 'invOffcutRows', // Куски S-: строки.
 'stockOffcutFind', // Кусок S- по номеру.
 'INV_SHEETS_MAX', // Предел листов в одной записи.
 /* Чтения: расходники и Stock items. */
 'consRows', // Расходники: строки.
 'consKey', // Ключ расходника.
 'consUnitOf', // Единица расходника.
 'consPerUnitOf', // Расход на юнит.
 'consPerUnitSaved', // Записанный расход на юнит.
 'consPerFresh', // Расход на юнит заново.
 'consAssembled', // Собранные юниты для расхода.
 'CONS_TABLES', // Таблицы расходников.
 'sinvBuild', // Stock items: остатки.
 'sinvRowOf', // Строка Stock item.
 /* Экраны склада. */
 'viewInventory', // Экран Inventory.
 'viewStockList', // Список стока в Optimization.
 'invGo', // Открыть Inventory на нужном месте.
 'invOpenStock', // Открыть Stock item в журнале Inventory (кнопка в Master Data).
 'invListScope', // Таблица склада в общем движке таблиц: какая.
 'invListColumns', // Колонки таблиц склада.
 'invListDefaults', // Колонки по умолчанию.
 'invListDefaultSort', // Сортировка по умолчанию.
 'invListDateColumn', // Колонка даты.
 'stockListColumns', // Колонки списка стока.
 /* База: загрузка и Import. */
 'normalizeInventory', // Привести листы при загрузке.
 'validateInventoryPayload', // Import: проверка листов.
 'normalizeConsumables', // Привести расходники.
 'normalizeStockItems', // Привести Stock items.
 'validateStockItemPayload', // Import: проверка Stock items.
 'normalizeStockReasons', // Привести причины.
 'normalizeStockOffcuts', // Привести куски S-.
 'validateStockOffcutPayload' // Import: проверка кусков S-.
]);
