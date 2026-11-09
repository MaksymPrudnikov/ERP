# Master Data (Data)

Справочники и настройки, из которых строится всё остальное: каталог стекла и материалов, работы и их цены, прайсы
клиентов, станции и маршрут, раскрой, тара, причины брака и пересчёта, машины, компания, стикеры и бланки, сборы
заказа. Раздел видит тот, у кого в Users стоит галочка Data.

Главное правило (владелец, 22.10.2026): Data — конструктор. Числа и списки цеха живут здесь, а не в коде: новый
справочник становится категорией, а не новой вкладкой. Правка Data не меняет сохранённые заказы: цена фиксируется в
заказе при Save (владелец, 20.10.2026: «если я сменю цену или толщину, стекло ведь останется тем же»). Каждая правка
пишется в журнал Data (Setup → Data overview → Change log).

## Разделы

Шесть разделов кнопками сверху — по вопросу, с которым пришли (23.10.2026); внутри раздела — свои вкладки.

| Раздел | Вкладки |
|---|---|
| Catalog | дерево каталога: стекло, материалы, фурнитура, работы, рецепты |
| Prices | прайсы групп и личные прайсы клиентов |
| Production | Stations, Cutting, Dollies & Skids, NCR, Stock reasons |
| Shipping | Trucks |
| Company & print | Company, Stickers, Forms |
| Setup | Setup, Data overview |

Таблицы — как в Sales ([lists.ru.md](lists.ru.md)); поля в строках настроек правятся прямо в строке.

## Catalog

- **Слева — дерево** со счётчиками активных строк: **Items** (Glass, Supply points), **IGU parts** (Spacers, Gas,
  Sealants, IGU parts), **Lamination** (Interlayers), **Surface** (Frit, Spandrel, Spandrel colours), **Hardware**
  (Hinges, clamps, patches), **Stock** (Stock items), **Services** (Works, Heat treatment), **Recipes** (IGU surround).
  Под деревом — сколько стёкол «kept in stock» и строк поставки без стекла.
- **Сверху** — предупреждения по каталогу (No price, No short name и т. п. — только предупреждают, клик фильтрует) и
  поиск: в открытом разделе или **All catalog** (весь каталог с колонкой Type). **+ New** создаёт в открытом разделе.
- **Клик по строке** (не по полю и не по кнопке) открывает превью справа: чего не хватает, главные поля, последняя
  правка, **Open** — карточка.
- **Карточка** — вкладки слева, оранжевая точка на вкладке, где чего-то не хватает. Save читает поля со всех вкладок.
  Ушли в другую вкладку или справочник с несохранёнными правками — вопрос «Discard unsaved changes?».

### Стекло

- **Glass** — что за стекло и за сколько продаём: Code, **Short name** (внутри цеха: стикеры, экраны станций; клиенту и
  поставщику — Name; владелец, 29.10.2026), Name, Thickness, Substrate, Coverage, Tempering, цены. Фильтры:
  производитель, толщина, покрытие, статус (In stock, Pre-order, No short name, Discontinued). В строке — Edit,
  **Discontinue** (снять с продажи, не удаляя), ×. Загрузка из CSV — Choose file.
- **Kept in stock** — стекло держим на складе: его строки всегда видны в Inventory. **We cut it** — стекло режем у
  себя; у **COG** (стекло клиента, 3–19 мм) реза нет, маршрут идёт от его работ (14.10.2026).
- **Supply points** — где и почём покупаем: поставщик (карточка Purchasing), размер листа, цена, валюта, срок. Размер
  листа отсюда идёт в раскрой и склад; **+ Supply row** в карточке стекла заводит строку поставки. Закупочные цены видит
  и правит только тот, у кого в Users галочка **Cost & margin** (администратор — всегда); остальным колонки цены не
  показаны, Save их не стирает.

### Материалы, фурнитура, Stock items

- **Spacers, Gas, Sealants, IGU parts, Interlayers, Frit, Spandrel** — карточки с вкладками (General, Units,
  Measurements, Purchase, Prices, Stock, Consumption): единица хранения и закупки, «в упаковке», плотность плёнки,
  расход. Склад этих позиций — Inventory → Consumables.
- **Spandrel colours** — палитра с кодами производителя. Используемые строки выключают, а не удаляют.
- **Hardware** — Kind → series → models (петли, клэмпы, патчи). Models: Model, Kind, Series, On the drawing, Glass
  thickness, Supplier code, On drawings, Status. Фурнитуру не продаём — только вырезы под неё; цены вырезов — в Works
  (владелец, 26.10.2026).
- **Stock items** — двери, комплекты, расходка: **Kind** (door, kit, consumable и свои), вкладки General ·
  Measurements · Stock · Prices. Measurements — строки «что · значение · единица»; у новой двери сами появляются Width,
  Height, Thickness; **Name from measurements** подставляет имя по нажатию. Код вписывают руками.

### Works и Heat treatment

- **Works** — работы цеха (кромка, отверстия, вырезы, радиусы, нотчи…): станция, где их делают, и **таблица цен** по
  толщине — строки «от–до мм → цена», сколько угодно; одна строка без границ — одна цена на всё. Нахлёст или пропуск
  толщин — предупреждение (строка заказа встанет как Rate required), сохранять не мешает. Работа без станции не
  теряется: лист печатает «NO STATION», Save предупреждает.
- **Heat treatment** — виды закалки.
- **IGU surround** (Recipes) — рецепт обвязки стеклопакета: из него считается расход рамки, герметика и газа.

## Prices

Подсказка экрана: «Personal beats group; else base price.» Порядок цены в заказе: ручная → личный прайс клиента →
прайс группы клиента → общая (Glass, Works…); 0 — тоже цена, на нём поиск останавливается (владелец, 22.10.2026).

- **Customer groups** — группа спец-цен (поле Group в карточке клиента), её цены, клиенты группы.
- **Item groups** — группы позиций, чтобы дать цену сразу группе.
- **Set for customers** — массовая правка фиксированной ценой (не процентом).
- **Excel** — прайсы файлом туда и обратно.
- Личный прайс клиента — в его карточке, вкладка Prices ([customers.ru.md](customers.ru.md)).

## Production

- **Stations** — «Steps in order; same step — parallel.» Станции по шагам маршрута: код, имя, номер шага, работы,
  которые на ней делают, **Puts on** (Dolly, Skid или ничего — что станция кладёт), размер, лист тары, заметка. Добавить, править, убрать станцию и поставить её в нужный порядок — настройка владельца здесь, без правки кода
  (29.09.2026). Работа в Works называет
  станцию — из этого строятся маршрут, стикер и экран станции. Как это выглядит в цеху — [production.ru.md](production.ru.md).
- **Cutting** — параметры раскроя по толщине: **Trim** (низ, лево), **Border** (верх, право), **Min distance**; **Reset to
  shop table** — вернуть таблицу цеха. Ниже — размеры листов с обрезкой каждого, минимальный кусок в сток (**Min offcut
  W / H**). Размеры листов — из поставки и Inventory.
- **Dollies & Skids** — коды DL · DA (долли L и A), SL · SA (скиды L и A). **+ L-shape dolly** и т. п. — номер даёт
  система; таблица Code, Type, On it now, Note, Active, **Label**; **Print labels** — этикетки 4 × 6 отмеченных.
  Таблетки Loaded / At customers / Empty / All; клик по коду — окно тары.
- **NCR** — причины брака по местам: All stations, Office и каждая станция. Их видит окно Recut на станции и NCR в заказе.
- **Stock reasons** — причины разницы при пересчёте склада («Shown when a count differs.»): + Add, переименовать,
  выключить.

## Shipping

- **Trucks** — машины для плана доставки: **+ Truck**, Name, Note, Active.

## Company & print

- **Company** — то, что печатается на документах (пустое пропускается): Logo, Legal name, HST number, адрес, Phone,
  Email, Website, **Deposit for cash customers, %**, **Quote valid for, days**, Payment instructions, Terms and
  conditions, Footer line, **My fields · for forms** — свои поля для бланков.
- **Stickers** — стикер: Production, Final · each glass, Final · whole unit, Stock offcut; размер 4 × 6 или 3 × 4,
  ориентация, раскладка Automatic или Free layout; образец на настоящем заказе.
- **Forms** — конструктор бланков: Quote, Proforma, Order confirmation, Invoice, Work order, Packing slip, Receipt,
  Statement, Purchase order, Trip sheet, Drawing, лист и наклейка тары. Руководство — [forms.ru.md](forms.ru.md).

## Setup

- **Setup** — **Order charges** (умолчания новых заказов): Energy surcharge, HST, Card fee, Delivery и др. — вкл.,
  ставка, на что начисляется; **Cards** — карты и их комиссия, первая — по умолчанию; **Weights** — плотность стекла
  (вес юнита в заказе и на стикере); **Frit** — умолчания нового фрит-лайта (точка, отступ, от какого угла).
- **Data overview** — **Collections** (все справочники, сколько записей, заполнены ли), **Change log** (журнал Data:
  кто, когда, было → стало; закупочные цены без Cost & margin показаны как «Cost & margin»), **Master Data file** —
  выгрузка и загрузка справочников файлом.
