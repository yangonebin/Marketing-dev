import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

const salt = '4d184c47a406e992d87ff251ca4c0609';
const passwordHash = Buffer.from('7e6fa95f3618cdbbce07679ffcb66d93b1b8c06e14bd9d3a6ba1b835a7ace8eca79532b5cf6a4f38acb61ec878e86a6679616358ce8c5da8ab1b34467f420357', 'hex');
export function createAccounts(path) {
  let accounts = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : ['emnet', 'blackyak'].map(username => ({ id: username, username, salt, hash: passwordHash.toString('hex') }));
  const verify = (account, password) => account && typeof password === 'string' && password.length <= 256 && timingSafeEqual(scryptSync(password, account.salt, 64), Buffer.from(account.hash, 'hex'));
  return {
    find: id => accounts.find(item => item.id === id),
    authenticate(username, password) { const account = accounts.find(item => item.username === username); return verify(account, password) ? account.id : null; },
    update(id, currentPassword, username, password) {
      const account = accounts.find(item => item.id === id);
      if (!verify(account, currentPassword)) throw new Error('현재 비밀번호가 올바르지 않습니다.');
      if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) throw new Error('아이디는 영문, 숫자, _, ., -를 사용해 3~40자로 입력해 주세요.');
      if (accounts.some(item => item.id !== id && item.username === username)) throw new Error('이미 사용 중인 아이디입니다.');
      if (typeof password !== 'string' || (password.length > 0 && (password.length < 8 || password.length > 256))) throw new Error('새 비밀번호는 8~256자로 입력해 주세요.');
      const next = { ...account, username };
      if (password) { next.salt = randomBytes(16).toString('hex'); next.hash = scryptSync(password, next.salt, 64).toString('hex'); }
      const updated = accounts.map(item => item.id === id ? next : item);
      mkdirSync(dirname(path), { recursive: true });
      try { writeFileSync(`${path}.tmp`, JSON.stringify(updated), { mode: 0o600 }); renameSync(`${path}.tmp`, path); }
      catch { throw new Error('계정 정보를 저장하지 못했습니다.'); }
      accounts = updated;
    },
  };
}
export function createAuth() {
  const sessions = new Map();
  const attempts = new Map();
  const lifetime = 8 * 60 * 60 * 1000;
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, session] of sessions) if (session.expiry <= now) sessions.delete(key);
    for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key);
  }, 60000);
  cleanup.unref();
  const token = request => /(?:^|;\s*)dashboard_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie || '')?.[1];
  return {
    authenticated: request => (sessions.get(token(request))?.expiry || 0) > Date.now(),
    user: request => sessions.get(token(request))?.user,
    revoke(user) { for (const [key, session] of sessions) if (session.user === user) sessions.delete(key); },
    allowed(address) {
      let item = attempts.get(address);
      if (!item || item.until <= Date.now()) { item = { count: 0, until: Date.now() + 15 * 60000 }; attempts.set(address, item); }
      return ++item.count <= 10;
    },
    login(request, user) {
      sessions.delete(token(request));
      attempts.delete(request.socket.remoteAddress);
      const id = randomBytes(32).toString('hex');
      sessions.set(id, { expiry: Date.now() + lifetime, user });
      return id;
    },
    logout(request) { sessions.delete(token(request)); },
  };
}
