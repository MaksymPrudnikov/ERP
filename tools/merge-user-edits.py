#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/merge-user-edits.py — вернуть правки пользователя на чистый эталон.

Зачем: файл, заполненный в Excel, приезжает повреждённым двумя способами сразу.
  1. Все пустые ячейки заменены строкой «LoE» — 1707 штук, плюс две лишние
     колонки в конце. Похоже на автозамену или протяжку.
  2. Файл сохранён в ASCII, поэтому пропали надстрочные символы и кириллица:
     «LoE² 272» стал «LoE 272», русские примечания стёрты.

Ни то ни другое не должно попасть в каталог, но и правки терять нельзя.
Поэтому: технические колонки берутся из эталона (пересобирается igdb-parse.py),
а от пользователя — ровно те четыре колонки, которые он и заполнял.

Запуск: python3 tools/merge-user-edits.py <чистый.csv> <правки.csv> <итог.csv>
"""
import csv, io, sys, collections

# Колонки, которые принадлежат ПОЛЬЗОВАТЕЛЮ. Всё остальное — из эталона.
USER_OWNED = ['code', 'manufacturer', 'temper_mode', 'stocked', 'legacy_code']
JUNK = 'LoE'          # чем Excel забил пустые ячейки
# Прочерк — это «не заполнял», а не значение. Пользователь ставил его там, где
# позиция у поставщика есть, а на складе её нет: «я просто знаю что они есть
# для покупки но в стоке у нас нет». Такое состояние выражает пустой `stocked`,
# а в `temper_mode` прочерк приехал бы мусором мимо словаря значений.
BLANKS = {JUNK, '-', '—', 'n/a', 'N/A'}

def val(row, key):
    """Значение пользователя, если это не мусор и не прочерк."""
    v = (row.get(key) or '').strip()
    return '' if v in BLANKS else v

def main(clean_path, user_path, out_path):
    clean = list(csv.DictReader(io.open(clean_path, encoding='utf-8')))
    user  = list(csv.DictReader(io.open(user_path,  encoding='utf-8')))
    cols  = list(clean[0].keys())
    by_id = {r['igdb_id']: r for r in clean if r['igdb_id']}
    by_code = {r['code']: r for r in clean}

    out, seen_ids, stats = [], collections.Counter(), collections.Counter()

    for u in user:
        uid = val(u, 'igdb_id')
        base = by_id.get(uid) or by_code.get(val(u, 'code'))
        if base is None:
            # Строка, которой в эталоне нет вовсе: пользователь завёл её сам.
            # Единственный случай — незакаливаемая пара к VT-версии. Технику
            # берём у близнеца по имени, оптику НЕ придумываем.
            twin = next((c for c in clean if c['name'] == val(u, 'name')), None)
            base = dict(twin) if twin else {k: '' for k in cols}
            stats['новая строка пользователя'] += 1
        row = {k: base.get(k, '') for k in cols}
        for k in USER_OWNED:
            v = val(u, k)
            if v: row[k] = v
        # пара Q/E делит одну запись IGDB — помечаем, чтобы происхождение было видно
        if uid and seen_ids[uid]:
            row['notes'] = (row['notes'] + ' · ' if row['notes'] else '') + \
                           'парная версия по закалке, оптика общая с близнецом'
            stats['вторая строка пары Q/E'] += 1
        if uid: seen_ids[uid] += 1
        out.append(row)
        stats['перенесено строк'] += 1

    # Строки эталона, которых пользователь не видел (появились после его выгрузки)
    have = {r['igdb_id'] for r in out if r['igdb_id']}
    for c in clean:
        if c['igdb_id'] and c['igdb_id'] not in have:
            row = dict(c)
            row['notes'] = (row['notes'] + ' · ' if row['notes'] else '') + \
                           'добавлено после твоей выгрузки — код переименуй по своей конвенции'
            out.append(row); stats['добавлено из эталона'] += 1

    with io.open(out_path, 'w', encoding='utf-8', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=cols, lineterminator='\n')
        w.writeheader(); w.writerows(out)

    for k, v in stats.most_common(): print('  %-34s %d' % (k, v))
    print('ЗАПИСАНО: %d строк, %d колонок → %s' % (len(out), len(cols), out_path))

if __name__ == '__main__':
    main(*sys.argv[1:4])
