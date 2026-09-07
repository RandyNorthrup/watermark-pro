import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import {
  Building2,
  ChevronsUpDown,
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
} from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { BrandMark } from './brand-mark'
import { ThemeToggle } from './theme-toggle'
import { isPlatformAdmin } from '../lib/admin'
import { type ActiveOrganization, authClient, type SessionData } from '../lib/auth-client'
import { cn } from '../lib/cn'
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

const NAV_ITEMS = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/app/library', label: 'Library', icon: Stamp, exact: false },
  { to: '/app/editor', label: 'Editor', icon: PencilRuler, exact: false },
  { to: '/app/bulk', label: 'Bulk', icon: Layers, exact: false },
  { to: '/app/gallery', label: 'Gallery', icon: Images, exact: false },
  { to: '/app/shares', label: 'Shares', icon: Share2, exact: false },
  { to: '/app/members', label: 'Members', icon: Users, exact: false },
  { to: '/app/audit', label: 'Audit log', icon: ScrollText, exact: false },
] as const

const ADMIN_NAV_ITEM = {
  to: '/app/admin',
  label: 'Admin',
  icon: ShieldCheck,
  exact: false,
} as const

type NavItem = (typeof NAV_ITEMS)[number] | typeof ADMIN_NAV_ITEM

/**
 * The tools a phone user reaches for most sit in the bottom tab bar; the
 * rest, with the organization switcher, are behind the "More" sheet.
 */
const TAB_BAR_ITEMS: readonly NavItem[] = NAV_ITEMS.filter((item) =>
  ['/app/library', '/app/editor', '/app/bulk', '/app/gallery'].includes(item.to),
)

/** Platform administrators get one more entry; everyone else never sees it. */
function navItemsFor(session: SessionData): readonly NavItem[] {
  return isPlatformAdmin(session.user) ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS
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
  const navItems = navItemsFor(session)
  return (
    <div className="flex min-h-svh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-brand-600 px-3 py-2 text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface-raised p-4 md:flex">
        <BrandMark to="/app" className="px-2 py-1" />
        <div className="mt-6">
          <OrganizationSwitcher organization={organization} organizations={organizations} />
        </div>
        <NavList items={navItems} label="Primary" className="mt-6" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface-raised/80 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur md:px-8 md:pt-3">
          <div className="flex min-w-0 items-center gap-1 md:hidden">
            <MobileMenu
              items={navItems}
              organization={organization}
              organizations={organizations}
            />
            <BrandMark to="/app" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu session={session} />
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 px-4 py-6 pb-[calc(var(--app-tab-bar-height)+1.5rem)] md:px-8 md:py-8 md:pb-8"
        >
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
        <TabBar items={TAB_BAR_ITEMS} />
      </div>
    </div>
  )
}

interface NavListProps {
  items: readonly NavItem[]
  label: string
  className?: string
  onNavigate?: () => void
}

function NavList({ items, label, className, onNavigate }: NavListProps) {
  return (
    <nav aria-label={label} className={cn('flex flex-col gap-1', className)}>
      {items.map(({ to, label: itemLabel, icon: Icon, exact }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact }}
          onClick={onNavigate}
          className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-brand-50 hover:text-ink dark:hover:bg-brand-900/40"
          activeProps={{
            className: 'bg-brand-50 text-brand-800 dark:bg-brand-900/50 dark:text-brand-100',
          }}
        >
          <Icon aria-hidden="true" className="size-4" />
          {itemLabel}
        </Link>
      ))}
    </nav>
  )
}

/** Phone-only bottom tab bar; sits above the home indicator. */
function TabBar({ items }: { items: readonly NavItem[] }) {
  return (
    <nav
      aria-label="Tools"
      className="fixed inset-x-0 bottom-0 z-10 grid h-(--app-tab-bar-height) border-t border-line bg-surface-raised/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
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
          {label}
        </Link>
      ))}
    </nav>
  )
}

function MobileMenu({
  items,
  organization,
  organizations,
}: Pick<AppShellProps, 'organization' | 'organizations'> & { items: readonly NavItem[] }) {
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
        <Button type="button" variant="ghost" size="icon" aria-label="Menu">
          <Menu aria-hidden="true" className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        title="Menu"
        description="Switch organization or go to any part of Watermark Pro."
        isDescriptionHidden
      >
        <OrganizationSwitcher organization={organization} organizations={organizations} />
        <NavList
          items={items}
          label="Primary (menu)"
          onNavigate={() => {
            setOpenPathname(null)
          }}
        />
      </SheetContent>
    </Sheet>
  )
}

function OrganizationSwitcher({
  organization,
  organizations,
}: Pick<AppShellProps, 'organization' | 'organizations'>) {
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()

  async function switchTo(organizationId: string) {
    await authClient.organization.setActive({ organizationId })
    await queryClient.invalidateQueries()
    await router.invalidate()
    await navigate({ to: '/app' })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          className="w-full justify-between"
          aria-label={
            organization === null
              ? 'Choose an organization'
              : `Organization: ${organization.name}. Switch organization`
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            <Building2 aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{organization?.name ?? 'Choose organization'}</span>
          </span>
          <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
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
          New organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu({ session }: { session: SessionData }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function signOut() {
    await authClient.signOut()
    queryClient.clear()
    await navigate({ to: '/login' })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          aria-label={`Account menu for ${session.user.name}`}
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
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden="true" className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
