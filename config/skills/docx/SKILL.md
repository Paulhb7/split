---
name: docx
description: Create, read, and edit Microsoft Word documents (.docx) from the shell using the open-source python-docx library. Use whenever the user asks for a Word doc, .docx, memo, report, brief, letterhead, template, or any written deliverable they would open in Word/Pages/Google Docs. Covers headings, body, tables, lists, headers/footers, page numbers, images, and tables of contents. Output is a real .docx file, not a PDF or markdown.
---

# DOCX

Real Microsoft Word documents (`.docx`) from the shell. Open-source library
(`python-docx`, BSD-licensed), no Microsoft binaries required, no Anthropic
proprietary skill — clean-room implementation.

## Install once

```bash
python -m pip install --quiet python-docx
```

The `python-docx` package is BSD-licensed and pure Python. No Java, no
LibreOffice, no Microsoft Office needed to write a document. (Reading some
legacy `.doc` files does require LibreOffice — see "Reading legacy .doc"
below — but writing `.docx` is pure Python.)

## When to use docx vs. slides vs. HTML report

| Deliverable shape                         | Use                          |
| ----------------------------------------- | ---------------------------- |
| Memo, briefing note, white paper, report  | **docx** (this skill)        |
| Pitch deck, board pack, talk              | **frontend-slides** skill    |
| Interactive data report with charts       | analyst / HTML + Plotly      |
| Spreadsheet model with formulas           | **market-data** / openpyxl   |

If the user asks for "a Word doc" or "a memo", use this. If they ask for
"a deck" or "slides", use frontend-slides. If they say "send me what you
found", ask which they want.

## Minimal recipe — a consulting memo

```python
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()

# 1. Margins (Word default is 2.54cm — tighten for memo feel)
for section in doc.sections:
    section.top_margin    = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin   = Cm(2.2)
    section.right_margin  = Cm(2.2)

# 2. Set the base body style once
style = doc.styles['Normal']
style.font.name = 'Calibri'
style.font.size = Pt(11)

# 3. Header lines (kicker + title)
kicker = doc.add_paragraph()
kicker.alignment = WD_ALIGN_PARAGRAPH.LEFT
run = kicker.add_run('MEMO · 2026-05-27 · CONSULTANT')
run.bold = True
run.font.size = Pt(9)
run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

title = doc.add_heading('EV market — where the demand actually went', level=0)

# 4. TL;DR block
tldr = doc.add_paragraph()
tldr.add_run('TL;DR — ').bold = True
tldr.add_run(
    'Q1 2026 sales fell 12% YoY in the EU, mostly driven by Germany '
    '(–24%) after the subsidy cut. China kept growing (+18%). The US is flat.'
)

# 5. Sections
doc.add_heading('What we found', level=1)
doc.add_paragraph(
    'The decline is concentrated in two geographies and one segment …'
)

doc.add_heading('Why it matters', level=1)
doc.add_paragraph('…')

doc.add_heading('What we recommend', level=1)
for rec in [
    'Refocus the H2 launch plan on China and the US.',
    'Delay the European city-car SKU by one quarter.',
    'Reopen the subsidy-policy briefing the legal team paused.',
]:
    p = doc.add_paragraph(rec, style='List Bullet')

# 6. Sources section
doc.add_heading('Sources', level=1)
for src in sources:  # list of {title, publisher, year, url}
    p = doc.add_paragraph(style='List Number')
    p.add_run(f"{src['title']} — {src['publisher']} ({src['year']}) — ")
    run = p.add_run(src['url'])
    run.font.color.rgb = RGBColor(0x40, 0x40, 0x40)

doc.save('/Users/aristocat/Desktop/ev-market-memo.docx')
```

## Default Split memo template

A Split memo follows this structure, in this order. Use it as the default
unless the user asks for something else:

1. **Kicker line** (Calibri 9pt, bold, gray) — `MEMO · <YYYY-MM-DD> · <ROLE>`
2. **Title** (Heading 0 / Title style) — claims the finding, not just the topic
3. **TL;DR** — one paragraph, the headline finding + the one decision it
   unlocks. "Buy/hold/pass", "ship/delay", "the model breaks here".
4. **What we found** — the evidence, structured. Short paragraphs, tight
   lists, a table when comparison helps.
5. **Why it matters** — the implications for the user's actual decision.
6. **What we recommend** — numbered list. Each item is an action with an
   owner and a date when known.
7. **Risks & open questions** — what could break the recommendation, and
   what we couldn't verify.
8. **Sources** — every non-obvious claim cited. Numbered list, format
   `Title — Publisher (Year) — link`.
9. **Appendices** (optional) — long quotes, raw tables, full citations.

## Tables

Tables in `python-docx` work column-major; set the style after creation
to avoid the awful default grid.

```python
table = doc.add_table(rows=1, cols=4)
table.style = 'Light Grid Accent 1'      # named styles are most reliable
hdr = table.rows[0].cells
for i, h in enumerate(['Metric', 'Q4 2025', 'Q1 2026', 'Δ']):
    p = hdr[i].paragraphs[0]
    run = p.add_run(h)
    run.bold = True

for row in rows:
    cells = table.add_row().cells
    for i, v in enumerate(row):
        cells[i].text = str(v)
```

Right-align numeric columns with
`cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT`.

## Headers, footers, page numbers

```python
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

section = doc.sections[0]

# Header — left-aligned title repeat
header = section.header
header.paragraphs[0].text = 'EV market — Q1 2026 memo'
header.paragraphs[0].runs[0].font.size = Pt(9)

# Footer with page number
footer = section.footer
p = footer.paragraphs[0]
p.alignment = WD_ALIGN_PARAGRAPH.CENTER

run = p.add_run()
fld_char_begin = OxmlElement('w:fldChar')
fld_char_begin.set(qn('w:fldCharType'), 'begin')
instr = OxmlElement('w:instrText'); instr.text = 'PAGE'
fld_char_end = OxmlElement('w:fldChar')
fld_char_end.set(qn('w:fldCharType'), 'end')
run._r.append(fld_char_begin); run._r.append(instr); run._r.append(fld_char_end)
```

## Reading and editing

```python
doc = Document('/path/to/existing.docx')

# Walk paragraphs
for p in doc.paragraphs:
    print(p.style.name, ':', p.text)

# Walk tables
for table in doc.tables:
    for row in table.rows:
        print([cell.text for cell in row.cells])

# Find-and-replace (preserves formatting per run)
for p in doc.paragraphs:
    for run in p.runs:
        if 'old phrase' in run.text:
            run.text = run.text.replace('old phrase', 'new phrase')

doc.save('/path/to/edited.docx')
```

## Reading legacy `.doc` (not `.docx`)

`python-docx` only handles `.docx`. For legacy `.doc`, convert with
LibreOffice first:

```bash
soffice --headless --convert-to docx /path/to/legacy.doc --outdir /tmp/
```

Install: `brew install libreoffice` (macOS).

## Output discipline

- Save to `~/Desktop/<topic>-<YYYYMMDD>.docx` unless the user names a path.
- Report the absolute path after saving.
- Offer to `open <path>` — only run `open` if the user agrees.
- Never overwrite the user's source file. Append `-v2`, `-edited`, or a
  date suffix.
- Every non-obvious claim has a source line in the Sources section.
- Numbers carry units; currencies use ISO codes (EUR, not €).
