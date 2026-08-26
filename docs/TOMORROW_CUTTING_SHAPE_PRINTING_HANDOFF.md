# GLASS ERP — handoff на 27 августа 2026: Cutting Shape и Printing Format

Этот файл нужно загрузить в новый ChatGPT/Codex-чат. Он содержит стартовый
контекст, границы задачи и вопросы, которые нельзя решать догадками.

## Как начать новый чат

1. Загрузить этот MD-файл.
2. Дать чату доступ к актуальному checkout репозитория либо передать ссылку:
   `https://github.com/MaksymPrudnikov/ERP`.
3. Отправить стартовое сообщение из последнего раздела этого документа.

## Репозиторий и проверенная точка отсчёта

- Repository: `https://github.com/MaksymPrudnikov/ERP`
- Branch: `main`
- Проверенный commit на момент подготовки файла:
  `13740c11ca0377f2eea54e8c522fc74dd737162a`
- Live build:
  `https://maksymprudnikov.github.io/ERP/dist/GLASS_ERP.html?v=13740c1`

Эта точка отсчёта может устареть. Перед анализом или изменениями новый чат
обязан проверить реальное состояние:

```bash
git status --short --branch
git fetch --prune origin
git rev-parse HEAD
git rev-parse origin/main
git ls-remote origin refs/heads/main
```

Если checkout отстаёт от `origin/main`, нельзя анализировать старую копию и
выдавать её за текущую сборку. Сначала нужно безопасно синхронизировать
репозиторий, не уничтожая пользовательские изменения.

## Цель завтрашней сессии

Продумать и затем, после подтверждения владельцем, улучшить два связанных
контракта:

1. **Cutting Shape** — что именно является фактической геометрией раскроя,
   как она получается из Finished Shape, Edgework и толщины стекла, как
   проверяется и как показывается пользователю.
2. **Printing Format** — какой производственный документ печатает ERP, какие
   данные и размеры он содержит, на какой бумаге и в каком масштабе, как
   выглядит в цвете и в чёрно-белой печати/PDF.

Сначала нужен аудит и согласование print contract. Не следует сразу менять
код, пока владелец не ответил на вопросы о назначении документа, формате
бумаги, масштабе и обязательных полях.

## Что уже реализовано и считается текущей правдой

### Finished Shape и Cutting Shape — разные сущности

- Production Drawing показывает finished geometry, размеры, edgework и
  manufacturing annotations.
- Cutting Shape показывает фактический cutting contour и пунктиром finished
  reference.
- Edge processing может создавать allowance и менять cutting contour.
- Manufacturing items (например, коммерческие Hole / Clamp / Hinge) видны на
  Production Drawing, но не должны самовольно менять Cutting Shape, Cutting
  DXF или machine payload.
- Геометрические `Cutout` и `Radius` действительно меняют Cutting Shape.
- Внешний DXF из Fusion 360 является отдельным источником раскроя и работает
  fail-closed: ERP не должна подменять его самодельным generic DXF.

### Effective Production внутри Sales Order

Фактический план строки заказа рассчитывается так:

`Shape + optional Edgework Set + optional Line Override + exact Makeup thickness`

- Если точная толщина Makeup не определена, effective cutting блокируется.
- Для нарисованных Shape используется нормализованная Shape geometry.
- Для внешнего DXF требуется подтверждённое сопоставление физических граней.
- Stale topology/override должен блокироваться, а не применяться молча.
- Machine payload строки имеет schema `glass-erp-order-effective/v1`, единицы
  — inches, точки округляются до 6 знаков.

### Ориентация сторон Edgework Set

Для прямоугольного finished lite уже зафиксирована и показана в интерфейсе
следующая схема:

| Side | Physical side | Связанный габарит |
|---|---|---|
| A | Left | Height |
| B | Bottom | Width |
| C | Right | Height |
| D | Top | Width |
| OTHER | Custom / extra edge | Не относится к четырём сторонам прямоугольника |

Не менять эту схему без отдельного решения и миграционного плана.

### Что сейчас делает Print / PDF

- `shapePrintDrawing()` выбирает текущий вид: Production Drawing или Cutting
  Shape.
- SVG передаётся в `printSheet(svg, caption)`.
- Отдельное окно не открывается; временно показывается только
  `#printSheetHost`, затем вызывается `window.print()`.
- При копировании SVG уникализируются `id` и `url(#...)`, чтобы маркеры стрелок
  не пропадали.
- Текущий CSS задаёт только `@page { margin: 9mm }`; конкретный размер бумаги
  и ориентация не заданы.
- SVG растягивается в доступный лист (`width: 100%`, `height: auto`,
  `max-height: 96vh`). Это ещё не полноценный производственный print format.
- У внешнего DXF кнопка Print / PDF сейчас отключена.

## Главный вопрос проектирования

Нужно определить, один это документ или несколько разных документов:

1. **Production Drawing / traveler** для сотрудника цеха.
2. **Cutting Sheet** для раскроя и контроля cutting geometry.
3. **Customer drawing** для согласования с клиентом.
4. **Label / sticker** для отдельной детали.
5. **Machine export** (DXF/SVG/JSON) — это файл для оборудования, а не
   печатный документ.

Не смешивать эти назначения в один перегруженный лист без решения владельца.

## Вопросы владельцу — задать одной пачкой

### Назначение и комплект документов

1. Что печатаем первым: Production Drawing, Cutting Sheet, customer drawing
   или несколько отдельных шаблонов?
2. Одна строка/деталь на страницу или несколько деталей на одном листе?
3. Нужна ли отдельная печать для каждого экземпляра, если `Qty > 1`?
4. Нужен ли отдельный sticker, или его будем проектировать позже?

### Бумага, принтер и масштаб

5. Какие реальные форматы используются: Letter, Legal, Tabloid, A4, A3?
6. Какие принтеры и минимальные printable margins используются в цеху?
7. Ориентация Auto / Portrait / Landscape или фиксированная?
8. Нужен `fit-to-page`, масштаб `1:1`, либо оба режима?
9. Если деталь не помещается 1:1, разрешён ли tiled print на несколько листов?
10. Что важнее: максимальный чертёж или постоянный title block одинакового
    размера?

### Обязательные поля title block

Подтвердить, какие поля нужны:

- Sales Order number;
- customer и customer PO;
- line number, mark и quantity;
- Shape ID, revision и fingerprint;
- finished Width × Height;
- cut Width × Height;
- Makeup code и состав;
- glass product, thickness и heat treatment;
- edgework по физическим сторонам A/B/C/D/OTHER;
- allowances и их источник: Shape / Set / Line Override;
- holes, cutouts, radii и manufacturing items;
- production notes;
- дата/время, operator, workstation;
- barcode/QR и точное значение, которое он кодирует;
- подписи Prepared / Checked / Completed.

### Геометрия и размеры на листе

11. Показывать finished и cutting contours одновременно или отдельными
    видами?
12. Какие линии должны читаться на чёрно-белом принтере: solid/dashed,
    разная толщина, подписи?
13. Какие размеры обязательны: overall W/H, длины всех рёбер, углы, радиусы,
    отверстия, вырезы, диагонали, allowance по каждой стороне?
14. На Production Drawing показывать Side letters A/B/C/D прямо на контуре?
15. Нужна ли стрелка `TOP`, указание interior/exterior, front/back и
    ориентация установки?
16. Какая точность печатных размеров: `1/16″`, decimal inches, mm или
    комбинация?

## Файлы, которые нужно прочитать перед изменениями

### Геометрия и вывод Shape

- `src/modules/shape/cutting.js` — cutting geometry и machine payload.
- `src/modules/shape/drawing.js` — SVG Production Drawing и Cutting Shape.
- `src/modules/shape/dxf-production.js` — контракт внешнего DXF.
- `src/modules/shape/annotate.js` — размерные цепочки.
- `src/modules/shape/index.js` — публичный Shape API.
- `src/erp/views/sales-shape-ui.js` — Shape UI и `shapePrintDrawing()`.
- `src/erp/views/shape-production-ui.js` — standalone Production Shape UI.

### Sales Effective Production

- `src/erp/sales/service-sets.js` — порядок Shape/Set/override/thickness и
  effective machine payload.
- `src/erp/views/sales-service-sets-ui.js` — Effective Production UI и схема
  физических сторон.
- `src/erp/sales/orders.js` — получение точной толщины из Makeup.

### Печать, стили, сборка и проверки

- `src/erp/storage.js` — `printSheetHost`, `printSheetPrepare`, `printSheet`,
  `printSheetCleanup`.
- `src/styles/modules.css` — текущий `@media print`.
- `src/styles/service-sets.css` — Shape/Effective Production presentation.
- `build/manifest.json` и `src/index.html` — порядок файлов сборки.
- `test/run.js` — существующие Shape, print и Edgework regression tests.

## Обязательный порядок работы нового чата

1. Проверить repository checkout и свежесть `origin/main` командами выше.
2. Проверить `git status`; не затереть пользовательские изменения.
3. Прочитать перечисленные узкие файлы, а не весь репозиторий подряд.
4. Запустить baseline:

   ```bash
   node build/check-manifest.js
   node test/run.js
   node build/build.js
   TARGET=dist node test/run.js
   ```

5. Открыть локальную и live-сборку, воспроизвести текущую печать для:
   rectangle, non-rectangular Shape, Shape с edge allowances, Shape с
   cutout/radius и Sales line с Effective Production.
6. В первом содержательном ответе дать:
   - current-state audit;
   - найденные ограничения/ошибки;
   - одну пачку вопросов владельцу;
   - предложенный print contract;
   - маленький план реализации и тестирования.
7. Не писать код до подтверждения спорных производственных требований.
8. После подтверждения менять `src/**`, пересобирать `dist` штатной сборкой и
   добавлять regression tests. Не редактировать generated `dist` вручную.
9. Перед публикацией показать проверяемый результат: screenshots/print preview,
   список тестов, base SHA и итоговый SHA.

## Safety и acceptance criteria

- Finished geometry, Cutting geometry и drawing overlay не становятся одним
  неразличимым объектом.
- Print preview использует тот же effective cutting snapshot, который пойдёт
  в machine payload для строки Sales Order.
- Изменение Edgework Set или Line Override отражается в printed revision и не
  оставляет старую печать выглядеть актуальной.
- Размеры на листе являются вычисленными данными, а не ручным текстом.
- Нет обрезанных title block, размеров, стрелок и подписей на согласованных
  форматах бумаги.
- Чертёж читается в grayscale/black-and-white.
- Browser scale и системные margins не создают ложное впечатление масштаба
  `1:1`.
- External DXF остаётся fail-closed, пока не определён безопасный печатный
  контракт для него.
- Нет console errors и сломанных SVG `url(#...)` references.
- `node build/check-manifest.js`, source tests и dist tests зелёные.
- Новое поведение покрыто regression tests, а не только ручным просмотром.
- Коммит/PR содержит только файлы этой задачи и явно указывает проверенный
  base SHA.

## Стартовое сообщение для нового чата

Скопировать следующий текст после загрузки этого файла:

> Используй загруженный `TOMORROW_CUTTING_SHAPE_PRINTING_HANDOFF.md` как
> рабочий контекст по GLASS ERP. Начни с проверки свежести реального repository
> checkout и сравни HEAD, origin/main и GitHub main. Затем изучи только
> перечисленные в handoff файлы и проверь baseline tests. В первом ответе не
> пиши код: дай мне короткий current-state audit по Cutting Shape и текущей
> печати, покажи найденные риски, задай одной пачкой вопросы, без которых нельзя
> утвердить Printing Format, и предложи конкретный print contract с планом
> реализации. Не придумывай размеры бумаги, поля, масштаб, CNC-контракт или
> цеховой процесс. После моих ответов реализуй согласованное решение в `src/**`,
> добавь regression tests, собери `dist` штатной сборкой и покажи проверяемый
> результат с base/head SHA.

