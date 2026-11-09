# Purchasing

Закупки у поставщиков: карточки поставщиков, заказы поставщику (PO), приёмки, остаток у поставщика, счета и оплаты
поставщикам, сколько мы должны. Раздел видит тот, у кого в Users стоит галочка Purchasing. Деньги клиентов —
в Finance ([finance.ru.md](finance.ru.md)), склад — в Inventory ([inventory.ru.md](inventory.ru.md)).

## Экран

Слева вверху — выбор раздела **Purchase orders ▾**: Purchase orders, Receipts, Backorders, Held at supplier, Delivery
requests, Invoices, Payments, We owe, Suppliers, History. Справа — главная кнопка раздела (+ New Purchase Order,
+ Receipt, + Request, + Invoice, + Payment record, + Supplier). Списки — как в Sales: таблетки статусов, период
**Date**, фильтр и сортировка в заголовке, ⚙ Columns, итог внизу ([lists.ru.md](lists.ru.md)). Удалённое и отменённое
скрыто, пока не отмечено **Include deleted** / **Include undone / cancelled**.

Общее правило раздела: обязательного почти нет, предупреждения не мешают Save. Поставщик, цена, единица и дата могут
быть пустыми; пустая сумма — «неизвестно», а не ноль. Каждая запись и её история сохраняются одной командой; устаревший
черновик (кто-то сохранил раньше) не затирает чужую запись.

## Purchase orders — заказы поставщику

- Список: таблетки All, Today, Due this week, Needs attention; колонки PO, Supplier, Date, Expected, Currency, Amount,
  Status (в Columns ещё Pricing, Held at supplier, Created by).
- **Номер PO-0001** выдаётся только при успешной записи. Править можно и после Sent, Closed, Cancelled. **Delete**
  оставляет приёмки, запросы и их историю; Restore возвращает тот же номер.
- **Статус** — Draft, Sent, Partially received, Received, Closed (Cancelled). Partially received и Received ставятся
  сами по приёмкам; Closed и Cancelled, поставленные руками, главнее. История статусов — только для чтения.

### Карточка PO

Сверху **Close**, **Save**, **Documents**, **Delete**. Поля: Supplier (+ — новый поставщик), Order date, Expected date,
Currency (CAD, USD), Status, Email / notes.

- **Glass / purchase items** — стёкла заказа буквами (A, B…), **+ Glass**. Стекло выбирается **From supply points**
  (производитель → толщина → стекло, затем строка поставки: поставщик, размер листа, цена) или **From customer order** —
  целая позиция Sales, отдельный лайт или плита ламината. PO хранит снимок этой части (стекло, обработка, размеры,
  фигура, отверстия): поздняя правка заказа уже заказанное не меняет. В позиции Sales видна ссылка на PO.
- **Order lines** — + Line: Glass, Qty, Width, Height, Unit (sheet, block, each), **Sheets / block** (у каждой строки
  своё, без постоянного коэффициента), Price, Price per, Line total, Held. Заметка строки и ожидаемая дата.
  **+ Material** (из каталога Data) и **+ Other item** (свободная строка). Внизу — **Known subtotal** и сколько строк
  без цены, количества или пересчёта.
- **Deliveries** — **Receive** (приёмка по этому PO), **Request delivery** (запрос части товара на хранении); по каждой
  строке — куплено, пришло, осталось; ссылки на приёмки GR-.
- **Supplier invoices** — **+ Invoice** (счёт к этому PO). **History** — кто, когда, что изменил.
- **Documents** — бланк PO для PDF и печати; **Customize** включает и прячет готовые поля, Save as default. **Open Gmail +
  PDF** скачивает файл и открывает письмо с To / CC и текстом — вложение добавляют руками; статус Sent ставится только
  отдельной кнопкой **Mark sent**. Писем программа сама не отправляет.

## Receipts — приёмки

Приёмка **GR-0001** — то, что приехало на самом деле. Можно без PO, без поставщика, с другим товаром, сверх заказанного
и по закрытому PO.

- Поля: Purchase order (optional), Supplier, Received date, Received by, Supplier packing slip, Notes.
- **What arrived** — + Glass, + Material, + Other item: Item, Width, Height, Waiting, Arrived, Unit, **Sheets**, **Broken**,
  Reason, Resolution. У каждой строки свой фактический размер и своё число листов (владелец, 13.10.2026: размеры
  листов тоже бывают разные). Размер не как в PO — помечен. Пустые строки не сохраняются.
- Стекло пришло блоками и число листов не вписано — под строкой **Enter sheets**, в списке у приёмки та же пометка, на
  складе приход не считается, пока листы не вписаны.
- Другая единица, чем в PO, молча не складывается: предупреждение «unit differs from the PO; quantities need review» и
  пометка в колонке Review у Backorders, пока человек не приведёт строку к единице PO.
- **Undo / Restore** приёмки сохраняют историю и пересчитывают пришедшее и склад.

## Backorders и Held at supplier

- **Backorders** — что заказано и ещё не пришло: PO, Supplier, Description, Sheet size, Purchased, Received,
  **Outstanding** (заказано − пришло, вместе с боем), Unit, Expected, Review. Перепоставка — отрицательный остаток.
- **Held at supplier** — куплено, но хранится у поставщика (владелец, 14.10.2026: «некоторые стёкла везут из Китая —
  нужна эстимация»). Строка — стекло + размер листа + поставщик, все PO вместе: Bought, At supplier, Per month, Runs out,
  Lead (days), **Order by**, Status. «Pace: last 90 days. Order by = runs out − lead time.» Status: **Order now** (дата
  прошла или сегодня), **Order soon** (в ближайшие 30 дней), OK, **No estimate** (ещё ничего не привозили — дату не
  выдумываем). Срочное сверху.
- **Delivery requests** — запрос **DR-0001** привезти часть товара с хранения: бланк как у PO с заголовком DELIVERY
  REQUEST, тот же путь Gmail + PDF и Mark sent. Запрос остаток у поставщика не уменьшает — уменьшает только приёмка по
  нему.

## Invoices, Payments, We owe — деньги поставщикам

- **Invoice PI-0001** — счёт поставщика: Supplier, Supplier invoice number, Invoice date, **Invoice total** (вписывается
  один раз), Currency, Payment terms · Net days, Due date (**Use payment terms** пересчитывает срок из карточки
  поставщика), Notes, **Link a PO** — один счёт может закрывать несколько PO, у PO может быть несколько счетов. Сумма не
  вписана — «Amount is unknown. Balances remain incomplete.»
- **Payment PP-0001** — уже сделанная оплата: дата, сумма, валюта, способ или банковский референс, заметка. Несколько
  оплат закрывают счёт частями. Можно записать аванс без счёта, переплату, кредит поставщика (счёт с минусом) и возврат
  (оплата с минусом).
- **We owe** — по поставщику и валюте; USD и CAD не складываются. Колонки Supplier, Currency, Invoiced, Paid, We owe,
  Overdue invoices, Unknown amounts, Review payments. Положительное — должны мы, отрицательное — кредит у поставщика.
  Просрочено — остаток счёта с прошедшей Due date; пустой срок не выдумывается.
- Поменяли валюту или поставщика счёта после оплаты — оплата остаётся как была, у счёта пометка **Review payments**,
  пока человек сам не поправит связь. Удалённый счёт оставляет оплаты в истории и на балансе; Restore возвращает долг.

## Suppliers — карточки поставщиков

Список: Supplier name, Email for PO, Phone, Currency, Payment terms · Net days, Lead time · days, Supply rows, Status.
**+ Supplier** или клик по имени — карточка:

- **Company** — Supplier name (единственное обязательное), Our account number, Tax number, Website, Address.
- **Primary contact** — Contact name, Email for PO, Phone. **Other contacts** — + Contact (отдел, человек).
- **Purchasing** — Currency, Payment terms · Net days (срок счёта по умолчанию), Lead time · days (для Held at supplier),
  Payment method, Notes.
- **Custom fields** — свои подписи и значения. **Supply points** — строки поставки этого поставщика из Data.
- **Active supplier** — снять галочку = в архив; архив обратим, строки поставки остаются связаны. **History** — было →
  стало по каждой правке.

## History

Общий журнал закупок: When, Document, Reference, Action, Who — создание, правки, статусы, удаление и восстановление
всех документов раздела.
