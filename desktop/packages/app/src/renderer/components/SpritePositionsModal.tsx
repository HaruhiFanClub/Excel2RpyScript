import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import type { SpritePositions } from '../../shared/ipc'
import { Modal } from './Modal'

type Slot = 'left' | 'mid' | 'right'

export function SpritePositionsModal(props: {
  open: boolean
  onClose: () => void
  chars: string[]
  transforms: string[]
  value: SpritePositions
  onChange: (v: SpritePositions) => void
}) {
  const [draft, setDraft] = useState<SpritePositions>({})
  useEffect(() => {
    if (props.open) setDraft(props.value)
  }, [props.open, props.value])

  const set = (char: string, slot: Slot, v: string) =>
    setDraft((d) => ({ ...d, [char]: { ...d[char], [slot]: v || undefined } }))

  const save = () => {
    const cleaned: SpritePositions = {}
    for (const [c, p] of Object.entries(draft)) {
      const e: { left?: string; mid?: string; right?: string } = {}
      if (p.left) e.left = p.left
      if (p.mid) e.mid = p.mid
      if (p.right) e.right = p.right
      if (Object.keys(e).length) cleaned[c] = e
    }
    props.onChange(cleaned)
    props.onClose()
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="立绘位置（每角色 左 / 中 / 右）"
      width={680}
      footer={
        <div className="flex justify-end">
          <button
            onClick={save}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-4 text-[12px] font-medium text-white hover:bg-sky-600"
          >
            <Save size={14} /> 保存
          </button>
        </div>
      }
    >
      <p className="mb-3 text-[12px] text-app-muted">
        留空即用约定 <code>&lt;角色&gt;_left / _mid / _right</code>。关联 Ren&apos;Py 工程后，输入框可从已定义的
        transform 中选择（共 {props.transforms.length} 个）。
      </p>
      <datalist id="e2r-transforms">
        {props.transforms.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {props.chars.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-app-muted">当前表未发现立绘角色</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead className="text-app-muted">
            <tr className="border-b border-app-border text-left">
              <th className="py-2 pr-2">角色</th>
              <th className="px-1 py-2">左</th>
              <th className="px-1 py-2">中</th>
              <th className="px-1 py-2">右</th>
            </tr>
          </thead>
          <tbody>
            {props.chars.map((c) => (
              <tr key={c} className="border-b border-app-border/60">
                <td className="py-1.5 pr-2 font-medium">{c}</td>
                {(['left', 'mid', 'right'] as Slot[]).map((slot) => (
                  <td key={slot} className="px-1 py-1.5">
                    <input
                      list="e2r-transforms"
                      className="glass-input w-full font-mono text-[11px]"
                      placeholder={`${c}_${slot}`}
                      value={draft[c]?.[slot] ?? ''}
                      onChange={(e) => set(c, slot, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
