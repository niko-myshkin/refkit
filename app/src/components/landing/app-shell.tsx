import type { ComponentType, ReactNode } from 'react'

// Оболочка макета приложения (набор brandapp): сайдбар, шапка, поля и высота 900 уже внутри, агент вставляет только содержимое.
// Все три экрана продукта получают одну и ту же оболочку: те же пункты меню, тот же логотип, те же отступы (чётные).
// Токены берутся из обёртки Page (--lp-*, токены shadcn), поэтому цвет, шрифт и скругление — из выбранного направления.
export interface AppShellProps {
  /** Название продукта, как в брифе */
  name: string
  /** Пункты меню слева, одинаковые на всех экранах продукта; icon — компонент из lucide-react */
  nav: Array<{ label: string; icon?: ComponentType<{ className?: string }> }>
  /** Подпись активного пункта меню, ровно как в nav */
  active: string
  /** Заголовок экрана (один раз; раздел в других местах не повторяй) */
  title: string
  /** Короткий статус в правой части шапки, необязательно */
  status?: string
  /** Единственное главное действие экрана (одна кнопка), необязательно */
  action?: ReactNode
  children: ReactNode
}
export function AppShell({ name, nav, active, title, status, action, children }: AppShellProps) {
  return (
    <div className="flex h-[900px] w-[1440px] overflow-hidden bg-background text-foreground">
      <aside className="flex w-[240px] shrink-0 flex-col gap-2 border-r border-line bg-card px-4 py-6">
        <div className="mb-4 px-3 font-[family-name:var(--lp-display)] text-[length:var(--lp-fs-h3)] [font-weight:var(--lp-display-weight)]">{name}</div>
        {nav.map((item) => {
          const Icon = item.icon
          const on = item.label === active
          return (
            <div key={item.label} className={`flex h-10 items-center gap-3 px-3 text-sm ${on ? 'bg-muted text-foreground' : 'text-muted-foreground'}`} style={{ borderRadius: 'var(--lp-r-button)' }}>
              {Icon ? <Icon className="size-4" /> : null}
              <span>{item.label}</span>
            </div>
          )
        })}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-8">
          <h1 className="text-lg font-medium">{title}</h1>
          <div className="flex items-center gap-4">
            {status ? <span className="text-xs text-muted-foreground">{status}</span> : null}
            {action}
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden p-8">{children}</main>
      </div>
    </div>
  )
}
