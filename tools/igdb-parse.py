#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/igdb-parse.py — разбор выгрузки IGDB (glass1.csv) в осевую модель каталога.

Зачем скрипт лежит в репозитории: прошлый разбор был сделан в чате и потерян
вместе с сессией (хендофф, раздел 9д описывает файлы, которых уже нет).
Здесь он воспроизводим.

Запуск:  python3 tools/igdb-parse.py <путь к glass1.csv> [--out templates/GLASS_PRODUCTS.csv]

Что делает и чего НЕ делает:
  · берёт только три линии поставки пользователя — Vitro formerly PPG (.VTA),
    Cardinal Glass Industries (.CIG), Pilkington North America (.LOF);
  · выбрасывает многослойные составы: в нашей модели это Makeup, а не позиция
    каталога (хендофф 9д);
  · выбрасывает внутренние лабораторные коды Cardinal (CG…, SIGP…);
  · раскладывает имя на подложку / покрытие / номинал / факт;
  · класс покрытия определяет ПО ЭМИССИВНОСТИ, а не по имени: имя врёт чаще.
  · НЕ заполняет temper_mode, edge_deletion, deposition — в IGDB их нет,
    и выдумывать их нельзя: на них стоит допуск в печь и брак покрытия.
"""
import csv, io, re, sys, unicodedata

VITRO   = 'Vitro formerly PPG'
CARDINAL= 'Cardinal Glass Industries'
PILK    = 'Pilkington North America'
KEEP    = {VITRO, CARDINAL, PILK}
SHORT   = {VITRO:'Vitro', CARDINAL:'Cardinal', PILK:'Pilkington'}

NOMINALS = [2, 2.2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 16, 19, 22, 25]
# Ответ пользователя: «3 мм минимальный и 19 мм максимальный». Всё тоньше —
# техническое и дисплейное стекло (UFF 0.7-1.3 мм, Microwhite), всё толще
# в цех не приходит.
MIN_MM, MAX_MM = 3.0, 19.0
# Ответ пользователя про Vitro Solarcoat: «первый раз слышу про данный тип
# стекла, знаю Solarcool & Solarban, если не слышал значит не надо».
NOT_PURCHASED = re.compile(r'solarcoat', re.I)

def clean_text(s):
    """IGDB отдан в Windows-1252: ™ и ® приезжают как '?' или мусор. Снимаем.

       Надстрочные ² и ³ тоже снимаем — по прямому указанию пользователя:
       «это значит количество серебряных слоёв и это не надо, а нести файл в
       степени такая себе история». Проверено: после снятия ни одна пара имён
       не слипается, `LoE³ 340` и `LoE 340+` остаются разными."""
    s = (s or '').replace('™','').replace('®','').replace('�','')
    s = s.replace('\u00b2','').replace('\u00b3','').replace('\u00b9','')
    s = re.sub(r'[?]+(?=\s|$)', '', s)          # 'Optifloat? Clear' → 'Optifloat Clear'
    s = ''.join(c for c in s if unicodedata.category(c)[0] != 'C')
    return re.sub(r'\s+', ' ', s).strip()

def fnum(v, default=None):
    try: return float(v)
    except (TypeError, ValueError): return default

# --- что НЕ является позицией каталога ---------------------------------
INTERLAYER = re.compile(r'\b(PVB|SGP|EVA|PET|SentryGlas|Saflex|Vanceva)\b', re.I)
# Слово «laminate» ловим отдельно: `Solar E laminate` (Secl9lam.lof, факт 8.48 мм)
# прошёл мимо фильтра интерлейеров — производитель назвал продукт ламинатом словом,
# а не составом. Проверено независимо: это триплекс, в каталог не идёт.
LAMI_WORD  = re.compile(r'lamin|\blami\b', re.I)
# Cardinal CLiC — склеенный продукт, номиналы 3/8" (9.9 мм) и 7/16" (11.5 мм).
# Совпадение обоих нетипичных значений с паспортом производителя подтверждено.
LAMI_BRAND = re.compile(r'^CLiC\b', re.I)
def is_multilayer(name, product, conductivity=None):
    """Составы из нескольких стёкол. Разделитель бывает ' / ' (Cardinal) и
       '_' (Vitro: '5mmSB70(2)_090SG_5mmEnergyAdvantage(4)').

       ГЛАВНЫЙ ПРИЗНАК — ФИЗИЧЕСКИЙ, а не текстовый. У монолитного стекла
       теплопроводность 1.0; у склейки её роняет полимерный слой, и она
       падает до 0.44-0.81. Разделение чистое: 577 монолитов против 698
       составов, без единого пересечения. Имя врёт, замер — нет.

       УБРАНО ПРАВИЛО ПО МАРКЕРАМ ПОВЕРХНОСТЕЙ. Первая версия считала
       `(1)`/`(2)` признаком нескольких стёкол и выбросила девять реальных
       позиций: `BirdSmart (1) Solarban 65 (2) Clear 6mm` — это ОДНО стекло
       6 мм с двумя покрытиями, на первой и второй поверхности, а вовсе не
       триплекс. Толщина 5.6642 мм и теплопроводность 1.0 это подтверждают."""
    if conductivity is not None and conductivity < 0.95:                  return True
    if ' / ' in product or '/' in product and INTERLAYER.search(product): return True
    if INTERLAYER.search(product) or INTERLAYER.search(name):             return True
    if LAMI_WORD.search(product) or LAMI_WORD.search(name):               return True
    if LAMI_BRAND.match(product.strip()):                                 return True
    if len(re.findall(r'\d+\s*mm', product, re.I)) > 1:                   return True
    return False

LABCODE = re.compile(r'^(CG[A-Z]?[\d-]|SIGP)', re.I)
def is_labcode(product):
    return bool(LABCODE.match(product))

# --- подложка ----------------------------------------------------------
# UFF (Ultra Fine Flat) убран из осветлённых: это ультратонкий ОБЫЧНЫЙ флоат
# 0.7-1.3 мм для технических применений, а не низкожелезистое стекло.
# Суффикс OW у Pilkington означает Optiwhite — осветлённую подложку.
LOW_IRON = re.compile(r'Starphire|Optiwhite|PureVision|Microwhite|Acuity|Low.?Iron|\bOW\b', re.I)
TINT     = re.compile(r'Solexia|Atlantica|Solarblue|Solarbronze|Solargray|Solargreen|Graylite|'
                      r'Azuria|Pacifica|Optiblue|Optigray|Optigrey|Optigreen|\bGrey\b|\bGray\b|'
                      r'Bronze|\bBlue\b|\bGreen\b|EverGreen|SuperGrey|Arctic|Graphite|Emerald|Tint', re.I)
WIRED    = re.compile(r'\bwire', re.I)
PATTERN  = re.compile(r'pattern|obscur|satin|acid|frost', re.I)

def substrate_of(product, name):
    hay = product + ' ' + name
    base = re.sub(r'^.*?\bon\b', '', product, flags=re.I) or product   # '… on 6mm Clear'
    if WIRED.search(hay):    return 'wired'
    if PATTERN.search(hay):  return 'patterned'
    if LOW_IRON.search(base) or LOW_IRON.search(hay): return 'low_iron'
    if TINT.search(base) or TINT.search(product):     return 'tinted'
    return 'clear'

# --- покрытие ----------------------------------------------------------
# Имя ненадёжно: 'Energy Advantage Low-E' регуляркой на 'lo.?e' не ловится, а
# 'Solarcool' зовётся покрытием, но эмиссивность у него высокая — это солнце-
# защита, а не low-E. Поэтому класс берём из ЧИСЕЛ.
COATED_NAME = re.compile(
 r'lo.{0,2}e|i89|x89|solarban|sungate|solarcool|solarcoat|vistacool|activ|'
 r'solar.?e|optiview|eclipse|select|r500|reflect|reflite|sanitise|birdsmart|'
 r'starphire\s*plus|mirror', re.I)

# Порог 0.25, а не 0.50. Данные бимодальны: 324 строки ниже 0.25, 198 выше 0.80
# и ровно ПЯТЬ между ними — все OptiView с 0.40-0.49. Это антибликовое покрытие,
# а не низкоэмиссионное: настоящее low-E даёт 0.02-0.10 (напыление) или
# 0.15-0.20 (пиролиз). Порог 0.50 записывал OptiView в low-E и отправлял его
# в камеру стеклопакета. Проверено независимо.
LOWE_EMIS = 0.25

def coating_of(row, product):
    e1, e2 = fnum(row.get('emis1'), .84), fnum(row.get('emis2'), .84)
    lowest = min(e1, e2)
    named  = bool(COATED_NAME.search(product))
    if lowest < LOWE_EMIS:       return 'lowe',        lowest
    if named:                    return 'reflective',  lowest   # солнцезащита без low-E
    return 'uncoated', lowest

# --- где покрытию можно стоять ------------------------------------------
# ПЕРЕПИСАНО ПОСЛЕ НЕЗАВИСИМОЙ ПРОВЕРКИ. Первая версия ставила cavity_only
# всему низкоэмиссионному подряд — `if family == 'lowe'`. Это неверно:
#
#   cavity_only — свойство СПОСОБА НАНЕСЕНИЯ, а не низкой эмиссивности.
#
# Эмиссивность — оптика, стойкость — химия нанесения. Мягким (и потому
# прячущимся в камеру) покрытие делает магнетронное напыление серебра в
# вакууме: MSVD, sputtered. Пиролитическое покрытие наносится на ленту
# горячего стекла в потоке (on-line CVD), спекается с ней и стойко — ему
# ограничение по поверхности не нужно.
#
# Вывод проверен двумя независимыми линзами, включая скептическую, которая
# пыталась защитить прежнее правило и не смогла.
#
# Заполнять `deposition` для ВСЕГО ассортимента по догадке нельзя: от него
# зависит и edge_deletion, и допуск в печь. Поэтому таблица закрывает только
# то, что подтверждено, остальное остаётся пустым, а exposure_rule у них —
# консервативный cavity_only: ошибка тогда ЗАПРЕЩАЕТ сборку, а не разрешает
# неверную.
PYROLYTIC = re.compile(r'energy\s*advantage|solar.?e\b|solar.?e\s*plus|activ|sanitise|'
                       r'reflite|eclipse|\bi89\b|\bx89\b|k.?glass', re.I)
# `\s*` обязателен: без него 'LoE² 240' попадало в напылённые, а 'LoE 180' —
# нет, хотя это одно и то же семейство Cardinal.
SPUTTERED = re.compile(r'solarban|lo.{0,2}e\s*[\u00b2\u00b3\d]|comfort\s*select|'
                       r'energy\s*select|vistacool|sungate', re.I)
# Наружная поверхность по назначению: самоочищающееся работает от солнца и
# дождя, птицезащитный рисунок обязан быть виден снаружи.
EXTERIOR  = re.compile(r'\bactiv\b|birdsmart', re.I)
# Единственные low-E, идущие на поверхность #4, внутрь помещения.
INTERIOR  = re.compile(r'\bi89\b|\bx89\b', re.I)
# Sungate ThermL — ответ пользователя: «#4 производитель рекомендует, но может быть
# и на 3». Ни одно значение exposure_rule этого не выражает: cavity_only это #2/#3,
# interior_only это только #4. Поэтому правило остаётся мягким (any), а настоящее
# ограничение несёт allowed_surfaces — оно точнее по построению.
SURF_34   = re.compile(r'sungate\s*therm', re.I)
# Лист с ДВУМЯ покрытиями сразу: `BirdSmart (1) Solarban 65 (2) Clear 6mm`.
# Птицезащита обязана смотреть наружу, солнцезащита — в камеру, поэтому лист
# не «ставится куда угодно», а имеет верх и низ. Одним значением deposition
# такой лист не описывается — там два разных покрытия, поле остаётся пустым.
DUAL_COAT = re.compile(r'\(\s*1\s*\).*\(\s*2\s*\)', re.S)

def exposure_of(product, family):
    """→ (exposure_rule, allowed_surfaces, deposition)

       deposition проставляется ТОЛЬКО из проверенных таблиц PYROLYTIC и
       SPUTTERED. Прежняя версия возвращала 'pyrolytic' прямо из веток
       INTERIOR и EXTERIOR — то есть по догадке, ровно то, что запрещает
       комментарий выше. У листа с двумя покрытиями поле пустое всегда:
       одним значением два разных покрытия не описать."""
    depo = 'pyrolytic' if PYROLYTIC.search(product) else \
           'sputtered' if SPUTTERED.search(product) else ''
    if family == 'uncoated':          return 'any', '', ''
    if DUAL_COAT.search(product):     return 'exterior_only', '1,2', ''
    if INTERIOR.search(product):      return 'interior_only', '4', depo
    if SURF_34.search(product):       return 'any', '3,4', depo
    if EXTERIOR.search(product):      return 'exterior_only', '1', depo
    if PYROLYTIC.search(product):     return 'any', '', depo
    if SPUTTERED.search(product):     return 'cavity_only', '2,3', depo
    if family == 'lowe':              return 'cavity_only', '2,3', ''   # осторожное умолчание
    return 'any', '', ''

# --- толщина -----------------------------------------------------------
def nominal_of(product, name, actual):
    m = re.search(r'(\d+(?:\.\d+)?)\s*mm', product, re.I)          # 'Clear 6mm'
    if m: return float(m.group(1))
    m = re.search(r'[-_ ](\d+(?:\.\d+)?)\s*(?:mm)?\.\w{3}$', name, re.I)  # 'LoE272-6.CIG'
    if m: return float(m.group(1))
    m = re.search(r'(\d+(?:\.\d+)?)\s*(?:mm)?\.\w{3}$', name, re.I)       # 'CLEAR6.LOF'
    if m: return float(m.group(1))
    if actual is None: return None
    return min(NOMINALS, key=lambda n: abs(n - actual))            # последний резерв

def fmt_num(x):
    if x is None: return ''
    return ('%g' % x)

# --- код позиции -------------------------------------------------------
# ПЕРЕПИСАНО. Первая версия резала имя до 10 символов и выбрасывала подложку
# после «on» — и склеивала РАЗНЫЕ продукты под одним кодом: `Comfort Select 73`
# с `73Plus`, `LoE 340+` с `LoE³ 340`, три разных Solarcool на трёх подложках,
# а хуже всего — `Clear 2.5mm` с `Clear 25mm` (2.26 мм и 25.4 мм — оба реальны).
# Схлопывание шло молча, и 173 строки просто исчезали.
#
# Теперь: надстрочные и «+» сохраняются как значащие символы, подложка входит
# в код суффиксом (как `6SB70-SP` в шаблоне пользователя), а уникальность
# проверяется и НАРУШИТЬСЯ НЕ МОЖЕТ — при столкновении токен удлиняется.
SUPER = {'\u00b2':'2', '\u00b3':'3', '\u00b9':'1', '\u2070':'0',
         '\u2074':'4', '\u2075':'5', '\u2076':'6', '\u2077':'7', '\u2078':'8', '\u2079':'9'}
BASE_ABBR = {'Starphire':'SP','Optiwhite':'OW','Acuity':'ACU','Solargray':'SGY','Solarbronze':'SBZ',
             'Solarblue':'SBL','Azuria':'AZ','Pacifica':'PAC','Optigray':'OGY','Optiblue':'OBL',
             'Atlantica':'ATL','Solexia':'SLX','Graphite Blue':'GRB','PureVision':'PV'}

def _tok(text, limit):
    t = ''.join(SUPER.get(c, c) for c in text)
    t = t.replace('+', 'P')
    t = re.sub(r'[^A-Za-z0-9]', '', t).upper()
    return t[:limit] if limit else t

def base_suffix(product):
    """Подложка в коде. `Solarban 70 on Starphire` и `… on Clear` — РАЗНЫЕ
       продукты (план, раздел 5), поэтому подложка обязана быть в коде."""
    m = re.search(r'\bon\b\s+(.*)$', product, re.I)
    if not m: return ''
    b = re.sub(r'\d+(\.\d+)?\s*mm', '', m.group(1), flags=re.I)
    b = re.sub(r'\(.*?\)', '', b).strip(' -')
    if not b or re.fullmatch(r'clear', b, re.I): return ''      # clear — база по умолчанию
    for full, ab in BASE_ABBR.items():
        if re.search(re.escape(full), b, re.I): return '-' + ab
    return '-' + _tok(b, 4)

def thickness_token(nominal):
    """2.5 и 25 обязаны давать РАЗНЫЕ токены — точку не выбрасываем."""
    return ('%g' % nominal)

def code_of(product, nominal, limit=12):
    head = re.split(r'\bon\b', product, flags=re.I)[0]
    head = re.sub(r'\d+(\.\d+)?\s*mm', '', head, flags=re.I)
    head = re.sub(r'\(.*?\)', '', head).strip(' -')
    return '%s%s%s' % (thickness_token(nominal), _tok(head, limit) or 'GLASS', base_suffix(product))

def assign_codes(items):
    """Уникальность по построению: пока есть столкновение РАЗНЫХ продуктов,
       удлиняем токен. Молча схлопывать строки нельзя — так теряется товар."""
    limit = 12
    while limit <= 64:
        groups = {}
        for it in items:
            groups.setdefault((it['manufacturer'], code_of(it['_product'], it['_nominal'], limit)), []).append(it)
        clash = [g for g in groups.values() if len({(x['_product']) for x in g}) > 1]
        if not clash: break
        limit += 8
    for (man, code), g in groups.items():
        for it in g: it['code'] = it.get('_fixedCode') or code
    return limit, sum(1 for g in groups.values() if len({x['_product'] for x in g}) > 1)

def main(src, out):
    rows = list(csv.DictReader(io.open(src, encoding='cp1252')))
    kept, dropped = [], {'производитель': 0, 'многослойный состав': 0, 'лабораторный код': 0,
                         'нет толщины': 0, 'вне 3-19 мм': 0, 'не закупаем': 0}
    for r in rows:
        man = r.get('Manufacturer') or ''
        if man not in KEEP:
            dropped['производитель'] += 1; continue
        product = clean_text(r.get('ProductName'))
        name    = clean_text(r.get('Name'))
        if is_multilayer(name, product, fnum(r.get('Conductivity'))):
            dropped['многослойный состав'] += 1; continue
        if is_labcode(product):
            dropped['лабораторный код'] += 1; continue
        if NOT_PURCHASED.search(product):
            dropped['не закупаем'] += 1; continue
        actual  = fnum(r.get('Thickness'))
        nominal = nominal_of(product, name, actual)
        if nominal is None:
            dropped['нет толщины'] += 1; continue
        if nominal < MIN_MM or nominal > MAX_MM:
            dropped['вне 3-19 мм'] += 1; continue
        substrate = substrate_of(product, name)
        family, emis = coating_of(r, product)
        e1, e2 = fnum(r.get('emis1'), .84), fnum(r.get('emis2'), .84)
        coated_side = '' if family == 'uncoated' else ('1' if e1 < e2 else '2' if e2 < e1 else '')
        rule, surf, depo = exposure_of(product, family)
        note = 'производитель рекомендует #4, допускается #3' if SURF_34.search(product) else (
               'два покрытия на одном листе: #1 и #2 — лист ставится наружным' if DUAL_COAT.search(product) else '')
        kept.append({
            '_product': product, '_nominal': nominal,
            'manufacturer': SHORT[man],
            'code': '',
            'name': product,
            'substrate': substrate,
            'coating_family': family,
            'thickness_mm': fmt_num(nominal),
            'actual_thickness_mm': fmt_num(actual),
            'temper_mode': '',          # в IGDB нет — из паспорта производителя
            'exposure_rule': rule,
            'allowed_surfaces': surf,
            'edge_deletion': '',        # в IGDB нет — зависит от deposition
            'deposition': depo,         # в IGDB нет; заполнено только там, где проверено
            'legacy_code': '',          # заполняется сверкой со Spil
            'notes': note,
            # Галочка пользователя «держим на складе». Живёт на ПРОДУКТЕ, а не на
            # строке поставки: availability в GLASS_SHEETS отвечает на другой
            # вопрос — через какую точку поставки и за сколько дней. Отмечать
            # наличие по каждой паре продукт-поставщик пользователю незачем.
            'stocked': '',
            'igdb_id': r.get('ID',''), 'igdb_name': name, 'igdb_source': r.get('Source',''),
            'tvis': r.get('Tvis',''), 'tsol': r.get('Tsol',''),
            # Отражение с двух сторон — каталожная характеристика: как лист
            # выглядит снаружи и изнутри. У 175 позиций стороны различаются.
            'rvis1': r.get('Rvis1',''), 'rvis2': r.get('Rvis2',''),
            'rsol1': r.get('Rsol1',''), 'rsol2': r.get('Rsol2',''),
            'emis1': r.get('emis1',''), 'emis2': r.get('emis2',''),
            # Сторона покрытия по замеру. min(emis1,emis2) её терял, а она
            # говорит, какой стороной лист кладут.
            'coated_side': coated_side,
            'conductivity': r.get('Conductivity',''),
        })

    # ПОКУПНЫЕ ЛАМИНАТЫ. Ответ пользователя: «мы делаем сами, но вообще есть
    # только 3 типа которые мы покупаем: 3mm + 0.15/0.30/0.60 PVB + 3mm».
    # Покупной лист — законная позиция каталога со своей ценой и размером листа;
    # всё остальное ламинируется у себя и живёт составом Makeup, а не строкой
    # справочника (хендофф, раздел 9е). Толщина интерлейера дана в дюймах:
    # .015" = 0.38 мм, .030" = 0.76 мм, .060" = 1.52 мм.
    for inch, mm in (('015', 0.38), ('030', 0.76), ('060', 1.52)):
        kept.append({
            '_product': 'Laminated 3mm + .%s PVB + 3mm' % inch, '_nominal': 6.0,
            '_fixedCode': '6LAM%s' % inch,
            'manufacturer': '', 'code': '', 'name': 'Laminated 3mm + .%s" PVB + 3mm' % inch,
            'substrate': 'clear', 'coating_family': 'uncoated',
            'thickness_mm': '6', 'actual_thickness_mm': fmt_num(round(6.0 + mm, 2)),
            'temper_mode': '', 'exposure_rule': 'any', 'allowed_surfaces': '',
            'edge_deletion': '', 'deposition': '', 'legacy_code': '',
            'notes': 'ПОКУПНОЙ ламинат — не наше производство. Поставщика и размер листа заполнить.',
            'stocked': '',
            'igdb_id': '', 'igdb_name': '', 'igdb_source': '', 'tvis': '', 'tsol': '',
            'rvis1': '', 'rvis2': '', 'rsol1': '', 'rsol2': '',
            'emis1': '', 'emis2': '', 'coated_side': '', 'conductivity': '',
        })

    limit, clashes = assign_codes(kept)
    if clashes:
        raise SystemExit('ОСТАНОВ: %d кодов достались разным продуктам — молча склеивать нельзя' % clashes)

    # дубли по (производитель, код): один и тот же продукт в разных версиях
    # IGDB. Оставляем строку из САМОЙ СВЕЖЕЙ версии.
    def ver(s):
        m = re.search(r'v([\d.]+)', s or ''); return float(m.group(1)) if m else 0.0
    best = {}
    for k in kept:
        key = (k['manufacturer'], k['code'])
        if key not in best or ver(k['igdb_source']) > ver(best[key]['igdb_source']):
            best[key] = k
    collapsed = len(kept) - len(best)
    out_rows = sorted(best.values(), key=lambda x: (x['manufacturer'], x['name'], float(x['thickness_mm'] or 0)))
    for r in out_rows:
        r.pop('_product', None); r.pop('_nominal', None); r.pop('_fixedCode', None)

    cols = ['manufacturer','code','name','substrate','coating_family','thickness_mm',
            'actual_thickness_mm','temper_mode','exposure_rule','allowed_surfaces',
            'edge_deletion','deposition','legacy_code','notes','stocked',
            'igdb_id','igdb_name','igdb_source','tvis','tsol','rvis1','rvis2','rsol1','rsol2',
            'emis1','emis2','coated_side','conductivity']
    with io.open(out,'w',encoding='utf-8',newline='') as fh:
        # lineterminator='\n': остальные шаблоны в репозитории с LF, csv по
        # умолчанию пишет CRLF и создаёт diff на ровном месте.
        w = csv.DictWriter(fh, fieldnames=cols, lineterminator='\n')
        w.writeheader(); w.writerows(out_rows)

    print('прочитано строк: %d' % len(rows))
    for k, v in dropped.items(): print('  отброшено · %-22s %d' % (k, v))
    print('  схлопнуто повторов одного продукта (разные версии IGDB): %d' % collapsed)
    print('  длина токена кода: %d, столкновений разных продуктов: 0' % limit)
    print('ЗАПИСАНО: %d строк → %s' % (len(out_rows), out))
    return out_rows

if __name__ == '__main__':
    src = sys.argv[1]
    out = sys.argv[sys.argv.index('--out')+1] if '--out' in sys.argv else 'templates/GLASS_PRODUCTS.csv'
    main(src, out)
