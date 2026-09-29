import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Presentation, PresentationFile, FileBlob} from '@oai/artifact-tool';
const root='C:/Users/USER/MarketingDev/workspaces/kim-subin-260922_1';
const tmp=path.join(root,'.presentation-build/initial-setup');
const skill='C:/Users/USER/.codex/plugins/cache/openai-primary-runtime/presentations/26.915.20218/skills/presentations';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const p=Presentation.create({slideSize:{width:1280,height:720}});
const fontPolicy={basis:'design',families:['Malgun Gothic']};
function text(s,txt,x,y,w,h,size=26,color='#263A46',bold=false){
 const b=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 b.text=txt;b.text.style={typeface:'Malgun Gothic',fontSize:size,color,bold,autoFit:'none'};return b;
}
function base(n,title,sub){const s=p.slides.add();s.background.fill='#F8FAF9';text(s,title,70,48,1140,72,44,'#132D2B',true);text(s,sub,72,130,1136,42,24,'#60726D');text(s,`마케팅 대시보드 초기 구축   ${n} / 2`,72,671,1136,28,16,'#72817C');return s;}
function row(s,num,title,body,y){text(s,num,72,y,65,52,32,'#14806B',true);text(s,title,157,y,290,48,29,'#132D2B',true);text(s,body,467,y,730,74,25);}
const a=base(1,'초기 구축 전, 마케터가 준비할 것','기존 보고서 한 개를 기준으로 필요한 정보와 데이터 위치를 정리합니다.');
row(a,'01','보고 기준 정하기','광고비·매출·ROAS 등 핵심 지표와\n기간·캠페인·매체별 조회 기준을 정합니다.',205);
row(a,'02','원본 자료 모으기','기존 보고서, 구글 시트 링크와\nBigQuery의 광고 데이터 위치를 확인합니다.',325);
row(a,'03','조회 권한 확인하기','데이터 담당자에게 조회 권한 설정을 요청하고,\n데이터 갱신 시점과 매출 기준을 확인합니다.',445);
text(a,'준비 결과: 보고서 예시 + 데이터 위치 + 지표 기준',72,580,1136,50,28,'#14806B',true);
a.speakerNotes.textFrame.setText('마케터가 먼저 할 일은 무엇을 볼지 정하고 원본 자료를 준비하는 것입니다. BigQuery는 광고 데이터가 저장된 곳입니다. 기존 데이터가 있는지와 갱신 시점을 담당자에게 확인합니다. 데이터가 없다면 수집과 적재 작업을 별도로 협의해야 합니다. 서비스 계정 등 기술적인 권한 설정은 담당자와 진행하며, 인증 키를 요청문에 붙여 넣지 않습니다. 매출은 광고 매체 기준인지 GA 기준인지 정합니다.');
const b=base(2,'구축 과정에서 마케터가 할 일','AI에 업무 요구를 설명하고, 결과가 원본 데이터와 맞는지 확인합니다.');
row(b,'01','첫 화면 요청하기','원하는 지표와 화면 예시를 전달하고,\n핵심 화면부터 작게 만듭니다.',202);
row(b,'02','데이터 연결 요청하기','준비한 데이터 위치와 조회 조건을 전달해\n예시 숫자를 실제 데이터로 바꿉니다.',307);
row(b,'03','숫자와 기능 검증하기','같은 기간의 원본 합계와 대조하고,\n필터·계산식·누락 여부를 확인해 수정 요청합니다.',412);
text(b,'AI 요청문 예시',72,536,1136,35,21,'#14806B',true);
text(b,'“선택한 기간의 매체별 광고비와 GA 매출을 보여줘.\n통합 ROAS는 전체 매출 ÷ 전체 광고비 × 100으로 계산해줘.”',72,578,1136,77,27,'#132D2B',true);
b.speakerNotes.textFrame.setText('요청문은 발표용 예시이며 실제 작업 당시의 기록은 아닙니다. 처음에는 예시 데이터로 화면을 확인하고 이후 실제 데이터를 연결할 수 있습니다. 연결 후에는 동일한 기간과 기준으로 원본 숫자를 대조해야 합니다. 오류를 발견하면 조회 기간, 캠페인 이름, 기대값과 실제값을 함께 전달합니다. 자동 테스트와 실제 데이터 검증을 마친 뒤 공용 테스트 환경에서 확인하고 서비스 반영을 진행합니다. 이 프로젝트는 work 브랜치에서 develop으로 검토를 요청하고, 검증 이후 Launcher를 통해 실제 서비스 반영을 검토합니다.');
const candidate=path.join(tmp,'candidate.pptx');
await(await PresentationFile.exportPptx(p)).save(candidate);
const finalPath=path.join(root,'outputs/initial-setup/마케터_대시보드_초기구축_2장.pptx');
await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath,pythonExecutable:'C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],explicitTotalSlideCount:2,fontPolicy,verifyArtifactToolImport:true,receiptPath:path.join(tmp,'validation.json')});
const final=await PresentationFile.importPptx(await FileBlob.load(finalPath));
for(let i=0;i<2;i++){const img=await final.export({slide:final.slides.items[i],format:'png',scale:1});await fs.writeFile(path.join(tmp,`slide-${i+1}.png`),new Uint8Array(await img.arrayBuffer()));}
console.log(finalPath);
