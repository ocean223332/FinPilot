import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TabItem {
  id: string
  label: string
  icon: LucideIcon
  /** A red dot with this hidden text (e.g. "có ngày thiếu tiền"). */
  alert?: string
}

/**
 * Phone tab bar, pinned to the bottom edge below `lg`: icon over a short label, the current one on a cyan pill.
 * The page needs bottom padding of at least the bar's height (`pb-28` on the shell's main).
 */
export function TabBar({ items, current, label, inline = false }: { items: TabItem[]; current: string; label: string; /** In the page flow at every width, for the design-system page. */ inline?: boolean }) {
  return (
    <nav aria-label={label} className={cn('tab-bar', inline ? 'relative' : 'fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)] lg:hidden')}>
      <ul className="grid h-16 gap-1 px-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const Icon = item.icon
          const active = item.id === current
          return (
            <li key={item.id} className="min-w-0">
              <a
                href={`#${item.id}`}
                aria-current={active ? 'page' : undefined}
                className={cn('relative flex h-full flex-col items-center justify-center gap-1 text-xs font-semibold', active ? 'text-primary' : 'text-secondary')}
              >
                <span className={cn('grid h-7 w-14 max-w-full place-items-center rounded-full', active && 'tab-bar-active')}>
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="max-w-full truncate">{item.label}</span>
                {item.alert && (
                  <span className="absolute top-1.5 right-[calc(50%-1.5rem)] size-2.5 rounded-full bg-shortage ring-2 ring-[var(--color-background-surface)]">
                    <span className="sr-only">({item.alert})</span>
                  </span>
                )}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
