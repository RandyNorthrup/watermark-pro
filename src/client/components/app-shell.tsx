import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import {
  Building2,
  ChevronsUpDown,
  Images,
  Layers,
  LayoutDashboard,
  LogOut,
  PencilRuler,
  Plus,
  ScrollText,
  Share2,
  ShieldCheck,
  Stamp,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'

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
 * Authenticated chrome: sidebar navigation, organization switcher, user
 * menu, theme toggle. Rendered by the `/app` layout route.
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
        <nav aria-label="Primary" className="mt-6 flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon, exact }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-brand-50 hover:text-ink dark:hover:bg-brand-900/40"
              activeProps={{
                className: 'bg-brand-50 text-brand-800 dark:bg-brand-900/50 dark:text-brand-100',
              }}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface-raised/80 px-4 py-3 backdrop-blur md:px-8">
          <div className="md:hidden">
            <BrandMark to="/app" />
          </div>
          <nav aria-label="Primary (compact)" className="flex gap-1 md:hidden">
            {navItems.map(({ to, label, icon: Icon, exact }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact }}
                aria-label={label}
                className="rounded-lg p-2 text-ink-muted"
                activeProps={{
                  className: 'bg-brand-50 text-brand-800 dark:bg-brand-900/50 dark:text-brand-100',
                }}
              >
                <Icon aria-hidden="true" className="size-5" />
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu session={session} />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-8 md:px-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
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
