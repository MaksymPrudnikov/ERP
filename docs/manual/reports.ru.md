# Reports — руководство

Reports — конструктор отчётов, как Looker Studio: вы сами собираете отчёт из страниц и графиков, выбираете данные,
разрезы, показатели, фильтры и период. Отчёт считает всё, что есть в базе, включая заказы, ушедшие в архив, за
любые годы. Ничего не обрезается: все строки, все значения, все дни. Режет только то, что вы задали сами (Top N).

---

## 1. Экран

- **Слева — каталог.** Поиск, Pinned (★ избранное), Recent (недавние) и папки деревом: «Production / Cutting» — папка
  и подпапка. «‹» прячет каталог, отчёт идёт на всю ширину. «☰ Reports» возвращает каталог.
- **В центре — отчёт.** Название, вкладки страниц, строка фильтров (Date и кнопки-фильтры), под ними графики.
- **Справа в режиме Edit — Chart setup**, настройка выбранного графика.

Кнопки отчёта: ☆ Pin, Edit (если отчёт ваш или вы администратор), Copy (своя копия любого отчёта), Print.
Готовые отчёты (Starter report) правит администратор; остальные делают Copy и правят копию.

## 2. Период и фильтры зрителя

- **Date** — период отчёта: Today, Yesterday, This week, Last week, Last 7/30/90 days, This month, Last month,
  This quarter, Last quarter, This year, Last year, All time или свои даты (Custom).
- **Кнопки-фильтры** (Glass, Thickness, Customer…) — выбор одного или нескольких значений. Клик по значению в
  таблице или на графике (по строке, полосе, доле) — тоже фильтр всего отчёта.
- Ваши период и фильтры живут в этом браузере. **Reset** — вернуть период и фильтры отчёта. **Save as default** —
  записать их в отчёт для всех (если вы можете править отчёт).
- Внизу графика «Not filtered by …» — фильтр отчёта не применился: у этого источника данных нет такого поля.

## 3. Загрузка и архив

- Заказ уходит в архив через месяц после отгрузки и полной оплаты. Отчёт за прошлые месяцы и годы читает архив сам:
  на экране «Reading N archived orders · 42%», потом графики. Строки закрытых месяцев запоминаются на диске этого
  компьютера, и второе открытие идёт сразу.
- Долгий расчёт (годы данных) идёт в фоне: «Building report · 42%». Экран не замирает, можно уйти на другой раздел.
- После записи в другой вкладке (например, скан на станции) прежние графики остаются на экране, а в шапке видно
  «Updating · 42%», пока считаются новые.

## 4. Как собрать свой отчёт

1. **+ New** (или Copy готового) → откроется Edit.
2. Название, папка («Production / Cutting»), кто видит: Only me или Everyone with Reports.
3. **+ Page** — страницы. Имя страницы, ← → порядок, Portrait или Landscape — как печатать эту страницу.
4. **+ Add chart** — график. Клик по графику — его настройка справа.
5. **+ Control** — кнопка-фильтр над отчётом (Glass, Thickness, Customer…).
6. **Save** — записать. **Cancel** — вернуть как было. Уйти с несохранёнными правками ERP не даст без вопроса.

### 4.1 Настройка графика (Chart setup)

| Поле | Что это |
|---|---|
| Chart type | Number (итог), Table, Bars (полосы), Columns (столбцы), Combo, Line, Pie (круг). Меняется в один клик. |
| Title | Своё название; пусто — название по данным. |
| Data | Источник данных (список ниже, раздел 5). |
| Dimension | Разрез строк: по чему делить (Glass, Thickness, Batch, день, месяц…). Даты — Day, Week, Month, Quarter, Year, Weekday, Hour. |
| + Row dimension | Только у таблицы: ещё разрезы строк своими колонками, например Thickness → Glass → Batch. Строки идут по именам, повтор значения из строки выше бледный — видно группу. |
| Breakdown | Второй разрез: в таблице — колонки, на графике — цвета (стопкой). Все значения, без «Other». |
| Metrics | Показатели: что считать. Числовое поле — Sum, Average, Min, Max; текстовое — count и distinct. Сколько угодно показателей. |
| + Calculated | Быстрая формула из двух частей: показатель ÷ × + − показатель или число. |
| + Custom metric | Своя формула любой длины (раздел 6). |
| Filter / + Add filter | Фильтр строк по полю: Is any of, Contains, >, Between… |
| + Metric filter | Фильтр по показателю (раздел 7). |
| Date range | Report period или свой период графика; поле даты, если их несколько (Created, Due, Shipped…). |
| Comparison | Previous period или Same period last year: рядом число прошлого периода и ▲▼ %. |
| Sort · rows | Порядок строк; Top N — оставить N первых, Other row — остальное одной строкой. По умолчанию показывается всё. |
| Layout | Full width или Half width; Totals — строка итогов у таблицы. |

### 4.2 Таблица, полосы, круг, Combo

- Таблица показывает все строки: прокрутка внутри карточки, шапка и Total на месте. Под таблицей — сколько строк.
- **Сортировка:** клик по заголовку колонки — по ней (▼ больше вверху, второй клик ▲). Порядок свой у вас в этом
  браузере; Reset возвращает порядок отчёта.
- **CSV** в углу каждого графика — все его строки и колонки файлом для Excel, числа без форматирования, строка Total.
- **Combo** — два показателя на одном графике: колонка — первый показатель, внутри узкая колонка — второй, по своей
  шкале. Например «листов порезано за месяц» и внутри «батчей». При наведении видны оба числа.
- Полосы и легенда круга — все значения, прокрутка внутри карточки.
- Дни за годы — плотная гистограмма: каждый день виден, при наведении — дата и число.

## 5. Источники данных

Каждый источник — свои строки и поля. Поля одного источника не повторяют названий: «Glass» — тип стекла,
«Glass pcs» — штуки.

Каждое поле и показатель объясняет себя. Под списками Dimension и Metrics строка говорит, что выбрано
(например «Glass · distinct — how many different Glass values»); тот же текст — подсказка у каждого пункта и у
каждой кнопки поля под формулой, а при наведении на кнопку он виден под кнопками. Виды: **list** (по нему делят
и отбирают), **text**, **date**, **number** (сумма, среднее, мин, макс). **Glass · count** — строки, где Glass
заполнено; **Glass · distinct** — сколько разных типов стекла.

| Источник | Строка — это | Главное |
|---|---|---|
| Station work | скан стекла на станции | стёкла, ft², юниты, $ по прайсу, кто, где, когда |
| Cutting | рез на CUT | порезано стёкол и ft², резчик, батчи |
| Sheets | лист раскроя батча | листы, ft² листа, годное, отход, Used % — по плану раскроя |
| Sheets cut | лист по скану резчика | порезано листов, лопнуло (Broken — отдельно, это не порезанные) |
| Edgework · Drilling & CNC · All operations | работа на стекле | линейные дюймы, штуки, ft² работы, $ |
| Tempering · IGU & lamination · Shipping handout | скан своей станции | стёкла, ft², юниты |
| Batches | батч × стекло × заказ | листы, остатки, Used %, дни до реза |
| Plan vs actual | батч × стекло | план раскроя против факта: листов по плану и порезано, лопнуло, отход по плану и по факту (раздел 5.1) |
| Orders & due dates | заказ | вовремя / поздно, дни на этапах, сумма |
| Ordered glass · Products sold | строка заказа | что заказали и продали, по мерам и деньгам |
| Breaks & recuts | разбитое стекло, Recut, NCR | где, почему, кто, сколько стоило |
| Deliveries & pickups | Packing slip | рейсы, машины, км, скиды |
| Quotes | квота | выиграно, отправлено, сумма |
| Payments · Payments by order · Refunds · Balances & overdue · Agent commissions | деньги | только с галочкой Finance / Commissions |
| Stock counts · Sheet moves · IGU materials used · Offcuts in stock | склад | пересчёты, движения листов, расход IGU |
| Stock now | позиция склада сейчас | всё на полках одной таблицей: листы, обрезки, расходники, Stock items (раздел 5.2) |
| PO lines · Supplier receipts · Supplier bills | закупки | с галочкой Purchasing |
| Shop now | стекло в цеху сейчас | где стоит, сколько ждёт, просрочка |
| Customers | клиент | последний заказ, новые, сумма продаж |

### 5.1 План против факта (Plan vs actual)

Строка — батч и стекло. Сравнивает, что заложил раскрой, с тем, что было в цеху.

| Поле | Как считается |
|---|---|
| Plan sheets, Plan sheet ft² | листы и их площадь в раскрое батча |
| Plan glass ft², Plan waste ft² | годное и отход по раскрою |
| Sheets cut, Cut sheet ft² | листы, порезанные по скану резчика (первый рез с листа) |
| Sheets broken, Broken sheet ft² | лопнувшие листы — отдельно: лопнувший лист не порезанный, в отход по факту не входит |
| Good glass ft² | порезанное стекло батча, которое не разбили |
| Recut ft², Recut pcs | порезанное и потом разбитое стекло (ушло в Recut) |
| Actual waste ft² | Cut sheet ft² − Good glass ft² − Recut ft² |
| Plan waste %, Actual waste % | отход ÷ площадь листов × 100 — по плану и по факту |
| Sheets over plan | Sheets cut − Plan sheets; у батча, который ещё режут, — минус |
| Cutter | кто порезал больше листов этого батча |

Готовый отчёт **Cutting · plan vs actual** (Production / Cutting): итоги, листы по месяцам с батчами внутри (Combo),
по резчикам, по толщине и стеклу, страница Batches — каждый батч.

### 5.2 Склад сейчас (Stock now)

Строка — позиция склада сейчас: лист размера, обрезок на полке или в батче, расходник, Stock item. Колонки On hand,
Free, Reserved, On order, Minimum — в единице строки (листы, штуки, kg, ft); итог складывается только в одной единице.
Готовый отчёт **Stock now · everything on the shelves** (Inventory).

## 6. Свой показатель (Custom metric)

Своя формула, как calculated field в Looker Studio. Создаётся один раз и потом стоит в списке Metrics у всех
графиков этого источника в отчёте.

1. В настройке графика **+ Custom metric**.
2. **Name** — своё название, например `Waste %`.
3. **Formula** — формула. Внизу сразу видно «Formula is OK» или что не так, словами.
4. Format: Number, Money или Percent; знаки после запятой.
5. **Save metric** — показатель добавится в этот график и появится в списке Metrics.

### Как писать формулу

- Поле или показатель — в квадратных скобках, как называется в списке: `[Sheets]`, `[Waste ft²]`, `[Used %]`.
  Кнопки под формулой вставляют их сами.
- **Field as** — как вставлять поле кнопкой: Auto (число — суммой, текст — Count distinct), Sum, Average, Min, Max,
  Count, Count distinct. Например, Count + Glass → `COUNT([Glass])`.
- Действия: `+  -  *  /` и скобки `( )`.
- Функции: `SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `COUNT_DISTINCT`. `COUNT()` без поля — число строк.
- Числовое поле без функции — сумма: `[Sheets]` то же, что `SUM([Sheets])`.
- Свой показатель можно взять в другой по имени: `[Waste %] * 2`.
- Деление на ноль даёт пусто, а не ошибку.

### Примеры для цеха

| Название | Формула | Источник |
|---|---|---|
| Waste % | `[Waste ft²] / [Sheet ft²] * 100` | Sheets |
| Waste % (из листов батча) | `([Sheet ft²] - [Used ft²]) / [Sheet ft²] * 100` | Batches |
| Sheets per day | `SUM([Sheets]) / COUNT_DISTINCT([Batch day])` | Batches |
| ft² per day | `[Glass ft²] / COUNT_DISTINCT([Batch day])` | Batches |
| Glass per batch | `[Glass pcs] / COUNT_DISTINCT([Batch])` | Batches |
| Broken per 100 sheets | `[Broken] / [Sheets cut] * 100` | Sheets cut |

## 7. Фильтр по показателю (Metric filter)

Как фильтр по метрике в Looker: строка графика остаётся, если её показатель подходит.

1. **+ Metric filter** в настройке графика.
2. Показатель (любой, и свой тоже), условие `>  ≥  <  ≤  =  Between`, число.

Примеры: в таблице по батчам `Used % < 60` — только батчи с плохим раскроем; по резчикам `Waste % > 35`; по дням
`Sheets broken > 0`. Фильтр считается по строке графика (батч, день, резчик), итог внизу — по оставшимся строкам.
Без разреза строк фильтр проверяет весь итог.

## 8. Цвета

- 24 насыщенных цвета, только для отчётов, двумя рядами по 12. Отчёт берёт их по порядку.
- Свой цвет значения: в Edit клик по значению в легенде (например «6CLEAR») → квадратики → выбрать. Цвет
  запоминается в отчёте и одинаков на всех его графиках. **Automatic** — снова по порядку.
- Фильтр не перекрашивает: у значения тот же цвет при любом выборе.

## 9. Печать

- **Print** печатает все страницы отчёта, каждую на свой лист Letter. Нужно два листа — сделайте две страницы.
- Ориентация — у страницы: Portrait или Landscape (в Edit рядом с названием страницы).
- Лист — как отчёт на экране, уменьшенный под бумагу. Таблица печатается так, как видна в карточке; все строки — через CSV.
- В Edit пунктир **End of sheet** показывает, где кончается лист: всё выше ляжет на лист как на экране, всё ниже
  уменьшит лист сильнее.
- В окне печати есть «Save as PDF».

## 10. Руководство одним PDF

`node tools/manual-pdf.js` собирает всё руководство (все разделы `docs/manual/`) в PDF на русском и английском:
обложка, оглавление, главы, номера страниц. Файлы — в папке Downloads.

## 10.1 Отчёт на экранах людей и станций

**Show on** (администратор или галочка Screens): отчёт появляется вкладкой на Board выбранных станций и в Overview
выбранных людей. Фильтры «This station» и «Me» подставляют станцию и вошедшего человека.

## 11. Почему так

- «Не нужно ничего ограничивать, нужно загружать всё» (владелец, 03.11.2026) — поэтому нет обрезки строк, значений
  и дней; скорость держит прокрутка, дорисовка и расчёт в фоне с процентом.
- Архив читается частями и запоминается по закрытым месяцам: отчёт за 5–7 лет не держит в памяти записи всех лет.
- Свои показатели и фильтр по показателю — чтобы находить проблемы самому: план против факта, отход, брак, кто и где.

## 12. Все поля и показатели (из кода)

Собирается командой `node tools/manual-fields.js --write`; тест сверяет с кодом. Названия — как на экране.
Kind: Date — дата, List — значения списком, Text — текст, Number — число. How — как считается показатель.

<!-- fields:start -->

### Station work

Glass through every station.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Person | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Scan | List |
| Glass ID | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass ft² | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Glass pcs | Count of rows |
| Glass ft² | Sum of Glass ft² |
| Units | Distinct unitKey |
| Orders | Distinct Order |
| $ by price list | Sum of $ by price list |

### Cutting

Glass cut at CUT.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Cutter | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Scan | List |
| Glass ID | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass ft² | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Glass cut | Count of rows |
| ft² cut | Sum of Glass ft² |
| Orders | Distinct Order |
| Batches | Distinct Batch |

### Sheets

Sheet sizes used and waste.

| Field | Kind |
|---|---|
| Built | Date |
| Batch | Text |
| Glass | List |
| Thickness | List |
| Sheet size | List |
| Sheet or offcut | List |
| Status | List |
| Manufacturer | List |
| Sheets | Number |
| Broken | Number |
| Sheet ft² | Number |
| Glass ft² | Number |
| Waste ft² | Number |
| To stock ft² | Number |

| Metric | How |
|---|---|
| Sheets | Sum of Sheets |
| Sheet ft² | Sum of Sheet ft² |
| Glass ft² | Sum of Glass ft² |
| Waste ft² | Sum of Waste ft² |
| Used % | Glass ft² ÷ Sheet ft² × 100 |
| Broken | Sum of Broken |

### Edgework

Linear inches by operation.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Person | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Operation | List |
| Unit | List |
| Quantity | Number |
| Linear in | Number |
| Work ft² | Number |
| Pieces | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Linear in | Sum of Linear in |
| Operations | Count of rows |
| Glass pcs | Distinct piece |
| $ by price list | Sum of $ by price list |

### Drilling & CNC

Holes, notches, cutouts, hardware.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Person | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Operation | List |
| Unit | List |
| Quantity | Number |
| Linear in | Number |
| Work ft² | Number |
| Pieces | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Pieces | Sum of Pieces |
| Glass pcs | Distinct piece |
| $ by price list | Sum of $ by price list |

### All operations

Every priced work at every station.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Person | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Operation | List |
| Unit | List |
| Quantity | Number |
| Linear in | Number |
| Work ft² | Number |
| Pieces | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Quantity | Sum of Quantity |
| Linear in | Sum of Linear in |
| Work ft² | Sum of Work ft² |
| Pieces | Sum of Pieces |
| $ by price list | Sum of $ by price list |

### Tempering

Glass through the furnace.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Operator | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Scan | List |
| Glass ID | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass ft² | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Glass pcs | Count of rows |
| Glass ft² | Sum of Glass ft² |
| Orders | Distinct Order |

### IGU & lamination

Units assembled.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Assembler | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Scan | List |
| Glass ID | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass ft² | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Units | Distinct asmDone |
| Glass pcs | Count of rows |
| Glass ft² | Sum of Glass ft² |

### Shipping handout

Glass and units handed out at SHIP.

| Field | Kind |
|---|---|
| Scan time | Date |
| Station | List |
| Handed out by | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Priority | List |
| Batch | Text |
| Scan | List |
| Glass ID | Text |
| Dolly / skid | List |
| Original or recut | List |
| Due | Date |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass ft² | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Units | Distinct unitKey |
| Glass pcs | Count of rows |
| Glass ft² | Sum of Glass ft² |
| Orders | Distinct Order |

### Deliveries & pickups

Packing slips, trips, skids.

| Field | Kind |
|---|---|
| Date | Date |
| Method | List |
| Status | List |
| Truck | List |
| Driver | List |
| Customer | List |
| Packing slip | Text |
| City | List |
| Departs | List |
| Stop # | Number |
| Units | Number |
| Skids | Number |
| Weight kg | Number |
| Km | Number |

| Metric | How |
|---|---|
| Packing slips | Count of rows |
| Trips | Distinct trip |
| Units | Sum of Units |
| Skids | Sum of Skids |
| Weight kg | Sum of Weight kg |
| Km | Sum of Km |
| Km per trip | Km ÷ kmDone |

### Orders & due dates

On time, late, days at each stage.

| Field | Kind |
|---|---|
| Due | Date |
| Created | Date |
| Shipped | Date |
| Ready for pickup | Date |
| Verified | Date |
| Batched | Date |
| All ready | Date |
| Done | Date |
| Order | Text |
| Customer | List |
| Priority | List |
| Delivery | List |
| Status | List |
| On time | List |
| On hold | List |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Units | Number |
| Glass pcs | Number |
| Area ft² | Number |
| Lines | Number |
| Shapes | Number |
| Weight kg | Number |
| Weight | List |
| Days late | Number |
| Lead time, days | Number |
| Days new → verified | Number |
| Days verified → batched | Number |
| Days batched → ready | Number |
| Days ready → done | Number |
| Order total | Number |

| Metric | How |
|---|---|
| Orders | Count of rows |
| Late orders | Sum of late |
| On time % | onTimeN ÷ judgedN × 100 |
| Units | Sum of Units |
| Glass pcs | Sum of Glass pcs |
| Area ft² | Sum of Area ft² |
| Order total | Sum of Order total |

### Ordered glass

Glass, thickness and ft² ordered.

| Field | Kind |
|---|---|
| Created | Date |
| Due | Date |
| Order | Text |
| Customer | List |
| Glass | List |
| Thickness | List |
| Temper | List |
| Unit type | List |
| Status | List |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass pcs | Number |
| Glass ft² | Number |
| Units | Number |

| Metric | How |
|---|---|
| Glass pcs | Sum of Glass pcs |
| Glass ft² | Sum of Glass ft² |
| Units | Sum of Units |
| Orders | Distinct Order |

### Breaks & recuts

Recut and NCR glass.

| Field | Kind |
|---|---|
| Date | Date |
| Kind | List |
| Station | List |
| Reason | List |
| Person | List |
| Customer | List |
| Order | Text |
| Glass | List |
| Thickness | List |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass pcs | Number |
| Glass ft² | Number |
| $ by price list | Number |

| Metric | How |
|---|---|
| Glass pcs | Sum of Glass pcs |
| Glass ft² | Sum of Glass ft² |
| $ by price list | Sum of $ by price list |
| Records | Count of rows |

### Time at stations

First to last scan per person and day.

| Field | Kind |
|---|---|
| Day | Date |
| Person | List |
| Station | List |
| First scan hour | Number |
| Last scan hour | Number |
| Hours between scans | Number |
| Glass pcs | Number |
| Glass ft² | Number |

| Metric | How |
|---|---|
| Hours | Sum of Hours between scans |
| Glass pcs | Sum of Glass pcs |
| Glass per hour | glassTimed ÷ hoursTimed |
| Person-days | Count of rows |

### Quotes

Won, sent, expired, value.

| Field | Kind |
|---|---|
| Created | Date |
| Sent | Date |
| Valid until | Date |
| Quote | Text |
| Customer | List |
| Status | List |
| Won order | Text |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Revisions | Number |
| Units | Number |
| Area ft² | Number |
| Quote value | Number |
| Won value | Number |

| Metric | How |
|---|---|
| Quotes | Count of rows |
| Won | Sum of won |
| Win rate % | won ÷ one × 100 |
| Quote value | Sum of Quote value |
| Won value | Sum of Won value |
| Area ft² | Sum of Area ft² |

### Payments · finance

Receipts by date, customer, method.

| Field | Kind |
|---|---|
| Date | Date |
| Receipt | Text |
| Customer | List |
| Method | List |
| Currency | List |
| Sales rep | List |
| City | List |
| Customer type | List |
| Amount | Number |
| Applied to orders | Number |
| On account | Number |
| Orders paid | Number |

| Metric | How |
|---|---|
| Amount | Sum of Amount |
| Receipts | Count of rows |
| Applied to orders | Sum of Applied to orders |
| On account | Sum of On account |
| Customers | Distinct Customer |

### Balances & overdue · finance · now

What customers owe and how late.

| Field | Kind |
|---|---|
| Payment due | Date |
| Billed | Date |
| Order | Text |
| Customer | List |
| Status | List |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Order total | Number |
| Paid | Number |
| Balance | Number |
| Overdue | Number |
| Days overdue | Number |

| Metric | How |
|---|---|
| Balance | Sum of Balance |
| Overdue | Sum of Overdue |
| Overdue orders | Sum of overdueN |
| Orders | Count of rows |
| Paid | Sum of Paid |
| Order total | Sum of Order total |

### Products sold

Every product, work and service sold.

| Field | Kind |
|---|---|
| Order date | Date |
| Due | Date |
| Shipped | Date |
| Order | Text |
| Customer | List |
| Category | List |
| Type | List |
| Product | List |
| Unit | List |
| Thickness | List |
| Temper | List |
| Station | List |
| Unit type | List |
| Makeup | Text |
| Charged | List |
| Status | List |
| Priority | List |
| Delivery | List |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Quantity | Number |
| Amount | Number |
| Price per unit | Number |
| By price list | Number |
| Units | Number |
| Unit ft² | Number |
| Glass ft² | Number |
| Film ft² | Number |
| Laminate ft² | Number |
| Spacer ft | Number |
| Linear in | Number |
| Pieces | Number |
| Work ft² | Number |

| Metric | How |
|---|---|
| Amount | Sum of Amount |
| Quantity | Sum of Quantity (one unit only) |
| Avg price per unit | Amount ÷ Quantity (one unit only) |
| Orders | Distinct Order |
| Customers | Distinct Customer |
| Units | Sum of Units |
| Unit ft² | Sum of Unit ft² |
| Glass ft² | Sum of Glass ft² |
| Film ft² | Sum of Film ft² |
| Laminate ft² | Sum of Laminate ft² |
| Linear in | Sum of Linear in |
| Pieces | Sum of Pieces |
| Work ft² | Sum of Work ft² |
| Spacer ft | Sum of Spacer ft |
| By price list | Sum of By price list |

### Shop now · now

Where every glass is, days waiting, overdue.

| Field | Kind |
|---|---|
| Where | List |
| Stage | List |
| Due state | List |
| Due | Date |
| Waiting since | Date |
| Order | Text |
| Customer | List |
| Priority | List |
| Delivery | List |
| On hold | List |
| Status | List |
| Came from | List |
| Dolly / skid | List |
| Glass | List |
| Thickness | List |
| Batch | Text |
| Glass ID | Text |
| PO | Text |
| Sales rep | List |
| City | List |
| Province | List |
| Terms | List |
| Customer type | List |
| Line mark | Text |
| Size | List |
| Shape | List |
| Size band | List |
| Manufacturer | List |
| Glass pcs | Number |
| Glass ft² | Number |
| Days waiting | Number |
| Days overdue | Number |
| Overdue glass | Number |

| Metric | How |
|---|---|
| Glass pcs | Sum of Glass pcs |
| Glass ft² | Sum of Glass ft² |
| Orders | Distinct Order |
| Overdue orders | Distinct overOrder |
| Overdue glass | Sum of Overdue glass |

### Sheets cut

Sheets cut and broken by cutter.

| Field | Kind |
|---|---|
| Date | Date |
| Cutter | List |
| Cut or broke | List |
| Glass | List |
| Thickness | List |
| Sheet size | List |
| Sheet or offcut | List |
| Batch | Text |
| Sheets cut | Number |
| Broken | Number |
| Sheet ft² | Number |

| Metric | How |
|---|---|
| Sheets cut | Sum of Sheets cut |
| Broken | Sum of Broken |
| Sheet ft² | Sum of Sheet ft² |
| Batches | Distinct Batch |

### Offcuts in stock · now

Sheet offcuts kept, used, removed.

| Field | Kind |
|---|---|
| Booked | Date |
| Offcut | Text |
| Glass | List |
| Thickness | List |
| Manufacturer | List |
| Size | List |
| Batch | Text |
| Status | List |
| Area ft² | Number |

| Metric | How |
|---|---|
| Offcuts | Count of rows |
| Area ft² | Sum of Area ft² |

### Batches

Glass, sheets and days to cut by batch.

| Field | Kind |
|---|---|
| Built | Date |
| First cut | Date |
| Last cut | Date |
| Batch day | List |
| Batch | Text |
| Status | List |
| Glass | List |
| Thickness | List |
| Order | Text |
| Customer | List |
| Glass pcs | Number |
| Glass ft² | Number |
| Glass cut | Number |
| Sheets | Number |
| Offcuts used | Number |
| Sheet ft² | Number |
| Used ft² | Number |
| Sheets broken | Number |
| Days to first cut | Number |
| Days to last cut | Number |

| Metric | How |
|---|---|
| Batches | Distinct Batch |
| Glass pcs | Sum of Glass pcs |
| Glass ft² | Sum of Glass ft² |
| Orders | Distinct Order |
| Sheets | Sum of Sheets |
| Offcuts used | Sum of Offcuts used |
| Sheet ft² | Sum of Sheet ft² |
| Used % | Used ft² ÷ Sheet ft² × 100 |
| Sheets broken | Sum of Sheets broken |
| Days to first cut · avg | Average of Days to first cut |
| Days to last cut · avg | Average of Days to last cut |

### Stock counts · inventory

Was → counted, difference, reason.

| Field | Kind |
|---|---|
| Count time | Date |
| Count day | List |
| Counted by | List |
| Kind | List |
| Material | List |
| Glass | List |
| Sheet size | List |
| Thickness | List |
| Unit | List |
| Short or over | List |
| Reason | List |
| Note | Text |
| Was | Number |
| Counted | Number |
| Difference | Number |
| Sheets | Number |
| Sheet ft² | Number |
| Spacer ft | Number |
| Sealant kg | Number |
| Gas kg | Number |
| IGU parts kg | Number |
| Stock items, pcs | Number |

| Metric | How |
|---|---|
| Lines counted | Count of rows |
| With difference | Sum of off |
| Short | Sum of short |
| Over | Sum of over |
| Days counted | Distinct Count day |
| Difference | Sum of Difference (one unit only) |
| Sheets | Sum of Sheets |
| Sheet ft² | Sum of Sheet ft² |
| Spacer ft | Sum of Spacer ft |
| Sealant kg | Sum of Sealant kg |
| Gas kg | Sum of Gas kg |
| IGU parts kg | Sum of IGU parts kg |
| Stock items, pcs | Sum of Stock items, pcs |

### Sheet moves · inventory

Received, cut, broke, written off, counted.

| Field | Kind |
|---|---|
| Date | Date |
| Move | List |
| In or out | List |
| Sheet | List |
| Glass | List |
| Sheet size | List |
| Thickness | List |
| Person | List |
| Reason | List |
| Reference | Text |
| Batch | Text |
| Note | Text |
| Sheets moved | Number |
| Sheets in | Number |
| Sheets out | Number |
| Net sheets | Number |
| ft² moved | Number |
| ft² in | Number |
| ft² out | Number |
| Net ft² | Number |

| Metric | How |
|---|---|
| Sheets in | Sum of Sheets in |
| Sheets out | Sum of Sheets out |
| Net sheets | Sum of Net sheets |
| Sheets moved | Sum of Sheets moved |
| ft² in | Sum of ft² in |
| ft² out | Sum of ft² out |
| Net ft² | Sum of Net ft² |
| Moves | Count of rows |

### IGU materials used · inventory

Spacer, sealant, gas by IGU scan.

| Field | Kind |
|---|---|
| Assembled | Date |
| Assembled by | List |
| Kind | List |
| Material | List |
| Unit | List |
| Record | List |
| Norm | List |
| Quantity | Number |
| Spacer ft | Number |
| Sealant kg | Number |
| Gas kg | Number |
| IGU parts kg | Number |
| Units built with it | Number |
| Units without norm | Number |

| Metric | How |
|---|---|
| Quantity | Sum of Quantity (one unit only) |
| Spacer ft | Sum of Spacer ft |
| Sealant kg | Sum of Sealant kg |
| Gas kg | Sum of Gas kg |
| IGU parts kg | Sum of IGU parts kg |
| Units built with it | Sum of Units built with it |
| Units without norm | Sum of Units without norm |
| Days | Distinct Assembled |

### PO lines · purchasing

Ordered, received, waiting, amount.

| Field | Kind |
|---|---|
| PO date | Date |
| Expected | Date |
| Sent | Date |
| PO | Text |
| Supplier | List |
| Currency | List |
| Account | List |
| Status | List |
| Held | List |
| Price unit | List |
| Kind | List |
| Item group | List |
| Item | List |
| Glass | List |
| Thickness | List |
| Sheet size | List |
| Unit | List |
| Ordered | Number |
| Received | Number |
| Waiting | Number |
| Replacement due | Number |
| Sheets ordered | Number |
| Sheet ft² ordered | Number |
| Price | Number |
| Amount | Number |

| Metric | How |
|---|---|
| PO lines | Count of rows |
| POs | Distinct PO |
| Amount | Sum of Amount (one unit only) |
| Lines waiting | Sum of waiting |
| Waiting past expected | Sum of overdue |
| Lines without price | Sum of unpriced |
| Sheets ordered | Sum of Sheets ordered |
| Sheet ft² ordered | Sum of Sheet ft² ordered |
| Suppliers | Distinct Supplier |

### Supplier receipts · purchasing

Arrived, broken, late.

| Field | Kind |
|---|---|
| Received on | Date |
| Expected | Date |
| Receipt | Text |
| PO | Text |
| Supplier | List |
| Received by | List |
| Packing slip | Text |
| New or replacement | List |
| On time | List |
| Broken · reason | List |
| Broken · resolution | List |
| Kind | List |
| Item group | List |
| Item | List |
| Glass | List |
| Thickness | List |
| Sheet size | List |
| Unit | List |
| Received | Number |
| Broken | Number |
| Sheets | Number |
| Sheet ft² | Number |
| Days late | Number |

| Metric | How |
|---|---|
| Receipt lines | Count of rows |
| Receipts | Distinct Receipt |
| Late lines | Sum of late |
| On time % | onTimeN ÷ judgedN × 100 |
| Lines with broken | Sum of brokenLines |
| Broken | Sum of Broken (one unit only) |
| Sheets | Sum of Sheets |
| Sheet ft² | Sum of Sheet ft² |

### Supplier bills · purchasing

Invoices, payments, balance, overdue.

| Field | Kind |
|---|---|
| Date | Date |
| Due | Date |
| Invoice or payment | List |
| Document | Text |
| Supplier | List |
| Currency | List |
| Account | List |
| Status | List |
| POs | Text |
| Payment method | List |
| Invoiced | Number |
| Paid | Number |
| Balance | Number |
| Invoice balance | Number |
| Overdue | Number |
| Days overdue | Number |
| Days to pay | Number |

| Metric | How |
|---|---|
| Invoiced | Sum of Invoiced (one unit only) |
| Paid | Sum of Paid (one unit only) |
| Balance | Sum of Balance (one unit only) |
| Overdue | Sum of Overdue (one unit only) |
| Invoices | Sum of invoices |
| Invoices overdue | Sum of overdueN |
| Amount needed | Sum of amountNeeded |
| Documents | Count of rows |

### Payments by order · finance

What each order got, when, how late.

| Field | Kind |
|---|---|
| Paid | Date |
| Order date | Date |
| Billed | Date |
| Payment due | Date |
| Receipt | Text |
| Order | Text |
| Customer | List |
| Method | List |
| Currency | List |
| When paid | List |
| Sales rep | List |
| City | List |
| Customer type | List |
| Amount | Number |
| Paid late | Number |
| Days to pay | Number |
| Days late | Number |

| Metric | How |
|---|---|
| Amount | Sum of Amount (one unit only) |
| Payments | Count of rows |
| Orders | Distinct Order |
| Paid late | Sum of Paid late (one unit only) |
| Days to pay · avg | Average of Days to pay |
| Customers | Distinct Customer |

### Refunds · finance

Money back: amount, reason.

| Field | Kind |
|---|---|
| Refund date | Date |
| Refund | Text |
| From payment | Text |
| Customer | List |
| Method | List |
| Currency | List |
| Reason | List |
| Sales rep | List |
| Amount | Number |
| Days after payment | Number |

| Metric | How |
|---|---|
| Refunded | Sum of Amount (one unit only) |
| Refunds | Count of rows |
| Customers | Distinct Customer |

### Agent commissions · commissions · now

Earned, paid out, owed by agent.

| Field | Kind |
|---|---|
| Order date | Date |
| Agent | List |
| Customer | List |
| Order | Text |
| Percent | List |
| Order total | Number |
| Paid by customer | Number |
| Paid without HST | Number |
| Earned | Number |
| Earned with HST | Number |
| Paid out | Number |
| To pay | Number |
| To pay with HST | Number |

| Metric | How |
|---|---|
| Earned | Sum of Earned |
| Paid out | Sum of Paid out |
| To pay | Sum of To pay |
| Earned with HST | Sum of Earned with HST |
| To pay with HST | Sum of To pay with HST |
| Paid by customers | Sum of Paid by customer |
| Paid without HST | Sum of Paid without HST |
| Orders | Count of rows |
| Orders to pay | Sum of owed |
| Agents | Distinct Agent |

### Customers · customers · now

Last order, days since, new by month.

| Field | Kind |
|---|---|
| Last order | Date |
| First order | Date |
| Customer since | Date |
| Customer | List |
| Last order · how long ago | List |
| Sales rep | List |
| Customer type | List |
| City | List |
| Province | List |
| Status | List |
| Terms | List |
| Currency | List |
| Days since last order | Number |
| Orders | Number |
| Sales total | Number |

| Metric | How |
|---|---|
| Customers | Sum of customers |
| With orders | Sum of buying |
| Ordered in 90 days | Sum of active |
| No order 180+ days | Sum of lapsed |
| Orders | Sum of Orders |
| Sales total | Sum of Sales total (one unit only) |
| Average order | Sales total ÷ Orders (one unit only) |
| Days since last order · avg | Average of Days since last order |

### Plan vs actual

Cut plan against what was really cut.

| Field | Kind |
|---|---|
| Built | Date |
| First cut | Date |
| Batch | Text |
| Glass | List |
| Thickness | List |
| Cutter | List |
| Status | List |
| Plan sheets | Number |
| Sheets cut | Number |
| Sheets over plan | Number |
| Sheets broken | Number |
| Plan sheet ft² | Number |
| Cut sheet ft² | Number |
| Broken sheet ft² | Number |
| Plan glass ft² | Number |
| Good glass ft² | Number |
| Recut ft² | Number |
| Recut pcs | Number |
| Plan waste ft² | Number |
| Actual waste ft² | Number |

| Metric | How |
|---|---|
| Plan sheets | Sum of Plan sheets |
| Sheets cut | Sum of Sheets cut |
| Sheets over plan | Sum of Sheets over plan |
| Sheets broken | Sum of Sheets broken |
| Plan waste % | Plan waste ft² ÷ Plan sheet ft² × 100 |
| Actual waste % | Actual waste ft² ÷ Cut sheet ft² × 100 |
| Recut ft² | Sum of Recut ft² |
| Batches | Distinct Batch |

### Stock now · inventory · now

Everything on the shelves now.

| Field | Kind |
|---|---|
| Kind | List |
| Material | List |
| Glass | List |
| Thickness | List |
| Size | List |
| Unit | List |
| Status | List |
| On hand | Number |
| Free | Number |
| Reserved | Number |
| On order | Number |
| Minimum | Number |
| Sheet ft² on hand | Number |
| Pieces | Number |

| Metric | How |
|---|---|
| On hand | Sum of On hand (one unit only) |
| Free | Sum of Free (one unit only) |
| Reserved | Sum of Reserved (one unit only) |
| On order | Sum of On order (one unit only) |
| Sheet ft² on hand | Sum of Sheet ft² on hand |
| Pieces | Sum of Pieces |
| Lines | Count of rows |

<!-- fields:end -->
