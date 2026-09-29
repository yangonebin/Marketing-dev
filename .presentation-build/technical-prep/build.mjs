import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Presentation,PresentationFile} from '@oai/artifact-tool';
const root='C:/Users/USER/MarketingDev/workspaces/kim-subin-260922_1';
const tmp=path.join(root,'.presentation-build/technical-prep');
const skill='C:/Users/USER/.codex/plugins/cache/openai-primary-runtime/presentations/26.915.20218/skills/presentations';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const p=Presentation.create({slideSize:{width:1280,height:720}});
const C={ink:'#122E38',muted:'#566D76',green:'#007D70',mint:'#E2F4EE',pale:'#EDF2F5',white:'#FFFFFF'};
function txt(s,t,x,y,w,h,sz=25,color=C.ink,bold=false){const q=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});q.text=t;q.text.style={typeface:'Malgun Gothic',fontSize:sz,color,bold,autoFit:'none'};return q;}
function shape(s,x,y,w,h,fill){return s.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:'none',width:0}});}
function base(n,title,subtitle){const s=p.slides.add();s.background.fill=C.white;txt(s,`구축 전 준비  ${n}/2`,64,35,1150,30,18,C.green,true);txt(s,title,64,83,1150,68,43,C.ink,true);txt(s,subtitle,64,160,1150,40,24,C.muted);return s;}
function diagram(s,labels,captions,links){const xs=[64,468,872],nodes=[];for(let i=0;i<3;i++){const x=xs[i];nodes.push(shape(s,x,249,344,131,i===1?C.ink:C.mint));txt(s,labels[i],x+22,267,303,49,31,i===1?C.white:C.ink,true);txt(s,captions[i],x+22,321,303,37,22,i===1?'#C8DFDF':C.green);}
for(let i=0;i<2;i++){s.shapes.connect(nodes[i],nodes[i+1],{kind:'straight',fromSide:'right',toSide:'left',line:{fill:C.green,width:3},head:{type:'triangle',width:'med',length:'med'}});txt(s,links[i],xs[i]+287,211,175,29,18,C.green,true);}}
function col(s,i,title,body){const x=[64,468,872][i];txt(s,title,x,419,344,41,26,C.ink,true);txt(s,body,x,474,344,105,23,C.muted);}
function footer(s,t){shape(s,64,613,1152,63,C.pale);txt(s,t,84,628,1112,37,23,C.ink,true);}
const a=base(1,'데이터와 조회 권한 준비','보고 싶은 지표를 정한 뒤, 데이터 수집과 연결을 개발팀에 요청합니다.');
diagram(a,['원본 데이터','BigQuery','대시보드 서버'],['광고 매체 · GA · 운영 시트','광고 데이터를 저장·정리','필요한 데이터 조회·집계'],['수집·갱신','조회 결과']);
col(a,0,'① 필요한 데이터 정의','지표·기간·상세 수준 정하기\n예: 일자별·캠페인별 실적\n원본 위치와 매출 기준 전달');
col(a,1,'② 수집·정리 방식 협의','자동 수집 방법과 갱신 시점\n매체·캠페인 연결 기준\n원본 합계 대조 기준');
col(a,2,'③ 서버 조회 권한 요청','연결할 테이블·뷰 지정\n서비스 계정의 조회 권한 설정\n인증 정보는 서버에서 관리');
footer(a,'마케터 준비물   기존 보고서 예시 + 필요한 항목 목록 + 원본 데이터 위치');
a.speakerNotes.textFrame.setText('마케터는 지표와 집계 단위를 정의하고, 개발팀 또는 데이터 담당자는 수집 방식과 권한을 설정합니다. BigQuery에 데이터가 이미 있는지 먼저 확인하고, 없다면 과거 데이터 적재와 정기 갱신을 함께 협의합니다. 광고 매체마다 지원되는 수집 방법이 다릅니다. 테이블은 데이터 표, 뷰는 정해진 규칙으로 데이터를 보여주는 조회 창구입니다. 서비스 계정은 서버가 데이터를 읽는 데 사용하는 프로그램용 계정입니다. 클라우드 환경에서는 연결된 서비스 계정으로 인증할 수 있으므로 JSON 키 발급을 일괄 요구하지 않습니다. 광고주에게 인증 키를 전달하지 않습니다. Google Sheets 등 원본의 접근 권한도 별도로 설정합니다. 참고: https://docs.cloud.google.com/bigquery/docs/loading-data ; https://docs.cloud.google.com/bigquery/docs/authentication');
const b=base(2,'개발·배포·접속 환경 준비','시작 전에 개발팀과 회사 저장소, 배포 방식, 광고주 접근 기준을 협의합니다.');
diagram(b,['회사 GitHub','운영 서버','광고주 접속'],['코드와 수정 이력 관리','실행 환경 · Cloud Run 등','웹 주소로 로그인 후 이용'],['검토 후 배포','화면 제공']);
col(b,0,'① 저장소·작업 환경 요청','회사 관리 저장소와 팀원 권한\n작업 PC의 실행 도구 준비\n개발·테스트·반영 절차 합의');
col(b,1,'② 서버·배포 방식 협의','테스트·운영 환경 구분\n배포 조건과 서비스 주소 확정\n운영 담당자·비용 관리 협의');
col(b,2,'③ 로그인·공개 범위 결정','광고주 계정과 조회 범위 설정\n원본 시트는 비공개 권한 관리\n공유 전 로그인·데이터 검증');
footer(b,'개발팀에 전달   이용 대상 + 외부 공유 일정 + 참여 인원 + 운영 담당자');
b.speakerNotes.textFrame.setText('권장 준비 절차이며 회사별 정책과 환경은 개발팀에 확인합니다. 회사 GitHub는 회사가 관리하는 저장소를 뜻하며 공용 비밀번호로 하나의 계정을 공유한다는 뜻이 아닙니다. 개발 전에 저장소를 준비할 수 있는지 협의하면 별도 이관을 줄일 수 있습니다. GitHub는 코드 관리, 운영 서버는 실행, BigQuery는 데이터 저장을 담당합니다. 광고주는 GitHub 접근 권한이 아니라 대시보드 이용 권한을 받습니다. 회사 저장소가 있어도 로컬 PC에서 개발할 수 있습니다. 특정 브랜치 이름이나 자동 배포 방식을 보편적인 사내 규칙으로 단정하지 않고 검토 및 반영 기준을 합의합니다. Cloud Run은 서버 운영 방식의 예시입니다. 서버 데이터 조회 권한과 광고주 로그인 권한은 별개입니다. 원본 시트를 비공개로 바꿀 때 서버 조회 계정의 권한도 유지해야 합니다. 참고: https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization ; https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments ; https://docs.cloud.google.com/bigquery/docs/authentication');
const candidate=path.join(tmp,'candidate.pptx');await(await PresentationFile.exportPptx(p)).save(candidate);
await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:path.join(root,'outputs/technical-prep/대시보드_기술준비사항_2장_최종.pptx'),pythonExecutable:'C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],explicitTotalSlideCount:2,fontPolicy:{basis:'design',families:['Malgun Gothic']},verifyArtifactToolImport:true,receiptPath:path.join(tmp,'validation-final.json')});
console.log('Created 2-slide presentation');


