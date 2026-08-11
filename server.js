import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

function getPort(args = process.argv.slice(2), environment = process.env) {
  const portFlagIndex = args.findIndex(argument =>
    argument === '-p' || argument === '--port' || argument.startsWith('--port='),
  );
  const portArgument = portFlagIndex >= 0 ? args[portFlagIndex] : '';
  const flagPort = Number(
    portArgument.startsWith('--port=')
      ? portArgument.slice('--port='.length)
      : args[portFlagIndex + 1],
  );
  const environmentPort = Number(environment.PORT);

  if (Number.isInteger(flagPort) && flagPort > 0 && flagPort <= 65535) return flagPort;
  if (Number.isInteger(environmentPort) && environmentPort > 0 && environmentPort <= 65535) return environmentPort;
  return 5173;
}

const port = getPort();
const root = process.cwd();
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const requestedPath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = normalize(join(root, requestedPath));

  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Marketing dashboard is running at http://localhost:${port}`);
});
