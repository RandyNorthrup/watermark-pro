import { Link, useRouterState } from '@tanstack/react-router'
import {
  Activity,
  ArrowLeft,
  Bug,
  Building2,
  FileText,
  Film,
  Images,
  Layers,
  LayoutDashboard,
  PencilRuler,
  ScrollText,
  RefreshCw,
  ShieldCheck,
  Stamp,
  Users,
  UserPlus,
} from 'lucide-react'
import { type ComponentProps, lazy, type ReactNode, Suspense, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { BrandMark } from './brand-mark'
import { GooeyNavigation } from './gooey-navigation'
import { LanguageMenu } from './language-menu'
import {
  AccountTrigger,
  NavigationMenuTrigger,
  WorkspaceOfflineNote,
  WorkspaceTrigger,
} from './shell-triggers'
import { SupportPrompt } from './support-prompt'
import { ThemeToggle } from './theme-toggle'
import { useDeferredOverlay } from './ui/deferred-overlay'
import { ADMIN_SECTIONS, adminSearchSchema, type AdminSection } from '../../shared/admin-sections'
import { isPlatformAdmin } from '../lib/admin'
import type { ActiveOrganization, SessionData } from '../lib/auth-client'
import { cn } from '../lib/cn'
import { deferredComponent } from '../lib/deferred-component'
import { hasOfflineDatabase } from '../lib/offline-context'
import { offlineStatus, subscribeOfflineStatus } from '../lib/offline-status'

const OfflinePanel = lazy(async () => {
  const module = await import('./offline-panel')
  return { default: module.OfflinePanel }
})
const FirstUseGuidance = lazy(async () => {
  const module = await import('./guidance/first-use-guidance')
  return { default: module.FirstUseGuidance }
})

// `label` holds the catalogue key, not the visible word; each list translates
// it at render. The two rails keep their literal keys for the typed catalogue.
const WORKSPACE_NAV_ITEMS = [
  { to: '/app/editor', label: 'shell.nav.editor', icon: PencilRuler, exact: false },
  { to: '/app/documents', label: 'shell.nav.documents', icon: FileText, exact: false },
  { to: '/app/video', label: 'shell.nav.video', icon: Film, exact: false },
  { to: '/app/bulk', label: 'shell.nav.bulk', icon: Layers, exact: false },
  { to: '/app/library', label: 'shell.nav.library', icon: Stamp, exact: false },
  { to: '/app/gallery', label: 'shell.nav.gallery', icon: Images, exact: false },
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
  if (!isSettingsArea(pathname)) return WORKSPACE_NAV_ITEMS
  const canManageSite = isPlatformAdmin(session.user)
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
 * Authenticated chrome. Wide screens: a floating gooey navigation button,
 * header workspace switcher and persistent sync controls. Phones: a bottom tab
 * bar with the four tools, and a "More" sheet for the rest. Both layouts
 * respect the device's safe areas.
 */
export function AppShell({ session, organization, organizations, children }: AppShellProps) {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const search = useRouterState({ select: (state) => state.location.search })
  const locationHref = useRouterState({ select: (state) => state.location.href })
  const isAdminArea = pathname.startsWith(ADMIN_NAV_ITEM.to) && isPlatformAdmin(session.user)
  const adminSection = currentAdminSection(search)
  const syncStatus = useSyncExternalStore(subscribeOfflineStatus, offlineStatus)
  const syncMessage =
    syncStatus.pending > 0
      ? t('offline.pending', { count: syncStatus.pending })
      : t('offline.upToDate')
  const syncReadout = syncStatus.isOnline ? syncMessage : t('offline.disconnected')
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
    <div className="workspace-scene flex min-h-svh items-start">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-brand-600 px-3 py-2 text-white focus:not-sr-only focus:absolute focus:start-2 focus:top-2"
      >
        {t('shell.skipToContent')}
      </a>
      <GooeyNavigation
        key={`${session.user.id}:${organization?.id ?? ''}:${locationHref}`}
        label={t(isAdminArea ? 'admin.sectionsLabel' : 'shell.primaryNav')}
        items={
          isAdminArea
            ? [
                {
                  id: 'account',
                  isCurrent: false,
                  label: t('accountAuth.heading'),
                  icon: ArrowLeft,
                  renderLink: (props) => <Link to="/app/account" {...props} />,
                },
                ...ADMIN_SECTION_NAV_ITEMS.map(({ section, label, icon }) => ({
                  id: section,
                  isCurrent: section === adminSection,
                  label: t(label),
                  icon,
                  renderLink: (props: { className: string; children: ReactNode }) => (
                    <Link
                      to="/app/admin"
                      search={{ section }}
                      aria-current={section === adminSection ? 'page' : undefined}
                      {...props}
                    />
                  ),
                })),
              ]
            : navItems.map(({ to, label, icon, exact }) => ({
                id: to,
                isCurrent: exact ? pathname === to : pathname.startsWith(to),
                label: t(label),
                icon,
                renderLink: (props: { className: string; children: ReactNode }) => (
                  <Link to={to} activeOptions={{ exact }} {...props} />
                ),
              }))
        }
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="glass-chrome relative z-10 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-line px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:mx-4 md:mt-4 md:rounded-2xl md:border md:px-6 md:pt-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="flex min-w-0 items-center gap-1 md:hidden">
            <MobileMenu
              key={locationHref}
              userId={session.user.id}
              home={home}
              items={navItems}
              adminSection={isAdminArea ? adminSection : null}
              pathname={pathname}
              organization={organization}
              organizations={organizations}
            />
            <BrandMark to={home} />
          </div>
          <div className="hidden min-w-0 items-center gap-3 text-sm md:flex">
            <BrandMark to={home} />
            <div className="max-w-64 min-w-0">
              <OrganizationSwitcher
                organization={organization}
                organizations={organizations}
                home={home}
              />
            </div>
            <span className="hidden truncate font-medium xl:block">
              {currentLabel === undefined ? null : t(currentLabel)}
            </span>
          </div>
          <SupportPrompt />
          <div className="col-start-2 row-start-1 ms-auto flex items-center gap-2 lg:col-start-3">
            <details
              key={`sync:${session.user.id}:${organization?.id ?? ''}`}
              className="workspace-sync hidden md:block"
            >
              <summary
                aria-label={t('offline.label')}
                className="glass-control relative flex size-11 cursor-pointer items-center justify-center rounded-xl border"
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                {syncStatus.pending > 0 ? (
                  <span className="absolute -end-1 -top-1 rounded-full bg-brand-700 px-1 text-xs font-semibold text-white">
                    {syncStatus.pending}
                  </span>
                ) : null}
                <span role="status" className="sr-only">
                  {syncReadout}
                </span>
              </summary>
              <div className="glass-popover absolute end-4 top-full mt-2 max-h-[70svh] w-72 overflow-y-auto rounded-xl border border-line p-3">
                <WorkspaceSync userId={session.user.id} organizationId={organization?.id} />
              </div>
            </details>
            <LanguageMenu />
            <ThemeToggle />
            <UserMenu
              key={`${session.user.id}:${organization?.id ?? ''}`}
              session={session}
              organization={organization}
            />
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="min-h-0 flex-1 px-4 py-6 pb-[calc(var(--app-tab-bar-height)+1.5rem)] md:px-8 md:pt-6 md:pb-8"
        >
          <div className="w-full">{children}</div>
        </main>
        <TabBar items={TAB_BAR_ITEMS} />
        <Suspense fallback={null}>
          <FirstUseGuidance
            key={session.user.id}
            userId={session.user.id}
            pathname={pathname}
            workspaceId={organization?.id ?? null}
          />
        </Suspense>
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
  currentPathname?: string
  onNavigate?: () => void
}

function NavList({ items, label, className, currentPathname, onNavigate }: NavListProps) {
  const { t } = useTranslation()
  return (
    <nav aria-label={label} className={cn('flex flex-col gap-1', className)}>
      {items.map(({ to, label: itemLabel, icon: Icon, exact }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact }}
          onClick={
            onNavigate === undefined
              ? undefined
              : () => {
                  if (to === currentPathname) onNavigate()
                }
          }
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
            onClick={
              onNavigate === undefined
                ? undefined
                : () => {
                    if (isCurrent) onNavigate()
                  }
            }
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
      data-mobile-tools
      className="glass-chrome fixed inset-x-0 bottom-0 z-10 grid h-(--app-tab-bar-height) border-t border-line bg-surface-raised/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      style={{ gridTemplateColumns: `repeat(${String(items.length)}, minmax(0, 1fr))` }}
    >
      {items.map(({ to, label, icon: Icon, exact }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact }}
          className="flex flex-col items-center justify-center gap-1 px-1 text-center text-[0.6875rem] leading-tight font-medium text-ink-muted"
          activeProps={{ className: 'text-brand-700 dark:text-brand-200' }}
        >
          <Icon aria-hidden="true" className="size-5" />
          {t(label)}
        </Link>
      ))}
    </nav>
  )
}

const { Component: MobileMenuSheet, preload: preloadMobileMenu } = deferredComponent(async () => {
  const { MobileMenuSheet: sheet } = await import('./mobile-menu-sheet')
  return sheet
})
const { Component: OrganizationSwitcherMenu, preload: preloadOrganizationSwitcher } =
  deferredComponent(async () => {
    const { OrganizationSwitcherMenu: menu } = await import('./organization-switcher')
    return menu
  })
const { Component: UserMenuDropdown, preload: preloadUserMenu } = deferredComponent(async () => {
  const { UserMenuDropdown: menu } = await import('./user-menu')
  return menu
})

function MobileMenu({
  userId,
  home,
  items,
  adminSection,
  pathname,
  organization,
  organizations,
}: Pick<AppShellProps, 'organization' | 'organizations'> & {
  userId: string
  home: '/app' | '/app/editor'
  items: readonly NavItem[]
  adminSection: AdminSection | null
  pathname: string
}) {
  const { t } = useTranslation()
  const { opening, triggerProps } = useDeferredOverlay(preloadMobileMenu, 'dialog')
  if (opening === null) return <NavigationMenuTrigger {...triggerProps} />
  return (
    <Suspense
      fallback={<NavigationMenuTrigger aria-haspopup="dialog" aria-expanded={false} aria-busy />}
    >
      <MobileMenuSheet>
        {(close) => (
          <>
            <OrganizationSwitcher
              organization={organization}
              organizations={organizations}
              home={home}
            />
            {adminSection === null ? (
              <NavList
                items={items}
                label={t('shell.primaryMenuNav')}
                currentPathname={pathname}
                onNavigate={close}
              />
            ) : (
              <AdminNavList currentSection={adminSection} onNavigate={close} />
            )}
            <div className="mt-auto pt-2">
              <WorkspaceSync
                userId={userId}
                organizationId={organization?.id}
                shouldManageSync={false}
              />
            </div>
          </>
        )}
      </MobileMenuSheet>
    </Suspense>
  )
}

function OrganizationSwitcher({
  organization,
  organizations,
  home,
}: Pick<AppShellProps, 'organization' | 'organizations'> & { home: '/app' | '/app/editor' }) {
  const { isOnline } = useSyncExternalStore(subscribeOfflineStatus, offlineStatus)
  const { opening, triggerProps } = useDeferredOverlay(preloadOrganizationSwitcher, 'menu')
  const organizationName = organization?.name ?? null
  const idle = (props: ComponentProps<'button'>) => (
    <div>
      <WorkspaceTrigger organizationName={organizationName} disabled={!isOnline} {...props} />
      <WorkspaceOfflineNote isOnline={isOnline} />
    </div>
  )
  if (opening === null) return idle(triggerProps)
  return (
    <Suspense
      fallback={idle({ 'aria-haspopup': 'menu', 'aria-expanded': false, 'aria-busy': true })}
    >
      <OrganizationSwitcherMenu
        organization={organization}
        organizations={organizations}
        home={home}
        isKeyboardOpen={opening.isKeyboardOpen}
      />
    </Suspense>
  )
}

function UserMenu({
  session,
  organization,
}: {
  session: SessionData
  organization: ActiveOrganization | null
}) {
  const { opening, triggerProps } = useDeferredOverlay(preloadUserMenu, 'menu')
  const { name, image } = session.user
  if (opening === null) return <AccountTrigger name={name} image={image} {...triggerProps} />
  return (
    <Suspense
      fallback={
        <AccountTrigger
          name={name}
          image={image}
          aria-haspopup="menu"
          aria-expanded={false}
          aria-busy
        />
      }
    >
      <UserMenuDropdown
        session={session}
        organization={organization}
        isKeyboardOpen={opening.isKeyboardOpen}
      />
    </Suspense>
  )
}
