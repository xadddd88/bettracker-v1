import { BroadcastPanel } from '@/components/ui/BroadcastNoir'

interface SectionGuideItem {
  body: string
  title: string
}

interface SectionGuideProps {
  kicker?: string
  items: SectionGuideItem[]
  note?: {
    body: string
    title: string
  }
  title: string
}

export default function SectionGuide({
  kicker = 'Короткий гайд',
  items,
  note,
  title,
}: SectionGuideProps) {
  return (
    <BroadcastPanel className="overflow-hidden p-0">
      <section className="p-5 sm:p-6" aria-labelledby={guideTitleId(title)}>
        <p className="editorial-kicker">{kicker}</p>
        <h2
          id={guideTitleId(title)}
          className="mt-2 font-display text-2xl font-black tracking-[-0.04em] text-bn-text sm:text-3xl"
        >
          {title}
        </h2>

        <ol className="mt-5 grid gap-px overflow-hidden rounded-control border border-bn-border-subtle bg-bn-border-subtle md:grid-cols-3">
          {items.map((item, index) => (
            <li className="bg-bn-field p-4" key={`${item.title}-${index}`}>
              <span className="font-mono text-xs font-black text-bn-signal">
                {String(index + 1).padStart(2, '0')}
              </span>
              <p className="mt-2 text-sm font-black text-bn-text">{item.title}</p>
              <p className="mt-2 text-xs leading-5 text-bn-muted">{item.body}</p>
            </li>
          ))}
        </ol>

        {note ? (
          <div className="mt-5 border-l-2 border-bn-signal pl-4">
            <p className="text-sm font-black text-bn-text">{note.title}</p>
            <p className="mt-1 text-xs leading-5 text-bn-muted">{note.body}</p>
          </div>
        ) : null}
      </section>
    </BroadcastPanel>
  )
}

function guideTitleId(title: string) {
  return `section-guide-${title.toLowerCase().replace(/[^a-zа-я0-9]+/giu, '-')}`
}
