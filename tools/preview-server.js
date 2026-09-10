/* Локальный статический сервер для режима по модулям.
 *
 * `dist/GLASS_ERP.html` открывается двойным кликом и сервера не требует, а вот
 * `src/index.html` подключает полсотни отдельных файлов — при открытии с диска
 * часть браузеров их не отдаёт. Раньше такой сервер каждый раз писали заново во
 * временной папке; теперь он лежит рядом с остальными инструментами.
 *
 *   node tools/preview-server.js        → http://127.0.0.1:8765/src/index.html
 *   node tools/preview-server.js 9000   → тот же корень на другом порту
 *
 * Отдаёт ТОЛЬКО файлы репозитория: путь, уходящий выше корня, получает 403.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2]) || 8765;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.dxf': 'application/dxf'
};

http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  } catch (error) {
    response.writeHead(400).end('Bad request');
    return;
  }
  if (pathname === '/') pathname = '/src/index.html';
  const file = path.resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(data);
  });
}).listen(port, '127.0.0.1', () => {
  console.log('GLASS ERP preview: http://127.0.0.1:' + port + '/src/index.html');
});
