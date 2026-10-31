#!/usr/bin/env python3
"""Ключи t('…') из src, которых нет в src/lib/i18n-en.ts."""
import re,glob,os
ks=[]
for root,_,fs in os.walk('src'):
    for f in fs:
        if not f.endswith(('.ts','.tsx')) or f.startswith('i18n'): continue
        for m in re.finditer(r"\bt\('((?:[^'\\]|\\.)*)'",open(os.path.join(root,f)).read()):
            k=m.group(1).replace("\\'","'")
            if k not in ks: ks.append(k)
en=open('src/lib/i18n-en.ts').read()
have=set(m.replace("\\'","'") for m in re.findall(r"^\s*'((?:[^'\\]|\\.)*)':",en,re.M))
miss=[k for k in ks if k not in have]
print('\n'.join(miss))
