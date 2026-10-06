import { ChartNoAxesColumn } from 'lucide-react'

export function ResultsEmpty() {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
      <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <ChartNoAxesColumn className="size-5" />
      </span>
      <div className="grid max-w-md gap-1">
        <h2 className="text-base font-semibold">Chưa có dự báo</h2>
        <p className="text-sm text-muted-foreground">
          Nhập tiền mặt hiện có và các khoản thu/chi sắp tới, rồi bấm “Dự báo” để biết có thiếu tiền không, vào ngày
          nào và thiếu bao nhiêu. Ví dụ mẫu đã được điền sẵn.
        </p>
      </div>
    </div>
  )
}

function Block({ className }: { className: string }) {
  return <div className={`rounded-xl bg-muted motion-safe:animate-pulse ${className}`} />
}

/** Layout-shaped placeholder shown on the first load (later reloads keep the previous result visible instead). */
export function ResultsSkeleton() {
  return (
    <div className="@container grid gap-4" aria-hidden="true">
      <Block className="h-7 w-64 max-w-full" />
      <div className="grid gap-3 @xl:grid-cols-3">
        <Block className="h-28" />
        <Block className="h-28" />
        <Block className="h-28" />
      </div>
      <Block className="h-[26rem]" />
    </div>
  )
}
