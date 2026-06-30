interface EmptyStateProps {
  icon: string
  title: string
  body: string
  note?: string
  actions?: React.ReactNode
}

export default function EmptyState({ icon, title, body, note, actions }: EmptyStateProps) {
  return (
    <div className="card text-center py-14">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="font-medium text-white mb-1">{title}</p>
      <p className="text-gray-400 text-sm">{body}</p>
      {note && <p className="text-gray-600 text-xs mt-2">{note}</p>}
      {actions && <div className="flex gap-3 justify-center mt-5">{actions}</div>}
    </div>
  )
}
