import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          {danger && (
            <div className="shrink-0 rounded-full bg-red-100 p-2 text-red-500">
              <AlertTriangle size={20} />
            </div>
          )}
          <div>
            <h3 className="text-lg font-bold text-gray-800">{title}</h3>
            {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-2xl bg-gray-100 py-3 font-medium text-gray-600 active:scale-95 transition"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-2xl py-3 font-medium text-white active:scale-95 transition ${
              danger ? 'bg-red-500' : 'bg-brand-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
