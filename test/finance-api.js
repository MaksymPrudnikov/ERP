/* Сторож Finance (план «до 10», этап 5, 12.11.2026). Таблицы денег
   (FIN_OWN, erp/finance/ledger) пишет только Finance, остальные зовут его
   имена из списка FIN_API (erp/finance/api). Три проверки:
   а) по тексту кода: вне Finance никто не пишет в таблицы денег;
   б) по тексту кода: вне Finance — только имена из FIN_API;
   в) живая: в тестах командная запись, тронувшая таблицу денег без отметки
      Finance, пишет в консоль «Money outside Finance» (test/run.js собирает
      такие строки со всех тестов, итог — в конце прогона).
   Ещё: деньги вносит только тот, у кого галочка Finance (владелец
   12.11.2026), выдача с долгом — строка в журнале заказа. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
/* Finance — модули денег и их экраны. */
const FINANCE = f => /^src\/erp\/finance\//.test(f) || /^src\/erp\/views\/(finance[\w-]*|commissions)\.js$/.test(f);
const OWN = 'receipt|refund|financeTerms|financeEvent|financeExport|financeExportBatch|referrer|referrerPayout';
/* Запись: присваивание таблице или её строке, методы, меняющие массив,
   правка разнесения и аннулирования у строки. */
const WRITE = new RegExp(`\\bDB\\.(?:${OWN})\\b\\s*(?:=(?!=)|\\.(?:push|splice|unshift|pop|shift|sort|reverse|fill)\\(|\\[[^\\]]*\\]\\s*=(?!=))` +
  `|\\bDB\\[['"](?:${OWN})['"]\\]|\\.allocations\\s*(?:=(?!=)|\\.(?:push|splice)\\()|\\.(?:voided|voidReason|voidedAt)\\s*=(?!=)`);
/* Имя, а не поле объекта (e.comHst), не ключ ({comHst: …}) и не строка ('comHst'). */
const NAME = /(?<![.\w$'"])(?:fin|com)[A-Z]\w*(?!\w)(?!\s*:)/g;

function modules() {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/manifest.json'), 'utf8'));
  return m.scripts.filter(f => f.endsWith('.js')).map(f => ({ f, text: fs.readFileSync(path.join(ROOT, f), 'utf8') }));
}
function finApi() {
  return new Function(fs.readFileSync(path.join(ROOT, 'src/erp/finance/api.js'), 'utf8') + ';return FIN_API;')();
}

module.exports = async function ({ page, eq }) {
  console.log('finance api');
  const all = modules(), outside = all.filter(x => !FINANCE(x.f)), inside = all.filter(x => FINANCE(x.f)), api = finApi();

  eq('Сторож узнаёт запись: таблица, строка таблицы, разнесение, аннулирование; чтение — не запись', [
    'DB.receipt.push(r)', 'DB.refund=DB.refund.filter(x=>x)', 'DB.financeTerms[i]=t', "DB['receipt']", 'r.allocations=[]', 'r.allocations.push(a)', 'r.voided=true',
    'DB.receipt.filter(r=>r.id===id)', 'x===DB.receipt', 'r.allocations.some(a=>a.orderId===id)', 'if(r.voided)return', 'DB.receiptSeq=1'
  ].map(s => WRITE.test(s)), [true, true, true, true, true, true, true, false, false, false, false, false]);

  const writes = [];
  outside.forEach(({ f, text }) => text.split('\n').forEach((line, i) => { if (WRITE.test(line)) writes.push(f + ':' + (i + 1)); }));
  eq('вне Finance никто не пишет в таблицы денег (receipt, refund, financeTerms, financeEvent, financeExport*, referrer*)', writes, []);

  const used = new Map();
  outside.forEach(({ f, text }) => (text.match(NAME) || []).forEach(n => { if (!used.has(n)) used.set(n, f); }));
  eq('вне Finance — только имена из FIN_API (erp/finance/api)', [...used].filter(([n]) => !api.has(n)).map(([n, f]) => n + ' · ' + f), []);
  const finText = inside.map(x => x.text).join('\n');
  eq('каждое имя FIN_API есть в Finance и кто-то снаружи им пользуется', [...api].filter(n => !new RegExp('\\b' + n + '\\b').test(finText) || !used.has(n)), []);

  const t = await page();
  await require('./optimization-fixture')(t.p);

  eq('живая проверка: прямая запись в оплаты внутри команды Sales — «Money outside Finance»; через команду Finance — тихо', await t.p.evaluate(() => {
    const seen = [], was = console.error;console.error = (...a) => { seen.push(String(a[0])); };
    try {
      oqReset();const c = oqCustomer({ paymentMode: 'cash' }), id = oqOrder(c), o = salesRecord(id);
      const direct = storageCommand(() => { DB.receipt.push(normalizeReceipt({ id: 'RCPT-RAW', number: 'R-RAW', customerId: c.id, amount: 5, date: finToday(), method: 'cash', allocations: [] })); return true; }, { receipt: ['RCPT-RAW'] });
      const raw = seen.filter(s => s.startsWith('Money outside Finance')).length;seen.length = 0;
      const d = { customerId: c.id, currency: 'CAD', date: finToday(), method: 'etransfer', reference: 'FA-1', amount: 10, note: '', allocations: [{ orderId: id, amount: 10 }] };
      const pay = finPersist(() => finSaveReceiptRecord(d, null, ''), finReceiptScope(d, null));
      const cancel = salesSetRecordStatus(id, 'cancelled');
      return { direct: direct.ok, raw, pay: pay.ok, cancel: !!cancel, quiet: seen.filter(s => s.startsWith('Money outside Finance')), deposit: finCustomerDeposit(c.id, 'CAD'), status: salesRecord(id).status, total: !!o };
    } finally { console.error = was; DB.receipt = DB.receipt.filter(r => r.id !== 'RCPT-RAW');touch(); }
  }), { direct: true, raw: 1, pay: true, cancel: true, quiet: [], deposit: 15, status: 'cancelled', total: true });

  eq('без галочки Finance: оплату, возврат, разнесение и условия команда не пишет; отмена заказа переносит оплату на депозит', await t.p.evaluate(() => {
    oqReset();const c = oqCustomer({ paymentMode: 'cash' }), id = oqOrder(c);
    const d = { customerId: c.id, currency: 'CAD', date: finToday(), method: 'etransfer', reference: 'FA-2', amount: 20, note: '', allocations: [{ orderId: id, amount: 20 }] };
    const paid = finPersist(() => finSaveReceiptRecord(d, null, ''), finReceiptScope(d, null)).value;
    const was = window.GF_NO_SIGNIN, user = signinUser;
    window.GF_NO_SIGNIN = false;signinUser = () => ({ name: 'Olga', viewProfileId: 'U-OLGA', access: ['sales', 'shipping'] });
    try {
      const pay = finPersist(() => finSaveReceiptRecord(Object.assign({}, d, { reference: 'FA-3' }), null, ''), finReceiptScope(d, null));
      const voidIt = finPersist(() => finVoidReceipt(paid.id, 'Wrong'));
      const unalloc = finPersist(() => finUnallocate(c.id, [{ receiptId: paid.id, orderId: id }]));
      const terms = finPersist(() => finSaveTerms(id, { paymentMode: 'credit', depositPercent: 0, creditDays: 30 }, 'Test'));
      const cancel = salesSetRecordStatus(id, 'cancelled');
      return { pay: pay.error, voidIt: voidIt.error, unalloc: unalloc.error, terms: terms.error, cancel: !!cancel, deposit: finCustomerDeposit(c.id, 'CAD'), receipts: DB.receipt.filter(r => r.customerId === c.id).length };
    } finally { window.GF_NO_SIGNIN = was;signinUser = user; }
  }), { pay: 'Finance access is required to record money.', voidIt: 'Finance access is required to record money.', unalloc: 'Finance access is required to record money.', terms: 'Finance access is required to record money.', cancel: true, deposit: 20, receipts: 1 });

  eq('выдача с долгом: «Create anyway» пишет в журнал заказа сумму и кнопку; Back — ничего; оплаченный заказ — без строки', await t.p.evaluate(() => {
    const lines = id => DB.orderEvent.filter(e => e.orderId === id && e.what === 'Released with balance due').map(e => e.note);
    oqReset();const c = oqCustomer({ paymentMode: 'cash' });
    const back = oqOrder(c);oqThrough(back, 'ready');oqQueue('ready');oqAdvance(back, 'done', 'pickup');oqChoose('Back');
    const id = oqOrder(c), due = finOrderBalance(salesRecord(id)).balance;oqThrough(id, 'ready');oqQueue('ready');oqAdvance(id, 'done', 'pickup');oqChoose('Create anyway');
    const paid = oqOrder(c);oqPay(paid);oqThrough(paid, 'ready');oqQueue('ready');oqAdvance(paid, 'done', 'pickup');
    return { back: lines(back), released: lines(id), expect: finFmt(due) + ' · Create anyway', status: salesRecord(id).status, paid: lines(paid), paidStatus: salesRecord(paid).status, by: (DB.orderEvent.find(e => e.orderId === id && e.what === 'Released with balance due') || {}).what };
  }).then(r => ({ back: r.back, released: r.released[0] === r.expect && r.released.length, status: r.status, paid: r.paid, paidStatus: r.paidStatus })),
  { back: [], released: 1, status: 'done', paid: [], paidStatus: 'done' });

  await t.c.close();
};
