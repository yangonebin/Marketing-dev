from zipfile import ZipFile
from pathlib import Path
import xml.etree.ElementTree as E
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[2]
ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
z=ZipFile(root/'outputs/technical-prep/대시보드_기술준비사항_2장_최종.pptx')
def color(node,path,default='#122E38'):
 e=node.find(path,ns)
 return '#'+e.get('val') if e is not None else default
for n in [1,2]:
 s=E.fromstring(z.read(f'ppt/slides/slide{n}.xml'))
 img=Image.new('RGB',(1280,720),'white');d=ImageDraw.Draw(img)
 for sp in s.find('p:cSld/p:spTree',ns):
  pr=sp.find('p:spPr',ns)
  if pr is None:continue
  xf=pr.find('a:xfrm',ns)
  if xf is None:continue
  off=xf.find('a:off',ns);ex=xf.find('a:ext',ns)
  if off is None or ex is None:continue
  x,y,w,h=[int(v)/9525 for v in [off.get('x'),off.get('y'),ex.get('cx'),ex.get('cy')]]
  fill=pr.find('a:solidFill',ns)
  if fill is not None:d.rectangle((x,y,x+w,y+h),fill=color(fill,'a:srgbClr'))
  if sp.tag.endswith('cxnSp'):
   d.line((x,y,x+w,y+h),fill='#007D70',width=3)
   d.polygon([(x+w,y+h),(x+w-10,y+h-5),(x+w-10,y+h+5)],fill='#007D70')
  body=sp.find('p:txBody',ns)
  if body is None:continue
  cy=y+4.8
  for para in body.findall('a:p',ns):
   rp=para.find('a:r/a:rPr',ns)
   if rp is None:continue
   sz=float(rp.get('sz','1800'))/100*96/72
   font=ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf' if rp.get('b')=='1' else 'C:/Windows/Fonts/malgun.ttf',round(sz))
   t=''.join(para.itertext())
   for line in t.split('\n'):
    if d.textlength(line,font=font)>w-19.2:print('WIDTH CHECK',n,round(d.textlength(line,font=font)),round(w-19.2))
    d.text((x+9.6,cy),line,font=font,fill=color(rp,'a:solidFill/a:srgbClr'),anchor='lt')
    cy+=sz*1.25
 img.save(Path(__file__).parent/f'qa-{n}.png')
print('QA render completed from exported slide XML')

