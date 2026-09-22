const loginForm = document.querySelector('#login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = loginForm.querySelector('button');
    const error = document.querySelector('#login-error');
    button.disabled = true; error.textContent = '';
    try {
      const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(loginForm))) });
      if (!response.ok) throw new Error(response.status === 429 ? '잠시 후 다시 시도해 주세요.' : 'ID 또는 비밀번호를 확인해 주세요.');
      location.replace('/');
    } catch (reason) { error.textContent = reason.message; }
    finally { button.disabled = false; }
  });
} else {
  // Expired sessions return to login, including requests made by the existing dashboard.
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401) location.replace('/login');
    return response;
  };
  const controls = document.createElement('div');
  controls.className = 'account-controls';
  controls.innerHTML = '<button type="button" id="my-account">내 계정</button><button type="button" id="logout">로그아웃</button>';
  document.querySelector('main').prepend(controls);
  const accountDialog = document.createElement('dialog');
  accountDialog.className = 'account-dialog login-card';
  accountDialog.innerHTML = '<h2>내 계정</h2><form id="account-form"><label for="account-username">아이디</label><input id="account-username" name="username" autocomplete="username" pattern="[a-zA-Z0-9_.\\-]{3,40}" required maxlength="40"><label for="current-password">현재 비밀번호</label><input id="current-password" name="currentPassword" type="password" autocomplete="current-password" required maxlength="256"><label for="new-password">새 비밀번호 (변경할 때만 입력)</label><input id="new-password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="256"><label for="confirm-password">새 비밀번호 확인</label><input id="confirm-password" type="password" autocomplete="new-password" maxlength="256"><p role="status"></p><div class="account-actions"><button type="button" class="secondary" id="close-account">닫기</button><button type="submit">저장 후 다시 로그인</button></div></form>';
  document.body.append(accountDialog);
  document.querySelector('#close-account').onclick = () => accountDialog.close();
  document.querySelector('#my-account').onclick = async () => {
    accountDialog.querySelector('form').reset();
    const message = accountDialog.querySelector('[role=status]');
    message.textContent = '';
    accountDialog.showModal();
    try { const response = await fetch('/api/account'); const data = await response.json(); document.querySelector('#account-username').value = data.username || ''; }
    catch { message.textContent = '계정 정보를 불러오지 못했습니다.'; }
  };
  document.querySelector('#account-form').onsubmit = async event => {
    event.preventDefault();
    const message = accountDialog.querySelector('[role=status]');
    const data = Object.fromEntries(new FormData(event.target));
    if (data.password !== document.querySelector('#confirm-password').value) { message.textContent = '새 비밀번호가 일치하지 않습니다.'; return; }
    const button = event.target.querySelector('[type=submit]'); button.disabled = true;
    try {
      const response = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '변경하지 못했습니다.');
      location.replace('/login');
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  };
  document.querySelector('#logout').onclick = async () => {
    try { const response = await fetch('/api/logout', { method: 'POST' }); if (response.ok) location.replace('/login'); else throw new Error(); }
    catch { alert('로그아웃하지 못했습니다. 다시 시도해 주세요.'); }
  };
}
