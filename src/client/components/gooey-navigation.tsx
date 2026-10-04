import { Menu, X, type LucideIcon } from 'lucide-react'
import { Popover } from 'radix-ui'
import { type CSSProperties, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { GOOEY_NAVIGATION } from '../../shared/constants'

interface GooeyDestination {
  id: string
  label: string
  icon: LucideIcon
  isCurrent: boolean
  renderLink: (props: { className: string; children: ReactNode }) => ReactNode
}

function animation(index: number, count: number, direction: 'ltr' | 'rtl'): CSSProperties {
  const angle =
    count <= 1
      ? 0
      : -GOOEY_NAVIGATION.arcRadians / 2 + (index * GOOEY_NAVIGATION.arcRadians) / (count - 1)
  return {
    '--gooey-x': `${String(Math.cos(angle) * GOOEY_NAVIGATION.radiusPixels * (direction === 'rtl' ? -1 : 1))}px`,
    '--gooey-duration': `${String(GOOEY_NAVIGATION.initialMilliseconds + index * GOOEY_NAVIGATION.staggerMilliseconds)}ms`,
  } as CSSProperties
}

/** The half-circle handle opens separate labelled pills in a rounded arc. */
export function GooeyNavigation({
  items,
  label,
}: {
  items: readonly GooeyDestination[]
  label: string
}) {
  const { t, i18n } = useTranslation()
  const direction = i18n.dir()
  const [isOpen, setIsOpen] = useState(false)
  return (
    <aside className="gooey-navigation hidden md:block" data-workspace-navigation>
      <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger
          className="gooey-trigger"
          aria-hidden={isOpen}
          aria-label={t(isOpen ? 'shell.closeNavigation' : 'shell.openNavigation')}
        >
          {isOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="gooey-panel"
            dir={direction}
            side={direction === 'rtl' ? 'left' : 'right'}
            align="center"
            sideOffset={GOOEY_NAVIGATION.sideOffsetPixels}
            collisionPadding={GOOEY_NAVIGATION.collisionPaddingPixels}
            aria-label={t('shell.menu')}
          >
            <Popover.Close className="gooey-menu-close" aria-label={t('shell.closeNavigation')}>
              <X aria-hidden="true" />
            </Popover.Close>
            <nav aria-label={label}>
              {items.map(({ id, label: itemLabel, icon: Icon, renderLink, isCurrent }, index) => (
                <div
                  key={id}
                  className="gooey-item"
                  style={animation(index, items.length, direction)}
                  onClick={() => {
                    if (isCurrent) setIsOpen(false)
                  }}
                >
                  {renderLink({
                    className: 'gooey-link',
                    children: (
                      <>
                        <span className="gooey-icon">
                          <Icon aria-hidden="true" />
                        </span>
                        <span className="gooey-label" dir="auto">
                          {itemLabel}
                        </span>
                      </>
                    ),
                  })}
                </div>
              ))}
            </nav>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </aside>
  )
}
