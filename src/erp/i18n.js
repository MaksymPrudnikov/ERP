/* =====================================================================
   erp/i18n  ·  erp-1.0
   RU / EN. Перевод накладывается на готовый DOM.
   IN : LANG + текстовые узлы
   OUT: переведённый DOM
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

let LANG=localStorage.getItem('glazing_system_lang') || 'ru';
const I18N_EN={
  "CNC1 и FURN1": "CNC1 and FURN1",
  "Мин. толщина, мм": "Min thickness, mm",
  "Макс. толщина, мм": "Max thickness, mm",
  "Производственная система · прототип": "Production system · prototype",
  "● несохранённые изменения": "● unsaved changes",
  "Экспорт JSON": "Export JSON",
  "Импорт JSON": "Import JSON",
  "Админ": "Admin",
  "Руководство": "Management",
  "Продажи": "Sales",
  "Технолог": "Technologist",
  "Цех": "Shop floor",
  "Отгрузка": "Shipping",
  "Снабжение": "Purchasing",
  "Резка": "Cutting",
  "Кромка (arris/polish)": "Edgework (arris/polish)",
  "ЧПУ полировка": "CNC polishing",
  "Сверловка/выемки": "Drilling / notches",
  "Закалка": "Tempering",
  "Контроль качества": "Quality control",
  "Отгрузка/погрузка": "Shipping / loading",
  "Новичок": "Beginner",
  "Мидл": "Intermediate",
  "Синьор": "Senior",
  "Кромка (arris / polish / CNC polishing)": "Edgework (arris / polish / CNC polishing)",
  "Раскроечный стол": "Cutting table",
  "Кромкообрабатывающая линия": "Edging line",
  "Фацетный станок": "Beveling machine",
  "Обрабатывающий центр ЧПУ": "CNC machining center",
  "Печь закалки": "Tempering furnace",
  "Заведена под уровень 1 — раньше в модели не было отдельной резки, только печь/кромка/ЧПУ": "Assigned to level 1 — the earlier model had no separate cutting step, only furnace/edge/CNC",
  "Уровень не назначен — уточни у себя: этот ЧПУ больше полирует кромку (уровень 2) или сверлит/выбирает пазы (уровень 3)?": "Level is not assigned — confirm whether this CNC is mainly edge polishing (level 2) or drilling/notching (level 3).",
  "Уровень не назначен — закалка обычно отдельный этап после кромки/сверловки, назначь номер сам": "Level is not assigned — tempering is normally a separate step after edgework/drilling; assign the actual process level.",
  "Обзор": "Overview",
  "Главная": "Dashboard",
  "Ядро": "Core",
  "Пользователи": "Users",
  "Клиенты": "Customers",
  "Справочник клиентов, контакты и коммерческие условия": "Customer master, contacts and commercial terms",
  "Единый справочник клиентов для будущих Sales Orders. Контакты, адреса, кредитные условия и legacy-ID хранятся отдельно и не смешиваются с производственными данными.": "Single customer master for future Sales Orders. Contacts, addresses, credit terms and legacy IDs are stored separately from production data.",
  "активных клиентов": "active customers",
  "на hold": "on hold",
  "в архиве": "archived",
  "Поиск по коду, имени, контакту, телефону, email…": "Search by code, name, contact, phone, email…",
  "+ Новый клиент": "+ New customer",
  "Экспорт CSV": "Export CSV",
  "Импорт / обновление": "Import / update",
  "Импорт с заменой": "Import and replace",
  "Активные": "Active",
  "Все": "All",
  "Архив": "Archived",
  "Account": "Account",
  "Клиент": "Customer",
  "Основной контакт": "Primary contact",
  "Условия": "Terms",
  "Кредит": "Credit",
  "клиенты не найдены": "no customers found",
  "CSV-импорт понимает как экспорт GLASS ERP, так и legacy-колонки Name / Account / Post Add / Del Add / Telephone / EMail / SalesRep / Credit Limit / DCLink и др.": "CSV import accepts both GLASS ERP exports and legacy columns such as Name / Account / Post Add / Del Add / Telephone / EMail / SalesRep / Credit Limit / DCLink and others.",
  "Открыть": "Open",
  "Дублировать": "Duplicate",
  "В архив": "Archive",
  "Восстановить": "Restore",
  "Активный": "Active",
  "Неактивный": "Inactive",
  "Новый клиент": "New customer",
  "Внутренний ID:": "Internal ID:",
  "Основное": "General",
  "Контакты": "Contacts",
  "Адреса": "Addresses",
  "Кредит и условия": "Credit & terms",
  "Основная информация": "General information",
  "авто: C-00001": "auto: C-00001",
  "PO обязателен": "PO required",
  "Контактов пока нет": "No contacts yet",
  "Несколько людей на одного клиента: purchasing, accounting, receiving, project manager и др.": "Multiple people per customer: purchasing, accounting, receiving, project manager, etc.",
  "+ Контакт": "+ Contact",
  "Контакт": "Contact",
  "Роль / должность": "Role / title",
  "Основной": "Primary",
  "Удалить": "Delete",
  "Адресов пока нет": "No addresses yet",
  "Billing и несколько delivery/job-site адресов могут существовать одновременно.": "Billing and multiple delivery/job-site addresses can exist at the same time.",
  "+ Адрес": "+ Address",
  "Адрес": "Address",
  "Тип": "Type",
  "По умолчанию": "Default",
  "Кредит и коммерческие условия": "Credit and commercial terms",
  "Индивидуальная ставка": "Custom rate",
  "Без топливного сбора": "Fuel levy exempt",
  "Печать": "Print",
  "Email + печать": "Email + print",
  "Не отправлять": "Do not send",
  "Accounting и statements": "Accounting and statements",
  "Legacy IDs сохраняются для миграции и сверки со старой системой. Они не являются бизнес-ключами новой ERP.": "Legacy IDs are preserved for migration and reconciliation with the old system. They are not business keys in the new ERP.",
  "Legacy / migration references": "Legacy / migration references",
  "Укажи Legal Name": "Enter Legal Name",
  "Customer Code уже используется": "Customer Code is already in use",
  "Клиент уже используется в заказах. Удаление запрещено — переведи клиента в архив.": "This customer is already used by orders. Deletion is blocked — archive the customer instead.",
  "Удалить клиента без возможности восстановления?": "Delete this customer permanently?",
  "Заменить весь справочник клиентов данными из файла? Это действие нельзя отменить без резервного экспорта.": "Replace the entire customer master with data from the file? This cannot be undone without a backup export.",
  "Файл клиентов превышает 10 MB.": "Customer file exceeds 10 MB.",
  "Не удалось импортировать клиентов:": "Could not import customers:",
  "в файле нет клиентов": "the file contains no customers",
  "JSON клиентов должен содержать массив customers": "Customer JSON must contain a customers array",
  "нельзя заменить весь справочник: есть клиенты, связанные с заказами": "The customer master cannot be replaced because some customers are referenced by orders",
  "поле \"customer\" должно быть массивом": "the \"customer\" field must be an array",
  "Операции": "Operations",
  "Продажи / конфигурация": "Sales / configuration",
  "Конфигураторы": "Configurators",
  "Заказы и коммерческая конфигурация": "Orders and commercial configuration",
  "Инженерные конфигураторы Shape и Muntinbar": "Engineering Shape and Muntinbar configurators",
  "Инженерные инструменты Production Shape и Adaptive Muntin развиваются отдельно от коммерческого Sales. Их существующие данные и расчётные контракты сохраняются.": "Production Shape and Adaptive Muntin engineering tools evolve separately from commercial Sales. Their existing data and calculation contracts are preserved.",
  "Коммерческий контур ERP отделён от инженерных конфигураторов. Здесь поэтапно появятся Sales Orders и библиотека конфигураций заказа.": "The ERP commercial flow is separated from engineering configurators. Sales Orders and the order configuration library will be added here incrementally.",
  "этап 2": "stage 2",
  "Заказы": "Orders",
  "Конфигурации": "Configurations",
  "Sales Orders · коммерческий заказ клиента": "Sales Orders · customer commercial order",
  "следующий этап · Draft Sales Order": "next stage · Draft Sales Order",
  "Переиспользуемые конфигурации заказа и будущие Assembly Revisions": "Reusable order configurations and future Assembly Revisions",
  "следующий этап · Configuration Library": "next stage · Configuration Library",
  "Раздел Sales Orders подготовлен. Draft Sales Order будет добавлен отдельным следующим этапом.": "The Sales Orders section is ready. Draft Sales Order will be added as a separate next stage.",
  "Раздел Configurations подготовлен. Configuration Library будет добавлена отдельным следующим этапом.": "The Configurations section is ready. Configuration Library will be added as a separate next stage.",
  "Оптимизация": "Optimization",
  "Производство": "Production",
  "Домены — далее": "Domains — next",
  "Склад": "Inventory",
  "Закупки": "Purchasing",
  "Финансы": "Finance",
  "план": "planned",
  "Фаза 1 · Фундамент": "Phase 1 · Foundation",
  "Spil остаётся источником работы до прохождения контрольных фаз.": "Spil remains the operational system until the control phases are passed.",
  "Обзор системы": "System overview",
  "Карта ERP и текущий статус": "ERP map and current status",
  "Роли, станции и покрытие навыков": "Roles, stations and skill coverage",
  "Изолированные модули Shape и Muntinbar": "Isolated Shape and Muntinbar modules",
  "Мост данных к Perfect Cut": "Data bridge to Perfect Cut",
  "Поток цеха, станции и уровни": "Shop flow, stations and levels",
  "Производственная система": "Production system",
  "Фаза 1 · фундамент": "Phase 1 · foundation",
  "модуль в плане": "module planned",
  "Стекольное производство — одна система": "Glass production — one system",
  "Не набор справочников, а сквозной поток: от конфигурации заказа и оптимизации раскроя до прохождения детали по цеху, складу и отгрузке.": "Not a set of reference tables, but an end-to-end flow: from order configuration and cutting optimization to shop-floor processing, inventory and shipping.",
  "Текущий контур ERP: техническая конфигурация Shape и Muntin, оптимизация раскроя и прохождение детали по цеху. Модуль заказов в эту версию не входит.": "The current ERP scope covers technical Shape and Muntin configuration, cutting optimization and shop-floor processing. The orders module is not part of this version.",
  "Прототип архитектуры": "Architecture prototype",
  "нужно назначить": "assignment needed",
  "готово": "ready",
  "ядро": "core",
  "ожидает данных": "waiting for data",
  "пользователей в прототипе": "users in the prototype",
  "операционных модулей в новой оболочке": "operational modules in the new shell",
  "Карта ERP": "ERP map",
  "зелёная точка = уже есть экран": "green dot = screen already exists",
  "Это визуальная карта владения данными по бизнес-доменам. Perfect Cut остаётся внешним оптимизатором, а не частью ERP.": "This is a visual map of data ownership by business domain. Perfect Cut remains an external optimizer, not part of the ERP.",
  "заказ · Shape · Muntin · будущий pricing": "order · Shape · Muntin · future pricing",
  "Shape · Muntin · чертежи · cutting geometry": "Shape · Muntin · drawings · cutting geometry",
  "внешняя оптимизация раскроя через мост": "external cutting optimization through the bridge",
  "станции · маршруты · WIP · события": "stations · routings · WIP · events",
  "стойки · комплектация · доставка": "racks · staging · delivery",
  "Склад / Inventory": "Inventory",
  "материалы · партии · остатки · обрезь · движения": "materials · lots · stock · offcuts · movements",
  "поставщики · source · purchase cost · приёмка": "suppliers · source · purchase cost · receiving",
  "факт. себестоимость · invoice · интеграция бухгалтерии": "actual cost · invoice · accounting integration",
  "пользователи · права · единицы · валюты · журнал событий": "users · permissions · units · currencies · event log",
  "Дорожная карта": "Roadmap",
  "сейчас Ф1": "currently P1",
  "Фундамент": "Foundation",
  "master-data и доменная оболочка": "master data and domain shell",
  "Заказ": "Order",
  "Технология изделия": "Product engineering",
  "Shape revisions · Muntin · чертежи · cutting geometry": "Shape revisions · Muntin · drawings · cutting geometry",
  "клиенты · строки · услуги · ACK · чертёж": "customers · lines · services · ACK · drawing",
  "Perfect Cut bridge · WIP · бой · остатки": "Perfect Cut bridge · WIP · breakage · stock",
  "Планирование": "Planning",
  "мощности · партии · стойки · доставка": "capacity · batches · racks · delivery",
  "Замыкание": "Closeout",
  "MRP · фактическая себестоимость · BI": "MRP · actual costing · BI",
  "Что сейчас требует решения, а не дизайна": "What currently needs a decision, not design",
  "открытые вопросы": "open questions",
  "Не проектируем протокол до реальных настроек коннектора Spil / ответа R.O. SRL.": "Do not design the protocol until we have the actual Spil connector settings / R.O. SRL response.",
  "Уровень потока не назначен. Это должен решить реальный технологический маршрут.": "Flow level is not assigned. The actual production routing must determine it.",
  "Станки": "Machines",
  "Нужен полный список: мойка, IGU line, автоклав, ламинация и другие реальные рабочие центры.": "Need the full list: washer, IGU line, autoclave, lamination and other actual work centers.",
  "Права доступа": "Permissions",
  "В прототипе пока роли + станция. Field-level security и approval ещё не реализованы.": "The prototype currently has roles + station only. Field-level security and approval are not implemented yet.",
  "Команда и доступ к производству": "Team and production access",
  "Кто работает в системе, к какой станции привязан и какие операции умеет выполнять. Права по модулям и полям будут отдельным слоем.": "Who works in the system, which station they are assigned to, and which operations they can perform. Module and field permissions will be a separate layer.",
  "права — следующий шаг": "permissions — next step",
  "пользователей": "users",
  "привязано к станции": "assigned to a station",
  "типов навыков покрыто": "skill types covered",
  "навыков без носителя": "skills with no holder",
  "Покрытие навыков": "Skill coverage",
  "не назначена": "not assigned",
  "Изменить": "Edit",
  "Имя": "Name",
  "Роль": "Role",
  "Станция": "Station",
  "Навыки": "Skills",
  "пусто": "empty",
  "Добавить пользователя": "Add user",
  "Новый пользователь": "New user",
  "Изменение": "Edit",
  "Имя *": "Name *",
  "Роль *": "Role *",
  "Станция по умолчанию": "Default station",
  "— нет —": "— none —",
  "Навыки и уровень владения": "Skills and proficiency level",
  "не отмечено": "not selected",
  "Сохранить": "Save",
  "Отмена": "Cancel",
  "Укажи имя": "Enter a name",
  "Удалить пользователя?": "Delete user?",
  "нет": "none",
  "нет носителя": "no holder",
  "риск: 1 человек": "risk: 1 person",
  "Сначала визуальный слой — видно пробелы в компетенциях. Ниже остаётся точная матрица по уровням.": "The visual layer first shows competency gaps. The exact level matrix remains below.",
  "Навык": "Skill",
  "Покрытие": "Coverage",
  "Конфигурация изделия": "Product configuration",
  "Конфигурация": "Configuration",
  "Shape теперь хранит finished geometry, физическую топологию, features и обработку кромок. Чертёж, cutting geometry и Muntin ссылаются на ту же ревизию.": "Shape now stores finished geometry, physical topology, features and edge processing. The drawing, cutting geometry and Muntin reference the same revision.",
  "Finished Geometry, Production Drawing и Cutting Geometry формируются из одной ревизии. Отверстия, вырезы, hardware prep, радиусы и обработка кромки больше не теряются при экспорте.": "Finished Geometry, Production Drawing and Cutting Geometry are generated from one revision. Holes, cutouts, hardware prep, radii and edge processing are preserved in exports.",
  "Название / тип": "Name / type",
  "Кромок": "Edges",
  "готова к экспорту": "ready to export",
  "Новая фигура": "New shape",
  "Новая производственная фигура": "New production shape",
  "Изменение фигуры": "Edit shape",
  "Все размеры — finished size в дюймах; толщина — в миллиметрах. Невалидная геометрия не сохраняется и не экспортируется.": "All dimensions are finished sizes in inches; thickness is in millimeters. Invalid geometry cannot be saved or exported.",
  "Тип фигуры": "Shape type",
  "Обработка физических кромок": "Physical edge processing",
  "операции создают allowance и маршрут": "operations generate allowance and routing",
  "Параметры фигуры": "Shape parameters",
  "Вершины полигона": "Polygon vertices",
  "IDs стабильны для радиусов и ревизий": "IDs remain stable for radii and revisions",
  "Добавить вершину": "Add vertex",
  "Features и технологические элементы": "Features and manufacturing elements",
  "включаются в чертёж и cutting payload": "included in the drawing and cutting payload",
  "+ Отверстие": "+ Hole",
  "+ Вырез": "+ Cutout",
  "+ Радиус": "+ Radius",
  "Features не добавлены": "No features added",
  "Отверстие": "Hole",
  "Внутренний вырез": "Internal cutout",
  "Радиус вершины": "Vertex radius",
  "Маркировка": "Marking",
  "Производственные требования": "Manufacturing requirements",
  "Дополнительных операций нет": "No additional operations",
  "Файлы текущей ревизии": "Current revision files",
  "Сохранить ревизию": "Save revision",
  "Проверить на текущей ревизии Shape": "Validate against current Shape revision",
  "невалидна": "invalid",
  "Название": "Name",
  "Габарит": "Size",
  "Укажи название": "Enter a name",
  "Нельзя удалить — фигура используется в Muntinbar": "Cannot delete — the shape is used in Muntinbar",
  "Удалить фигуру?": "Delete shape?",
  "фигура удалена": "shape deleted",
  "Фигура (Shape)": "Shape",
  "Результат": "Result",
  "Новая раскладка мунтина": "New muntin layout",
  "Новая раскладка": "New layout",
  "Выбери фигуру": "Select a shape",
  "Удалить раскладку?": "Delete layout?",
  "Мост к Perfect Cut": "Perfect Cut bridge",
  "Мы не пишем собственный nesting engine. ERP формирует производственный батч, Perfect Cut оптимизирует раскрой, результат возвращается в склад и трекинг деталей.": "We are not building our own nesting engine. The ERP creates a production batch, Perfect Cut optimizes cutting, and the result returns to inventory and part tracking.",
  "коннектор не подтверждён": "connector not confirmed",
  "Как должен идти поток данных": "Intended data flow",
  "концепция · без выдуманного протокола": "concept · no invented protocol",
  "батч: material · size · qty · treatment · services": "batch: material · size · qty · treatment · services",
  "Локальный bridge": "Local bridge",
  "роль: передать данные между облачной ERP и локальным Perfect Cut": "role: move data between the cloud ERP and local Perfect Cut",
  "раскладка по листам · расход · обрезь": "sheet layouts · consumption · offcuts",
  "↩ результат оптимизации возвращается в ERP → Inventory + Production tracking": "↩ optimization result returns to ERP → Inventory + Production tracking",
  "Статус интеграции": "Integration status",
  "заблокировано входными данными": "blocked by missing input",
  "Что уже решено": "What is decided",
  "Perfect Cut остаётся оптимизатором; свой nesting engine не строим.": "Perfect Cut remains the optimizer; we are not building our own nesting engine.",
  "Что неизвестно": "What is unknown",
  "реальный механизм Spil ↔ Perfect Cut: прямая БД, ODBC, коннектор или файл.": "actual Spil ↔ Perfect Cut mechanism: direct DB, ODBC, connector, or file.",
  "Что не надо делать сейчас": "What not to do now",
  "придумывать формат обмена или имитировать API без подтверждения.": "invent an exchange format or simulate an API without confirmation.",
  "Что вернётся в ERP": "What returns to ERP",
  "листовая раскладка, фактический расход и обрезь — для Inventory и Production.": "sheet layouts, actual consumption and offcuts — for Inventory and Production.",
  "Отправить батч": "Send batch",
  "Граница ответственности": "Responsibility boundary",
  "оптимизация + собственная печать этикеток": "optimization + its own label printing",
  "Наша ERP": "Our ERP",
  "WIP, станции, бой, повторный запуск, остатки": "WIP, stations, breakage, remake, stock",
  "только транспорт данных между двумя системами": "data transport between the two systems only",
  "машины не назначены": "no machines assigned",
  "Производственный поток": "Production flow",
  "Уровень — не просто цифра в таблице. Это место станции в маршруте детали через цех. Ниже поток виден как процесс, а таблица остаётся для точного редактирования.": "A level is not just a number in a table. It is the station position in a part routing through the shop. The flow is shown visually below, while the table remains for precise editing.",
  "Маршрут по уровням": "Routing by levels",
  "все назначены": "all assigned",
  "Без уровня:": "Without level:",
  ". Их позицию в маршруте не угадываем.": ". Their route position is not guessed.",
  "Станции / машины": "Stations / machines",
  "Уровни потока": "Flow levels",
  "Поток": "Flow",
  "не назначен": "not assigned",
  "Толщина": "Thickness",
  "Статус": "Status",
  "в маршруте": "in route",
  "требует решения": "decision needed",
  "Точная таблица станций": "Exact station table",
  "CRUD сохранён": "CRUD retained",
  "Код": "Code",
  "Уровень": "Level",
  "Габарит, in": "Size, in",
  "Примечание": "Note",
  "Добавить станцию": "Add station",
  "Новая станция": "New station",
  "Код *": "Code *",
  "Название *": "Name *",
  "— не назначен —": "— not assigned —",
  "Макс. ширина, in": "Max width, in",
  "Макс. длина, in": "Max length, in",
  "Код и название обязательны": "Code and name are required",
  "Такой код уже есть": "This code already exists",
  "Нельзя удалить — на станцию назначены пользователи": "Cannot delete — users are assigned to this station",
  "Удалить станцию?": "Delete station?",
  "Название этапа": "Stage name",
  "Станций": "Stations",
  "Добавить уровень": "Add level",
  "Список открытый — добавляй уровни по мере того, как появляются новые этапы (закалка, мойка, сборка стеклопакета и т.д.).": "The list is open-ended — add levels as new stages appear (tempering, washing, IGU assembly, etc.).",
  "Новый уровень": "New level",
  "Номер *": "Number *",
  "Название этапа *": "Stage name *",
  "Заполни номер и название": "Enter the number and name",
  "Такой номер уже есть": "This number already exists",
  "Нельзя удалить — на этот уровень назначены станции": "Cannot delete — stations are assigned to this level",
  "Удалить уровень?": "Delete level?",
  "Файл не читается:": "Cannot read file:",
  "Здесь подключены реальные модули из Glass Configurator v4.5: Smart-Shape / Advanced и shape-adaptive Muntin Production. Это уже не демонстрационные точки и не прямоугольная сетка.": "The real modules from Glass Configurator v4.5 are connected here: Smart-Shape / Advanced and shape-adaptive Muntin Production. These are no longer demo points or a rectangular grid.",
  "Реальная модель из Configurator: A = Height, B = Width, C = правая сторона, D = AUTO. Поддерживаются out-of-plumb, elbows и угловые блоки Single / Double / Triple.": "Real Configurator model: A = Height, B = Width, C = right side, D = AUTO. Supports out-of-plumb, elbows and Single / Double / Triple corner blocks.",
  "Новая Advanced-фигура": "New Advanced shape",
  "Изменение Advanced-фигуры": "Edit Advanced shape",
  "Алгоритм Smart-Shape перенесён из v4.5 без упрощения геометрии.": "The Smart-Shape algorithm is ported from v4.5 without simplifying the geometry.",
  "Edge mode": "Edge mode",
  "Hide elbows · simple skew": "Hide elbows · simple skew",
  "Show elbows · compound": "Show elbows · compound",
  "Out of plumb / level": "Out of plumb / level",
  "Direction": "Direction",
  "Outage to elbow": "Outage to elbow",
  "Elbow length": "Elbow length",
  "Outage past elbow": "Outage past elbow",
  "Elbow form": "Elbow form",
  "Corner blocks": "Corner blocks",
  "Corner edge dimensions": "Corner edge dimensions",
  "Контур валиден · тот же контур используется Muntinbar": "Contour is valid · Muntinbar uses the same contour",
  "Ошибка геометрии": "Geometry error",
  "Движок": "Engine",
  "Сегментов": "Segments",
  "Equal-clear раскладка на сетке 1/16″, реальный perimeter clipping, perpendicular edge reference, отдельные cut lengths для каждой части бара.": "Equal-clear layout on a 1/16″ grid, real perimeter clipping, perpendicular edge reference and separate cut lengths for every bar segment.",
  "Изменение Muntinbar": "Edit Muntinbar",
  "Production geometry из Configurator v4.5. Бар не растягивается по bounding box — он режется реальным контуром Shape.": "Production geometry from Configurator v4.5. A bar is not stretched across the bounding box — it is cut by the real Shape perimeter.",
  "Production reference": "Production reference",
  "Bar end clearance": "Bar end clearance",
  "Edge reference": "Edge reference",
  "Custom centerlines": "Custom centerlines",
  "Flip exterior / interior": "Flip exterior / interior",
  "Введите корректный неотрицательный размер": "Enter a valid non-negative dimension",
  "Код: только A–Z, 0–9, дефис и подчёркивание": "Code: use only A–Z, 0–9, hyphen and underscore",
  "Максимальные ширина и длина заполняются вместе": "Maximum width and length must be entered together",
  "Габариты станции должны быть больше нуля": "Station dimensions must be greater than zero",
  "Минимальная и максимальная толщина заполняются вместе": "Minimum and maximum thickness must be entered together",
  "Проверь диапазон толщины": "Check the thickness range",
  "Заполни положительный целый номер и название": "Enter a positive integer number and a name",
  "Не удалось сохранить данные в браузере. Сделай экспорт JSON и проверь свободное место.": "Could not save data in the browser. Export JSON and check available storage."
};
const _textOriginal=new WeakMap();
const _attrOriginal=new WeakMap();
function tx(value){
 const raw=String(value??'');
 if(LANG!=='en') return raw;
 const m=raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
 const lead=m?m[1]:'', core=m?m[2]:raw, tail=m?m[3]:'';
 if(I18N_EN[core]!==undefined) return lead+I18N_EN[core]+tail;
 let x=core;
 let mm;
 if((mm=x.match(/^Показано: (\d+) \/ (\d+)$/))) x=`Shown: ${mm[1]} / ${mm[2]}`;
 else if((mm=x.match(/^Импортировано клиентов: (\d+)$/))) x=`Customers imported: ${mm[1]}`;
 else if((mm=x.match(/^клиент в строке (\d+): не заполнено Name$/i))) x=`Customer row ${mm[1]}: Name is required`;
 else if((mm=x.match(/^клиент в строке (\d+) должен быть объектом$/i))) x=`Customer row ${mm[1]} must be an object`;
 else if((mm=x.match(/^contacts клиента (\d+) должны быть массивом$/i))) x=`Customer ${mm[1]} contacts must be an array`;
 else if((mm=x.match(/^addresses клиента (\d+) должны быть массивом$/i))) x=`Customer ${mm[1]} addresses must be an array`;
 else if((mm=x.match(/^Customers содержит дубликат id "(.+)"$/))) x=`Customers contains duplicate id "${mm[1]}"`;
 else if((mm=x.match(/^Customers содержит дубликат кода "(.+)"$/))) x=`Customers contains duplicate code "${mm[1]}"`;
 else if((mm=x.match(/^в импортируемом файле повторяется Account "(.+)"$/i))) x=`The import file contains duplicate Account "${mm[1]}"`;
 else if((mm=x.match(/^Контакт (\d+)$/))) x=`Contact ${mm[1]}`;
 else if((mm=x.match(/^Адрес (\d+)$/))) x=`Address ${mm[1]}`;
 else if((mm=x.match(/^станций заведено · (\d+) с уровнем потока$/))) x=`stations added · ${mm[1]} with flow level`;
 else if((mm=x.match(/^контуров Shape · (\d+) схем Muntin$/))) x=`Shape contours · ${mm[1]} Muntin layouts`;
 else if((mm=x.match(/^(\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?) мм$/))) x=`${mm[1]}–${mm[2]} mm`;
 else if((mm=x.match(/^(\d+) станц\.$/))) x=`${mm[1]} stations`;
 else if((mm=x.match(/^(\d+) станций$/))) x=`${mm[1]} stations`;
 else if((mm=x.match(/^(\d+) без уровня$/))) x=`${mm[1]} without level`;
 else if((mm=x.match(/^(\d+) точек$/))) x=`${mm[1]} points`;
 else if((mm=x.match(/^(\d+) чел\.$/))) x=`${mm[1]} people`;
 else if((mm=x.match(/^(\d+) человека$/))) x=`${mm[1]} people`;
 else if((mm=x.match(/^(\d+) бар · (.+)$/))) x=`${mm[1]} bars · ${mm[2]}`;
 else if((mm=x.match(/^(\d+) бар, суммарно (.+)$/))) x=`${mm[1]} bars, total ${mm[2]}`;
 else if((mm=x.match(/^Габарит: (.+)$/))) x=`Size: ${mm[1]}`;
 else if((mm=x.match(/^(\d+) станци(?:я|и|й)$/))) x=`${mm[1]} stations`;
 else if((mm=x.match(/^Нужно указать ровно (\d+) корректных позиций внутри контура$/))) x=`Enter exactly ${mm[1]} valid positions inside the contour`;
 // Translate longer phrases even when punctuation or inline <code>/<b> splits a sentence.
 if(x===core){
   const keys=Object.keys(I18N_EN).filter(k=>k.length>=14 && core.includes(k)).sort((a,b)=>b.length-a.length);
   for(const k of keys) x=x.split(k).join(I18N_EN[k]);
 }
 return lead+x+tail;
}
/* Инженерные модули возвращают нейтральные английские причины и не знают про
   язык оболочки. Здесь — единственная точка их перевода для пользовательского UI. */
function moduleErrorText(result){
 const reason=String(result&&result.reason||'');if(LANG==='en'||!reason)return reason;
 const exact={
  'Shape not found':'Фигура не найдена',
  'Enter valid width and height.':'Введи корректные ширину и высоту.',
  'Smart-Shape outline could not be built.':'Не удалось построить контур Smart-Shape.',
  'Smart-Shape outline self-intersects. Check the outages and corner blocks.':'Контур Smart-Shape самопересекается. Проверь уклоны и угловые блоки.',
  'Smart-Shape outline encloses no area.':'Контур Smart-Shape не образует площадь.',
  'Top D is degenerate: its horizontal projection is zero.':'Сторона D вырождена: её горизонтальная проекция равна нулю.',
  'Invalid Smart-Shape':'Некорректная Smart-Shape'
 };
 if(exact[reason])return exact[reason];
 let m;
 if(reason==='Shape revision changed. Revalidate this Muntin layout against the current Shape revision.')return 'Ревизия Shape изменилась. Проверь раскладку Muntin на текущей ревизии фигуры.';
 if((m=reason.match(/^Shape is invalid: (.+)$/)))return 'Фигура невалидна: '+moduleErrorText({reason:m[1]});
 if((m=reason.match(/^Edge (.+): length must be greater than 0\.$/)))return 'Сторона '+m[1]+': длина должна быть больше нуля.';
 if((m=reason.match(/^Edge (.+): "(.+)" is not a valid dimension\.$/)))return 'Сторона '+m[1]+': «'+m[2]+'» — некорректный размер.';
 if((m=reason.match(/^Edge (.+): out of plumb \/ level "(.+)" is not a valid dimension\.$/)))return 'Сторона '+m[1]+': отклонение «'+m[2]+'» задано некорректно.';
 if((m=reason.match(/^Edge (.+): out of plumb \/ level cannot be negative\.$/)))return 'Сторона '+m[1]+': отклонение не может быть отрицательным.';
 if((m=reason.match(/^Edge (.+): pick which way it is out of plumb \/ level\.$/)))return 'Сторона '+m[1]+': выбери направление отклонения.';
 if((m=reason.match(/^Corner (TL|TR|BR|BL): (out of plumb|out of level) "(.+)" is not a valid dimension\.$/)))return 'Угол '+m[1]+': отклонение '+(m[2]==='out of plumb'?'по X':'по Y')+' «'+m[3]+'» задано некорректно.';
 if((m=reason.match(/^Corner (TL|TR|BR|BL): (out of plumb|out of level) cannot be negative\.$/)))return 'Угол '+m[1]+': отклонение не может быть отрицательным.';
 if((m=reason.match(/^Corner (TL|TR|BR|BL): pick the (out of plumb|out of level) direction\.$/)))return 'Угол '+m[1]+': выбери направление отклонения '+(m[2]==='out of plumb'?'по X':'по Y')+'.';
 if((m=reason.match(/^Edge (.+): "(.+)" is not a valid (elbow length|outage)\.$/)))return 'Сторона '+m[1]+': «'+m[2]+'» — некорректное '+(m[3]==='elbow length'?'колено':'отклонение')+'.';
 if((m=reason.match(/^Edge (.+): pick the elbow form \(direction of the skew\)\.$/)))return 'Сторона '+m[1]+': выбери форму колена (направление уклона).';
 if((m=reason.match(/^Edge (.+): elbow length (.+) is longer than the edge \((.+)\)\.$/)))return 'Сторона '+m[1]+': колено '+m[2]+' длиннее стороны ('+m[3]+').';
 if((m=reason.match(/^Corner edge (.+) \((.+)\): "(.+)" is not a valid dimension\.$/)))return 'Угловая сторона '+m[1]+' ('+m[2]+'): «'+m[3]+'» — некорректный размер.';
 if((m=reason.match(/^Corner edge (.+) \((.+)\): no value yet\.$/)))return 'Угловая сторона '+m[1]+' ('+m[2]+'): размер ещё не указан.';
 if((m=reason.match(/^(.+): corner steps (.+) do not fit in (.+)\.$/))){const side={'Left side (A)':'Левая сторона (A)','Right side (C)':'Правая сторона (C)','Bottom (B)':'Низ (B)','Top (D)':'Верх (D)'}[m[1]]||m[1];return side+': угловые ступени '+m[2]+' не помещаются в '+m[3]+'.';}
 if((m=reason.match(/^"(.+)" is not a valid dimension \((.+)\) — the last valid value is still in use\.$/)))return '«'+m[1]+'» — некорректный размер ('+m[2]+'); пока используется последнее корректное значение.';
 if((m=reason.match(/^(Vertical|Horizontal) bars: enter exactly (\d+) custom centerline position\(s\)\.$/)))return (m[1]==='Vertical'?'Вертикальные':'Горизонтальные')+' бары: укажи ровно '+m[2]+' пользовательских позиций.';
 if((m=reason.match(/^(Vertical|Horizontal) bars: the profile and edge insets do not fit inside the glass\.$/)))return (m[1]==='Vertical'?'Вертикальные':'Горизонтальные')+' бары: профиль и отступы не помещаются внутри стекла.';
 if((m=reason.match(/^(Vertical|Horizontal) bars: every custom centerline must stay inside the usable perimeter\.$/)))return (m[1]==='Vertical'?'Вертикальные':'Горизонтальные')+' бары: каждая позиция должна находиться внутри рабочего контура.';
 if((m=reason.match(/^(Vertical|Horizontal) bars: bar profiles overlap or use the same centerline\.$/)))return (m[1]==='Vertical'?'Вертикальные':'Горизонтальные')+' бары: профили перекрываются или используют одну ось.';
 if((m=reason.match(/^(Vertical|Horizontal) bars: requested bar (\d+) does not intersect the usable glass perimeter\.$/)))return (m[1]==='Vertical'?'Вертикальный':'Горизонтальный')+' бар '+m[2]+' не пересекает рабочий контур стекла.';
 if((m=reason.match(/^(Vertical|Horizontal) bars: a generated cut length is invalid\.$/)))return (m[1]==='Vertical'?'Вертикальные':'Горизонтальные')+' бары: получена некорректная длина реза.';
 return reason;
}
function moduleNoteText(note){
 const value=String(note||'');if(LANG==='en'||!value)return value;
 let m;if((m=value.match(/^Bar ends hold a constant perpendicular distance of (.+) from the real glass edge; the bar end clearance is then applied along the bar axis\.$/)))return 'Концы баров сохраняют постоянный перпендикулярный отступ '+m[1]+' от реальной кромки стекла; затем вдоль оси бара применяется торцевой зазор.';
 if(value==='Edge inset X and Y differ, so a single perpendicular distance has no meaning here. Falling back to axis-direction trimming — set both insets equal to use the offset reference.')return 'Отступы X и Y различаются, поэтому единого перпендикулярного расстояния нет. Используется обрезка вдоль оси; для offset reference задай одинаковые отступы.';
 if(value==='Legacy mode: bar ends are trimmed along the bar axis by the edge inset. On a raked, arched or curved edge that is not a constant distance from the glass.')return 'Legacy-режим: концы баров обрезаются вдоль их оси на величину edge inset. На наклонной, дуговой или кривой кромке это не даёт постоянного расстояния от стекла.';
 return value;
}
function applyLang(root=document.body){
 document.documentElement.lang=LANG;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 let node;
 while(node=walker.nextNode()){
   const parent=node.parentElement;
   if(!parent || ['SCRIPT','STYLE'].includes(parent.tagName)) continue;
   /* data-raw = значение, введённое пользователем. Переводить его нельзя:
      RU/EN обязан менять интерфейс, а не содержимое базы. */
   if(parent.closest('[data-raw]')) continue;
   if(!_textOriginal.has(node)) _textOriginal.set(node,node.nodeValue);
   const original=_textOriginal.get(node);
   node.nodeValue = LANG==='en' ? tx(original) : original;
 }
 document.querySelectorAll('[placeholder]').forEach(el=>{
   let rec=_attrOriginal.get(el);if(!rec){rec={};_attrOriginal.set(el,rec);}if(rec.placeholder===undefined)rec.placeholder=el.getAttribute('placeholder')||'';
   el.setAttribute('placeholder',LANG==='en'?tx(rec.placeholder):rec.placeholder);
 });
 document.querySelectorAll('[data-i18n-title]').forEach(el=>{ el.title=LANG==='en'?tx(el.dataset.i18nTitle):el.dataset.i18nTitle; });
 const ru=document.getElementById('langRu'), en=document.getElementById('langEn');
 if(ru) ru.classList.toggle('on',LANG==='ru');
 if(en) en.classList.toggle('on',LANG==='en');
}
function setLang(lang){
 LANG=lang==='en'?'en':'ru';
 localStorage.setItem('glazing_system_lang',LANG);
 render();
}

const _nativeAlert=window.alert.bind(window);
const _nativeConfirm=window.confirm.bind(window);
window.alert=(msg)=>_nativeAlert(tx(msg));
window.confirm=(msg)=>_nativeConfirm(tx(msg));
