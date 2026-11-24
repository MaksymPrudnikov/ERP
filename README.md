# GLASS ERP — Glazing System

Собственная ERP для стекольного производства: заказы и квоты, раскрой листов, сканы в цеху, отгрузка,
деньги, закупки и склад. Работает в браузере, ставить ничего не нужно. Цель — полная замена Spil Glass.

Документация v5.338 · 24 ноября 2026 · 2784 проверок · что изменилось — [журнал](docs/journal/README.md)

## Открыть

| Адрес | Что это |
|---|---|
| **https://marketing-farm.agency** | Система для работы: одна версия на всех устройствах, обновляется сама после слияния в `main` |
| https://marketing-farm.agency/src/ | То же по модулям: каждый файл `src/` подключён отдельно (правишь модуль → F5) |
| https://marketing-farm.agency/#station=CUT | Экран станции цеха (вместо `CUT` — код любой станции) |

## Куда смотреть

| Документ | Зачем |
|---|---|
| [`КАРТА-ПРОЕКТА.md`](КАРТА-ПРОЕКТА.md) | Что где лежит: разделы, документы, «Карта кода» и «Все модули» с назначением каждого файла |
| [`docs/GLASS_ERP_HANDOFF.md`](docs/GLASS_ERP_HANDOFF.md) | Как устроено сейчас, по разделам, и правила владельца |
| [`docs/manual/`](docs/manual/README.md) | Руководство пользователя по разделам, RU и EN |
| [`docs/journal/`](docs/journal/README.md) | Журнал решений по датам: что и почему меняли |
| [`AGENTS.md`](AGENTS.md) | Правила для ИИ и людей, которые правят код: ветка, PR, проверки |

## Папки

| Папка | Что внутри |
|---|---|
| `src/` | Модули системы: `core/` общее, `modules/` геометрия фигур и раскладки, `erp/` разделы и экраны, `styles/`, каркас `shell.html` |
| `build/` | Сборка: `manifest.json` (порядок модулей), `build.js`, проверки состава и воспроизводимости |
| `dist/` | `GLASS_ERP.html` — система одним файлом; собирает CI в `main`, руками не правят |
| `test/` | Регрессионные и браузерные тесты (`test/run.js`) |
| `tools/` | Предпуск, снимки экранов, симулятор цеха, замер скорости, SQL сервера (`tools/supabase/`) |
| `docs/` | Хендофф, журнал, руководство, статус станочного экспорта |
| `extension/` | Расширение Chrome «Glass Farm for Gmail»: заказ рядом с письмом ([`extension/gmail/README.md`](extension/gmail/README.md)) |
| `templates/` | CSV для загрузки каталога стекла, листов и станций ([`templates/README.md`](templates/README.md)) |

Файл за файлом — раздел «Все модули» в [`КАРТА-ПРОЕКТА.md`](КАРТА-ПРОЕКТА.md).

## Сборка и проверка

```bash
npm ci               # только playwright и pglite, строго по lock-файлу
node build/check-manifest.js
node build/check-reproducible.js  # обе версии одинаковы для LF и CRLF
node test/run.js     # прогон по src/
TARGET=dist node test/run.js
npm run test:snap -- --dist   # то же по копии коммита: дерево можно править дальше
npm run shot -- --data latest --tab sales   # PNG «сейчас (main) / после (ветка)»
```

`src/index.html` и `dist/GLASS_ERP.html` собираются из модулей, руками их не правят. Как вести ветку, PR и
документы — [`AGENTS.md`](AGENTS.md), раздел «Ветка и PR». В README при правке меняется только строка
версии (версия, дата, число проверок); что изменилось — запись в журнал месяца.

## Контракты модулей

Инженерный модуль получает данные и возвращает результат: не знает про цену, клиента и заказ, поэтому
его можно чинить и тестировать отдельно.

```js
ShapeModule.compute(shapeDef)
// in : {w:'48', h:'36', smart:{A,B,C, corners, extraEdges, elbowsOn}}
// out: {valid, width, height, area, points:[[x,y]…], segs, line}

MuntinModule.compute(shape, mdef)
// in : shape — определение фигуры, как для ShapeModule.compute
//      mdef — временный объект адаптера {shapeId, muntin:{layout, production, …}, …}
// out: {valid, geo, count, totalLengthIn, verticalSegments, horizontalSegments}
```

**Shape — единственный источник размеров стекла.** Раскладка хранится в `shape.muntin`; отдельной
записи Muntin и своих Width/Height у неё нет.

### Что нельзя ломать

- контракты `ShapeModule.compute` и `MuntinModule.compute` выше;
- в расчётном ядре Muntin не появляется собственных Width/Height — размеры только из Shape;
- эталонные числа раскроя не меняются: трапеция 48×36 при C=30 → бары `33 7/64″ · 31 1/8″ · 47 1/8″`.

Всё это держат тесты: нарушение любого пункта не пройдёт сборку.

## Что снаружи

- **Раскрой:** собственный оптимизатор; Perfect Cut — образец для сравнения, а не движок ERP. Пробные
  файлы Maver/Disai для одного листа требуют проверки с оператором до реза — [статус экспорта](docs/MACHINE_EXPORT_STATUS.md).
- **Бухгалтерия** (QuickBooks / Xero / Sage) — AR/AP, GL, payroll и налоги остаются там.
