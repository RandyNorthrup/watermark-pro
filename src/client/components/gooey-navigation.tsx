import { Menu, X, type LucideIcon } from 'lucide-react'
import { Popover } from 'radix-ui'
import { type CSSProperties, type ReactNode, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { GOOEY_NAVIGATION } from '../../shared/constants'

interface GooeyDestination {
  id: string
  label: string
  icon: LucideIcon
  isCurrent: boolean
  renderLink: (props: { className: string; children: ReactNode }) => ReactNode
}

function position(index: number, count: number, direction: 'ltr' | 'rtl'): CSSProperties {
  const angle =
    -GOOEY_NAVIGATION.arcRadians / 2 + (index * GOOEY_NAVIGATION.arcRadians) / (count - 1)
  return {
    '--gooey-x': `${String(Math.cos(angle) * GOOEY_NAVIGATION.radiusPixels * (direction === 'rtl' ? -1 : 1))}px`,
    '--gooey-y': `${String(Math.sin(angle) * GOOEY_NAVIGATION.radiusPixels)}px`,
    '--gooey-duration': `${String(GOOEY_NAVIGATION.initialMilliseconds + index * GOOEY_NAVIGATION.staggerMilliseconds)}ms`,
  } as CSSProperties
}

/** A compact desktop navigation button expands into labelled, keyboard-accessible radial links. */
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
  const filterId = useId().replaceAll(':', '')
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
            <svg aria-hidden="true" className="gooey-filter" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <filter
                  id={filterId}
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                  colorInterpolationFilters="sRGB"
                >
                  <feGaussianBlur
                    in="SourceGraphic"
                    stdDeviation={GOOEY_NAVIGATION.blurPixels}
                    result="blur"
                  />
                  <feColorMatrix
                    in="blur"
                    mode="matrix"
                    values={GOOEY_NAVIGATION.alphaMatrix}
                    result="goo"
                  />
                  <feBlend in="SourceGraphic" in2="goo" />
                </filter>
              </defs>
            </svg>
            <div
              className="gooey-shapes"
              aria-hidden="true"
              style={{ filter: `url(#${filterId})` }}
            >
              <span className="gooey-origin" />
              {items.map((item, index) => (
                <span
                  key={item.id}
                  className="gooey-shape"
                  style={position(index, items.length, direction)}
                />
              ))}
            </div>
            <Popover.Close className="gooey-menu-close" aria-label={t('shell.closeNavigation')}>
              <X aria-hidden="true" />
            </Popover.Close>
            <nav aria-label={label}>
              {items.map(({ id, label: itemLabel, icon: Icon, renderLink, isCurrent }, index) => (
                <div
                  key={id}
                  className="gooey-item"
                  style={position(index, items.length, direction)}
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
