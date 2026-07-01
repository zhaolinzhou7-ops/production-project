import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Download, Upload, KeyRound, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { downloadBackup, exportBackup, importBackup, parseBackupFile } from '../lib/backup'
import { ConfirmDialog } from '../components/common/ConfirmDialog'

export function ParentSettingsPage() {
  const navigate = useNavigate()
  const settings = useLiveQuery(() => db.settings.get('singleton'), [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [pinEditing, setPinEditing] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [pinSaved, setPinSaved] = useState(false)
  const [pendingImportText, setPendingImportText] = useState<string | null>(null)
  const [importError, setImportError] = useState('')

  const handleExport = async () => {
    const payload = await exportBackup()
    downloadBackup(payload)
    await db.settings.update('singleton', { lastBackupAt: Date.now() })
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const text = await file.text()
    try {
      parseBackupFile(text)
      setImportError('')
      setPendingImportText(text)
    } catch {
      setImportError('文件不是有效的备份文件')
    }
  }

  const confirmImport = async () => {
    if (!pendingImportText) return
    const payload = parseBackupFile(pendingImportText)
    await importBackup(payload)
    setPendingImportText(null)
  }

  const savePin = async () => {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) return
    await db.settings.update('singleton', { parentPin: newPin })
    setPinSaved(true)
    setPinEditing(false)
    setNewPin('')
    setTimeout(() => setPinSaved(false), 2000)
  }

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/parent')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">家长设置</h1>
      </div>

      <section className="rounded-2xl bg-white/70 p-4 shadow-sm mb-4">
        <div className="flex items-center gap-2 mb-3 text-gray-700 font-bold">
          <KeyRound size={18} />
          家长 PIN 码
        </div>
        {pinEditing ? (
          <div className="flex gap-2">
            <input
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="输入新的 4 位 PIN"
              inputMode="numeric"
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
            <button
              onClick={savePin}
              className="rounded-xl bg-brand-500 px-4 font-medium text-white active:scale-95 transition"
            >
              保存
            </button>
          </div>
        ) : (
          <button
            onClick={() => setPinEditing(true)}
            className="text-sm text-brand-600 font-medium"
          >
            {pinSaved ? (
              <span className="flex items-center gap-1 text-green-500">
                <Check size={16} /> 已更新
              </span>
            ) : (
              '修改 PIN 码'
            )}
          </button>
        )}
      </section>

      <section className="rounded-2xl bg-white/70 p-4 shadow-sm mb-4">
        <div className="text-gray-700 font-bold mb-1">数据备份</div>
        <p className="text-xs text-gray-400 mb-3">
          {settings?.lastBackupAt
            ? `上次备份：${new Date(settings.lastBackupAt).toLocaleString('zh-CN')}`
            : '还没有备份过，建议现在导出一份'}
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-brand-500 py-2.5 font-medium text-white active:scale-95 transition"
          >
            <Download size={16} />
            导出备份
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gray-100 py-2.5 font-medium text-gray-600 active:scale-95 transition"
          >
            <Upload size={16} />
            导入备份
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleFileSelected}
          />
        </div>
        {importError && <p className="mt-2 text-xs text-red-500">{importError}</p>}
      </section>

      <ConfirmDialog
        open={!!pendingImportText}
        title="导入备份将覆盖现有数据"
        description="当前所有孩子、任务、积分与成长记录都会被备份文件中的数据替换，且无法撤销。建议先导出一份当前数据再继续。"
        confirmLabel="覆盖并导入"
        onConfirm={confirmImport}
        onCancel={() => setPendingImportText(null)}
      />
    </div>
  )
}
