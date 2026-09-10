import type { ComponentProps } from 'react'

import { cn } from '../lib/cn'

export type ProviderLogoId =
  'dropbox' | 'github' | 'google' | 'google-drive' | 'microsoft' | 'onedrive'

const PROVIDER_LOGOS: Record<ProviderLogoId, string> = {
  google: '/providers/google.svg',
  microsoft: '/providers/microsoft.svg',
  'google-drive': '/providers/google-drive.png',
  dropbox: '/providers/dropbox.png',
  github: '/providers/github-dark-on-light.svg',
  // Microsoft owns and operates OneDrive; its official symbol identifies the
  // Microsoft account used by this integration without altering a product mark.
  onedrive: '/providers/microsoft.svg',
}

/** Unaltered provider artwork used only beside a named provider action. */
export function ProviderLogo({
  provider,
  className,
  ...props
}: { provider: ProviderLogoId } & Omit<ComponentProps<'img'>, 'alt' | 'src'>) {
  if (provider === 'github') {
    return (
      <span aria-hidden="true" className={cn('relative size-5 shrink-0', className)}>
        <img
          src="/providers/github-dark-on-light.svg"
          alt=""
          width={20}
          height={20}
          className="size-full object-contain dark:hidden"
        />
        <img
          src="/providers/github-light-on-dark.svg"
          alt=""
          width={20}
          height={20}
          className="hidden size-full object-contain dark:block"
        />
      </span>
    )
  }
  return (
    <img
      src={PROVIDER_LOGOS[provider]}
      alt=""
      aria-hidden="true"
      width={20}
      height={20}
      className={cn('size-5 shrink-0 object-contain', className)}
      {...props}
    />
  )
}
