/* =====================================================================
   erp/shipping/api  ·  shipping-api-1.0
   Что Shipping даёт другим разделам: набор имён, у каждого комментарий
   «что делает». Таблицы PS и рейсов (SECTION_OWN.shipping, erp/sections)
   пишет только Shipping; станции, Sales, Production, бланки, отчёты, архив
   и база зовут эти имена (план «до 10», этап 5, 12.11.2026).
   IN : функции erp/shipping/* и экранов Shipping (erp/views/shipping*,
        erp/views/delivery, erp/views/skids)
   OUT: SHIP_API — набор имён; сверяет test/sections-api.js
   Нужно новое имя снаружи — сначала строка здесь, иначе сторож красный.
   ===================================================================== */
const SHIP_API=new Set([
 /* Команды: PS и выдача (Skip выдаёт стекло сам, удаление заказа и снятие с батча правят PS). */
 'shippingCreate', // Создать PS.
 'shippingMarkShipped', // PS отгружен (Shipped).
 'shippingMarkDelivered', // PS доставлен (Delivered).
 'shippingRevert', // Откатить отгрузку или доставку PS.
 'shippingItem', // Строка PS из юнита.
 'shippingAssert', // Проверка команды Shipping: ошибка — отказ всей команды.
 'shippingDropPlan', // Удаление заказа: что будет с его PS.
 'shippingDropOrder', // Удаление заказа: убрать его из PS.
 'shippingUnbatchItems', // Снятие с батча: юниты уходят из PS, пустой PS отменяется.
 'shippingSyncOrder', // Пересчитать готовность и выдачу заказа по сканам и PS.
 'shippingSyncOrders', // То же для нескольких заказов.
 'shippingSaveGuard', // Save заказа: нельзя убрать то, что уже на PS.
 'shippingQueueSet', // Строку заказа — в очередь отгрузки или из неё.
 'shippingQueueOf', // Очередь отгрузки строки.
 'shippingQueueAllowed', // Можно ли ставить строку в очередь.
 /* Станции: погрузка SHIP и возврат скидов. */
 'shippingLoad', // Скан погрузки на рейс.
 'shippingLoadPart', // Что уже погружено из юнита.
 'shippingLoadState', // Состояние погрузки рейса.
 'shippingLoadText', // Подпись погрузки для экрана станции.
 'shippingLoadUndone', // Undo скана погрузки.
 'shippingOpenTrips', // Открытые рейсы для станции SHIP.
 'skidBack', // Скид вернулся (скан возврата).
 'skidReturnPush', // Запись возврата скида (из пересчёта тары).
 'skidsOut', // Какие скиды сейчас у клиентов.
 'skidDays', // Сколько дней скид у клиента.
 /* Чтения: PS и юниты. */
 'shippingFind', // PS по id или номеру.
 'shippingActive', // PS не отменён.
 'shippingSent', // PS отгружен или доставлен.
 'shippingHasSent', // У заказа есть отгруженный PS.
 'shippingHasCommitment', // У заказа есть PS, который держит стекло.
 'shippingForOrder', // PS заказа.
 'shippingHistoryOrderIds', // Заказы PS, вместе со снятыми юнитами.
 'shippingSummary', // Выдано и осталось по заказу.
 'shippingBackCount', // Сколько юнитов осталось выдать.
 'shippingAvailable', // Юниты заказа, свободные для PS.
 'shippingUnits', // Юниты заказа по сканам.
 'shippingLineQty', // Количество строки на PS.
 'shippingPrintedPiece', // Стекло на напечатанном PS.
 'shippingPrintedQty', // Напечатанное количество строки.
 'shippingCtx', // Общий проход по сканам и PS для экрана.
 'shippingCtxBuild', // Собрать этот проход.
 'shippingCtxNow', // Проход на сейчас из памяти чтения.
 'shippingWithCtx', // Выполнить с готовым проходом.
 'shippingLegacy', // Старая выдача без PS.
 'shippingCarries', // Что везёт PS: юниты и позиции.
 'shippingStations', // Коды станций Shipping (SHIPR, SHIP).
 'shippingCount', // Подпись количества: «3 units».
 'shippingAddress', // Адрес PS.
 'shippingDefaultAddress', // Адрес клиента по умолчанию.
 'shippingDateValid', // Дата PS правильная.
 /* Рейсы и машины. */
 'truckFind', // Машина по id.
 'deliveryStops', // Остановки рейса.
 'deliveryDriver', // Водитель рейса.
 'deliveryLoad', // Что везёт рейс.
 'tripKmFind', // Км рейса.
 /* Бланки PS и рейса (конструктор форм). */
 'shippingDocument', // Снимок PS для бланка.
 'shippingPages', // Страницы бланка PS.
 'shippingFormDefault', // Бланк PS по умолчанию.
 'shippingFormFields', // Поля бланка PS.
 'shippingFormContext', // Данные бланка PS.
 'shippingFormSample', // Образец PS для конструктора.
 'SHIPPING_TABLE_COLUMNS', // Колонки таблицы бланка PS.
 'SHIPPING_SKID_COLUMNS', // Колонки листа скида.
 'deliveryPages', // Страницы бланка рейса.
 'deliveryFormDefault', // Бланк рейса по умолчанию.
 'deliveryFormFields', // Поля бланка рейса.
 'deliveryFormContext', // Данные бланка рейса.
 /* Экраны Shipping, которые открывают и встраивают другие разделы. */
 'viewShipping', // Экран Shipping.
 'viewMdTrucks', // Машины в Master Data.
 'shippingSetTab', // Открыть вкладку Shipping.
 'shippingTab', // Текущая вкладка Shipping.
 'shippingTabs', // Вкладки Shipping.
 'shippingTabCount', // Сколько в вкладке (Overview).
 'shippingBarRight', // Кнопки справа в шапке.
 'shippingOrderStrip', // Полоса выдачи в заказе Sales.
 'deliveryDate', // День рейсов.
 'shippingListScope', // Таблица Shipping в общем движке таблиц: какая.
 'shippingListColumns', // Колонки таблиц Shipping.
 'shippingListInfos', // Строки таблиц Shipping.
 'shippingBackorderColumns', // Колонки Backorders.
 'deliveryListColumns', // Колонки Delivery.
 'skidsListColumns', // Колонки Skids.
 /* База: загрузка и Import. */
 'normalizeShipments', // Привести PS при загрузке.
 'validateShipmentPayload', // Import: проверка PS.
 'normalizeTrucks', // Привести машины.
 'validateTruckPayload', // Import: проверка машин.
 'normalizeSkidReturns', // Привести возвраты скидов.
 'validateSkidReturnPayload', // Import: проверка возвратов скидов.
 'normalizeTripKm' // Привести км рейсов.
]);
