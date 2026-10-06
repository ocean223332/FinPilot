import { TrendingUp } from 'lucide-react'
import { ForecastPage } from '@/components/forecast/ForecastPage'

export default function App() {
  return (
    <div className="min-h-svh bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background"
          >
            <TrendingUp className="size-4" />
          </span>
          <span className="font-semibold tracking-tight">FinPilot</span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Dự báo dòng tiền cho shop thời trang online
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <ForecastPage />
      </main>
    </div>
  )
}
