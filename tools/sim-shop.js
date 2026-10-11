#!/usr/bin/env node
/* =====================================================================
   Цех за 14 месяцев — симуляция работы цеха функциями ERP.

   Зачем. Владелец (11 октября 2026): «попробуем сделать какие-то пути как
   юзеры: создать заказы, создать пользователей, смоделируем полные отчёты».
   Генератор заводит людей, клиентов, квоты и заказы, батчи с раскроем,
   сканы станций по сменам, отгрузки, рейсы, оплаты — день за днём. Всё
   создаётся функциями ERP (salesOrderSave, glassBatchAssign, cutPlanRun,
   stationSubmit, shippingCreate, finSaveReceiptRecord …), а не подделкой
   JSON. Случайность — от seed: тот же seed даёт ту же базу.

   Как устроено.
   · Страница — src/index.html в Playwright. Часы страницы подменены: Date
     показывает время симуляции; Math.random и crypto.randomUUID — от seed.
   · Запись в localStorage на время генерации выключена: 14 месяцев в
     хранилище браузера не влезают (потолок ~5 МБ), база живёт в памяти.
     storageCommand без снимка всей базы, render — пустой (экранов нет).
   · Готовое старое (заказ отгружен неделю назад) уходит из DB в архив
     страницы: функции ERP перебирают журналы целиком, и на 14 месяцах
     каждый скан стоил бы секунды. В конце архив возвращается в DB.
   · Км рейсов — заглушка Google Directions по координатам городов:
     tripKmCalc ERP считает и записывает DB.tripKm как с настоящей картой.

   Выход (--out, по умолчанию ~/.glass-erp-walk/sim):
     <name>.json        база — Export JSON (Import в ERP)
     <name>-truth.json  «правильные ответы» — счёт самого генератора
     <name>-people.json люди: номер и PIN станции, пароль офиса (не в git!)
     <name>-sizes.json  размер базы по месяцам

   Примеры:
     node tools/sim-shop.js                                  14 месяцев
     node tools/sim-shop.js --small                          малая база: 10 дней, 12 % объёма (~3 МБ)
     node tools/sim-shop.js --start 2026-09-01 --end 2026-09-12 --name try
     node tools/sim-shop.js --check                          ещё и сверка отчётов с truth

   Ключи: --start --end (YYYY-MM-DD) --seed N --scale 0.2 (доля объёма)
          --name --out --small --quick-cut (быстрый раскрой, для отладки)
          --end-at 10 (последний день — до этого часа, можно 7.5)
          --check (отчёты конструктора против truth, время отчётов)
   ===================================================================== */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const o = { start: '2025-08-04', end: '2026-10-10', seed: 20261011, scale: 1, name: '', out: path.join(os.homedir(), '.glass-erp-walk', 'sim'),
  small: false, quickCut: false, check: false };
const argv = require.main === module ? process.argv.slice(2) : [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], v = () => argv[++i];
  if (a === '--start') o.start = v(); else if (a === '--end') o.end = v(); else if (a === '--seed') o.seed = +v();
  else if (a === '--scale') o.scale = +v(); else if (a === '--name') o.name = v(); else if (a === '--out') o.out = v();
  else if (a === '--small') o.small = true; else if (a === '--end-at') o.endAt = +v(); else if (a === '--quick-cut') o.quickCut = true; else if (a === '--check') o.check = true;
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
  else { console.error('Неизвестный ключ: ' + a); process.exit(2); }
}
const addDaysStr = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
/* Малая база для прохода людьми: должна влезть в браузер (~5 МБ) и оставить
   место для их работы — две недели при 12 % объёма; конец — пятница 10:00,
   чтобы стекло лежало на станциях, а PS на понедельник ещё не было. */
if (o.small) { if (!argv.includes('--end')) o.end = '2026-10-09'; if (!argv.includes('--start')) o.start = addDaysStr(o.end, -11); if (!argv.includes('--scale')) o.scale = 0.12; if (!argv.includes('--end-at')) o.endAt = 10; }
if (!o.name) o.name = o.small ? 'shop-small' : 'shop-' + o.start + '_' + o.end;

/* ---------------- до загрузки страницы: часы, seed ---------------- */
function initPage(seed) {
  window.GF_NO_SIGNIN = true;
  let a = (seed >>> 0) || 1;
  const rnd = () => { a = a + 0x6D2B79F5 >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  Math.random = rnd;
  const hex = n => { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(rnd() * 16).toString(16); return s; };
  try { Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => hex(8) + '-' + hex(4) + '-4' + hex(3) + '-' + '89ab'[Math.floor(rnd() * 4)] + hex(3) + '-' + hex(12) }); } catch (e) {}
  const R = Date; let fixed = null;
  function D(...x) { if (!new.target) return new R(fixed == null ? R.now() : fixed).toString(); return x.length ? new R(...x) : new R(fixed == null ? R.now() : fixed); }
  D.prototype = R.prototype; D.now = () => fixed == null ? R.now() : fixed; D.parse = R.parse; D.UTC = R.UTC;
  window.Date = D; window.__simClock = v => { fixed = v; };
}

/* =====================================================================
   Код страницы. Всё, что ниже, выполняется внутри ERP.
   ===================================================================== */
function simPage() {
  const SIM = window.SIM = { fails: {}, n: {}, truth: null };
  const fail = (k, msg) => { const key = k + ': ' + String(msg && msg.message || msg).slice(0, 160); SIM.fails[key] = (SIM.fails[key] || 0) + 1; };
  const cnt = (k, n) => { SIM.n[k] = (SIM.n[k] || 0) + (n == null ? 1 : n); };

  /* ---------- случайность решений генератора ---------- */
  let RS = 1;
  const rnd = () => { RS = RS + 0x6D2B79F5 >>> 0; let t = RS; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const chance = p => rnd() < p;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const pickW = list => { let s = 0; list.forEach(x => s += x[0]); let r = rnd() * s; for (const x of list) { r -= x[0]; if (r <= 0) return x; } return list[list.length - 1]; };
  const pois = l => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
  const r16 = v => Math.round(v * 16) / 16;
  const round2 = v => Math.round(v * 100) / 100;

  /* ---------- время ---------- */
  let NOW = 0;
  const at = ms => { NOW = ms; window.__simClock(ms); };
  const pad = v => String(v).padStart(2, '0');
  const T = (day, h, m) => { const [y, mo, d] = day.split('-').map(Number); return new Date(y, mo - 1, d, 0, Math.round(h * 60 + (m || 0))).getTime(); };
  const dayOf = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const addDays = (day, n) => { const [y, mo, d] = day.split('-').map(Number); return dayOf(new Date(y, mo - 1, d + n, 12).getTime()); };
  const wday = day => new Date(T(day, 12)).getDay();
  /* Праздники Онтарио: цех и офис закрыты. */
  const HOLIDAYS = new Set(['2025-08-04', '2025-09-01', '2025-10-13', '2025-12-25', '2025-12-26', '2026-01-01', '2026-02-16', '2026-04-03', '2026-05-18', '2026-07-01', '2026-08-03', '2026-09-07', '2026-10-12', '2026-12-25']);
  const workday = day => { const w = wday(day); return w >= 1 && w <= 5 && !HOLIDAYS.has(day); };
  const addWork = (day, n) => { let d = day; while (n > 0) { d = addDays(d, 1); if (workday(d)) n--; } return d; };
  const monthOf = day => day.slice(0, 7);

  /* ---------- база без записи в браузер ---------- */
  const ORIG = {};
  function storageOff() {
    ['render', 'stationShow', 'mdById', 'salesRecord', 'salesFirstGlass', 'salesLaminatedPlyCandidates', 'setTimeout', 'alert', 'confirm'].forEach(k => { ORIG[k] = window[k]; });
    window.touch = function () { if (storageDepth) return true; storageInvalidate(); return true; };
    window.storageCommand = function (fn) {
      if (storageDepth) { try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, error: e.message }; } }
      storageDepth++;
      try {
        const value = fn(); if (value === false || value && value.error) throw new Error(value && value.error || 'The operation could not be completed.');
        storageDepth--; touch(); return { ok: true, value };
      } catch (e) { storageDepth = 0; storageInvalidate(); fail('command', e.message); return { ok: false, error: e.message }; }
    };
    window.render = function () {};
    window.alert = m => fail('alert', m);
    window.confirm = () => true;
    window.print = () => {};
    window.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} });
    window.stationBeep = () => {};
    window.setTimeout = (fn, ms) => 0; /* печать юнита после IGU и прочие отложенные окна — не нужны */
    /* Экран результата скана (stationShow): карточка, стикер, «стекло едет не
       туда», «чужой клиент на скиде». Записи он не делает, а на большой базе
       пересчитывает всю тару на каждый скан — генератору экран не нужен. Сам
       скан идёт обычным stationSubmit. Цена этого экрана на большой базе
       замеряется отдельно (--check). */
    window.stationShow = function (check, rec) { stationMenu = null; stationNote = ''; stationLast = { check, rec, data: null, place: null, at: rec ? rec.at : new Date().toISOString() }; };
    /* Поиски по массиву — тот же ответ через индекс (позиция проверяется
       при каждом обращении, замена записи на месте индекс не обманет). */
    const indexed = (list, id) => {
      let ix = indexed.m.get(list);
      if (ix) { const i = ix.get(id); if (i != null && list[i] && list[i].id === id) return list[i]; if (i == null && ix.n === list.length) return null; }
      ix = new Map(); ix.n = list.length; list.forEach((x, i) => { if (x && !ix.has(x.id)) ix.set(x.id, i); }); indexed.m.set(list, ix);
      const i = ix.get(id); return i == null ? null : list[i];
    };
    indexed.m = new WeakMap();
    window.mdById = (key, id) => indexed(DB[key] || [], id);
    window.salesRecord = id => indexed(DB.salesOrder || [], id) || undefined;
    const firstGlass = window.salesFirstGlass, firstMemo = new Map();
    window.salesFirstGlass = (f, m, t) => { const k = f + '|' + m + '|' + t; if (!firstMemo.has(k)) firstMemo.set(k, firstGlass(f, m, t)); return firstMemo.get(k); };
    /* Кандидаты плиты ламината: сортировка каталога на каждую панель каждого заказа. */
    const plyRows = window.salesLaminatedPlyCandidates, plyMemo = new Map();
    window.salesLaminatedPlyCandidates = ply => { const k = (ply && ply.visionType) + '|' + (ply && ply.manufacturer) + '|' + (ply && ply.thicknessMm); if (!plyMemo.has(k)) plyMemo.set(k, plyRows(ply)); return plyMemo.get(k); };
  }

  /* ---------- журнал заказа ----------
     В ERP журнал пишет touch(), сравнивая каждый заказ базы с прошлой
     записью. На 14 месяцах это секунды на каждый скан, поэтому сравниваем
     только тронутые заказы — тем же orderLogDiff, от имени того, кто сейчас
     работает (orderLogActor). */
  const logBase = new Map(), dirty = new Set();
  const touchOrder = id => { if (id) dirty.add(id); };
  function logCapture() {
    dirty.forEach(id => {
      const o = salesRecord(id); if (!o) return;
      const text = JSON.stringify(o), base = logBase.get(id);
      if (!base) { orderLogPush(o, 'Created', orderLogCreatedNote(o)); logBase.set(id, text); return; }
      if (base === text) return;
      try { orderLogDiff(normalizeSalesOrder(JSON.parse(base)), normalizeSalesOrder(JSON.parse(text))).forEach(([what, note]) => orderLogPush(o, what, note)); } catch (e) { fail('log', e); }
      logBase.set(id, text);
    });
    dirty.clear();
  }

  /* ---------- кто работает ---------- */
  const people = {};          /* имя → {id, name, no, pin, password, role, ...} */
  let OFFICE = null;
  function asOffice(p) {
    if (OFFICE === p) return; OFFICE = p; tab = 'sales';
    const u = DB.user.find(x => x.viewProfileId === p.id), sid = 'S-sim-' + p.no;
    localStorage.setItem(SIGNIN_KEY, JSON.stringify({ userId: u.viewProfileId, sid, key: secretKey(u.password), at: new Date().toISOString() }));
    sessionStorage.setItem(SIGNIN_TAB_KEY, sid);
  }
  let STATION_WHO = '';
  /* Вход на станцию без записи «Sign in» на каждый скан: сессия станции —
     та же запись, что делает stationLogin; «Sign in» пишется раз за смену. */
  function asStation(code, p, putOn) {
    stationCode = code; tab = 'station';
    const m = stationSessions(), cur = m[code], u = DB.user.find(x => x.viewProfileId === p.id);
    if (!cur || cur.userId !== p.id) {
      m[code] = { userId: p.id, key: secretKey(u.pin), at: new Date().toISOString(), putOn: putOn || '', putOnMode: putOn ? stationPutsOnHere() : null };
      stationSessionsSave(m); stationDrawer = null; stationLast = null; stationIncoming = '';
    } else if (putOn !== undefined && (cur.putOn || '') !== (putOn || '')) stationSetPutOn(putOn || '');
    STATION_WHO = p.name;
  }
  const signedToday = new Set();
  function shiftSignIn(code, p) {
    const k = code + '|' + p.name + '|' + dayOf(NOW); if (signedToday.has(k)) return; signedToday.add(k);
    const u = DB.user.find(x => x.viewProfileId === p.id); authLog('Sign in', 'Station ' + code, u);
  }

  /* =====================================================================
     Справочники цеха: компания, раскрой, тара, машины, люди, клиенты.
     ===================================================================== */
  const CITIES = {
    Vaughan: [43.837, -79.508], Toronto: [43.653, -79.383], Mississauga: [43.589, -79.644], Brampton: [43.731, -79.762], Markham: [43.856, -79.337],
    'Richmond Hill': [43.882, -79.440], Oakville: [43.467, -79.687], Burlington: [43.325, -79.799], Hamilton: [43.256, -79.869], Milton: [43.518, -79.877],
    Newmarket: [44.059, -79.461], Aurora: [44.006, -79.450], Barrie: [44.389, -79.690], Pickering: [43.838, -79.086], Ajax: [43.851, -79.020],
    Oshawa: [43.897, -78.865], Whitby: [43.897, -78.942], Guelph: [43.545, -80.248], Kitchener: [43.451, -80.492], Bolton: [43.875, -79.734],
    Stouffville: [43.970, -79.250], Etobicoke: [43.620, -79.514], Scarborough: [43.773, -79.257], 'North York': [43.761, -79.411], Woodbridge: [43.783, -79.599], Concord: [43.800, -79.483]
  };
  const STREETS = ['King St', 'Queen St', 'Main St', 'Industrial Pkwy', 'Steeles Ave', 'Highway 7', 'Dundas St', 'Lakeshore Rd', 'Yonge St', 'Bathurst St', 'Keele St', 'Jane St', 'Weston Rd', 'Rutherford Rd', 'Major Mackenzie Dr', 'Bloor St', 'Eglinton Ave', 'Finch Ave', 'Sheppard Ave', 'Rexdale Blvd', 'Courtland Ave', 'Applewood Cres', 'Edgeley Blvd', 'Millway Ave'];
  const FIRST = ['Mark', 'Lisa', 'John', 'Anna', 'Paul', 'Maria', 'Steve', 'Nina', 'Chris', 'Diana', 'Rob', 'Elena', 'Gary', 'Sofia', 'Brian', 'Tara', 'Kevin', 'Linda', 'Frank', 'Julia', 'Omar', 'Priya', 'Raj', 'Wei'];
  const LAST = ['Smith', 'Brown', 'Wilson', 'Taylor', 'Martin', 'Lee', 'Patel', 'Singh', 'Kowalski', 'Rossi', 'Nguyen', 'Campbell', 'Murray', 'Sousa', 'Chen', 'Walker', 'Fraser', 'Dubois'];
  const person = () => pick(FIRST) + ' ' + pick(LAST);
  const postal = () => 'L' + int(1, 9) + pick(['A', 'B', 'C', 'G', 'H', 'K']) + ' ' + int(1, 9) + pick(['A', 'E', 'J', 'M', 'R', 'T']) + int(1, 9);
  const addr = city => ({ address1: int(10, 9800) + ' ' + pick(STREETS), city, province: 'ON', postalCode: postal(), country: 'Canada' });

  /* Офис. Владелец, 11.10.2026: «владелец, 2–3 продажника, бухгалтер,
     оптимизатор, Shipping — с галочками разделов». */
  const OFFICE_PEOPLE = [
    ['Daniel Moroz', 'owner', ['sales', 'optimization', 'production', 'shipping', 'finance', 'customers', 'reports', 'masterdata', 'users', 'dashboard']],
    ['Kate Novak', 'sales', ['sales', 'customers', 'reports', 'dashboard']],
    ['Mike Ferreira', 'sales', ['sales', 'customers', 'dashboard']],
    ['Olena Bondar', 'sales', ['sales', 'customers', 'reports', 'dashboard']],
    ['Irina Petrova', 'accounting', ['sales', 'finance', 'customers', 'reports', 'dashboard']],
    ['Sergiy Lysenko', 'optimizer', ['sales', 'optimization', 'production', 'dashboard']],
    ['Tom Walsh', 'shipping', ['shipping', 'production', 'sales', 'dashboard']]
  ];
  /* Цех: станции, смена (D — 8:00–16:30, E — 14:00–22:00), скорость.
     POLISH — Andrei, Vasyl, Gennadiy; IGU — спейсер и Oleg (полисульфид,
     скиды и SHIPR для IGU) — со слов владельца. Остальные имена придуманы.
     rate: стёкол в час; у кромки — линейных дюймов в час; у печи — ft² в час. */
  const SHOP_PEOPLE = [
    ['Roman Hrytsenko', [['CUT', 'D', 34]]],
    ['Dmytro Savchuk', [['CUT', 'D', 30]], 0.55],
    ['Pavel Kuzmenko', [['CUT', 'E', 30]]],
    ['Yuri Melnyk', [['ARRIS', 'D', 46]]],
    ['Taras Boyko', [['ARRIS', 'E', 40]]],
    ['Andrei', [['POLISH', 'D', 1250]]],
    ['Vasyl', [['POLISH', 'D', 940]]],
    ['Gennadiy', [['POLISH', 'E', 1000]]],
    ['Ivan Tkachenko', [['BEVEL', 'D', 260], ['MITER', 'D', 200], ['SAND', 'D', 9]]],
    ['Bohdan Shevchuk', [['CNC', 'D', 7]]],
    ['Mykola Kravets', [['DRILL', 'D', 22]]],
    ['Lesia Hnatyuk', [['CERP', 'D', 10], ['PAINT', 'D', 10]]],
    ['Oleksandr Lytvyn', [['HEAT', 'D', 420]]],
    ['Petro Danyliuk', [['HEAT', 'E', 380]]],
    ['Artem Polishchuk', [['LAM', 'D', 9]]],
    ['Andrei K.', [['IGU', 'D', 17]]],
    ['Serhii Rudenko', [['IGU', 'E', 15]]],
    ['Oleg', [['SHIPR', 'D', 60]]],
    ['Nazar Bilyk', [['SHIPR', 'D', 50], ['SHIP', 'D', 30]]],
    ['Vlad Horbach', [['SHIP', 'D', 30]]],
    ['Ruslan Zinchenko', [['SHIP', 'D', 30]]],
    ['Stepan Koval', [['SHIP', 'D', 30]]]
  ];
  const DRIVERS = ['Vlad Horbach', 'Ruslan Zinchenko', 'Stepan Koval'];
  const REPS = ['Kate Novak', 'Mike Ferreira', 'Olena Bondar'];
  /* Доля выигранных квот у продажника (для квот). */
  const REP_WIN = { 'Kate Novak': 0.55, 'Mike Ferreira': 0.3, 'Olena Bondar': 0.45 };

  async function makePeople() {
    DB.user = [];
    const pin = () => String(int(1000, 9999)), pw = n => 'Sim-' + n.split(' ')[0].toLowerCase() + '-' + int(1000, 9999);
    let no = 1;
    for (const [name, role, access] of OFFICE_PEOPLE) {
      const password = pw(name), out = usersSaveNow({ name, office: true, access, password, no: String(no) });
      if (!out.ok) throw new Error('user ' + name + ': ' + out.error);
      people[name] = { id: out.id, name, no: no++, role, access, password };
    }
    for (const [name, jobs, presence] of SHOP_PEOPLE) {
      const p = pin(), out = usersSaveNow({ name, station: true, pin: p, no: String(no) });
      if (!out.ok) throw new Error('user ' + name + ': ' + out.error);
      people[name] = { id: out.id, name, no: no++, role: 'shop', pin: p, jobs: jobs.map(([station, shift, rate]) => ({ station, shift, rate })), presence: presence || 0.96 };
    }
  }

  /* Клиенты. Типы и доли — для смеси продукции: больше стеклопакетов,
     закалка и одинарное меньше, немного ламината и фигур (владелец). */
  const CUSTOMERS = [
    ['window', ['Northview Windows', 'Lakeshore Window & Door', 'Maple Leaf Fenestration', 'Royal Crest Windows', 'Pinewood Windows', 'TrueFrame Windows', 'Greenline Window Systems', 'Summit Window Works', 'Clearview Doors & Windows', 'Heritage Window Co']],
    ['contractor', ['Skyline Glazing', 'Metro Curtainwall', 'Harbourfront Glass & Metal', 'Apex Commercial Glazing', 'Bayview Architectural Glass', 'Granite City Glazing', 'Union Storefronts']],
    ['shower', ['Crystal Shower Doors', 'Aqua Glass Enclosures', 'Railpro Systems', 'Glassrail Ontario', 'Bath & Glass Studio', 'Vista Railings', 'Shoreline Shower Glass', 'Premier Glass Railings']],
    ['builder', ['Oakridge Homes', 'Kingsway Renovations', 'Stonegate Builders', 'Brickfield Construction', 'Ridgeway Contracting', 'Westbrook Renovations', 'Parkside Homes', 'Cedar Valley Builders']],
    ['retail', ['Mirror Image Interiors', 'Table Top Glass Shop', 'Downtown Furniture Gallery', 'Reflections Mirror Co', 'Fine Frames Gallery', 'Cityline Glass & Mirror', 'Home Decor Depot']]
  ];
  const TYPE_LABEL = { window: 'Window manufacturer', contractor: 'Glazing contractor', shower: 'Shower & railing', builder: 'Builder', retail: 'Retail' };
  const CUST = [];                 /* {id, name, type, weight, behaviour, ...} */
  function makeCustomers(day) {
    DB.customer = [];
    const cityList = Object.keys(CITIES).filter(c => c !== 'Vaughan' && c !== 'Concord');
    CUSTOMERS.forEach(([type, names]) => names.forEach((name, i) => {
      const city = pick(cityList.concat(['Vaughan', 'Concord', 'Toronto', 'Mississauga', 'Brampton']));
      const credit = type === 'window' || type === 'contractor' ? true : type === 'shower' ? chance(0.6) : type === 'builder' ? chance(0.35) : chance(0.1);
      const delivery = type === 'window' || type === 'contractor' ? chance(0.92) : type === 'shower' ? chance(0.5) : type === 'builder' ? chance(0.35) : chance(0.1);
      const big = type === 'window' ? [6, 5, 4, 4, 3, 3, 2, 2, 2, 1][i] : type === 'contractor' ? [4, 3, 3, 2, 2, 1, 1][i] : type === 'shower' ? [4, 3, 3, 2, 2, 2, 1, 1][i] : type === 'builder' ? [2, 2, 1.5, 1.5, 1, 1, 1, 0.8][i] : [1.5, 1.2, 1, 1, 0.8, 0.8, 0.6][i];
      const sites = [addr(city)].concat(Array.from({ length: type === 'contractor' || type === 'builder' ? int(1, 3) : int(0, 1) }, () => addr(pick(cityList))));
      const contacts = [{ name: person(), role: 'Purchasing', phone: '905-555-' + int(1000, 9999), email: 'orders@' + name.toLowerCase().replace(/[^a-z]+/g, '') + '.example', isPrimary: true, isInvoice: true }];
      if (chance(0.6)) contacts.push({ name: person(), role: 'Receiving', phone: '416-555-' + int(1000, 9999), isShipping: true });
      const draft = normalizeCustomer({
        id: customerUid('CUS'), code: nextCustomerCode(), legalName: name + (chance(0.5) ? ' Inc' : ' Ltd'), displayName: name, status: 'active', customerType: TYPE_LABEL[type],
        salesRep: REPS[(CUST.length + i) % 3], area: city, paymentMode: credit ? 'credit' : 'cash', creditDays: credit ? pick([30, 30, 30, 45, 60]) : null,
        creditLimit: credit ? Math.round((big * 45000 + 25000) * (0.8 + rnd() * 0.5) / 5000) * 5000 : null, poRequired: (type === 'contractor' && chance(0.7)) || (type === 'window' && chance(0.4)) || (type === 'builder' && chance(0.2)),
        defaultDeliveryMethod: delivery ? 'Delivery' : 'Pickup', currency: 'CAD', statementDelivery: 'email', invoiceEmail: contacts[0].email,
        contacts, addresses: [Object.assign({ type: 'billing', label: 'Head office', isDefault: true }, sites[0])].concat(sites.map((a, k) => Object.assign({ type: 'delivery', label: k ? 'Job site ' + k : 'Plant', isDefault: !k }, a))),
        createdAt: new Date(T(addDays(day, -int(30, 900)), 10)).toISOString(), accountOpenedAt: addDays(day, -int(30, 900))
      });
      draft.updatedAt = draft.createdAt;
      const out = storageCommand(() => { DB.customer.push(draft); normalizeCustomers(); return true; });
      if (!out.ok) throw new Error('customer ' + name);
      CUST.push({ id: draft.id, name, type, weight: big, credit, delivery, po: draft.poRequired, rep: draft.salesRep,
        /* как платит: вовремя, обычно, медленно, плохо (часть счетов висит) */
        pays: pickW([[50, 'punctual'], [30, 'normal'], [15, 'slow'], [5, 'bad']])[1],
        /* свои цены: скидка на стекло; полировка за $0 (владелец: «$ по прайсу Works, даже где клиенту дали $0») */
        discount: chance(0.18) ? pick([0.85, 0.88, 0.9]) : 1, polishFree: type === 'shower' && i < 3, sites: draft.addresses.filter(a => a.type === 'delivery') });
    }));
  }

  /* =====================================================================
     Продукция: стекло, makeup, строки.
     ===================================================================== */
  const IGU_WINDOW = [[40, 'double', [['4E272', 'HT-AN'], ['4CLEAR', 'HT-AN']]], [14, 'double', [['6E272', 'HT-AN'], ['6CLEAR', 'HT-AN']]], [10, 'double', [['6SBN60', 'HT-AN'], ['6CLEAR', 'HT-AN']]],
    [12, 'double', [['6Q272', 'HT-FT'], ['6CLEAR', 'HT-FT']]], [5, 'double', [['3E272', 'HT-AN'], ['3CLEAR', 'HT-AN']]], [8, 'triple', [['4E272', 'HT-AN'], ['4CLEAR', 'HT-AN'], ['4E272', 'HT-AN']]]];
  const IGU_COMM = [[40, 'double', [['6Q272', 'HT-FT'], ['6CLEAR', 'HT-FT']]], [25, 'double', [['6Q366', 'HT-FT'], ['6CLEAR', 'HT-FT']]], [15, 'double', [['6E366', 'HT-AN'], ['6CLEAR', 'HT-AN']]],
    [10, 'double', [['6SOLARGRAY', 'HT-FT'], ['6CLEAR', 'HT-FT']]], [5, 'triple', [['6Q272', 'HT-FT'], ['6CLEAR', 'HT-FT'], ['6Q272', 'HT-FT']]]];
  const IGU_HOME = [[50, 'double', [['6Q272', 'HT-FT'], ['6CLEAR', 'HT-FT']]], [35, 'double', [['4E272', 'HT-AN'], ['4CLEAR', 'HT-AN']]], [15, 'double', [['6E272', 'HT-AN'], ['6CLEAR', 'HT-AN']]]];
  const sz = (a, b) => r16(a + rnd() * (b - a));
  const szQ = (a, b) => Math.round((a + rnd() * (b - a)) * 8) / 8;
  /* Строка — что продажник ввёл: makeup (тип юнита и стёкла), размер, кол-во,
     кромка и работы. Всё это потом считает сам ERP. */
  function lineFor(c, kind) {
    const T_ = c.type;
    if (kind === 'igu') {
      const rec = pickW(T_ === 'contractor' ? IGU_COMM : T_ === 'window' ? IGU_WINDOW : IGU_HOME);
      const big = T_ === 'contractor';
      return { unit: rec[1], panes: rec[2].map(([code, ht]) => ({ code, ht })), w: big ? szQ(24, 60) : szQ(12, 46), h: big ? szQ(36, 96) : szQ(14, 72),
        qty: T_ === 'window' ? pickW([[38, 1], [28, 2], [15, 3], [10, 4], [6, 6], [3, 10]])[1] : pickW([[40, 1], [25, 2], [15, 3], [10, 4], [10, 6]])[1], mark: chance(0.4) ? pick(['Kitchen', 'Living', 'Bed 1', 'Bed 2', 'Bath', 'Entry', 'Patio', 'Lobby', 'Office', 'Unit 1204', 'Level 3', 'Stair']) : '' };
    }
    const r = rnd();
    if (kind === 'shower') {
      const lowIron = chance(0.3), mm = chance(0.8) ? 10 : 12, code = (lowIron ? mm + 'STARPHIRE' : mm + 'CLEAR');
      const sh = r < 0.12 ? 'notch' : '';
      return { unit: 'single', panes: [{ code, ht: 'HT-FT' }], w: szQ(22, 36), h: szQ(70, 79), qty: pickW([[60, 1], [25, 2], [15, 3]])[1], edge: 'polish', hinges: chance(0.6) ? 2 : 0, holes: chance(0.5) ? int(1, 2) : 0, shape: sh, sand: chance(0.12), mark: chance(0.5) ? pick(['Door', 'Panel', 'Return', 'Fixed']) : '' };
    }
    if (kind === 'railing') {
      if (chance(0.25)) return { unit: 'single', lam: { code: '6CLEAR', ht: 'HT-FT', inter: 'INT-SGP-CL' }, panes: [{ code: '6CLEAR', ht: 'HT-FT' }], w: szQ(30, 48), h: szQ(36, 42), qty: pickW([[30, 2], [30, 4], [20, 6], [20, 8]])[1], edge: 'polish', lamiPolish: true, holes: chance(0.5) ? 2 : 0 };
      return { unit: 'single', panes: [{ code: '12CLEAR', ht: 'HT-FT' }], w: szQ(30, 48), h: szQ(34, 42), qty: pickW([[30, 2], [30, 4], [20, 6], [20, 10]])[1], edge: 'polish', holes: chance(0.6) ? int(2, 4) : 0 };
    }
    if (kind === 'table') {
      const round = chance(0.45), mm = pick([6, 10, 10, 12]);
      if (round) { const d = szQ(24, 48); return { unit: 'single', panes: [{ code: mm + 'CLEAR', ht: 'HT-FT' }], w: d, h: d, qty: 1, shape: 'circle', edge: 'cnc' }; }
      return { unit: 'single', panes: [{ code: mm + 'CLEAR', ht: chance(0.7) ? 'HT-FT' : 'HT-AN' }], w: szQ(18, 48), h: szQ(30, 84), qty: pickW([[70, 1], [30, 2]])[1], edge: 'polish', radius: chance(0.3) };
    }
    if (kind === 'shelf') return { unit: 'single', panes: [{ code: pick(['6CLEAR', '6CLEAR', '10CLEAR', '6STARPHIRE']), ht: chance(0.5) ? 'HT-FT' : 'HT-AN' }], w: szQ(8, 16), h: szQ(20, 48), qty: pickW([[40, 1], [30, 2], [20, 4], [10, 6]])[1], edge: 'polish' };
    if (kind === 'mirror') return { unit: 'single', panes: [{ code: '6CLEAR', ht: 'HT-AN' }], w: szQ(18, 40), h: szQ(24, 60), qty: pickW([[70, 1], [30, 2]])[1], edge: 'bevel' };
    if (kind === 'case') return { unit: 'single', panes: [{ code: '10CLEAR', ht: 'HT-AN' }], w: szQ(12, 30), h: szQ(12, 40), qty: int(2, 5), edge: 'miter' };
    if (kind === 'door') return { unit: 'single', panes: [{ code: '6CLEAR', ht: 'HT-FT' }], w: szQ(20, 34), h: szQ(60, 80), qty: pickW([[60, 1], [40, 2]])[1], edge: 'polish', holes: chance(0.3) ? 2 : 0 };
    if (kind === 'spandrel') return { unit: 'single', spandrel: true, panes: [{ code: '6CLEAR', ht: 'HT-FT' }], w: szQ(24, 60), h: szQ(24, 48), qty: int(2, 8), edge: 'arris' };
    if (kind === 'frit') return { unit: 'single', frit: true, panes: [{ code: '6CLEAR', ht: 'HT-FT' }], w: szQ(24, 60), h: szQ(36, 84), qty: int(2, 6), edge: 'arris' };
    if (kind === 'security') return { unit: 'single', lam: { code: '5CLEAR', ht: 'HT-AN', inter: 'INT-EVA-CL' }, panes: [{ code: '5CLEAR', ht: 'HT-AN' }], w: szQ(18, 40), h: szQ(24, 60), qty: int(1, 4), edge: 'arris' };
    if (kind === 'raked') return { unit: 'double', panes: [{ code: '4E272', ht: 'HT-AN' }, { code: '4CLEAR', ht: 'HT-AN' }], w: szQ(24, 48), h: szQ(30, 60), qty: 1, shape: 'raked' };
    if (kind === 'annealed') return { unit: 'single', panes: [{ code: pick(['3CLEAR', '4CLEAR', '5CLEAR', '6CLEAR']), ht: 'HT-AN' }], w: szQ(10, 36), h: szQ(12, 48), qty: pickW([[50, 1], [30, 2], [20, 4]])[1], edge: 'arris' };
    if (kind === 'bar') return { unit: 'single', panes: [{ code: '19CLEAR', ht: 'HT-FT' }], w: szQ(14, 24), h: szQ(48, 96), qty: 1, edge: 'polish' };
    return null;
  }
  /* Состав заказа по типу клиента: какие строки и сколько. */
  function orderLines(c) {
    const out = [];
    if (c.type === 'window') {
      const n = pickW([[25, 2], [30, 3], [20, 4], [13, 6], [8, 9], [4, 12]])[1];
      for (let i = 0; i < n; i++) out.push(chance(0.03) ? lineFor(c, 'raked') : lineFor(c, 'igu'));
    } else if (c.type === 'contractor') {
      const n = int(2, 5);
      for (let i = 0; i < n; i++) out.push(pickW([[78, 'igu'], [8, 'spandrel'], [6, 'railing'], [3, 'frit'], [5, 'door']]).slice(1).map(k => lineFor(c, k))[0]);
    } else if (c.type === 'shower') {
      const n = int(1, 4), rail = /rail/i.test(c.name);
      for (let i = 0; i < n; i++) out.push(lineFor(c, rail ? (chance(0.85) ? 'railing' : 'shower') : (chance(0.85) ? 'shower' : 'railing')));
    } else if (c.type === 'builder') {
      const n = int(1, 4);
      for (let i = 0; i < n; i++) out.push(lineFor(c, pickW([[50, 'igu'], [20, 'door'], [10, 'mirror'], [10, 'annealed'], [5, 'security'], [5, 'shower']])[1]));
    } else {
      const n = int(1, 3);
      for (let i = 0; i < n; i++) out.push(lineFor(c, pickW([[35, 'table'], [25, 'shelf'], [20, 'mirror'], [8, 'annealed'], [5, 'case'], [4, 'shower'], [3, 'bar']])[1]));
    }
    return out.filter(Boolean);
  }

  /* Строка заказа в черновике ERP: makeup как в конфигураторе, форма строки,
     кромка и работы на её форме, цены — каталог; свои цены клиента —
     ставкой заказа (orderRate), как правит продажник в Services. */
  const OP = { polish: 'Flat Polish', arris: 'Rough Arris', cnc: 'CNC Shape Polish', bevel: 'Beveling', miter: 'Mitering' };
  function makeupOf(spec, idx) {
    const panes = spec.panes.map((p, i) => {
      const g = glassProductByCode(p.code), pn = salesDefaultPane(i);
      Object.assign(pn, { glassProductId: g.id, thicknessMm: g.thicknessMm, manufacturer: g.manufacturer, visionType: g.coatingFamily === 'lowe' ? 'lowe' : g.coatingFamily === 'reflective' ? 'reflective' : 'uncoated', heatTreatmentId: p.ht, heatSoak: false });
      if (pn.visionType !== 'uncoated') pn.coatingSurface = i === 0 ? 2 : (i * 2 + 1);
      if (spec.spandrel) { pn.category = 'spandrel'; pn.spandrel = Object.assign({}, pn.spandrel, { surface: 2 }); }
      if (spec.frit) { pn.visionType = 'frit'; pn.frit = Object.assign({}, pn.frit, { surface: 2 }); }
      if (spec.lam) {
        pn.category = 'laminated';
        ['outer', 'inner'].forEach(k => { const lg = glassProductByCode(spec.lam.code); Object.assign(pn.laminated[k], { glassProductId: lg.id, thicknessMm: lg.thicknessMm, manufacturer: lg.manufacturer, heatTreatmentId: spec.lam.ht }); });
        pn.laminated.interlayers = [normalizeSalesInterlayer({ productId: spec.lam.inter, layers: spec.lam.inter === 'INT-SGP-CL' ? 4 : 2 }, spec.lam.inter)];
      }
      return pn;
    });
    return normalizeOrderMakeup({ code: String.fromCharCode(65 + idx), unitType: spec.unit, panes }, idx);
  }
  function shapeLine(l, spec) {
    let s = salesEnsureLineShape(l);
    if (spec.shape === 'circle' || spec.shape === 'raked' || spec.shape === 'notch') {
      const def = newShapeDef(spec.shape === 'notch' ? 'notch-left' : spec.shape);
      def.name = (soDraft.businessNumber || 'SO') + ' · line ' + (soDraft.lines.indexOf(l) + 1); def.ownerLineId = l.id;
      def.w = salesDimFrom16(l.width16); def.h = salesDimFrom16(l.height16);
      if (spec.shape === 'raked') def.params = Object.assign({}, def.params, { leftH: salesDimFrom16(Math.round(l.height16 * 0.7)) });
      const saved = normalizeShapeDef(def); DB.shapeDef = DB.shapeDef.filter(x => x.id !== s.id); DB.shapeDef.push(saved);
      l.shapeRef = normalizeShapeRef({ id: saved.id, revision: saved.revision || 0 }); s = saved;
    }
    const r = ShapeModule.compute(s);
    if (!r || !r.valid) { fail('shape', spec.shape + ' invalid'); return s; }
    if (spec.edge) { s.edgeOps = {}; (r.edges || []).forEach(e => { s.edgeOps[e.id] = [shapeNormalizeOp({ type: OP[spec.edge], angle: 45, width: '1' })].concat(spec.lamiPolish ? [shapeNormalizeOp({ type: 'Lami Polish' })] : []); }); }
    const items = [];
    for (let i = 0; i < (spec.holes || 0); i++) items.push(shapeNormalizeManufacturingItem({ type: 'hole', x: 3 + i * 6, y: 3, diameter: pick(['1/2', '5/8', '1']) }));
    for (let i = 0; i < (spec.hinges || 0); i++) items.push(shapeNormalizeManufacturingItem({ type: 'hinge', edge: 'left', distance: i ? r16(+salesDimFrom16(l.height16) - 10) : 10 }));
    s.manufacturingItems = items;
    if (spec.sand) s.features = (s.features || []).concat([shapeNormalizeFeature({ type: 'sandblast', coverage: 'pattern', side: 'back' })]);
    if (spec.radius && s.type === 'rectangle') s.features = (s.features || []).concat((r.vertices || []).slice(0, 4).map(v => shapeNormalizeFeature({ type: 'radius', vertexId: v.id, radius: '1' })));
    s.revision = (+s.revision || 0) + 1; l.shapeRef = normalizeShapeRef({ id: s.id, revision: s.revision });
    return s;
  }
  /* Черновик → запись: тот же путь, что кнопка Save в Sales. */
  function draftOrder(c, specs, extra) {
    salesOrderNew(extra.kind === 'quote' ? 'quote' : 'order');
    const keyOf = s => JSON.stringify([s.unit, s.panes, s.lam || null, !!s.spandrel, !!s.frit]);
    const mus = new Map();
    specs.forEach(s => { const k = keyOf(s); if (!mus.has(k)) mus.set(k, makeupOf(s, mus.size)); });
    soDraft.makeups = [...mus.values()];
    soDraft.lines = specs.map(s => {
      const m = mus.get(keyOf(s)), l = normalizeSalesOrderLine({ makeupId: m.id, width16: Math.round(s.w * 16), height16: Math.round(s.h * 16), qty: s.qty, mark: s.mark || '' });
      return l;
    });
    soDraft.lines.forEach((l, i) => shapeLine(l, specs[i]));
    salesApplyCustomerDefaults(c.id);
    Object.assign(soDraft, { customerPo: extra.po || '', dueDate: extra.due || '', priority: extra.priority || 'normal', notes: extra.notes || '' });
    if (extra.delivery) soDraft.delivery = extra.delivery;
    /* Свои цены клиента: скидка на стекло — цена лайта; полировка за $0. */
    if (c.discount < 1) soDraft.makeups.forEach(m => m.panes.forEach(p => { const cat = salesPaneCatalogPrice(p); if (cat != null) p.priceOverride = round2(cat * c.discount); }));
    soDraft.lines.forEach(l => salesLineChargeRows(l).forEach(r => {
      const rec = salesEnsureChargePricing(l, r);
      if (c.polishFree && /flatPolish/.test(r.key)) rec.orderRate = 0;
      else if (r.catalogRate == null) rec.orderRate = /hole|MI:/.test(r.key) ? 8 : /SURCHARGE/.test(r.key) ? 1.25 : 0.25;
    }));
    if (!salesOrderSave()) throw new Error('order not saved');
    const id = soDraft.id; soDraft = null; soEdit = null; return id;
  }

  /* =====================================================================
     Что знает генератор о своём стекле (для truth и времени работы).
     ===================================================================== */
  const SPEC = new Map();     /* lineId → {spec, orderId} */
  const PIECE = new Map();    /* G-… → {o, l, key, idx, ply, mm, w, h, area, perim, ht, edge, holes} */
  function lineSpecs(id, specs) { const o = salesRecord(id); o.lines.forEach((l, i) => SPEC.set(l.id, { spec: specs[i], orderId: id })); }
  function pieceInfo(id) {
    let p = PIECE.get(id); if (p) return p;
    const h = glassLookup(id); if (!h || h.kind !== 'glass') return null;
    const o = salesRecord(h.orderId), l = o && o.lines.find(x => x.id === h.lineId); if (!l) return null;
    const c = glassBatchComponents(o, l).find(x => x.key === h.key); const sp = SPEC.get(l.id), spec = sp ? sp.spec : {};
    const g = c && glassProductById(c.glassId), mm = g ? g.thicknessMm : 6, w = l.width16 / 16, hh = l.height16 / 16;
    const circle = spec.shape === 'circle';
    /* Площадь фигуры — по её чертежу (геометрия, а не отчёт). */
    let area = w * hh / 144, perim = circle ? Math.PI * w : 2 * (w + hh);
    if (spec.shape) { try { const sh = salesShapeByRef(l.shapeRef), r = sh && ShapeModule.compute(sh); if (r && r.valid && r.area > 0) { area = r.area / 144; const len = (r.edges || []).reduce((n, e) => n + (+e.length || 0), 0); if (len > 0) perim = len; } } catch (e) {} }
    const pane = spec.panes ? spec.panes[c ? c.index : 0] || spec.panes[0] : { ht: 'HT-AN' };
    p = { o: h.orderId, l: h.lineId, key: h.key, unit: h.unit, idx: c ? c.index : 0, ply: c ? c.ply : '', glass: c ? c.glass : '', mm, w, h: hh, area, perim, ht: spec.lam ? spec.lam.ht : pane.ht,
      edge: spec.edge || (spec.unit === 'single' ? '' : 'arris'), lamiPolish: !!spec.lamiPolish, holes: (spec.holes || 0) + (spec.hinges || 0), igu: spec.unit !== 'single', shape: spec.shape || '' };
    PIECE.set(id, p); return p;
  }

  /* =====================================================================
     truth — свой счёт генератора, независимый от отчётов ERP.
     ===================================================================== */
  const TR = { cut: {}, cutBy: {}, edge: {}, temper: {}, igu: {}, iguBy: {}, ship: {}, trips: {}, breaks: {}, orders: {}, quotes: {}, receipts: {}, station: {}, lam: {} };
  const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };
  const band = mm => mm <= 6 ? '6' : mm <= 10 ? '8-10' : '12-19';
  const RATE = {};
  function rateOf(id, mm) { const k = id + '|' + band(mm); if (!(k in RATE)) { const r = (DB.serviceRate || []).find(x => x.id === id); RATE[k] = r ? (r.flat != null ? r.flat : r.bands && r.bands[band(mm)]) : null; } return RATE[k]; }
  function truthScan(station, ids, who, day) {
    const m = monthOf(day);
    ids.forEach(id => {
      const p = pieceInfo(id); if (!p) return;
      add(TR.station, station + '|' + m, 1);
      if (station === 'SHIPR') { (READYSET[p.o] = READYSET[p.o] || new Set()).add(p.key + '|' + p.unit); if (!(READYDAY[p.o] >= day)) READYDAY[p.o] = day; }
      if (station === 'CUT') { const k = m + '|' + p.mm; TR.cut[k] = TR.cut[k] || { n: 0, ft2: 0 }; TR.cut[k].n++; TR.cut[k].ft2 += p.area; add(TR.cutBy, who + '|' + m, 1); }
      if (station === 'HEAT') { const k = m + '|' + p.mm; TR.temper[k] = TR.temper[k] || { n: 0, ft2: 0 }; TR.temper[k].n++; TR.temper[k].ft2 += p.area; }
      const op = station === 'POLISH' ? (p.lamiPolish && p.polished ? 'Lami Polish' : 'Flat Polish') : station === 'ARRIS' ? 'Rough Arris' : station === 'BEVEL' ? 'Beveling 1' : station === 'MITER' ? 'Mitering 45°' : station === 'CNC' && p.edge === 'cnc' ? 'CNC Shape Polish' : '';
      if (op) {
        const rid = op === 'Flat Polish' ? 'flatPolish' : op === 'Rough Arris' ? 'roughArris' : op === 'Lami Polish' ? 'lamiPolish' : op === 'CNC Shape Polish' ? 'cncShapePolish' : op === 'Mitering 45°' ? 'miter45' : 'bevel:' + (p.mm <= 8 ? '3-8' : p.mm <= 15 ? '9-15' : '16-19');
        const inch = op === 'Lami Polish' ? p.perim / 2 : p.perim, rate = rateOf(rid, p.mm), k = who + '|' + op + '|' + p.mm + '|' + m + '|' + (p.ply ? 'lam' : '');
        TR.edge[k] = TR.edge[k] || { in: 0, usd: 0, n: 0 }; TR.edge[k].in += inch; TR.edge[k].usd += rate == null ? 0 : inch * rate; TR.edge[k].n++;
        if (station === 'POLISH') p.polished = true;
      }
    });
  }

  /* =====================================================================
     Тара: долли по направлению, скиды по заказу.
     ===================================================================== */
  const DOLLY = { free: [], load: new Map(), on: new Map() };   /* on: piece → code */
  const SKID = new Map();     /* code → {state, orderId, customerId, n, since} */
  const orderSkid = new Map();
  function carrierSetup() {
    carrierAdd('DL', 50); carrierAdd('DL', 30); carrierAdd('DA', 20);
    carrierAdd('SL', 50); carrierAdd('SL', 50); carrierAdd('SL', 30); carrierAdd('SA', 50); carrierAdd('SA', 50); carrierAdd('SA', 30);
    DB.carrier.forEach(c => { if (/^D/.test(c.code)) DOLLY.free.push(c.code); else SKID.set(c.code, { state: 'free', n: 0 }); });
  }
  const dollyFor = new Map();  /* станция|куда → долли */
  function takeDolly(station, next) {
    const k = station + '|' + next; let code = dollyFor.get(k);
    if (code && (DOLLY.load.get(code) || 0) < 28) return code;
    code = DOLLY.free.shift();
    if (!code) { cnt('no free dolly'); return ''; }
    dollyFor.set(k, code); DOLLY.load.set(code, 0); return code;
  }
  function dollyMove(pieces, to) {
    pieces.forEach(id => {
      const from = DOLLY.on.get(id);
      if (from) { const n = (DOLLY.load.get(from) || 1) - 1; DOLLY.load.set(from, n); if (n <= 0 && ![...dollyFor.values()].includes(from)) { DOLLY.load.delete(from); DOLLY.free.push(from); } DOLLY.on.delete(id); }
      if (to) { DOLLY.on.set(id, to); DOLLY.load.set(to, (DOLLY.load.get(to) || 0) + 1); }
    });
  }
  /* Освободить долли, которую станция «держит», когда на ней ничего нет. */
  function dollyRelease() { dollyFor.forEach((code, k) => { if (!(DOLLY.load.get(code) > 0)) { dollyFor.delete(k); DOLLY.load.delete(code); DOLLY.free.push(code); } }); }
  /* Скид — у большого заказа свой, мелкие заказы клиента — на общий
     (владелец, 6.10.2026: «в большом заказе никогда на скиде не будет микса»). */
  function skidForOrder(o, igu) {
    const small = (o.lines || []).reduce((n, l) => n + l.qty, 0) <= 6, owner = small ? 'C:' + o.customerId + (igu ? ':igu' : '') : o.id;
    let code = orderSkid.get(owner), s = code && SKID.get(code);
    if (s && s.state === 'filling' && s.n < (igu ? 26 : 18)) return code;
    for (const [c, x] of SKID) if (x.state === 'free' && (igu ? /^SA/ : /^SL/).test(c)) { Object.assign(x, { state: 'filling', orderId: o.id, customerId: o.customerId, n: 0 }); orderSkid.set(owner, c); return c; }
    for (const [c, x] of SKID) if (x.state === 'free') { Object.assign(x, { state: 'filling', orderId: o.id, customerId: o.customerId, n: 0 }); orderSkid.set(owner, c); return c; }
    cnt('no free skid'); return '';
  }

  /* =====================================================================
     Станции: очереди и смены.
     ===================================================================== */
  const Q = {};               /* станция → [item]; item {code, pieces, o, prio, due, avail, ord} */
  const STATIONS = () => DB.station.map(s => s.code);
  const ROSTER = {};          /* станция → [{p, shift, rate}] */
  let TODAY = null;           /* {day, on: Map(name → [from,to])} */
  function prioOf(o) { return o.priority === 'critical' ? 2 : o.priority === 'rush' ? 1 : 0; }
  function enqueue(station, item) { (Q[station] || (Q[station] = [])).push(item); }
  function queueAfter(recs, fromStation) {
    /* Куда дальше: по месту стекла в ERP (stationPlace). Стёкла одного
       скана (юнит, плиты ламината) едут вместе — один элемент очереди. */
    const groups = new Map();
    recs.forEach(r => {
      const g = stationGlass(r.piece); if (!g) return;
      const pl = stationPlace(g); if (pl.broken || pl.shipped || pl.assembling || !pl.waiting) return;
      const k = pl.waiting + '|' + (r.actionId || r.id);
      if (!groups.has(k)) groups.set(k, { station: pl.waiting, pieces: [], o: g.o });
      groups.get(k).pieces.push(r.piece);
    });
    groups.forEach(x => {
      const o = x.o, transfer = (fromStation === 'IGU' ? int(60, 150) : fromStation === 'HEAT' ? int(25, 60) : int(15, 45)) * 60000;
      enqueue(x.station, { code: x.pieces[0], pieces: x.pieces, o: o.id, prio: prioOf(o), due: o.dueDate || '9999', avail: NOW + transfer, ord: 0 });
    });
  }
  function holdOf(orderId) { const o = salesRecord(orderId); return !o || o.onHold || o.status === 'cancelled'; }
  /* Минут на элемент у этой станции. */
  function minutes(station, item, rate) {
    const p = pieceInfo(item.pieces[0]) || { area: 10, perim: 120, mm: 6, holes: 0 };
    const n = item.pieces.length;
    if (station === 'POLISH' || station === 'BEVEL' || station === 'MITER') return n * p.perim / (rate * (p.mm >= 12 ? 0.82 : p.mm >= 10 ? 0.92 : 1)) * 60;
    if (station === 'HEAT') return Math.max(0.6, n * p.area / rate * 60);
    if (station === 'DRILL') return 60 / rate + p.holes * 0.8;
    if (station === 'IGU') return 60 / rate;
    if (station === 'SHIPR') return 60 / rate;
    return n * 60 / rate;
  }
  /* Сломать стекло на станции: Recut с причиной этой станции. */
  const BREAK = { CUT: 0.006, ARRIS: 0.0045, POLISH: 0.009, BEVEL: 0.008, MITER: 0.009, CNC: 0.018, DRILL: 0.015, HEAT: 0.018, LAM: 0.012, IGU: 0.006, SHIPR: 0.003 };
  function breakHere(station, item, p) {
    const check = stationCheck(station, item.code); if (!check || check.kind !== 'ok') return false;
    const reasons = ncrReasonsFor(station, { activeOnly: true }); if (!reasons.length) return false;
    const reason = station === 'HEAT' ? pickW([[50, reasons.find(r => /Exploded/.test(r.name))], [25, reasons.find(r => /quench/.test(r.name))], [25, pick(reasons)]])[1] || pick(reasons) : pick(reasons);
    const out = stationBreak(station, check, { id: p.id, name: p.name }, reason.id);
    if (!out || out.error) { fail('recut ' + station, out && out.error); return false; }
    cnt('recut'); add(TR.breaks, station + '|' + reason.name + '|' + monthOf(dayOf(NOW)), out.broken.length);
    RECUT_ORDERS.add(check.g.o.id); touchOrder(check.g.o.id);
    dollyMove(out.broken, '');
    return true;
  }
  const RECUT_ORDERS = new Set();

  /* Одна станция за один тик: каждый рабочий в смене берёт работу. */
  function stationTick(station, t0, t1) {
    const crew = (ROSTER[station] || []).filter(x => { const w = TODAY.on.get(x.p.name); return w && w.some(([a, b]) => a < t1 && b > t0); });
    if (!crew.length) return;
    const q = Q[station]; if (!q || !q.length) return;
    q.sort((a, b) => b.prio - a.prio || a.ord - b.ord || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0) || a.avail - b.avail);
    const busy = new Set();
    crew.forEach(x => {
      const win = TODAY.on.get(x.p.name).find(([a, b]) => a < t1 && b > t0); let cur = Math.max(t0, win[0]); const end = Math.min(t1, win[1]);
      shiftSignIn(station, x.p);
      if (station === 'IGU') { iguWork(x, cur, end, busy); return; }
      if (station === 'LAM') { lamWork(x, cur, end, busy); return; }
      /* SHIPR: Oleg — юниты IGU, Nazar — остальное (и IGU, если Oleg нет). */
      const only = station === 'SHIPR' ? (x.p.name === 'Oleg' ? 'igu' : TODAY.on.has('Oleg') ? 'single' : '') : '';
      for (let i = 0; i < q.length && cur < end; i++) {
        const it = q[i]; if (busy.has(it) || it.avail > cur || holdOf(it.o)) continue;
        if (only) { const inf = pieceInfo(it.pieces[0]); if (inf && (only === 'igu') !== inf.igu) continue; }
        busy.add(it); cur += minutes(station, it, x.rate * CAP * (0.85 + rnd() * 0.3)) * 60000; at(Math.min(cur, end + 5 * 60000));
        doScan(station, x, it);
      }
    });
    Q[station] = q.filter(it => !busy.has(it));
  }
  function doScan(station, x, it) {
    const p = x.p, info = pieceInfo(it.pieces[0]);
    if (BREAK[station] && chance(BREAK[station])) { asStation(station, p); if (breakHere(station, it, p)) return; }
    let putOn;
    const puts = sfPutsOn(DB.station.find(s => s.code === station));
    const o = salesRecord(it.o);
    if (puts === 'dolly') {
      const g = stationGlass(it.pieces[0]), route = g ? stationRouteOf(g).codes : [], pl = g ? stationPlace(g) : null;
      const next = pl && route[route.indexOf(station, pl.far + 1) + 1] || 'SHIPR';
      putOn = takeDolly(station, next);
    } else if (puts === 'skid') putOn = skidForOrder(o, info && info.igu);
    asStation(station, p, putOn || '');
    const before = DB.stationScan.length;
    const kind = stationSubmit(it.code);
    const recs = DB.stationScan.slice(before).filter(r => !r.broken && !r.park && !r.undoneAt);
    if (!recs.length) { fail('scan ' + station, kind + ' ' + it.code); return; }
    cnt('scan'); touchOrder(it.o);
    const ids = recs.map(r => r.piece);
    truthScan(station, ids, p.name, dayOf(NOW));
    if (puts === 'dolly') dollyMove(ids, putOn); else dollyMove(ids, '');
    if (puts === 'skid' && putOn) { const s = SKID.get(putOn); if (s) s.n++; }
    if (station === 'SHIPR') { READY.add(it.o); return; }
    queueAfter(recs, station);
  }
  /* IGU: спейсер собирает юнит из лайтов одной позиции — по одному каждого. */
  function iguWork(x, cur, end, busy) {
    const q = Q.IGU, byLine = new Map();
    q.forEach(it => { if (busy.has(it) || it.avail > cur || holdOf(it.o)) return; const p = pieceInfo(it.code); if (!p) return; const k = p.o + '|' + p.l; if (!byLine.has(k)) byLine.set(k, new Map()); const m = byLine.get(k); if (!m.has(p.key)) m.set(p.key, []); m.get(p.key).push(it); });
    const lines = [...byLine.entries()].sort((a, b) => { const ia = [...a[1].values()][0][0], ib = [...b[1].values()][0][0]; return ib.prio - ia.prio || (ia.due < ib.due ? -1 : ia.due > ib.due ? 1 : 0); });
    for (const [k, keys] of lines) {
      const [oid, lid] = k.split('|'), o = salesRecord(oid), l = o.lines.find(z => z.id === lid), need = glassBatchComponents(o, l).filter(c => !c.missing).map(c => c.key);
      while (cur < end && need.every(key => (keys.get(key) || []).some(it => !busy.has(it)))) {
        const set = need.map(key => keys.get(key).find(it => !busy.has(it)));
        set.forEach(it => busy.add(it));
        cur += minutes('IGU', set[0], x.rate * CAP * (0.85 + rnd() * 0.3)) * 60000; at(cur);
        asStation('IGU', x.p, '');
        if (BREAK.IGU && chance(BREAK.IGU)) { if (breakHere('IGU', set[0], x.p)) { set.slice(1).forEach(it => busy.delete(it)); continue; } }
        const before = DB.stationScan.length;
        set.forEach((it, i) => { at(cur + i * 20000); stationSubmit(it.code); });
        const recs = DB.stationScan.slice(before).filter(r => !r.broken && !r.park && !r.undoneAt);
        cnt('scan', recs.length); touchOrder(oid);
        truthScan('IGU', recs.map(r => r.piece), x.p.name, dayOf(NOW));
        dollyMove(recs.map(r => r.piece), '');
        const done = recs.find(r => r.unit);
        if (!done) { fail('igu', 'unit not closed ' + set.map(it => it.code).join(',')); continue; }
        add(TR.igu, x.p.name + '|' + dayOf(NOW), 1); add(TR.iguBy, monthOf(dayOf(NOW)), 1);
        const ucode = unitIdAt(oid, lid, done.unit), all = DB.stationScan.filter(r => r.asm === done.asm && !r.undoneAt).map(r => r.piece);
        enqueue('SHIPR', { code: ucode || all[0], pieces: all, o: oid, prio: prioOf(o), due: o.dueDate || '9999', avail: cur + int(120, 180) * 60000 /* скиды сохнут 2–3 ч */, ord: 0 });
      }
      if (cur >= end) break;
    }
  }
  /* LAM: две плиты одного лайта склеиваются вместе. */
  function lamWork(x, cur, end, busy) {
    const q = Q.LAM, by = new Map();
    q.forEach(it => { if (busy.has(it) || it.avail > cur || holdOf(it.o)) return; const p = pieceInfo(it.code); if (!p) return; const k = p.o + '|' + p.l + '|' + p.idx + '|' + p.unit; if (!by.has(k)) by.set(k, []); by.get(k).push(it); });
    for (const [k, list] of by) {
      if (cur >= end) break;
      const plies = new Set(list.map(it => pieceInfo(it.code).ply)); if (!(plies.has('outer') && plies.has('inner'))) continue;
      const set = ['outer', 'inner'].map(ply => list.find(it => pieceInfo(it.code).ply === ply));
      set.forEach(it => busy.add(it));
      cur += minutes('LAM', set[0], x.rate * CAP) * 60000; at(cur); asStation('LAM', x.p, takeDolly('LAM', 'SHIPR'));
      const before = DB.stationScan.length; set.forEach(it => stationSubmit(it.code));
      const recs = DB.stationScan.slice(before).filter(r => !r.broken && !r.park && !r.undoneAt);
      cnt('scan', recs.length); touchOrder(set[0].o); truthScan('LAM', recs.map(r => r.piece), x.p.name, dayOf(NOW));
      dollyMove(recs.map(r => r.piece), stationSession() && stationSession().putOn || '');
      queueAfter(recs.slice(-1).map(r => Object.assign({}, r)), 'LAM');
    }
  }
  /* Recut пары на IGU разбирает сборку — такие стёкла в очереди найдём
     заново по месту ERP раз в день (resync). */
  function resyncQueues() {
    const known = new Set(); Object.values(Q).forEach(list => list.forEach(it => it.pieces.forEach(id => known.add(id))));
    stationWaiting().forEach((list, station) => {
      if (station === 'SHIP' || station === shippingStations().ship) return;
      list.forEach(x => { if (known.has(x.id)) return; if (station === 'CUT') return; const o = x.g.o; enqueue(station, { code: x.id, pieces: [x.id], o: o.id, prio: prioOf(o), due: o.dueDate || '9999', avail: NOW, ord: 0 }); known.add(x.id); cnt('resync'); });
    });
  }

  /* =====================================================================
     Офис: продажи, квоты, проверка, батчи, раскрой.
     ===================================================================== */
  const READY = new Set();     /* заказы, у которых что-то готово к отгрузке */
  const QUOTES = [];           /* {id, rep, decideOn, win} */
  let QUOTE_N = 0;
  const ORDERS = new Map();    /* id → {customer, created, glassDelay} */
  let BATCH_SEQ = 0;
  function newOrder(c, day, opts) {
    opts = opts || {};
    const specs = orderLines(c); if (!specs.length) return null;
    const anyTemp = specs.some(s => s.panes.some(p => p.ht !== 'HT-AN') || (s.lam && s.lam.ht !== 'HT-AN')), anyIgu = specs.some(s => s.unit !== 'single');
    const priority = opts.priority || pickW([[86, 'normal'], [11, 'rush'], [3, 'critical']])[1];
    const lead = priority === 'critical' ? 1 : priority === 'rush' ? int(2, 3) : anyIgu ? int(6, 10) : anyTemp ? int(4, 7) : int(3, 5);
    const due = addWork(day, lead);
    const po = c.po || chance(0.55) ? (c.type === 'contractor' ? 'J' : 'PO-') + int(10000, 99999) : '';
    const site = c.sites.length ? pick(c.sites) : null;
    const notes = chance(0.15) ? pick(['Call before delivery', 'Site has forklift', 'Label each unit by room', 'Rush if possible', 'Same as last order']) : '';
    const rep = people[c.rep]; asOffice(rep);
    const id = draftOrder(c, specs, { kind: opts.kind || 'order', po, due: opts.kind === 'quote' ? '' : due, priority, notes, delivery: c.delivery ? 'delivery' : 'pickup' });
    lineSpecs(id, specs); touchOrder(id);
    if (opts.kind !== 'quote') { ORDERS.set(id, { c, created: day, glassDelay: chance(0.04) ? addWork(day, int(2, 6)) : '', site }); ordInfo(id); }
    return id;
  }
  /* Квота → заказ: продажник жмёт Convert, срок и PO — в заказе. */
  function winQuote(q, day) {
    const rec = salesRecord(q.id); if (!rec || salesQuoteWonMember(rec)) return;
    asOffice(people[q.rep]); salesOrderEdit(q.id);
    salesConvertQuoteRecord(q.id);
    const won = salesRecord(salesRecord(q.id).wonOrderId); if (!won) { fail('quote', 'not converted'); soDraft = null; soEdit = null; return; }
    const c = CUST.find(x => x.id === won.customerId);
    salesOrderEdit(won.id);
    soDraft.dueDate = addWork(day, int(5, 10)); if (c.po || chance(0.6)) soDraft.customerPo = 'PO-' + int(10000, 99999);
    if (!salesOrderSave()) fail('quote', 'won order not saved');
    soDraft = null; soEdit = null;
    const src = salesRecord(q.id); src.lines.forEach((l, i) => { const s = SPEC.get(l.id); if (s) SPEC.set(won.lines[i].id, { spec: s.spec, orderId: won.id }); });
    ORDERS.set(won.id, { c, created: day, glassDelay: '', site: c.sites.length ? pick(c.sites) : null }); ordInfo(won.id);
    touchOrder(won.id); touchOrder(q.id); cnt('quote won');
    const k = q.rep + '|' + monthOf(q.created); TR.quotes[k] = TR.quotes[k] || { n: 0, won: 0 }; TR.quotes[k].won++;
  }
  function salesDay(day) {
    if (!workday(day)) return [];
    const m = +day.slice(5, 7), season = [0, 0.75, 0.8, 0.95, 1.05, 1.1, 1.1, 1.0, 1.05, 1.15, 1.15, 1.0, 0.8][m];
    const trend = 1 + 0.08 * ((T(day, 12) - T('2026-01-01', 12)) / (365 * 864e5));
    const nOrders = pois(17.5 * season * trend * SCALE), nQuotes = pois(6 * season * SCALE);
    const ev = [];
    for (let i = 0; i < nOrders; i++) ev.push([T(day, 8 + rnd() * 9), 'order']);
    for (let i = 0; i < nQuotes; i++) ev.push([T(day, 8.5 + rnd() * 8.5), 'quote']);
    return ev;
  }
  const pickCustomer = () => { let s = 0; CUST.forEach(c => s += c.weight); let r = rnd() * s; for (const c of CUST) { r -= c.weight; if (r <= 0) return c; } return CUST[0]; };
  function onOrder(day) {
    const c = pickCustomer();
    try { const id = newOrder(c, day); if (id) { cnt('order'); cashDeposit(id, day); } } catch (e) { fail('order', e); soDraft = null; soEdit = null; }
  }
  function onQuote(day) {
    const c = pickCustomer();
    try {
      const id = newOrder(c, day, { kind: 'quote' }); if (!id) return; cnt('quote');
      const rep = salesRecord(id) && c.rep, win = chance(REP_WIN[rep] || 0.4);
      QUOTE_N++; QUOTES.push({ id, rep, created: day, sendOn: addWork(day, chance(0.7) ? 0 : 1), decideOn: addWork(day, int(2, 25)), win, revise: chance(0.15) });
      const k = rep + '|' + monthOf(day); TR.quotes[k] = TR.quotes[k] || { n: 0, won: 0 }; TR.quotes[k].n++;
    } catch (e) { fail('quote', e); soDraft = null; soEdit = null; }
  }
  function quotesDay(day) {
    QUOTES.forEach(q => {
      if (q.sent || q.sendOn > day) return; q.sent = true; asOffice(people[q.rep]); salesQuoteMarkSent([q.id]); touchOrder(q.id);
      /* Ревизия: клиент просит поменять количество — новая R2. */
      if (q.revise) { salesOrderEdit(q.id); if (soDraft && salesIsQuote(soDraft)) { salesQuoteNewRevision(); if (soDraft) { soDraft.lines.forEach(l => { if (chance(0.5)) l.qty = Math.max(1, l.qty + pick([-1, 1, 2])); }); if (salesOrderSave()) { const rid = soDraft.id; touchOrder(rid); salesQuoteMarkSent([rid]); const src = salesRecord(q.id); salesRecord(rid).lines.forEach((l, i) => { const s = src.lines[i] && SPEC.get(src.lines[i].id); if (s) SPEC.set(l.id, s); }); q.id = rid; } } } soDraft = null; soEdit = null; }
    });
    for (let i = QUOTES.length - 1; i >= 0; i--) { const q = QUOTES[i]; if (q.decideOn > day || !q.sent) continue; QUOTES.splice(i, 1); if (q.win) winQuote(q, day); }
  }

  /* Оптимизатор: Verify, батчи по стеклу, раскрой. */
  function optimizerRun(day, main) {
    asOffice(people['Sergiy Lysenko']);
    /* Recut-стекло ждёт батча и у заказа, который уже Ready или частично отгружен. */
    const live = DB.salesOrder.filter(o => !salesIsQuote(o) && (['new', 'verified', 'batched'].includes(o.status) || ['ready', 'shipping'].includes(o.status) && (main || RECUT_ORDERS.has(o.id))));
    live.filter(o => o.status === 'new' && !o.onHold).forEach(o => {
      const info = ORDERS.get(o.id); if (info && T(info.created, 0) > NOW) return;
      const checks = salesTransitionChecks(o, 'verified');
      if (checks.some(c => c.block)) { cnt('verify blocked'); return; }
      if (checks.length && !chance(0.25)) { cnt('verify waits: ' + checks[0].title.replace(/ — .*| is .*/, '')); return; }
      if (salesSetRecordStatus(o.id, 'verified')) { touchOrder(o.id); cnt('verified'); } else fail('verify', o.businessNumber);
    });
    logCapture();
    /* Утром — батчи на день по каждому стеклу; после обеда — только срочное и Recut. */
    const ready = live.filter(o => (o.status !== 'new' || RECUT_ORDERS.has(o.id)) && !o.onHold && !(ORDERS.get(o.id) && ORDERS.get(o.id).glassDelay > day) && (main || o.priority !== 'normal' || RECUT_ORDERS.has(o.id)));
    const rows = [];
    ready.forEach(o => { if (o.status === 'verified') { const ch = salesTransitionChecks(o, 'batched'); if (ch.some(c => c.block) || (ch.length && !chance(0.5))) return; } glassPieceEnsure(o); glassBatchRows([o]).forEach(r => { if (!r.reason && r.cut && r.piece && !r.l.onHold) rows.push(r); }); });
    RECUT_ORDERS.clear();
    if (!rows.length) return;
    const groups = new Map(); rows.forEach(r => { if (!groups.has(r.glassId)) groups.set(r.glassId, []); groups.get(r.glassId).push(r); });
    [...groups.values()].forEach(g => {
      const b = glassBatchAssign(g, {});
      if (!b) { fail('batch', g[0].glass + ' ' + g.length); return; }
      cnt('batch'); g.forEach(r => touchOrder(r.orderId));
      let plan = null;
      const t0 = performance.now();
      try { plan = QUICK ? cutDrain(cutPlanSteps(b.number, null, true)) : cutPlanRun(b.number); } catch (e) { fail('cut', e); }
      SIM.cutMs = (SIM.cutMs || 0) + performance.now() - t0;
      if (plan && plan.error) fail('cut', plan.error);
      /* Порядок резки — лист за листом по раскрою. */
      const order = new Map(); let k = 0;
      const p = cutPlanFor(b.number); if (p) p.groups.forEach(gr => gr.sheets.forEach(s => s.pieces.forEach(x => order.set(x.piece, k++))));
      BATCH_SEQ++;
      glassBatchActiveItems(b).forEach(it => {
        const part = b.parts[it.part], o = salesRecord(part.orderId);
        pieceInfo(it.piece);
        enqueue('CUT', { code: it.piece, pieces: [it.piece], o: o.id, prio: prioOf(o), due: o.dueDate || '9999', avail: NOW + int(30, 90) * 60000, ord: BATCH_SEQ * 100000 + (order.has(it.piece) ? order.get(it.piece) : 99999) });
      });
    });
  }

  /* Hold, отмена, правки — изредка. */
  const HOLDS = [];
  function officeEvents(day) {
    const open = DB.salesOrder.filter(o => !salesIsQuote(o) && ['new', 'verified', 'batched', 'ready'].includes(o.status) && !o.onHold);
    open.forEach(o => {
      if (chance(0.004)) { const c = CUST.find(x => x.id === o.customerId); asOffice(people[c.rep]); salesHoldApply([o.id], pick(['Customer request', 'Waiting for site measure', 'Drawing to confirm', 'Payment', 'Site not ready'])); touchOrder(o.id); HOLDS.push({ id: o.id, until: addWork(day, int(1, 6)) }); cnt('hold'); }
      else if (o.status === 'new' && chance(0.006)) { const c = CUST.find(x => x.id === o.customerId); asOffice(people[c.rep]); if (salesSetRecordStatus(o.id, 'cancelled')) { touchOrder(o.id); ordInfo(o.id); cnt('cancelled'); } }
      else if (o.status === 'new' && chance(0.05)) {
        /* Правка строки до проверки: клиент поменял количество. */
        const c = CUST.find(x => x.id === o.customerId); asOffice(people[c.rep]); salesOrderEdit(o.id);
        if (soDraft) { const l = pick(soDraft.lines); l.qty = Math.max(1, l.qty + pick([-1, 1, 1, 2])); if (salesOrderSave()) { touchOrder(o.id); cnt('order edited'); } }
        soDraft = null; soEdit = null;
      }
    });
    for (let i = HOLDS.length - 1; i >= 0; i--) if (HOLDS[i].until <= day) { const o = salesRecord(HOLDS[i].id); if (o && o.onHold) { const c = CUST.find(x => x.id === o.customerId); asOffice(people[c.rep]); salesReleaseHold([o.id]); touchOrder(o.id); } HOLDS.splice(i, 1); }
  }

  /* =====================================================================
     Отгрузка: PS на завтра, машины, погрузка скидов, рейсы, самовывоз.
     ===================================================================== */
  const TRUCKS = [];
  const PICKUPS = [];          /* {ps, day, at} */
  const SKID_BACK = [];        /* {code, day} */
  function shipPlan(day) {
    if (!workday(day)) return;
    asOffice(people['Tom Walsh']);
    const next = addWork(day, 1), byCust = new Map();
    [...READY].forEach(id => {
      const o = salesRecord(id); if (!o || o.onHold || ['cancelled', 'closed', 'done'].includes(o.status)) { READY.delete(id); return; }
      const avail = shippingAvailable(o); if (!avail.length) return;
      const s = shippingSummary(o), total = s.glass || 1, sent = s.lines.reduce((n, r) => n + r.shipped, 0), readyAll = avail.length + sent >= total;
      const c = CUST.find(x => x.id === o.customerId), late = o.dueDate && o.dueDate <= next;
      const go = readyAll || (late && avail.length / Math.max(1, total - sent) >= 0.5) || (c.type !== 'window' && avail.length / Math.max(1, total - sent) >= 0.7 && chance(0.3));
      if (!go) return;
      if (shippingTransitionBlock(o)) { cnt('ship waits: PO'); return; }
      if (!byCust.has(o.customerId)) byCust.set(o.customerId, []);
      byCust.get(o.customerId).push({ o, avail });
    });
    const deliveries = [];
    byCust.forEach((list, cid) => {
      const c = CUST.find(x => x.id === cid), method = list[0].o.delivery === 'delivery' ? 'delivery' : 'pickup';
      const site = (ORDERS.get(list[0].o.id) || {}).site || c.sites[0];
      const items = list.flatMap(x => x.avail.map(shippingItem));
      /* У клиента уже есть открытый PS — добавить в него, а не второй. */
      const open = DB.shipment.find(x => x.status === 'planned' && x.customerId === cid && x.method === method);
      if (open) {
        const all = open.items.map(shippingItem).concat(items.filter(i => !open.items.some(j => j.orderId === i.orderId && j.lineId === i.lineId && j.unit === i.unit)));
        const up = shippingUpdate(open.id, { customerId: cid, method, shipTo: open.shipTo, date: open.date, items: all, extras: open.extras, note: open.note });
        if (!up.ok) fail('ps update', up.error); else { list.forEach(x => touchOrder(x.o.id)); cnt('ps updated'); }
        return;
      }
      const date = method === 'delivery' ? next : (chance(0.6) ? day : next);
      const made = shippingCreate({ customerId: cid, method, shipTo: method === 'delivery' ? Object.assign({ addressee: c.name }, site) : {}, date, items, extras: [], note: '' });
      if (!made.ok) { fail('ps', made.error); return; }
      list.forEach(x => touchOrder(x.o.id)); cnt('ps ' + method);
      if (method === 'delivery') deliveries.push(made.value);
      else PICKUPS.push({ ps: made.value.id, day: date === day ? day : addWork(day, chance(0.7) ? 1 : 2), at: 0 });
    });
    /* Машины: по направлению от цеха, до 7 остановок, ближайший сосед. */
    if (!deliveries.length) return;
    const home = CITIES.Vaughan, xy = s => CITIES[s.shipTo.city] || home, ang = s => Math.atan2(xy(s)[0] - home[0], xy(s)[1] - home[1]);
    deliveries.sort((a, b) => ang(a) - ang(b));
    const nTrucks = Math.min(3, Math.max(1, Math.ceil(deliveries.length / 7))), per = Math.ceil(deliveries.length / nTrucks);
    for (let t = 0; t < nTrucks; t++) {
      const list = deliveries.slice(t * per, (t + 1) * per); if (!list.length) continue;
      const route = []; let curXY = home; const left = list.slice();
      while (left.length) { left.sort((a, b) => dist(curXY, xy(a)) - dist(curXY, xy(b))); const s = left.shift(); route.push(s); curXY = xy(s); }
      const truck = TRUCKS[t], depart = pick(['07:15', '07:30', '07:45', '08:00']);
      route.forEach(s => { deliveryAssign(s.id, truck.id); deliverySetTime(s.id, depart); });
      deliverySetDriver(next, truck.id, people[DRIVERS[t]].id);
    }
  }
  function shippingTransitionBlock(o) { return salesTransitionChecks(o, 'done').some(c => c.block); }
  const dist = (a, b) => { const R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLon = (b[1] - a[1]) * Math.PI / 180, x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  /* Погрузка: водитель на станции отгрузки сканирует скиды своих PS. */
  function loadTrucks(day) {
    TRUCKS.forEach((truck, t) => {
      const stops = deliveryStops(day, truck.id).filter(s => s.status === 'planned'); if (!stops.length) return;
      const driver = people[DRIVERS[t]]; asStation(shippingStations().ship, driver, ''); shiftSignIn(shippingStations().ship, driver);
      stops.slice().reverse().forEach(s => loadPs(s, driver));
    });
  }
  function loadPs(s, who) {
    const st = shippingStations().ship, orders = shippingOrderIds(s), skids = new Set();
    s.items.forEach(i => { if (i.skid) skids.add(i.skid); });
    const cc = carrierContents();
    [...SKID].forEach(([code, x]) => { if (x.state === 'filling' && (orders.includes(x.orderId) || x.customerId === s.customerId) && (cc.get(code) || []).some(u => orders.includes(u.g.o.id))) skids.add(code); });
    asStation(st, who, '');
    skids.forEach(code => {
      at(NOW + int(2, 5) * 60000);
      const before = DB.stationScan.length, kind = stationSubmit(code), recs = DB.stationScan.slice(before).filter(r => r.station === st && !r.undoneAt);
      if (kind !== 'shipLoaded' && kind !== 'shipBack') fail('load', kind + ' ' + code);
      if (recs.length) { truthShip(who.name, recs); const x = SKID.get(code); if (x) Object.assign(x, { state: s.method === 'delivery' ? 'loaded' : 'free', n: 0, ps: s.id }); }
    });
    /* На скиде что-то осталось (не готово, другой PS) — он не свободен. */
    const left = carrierContents();
    skids.forEach(code => { const x = SKID.get(code), on = left.get(code) || []; if (x && on.length) Object.assign(x, { state: 'filling', n: on.length, orderId: on[0].g.o.id, customerId: on[0].g.o.customerId }); });
    /* Юниты без скида — по стикеру. */
    const st2 = shippingLoadState(salesShipmentFresh(s));
    st2.rest.forEach(u => { at(NOW + 40000); const before = DB.stationScan.length; stationSubmit(u.pieces[0]); const recs = DB.stationScan.slice(before).filter(r => r.station === st && !r.undoneAt); if (recs.length) truthShip(who.name, recs); });
  }
  const salesShipmentFresh = s => shippingFind(s.id) || s;
  /* Юнит физически: стеклопакет — сборка на IGU, ламинат — склейка плит, одинарное — само стекло. */
  function truthShip(name, recs) {
    const asmOf = id => { const a = DB.stationScan.find(x => x.piece === id && x.asm && (x.unit || x.joined) && !x.undoneAt); return a ? a.asm : id; };
    const units = new Set(recs.map(r => asmOf(r.piece)));
    const k = name + '|' + monthOf(dayOf(NOW)); TR.ship[k] = TR.ship[k] || { units: 0, glass: 0 }; TR.ship[k].units += units.size; TR.ship[k].glass += recs.length;
  }
  /* Не погруженное на станции офис подтверждает сам — SHIP-сканы от его имени. */
  function officeShip(id) { const s = shippingFind(id), ids = new Set(s && s.scanIds || []); const recs = DB.stationScan.filter(r => ids.has(r.id)); if (recs.length) { truthShip('Tom Walsh', recs); cnt('office ship scans', recs.length); } }
  function departAndDeliver(day) {
    asOffice(people['Tom Walsh']);
    TRUCKS.forEach((truck, t) => {
      const stops = deliveryStops(day, truck.id).filter(s => s.status === 'planned'); if (!stops.length) return;
      const [hh, mm] = (stops[0].departAt || '07:30').split(':').map(Number); at(T(day, hh, mm));
      stops.forEach(s => { const out = shippingMarkShipped(s.id, 'loaded'); if (!out.ok) { const again = shippingMarkShipped(s.id); if (!again.ok) fail('ship', again.error); else officeShip(s.id); } shippingOrderIds(s).forEach(touchOrder); });
      const key = day + '|' + truck.id; TR.trips[key] = { truck: truck.name, stops: stops.length, driver: DRIVERS[t], km: 0 };
    });
  }
  async function deliveredAndKm(day) {
    asOffice(people['Tom Walsh']); at(T(day, 15, int(30, 59)));
    for (const truck of TRUCKS) {
      const stops = deliveryStops(day, truck.id).filter(s => s.status === 'shipped'); if (!stops.length) continue;
      stops.forEach(s => {
        const c = CUST.find(x => x.id === s.customerId), out = shippingMarkDelivered(s.id, pick((salesFindCustomer(s.customerId).contacts || []).map(x => x.name).concat(['Site foreman', 'Receiving'])), day);
        if (!out.ok) fail('delivered', out.error); shippingOrderIds(s).forEach(id => { touchOrder(id); billed(id, day); });
        (s.skidsOut || []).forEach(code => { const x = SKID.get(code); if (x) Object.assign(x, { state: 'out', since: day }); SKID_BACK.push({ code, day: addWork(day, int(2, 12)) }); });
      });
      try { const r = await tripKmCalc(day, truck.id); const k = day + '|' + truck.id; if (TR.trips[k]) TR.trips[k].km = r.km; } catch (e) { fail('km', e); }
    }
  }
  function pickupsDay(day) {
    for (let i = PICKUPS.length - 1; i >= 0; i--) {
      const pu = PICKUPS[i]; if (pu.day > day) continue; PICKUPS.splice(i, 1);
      const s = shippingFind(pu.ps); if (!s || s.status !== 'planned') continue;
      at(T(day, 8.5 + rnd() * 7.5));
      const who = people[chance(0.6) ? 'Nazar Bilyk' : 'Stepan Koval'], st = shippingStations().ship; shiftSignIn(st, who);
      /* Cash-клиент платит остаток при выдаче. */
      shippingOrderIds(s).forEach(id => cashBalance(id, day, 'pickup'));
      loadPs(s, who);
      asOffice(people['Tom Walsh']);
      let out = shippingMarkShipped(s.id, 'loaded');
      if (!out.ok) { out = shippingMarkShipped(s.id); if (out.ok) officeShip(s.id); }
      /* Что-то в PS больше не готово (Recut, Hold) — офис пересобирает PS из
         готового и выдаёт; не вышло — отменяет, заказы вернутся в план. */
      if (!out.ok) {
        const items = shippingOrderIds(s).flatMap(id => shippingAvailable(salesRecord(id), s.id)).map(shippingItem);
        const up = items.length ? shippingUpdate(s.id, { customerId: s.customerId, method: s.method, shipTo: s.shipTo, date: s.date, items, extras: [], note: s.note }) : { ok: false };
        if (up.ok) { out = shippingMarkShipped(s.id); if (out.ok) officeShip(s.id); }
        if (!out.ok) { fail('pickup ship', out.error); shippingRevert(s.id, 'cancel'); shippingOrderIds(s).forEach(id => { READY.add(id); touchOrder(id); }); continue; }
        cnt('pickup repaired');
      }
      const c = salesFindCustomer(s.customerId), d = shippingMarkDelivered(s.id, person(), day); if (!d.ok) fail('pickup', d.error);
      shippingOrderIds(s).forEach(id => { touchOrder(id); billed(id, day); });
      cnt('pickup');
    }
  }
  /* Утром тара — по журналу ERP: на скиде есть юниты — занят; у клиента
     (skidsOut) — ждёт возврата; иначе свободен. */
  function resyncSkids(day) {
    const cc = carrierContents(), out = skidsOut();
    SKID.forEach((x, code) => {
      const on = cc.get(code) || [];
      if (on.length) { const o = on[0].g.o; Object.assign(x, { state: 'filling', n: new Set(on.map(u => u.g.l.id + '|' + u.g.unit)).size, orderId: o.id, customerId: o.customerId }); }
      else if (out.has(code)) { if (x.state !== 'out') { x.state = 'out'; } if (!SKID_BACK.some(b => b.code === code)) SKID_BACK.push({ code, day: addWork(day, int(1, 8)) }); }
      else if (x.state !== 'free') Object.assign(x, { state: 'free', n: 0, orderId: '', customerId: '' });
    });
    orderSkid.forEach((code, owner) => { const x = SKID.get(code); if (!x || x.state !== 'filling') orderSkid.delete(owner); });
  }
  function skidReturns(day) {
    for (let i = SKID_BACK.length - 1; i >= 0; i--) {
      const b = SKID_BACK[i]; if (b.day > day) continue; SKID_BACK.splice(i, 1);
      const who = people[pick(DRIVERS)], st = shippingStations().ship; at(T(day, 16, int(0, 40)));
      if ((carrierContents().get(b.code) || []).length) { cnt('skid back skipped: not empty'); continue; }
      asStation(st, who, ''); const kind = stationSubmit(b.code);
      if (kind !== 'shipBack') fail('skid back', kind + ' ' + b.code);
      const x = SKID.get(b.code); if (x) Object.assign(x, { state: 'free', n: 0, orderId: '', customerId: '' });
    }
  }
  /* Заглушка Google Directions: расстояние по координатам городов ×1.3
     и свои километры по городу; ERP считает и пишет рейс сам. */
  function googleStub() {
    const where = a => { const s = String(a || ''); for (const name of Object.keys(CITIES).sort((x, y) => y.length - x.length)) if (s.includes(name)) return CITIES[name]; return CITIES.Vaughan; };
    const local = a => { let h = 0; for (const ch of String(a)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 2 + (h % 60) / 10; };
    window.google = { maps: { DirectionsService: function () { this.route = (req, cb) => {
      const pts = [req.origin].concat(req.waypoints.map(w => w.location), [req.destination]), legs = [];
      for (let i = 1; i < pts.length; i++) legs.push({ distance: { value: Math.round((dist(where(pts[i - 1]), where(pts[i])) * 1.3 + local(pts[i])) * 1000) } });
      cb({ routes: [{ legs }] }, 'OK');
    }; } } };
  }

  /* =====================================================================
     Деньги: депозит cash-клиента, остаток при выдаче, счета Net.
     ===================================================================== */
  const PAY = [];              /* {day, orderId, customerId} */
  const PAID = {}, DUE = {}, SHIPPED = {}, TOTAL = {};   /* свой счёт: оплачено, срок, день полной выдачи, сумма */
  const READYDAY = {}, READYSET = {};                   /* самовывоз: день последнего скана SHIPR и какие стёкла (позиция|номер) прошли */
  const ORDINFO = {};          /* id → {c: клиент, due, cancelled} — для сроков в конце */
  const ordInfo = id => { const o = salesRecord(id); if (o && !salesIsQuote(o)) ORDINFO[id] = { c: salesCustomerDisplay(o.customerId), due: o.dueDate || '', cancelled: o.status === 'cancelled', pickup: o.delivery === 'pickup', glass: (o.lines || []).reduce((n, l) => n + glassBatchComponents(o, l).length * (+l.qty || 1), 0) }; };
  /* Срок: доставка — день, когда клиент получил последний юнит; самовывоз —
     день, когда всё стекло прошло SHIPR (владелец, 11.10.2026: клиент может
     забрать и через месяц — срок цеха, когда готово). */
  const ordState = (id, x, end) => {
    const ready = x.pickup && READYSET[id] && READYSET[id].size >= x.glass ? READYDAY[id] : '', fin = x.pickup ? ready : SHIPPED[id] || '';
    return fin ? (fin <= x.due ? 'On time' : 'Late') : (x.due < end ? 'Late' : 'Open');
  };
  function receipt(customerId, day, allocs, method, note) {
    asOffice(people['Irina Petrova']);
    const amount = round2(allocs.reduce((n, a) => n + a.amount, 0)); if (!(amount > 0)) return;
    const d = { customerId, date: day, method, reference: method === 'cheque' ? String(int(1000, 99999)) : method === 'etransfer' ? 'ET' + int(100000, 999999) : '', note: note || '', amount, allocations: allocs, currency: 'CAD' };
    const out = finPersist(() => finSaveReceiptRecord(d, '', '', true));
    if (!out.ok) { fail('receipt', out.error); return; }
    allocs.forEach(a => { touchOrder(a.orderId); PAID[a.orderId] = round2((PAID[a.orderId] || 0) + a.amount); }); add(TR.receipts, monthOf(day), amount); cnt('receipt');
  }
  function cashDeposit(id, day) {
    const o = salesRecord(id), c = CUST.find(x => x.id === o.customerId); if (c.credit) return;
    const b = finOrderBalance(o); if (b.total == null) return;
    const pct = paymentDepositPercent(finTermsFor(o)), dep = round2(b.total * pct / 100);
    if (dep > 0 && chance(0.93)) PAY.push({ day: chance(0.6) ? day : addWork(day, 1), orderId: id, customerId: o.customerId, amount: dep, method: pick(['etransfer', 'creditcard', 'cheque', 'debit']), note: 'Deposit' });
  }
  function cashBalance(id, day, how) {
    const o = salesRecord(id), c = CUST.find(x => x.id === o.customerId); if (!o || c.credit) return;
    const b = finOrderBalance(o); if (!(b.balance > 0)) return;
    receipt(o.customerId, day, [{ orderId: id, amount: b.balance }], how === 'pickup' ? pick(['debit', 'creditcard', 'cash']) : 'cheque', 'Balance at ' + how);
  }
  /* Отгружено полностью — счёт (дата выдачи); Net-клиент платит по привычке. */
  const BILLED = new Set();
  function billed(id, day) {
    const o = salesRecord(id); if (!o || BILLED.has(id) || !finShipped(o)) return; BILLED.add(id);
    const c = CUST.find(x => x.id === o.customerId);
    SHIPPED[id] = day; const tot = finOrderTotals(o); TOTAL[id] = tot && tot.complete ? tot.grand : null; DUE[id] = c.credit ? addDays(day, salesFindCustomer(o.customerId).creditDays || 30) : day;
    if (!c.credit) { if (o.delivery === 'delivery') PAY.push({ day: addWork(day, int(0, 3)), orderId: id, customerId: o.customerId, balance: true, method: 'cheque', note: 'Balance on delivery' }); return; }
    const due = finPaymentDue(o) || addDays(day, 30);
    let payDay = c.pays === 'punctual' ? addDays(due, -int(0, 7)) : c.pays === 'normal' ? addDays(due, int(-3, 10)) : c.pays === 'slow' ? addDays(due, int(5, 45)) : (chance(0.4) ? null : addDays(due, int(20, 90)));
    if (payDay && payDay < day) payDay = day;
    if (payDay) PAY.push({ day: payDay, orderId: id, customerId: o.customerId, balance: true, method: pick(['cheque', 'cheque', 'etransfer', 'eft']), note: '' });
  }
  function paymentsDay(day) {
    if (!workday(day)) return;
    const due = PAY.filter(p => p.day <= day); if (!due.length) return;
    for (let i = PAY.length - 1; i >= 0; i--) if (PAY[i].day <= day) PAY.splice(i, 1);
    /* Один чек на все счета клиента в этот день. */
    const by = new Map(); due.forEach(p => { const k = p.customerId + '|' + p.method + '|' + p.note; if (!by.has(k)) by.set(k, []); by.get(k).push(p); });
    by.forEach(list => {
      const allocs = list.map(p => { const o = salesRecord(p.orderId); if (!o || !finOrderCounts(o)) return null; const b = finOrderBalance(o); const amount = p.balance ? b.balance : Math.min(p.amount, b.balance); return amount > 0 ? { orderId: p.orderId, amount: round2(amount) } : null; }).filter(Boolean);
      if (allocs.length) receipt(list[0].customerId, day, allocs, list[0].method === 'eft' ? 'etransfer' : list[0].method, list[0].note);
    });
  }

  /* NCR: клиент сообщил о брaке после доставки — переделка без оплаты. */
  function ncrDay(day) {
    if (!workday(day) || !chance(0.35 * SCALE)) return;
    const done = DB.salesOrder.filter(o => !salesIsQuote(o) && ['done', 'closed'].includes(o.status) && !o.remakeNcrId && o.statusDates && o.statusDates.done && dayOf(Date.parse(o.statusDates.done)) >= addDays(day, -5));
    if (!done.length) return;
    const o = pick(done), l = pick(o.lines), c = CUST.find(x => x.id === o.customerId);
    asOffice(people[c.rep]);
    const where = chance(0.6) ? 'SHIP' : NCR_OFFICE, reasons = ncrReasonsFor(where, { activeOnly: true }), reason = pick(reasons.filter(r => where !== 'SHIP' || /transit|install|Broke|Spontaneous/.test(r.name)).concat(reasons).slice(0, 4));
    const out = ncrCreate({ orderId: o.id, source: 'Customer claim', where, reasonId: reason.id, action: 'Remake order', note: 'Customer called', lines: { [l.id]: { on: true, qty: 1, which: 'unit' } } });
    if (out.error) { fail('ncr', out.error); return; }
    cnt('ncr'); add(TR.breaks, 'NCR ' + where + '|' + reason.name + '|' + monthOf(day), glassBatchComponents(o, l).filter(c => !c.missing).length);
    const rid = out.ncr.remakeOrderId, r = salesRecord(rid);
    if (r) { r.lines.forEach((nl, i) => { const s = SPEC.get(l.id); if (s) SPEC.set(nl.id, { spec: s.spec, orderId: rid }); }); salesOrderEdit(rid); soDraft.dueDate = addWork(day, 4); soDraft.priority = 'rush'; salesOrderSave(); soDraft = null; soEdit = null; ORDERS.set(rid, { c, created: day, glassDelay: '', site: (ORDERS.get(o.id) || {}).site }); ordInfo(rid); touchOrder(rid); }
  }

  /* =====================================================================
     Архив: готовое старое уходит из DB, в конце возвращается.
     ===================================================================== */
  const ARCH = { glassPiece: [], glassUnitId: [], stationScan: [], productionRoute: [], glassBatch: [], cutPlan: [], shipment: [], salesOrder: [], shapeDef: [], financeTerms: [], orderEvent: [] };
  const ARCHIVED = new Set();
  function archive(day) {
    const old = addDays(day, -10), gone = new Set();
    DB.salesOrder.forEach(o => {
      if (ARCHIVED.has(o.id) || salesIsQuote(o)) return;
      const fin = o.status === 'cancelled' || (['done', 'closed'].includes(o.status) && o.statusDates && o.statusDates.done && dayOf(Date.parse(o.statusDates.done)) <= old);
      if (!fin) return;
      if (shippingForOrder(o.id).some(s => s.status === 'planned' || s.status === 'shipped')) return;
      gone.add(o.id);
    });
    if (!gone.size) return;
    const of = key => key.split('|')[0], pieces = new Set();
    const keep = (k, test) => { const a = [], b = []; DB[k].forEach(x => (test(x) ? b : a).push(x)); DB[k] = a; if (b.length) ARCH[k].push(b.map(x => JSON.stringify(x)).join(',')); return b; };
    keep('glassPiece', r => gone.has(of(r.key))).forEach(r => { r.ids.forEach(id => id && pieces.add(id)); Object.values(r.extra || {}).forEach(list => list.forEach(id => id && pieces.add(id))); });
    keep('glassUnitId', r => gone.has(of(r.key)));
    keep('productionRoute', r => gone.has(of(r.key)));
    keep('stationScan', s => pieces.has(s.piece));
    pieces.forEach(id => { PIECE.delete(id); DOLLY.on.delete(id); });
    gone.forEach(id => { ARCHIVED.add(id); const o = salesRecord(id); if (o) o.lines.forEach(l => SPEC.delete(l.id)); orderSkid.delete(id); logBase.delete(id); });
    const batches = keep('glassBatch', b => b.parts.every(p => ARCHIVED.has(p.orderId) || b.items.filter(i => b.parts[i.part] === p).every(i => i.releasedAt)));
    const bn = new Set(batches.map(b => b.number));
    keep('cutPlan', p => bn.has(p.batch));
    const out = new Set([...SKID].filter(([c, x]) => x.state === 'out' || x.state === 'loaded').map(([c]) => c));
    keep('shipment', s => (s.status === 'delivered' || s.status === 'cancelled') && shippingOrderIds(s).every(id => ARCHIVED.has(id)) && !(s.skidsOut || []).some(c => out.has(c)));
    archiveOrders(day, keep);
    storageInvalidate();
  }
  /* Сами заказы: сохранение заказа в ERP заново нормализует ВСЕ заказы
     базы (normalizeSalesData), на 14 месяцах это секунды на каждый Save.
     Уходят старые: отгружен 3+ недели назад и оплачен, отменён, квота без
     ответа 6+ недель; с ними — их формы, условия оплаты и журнал. Свежие
     номера всегда в базе — номер следующего заказа считается по ним. */
  const ORD_ARCH = new Set();
  function archiveOrders(day, keep) {
    const old = addDays(day, -21), quoteOld = addDays(day, -45), newest = new Set(DB.salesOrder.slice(-60).map(o => o.id)), go = new Set();
    const busy = new Set(QUOTES.map(q => q.id)); PAY.forEach(p => busy.add(p.orderId)); HOLDS.forEach(h => busy.add(h.id));
    DB.salesOrder.forEach(o => {
      if (newest.has(o.id) || busy.has(o.id)) return;
      if (salesIsQuote(o)) { if (dayOf(Date.parse(o.createdAt)) <= quoteOld && !(o.wonOrderId && !ORD_ARCH.has(o.wonOrderId) && !ARCHIVED.has(o.wonOrderId))) go.add(o.id); return; }
      if (!ARCHIVED.has(o.id)) return;
      if (o.status !== 'cancelled' && !(dayOf(Date.parse(o.statusDates && o.statusDates.done || o.updatedAt)) <= old && !(finOrderBalance(o).balance > 0))) return;
      if ((DB.ncr || []).some(n => n.orderId === o.id && n.remakeOrderId && !ORD_ARCH.has(n.remakeOrderId))) return;
      go.add(o.id);
    });
    if (!go.size) return;
    const lines = new Set(), shapes = new Set();
    DB.salesOrder.forEach(o => { if (!go.has(o.id)) return; o.lines.forEach(l => { lines.add(l.id); if (l.shapeRef && l.shapeRef.id) shapes.add(l.shapeRef.id); Object.values(l.liteShapes || {}).forEach(r => r && r.id && shapes.add(r.id)); }); });
    keep('salesOrder', o => go.has(o.id));
    keep('shapeDef', x => x && (shapes.has(x.id) || (x.ownerLineId && lines.has(x.ownerLineId))));
    keep('financeTerms', t => go.has(t.orderId));
    keep('orderEvent', e => go.has(e.orderId));
    go.forEach(id => { ORD_ARCH.add(id); logBase.delete(id); ORDERS.delete(id); READY.delete(id); BILLED.delete(id); });
    cnt('orders archived', go.size);
  }
  /* Бухгалтер закрывает оплаченные отгруженные заказы раз в неделю. */
  function closePaid(day) {
    asOffice(people['Irina Petrova']);
    DB.salesOrder.forEach(o => {
      if (salesIsQuote(o) || o.status !== 'done' || finOrderBalance(o).balance > 0) return;
      if (salesSetRecordStatus(o.id, 'closed')) { touchOrder(o.id); cnt('closed'); }
    });
  }
  /* Архив хранится строками JSON — так он втрое меньше в памяти. */
  function unarchive() {
    Object.keys(ARCH).forEach(k => { const parts = []; while (ARCH[k].length) parts.push(JSON.parse('[' + ARCH[k].shift() + ']')); DB[k] = [].concat(...parts, DB[k]); });
    DB.stationScan.sort((a, b) => +a.id.slice(3) - +b.id.slice(3));
    DB.glassBatch.sort((a, b) => a.number.localeCompare(b.number));
    DB.shipment.sort((a, b) => a.number.localeCompare(b.number));
    DB.orderEvent.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    storageInvalidate();
  }
  /* Размер базы, как у Export JSON, — живое плюс архив. */
  function sizeNow() {
    let n = JSON.stringify(DB).length; const by = {};
    Object.keys(ARCH).forEach(k => { let s = 0; ARCH[k].forEach(chunk => { s += chunk.length + 1; }); by[k] = s; n += s; });
    const live = {}; ['salesOrder', 'glassBatch', 'cutPlan', 'stationScan', 'shapeDef', 'shipment', 'orderEvent', 'glassPiece', 'productionRoute', 'receipt', 'financeEvent'].forEach(k => { live[k] = JSON.stringify(DB[k] || []).length + (by[k] || 0); });
    return { total: n, by: live };
  }

  /* =====================================================================
     День.
     ===================================================================== */
  /* Малый цех — и людей меньше: скорость станций в той же доле, что объём. */
  let SCALE = 1, QUICK = false, CAP = 1;
  SIM.setup = async function (opt) {
    RS = (opt.seed >>> 0) || 1; SCALE = opt.scale || 1; QUICK = !!opt.quickCut; CAP = SCALE < 1 ? Math.max(SCALE * 1.3, 0.1) : 1;
    storageOff(); googleStub();
    const start = opt.start; at(T(addDays(start, -3), 9));
    DB.company = Object.assign({}, DB.company, { address1: '200 Shop Rd', city: 'Vaughan', province: 'ON', postalCode: 'L4K 2Z9', phone: '905-555-0100', email: 'office@example.com' });
    /* Раскрой как у владельца (выгрузка 05.10.2026): лист 144 × 102, отступы по толщине. */
    DB.cutting = Object.assign({}, DB.cutting, { v: 2, rows: [[3, .5, .75, .5, .75, .5], [4, .5, .75, .5, .75, .5], [5, .625, .75, .625, .75, .625], [6, .75, .875, .75, .875, .75], [8, .875, 1, .875, 1, .875], [10, 1, 1.25, 1, 1.25, 1], [12, 1.25, 1.5, 1.25, 1.5, 1.25], [15, 0, 0, 3, 3, 3], [19, 0, 0, 4, 4, 4]].map(([mm, trimMin, trim, borderMin, border, minDist]) => ({ mm, trimMin, trim, borderMin, border, minDist })),
      sheets: [], sizes: [{ key: '144x102', w: 144, h: 102 }], minOffcutW: 40, minOffcutH: 40, minOffcutFt2: 10, rotate: true });
    normalizeCutting();
    carrierSetup();
    ['Truck 1 · Isuzu NPR', 'Truck 2 · Hino 195', 'Truck 3 · Ford F-550'].forEach(n => { const out = truckAdd(n); TRUCKS.push(out.value); });
    await makePeople();
    makeCustomers(start);
    Object.values(people).forEach(p => (p.jobs || []).forEach(j => (ROSTER[j.station] || (ROSTER[j.station] = [])).push({ p, shift: j.shift, rate: j.rate })));
    /* Nazar на SHIP — только самовывоз, SHIPR — до обеда, не IGU. */
    return { users: DB.user.length, customers: DB.customer.length };
  };
  SIM.people = () => Object.values(people).map(p => ({ name: p.name, no: p.no, role: p.role, access: p.access || [], password: p.password || '', pin: p.pin || '', stations: (p.jobs || []).map(j => j.station + ' ' + j.shift) }));
  SIM.customers = () => CUST.map(c => ({ name: c.name, type: c.type, rep: c.rep, credit: c.credit, delivery: c.delivery, poRequired: c.po, pays: c.pays, discount: c.discount, polishFree: c.polishFree }));

  /* Смены дня: кто вышел и когда. Вечерняя иногда до полуночи и позже. */
  function roster(day) {
    const on = new Map(), w = wday(day), sat = w === 6 && !HOLIDAYS.has(day);
    const satWork = sat && chance(0.3), busy = (Q.CUT || []).length > 260;
    Object.values(people).forEach(p => {
      if (!p.jobs) return;
      if (!workday(day) && !satWork) return;
      if (!chance(p.presence)) return;
      const spans = [];
      p.jobs.forEach(j => {
        if (satWork && !['CUT', 'ARRIS', 'HEAT', 'IGU', 'POLISH'].includes(j.station)) return;
        if (satWork && j.shift === 'E') return;
        if (j.shift === 'D') spans.push([T(day, 8, int(-10, 5)), T(day, satWork ? 13 : 16.5, int(-5, 20))]);
        else { const late = busy && chance(0.5) ? int(60, 150) : chance(0.08) ? int(30, 120) : int(-10, 15); spans.push([T(day, 14, int(-5, 5)), T(day, 22, late)]); }
      });
      if (spans.length) on.set(p.name, [[Math.min(...spans.map(s => s[0])), Math.max(...spans.map(s => s[1]))]]);
    });
    return { day, on };
  }
  SIM.day = async function (day, until) {
    const t0 = performance.now(), n0 = Object.assign({}, SIM.n);
    TODAY = roster(day); signedToday.clear();
    if (workday(day)) { at(T(day, 6, 0)); resyncSkids(day); }
    const ev = [];
    if (workday(day)) {
      ev.push([T(day, 6, 40), 'load'], [T(day, 7, 50), 'depart'], [T(day, 7, 40), 'optimizer'], [T(day, 13, 30), 'optimizer2'], [T(day, 10, 15), 'payments'], [T(day, 11, 0), 'office'], [T(day, 11, 30), 'quotes'],
        [T(day, 14, 30), 'shipPlan'], [T(day, 15, 30), 'delivered'], [T(day, 16, 5), 'skids'], [T(day, 8, 20), 'pickups'], [T(day, 15, 45), 'pickups'], [T(day, 15, 0), 'ncr']);
      if (wday(day) === 5) ev.push([T(day, 16, 20), 'close']);
      salesDay(day).forEach(e => ev.push(e));
    }
    for (let m = 6 * 60; m < 27 * 60; m += 15) ev.push([T(day, 0, m), 'tick']);
    ev.sort((a, b) => a[0] - b[0]);
    if (until) { const stop = T(day, until); for (let i = ev.length - 1; i >= 0; i--) if (ev[i][0] >= stop) ev.splice(i, 1); }
    for (const [t, kind] of ev) {
      at(t); const pt = performance.now();
      try {
        if (kind === 'tick') { if (TODAY.on.size) { STATIONS().forEach(s => { if (s !== 'SHIP') stationTick(s, t, t + 15 * 60000); }); at(t); } }
        else if (kind === 'order') onOrder(day);
        else if (kind === 'quote') onQuote(day);
        else if (kind === 'optimizer') optimizerRun(day, true);
        else if (kind === 'optimizer2') optimizerRun(day, false);
        else if (kind === 'office') officeEvents(day);
        else if (kind === 'quotes') quotesDay(day);
        else if (kind === 'payments') paymentsDay(day);
        else if (kind === 'shipPlan') shipPlan(day);
        else if (kind === 'load') loadTrucks(day);
        else if (kind === 'depart') departAndDeliver(day);
        else if (kind === 'delivered') await deliveredAndKm(day);
        else if (kind === 'pickups') pickupsDay(day);
        else if (kind === 'skids') skidReturns(day);
        else if (kind === 'ncr') ncrDay(day);
        else if (kind === 'close') closePaid(day);
      } catch (e) { fail(kind, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e); soDraft = null; soEdit = null; }
      if (kind !== 'tick' || dirty.size > 40) logCapture();
      PROF[kind] = (PROF[kind] || 0) + performance.now() - pt;
    }
    logCapture();
    if (workday(day)) resyncQueues();
    dollyRelease();
    const pa = performance.now(); archive(day); PROF.archive = (PROF.archive || 0) + performance.now() - pa;
    const d = {}; Object.keys(SIM.n).forEach(k => { if (SIM.n[k] !== n0[k]) d[k] = SIM.n[k] - (n0[k] || 0); });
    return { day, ms: Math.round(performance.now() - t0), n: d, queues: Object.fromEntries(Object.entries(Q).map(([k, v]) => [k, v.length]).filter(x => x[1])), live: { orders: DB.salesOrder.length, scans: DB.stationScan.length, batches: DB.glassBatch.length }, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0 };
  };
  SIM.size = sizeNow;
  const PROF = SIM.prof = {};

  /* Конец: архив обратно, ответы, обычная запись в браузер выключена до экспорта. */
  SIM.finish = function (end) {
    at(T(end, 21));
    DB.salesOrder.forEach(o => { if (!salesIsQuote(o)) ordInfo(o.id); });
    /* Опоздания — по своему счёту (ordState). */
    Object.entries(ORDINFO).forEach(([id, x]) => {
      if (x.cancelled || !x.due) return;
      const state = ordState(id, x, end);
      const t = TR.orders[x.c] = TR.orders[x.c] || { n: 0, late: 0, onTime: 0, open: 0 }; t.n++; if (state === 'Late') t.late++; if (state === 'On time') t.onTime++; if (state === 'Open') t.open++;
    });
    /* Долги на конец: сумма заказа (цена ERP) минус свои оплаты; просрочка — свой срок.
       В архиве только оплаченные и отменённые — долгов там нет. */
    const debts = {};
    DB.salesOrder.forEach(o => {
      if (salesIsQuote(o) || o.status === 'cancelled') return; const t = finOrderTotals(o); if (!t || !t.complete) return;
      const bal = round2(t.grand - (PAID[o.id] || 0)), c = salesCustomerDisplay(o.customerId); if (!(bal > 0.004)) return;
      debts[c] = debts[c] || { balance: 0, overdue: 0, n: 0 }; debts[c].balance += bal; debts[c].n++; if (DUE[o.id] && DUE[o.id] < end) debts[c].overdue += bal;
    });
    Object.values(debts).forEach(x => { x.balance = round2(x.balance); x.overdue = round2(x.overdue); });
    SIM.truth = Object.assign({}, TR, { debts, end, generated: { orders: Object.keys(ORDINFO).length, quotes: QUOTE_N, scans: DB.stationScanSeq, batches: BATCH_SEQ, shipments: DB.shipmentSeq, receipts: DB.receipt.length, glass: DB.glassPieceSeq, units: DB.glassUnitIdSeq }, counts: SIM.n, fails: SIM.fails });
    return SIM.truth.generated;
  };

  /* =====================================================================
     Проверка: отчёты конструктора против truth, время на большой базе.
     ===================================================================== */
  SIM.check = function (start, end) {
    /* Для честных замеров — настоящие функции ERP (без индексов генератора). */
    ['render', 'stationShow', 'mdById', 'salesRecord', 'salesFirstGlass', 'salesLaminatedPlyCandidates', 'setTimeout'].forEach(k => { window[k] = ORIG[k]; });
    asOffice(people['Daniel Moroz']); at(T(end, 21));
    /* Замер не обрывает остальное: ошибка — тоже результат (на 14 месяцах база
       не помещается в одну строку, JSON.stringify(DB) падает). */
    const out = { compare: [], timing: {} }, time = (k, fn) => { const t0 = performance.now(); try { const v = fn(); out.timing[k] = Math.round(performance.now() - t0); return v; } catch (e) { out.timing[k] = 'error after ' + Math.round(performance.now() - t0) + ' ms: ' + e.message; return null; } };
    const range = { from: start, to: end };
    repWorkCache = { stamp: '', rows: null };
    time('repWorkFacts (all scans, cold)', () => repWorkFacts().length);
    time('repWorkFacts (warm)', () => repWorkFacts().length);
    const Q = (k, q) => time('query ' + k, () => repQuery(Object.assign({ date: range }, q)));
    const cmp = (name, unit, truth, rep, tol) => {
      const keys = [...new Set(Object.keys(truth).concat(Object.keys(rep)))].sort(), rows = [];
      let tt = 0, rr = 0, bad = 0;
      keys.forEach(k => { const a = +(truth[k] || 0), b = +(rep[k] || 0); tt += a; rr += b; const ok = Math.abs(a - b) <= Math.max(tol || 0.5, Math.abs(a) * 0.001); if (!ok) bad++; rows.push({ k, truth: +a.toFixed(2), report: +b.toFixed(2), ok }); });
      out.compare.push({ name, unit, truth: +tt.toFixed(2), report: +rr.toFixed(2), keys: keys.length, mismatches: bad, rows: rows.filter(r => !r.ok).slice(0, 25), sample: rows.slice(0, 6) });
    };
    const cells = (res, mi, fn) => { const m = {}; res.keys.forEach(a => { if (res.keys2.length) res.keys2.forEach(b => { const v = (res.cells.get(a + '\u0001' + b) || [])[mi]; if (v) m[fn ? fn(a, b) : a + '|' + b] = v; }); else { const v = (res.rowTotals.get(a) || [])[mi]; if (v) m[fn ? fn(a) : a] = v; } }); return m; };
    const sumBy = (obj, keyFn, field) => { const m = {}; Object.entries(obj).forEach(([k, v]) => { const kk = keyFn(k.split('|')); if (kk == null) return; m[kk] = (m[kk] || 0) + (field ? v[field] : v); }); return m; };

    let r = Q('cutting month×mm', { source: 'cutting', dims: ['at:month', 'mm'], metrics: ['count', 'area'] });
    cmp('Резка: стёкол по месяцам и толщине', 'шт', sumBy(TR.cut, ([m, mm]) => m + '|' + mm + ' mm', 'n'), cells(r, 0));
    cmp('Резка: ft² по месяцам и толщине', 'ft²', sumBy(TR.cut, ([m, mm]) => m + '|' + mm + ' mm', 'ft2'), cells(r, 1), 1);
    r = Q('edgework person×op', { source: 'edgework', dims: ['person', 'op'], metrics: ['inches', 'usd'] });
    cmp('Кромка: линейные дюймы по людям и операциям', 'in', sumBy(TR.edge, ([who, op]) => who + '|' + op, 'in'), cells(r, 0), 2);
    cmp('Кромка: $ по прайсу по людям и операциям', '$', sumBy(TR.edge, ([who, op]) => who + '|' + op, 'usd'), cells(r, 1), 1);
    r = Q('edgework person×op, no laminated', { source: 'edgework', dims: ['person', 'op'], metrics: ['inches', 'usd'], filters: [{ f: 'unitType', op: 'notIn', v: ['Laminated'] }] });
    cmp('Кромка без ламината: дюймы по людям и операциям', 'in', sumBy(TR.edge, ([who, op, mm, m, lam]) => lam ? null : who + '|' + op, 'in'), cells(r, 0), 2);
    r = Q('POLISH month×person', { source: 'edgework', dims: ['at:month', 'person'], metrics: ['inches', 'usd'], filters: [{ f: 'op', op: 'in', v: ['Flat Polish'] }] });
    cmp('POLISH (Flat Polish): дюймы по месяцам и людям', 'in', sumBy(TR.edge, ([who, op, mm, m]) => op === 'Flat Polish' ? m + '|' + who : null, 'in'), cells(r, 0), 2);
    r = Q('tempering month×mm', { source: 'tempering', dims: ['at:month', 'mm'], metrics: ['count', 'area'] });
    cmp('Закалка: стёкол по месяцам и толщине', 'шт', sumBy(TR.temper, ([m, mm]) => m + '|' + mm + ' mm', 'n'), cells(r, 0));
    cmp('Закалка: ft² по месяцам и толщине', 'ft²', sumBy(TR.temper, ([m, mm]) => m + '|' + mm + ' mm', 'ft2'), cells(r, 1), 1);
    r = Q('assembly person', { source: 'assembly', dims: ['person'], metrics: ['units', 'count'], filters: [{ f: 'station', op: 'in', v: ['IGU'] }] });
    cmp('IGU: собранные юниты по людям', 'юн', sumBy(TR.igu, ([who]) => who), cells(r, 0));
    r = Q('shipping person', { source: 'shipping', dims: ['person'], metrics: ['units', 'count'] });
    cmp('SHIP: выдано юнитов по людям', 'юн', sumBy(TR.ship, ([who]) => who, 'units'), cells(r, 0));
    cmp('SHIP: выдано стёкол по людям', 'шт', sumBy(TR.ship, ([who]) => who, 'glass'), cells(r, 1));
    r = Q('deliveries truck', { source: 'deliveries', dims: ['truck'], metrics: ['trips', 'km', 'count'], filters: [{ f: 'method', op: 'in', v: ['Delivery'] }] });
    const trips = {}, km = {}; Object.values(TR.trips).forEach(t => { trips[t.truck] = (trips[t.truck] || 0) + 1; km[t.truck] = (km[t.truck] || 0) + t.km; });
    cmp('Доставка: рейсы по машинам', 'рейс', trips, cells(r, 0));
    cmp('Доставка: км по машинам', 'км', km, cells(r, 1), 1);
    r = Q('orders customer', { source: 'orders', date: { f: 'due' }, dims: ['customer'], metrics: ['count', 'late'] });
    cmp('Сроки: заказов со сроком по клиентам', 'шт', sumBy(TR.orders, ([c]) => c, 'n'), cells(r, 0));
    cmp('Сроки: опоздавших заказов по клиентам', 'шт', sumBy(TR.orders, ([c]) => c, 'late'), cells(r, 1));
    /* Где «Late» разошёлся — по заказу: срок, отгружен по ERP и по факту. */
    out.orderDiff = repOrderFacts().filter(x => x.due && ORDINFO[x.id]).map(x => { const mine = SHIPPED[x.id] || '', my = ordState(x.id, ORDINFO[x.id], end); return my === x.state ? null : { order: x.order, customer: repCustomer(x.customerId), delivery: x.delivery, due: x.due, erpShipped: x.shipped, erpReady: x.ready, erpState: x.state, handedOver: mine, myReady: READYDAY[x.id] || '', myState: my }; }).filter(Boolean).slice(0, 20);
    r = Q('quotes rep', { source: 'quotes', date: { f: 'created', from: start, to: end }, dims: ['rep'], metrics: ['count', 'won'] });
    cmp('Квоты: создано по продажникам', 'шт', sumBy(TR.quotes, ([rep]) => rep, 'n'), cells(r, 0));
    cmp('Квоты: выиграно по продажникам', 'шт', sumBy(TR.quotes, ([rep]) => rep, 'won'), cells(r, 1));
    r = Q('payments month', { source: 'payments', dims: ['at:month'], metrics: ['amount'] });
    cmp('Оплаты по месяцам', '$', TR.receipts, cells(r, 0), 1);
    r = Q('balances customer', { source: 'balances', date: { f: 'due' }, dims: ['customer'], metrics: ['balance', 'overdue'] });
    const bal = {}, ovd = {}; Object.entries(SIM.truth.debts).forEach(([c, d]) => { bal[c] = d.balance; ovd[c] = d.overdue; });
    r = time('query balances customer (all)', () => repQuery({ source: 'balances', dims: ['customer'], metrics: ['balance', 'overdue'] }));
    cmp('Долги: остаток по клиентам', '$', bal, cells(r, 0), 1);
    cmp('Долги: просрочено по клиентам', '$', ovd, cells(r, 1), 1);
    const whereOf = st => st.replace(/^NCR /, '');
    r = Q('breaks station', { source: 'breaks', dims: ['station'], metrics: ['glassN'] });
    cmp('Брак: стёкол по станциям', 'шт', sumBy(TR.breaks, ([st]) => whereOf(st)), cells(r, 0));
    r = Q('breaks reason', { source: 'breaks', dims: ['reason'], metrics: ['glassN'] });
    cmp('Брак: стёкол по причинам', 'шт', sumBy(TR.breaks, ([st, reason]) => reason), cells(r, 0));

    /* Стартовые отчёты целиком: все графики всех страниц, как на экране. */
    out.reports = (DB.report || []).filter(x => /^RP-start-/.test(x.id)).map(rp => {
      repWorkCache = { stamp: '', rows: null }; if (typeof repOrderCache !== 'undefined') repOrderCache = { stamp: '', rows: null }; if (typeof repBreakCache !== 'undefined') repBreakCache = { stamp: '', rows: null };
      const t0 = performance.now(); let n = 0, err = '';
      try { rp.pages.forEach(pg => pg.widgets.forEach(w => { repQuery(repWidgetQuery(rp, w), repCtx()); n++; })); } catch (e) { err = e.message; }
      return { id: rp.id, name: rp.name, widgets: n, ms: Math.round(performance.now() - t0), err };
    });
    /* Экраны: Reports, Overview, Board станции, Sales, Production. */
    const screen = (k, fn) => { try { time(k, () => { fn(); render(); }); } catch (e) { out.timing[k] = 'error: ' + e.message; } };
    screen('screen Reports · Glass cut by month', () => { tab = 'reports'; repOpen('RP-start-cut'); });
    screen('screen Overview', () => { tab = 'dashboard'; });
    screen('screen Sales list', () => { tab = 'sales'; soEdit = null; soDraft = null; });
    screen('screen Production', () => { tab = 'production'; });
    screen('screen Shipping', () => { tab = 'shipping'; });
    screen('screen Finance', () => { tab = 'finance'; });
    const polisher = people.Andrei, u = DB.user.find(x => x.viewProfileId === polisher.id);
    screen('screen station POLISH · Scan', () => { asStation('POLISH', polisher, ''); stationTab = 'scan'; });
    screen('screen station POLISH · Board', () => { asStation('POLISH', polisher, ''); stationTab = 'board'; });
    /* Один скан на станции с экраном результата — как у рабочего. */
    const waiting = stationWaiting(), at2 = ['SHIPR', 'HEAT', 'POLISH', 'ARRIS', 'IGU'].find(st => (waiting.get(st) || []).length);
    if (at2) { const g = waiting.get(at2)[0], who = (ROSTER[at2] || [])[0]; if (who) { asStation(at2, who.p, ''); time('scan at ' + at2 + ' (stationSubmit with screen)', () => stationSubmit(g.id)); } }
    /* Сохранение заказа: нормализация всех заказов базы + снимок базы для записи. */
    const last = DB.salesOrder.filter(o => !salesIsQuote(o) && o.status === 'new').pop() || DB.salesOrder.filter(o => !salesIsQuote(o)).pop();
    if (last) { tab = 'sales'; time('order Save (normalize all orders)', () => { salesOrderEdit(last.id); soDraft.notes = (soDraft.notes || '') + ' '; salesOrderSave(); soDraft = null; soEdit = null; }); }
    time('JSON.stringify(DB) — what every ERP save writes', () => JSON.stringify(DB).length);
    let db = 0; Object.keys(DB).forEach(k => { const v = DB[k]; if (Array.isArray(v)) v.forEach(x => { db += JSON.stringify(x).length + 1; }); else db += JSON.stringify(v).length; });
    out.size = { db, scans: DB.stationScan.length, orders: DB.salesOrder.length, batches: DB.glassBatch.length, shapes: DB.shapeDef.length };
    out.heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0;
    return out;
  };
  /* Картинки: отчёт открыт на нужной странице и периоде. */
  SIM.show = function (what) {
    asOffice(people['Daniel Moroz']);
    if (what.report) { tab = 'reports'; repOpen(what.report); if (what.date) repViewSet(what.report, v => { v.date = what.date; }); if (what.page != null) { const rp = repFind(what.report); repPageId = rp.pages[what.page].id; } }
    if (what.tab) tab = what.tab;
    if (what.station) { asStation(what.station, people[what.who], ''); stationTab = what.stationTab || 'scan'; }
    render(); return true;
  };
  /* Export JSON частями: Node собирает файл, не держа одну огромную строку. */
  SIM.exportPlan = function () {
    const parts = [], keys = Object.keys(DB);
    keys.forEach((k, i) => {
      const v = DB[k], sep = i ? ',' : '', arch = ARCH[k] || [];
      if (Array.isArray(v) && (v.length > 2000 || arch.length)) {
        parts.push({ head: sep + JSON.stringify(k) + ':[' });
        let first = true;
        arch.forEach((chunk, n) => { parts.push({ arch: k, n, comma: !first }); first = false; });
        for (let a = 0; a < v.length; a += 2000) { parts.push({ k, from: a, to: Math.min(v.length, a + 2000), comma: !first }); first = false; }
        parts.push({ tail: ']' });
      } else parts.push({ whole: sep + JSON.stringify(k) + ':' + JSON.stringify(v) });
    });
    SIM.parts = parts; return parts.length;
  };
  SIM.exportPart = function (i) {
    const p = SIM.parts[i]; if (p.whole) return p.whole; if (p.head) return p.head; if (p.tail) return p.tail;
    if (p.arch) return (p.comma ? ',' : '') + ARCH[p.arch][p.n];
    return (p.comma ? ',' : '') + DB[p.k].slice(p.from, p.to).map(x => JSON.stringify(x)).join(',');
  };
  /* Для --check: архив обратно в DB (объектами). */
  SIM.unarchive = function () { unarchive(); return { scans: DB.stationScan.length, orders: DB.salesOrder.length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0 }; };
}

/* =====================================================================
   Node: запуск по дням, размер по месяцам, файлы.
   ===================================================================== */
module.exports = { initPage, simPage };
if (require.main === module) (async () => {
  fs.mkdirSync(o.out, { recursive: true });
  const t0 = Date.now();
  const b = await chromium.launch({ args: ['--js-flags=--max-old-space-size=8192', '--enable-precise-memory-info'] });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Toronto', locale: 'en-CA' });
  await c.addInitScript(initPage, o.seed);
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  await p.goto('file://' + path.join(ROOT, 'src/index.html'));
  await p.waitForTimeout(400);
  await p.evaluate(`(${simPage.toString()})()`);
  console.log('setup', JSON.stringify(await p.evaluate(x => SIM.setup(x), { seed: o.seed, scale: o.scale, quickCut: o.quickCut, start: o.start })));
  const sizes = [];
  let day = o.start, month = o.start.slice(0, 7);
  while (day <= o.end) {
    const r = await p.evaluate(([d, until]) => SIM.day(d, until), [day, day === o.end ? o.endAt || 0 : 0]);
    const n = r.n, short = Object.entries(n).map(([k, v]) => k + ' ' + Math.round(v)).join(', ');
    console.log(day, (r.ms / 1000).toFixed(1) + 's', 'heap ' + r.heap + 'MB', short.slice(0, 260), '| queues', JSON.stringify(r.queues), '| live', JSON.stringify(r.live));
    const next = addDaysStr(day, 1);
    if (new Date(day + 'T12:00:00Z').getUTCDay() === 0) console.log('   время по видам, с:', JSON.stringify(Object.fromEntries(Object.entries(await p.evaluate(() => SIM.prof)).map(([k, v]) => [k, Math.round(v / 1000)]))));
    if (next.slice(0, 7) !== month || next > o.end) {
      const s = await p.evaluate(() => SIM.size());
      sizes.push({ month, endDay: day, mb: +(s.total / 1048576).toFixed(1), by: Object.fromEntries(Object.entries(s.by).map(([k, v]) => [k, +(v / 1048576).toFixed(2)])) });
      console.log('== ' + month + ': база ' + (s.total / 1048576).toFixed(1) + ' МБ', JSON.stringify(sizes[sizes.length - 1].by));
      month = next.slice(0, 7);
      fs.writeFileSync(path.join(o.out, o.name + '-sizes.json'), JSON.stringify(sizes, null, 1));
    }
    day = next;
  }
  const gen = await p.evaluate(e => SIM.finish(e), o.end);
  console.log('finish', JSON.stringify(gen));
  const n = await p.evaluate(() => SIM.exportPlan());
  const file = path.join(o.out, o.name + '.json'), fd = fs.openSync(file, 'w');
  fs.writeSync(fd, '{"format":"glass-erp","schemaVersion":1,"exportedAt":' + JSON.stringify(new Date(o.end + 'T21:00:00-04:00').toISOString()) + ',"data":{');
  for (let i = 0; i < n; i++) fs.writeSync(fd, await p.evaluate(k => SIM.exportPart(k), i));
  fs.writeSync(fd, '}}'); fs.closeSync(fd);
  const truth = await p.evaluate(() => SIM.truth);
  fs.writeFileSync(path.join(o.out, o.name + '-truth.json'), JSON.stringify(truth, null, 1));
  fs.writeFileSync(path.join(o.out, o.name + '-people.json'), JSON.stringify({ note: 'Test logins of the simulated shop. Do not commit.', people: await p.evaluate(() => SIM.people()), customers: await p.evaluate(() => SIM.customers()) }, null, 1));
  console.log('файл', file, (fs.statSync(file).size / 1048576).toFixed(1) + ' МБ', 'за', ((Date.now() - t0) / 60000).toFixed(1) + ' мин');
  console.log('сбои', JSON.stringify(truth.fails, null, 1));
  if (o.check) {
    console.log('архив обратно в базу…', JSON.stringify(await p.evaluate(() => SIM.unarchive())));
    console.log('проверка отчётов…');
    const res = await p.evaluate(([a, b]) => SIM.check(a, b), [o.start, o.end]);
    fs.writeFileSync(path.join(o.out, o.name + '-check.json'), JSON.stringify(res, null, 1));
    res.compare.forEach(x => console.log((x.mismatches ? '✗ ' : '✓ ') + x.name + ': truth ' + x.truth + ' / отчёт ' + x.report + ' ' + x.unit + (x.mismatches ? ' · расхождений ' + x.mismatches + ' из ' + x.keys : '')));
    console.log('время, мс:', JSON.stringify(res.timing, null, 1));
    console.log('стартовые отчёты, мс:', res.reports.map(r => r.name + ' ' + r.ms + (r.err ? ' ERR ' + r.err : '')).join('; '));
    const shots = [
      ['cut', { report: 'RP-start-cut', date: { preset: 'thisYear' } }],
      ['cut-lastyear', { report: 'RP-start-cut', date: { preset: 'lastYear' } }],
      ['polish', { report: 'RP-start-polish', date: { preset: 'lastMonth' } }],
      ['people', { report: 'RP-start-people', date: { preset: 'lastMonth' }, page: 1 }],
      ['temper', { report: 'RP-start-temper', date: { preset: 'lastMonth' } }],
      ['igu', { report: 'RP-start-igu', date: { preset: 'lastWeek' } }],
      ['handout', { report: 'RP-start-handout', date: { preset: 'lastMonth' } }],
      ['km', { report: 'RP-start-km', date: { preset: 'lastMonth' } }],
      ['due', { report: 'RP-start-due', date: { preset: 'lastMonth' } }],
      ['quotes', { report: 'RP-start-quotes', date: { preset: 'lastQuarter' } }],
      ['balances', { report: 'RP-start-balances' }],
      ['recuts', { report: 'RP-start-recuts', date: { preset: 'last90' } }],
      ['overview', { tab: 'dashboard' }],
      ['board-polish', { station: 'POLISH', who: 'Andrei', stationTab: 'board' }]
    ];
    for (const [k, w] of shots) {
      try { await p.evaluate(x => SIM.show(x), w); await p.waitForTimeout(200); await p.screenshot({ path: path.join(o.out, o.name + '-shot-' + k + '.png'), fullPage: true }); }
      catch (e) { console.log('картинка ' + k + ': ' + e.message); }
    }
  }
  if (errs.length) console.log('ошибки страницы', errs.slice(0, 10));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
