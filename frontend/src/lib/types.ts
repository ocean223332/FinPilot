/** Money is always a string of whole VND (e.g. "50000000", "-5000000"). Never do arithmetic on it with JS numbers. */
export type Money = string

/** Calendar date as `YYYY-MM-DD`. */
export type IsoDate = string

export type Direction = 'In' | 'Out'

export interface CashEvent {
  id: string
  direction: Direction
  amount: Money
  date: IsoDate
  label: string
}

export interface ForecastRequest {
  openingCash: Money
  start: IsoDate
  horizonDays: number
  events: CashEvent[]
}

export interface ForecastDay {
  date: IsoDate
  opening: Money
  inflow: Money
  outflow: Money
  closing: Money
  eventIds: string[]
  hasIntradayTimingRisk: boolean
}

export interface ForecastResponse {
  days: ForecastDay[]
  lowestBalance: Money
  lowestBalanceDate: IsoDate
  firstShortageDate: IsoDate | null
  maxShortage: Money
  unresolvedEvents: CashEvent[]
  eventsAfterHorizon: CashEvent[]
}

/** RFC 9457 / ASP.NET Core ProblemDetails (ValidationProblemDetails adds `errors`). */
export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  errors?: Record<string, string[]>
}
