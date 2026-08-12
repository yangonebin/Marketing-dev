# Marketing Dashboard

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
