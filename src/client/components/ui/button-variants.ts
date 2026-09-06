import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 dark:bg-brand-500 dark:hover:bg-brand-400',
        secondary:
          'border-line bg-surface-raised text-ink hover:bg-brand-50 border shadow-sm dark:hover:bg-brand-900/40',
        ghost: 'text-ink hover:bg-brand-50 dark:hover:bg-brand-900/40',
        danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)
