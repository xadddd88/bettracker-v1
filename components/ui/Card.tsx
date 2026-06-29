import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type CardVariant = 'base' | 'highlight'
type CardStatus  = 'win' | 'loss' | 'pending' | 'watch'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  status?:  CardStatus
}

const STATUS_CLASS: Record<CardStatus, string> = {
  win:     'card-status-win',
  loss:    'card-status-loss',
  pending: 'card-status-pending',
  watch:   'card-status-watch',
}

export function Card({ variant = 'base', status, className, children, ...props }: CardProps) {
  const base = status
    ? STATUS_CLASS[status]
    : variant === 'highlight' ? 'card-highlight' : 'card'

  return (
    <div className={cn(base, className)} {...props}>
      {children}
    </div>
  )
}
