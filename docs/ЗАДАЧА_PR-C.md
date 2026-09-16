# PR C — справочник причин NCR «Где + Что»

**Статус: реализовано 17 сентября 2026 (хендофф v5.30).** По решению владельца «Где» —
станции и Office, общие причины: Impact, Broke, Chipped, Scratched, Fell from dolly / skid.
Записи NCR по номеру стекла G-… — следующий этап.

**Это самодостаточное рабочее задание.** Большие документы читать не нужно:
`docs/GLASS_ERP_HANDOFF.md` открывать только там, где задание прямо на него
ссылается. Написано 15 сентября 2026, после слияния PR #80 (`main` `95d5dd9`,
608 проверок зелёные). Делается **после PR B** (`docs/ЗАДАЧА_PR-B.md`).

Репозиторий `MaksymPrudnikov/ERP`. Прототип — один HTML, собирается из модулей
`src/` по `build/manifest.json`, данные в `localStorage`. Интерфейс по-английски.
С владельцем говорить по-русски.

---

## Задача одной строкой

**Справочник причин брака и рекламаций: «Где» — наши станции, «Что» — дефекты
работ этой станции, плюс Source и Action.** Только справочник. Записи NCR и
заказы-переделки — позже, по списку рекламаций, который пришлёт владелец.

---

## Решения владельца — не переспрашивать

- Устройство — **«Где + Что»** (выбрано 15 сентября 2026) вместо одного длинного
  списка, как в Spil.
- «Причины NCR перечислены некорректно к нашей системе, у нас должно быть **по
  нашей системе — где и что**».
- «**Не нужно брать ничего старого.** Если нужно будет переписать коды — я
  перепишу в системе.» Списки Spil ниже — только чтобы проверить, что ничего
  важного не забыто. Названия свои.
- Рекомендовано и не отвергнуто: **Source** — Found in shop (переделка, «Rework /
  Recut» в Spil) / Customer claim (NCR); **Action** — Recut, Remake order,
  Repair, Replace from stock, Credit, No action.
- Итоги и статистику на главный экран не выносить.

---

## «Где» — только станции `DB.station`

Станции — `src/erp/shopfloor/data.js`, `DEFAULT.station`. Своего словаря мест не
заводить: добавилась станция — появилась в «Где».

CUT Cutting · EDGE Edge work · DRILL Drilling · CNC · CERP Ceramic paint ·
HEAT Heat treatment · SAND Sandblasting · PAINT Painting · LAM Lamination ·
IGU IGU assembly (мойка — часть операции) · SHIPR Shipping ready · SHIP Shipping
(с установкой).

## «Что» — дефекты работ станции

Работы — `DB.serviceRate` (Master Data → Works), у работы есть поле `station`.
Черновик для макета:

| Где | Работы станции | Что |
|---|---|---|
| CUT | Cutting, Shape Unit | Broken on table · Wrong size · Wrong glass (product / thickness / coating side) · Shape cut wrong · Scratched |
| EDGE | Rough Arris, Flat Polish, CNC Shape Polish, Mitering 22.5° / 45°, Lami Polish, CNC Lami Polish, Beveling 3–19 mm | Chipped edge · Broken · Wrong edgework · Bevel width wrong · Miter angle wrong · Polish marks / burn · Edge skipped |
| DRILL | Clamp, Hinge, Patch, Hole 1/2″–2″, Notch by hand | Hole position wrong · Hole size wrong · Chipped at hole · Hinge / clamp / patch cut-out wrong · Hand notch wrong · Broken · Drilling skipped before tempering |
| CNC | Hole over 2″, Radius Corner, Notch by CNC, Cutout | Position wrong · Size / radius wrong · Chipped at cut-out · Broken · CNC program error |
| CERP | Ceramic Frit, Digital Print | Frit position / border wrong · Coverage / pinholes · Wrong color or pattern · Print quality |
| HEAT | Tempering, Heat Strengthening, Heat Soak | Broken in tempering · Broken in heat soak · Bow / warp · Roller wave / marks · Tempered stamp missing or wrong place · Wrong treatment (FT vs HS) |
| SAND | Simple / Pattern Sandblasting, Mirror Safety Backer, Mirror Edge Sealant | Pattern / position wrong · Uneven frosting · Backer or sealant missing · Scratched |
| PAINT | Painting | Paint defect · Wrong color · Painted on wrong side |
| LAM | Lamination | Bubbles · Delamination · Offset lites · Debris inside · Wrong interlayer |
| IGU | IGU Assembly, Muntin section | Seal failure / fogging · Wrong spacer or gas · Muntin wrong / misaligned · Dirty inside · Low-E on wrong surface · Broken |
| SHIPR | — | Missing piece · Wrong label · Damaged in rack |
| SHIP | — | Broken in transit · Delivered to wrong customer · Missing piece · Broken on install · Spontaneous breakage |

На любой станции ещё три общих: Dropped while carrying · Damaged by another
piece · Scratched in handling. Новая работа получает у своей станции общий набор;
частный дефект владелец добавляет строкой в справочнике.

---

## Шаг 1 — макет, таблица и вопросы (до кода)

Макет на настоящей программе: вкладка **Master Data → NCR** — «Где» слева,
«Что» этой станции справа, у каждой строки Active; отдельно списки Source и
Action. Рядом таблица: строки Spil → наша пара «Где · Что» (или «не нужна»).

Вопросы владельцу:

- куда относить ошибки оформления заказа (в Spil — BOOKED INCORRECTLY, INPUT
  INCORRECTLY, DRAWING WRONG FROM OFFICE, CUT WRONG FROM OFFICE, PROGRAM ERROR):
  отдельный признак «Order error» или станция, где ошибка всплыла — «Где» у нас
  только станции;
- куда брак стекла от поставщика (GLASS QUALITY, SEED);
- нужен ли «Employer's Motive» (вкладка в Spil) и что это для него;
- стоит ли мойка (Washer) только в IGU или и перед закалкой;
- куда MANAGEMENT DECISION и WARRANTY - FAILED UNIT(S).

Ничего не кодить до его «да».

## Шаг 2 — код

- Новый модуль `src/erp/quality/reasons.js`: `DEFAULT.ncrReasons`, нормализация
  (`normalizeNcrReasons`, вызов добавить в `normalizeDB` в `src/erp/storage.js`
  по образцу соседних `typeof … === 'function'`), заводской набор по таблице
  выше. «Где» — ссылка на код станции, не текст.
- Вкладка в `src/erp/views/masterdata.js` (`MD_TABS`, карта видов
  `{materials:viewMdMaterials, …, company:viewMdCompany}`): добавить, скрыть
  (Active), переименовать «Что»; Source и Action — короткие списки.
- Зарегистрировать модули и стили в `build/manifest.json`.
- Импорт старых данных не нужен — «не брать ничего старого».

## Шаг 3 — тесты, документы, заливка

- `test/ncr-reasons.js`: у каждой станции есть «Что»; станция добавилась —
  появилась в «Где»; неактивная причина не предлагается; экран без русского
  текста; без ошибок страницы. Подключить в ту же одну строку `test/run.js`.
- `docs/GLASS_ERP_HANDOFF.md` — новая версия и раздел сверху; `КАРТА-ПРОЕКТА.md`.
- Скриншоты с собранного файла ветки, `node tools/prepush.js`, PR.

---

## Списки Spil — только для проверки полноты

Со скриншотов владельца. Вкладки Spil: Origin of Reasons (Rework and NCR),
Rework (Recut) Reasons, NCR Reasons, NCR Actions, Employer's Motive. Колонки:
Reason, Origin (станции), Exclude Branch(s), Active.

**Rework (Recut) Reasons** (скриншот обрезан после GLASS QUALITY — полный список
попросить у владельца, если понадобится): BLEW UP IN SHIPPING, BOOKED
INCORRECTLY, BOWED GLASS, BROKE IN ARRISING, BROKE IN CHILLER, BROKE IN CNC,
BROKE IN DRILL, BROKE IN LAMI, BROKE IN POLISHING MACHINE, BROKE IN SHIPPING,
BROKE IN TEMPERING, BROKEN BAD FROM CUTTING TABLE, BROKEN IN BEVELING, BROKEN IN
IGU, BROKEN IN MITERING, BROKEN IN SHIPPING, BROKEN IN WASHER, BUBBLES FROM LAMI,
CHIPPED FROM CNC, CHIPPED FROM CUTTING TABLE, CHIPPED IN ARRISING, CHIPPED IN
BEVELING, CHIPPED IN DRILLING, CHIPPED IN SHIPPING, CUT WRONG FROM OFFICE,
DAMAGED BY FAILED PIECE, DAMAGED IN EDGER, DAMAGED ON ARRIS, DAMAGED ON CNC,
DAMAGED ON DRILL, DAMAGED ON WASH, DELIVERED TO WRONG CUSTOMER, DRAWING WRONG
FROM OFFICE, DRILLED INCORRECTLY, DRILLED WRONG, DROPPED GLASS WHILE CARRYING,
FAILURE TO CHECK PROCESS, FORGOT TO DRILL AND GOT TEMPERED, GAVE TO ANOTHER
CUSTOMER, GLASS QUALITY…

**NCR Reasons:** BOWED GLASS, BROKEN BAD FROM CUTTING TABLE, BROKEN ON DELIVERY,
BROKEN ON INSTALL, CUSTOM LAM QUALITY, CUT WRONG, DETAIL WORK - EDGEWORK, DETAIL
WORK - HOLES, DETAIL WORK - NOTCHES/CUT-OUTS, DRAWING WRONG FROM OFFICE,
EXPLODED, GLASS QUALITY, IGU QUALITY, INPUT INCORRECTLY, LOGO POSITION,
MANAGEMENT DECISION, MISSING, NO TOUGHENED STAMP, PAINT QUALITY, PROGRAM ERROR -
DETAIL WORK, PROGRAM ERROR - OPTIMISING, ROLLER MARKS, SCRATCHED, SEED,
SHELLED/CHIPPED, WARRANTY - FAILED UNIT(S).

---

## Правила работы в этом репозитории

- Правится **только `src/`** (и `test/`, `docs/`, `build/manifest.json`).
  `dist/GLASS_ERP.html` руками не трогать и в ветку не коммитить — его
  пересобирает CI после слияния.
- **В `main` напрямую не коммитить.** Отдельная ветка → PR.
- Перед коммитом `npm run build:web` (обновляет `src/index.html`).
- Тесты: `node test/run.js` — всё зелёное, дважды.
- **Окончания строк:** `git diff --numstat` должен совпадать с
  `git diff --ignore-cr-at-eol --numstat`. Не совпало — `node tools/fix-eol.js
  <файл>`. У `test/run.js` окончания Windows.
- Заливка одной командой: `node tools/prepush.js`. Проверить без пуша:
  `node tools/prepush.js --dry`. Во время prepush исходники не править.
- **С владельцем:** он не программист. Сначала обсудить подход и дождаться ответа.
  Визуализировать, чтобы он понял на 100% и не одобрил то, что не понял.
  Мелочи, которые он может поправить сам на экране, — назвать клики, без PR.
  Хранилище, копии и «риски» не предлагать.
