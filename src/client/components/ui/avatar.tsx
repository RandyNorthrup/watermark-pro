import { Avatar as RadixAvatar } from 'radix-ui'

import { cn } from '../../lib/cn'
import { initialsOf } from '../../lib/initials'

interface AvatarProps {
  name: string
  image?: string | null | undefined
  className?: string
}

export function Avatar({ name, image, className }: AvatarProps) {
  return (
    <RadixAvatar.Root
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-xs font-semibold text-brand-800 dark:bg-brand-900/60 dark:text-brand-100',
        className,
      )}
    >
      {image === null || image === undefined ? null : (
        <RadixAvatar.Image src={image} alt="" className="size-full object-cover" />
      )}
      <RadixAvatar.Fallback delayMs={0} aria-hidden="true">
        {initialsOf(name)}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  )
}
