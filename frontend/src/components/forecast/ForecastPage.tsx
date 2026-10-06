import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, previewForecast } from '@/lib/api'
import { todayIso } from '@/lib/date'
import type { ForecastRequest, ForecastResponse } from '@/lib/types'
import { ErrorAlert } from './ErrorAlert'
import { ForecastForm } from './ForecastForm'
import { ForecastResults } from './ForecastResults'
import { ResultsEmpty, ResultsSkeleton } from './ResultsPlaceholders'
import { createDemoState, toRequest } from './form-state'
import type { FormState } from './form-state'

interface Snapshot {
  request: ForecastRequest
  result: ForecastResponse
}

/** Below this width the form sits above the results, so the results are scrolled into view on submit. */
const TWO_COLUMN_QUERY = '(min-width: 1280px)'

export function ForecastPage() {
  const [form, setForm] = useState<FormState>(() => createDemoState(todayIso()))
  const [loading, setLoading] = useState(false)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const lastRequestRef = useRef<ForecastRequest | null>(null)
  const resultsRef = useRef<HTMLElement>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  async function run(request: ForecastRequest) {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    lastRequestRef.current = request
    setLoading(true)
    setError(null)

    if (!window.matchMedia(TWO_COLUMN_QUERY).matches) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      resultsRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    }

    try {
      const result = await previewForecast(request, controller.signal)
      if (controller.signal.aborted) return
      setSnapshot({ request, result })
    } catch (e) {
      if (controller.signal.aborted) return // superseded by a newer request
      setSnapshot(null)
      setError(e instanceof ApiError ? e : new ApiError(0, 'Unexpected error'))
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setLoading(false)
      }
    }
  }

  const stale = useMemo(
    () => snapshot !== null && JSON.stringify(toRequest(form)) !== JSON.stringify(snapshot.request),
    [form, snapshot],
  )

  const statusText = loading ? 'Đang dự báo…' : error ? '' : snapshot ? 'Đã có kết quả dự báo.' : ''

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Kiểm tra nhập hàng</h1>
        <p className="max-w-3xl text-muted-foreground">
          Nếu nhập hàng bây giờ, shop có đủ tiền trả lương, tiền thuê và nhà cung cấp không? Nếu thiếu thì thiếu vào
          ngày nào, và thiếu bao nhiêu.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[30rem_minmax(0,1fr)] xl:items-start">
        <ForecastForm
          state={form}
          onChange={setForm}
          onSubmit={run}
          onUseDemo={() => setForm(createDemoState(todayIso()))}
          loading={loading}
        />

        <section ref={resultsRef} aria-label="Kết quả dự báo" aria-busy={loading} className="min-w-0 scroll-mt-4">
          <div role="status" className="sr-only">
            {statusText}
          </div>

          {error && (
            <ErrorAlert
              error={error}
              onRetry={() => {
                if (lastRequestRef.current) void run(lastRequestRef.current)
              }}
            />
          )}

          {!error && !snapshot && loading && <ResultsSkeleton />}
          {!error && !snapshot && !loading && <ResultsEmpty />}

          {!error && snapshot && (
            <div className="grid gap-4">
              {stale && !loading && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Dữ liệu nhập đã thay đổi kể từ lần dự báo gần nhất. Bấm “Dự báo” để cập nhật kết quả.
                </p>
              )}
              <div className={loading ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
                <ForecastResults result={snapshot.result} events={snapshot.request.events} />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
