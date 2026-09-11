import type { ComponentProps } from 'react'

import { cn } from '#/lib/utils'

function Alert({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(
        'relative grid w-full gap-1 rounded-lg border bg-card px-3 py-2 text-sm text-card-foreground',
        className,
      )}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('font-medium', className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
