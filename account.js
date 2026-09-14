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
  controls.innerHTML = '<button type="button" id="my-account">내 계정</button><button type="button" id="connection-settings">연결 설정</button><button type="button" id="logout">로그아웃</button>';
  document.querySelector('main').prepend(controls);
  const dialog = document.createElement('dialog');
  dialog.className = 'account-dialog';
  dialog.innerHTML = '<h2>데이터 연결 설정</h2><p>새 서버에서는 서비스 계정 JSON 파일을 한 번 등록해 주세요. 파일은 서버에 보관됩니다.</p><p role="status" id="connection-status"></p><form id="credentials-form"><label for="credentials-file">서비스 계정 JSON 파일</label><input id="credentials-file" type="file" accept=".json,application/json" required><div class="account-actions"><button type="button" class="secondary" id="close-settings">닫기</button><button type="submit">등록</button></div></form>';
  document.body.append(dialog);
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
  const status = dialog.querySelector('[role=status]');
  document.querySelector('#connection-settings').onclick = async () => {
    dialog.showModal(); status.textContent = '설정을 확인하는 중…';
    try { const response = await fetch('/api/credentials'); const data = await response.json(); status.textContent = data.configured ? '인증 파일이 설정되어 있습니다.' : '등록된 인증 파일이 없습니다.'; }
    catch { status.textContent = '설정 정보를 불러오지 못했습니다.'; }
  };
  document.querySelector('#close-settings').onclick = () => dialog.close();
  document.querySelector('#logout').onclick = async () => {
    try { const response = await fetch('/api/logout', { method: 'POST' }); if (response.ok) location.replace('/login'); else throw new Error(); }
    catch { alert('로그아웃하지 못했습니다. 다시 시도해 주세요.'); }
  };
  document.querySelector('#credentials-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.target.querySelector('[type=submit]');
    button.disabled = true;
    try {
      const file = document.querySelector('#credentials-file').files[0];
      if (!file || file.size > 65536) throw new Error('64KB 이하의 JSON 파일을 선택해 주세요.');
      const response = await fetch('/api/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await file.text() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '등록하지 못했습니다.');
      status.textContent = '등록되었습니다. 새로고침하면 데이터에 적용됩니다.';
      event.target.reset();
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  };
}
