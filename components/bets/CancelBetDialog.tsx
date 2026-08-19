'use client'

import { useEffect, useId, useRef } from 'react'

import { BroadcastButton, BroadcastPanel } from '@/components/ui/BroadcastNoir'

interface CancelBetDialogProps {
  busy: boolean
  open: boolean
  onClose: () => void
  onConfirm: () => void
}

export default function CancelBetDialog({
  busy,
  open,
  onClose,
  onConfirm,
}: CancelBetDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      closeButtonRef.current?.focus()
      return
    }
    if (!wasOpenRef.current) return
    wasOpenRef.current = false
    requestAnimationFrame(() => returnFocusRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!busy) onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      ) ?? [])
      if (!focusable.length) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const focusIsOutside = !dialogRef.current?.contains(document.activeElement)
      if (event.shiftKey && (document.activeElement === first || focusIsOutside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || focusIsOutside)) {
        event.preventDefault()
        first.focus()
      }
    }

    function containFocus(event: FocusEvent) {
      if (!dialogRef.current?.contains(event.target as Node)) closeButtonRef.current?.focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', containFocus)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', containFocus)
    }
  }, [busy, onClose, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bn-night/90 p-4 sm:items-center"
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md" ref={dialogRef}>
        <BroadcastPanel
          aria-describedby={descriptionId}
          aria-labelledby={titleId}
          aria-modal="true"
          className="w-full overflow-hidden"
          role="dialog"
        >
          <div className="border-b border-bn-border-strong px-5 py-4">
            <h2 className="font-display text-xl font-black tracking-[-0.035em] text-bn-text" id={titleId}>
              Отменить открытую ставку?
            </h2>
          </div>
          <div className="px-5 py-5">
            <p className="text-sm leading-6 text-bn-muted" id={descriptionId}>
              Сумма ставки полностью вернётся в банкролл. Запись получит статус «Возврат» и нулевой P&amp;L,
              а финансовая история сохранится. Действие нельзя отменить.
            </p>
            <div className="mt-6 grid gap-2 min-[420px]:grid-cols-2">
              <button
                className="bn-button bn-button-secondary w-full"
                disabled={busy}
                onClick={onClose}
                ref={closeButtonRef}
                type="button"
              >
                Оставить открытой
              </button>
              <BroadcastButton
                className="w-full"
                disabled={busy}
                onClick={onConfirm}
                tone="destructive"
              >
                {busy ? 'Отменяем…' : 'Подтвердить отмену'}
              </BroadcastButton>
            </div>
          </div>
        </BroadcastPanel>
      </div>
    </div>
  )
}
