#!/usr/bin/env python3
"""Оборачивает безопасные русские строки в t() и печатает собранные ключи.
Безопасно = атрибуты (aria-label, placeholder, title, alt), notify('…'),
поля label/hint/group/description/tooltip в объектах, текст JSX в одну строку.
Остальное (шаблонные строки, данные, многострочный JSX) — руками."""
import re, sys, json
RU = r'[А-Яа-яЁё]'
keys = []
def add(k):
    if k not in keys: keys.append(k)
    return k
def wrap(path):
    s = open(path).read()
    lines = s.split('\n'); out = []
    for ln in lines:
        if re.match(r'\s*(//|\*|/\*)', ln) or not re.search(RU, ln):
            out.append(ln); continue
        # атрибуты
        ln = re.sub(r'\b(aria-label|placeholder|title|alt)="([^"{}]*' + RU + r'[^"{}]*)"',
                    lambda m: f"{m.group(1)}={{t('{add(m.group(2))}')}}" if "'" not in m.group(2) else m.group(0), ln)
        # notify('…')
        ln = re.sub(r"notify\('([^'`$]*" + RU + r"[^'`$]*)'", lambda m: f"notify(t('{add(m.group(1))}')", ln)
        # поля объектов
        ln = re.sub(r"\b(label|hint|group|description|tooltip|placeholder|title): '([^'`$]*" + RU + r"[^'`$]*)'",
                    lambda m: f"{m.group(1)}: t('{add(m.group(2))}')", ln)
        # текст JSX внутри одной строки: >Текст<
        def jsx(m):
            txt = m.group(2)
            if not re.search(RU, txt) or '{' in txt or '}' in txt or '=>' in txt: return m.group(0)
            lead = re.match(r'\s*', txt).group(0); trail = re.search(r'\s*$', txt).group(0)
            core = txt.strip()
            if "'" in core or '\\' in core: return m.group(0)
            return f"{m.group(1)}{lead}{{t('{add(core)}')}}{trail}{m.group(3)}"
        ln = re.sub(r'(>)([^<>{}]+)(</|<[A-Za-z])', jsx, ln)
        out.append(ln)
    s = '\n'.join(out)
    if "from '@/lib/i18n'" not in s and re.search(r"\bt\('", s):
        s = re.sub(r"^(import [^\n]*\n)", r"\1import { t } from '@/lib/i18n'\n", s, count=1, flags=re.M)
    open(path, 'w').write(s)
if __name__ == '__main__':
    for p in sys.argv[1:]: wrap(p)
    json.dump(keys, sys.stdout, ensure_ascii=False, indent=0)
