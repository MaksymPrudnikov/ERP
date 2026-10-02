#!/usr/bin/env node
/* =====================================================================
   Тесты по КОПИИ последнего коммита — рабочее дерево можно править дальше.

   Зачем. `node test/run.js` идёт 2–3 минуты и всё это время читает файлы
   из дерева. Правка src/ посреди прогона портит результат: половина
   проверок видит старый код, половина — новый. Раньше копию каждый раз
   собирали руками (git archive + симлинк node_modules); теперь одной
   командой.

   Что делает: распаковывает HEAD во временную папку, подкладывает туда
   node_modules этого дерева (ссылкой, без копирования) и гоняет тесты там.
   Незакоммиченное в прогон НЕ попадает — об этом скрипт предупредит.

   Запуск:  npm run test:snap               тесты по модулям
            npm run test:snap -- --dist     плюс сборка и тесты по dist
            npm run test:snap -- --keep     не удалять копию после прогона
   Лог прогона лежит в копии (test.log) и печатается в консоль.
   ===================================================================== */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const withDist = args.includes('--dist');
const keep = args.includes('--keep');
const sh = cmd => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

if (!fs.existsSync(path.join(ROOT, 'node_modules', 'playwright'))) {
  console.error('Нет node_modules/playwright — сначала: npm ci');
  process.exit(1);
}

const sha = sh('git rev-parse --short HEAD');
const dirty = sh('git status --porcelain');
if (dirty) console.warn('Внимание: есть незакоммиченные правки — в прогон уйдёт только коммит ' + sha + '.\n');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glass-erp-' + sha + '-'));
const archive = spawnSync('git', ['archive', '--format=tar', 'HEAD'], { cwd: ROOT, maxBuffer: 1 << 30 });
if (archive.status !== 0) { console.error(String(archive.stderr)); process.exit(1); }
const untar = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout });
if (untar.status !== 0) { console.error(String(untar.stderr)); process.exit(1); }
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
console.log('Копия ' + sha + ': ' + dir);

const log = fs.openSync(path.join(dir, 'test.log'), 'a');
const run = (title, cmd, cmdArgs, env) => {
  console.log('\n== ' + title);
  fs.writeSync(log, '\n== ' + title + '\n');
  const r = spawnSync(cmd, cmdArgs, { cwd: dir, env: Object.assign({}, process.env, env || {}), encoding: 'utf8', maxBuffer: 1 << 28 });
  const out = (r.stdout || '') + (r.stderr || '');
  fs.writeSync(log, out);
  /* В консоль — только упавшие проверки и итог: полный лог в test.log.
     Нет строки итога — прогон рухнул, тогда показываем хвост целиком. */
  const lines = out.split('\n');
  const finished = lines.some(l => /^\d+ passed, \d+ failed/.test(l));
  const shown = lines.filter(l => /^\s*FAIL|^\d+ passed, \d+ failed|^target:/.test(l));
  console.log((finished || r.status === 0 ? (shown.length ? shown : lines.slice(-5)) : lines.slice(-30)).join('\n').trim());
  return r.status === 0;
};

let ok = run('Тесты по модулям', process.execPath, ['test/run.js']);
if (withDist) {
  ok = run('Сборка', process.execPath, ['build/build.js']) && ok;
  ok = run('Тесты по собранному dist', process.execPath, ['test/run.js'], { TARGET: 'dist' }) && ok;
}
fs.closeSync(log);

if (ok && !keep) fs.rmSync(dir, { recursive: true, force: true });
else console.log('\nКопия оставлена: ' + dir + (ok ? '' : '  (лог: test.log)'));
console.log(ok ? '\nЗЕЛЁНОЕ · ' + sha : '\nУПАЛО · ' + sha);
process.exit(ok ? 0 : 1);
