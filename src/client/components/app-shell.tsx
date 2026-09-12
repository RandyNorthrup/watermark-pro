import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import {
  Activity,
  ArrowLeft,
  Bug,
  Building2,
  CircleUserRound,
  ChevronsUpDown,
  FileText,
  Film,
  Images,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  PencilRuler,
  Plus,
  ScrollText,
  Share2,
  ShieldCheck,
  Stamp,
  Users,
  UserPlus,
} from 'lucide-react'
import { lazy, type ReactNode, Suspense, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { BrandMark } from './brand-mark'
import { LanguageMenu } from './language-menu'
import { ThemeToggle } from './theme-toggle'
import { ADMIN_SECTIONS, adminSearchSchema, type AdminSection } from '../../shared/admin-sections'
import { isPlatformAdmin } from '../lib/admin'
import { type ActiveOrganization, authClient, type SessionData } from '../lib/auth-client'
import { cn } from '../lib/cn'
import { clearOfflineAccount } from '../lib/offline-account'
import { currentOfflineUser, hasOfflineDatabase } from '../lib/offline-context'
import { offlineStatus, subscribeOfflineStatus } from '../lib/offline-status'
import { resetShellQueries } from '../lib/queries'
import { Avatar } from './ui/avatar'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet'

const OfflinePanel = lazy(async () => {
  const module = await import('./offline-panel')
  return { default: module.OfflinePanel }
})

// `label` holds the catalogue key, not the visible word; each list translates
// it at render. The two rails keep their literal keys for the typed catalogue.
const WORKSPACE_NAV_ITEMS = [
  { to: '/app/editor', label: 'shell.nav.editor', icon: PencilRuler, exact: false },
  { to: '/app/library', label: 'shell.nav.library', icon: Stamp, exact: false },
  { to: '/app/bulk', label: 'shell.nav.bulk', icon: Layers, exact: false },
  { to: '/app/video', label: 'shell.nav.video', icon: Film, exact: false },
  { to: '/app/documents', label: 'shell.nav.documents', icon: FileText, exact: false },
  { to: '/app/gallery', label: 'shell.nav.gallery', icon: Images, exact: false },
  { to: '/app/shares', label: 'shell.nav.shares', icon: Share2, exact: false },
] as const

const OVERVIEW_NAV_ITEM = {
  to: '/app',
  label: 'dashboard.overviewHeading',
  icon: LayoutDashboard,
  exact: true,
} as const

const SETTINGS_NAV_ITEMS = [
  { to: '/app/account', label: 'accountAuth.heading', icon: Users, exact: false },
  { to: '/app/invitations', label: 'siteInvites.heading', icon: UserPlus, exact: false },
  { to: '/app/members', label: 'shell.nav.members', icon: Users, exact: false },
  { to: '/app/audit', label: 'shell.nav.audit', icon: ScrollText, exact: false },
] as const

const BACK_TO_WORKSPACE_NAV_ITEM = {
  to: '/app/editor',
  label: 'shell.nav.editor',
  icon: ArrowLeft,
  exact: true,
} as const

const ADMIN_NAV_ITEM = {
  to: '/app/admin',
  label: 'shell.nav.admin',
  icon: ShieldCheck,
  exact: false,
} as const

const ADMIN_SECTION_NAV_ITEMS = [
  { section: ADMIN_SECTIONS[0], label: 'admin.tabs.users', icon: Users },
  { section: ADMIN_SECTIONS[1], label: 'admin.tabs.organizations', icon: Building2 },
  { section: ADMIN_SECTIONS[2], label: 'admin.tabs.audit', icon: ScrollText },
  { section: ADMIN_SECTIONS[3], label: 'admin.tabs.health', icon: Activity },
  { section: ADMIN_SECTIONS[4], label: 'admin.tabs.clientErrors', icon: Bug },
] as const

const NAV_LINK_CLASS =
  'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-muted transition-all hover:translate-x-0.5 hover:bg-surface-raised hover:text-ink'
const ACTIVE_NAV_LINK_CLASS =
  'glass-nav-active bg-surface-raised text-brand-700 shadow-sm dark:text-brand-200'

type NavItem =
  | (typeof WORKSPACE_NAV_ITEMS)[number]
  | (typeof SETTINGS_NAV_ITEMS)[number]
  | typeof ADMIN_NAV_ITEM
  | typeof BACK_TO_WORKSPACE_NAV_ITEM
  | typeof OVERVIEW_NAV_ITEM

/**
 * The tools a phone user reaches for most sit in the bottom tab bar; the
 * rest, with the organization switcher, are behind the "More" sheet.
 */
const TAB_BAR_ITEMS: readonly NavItem[] = WORKSPACE_NAV_ITEMS.filter((item) =>
  ['/app/library', '/app/editor', '/app/bulk', '/app/gallery'].includes(item.to),
)

function isSettingsArea(pathname: string): boolean {
  return (
    pathname.startsWith(ADMIN_NAV_ITEM.to) ||
    SETTINGS_NAV_ITEMS.some((item) => pathname.startsWith(item.to))
  )
}

function currentAdminSection(search: unknown): AdminSection {
  const parsed = adminSearchSchema.safeParse(search)
  return parsed.success ? parsed.data.section : ADMIN_SECTIONS[0]
}

/** Tool routes keep a focused workspace rail; account routes switch to their own section. */
function navItemsFor(session: SessionData, pathname: string): readonly NavItem[] {
  const canManageSite = isPlatformAdmin(session.user)
  if (!isSettingsArea(pathname))
    return canManageSite ? [OVERVIEW_NAV_ITEM, ...WORKSPACE_NAV_ITEMS] : WORKSPACE_NAV_ITEMS
  const back = canManageSite
    ? { ...OVERVIEW_NAV_ITEM, icon: ArrowLeft }
    : BACK_TO_WORKSPACE_NAV_ITEM
  const settings: readonly NavItem[] = [back, ...SETTINGS_NAV_ITEMS]
  return canManageSite ? [...settings, ADMIN_NAV_ITEM] : settings
}

interface AppShellProps {
  session: SessionData
  organization: ActiveOrganization | null
  organizations: readonly { id: string; name: string }[]
  children: ReactNode
}

/**
 * Authenticated chrome. Wide screens: a sidebar with the organization
 * switcher and every destination. Phones: a compact top bar, a bottom tab
 * bar with the four tools, and a "More" sheet for the rest. Both layouts
 * respect the device's safe areas.
 */
export function AppShell({ session, organization, organizations, children }: AppShellProps) {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const search = useRouterState({ select: (state) => state.location.search })
  const isAdminArea = pathname.startsWith(ADMIN_NAV_ITEM.to) && isPlatformAdmin(session.user)
  const adminSection = currentAdminSection(search)
  const isSettingsAreaActive = isSettingsArea(pathname)
  const home = isPlatformAdmin(session.user) ? '/app' : '/app/editor'
  const navItems = navItemsFor(session, pathname)
  const currentItem = navItems.find((item) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to),
  )
  const currentLabel = isAdminArea
    ? (ADMIN_SECTION_NAV_ITEMS.find((item) => item.section === adminSection)?.label ??
      'shell.nav.admin')
    : currentItem?.label
  return (
    <div className="workspace-scene flex min-h-svh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-brand-600 px-3 py-2 text-white focus:not-sr-only focus:absolute focus:start-2 focus:top-2"
      >
        {t('shell.skipToContent')}
      </a>
      <aside className="glass-chrome sticky top-4 my-4 ms-4 hidden h-[calc(100svh-2rem)] w-60 shrink-0 flex-col overflow-y-auto rounded-3xl border border-line px-4 py-6 md:flex">
        <BrandMark to={home} className="px-2 py-1" />
        {isSettingsAreaActive ? (
          <Link
            to="/app/account"
            className="glass-control mt-6 flex min-w-0 items-center gap-3 rounded-2xl border p-3"
          >
            <Avatar name={session.user.name} image={session.user.image} className="size-11" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{session.user.name}</span>
              <span className="block truncate text-xs text-ink-muted">{session.user.email}</span>
            </span>
          </Link>
        ) : null}
        <div className={isSettingsAreaActive ? 'mt-4' : 'mt-6'}>
          <OrganizationSwitcher
            organization={organization}
            organizations={organizations}
            home={home}
          />
        </div>
        {isAdminArea ? (
          <AdminNavList currentSection={adminSection} className="mt-7" />
        ) : (
          <NavList items={navItems} label={t('shell.primaryNav')} className="mt-7" />
        )}
        <div className="mt-auto pt-6">
          <WorkspaceSync userId={session.user.id} organizationId={organization?.id} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-chrome sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:top-4 md:mx-4 md:mt-4 md:rounded-2xl md:border md:px-6 md:pt-3">
          <div className="flex min-w-0 items-center gap-1 md:hidden">
            <MobileMenu
              userId={session.user.id}
              home={home}
              items={navItems}
              adminSection={isAdminArea ? adminSection : null}
              organization={organization}
              organizations={organizations}
            />
            <BrandMark to={home} />
          </div>
          <div className="hidden min-w-0 items-center gap-3 text-sm md:flex">
            <span className="truncate text-ink-muted">
              {isSettingsAreaActive ? session.user.name : organization?.name}
            </span>
            <span aria-hidden="true" className="h-3.5 w-px rotate-[18deg] bg-control-line/65" />
            <span className="font-medium">
              {currentLabel === undefined ? null : t(currentLabel)}
            </span>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <LanguageMenu />
            <ThemeToggle />
            <UserMenu session={session} />
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 px-4 py-6 pb-[calc(var(--app-tab-bar-height)+1.5rem)] md:px-8 md:pt-6 md:pb-8"
        >
          <div className="w-full">{children}</div>
        </main>
        <TabBar items={TAB_BAR_ITEMS} />
      </div>
    </div>
  )
}

function WorkspaceSync({
  userId,
  organizationId,
  shouldManageSync = true,
}: {
  userId: string
  organizationId: string | undefined
  shouldManageSync?: boolean
}) {
  return hasOfflineDatabase() ? (
    <Suspense fallback={null}>
      <OfflinePanel
        userId={userId}
        organizationId={organizationId}
        shouldManageSync={shouldManageSync}
      />
    </Suspense>
  ) : null
}

interface NavListProps {
  items: readonly NavItem[]
  label: string
  className?: string
  onNavigate?: () => void
}

function NavList({ items, label, className, onNavigate }: NavListProps) {
  const { t } = useTranslation()
  return (
    <nav aria-label={label} className={cn('flex flex-col gap-1', className)}>
      {items.map(({ to, label: itemLabel, icon: Icon, exact }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact }}
          onClick={onNavigate}
          className={NAV_LINK_CLASS}
          activeProps={{
            className: ACTIVE_NAV_LINK_CLASS,
          }}
        >
          <Icon aria-hidden="true" className="size-4" />
          {t(itemLabel)}
        </Link>
      ))}
    </nav>
  )
}

function AdminNavList({
  currentSection,
  className,
  onNavigate,
}: {
  currentSection: AdminSection
  className?: string
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('admin.sectionsLabel')} className={cn('flex flex-col gap-1', className)}>
      <Link
        to="/app/account"
        onClick={onNavigate}
        className={cn(NAV_LINK_CLASS, 'mb-3 border-b border-line pb-4')}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t('accountAuth.heading')}
      </Link>
      {ADMIN_SECTION_NAV_ITEMS.map(({ section, label, icon: Icon }) => {
        const isCurrent = section === currentSection
        return (
          <Link
            key={section}
            to="/app/admin"
            search={{ section }}
            onClick={onNavigate}
            aria-current={isCurrent ? 'page' : undefined}
            className={cn(NAV_LINK_CLASS, isCurrent && ACTIVE_NAV_LINK_CLASS)}
          >
            <Icon aria-hidden="true" className="size-4" />
            {t(label)}
          </Link>
        )
      })}
    </nav>
  )
}

/** Phone-only bottom tab bar; sits above the home indicator. */
function TabBar({ items }: { items: readonly NavItem[] }) {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('shell.toolsNav')}
      className="glass-chrome fixed inset-x-0 bottom-0 z-10 grid h-(--app-tab-bar-height) border-t border-line bg-surface-raised/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      style={{ gridTemplateColumns: `repeat(${String(items.length)}, minmax(0, 1fr))` }}
    >
      {items.map(({ to, label, icon: Icon, exact }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact }}
          className="flex flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] font-medium text-ink-muted"
          activeProps={{ className: 'text-brand-700 dark:text-brand-200' }}
        >
          <Icon aria-hidden="true" className="size-5" />
          {t(label)}
        </Link>
      ))}
    </nav>
  )
}

function MobileMenu({
  userId,
  home,
  items,
  adminSection,
  organization,
  organizations,
}: Pick<AppShellProps, 'organization' | 'organizations'> & {
  userId: string
  home: '/app' | '/app/editor'
  items: readonly NavItem[]
  adminSection: AdminSection | null
}) {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  // The sheet is open for the path it was opened on, so any navigation,
  // including the organization switcher's, closes it without an effect.
  const [openPathname, setOpenPathname] = useState<string | null>(null)
  const isOpen = openPathname === pathname
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        setOpenPathname(open ? pathname : null)
      }}
    >
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={t('shell.menu')}>
          <Menu aria-hidden="true" className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        title={t('shell.menu')}
        description={t('shell.menuDescription')}
        isDescriptionHidden
      >
        <OrganizationSwitcher
          organization={organization}
          organizations={organizations}
          home={home}
        />
        {adminSection === null ? (
          <NavList
            items={items}
            label={t('shell.primaryMenuNav')}
            onNavigate={() => {
              setOpenPathname(null)
            }}
          />
        ) : (
          <AdminNavList
            currentSection={adminSection}
            onNavigate={() => {
              setOpenPathname(null)
            }}
          />
        )}
        <div className="mt-auto pt-2">
          <WorkspaceSync
            userId={userId}
            organizationId={organization?.id}
            shouldManageSync={false}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function OrganizationSwitcher({
  organization,
  organizations,
  home,
}: Pick<AppShellProps, 'organization' | 'organizations'> & { home: '/app' | '/app/editor' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isOnline } = useSyncExternalStore(subscribeOfflineStatus, offlineStatus)
  const [switchError, setSwitchError] = useState<string | null>(null)

  async function switchTo(organizationId: string) {
    setSwitchError(null)
    const result = await authClient.organization.setActive({ organizationId })
    if (result.error !== null) {
      setSwitchError(result.error.message ?? t('offline.connectionRequired'))
      return
    }
    await queryClient.invalidateQueries()
    resetShellQueries(queryClient)
    await router.invalidate()
    await navigate({ to: home })
  }

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            className="w-full justify-between"
            disabled={!isOnline}
            aria-label={
              organization === null
                ? t('shell.chooseOrganization')
                : t('shell.switchOrganizationFor', { name: organization.name })
            }
          >
            <span className="flex min-w-0 items-center gap-2">
              <Building2 aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">
                {organization?.name ?? t('shell.chooseOrganizationShort')}
              </span>
            </span>
            <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>{t('shell.organizations')}</DropdownMenuLabel>
          {organizations.map((candidate) => (
            <DropdownMenuItem
              key={candidate.id}
              className={cn(candidate.id === organization?.id && 'font-semibold')}
              onSelect={() => void switchTo(candidate.id)}
            >
              {candidate.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void navigate({ to: '/app/organizations/new' })}>
            <Plus aria-hidden="true" className="size-4" />
            {t('shell.newOrganization')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {isOnline ? null : (
        <p className="mt-2 text-xs text-ink-muted">{t('offline.connectionRequired')}</p>
      )}
      {switchError === null ? null : (
        <p role="alert" className="text-danger mt-2 text-xs">
          {switchError}
        </p>
      )}
    </div>
  )
}

function UserMenu({ session }: { session: SessionData }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [signOutError, setSignOutError] = useState<string | null>(null)

  async function signOut() {
    const exitingUserId = session.user.id
    setSignOutError(null)
    if (hasOfflineDatabase()) {
      const { pendingOperations } = await import('../lib/offline-database')
      const pending = await pendingOperations(exitingUserId)
      if (pending.length > 0) {
        setSignOutError(t('offline.signOutPending'))
        return
      }
    }
    const result = await authClient.signOut()
    if (result.error !== null) {
      setSignOutError(result.error.message ?? t('offline.signOutFailed'))
      return
    }
    await clearOfflineAccount(queryClient, exitingUserId)
    // The session observer may already have left the app while device cleanup
    // awaited IndexedDB. Do not interrupt a new login/signup from that old task.
    const path = router.state.location.pathname
    if (currentOfflineUser() === null && (path === '/app' || path.startsWith('/app/'))) {
      await navigate({ to: '/login' })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          aria-label={t('shell.accountMenu', { name: session.user.name })}
        >
          <Avatar name={session.user.name} image={session.user.image} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span className="block font-medium text-ink">{session.user.name}</span>
          <span className="block truncate">{session.user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate({ to: '/app/account' })}>
          <CircleUserRound aria-hidden="true" className="size-4" />
          {t('accountAuth.heading')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate({ to: '/app/invitations' })}>
          <UserPlus aria-hidden="true" className="size-4" />
          {t('siteInvites.heading')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate({ to: '/app/members' })}>
          <Users aria-hidden="true" className="size-4" />
          {t('shell.nav.members')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate({ to: '/app/audit' })}>
          <ScrollText aria-hidden="true" className="size-4" />
          {t('shell.nav.audit')}
        </DropdownMenuItem>
        {isPlatformAdmin(session.user) ? (
          <DropdownMenuItem onSelect={() => void navigate({ to: '/app/admin' })}>
            <ShieldCheck aria-hidden="true" className="size-4" />
            {t('shell.nav.admin')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {signOutError === null ? null : (
          <p
            role="alert"
            className="max-w-xs px-2 py-2 text-sm whitespace-normal text-rose-700 dark:text-rose-300"
          >
            {signOutError}
          </p>
        )}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            void signOut()
          }}
        >
          <LogOut aria-hidden="true" className="size-4" />
          {t('shell.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
