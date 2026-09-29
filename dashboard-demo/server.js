import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const host = '127.0.0.1';
const port = 5180;
const page = new URL('./index.html', import.meta.url);

createServer(async (request, response) => {
  const path = new URL(request.url, `http://${host}:${port}`).pathname;
  if (path === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  if (path !== '/') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('페이지를 찾을 수 없습니다.');
    return;
  }
  try {
    const html = await readFile(page);
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    }).end(html);
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('시작 화면을 불러오지 못했습니다.');
  }
}).listen(port, host, () => {
  console.log(`새 마케팅 대시보드: http://${host}:${port}`);
});
