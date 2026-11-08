import { X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { type CSSProperties, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type GooeyDestination, GooeyTrigger } from './shell-triggers'
import { GOOEY_NAVIGATION } from '../../shared/constants'

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

/**
 * The navigation arc, loaded by `GooeyNavigation` the first time someone
 * reaches for its handle and mounted already open.
 */
export function GooeyPanel({
  items,
  label,
}: {
  items: readonly GooeyDestination[]
  label: string
}) {
  const { t, i18n } = useTranslation()
  const direction = i18n.dir()
  const [isOpen, setIsOpen] = useState(true)
  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <GooeyTrigger isOpen={isOpen} />
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
  )
}
