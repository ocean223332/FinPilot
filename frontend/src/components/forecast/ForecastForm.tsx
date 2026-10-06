import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowDownLeft, ArrowUpRight, CircleAlert, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { isValidIsoDate, todayIso } from '@/lib/date'
import type { Direction, ForecastRequest } from '@/lib/types'
import { MoneyInput } from './MoneyInput'
import { HORIZON_DAYS, createEmptyEvent, toRequest, validateForm } from './form-state'
import type { EventDraft, EventErrors, FormState } from './form-state'

interface ForecastFormProps {
  state: FormState
  onChange: (state: FormState) => void
  onSubmit: (request: ForecastRequest) => void
  onUseDemo: () => void
  loading: boolean
}

const NO_EVENT_ERRORS: EventErrors = {}

// Column template of one event row in a wide form (label · Thu/Chi · amount · date · remove button).
const WIDE_COLUMNS = '@2xl:grid-cols-[minmax(0,1fr)_6.5rem_11rem_10.5rem_2.25rem]'

function DirectionLabel({ direction }: { direction: Direction }) {
  return direction === 'In' ? (
    <>
      <ArrowDownLeft aria-hidden="true" className="text-emerald-600" />
      Thu
    </>
  ) : (
    <>
      <ArrowUpRight aria-hidden="true" className="text-rose-600" />
      Chi
    </>
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1 text-xs text-destructive">
      {message}
    </p>
  )
}

interface EventRowProps {
  event: EventDraft
  index: number
  errors: EventErrors
  onChange: (patch: Partial<EventDraft>) => void
  onRemove: () => void
}

function EventRow({ event, index, errors, onChange, onRemove }: EventRowProps) {
  const n = index + 1
  const base = `event-${event.id}`
  // Visible in the stacked (narrow) layout; the wide layout shows column headings instead.
  const labelClass = 'mb-1.5 text-xs text-muted-foreground @2xl:sr-only'

  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-lg border bg-muted/30 p-3 @2xl:items-start @2xl:border-0 @2xl:bg-transparent @2xl:p-0 ${WIDE_COLUMNS}`}
    >
      <div className="col-start-1 row-start-1 min-w-0 @2xl:col-start-auto @2xl:row-start-auto">
        <Label htmlFor={`${base}-label`} className={labelClass}>
          Nội dung<span className="sr-only"> khoản {n}</span>
        </Label>
        <Input
          id={`${base}-label`}
          value={event.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="VD: Nhập hàng"
          maxLength={100}
          autoComplete="off"
          aria-invalid={errors.label ? true : undefined}
          aria-describedby={errors.label ? `${base}-label-error` : undefined}
        />
        <FieldError id={`${base}-label-error`} message={errors.label} />
      </div>

      <div className="col-span-2 row-start-2 grid grid-cols-[5.75rem_minmax(0,1fr)] gap-2 @sm:grid-cols-[5.75rem_minmax(0,1fr)_8.5rem] @2xl:contents">
        <div className="min-w-0">
          <Label htmlFor={`${base}-direction`} className={labelClass}>
            Loại<span className="sr-only"> khoản {n}</span>
          </Label>
          <Select value={event.direction} onValueChange={(v) => onChange({ direction: v as Direction })}>
            <SelectTrigger id={`${base}-direction`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="In">
                <DirectionLabel direction="In" />
              </SelectItem>
              <SelectItem value="Out">
                <DirectionLabel direction="Out" />
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0">
          <Label htmlFor={`${base}-amount`} className={labelClass}>
            Số tiền<span className="sr-only"> khoản {n}</span>
          </Label>
          <MoneyInput
            id={`${base}-amount`}
            value={event.amount}
            onValueChange={(amount) => onChange({ amount })}
            error={errors.amount}
            placeholder="0"
          />
        </div>

        <div className="col-span-2 min-w-0 @sm:col-span-1 @2xl:col-span-1">
          <Label htmlFor={`${base}-date`} className={labelClass}>
            Ngày<span className="sr-only"> khoản {n}</span>
          </Label>
          <Input
            id={`${base}-date`}
            type="date"
            value={event.date}
            onChange={(e) => onChange({ date: e.target.value })}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? `${base}-date-error` : undefined}
          />
          <FieldError id={`${base}-date-error`} message={errors.date} />
        </div>
      </div>

      <Button
        id={`${base}-remove`}
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label={`Xóa khoản ${n}${event.label.trim() ? `: ${event.label.trim()}` : ''}`}
        className="col-start-2 row-start-1 text-muted-foreground hover:text-destructive @2xl:col-start-auto @2xl:row-start-auto"
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </li>
  )
}

export function ForecastForm({ state, onChange, onSubmit, onUseDemo, loading }: ForecastFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const [showErrors, setShowErrors] = useState(false)
  const focusTarget = useRef<string | null>(null)

  const errors = useMemo(() => validateForm(state), [state])
  const visibleErrors = showErrors ? errors : null

  // Runs after every render: move focus once the DOM for a new/removed row exists.
  useEffect(() => {
    if (!focusTarget.current) return
    document.getElementById(focusTarget.current)?.focus()
    focusTarget.current = null
  })

  function patchEvent(id: string, patch: Partial<EventDraft>) {
    onChange({ ...state, events: state.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
  }

  function addEvent() {
    const event = createEmptyEvent(isValidIsoDate(state.start) ? state.start : todayIso())
    onChange({ ...state, events: [...state.events, event] })
    focusTarget.current = `event-${event.id}-label`
  }

  function removeEvent(id: string) {
    const index = state.events.findIndex((e) => e.id === id)
    const remaining = state.events.filter((e) => e.id !== id)
    onChange({ ...state, events: remaining })
    const neighbour = remaining[index] ?? remaining[index - 1]
    focusTarget.current = neighbour ? `event-${neighbour.id}-remove` : 'add-event'
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    if (errors.count > 0) {
      setShowErrors(true)
      // Wait for the error state to render, then jump to the first invalid control.
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      })
      return
    }
    onSubmit(toRequest(state))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông tin dòng tiền</CardTitle>
        <CardDescription>Số dư hiện có và các khoản thu/chi sắp tới, dự báo {HORIZON_DAYS} ngày.</CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowErrors(false)
              onUseDemo()
            }}
            disabled={loading}
          >
            Dùng ví dụ mẫu
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="opening-cash" className="mb-1.5">
                Tiền mặt hiện có
              </Label>
              <MoneyInput
                id="opening-cash"
                value={state.openingCash}
                onValueChange={(openingCash) => onChange({ ...state, openingCash })}
                error={visibleErrors?.openingCash}
                placeholder="0"
              />
            </div>
            <div>
              <Label htmlFor="start-date" className="mb-1.5">
                Ngày bắt đầu
              </Label>
              <Input
                id="start-date"
                type="date"
                value={state.start}
                onChange={(e) => onChange({ ...state, start: e.target.value })}
                aria-invalid={visibleErrors?.start ? true : undefined}
                aria-describedby={visibleErrors?.start ? 'start-date-error' : undefined}
              />
              <FieldError id="start-date-error" message={visibleErrors?.start} />
            </div>
          </div>

          <fieldset className="@container grid min-w-0 gap-3">
            <legend className="mb-1 text-sm font-medium">Các khoản thu/chi dự kiến</legend>

            {state.events.length > 0 && (
              <>
                <div
                  aria-hidden="true"
                  className={`hidden gap-2 text-xs font-medium text-muted-foreground @2xl:grid ${WIDE_COLUMNS}`}
                >
                  <span>Nội dung</span>
                  <span>Loại</span>
                  <span className="text-right">Số tiền</span>
                  <span>Ngày</span>
                  <span />
                </div>
                <ul className="grid gap-3 @2xl:gap-2">
                  {state.events.map((event, index) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      index={index}
                      errors={visibleErrors?.events[event.id] ?? NO_EVENT_ERRORS}
                      onChange={(patch) => patchEvent(event.id, patch)}
                      onRemove={() => removeEvent(event.id)}
                    />
                  ))}
                </ul>
              </>
            )}

            {state.events.length === 0 && (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Chưa có khoản thu/chi nào. Thêm khoản nhập hàng, lương, tiền thuê hoặc tiền hàng sắp về.
              </p>
            )}

            <Button id="add-event" type="button" variant="outline" onClick={addEvent} className="justify-self-start">
              <Plus aria-hidden="true" data-icon="inline-start" />
              Thêm khoản thu/chi
            </Button>
          </fieldset>

          {visibleErrors && visibleErrors.count > 0 && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Còn {visibleErrors.count} mục cần sửa</AlertTitle>
              <AlertDescription>Kiểm tra các ô được đánh dấu đỏ rồi bấm “Dự báo” lại.</AlertDescription>
            </Alert>
          )}

          <Button type="submit" size="lg" disabled={loading} className="h-11 w-full text-base">
            {loading ? (
              <>
                <LoaderCircle aria-hidden="true" className="animate-spin" data-icon="inline-start" />
                Đang dự báo…
              </>
            ) : (
              'Dự báo'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
