import type { ForecastRequest, ForecastResponse, ProblemDetails } from './types'

/** Failure talking to the API. `status === 0` means the request never got an HTTP response. */
export class ApiError extends Error {
  readonly status: number
  readonly problem: ProblemDetails | null

  constructor(status: number, message: string, problem: ProblemDetails | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }
}

async function readProblem(response: Response): Promise<ProblemDetails | null> {
  try {
    const text = await response.text()
    if (!text) return null
    const body: unknown = JSON.parse(text)
    return body && typeof body === 'object' ? (body as ProblemDetails) : null
  } catch {
    return null // empty body, HTML error page, proxy error…
  }
}

function isForecastResponse(body: unknown): body is ForecastResponse {
  if (!body || typeof body !== 'object') return false
  const b = body as ForecastResponse
  return Array.isArray(b.days) && Array.isArray(b.unresolvedEvents) && Array.isArray(b.eventsAfterHorizon)
}

/** POST /api/forecast/preview. Auth is the backend's HttpOnly cookie, so nothing is stored client-side. */
export async function previewForecast(
  request: ForecastRequest,
  signal?: AbortSignal,
): Promise<ForecastResponse> {
  let response: Response
  try {
    response = await fetch('/api/forecast/preview', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'Network error')
  }

  if (!response.ok) {
    const problem = await readProblem(response)
    throw new ApiError(response.status, problem?.title ?? response.statusText, problem)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiError(response.status, 'Invalid JSON in response')
  }
  if (!isForecastResponse(body)) throw new ApiError(response.status, 'Unexpected response shape')
  return body
}
