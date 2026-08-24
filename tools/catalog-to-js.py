#!/usr/bin/env python3
# =====================================================================
#  tools/catalog-to-js.py
#  Кладёт templates/GLASS_PRODUCTS.csv внутрь модуля как заводской засев:
#  src/erp/masterdata/glass-catalog.js
#
#  Зачем именно так, а не массивом объектов: засев обязан совпадать с
#  файлом ДОСЛОВНО. Строка CSV едет в браузер как строка CSV и разбирается
#  тем же parseCsv, что и пользовательский импорт — значит заводские данные
#  проходят ровно те же правила и те же отказы, и второй схемы разбора,
#  которая однажды разойдётся с первой, не появляется.
#
#  Запуск (после каждой пересборки каталога igdb-parse.py):
#      python3 tools/catalog-to-js.py
#
#  Файл-результат руками не редактируется.
# =====================================================================
import csv
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'templates', 'GLASS_PRODUCTS.csv')
OUT = os.path.join(ROOT, 'src', 'erp', 'masterdata', 'glass-catalog.js')

# Тот же список, что в GLASS_CODE_RE модуля: коды вроде 3Q340+ и 3E+272
# законны — это фирменные обозначения Cardinal, а не опечатки.
CODE_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9+._/-]{0,39}$')


def js_string(s):
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


def product_id(code):
    """Идентификатор переживает переименование кода — поэтому он отдельный.
       Пользователь переписывает 6BIRDSMART в свой цеховой код, а ссылки из
       сохранённых Makeup продолжают показывать то же стекло."""
    return 'GL-' + re.sub(r'[^A-Za-z0-9_-]', '-', code.upper())


def main():
    with open(SRC, encoding='utf-8') as fh:
        text = fh.read()
    if text.startswith('﻿'):
        text = text[1:]

    rows = list(csv.DictReader(text.splitlines()))
    problems = []
    ids, codes = {}, {}
    for n, r in enumerate(rows, start=2):
        code = (r.get('code') or '').strip()
        if not code:
            problems.append('строка %d: пустой код' % n)
            continue
        if not CODE_RE.match(code):
            problems.append('строка %d: код %r вне допустимых символов' % (n, code))
        if code.upper() in codes:
            problems.append('строка %d: код %s повторяется (первый раз в строке %d)'
                            % (n, code, codes[code.upper()]))
        codes[code.upper()] = n
        pid = product_id(code)
        if pid in ids:
            problems.append('строка %d: код %s даёт тот же идентификатор %s, что и строка %d'
                            % (n, code, pid, ids[pid]))
        ids[pid] = n

    if problems:
        sys.stderr.write('Каталог не годится в засев:\n')
        for p in problems:
            sys.stderr.write('  · ' + p + '\n')
        return 1

    lines = text.split('\n')
    while lines and lines[-1] == '':
        lines.pop()

    body = ',\n'.join(js_string(l) for l in lines)
    js = """/* =====================================================================
   erp/masterdata/glass-catalog · masterdata-1.0
   СБОРКА — не редактировать руками.
   Заводской засев каталога стекла: %d позиций, дословная копия
   templates/GLASS_PRODUCTS.csv.

   Пересобрать после правки каталога:
       python3 tools/catalog-to-js.py

   Разбирается тем же parseCsv, что и пользовательский импорт
   (см. erp/masterdata/glass), поэтому второй схемы разбора здесь нет.
   ===================================================================== */

const GLASS_PRODUCTS_CSV=[
%s
].join('\\n');
""" % (len(rows), body)

    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(js)
    print('src/erp/masterdata/glass-catalog.js — %d позиций, %.1f КБ'
          % (len(rows), len(js.encode('utf-8')) / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
