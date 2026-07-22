import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  PropsWithChildren,
} from 'react'

import type { BroadcastNoirStatus } from '@/lib/ui/broadcast-noir'

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function BroadcastPanel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('bn-panel', className)} {...props} />
}

type BroadcastButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'secondary' | 'destructive'
}

export function BroadcastButton({
  className,
  tone = 'primary',
  type = 'button',
  ...props
}: BroadcastButtonProps) {
  return (
    <button
      className={classes('bn-button', `bn-button-${tone}`, className)}
      type={type}
      {...props}
    />
  )
}

const statusSymbol: Record<BroadcastNoirStatus, string> = {
  success: '✓',
  review: '!',
  negative: '×',
  neutral: '•',
}

export function BroadcastStatus({
  'aria-label': ariaLabel,
  children,
  className,
  status,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLSpanElement> & { status: BroadcastNoirStatus }>) {
  return (
    <span
      className={classes('bn-status', `bn-status-${status}`, className)}
      data-status={status}
      aria-label={ariaLabel ?? (typeof children === 'string' ? `${status}: ${children}` : status)}
      {...props}
    >
      <span aria-hidden="true" className="bn-status-icon">{statusSymbol[status]}</span>
      <span>{children}</span>
    </span>
  )
}

export function BroadcastDataValue({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={classes('bn-data-value', className)} {...props} />
}
