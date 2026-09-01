# GLASS ERP — Glazing System

Собственная ERP для стекольного производства. Цель — полная замена Spil Glass.

**Не знаешь, какой файл открыть — начни с [`КАРТА-ПРОЕКТА.md`](КАРТА-ПРОЕКТА.md).**
Там сказано, что где лежит, какие документы живые, какие архив, и куда писать правки.

Управляющий документ проекта: [`docs/GLASS_ERP_HANDOFF.md`](docs/GLASS_ERP_HANDOFF.md) — его отдают целиком любой новой сессии ИИ.
Глубокая целевая модель: [`docs/DEEP_ERP_ARCHITECTURE.md`](docs/DEEP_ERP_ARCHITECTURE.md) — CPQ → component genealogy → MES/APS/WMS/QMS → shipping/costing и «цифровой завод».

**Живая версия: https://maksymprudnikov.github.io/ERP/** — открывается в браузере, ничего скачивать не нужно.
Режим по модулям (правишь файл → F5): https://maksymprudnikov.github.io/ERP/src/

Текущая стадия: **Фаза 2, развитие Sales** — Customer Master, Draft Sales Orders с order-scoped IGU Makeups, Production Shape, Adaptive Muntin, Effective Production и уточнённый операторский flow выбора стекла/ламината.

---

## Что открывать

| Файл | Зачем |
|---|---|
| **`dist/GLASS_ERP.html`** | **Готовая система. Скачать, двойной клик — работает без установки и без сервера.** |
| `src/index.html` | То же самое, но модули подключены отдельными файлами. Правишь модуль → F5. Для разработки. |

---

## Главное правило репозитория

**Никто не пересобирает большой HTML руками.**

Каждая способность живёт в своём маленьком файле. Правишь один файл → `node build/build.js` → `dist/GLASS_ERP.html` собирается заново сам.

```
src/
├── core/                     общее для всех модулей
│   ├── dim.js                разбор и печать дюймов: 48, 48 1/2, 48-1/2
│   └── poly.js               площадь, габарит, самопересечение контура
│
├── modules/                  ИНЖЕНЕРНЫЕ МОДУЛИ — не знают про цены, клиентов и заказы
│   ├── shape/
│   │   ├── consts.js         режимы уклона, типы углов, цвета рёбер
│   │   ├── model.js          нормализация модели, карта угловых рёбер E/F/G…
│   │   ├── contour.js        построение замкнутого контура, AUTO-сторона D, лесенки углов
│   │   ├── validate.js       проверки: размеры, локти, влезают ли угловые блоки
│   │   ├── geometry.js       адаптер: модель → контур + габарит
│   │   └── index.js          ПУБЛИЧНЫЙ КОНТРАКТ: ShapeModule.compute(shapeDef)
│   └── muntin/
│       ├── catalog.js        профили баров (5/8″, 1″, цвета сторон)
│       ├── model.js          нормализация модели раскладки
│       ├── layout.js         equal-clear раскладка на сетке 1/16″
│       ├── clip.js           обрезка бара реальным контуром, перпендикулярный отступ
│       ├── adaptive.js       shape-adaptive production geometry
│       ├── bom.js            имена деталей, список раскроя
│       ├── drawing.js        производственный чертёж (SVG)
│       └── index.js          ПУБЛИЧНЫЙ КОНТРАКТ: MuntinModule.compute(shape, mdef)
│
├── erp/                      ОБОЛОЧКА — домены, экраны, RU/EN, хранилище
│   ├── data.js  icons.js  i18n.js  nav.js  storage.js
│   ├── customers/ data.js    Customer Master
│   ├── masterdata/ glass.js  glass / spacer / gas / seal / interlayer seed catalog
│   ├── sales/                 Draft Sales domain
│   │   ├── data.js            SalesOrder · OrderMakeup · OrderLine schema
│   │   ├── orders.js          draft behavior · Excel · Shape/Muntin bridge
│   │   ├── makeup-ui.js       compact Lite / Cavity / Laminated Makeup Builder
│   │   └── service-sets.js    Effective Production · Edgework Sets
│   └── views/    dashboard · users · customers · sales · sales-shape-ui · sales-muntin-ui · optimization · production
│
├── styles/                   base.css · modules.css · service-sets.css
└── shell.html                каркас страницы (шапка, меню, контейнер)

build/build.js + build/manifest.json   →  dist/GLASS_ERP.html
test/run.js                            →  регрессионные тесты
```

### Как чинить что-то одно

| Что чинишь | Какой файл трогать |
|---|---|
| «бар мунтина обрезался не по контуру» | `src/modules/muntin/clip.js` |
| «неправильные просветы между барами» | `src/modules/muntin/layout.js` |
| «чертёж мунтина выглядит криво» | `src/modules/muntin/drawing.js` |
| «угловой блок строится не так» | `src/modules/shape/contour.js` |
| «пропускает неверный размер» | `src/modules/shape/validate.js` или `src/core/dim.js` |
| «экран Muntinbar неудобный» | `src/erp/views/sales-muntin-ui.js` (геометрию не трогаем) |
| «в EN осталось русское слово» | `src/erp/i18n.js` |
| «в поток цеха добавить станок» | `src/erp/views/production.js` |

После правки:

```bash
node build/build.js     # пересобрать один файл
node test/run.js        # проверить, что геометрия не поехала
```

---

## Sales — Draft Orders / IGU Makeups

Sales больше не использует глобальную Configuration Library. Каждый Draft Sales Order содержит собственные `makeups[]` (A/B/C/…), а строки заказа хранят стабильный `makeupId`. Один Makeup переиспользуется множеством строк только внутри своего заказа.

Makeup Builder поддерживает `Single Lite / Double / Triple`, `Vision / Spandrel / Laminated`, а для Vision — `Low-E / Reflective / Frit / Uncoated`. Surface numbering идёт Exterior → Interior: Lite 1 = `#1/#2`, Lite 2 = `#3/#4`, Lite 3 = `#5/#6`. Low-E/Reflective, Frit и Spandrel хранят свои surface-поля отдельно.

При создании Makeup сразу открыт Lite 1 для Single, Double и Triple. После перехода к другой секции предыдущая сворачивается: одновременно открыта максимум одна рабочая секция, остальные остаются компактными summary-строками. Новый Sales Order сразу получает одну пустую Order Line.

Выбор стекла оптимизирован под реальную работу: **Clear → позиции в наличии → предзаказ**. Позиции без склада не исчезают, а получают пометку `pre-order`. Для покрытого стекла сначала выбирается coating, затем базовое стекло в том же порядке.

Cavity выбирается как **Width → Spacer → Gas → Sealant**. Primary Seal фиксирован как PIB и не занимает отдельное поле оператора.

Laminated строится как `OUTER PLY → INTERLAYER STACK → INNER PLY`. Каждая ply имеет собственные Manufacturer, Thickness, TYPE, Glass и Heat Treatment. Frit выбирается внутри TYPE отдельно для каждой ply и может находиться снаружи плёнки либо `Into film`. Плёнки можно смешивать; для каждой строки выбираются 1–6 слоёв по 0.38 mm (`0.38 … 2.28 mm`).

Shape и Muntin **не встроены в Makeup** и не переписываются. Строка Sales Order открывает существующий Production Shape / Adaptive Muntin configurator и хранит ссылку на его ревизию. При привязанном Shape размеры строки берутся из Shape; ручные Width/Height блокируются.

Размеры Sales Order канонически хранятся integer-значением в `1/16″` (`width16`, `height16`), а строковый формат является только представлением.

Master Data seed отделён от supply-фактов: продукт может позже получить `availability`, supplier, lead time и sheet sizes без изменения Sales schema.

---

## Как обновить модуль (без терминала)

Модули для того и разделены: правишь один файл, остальное не трогаешь.

**Заменить содержимое файла.** Открой его на GitHub → карандаш справа вверху → выдели всё → вставь новое → **Commit changes**.

**Заменить несколько файлов или всю папку модуля.** Зайди в папку (например `src/modules/muntin`) → **Add file** → **Upload files** → перетащи файлы. Файлы с теми же именами перезаписываются — это и есть обновление.

**Что произойдёт дальше — само.** GitHub Action (`.github/workflows/build.yml`) проверит, что все модули зарегистрированы, пересоберёт `dist/GLASS_ERP.html` и прогонит регрессионные тесты. В feature-ветке зелёная галочка означает, что кандидат прошёл CI; живая версия при этом не меняется. Только успешный push в `main` может автоматически закоммитить пересобранный `dist` и обновить GitHub Pages. Красный крестик означает, что кандидат не прошёл проверку — открой вкладку **Actions**, там указан упавший тест.

**Если в модуле появился НОВЫЙ файл** — его надо зарегистрировать в двух местах: `build/manifest.json` (порядок подключения) и `src/index.html` (тот же порядок). Забудешь — проверка остановит сборку и прямо скажет какой файл не подключён.

### Что нельзя ломать при замене

Замена папки модуля целиком безопасна ровно до тех пор, пока сохраняется контракт:

- `MuntinModule.compute(shape, mdef)` → `{valid, geo, count, totalLengthIn, verticalSegments, horizontalSegments}`
- `ShapeModule.compute(shapeDef)` → `{valid, width, height, area, points, segs, line}`
- **в Muntinbar не появляется собственных Width/Height** — размеры только из Shape, иначе получится второй источник геометрии и расхождение размеров
- эталонные числа раскроя не меняются: трапеция 48×36 при C=30 → бары `33 7/64″ · 31 1/8″ · 47 1/8″`

Всё это проверяется тестами автоматически. Если новый код нарушит любой пункт — сборка не пройдёт.

---

## Контракты модулей

Модуль получает данные и возвращает результат. Он **не обращается** к остальной системе, не знает про цену, клиента и заказ. Поэтому его можно чинить, тестировать и показывать отдельно.

```js
ShapeModule.compute(shapeDef)
// in : {w:'48', h:'36', smart:{A,B,C, corners, extraEdges, elbowsOn}}
// out: {valid, width, height, area, points:[[x,y]…], segs, line}

MuntinModule.compute(shape, muntinDef)
// in : фигура из ShapeModule + {shapeId, muntin:{layout, production}}
// out: {valid, geo, count, totalLengthIn, verticalSegments, horizontalSegments}
```

**Shape — единственный источник размеров стекла.** В Muntinbar нет и не должно быть своих Width/Height: он получает уже созданный Shape по ссылке и считает длины баров по его реальному периметру. Это проверяется тестом.

---

## Что взято из Glass Configurator v4.5

`modules/shape/*` и `modules/muntin/*` — **перенос, а не переписывание**. Геометрия сохранена дословно: A/B/C/D, elbows, corner blocks, equal-clear на сетке 1/16″, обрезка по реальному контуру, перпендикулярная привязка к кромке.

Известные особенности исходника чинятся **внутри изолированного модуля отдельным коммитом**, а не попутно с переносом.

---

## Тесты

```bash
npm ci               # только playwright, строго по lock-файлу
node test/run.js     # прогон по src/
TARGET=dist node test/run.js
```

Регрессионные тесты держат эталонные числа раскроя и проверяют повреждённые данные, импорт, XSS, RU/EN, Sales Makeups, Shape/Muntin bridge и мобильный viewport. Если после правки модуля упал тест вида
`cut lengths обрезаны реальным контуром` — сломан перенос v4.5, а не тест.

Проверенная точка 30 августа 2026: **222 passed, 0 failed** на `src` и те же **222 passed, 0 failed** на собранном `dist`.

Отчёт последнего аудита: [`docs/REVIEW_2026-08-18.md`](docs/REVIEW_2026-08-18.md).

---

## Что снаружи и не переписывается

- **Perfect Cut** (R.O. SRL) — оптимизатор раскроя. Свой nesting engine не пишем. Механизм обмена не проектируется, пока не придут реальные настройки коннектора.
- **Бухгалтерия** (QuickBooks / Xero / Sage) — AR/AP, GL, payroll, налоги остаются там.
