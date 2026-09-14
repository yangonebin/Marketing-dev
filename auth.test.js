import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scryptSync } from 'node:crypto';
import { createAccounts, createAuth, validateCredentials } from './auth.js';

test('account changes require current password, reject duplicates, and persist hashed credentials', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dashboard-auth-'));
  try {
    const file = join(directory, 'accounts.json');
    const hash = scryptSync('test-password', 'test-salt', 64).toString('hex');
    writeFileSync(file, JSON.stringify(['one', 'two'].map(id => ({ id, username: id, salt: 'test-salt', hash }))));
    const accounts = createAccounts(file);
    assert.equal(accounts.authenticate('one', 'wrong'), null);
    assert.throws(() => accounts.update('one', 'wrong', 'updated', ''), /현재 비밀번호/);
    assert.throws(() => accounts.update('one', 'test-password', 'two', ''), /이미 사용/);
    accounts.update('one', 'test-password', 'updated', 'new-password');
    const reloaded = createAccounts(file);
    assert.equal(reloaded.authenticate('one', 'test-password'), null);
    assert.equal(reloaded.authenticate('updated', 'test-password'), null);
    assert.equal(reloaded.authenticate('updated', 'new-password'), 'one');
    assert.equal(reloaded.authenticate('two', 'test-password'), 'two');
    assert.ok(!readFileSync(file, 'utf8').includes('new-password'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('sessions are revoked per account and login attempts are limited', () => {
  const auth = createAuth();
  const request = { headers: {}, socket: { remoteAddress: 'local' } };
  const token = auth.login(request, 'one');
  request.headers.cookie = `dashboard_session=${token}`;
  assert.equal(auth.authenticated(request), true);
  assert.equal(auth.user(request), 'one');
  auth.revoke('one');
  assert.equal(auth.authenticated(request), false);
  for (let i = 0; i < 10; i++) assert.equal(auth.allowed('remote'), true);
  assert.equal(auth.allowed('remote'), false);
});
test('uploaded data must be a service account key', () => {
  assert.throws(() => validateCredentials({ rows: [] }));
  assert.throws(() => validateCredentials({ type: 'service_account', client_email: 'test@example.gserviceaccount.com', private_key: 'not-a-key' }));
});
