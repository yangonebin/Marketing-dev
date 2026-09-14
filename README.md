# Marketing Dashboard

## 로그인 및 데이터 인증 설정

고정 내부 계정으로 로그인하면 기존 대시보드를 이용할 수 있습니다. 로그인은 8시간 유지되며 서버 재시작 시 해제됩니다. 비밀번호는 서버에서 해시로 검증하며 계정 DB는 사용하지 않습니다.

초기 계정은 `emnet`, `blackyak` 두 개입니다. 초기 비밀번호는 별도로 전달된 값을 사용합니다. **내 계정**에서 현재 비밀번호를 확인한 후 본인의 아이디 또는 비밀번호를 변경할 수 있습니다. 변경하면 해당 계정의 모든 로그인이 해제됩니다. 변경 내역은 Git에서 제외되는 `.dashboard-data/accounts.json`에 해시로 저장됩니다. 서버 이관 시 이 파일도 안전하게 이전해야 변경한 계정 정보가 유지됩니다. 이전하지 않으면 초기 계정으로 시작합니다.

로그인 후 오른쪽 위 **연결 설정**에서 Google 서비스 계정 JSON 인증키를 등록합니다. 광고 데이터 업로드가 아닙니다. 인증 파일은 `.dashboard-data/google-credentials.json`에 저장되고 Git에서 제외되며 다운로드 경로로 공개되지 않습니다. 등록 파일을 우선 사용하고, 없으면 기존 Launcher의 `GOOGLE_APPLICATION_CREDENTIALS` 설정을 사용합니다. 등록 시 파일 형식을 검사하며 실제 Google 권한은 데이터 조회 시 확인됩니다.

새 서버로 이관한 뒤 인증키를 다시 등록하거나 `GOOGLE_APPLICATION_CREDENTIALS`를 설정하세요. 서버의 `.dashboard-data` 폴더는 지속 저장되는 위치여야 합니다. HTTPS 운영 서버에서는 `DASHBOARD_SECURE_COOKIE=true`를 설정하세요. 같은 로그인 계정을 공유하는 사람은 모두 인증키를 교체할 수 있습니다.

Marketing Dev Launcher로 관리하는 마케팅 자동화 대시보드 프로젝트입니다.

- production: main
- shared test: develop
- feature work: work/<person>/<task>

## 실행 방법

별도 설치 없이 아래 명령으로 테스트용 대시보드를 실행할 수 있습니다.

```powershell
npm run dev
```

기본 미리보기 주소는 `http://localhost:5173`입니다.

Marketing Dev Launcher처럼 실행 시 `-p` 또는 `--port`로 미리보기 포트를 전달하는 경우에도 해당 포트를 사용합니다.

지표 계산 테스트는 아래 명령으로 실행합니다.

```powershell
npm test
```

이 프로젝트는 별도 번들링이 필요 없는 정적 대시보드입니다. 배포 전 빌드 검증은 아래 명령으로 실행하며 지표 테스트도 함께 확인합니다.

```powershell
npm run build
```
