import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

interface PhotoLightboxProps {
  photos: string[]
  startIndex: number
  onClose: () => void
}

export function PhotoLightbox({ photos, startIndex, onClose }: PhotoLightboxProps) {
  const [index, setIndex] = useState(startIndex)

  const prev = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIndex((i) => (i - 1 + photos.length) % photos.length)
  }
  const next = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIndex((i) => (i + 1) % photos.length)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button className="absolute top-4 right-4 text-white/80 p-2" onClick={onClose}>
        <X size={26} />
      </button>
      <img
        src={photos[index]}
        alt=""
        className="max-h-[85vh] max-w-[92vw] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
      {photos.length > 1 && (
        <>
          <button className="absolute left-2 text-white/80 p-3" onClick={prev}>
            <ChevronLeft size={30} />
          </button>
          <button className="absolute right-2 text-white/80 p-3" onClick={next}>
            <ChevronRight size={30} />
          </button>
          <div className="absolute bottom-6 text-white/70 text-sm">
            {index + 1} / {photos.length}
          </div>
        </>
      )}
    </div>
  )
}
