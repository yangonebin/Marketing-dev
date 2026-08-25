# Marketing Dashboard - Codex Rules

## 목적
이 저장소는 마케팅 담당자가 광고 성과를 확인하고 분석하는 내부 대시보드다.

## 기본 원칙
- 기존 기능을 임의로 삭제하지 않는다.
- 사용자가 요청하지 않은 대규모 리팩터링은 하지 않는다.
- API Key, 비밀번호, 토큰을 코드에 직접 저장하지 않는다.
- UI 변경 후 빌드 오류가 없는지 확인한다.
- 데이터 계산식을 변경할 때는 기존 지표 정의를 먼저 확인한다.
- main 또는 develop 브랜치에 직접 push하지 않는다.

## Git 작업 규칙
- 실제 서비스: main
- 공용 테스트: develop
- 개별 작업: work/<작업자>/<작업명>

## 지표 기본 정의
- CTR = 클릭 / 노출 * 100
- CPC = 광고비 / 클릭
- CVR = 전환 / 클릭 * 100
- CPA = 광고비 / 전환
- ROAS = 전환매출 / 광고비 * 100
- 통합 ROAS는 매체별 ROAS 평균이 아니라 SUM(매출) / SUM(광고비) * 100으로 계산한다.

## 블랙야크 BigQuery 데이터 조회

### 가장 먼저 확인할 사항
- 블랙야크 데이터 조회 요청은 브라우저의 Google Cloud 콘솔 로그인이나 별도 BigQuery 플러그인부터 찾지 않는다.
- Marketing Dev Launcher가 관리하는 서비스 계정 JSON을 사용해 BigQuery REST API에 직접 POST 요청한다.
- 인증 파일의 기본 경로는 `C:\Users\USER\MarketingDev\secrets\sa-blackyak-61217_bigquery_key.json`이다.
- 인증 구현의 기준 코드는 `C:\Users\USER\MarketingDev\repo\server.js`의 `getGoogleAccessToken` 및 BigQuery 조회 부분이다.
- JSON의 private key, access token, client email 등 인증 정보는 터미널 출력, 답변, 로그, 커밋에 노출하지 않는다.

### BigQuery 연결 정보
- GCP 프로젝트: `planar-method-169102`
- 데이터셋: `61217_blackyak`
- 기본 광고 매체 뷰: `planar-method-169102.61217_blackyak.blackyak_media_data_view`
- BigQuery 리전: `asia-northeast3`
- OAuth scope: `https://www.googleapis.com/auth/bigquery.readonly`
- OAuth 토큰 URL: `https://oauth2.googleapis.com/token`
- 쿼리 POST URL: `https://bigquery.googleapis.com/bigquery/v2/projects/planar-method-169102/queries`
- 요청 본문은 `useLegacySql: false`, `location: "asia-northeast3"`를 사용한다.

### 인증 및 요청 순서
1. 서비스 계정 JSON을 읽는다. 파일 내용 자체는 출력하지 않는다.
2. 서비스 계정의 `client_email`과 `private_key`로 RS256 JWT assertion을 만든다.
3. OAuth 토큰 URL에 JWT bearer grant를 POST하여 access token을 받는다.
4. access token을 `Authorization: Bearer ...` 헤더에 넣어 BigQuery queries URL로 SQL을 POST한다.
5. `response.ok`, `errors`, `jobComplete`를 확인한 뒤 결과를 집계한다.
6. 작업용 스크립트를 만들었다면 저장소에 남기지 말고 제거하며, 완료 전 `git status --short`로 확인한다.

### 날짜와 비용 집계 규칙
- 사용자가 `어제`라고 하면 현재 대화의 한국시간(`Asia/Seoul`) 기준 날짜를 명시적으로 계산하여 SQL의 `DATE 'YYYY-MM-DD'`로 고정한다.
- 광고비는 기본적으로 `SUM(cost)`로 계산한다.
- 매체명은 추측하지 말고 먼저 해당 날짜의 `media`, `campaign_type`별 집계를 조회하여 실제 저장값을 확인한다.
- 네이버 SA의 실제 `media` 값은 `네이버 SA`다. 전체 비용은 파워링크와 브랜드검색 등 모든 `campaign_type`을 포함해 합산한다.
- 네이버 GFA는 별도 매체이므로 네이버 SA 집계에 포함하지 않는다.

대표 SQL:

```sql
SELECT
  CAST(datestamp AS STRING) AS date,
  media,
  SUM(cost) AS total_cost
FROM `planar-method-169102.61217_blackyak.blackyak_media_data_view`
WHERE datestamp = DATE '2026-08-24' -- 요청 날짜로 변경
  AND media = '네이버 SA'
GROUP BY datestamp, media;
```

세부 유형까지 검증할 때:

```sql
SELECT
  campaign_type,
  COUNT(*) AS row_count,
  SUM(cost) AS total_cost
FROM `planar-method-169102.61217_blackyak.blackyak_media_data_view`
WHERE datestamp = DATE '2026-08-24' -- 요청 날짜로 변경
  AND media = '네이버 SA'
GROUP BY campaign_type
ORDER BY total_cost DESC;
```

### 접근 오류 처리
- 샌드박스에서 인증 JSON 읽기 또는 외부 POST가 `EPERM`, DNS, 네트워크 오류로 막히면 같은 읽기 전용 요청을 권한 승인과 함께 다시 실행한다.
- 권한 요청에는 서비스 계정 JSON을 읽어 BigQuery에 읽기 전용 요청을 보낸다는 점을 명확히 적는다.
- 인증 파일이 실제로 없을 때만 사용자에게 경로나 설정을 다시 묻는다. 브라우저 로그인을 먼저 요구하지 않는다.
- 조회 결과가 없으면 0원으로 단정하기 전에 날짜, `media` 실제 값, 데이터 적재 완료 여부를 확인한다.

## 작업 완료 전
1. 변경 파일을 확인한다.
2. 가능한 경우 빌드/테스트를 수행한다.
3. 사용자가 이해하기 쉬운 한국어로 변경 내용을 요약한다.
