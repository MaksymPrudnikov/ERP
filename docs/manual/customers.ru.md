# Customers

Карточки клиентов: кто они, люди и адреса, условия оплаты, личные цены и их заказы. Раздел видит тот, у кого в Users
стоит галочка Customers. Деньги клиента — долг, оплаты, выписки — в Finance ([finance.ru.md](finance.ru.md)).

## Список

Устроен как Sales (владелец, 03.10.2026: «пусть будет как везде… работать как экселька»; [lists.ru.md](lists.ru.md)).

- **Верхняя строка**: для отмеченного клиента **Open**, **Duplicate**, **Archive** (у архивного — Restore), **Delete**;
  справа период **Created**, **+ New customer** и **⋯** — Export CSV, Export JSON. Правая кнопка на строке даёт те же
  действия; двойной щелчок — Open.
- **Колонки**: Account, Customer (юрлицо — серым в той же строке), Contact, Phone, Email, Terms, Credit limit, Balance,
  Last order, Status.
- **Архивные скрыты** фильтром «Not · Status: Archived» — его видно в ряду фильтров, × или **Clear filters** снимает.
- **Delete** выключен, если у клиента есть заказы: такого клиента архивируют. Заказы и история остаются.

## Карточка

Сверху имя и Account, **Save** и **Cancel** (с несохранёнными правками Cancel спросит). Вкладки:

- **General** — Account / Customer Code, **Legal Name** (обязательно), Display Name, Status (Active, Inactive, Archived),
  Customer Type, **Group** (группа спец-цен из Data → Prices), Area / Territory, Sales Rep, Account Open Date, TAX
  Number, Registration, Prospect, **PO required**, Notes, Internal Notes.
- **Contacts** — сколько угодно людей (закупка, бухгалтерия, приёмка, прораб): Name, Role / title, Phone, Phone 2,
  Mobile, Fax, Email и отметки **Primary**, **Invoice**, **Shipping** — кому что уходит.
- **Addresses** — платёжный и сколько угодно адресов доставки и объектов: Type (Billing, Delivery, Other), Name,
  Addressee, **Default**, Address 1–3, City, Province / State, Postal Code, Country.
- **Payment** — сверху деньги из Finance: Balance, Overdue, Prepaid, On account и ссылка **Finance account**. Ниже:
  - **Credit and commercial terms** — Payment: **Cash · deposit before production** или **Credit · pay within days**,
    Credit Days, Currency, Credit Limit, Credit Application Date, **On Hold**, Check Terms, Hold Reason, Delivery Method,
    Deliver To, Fuel Levy (Default, Custom rate, Fuel levy exempt) и Fuel Levy Rate;
  - **Accounting and statements** — Statement Delivery (Email, Print, Email + print, Do not send), Statement Email,
    Invoice Email, Tax Exempt и Tax Exemption Number.
- **Prices** — **+ Personal prices**: личный прайс клиента. Порядок цены: ручная в заказе → личный прайс → прайс группы
  → общая (владелец, 22.10.2026). Правки сохраняются сразу.
- **Orders** — квоты и заказы клиента, новые сверху: Number, Type, Status, Created, Due, Total, Balance; **+ New order**
  и **+ New quote** — сразу с этим клиентом.
- **Legacy IDs** — вкладка видна, только если у клиента заполнены номера из Spiel.

Карточка не затирает чужие правки: если клиента сохранили на другом компьютере или вкладке, пока карточка была открыта,
Save ничего не пишет и говорит «Changed elsewhere — reopen» (удалили — «This customer was deleted»); набранное остаётся
в форме (20.10.2026).

## Что откуда берётся

- **Деньги** (депозит у наличного, срок у кредитного, Hold) — правила Finance, руководство
  [finance.ru.md](finance.ru.md).
- **Адрес доставки и контакт** в заказе — из Addresses и Contacts карточки; в заказе их можно поменять.
- **Агент**, который привёл клиента, — в Agents ([agents.ru.md](agents.ru.md)).
