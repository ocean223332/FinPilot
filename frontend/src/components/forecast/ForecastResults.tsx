import type { ReactNode } from 'react'
import { CalendarCheck, CalendarX, CircleCheck, Info, TrendingDown, TriangleAlert, Wallet } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { diffDays, formatDate, formatDayMonth, formatWeekday } from '@/lib/date'
import { formatVnd, isNegative, isZero } from '@/lib/money'
import type { CashEvent, ForecastResponse } from '@/lib/types'
import { BalanceChart } from './BalanceChart'
import { DayTable } from './DayTable'
import { EventList } from './EventList'
import { INTRADAY_RISK_NOTE } from './copy'

interface SummaryCardProps {
  label: string
  icon: ReactNode
  tone?: 'neutral' | 'bad' | 'good'
  children: ReactNode
  note: ReactNode
}

function SummaryCard({ label, icon, tone = 'neutral', children, note }: SummaryCardProps) {
  const toneClass =
    tone === 'bad' ? 'bg-shortage/[0.04] ring-shortage/40' : tone === 'good' ? 'ring-emerald-600/30' : ''
  return (
    <Card size="sm" className={toneClass}>
      <CardContent className="grid gap-1">
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <h3 className="text-xs font-medium">{label}</h3>
          <span aria-hidden="true" className="[&_svg]:size-4">
            {icon}
          </span>
        </div>
        <p className="text-xl leading-tight font-semibold tabular-nums @2xl:text-2xl">{children}</p>
        <p className="text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  )
}

interface ForecastResultsProps {
  result: ForecastResponse
  /** The events that were sent, to name what happened on each day. */
  events: CashEvent[]
}

export function ForecastResults({ result, events }: ForecastResultsProps) {
  const { days } = result
  if (days.length === 0) {
    return (
      <Alert role="note">
        <Info aria-hidden="true" />
        <AlertTitle>Không có dữ liệu dự báo</AlertTitle>
        <AlertDescription>Máy chủ không trả về ngày nào trong kỳ dự báo.</AlertDescription>
      </Alert>
    )
  }

  const first = days[0].date
  const last = days[days.length - 1].date
  const short = result.firstShortageDate !== null
  const lowestNegative = isNegative(result.lowestBalance)
  const riskDays = days.filter((d) => d.hasIntradayTimingRisk)
  const shortageDay = short ? diffDays(first, result.firstShortageDate!) : 0

  return (
    <div className="@container grid gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Kết quả dự báo</h2>
        {short ? (
          <Badge variant="destructive">
            <TriangleAlert aria-hidden="true" data-icon="inline-start" />
            Có thiếu tiền
          </Badge>
        ) : (
          <Badge className="bg-emerald-600/10 text-emerald-800">
            <CircleCheck aria-hidden="true" data-icon="inline-start" />
            Đủ tiền
          </Badge>
        )}
        <p className="text-sm text-muted-foreground">
          {formatDate(first)} – {formatDate(last)} · {days.length} ngày
        </p>
      </div>

      <div className="grid gap-3 @xl:grid-cols-3">
        <SummaryCard
          label="Số dư thấp nhất"
          icon={<TrendingDown />}
          tone={lowestNegative ? 'bad' : 'neutral'}
          note={
            <>
              Ngày {formatDate(result.lowestBalanceDate)} ({formatWeekday(result.lowestBalanceDate)})
            </>
          }
        >
          <span className={`whitespace-nowrap ${lowestNegative ? 'text-shortage' : ''}`}>
            {formatVnd(result.lowestBalance)}
          </span>
        </SummaryCard>

        {short ? (
          <SummaryCard
            label="Ngày đầu tiên thiếu tiền"
            icon={<CalendarX />}
            tone="bad"
            note={
              <>
                {formatWeekday(result.firstShortageDate!)} · ngày thứ {shortageDay} của kỳ dự báo
              </>
            }
          >
            <span className="whitespace-nowrap text-shortage">{formatDate(result.firstShortageDate!)}</span>
          </SummaryCard>
        ) : (
          <SummaryCard
            label="Ngày đầu tiên thiếu tiền"
            icon={<CalendarCheck />}
            tone="good"
            note={`Số dư không xuống dưới 0 trong ${days.length} ngày`}
          >
            <span className="flex items-center gap-1.5 text-lg leading-snug text-emerald-700">
              <CircleCheck aria-hidden="true" className="size-5 shrink-0" />
              Không thiếu tiền trong kỳ
            </span>
          </SummaryCard>
        )}

        <SummaryCard
          label="Thiếu hụt lớn nhất"
          icon={<Wallet />}
          tone={short ? 'bad' : 'neutral'}
          note={short ? 'Mức âm sâu nhất trong kỳ' : 'Không có ngày nào âm tiền'}
        >
          <span className={`whitespace-nowrap ${short ? 'text-shortage' : ''}`}>
            {isZero(result.maxShortage) ? formatVnd('0') : formatVnd(result.maxShortage)}
          </span>
        </SummaryCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Số dư cuối mỗi ngày</CardTitle>
          <CardDescription>Tiền mặt còn lại sau khi tính các khoản thu/chi của từng ngày.</CardDescription>
        </CardHeader>
        <CardContent>
          <BalanceChart result={result} events={events} />
        </CardContent>
      </Card>

      {riskDays.length > 0 && (
        <Alert role="note" className="border-amber-300 bg-amber-50 text-amber-950">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Cần lưu ý: {riskDays.length} ngày vừa thu vừa chi</AlertTitle>
          <AlertDescription className="text-amber-900">
            <p>{INTRADAY_RISK_NOTE}.</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {riskDays.map((d) => (
                <li key={d.date}>
                  <Badge variant="outline" className="border-amber-400 bg-white/60 tabular-nums text-amber-950">
                    {formatDayMonth(d.date)} · {formatWeekday(d.date)}
                  </Badge>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {result.unresolvedEvents.length > 0 && (
        <Alert role="note" className="border-amber-300 bg-amber-50 text-amber-950">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>
            {result.unresolvedEvents.length} khoản chưa xử lý, không được tính vào dự báo
          </AlertTitle>
          <AlertDescription className="text-amber-900">
            <p>Số dư và biểu đồ ở trên chưa bao gồm các khoản sau.</p>
            <div className="mt-2 text-sm">
              <EventList events={result.unresolvedEvents} />
            </div>
          </AlertDescription>
        </Alert>
      )}

      {result.eventsAfterHorizon.length > 0 && (
        <Alert role="note">
          <Info aria-hidden="true" />
          <AlertTitle>
            {result.eventsAfterHorizon.length} khoản nằm sau kỳ dự báo (sau {formatDate(last)})
          </AlertTitle>
          <AlertDescription>
            <p>Các khoản này diễn ra ngoài {days.length} ngày đang xem nên không có trong biểu đồ và số liệu trên.</p>
            <div className="mt-2 text-sm text-foreground">
              <EventList events={result.eventsAfterHorizon} />
            </div>
          </AlertDescription>
        </Alert>
      )}

      <DayTable result={result} events={events} />
    </div>
  )
}
