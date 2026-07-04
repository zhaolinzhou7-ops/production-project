import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { buildTimeline } from '../lib/timeline'
import { PhotoLightbox } from '../components/archive/PhotoLightbox'
import { MOOD_OPTIONS } from '../lib/moods'

const KIND_COLOR: Record<string, string> = {
  milestone: 'bg-sun-400/20',
  portfolio: 'bg-brand-100',
  diary: 'bg-mint-400/20',
  levelup: 'bg-brand-100',
  badge: 'bg-sun-400/20',
  exam: 'bg-brand-100',
  anecdote: 'bg-sun-400/20',
  talent: 'bg-mint-400/20',
}

export function TimelinePage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null)

  const items = useLiveQuery(
    () => (currentChildId ? buildTimeline(currentChildId) : Promise.resolve([])),
    [currentChildId],
  )

  if (!items) return null

  const moodEmoji = (mood?: string) => MOOD_OPTIONS.find((m) => m.value === mood)?.emoji

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">成长时间线</h1>
      </div>

      {items.length === 0 ? (
        <div className="mt-8 rounded-3xl bg-white/60 p-8 text-center text-gray-400">
          <div className="text-4xl mb-2">📖</div>
          成长的故事会一点点写在这里
        </div>
      ) : (
        <div className="relative pl-5">
          <div className="absolute left-[9px] top-1 bottom-1 w-0.5 bg-brand-200 rounded-full" />
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="relative">
                <div className="absolute -left-5 top-3 h-2.5 w-2.5 rounded-full bg-brand-400 ring-4 ring-brand-100" />
                <div className="rounded-2xl bg-white/70 p-3.5 shadow-sm ml-1">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`shrink-0 h-9 w-9 rounded-xl flex items-center justify-center text-lg ${
                        KIND_COLOR[item.kind]
                      }`}
                    >
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-gray-800">{item.title}</span>
                        {moodEmoji(item.mood) && <span>{moodEmoji(item.mood)}</span>}
                      </div>
                      <div className="text-[11px] text-gray-400">{item.date}</div>
                      {item.desc && (
                        <p className="mt-1 text-xs text-gray-500 whitespace-pre-wrap">{item.desc}</p>
                      )}
                    </div>
                  </div>
                  {item.photos.length > 0 && (
                    <div className="mt-2 flex gap-2 overflow-x-auto">
                      {item.photos.map((p, i) => (
                        <button key={i} onClick={() => setLightbox({ photos: item.photos, index: i })}>
                          <img src={p} alt="" className="h-16 w-16 rounded-lg object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lightbox && (
        <PhotoLightbox
          photos={lightbox.photos}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
