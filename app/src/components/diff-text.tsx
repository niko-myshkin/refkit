import { Fragment } from 'react'
import { diffArrays } from 'diff'
import { cn } from '@/lib/utils'

// Дифф правки агента (идея 55, grill-fabric-findings.md): что уйдёт и что придёт.
// Два уровня: сначала строки; пара «убрали строку — добавили похожую» сравнивается по словам, сильно переписанная строка —
// целиком (старая зачёркнута, новая выделена): иначе при переписке общие короткие слова рвут правку на лоскуты.
// Слова делим по пробелам сами — diffWords не считает кириллицу буквами и резал слова по буквам
const tokens = (text: string) => text.split(/(\s+)/).filter(Boolean)
const Removed = ({ children }: { children: string }) => <del className="rounded-sm bg-destructive/15 text-destructive line-through decoration-destructive/60">{children}</del>
const Added = ({ children }: { children: string }) => <ins className="rounded-sm bg-success/15 text-success no-underline">{children}</ins>

function similar(a: string, b: string) {
  const left = new Set(a.toLowerCase().split(/\s+/).filter(Boolean))
  const right = b.toLowerCase().split(/\s+/).filter(Boolean)
  return right.filter((word) => left.has(word)).length / Math.max(1, Math.max(left.size, right.length)) >= 0.5
}

function Words({ from, to }: { from: string; to: string }) {
  return <>{diffArrays(tokens(from), tokens(to)).map((part, index) => {
    const value = part.value.join('')
    return part.removed ? <Removed key={index}>{value}</Removed> : part.added ? <Added key={index}>{value}</Added> : <span key={index}>{value}</span>
  })}</>
}

export function DiffText({ from, to, className }: { from: string; to: string; className?: string }) {
  const parts = diffArrays(from.split('\n'), to.split('\n'))
  const rows: React.ReactNode[] = []
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]
    const next = parts[index + 1]
    if (part.removed && next?.added) {
      // Замена: строки попарно; похожие — по словам, остальные — целиком
      const count = Math.max(part.value.length, next.value.length)
      for (let line = 0; line < count; line++) {
        const old = part.value[line], fresh = next.value[line]
        if (old !== undefined && fresh !== undefined && similar(old, fresh)) rows.push(<Words from={old} to={fresh} />)
        else {
          if (old !== undefined) rows.push(<Removed>{old}</Removed>)
          if (fresh !== undefined) rows.push(<Added>{fresh}</Added>)
        }
      }
      index++
      continue
    }
    for (const line of part.value) rows.push(part.removed ? <Removed>{line}</Removed> : part.added ? <Added>{line}</Added> : <span>{line}</span>)
  }
  return <span className={cn('whitespace-pre-wrap', className)}>{rows.map((row, index) => <Fragment key={index}>{index > 0 && '\n'}{row}</Fragment>)}</span>
}
