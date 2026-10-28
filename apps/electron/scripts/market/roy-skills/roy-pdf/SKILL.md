---
name: roy-pdf
description: 处理 PDF：生成报告和说明书、合并、拆分、删页、旋转、加水印、加页码、提取文字和表格、填写表单。
license: MIT（Roy 自写）
---

# PDF

| 要做的 | 用什么 |
|---|---|
| 合并、拆分、删页、旋转、加密、填表单 | `pypdf` |
| 提取文字、表格 | `pdfplumber` |
| 从零生成带中文的 PDF | `reportlab`（要注册中文字体），或先写 HTML / Word 再转 |
| 加水印、页码 | `reportlab` 画一页透明层，用 `pypdf` 叠上去 |

安装：`pip install pypdf pdfplumber reportlab`

## 合并 / 拆分 / 删页

```python
from pypdf import PdfReader, PdfWriter
w = PdfWriter()
for f in ['a.pdf', 'b.pdf']:
    for page in PdfReader(f).pages: w.add_page(page)
w.write('合并.pdf')

r = PdfReader('原文件.pdf'); w = PdfWriter()
for i, page in enumerate(r.pages):
    if i not in {2, 5}:          # 删第 3、6 页（从 0 开始数）
        w.add_page(page)
w.write('原文件_删页.pdf')
```

## 中文生成

```python
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table
from reportlab.lib.styles import getSampleStyleSheet
import os
font = next(p for p in [r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\simhei.ttf',
            '/System/Library/Fonts/PingFang.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'] if os.path.exists(p))
pdfmetrics.registerFont(TTFont('CN', font, subfontIndex=0) if font.endswith('.ttc') else TTFont('CN', font))
ss = getSampleStyleSheet()
for k in ('Normal', 'Title', 'Heading1', 'Heading2'): ss[k].fontName = 'CN'
ss['Normal'].wordWrap = 'CJK'
doc = SimpleDocTemplate('报告.pdf', pagesize=A4)
doc.build([Paragraph('标题', ss['Title']), Spacer(1, 12), Paragraph('正文……', ss['Normal'])])
```

## 水印 / 页码

用 reportlab 生成一页只有水印文字（或页码）的 PDF，再 `page.merge_page(水印页)` 叠到每页上。页码要每页单独生成一层。

## 提取文字

```python
import pdfplumber
with pdfplumber.open('文件.pdf') as pdf:
    for i, p in enumerate(pdf.pages, 1):
        print(i, p.extract_text() or '（这页可能是扫描图片）')
        for t in p.extract_tables(): print(t)
```

扫描件没有文字层，提取会是空的，要如实告诉用户需要 OCR。

## 交付前检查

重新打开输出文件确认页数对；生成的 PDF 把第一页转成图片看一眼不是空白、中文没有变成方块。不覆盖原文件。
