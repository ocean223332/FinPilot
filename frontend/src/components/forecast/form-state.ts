import { addDays, isValidIsoDate } from '@/lib/date'
import { newId } from '@/lib/id'
import type { Direction, ForecastRequest, IsoDate, Money } from '@/lib/types'

export const HORIZON_DAYS = 56

export interface EventDraft {
  id: string
  label: string
  direction: Direction
  amount: Money
  date: IsoDate
}

export interface FormState {
  openingCash: Money
  start: IsoDate
  events: EventDraft[]
}

export interface EventErrors {
  label?: string
  amount?: string
  date?: string
}

export interface FormErrors {
  openingCash?: string
  start?: string
  events: Record<string, EventErrors>
  count: number
}

/** The demo case: buy stock now, pay payroll + rent a week later, COD money arrives in week three. */
export function createDemoState(start: IsoDate): FormState {
  return {
    openingCash: '50000000',
    start,
    events: [
      { id: newId(), label: 'Nhập hàng', direction: 'Out', amount: '30000000', date: addDays(start, 0) },
      { id: newId(), label: 'Lương + tiền thuê', direction: 'Out', amount: '25000000', date: addDays(start, 7) },
      { id: newId(), label: 'Tiền COD về', direction: 'In', amount: '35000000', date: addDays(start, 14) },
    ],
  }
}

export function createEmptyEvent(date: IsoDate): EventDraft {
  return { id: newId(), label: '', direction: 'Out', amount: '', date }
}

function isPositive(amount: Money): boolean {
  return /^\d+$/.test(amount) && /[1-9]/.test(amount)
}

export function validateForm(state: FormState): FormErrors {
  const errors: FormErrors = { events: {}, count: 0 }
  const fail = (message: string) => {
    errors.count += 1
    return message
  }

  if (!/^\d+$/.test(state.openingCash)) errors.openingCash = fail('Nhập số dư đầu kỳ (có thể là 0)')
  if (!isValidIsoDate(state.start)) errors.start = fail('Chọn ngày bắt đầu')

  for (const event of state.events) {
    const eventErrors: EventErrors = {}
    if (!event.label.trim()) eventErrors.label = fail('Nhập nội dung')
    if (!event.amount) eventErrors.amount = fail('Nhập số tiền')
    else if (!isPositive(event.amount)) eventErrors.amount = fail('Phải lớn hơn 0')
    if (!isValidIsoDate(event.date)) eventErrors.date = fail('Chọn ngày')
    if (Object.keys(eventErrors).length > 0) errors.events[event.id] = eventErrors
  }
  return errors
}

export function toRequest(state: FormState): ForecastRequest {
  return {
    openingCash: state.openingCash,
    start: state.start,
    horizonDays: HORIZON_DAYS,
    events: state.events.map((e) => ({
      id: e.id,
      direction: e.direction,
      amount: e.amount,
      date: e.date,
      label: e.label.trim(),
    })),
  }
}
