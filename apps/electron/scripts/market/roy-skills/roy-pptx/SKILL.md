---
name: roy-pptx
description: 按大纲做 PPT（.pptx）：汇报、路演、培训、课件。生成标题页、要点页、数据卡片、图表、表格、图片页、结束页；也用于读取或修改已有 PPT。
license: MIT（Roy 自写）
---

# PPT 演示（.pptx）

用 `python-pptx`：`pip install python-pptx`。

## 先定结构再写代码

1. 先列大纲：每页一个标题 + 3～5 条要点，一页只讲一件事。
2. 定配色：一个主色 + 一个强调色 + 深灰字 + 浅底，全篇统一。
3. 写**一个**生成脚本，页面数据放在列表里，循环生成，方便改。

## 基础模板（16:9）

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

prs = Presentation(); prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
BLANK = prs.slide_layouts[6]
MAIN, DARK = RGBColor(0x1F, 0x4E, 0x79), RGBColor(0x33, 0x33, 0x33)
FONT = '微软雅黑'

def text(slide, s, x, y, w, h, size=18, bold=False, color=DARK, align=PP_ALIGN.LEFT):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame; tf.word_wrap = True
    lines = s if isinstance(s, list) else [s]
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text, p.alignment = line, align
        p.font.size, p.font.bold, p.font.color.rgb, p.font.name = Pt(size), bold, color, FONT
        p.space_after = Pt(8)
    return tb

def title_slide(t, sub):
    s = prs.slides.add_slide(BLANK)
    bg = s.shapes.add_shape(1, 0, 0, prs.slide_width, prs.slide_height)
    bg.fill.solid(); bg.fill.fore_color.rgb = MAIN; bg.line.fill.background()
    text(s, t, 1, 2.6, 11.3, 1.2, 40, True, RGBColor(255, 255, 255))
    text(s, sub, 1, 3.9, 11.3, 0.8, 20, False, RGBColor(0xDD, 0xE6, 0xF0))

def bullet_slide(t, points):
    s = prs.slides.add_slide(BLANK)
    text(s, t, 0.7, 0.4, 12, 0.9, 30, True, MAIN)
    text(s, ['• ' + p for p in points], 0.9, 1.6, 11.5, 5.2, 20)
```

数据页用 `slide.shapes.add_chart(...)`（`pptx.chart.data.CategoryChartData`），表格用 `add_table`。

## 版面规矩

- 正文字号不小于 16，标题 28～36；一页文字超过 7 行就拆页。
- 不要让文字超出文本框：长段落改成要点，或减小到下限后拆页。
- 图片按比例缩放，只给宽度或只给高度。

## 交付前检查

有 LibreOffice 时转 PDF 再转图片，逐页看有没有溢出、重叠、空白页：
`soffice --headless --convert-to pdf 演示.pptx`。发现问题改脚本重新生成。
