import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export function Section({ id, title, hint, children }: { id: string; title: string; hint: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-4 scroll-mt-16">
      <div>
        <h2 id={`${id}-title`} className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  )
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

// Читает вычисленное браузером значение CSS-свойства у элемента: «rounded-md» → «8px» — то, что реально применилось
export function useComputed<T extends HTMLElement>(prop: keyof CSSStyleDeclaration) {
  const ref = useRef<T>(null)
  const [value, setValue] = useState('')
  useLayoutEffect(() => {
    if (ref.current) setValue(String(getComputedStyle(ref.current)[prop]))
  }, [prop])
  return [ref, value] as const
}
