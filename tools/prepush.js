/* =====================================================================
   Предпушевая проверка ветки GLASS ERP.

   Зачем. 11 сентября 2026 CI уронил ветку на проверке «собранный dist не
   приходит из ветки» — при том что dist в ветке НИКТО не коммитил. Причина
   не в ветке: владелец слил предыдущий PR, CI пересобрал dist уже на main,
   и ветка осталась с копией «до» пересборки. Сравнение с main показало
   расхождение. Так будет после КАЖДОГО слияния, пока работа в ветке
   продолжается, — значит шаг «догнать main» нельзя держать в голове.

   Что делает по порядку. Любой неуспех — остановка с объяснением; ничего
   не форсирует, ничего не перезаписывает молча:

     1. рабочее дерево должно быть чистым — иначе слияние и пуш увезли бы
        половину состояния;
     2. `git fetch origin`;
     3. если main ушёл вперёд — обычное слияние в ветку (конфликт = стоп
        с инструкцией, а не автоматический выбор стороны);
     4. dist/GLASS_ERP.html сверяется с main ТЕМ ЖЕ сравнением, что в CI
        (`git diff --quiet origin/main HEAD -- dist/GLASS_ERP.html`);
     5. манифест и воспроизводимость;
     6. переносы строк: `--numstat` обязан совпасть с
        `--ignore-cr-at-eol --numstat` (см. tools/fix-eol.js);
     7. тесты по модулям и по собранному dist, после чего dist возвращается
        к версии main — в ветку он не коммитится;
     8. только после всего этого — push.

   Запуск:  node tools/prepush.js          проверить и запушить
            node tools/prepush.js --dry    только проверить
   ===================================================================== */
const { execSync, spawnSync } = require('child_process');

const dry = process.argv.includes('--dry');
const sh = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const run = (cmd, env) => spawnSync(cmd, { shell: true, stdio: 'inherit', env: env ? Object.assign({}, process.env, env) : process.env }).status === 0;
const stop = (msg, hint) => { console.error('\n  ОСТАНОВЛЕНО: ' + msg); if (hint) console.error('\n' + hint); process.exit(1); };
const step = (n, msg) => console.log('\n[' + n + '] ' + msg);

const branch = sh('git rev-parse --abbrev-ref HEAD');
if (branch === 'main') stop('это main, а не ветка. Прямо в main не пушим — работа идёт через PR.');
console.log('Ветка: ' + branch);

step(1, 'Рабочее дерево');
const dirty = sh('git status --porcelain');
if (dirty) stop('есть незакоммиченные изменения — сначала коммит.', dirty);
console.log('    чисто');

step(2, 'Забираем origin');
if (!run('git fetch --no-tags --quiet origin')) stop('git fetch не прошёл.');
console.log('    ok');

step(3, 'Догоняем main');
const behind = sh('git log --oneline HEAD..origin/main');
if (!behind) console.log('    main не уходил вперёд');
else {
  console.log('    main впереди на:\n' + behind.split('\n').map(l => '      ' + l).join('\n'));
  if (!run('git merge origin/main -m "Слияние main: ветка догоняет пересобранный CI dist"'))
    stop('слияние с main не прошло (конфликт).',
      '  Разберите конфликт руками и повторите. Ничего не форсируйте:\n' +
      '  git status  — покажет конфликтующие файлы.');
  console.log('    слито');
}

step(4, 'Собранный dist против main (та же проверка, что в CI)');
try { execSync('git diff --quiet origin/main HEAD -- dist/GLASS_ERP.html'); console.log('    совпадает'); }
catch (e) {
  stop('dist/GLASS_ERP.html в ветке отличается от main — CI на этом падает.',
    '  Собранный файл обновляет только CI после слияния в main.\n' +
    '  Убрать из ветки:\n' +
    '    git checkout origin/main -- dist/GLASS_ERP.html\n' +
    "    git commit -m 'dist убран из ветки: его пересобирает CI'");
}

step(5, 'Манифест и воспроизводимость');
if (!run('node build/check-manifest.js')) stop('проверка манифеста не прошла.');
if (!run('node build/check-reproducible.js')) stop('проверка воспроизводимости не прошла.');

step(6, 'Переносы строк');
const real = sh('git diff --ignore-cr-at-eol --numstat origin/main...HEAD');
const shown = sh('git diff --numstat origin/main...HEAD');
if (real !== shown) {
  const honest = new Map(real.split('\n').map(l => [l.split('\t')[2], l]));
  const bad = shown.split('\n').filter(l => honest.get(l.split('\t')[2]) !== l)
    .map(l => { const [add, del, f] = l.split('\t'); return '      ' + f + ': показано ' + add + '/' + del + ', на самом деле ' + (honest.get(f) || '0\t0').split('\t').slice(0, 2).join('/'); })
    .join('\n');
  stop('перенос строк поехал — ревьюер увидит тысячи ложных строк.',
    '  Расходятся:\n' + bad + '\n\n  Чинится: node tools/fix-eol.js <файл>');
}
console.log('    ложного дифа нет');

step(7, 'Тесты по модулям');
if (!run('node test/run.js')) stop('тесты по модулям упали.');

step(8, 'Тесты по собранному dist');
if (!run('node build/build.js')) stop('сборка не прошла.');
const distOk = run('node test/run.js', { TARGET: 'dist' });
/* dist собран локально только ради прогона — в ветку он не едет. */
run('git checkout -- dist/GLASS_ERP.html');
if (!distOk) stop('тесты по собранному dist упали.');
/* Сборка трогает и src/index.html. Если он после неё изменился — значит в
   коммит уехали модули без пересборки, и живая версия разошлась бы с кодом.
   Молча оставлять это грязным в дереве нельзя. */
const drift = sh('git status --porcelain');
if (drift) stop('после сборки дерево не чистое — в ветке лежат модули без пересборки.',
  drift + '\n\n  Пересоберите и закоммитьте:\n    npm run build:web\n    git commit -am "пересборка src/index.html"');
console.log('    dist возвращён к версии main, дерево чистое');

if (dry) { console.log('\nВсё зелёное. Пуш не делаю: запущено с --dry.'); process.exit(0); }

step(9, 'Пуш');
if (!run('git push')) stop('git push не прошёл.');
console.log('\nГотово: ветка догнала main, проверки зелёные, запушено.');
