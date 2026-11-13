export type Route = 'lich' | 'du-bao' | 'kich-ban' | 'nhap-file' | 'kho-hang' | 'doanh-thu'

export const ROUTES: { id: Route; label: string; short: string }[] = [
  { id: 'lich', label: 'Lịch thu–chi', short: 'Lịch' },
  { id: 'du-bao', label: 'Dự báo', short: 'Dự báo' },
  { id: 'kich-ban', label: 'Kịch bản', short: 'Kịch bản' },
  { id: 'nhap-file', label: 'Nhập từ file', short: 'Nhập file' },
  { id: 'kho-hang', label: 'Kho hàng', short: 'Kho' },
  { id: 'doanh-thu', label: 'Báo cáo doanh thu', short: 'Doanh thu' },
]

export function readRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  return ROUTES.find((r) => r.id === hash)?.id ?? 'lich'
}

/** Sections of the landing page. Its nav scrolls without touching the hash, but a shared `/#pricing` lands there too. */
export const LANDING_SECTIONS = ['board', 'checklist', 'case', 'pricing', 'faq'] as const
export type LandingSection = (typeof LANDING_SECTIONS)[number]

/** The bare site address or one of its sections: signed-out visitors see the landing page there. */
export function isLandingHash(): boolean {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return hash === '' || (LANDING_SECTIONS as readonly string[]).includes(hash)
}

/** Screens shown before sign-in. Any other hash (e.g. `#du-bao`) shows login and is kept for after it. */
export type AuthView = 'dang-nhap' | 'dang-ky' | 'quen-mat-khau'

export function readAuthView(): AuthView {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  return hash === 'dang-ky' || hash === 'quen-mat-khau' ? hash : 'dang-nhap'
}

/** `#kich-ban?chia=<id>` → `URLSearchParams` of the part after `?`. */
export function routeParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '')
}

/** Link that opens the scenario builder with a split of one real line pre-filled. */
export function splitScenarioHref(eventId: string): string {
  return `#kich-ban?chia=${encodeURIComponent(eventId)}`
}
