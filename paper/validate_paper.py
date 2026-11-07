#!/usr/bin/env python3
"""Validate compiled manuscript structure; visual review remains a separate step."""
import hashlib
import json
import re
import subprocess
from pathlib import Path
import pdfplumber
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent
tex = (ROOT/'main.tex').read_text()
abstract = re.search(r'\\begin\{abstract\}(.*?)\\end\{abstract\}', tex, re.S).group(1)
word_count = len(abstract.split())
assert 150 <= word_count <= 250, word_count
labels = re.findall(r'\\label\{([^}]+)\}', tex)
refs = re.findall(r'\\(?:ref|eqref)\{([^}]+)\}', tex)
assert len(labels) == len(set(labels)), 'Duplicate labels'
assert not (set(refs)-set(labels)), 'Undefined source references'
keys = set(re.findall(r'@\w+\{([^,]+),', (ROOT/'references.bib').read_text()))
cites = {key for group in re.findall(r'\\cite\{([^}]+)\}', tex) for key in group.split(',')}
assert cites == keys, 'Missing or unused bibliography entries'
log = (ROOT/'build/main.log').read_text()
assert not re.search(r'Overfull|undefined|Missing character|LaTeX Error|Font Warning', log), 'Compiler issue'
reader = PdfReader(ROOT/'paper.pdf')
assert len(reader.pages) == 7
for page in reader.pages:
    width, height = float(page.mediabox.width), float(page.mediabox.height)
    assert abs(width-595.28) < 1 and abs(height-841.89) < 1, 'Non-A4 page'
bounds = []
with pdfplumber.open(ROOT/'paper.pdf') as pdf:
    # pdfplumber retains word spacing more faithfully here than pypdf's
    # extraction heuristics for kerned Times glyphs such as the start of Vansh.
    extracted = '\n'.join(page.extract_text() or '' for page in pdf.pages)
    for value in ['Maurya Raheja', 'Vansh Nanda', 'Udhey Goyal',
                  '1024030078', '1024030091', '1024030084']:
        assert value in extracted, value
    for i, page in enumerate(pdf.pages, 1):
        chars = page.chars
        assert chars
        outside = [c for c in chars if c['x0'] < -1 or c['x1'] > page.width+1
                   or c['top'] < -1 or c['bottom'] > page.height+1]
        assert not outside, ('Text outside page', i)
        bounds.append({'page': i, 'left': round(min(c['x0'] for c in chars), 2),
                       'right': round(max(c['x1'] for c in chars), 2),
                       'top': round(min(c['top'] for c in chars), 2),
                       'bottom': round(max(c['bottom'] for c in chars), 2)})
assert '[10]' in extracted
fonts = subprocess.check_output(['pdffonts', str(ROOT/'paper.pdf')], text=True)
assert 'Type 3' not in fonts
for line in fonts.splitlines()[2:]:
    # emb/sub/uni are the three columns immediately before object ID/generation.
    assert line.split()[-5] == 'yes', ('Unembedded font', line)
(ROOT/'build/fonts.txt').write_text(fonts)
report = {'pages': 7, 'page_size': 'A4 595.28 x 841.89 pt',
          'abstract_words': word_count,
          'sections': len(re.findall(r'\\section\{', tex)),
          'figures': len(re.findall(r'\\begin\{figure\*?\}', tex)),
          'tables': len(re.findall(r'\\begin\{table\}', tex)),
          'equations': len(re.findall(r'\\begin\{equation\}', tex)),
          'bibliography_entries': len(keys), 'unresolved_citations_or_references': 0,
          'overfull_boxes': 0, 'font_substitution_warnings': 0,
          'missing_glyph_warnings': 0, 'text_outside_pages': 0,
          'all_fonts_embedded': True, 'text_bounds_pt': bounds,
          'sha256_pdf': hashlib.sha256((ROOT/'paper.pdf').read_bytes()).hexdigest(),
          'remaining_log_notices': 'Underfull line/page justification notices only.'}
(ROOT/'build/qa.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({k: v for k, v in report.items() if k != 'text_bounds_pt'}, indent=2))
