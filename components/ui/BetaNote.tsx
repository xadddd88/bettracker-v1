export default function BetaNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 border border-[var(--border-strong)] bg-[var(--field-raised)] px-3 py-3 text-xs leading-relaxed text-[var(--text-muted)]">
      <span className="mt-px shrink-0 font-bold text-[var(--text-primary)]" aria-hidden>i</span>
      <span>{children}</span>
    </div>
  )
}
