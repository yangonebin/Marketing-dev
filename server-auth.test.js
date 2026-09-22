import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { scryptSync } from 'node:crypto';

test('both accounts require a server session for dashboard data', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dashboard-http-'));
  const port = 20000 + Math.floor(Math.random() * 30000);
  const base = `http://127.0.0.1:${port}`;
  const salt = 'integration-test-salt';
  const password = 'integration-test-password';
  const hash = scryptSync(password, salt, 64).toString('hex');
  mkdirSync(join(directory, '.dashboard-data'));
  writeFileSync(join(directory, '.dashboard-data', 'accounts.json'), JSON.stringify(
    ['emnet', 'blackyak'].map(id => ({ id, username: id, salt, hash })),
  ));
  const child = spawn(process.execPath, [resolve('server.js'), `--port=${port}`, '--host=127.0.0.1'], {
    cwd: directory,
    stdio: 'ignore',
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: '' },
  });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { await fetch(`${base}/login`); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.equal(ready, true, 'server did not start');
    const dataUrl = `${base}/api/campaign-creatives?campaign=test`;
    assert.equal((await fetch(dataUrl)).status, 401);
    const post = (path, body, cookie) => fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
    assert.equal((await post('/api/login', { username: 'unknown', password })).status, 401);
    for (const username of ['emnet', 'blackyak']) {
      const login = await post('/api/login', { username, password });
      assert.equal(login.status, 200);
      const cookie = login.headers.get('set-cookie')?.split(';')[0];
      assert.match(cookie, /^dashboard_session=[0-9a-f]{64}$/);
      assert.equal((await fetch(dataUrl, { headers: { Cookie: cookie } })).status, 200);
      assert.equal((await post('/api/credentials', {}, cookie)).status, 405);
      assert.equal((await post('/api/logout', {}, cookie)).status, 200);
      assert.equal((await fetch(dataUrl, { headers: { Cookie: cookie } })).status, 401);
    }
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
