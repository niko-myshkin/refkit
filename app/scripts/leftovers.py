#!/usr/bin/env python3
"""Печатает строки с русским, которые остались вне t() и вне комментариев."""
import re,sys
for f in sys.argv[1:]:
    inblock=False
    for i,l in enumerate(open(f).read().split('\n'),1):
        if inblock:
            if '*/' in l: inblock=False
            continue
        if re.match(r'\s*(//|\*)',l): continue
        if re.match(r'\s*/\*',l) and '*/' not in l: inblock=True; continue
        l=re.sub(r"\bt\('(?:[^'\\]|\\.)*'(, \{[^}]*\})?\)",'',l)
        l=re.sub(r'\s//.*$','',l); l=re.sub(r'/\*.*?\*/','',l)
        if re.search(r'[А-Яа-яЁё]',l): print(f"{f.split('src/')[-1]}:{i}: {l.strip()[:200]}")
