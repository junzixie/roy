---
name: roy-docx
description: 写、改、审阅 Word 文档（.docx）：报告、方案、合同、通知、简历、会议纪要。新建、按模板填写、替换文字、加表格和图片、批注修订、转 PDF 时使用。
license: MIT（Roy 自写）
---

# Word 文档（.docx）

用 Python 的 `python-docx` 处理。没有就先装：`pip install python-docx`。

## 先判断是哪种活

| 用户要的 | 做法 |
|---|---|
| 新写一份文档 | 写一个生成脚本，一次性生成，不要手工逐段拼 |
| 改已有文档里的几处文字 | 打开原文件，按段落 / 表格单元格查找替换，**保留原格式**，另存为新文件 |
| 按模板填写 | 模板里用 `{{字段}}` 占位，脚本逐个替换（注意一个占位符可能被拆成好几个 run） |
| 读内容 | 逐段读 `doc.paragraphs`，表格读 `doc.tables`，不要只读第一段 |

不要覆盖用户原文件：输出文件名用「原名_修改版.docx」，已存在就加 (2)、(3)。

## 中文排版要点

```python
from docx import Document
from docx.shared import Pt, Cm
from docx.oxml.ns import qn

doc = Document()
style = doc.styles['Normal']
style.font.name = '宋体'
style.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')   # 必须设东亚字体，否则中文不生效
style.font.size = Pt(12)                                 # 小四
for s in doc.sections:
    s.top_margin = s.bottom_margin = Cm(2.54)
    s.left_margin = s.right_margin = Cm(3.17)
```

- 标题用 `doc.add_heading(text, level)`，再把标题样式的东亚字体改成黑体。
- 公文常用：标题二号方正小标宋（没有就用黑体）、正文三号仿宋、行距固定 28 磅。
- 段首缩进两字：`p.paragraph_format.first_line_indent = Pt(24)`（按字号 ×2）。

## 替换文字但保留格式

占位符可能被拆成多个 run，先合并再替换：

```python
def replace_in_paragraph(p, old, new):
    full = ''.join(r.text for r in p.runs)
    if old not in full:
        return False
    first = p.runs[0]
    first.text = full.replace(old, new)
    for r in p.runs[1:]:
        r.text = ''
    return True
```

表格、页眉页脚里的段落也要遍历：`for t in doc.tables: for row in t.rows: for c in row.cells: c.paragraphs`，以及 `section.header.paragraphs`。

## 表格和图片

```python
t = doc.add_table(rows=1, cols=3)
t.style = 'Table Grid'
for i, h in enumerate(['项目', '数量', '金额']):
    t.rows[0].cells[i].text = h
doc.add_picture('chart.png', width=Cm(15))
```

## 交付前检查

1. 重新打开生成的文件读一遍，确认段落数、表格内容、替换处都对。
2. 电脑上有 LibreOffice 时，转成 PDF 再转图片看一眼版面：
   `soffice --headless --convert-to pdf 文件.docx`
3. 回复里说清楚改了哪几处；没改成的如实说明。
