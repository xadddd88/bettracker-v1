export default function BetaNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-gray-900/70 border border-gray-800 text-xs text-gray-500 leading-relaxed">
      <span className="shrink-0 text-gray-600 mt-px">ⓘ</span>
      <span>{children}</span>
    </div>
  )
}
