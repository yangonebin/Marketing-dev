import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';
const wb = Workbook.create();
const input = wb.worksheets.add('성과 입력');
const guide = wb.worksheets.add('작성 안내');
const headers = ['날짜','캠페인','사업부','매체','광고 유형','원본 캠페인명','소재명','광고비','노출','클릭','조회','매체 전환수','매체 전환매출'];
for (const sheet of [input, guide]) {
  sheet.showGridLines = false;
  sheet.getRange('A1:M40').format.font = {name:'Arial',size:11,color:'#1F2937'};
  sheet.getRange('A1:M40').format.rowHeight = 25;
  sheet.getRange('A1:M40').format.verticalAlignment = 'center';
}
input.getRange('A1:M1').values = [headers];
input.getRange('A2:M1001').format.font = {name:'Arial',size:11,color:'#1F2937'};
input.getRange('A2:M1001').format.rowHeight = 23;
input.getRange('A2:M1001').format.fill = '#FFF9E8';
input.getRange('A2:A1001').setNumberFormat('yyyy-mm-dd');
input.getRange('H2:M1001').setNumberFormat('#,##0.##');
input.getRange('I2:K1001').setNumberFormat('#,##0');
input.getRange('H2:M1001').format.horizontalAlignment='right';
const widths=[14,21,12,18,17,36,27,17,17,15,17,17,20];
widths.forEach((width,i)=>input.getRangeByIndexes(0,i,1001,1).format.columnWidth=width);
const table=input.tables.add('A1:M1001',true,'MediaUploadData');
table.showFilterButton=true;
input.getRange('A1:M1').format.fill='#172B4D';
input.getRange('A1:M1').format.font={name:'Arial',size:11,bold:true,color:'#FFFFFF'};
input.getRange('A1:M1').format.rowHeight=32;
input.getRange('A1:M1').format.horizontalAlignment='center';
input.freezePanes.freezeRows(1);
input.getRange('C2:C1001').dataValidation={rule:{type:'list',values:['MKT','PERF']}};
for(const col of ['I','J','K']) input.dataValidations.add({range:`${col}2:${col}1001`,rule:{type:'whole',operator:'greaterThanOrEqual',formula1:0}});
for(const col of ['H','L','M']) input.dataValidations.add({range:`${col}2:${col}1001`,rule:{type:'decimal',operator:'greaterThanOrEqual',formula1:0}});
input.tabColor='#172B4D';
guide.tabColor='#94A3B8';
guide.getRange('A1:D35').format.columnWidth=24;
guide.getRange('B1:B35').format.columnWidth=22;
guide.getRange('C1:C35').format.columnWidth=37;
guide.getRange('D1:D35').format.columnWidth=83;
guide.getRange('A2').values=[['매체 성과 업로드 양식']];
guide.getRange('A2').format.font={name:'Arial',size:16,bold:true,color:'#172B4D'};
guide.getRange('A4').values=[['작성 방법']];
const notes=[
 '성과 입력 시트의 2행부터 작성합니다. 1행의 열 이름과 시트명은 유지해주세요.',
 '한 행은 날짜·캠페인·사업부·매체·광고 유형·원본 캠페인·소재별 하루 실적입니다.',
 '일자별 데이터만 입력합니다. 합계·누적 행과 소재 합계/소재 상세를 함께 넣지 마세요.',
 '실제 0은 숫자 0, 제공되지 않는 지표는 빈칸입니다. 숫자에 원·회 등 단위를 붙이지 마세요.',
 '광고비는 원 단위로 입력하고 기존 API 데이터와 부가세·수수료 포함 기준을 맞춥니다.',
 '매체 전환수·매체 전환매출은 선택 입력이며 GA 구매·매출과 별도 지표입니다.',
 '입력 검증은 1,000행까지 적용됩니다. 날짜는 yyyy-mm-dd로 입력합니다.',
 '이 파일은 입력 양식입니다. 대시보드 업로드·중복 교체 기능은 추후 구현 대상입니다.',
];
notes.forEach((note,i)=>guide.getRange(`A${5+i}`).values=[[note]]);
guide.getRange('A14:D14').values=[['열 이름','입력 구분','가상 입력 예시','작성 기준']];
const examples=[new Date('2026-09-09T00:00:00Z'),'Hima','MKT','구글','Pmax','BY_Hima_MKT_Pmax','Hima_영상_A',150000,100000,1200,25000,12,900000];
const rules=[
 ['필수','실적 발생일. 날짜 형식으로 입력'],['필수','대시보드 및 구글 시트의 캠페인명과 정확히 일치'],['필수','MKT 또는 PERF 선택'],['필수','기존 매체명과 일치. 새 매체는 동일한 이름으로 통일'],['필수','미디어믹스의 광고 유형과 일치'],['필수','플랫폼에서 운영한 실제 캠페인명'],['선택','소재별 실적이면 입력. 캠페인 합계만 입력할 때는 빈칸'],['제공 시 입력','원 단위, 0 이상 숫자'],['제공 시 입력','노출 횟수, 0 이상 정수'],['제공 시 입력','클릭 횟수, 0 이상 정수'],['선택','동영상 조회수. 미제공 시 빈칸'],['선택','플랫폼 전환수. GA 구매와 구분'],['선택','플랫폼 전환매출, 원 단위. GA 매출과 구분']
];
guide.getRange('A15:D27').values=headers.map((h,i)=>[h,rules[i][0],examples[i],rules[i][1]]);
guide.getRange('C15').setNumberFormat('yyyy-mm-dd');
guide.getRange('C22:C27').setNumberFormat('#,##0.##');
guide.getRange('A14:D14').format.fill='#172B4D';
guide.getRange('A14:D14').format.font={name:'Arial',size:11,bold:true,color:'#FFFFFF'};
guide.getRange('A14:D14').format.horizontalAlignment='center';
guide.getRange('C15:C27').format.fill='#F1F5F9';
guide.getRange('A29').values=[['자동 계산 예정: CTR = 클릭 / 노출 × 100, CPC = 광고비 / 클릭']];
guide.getRange('A30').values=[['CPM = 광고비 / 노출 × 1,000, CPV = 광고비 / 조회. 비율 지표는 입력하지 않습니다.']];
guide.getRange('A32').values=[['재업로드 기준: 같은 날짜·캠페인·사업부·매체·광고 유형·원본 캠페인·소재는 교체 예정']];
guide.getRange('A33').values=[['API와 겹치는 실적은 중복 합산되지 않도록 업로드 단계에서 확인할 예정입니다.']];
wb.recalculate();
console.log((await wb.inspect({kind:'table',range:'작성 안내!A14:D18',tableMaxRows:5,tableMaxCols:4,maxChars:1600})).ndjson);
const file=await SpreadsheetFile.exportXlsx(wb);
await file.save(fileURLToPath(new URL('./매체_성과_업로드_양식.xlsx',import.meta.url)));
console.log('XLSX saved');
for(const [sheet,range,name] of [['성과 입력','A1:M8','input'],['작성 안내','A1:D34','guide']]) {
 const preview=await wb.render({sheetName:sheet,range,scale:1,format:'png'});
 await fs.writeFile(new URL(`./${name}.png`,import.meta.url),new Uint8Array(await preview.arrayBuffer()));
}
