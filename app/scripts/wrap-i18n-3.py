#!/usr/bin/env python3
"""Третий проход: шаблонные строки `…${x}…` и JSX-текст с {x} → t('…{x}…', { x }).
Идёт от внутренних к внешним. Комментарии пропускает."""
import re, sys
RU = r'[А-Яа-яЁё]'
def ident(expr, used):
    m = re.findall(r'[A-Za-z_]\w*', expr)
    base = 'n' if re.search(r'\.length|\bcount\b', expr) and not m[-1:]==['title'] else (m[-1] if m else 'a')
    if base in ('length',) and len(m) > 1: base = 'n'
    name, i = base, 2
    while name in used: name = f'{base}{i}'; i += 1
    used.add(name); return name
def split_expr(s, i):
    """s[i] стоит сразу после '${'; вернуть (expr, позиция после '}')"""
    depth, j = 1, i
    while j < len(s):
        c = s[j]
        if c in '\'"':
            q = c; j += 1
            while j < len(s) and s[j] != q:
                j += 2 if s[j] == '\\' else 1
        elif c == '`':
            j += 1
            while j < len(s) and s[j] != '`': j += 2 if s[j] == '\\' else 1
        elif c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0: return s[i:j], j + 1
        j += 1
    return None, i
def template_at(s, i):
    """s[i]=='`'. вернуть (тексты, выражения, конец) или None, если внутри есть вложенный шаблон."""
    j, parts, exprs, cur = i + 1, [], [], ''
    while j < len(s):
        c = s[j]
        if c == '\\': cur += s[j:j+2]; j += 2; continue
        if c == '`': parts.append(cur); return parts, exprs, j + 1
        if c == '$' and s[j+1:j+2] == '{':
            e, k = split_expr(s, j + 2)
            if e is None or '`' in e: return None
            parts.append(cur); cur = ''; exprs.append(e); j = k; continue
        cur += c; j += 1
    return None
def convert(parts, exprs):
    used = set(); names = [ident(e, used) for e in exprs]
    text = parts[0]
    for n, p in zip(names, parts[1:]): text += '{' + n + '}' + p
    text = text.replace("'", "\\'")
    pairs = ', '.join(n if n == e.strip() else f'{n}: {e.strip()}' for n, e in zip(names, exprs))
    return f"t('{text}'" + (f', {{ {pairs} }}' if exprs else '') + ')'
def pass_templates(line):
    out, i, changed = '', 0, False
    while i < len(line):
        c = line[i]
        if c in '\'"':
            j = i + 1
            while j < len(line) and line[j] != c: j += 2 if line[j] == '\\' else 1
            out += line[i:j+1]; i = j + 1; continue
        if c == '`':
            r = template_at(line, i)
            if r and any(re.search(RU, p) for p in r[0]):
                parts, exprs, end = r
                out += convert(parts, exprs); i = end; changed = True; continue
            if r: out += line[i:r[2]]; i = r[2]; continue
        out += c; i += 1
    return out, changed
def jsx_text(line):
    def sub(m):
        txt = m.group(2)
        if not re.search(RU, txt) or '=>' in txt: return m.group(0)
        pieces, exprs, pos = [], [], 0
        while pos < len(txt):
            if txt[pos] == '{':
                e, k = split_expr(txt, pos + 1)
                if e is None: return m.group(0)
                exprs.append(e); pieces.append(None); pos = k
            else:
                k = txt.find('{', pos); k = len(txt) if k == -1 else k
                pieces.append(txt[pos:k]); pos = k
        # собрать
        text, used, names = '', set(), []
        for p in pieces:
            if p is None:
                n = ident(exprs[len(names)], used); names.append(n); text += '{' + n + '}'
            else: text += p
        core = text.strip()
        if not re.search(RU, core) or "'" in core: return m.group(0)
        lead = re.match(r'\s*', text).group(0); trail = re.search(r'\s*$', text).group(0)
        pairs = ', '.join(n if n == e.strip() else f'{n}: {e.strip()}' for n, e in zip(names, exprs))
        call = f"t('{core}'" + (f', {{ {pairs} }}' if exprs else '') + ')'
        return f"{m.group(1)}{lead}{{{call}}}{trail}{m.group(3)}"
    return re.sub(r'(>)((?:[^<>{}]|\{[^{}]*\})+)(</|<[A-Za-z])', sub, line)
def wrap(path):
    out, block = [], False
    for ln in open(path).read().split('\n'):
        if block:
            out.append(ln)
            if '*/' in ln: block = False
            continue
        if re.match(r'\s*/\*', ln) and '*/' not in ln: block = True; out.append(ln); continue
        if re.match(r'\s*(//|\*|import )', ln) or not re.search(RU, ln): out.append(ln); continue
        code, tail = ln, ''
        m = re.search(r'\s//\s', ln)
        if m and ln[:m.start()].count("'") % 2 == 0 and ln[:m.start()].count('"') % 2 == 0 and ln[:m.start()].count('`') % 2 == 0:
            code, tail = ln[:m.start()], ln[m.start():]
        for _ in range(4):
            code, ch = pass_templates(code)
            if not ch: break
        code = jsx_text(code)
        out.append(code + tail)
    s = '\n'.join(out)
    if "from '@/lib/i18n'" not in s and re.search(r"\bt\('", s):
        s = re.sub(r"^(import [^\n]*\n)", r"\1import { t } from '@/lib/i18n'\n", s, count=1, flags=re.M) if re.search(r'^import ', s, re.M) else "import { t } from '@/lib/i18n'\n" + s
    open(path, 'w').write(s)
for p in sys.argv[1:]: wrap(p)
