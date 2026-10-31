import { describe, expect, it } from 'vitest'
import { lintScreen, measureIssues } from '../../screen-renderer.ts'

const wrap = (body) => `export default function Screen() { return (<div>${body}</div>) }`

describe('lintScreen: небрежность в макете приложения', () => {
  it('чистый экран без замечаний', () => {
    expect(lintScreen(wrap('<h1>Materials</h1><p>Saved notes from the library</p>'))).toEqual([])
  })
  it('находит повтор одного текста', () => {
    const issues = lintScreen(wrap('<p>Local on your Mac</p><span>Local on your Mac</span>'))
    expect(issues.join(' ')).toMatch(/повторяется/)
  })
  it('находит цвета вручную, но не accent страницы', () => {
    expect(lintScreen(wrap('<p style={{ color: "#ff0000" }}>Hello there</p>')).join(' ')).toMatch(/HEX/)
    expect(lintScreen(`export default function Screen() { return (<Page accent="#3158A8" pair="x" corners="soft"><p>Hello there</p></Page>) }`)).toEqual([])
  })
  it('находит нечётные пиксели', () => {
    expect(lintScreen(wrap('<div className="p-[13px]">Hello there</div>')).join(' ')).toMatch(/Нечётные/)
  })
})

describe('measureIssues: замечания по отрисованному экрану', () => {
  it('нет метрик или всё в порядке: замечаний нет', () => {
    expect(measureIssues(null)).toEqual([])
    expect(measureIssues({ overflow: 0, gaps: [] })).toEqual([])
    expect(measureIssues({ overflow: 4, gaps: [] })).toEqual([])
  })
  it('вылезание за край и пустоты дают по замечанию', () => {
    const issues = measureIssues({ overflow: 320, gaps: [{ gap: 250, tail: 120, text: 'Trace' }] })
    expect(issues).toHaveLength(2)
    expect(issues[0]).toMatch(/320 px/)
    expect(issues[1]).toMatch(/Trace/)
  })
  it('пустой угол даёт замечание', () => {
    const issues = measureIssues({ overflow: 0, gaps: [], empty: 30, emptyAt: 'left-bottom', emptyAtPct: 80 })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatch(/слева внизу/)
  })
})
