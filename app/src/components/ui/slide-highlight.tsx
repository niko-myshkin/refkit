import { useEffect, useRef } from "react"

// Look & feel 2026-10-27 (Fluid Functionalism): подсветка пункта меню плавно переезжает от строки к строке на пружине, а не мигает на месте.
// Один компонент для меню, контекстного меню и выпадающего списка. Кладётся первым ребёнком контейнера со списком (контейнер — relative и
// сам прокручивается). Следит за пунктами, получившими фокус: Radix фокусирует пункт и при наведении мыши, и с клавиатуры, поэтому
// одна и та же подсветка работает для обоих. Сами пункты фон не рисуют (focus:bg-transparent), фон — только здесь
const ITEM = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"]'

export function SlideHighlight() {
  const bar = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = bar.current
    const host = el?.parentElement
    if (!el || !host) return
    let placed = false
    const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const show = (item: HTMLElement) => {
      el.style.transition = placed && !quiet ? "transform 220ms var(--ease-spring-moderate), width 220ms var(--ease-spring-moderate), height 220ms var(--ease-spring-moderate), opacity 120ms" : "opacity 120ms"
      el.style.transform = `translate(${item.offsetLeft}px, ${item.offsetTop}px)`
      el.style.width = `${item.offsetWidth}px`
      el.style.height = `${item.offsetHeight}px`
      el.style.opacity = "1"
      placed = true
    }
    const onFocus = (event: FocusEvent) => {
      const item = (event.target as HTMLElement | null)?.closest<HTMLElement>(ITEM)
      if (item && host.contains(item) && item.getAttribute("aria-disabled") !== "true" && !item.hasAttribute("data-disabled")) show(item)
    }
    const onLeave = (event: FocusEvent) => {
      if (!host.contains(event.relatedTarget as Node | null)) { el.style.opacity = "0"; placed = false }
    }
    host.addEventListener("focusin", onFocus)
    host.addEventListener("focusout", onLeave)
    // Пункт уже был в фокусе до подписки (меню открыли с клавиатуры): подхватываем
    const current = host.querySelector<HTMLElement>(`${ITEM.split(", ").map((part) => `${part}[data-highlighted]`).join(", ")}`)
    if (current) show(current)
    return () => { host.removeEventListener("focusin", onFocus); host.removeEventListener("focusout", onLeave) }
  }, [])
  return <span ref={bar} aria-hidden className="pointer-events-none absolute top-0 left-0 rounded-md bg-accent opacity-0" />
}

// Тот же эффект для списков без меню Radix (рейка, вкладки, списки в страницах): подсветка следует за курсором. Контейнер — relative;
// собственный hover-фон у самих пунктов отключается (hover:bg-transparent), фон рисует только эта полоса
export function HoverSlide({ selector, className = "rounded-lg bg-accent" }: { selector: string; className?: string }) {
  const bar = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = bar.current
    const host = el?.parentElement
    if (!el || !host) return
    let placed = false
    const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const show = (item: HTMLElement) => {
      el.style.transition = placed && !quiet ? "transform 220ms var(--ease-spring-moderate), width 220ms var(--ease-spring-moderate), height 220ms var(--ease-spring-moderate), opacity 120ms" : "opacity 120ms"
      const hostBox = host.getBoundingClientRect()
      const box = item.getBoundingClientRect()
      el.style.transform = `translate(${box.left - hostBox.left + host.scrollLeft}px, ${box.top - hostBox.top + host.scrollTop}px)`
      el.style.width = `${box.width}px`
      el.style.height = `${box.height}px`
      el.style.opacity = "1"
      placed = true
    }
    const onOver = (event: PointerEvent) => {
      const item = (event.target as HTMLElement | null)?.closest<HTMLElement>(selector)
      if (item && host.contains(item) && !item.hasAttribute("disabled") && item.getAttribute("aria-disabled") !== "true") show(item)
    }
    const onLeave = () => { el.style.opacity = "0"; placed = false }
    host.addEventListener("pointerover", onOver)
    host.addEventListener("pointerleave", onLeave)
    return () => { host.removeEventListener("pointerover", onOver); host.removeEventListener("pointerleave", onLeave) }
  }, [selector])
  return <span ref={bar} aria-hidden className={`pointer-events-none absolute top-0 left-0 opacity-0 ${className}`} />
}
