#!/usr/bin/env python3
"""Второй проход: любая простая строка в кавычках с русским → t('…'), если ещё не обёрнута.
Пропускает комментарии, импорты, однобуквенные строки (клавиши), шаблонные строки."""
import re, sys, json
RU = r'[А-Яа-яЁё]'
keys = []
pat = re.compile(r"""(\bt\('(?:[^'\\]|\\.)*'(?:, \{[^}]*\})?\))|'((?:[^'\\\n]|\\.)*)'|"([^"\\\n]*)\"""")
def wrap(path):
    out = []
    for ln in open(path).read().split('\n'):
        if re.match(r'\s*(//|\*|/\*|import )', ln) or not re.search(RU, ln):
            out.append(ln); continue
        # хвостовой // комментарий отрезаем от обработки
        code, tail = ln, ''
        m = re.search(r'\s//\s', ln)
        if m and ln[:m.start()].count("'") % 2 == 0 and ln[:m.start()].count('"') % 2 == 0 and ln[:m.start()].count('`') % 2 == 0:
            code, tail = ln[:m.start()], ln[m.start():]
        def sub(m):
            if m.group(1): return m.group(1)
            raw = m.group(2) if m.group(2) is not None else m.group(3)
            if not re.search(RU, raw) or len(raw.strip()) < 2: return m.group(0)
            if re.match(r'\s*:(?!:)', code[m.end():]) and re.search(r'[{,]\s*$', code[:m.start()]): return m.group(0)  # ключ объекта
            if m.group(3) is not None:
                # JSX-атрибут в двойных кавычках → {t('…')}; обычная строка → t('…')
                pre = code[:m.start()]
                if "'" in raw: return m.group(0)
                call = f"t('{raw}')"
                keys.append(raw)
                return '{' + call + '}' if pre.endswith('=') else call
            keys.append(raw.replace("\\'", "'"))
            pre = code[:m.start()]
            call = f"t('{raw}')"
            return '{' + call + '}' if pre.endswith('=') else call
        code = pat.sub(sub, code)
        out.append(code + tail)
    s = '\n'.join(out)
    if "from '@/lib/i18n'" not in s and re.search(r"\bt\('", s):
        s = re.sub(r"^(import [^\n]*\n)", r"\1import { t } from '@/lib/i18n'\n", s, count=1, flags=re.M)
    open(path, 'w').write(s)
for p in sys.argv[1:]: wrap(p)
json.dump(keys, sys.stdout, ensure_ascii=False)
