import zipfile, pathlib, xml.etree.ElementTree as E
p=next(pathlib.Path(__file__).parent.glob('*.xlsx'))
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(p) as z:
 r=E.fromstring(z.read('xl/worksheets/sheet1.xml'))
 print('validation count',len(r.findall('.//s:dataValidation',ns)))
 print('freeze pane', [v.attrib for v in r.findall('.//s:pane',ns)])
 r=E.fromstring(z.read('xl/worksheets/sheet2.xml'))
 print('date cell',E.tostring(r.find('.//s:c[@r="C15"]',ns),encoding='unicode'))
 print('xlsx integrity',z.testzip())
