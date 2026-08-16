# GLASS ERP — Glazing System

Собственная ERP для стекольного производства. Цель — полная замена Spil Glass.
Управляющий документ проекта: [`docs/GLASS_ERP_HANDOFF.md`](docs/GLASS_ERP_HANDOFF.md) — его отдают целиком любой новой сессии ИИ.

Текущая стадия: **Фаза 1 (фундамент)** — доменная оболочка, справочники, два реальных расчётных модуля.

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
│   └── views/    dashboard · users · sales · sales-shape-ui · sales-muntin-ui · optimization · production
│
├── styles/                   base.css · modules.css
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
npm install          # только playwright, один раз
node test/run.js     # прогон по src/
TARGET=dist node test/run.js
```

Тесты держат эталонные числа раскроя. Если после правки модуля упал тест вида
`cut lengths обрезаны реальным контуром` — сломан перенос v4.5, а не тест.

---

## Что снаружи и не переписывается

- **Perfect Cut** (R.O. SRL) — оптимизатор раскроя. Свой nesting engine не пишем. Механизм обмена не проектируется, пока не придут реальные настройки коннектора.
- **Бухгалтерия** (QuickBooks / Xero / Sage) — AR/AP, GL, payroll, налоги остаются там.
