/**
 * The app chrome's menu and sheet triggers. The shell renders them on their
 * own until someone reaches for one; the deferred overlay modules then render
 * the same trigger inside the real menu or sheet (`ui/deferred-overlay.ts`).
 */
import { Building2, ChevronsUpDown, type LucideIcon, Menu, X } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from './ui/avatar'
import { Button } from './ui/button'

type TriggerProps = ButtonHTMLAttributes<HTMLButtonElement>

export function AccountTrigger({
  name,
  image,
  ...props
}: TriggerProps & { name: string; image: string | null | undefined }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className="rounded-full focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      aria-label={t('shell.accountMenu', { name })}
      {...props}
    >
      <Avatar name={name} image={image} />
    </button>
  )
}

export function WorkspaceTrigger({
  organizationName,
  ...props
}: TriggerProps & { organizationName: string | null }) {
  const { t } = useTranslation()
  return (
    <Button
      variant="secondary"
      className="w-full justify-between"
      aria-label={
        organizationName === null
          ? t('shell.chooseOrganization')
          : t('shell.switchOrganizationFor', { name: organizationName })
      }
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Building2 aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{organizationName ?? t('shell.chooseOrganizationShort')}</span>
      </span>
      <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 opacity-60" />
    </Button>
  )
}

/** Workspace switching needs the network; the switcher says so beneath its trigger. */
export function WorkspaceOfflineNote({ isOnline }: { isOnline: boolean }) {
  const { t } = useTranslation()
  return isOnline ? null : (
    <p className="mt-2 text-xs text-ink-muted">{t('offline.connectionRequired')}</p>
  )
}

export function NavigationMenuTrigger(props: TriggerProps) {
  const { t } = useTranslation()
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={t('shell.menu')} {...props}>
      <Menu aria-hidden="true" className="size-5" />
    </Button>
  )
}

/** A destination in the floating desktop navigation. */
export interface GooeyDestination {
  id: string
  label: string
  icon: LucideIcon
  isCurrent: boolean
  renderLink: (props: { className: string; children: ReactNode }) => ReactNode
}

/** The half-circle handle; while its panel is open the panel's own close button takes over. */
export function GooeyTrigger({ isOpen, ...props }: TriggerProps & { isOpen: boolean }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className="gooey-trigger"
      aria-hidden={isOpen}
      aria-label={t(isOpen ? 'shell.closeNavigation' : 'shell.openNavigation')}
      {...props}
    >
      {isOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
    </button>
  )
}
