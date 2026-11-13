import { Suspense, lazy, useState } from 'react'
import { CalendarRange, BarChart3, CircleAlert, Database, FileSpreadsheet, LineChart, LogOut, Package, Split, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AppShell as AstryxAppShell } from '@astryxdesign/core/AppShell'
import { Avatar } from '@astryxdesign/core/Avatar'
import { Banner } from '@astryxdesign/core/Banner'
import { DropdownMenu, DropdownMenuDivider, DropdownMenuItem } from '@astryxdesign/core/DropdownMenu'
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { BrandMark } from '@/components/brand'
import { Loading, ErrorState } from '@/components/page'
import { TabBar } from '@/components/TabBar'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ScheduleScreen } from '@/screens/schedule/ScheduleScreen'
import { demoShop } from '@/lib/demo'
import { signOut } from '@/lib/session'
import { emptyShop } from '@/lib/shop'
import { formatDayMonth } from '@/lib/date'
import { cn } from '@/lib/utils'
import { CreateShopScreen } from './CreateShopScreen'
import { ROUTES } from './routes'
import type { Route } from './routes'
import { useShop } from './use-shop'

// The schedule is the first screen; the others load on first visit.
const ForecastScreen = lazy(() => import('@/screens/forecast/ForecastScreen').then((m) => ({ default: m.ForecastScreen })))
const ScenariosScreen = lazy(() => import('@/screens/scenarios/ScenariosScreen').then((m) => ({ default: m.ScenariosScreen })))
const ImportScreen = lazy(() => import('@/screens/import/ImportScreen').then((m) => ({ default: m.ImportScreen })))

const InventoryScreen = lazy(() => import('@/screens/inventory/InventoryScreen').then((m) => ({ default: m.InventoryScreen })))
const SalesScreen = lazy(() => import('@/screens/inventory/InventoryScreen').then((m) => ({ default: m.SalesScreen })))

const ICONS: Record<Route, LucideIcon> = {
  lich: CalendarRange,
  'du-bao': LineChart,
  'kich-ban': Split,
  'nhap-file': FileSpreadsheet,
  'kho-hang': Package,
  'doanh-thu': BarChart3,
}

/** Account menu: who is signed in, the two whole-shop data actions (sample data, wipe), and sign-out. */
function AccountMenu({ email, wide }: { email: string; wide: boolean }) {
  const { write, today, data } = useShop()
  const [confirm, setConfirm] = useState<'demo' | 'wipe' | null>(null)
  const hasData = Boolean(data && (data.balance || data.obligations.length > 0 || data.scenarios.length > 0))

  return (
    <>
      <DropdownMenu
        placement={wide ? 'above' : 'below'}
        alignment={wide ? 'start' : 'end'}
        menuWidth={288}
        hasChevron={false}
        renderTrigger={(props) =>
          wide ? (
            <button
              type="button"
              {...props}
              className="flex w-full min-w-0 items-center gap-2.5 rounded-md p-2 text-left hover:bg-overlay-hover"
            >
              <Avatar name={email} size="sm" tooltip={false} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{email}</span>
            </button>
          ) : (
            <button type="button" {...props} aria-label={`Tài khoản ${email}`} className="grid size-11 place-items-center rounded-full">
              <Avatar name={email} size={36} tooltip={false} />
            </button>
          )
        }
        header={
          <p className="px-3 pt-2 pb-1 text-xs text-secondary">
            Đăng nhập với <span className="font-medium break-all text-primary">{email}</span>
          </p>
        }
      >
        <DropdownMenuItem
          icon={Database}
          label="Dùng ví dụ mẫu"
          onClick={() => (hasData ? setConfirm('demo') : void write((r) => r.replaceAll(demoShop(today))))}
        />
        {hasData && <DropdownMenuItem icon={Trash2} label="Xóa dữ liệu thu–chi" variant="destructive" onClick={() => setConfirm('wipe')} />}
        <DropdownMenuDivider />
        <DropdownMenuItem icon={LogOut} label="Đăng xuất" onClick={() => void signOut().catch(() => {})} />
      </DropdownMenu>
      <ConfirmDialog
        open={confirm === 'demo'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Dùng ví dụ mẫu?"
        description="Thay số dư, kịch bản và các khoản thu–chi nhập thủ công hoặc nhập từ file bằng dữ liệu mẫu."
        confirmLabel="Thay bằng ví dụ mẫu"
        tone="default"
        onConfirm={() => void write((r) => r.replaceAll(demoShop(today)))}
      />
      <ConfirmDialog
        open={confirm === 'wipe'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Xóa dữ liệu thu–chi?"
        description="Xóa số dư, kịch bản, lịch sử nhập file và các khoản thu–chi không liên kết phiếu kho."
        confirmLabel="Xóa dữ liệu thu–chi"
        onConfirm={() => void write((r) => r.replaceAll(emptyShop()))}
      />
    </>
  )
}

/** The forecast's verdict, always in view: a row under the side nav, or a chip in the phone header. */
function StatusLamp({ compact }: { compact?: boolean }) {
  const { forecast, data } = useShop()
  if (!data?.balance || !forecast) return null
  const first = forecast.result.firstShortageDate
  if (compact) {
    return (
      <a
        href="#du-bao"
        className={cn(
          'flex h-9 shrink-0 items-center gap-2 rounded-full border-2 border-[var(--color-border-emphasized)] px-3 text-xs font-bold whitespace-nowrap',
          first ? 'bg-shortage text-on-error' : 'bg-surface text-ok',
        )}
      >
        {first ? `Thiếu từ ${formatDayMonth(first)}` : 'Đủ tiền 56 ngày'}
      </a>
    )
  }
  return (
    <a href="#du-bao" className="flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm font-semibold hover:bg-overlay-hover">
      <StatusDot variant={first ? 'error' : 'success'} label={first ? 'Thiếu tiền' : 'Đủ tiền'} isPulsing={Boolean(first)} />
      <span className={first ? 'text-shortage' : 'text-ok'}>{first ? `Thiếu tiền từ ${formatDayMonth(first)}` : 'Đủ tiền 56 ngày'}</span>
    </a>
  )
}

export function AppShell({ route, email }: { route: Route; email: string }) {
  const { data, noShop, loadError, reload, saveError, forecast } = useShop()
  const short = forecast?.result.firstShortageDate != null

  if (noShop) return <CreateShopScreen email={email} />

  return (
    <AstryxAppShell
      height="auto"
      variant="surface"
      mobileNav={{ hasToggle: false, breakpoint: 'lg' }}
      sideNav={
        <SideNav
          header={<SideNavHeading heading="FinPilot" icon={<BrandMark className="size-7" />} headingHref="#lich" subheading={data?.name} />}
        >
          <SideNavSection title="Màn hình" isHeaderHidden>
            {ROUTES.map((r) => (
              <SideNavItem
                key={r.id}
                label={r.label}
                icon={ICONS[r.id]}
                href={`#${r.id}`}
                isSelected={r.id === route}
                endContent={r.id === 'du-bao' && short ? <StatusDot variant="error" label="có ngày thiếu tiền" /> : undefined}
              />
            ))}
          </SideNavSection>
          {/* Right under the screens, not pinned to the window's bottom edge. */}
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-1 border-t pt-3">
            <StatusLamp />
            <AccountMenu email={email} wide />
          </div>
        </SideNav>
      }
    >
      <a href="#main" className="fixed top-[-4rem] left-4 z-50 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent focus:top-3">
        Bỏ qua, tới nội dung chính
      </a>

      <header className="phone-header sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-2 lg:hidden">
        <a href="#lich" className="flex min-w-0 items-center gap-2.5 rounded-md">
          <BrandMark />
          <span className="grid min-w-0 leading-tight">
            <span className="font-display text-[0.9375rem] font-bold">FinPilot</span>
            {data && <span className="truncate text-xs text-secondary">{data.name}</span>}
          </span>
        </a>
        <div className="flex shrink-0 items-center gap-1.5">
          {route !== 'du-bao' && <StatusLamp compact />}
          <AccountMenu email={email} wide={false} />
        </div>
      </header>

      {saveError && (
        <div role="alert" className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-10">
          <Banner status="error" title={saveError} icon={<CircleAlert aria-hidden="true" className="size-5" />} />
        </div>
      )}

      {/* Bottom padding clears the fixed phone tab bar. */}
      <div id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 outline-none sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">
        {loadError ? (
          <div role="alert">
            <ErrorState title="Chưa mở được dữ liệu của shop" description={loadError} onRetry={reload} />
          </div>
        ) : !data ? (
          <Loading>Đang mở dữ liệu của shop…</Loading>
        ) : (
          <>
            <Suspense fallback={<Loading />}>
              {route === 'lich' && <ScheduleScreen />}
              {route === 'du-bao' && <ForecastScreen />}
              {route === 'kich-ban' && <ScenariosScreen />}
              {route === 'nhap-file' && <ImportScreen />}
              {route === 'kho-hang' && <InventoryScreen />}
              {route === 'doanh-thu' && <SalesScreen />}
            </Suspense>
          </>
        )}
      </div>

      <TabBar
        label="Màn hình"
        current={route}
        items={ROUTES.map((r) => ({ id: r.id, label: r.short, icon: ICONS[r.id], alert: r.id === 'du-bao' && short ? 'có ngày thiếu tiền' : undefined }))}
      />
    </AstryxAppShell>
  )
}
