---
name: roy-xlsx
description: 做和改 Excel 表格（.xlsx）：销售报表、预算、考勤、成绩、库存、财务表，带公式、条件格式和图表；也用于读取、汇总、清洗已有表格。
license: MIT（Roy 自写）
---

# Excel 表格（.xlsx）

新建、改格式、写公式用 `openpyxl`；大量数据计算、汇总用 `pandas`。没有就装：`pip install openpyxl pandas`。

## 规则

- **数字按数字存**，日期按日期存，不要存成文本。
- 合计、占比、差额**用公式**（`=SUM(B2:B20)`），不要把算好的数写死，这样用户改数据会自动更新。
- 不覆盖原文件，另存为「原名_整理版.xlsx」。
- 读表时先看所有工作表名和表头，再动手：`wb.sheetnames`、`ws.max_row`、`ws.max_column`。

## 常用写法

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, Reference

wb = Workbook(); ws = wb.active; ws.title = '销售汇总'
ws.append(['月份', '销售额', '成本', '利润'])
for m, s, c in data:
    r = ws.max_row + 1
    ws.append([m, s, c, f'=B{r}-C{r}'])
last = ws.max_row
ws.append(['合计', f'=SUM(B2:B{last})', f'=SUM(C2:C{last})', f'=SUM(D2:D{last})'])

head = Font(bold=True, color='FFFFFF'); fill = PatternFill('solid', fgColor='4472C4')
for cell in ws[1]:
    cell.font, cell.fill, cell.alignment = head, fill, Alignment(horizontal='center')
for col in ws.columns:
    ws.column_dimensions[get_column_letter(col[0].column)].width = max(10, max(len(str(c.value or '')) for c in col) * 2)
ws.freeze_panes = 'A2'
for row in ws.iter_rows(min_row=2, min_col=2, max_col=4):
    for c in row: c.number_format = '#,##0.00'

chart = BarChart(); chart.title = '每月销售额'
chart.add_data(Reference(ws, min_col=2, min_row=1, max_row=last), titles_from_data=True)
chart.set_categories(Reference(ws, min_col=1, min_row=2, max_row=last))
ws.add_chart(chart, 'F2')
wb.save('销售汇总.xlsx')
```

## 检查公式（必须做）

openpyxl 只写公式不计算。交付前：
1. 有 LibreOffice 时重算一遍：`soffice --headless --convert-to xlsx --outdir 重算 文件.xlsx`，再用 `openpyxl.load_workbook(路径, data_only=True)` 读合计、差额、占比这些关键格子。
2. 值不能是 `None`、`#REF!`、`#DIV/0!`、`#VALUE!`、`#NAME?`；有就改公式。
3. 没法重算时，在回复里说明「公式在 Excel 打开后才会算出结果」，不要说已核对。
