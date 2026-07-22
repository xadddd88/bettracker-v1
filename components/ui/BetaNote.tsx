export default function BetaNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-control border border-bn-border-strong bg-bn-field px-3 py-3 text-xs leading-relaxed text-bn-muted">
      <span aria-hidden="true" className="mt-px shrink-0 text-bn-review">!</span>
      <span>{children}</span>
    </div>
  )
}
